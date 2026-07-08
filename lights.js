import * as THREE from 'three';
import { state, CONFIG } from './state.js';

const _LIGHT_ON_DIST_SQ = 20.0 * 20.0; // activate within 20m

export function updateDynamicLights(force = false) {
  if (!state.lightObjects || state.lightObjects.length === 0) return;

  const playerPos = state.controls.object.position;
  if (!force) {
    const dSq = playerPos.distanceToSquared(state.lastLightUpdatePos);
    if (dSq < 0.04) { // Only update if player moved more than 0.2m
      return;
    }
  }
  state.lastLightUpdatePos.copy(playerPos);

  const playerX = playerPos.x;
  const playerZ = playerPos.z;

  // 1. Calculate squared distances for all light fixtures
  state.lightObjects.forEach(item => {
    const dx = item.x - playerX;
    const dz = item.z - playerZ;
    item.distSq = dx * dx + dz * dz;
  });

  // 2. Sort all lights by distance (closest first)
  const sortedLights = [...state.lightObjects].sort((a, b) => a.distSq - b.distSq);

  // 3. Update dynamic activation of shadow-casting lights and bounce lights
  state.lightObjects.forEach((item) => {
    const rank = sortedLights.indexOf(item);
    const isWithinRange = item.distSq <= _LIGHT_ON_DIST_SQ;
    const shouldBeActive = rank >= 0 && rank < CONFIG.LIGHT_POOL_SIZE && isWithinRange;

    if (shouldBeActive) {
      if (!item.isLightAdded) {
        state.scene.add(item.light);
        item.light.shadow.needsUpdate = true; // Render static shadow map once on activation
        item.isLightAdded = true;
      }
      if (!item.isBounceAdded) {
        state.scene.add(item.bounceLight);
        item.isBounceAdded = true;
      }
    } else {
      if (item.isLightAdded) {
        state.scene.remove(item.light);
        item.isLightAdded = false;
      }
      if (item.isBounceAdded) {
        state.scene.remove(item.bounceLight);
        item.isBounceAdded = false;
      }
    }
  });
}
