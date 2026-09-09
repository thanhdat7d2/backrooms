import * as THREE from 'three';
import { state, CONFIG, DOM } from '../state.js';
import { MazeGenerator } from './maze.js';
import { updateDynamicLights } from './lights.js';
import { updateHealthHUD } from '../systems/physics.js';
import { createEPromptSprite, updateDoorCollider } from './door.js';
import { furnishRooms } from './furniture.js';

// --- GEOMETRY UV ADJUSTMENT FOR WALLS/PILLARS ---
export function adjustBoxUVs(geometry, sizeX, sizeY, sizeZ, isHoriz, uOffset = 0, yOffset = 0) {
  const uvAttr = geometry.attributes.uv;
  if (!uvAttr) return;
  const uvs = uvAttr.array;

  for (let face = 0; face < 6; face++) {
    const offset = face * 8;
    let scaleU = 1, scaleV = 1;
    let addU = 0, addV = 0;

    if (face === 0 || face === 1) { // +X, -X (Z-Y plane)
      scaleU = sizeZ;
      scaleV = sizeY;
      if (!isHoriz) {
        addU = uOffset;
        addV = yOffset;
      }
    } else if (face === 2 || face === 3) { // +Y, -Y (X-Z plane)
      scaleU = sizeX;
      scaleV = sizeZ;
      if (isHoriz) {
        addU = uOffset;
      } else {
        addV = uOffset;
      }
    } else if (face === 4 || face === 5) { // +Z, -Z (X-Y plane)
      scaleU = sizeX;
      scaleV = sizeY;
      if (isHoriz) {
        addU = uOffset;
        addV = yOffset;
      }
    }

    for (let v = 0; v < 4; v++) {
      uvs[offset + v * 2] = uvs[offset + v * 2] * scaleU + addU;
      uvs[offset + v * 2 + 1] = uvs[offset + v * 2 + 1] * scaleV + addV;
    }
  }

  uvAttr.needsUpdate = true;
}

// Helper to create sub-box bounding boxes for 3D physics collisions
export function createSubBoxCollider(wall, isHoriz, uCenter, uLen, yMin, yMax, thickness) {
  const halfLen = uLen / 2;
  const halfThick = thickness / 2;

  const centerX = isHoriz ? wall.x + uCenter : wall.x;
  const centerZ = isHoriz ? wall.z : wall.z + uCenter;

  return {
    xMin: isHoriz ? centerX - halfLen : centerX - halfThick,
    xMax: isHoriz ? centerX + halfLen : centerX + halfThick,
    yMin: yMin,
    yMax: yMax,
    zMin: isHoriz ? centerZ - halfThick : centerZ - halfLen,
    zMax: isHoriz ? centerZ + halfThick : centerZ + halfLen
  };
}

export function buildMaze(level) {
  // Stop all active Three.js sounds before clearing scene
  if (state.scene) {
    state.scene.traverse(obj => {
      if (obj.isAudio) {
        if (obj.isPlaying) {
          obj.stop();
        }
        if (obj.parent) {
          obj.parent.remove(obj);
        }
      }
    });
  }
  state.activeSpookySound = null;

  // Clear previous level meshes & lights and dispose of WebGL resources to prevent memory leaks
  if (state.scene) {
    const toRemove = [];
    state.scene.traverse(obj => {
      if (obj === state.cameraContainer || obj === state.camera || (state.controls && obj === state.controls.object)) {
        return;
      }

      if (!obj.userData.isSharedModelAsset) {
        if (obj.geometry) {
          obj.geometry.dispose();
        }

        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(mat => {
            if (mat !== state.wallMaterialGlobal) {
              if (mat.map && mat.map !== state.wallTexture && mat.map !== state.doorTexture && mat.map !== state.doorSidesTexture) {
                mat.map.dispose();
              }
              if (mat.normalMap) mat.normalMap.dispose();
              if (mat.roughnessMap) mat.roughnessMap.dispose();
              mat.dispose();
            }
          });
        }
      }

      if (obj.parent === state.scene) {
        toRemove.push(obj);
      }
    });

    toRemove.forEach(obj => {
      state.scene.remove(obj);
    });
  }

  // Dispose of old wall and pillar materials to release GPU memory
  state.wallMaterials.forEach(mat => {
    if (mat.map) mat.map.dispose();
    mat.dispose();
  });
  state.wallMaterials = [];

  // Add camera container & basic lights back
  state.scene.add(state.cameraContainer);

  const ambientLight = new THREE.AmbientLight(0x6b6352, 0.70);
  state.scene.add(ambientLight);

  // Reset states
  state.gridColliders = {};
  state.lightObjects = [];
  state.activeLights = [];
  state.isFallingIntoExit = false;
  state.playerVelocityY = 0;
  state.isOnGround = true;
  state.playerHealth = 100;
  updateHealthHUD();
  if (state.activeChaseMonster && state.activeChaseMonster.audio) {
    if (state.activeChaseMonster.audio.isPlaying) {
      state.activeChaseMonster.audio.stop();
    }
  }
  state.activeWallPictures = [];
  state.doors = [];
  state.activeChaseMonster = null;
  state.nextChaseSpawnTime = Date.now() + 25000 + Math.random() * 50000;

  // Reset navigation line
  if (state.navLineMesh) {
    state.scene.remove(state.navLineMesh);
    state.navLineMesh.geometry.dispose();
    state.navLineMesh = null;
  }
  state.showNavLine = false;

  // Generate Maze Layout
  state.mazeData = MazeGenerator.generate(level, CONFIG.EYE_HEIGHT);
  if (DOM.levelValueHUD) {
    DOM.levelValueHUD.textContent = level;
  }

  // Position Player at starting entrance cell (0,0)
  state.playerPosition.set(state.mazeData.start.x, CONFIG.EYE_HEIGHT, state.mazeData.start.z);
  state.controls.object.position.copy(state.playerPosition);
  state.controls.object.lookAt(0, CONFIG.EYE_HEIGHT, 0);
  state.controls.object.rotation.y += Math.PI; // Invert looking direction to account for nested camera -Z alignment, facing inside the maze

  const cellSize = state.mazeData.cellSize;

  // 1. Materials setup (Cloned to match correct repeat patterns dynamically)
  const floorTexCloned = state.floorTexture.clone();
  floorTexCloned.repeat.set(cellSize / 2.4, cellSize / 2.4); // 240x240cm tiles (twice as big in both dimensions)
  floorTexCloned.needsUpdate = true;
  state.floorMaterial = new THREE.MeshStandardMaterial({
    map: floorTexCloned,
    roughness: 0.6
  });

  const ceilingTexCloned = state.ceilingTexture.clone();
  ceilingTexCloned.repeat.set(cellSize / 0.5, cellSize / 0.5); // 50x50cm tiles
  ceilingTexCloned.needsUpdate = true;
  state.ceilingMaterial = new THREE.MeshStandardMaterial({
    map: ceilingTexCloned,
    roughness: 0.8
  });

  // 1. Build Single Massive Floor and Ceiling
  const mazeSize = state.mazeData.sideLength;

  // Single Ceiling
  const ceilGeo = new THREE.PlaneGeometry(mazeSize, mazeSize);
  const ceilMat = state.ceilingMaterial.clone();
  ceilMat.map = state.ceilingTexture.clone();
  ceilMat.map.repeat.set(mazeSize / 1.0, mazeSize / 1.0);
  ceilMat.map.wrapS = THREE.RepeatWrapping;
  ceilMat.map.wrapT = THREE.RepeatWrapping;
  const mainCeiling = new THREE.Mesh(ceilGeo, ceilMat);
  mainCeiling.position.set(0, CONFIG.WALL_HEIGHT * 3, 0);
  mainCeiling.rotation.x = Math.PI / 2;
  mainCeiling.receiveShadow = true;
  state.scene.add(mainCeiling);

  // Single Floor with a hole for the exit pit
  const floorShape = new THREE.Shape();
  floorShape.moveTo(-mazeSize / 2, -mazeSize / 2);
  floorShape.lineTo(mazeSize / 2, -mazeSize / 2);
  floorShape.lineTo(mazeSize / 2, mazeSize / 2);
  floorShape.lineTo(-mazeSize / 2, mazeSize / 2);
  floorShape.lineTo(-mazeSize / 2, -mazeSize / 2);

  // Cut exit hole using the actual non-uniform exit cell dimensions
  const cX = state.mazeData.exit.x;
  const cZ = state.mazeData.exit.z;
  const hsX = state.mazeData.exit.halfW;
  const hsZ = state.mazeData.exit.halfH;

  const cZ_shape = -cZ;
  const exitHole = new THREE.Path();
  exitHole.moveTo(cX - hsX, cZ_shape - hsZ);
  exitHole.lineTo(cX + hsX, cZ_shape - hsZ);
  exitHole.lineTo(cX + hsX, cZ_shape + hsZ);
  exitHole.lineTo(cX - hsX, cZ_shape + hsZ);
  exitHole.lineTo(cX - hsX, cZ_shape - hsZ);
  floorShape.holes.push(exitHole);

  const floorGeo = new THREE.ShapeGeometry(floorShape);

  const mainFloor = new THREE.Mesh(floorGeo, state.floorMaterial);
  mainFloor.rotation.x = -Math.PI / 2;
  mainFloor.position.set(0, 0, 0);
  mainFloor.receiveShadow = true;
  state.scene.add(mainFloor);

  // Build the glowing white pit recessed in the floor
  const exitPitW = hsX * 2;
  const exitPitH = hsZ * 2;
  const exitHoleGeometry = new THREE.BoxGeometry(exitPitW, 4.0, exitPitH);
  const exitPit = new THREE.Mesh(
    exitHoleGeometry,
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide })
  );
  exitPit.position.set(cX, -2.0, cZ);
  state.scene.add(exitPit);

  // Glowing white teleport pad at the bottom
  const padGeometry = new THREE.PlaneGeometry(exitPitW * 0.8, exitPitH * 0.8);
  const padMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const exitPad = new THREE.Mesh(padGeometry, padMaterial);
  exitPad.rotation.x = -Math.PI / 2;
  exitPad.position.set(cX, -3.9, cZ);
  state.scene.add(exitPad);

  // Eerie bright white point light in pit
  const pitLight = new THREE.PointLight(0xffffff, 8.0, 15.0, 1.0);
  pitLight.position.set(cX, -1.0, cZ);
  state.scene.add(pitLight);

  // Light Fixtures — use pre-computed world positions from mazeData.lights
  const lightFixtureGeometry = new THREE.PlaneGeometry(0.5, 0.5);
  const lightSourceMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(15.0, 15.0, 15.0) });

  state.mazeData.lights.forEach(light => {
    const worldX = light.x;
    const worldZ = light.z;
    const lightFixture = new THREE.Mesh(lightFixtureGeometry, lightSourceMaterial);
    lightFixture.position.set(worldX, CONFIG.WALL_HEIGHT * 3 - 0.005, worldZ);
    lightFixture.rotation.x = Math.PI / 2;
    state.scene.add(lightFixture);

    // Instantiate shadow-casting main light centered on the tile
    const pLight = new THREE.PointLight(0xffffff, 8.0, 22.0, 1.2);
    pLight.position.set(worldX, CONFIG.WALL_HEIGHT * 3 - 0.35, worldZ);
    pLight.castShadow = true;
    pLight.shadow.camera.near = 0.05;
    pLight.shadow.camera.far = 25.0;
    pLight.shadow.bias = 0.0002;
    pLight.shadow.normalBias = 0.08;
    pLight.shadow.radius = 1.5;
    pLight.shadow.mapSize.width = 512;
    pLight.shadow.mapSize.height = 512;
    pLight.shadow.autoUpdate = false;
    pLight.shadow.needsUpdate = true;

    // Non-shadow-casting bounce light to simulate indirect global illumination.
    const bounceRange = 22.0;
    const pLightBounce = new THREE.PointLight(0xffecc4, 4.0, bounceRange, 1.0);
    pLightBounce.position.set(worldX, CONFIG.WALL_HEIGHT * 3 - 0.35, worldZ);
    pLightBounce.castShadow = false;

    state.lightObjects.push({
      light: pLight,
      bounceLight: pLightBounce,
      x: worldX,
      z: worldZ,
      isLightAdded: false,
      isBounceAdded: false
    });
  });

  const addColliderBox = (gi, gj, box) => {
    const key = `${gi},${gj}`;
    if (!state.gridColliders[key]) state.gridColliders[key] = [];
    state.gridColliders[key].push({ type: 'wall', box: box });
  };

  const addColliderForCells = (wall, boundingBox) => {
    if (wall.gridI !== undefined && wall.gridJ !== undefined) {
      const count = wall.count || 1;
      for (let k = 0; k < count; k++) {
        if (wall.type === 'horizontal' || wall.type === 'boundary-horizontal') {
          addColliderBox(wall.gridI + k, wall.gridJ, boundingBox);
          if (wall.type === 'horizontal') {
            addColliderBox(wall.gridI + k, wall.gridJ + 1, boundingBox);
          }
        } else if (wall.type === 'vertical' || wall.type === 'boundary-vertical') {
          addColliderBox(wall.gridI, wall.gridJ + k, boundingBox);
          if (wall.type === 'vertical') {
            addColliderBox(wall.gridI + 1, wall.gridJ + k, boundingBox);
          }
        }
      }
    }
  };



  // 3. Build Walls
  state.mazeData.walls.forEach(wall => {
    const isHoriz = wall.type === 'horizontal' || wall.type === 'boundary-horizontal';
    const isBoundary = wall.type.startsWith('boundary-');
    const thickness = isHoriz ? 0.400 : 0.402;
    const length = wall.length;
    const wallLength = length + (isHoriz ? 0.400 : 0.398);

    // Varying height from reached the ceiling (CONFIG.WALL_HEIGHT * 3) to just above player's head (2.0m)
    const minHeight = CONFIG.EYE_HEIGHT + 0.4;
    const maxHeight = CONFIG.WALL_HEIGHT * 3;
    let wallHeight = isBoundary ? maxHeight : (minHeight + Math.random() * (maxHeight - minHeight));
    
    if (wall.hole) {
      wallHeight = Math.max(wallHeight, wall.hole.yTop + 0.3);
    }

    if (wall.hole) {
      const hole = wall.hole;
      const L_mesh = wallLength;
      const T_mesh = thickness;
      const H_mesh = wallHeight;

      const u1 = hole.offset - hole.width / 2;
      const u2 = hole.offset + hole.width / 2;

      // Left piece
      const L_left = u1 - (-L_mesh / 2);
      if (L_left > 0.01) {
        const uCenter = -L_mesh / 2 + L_left / 2;
        const sizeX = isHoriz ? L_left : T_mesh;
        const sizeY = H_mesh;
        const sizeZ = isHoriz ? T_mesh : L_left;

        const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
        adjustBoxUVs(geom, sizeX, sizeY, sizeZ, isHoriz, 0, 0);

        const mesh = new THREE.Mesh(geom, state.wallMaterialGlobal);
        const px = isHoriz ? wall.x + uCenter : wall.x;
        const pz = isHoriz ? wall.z : wall.z + uCenter;
        mesh.position.set(px, H_mesh / 2, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        state.scene.add(mesh);

        const colBox = createSubBoxCollider(wall, isHoriz, uCenter, L_left, 0, H_mesh, T_mesh);
        addColliderForCells(wall, colBox);
      }

      // Right piece
      const L_right = L_mesh / 2 - u2;
      if (L_right > 0.01) {
        const uCenter = L_mesh / 2 - L_right / 2;
        const sizeX = isHoriz ? L_right : T_mesh;
        const sizeY = H_mesh;
        const sizeZ = isHoriz ? T_mesh : L_right;

        const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
        adjustBoxUVs(geom, sizeX, sizeY, sizeZ, isHoriz, L_left + hole.width, 0);

        const mesh = new THREE.Mesh(geom, state.wallMaterialGlobal);
        const px = isHoriz ? wall.x + uCenter : wall.x;
        const pz = isHoriz ? wall.z : wall.z + uCenter;
        mesh.position.set(px, H_mesh / 2, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        state.scene.add(mesh);

        const colBox = createSubBoxCollider(wall, isHoriz, uCenter, L_right, 0, H_mesh, T_mesh);
        addColliderForCells(wall, colBox);
      }

      // Middle pieces
      const W = hole.width;
      const uCenterMid = u1 + W / 2;

      // Bottom piece
      if (hole.yBottom > 0.01) {
        const sizeX = isHoriz ? W : T_mesh;
        const sizeY = hole.yBottom;
        const sizeZ = isHoriz ? T_mesh : W;

        const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
        adjustBoxUVs(geom, sizeX, sizeY, sizeZ, isHoriz, L_left, 0);

        const mesh = new THREE.Mesh(geom, state.wallMaterialGlobal);
        const px = isHoriz ? wall.x + uCenterMid : wall.x;
        const pz = isHoriz ? wall.z : wall.z + uCenterMid;
        mesh.position.set(px, sizeY / 2, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        state.scene.add(mesh);

        const colBox = createSubBoxCollider(wall, isHoriz, uCenterMid, W, 0, hole.yBottom, T_mesh);
        addColliderForCells(wall, colBox);
      }

      // Top piece
      const topHeight = H_mesh - hole.yTop;
      if (topHeight > 0.01) {
        const sizeX = isHoriz ? W : T_mesh;
        const sizeY = topHeight;
        const sizeZ = isHoriz ? T_mesh : W;

        const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
        adjustBoxUVs(geom, sizeX, sizeY, sizeZ, isHoriz, L_left, hole.yTop);

        const mesh = new THREE.Mesh(geom, state.wallMaterialGlobal);
        const px = isHoriz ? wall.x + uCenterMid : wall.x;
        const pz = isHoriz ? wall.z : wall.z + uCenterMid;
        mesh.position.set(px, hole.yTop + sizeY / 2, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        state.scene.add(mesh);

        const colBox = createSubBoxCollider(wall, isHoriz, uCenterMid, W, hole.yTop, H_mesh, T_mesh);
        addColliderForCells(wall, colBox);
      }

      // Check if this hole should have a door
      const hasDoor = hole.isDoor;
      if (hasDoor) {
        const isWeird = hole.isWeird;
        const w_door = 1.116; // 1.2x scaled
        const h_door = 2.10;  // 1.2x scaled
        const t_door = 0.08;

        const hingeDir = hole.hingeDir || 'left';
        const rotated = hole.rotated || false;

        const w_curr = rotated ? h_door : w_door;
        const h_curr = rotated ? w_door : h_door;

        const uCenterMid = u1 + hole.width / 2;
        const px = isHoriz ? wall.x + uCenterMid : wall.x;
        const pz = isHoriz ? wall.z : wall.z + uCenterMid;

        const doorGroup = new THREE.Group();
        let baseAngle = isHoriz ? 0 : Math.PI / 2;

        const py_center = hole.yBottom + h_curr / 2;
        doorGroup.position.set(px, py_center, pz);
        doorGroup.rotation.y = baseAngle;
        state.scene.add(doorGroup);

        const hingeGroup = new THREE.Group();
        doorGroup.add(hingeGroup);

        // Position hingeGroup at the active hinge edge relative to the center of the hole
        if (hingeDir === 'left') {
          hingeGroup.position.set(-w_door / 2, 0, 0);
        } else if (hingeDir === 'right') {
          hingeGroup.position.set(w_door / 2, 0, 0);
        } else if (hingeDir === 'top') {
          hingeGroup.position.set(0, w_door / 2, 0);
        } else if (hingeDir === 'bottom') {
          hingeGroup.position.set(0, -w_door / 2, 0);
        }

        // Geometry is ALWAYS standard vertical door dimensions (no stretching)
        const doorGeom = new THREE.BoxGeometry(w_door, h_door, t_door);

        const doorTexFront = state.doorTexture;
        const doorTexBack = state.doorTexture.clone();
        doorTexBack.wrapS = THREE.RepeatWrapping;
        doorTexBack.repeat.x = -1;
        doorTexBack.offset.x = 1;
        doorTexBack.needsUpdate = true;

        const doorSidesMat = new THREE.MeshStandardMaterial({ map: state.doorSidesTexture, roughness: 0.7 });
        const doorFrontMat = new THREE.MeshStandardMaterial({ map: doorTexFront, roughness: 0.5 });
        const doorBackMat = new THREE.MeshStandardMaterial({ map: doorTexBack, roughness: 0.5 });

        const materials = [
          doorSidesMat, // +X
          doorSidesMat, // -X
          doorSidesMat, // +Y
          doorSidesMat, // -Y
          doorFrontMat, // +Z (Front)
          doorBackMat   // -Z (Back)
        ];

        const doorMesh = new THREE.Mesh(doorGeom, materials);

        // Position and rotate doorMesh inside hingeGroup to align the texture's left edge with the hinge pivot
        if (hingeDir === 'left') {
          doorMesh.position.set(w_door / 2, 0, 0);
          doorMesh.rotation.set(0, 0, 0);
        } else if (hingeDir === 'right') {
          doorMesh.position.set(-w_door / 2, 0, 0);
          doorMesh.rotation.set(0, Math.PI, 0); // reverse Y so hinge stays on left edge
        } else if (hingeDir === 'top') {
          doorMesh.position.set(0, -w_door / 2, 0);
          doorMesh.rotation.set(0, 0, -Math.PI / 2); // rotate clockwise around Z so left edge is at top hinge
        } else if (hingeDir === 'bottom') {
          doorMesh.position.set(0, w_door / 2, 0);
          doorMesh.rotation.set(0, 0, Math.PI / 2); // rotate counter-clockwise around Z so left edge is at bottom hinge
        }

        doorMesh.castShadow = true;
        doorMesh.receiveShadow = true;
        hingeGroup.add(doorMesh);

        // Calculate handle local position relative to hingeGroup
        const handleLocalPos = new THREE.Vector3();
        if (hingeDir === 'left') {
          handleLocalPos.set(w_door - 0.10, 0, 0);
        } else if (hingeDir === 'right') {
          handleLocalPos.set(-w_door + 0.10, 0, 0);
        } else if (hingeDir === 'top') {
          handleLocalPos.set(0, -w_door + 0.10, 0);
        } else if (hingeDir === 'bottom') {
          handleLocalPos.set(0, w_door - 0.10, 0);
        }

        const frontPrompt = createEPromptSprite();
        frontPrompt.position.copy(handleLocalPos).add(new THREE.Vector3(0, 0, t_door / 2 + 0.12));
        frontPrompt.visible = false;
        hingeGroup.add(frontPrompt);

        const backPrompt = createEPromptSprite();
        backPrompt.position.copy(handleLocalPos).add(new THREE.Vector3(0, 0, -t_door / 2 - 0.12));
        backPrompt.visible = false;
        hingeGroup.add(backPrompt);

        // Unique door ID
        const doorId = state.doors.length;

        const doorEntity = {
          id: doorId,
          mesh: doorGroup,
          hingeGroup: hingeGroup,
          doorMesh: doorMesh,
          wall: wall,
          gridI: wall.gridI,
          gridJ: wall.gridJ,
          isWeird: isWeird,
          isOpen: false,
          angle: 0,
          targetAngle: 0,
          baseAngle: baseAngle,
          frontPrompt: frontPrompt,
          backPrompt: backPrompt,
          hingeDir: hingeDir,
          handleLocalPos: handleLocalPos,
          w_curr: w_curr,
          h_curr: h_curr,
          t_door: t_door
        };

        state.doors.push(doorEntity);

        // Register door collider
        updateDoorCollider(doorEntity);
      }

    } else {
      const sizeX = isHoriz ? wallLength : thickness;
      const sizeY = wallHeight;
      const sizeZ = isHoriz ? thickness : wallLength;

      const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      adjustBoxUVs(geometry, sizeX, sizeY, sizeZ, isHoriz, 0, 0);

      const wallMesh = new THREE.Mesh(geometry, state.wallMaterialGlobal);
      wallMesh.position.set(wall.x, sizeY / 2, wall.z);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      state.scene.add(wallMesh);

      // Bounding box for 3D physics
      const colBox = {
        xMin: isHoriz ? wall.x - wallLength / 2 : wall.x - thickness / 2,
        xMax: isHoriz ? wall.x + wallLength / 2 : wall.x + thickness / 2,
        yMin: 0,
        yMax: sizeY,
        zMin: isHoriz ? wall.z - thickness / 2 : wall.z - wallLength / 2,
        zMax: isHoriz ? wall.z + thickness / 2 : wall.z + wallLength / 2
      };
      addColliderForCells(wall, colBox);
    }
  });



  // 4. Build Pillars in Rooms
  state.mazeData.pillars.forEach(pillar => {
    const pillarHeight = CONFIG.WALL_HEIGHT * 3;
    const geometry = new THREE.BoxGeometry(pillar.w, pillarHeight, pillar.l);
    adjustBoxUVs(geometry, pillar.w, pillarHeight, pillar.l, false, 0, 0);

    const pillarMesh = new THREE.Mesh(geometry, state.wallMaterialGlobal);
    pillarMesh.position.set(pillar.x, pillarHeight / 2, pillar.z);
    pillarMesh.castShadow = true;
    pillarMesh.receiveShadow = true;
    state.scene.add(pillarMesh);

    // AABB bounds
    const boundingBox = {
      xMin: pillar.x - pillar.w / 2,
      xMax: pillar.x + pillar.w / 2,
      yMin: 0,
      yMax: pillarHeight,
      zMin: pillar.z - pillar.l / 2,
      zMax: pillar.z + pillar.l / 2
    };

    // Store in grid cell lookup
    const key = `${pillar.gridI},${pillar.gridJ}`;
    if (!state.gridColliders[key]) state.gridColliders[key] = [];
    state.gridColliders[key].push({ type: 'pillar', box: boundingBox });
  });

  // 5. Build Spooky Wall Pictures
  if (state.wallPicTextures.length > 0) {
    const solidInnerWalls = state.mazeData.walls.filter(w => (w.type === 'horizontal' || w.type === 'vertical') && !w.hole);
    const shuffledWalls = [...solidInnerWalls].sort(() => Math.random() - 0.5);
    const numPics = Math.max(12, Math.floor(solidInnerWalls.length * 0.04));

    let selectedWalls = [];
    let minDist = 10.0;

    for (const wall of shuffledWalls) {
      let tooClose = false;
      for (const sel of selectedWalls) {
        const dx = wall.x - sel.x;
        const dz = wall.z - sel.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < minDist * minDist) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        selectedWalls.push(wall);
      }
      if (selectedWalls.length >= numPics) break;
    }

    if (selectedWalls.length < 8 && solidInnerWalls.length >= 8) {
      selectedWalls = [];
      minDist = 6.5;
      for (const wall of shuffledWalls) {
        let tooClose = false;
        for (const sel of selectedWalls) {
          const dx = wall.x - sel.x;
          const dz = wall.z - sel.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < minDist * minDist) {
            tooClose = true;
            break;
          }
        }
        if (!tooClose) {
          selectedWalls.push(wall);
        }
        if (selectedWalls.length >= numPics) break;
      }
    }

    selectedWalls.forEach((wall, index) => {
      const texObj = state.wallPicTextures[index % state.wallPicTextures.length];
      if (!texObj || !texObj.texture) return;
      const texture = texObj.texture;

      const img = texture.image;
      const aspect = img ? (img.width / img.height) : 1.0;

      const height = 0.6 + Math.random() * (CONFIG.WALL_HEIGHT - 0.2 - 0.6);
      const width = height * aspect;

      let finalWidth = width;
      let finalHeight = height;
      const maxWidth = wall.length * 0.95;
      if (finalWidth > maxWidth) {
        finalWidth = maxWidth;
        finalHeight = finalWidth / aspect;
      }

      if (finalHeight > CONFIG.WALL_HEIGHT - 0.2) {
        finalHeight = CONFIG.WALL_HEIGHT - 0.2;
        finalWidth = finalHeight * aspect;
      }

      const planeGeom = new THREE.PlaneGeometry(finalWidth, finalHeight);

      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.5,
        metalness: 0.1,
        side: THREE.DoubleSide
      });

      const picMesh = new THREE.Mesh(planeGeom, mat);

      const minY = finalHeight / 2 + 0.1;
      const maxY = CONFIG.WALL_HEIGHT - finalHeight / 2 - 0.1;
      const y = minY + Math.random() * (maxY - minY);

      const isFront = Math.random() < 0.5;
      const isHoriz = wall.type === 'horizontal' || wall.type === 'boundary-horizontal';
      const thickness = isHoriz ? 0.400 : 0.402;
      const offsetDist = thickness / 2 + 0.005;

      let px = wall.x;
      let pz = wall.z;
      let rotY = 0;

      if (isHoriz) {
        pz += isFront ? offsetDist : -offsetDist;
        rotY = isFront ? 0 : Math.PI;
      } else {
        px += isFront ? offsetDist : -offsetDist;
        rotY = isFront ? Math.PI / 2 : -Math.PI / 2;
      }

      picMesh.position.set(px, y, pz);
      picMesh.rotation.y = rotY;
      picMesh.receiveShadow = true;
      state.scene.add(picMesh);

      state.activeWallPictures.push({
        mesh: picMesh,
        wall: wall,
        audio: null,
        canPlaySound: false,
        hasPlayedSound: false
      });
    });

    // Select exactly 20% of pictures to be able to play sounds
    if (state.activeWallPictures.length > 0) {
      const numPicsToPlaySound = Math.floor(state.activeWallPictures.length * 0.2);
      const indices = Array.from({ length: state.activeWallPictures.length }, (_, idx) => idx);
      // Shuffle indices
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      for (let i = 0; i < indices.length; i++) {
        state.activeWallPictures[indices[i]].canPlaySound = i < numPicsToPlaySound;
      }
    }
  }

  // 6. Furnish rooms with carpets, windows, lamps, tables, chairs, sofas, shelves, TVs
  furnishRooms();

  // Force first-frame light check
  updateDynamicLights(true);
}
