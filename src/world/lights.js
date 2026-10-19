import * as THREE from 'three';
import { state, CONFIG, DOM } from '../state.js';

const MAX_WALK_ON_DIST = 22.0;   // Pre-activate lights within 22m walkable path distance
const MAX_WALK_OFF_DIST = 27.0;  // Deactivate only beyond 27m (hysteresis)

// --- PLAYER FLASHLIGHT (SpotLight attached to camera, press F to toggle) ---
export function initFlashlight() {
  if (!state.camera) return;

  const spot = new THREE.SpotLight(0xfff5e0, 0, 28, Math.PI / 5.2, 0.48, 1.25);
  spot.position.set(0.12, -0.08, 0.05);
  spot.castShadow = false;

  const target = new THREE.Object3D();
  target.position.set(0, -0.05, -6.0);
  state.camera.add(target);
  spot.target = target;
  state.camera.add(spot);

  state.flashlight = spot;
  state.flashlightTarget = target;
  state.flashlightOn = false;
  updateFlashlightHUD();
}

function playFlashlightClick() {
  if (state.soundMuted || !state.audioListener) return;
  try {
    const ctx = state.audioListener.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(state.flashlightOn ? 920 : 620, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) { }
}

export function toggleFlashlight() {
  if (!state.flashlight) initFlashlight();
  state.flashlightOn = !state.flashlightOn;
  if (state.flashlight) {
    state.flashlight.intensity = state.flashlightOn ? 4.8 : 0;
  }
  playFlashlightClick();
  updateFlashlightHUD();
}

export function updateFlashlightHUD() {
  if (DOM.flashlightBadge) {
    DOM.flashlightBadge.classList.toggle('active', state.flashlightOn);
    DOM.flashlightBadge.textContent = state.flashlightOn ? 'FLASHLIGHT: ON [F]' : 'FLASHLIGHT: OFF [F]';
  }
}

// --- WALKABLE-PATH-BASED PRE-ACTIVATION LIGHTING ---
// Computes reachable walkable distance from player's (floor, i, j) across open corridors,
// stairs, and merged multi-floor atriums so lights behind solid walls are NOT wasted.
function computeWalkableCellDistances(startFloor, startI, startJ, maxDist) {
  const maze = state.mazeData;
  if (!maze) return new Map();

  const N = maze.N;
  const distMap = new Map();
  const startKey = `${startFloor},${startI},${startJ}`;
  distMap.set(startKey, 0);

  // Simple priority-bucket / BFS queue (small bounded frontier ~40-80 cells)
  const queue = [{ f: startFloor, i: startI, j: startJ, d: 0 }];

  // Pre-index stairs by cell for O(1) lookup
  const stairAdj = new Map();
  for (const st of maze.stairs) {
    const k1 = `${st.fromFloor},${st.i1},${st.j1}`;
    const k2 = `${st.toFloor},${st.i2},${st.j2}`;
    if (!stairAdj.has(k1)) stairAdj.set(k1, []);
    if (!stairAdj.has(k2)) stairAdj.set(k2, []);
    stairAdj.get(k1).push({ f: st.toFloor, i: st.i2, j: st.j2, cost: 4.5 });
    stairAdj.get(k2).push({ f: st.fromFloor, i: st.i1, j: st.j1, cost: 4.5 });
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const currKey = `${curr.f},${curr.i},${curr.j}`;
    if (curr.d > (distMap.get(currKey) ?? Infinity)) continue;
    if (curr.d >= maxDist) continue;

    const fl = maze.floors[curr.f];
    if (!fl) continue;
    const { i, j } = curr;
    const cx = maze.cellCX(i);
    const cz = maze.cellCZ(j);

    const tryPush = (nf, ni, nj, stepCost) => {
      const nd = curr.d + stepCost;
      if (nd > maxDist) return;
      const nk = `${nf},${ni},${nj}`;
      if (nd < (distMap.get(nk) ?? Infinity)) {
        distMap.set(nk, nd);
        queue.push({ f: nf, i: ni, j: nj, d: nd });
      }
    };

    // 4 cardinal walkable neighbors on the same floor
    if (i > 0 && !fl.vWalls[i - 1][j]) {
      tryPush(curr.f, i - 1, j, Math.abs(cx - maze.cellCX(i - 1)));
    }
    if (i < N - 1 && !fl.vWalls[i][j]) {
      tryPush(curr.f, i + 1, j, Math.abs(maze.cellCX(i + 1) - cx));
    }
    if (j > 0 && !fl.hWalls[i][j - 1]) {
      tryPush(curr.f, i, j - 1, Math.abs(cz - maze.cellCZ(j - 1)));
    }
    if (j < N - 1 && !fl.hWalls[i][j]) {
      tryPush(curr.f, i, j + 1, Math.abs(maze.cellCZ(j + 1) - cz));
    }

    // Stair transitions
    const stList = stairAdj.get(currKey);
    if (stList) {
      for (const nxt of stList) {
        tryPush(nxt.f, nxt.i, nxt.j, nxt.cost);
      }
    }

    // Merged vertical atrium visibility (light travels vertically in open merged zones)
    const mz = maze.mergedCellLookup[curr.f][i][j];
    if (mz) {
      if (curr.f > mz.fStart) tryPush(curr.f - 1, i, j, CONFIG.FLOOR_HEIGHT);
      if (curr.f < mz.fEnd) tryPush(curr.f + 1, i, j, CONFIG.FLOOR_HEIGHT);
    }
  }

  return distMap;
}

export function updateDynamicLights(dt = 0.016, force = false) {
  const fixtures = state.lightObjects;
  const pool = state.lightPool;
  if (!fixtures || fixtures.length === 0 || !pool || pool.length === 0 || !state.mazeData) return;

  // 1. Update flickering lights smoothly every frame (even if player didn't move)
  const nowSec = performance.now() * 0.001;
  for (let s = 0; s < pool.length; s++) {
    const slot = pool[s];
    const f = slot.assignedFixture;
    if (f && f.flicker) {
      const wave = Math.sin(nowSec * 19.0 + f.flickerPhase) * Math.sin(nowSec * 7.3 + f.flickerPhase * 0.7);
      const stutter = wave > 0.55 ? 0.18 : (wave < -0.72 ? 0.45 : 1.0);
      slot.light.intensity = f.intensity * stutter;
      slot.bounceLight.intensity = f.intensity * 0.45 * stutter;
    }
  }

  const playerPos = state.controls.object.position;
  const cell3D = state.mazeData.worldToCell3D(playerPos.x, playerPos.y, playerPos.z);

  if (!force) {
    const dSq = playerPos.distanceToSquared(state.lastLightUpdatePos);
    if (dSq < 0.85 && cell3D.floor === state.lastLightUpdateFloor) {
      return;
    }
  }
  state.lastLightUpdatePos.copy(playerPos);
  state.lastLightUpdateFloor = cell3D.floor;

  // 2. Compute walkable-path distances from player's current cell
  const walkableDist = computeWalkableCellDistances(cell3D.floor, cell3D.cellI, cell3D.cellJ, MAX_WALK_OFF_DIST);

  // Score every fixture by walkable path distance (unreachable fixtures get Infinity)
  const reachable = [];
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    const key = `${f.floor},${f.cellI},${f.cellJ}`;
    const wDist = walkableDist.get(key);
    if (wDist !== undefined) {
      const maxD = f.poolSlot !== -1 ? MAX_WALK_OFF_DIST : MAX_WALK_ON_DIST;
      if (wDist <= maxD) {
        f.dist = wDist;
        reachable.push(f);
      } else {
        f.dist = Infinity;
      }
    } else {
      f.dist = Infinity;
    }
  }

  reachable.sort((a, b) => a.dist - b.dist);
  const desired = reachable.slice(0, pool.length);
  const desiredSet = new Set(desired);

  // 3. Free pool slots no longer in walkable range
  const freeSlots = [];
  for (let s = 0; s < pool.length; s++) {
    const slot = pool[s];
    if (slot.assignedFixture && !desiredSet.has(slot.assignedFixture)) {
      slot.assignedFixture.poolSlot = -1;
      slot.assignedFixture = null;
      slot.light.intensity = 0;
      slot.bounceLight.intensity = 0;
    }
    if (!slot.assignedFixture) {
      freeSlots.push(s);
    }
  }

  // 4. Assign newly desired reachable fixtures to free pool slots
  let bakes = 0;
  for (let i = 0; i < desired.length; i++) {
    const f = desired[i];
    if (f.poolSlot !== -1) continue;
    if (freeSlots.length === 0) break;

    if (!force && bakes >= 1) {
      state.lastLightUpdatePos.set(9999, 9999, 9999);
      break;
    }

    const s = freeSlots.pop();
    const slot = pool[s];

    slot.light.position.set(f.x, f.y, f.z);
    slot.light.color.setHex(f.color || 0xfff0c4);
    slot.light.distance = f.range || 10.5;
    slot.light.intensity = f.intensity || 3.6;
    if (slot.light.castShadow) {
      slot.light.shadow.needsUpdate = true;
    }

    slot.bounceLight.position.set(f.x, f.y, f.z);
    slot.bounceLight.color.setHex(f.color || 0xffecc4);
    slot.bounceLight.intensity = (f.intensity || 3.6) * 0.45;

    slot.assignedFixture = f;
    f.poolSlot = s;
    bakes++;
  }
}
