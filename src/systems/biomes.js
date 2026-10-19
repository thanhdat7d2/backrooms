import * as THREE from 'three';
import { state } from '../state.js';

// All themed biomes + base skin
export const BIOME_DEFS = {
  base: {
    id: 'base',
    name: 'Backrooms',
    fogColor: 0x0a0806,
    fogDensity: 0.042,
    ambientColor: 0x6b6352,
    ambientIntensity: 0.65,
    lightColors: [0xfff0c4, 0xffe4a0, 0xdff4ff, 0xffaa44],
    waterHeight: 0,
    openSky: false
  },
  poolrooms: {
    id: 'poolrooms',
    name: 'Poolrooms',
    fogColor: 0x0a1c24,
    fogDensity: 0.032,
    ambientColor: 0x7cb8c9,
    ambientIntensity: 0.85,
    lightColors: [0x99f2ff, 0xdff8ff, 0x55e0d8],
    waterHeight: 0.28,
    openSky: false
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle',
    fogColor: 0x0b1a0e,
    fogDensity: 0.044,
    ambientColor: 0x4b7049,
    ambientIntensity: 0.72,
    lightColors: [0xaaff88, 0xd8ffb0, 0xffdd88],
    waterHeight: 0,
    openSky: false
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    fogColor: 0x0c140e,
    fogDensity: 0.040,
    ambientColor: 0x556b52,
    ambientIntensity: 0.68,
    lightColors: [0xe8f5c8, 0xffe4aa, 0x99ddaa],
    waterHeight: 0,
    openSky: false
  },
  desert: {
    id: 'desert',
    name: 'Desert',
    fogColor: 0x261a0d,
    fogDensity: 0.032,
    ambientColor: 0xbaa078,
    ambientIntensity: 0.85,
    lightColors: [0xffd890, 0xffaa55, 0xfff0cc],
    waterHeight: 0,
    openSky: false
  },
  snow: {
    id: 'snow',
    name: 'Snow',
    fogColor: 0x162230,
    fogDensity: 0.034,
    ambientColor: 0x9cb8d4,
    ambientIntensity: 0.88,
    lightColors: [0xd8f0ff, 0xaaddff, 0xffffff],
    waterHeight: 0,
    openSky: false
  },
  endless_sky: {
    id: 'endless_sky',
    name: 'Endless Sky',
    fogColor: 0x6ea8dc,
    fogDensity: 0.018,
    ambientColor: 0xd0e8ff,
    ambientIntensity: 1.05,
    lightColors: [0xffffff, 0xe8f4ff, 0xfff8e0],
    waterHeight: 0,
    openSky: true
  },
  hospital: {
    id: 'hospital',
    name: 'Hospital',
    fogColor: 0x0d1516,
    fogDensity: 0.038,
    ambientColor: 0x7e9998,
    ambientIntensity: 0.75,
    lightColors: [0xdcf6ff, 0xeefaff, 0xff3333, 0x88ffaa],
    waterHeight: 0,
    openSky: false
  },
  kindergarten: {
    id: 'kindergarten',
    name: 'Kindergarten',
    fogColor: 0x18151d,
    fogDensity: 0.034,
    ambientColor: 0x9e94aa,
    ambientIntensity: 0.82,
    lightColors: [0xfff4d0, 0xffccdd, 0xbbddff, 0xccffbb],
    waterHeight: 0,
    openSky: false
  },
  pagoda: {
    id: 'pagoda',
    name: 'Pagoda',
    fogColor: 0x1a0c08,
    fogDensity: 0.042,
    ambientColor: 0x8a5b42,
    ambientIntensity: 0.65,
    lightColors: [0xff8833, 0xffaa44, 0xff4422, 0xffdd99],
    waterHeight: 0,
    openSky: false
  },
  white_void: {
    id: 'white_void',
    name: 'White Void',
    fogColor: 0xdde2e8,
    fogDensity: 0.025,
    ambientColor: 0xe8edf2,
    ambientIntensity: 1.15,
    lightColors: [0xffffff, 0xf2f8ff],
    waterHeight: 0,
    openSky: false
  }
};

export const THEME_BIOME_LIST = [
  'poolrooms', 'jungle', 'forest', 'desert', 'snow',
  'endless_sky', 'hospital', 'kindergarten', 'pagoda', 'white_void'
];

// Deterministic PRNG for crisp procedural textures
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvasTexture(size, drawFn) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawNoiseOverlay(ctx, size, alpha, seed) {
  const rng = mulberry32(seed);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 255 * alpha;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function drawCeramicTiles(ctx, size, baseHex, groutHex, tilesPerSide, seed, glossVariation = 18) {
  const rng = mulberry32(seed);
  ctx.fillStyle = groutHex;
  ctx.fillRect(0, 0, size, size);
  const step = size / tilesPerSide;
  const gap = Math.max(2, Math.floor(size / 128));
  const base = new THREE.Color(baseHex);
  for (let ty = 0; ty < tilesPerSide; ty++) {
    for (let tx = 0; tx < tilesPerSide; tx++) {
      const delta = (rng() - 0.5) * (glossVariation / 255);
      const r = Math.max(0, Math.min(255, Math.round((base.r + delta) * 255)));
      const g = Math.max(0, Math.min(255, Math.round((base.g + delta) * 255)));
      const b = Math.max(0, Math.min(255, Math.round((base.b + delta) * 255)));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(tx * step + gap, ty * step + gap, step - gap * 2, step - gap * 2);
      // Subtle bevel highlight
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(tx * step + gap, ty * step + gap, step - gap * 2, 2);
    }
  }
  drawNoiseOverlay(ctx, size, 0.04, seed + 11);
}

function generateBiomeTextureSet(biomeId) {
  const S = 256;
  switch (biomeId) {
    case 'poolrooms': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        drawCeramicTiles(ctx, s, 0xd8edf2, 0x8eaeb8, 8, 101, 20);
        // Subtle water-line dampness near bottom
        const grad = ctx.createLinearGradient(0, s * 0.65, 0, s);
        grad.addColorStop(0, 'rgba(30,110,125,0)');
        grad.addColorStop(1, 'rgba(24,105,120,0.35)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, s * 0.65, s, s * 0.35);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        drawCeramicTiles(ctx, s, 0x8ad4de, 0x4d8c96, 8, 102, 24);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        drawCeramicTiles(ctx, s, 0xe8f4f7, 0xb8ccd2, 4, 103, 12);
      });
      return { wall, floor, ceiling, roughness: 0.25, metalness: 0.08 };
    }

    case 'jungle': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(201);
        ctx.fillStyle = '#3b4a33';
        ctx.fillRect(0, 0, s, s);
        // Mossy stone & tangled vines
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = rng() < 0.5 ? 'rgba(42,72,34,0.5)' : 'rgba(72,62,48,0.45)';
          ctx.fillRect(rng() * s, rng() * s, 20 + rng() * 48, 16 + rng() * 34);
        }
        ctx.strokeStyle = 'rgba(25,58,20,0.75)';
        ctx.lineWidth = 3;
        for (let v = 0; v < 12; v++) {
          ctx.beginPath();
          let vx = rng() * s;
          ctx.moveTo(vx, 0);
          for (let y = 0; y <= s; y += 32) {
            vx += (rng() - 0.5) * 18;
            ctx.lineTo(vx, y);
          }
          ctx.stroke();
        }
        drawNoiseOverlay(ctx, s, 0.10, 202);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(203);
        ctx.fillStyle = '#2e3822';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 180; i++) {
          ctx.fillStyle = rng() < 0.55 ? 'rgba(54,88,36,0.6)' : 'rgba(66,48,30,0.6)';
          ctx.beginPath();
          ctx.ellipse(rng() * s, rng() * s, 4 + rng() * 14, 2 + rng() * 7, rng() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        drawNoiseOverlay(ctx, s, 0.12, 204);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(205);
        ctx.fillStyle = '#1b3318';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 90; i++) {
          ctx.fillStyle = rng() < 0.18 ? 'rgba(130,190,110,0.35)' : 'rgba(35,72,28,0.65)';
          ctx.beginPath();
          ctx.arc(rng() * s, rng() * s, 10 + rng() * 24, 0, Math.PI * 2);
          ctx.fill();
        }
        drawNoiseOverlay(ctx, s, 0.08, 206);
      });
      return { wall, floor, ceiling, roughness: 0.92, metalness: 0.02 };
    }

    case 'forest': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(301);
        ctx.fillStyle = '#4a3a2c';
        ctx.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 16) {
          ctx.fillStyle = `rgb(${64 + Math.floor(rng() * 24)},${50 + Math.floor(rng() * 18)},${36 + Math.floor(rng() * 14)})`;
          ctx.fillRect(x, 0, 15, s);
        }
        // Moss patches
        for (let i = 0; i < 24; i++) {
          ctx.fillStyle = 'rgba(52,82,42,0.45)';
          ctx.beginPath();
          ctx.arc(rng() * s, rng() * s, 8 + rng() * 18, 0, Math.PI * 2);
          ctx.fill();
        }
        drawNoiseOverlay(ctx, s, 0.12, 302);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(303);
        ctx.fillStyle = '#3b3326';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 220; i++) {
          ctx.fillStyle = rng() < 0.4 ? 'rgba(72,90,46,0.55)' : 'rgba(92,68,42,0.55)';
          ctx.fillRect(rng() * s, rng() * s, 3 + rng() * 10, 2 + rng() * 4);
        }
        drawNoiseOverlay(ctx, s, 0.12, 304);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(305);
        ctx.fillStyle = '#203020';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 70; i++) {
          ctx.fillStyle = rng() < 0.15 ? 'rgba(140,175,160,0.3)' : 'rgba(34,58,34,0.7)';
          ctx.beginPath();
          ctx.arc(rng() * s, rng() * s, 12 + rng() * 22, 0, Math.PI * 2);
          ctx.fill();
        }
        drawNoiseOverlay(ctx, s, 0.08, 306);
      });
      return { wall, floor, ceiling, roughness: 0.9, metalness: 0.02 };
    }

    case 'desert': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(401);
        ctx.fillStyle = '#c89e68';
        ctx.fillRect(0, 0, s, s);
        // Sandstone horizontal strata
        for (let y = 0; y < s; y += 16) {
          ctx.fillStyle = `rgba(${180 + Math.floor(rng() * 40)},${135 + Math.floor(rng() * 32)},${82 + Math.floor(rng() * 24)},0.65)`;
          ctx.fillRect(0, y, s, 14);
        }
        drawNoiseOverlay(ctx, s, 0.09, 402);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        ctx.fillStyle = '#d9b57c';
        ctx.fillRect(0, 0, s, s);
        // Wind-blown sand ripples
        for (let y = 0; y < s; y += 10) {
          const wave = Math.sin((y / s) * Math.PI * 8) * 12;
          ctx.fillStyle = wave > 0 ? 'rgba(255,235,195,0.22)' : 'rgba(150,105,55,0.22)';
          ctx.fillRect(0, y, s, 5);
        }
        drawNoiseOverlay(ctx, s, 0.09, 403);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        const grad = ctx.createLinearGradient(0, 0, 0, s);
        grad.addColorStop(0, '#c29964');
        grad.addColorStop(1, '#d8b482');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, s, s);
        drawNoiseOverlay(ctx, s, 0.06, 404);
      });
      return { wall, floor, ceiling, roughness: 0.92, metalness: 0.02 };
    }

    case 'snow': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(501);
        ctx.fillStyle = '#c4d8e8';
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 32) {
          ctx.fillStyle = `rgba(${160 + Math.floor(rng() * 40)},${190 + Math.floor(rng() * 35)},${215 + Math.floor(rng() * 35)},0.55)`;
          ctx.fillRect(0, y, s, 30);
        }
        drawNoiseOverlay(ctx, s, 0.07, 502);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        const rng = mulberry32(503);
        ctx.fillStyle = '#e8f2fa';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 80; i++) {
          ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(180,210,235,0.35)';
          ctx.beginPath();
          ctx.ellipse(rng() * s, rng() * s, 14 + rng() * 32, 6 + rng() * 14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        drawNoiseOverlay(ctx, s, 0.06, 504);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        ctx.fillStyle = '#b4c9dc';
        ctx.fillRect(0, 0, s, s);
        drawNoiseOverlay(ctx, s, 0.05, 505);
      });
      return { wall, floor, ceiling, roughness: 0.55, metalness: 0.05 };
    }

    case 'endless_sky': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        const grad = ctx.createLinearGradient(0, 0, 0, s);
        grad.addColorStop(0, '#8bc4f2');
        grad.addColorStop(0.55, '#c4e2fa');
        grad.addColorStop(1, '#eef6fc');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, s, s);
        // Soft clouds
        const rng = mulberry32(601);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 18; i++) {
          ctx.beginPath();
          ctx.ellipse(rng() * s, rng() * s * 0.7, 25 + rng() * 45, 10 + rng() * 18, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        drawCeramicTiles(ctx, s, 0xf2f7fc, 0xcad8e8, 4, 602, 10);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        ctx.fillStyle = '#6db2eb';
        ctx.fillRect(0, 0, s, s);
        const rng = mulberry32(603);
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        for (let i = 0; i < 24; i++) {
          ctx.beginPath();
          ctx.ellipse(rng() * s, rng() * s, 24 + rng() * 52, 12 + rng() * 24, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      return { wall, floor, ceiling, roughness: 0.35, metalness: 0.02 };
    }

    case 'hospital': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        ctx.fillStyle = '#e4ecea';
        ctx.fillRect(0, 0, s, s * 0.58);
        // Clinical bumper rail
        ctx.fillStyle = '#8aa8a4';
        ctx.fillRect(0, s * 0.56, s, s * 0.05);
        // Lower pale mint wainscot
        ctx.fillStyle = '#c2dad4';
        ctx.fillRect(0, s * 0.61, s, s * 0.39);
        drawNoiseOverlay(ctx, s, 0.04, 701);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        drawCeramicTiles(ctx, s, 0xd8e0de, 0xb0bab8, 6, 702, 12);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        drawCeramicTiles(ctx, s, 0xeef2f0, 0xc2cac8, 4, 703, 8);
      });
      return { wall, floor, ceiling, roughness: 0.45, metalness: 0.06 };
    }

    case 'kindergarten': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        ctx.fillStyle = '#fff5dc';
        ctx.fillRect(0, 0, s, s);
        // Colorful pastel stripes & playful shapes
        ctx.fillStyle = '#9bd4f5';
        ctx.fillRect(0, s * 0.65, s, s * 0.35);
        ctx.fillStyle = '#ff99aa';
        ctx.fillRect(0, s * 0.62, s, s * 0.04);
        const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff'];
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = colors[i];
          ctx.beginPath();
          ctx.arc(32 + i * 64, s * 0.32, 16, 0, Math.PI * 2);
          ctx.fill();
        }
        drawNoiseOverlay(ctx, s, 0.03, 801);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        const colors = ['#ff7b7b', '#ffd166', '#66d19e', '#66a3ff'];
        const step = s / 4;
        for (let y = 0; y < 4; y++) {
          for (let x = 0; x < 4; x++) {
            ctx.fillStyle = colors[(x + y) % 4];
            ctx.fillRect(x * step, y * step, step, step);
          }
        }
        drawNoiseOverlay(ctx, s, 0.05, 802);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        drawCeramicTiles(ctx, s, 0xfcfaf2, 0xdcd8cc, 4, 803, 6);
      });
      return { wall, floor, ceiling, roughness: 0.6, metalness: 0.02 };
    }

    case 'pagoda': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        // Warm shoji paper with dark cedar/red lacquer lattice
        ctx.fillStyle = '#f2e2c2';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = '#6e1e16';
        // Outer red lacquer pillars & beams
        ctx.fillRect(0, 0, 18, s);
        ctx.fillRect(s - 18, 0, 18, s);
        ctx.fillRect(0, 0, s, 20);
        ctx.fillRect(0, s - 28, s, 28);
        // Inner wood lattice
        ctx.fillStyle = '#4a2b18';
        for (let x = 64; x < s; x += 64) ctx.fillRect(x - 2, 20, 4, s - 48);
        for (let y = 64; y < s; y += 64) ctx.fillRect(18, y - 2, s - 36, 4);
        drawNoiseOverlay(ctx, s, 0.05, 901);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        // Woven tatami mats with dark green-black border
        ctx.fillStyle = '#c8bc88';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = 'rgba(130,118,76,0.28)';
        for (let y = 0; y < s; y += 4) ctx.fillRect(0, y, s, 1);
        ctx.strokeStyle = '#243020';
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, s - 8, s / 2 - 4);
        ctx.strokeRect(4, s / 2 + 4, s - 8, s / 2 - 8);
        drawNoiseOverlay(ctx, s, 0.06, 902);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        // Dark coffered temple wood ceiling
        ctx.fillStyle = '#3b2416';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = '#6e1e16';
        ctx.lineWidth = 10;
        ctx.strokeRect(8, 8, s - 16, s - 16);
        drawNoiseOverlay(ctx, s, 0.07, 903);
      });
      return { wall, floor, ceiling, roughness: 0.72, metalness: 0.05 };
    }

    case 'white_void': {
      const wall = makeCanvasTexture(S, (ctx, s) => {
        ctx.fillStyle = '#f8f9fb';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(200,208,218,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, s - 2, s - 2);
      });
      const floor = makeCanvasTexture(S, (ctx, s) => {
        ctx.fillStyle = '#f2f4f7';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(195,202,212,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, s - 2, s - 2);
      });
      const ceiling = makeCanvasTexture(S, (ctx, s) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, s, s);
      });
      return { wall, floor, ceiling, roughness: 0.25, metalness: 0.02 };
    }

    default:
      return null;
  }
}

export function getBiomeMaterials(biomeId) {
  if (biomeId === 'base' || !BIOME_DEFS[biomeId]) {
    return {
      wall: state.wallMaterialGlobal,
      floor: state.floorMaterial,
      ceiling: state.ceilingMaterial
    };
  }

  if (!state.biomeMaterials[biomeId]) {
    const texSet = generateBiomeTextureSet(biomeId);
    const isVoid = biomeId === 'white_void';
    const isSky = biomeId === 'endless_sky';

    state.biomeMaterials[biomeId] = {
      wall: new THREE.MeshStandardMaterial({
        map: texSet.wall,
        roughness: texSet.roughness,
        metalness: texSet.metalness,
        emissive: isVoid ? new THREE.Color(0x222428) : (isSky ? new THREE.Color(0x122030) : new THREE.Color(0x000000))
      }),
      floor: new THREE.MeshStandardMaterial({
        map: texSet.floor,
        roughness: texSet.roughness,
        metalness: texSet.metalness,
        emissive: isVoid ? new THREE.Color(0x1c1e22) : new THREE.Color(0x000000)
      }),
      ceiling: new THREE.MeshStandardMaterial({
        map: texSet.ceiling,
        roughness: texSet.roughness,
        metalness: texSet.metalness,
        emissive: isSky ? new THREE.Color(0x2a5078) : (isVoid ? new THREE.Color(0x303238) : new THREE.Color(0x000000))
      })
    };
  }
  return state.biomeMaterials[biomeId];
}

const _targetFogColor = new THREE.Color();
const _targetAmbColor = new THREE.Color();

export function updateBiomeAtmosphere(dt) {
  if (!state.mazeData || !state.controls || !state.scene) return;
  const pos = state.controls.object.position;
  const { floor, cellI, cellJ } = state.mazeData.worldToCell3D(pos.x, pos.y, pos.z);
  const floorData = state.mazeData.floors[floor];
  if (!floorData) return;

  const biomeId = (floorData.biomeGrid && floorData.biomeGrid[cellI])
    ? (floorData.biomeGrid[cellI][cellJ] || 'base')
    : 'base';

  if (biomeId !== state.currentBiome) {
    state.currentBiome = biomeId;
    const biomeHUD = document.getElementById('hud-biome-value');
    if (biomeHUD) {
      const def = BIOME_DEFS[biomeId] || BIOME_DEFS.base;
      biomeHUD.textContent = biomeId === 'base'
        ? (state.currentSkin || 'Backrooms').toUpperCase()
        : def.name.toUpperCase();
    }
  }

  const def = BIOME_DEFS[biomeId] || BIOME_DEFS.base;
  const lerpAlpha = Math.min(1, dt * 2.2);

  if (state.scene.fog) {
    _targetFogColor.setHex(def.fogColor);
    state.scene.fog.color.lerp(_targetFogColor, lerpAlpha);
    state.scene.fog.density = THREE.MathUtils.lerp(state.scene.fog.density, def.fogDensity, lerpAlpha);
    state.scene.background = state.scene.fog.color;
  }

  if (state.ambientLight) {
    _targetAmbColor.setHex(def.ambientColor);
    state.ambientLight.color.lerp(_targetAmbColor, lerpAlpha);
    state.ambientLight.intensity = THREE.MathUtils.lerp(state.ambientLight.intensity, def.ambientIntensity, lerpAlpha);
  }

  // Subtle shimmer animation on poolrooms water surfaces
  if (state.waterMeshes && state.waterMeshes.length > 0) {
    const t = performance.now() * 0.0015;
    for (let i = 0; i < state.waterMeshes.length; i++) {
      const w = state.waterMeshes[i];
      w.position.y = w.userData.baseY + Math.sin(t + i) * 0.015;
    }
  }
}
