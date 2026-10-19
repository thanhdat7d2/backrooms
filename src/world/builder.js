import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { state, CONFIG, DOM } from '../state.js';
import { MazeGenerator } from './maze.js';
import { updateDynamicLights } from './lights.js';
import { updateHealthHUD } from '../systems/physics.js';
import { createEPromptSprite, updateDoorCollider } from './door.js';
import { furnishRooms } from './furniture.js';
import { getBiomeMaterials } from '../systems/biomes.js';
import { createWallSconce } from './props.js';

// --- GEOMETRY UV ADJUSTMENT FOR WALLS/PILLARS ---
export function adjustBoxUVs(geometry, sizeX, sizeY, sizeZ, isHoriz, uOffset = 0, yOffset = 0) {
  const uvAttr = geometry.attributes.uv;
  if (!uvAttr) return;
  const uvs = uvAttr.array;

  for (let face = 0; face < 6; face++) {
    const offset = face * 8;
    let scaleU = 1, scaleV = 1;
    let addU = 0, addV = 0;

    if (face === 0 || face === 1) {
      scaleU = sizeZ;
      scaleV = sizeY;
      if (!isHoriz) { addU = uOffset; addV = yOffset; }
    } else if (face === 2 || face === 3) {
      scaleU = sizeX;
      scaleV = sizeZ;
      if (isHoriz) addU = uOffset;
      else addV = uOffset;
    } else if (face === 4 || face === 5) {
      scaleU = sizeX;
      scaleV = sizeY;
      if (isHoriz) { addU = uOffset; addV = yOffset; }
    }

    for (let v = 0; v < 4; v++) {
      uvs[offset + v * 2] = uvs[offset + v * 2] * scaleU + addU;
      uvs[offset + v * 2 + 1] = uvs[offset + v * 2 + 1] * scaleV + addV;
    }
  }
  uvAttr.needsUpdate = true;
}

export function createSubBoxCollider(wall, isHoriz, uCenter, uLen, yMin, yMax, thickness) {
  const halfLen = uLen / 2;
  const halfThick = thickness / 2;
  const centerX = isHoriz ? wall.x + uCenter : wall.x;
  const centerZ = isHoriz ? wall.z : wall.z + uCenter;

  return {
    xMin: isHoriz ? centerX - halfLen : centerX - halfThick,
    xMax: isHoriz ? centerX + halfLen : centerX + halfThick,
    yMin,
    yMax,
    zMin: isHoriz ? centerZ - halfThick : centerZ - halfLen,
    zMax: isHoriz ? centerZ + halfThick : centerZ + halfLen
  };
}

function createExteriorVistaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  // Surreal twilight liminal horizon with distant monolith silhouettes
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#141c30');
  grad.addColorStop(0.45, '#3b5878');
  grad.addColorStop(0.72, '#c89b78');
  grad.addColorStop(0.76, '#1a1d24');
  grad.addColorStop(1, '#090b10');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Eerie pale moon/sun
  ctx.fillStyle = 'rgba(255,245,220,0.85)';
  ctx.beginPath();
  ctx.arc(178, 84, 18, 0, Math.PI * 2);
  ctx.fill();

  // Distant liminal monolith towers
  ctx.fillStyle = '#121620';
  const towers = [[28, 120, 22], [75, 95, 18], [130, 130, 26], [202, 105, 20]];
  towers.forEach(([x, y, w]) => {
    ctx.fillRect(x, y, w, 195 - y);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _sharedVistaMat = null;
let _sharedGlassMat = null;
let _sharedFrameMat = null;
let _sharedStairMat = null;
let _sharedRailMat = null;
let _sharedWaterMat = null;
let _sharedAbyssMat = null;

function ensureSharedArchMaterials() {
  if (!_sharedVistaMat) {
    _sharedVistaMat = new THREE.MeshBasicMaterial({ map: createExteriorVistaTexture(), side: THREE.DoubleSide });
  }
  if (!_sharedGlassMat) {
    _sharedGlassMat = new THREE.MeshStandardMaterial({
      color: 0xcce8ff,
      transparent: true,
      opacity: 0.24,
      roughness: 0.08,
      metalness: 0.25,
      side: THREE.DoubleSide
    });
  }
  if (!_sharedFrameMat) {
    _sharedFrameMat = new THREE.MeshStandardMaterial({ color: 0x3a322c, roughness: 0.55, metalness: 0.35 });
  }
  if (!_sharedStairMat) {
    _sharedStairMat = new THREE.MeshStandardMaterial({ color: 0x7b756a, roughness: 0.82, metalness: 0.08 });
  }
  if (!_sharedRailMat) {
    _sharedRailMat = new THREE.MeshStandardMaterial({ color: 0x44484d, roughness: 0.35, metalness: 0.72 });
  }
  if (!_sharedWaterMat) {
    _sharedWaterMat = new THREE.MeshStandardMaterial({
      color: 0x3ec8d8,
      transparent: true,
      opacity: 0.52,
      roughness: 0.08,
      metalness: 0.15,
      side: THREE.DoubleSide
    });
  }
  if (!_sharedAbyssMat) {
    _sharedAbyssMat = new THREE.MeshBasicMaterial({ color: 0x020203, side: THREE.BackSide });
  }
}

export function buildMaze(level) {
  ensureSharedArchMaterials();

  // Stop all active Three.js sounds before clearing scene
  if (state.scene) {
    state.scene.traverse(obj => {
      if (obj.isAudio) {
        try { if (obj.isPlaying) obj.stop(); } catch (e) { }
        if (obj.parent) obj.parent.remove(obj);
      }
    });
  }
  state.activeSpookySound = null;

  // Clear previous level meshes & lights
  if (state.scene) {
    const toRemove = [];
    state.scene.traverse(obj => {
      if (obj === state.cameraContainer || obj === state.camera || (state.controls && obj === state.controls.object)) {
        return;
      }
      if (obj === state.flashlight || obj === state.flashlightTarget) {
        return;
      }
      if (!obj.userData.isSharedModelAsset) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(mat => {
            const isShared = (
              mat === state.wallMaterialGlobal ||
              mat === _sharedVistaMat || mat === _sharedGlassMat || mat === _sharedFrameMat ||
              mat === _sharedStairMat || mat === _sharedRailMat || mat === _sharedWaterMat || mat === _sharedAbyssMat ||
              Object.values(state.biomeMaterials).some(bm => bm && (bm.wall === mat || bm.floor === mat || bm.ceiling === mat))
            );
            if (!isShared) {
              if (mat.map && mat.map !== state.wallTexture && mat.map !== state.floorTexture &&
                  mat.map !== state.ceilingTexture && mat.map !== state.doorTexture && mat.map !== state.doorSidesTexture) {
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
    toRemove.forEach(obj => state.scene.remove(obj));
  }

  state.wallMaterials.forEach(mat => {
    if (mat.map) mat.map.dispose();
    mat.dispose();
  });
  state.wallMaterials = [];

  // Re-add camera container & ambient light
  state.scene.add(state.cameraContainer);
  state.ambientLight = new THREE.AmbientLight(0x6b6352, 0.65);
  state.scene.add(state.ambientLight);

  // Reset states
  state.mazeBuildId++;
  state.wallPicsBuiltForId = -1;
  state.furnitureBuiltForId = -1;
  state.roomFurnitureGroups = [];
  state.hidingSpots = [];
  state.waterMeshes = [];
  state.lastFurnitureCullPos.set(9999, 9999, 9999);
  state.gridColliders = {};
  state.floorHoles = {};
  state.stairs = [];
  state.lightPool = [];
  state.lightObjects = [];
  state.activeLights = [];
  state.lastLightUpdatePos.set(9999, 9999, 9999);
  state.lastLightUpdateFloor = -1;
  state.isFallingIntoExit = false;
  state.isFallingIntoAbyss = false;
  state.playerVelocityY = 0;
  state.isOnGround = true;
  state.isCrouching = false;
  state.isHidden = false;
  state.currentEyeHeight = CONFIG.EYE_HEIGHT;
  state.playerHealth = 100;
  updateHealthHUD();

  if (state.activeChaseMonster && state.activeChaseMonster.audio) {
    try { if (state.activeChaseMonster.audio.isPlaying) state.activeChaseMonster.audio.stop(); } catch (e) { }
  }
  state.activeWallPictures = [];
  state.doors = [];
  state.activeChaseMonster = null;
  state.nextChaseSpawnTime = Date.now() + 22000 + Math.random() * 38000;

  if (state.navLineMesh) {
    state.scene.remove(state.navLineMesh);
    state.navLineMesh.geometry.dispose();
    state.navLineMesh = null;
  }
  state.showNavLine = false;

  // Generate 4-Floor Maze Layout
  state.mazeData = MazeGenerator.generate(level, CONFIG.EYE_HEIGHT);
  state.stairs = state.mazeData.stairs;
  state.currentFloor = state.mazeData.start.floor;

  if (DOM.levelValueHUD) DOM.levelValueHUD.textContent = level;
  if (DOM.floorValueHUD) DOM.floorValueHUD.textContent = `F${state.currentFloor + 1}`;

  // Position player at start on floor 0
  state.playerPosition.set(state.mazeData.start.x, state.mazeData.start.baseY + CONFIG.EYE_HEIGHT, state.mazeData.start.z);
  state.controls.object.position.copy(state.playerPosition);
  state.controls.object.lookAt(0, state.mazeData.start.baseY + CONFIG.EYE_HEIGHT, 0);
  state.controls.object.rotation.y += Math.PI;

  const maze = state.mazeData;
  const N = maze.N;
  const WALL_H = CONFIG.WALL_HEIGHT;
  const SLAB_T = CONFIG.FLOOR_SLAB_THICKNESS;

  // Base floor/ceiling materials
  const floorTexCloned = state.floorTexture.clone();
  floorTexCloned.repeat.set(0.5, 0.5);
  floorTexCloned.wrapS = THREE.RepeatWrapping;
  floorTexCloned.wrapT = THREE.RepeatWrapping;
  floorTexCloned.needsUpdate = true;
  state.floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexCloned, roughness: 0.65 });

  const ceilingTexCloned = state.ceilingTexture.clone();
  ceilingTexCloned.repeat.set(1.0, 1.0);
  ceilingTexCloned.wrapS = THREE.RepeatWrapping;
  ceilingTexCloned.wrapT = THREE.RepeatWrapping;
  ceilingTexCloned.needsUpdate = true;
  state.ceilingMaterial = new THREE.MeshStandardMaterial({ map: ceilingTexCloned, roughness: 0.8 });

  // Helper to register AABB collider in 3D grid
  const addColliderBox = (floor, gi, gj, box, type = 'wall') => {
    const key = `${floor},${gi},${gj}`;
    if (!state.gridColliders[key]) state.gridColliders[key] = [];
    state.gridColliders[key].push({ type, box });
  };

  const addColliderForWallCells = (wall, boundingBox) => {
    const f = wall.floor || 0;
    const count = wall.count || 1;
    for (let k = 0; k < count; k++) {
      if (wall.type === 'horizontal' || wall.type === 'boundary-horizontal') {
        addColliderBox(f, wall.gridI + k, wall.gridJ, boundingBox);
        if (wall.type === 'horizontal') addColliderBox(f, wall.gridI + k, wall.gridJ + 1, boundingBox);
      } else if (wall.type === 'vertical' || wall.type === 'boundary-vertical') {
        addColliderBox(f, wall.gridI, wall.gridJ + k, boundingBox);
        if (wall.type === 'vertical') addColliderBox(f, wall.gridI + 1, wall.gridJ + k, boundingBox);
      }
    }
  };

  const addSegmentCollider = (floor, seg) => {
    const pad = seg.halfThick + 0.4;
    const minX = Math.min(seg.x1, seg.x2) - pad;
    const maxX = Math.max(seg.x1, seg.x2) + pad;
    const minZ = Math.min(seg.z1, seg.z2) - pad;
    const maxZ = Math.max(seg.z1, seg.z2) + pad;
    const cMin = maze.worldToCell(minX, minZ);
    const cMax = maze.worldToCell(maxX, maxZ);
    for (let i = cMin.cellI; i <= cMax.cellI; i++) {
      for (let j = cMin.cellJ; j <= cMax.cellJ; j++) {
        const key = `${floor},${i},${j}`;
        if (!state.gridColliders[key]) state.gridColliders[key] = [];
        state.gridColliders[key].push(seg);
      }
    }
  };

  // Geometry batches grouped by biomeId
  const wallGeosByBiome = {};
  const floorGeosByBiome = {};
  const ceilGeosByBiome = {};
  const pushGeo = (map, biomeId, geom) => {
    const b = biomeId || 'base';
    if (!map[b]) map[b] = [];
    map[b].push(geom);
  };

  // Shared door materials
  let sharedDoorMaterials = null;
  const getSharedDoorMaterials = () => {
    if (!sharedDoorMaterials && state.doorTexture && state.doorSidesTexture) {
      const doorTexFront = state.doorTexture;
      const doorTexBack = state.doorTexture.clone();
      doorTexBack.wrapS = THREE.RepeatWrapping;
      doorTexBack.repeat.x = -1;
      doorTexBack.offset.x = 1;
      doorTexBack.needsUpdate = true;

      const doorSidesMat = new THREE.MeshStandardMaterial({ map: state.doorSidesTexture, roughness: 0.7 });
      const doorFrontMat = new THREE.MeshStandardMaterial({ map: doorTexFront, roughness: 0.5 });
      const doorBackMat = new THREE.MeshStandardMaterial({ map: doorTexBack, roughness: 0.5 });

      sharedDoorMaterials = [
        doorSidesMat, doorSidesMat, doorSidesMat, doorSidesMat, doorFrontMat, doorBackMat
      ];
    }
    return sharedDoorMaterials;
  };

  // Build quick lookup for stair openings (only exact stair rectangle is cut on toFloor so players can walk around it)
  const stairCeilingOpen = new Set(); // `${f},${i},${j}` where ceiling on floor f is open for stair going up
  const stairToFloorMap = {}; // `${f},${i},${j}` -> stair object on toFloor
  maze.stairs.forEach(st => {
    stairCeilingOpen.add(`${st.fromFloor},${st.i1},${st.j1}`);
    stairCeilingOpen.add(`${st.fromFloor},${st.i2},${st.j2}`);
    stairToFloorMap[`${st.toFloor},${st.i1},${st.j1}`] = st;
    stairToFloorMap[`${st.toFloor},${st.i2},${st.j2}`] = st;
  });

  // ----------------------------------------------------------
  // BUILD ALL 4 FLOORS
  // ----------------------------------------------------------
  maze.floors.forEach(floorData => {
    const f = floorData.floor;
    const baseY = floorData.baseY;

    // Register floor holes in state.floorHoles
    const holeLookup = {};
    floorData.floorHoles.forEach(h => {
      const key = `${f},${h.i},${h.j}`;
      state.floorHoles[key] = h;
      holeLookup[`${h.i},${h.j}`] = h;
    });

    // 1. Per-Cell Floors & Ceilings (supports holes, merged zones, stairs, exit pit, biomes, poolrooms water)
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const w = maze.colWidths[i];
        const d = maze.rowHeights[j];
        const cx = maze.cellCX(i);
        const cz = maze.cellCZ(j);
        const biomeId = floorData.biomeGrid[i][j] || 'base';
        const mz = maze.mergedCellLookup[f][i][j];
        const isExitCell = (f === maze.exit.floor && i === maze.centerIdx && j === maze.centerIdx);
        const hole = holeLookup[`${i},${j}`];

        // --- FLOOR SLAB ---
        const omitFloorForMerge = mz && f > mz.fStart;
        const stairCut = stairToFloorMap[`${f},${i},${j}`];
        const SLAB_VISUAL_T = SLAB_T - 0.018; // 1.8cm gap above ceiling below prevents floor/ceiling Z-fighting

        if (!omitFloorForMerge && !isExitCell) {
          const cutout = hole || (stairCut ? {
            xMin: Math.max(maze.colX[i], stairCut.xMin),
            xMax: Math.min(maze.colX[i + 1], stairCut.xMax),
            zMin: Math.max(maze.rowZ[j], stairCut.zMin),
            zMax: Math.min(maze.rowZ[j + 1], stairCut.zMax),
            type: 'stair'
          } : null);

          if (cutout && cutout.xMax > cutout.xMin + 0.05 && cutout.zMax > cutout.zMin + 0.05) {
            // Build 4 border floor strips around the cutout hole or stair shaft
            const x0 = maze.colX[i], x1 = maze.colX[i + 1];
            const z0 = maze.rowZ[j], z1 = maze.rowZ[j + 1];
            const strips = [
              { x: (x0 + cutout.xMin) / 2, z: cz, sx: cutout.xMin - x0, sz: d },
              { x: (cutout.xMax + x1) / 2, z: cz, sx: x1 - cutout.xMax, sz: d },
              { x: (cutout.xMin + cutout.xMax) / 2, z: (z0 + cutout.zMin) / 2, sx: cutout.xMax - cutout.xMin, sz: cutout.zMin - z0 },
              { x: (cutout.xMin + cutout.xMax) / 2, z: (cutout.zMax + z1) / 2, sx: cutout.xMax - cutout.xMin, sz: z1 - cutout.zMax }
            ];
            strips.forEach(s => {
              if (s.sx > 0.02 && s.sz > 0.02) {
                const g = new THREE.BoxGeometry(s.sx, SLAB_VISUAL_T, s.sz);
                adjustBoxUVs(g, s.sx * 0.5, SLAB_VISUAL_T, s.sz * 0.5, true, 0, 0);
                g.translate(s.x, baseY - SLAB_VISUAL_T / 2, s.z);
                pushGeo(floorGeosByBiome, biomeId, g);
              }
            });

            // If abyss pitfall, build deep pitch-black shaft beneath it
            if (cutout.type === 'abyss') {
              const hw = cutout.xMax - cutout.xMin;
              const hd = cutout.zMax - cutout.zMin;
              const shaft = new THREE.Mesh(new THREE.BoxGeometry(hw, 10.0, hd), _sharedAbyssMat);
              shaft.position.set((cutout.xMin + cutout.xMax) / 2, baseY - 5.05, (cutout.zMin + cutout.zMax) / 2);
              shaft.userData.isSharedModelAsset = true;
              state.scene.add(shaft);
            }
          } else {
            const g = new THREE.BoxGeometry(w, SLAB_VISUAL_T, d);
            adjustBoxUVs(g, w * 0.5, SLAB_VISUAL_T, d * 0.5, true, 0, 0);
            g.translate(cx, baseY - SLAB_VISUAL_T / 2, cz);
            pushGeo(floorGeosByBiome, biomeId, g);

            // Poolrooms flooded water surface!
            if (biomeId === 'poolrooms') {
              const waterPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), _sharedWaterMat);
              waterPlane.rotation.x = -Math.PI / 2;
              waterPlane.position.set(cx, baseY + 0.28, cz);
              waterPlane.userData.baseY = baseY + 0.28;
              waterPlane.userData.isSharedModelAsset = true;
              state.scene.add(waterPlane);
              state.waterMeshes.push(waterPlane);
            }
          }
        }

        // --- CEILING SLAB ---
        const omitCeilForMerge = mz && f < mz.fEnd;
        const omitCeilForStair = stairCeilingOpen.has(`${f},${i},${j}`);

        if (!omitCeilForMerge && !omitCeilForStair) {
          const cg = new THREE.PlaneGeometry(w, d);
          // Scale UVs
          const uv = cg.attributes.uv;
          for (let v = 0; v < uv.count; v++) {
            uv.setXY(v, uv.getX(v) * w * 0.65, uv.getY(v) * d * 0.65);
          }
          cg.rotateX(Math.PI / 2);
          cg.translate(cx, baseY + WALL_H, cz);
          pushGeo(ceilGeosByBiome, biomeId, cg);
        }
      }
    }

    // 2. Axis-Aligned Walls (with Doors, Dead-End Doors, and Real Cutout See-Through Windows!)
    floorData.walls.forEach(wall => {
      const isHoriz = wall.type === 'horizontal' || wall.type === 'boundary-horizontal';
      // Distinct thickness & height for vertical vs horizontal prevents corner Z-fighting across biomes
      const thickness = isHoriz ? 0.400 : 0.392;
      const extPrev = wall.continuesPrev ? 0 : (thickness / 2);
      const extNext = wall.continuesNext ? 0 : (thickness / 2);
      const wallLength = wall.length + extPrev + extNext;
      const centerShift = (extNext - extPrev) / 2;
      const wallCenterX = isHoriz ? wall.x + centerShift : wall.x;
      const wallCenterZ = isHoriz ? wall.z : wall.z + centerShift;
      const wallHeight = WALL_H + (isHoriz ? 0.000 : -0.004);
      const wallBaseY = baseY + (isHoriz ? 0.000 : 0.002);
      const biomeId = wall.biomeId || 'base';
      const wallPos = { x: wallCenterX, z: wallCenterZ };

      if (wall.hole) {
        const hole = wall.hole;
        const L_mesh = wallLength;
        const T_mesh = thickness;
        const H_mesh = wallHeight;
        const u1 = hole.offset - hole.width / 2;
        const u2 = hole.offset + hole.width / 2;

        // Left piece
        const L_left = u1 - (-L_mesh / 2);
        if (L_left > 0.02) {
          const uCenter = -L_mesh / 2 + L_left / 2;
          const sizeX = isHoriz ? L_left : T_mesh;
          const sizeZ = isHoriz ? T_mesh : L_left;
          const geom = new THREE.BoxGeometry(sizeX, H_mesh, sizeZ);
          adjustBoxUVs(geom, sizeX, H_mesh, sizeZ, isHoriz, 0, 0);
          const px = isHoriz ? wallPos.x + uCenter : wallPos.x;
          const pz = isHoriz ? wallPos.z : wallPos.z + uCenter;
          geom.translate(px, wallBaseY + H_mesh / 2, pz);
          pushGeo(wallGeosByBiome, biomeId, geom);
          addColliderForWallCells(wall, createSubBoxCollider(wallPos, isHoriz, uCenter, L_left, wallBaseY, wallBaseY + H_mesh, T_mesh));
        }

        // Right piece
        const L_right = L_mesh / 2 - u2;
        if (L_right > 0.02) {
          const uCenter = L_mesh / 2 - L_right / 2;
          const sizeX = isHoriz ? L_right : T_mesh;
          const sizeZ = isHoriz ? T_mesh : L_right;
          const geom = new THREE.BoxGeometry(sizeX, H_mesh, sizeZ);
          adjustBoxUVs(geom, sizeX, H_mesh, sizeZ, isHoriz, L_left + hole.width, 0);
          const px = isHoriz ? wallPos.x + uCenter : wallPos.x;
          const pz = isHoriz ? wallPos.z : wallPos.z + uCenter;
          geom.translate(px, wallBaseY + H_mesh / 2, pz);
          pushGeo(wallGeosByBiome, biomeId, geom);
          addColliderForWallCells(wall, createSubBoxCollider(wallPos, isHoriz, uCenter, L_right, wallBaseY, wallBaseY + H_mesh, T_mesh));
        }

        const W = hole.width;
        const uCenterMid = u1 + W / 2;

        // Bottom piece
        if (hole.yBottom > 0.02) {
          const sizeX = isHoriz ? W : T_mesh;
          const sizeY = hole.yBottom;
          const sizeZ = isHoriz ? T_mesh : W;
          const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
          adjustBoxUVs(geom, sizeX, sizeY, sizeZ, isHoriz, L_left, 0);
          const px = isHoriz ? wallPos.x + uCenterMid : wallPos.x;
          const pz = isHoriz ? wallPos.z : wallPos.z + uCenterMid;
          geom.translate(px, wallBaseY + sizeY / 2, pz);
          pushGeo(wallGeosByBiome, biomeId, geom);
          addColliderForWallCells(wall, createSubBoxCollider(wallPos, isHoriz, uCenterMid, W, wallBaseY, wallBaseY + hole.yBottom, T_mesh));
        }

        // Top piece
        const topHeight = H_mesh - hole.yTop;
        if (topHeight > 0.02) {
          const sizeX = isHoriz ? W : T_mesh;
          const sizeY = topHeight;
          const sizeZ = isHoriz ? T_mesh : W;
          const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
          adjustBoxUVs(geom, sizeX, sizeY, sizeZ, isHoriz, L_left, hole.yTop);
          const px = isHoriz ? wallPos.x + uCenterMid : wallPos.x;
          const pz = isHoriz ? wallPos.z : wallPos.z + uCenterMid;
          geom.translate(px, wallBaseY + hole.yTop + sizeY / 2, pz);
          pushGeo(wallGeosByBiome, biomeId, geom);
          addColliderForWallCells(wall, createSubBoxCollider(wallPos, isHoriz, uCenterMid, W, wallBaseY + hole.yTop, wallBaseY + H_mesh, T_mesh));
        }

        // --- SEE-THROUGH CUTOUT WINDOW ---
        if (hole.isWindow) {
          const px = isHoriz ? wallPos.x + uCenterMid : wallPos.x;
          const pz = isHoriz ? wallPos.z : wallPos.z + uCenterMid;
          const py = wallBaseY + hole.yBottom + hole.height / 2;
          const rotY = isHoriz ? 0 : Math.PI / 2;

          const winGroup = new THREE.Group();
          winGroup.position.set(px, py, pz);
          winGroup.rotation.y = rotY;
          winGroup.userData.isSharedModelAsset = true;

          const fw = hole.width;
          const fh = hole.height;
          const barT = 0.06;
          // Outer frame + center cross mullions
          const topBar = new THREE.Mesh(new THREE.BoxGeometry(fw, barT, T_mesh + 0.02), _sharedFrameMat);
          topBar.position.y = fh / 2 - barT / 2;
          const botBar = new THREE.Mesh(new THREE.BoxGeometry(fw, barT, T_mesh + 0.04), _sharedFrameMat);
          botBar.position.y = -fh / 2 + barT / 2;
          const lBar = new THREE.Mesh(new THREE.BoxGeometry(barT, fh, T_mesh + 0.02), _sharedFrameMat);
          lBar.position.x = -fw / 2 + barT / 2;
          const rBar = new THREE.Mesh(new THREE.BoxGeometry(barT, fh, T_mesh + 0.02), _sharedFrameMat);
          rBar.position.x = fw / 2 - barT / 2;
          const vMullion = new THREE.Mesh(new THREE.BoxGeometry(0.035, fh, 0.06), _sharedFrameMat);
          const hMullion = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.035, 0.06), _sharedFrameMat);
          const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(fw - barT, fh - barT), _sharedGlassMat);

          [topBar, botBar, lBar, rBar, vMullion, hMullion, glassPane].forEach(m => {
            m.userData.isSharedModelAsset = true;
            winGroup.add(m);
          });

          // Surreal exterior vista backdrop outside exterior boundary windows
          if (hole.isExteriorWindow) {
            const isNeg = isHoriz ? (wall.gridJ === 0) : (wall.gridI === 0);
            const sign = isNeg ? -1 : 1;
            const vista = new THREE.Mesh(new THREE.PlaneGeometry(fw * 1.45, fh * 1.45), _sharedVistaMat);
            vista.position.z = sign * 0.85;
            vista.userData.isSharedModelAsset = true;
            winGroup.add(vista);
          }

          state.scene.add(winGroup);

          // Glass collider so players can see through without walking through glass
          addColliderForWallCells(
            wall,
            createSubBoxCollider(wallPos, isHoriz, uCenterMid, W, wallBaseY + hole.yBottom, wallBaseY + hole.yTop, 0.12)
          );
        }

        // --- INTERACTIVE DOOR (Normal, Weird, or Dead-End) ---
        if (hole.isDoor) {
          const w_door = 1.116;
          const h_door = 2.10;
          const t_door = 0.08;
          const hingeDir = hole.hingeDir || 'left';
          const rotated = hole.rotated || false;
          const w_curr = rotated ? h_door : w_door;
          const h_curr = rotated ? w_door : h_door;

          const px = isHoriz ? wallPos.x + uCenterMid : wallPos.x;
          const pz = isHoriz ? wallPos.z : wallPos.z + uCenterMid;
          const baseAngle = isHoriz ? 0 : Math.PI / 2;
          const py_center = wallBaseY + hole.yBottom + h_curr / 2;

          // If Dead-End Door, offset door +0.08 and place backing wall -0.06 so they never Z-fight!
          const doorOffset = hole.isDeadEnd ? 0.08 : 0;
          if (hole.isDeadEnd) {
            const backGeom = new THREE.BoxGeometry(isHoriz ? W - 0.01 : 0.12, h_curr - 0.01, isHoriz ? 0.12 : W - 0.01);
            adjustBoxUVs(backGeom, isHoriz ? W : 0.12, h_curr, isHoriz ? 0.12 : W, isHoriz, 0, 0);
            backGeom.translate(px + (isHoriz ? 0 : -0.06), py_center, pz + (isHoriz ? -0.06 : 0));
            pushGeo(wallGeosByBiome, biomeId, backGeom);
          }

          const doorGroup = new THREE.Group();
          doorGroup.position.set(px + (isHoriz ? 0 : doorOffset), py_center, pz + (isHoriz ? doorOffset : 0));
          doorGroup.rotation.y = baseAngle;
          state.scene.add(doorGroup);

          const hingeGroup = new THREE.Group();
          doorGroup.add(hingeGroup);

          if (hingeDir === 'left') hingeGroup.position.set(-w_door / 2, 0, 0);
          else if (hingeDir === 'right') hingeGroup.position.set(w_door / 2, 0, 0);
          else if (hingeDir === 'top') hingeGroup.position.set(0, w_door / 2, 0);
          else if (hingeDir === 'bottom') hingeGroup.position.set(0, -w_door / 2, 0);

          const doorGeom = new THREE.BoxGeometry(w_door, h_door, t_door);
          const materials = getSharedDoorMaterials() || state.wallMaterialGlobal;
          const doorMesh = new THREE.Mesh(doorGeom, materials);

          if (hingeDir === 'left') {
            doorMesh.position.set(w_door / 2, 0, 0);
          } else if (hingeDir === 'right') {
            doorMesh.position.set(-w_door / 2, 0, 0);
            doorMesh.rotation.set(0, Math.PI, 0);
          } else if (hingeDir === 'top') {
            doorMesh.position.set(0, -w_door / 2, 0);
            doorMesh.rotation.set(0, 0, -Math.PI / 2);
          } else if (hingeDir === 'bottom') {
            doorMesh.position.set(0, w_door / 2, 0);
            doorMesh.rotation.set(0, 0, Math.PI / 2);
          }

          doorMesh.receiveShadow = true;
          hingeGroup.add(doorMesh);

          const handleLocalPos = new THREE.Vector3();
          if (hingeDir === 'left') handleLocalPos.set(w_door - 0.10, 0, 0);
          else if (hingeDir === 'right') handleLocalPos.set(-w_door + 0.10, 0, 0);
          else if (hingeDir === 'top') handleLocalPos.set(0, -w_door + 0.10, 0);
          else if (hingeDir === 'bottom') handleLocalPos.set(0, w_door - 0.10, 0);

          const frontPrompt = createEPromptSprite();
          frontPrompt.position.copy(handleLocalPos).add(new THREE.Vector3(0, 0, t_door / 2 + 0.12));
          frontPrompt.visible = false;
          hingeGroup.add(frontPrompt);

          const backPrompt = createEPromptSprite();
          backPrompt.position.copy(handleLocalPos).add(new THREE.Vector3(0, 0, -t_door / 2 - 0.12));
          backPrompt.visible = false;
          hingeGroup.add(backPrompt);

          const doorEntity = {
            id: state.doors.length,
            floor: f,
            mesh: doorGroup,
            hingeGroup,
            doorMesh,
            wall,
            gridI: wall.gridI,
            gridJ: wall.gridJ,
            isWeird: !!hole.isWeird,
            isDeadEnd: !!hole.isDeadEnd,
            isOpen: false,
            angle: 0,
            targetAngle: 0,
            baseAngle,
            frontPrompt,
            backPrompt,
            hingeDir,
            handleLocalPos,
            w_curr,
            h_curr,
            t_door
          };
          state.doors.push(doorEntity);
          updateDoorCollider(doorEntity);
        }
      } else {
        // Solid wall
        const sizeX = isHoriz ? wallLength : thickness;
        const sizeY = wallHeight;
        const sizeZ = isHoriz ? thickness : wallLength;

        const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
        adjustBoxUVs(geometry, sizeX, sizeY, sizeZ, isHoriz, 0, 0);
        geometry.translate(wallPos.x, wallBaseY + sizeY / 2, wallPos.z);
        pushGeo(wallGeosByBiome, biomeId, geometry);

        addColliderForWallCells(wall, {
          xMin: isHoriz ? wallPos.x - wallLength / 2 : wallPos.x - thickness / 2,
          xMax: isHoriz ? wallPos.x + wallLength / 2 : wallPos.x + thickness / 2,
          yMin: wallBaseY,
          yMax: wallBaseY + sizeY,
          zMin: isHoriz ? wallPos.z - thickness / 2 : wallPos.z - wallLength / 2,
          zMax: isHoriz ? wallPos.z + thickness / 2 : wallPos.z + wallLength / 2
        });

        // Occasional functional wall sconce on solid corridor walls
        if (wall.length > 2.2 && !wall.type.startsWith('boundary-') && Math.random() < 0.06) {
          const sconce = createWallSconce();
          const side = Math.random() < 0.5 ? 1 : -1;
          const sx = isHoriz ? wall.x : wall.x + side * (thickness / 2 + 0.02);
          const sz = isHoriz ? wall.z + side * (thickness / 2 + 0.02) : wall.z;
          const sy = baseY + 2.05;
          sconce.mesh.position.set(sx, sy, sz);
          sconce.mesh.rotation.y = isHoriz ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
          state.scene.add(sconce.mesh);

          const cell = maze.worldToCell(sx + (isHoriz ? 0 : side * 0.4), sz + (isHoriz ? side * 0.4 : 0));
          state.lightObjects.push({
            x: sx + (isHoriz ? 0 : side * 0.35),
            y: sy,
            z: sz + (isHoriz ? side * 0.35 : 0),
            floor: f,
            cellI: cell.cellI,
            cellJ: cell.cellJ,
            color: 0xffb366,
            intensity: 2.8,
            range: 8.5,
            flicker: Math.random() < 0.3,
            flickerPhase: Math.random() * 100,
            dist: Infinity,
            poolSlot: -1
          });
        }
      }
    });

    // 3. Curved & Diagonal Non-Axis-Aligned Walls (integrated from generation!)
    floorData.customWalls.forEach(cw => {
      const dx = cw.x2 - cw.x1;
      const dz = cw.z2 - cw.z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.05) return;

      const angle = -Math.atan2(dz, dx);
      const cx = (cw.x1 + cw.x2) / 2;
      const cz = (cw.z1 + cw.z2) / 2;
      const thick = cw.thickness || 0.34;
      const h = WALL_H + SLAB_T;

      const geom = new THREE.BoxGeometry(len + thick * 0.38, h, thick);
      adjustBoxUVs(geom, len + thick * 0.38, h, thick, true, 0, 0);
      geom.rotateY(angle);
      geom.translate(cx, baseY + h / 2, cz);
      pushGeo(wallGeosByBiome, cw.biomeId || 'base', geom);

      addSegmentCollider(f, {
        type: 'segment',
        x1: cw.x1,
        z1: cw.z1,
        x2: cw.x2,
        z2: cw.z2,
        halfThick: thick / 2,
        yMin: baseY,
        yMax: baseY + h
      });
    });

    // 4. Pillars
    floorData.pillars.forEach(pillar => {
      const geometry = new THREE.BoxGeometry(pillar.w, WALL_H, pillar.l);
      adjustBoxUVs(geometry, pillar.w, WALL_H, pillar.l, false, 0, 0);
      geometry.translate(pillar.x, baseY + WALL_H / 2, pillar.z);
      pushGeo(wallGeosByBiome, pillar.biomeId || 'base', geometry);

      addColliderBox(f, pillar.gridI, pillar.gridJ, {
        xMin: pillar.x - pillar.w / 2,
        xMax: pillar.x + pillar.w / 2,
        yMin: baseY,
        yMax: baseY + WALL_H,
        zMin: pillar.z - pillar.l / 2,
        zMax: pillar.z + pillar.l / 2
      }, 'pillar');
    });

    // 5. Ceiling Light Fixtures (multi-color!)
    const lightFixtureGeo = new THREE.PlaneGeometry(0.52, 0.52);
    floorData.lights.forEach(light => {
      const c = new THREE.Color(light.color || 0xfff0c4);
      const fixMat = new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(2.2) });
      const fixMesh = new THREE.Mesh(lightFixtureGeo, fixMat);
      fixMesh.position.set(light.x, baseY + WALL_H - 0.008, light.z);
      fixMesh.rotation.x = Math.PI / 2;
      state.scene.add(fixMesh);

      state.lightObjects.push({
        x: light.x,
        y: baseY + WALL_H - 0.35,
        z: light.z,
        floor: f,
        cellI: light.gridI,
        cellJ: light.gridJ,
        color: light.color || 0xfff0c4,
        intensity: 3.6,
        range: 10.5,
        flicker: !!light.flicker,
        flickerPhase: Math.random() * 100,
        fixtureMat: fixMat,
        dist: Infinity,
        poolSlot: -1
      });
    });
  });

  // ----------------------------------------------------------
  // MERGE GEOMETRIES PER BIOME (Massive FPS boost!)
  // ----------------------------------------------------------
  const mergeAndAdd = (geoMap, slotName, castShadow) => {
    Object.entries(geoMap).forEach(([biomeId, geos]) => {
      if (!geos || geos.length === 0) return;
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (merged) {
        const mats = getBiomeMaterials(biomeId);
        const mesh = new THREE.Mesh(merged, mats[slotName]);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        state.scene.add(mesh);
      }
    });
  };

  mergeAndAdd(wallGeosByBiome, 'wall', true);
  mergeAndAdd(floorGeosByBiome, 'floor', false);
  mergeAndAdd(ceilGeosByBiome, 'ceiling', false);

  // ----------------------------------------------------------
  // BUILD DEDICATED STAIRCASES (steps + handrails + landing pads)
  // ----------------------------------------------------------
  const stairGeos = [];
  const railGeos = [];

  maze.stairs.forEach(st => {
    const numSteps = 14;
    const totalRise = st.topY - st.baseY;
    const stepH = totalRise / numSteps;
    const isAlongX = st.di !== 0;

    if (isAlongX) {
      const span = st.xMax - st.xMin;
      const stepRun = span / numSteps;
      const width = st.zMax - st.zMin;
      const cz = (st.zMin + st.zMax) / 2;

      for (let s = 0; s < numSteps; s++) {
        const t = (s + 0.5) / numSteps;
        const sx = st.di > 0 ? (st.xMin + t * span) : (st.xMax - t * span);
        const sy = st.baseY + (s + 1) * stepH;
        const g = new THREE.BoxGeometry(stepRun + 0.02, stepH * 1.15, width);
        g.translate(sx, sy - stepH * 0.55, cz);
        stairGeos.push(g);
      }

      // Side handrails
      for (const rz of [st.zMin + 0.04, st.zMax - 0.04]) {
        const slopeLen = Math.hypot(span, totalRise);
        const slopeAngle = Math.atan2(totalRise, span) * (st.di > 0 ? 1 : -1);
        const rail = new THREE.BoxGeometry(slopeLen, 0.06, 0.06);
        rail.rotateZ(slopeAngle);
        rail.translate((st.xMin + st.xMax) / 2, (st.baseY + st.topY) / 2 + 0.9, rz);
        railGeos.push(rail);
      }
    } else {
      const span = st.zMax - st.zMin;
      const stepRun = span / numSteps;
      const width = st.xMax - st.xMin;
      const cx = (st.xMin + st.xMax) / 2;

      for (let s = 0; s < numSteps; s++) {
        const t = (s + 0.5) / numSteps;
        const sz = st.dj > 0 ? (st.zMin + t * span) : (st.zMax - t * span);
        const sy = st.baseY + (s + 1) * stepH;
        const g = new THREE.BoxGeometry(width, stepH * 1.15, stepRun + 0.02);
        g.translate(cx, sy - stepH * 0.55, sz);
        stairGeos.push(g);
      }

      for (const rx of [st.xMin + 0.04, st.xMax - 0.04]) {
        const slopeLen = Math.hypot(span, totalRise);
        const slopeAngle = Math.atan2(totalRise, span) * (st.dj > 0 ? -1 : 1);
        const rail = new THREE.BoxGeometry(0.06, 0.06, slopeLen);
        rail.rotateX(slopeAngle);
        rail.translate(rx, (st.baseY + st.topY) / 2 + 0.9, (st.zMin + st.zMax) / 2);
        railGeos.push(rail);
      }
    }
  });

  if (stairGeos.length > 0) {
    const mergedStairs = mergeGeometries(stairGeos, false);
    stairGeos.forEach(g => g.dispose());
    if (mergedStairs) {
      const m = new THREE.Mesh(mergedStairs, _sharedStairMat);
      m.receiveShadow = true;
      m.castShadow = true;
      m.userData.isSharedModelAsset = true;
      state.scene.add(m);
    }
  }
  if (railGeos.length > 0) {
    const mergedRails = mergeGeometries(railGeos, false);
    railGeos.forEach(g => g.dispose());
    if (mergedRails) {
      const m = new THREE.Mesh(mergedRails, _sharedRailMat);
      m.userData.isSharedModelAsset = true;
      state.scene.add(m);
    }
  }

  // ----------------------------------------------------------
  // BUILD EXIT PORTAL PIT ON EXIT FLOOR
  // ----------------------------------------------------------
  const ex = maze.exit;
  const exitPitW = ex.halfW * 2;
  const exitPitH = ex.halfH * 2;
  const exitPit = new THREE.Mesh(
    new THREE.BoxGeometry(exitPitW, 4.0, exitPitH),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide })
  );
  exitPit.position.set(ex.x, ex.baseY - 2.0, ex.z);
  state.scene.add(exitPit);

  const exitPad = new THREE.Mesh(
    new THREE.PlaneGeometry(exitPitW * 0.85, exitPitH * 0.85),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  exitPad.rotation.x = -Math.PI / 2;
  exitPad.position.set(ex.x, ex.baseY - 3.9, ex.z);
  state.scene.add(exitPad);

  const pitLight = new THREE.PointLight(0xffffff, 8.0, 15.0, 1.0);
  pitLight.position.set(ex.x, ex.baseY + 0.6, ex.z);
  state.scene.add(pitLight);

  // ----------------------------------------------------------
  // FIXED PERMANENT POINTLIGHT POOL (zero WebGL shader recompiles)
  // ----------------------------------------------------------
  const bounceRange = maze.cellSize * 0.9 + 1.2;
  for (let i = 0; i < CONFIG.LIGHT_POOL_SIZE; i++) {
    const pLight = new THREE.PointLight(0xffffff, 0, 10.5, 1.2);
    pLight.position.set(0, WALL_H - 0.35, 0);
    pLight.castShadow = i < 3; // Top 3 nearest cast crisp shadows for 60 FPS
    if (pLight.castShadow) {
      pLight.shadow.camera.near = 0.08;
      pLight.shadow.camera.far = 14.0;
      pLight.shadow.bias = 0.0002;
      pLight.shadow.normalBias = 0.08;
      pLight.shadow.mapSize.width = 256;
      pLight.shadow.mapSize.height = 256;
      pLight.shadow.autoUpdate = false;
      pLight.shadow.needsUpdate = true; // Must be true on creation so shadow.map is initialized on frame 1
    }
    state.scene.add(pLight);

    const pLightBounce = new THREE.PointLight(0xffecc4, 0, bounceRange, 1.0);
    pLightBounce.position.set(0, WALL_H - 0.35, 0);
    pLightBounce.castShadow = false;
    state.scene.add(pLightBounce);

    state.lightPool.push({
      light: pLight,
      bounceLight: pLightBounce,
      assignedFixture: null
    });
  }

  // Build spooky wall pictures & furnish rooms
  buildSpookyWallPictures();
  if (state.furnitureLoaded) {
    furnishRooms();
  }

  updateDynamicLights(0, true);
}

export function buildSpookyWallPictures() {
  if (!state.mazeData || !state.scene) return;
  if (state.wallPicsBuiltForId === state.mazeBuildId) return;
  if (state.wallPicTextures.length === 0) return;
  state.wallPicsBuiltForId = state.mazeBuildId;

  const solidInnerWalls = state.mazeData.walls.filter(w => (w.type === 'horizontal' || w.type === 'vertical') && !w.hole);
  const shuffledWalls = [...solidInnerWalls].sort(() => Math.random() - 0.5);
  const numPics = Math.min(28, Math.max(12, Math.floor(solidInnerWalls.length * 0.03)));

  const selectedWalls = [];
  const minDistSq = 9.0 * 9.0;

  for (const wall of shuffledWalls) {
    let tooClose = false;
    for (const sel of selectedWalls) {
      if (sel.floor !== wall.floor) continue;
      const dx = wall.x - sel.x;
      const dz = wall.z - sel.z;
      if (dx * dx + dz * dz < minDistSq) { tooClose = true; break; }
    }
    if (!tooClose) selectedWalls.push(wall);
    if (selectedWalls.length >= numPics) break;
  }

  selectedWalls.forEach((wall, index) => {
    const texObj = state.wallPicTextures[index % state.wallPicTextures.length];
    if (!texObj || !texObj.texture) return;
    const texture = texObj.texture;
    const img = texture.image;
    const aspect = img ? (img.width / img.height) : 1.0;

    let finalHeight = 0.7 + Math.random() * 1.4;
    let finalWidth = finalHeight * aspect;
    const maxWidth = wall.length * 0.9;
    if (finalWidth > maxWidth) { finalWidth = maxWidth; finalHeight = finalWidth / aspect; }
    if (finalHeight > CONFIG.WALL_HEIGHT - 0.3) { finalHeight = CONFIG.WALL_HEIGHT - 0.3; finalWidth = finalHeight * aspect; }

    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide });
    const picMesh = new THREE.Mesh(new THREE.PlaneGeometry(finalWidth, finalHeight), mat);

    const minY = finalHeight / 2 + 0.15;
    const maxY = CONFIG.WALL_HEIGHT - finalHeight / 2 - 0.15;
    const y = (wall.baseY || 0) + minY + Math.random() * Math.max(0.05, maxY - minY);

    const isFront = Math.random() < 0.5;
    const isHoriz = wall.type === 'horizontal';
    const offsetDist = 0.21;
    let px = wall.x, pz = wall.z, rotY = 0;
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
      wall,
      floor: wall.floor || 0,
      audio: null,
      canPlaySound: Math.random() < 0.25,
      hasPlayedSound: false
    });
  });
}
