import { state, CONFIG } from '../state.js';

const _LIGHT_ON_DIST_SQ = 18.0 * 18.0;  // activate within 18m
const _LIGHT_OFF_DIST_SQ = 23.0 * 23.0; // deactivate only beyond 23m (hysteresis)

export function updateDynamicLights(force = false) {
  if (!state.lightObjects || state.lightObjects.length === 0) return;

  const playerPos = state.controls.object.position;
  if (!force) {
    const dSq = playerPos.distanceToSquared(state.lastLightUpdatePos);
    if (dSq < 1.0) { // Only update if player moved more than 1.0m
      return;
    }
  }
  state.lastLightUpdatePos.copy(playerPos);

  const playerX = playerPos.x;
  const playerZ = playerPos.z;

  // 1. Calculate squared distances for all light fixtures
  for (let i = 0; i < state.lightObjects.length; i++) {
    const item = state.lightObjects[i];
    const dx = item.x - playerX;
    const dz = item.z - playerZ;
    item.distSq = dx * dx + dz * dz;
  }

  // 2. Sort all lights by distance (closest first)
  const sortedLights = [...state.lightObjects].sort((a, b) => a.distSq - b.distSq);

  // 3. First deactivate any lights outside pool/range so slots free up
  for (let i = 0; i < sortedLights.length; i++) {
    const item = sortedLights[i];
    const maxDistSq = item.isLightAdded ? _LIGHT_OFF_DIST_SQ : _LIGHT_ON_DIST_SQ;
    const shouldBeActive = i < CONFIG.LIGHT_POOL_SIZE && item.distSq <= maxDistSq;

    if (!shouldBeActive) {
      if (item.isLightAdded) {
        state.scene.remove(item.light);
        item.isLightAdded = false;
      }
      if (item.isBounceAdded) {
        state.scene.remove(item.bounceLight);
        item.isBounceAdded = false;
      }
    }
  }

  // 4. Activate eligible lights (stagger to at most 1 new shadow-map bake per update unless forced)
  let shadowActivations = 0;
  for (let i = 0; i < Math.min(CONFIG.LIGHT_POOL_SIZE, sortedLights.length); i++) {
    const item = sortedLights[i];
    if (item.distSq > _LIGHT_ON_DIST_SQ) break;

    if (!item.isBounceAdded) {
      state.scene.add(item.bounceLight);
      item.isBounceAdded = true;
    }

    if (!item.isLightAdded) {
      if (!force && shadowActivations >= 1) {
        // Allow next update to pick up the remaining light smoothly
        state.lastLightUpdatePos.set(9999, 9999, 9999);
        break;
      }
      state.scene.add(item.light);
      item.light.shadow.needsUpdate = true; // Bake static shadow map once on activation
      item.isLightAdded = true;
      shadowActivations++;
    }
  }
}
