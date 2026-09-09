import { state, CONFIG, DOM } from '../state.js';
import { updateBackgroundAudioVolume, initAudio, initFootsteps } from './audio.js';
import { toggleNavigationLine } from './navigation.js';
import { interactWithDoor } from '../world/door.js';

export function updateDistanceHUD() {
  if (!state.controls) return;
  const currentPos = state.controls.object.position;
  const diagDist = Math.sqrt(currentPos.x * currentPos.x + currentPos.z * currentPos.z);
  const val = DOM.pingDistanceValue;
  if (val) {
    val.textContent = diagDist.toFixed(1);
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
    case 'Tab':
      event.preventDefault(); // Prevent default focus switching
      updateDistanceHUD();
      const distPing = DOM.distancePing;
      if (distPing) {
        distPing.classList.add('active');
      }
      break;
    case 'KeyN':
    case 'ControlLeft':
    case 'ControlRight':
      event.preventDefault();
      console.log('Toggling navigation line. Current state:', state.showNavLine);
      toggleNavigationLine();
      console.log('New navigation line state:', state.showNavLine);
      break;
    case 'Space':
      if (state.isOnGround && !state.isFallingIntoExit) {
        state.playerVelocityY = 4.0; // jump impulse velocity
        state.isOnGround = false;
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
      const distPing = DOM.distancePing;
      if (distPing) {
        distPing.classList.remove('active');
      }
      break;
  }
}

export function setupControls(restartLevel, descendToNextLevel) {
  const controls = state.controls;
  if (!controls) return;

  // Discard anomalous mouse movement spikes to prevent sudden 360-degree camera jumps.
  // This is a known browser bug (mainly in Chromium) where movementX/Y reports huge spikes
  // on locking/unlocking or under high mouse polling rates.
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
    // Show pause screen only if we're not currently transitioning to the next level (falling into exit)
    if (!state.isFallingIntoExit) {
      if (DOM.pauseScreen) DOM.pauseScreen.classList.remove('hidden');
      if (state.camera) {
        state.camera.position.y = 0;
        state.camera.rotation.z = 0;
      }
    }
    updateBackgroundAudioVolume(false);
  });

  // Keyboard Listeners
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // UI buttons Click Listeners
  if (DOM.startBtn) {
    DOM.startBtn.addEventListener('click', () => {
      initAudio();
      initFootsteps();
      if (state.audioListener && state.audioListener.context && state.audioListener.context.state === 'suspended') {
        state.audioListener.context.resume();
      }
      // Reset chase spawn timer so they don't get chased immediately if they stayed in lobby
      state.nextChaseSpawnTime = Date.now() + 25000 + Math.random() * 50000;
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
