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
  if (state.soundMuted || !active) {
    state.backgroundAudio.volume = 0;
  } else {
    state.backgroundAudio.volume = 0.85;
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
      arr.forEach(audio => { audio.volume = 0.9; });
    });
  }
}

export function toggleSound() {
  state.soundMuted = !state.soundMuted;
  updateBackgroundAudioVolume(state.controls && state.controls.isLocked);
  if (state.audioListener) {
    state.audioListener.setMasterVolume(state.soundMuted ? 0 : 1.0);
  }
  if (state.soundMuted) {
    setChaseTensionLevel(0);
  }
  const volumeOnIcon = DOM.volumeOnIcon;
  const volumeMutedIcon = DOM.volumeMutedIcon;
  if (volumeOnIcon && volumeMutedIcon) {
    volumeOnIcon.style.display = state.soundMuted ? 'none' : 'block';
    volumeMutedIcon.style.display = state.soundMuted ? 'block' : 'none';
  }
  if (!state.soundMuted && state.backgroundAudio && state.backgroundAudio.paused) {
    state.backgroundAudio.play().catch(() => { });
  }
}

export function playSpookySound(soundNode) {
  if (state.activeSpookySound) {
    try {
      if (state.activeSpookySound.isPlaying) state.activeSpookySound.stop();
    } catch (err) { }
  }
  state.activeSpookySound = soundNode;
  try {
    soundNode.play();
  } catch (err) { }
}

export function playMonsterHitSound() {
  if (!state.audioListener || state.soundMuted) return;
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

// --- DEDICATED ENTITY AUDIO: Heavy Footsteps, Raspy Breathing & Dynamic Chase Tension Music ---
export function playEntityFootstep(distance) {
  if (state.soundMuted || !state.audioListener) return;
  if (distance > 22) return;
  try {
    const ctx = state.audioListener.context;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const vol = Math.max(0.02, (1 - distance / 22) * 0.42);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(92, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.14);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  } catch (e) { }
}

export function playEntityBreathCue(distance) {
  if (state.soundMuted || !state.audioListener) return;
  if (distance > 18) return;
  try {
    const ctx = state.audioListener.context;
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const vol = Math.max(0.015, (1 - distance / 18) * 0.18);

    // Filtered noise burst for eerie raspy breath
    const bufSize = Math.floor(ctx.sampleRate * 0.55);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufSize) * Math.PI);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420 + Math.random() * 180, now);
    filter.Q.setValueAtTime(3.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.54);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  } catch (e) { }
}

function ensureChaseTensionSynth() {
  if (state.chaseMusicNodes || !state.audioListener) return;
  try {
    const ctx = state.audioListener.context;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Dissonant minor-second horror drone (C2 + Db2) + LFO pulse
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(55.0, ctx.currentTime);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(58.27, ctx.currentTime);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, ctx.currentTime);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(2.2, ctx.currentTime);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(110, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(masterGain);

    osc1.start();
    osc2.start();
    lfo.start();

    state.chaseMusicGain = masterGain;
    state.chaseMusicNodes = { osc1, osc2, filter, lfo };
  } catch (e) { }
}

// intensity in [0..1]: 0 = silent, 0.35 = investigating, 1.0 = active close chase!
export function setChaseTensionLevel(intensity) {
  if (!state.audioListener) return;
  const target = (state.soundMuted || !(state.controls && state.controls.isLocked)) ? 0 : Math.max(0, Math.min(1, intensity));
  if (target > 0.01 && !state.chaseMusicNodes) {
    ensureChaseTensionSynth();
  }
  if (!state.chaseMusicGain || !state.chaseMusicNodes) return;

  try {
    const ctx = state.audioListener.context;
    const now = ctx.currentTime;
    state.chaseMusicGain.gain.setTargetAtTime(target * 0.22, now, 0.25);
    state.chaseMusicNodes.lfo.frequency.setTargetAtTime(1.5 + target * 3.8, now, 0.25);
    state.chaseMusicNodes.filter.frequency.setTargetAtTime(160 + target * 360, now, 0.25);
  } catch (e) { }
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
