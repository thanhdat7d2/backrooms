import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state, CONFIG } from '../state.js';
import { loadTex } from '../systems/texture.js';

const gltfLoader = new GLTFLoader();

// Catalog of downloaded CC0 Poly Haven realistic 3D models
export const MODEL_CATALOG = {
  // Sofas
  sofa_01: { url: 'assets/models/Sofa_01/Sofa_01_1k.gltf', targetHeight: 0.90 },
  sofa_03: { url: 'assets/models/sofa_03/sofa_03_1k.gltf', targetHeight: 0.88 },

  // Chairs
  armchair_01: { url: 'assets/models/ArmChair_01/ArmChair_01_1k.gltf', targetHeight: 0.95 },
  wooden_chair: { url: 'assets/models/WoodenChair_01/WoodenChair_01_1k.gltf', targetHeight: 0.92 },

  // Tables
  coffee_table: { url: 'assets/models/CoffeeTable_01/CoffeeTable_01_1k.gltf', targetHeight: 0.48 },
  wooden_table: { url: 'assets/models/WoodenTable_01/WoodenTable_01_1k.gltf', targetHeight: 0.78 },
  side_table: { url: 'assets/models/side_table_01/side_table_01_1k.gltf', targetHeight: 0.62 },

  // Lamps
  desk_lamp: { url: 'assets/models/desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf', targetHeight: 0.55 },
  ceiling_lamp: { url: 'assets/models/modern_ceiling_lamp_01/modern_ceiling_lamp_01_1k.gltf', targetHeight: 0.35 },

  // Shelves
  shelf_01: { url: 'assets/models/Shelf_01/Shelf_01_1k.gltf', targetHeight: 1.85 },
  bookshelf_worn: { url: 'assets/models/wooden_bookshelf_worn/wooden_bookshelf_worn_1k.gltf', targetHeight: 1.95 },
  painted_shelves: { url: 'assets/models/painted_wooden_shelves/painted_wooden_shelves_1k.gltf', targetHeight: 1.80 },

  // TVs
  tv_01: { url: 'assets/models/Television_01/Television_01_1k.gltf', targetHeight: 0.55 },
  tv_02: { url: 'assets/models/television_02/television_02_1k.gltf', targetHeight: 0.52 },

  // Windows & Wall Decor
  window_01: { url: 'assets/models/rollershutter_window_01/rollershutter_window_01_1k.gltf', targetHeight: 1.45 },
  wall_clock: { url: 'assets/models/wall_clock/wall_clock_1k.gltf', targetHeight: 0.42 },
  ornate_mirror: { url: 'assets/models/ornate_mirror_01/ornate_mirror_01_1k.gltf', targetHeight: 1.15 }
};

function loadGLTFModel(key, def) {
  return new Promise((resolve) => {
    gltfLoader.load(
      def.url,
      (gltf) => {
        const root = gltf.scene;
        root.updateMatrixWorld(true);

        // Compute raw bounding box
        const rawBox = new THREE.Box3().setFromObject(root);
        const rawSize = new THREE.Vector3();
        const rawCenter = new THREE.Vector3();
        rawBox.getSize(rawSize);
        rawBox.getCenter(rawCenter);

        // Normalize scale so model height matches realistic targetHeight
        const scale = (rawSize.y > 0.001 && def.targetHeight) ? (def.targetHeight / rawSize.y) : 1.0;

        const wrapper = new THREE.Group();
        root.scale.setScalar(scale);
        // Center XZ and snap bottom to y = 0
        root.position.set(
          -rawCenter.x * scale,
          -rawBox.min.y * scale,
          -rawCenter.z * scale
        );

        root.traverse((child) => {
          child.userData.isSharedModelAsset = true;
          if (child.isMesh) {
            // Keep receiveShadow for realistic lighting, disable castShadow on high-poly furniture
            // so PointLight cube shadow maps stay fast and stutter-free
            child.castShadow = false;
            child.receiveShadow = true;
          }
        });

        wrapper.userData.isSharedModelAsset = true;
        wrapper.add(root);
        wrapper.updateMatrixWorld(true);

        const normBox = new THREE.Box3().setFromObject(wrapper);
        const normSize = new THREE.Vector3();
        normBox.getSize(normSize);

        resolve({ key, template: wrapper, size: normSize });
      },
      undefined,
      (err) => {
        console.warn(`Failed to load 3D model ${key} (${def.url}):`, err);
        resolve({ key, template: null, size: null });
      }
    );
  });
}

export function preloadFurnitureModels() {
  const modelPromises = Object.entries(MODEL_CATALOG).map(([key, def]) => loadGLTFModel(key, def));

  const carpetPromises = [
    loadTex('assets/images/carpet/dirty_carpet_diffuse.jpg').catch(() => null),
    loadTex('assets/images/carpet/dirty_carpet_nor_gl.jpg').catch(() => null),
    loadTex('assets/images/carpet/dirty_carpet_rough.jpg').catch(() => null)
  ];

  return Promise.all([
    Promise.all(modelPromises),
    Promise.all(carpetPromises)
  ]).then(([models, [diffuse, normal, rough]]) => {
    models.forEach(({ key, template, size }) => {
      if (template) {
        state.furnitureModels[key] = { template, size };
      }
    });

    if (diffuse) {
      if (normal) normal.colorSpace = THREE.NoColorSpace;
      if (rough) rough.colorSpace = THREE.NoColorSpace;
      state.carpetTextures = { diffuse, normal, rough };
    }
  });
}

function pickRandom(keys) {
  const available = keys.filter(k => state.furnitureModels[k]);
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function cloneModel(key) {
  const entry = state.furnitureModels[key];
  if (!entry) return null;
  const clone = entry.template.clone(true);
  clone.traverse((child) => {
    child.userData.isSharedModelAsset = true;
  });
  return { mesh: clone, size: entry.size.clone() };
}

function registerFurnitureCollider(box) {
  const maze = state.mazeData;
  if (!maze) return;

  const minCell = maze.worldToCell(box.xMin, box.zMin);
  const maxCell = maze.worldToCell(box.xMax, box.zMax);

  const colliderObj = { type: 'furniture', box };
  for (let i = minCell.cellI; i <= maxCell.cellI; i++) {
    for (let j = minCell.cellJ; j <= maxCell.cellJ; j++) {
      const key = `${i},${j}`;
      if (!state.gridColliders[key]) state.gridColliders[key] = [];
      state.gridColliders[key].push(colliderObj);
    }
  }
}

function boxesOverlapXZ(a, b, pad = 0.25) {
  return !(
    a.xMax + pad <= b.xMin ||
    a.xMin - pad >= b.xMax ||
    a.zMax + pad <= b.zMin ||
    a.zMin - pad >= b.zMax
  );
}

function getRotatedHalfExtents(size, rotY) {
  const c = Math.abs(Math.cos(rotY));
  const s = Math.abs(Math.sin(rotY));
  return {
    hx: (size.x * c + size.z * s) / 2,
    hz: (size.x * s + size.z * c) / 2
  };
}

function tryPlaceFloorItem(key, x, y, z, rotY, roomBounds, occupiedBoxes, parentGroup, addCollider = true, pad = 0.22) {
  const item = cloneModel(key);
  if (!item) return null;

  const { hx, hz } = getRotatedHalfExtents(item.size, rotY);
  const box = {
    xMin: x - hx,
    xMax: x + hx,
    yMin: y,
    yMax: y + item.size.y,
    zMin: z - hz,
    zMax: z + hz
  };

  // Must fit strictly inside room interior
  if (
    box.xMin < roomBounds.xMin ||
    box.xMax > roomBounds.xMax ||
    box.zMin < roomBounds.zMin ||
    box.zMax > roomBounds.zMax
  ) {
    return null;
  }

  // Must not overlap pillars, exit clearances, or other furniture
  for (const occ of occupiedBoxes) {
    if (boxesOverlapXZ(box, occ, pad)) {
      return null;
    }
  }

  item.mesh.position.set(x, y, z);
  item.mesh.rotation.y = rotY;
  parentGroup.add(item.mesh);

  occupiedBoxes.push(box);
  if (addCollider) {
    registerFurnitureCollider(box);
  }

  return { mesh: item.mesh, box, size: item.size };
}

function addRoomCarpet(room) {
  const margin = 0.42;
  const w = (room.xMax - room.xMin) - margin * 2;
  const d = (room.zMax - room.zMin) - margin * 2;
  if (w < 1.2 || d < 1.2) return;

  const cx = (room.xMin + room.xMax) / 2;
  const cz = (room.zMin + room.zMax) / 2;

  // Subtle muted backrooms carpet tint variations
  const tints = [0xd8ccb2, 0xc7b59b, 0xb8a38a, 0xcfc4ad, 0xa89b8c];
  const tint = tints[Math.floor(Math.random() * tints.length)];

  let mat;
  if (state.carpetTextures && state.carpetTextures.diffuse) {
    const diff = state.carpetTextures.diffuse.clone();
    diff.repeat.set(Math.max(1, w / 2.0), Math.max(1, d / 2.0));
    diff.needsUpdate = true;

    const opts = {
      map: diff,
      color: tint,
      roughness: 0.92,
      metalness: 0.0
    };

    if (state.carpetTextures.normal) {
      const nor = state.carpetTextures.normal.clone();
      nor.repeat.copy(diff.repeat);
      nor.needsUpdate = true;
      opts.normalMap = nor;
    }
    if (state.carpetTextures.rough) {
      const rgh = state.carpetTextures.rough.clone();
      rgh.repeat.copy(diff.repeat);
      rgh.needsUpdate = true;
      opts.roughnessMap = rgh;
    }

    mat = new THREE.MeshStandardMaterial(opts);
  } else {
    mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.95 });
  }

  const geom = new THREE.BoxGeometry(w, 0.018, d);
  const carpetMesh = new THREE.Mesh(geom, mat);
  carpetMesh.position.set(cx, 0.009, cz);
  carpetMesh.receiveShadow = true;
  state.scene.add(carpetMesh);
}

// Gather solid (non-exit) wall slots around a room perimeter
function getSolidWallSlots(room) {
  const maze = state.mazeData;
  const slots = [];
  const exitSet = new Set((room.exits || []).map(e => `${e.type},${e.i},${e.j}`));
  const wallHalfT = 0.21;

  // Top edge (z = room.zMin, facing +Z, rotY = 0)
  if (room.startJ > 0) {
    for (let i = room.startI; i < room.startI + room.rw; i++) {
      if (!exitSet.has(`h,${i},${room.startJ - 1}`) && maze.colWidths[i] >= 1.5) {
        slots.push({
          x: maze.cellCX(i),
          z: room.zMin + wallHalfT,
          rotY: 0,
          nx: 0,
          nz: 1,
          span: maze.colWidths[i]
        });
      }
    }
  }
  // Bottom edge (z = room.zMax, facing -Z, rotY = Math.PI)
  if (room.startJ + room.rh < maze.N) {
    for (let i = room.startI; i < room.startI + room.rw; i++) {
      if (!exitSet.has(`h,${i},${room.startJ + room.rh - 1}`) && maze.colWidths[i] >= 1.5) {
        slots.push({
          x: maze.cellCX(i),
          z: room.zMax - wallHalfT,
          rotY: Math.PI,
          nx: 0,
          nz: -1,
          span: maze.colWidths[i]
        });
      }
    }
  }
  // Left edge (x = room.xMin, facing +X, rotY = Math.PI / 2)
  if (room.startI > 0) {
    for (let j = room.startJ; j < room.startJ + room.rh; j++) {
      if (!exitSet.has(`v,${room.startI - 1},${j}`) && maze.rowHeights[j] >= 1.5) {
        slots.push({
          x: room.xMin + wallHalfT,
          z: maze.cellCZ(j),
          rotY: Math.PI / 2,
          nx: 1,
          nz: 0,
          span: maze.rowHeights[j]
        });
      }
    }
  }
  // Right edge (x = room.xMax, facing -X, rotY = -Math.PI / 2)
  if (room.startI + room.rw < maze.N) {
    for (let j = room.startJ; j < room.startJ + room.rh; j++) {
      if (!exitSet.has(`v,${room.startI + room.rw - 1},${j}`) && maze.rowHeights[j] >= 1.5) {
        slots.push({
          x: room.xMax - wallHalfT,
          z: maze.cellCZ(j),
          rotY: -Math.PI / 2,
          nx: -1,
          nz: 0,
          span: maze.rowHeights[j]
        });
      }
    }
  }

  // Shuffle slots
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

export function furnishRooms() {
  const maze = state.mazeData;
  if (!maze || !maze.rooms || maze.rooms.length === 0) return;
  if (state.furnitureBuiltForId === state.mazeBuildId) return;
  state.furnitureBuiltForId = state.mazeBuildId;

  const hasModels = Object.keys(state.furnitureModels).length > 0;

  maze.rooms.forEach((room) => {
    // 1. Carpet covering the room floor
    addRoomCarpet(room);

    if (!hasModels) return;

    const roomGroup = new THREE.Group();
    state.scene.add(roomGroup);
    const roomCX = (room.xMin + room.xMax) / 2;
    const roomCZ = (room.zMin + room.zMax) / 2;
    const roomRadius = Math.hypot(room.xMax - room.xMin, room.zMax - room.zMin) / 2;
    state.roomFurnitureGroups.push({ group: roomGroup, cx: roomCX, cz: roomCZ, radius: roomRadius });

    // Safe interior bounds (inset from room walls)
    const wallInset = 0.26;
    const roomBounds = {
      xMin: room.xMin + wallInset,
      xMax: room.xMax - wallInset,
      zMin: room.zMin + wallInset,
      zMax: room.zMax - wallInset
    };

    const occupiedBoxes = [];

    // Seed occupiedBoxes with pillars inside this room
    maze.pillars.forEach((p) => {
      if (
        p.gridI >= room.startI && p.gridI < room.startI + room.rw &&
        p.gridJ >= room.startJ && p.gridJ < room.startJ + room.rh
      ) {
        occupiedBoxes.push({
          xMin: p.x - p.w / 2 - 0.15,
          xMax: p.x + p.w / 2 + 0.15,
          zMin: p.z - p.l / 2 - 0.15,
          zMax: p.z + p.l / 2 + 0.15
        });
      }
    });

    // Seed occupiedBoxes with doorway clearance zones so exits are NEVER blocked
    (room.exits || []).forEach((ex) => {
      let exX, exZ;
      if (ex.type === 'h') {
        exX = maze.cellCX(ex.i);
        exZ = maze.rowZ[ex.j + 1];
      } else {
        exX = maze.colX[ex.i + 1];
        exZ = maze.cellCZ(ex.j);
      }
      occupiedBoxes.push({
        xMin: exX - 1.15,
        xMax: exX + 1.15,
        zMin: exZ - 1.15,
        zMax: exZ + 1.15
      });
    });

    const wallSlots = getSolidWallSlots(room);
    let slotIdx = 0;

    // 2. Mount Windows on 1-2 solid walls
    const numWindows = room.isVeryLarge ? 2 : 1;
    let placedWindows = 0;
    while (slotIdx < wallSlots.length && placedWindows < numWindows) {
      const slot = wallSlots[slotIdx++];
      if (slot.span < 1.8) continue;
      const winItem = cloneModel('window_01');
      if (!winItem) break;

      const depthOffset = winItem.size.z / 2 + 0.01;
      const wx = slot.x + slot.nx * depthOffset;
      const wz = slot.z + slot.nz * depthOffset;
      const wy = 1.05;

      winItem.mesh.position.set(wx, wy, wz);
      winItem.mesh.rotation.y = slot.rotY;
      roomGroup.add(winItem.mesh);

      // Subtle eerie liminal glow backing behind window panes
      const glowGeo = new THREE.PlaneGeometry(winItem.size.x * 0.85, winItem.size.y * 0.82);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xeef5ff,
        side: THREE.DoubleSide
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.position.set(
        slot.x + slot.nx * 0.015,
        wy + winItem.size.y / 2,
        slot.z + slot.nz * 0.015
      );
      glowMesh.rotation.y = slot.rotY;
      roomGroup.add(glowMesh);

      placedWindows++;
    }

    // 3. Place Shelves / Bookcases against solid walls
    const numShelves = room.isVeryLarge ? 3 : 2;
    let placedShelves = 0;
    while (slotIdx < wallSlots.length && placedShelves < numShelves) {
      const slot = wallSlots[slotIdx++];
      const shelfKey = pickRandom(['shelf_01', 'bookshelf_worn', 'painted_shelves']);
      if (!shelfKey) break;
      const shelfSize = state.furnitureModels[shelfKey].size;
      const depth = Math.min(shelfSize.x, shelfSize.z);
      const sx = slot.x + slot.nx * (depth / 2 + 0.08);
      const sz = slot.z + slot.nz * (depth / 2 + 0.08);
      if (tryPlaceFloorItem(shelfKey, sx, 0, sz, slot.rotY, roomBounds, occupiedBoxes, roomGroup, true, 0.2)) {
        placedShelves++;
      }
    }

    // 4. Wall Decor (Clock or Ornate Mirror) on remaining solid wall slots
    if (slotIdx < wallSlots.length) {
      const slot = wallSlots[slotIdx++];
      const decorKey = pickRandom(['wall_clock', 'ornate_mirror']);
      if (decorKey) {
        const decor = cloneModel(decorKey);
        if (decor) {
          const offset = decor.size.z / 2 + 0.02;
          decor.mesh.position.set(
            slot.x + slot.nx * offset,
            decorKey === 'wall_clock' ? 2.15 : 1.15,
            slot.z + slot.nz * offset
          );
          decor.mesh.rotation.y = slot.rotY;
          roomGroup.add(decor.mesh);
        }
      }
    }

    // 5. Ceiling Lamp inside the room
    const ceilLamp = cloneModel('ceiling_lamp');
    if (ceilLamp) {
      ceilLamp.mesh.position.set(roomCX, CONFIG.WALL_HEIGHT - ceilLamp.size.y, roomCZ);
      roomGroup.add(ceilLamp.mesh);
    }

    // 6. Living Room Cluster: Sofa + Coffee Table + TV on Table + Side Table with Desk Lamp + Armchair
    const loungeRot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(Math.random() * 4)];
    const fwdX = Math.sin(loungeRot);
    const fwdZ = Math.cos(loungeRot);
    const rightX = Math.cos(loungeRot);
    const rightZ = -Math.sin(loungeRot);

    // Place Sofa slightly behind room center
    const sofaKey = pickRandom(['sofa_01', 'sofa_03']);
    let sofaPlaced = null;
    if (sofaKey) {
      sofaPlaced = tryPlaceFloorItem(
        sofaKey,
        roomCX - fwdX * 1.15,
        0,
        roomCZ - fwdZ * 1.15,
        loungeRot,
        roomBounds,
        occupiedBoxes,
        roomGroup
      ) || tryPlaceFloorItem(
        sofaKey,
        roomCX,
        0,
        roomCZ,
        loungeRot,
        roomBounds,
        occupiedBoxes,
        roomGroup
      );
    }

    // Coffee Table in front of sofa
    const baseAnchorX = sofaPlaced ? (sofaPlaced.box.xMin + sofaPlaced.box.xMax) / 2 : roomCX;
    const baseAnchorZ = sofaPlaced ? (sofaPlaced.box.zMin + sofaPlaced.box.zMax) / 2 : roomCZ;

    tryPlaceFloorItem(
      'coffee_table',
      baseAnchorX + fwdX * 1.35,
      0,
      baseAnchorZ + fwdZ * 1.35,
      loungeRot,
      roomBounds,
      occupiedBoxes,
      roomGroup
    );

    // TV Stand (Wooden Table) + TV on top facing the sofa
    const tvTable = tryPlaceFloorItem(
      'wooden_table',
      baseAnchorX + fwdX * 2.65,
      0,
      baseAnchorZ + fwdZ * 2.65,
      loungeRot + Math.PI,
      roomBounds,
      occupiedBoxes,
      roomGroup
    );

    if (tvTable) {
      const tvKey = pickRandom(['tv_01', 'tv_02']);
      if (tvKey) {
        const tvItem = cloneModel(tvKey);
        if (tvItem) {
          const tx = (tvTable.box.xMin + tvTable.box.xMax) / 2;
          const tz = (tvTable.box.zMin + tvTable.box.zMax) / 2;
          tvItem.mesh.position.set(tx, tvTable.box.yMax - 0.01, tz);
          tvItem.mesh.rotation.y = loungeRot + Math.PI;
          roomGroup.add(tvItem.mesh);
        }
      }
    }

    // Side Table + Desk Lamp next to the sofa
    const sideTable = tryPlaceFloorItem(
      'side_table',
      baseAnchorX + rightX * 1.65,
      0,
      baseAnchorZ + rightZ * 1.65,
      loungeRot,
      roomBounds,
      occupiedBoxes,
      roomGroup
    ) || tryPlaceFloorItem(
      'side_table',
      baseAnchorX - rightX * 1.65,
      0,
      baseAnchorZ - rightZ * 1.65,
      loungeRot,
      roomBounds,
      occupiedBoxes,
      roomGroup
    );

    if (sideTable) {
      const lampItem = cloneModel('desk_lamp');
      if (lampItem) {
        const lx = (sideTable.box.xMin + sideTable.box.xMax) / 2;
        const lz = (sideTable.box.zMin + sideTable.box.zMax) / 2;
        lampItem.mesh.position.set(lx, sideTable.box.yMax - 0.01, lz);
        lampItem.mesh.rotation.y = Math.random() * Math.PI * 2;
        roomGroup.add(lampItem.mesh);
      }
    }

    // Armchair / Chairs scattered around the lounge
    const chairOffsets = [
      { f: 1.1, r: 1.65, rot: loungeRot - Math.PI / 2 },
      { f: 1.1, r: -1.65, rot: loungeRot + Math.PI / 2 },
      { f: -1.2, r: -1.8, rot: loungeRot + Math.PI / 4 }
    ];
    chairOffsets.forEach(({ f, r, rot }) => {
      const chairKey = pickRandom(['armchair_01', 'wooden_chair']);
      if (chairKey) {
        tryPlaceFloorItem(
          chairKey,
          baseAnchorX + fwdX * f + rightX * r,
          0,
          baseAnchorZ + fwdZ * f + rightZ * r,
          rot,
          roomBounds,
          occupiedBoxes,
          roomGroup
        );
      }
    });

    // 7. Extra furniture in very large rooms (a second table + chairs + lamp)
    if (room.isVeryLarge) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const rx = roomBounds.xMin + 1.2 + Math.random() * Math.max(0.1, (roomBounds.xMax - roomBounds.xMin) - 2.4);
        const rz = roomBounds.zMin + 1.2 + Math.random() * Math.max(0.1, (roomBounds.zMax - roomBounds.zMin) - 2.4);
        const rot = Math.floor(Math.random() * 4) * (Math.PI / 2);
        const extraTable = tryPlaceFloorItem('wooden_table', rx, 0, rz, rot, roomBounds, occupiedBoxes, roomGroup);
        if (extraTable) {
          const lamp = cloneModel('desk_lamp');
          if (lamp) {
            lamp.mesh.position.set(rx, extraTable.box.yMax - 0.01, rz);
            lamp.mesh.rotation.y = Math.random() * Math.PI * 2;
            roomGroup.add(lamp.mesh);
          }
          tryPlaceFloorItem('wooden_chair', rx + 0.95, 0, rz, -Math.PI / 2, roomBounds, occupiedBoxes, roomGroup);
          tryPlaceFloorItem('wooden_chair', rx - 0.95, 0, rz, Math.PI / 2, roomBounds, occupiedBoxes, roomGroup);
          break;
        }
      }
    }
  });

  updateFurnitureVisibility(true);
}

// Hide distant room furniture groups beyond fog distance to keep FPS high
export function updateFurnitureVisibility(force = false) {
  if (!state.roomFurnitureGroups || state.roomFurnitureGroups.length === 0 || !state.controls) return;

  const playerPos = state.controls.object.position;
  if (!force && playerPos.distanceToSquared(state.lastFurnitureCullPos) < 2.25) {
    return; // Only re-check when player moves > 1.5m
  }
  state.lastFurnitureCullPos.copy(playerPos);

  const px = playerPos.x;
  const pz = playerPos.z;
  const maxViewDist = 26.0; // Beyond dark fog visibility

  for (let i = 0; i < state.roomFurnitureGroups.length; i++) {
    const entry = state.roomFurnitureGroups[i];
    const dx = entry.cx - px;
    const dz = entry.cz - pz;
    const threshold = maxViewDist + entry.radius;
    entry.group.visible = (dx * dx + dz * dz) <= (threshold * threshold);
  }
}
