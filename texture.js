import * as THREE from 'three';
import { state, CONFIG, DOM } from './state.js';

const textureLoader = new THREE.TextureLoader();

export const loadTex = (url) => {
  return new Promise((resolve, reject) => {
    textureLoader.load(url,
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      (err) => reject(err)
    );
  });
};

export const loadSingleTex = (url) => {
  return new Promise((resolve) => {
    textureLoader.load(url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve({ url, texture });
      },
      undefined,
      () => {
        console.warn("Spooky texture failed to load: " + url);
        resolve({ url, texture: null });
      }
    );
  });
};

export function loadSkinTextures(skinName) {
  return new Promise((resolve, reject) => {
    const wallUrl = `img/skin/${skinName}/wall_tile.png`;
    const ceilUrl = `img/skin/${skinName}/ceiling_tile.png`;
    const floorUrl = `img/skin/${skinName}/floor_tile.png`;

    Promise.all([
      loadTex(wallUrl),
      loadTex(ceilUrl),
      loadTex(floorUrl)
    ]).then(([wallTex, ceilingTex, floorTex]) => {
      state.wallTexture = wallTex;
      state.ceilingTexture = ceilingTex;
      state.floorTexture = floorTex;

      if (state.wallMaterialGlobal) {
        state.wallMaterialGlobal.map = state.wallTexture;
        state.wallMaterialGlobal.needsUpdate = true;
      } else {
        state.wallMaterialGlobal = new THREE.MeshStandardMaterial({
          map: state.wallTexture,
          roughness: 0.8,
          metalness: 0.15
        });
      }

      if (state.floorMaterial && state.ceilingMaterial) {
        const cellSize = state.mazeData ? state.mazeData.cellSize : 3.0;
        const floorTexCloned = state.floorTexture.clone();
        floorTexCloned.repeat.set(cellSize / 2.4, cellSize / 2.4);
        floorTexCloned.needsUpdate = true;
        state.floorMaterial.map = floorTexCloned;
        state.floorMaterial.needsUpdate = true;

        const ceilingTexCloned = state.ceilingTexture.clone();
        ceilingTexCloned.repeat.set(cellSize / 0.5, cellSize / 0.5);
        ceilingTexCloned.needsUpdate = true;
        state.ceilingMaterial.map = ceilingTexCloned;
        state.ceilingMaterial.needsUpdate = true;
      }

      resolve();
    }).catch(err => {
      console.error(`Failed to load textures for skin ${skinName}:`, err);
      reject(err);
    });
  });
}

export function initSkinSelector() {
  const cards = document.querySelectorAll('.skin-card');
  const startBtn = DOM.startBtn;
  const resumeBtn = DOM.resumeBtn;
  const pauseRestartBtn = DOM.pauseRestartBtn;

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const selectedSkin = card.getAttribute('data-skin');
      if (selectedSkin === state.currentSkin) return;

      // Update active card class across all skin card elements (both screens)
      cards.forEach(c => {
        if (c.getAttribute('data-skin') === selectedSkin) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });

      state.currentSkin = selectedSkin;

      // Start loading textures in the background
      if (startBtn) {
        startBtn.textContent = 'LOADING SKIN...';
        startBtn.disabled = true;
      }
      if (resumeBtn) {
        resumeBtn.textContent = 'ĐANG TẢI...';
        resumeBtn.disabled = true;
      }
      if (pauseRestartBtn) {
        pauseRestartBtn.disabled = true;
      }

      loadSkinTextures(selectedSkin).then(() => {
        if (startBtn) {
          startBtn.textContent = 'PLAY';
          startBtn.disabled = false;
        }
        if (resumeBtn) {
          resumeBtn.textContent = 'Tiếp Tục';
          resumeBtn.disabled = false;
        }
        if (pauseRestartBtn) {
          pauseRestartBtn.disabled = false;
        }
      }).catch(() => {
        if (startBtn) {
          startBtn.textContent = 'PLAY';
          startBtn.disabled = false;
        }
        if (resumeBtn) {
          resumeBtn.textContent = 'Tiếp Tục';
          resumeBtn.disabled = false;
        }
        if (pauseRestartBtn) {
          pauseRestartBtn.disabled = false;
        }
      });
    });
  });
}
