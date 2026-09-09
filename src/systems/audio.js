import * as THREE from 'three';
import { state, CONFIG, DOM } from '../state.js';

const audioLoader = new THREE.AudioLoader();

export const loadAudioBuffer = (url) => {
  return new Promise((resolve) => {
    audioLoader.load(url,
      (buffer) => resolve({ url, buffer }),
      undefined,
      (err) => {
        console.warn("Spooky audio failed to load: " + url, err);
        resolve({ url, buffer: null });
      }
    );
  });
};

export function updateBackgroundAudioVolume(isPlaying) {
  if (!state.backgroundAudio) return;
  const active = (isPlaying !== undefined) ? isPlaying : (state.controls && state.controls.isLocked);
  if (state.soundMuted) {
    state.backgroundAudio.volume = 0;
  } else if (!active) {
    state.backgroundAudio.volume = 0;
  } else {
    state.backgroundAudio.volume = 1.0;
  }
}

export function initAudio() {
  if (!state.backgroundAudio) {
    state.backgroundAudio = new Audio('assets/audio/background_audio.mp3');
    state.backgroundAudio.loop = true;
    updateBackgroundAudioVolume(false);
  }
  state.backgroundAudio.play().catch(err => {
    console.warn("Audio autoplay blocked or failed:", err);
  });
}

export function initFootsteps() {
  if (!state.footstepSounds) {
    state.footstepSounds = {
      left: [
        new Audio('assets/audio/left1.mp3'),
        new Audio('assets/audio/left2.mp3')
      ],
      right: [
        new Audio('assets/audio/right1.mp3'),
        new Audio('assets/audio/right2.mp3')
      ]
    };
    Object.values(state.footstepSounds).forEach(arr => {
      arr.forEach(audio => {
        audio.volume = 1.0;
      });
    });
  }
}

export function toggleSound() {
  state.soundMuted = !state.soundMuted;
  updateBackgroundAudioVolume(state.controls && state.controls.isLocked);
  if (state.audioListener) {
    state.audioListener.setMasterVolume(state.soundMuted ? 0 : 1.0);
  }
  const volumeOnIcon = DOM.volumeOnIcon;
  const volumeMutedIcon = DOM.volumeMutedIcon;
  if (volumeOnIcon && volumeMutedIcon) {
    if (state.soundMuted) {
      volumeOnIcon.style.display = 'none';
      volumeMutedIcon.style.display = 'block';
    } else {
      volumeOnIcon.style.display = 'block';
      volumeMutedIcon.style.display = 'none';
    }
  }
  if (!state.soundMuted) {
    // Ensure it's playing if it was blocked
    if (state.backgroundAudio && state.backgroundAudio.paused) {
      state.backgroundAudio.play().catch(() => { });
    }
  }
}

export function playSpookySound(soundNode) {
  if (state.activeSpookySound) {
    try {
      if (state.activeSpookySound.isPlaying) {
        state.activeSpookySound.stop();
      }
    } catch (err) {
      console.warn("Failed to stop previous spooky sound:", err);
    }
  }
  state.activeSpookySound = soundNode;
  try {
    soundNode.play();
  } catch (err) {
    console.warn("Failed to play spooky sound:", err);
  }
}

export function playMonsterHitSound() {
  if (!state.audioListener) return;
  const scareSounds = ['assets/audio/scary/jumpscare1.mp3', 'assets/audio/scary/jumpscare2.mp3'];
  const scareUrl = scareSounds[Math.floor(Math.random() * scareSounds.length)];
  const buffer = state.preloadedScaryAudioBuffers[scareUrl];
  if (buffer) {
    const audio2D = new THREE.Audio(state.audioListener);
    audio2D.setBuffer(buffer);
    audio2D.setVolume(1.0);
    playSpookySound(audio2D);
  }
}

export function initAudioUI() {
  const volumeBtn = DOM.volumeBtn;
  if (volumeBtn) {
    volumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSound();
    });
  }
}
