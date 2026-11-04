import * as THREE from 'three';

// --- GAME CONFIG & CONSTANTS ---
export const CONFIG = {
  EYE_HEIGHT: 1.6, // Standing player eye height in meters
  CROUCH_EYE_HEIGHT: 0.85, // Crouching eye height in meters
  WALL_HEIGHT: 3.52, // 1.6 * 2.2 wall height per floor
  FLOOR_SLAB_THICKNESS: 0.18, // Thickness of inter-floor slab
  FLOOR_HEIGHT: 3.70, // Vertical distance between consecutive floors (WALL_HEIGHT + FLOOR_SLAB_THICKNESS)
  NUM_FLOORS: 4, // 4 vertically stacked floors
  COLLISION_RADIUS: 0.35, // Player collision circle radius in meters
  GRAVITY: 16.5, // Crisp jump/fall gravity
  JUMP_VELOCITY: 6.2, // Jump impulse (clears ~1.16m height, lands on furniture & clears holes)
  STEP_UP_HEIGHT: 0.38, // Max automatic step-up height onto low ledges/steps
  WALK_SPEED: 4.2, // walking speed in m/s
  RUN_SPEED: 7.8, // running speed (Shift) in m/s
  CROUCH_SPEED: 2.1, // crouching speed (C) in m/s
  WATER_SPEED_MULT: 0.72, // wading multiplier in poolrooms water
  LIGHT_POOL_SIZE: 6, // Max active PointLights in scene (zero shader recompiles)

  WALL_PIC_FILES: [
    'assets/images/wall/wall (1).jpg',
    'assets/images/wall/wall (1).png',
    'assets/images/wall/wall (1).webp',
    'assets/images/wall/wall (2).jpg',
    'assets/images/wall/wall (2).png',
    'assets/images/wall/wall (2).webp',
    'assets/images/wall/wall (3).jpg',
    'assets/images/wall/wall (3).png',
    'assets/images/wall/wall (4).jpg',
    'assets/images/wall/wall (4).png',
    'assets/images/wall/wall (5).png',
    'assets/images/wall/wall (6).png'
  ],

  CHASE_PIC_FILES: [
    'assets/images/chase/chase_1.png',
    'assets/images/chase/chase_2.png',
    'assets/images/chase/chase_3.png',
    'assets/images/chase/chase_4.png',
    'assets/images/chase/chase_5.png',
    'assets/images/chase/chase_6.png',
    'assets/images/chase/chase_7.png'
  ],

  SCARY_AUDIO_FILES: [
    'assets/audio/scary/chuiui.mp3',
    'assets/audio/scary/dont_leave_me.mp3',
    'assets/audio/scary/jumpscare1.mp3',
    'assets/audio/scary/jumpscare2.mp3',
    'assets/audio/scary/manyghost.mp3',
    'assets/audio/scary/mew.mp3',
    'assets/audio/scary/piano.mp3',
    'assets/audio/scary/thrilling.mp3'
  ],

  CHASE_AUDIO_FILES: [
    'assets/audio/scary/chuiui.mp3',
    'assets/audio/scary/dont_leave_me.mp3',
    'assets/audio/scary/jumpscare1.mp3',
    'assets/audio/scary/jumpscare2.mp3',
    'assets/audio/scary/mew.mp3'
  ]
};

// --- GAME STATE ---
export const state = {
  currentLevel: 1,
  currentFloor: 0,
  currentBiome: 'base',
  mazeData: null,
  playerPosition: new THREE.Vector3(),
  playerVelocityY: 0,
  currentEyeHeight: CONFIG.EYE_HEIGHT,
  isCrouching: false,
  isHidden: false,
  inWater: false,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  isFallingIntoExit: false,
  isFallingIntoAbyss: false,
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  isRunning: false,
  soundMuted: false,

  // Lighting & Flashlight
  activeLights: [],
  lightPool: [], // fixed pool of permanent PointLights in scene
  lightObjects: [], // fixture records { x, y, z, floor, cellI, cellJ, color, intensity, range, flicker, flickerPhase, dist, poolSlot }
  lastLightUpdatePos: new THREE.Vector3(9999, 9999, 9999),
  lastLightUpdateFloor: -1,
  ambientLight: null,
  flashlight: null,
  flashlightTarget: null,
  flashlightOn: false,

  // Materials & Textures
  wallMaterials: [],
  wallMaterialGlobal: null,
  ceilingMaterial: null,
  floorMaterial: null,
  biomeMaterials: {}, // biomeId -> { wall, floor, ceiling }
  waterMeshes: [], // animated poolrooms water planes

  // Physics & Jumping
  isOnGround: true,

  // Three.js core
  scene: null,
  camera: null,
  cameraContainer: null,
  renderer: null,
  controls: null,
  clock: null,
  backgroundAudio: null,

  doorTexture: null,
  doorSidesTexture: null,
  doors: [],
  activeInteractiveDoor: null,

  // Furniture, Props & Hiding
  furnitureModels: {},
  carpetTextures: null,
  furnitureLoaded: false,
  roomFurnitureGroups: [],
  hidingSpots: [], // { type: 'closet'|'table'|'cover', floor, xMin, xMax, yMin, yMax, zMin, zMax }
  lastFurnitureCullPos: new THREE.Vector3(9999, 9999, 9999),
  mazeBuildId: 0,
  wallPicsBuiltForId: -1,
  furnitureBuiltForId: -1,

  // Spooky & Audio
  wallPicTextures: [],
  chasePicTextures: [],
  preloadedScaryAudios: {},
  preloadedScaryAudioBuffers: {},
  audioListener: null,
  playerHealth: 100,
  activeSpookySound: null,
  chaseMusicGain: null,
  chaseMusicNodes: null,

  activeWallPictures: [],

  // Navigation line
  showNavLine: false,
  navLineMesh: null,
  navLineMaterial: null,
  lastNavCellI: -1,
  lastNavCellJ: -1,
  lastNavFloor: -1,

  // 3D Chasing Entity
  activeChaseMonster: null,
  nextChaseSpawnTime: 0,

  // Footsteps & Bobbing
  footstepSounds: null,
  lastFoot: 'left',
  distanceTraveled: 0,
  bobTimer: 0,

  // Spatial grid lookup for collision meshes: key = `${floor},${i},${j}`
  // Each entry: { type, box } (AABB) OR { type: 'segment', x1, z1, x2, z2, halfThick, yMin, yMax }
  gridColliders: {},
  // Solid stair ramps & steps
  stairs: [],
  // Floor holes: key = `${floor},${i},${j}` -> { type: 'drop'|'abyss', xMin, xMax, zMin, zMax, floor }
  floorHoles: {},

  // Skin selection
  currentSkin: 'backroom',
  wallTexture: null,
  ceilingTexture: null,
  floorTexture: null
};

// --- DOM ELEMENTS ---
export const DOM = {
  get startScreen() { return document.getElementById('start-screen'); },
  get pauseScreen() { return document.getElementById('pause-screen'); },
  get completeScreen() { return document.getElementById('level-complete-screen'); },
  get startBtn() { return document.getElementById('start-game-btn'); },
  get resumeBtn() { return document.getElementById('resume-game-btn'); },
  get pauseRestartBtn() { return document.getElementById('pause-restart-game-btn'); },
  get nextBtn() { return document.getElementById('next-level-btn'); },
  get levelValueHUD() { return document.getElementById('hud-level-value'); },
  get floorValueHUD() { return document.getElementById('hud-floor-value'); },
  get biomeValueHUD() { return document.getElementById('hud-biome-value'); },
  get statusBadgesHUD() { return document.getElementById('hud-status-badges'); },
  get flashlightBadge() { return document.getElementById('badge-flashlight'); },
  get crouchBadge() { return document.getElementById('badge-crouch'); },
  get hiddenBadge() { return document.getElementById('badge-hidden'); },
  get clearedLevelTitle() { return document.getElementById('cleared-level-title'); },
  get volumeBtn() { return document.getElementById('volume-toggle-btn'); },
  get volumeOnIcon() { return document.getElementById('svg-volume-on'); },
  get volumeMutedIcon() { return document.getElementById('svg-volume-muted'); },
  get distancePing() { return document.getElementById('distance-ping'); },
  get pingDistanceValue() { return document.getElementById('ping-distance-value'); }
};
