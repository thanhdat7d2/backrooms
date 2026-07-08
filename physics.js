import * as THREE from 'three';
import { state, CONFIG } from './state.js';

export function updateHealthHUD() {
  const fill = document.getElementById('health-bar-fill');
  if (fill) {
    fill.style.width = `${state.playerHealth}%`;
  }
}

export function check3DCollision(px, py, pz, radius, box) {
  // Player physical height extends from feet (py - EYE_HEIGHT) to head (py).
  // Box vertical range is [box.yMin, box.yMax].
  const pMinY = py - CONFIG.EYE_HEIGHT;
  const pMaxY = py;

  const yMin = box.yMin !== undefined ? box.yMin : 0;
  const yMax = box.yMax !== undefined ? box.yMax : 999;

  if (pMinY >= yMax || pMaxY <= yMin) {
    return false; // No vertical overlap
  }

  // Check XZ collision
  const closestX = Math.max(box.xMin, Math.min(px, box.xMax));
  const closestZ = Math.max(box.zMin, Math.min(pz, box.zMax));

  const dx = px - closestX;
  const dz = pz - closestZ;
  const distSq = dx * dx + dz * dz;

  return distSq < radius * radius;
}

export function processMovement(dt, triggerExitFlash, showVictoryScreen) {
  if (!state.controls || !state.controls.isLocked) return;

  const currentPos = state.controls.object.position;

  // 1. Exit pit check using worldToCell
  const { cellI, cellJ } = state.mazeData.worldToCell(currentPos.x, currentPos.z);

  if (!state.isFallingIntoExit && cellI === state.mazeData.centerIdx && cellJ === state.mazeData.centerIdx) {
    const distToCenterSq = (currentPos.x - state.mazeData.exit.x) * (currentPos.x - state.mazeData.exit.x)
      + (currentPos.z - state.mazeData.exit.z) * (currentPos.z - state.mazeData.exit.z);
    const exitRadius = Math.min(state.mazeData.exit.halfW, state.mazeData.exit.halfH) * 0.9;
    if (distToCenterSq < exitRadius * exitRadius) {
      state.isFallingIntoExit = true;
      // Instant white flash then show victory screen
      triggerExitFlash(() => {
        state.controls.unlock();
        showVictoryScreen();
      });
      return;
    }
  }

  if (state.isFallingIntoExit) return;

  // 1b. Apply gravity and vertical physics for normal jumping
  if (!state.isFallingIntoExit && !state.isOnGround) {
    state.playerVelocityY -= 15.0 * dt; // Gravity
    currentPos.y += state.playerVelocityY * dt;
    if (currentPos.y <= CONFIG.EYE_HEIGHT) {
      currentPos.y = CONFIG.EYE_HEIGHT;
      state.playerVelocityY = 0;
      state.isOnGround = true;
    }
  }

  // 2. Normal Walking / Running Movement
  const speed = state.isRunning ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED;

  // Force matrix world update so we have the absolute up-to-date orientations
  state.controls.object.updateMatrixWorld();
  const bodyMatrix = state.controls.object.matrixWorld;

  // Calculate relative forward-backward and side-to-side directions
  const moveDirection = new THREE.Vector3();

  // Forward vector points opposite to column 2 (local Z-axis)
  const camDir = new THREE.Vector3();
  camDir.setFromMatrixColumn(bodyMatrix, 2).negate();
  camDir.y = 0; // Lock to XZ floor plane
  camDir.normalize();

  // Right vector points along column 0 (local X-axis)
  const camRight = new THREE.Vector3();
  camRight.setFromMatrixColumn(bodyMatrix, 0);
  camRight.y = 0; // Lock to horizontal plane
  camRight.normalize();

  if (state.moveForward) moveDirection.add(camDir);
  if (state.moveBackward) moveDirection.sub(camDir);
  if (state.moveRight) moveDirection.add(camRight); // Add to move right
  if (state.moveLeft) moveDirection.sub(camRight);  // Subtract to move left

  moveDirection.normalize();

  if (moveDirection.lengthSq() === 0) {
    // Decay view bobbing back to default state when stationary
    if (!state.isFallingIntoExit) {
      state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 0, 8 * dt);
      state.camera.rotation.z = THREE.MathUtils.lerp(state.camera.rotation.z, 0, 8 * dt);
      state.bobTimer = 0;
    }
    return;
  }

  // Calculate intended delta movement
  const dx = moveDirection.x * speed * dt;
  const dz = moveDirection.z * speed * dt;

  // Track coordinates before sliding resolution
  const prevX = currentPos.x;
  const prevZ = currentPos.z;

  // 3. Sliding Collisions
  // Test X and Z movements independently
  let nextX = currentPos.x + dx;
  let nextZ = currentPos.z + dz;

  // Get neighboring cell indices to check collisions (3x3 grid neighborhood)
  const { cellI: currCI, cellJ: currCJ } = state.mazeData.worldToCell(currentPos.x, currentPos.z);
  const currentCellI = currCI;
  const currentCellJ = currCJ;

  const collidersToCheck = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const key = `${currentCellI + di},${currentCellJ + dj}`;
      if (state.gridColliders[key]) {
        collidersToCheck.push(...state.gridColliders[key]);
      }
    }
  }

  // Check X movement
  let xCollision = false;
  for (const collider of collidersToCheck) {
    if (check3DCollision(nextX, currentPos.y, currentPos.z, CONFIG.COLLISION_RADIUS, collider.box)) {
      xCollision = true;
      break;
    }
  }
  if (!xCollision) {
    currentPos.x = nextX;
  }

  // Check Z movement
  let zCollision = false;
  for (const collider of collidersToCheck) {
    if (check3DCollision(currentPos.x, currentPos.y, nextZ, CONFIG.COLLISION_RADIUS, collider.box)) {
      zCollision = true;
      break;
    }
  }
  if (!zCollision) {
    currentPos.z = nextZ;
  }

  // 4. Stride Audio & View Bobbing Calculation
  const actualMovedX = currentPos.x - prevX;
  const actualMovedZ = currentPos.z - prevZ;
  const actualDist = Math.sqrt(actualMovedX * actualMovedX + actualMovedZ * actualMovedZ);

  if (actualDist > 0.0005) {
    // Cumulative stride distance tracker
    state.distanceTraveled += actualDist;
    const strideDistance = state.isRunning ? 1.6 : 1.35; // Running steps are longer

    if (state.distanceTraveled >= strideDistance) {
      // Toggle foot alternation
      state.lastFoot = state.lastFoot === 'left' ? 'right' : 'left';

      // Randomly select footstep sound variation (left1/left2 or right1/right2)
      const randIdx = Math.floor(Math.random() * 2);
      if (state.footstepSounds) {
        const sound = state.footstepSounds[state.lastFoot][randIdx];
        if (sound && !state.soundMuted) {
          sound.currentTime = 0;
          sound.play().catch(() => { });
        }
      }
      state.distanceTraveled = 0;
    }

    // Camera view bobbing (POV walking shake)
    state.bobTimer += dt * (state.isRunning ? 14.5 : 9.5);
    const bobY = Math.sin(state.bobTimer) * (state.isRunning ? 0.075 : 0.035);
    const bobZ = Math.cos(state.bobTimer / 2) * (state.isRunning ? 0.018 : 0.008); // Roll rotation

    if (!state.isFallingIntoExit) {
      if (state.isOnGround) {
        state.camera.position.y = bobY; // Local offset inside container
        state.camera.rotation.z = bobZ; // Local roll offset inside container
      } else {
        // Smoothly decay bobbing to zero during jump
        state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 0, 8 * dt);
        state.camera.rotation.z = THREE.MathUtils.lerp(state.camera.rotation.z, 0, 8 * dt);
      }
    }
  } else {
    // Decelerate bobbing if input exists but motion is physically blocked
    if (!state.isFallingIntoExit) {
      state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 0, 8 * dt);
      state.camera.rotation.z = THREE.MathUtils.lerp(state.camera.rotation.z, 0, 8 * dt);
    }
  }
}
