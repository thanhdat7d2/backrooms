import * as THREE from 'three';

// --- GAME CONFIG & CONSTANTS ---
export const CONFIG = {
  EYE_HEIGHT: 1.6, // Player eye height in meters
  WALL_HEIGHT: 1.6 * 2.2, // 3.52m wall height
  COLLISION_RADIUS: 0.35, // Player collision circle radius in meters
  GRAVITY: 9.8, // Gravity for falling into the exit pit
  WALK_SPEED: 4.0, // walking speed in m/s
  RUN_SPEED: 7.5, // running speed (Shift) in m/s
  LIGHT_POOL_SIZE: 6, // Max active PointLights in scene

  WALL_PIC_FILES: [
    'img/wall/wall (1).jpg',
    'img/wall/wall (1).png',
    'img/wall/wall (1).webp',
    'img/wall/wall (2).jpg',
    'img/wall/wall (2).png',
    'img/wall/wall (2).webp',
    'img/wall/wall (3).jpg',
    'img/wall/wall (3).png',
    'img/wall/wall (4).jpg',
    'img/wall/wall (4).png',
    'img/wall/wall (5).png',
    'img/wall/wall (6).png'
  ],

  CHASE_PIC_FILES: [
    'img/chase/chase_1.png',
    'img/chase/chase_2.png',
    'img/chase/chase_3.png',
    'img/chase/chase_4.png',
    'img/chase/chase_5.png',
    'img/chase/chase_6.png',
    'img/chase/chase_7.png'
  ],

  SCARY_AUDIO_FILES: [
    'audio/scary/chuiui.mp3',
    'audio/scary/dont_leave_me.mp3',
    'audio/scary/jumpscare1.mp3',
    'audio/scary/jumpscare2.mp3',
    'audio/scary/manyghost.mp3',
    'audio/scary/mew.mp3',
    'audio/scary/piano.mp3',
    'audio/scary/thrilling.mp3'
  ],

  CHASE_AUDIO_FILES: [
    'audio/scary/chuiui.mp3',
    'audio/scary/dont_leave_me.mp3',
    'audio/scary/jumpscare1.mp3',
    'audio/scary/jumpscare2.mp3',
    'audio/scary/mew.mp3'
  ]
};

// --- GAME STATE ---
export const state = {
  currentLevel: 1,
  mazeData: null,
  playerPosition: new THREE.Vector3(),
  playerVelocityY: 0,
  isFallingIntoExit: false,
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  isRunning: false,
  soundMuted: false,
  activeLights: [], // currently added point lights in scene
  lightObjects: [], // all point lights instantiated in memory
  lastLightUpdatePos: new THREE.Vector3(9999, 9999, 9999), // Track position of last light update
  wallMaterials: [], // dynamic materials created for walls and pillars
  wallMaterialGlobal: null, // Single global material for all walls and pillars
  isOnGround: true, // Jumping state
  ceilingMaterial: null,
  floorMaterial: null,
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

  wallPicTextures: [],
  chasePicTextures: [],
  preloadedScaryAudios: {},
  preloadedScaryAudioBuffers: {}, // url -> AudioBuffer for spatial audio
  audioListener: null, // THREE.AudioListener attached to player camera
  playerHealth: 100,
  activeSpookySound: null, // Currently playing spooky sound (THREE.Audio or THREE.PositionalAudio)

  // Active wall pictures in the scene for proximity check
  activeWallPictures: [],

  // Panic navigation line state
  showNavLine: false,
  navLineMesh: null,
  navLineMaterial: null,
  lastNavCellI: -1,
  lastNavCellJ: -1,

  // Chasing monster state
  activeChaseMonster: null,
  nextChaseSpawnTime: 0,

  // Footstep Audio states
  footstepSounds: null,
  lastFoot: 'left',
  distanceTraveled: 0,

  // Camera view bobbing
  bobTimer: 0,

  // Spatial grid lookup for collision meshes
  gridColliders: {},

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
  get clearedLevelTitle() { return document.getElementById('cleared-level-title'); },
  get volumeBtn() { return document.getElementById('volume-toggle-btn'); },
  get volumeOnIcon() { return document.getElementById('svg-volume-on'); },
  get volumeMutedIcon() { return document.getElementById('svg-volume-muted'); },
  get distancePing() { return document.getElementById('distance-ping'); },
  get pingDistanceValue() { return document.getElementById('ping-distance-value'); }
};
