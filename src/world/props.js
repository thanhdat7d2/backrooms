import * as THREE from 'three';

/**
 * Expanded 3D Prop & Furniture Builders + Surreal Liminal Placement
 * All models use realistic proportions, multi-part geometry, and cached PBR materials.
 */

const _matCache = {};
function getMat(key, opts) {
  if (!_matCache[key]) {
    _matCache[key] = new THREE.MeshStandardMaterial(opts);
  }
  return _matCache[key];
}

function addBox(group, w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  mesh.userData.isSharedModelAsset = true;
  group.add(mesh);
  return mesh;
}

function addCyl(group, rTop, rBot, h, segs, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), mat);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  mesh.userData.isSharedModelAsset = true;
  group.add(mesh);
  return mesh;
}

// --- WALK-IN HIDING CLOSET / WARDROBE (player can crouch/step inside to hide) ---
export function createHidingCloset() {
  const g = new THREE.Group();
  const wood = getMat('closet_wood', { color: 0x5c3e26, roughness: 0.78 });
  const darkWood = getMat('closet_dark', { color: 0x3b2616, roughness: 0.85 });
  const W = 1.25, H = 2.15, D = 0.95, T = 0.06;

  // Back wall, Left wall, Right wall, Top, Floor
  addBox(g, W, H, T, 0, H / 2, -D / 2 + T / 2, wood);
  addBox(g, T, H, D, -W / 2 + T / 2, H / 2, 0, wood);
  addBox(g, T, H, D, W / 2 - T / 2, H / 2, 0, wood);
  addBox(g, W, T, D, 0, H - T / 2, 0, wood);
  addBox(g, W, 0.04, D, 0, 0.02, 0, darkWood);

  // Half-ajar louvered doors on the front so player can slip inside
  const leftDoor = addBox(g, W * 0.44, H - 0.1, 0.04, -W * 0.34, H / 2, D / 2 + 0.14, darkWood);
  leftDoor.rotation.y = -0.75;
  const rightDoor = addBox(g, W * 0.44, H - 0.1, 0.04, W * 0.34, H / 2, D / 2 + 0.14, darkWood);
  rightDoor.rotation.y = 0.75;

  // Interior coat rod
  const rod = addCyl(g, 0.015, 0.015, W - 0.15, 8, 0, H - 0.35, -0.1, getMat('chrome', { color: 0xcccccc, metalness: 0.8, roughness: 0.25 }));
  rod.rotation.z = Math.PI / 2;

  return { mesh: g, size: new THREE.Vector3(W, H, D), isHidingSpot: true, hideType: 'closet' };
}

// --- HOSPITAL BED ---
export function createHospitalBed() {
  const g = new THREE.Group();
  const metal = getMat('hosp_metal', { color: 0xd8e0e4, metalness: 0.55, roughness: 0.35 });
  const mattress = getMat('hosp_mattress', { color: 0xedf2f0, roughness: 0.85 });
  const blanket = getMat('hosp_blanket', { color: 0x89b8b4, roughness: 0.9 });
  const pillow = getMat('hosp_pillow', { color: 0xffffff, roughness: 0.9 });

  // Legs + frame
  for (const lx of [-0.46, 0.46]) {
    for (const lz of [-0.95, 0.95]) {
      addCyl(g, 0.025, 0.025, 0.55, 8, lx, 0.275, lz, metal);
    }
  }
  addBox(g, 1.0, 0.08, 2.05, 0, 0.56, 0, metal);
  // Headboard & footboard
  addBox(g, 1.02, 0.55, 0.05, 0, 0.85, -1.0, metal);
  addBox(g, 1.02, 0.35, 0.05, 0, 0.75, 1.0, metal);
  // Side safety rails
  addBox(g, 0.03, 0.22, 1.15, -0.51, 0.82, -0.1, metal);
  addBox(g, 0.03, 0.22, 1.15, 0.51, 0.82, -0.1, metal);
  // Mattress, blanket, pillow
  addBox(g, 0.94, 0.18, 1.94, 0, 0.69, 0, mattress);
  addBox(g, 0.96, 0.04, 1.25, 0, 0.79, 0.32, blanket);
  addBox(g, 0.58, 0.12, 0.36, 0, 0.83, -0.68, pillow);

  return { mesh: g, size: new THREE.Vector3(1.05, 1.12, 2.10), isHidingSpot: true, hideType: 'table' };
}

// --- IV DRIP STAND ---
export function createIVStand() {
  const g = new THREE.Group();
  const chrome = getMat('chrome', { color: 0xd0d8dc, metalness: 0.8, roughness: 0.22 });
  const bag = getMat('iv_bag', { color: 0xc8f0f8, transparent: true, opacity: 0.75, roughness: 0.2 });

  addCyl(g, 0.26, 0.28, 0.06, 8, 0, 0.03, 0, chrome);
  addCyl(g, 0.015, 0.02, 1.85, 8, 0, 0.95, 0, chrome);
  addBox(g, 0.35, 0.02, 0.02, 0, 1.86, 0, chrome);
  addBox(g, 0.10, 0.22, 0.05, 0.12, 1.70, 0, bag);
  return { mesh: g, size: new THREE.Vector3(0.55, 1.9, 0.55) };
}

// --- OFFICE DESK + COMPUTER MONITOR ---
export function createOfficeDesk() {
  const g = new THREE.Group();
  const deskMat = getMat('office_desk', { color: 0x8f775c, roughness: 0.65 });
  const legMat = getMat('office_leg', { color: 0x2c3036, metalness: 0.5, roughness: 0.45 });
  const plastic = getMat('pc_plastic', { color: 0x22262b, roughness: 0.5 });
  const screen = getMat('pc_screen', { color: 0x1a3038, emissive: 0x0b222a, roughness: 0.15 });

  // Tabletop + legs (hollow underneath so player can crouch/hide!)
  addBox(g, 1.5, 0.06, 0.8, 0, 0.75, 0, deskMat);
  for (const lx of [-0.68, 0.68]) {
    for (const lz of [-0.34, 0.34]) {
      addBox(g, 0.05, 0.74, 0.05, lx, 0.37, lz, legMat);
    }
  }
  // Monitor + stand + keyboard
  addBox(g, 0.06, 0.18, 0.06, 0, 0.86, -0.18, plastic);
  addBox(g, 0.58, 0.36, 0.05, 0, 1.06, -0.18, plastic);
  addBox(g, 0.52, 0.30, 0.01, 0, 1.06, -0.15, screen);
  addBox(g, 0.42, 0.02, 0.15, 0, 0.79, 0.12, plastic);

  return { mesh: g, size: new THREE.Vector3(1.5, 1.25, 0.8), isHidingSpot: true, hideType: 'table' };
}

// --- FILING CABINET ---
export function createFilingCabinet() {
  const g = new THREE.Group();
  const metal = getMat('cabinet_metal', { color: 0x626b70, metalness: 0.45, roughness: 0.48 });
  const handle = getMat('chrome', { color: 0xd0d8dc, metalness: 0.8, roughness: 0.22 });
  addBox(g, 0.52, 1.35, 0.62, 0, 0.675, 0, metal);
  for (let d = 0; d < 4; d++) {
    const dy = 0.20 + d * 0.31;
    addBox(g, 0.46, 0.27, 0.02, 0, dy, 0.315, getMat('cabinet_drawer', { color: 0x555e63, metalness: 0.4, roughness: 0.5 }));
    addBox(g, 0.14, 0.025, 0.04, 0, dy + 0.04, 0.33, handle);
  }
  return { mesh: g, size: new THREE.Vector3(0.54, 1.36, 0.65) };
}

// --- CLASSROOM STUDENT DESK & CHAIR ---
export function createSchoolDesk() {
  const g = new THREE.Group();
  const wood = getMat('school_wood', { color: 0xc99c62, roughness: 0.68 });
  const steel = getMat('school_steel', { color: 0x3b424a, metalness: 0.55, roughness: 0.45 });

  // Desk
  addBox(g, 0.72, 0.04, 0.52, 0, 0.72, 0, wood);
  addBox(g, 0.64, 0.10, 0.44, 0, 0.64, 0, steel);
  for (const lx of [-0.32, 0.32]) {
    for (const lz of [-0.22, 0.22]) {
      addBox(g, 0.03, 0.72, 0.03, lx, 0.36, lz, steel);
    }
  }
  // Chair tucked behind
  addBox(g, 0.40, 0.035, 0.40, 0, 0.44, 0.46, wood);
  addBox(g, 0.40, 0.26, 0.035, 0, 0.70, 0.65, wood);
  for (const lx of [-0.17, 0.17]) {
    for (const lz of [0.28, 0.63]) {
      addBox(g, 0.025, 0.44, 0.025, lx, 0.22, lz, steel);
    }
  }
  return { mesh: g, size: new THREE.Vector3(0.74, 0.85, 0.96) };
}

// --- CHALKBOARD (Wall Mounted) ---
export function createChalkboard() {
  const g = new THREE.Group();
  const board = getMat('chalkboard', { color: 0x1e3b2b, roughness: 0.88 });
  const frame = getMat('chalk_frame', { color: 0x7c5530, roughness: 0.7 });
  addBox(g, 2.4, 1.15, 0.04, 0, 0, 0, frame);
  addBox(g, 2.26, 1.02, 0.05, 0, 0, 0.008, board);
  addBox(g, 2.2, 0.04, 0.10, 0, -0.57, 0.05, frame);
  return { mesh: g, size: new THREE.Vector3(2.4, 1.15, 0.12) };
}

// --- STORAGE CRATE / BOX / BARREL ---
export function createWoodenCrate() {
  const g = new THREE.Group();
  const wood = getMat('crate_wood', { color: 0x9b7448, roughness: 0.86 });
  const trim = getMat('crate_trim', { color: 0x785532, roughness: 0.88 });
  const s = 0.75 + Math.random() * 0.35;
  addBox(g, s, s, s, 0, s / 2, 0, wood);
  addBox(g, s + 0.03, 0.08, s + 0.03, 0, 0.05, 0, trim);
  addBox(g, s + 0.03, 0.08, s + 0.03, 0, s - 0.05, 0, trim);
  return { mesh: g, size: new THREE.Vector3(s + 0.04, s, s + 0.04) };
}

export function createIndustrialBarrel() {
  const g = new THREE.Group();
  const colors = [0x2a5b84, 0x8f2d24, 0x3a6b3e, 0xc2932b];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const mat = getMat(`barrel_${c}`, { color: c, metalness: 0.55, roughness: 0.42 });
  addCyl(g, 0.30, 0.30, 0.92, 14, 0, 0.46, 0, mat);
  addCyl(g, 0.315, 0.315, 0.04, 14, 0, 0.25, 0, mat);
  addCyl(g, 0.315, 0.315, 0.04, 14, 0, 0.67, 0, mat);
  return { mesh: g, size: new THREE.Vector3(0.64, 0.92, 0.64) };
}

// --- REALISTIC 3D PARKED CAR (for Car Garage) ---
export function createParkedCar() {
  const g = new THREE.Group();
  const paintColors = [0x2a4566, 0x7d2626, 0xc8cdd2, 0x30363b, 0x3b5944, 0xb88b32];
  const color = paintColors[Math.floor(Math.random() * paintColors.length)];
  const paint = getMat(`car_paint_${color}`, { color, metalness: 0.62, roughness: 0.28 });
  const glass = getMat('car_glass', { color: 0x1a2630, metalness: 0.85, roughness: 0.12 });
  const tire = getMat('car_tire', { color: 0x161618, roughness: 0.9 });
  const rim = getMat('car_rim', { color: 0xbcc4cc, metalness: 0.85, roughness: 0.25 });
  const headlight = getMat('car_headlight', { color: 0xfff6d8, emissive: 0x554c30, roughness: 0.15 });
  const taillight = getMat('car_taillight', { color: 0xcc2222, emissive: 0x440808, roughness: 0.2 });

  // Lower chassis
  addBox(g, 1.82, 0.58, 4.25, 0, 0.58, 0, paint);
  // Cabin
  addBox(g, 1.62, 0.52, 2.05, 0, 1.10, -0.15, paint);
  // Windows (front, back, sides)
  addBox(g, 1.50, 0.42, 2.08, 0, 1.09, -0.15, glass);
  addBox(g, 1.65, 0.40, 1.75, 0, 1.09, -0.15, glass);
  // Bumpers
  addBox(g, 1.86, 0.20, 0.14, 0, 0.38, 2.12, tire);
  addBox(g, 1.86, 0.20, 0.14, 0, 0.38, -2.12, tire);
  // Headlights & Taillights
  addBox(g, 0.34, 0.14, 0.06, -0.62, 0.68, 2.12, headlight);
  addBox(g, 0.34, 0.14, 0.06, 0.62, 0.68, 2.12, headlight);
  addBox(g, 0.36, 0.12, 0.06, -0.62, 0.68, -2.12, taillight);
  addBox(g, 0.36, 0.12, 0.06, 0.62, 0.68, -2.12, taillight);

  // 4 Wheels
  for (const wx of [-0.90, 0.90]) {
    for (const wz of [-1.28, 1.28]) {
      const wMesh = addCyl(g, 0.33, 0.33, 0.22, 14, wx, 0.33, wz, tire);
      wMesh.rotation.z = Math.PI / 2;
      const rMesh = addCyl(g, 0.19, 0.19, 0.235, 10, wx, 0.33, wz, rim);
      rMesh.rotation.z = Math.PI / 2;
    }
  }

  return { mesh: g, size: new THREE.Vector3(2.0, 1.42, 4.35) };
}

// --- BIOME-SPECIFIC REALISTIC 3D PROPS ---
export function createTree(variant = 'forest') {
  const g = new THREE.Group();
  const bark = getMat('tree_bark', { color: variant === 'jungle' ? 0x453928 : 0x543c28, roughness: 0.92 });
  const leafColor = variant === 'snow' ? 0x9ec0c8 : (variant === 'jungle' ? 0x245e22 : 0x2a4f28);
  const foliage = getMat(`leaf_${variant}`, { color: leafColor, roughness: 0.85 });

  addCyl(g, 0.12, 0.20, 1.5, 8, 0, 0.75, 0, bark);
  // Layered conifer / canopy cones
  for (let tier = 0; tier < 3; tier++) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.95 - tier * 0.22, 1.05 - tier * 0.12, 9),
      foliage
    );
    cone.position.y = 1.55 + tier * 0.55;
    cone.receiveShadow = true;
    cone.userData.isSharedModelAsset = true;
    g.add(cone);
  }
  return { mesh: g, size: new THREE.Vector3(1.6, 3.1, 1.6) };
}

export function createDesertCactus() {
  const g = new THREE.Group();
  const mat = getMat('cactus', { color: 0x3f7539, roughness: 0.85 });
  addCyl(g, 0.15, 0.17, 2.2, 10, 0, 1.1, 0, mat);
  addCyl(g, 0.11, 0.11, 0.75, 8, 0.34, 1.45, 0, mat);
  addBox(g, 0.34, 0.16, 0.16, 0.18, 1.12, 0, mat);
  addCyl(g, 0.10, 0.10, 0.65, 8, -0.32, 1.25, 0, mat);
  addBox(g, 0.32, 0.15, 0.15, -0.17, 0.98, 0, mat);
  return { mesh: g, size: new THREE.Vector3(0.9, 2.2, 0.4) };
}

export function createPoolProp() {
  const g = new THREE.Group();
  const chrome = getMat('chrome', { color: 0xd8e2e8, metalness: 0.88, roughness: 0.18 });
  // Pool ladder
  addCyl(g, 0.025, 0.025, 1.6, 8, -0.26, 0.8, 0, chrome);
  addCyl(g, 0.025, 0.025, 1.6, 8, 0.26, 0.8, 0, chrome);
  for (let s = 0; s < 4; s++) {
    addBox(g, 0.52, 0.035, 0.09, 0, 0.28 + s * 0.32, 0, chrome);
  }
  // Lifebuoy torus leaning on it
  const buoy = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.09, 10, 20),
    getMat('lifebuoy', { color: 0xff4433, roughness: 0.45 })
  );
  buoy.position.set(0.35, 0.42, 0.15);
  buoy.rotation.y = 0.4;
  buoy.userData.isSharedModelAsset = true;
  g.add(buoy);
  return { mesh: g, size: new THREE.Vector3(0.9, 1.6, 0.45) };
}

export function createPagodaLantern() {
  const g = new THREE.Group();
  const frame = getMat('pagoda_red', { color: 0x6e1a12, roughness: 0.5 });
  const paper = getMat('pagoda_glow', { color: 0xffcc88, emissive: 0xff6622, emissiveIntensity: 0.85, roughness: 0.4 });
  addCyl(g, 0.14, 0.14, 0.06, 10, 0, 0.36, 0, frame);
  addCyl(g, 0.22, 0.22, 0.46, 10, 0, 0.10, 0, paper);
  addCyl(g, 0.14, 0.14, 0.06, 10, 0, -0.16, 0, frame);
  return { mesh: g, size: new THREE.Vector3(0.45, 0.6, 0.45) };
}

export function createKindergartenBlocks() {
  const g = new THREE.Group();
  const cols = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93];
  for (let i = 0; i < 6; i++) {
    const s = 0.22 + (i % 3) * 0.06;
    const mat = getMat(`toy_${i}`, { color: cols[i % cols.length], roughness: 0.45 });
    const bx = (i % 3 - 1) * 0.34;
    const bz = Math.floor(i / 3) * 0.34 - 0.15;
    const by = s / 2 + (i === 5 ? 0.28 : 0);
    const b = addBox(g, s, s, s, bx, by, bz, mat);
    b.rotation.y = i * 0.45;
  }
  return { mesh: g, size: new THREE.Vector3(1.0, 0.6, 0.7) };
}

export function createRuralHayBale() {
  const g = new THREE.Group();
  const hay = getMat('rural_hay', { color: 0xc9a855, roughness: 0.95 });
  const rope = getMat('rural_rope', { color: 0x63482b, roughness: 0.9 });
  addBox(g, 1.15, 0.62, 0.65, 0, 0.31, 0, hay);
  addBox(g, 0.04, 0.64, 0.67, -0.32, 0.31, 0, rope);
  addBox(g, 0.04, 0.64, 0.67, 0.32, 0.31, 0, rope);
  return { mesh: g, size: new THREE.Vector3(1.15, 0.62, 0.65) };
}

export function createFloorLamp() {
  const g = new THREE.Group();
  const brass = getMat('lamp_brass', { color: 0xa6894a, metalness: 0.65, roughness: 0.35 });
  const shade = getMat('lamp_shade', { color: 0xfff0cc, emissive: 0xffcc66, emissiveIntensity: 0.6, roughness: 0.7 });
  addCyl(g, 0.18, 0.20, 0.04, 12, 0, 0.02, 0, brass);
  addCyl(g, 0.018, 0.022, 1.55, 8, 0, 0.80, 0, brass);
  addCyl(g, 0.16, 0.26, 0.32, 12, 0, 1.62, 0, shade);
  return { mesh: g, size: new THREE.Vector3(0.52, 1.78, 0.52), lightOffsetY: 1.60 };
}

export function createWallSconce() {
  const g = new THREE.Group();
  const metal = getMat('sconce_metal', { color: 0x3c3e42, metalness: 0.7, roughness: 0.35 });
  const bulb = getMat('sconce_bulb', { color: 0xffeacc, emissive: 0xffbb66, emissiveIntensity: 0.9, roughness: 0.2 });
  addBox(g, 0.14, 0.22, 0.04, 0, 0, 0.02, metal);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), bulb);
  sphere.position.set(0, 0.04, 0.12);
  sphere.userData.isSharedModelAsset = true;
  g.add(sphere);
  return { mesh: g, size: new THREE.Vector3(0.2, 0.26, 0.2) };
}

/**
 * Apply unsettling surreal liminal transformations to a furniture/prop mesh:
 * - Floating at any height
 * - Tilted at any angle
 * - Upside-down glued to ceiling
 * - Sideways mounted on wall
 * - Oversized (too big) or miniature (too small)
 */
export function applySurrealTransform(mesh, size, baseY, wallHeight) {
  const mode = Math.floor(Math.random() * 5);
  if (mode === 0) {
    // Floating mid-air + slight uncanny tilt
    const floatH = 0.85 + Math.random() * Math.max(0.3, wallHeight - size.y - 1.0);
    mesh.position.y = baseY + floatH;
    mesh.rotation.x += (Math.random() - 0.5) * 0.65;
    mesh.rotation.z += (Math.random() - 0.5) * 0.65;
    return 'floating';
  } else if (mode === 1) {
    // Upside-down attached to the ceiling
    mesh.position.y = baseY + wallHeight - 0.03;
    mesh.rotation.z = Math.PI;
    return 'upside_down';
  } else if (mode === 2) {
    // Tilted dramatically frozen mid-fall
    mesh.position.y = baseY + 0.25 + Math.random() * 0.5;
    mesh.rotation.x = (Math.random() < 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.85);
    mesh.rotation.z = (Math.random() < 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.85);
    return 'tilted';
  } else if (mode === 3) {
    // Too big or too small
    const scale = Math.random() < 0.5 ? (1.7 + Math.random() * 0.5) : (0.35 + Math.random() * 0.2);
    mesh.scale.multiplyScalar(scale);
    return scale > 1 ? 'giant' : 'tiny';
  } else {
    // Wall-mounted sideways (90 deg roll, lifted halfway up wall)
    mesh.position.y = baseY + 1.3 + Math.random() * 0.8;
    mesh.rotation.z = Math.PI / 2;
    return 'wall_mounted';
  }
}
