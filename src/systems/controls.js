import { state, CONFIG, DOM } from '../state.js';
import { updateBackgroundAudioVolume, initAudio, initFootsteps } from './audio.js';
import { toggleNavigationLine } from './navigation.js';
import { interactWithDoor } from '../world/door.js';
import { toggleFlashlight } from '../world/lights.js';

export function updateDistanceHUD() {
  if (!state.controls || !state.mazeData) return;
  const currentPos = state.controls.object.position;
  const ex = state.mazeData.exit;
  const dist3D = Math.hypot(
    currentPos.x - ex.x,
    (currentPos.y - CONFIG.EYE_HEIGHT) - ex.baseY,
    currentPos.z - ex.z
  );
  const val = DOM.pingDistanceValue;
  if (val) {
    val.textContent = `${dist3D.toFixed(1)} (F${ex.floor + 1})`;
  }
}

export function onKeyDown(event) {
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp':
      state.moveForward = true;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      state.moveLeft = true;
      break;
    case 'KeyS':
    case 'ArrowDown':
      state.moveBackward = true;
      break;
    case 'KeyD':
    case 'ArrowRight':
      state.moveRight = true;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      state.isRunning = true;
      break;
    case 'KeyC':
      if (!event.repeat && state.controls && state.controls.isLocked) {
        state.isCrouching = !state.isCrouching;
      }
      break;
    case 'KeyF':
      if (!event.repeat && state.controls && state.controls.isLocked) {
        toggleFlashlight();
      }
      break;
    case 'Tab':
      event.preventDefault();
      updateDistanceHUD();
      if (DOM.distancePing) DOM.distancePing.classList.add('active');
      break;
    case 'KeyN':
    case 'ControlLeft':
    case 'ControlRight':
      event.preventDefault();
      toggleNavigationLine();
      break;
    case 'Space':
      if (!state.isFallingIntoExit && !state.isFallingIntoAbyss) {
        state.jumpBufferTimer = 0.14;
        if (state.isCrouching) state.isCrouching = false;
      }
      break;
    case 'KeyE':
      if (state.controls && state.controls.isLocked) {
        interactWithDoor();
      }
      break;
  }
}

export function onKeyUp(event) {
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp':
      state.moveForward = false;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      state.moveLeft = false;
      break;
    case 'KeyS':
    case 'ArrowDown':
      state.moveBackward = false;
      break;
    case 'KeyD':
    case 'ArrowRight':
      state.moveRight = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      state.isRunning = false;
      break;
    case 'Tab':
      event.preventDefault();
      if (DOM.distancePing) DOM.distancePing.classList.remove('active');
      break;
  }
}

export function setupControls(restartLevel, descendToNextLevel) {
  const controls = state.controls;
  if (!controls) return;

  document.addEventListener('mousemove', (e) => {
    if (state.controls && state.controls.isLocked) {
      const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
      const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
      if (Math.abs(movementX) > 500 || Math.abs(movementY) > 500) {
        e.stopImmediatePropagation();
      }
    }
  }, true);

  controls.addEventListener('lock', () => {
    if (DOM.startScreen) DOM.startScreen.classList.add('hidden');
    if (DOM.pauseScreen) DOM.pauseScreen.classList.add('hidden');
    if (DOM.completeScreen) DOM.completeScreen.classList.add('hidden');
    updateBackgroundAudioVolume(true);
  });

  controls.addEventListener('unlock', () => {
    if (!state.isFallingIntoExit) {
      if (DOM.pauseScreen) DOM.pauseScreen.classList.remove('hidden');
      if (state.camera) {
        state.camera.position.y = 0;
        state.camera.rotation.z = 0;
      }
    }
    updateBackgroundAudioVolume(false);
  });

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  if (DOM.startBtn) {
    DOM.startBtn.addEventListener('click', () => {
      initAudio();
      initFootsteps();
      if (state.audioListener && state.audioListener.context && state.audioListener.context.state === 'suspended') {
        state.audioListener.context.resume();
      }
      state.nextChaseSpawnTime = Date.now() + 22000 + Math.random() * 38000;
      controls.lock();
    });
  }

  if (DOM.resumeBtn) {
    DOM.resumeBtn.addEventListener('click', () => {
      if (state.audioListener && state.audioListener.context && state.audioListener.context.state === 'suspended') {
        state.audioListener.context.resume();
      }
      controls.lock();
    });
  }

  if (DOM.pauseRestartBtn) {
    DOM.pauseRestartBtn.addEventListener('click', () => {
      if (state.audioListener && state.audioListener.context && state.audioListener.context.state === 'suspended') {
        state.audioListener.context.resume();
      }
      restartLevel();
      controls.lock();
    });
  }

  if (DOM.nextBtn) {
    DOM.nextBtn.addEventListener('click', () => {
      descendToNextLevel();
    });
  }
}
