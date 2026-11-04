import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/PointerLockControls.js';
import { state, CONFIG, DOM } from './state.js';
import { loadTex, loadSingleTex, initSkinSelector } from './systems/texture.js';
import { loadAudioBuffer, initAudioUI } from './systems/audio.js';
import { processMovement, updateHealthHUD } from './systems/physics.js';
import { updateDynamicLights, initFlashlight } from './world/lights.js';
import { updateBiomeAtmosphere } from './systems/biomes.js';
import { updateWallPicturesSpooky, updateChaseMonster, triggerExitFlash, updateSpookyAudio } from './systems/spooky.js';
import { updateNavigationLine } from './systems/navigation.js';
import { setupControls, updateDistanceHUD } from './systems/controls.js';
import { buildMaze, buildSpookyWallPictures } from './world/builder.js';
import { updateDoors } from './world/door.js';
import { preloadFurnitureModels, furnishRooms, updateFurnitureVisibility } from './world/furniture.js';

// --- THREE.JS SETUP ---
function initEngine() {
  state.scene = new THREE.Scene();
  state.scene.fog = new THREE.FogExp2(0x0a0806, 0.045); // Dark warm fog — distances fade to black, not blue

  state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  // Initialize Three.js AudioListener and add it to the camera
  state.audioListener = new THREE.AudioListener();
  state.camera.add(state.audioListener);
  state.audioListener.setMasterVolume(state.soundMuted ? 0 : 1.0);

  // Nest camera inside container to separate look rotations from bobbing translations/roll
  state.cameraContainer = new THREE.Group();
  state.cameraContainer.add(state.camera);
  state.scene.add(state.cameraContainer);

  state.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25)); // Cap pixel ratio for smooth FPS
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFShadowMap;
  state.renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const container = document.getElementById('canvas-container');
  if (container) {
    container.appendChild(state.renderer.domElement);
  }

  state.clock = new THREE.Timer();
  state.clock.connect(document);

  // PointerLockControls setup controls the container
  state.controls = new PointerLockControls(state.cameraContainer, document.body);
  state.scene.add(state.controls.object);

  // Set up mouse and keyboard input and PointerLock listeners
  setupControls(restartLevel, descendToNextLevel);

  // Ambient light to ensure soft general visibility in dark corridors
  state.ambientLight = new THREE.AmbientLight(0x6b6352, 0.65);
  state.scene.add(state.ambientLight);

  // Player toggleable flashlight (SpotLight attached to camera, press F)
  initFlashlight();

  // Resize window handler
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  if (state.camera && state.renderer) {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// --- GAME LIFECYCLE MANAGEMENT ---
function showVictoryScreen() {
  if (DOM.clearedLevelTitle) {
    DOM.clearedLevelTitle.textContent = `LEVEL ${state.currentLevel} COMPLETED`;
  }
  if (DOM.completeScreen) {
    DOM.completeScreen.classList.remove('hidden');
  }
}

function restartLevel() {
  // Reset health
  state.playerHealth = 100;
  updateHealthHUD();

  // Rebuild the current level from scratch
  buildMaze(state.currentLevel);
}

function descendToNextLevel() {
  state.currentLevel++;

  // Dispose of old wall and pillar materials to release GPU memory
  state.wallMaterials.forEach(mat => {
    if (mat.map) mat.map.dispose();
    mat.dispose();
  });
  state.wallMaterials = [];

  // Build the new level
  buildMaze(state.currentLevel);
  if (DOM.completeScreen) {
    DOM.completeScreen.classList.add('hidden');
  }

  // lock pointer lock back
  if (state.controls) {
    state.controls.lock();
  }
}

// --- GAME LOOP ---
function animate() {
  requestAnimationFrame(animate);

  if (!state.clock || !state.renderer || !state.scene || !state.camera) return;

  state.clock.update();
  const dt = Math.min(state.clock.getDelta(), 0.1); // cap dt to prevent huge skips

  if (state.controls && state.controls.isLocked) {
    // Process physics, sliding movement, and gravity
    processMovement(dt, triggerExitFlash, showVictoryScreen);

    // Dynamically manage walkable-path PointLights & flickering
    updateDynamicLights(dt);

    // Smoothly transition fog, ambient lighting & water shimmer across mixed biomes
    updateBiomeAtmosphere(dt);

    // Cull distant room furniture beyond fog range
    updateFurnitureVisibility();

    // Spooky checks for wall pictures
    updateWallPicturesSpooky();

    // Spooky checks for chase monster
    updateChaseMonster(dt, restartLevel);

    // Manage spooky audio exclusively
    updateSpookyAudio();

    // If Tab is active, update distance to exit in real time
    if (DOM.distancePing && DOM.distancePing.classList.contains('active')) {
      updateDistanceHUD();
    }

    // Update interactive doors
    updateDoors(dt);
  }

  // Update navigation line
  if (state.showNavLine) {
    updateNavigationLine();
  }

  state.renderer.render(state.scene, state.camera);
}

function preloadBackgroundAssets() {
  // Load wall pictures in background and place them once ready
  Promise.all(CONFIG.WALL_PIC_FILES.map(url => loadSingleTex(url))).then(wallPics => {
    state.wallPicTextures = wallPics.filter(p => p.texture !== null);
    buildSpookyWallPictures();
  });

  // Load chase monster textures in background
  Promise.all(CONFIG.CHASE_PIC_FILES.map(url => loadSingleTex(url))).then(chasePics => {
    state.chasePicTextures = chasePics.filter(p => p.texture !== null);
  });

  // Load scary audio buffers in background
  Promise.all(CONFIG.SCARY_AUDIO_FILES.map(url => loadAudioBuffer(url))).then(scaryAudios => {
    scaryAudios.forEach(item => {
      if (item && item.buffer) {
        state.preloadedScaryAudioBuffers[item.url] = item.buffer;
      }
    });
  });

  // Load 3D furniture models & carpet PBR textures in background and furnish active maze once ready
  preloadFurnitureModels()
    .then(() => {
      state.furnitureLoaded = true;
      furnishRooms();
    })
    .catch(err => console.warn("Furniture preload failed:", err));
}

window.onload = () => {
  // Only block startup on the 5 essential base textures so the game boots immediately
  const basePromises = [
    loadTex('assets/images/skin/backroom/wall_tile.png'),
    loadTex('assets/images/skin/backroom/ceiling_tile.png'),
    loadTex('assets/images/skin/backroom/floor_tile.png'),
    loadTex('assets/images/skin/backroom/door.png'),
    loadTex('assets/images/skin/backroom/door_sides.png')
  ];

  Promise.all(basePromises).then(([wallTex, ceilingTex, floorTex, doorTex, doorSidesTex]) => {
    state.wallTexture = wallTex;
    state.ceilingTexture = ceilingTex;
    state.floorTexture = floorTex;
    state.doorTexture = doorTex;
    state.doorSidesTexture = doorSidesTex;

    // Initialize the global wall material
    state.wallMaterialGlobal = new THREE.MeshStandardMaterial({
      map: state.wallTexture,
      roughness: 0.8,
      metalness: 0.15
    });

    initEngine();
    buildMaze(state.currentLevel);
    animate();

    initSkinSelector();
    initAudioUI();

    // Stream heavy assets (GLTF furniture, horror audio, wall/chase art) in the background
    preloadBackgroundAssets();
  }).catch(err => {
    console.error("Failed to load base textures: ", err);

    state.wallMaterialGlobal = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.8,
      metalness: 0.15
    });

    initEngine();
    buildMaze(state.currentLevel);
    animate();
    initSkinSelector();
    initAudioUI();
    preloadBackgroundAssets();
  });
};
