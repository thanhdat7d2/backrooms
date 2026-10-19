import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state, CONFIG } from '../state.js';
import { loadTex } from '../systems/texture.js';
import {
  createHidingCloset,
  createHospitalBed,
  createIVStand,
  createOfficeDesk,
  createFilingCabinet,
  createSchoolDesk,
  createChalkboard,
  createWoodenCrate,
  createIndustrialBarrel,
  createParkedCar,
  createTree,
  createDesertCactus,
  createPoolProp,
  createPagodaLantern,
  createKindergartenBlocks,
  createRuralHayBale,
  createFloorLamp,
  applySurrealTransform
} from './props.js';

const gltfLoader = new GLTFLoader();

export const MODEL_CATALOG = {
  sofa_01: { url: 'assets/models/Sofa_01/Sofa_01_1k.gltf', targetHeight: 0.90 },
  sofa_03: { url: 'assets/models/sofa_03/sofa_03_1k.gltf', targetHeight: 0.88 },
  armchair_01: { url: 'assets/models/ArmChair_01/ArmChair_01_1k.gltf', targetHeight: 0.95 },
  wooden_chair: { url: 'assets/models/WoodenChair_01/WoodenChair_01_1k.gltf', targetHeight: 0.92 },
  coffee_table: { url: 'assets/models/CoffeeTable_01/CoffeeTable_01_1k.gltf', targetHeight: 0.48 },
  wooden_table: { url: 'assets/models/WoodenTable_01/WoodenTable_01_1k.gltf', targetHeight: 0.78 },
  side_table: { url: 'assets/models/side_table_01/side_table_01_1k.gltf', targetHeight: 0.62 },
  desk_lamp: { url: 'assets/models/desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf', targetHeight: 0.55 },
  ceiling_lamp: { url: 'assets/models/modern_ceiling_lamp_01/modern_ceiling_lamp_01_1k.gltf', targetHeight: 0.35 },
  shelf_01: { url: 'assets/models/Shelf_01/Shelf_01_1k.gltf', targetHeight: 1.85 },
  bookshelf_worn: { url: 'assets/models/wooden_bookshelf_worn/wooden_bookshelf_worn_1k.gltf', targetHeight: 1.95 },
  painted_shelves: { url: 'assets/models/painted_wooden_shelves/painted_wooden_shelves_1k.gltf', targetHeight: 1.80 },
  tv_01: { url: 'assets/models/Television_01/Television_01_1k.gltf', targetHeight: 0.55 },
  tv_02: { url: 'assets/models/television_02/television_02_1k.gltf', targetHeight: 0.52 },
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
        const rawBox = new THREE.Box3().setFromObject(root);
        const rawSize = new THREE.Vector3();
        const rawCenter = new THREE.Vector3();
        rawBox.getSize(rawSize);
        rawBox.getCenter(rawCenter);

        const scale = (rawSize.y > 0.001 && def.targetHeight) ? (def.targetHeight / rawSize.y) : 1.0;
        const wrapper = new THREE.Group();
        root.scale.setScalar(scale);
        root.position.set(-rawCenter.x * scale, -rawBox.min.y * scale, -rawCenter.z * scale);
        root.traverse((child) => {
          child.userData.isSharedModelAsset = true;
          if (child.isMesh) {
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
      () => resolve({ key, template: null, size: null })
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

  return Promise.all([Promise.all(modelPromises), Promise.all(carpetPromises)]).then(([models, [diffuse, normal, rough]]) => {
    models.forEach(({ key, template, size }) => {
      if (template) state.furnitureModels[key] = { template, size };
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
  clone.traverse((child) => { child.userData.isSharedModelAsset = true; });
  return { mesh: clone, size: entry.size.clone() };
}

function registerFurnitureCollider(floor, box, isTable = false) {
  const maze = state.mazeData;
  if (!maze) return;
  const minCell = maze.worldToCell(box.xMin, box.zMin);
  const maxCell = maze.worldToCell(box.xMax, box.zMax);
  const colliderObj = { type: isTable ? 'table' : 'furniture', box };
  for (let i = minCell.cellI; i <= maxCell.cellI; i++) {
    for (let j = minCell.cellJ; j <= maxCell.cellJ; j++) {
      const key = `${floor},${i},${j}`;
      if (!state.gridColliders[key]) state.gridColliders[key] = [];
      state.gridColliders[key].push(colliderObj);
    }
  }
}

function boxesOverlapXZ(a, b, pad = 0.22) {
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

function placeItem(item, x, baseY, z, rotY, floor, roomBounds, occupiedBoxes, parentGroup, opts = {}) {
  if (!item) return null;
  const { addCollider = true, pad = 0.20, allowSurreal = true, surrealChance = 0.16 } = opts;

  const { hx, hz } = getRotatedHalfExtents(item.size, rotY);
  const box = {
    xMin: x - hx,
    xMax: x + hx,
    yMin: baseY,
    yMax: baseY + item.size.y,
    zMin: z - hz,
    zMax: z + hz
  };

  if (roomBounds) {
    if (box.xMin < roomBounds.xMin || box.xMax > roomBounds.xMax || box.zMin < roomBounds.zMin || box.zMax > roomBounds.zMax) {
      return null;
    }
  }

  for (const occ of occupiedBoxes) {
    if (boxesOverlapXZ(box, occ, pad)) return null;
  }

  item.mesh.position.set(x, baseY, z);
  item.mesh.rotation.y = rotY;
  parentGroup.add(item.mesh);

  // Surreal Liminal Placement (floating, tilted, upside-down, wall-mounted, giant/tiny)
  let surrealMode = null;
  if (allowSurreal && !item.isHidingSpot && Math.random() < surrealChance) {
    surrealMode = applySurrealTransform(item.mesh, item.size, baseY, CONFIG.WALL_HEIGHT);
  }

  occupiedBoxes.push(box);

  // Register hiding spot for walk-in closets or hollow tables/beds
  if (item.isHidingSpot && !surrealMode) {
    state.hidingSpots.push({
      type: item.hideType || 'table',
      floor,
      xMin: box.xMin,
      xMax: box.xMax,
      yMin: baseY,
      yMax: baseY + item.size.y,
      zMin: box.zMin,
      zMax: box.zMax
    });
  }

  // Only register floor collider if it wasn't floated up to the ceiling; closets are walkable inside!
  if (addCollider && item.hideType !== 'closet' && surrealMode !== 'floating' && surrealMode !== 'upside_down' && surrealMode !== 'wall_mounted') {
    const colliderBox = (item.hideType === 'table')
      ? { ...box, yMin: baseY + 0.65 } // Leave underneath open so player can crouch under tables/beds!
      : box;
    registerFurnitureCollider(floor, colliderBox, item.hideType === 'table');
  }

  return { mesh: item.mesh, box, size: item.size, surrealMode };
}

function tryPlaceGLTF(key, x, baseY, z, rotY, floor, roomBounds, occupiedBoxes, parentGroup, opts = {}) {
  const item = cloneModel(key);
  if (!item) return null;
  if (key === 'wooden_table' || key === 'coffee_table') {
    item.isHidingSpot = true;
    item.hideType = 'table';
  }
  return placeItem(item, x, baseY, z, rotY, floor, roomBounds, occupiedBoxes, parentGroup, opts);
}

let sharedCarpetMaterials = null;
function getSharedCarpetMaterial() {
  if (!sharedCarpetMaterials) {
    const tints = [0xd8ccb2, 0xc7b59b, 0xb8a38a];
    sharedCarpetMaterials = tints.map((tint) => {
      if (state.carpetTextures && state.carpetTextures.diffuse) {
        const opts = { map: state.carpetTextures.diffuse, color: tint, roughness: 0.92 };
        if (state.carpetTextures.normal) opts.normalMap = state.carpetTextures.normal;
        if (state.carpetTextures.rough) opts.roughnessMap = state.carpetTextures.rough;
        return new THREE.MeshStandardMaterial(opts);
      }
      return new THREE.MeshStandardMaterial({ color: tint, roughness: 0.95 });
    });
  }
  return sharedCarpetMaterials[Math.floor(Math.random() * sharedCarpetMaterials.length)];
}

function addRoomCarpet(room, parentGroup) {
  const margin = 0.45;
  const w = (room.xMax - room.xMin) - margin * 2;
  const d = (room.zMax - room.zMin) - margin * 2;
  if (w < 1.2 || d < 1.2) return;
  const cx = (room.xMin + room.xMax) / 2;
  const cz = (room.zMin + room.zMax) / 2;

  const geom = new THREE.BoxGeometry(w, 0.018, d);
  const uv = geom.attributes.uv;
  if (uv) {
    const scaleU = Math.max(1, w / 2.0);
    const scaleV = Math.max(1, d / 2.0);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * scaleU, uv.getY(i) * scaleV);
  }
  const carpetMesh = new THREE.Mesh(geom, getSharedCarpetMaterial());
  carpetMesh.userData.isSharedModelAsset = true;
  carpetMesh.position.set(cx, room.baseY + 0.01, cz);
  carpetMesh.receiveShadow = true;
  parentGroup.add(carpetMesh);
}

function getSolidWallSlots(room) {
  const maze = state.mazeData;
  const slots = [];
  const blocked = new Set([
    ...(room.exits || []).map(e => `${e.type},${e.i},${e.j}`),
    ...(room.windowWalls || []).map(w => `${w.type},${w.i},${w.j}`)
  ]);
  const wallHalfT = 0.22;

  if (room.startJ > 0) {
    for (let i = room.startI; i < room.startI + room.rw; i++) {
      if (!blocked.has(`h,${i},${room.startJ - 1}`) && maze.colWidths[i] >= 1.5) {
        slots.push({ x: maze.cellCX(i), z: room.zMin + wallHalfT, rotY: 0, nx: 0, nz: 1, span: maze.colWidths[i] });
      }
    }
  }
  if (room.startJ + room.rh < maze.N) {
    for (let i = room.startI; i < room.startI + room.rw; i++) {
      if (!blocked.has(`h,${i},${room.startJ + room.rh - 1}`) && maze.colWidths[i] >= 1.5) {
        slots.push({ x: maze.cellCX(i), z: room.zMax - wallHalfT, rotY: Math.PI, nx: 0, nz: -1, span: maze.colWidths[i] });
      }
    }
  }
  if (room.startI > 0) {
    for (let j = room.startJ; j < room.startJ + room.rh; j++) {
      if (!blocked.has(`v,${room.startI - 1},${j}`) && maze.rowHeights[j] >= 1.5) {
        slots.push({ x: room.xMin + wallHalfT, z: maze.cellCZ(j), rotY: Math.PI / 2, nx: 1, nz: 0, span: maze.rowHeights[j] });
      }
    }
  }
  if (room.startI + room.rw < maze.N) {
    for (let j = room.startJ; j < room.startJ + room.rh; j++) {
      if (!blocked.has(`v,${room.startI + room.rw - 1},${j}`) && maze.rowHeights[j] >= 1.5) {
        slots.push({ x: room.xMax - wallHalfT, z: maze.cellCZ(j), rotY: -Math.PI / 2, nx: -1, nz: 0, span: maze.rowHeights[j] });
      }
    }
  }

  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

function registerLampLight(x, y, z, floor, color = 0xffcc77) {
  const cell = state.mazeData.worldToCell(x, z);
  state.lightObjects.push({
    x, y, z, floor,
    cellI: cell.cellI,
    cellJ: cell.cellJ,
    color,
    intensity: 2.6,
    range: 8.0,
    flicker: Math.random() < 0.25,
    flickerPhase: Math.random() * 100,
    dist: Infinity,
    poolSlot: -1
  });
}

export function furnishRooms() {
  const maze = state.mazeData;
  if (!maze) return;
  if (state.furnitureBuiltForId === state.mazeBuildId) return;
  state.furnitureBuiltForId = state.mazeBuildId;

  const hasGLTF = Object.keys(state.furnitureModels).length > 0;

  // ----------------------------------------------------------
  // 1. FURNISH STRUCTURED ROOMS BY ARCHETYPE
  // ----------------------------------------------------------
  maze.rooms.forEach((room) => {
    const f = room.floor;
    const baseY = room.baseY;
    const roomGroup = new THREE.Group();
    state.scene.add(roomGroup);

    const roomCX = (room.xMin + room.xMax) / 2;
    const roomCZ = (room.zMin + room.zMax) / 2;
    const roomW = room.xMax - room.xMin;
    const roomD = room.zMax - room.zMin;
    const roomRadius = Math.hypot(roomW, roomD) / 2;

    state.roomFurnitureGroups.push({ group: roomGroup, cx: roomCX, cz: roomCZ, baseY, radius: roomRadius });

    const wallInset = 0.28;
    const roomBounds = {
      xMin: room.xMin + wallInset,
      xMax: room.xMax - wallInset,
      zMin: room.zMin + wallInset,
      zMax: room.zMax - wallInset
    };

    const occupiedBoxes = [];

    // Seed pillars & floor holes inside room
    const floorData = maze.floors[f];
    floorData.pillars.forEach(p => {
      if (p.gridI >= room.startI && p.gridI < room.startI + room.rw && p.gridJ >= room.startJ && p.gridJ < room.startJ + room.rh) {
        occupiedBoxes.push({ xMin: p.x - p.w / 2 - 0.18, xMax: p.x + p.w / 2 + 0.18, zMin: p.z - p.l / 2 - 0.18, zMax: p.z + p.l / 2 + 0.18 });
      }
    });
    floorData.floorHoles.forEach(h => {
      if (h.i >= room.startI && h.i < room.startI + room.rw && h.j >= room.startJ && h.j < room.startJ + room.rh) {
        occupiedBoxes.push({ xMin: h.xMin - 0.25, xMax: h.xMax + 0.25, zMin: h.zMin - 0.25, zMax: h.zMax + 0.25 });
      }
    });

    // Exit doorway clearance
    (room.exits || []).forEach(ex => {
      const exX = ex.type === 'h' ? maze.cellCX(ex.i) : maze.colX[ex.i + 1];
      const exZ = ex.type === 'h' ? maze.rowZ[ex.j + 1] : maze.cellCZ(ex.j);
      occupiedBoxes.push({ xMin: exX - 1.2, xMax: exX + 1.2, zMin: exZ - 1.2, zMax: exZ + 1.2 });
    });

    const wallSlots = getSolidWallSlots(room);
    let slotIdx = 0;

    // Place a walk-in Hiding Closet against a solid wall in ~65% of rooms
    if (slotIdx < wallSlots.length && Math.random() < 0.65) {
      const slot = wallSlots[slotIdx++];
      const closet = createHidingCloset();
      const cx = slot.x + slot.nx * (closet.size.z / 2 + 0.08);
      const cz = slot.z + slot.nz * (closet.size.z / 2 + 0.08);
      placeItem(closet, cx, baseY, cz, slot.rotY, f, roomBounds, occupiedBoxes, roomGroup, { allowSurreal: false, pad: 0.15 });
    }

    // Wall clock or mirror
    if (hasGLTF && slotIdx < wallSlots.length) {
      const slot = wallSlots[slotIdx++];
      const decorKey = pickRandom(['wall_clock', 'ornate_mirror']);
      if (decorKey) {
        const decor = cloneModel(decorKey);
        if (decor) {
          decor.mesh.position.set(slot.x + slot.nx * (decor.size.z / 2 + 0.02), baseY + (decorKey === 'wall_clock' ? 2.15 : 1.15), slot.z + slot.nz * (decor.size.z / 2 + 0.02));
          decor.mesh.rotation.y = slot.rotY;
          roomGroup.add(decor.mesh);
        }
      }
    }

    // Ceiling lamp
    if (hasGLTF) {
      const ceilLamp = cloneModel('ceiling_lamp');
      if (ceilLamp) {
        ceilLamp.mesh.position.set(roomCX, baseY + CONFIG.WALL_HEIGHT - ceilLamp.size.y, roomCZ);
        roomGroup.add(ceilLamp.mesh);
      }
    }

    // --- ARCHETYPE-SPECIFIC LAYOUTS ---
    switch (room.archetype) {
      case 'living_room': {
        addRoomCarpet(room, roomGroup);
        // Bookshelves along walls
        while (slotIdx < wallSlots.length && slotIdx < 4 && hasGLTF) {
          const slot = wallSlots[slotIdx++];
          const k = pickRandom(['shelf_01', 'bookshelf_worn', 'painted_shelves']);
          if (k) {
            const sz = state.furnitureModels[k].size;
            const depth = Math.min(sz.x, sz.z);
            tryPlaceGLTF(k, slot.x + slot.nx * (depth / 2 + 0.08), baseY, slot.z + slot.nz * (depth / 2 + 0.08), slot.rotY, f, roomBounds, occupiedBoxes, roomGroup);
          }
        }
        const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][Math.floor(Math.random() * 4)];
        const fwdX = Math.sin(rot), fwdZ = Math.cos(rot), rightX = Math.cos(rot), rightZ = -Math.sin(rot);
        if (hasGLTF) {
          const sofa = tryPlaceGLTF(pickRandom(['sofa_01', 'sofa_03']), roomCX - fwdX * 1.1, baseY, roomCZ - fwdZ * 1.1, rot, f, roomBounds, occupiedBoxes, roomGroup);
          const ax = sofa ? (sofa.box.xMin + sofa.box.xMax) / 2 : roomCX;
          const az = sofa ? (sofa.box.zMin + sofa.box.zMax) / 2 : roomCZ;
          tryPlaceGLTF('coffee_table', ax + fwdX * 1.35, baseY, az + fwdZ * 1.35, rot, f, roomBounds, occupiedBoxes, roomGroup);
          const tvT = tryPlaceGLTF('wooden_table', ax + fwdX * 2.55, baseY, az + fwdZ * 2.55, rot + Math.PI, f, roomBounds, occupiedBoxes, roomGroup);
          if (tvT && !tvT.surrealMode) {
            const tv = cloneModel(pickRandom(['tv_01', 'tv_02']));
            if (tv) {
              tv.mesh.position.set((tvT.box.xMin + tvT.box.xMax) / 2, tvT.box.yMax - 0.01, (tvT.box.zMin + tvT.box.zMax) / 2);
              tv.mesh.rotation.y = rot + Math.PI;
              roomGroup.add(tv.mesh);
            }
          }
          tryPlaceGLTF(pickRandom(['armchair_01', 'wooden_chair']), ax + rightX * 1.6, baseY, az + rightZ * 1.6, rot - Math.PI / 2, f, roomBounds, occupiedBoxes, roomGroup);
        }
        // Floor lamp with functional warm light
        const fl = createFloorLamp();
        const placedLamp = placeItem(fl, roomCX + 1.5, baseY, roomCZ - 1.2, 0, f, roomBounds, occupiedBoxes, roomGroup, { allowSurreal: false });
        if (placedLamp) registerLampLight(roomCX + 1.5, baseY + 1.6, roomCZ - 1.2, f, 0xffd288);
        break;
      }

      case 'office': {
        // Filing cabinets along walls
        while (slotIdx < wallSlots.length && slotIdx < 4) {
          const slot = wallSlots[slotIdx++];
          const cab = createFilingCabinet();
          placeItem(cab, slot.x + slot.nx * 0.4, baseY, slot.z + slot.nz * 0.4, slot.rotY, f, roomBounds, occupiedBoxes, roomGroup);
        }
        // Grid of office desks + chairs
        const stepX = 2.4, stepZ = 2.2;
        for (let x = roomBounds.xMin + 1.1; x < roomBounds.xMax - 1.0; x += stepX) {
          for (let z = roomBounds.zMin + 1.0; z < roomBounds.zMax - 1.0; z += stepZ) {
            const desk = placeItem(createOfficeDesk(), x, baseY, z, 0, f, roomBounds, occupiedBoxes, roomGroup);
            if (desk && hasGLTF) {
              tryPlaceGLTF('wooden_chair', x, baseY, z + 0.85, Math.PI, f, roomBounds, occupiedBoxes, roomGroup, { pad: 0.05 });
            }
          }
        }
        break;
      }

      case 'hospital_ward': {
        // Rows of hospital beds + IV drip stands
        const stepX = 2.5, stepZ = 3.2;
        for (let x = roomBounds.xMin + 1.1; x < roomBounds.xMax - 1.0; x += stepX) {
          for (let z = roomBounds.zMin + 1.4; z < roomBounds.zMax - 1.3; z += stepZ) {
            const bed = placeItem(createHospitalBed(), x, baseY, z, 0, f, roomBounds, occupiedBoxes, roomGroup);
            if (bed) {
              placeItem(createIVStand(), x + 0.85, baseY, z - 0.65, 0, f, roomBounds, occupiedBoxes, roomGroup, { pad: 0.05 });
            }
          }
        }
        break;
      }

      case 'classroom': {
        // Chalkboard on a front wall
        if (slotIdx < wallSlots.length) {
          const slot = wallSlots[slotIdx++];
          const board = createChalkboard();
          board.mesh.position.set(slot.x + slot.nx * 0.06, baseY + 1.55, slot.z + slot.nz * 0.06);
          board.mesh.rotation.y = slot.rotY;
          roomGroup.add(board.mesh);
        }
        // Neat rows of student desks
        const stepX = 1.65, stepZ = 1.85;
        for (let x = roomBounds.xMin + 0.9; x < roomBounds.xMax - 0.9; x += stepX) {
          for (let z = roomBounds.zMin + 1.0; z < roomBounds.zMax - 1.0; z += stepZ) {
            placeItem(createSchoolDesk(), x, baseY, z, 0, f, roomBounds, occupiedBoxes, roomGroup, { pad: 0.14 });
          }
        }
        break;
      }

      case 'storage': {
        // Shelves against walls + crates & barrels scattered densely
        while (slotIdx < wallSlots.length && hasGLTF) {
          const slot = wallSlots[slotIdx++];
          const k = pickRandom(['shelf_01', 'bookshelf_worn']);
          if (k) {
            const sz = state.furnitureModels[k].size;
            const depth = Math.min(sz.x, sz.z);
            tryPlaceGLTF(k, slot.x + slot.nx * (depth / 2 + 0.08), baseY, slot.z + slot.nz * (depth / 2 + 0.08), slot.rotY, f, roomBounds, occupiedBoxes, roomGroup);
          }
        }
        for (let att = 0; att < 14; att++) {
          const rx = roomBounds.xMin + 0.6 + Math.random() * Math.max(0.2, roomW - 1.8);
          const rz = roomBounds.zMin + 0.6 + Math.random() * Math.max(0.2, roomD - 1.8);
          const prop = Math.random() < 0.55 ? createWoodenCrate() : createIndustrialBarrel();
          placeItem(prop, rx, baseY, rz, Math.random() * Math.PI * 2, f, roomBounds, occupiedBoxes, roomGroup, { pad: 0.12 });
        }
        break;
      }

      case 'car_garage': {
        // Large car garage: 2-3 realistic 3D parked cars + oil barrels + crates + workbenches
        const carRot = roomW >= roomD ? Math.PI / 2 : 0;
        const offsets = roomW >= roomD
          ? [{ dx: -2.2, dz: -1.8 }, { dx: -2.2, dz: 1.8 }, { dx: 2.5, dz: 0 }]
          : [{ dx: -1.8, dz: -2.2 }, { dx: 1.8, dz: -2.2 }, { dx: 0, dz: 2.5 }];
        offsets.forEach(({ dx, dz }) => {
          placeItem(createParkedCar(), roomCX + dx, baseY, roomCZ + dz, carRot, f, roomBounds, occupiedBoxes, roomGroup, { pad: 0.35, surrealChance: 0.12 });
        });
        for (let b = 0; b < 6; b++) {
          const rx = roomBounds.xMin + 0.7 + Math.random() * Math.max(0.2, roomW - 2.0);
          const rz = roomBounds.zMin + 0.7 + Math.random() * Math.max(0.2, roomD - 2.0);
          placeItem(b % 2 === 0 ? createIndustrialBarrel() : createWoodenCrate(), rx, baseY, rz, Math.random() * Math.PI, f, roomBounds, occupiedBoxes, roomGroup, { pad: 0.15 });
        }
        break;
      }
    }
  });

  // ----------------------------------------------------------
  // 2. BIOME-SPECIFIC CORRIDOR PROPS & SCATTERED HIDING CLOSETS
  // ----------------------------------------------------------
  maze.floors.forEach(floorData => {
    const f = floorData.floor;
    const baseY = floorData.baseY;
    const biomeGroup = new THREE.Group();
    state.scene.add(biomeGroup);
    const occupied = [];

    for (let i = 1; i < maze.N - 1; i++) {
      for (let j = 1; j < maze.N - 1; j++) {
        if (Math.random() > 0.11) continue; // ~11% of cells get a biome prop or surreal item
        if (maze.colWidths[i] < 2.2 || maze.rowHeights[j] < 2.2) continue;
        if (maze.mergedCellLookup[f][i][j]) continue;
        if (state.floorHoles[`${f},${i},${j}`]) continue;
        if (maze.stairs.some(st => (st.fromFloor === f || st.toFloor === f) && ((st.i1 === i && st.j1 === j) || (st.i2 === i && st.j2 === j)))) continue;
        if (f === maze.exit.floor && Math.abs(i - maze.centerIdx) <= 1 && Math.abs(j - maze.centerIdx) <= 1) continue;
        // Skip rooms (already furnished)
        if (floorData.rooms.some(r => i >= r.startI && i < r.startI + r.rw && j >= r.startJ && j < r.startJ + r.rh)) continue;

        const biomeId = floorData.biomeGrid[i][j] || 'base';
        const cx = maze.cellCX(i) + (Math.random() - 0.5) * 0.4;
        const cz = maze.cellCZ(j) + (Math.random() - 0.5) * 0.4;
        const rot = Math.random() * Math.PI * 2;

        let prop = null;
        if (biomeId === 'jungle') prop = createTree('jungle');
        else if (biomeId === 'forest') prop = createTree('forest');
        else if (biomeId === 'snow') prop = createTree('snow');
        else if (biomeId === 'desert') prop = createDesertCactus();
        else if (biomeId === 'poolrooms') prop = createPoolProp();
        else if (biomeId === 'kindergarten') prop = createKindergartenBlocks();
        else if (biomeId === 'pagoda') {
          prop = createPagodaLantern();
          prop.mesh.position.set(cx, baseY + CONFIG.WALL_HEIGHT - 0.55, cz);
          biomeGroup.add(prop.mesh);
          registerLampLight(cx, baseY + CONFIG.WALL_HEIGHT - 0.65, cz, f, 0xff8833);
          continue;
        } else if (biomeId === 'base' && state.currentSkin === 'rural') {
          prop = createRuralHayBale();
        } else if (Math.random() < 0.28) {
          // Occasional surreal floating/upside-down chair or corridor hiding closet
          if (Math.random() < 0.45) {
            prop = createHidingCloset();
          } else if (hasGLTF) {
            const k = pickRandom(['wooden_chair', 'armchair_01', 'coffee_table', 'side_table']);
            if (k) {
              tryPlaceGLTF(k, cx, baseY, cz, rot, f, null, occupied, biomeGroup, { surrealChance: 0.75 });
              continue;
            }
          }
        }

        if (prop) {
          placeItem(prop, cx, baseY, cz, rot, f, null, occupied, biomeGroup, { surrealChance: 0.14 });
        }
      }
    }
  });

  updateFurnitureVisibility(true);
}

export function updateFurnitureVisibility(force = false) {
  if (!state.roomFurnitureGroups || state.roomFurnitureGroups.length === 0 || !state.controls) return;
  const playerPos = state.controls.object.position;
  if (!force && playerPos.distanceToSquared(state.lastFurnitureCullPos) < 2.25) return;
  state.lastFurnitureCullPos.copy(playerPos);

  const px = playerPos.x, py = playerPos.y, pz = playerPos.z;
  const maxViewDist = 28.0;

  for (let i = 0; i < state.roomFurnitureGroups.length; i++) {
    const entry = state.roomFurnitureGroups[i];
    const dy = Math.abs((entry.baseY + 1.5) - py);
    if (dy > 9.0) {
      entry.group.visible = false;
      continue;
    }
    const dx = entry.cx - px;
    const dz = entry.cz - pz;
    const threshold = maxViewDist + entry.radius;
    entry.group.visible = (dx * dx + dz * dz) <= (threshold * threshold);
  }
}
