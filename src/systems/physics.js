import * as THREE from 'three';
import { state, CONFIG, DOM } from '../state.js';

export function updateHealthHUD() {
  const fill = document.getElementById('health-bar-fill');
  if (fill) {
    fill.style.width = `${state.playerHealth}%`;
  }
}

export function check3DCollision(px, py, pz, radius, box, eyeHeight = state.currentEyeHeight) {
  const pMinY = py - eyeHeight;
  const pMaxY = py + 0.12;
  const yMin = box.yMin !== undefined ? box.yMin : 0;
  const yMax = box.yMax !== undefined ? box.yMax : 999;

  if (pMinY >= yMax - 0.02 || pMaxY <= yMin + 0.02) return false;

  const closestX = Math.max(box.xMin, Math.min(px, box.xMax));
  const closestZ = Math.max(box.zMin, Math.min(pz, box.zMax));
  const dx = px - closestX;
  const dz = pz - closestZ;
  return (dx * dx + dz * dz) < radius * radius;
}

// Accurate 2D circle vs oriented thick line segment collision (for diagonal & curved walls!)
function resolveSegmentCollision(pos, radius, seg, eyeHeight) {
  const pMinY = pos.y - eyeHeight;
  const pMaxY = pos.y + 0.12;
  if (pMinY >= seg.yMax - 0.02 || pMaxY <= seg.yMin + 0.02) return false;

  const vx = seg.x2 - seg.x1;
  const vz = seg.z2 - seg.z1;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return false;

  let t = ((pos.x - seg.x1) * vx + (pos.z - seg.z1) * vz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = seg.x1 + t * vx;
  const cz = seg.z1 + t * vz;

  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const distSq = dx * dx + dz * dz;
  const minDist = radius + seg.halfThick;

  if (distSq < minDist * minDist) {
    const dist = Math.sqrt(distSq);
    if (dist > 1e-5) {
      const push = minDist - dist;
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    } else {
      // Fallback push along perpendicular normal
      const len = Math.sqrt(lenSq);
      pos.x += (-vz / len) * minDist;
      pos.z += (vx / len) * minDist;
    }
    return true;
  }
  return false;
}

// Compute smooth stair ramp elevation if player is on any staircase
function getStairSurfaceY(px, pz, feetY) {
  let bestY = -Infinity;
  const pad = 0.22;

  for (let k = 0; k < state.stairs.length; k++) {
    const st = state.stairs[k];
    if (feetY < st.baseY - 0.9 || feetY > st.topY + 0.9) continue;

    if (px >= st.shaftXMin - pad && px <= st.shaftXMax + pad &&
        pz >= st.shaftZMin - pad && pz <= st.shaftZMax + pad) {
      // Check if within stair width
      if (st.di !== 0) {
        if (pz < st.zMin - 0.15 || pz > st.zMax + 0.15) continue;
        const tRaw = st.di > 0
          ? (px - st.xMin) / (st.xMax - st.xMin)
          : (st.xMax - px) / (st.xMax - st.xMin);
        const t = Math.max(0, Math.min(1, tRaw));
        const y = st.baseY + t * (st.topY - st.baseY);
        if (y <= feetY + CONFIG.STEP_UP_HEIGHT + 0.25 && y > bestY) {
          bestY = y;
        }
      } else {
        if (px < st.xMin - 0.15 || px > st.xMax + 0.15) continue;
        const tRaw = st.dj > 0
          ? (pz - st.zMin) / (st.zMax - st.zMin)
          : (st.zMax - pz) / (st.zMax - st.zMin);
        const t = Math.max(0, Math.min(1, tRaw));
        const y = st.baseY + t * (st.topY - st.baseY);
        if (y <= feetY + CONFIG.STEP_UP_HEIGHT + 0.25 && y > bestY) {
          bestY = y;
        }
      }
    }
  }
  return bestY;
}

// Compute highest walkable support surface under (px, pz) at or below feetY + stepUp
function getSupportSurfaceY(px, pz, feetY, colliders) {
  const maze = state.mazeData;
  const { cellI, cellJ } = maze.worldToCell(px, pz);
  let supportY = -Infinity;

  // 1. Stair ramp surface
  const stairY = getStairSurfaceY(px, pz, feetY);
  if (stairY > supportY) supportY = stairY;

  // 2. Solid floor slabs across all 4 floors
  for (let f = 0; f < maze.numFloors; f++) {
    const floorY = f * CONFIG.FLOOR_HEIGHT;
    if (floorY > feetY + CONFIG.STEP_UP_HEIGHT + 0.05) continue;

    // Check if floor is omitted due to merged zone
    const mz = maze.mergedCellLookup[f][cellI][cellJ];
    if (mz && f > mz.fStart) continue;

    // Check if floor is omitted due to stair opening from below (only the exact stair footprint, leaving walkways around it!)
    const isStairOpening = state.stairs.some(st =>
      st.toFloor === f &&
      px > st.xMin && px < st.xMax &&
      pz > st.zMin && pz < st.zMax
    );
    if (isStairOpening) continue;

    // Check if over exit pit on exit floor
    if (f === maze.exit.floor && cellI === maze.centerIdx && cellJ === maze.centerIdx) {
      continue;
    }

    // Check if inside a floor hole cutout
    const hole = state.floorHoles[`${f},${cellI},${cellJ}`];
    if (hole && px > hole.xMin && px < hole.xMax && pz > hole.zMin && pz < hole.zMax) {
      continue;
    }

    if (floorY > supportY) supportY = floorY;
  }

  // 3. Top surfaces of furniture / tables / crates / cars (jumpable & climbable!)
  const footPad = CONFIG.COLLISION_RADIUS * 0.72;
  for (let i = 0; i < colliders.length; i++) {
    const col = colliders[i];
    if (col.type === 'segment' || col.type === 'wall' || col.type === 'door') continue;
    const b = col.box;
    if (!b) continue;
    if (px + footPad > b.xMin && px - footPad < b.xMax && pz + footPad > b.zMin && pz - footPad < b.zMax) {
      if (b.yMax <= feetY + CONFIG.STEP_UP_HEIGHT + 0.08 && b.yMax > supportY) {
        supportY = b.yMax;
      }
    }
  }

  return supportY;
}

// Check if standing up from crouch would bonk head on a table or ceiling
function canStandUp(px, feetY, pz, colliders) {
  const standTopY = feetY + CONFIG.EYE_HEIGHT + 0.1;
  for (let i = 0; i < colliders.length; i++) {
    const col = colliders[i];
    if (!col.box) continue;
    const b = col.box;
    if (px + 0.25 > b.xMin && px - 0.25 < b.xMax && pz + 0.25 > b.zMin && pz - 0.25 < b.zMax) {
      if (b.yMin > feetY + 0.4 && b.yMin < standTopY) {
        return false;
      }
    }
  }
  return true;
}

function triggerAbyssReset() {
  if (state.isFallingIntoAbyss) return;
  state.isFallingIntoAbyss = true;

  let overlay = document.getElementById('abyss-flash');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'abyss-flash';
    overlay.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;z-index:9998;pointer-events:none;transition:opacity 0.25s ease;';
    document.body.appendChild(overlay);
  }
  overlay.style.opacity = '1';

  setTimeout(() => {
    const maze = state.mazeData;
    if (maze && state.controls) {
      // Pick a safe random cell on a random floor (not a hole, not exit, not merged void)
      let safe = { x: maze.start.x, y: maze.start.baseY + CONFIG.EYE_HEIGHT, z: maze.start.z };
      for (let att = 0; att < 40; att++) {
        const f = Math.floor(Math.random() * maze.numFloors);
        const i = 1 + Math.floor(Math.random() * (maze.N - 2));
        const j = 1 + Math.floor(Math.random() * (maze.N - 2));
        if (f === maze.exit.floor && i === maze.centerIdx && j === maze.centerIdx) continue;
        if (state.floorHoles[`${f},${i},${j}`]) continue;
        const mz = maze.mergedCellLookup[f][i][j];
        if (mz && f > mz.fStart) continue;
        if (state.stairs.some(st => st.toFloor === f && ((st.i1 === i && st.j1 === j) || (st.i2 === i && st.j2 === j)))) continue;
        safe = { x: maze.cellCX(i), y: f * CONFIG.FLOOR_HEIGHT + CONFIG.EYE_HEIGHT, z: maze.cellCZ(j) };
        break;
      }
      state.controls.object.position.set(safe.x, safe.y, safe.z);
      state.playerVelocityY = 0;
      state.isOnGround = true;
      state.playerHealth = Math.max(10, state.playerHealth - 15);
      updateHealthHUD();
    }
    setTimeout(() => {
      overlay.style.opacity = '0';
      state.isFallingIntoAbyss = false;
    }, 220);
  }, 320);
}

function updateHidingState(pos) {
  const feetY = pos.y - state.currentEyeHeight;
  let hidden = false;

  // 1. Inside a hiding closet OR crouched under a table/bed
  for (let i = 0; i < state.hidingSpots.length; i++) {
    const hs = state.hidingSpots[i];
    if (Math.abs(hs.yMin - feetY) > 1.2) continue;
    if (pos.x >= hs.xMin - 0.12 && pos.x <= hs.xMax + 0.12 &&
        pos.z >= hs.zMin - 0.12 && pos.z <= hs.zMax + 0.12) {
      if (hs.type === 'closet') {
        hidden = true;
        break;
      } else if (hs.type === 'table' && state.isCrouching) {
        hidden = true;
        break;
      }
    }
  }

  // 2. Crouched in a dark corner with flashlight OFF (far from active lights)
  if (!hidden && state.isCrouching && !state.flashlightOn) {
    let nearBrightLight = false;
    for (let s = 0; s < state.lightPool.length; s++) {
      const slot = state.lightPool[s];
      if (slot.assignedFixture && slot.light.intensity > 0.5) {
        const dSq = pos.distanceToSquared(slot.light.position);
        if (dSq < 6.5 * 6.5) {
          nearBrightLight = true;
          break;
        }
      }
    }
    if (!nearBrightLight) hidden = true;
  }

  state.isHidden = hidden;
  if (DOM.crouchBadge) DOM.crouchBadge.classList.toggle('active', state.isCrouching);
  if (DOM.hiddenBadge) DOM.hiddenBadge.classList.toggle('active', state.isHidden);
}

export function processMovement(dt, triggerExitFlash, showVictoryScreen) {
  if (!state.controls || !state.controls.isLocked) return;
  if (state.isFallingIntoExit || state.isFallingIntoAbyss) return;

  const currentPos = state.controls.object.position;
  const maze = state.mazeData;
  const { floor, cellI, cellJ } = maze.worldToCell3D(currentPos.x, currentPos.y, currentPos.z);

  // Update Floor HUD
  if (floor !== state.currentFloor) {
    state.currentFloor = floor;
    if (DOM.floorValueHUD) DOM.floorValueHUD.textContent = `F${floor + 1}`;
  }

  // 1. Exit pit check on exit floor
  if (floor === maze.exit.floor && cellI === maze.centerIdx && cellJ === maze.centerIdx) {
    const dx = currentPos.x - maze.exit.x;
    const dz = currentPos.z - maze.exit.z;
    const exitRadius = Math.min(maze.exit.halfW, maze.exit.halfH) * 0.92;
    if (dx * dx + dz * dz < exitRadius * exitRadius) {
      state.isFallingIntoExit = true;
      triggerExitFlash(() => {
        state.controls.unlock();
        showVictoryScreen();
      });
      return;
    }
  }

  // Gather 3D neighborhood colliders (current floor + adjacent floors for vertical transitions)
  const collidersToCheck = [];
  for (let df = -1; df <= 1; df++) {
    const cf = floor + df;
    if (cf < 0 || cf >= maze.numFloors) continue;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const key = `${cf},${cellI + di},${cellJ + dj}`;
        if (state.gridColliders[key]) {
          collidersToCheck.push(...state.gridColliders[key]);
        }
      }
    }
  }

  // 2. Smooth Crouch Eye Height transition
  let feetY = currentPos.y - state.currentEyeHeight;
  const wantEye = state.isCrouching
    ? CONFIG.CROUCH_EYE_HEIGHT
    : (canStandUp(currentPos.x, feetY, currentPos.z, collidersToCheck) ? CONFIG.EYE_HEIGHT : CONFIG.CROUCH_EYE_HEIGHT);

  const prevEye = state.currentEyeHeight;
  state.currentEyeHeight = THREE.MathUtils.lerp(state.currentEyeHeight, wantEye, Math.min(1, 14 * dt));
  currentPos.y += (state.currentEyeHeight - prevEye);
  feetY = currentPos.y - state.currentEyeHeight;

  // 3. Coyote Time & Jump Buffering for crisp jumping
  if (state.isOnGround) state.coyoteTimer = 0.13;
  else state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);

  if (state.jumpBufferTimer > 0) {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
    if (state.coyoteTimer > 0) {
      state.playerVelocityY = CONFIG.JUMP_VELOCITY;
      state.isOnGround = false;
      state.coyoteTimer = 0;
      state.jumpBufferTimer = 0;
    }
  }

  // 4. Horizontal Movement + Sliding Collisions (AABB + Segment for curved/diagonal walls)
  const floorData = maze.floors[floor];
  const cellBiome = floorData && floorData.biomeGrid[cellI] ? floorData.biomeGrid[cellI][cellJ] : 'base';
  state.inWater = (cellBiome === 'poolrooms' && Math.abs(feetY - floor * CONFIG.FLOOR_HEIGHT) < 0.35);

  let speed = state.isCrouching
    ? CONFIG.CROUCH_SPEED
    : (state.isRunning ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED);
  if (state.inWater) speed *= CONFIG.WATER_SPEED_MULT;

  state.controls.object.updateMatrixWorld();
  const bodyMatrix = state.controls.object.matrixWorld;
  const moveDirection = new THREE.Vector3();

  const camDir = new THREE.Vector3().setFromMatrixColumn(bodyMatrix, 2).negate();
  camDir.y = 0;
  camDir.normalize();

  const camRight = new THREE.Vector3().setFromMatrixColumn(bodyMatrix, 0);
  camRight.y = 0;
  camRight.normalize();

  if (state.moveForward) moveDirection.add(camDir);
  if (state.moveBackward) moveDirection.sub(camDir);
  if (state.moveRight) moveDirection.add(camRight);
  if (state.moveLeft) moveDirection.sub(camRight);
  moveDirection.normalize();

  const prevX = currentPos.x;
  const prevZ = currentPos.z;

  if (moveDirection.lengthSq() > 0) {
    const dx = moveDirection.x * speed * dt;
    const dz = moveDirection.z * speed * dt;

    // Test X axis against AABBs (ignoring low step-up furniture tops)
    const nextX = currentPos.x + dx;
    let xBlocked = false;
    for (let i = 0; i < collidersToCheck.length; i++) {
      const col = collidersToCheck[i];
      if (col.type === 'segment' || !col.box) continue;
      if (col.type !== 'wall' && col.type !== 'door' && col.box.yMax <= feetY + CONFIG.STEP_UP_HEIGHT) continue;
      if (check3DCollision(nextX, currentPos.y, currentPos.z, CONFIG.COLLISION_RADIUS, col.box)) {
        xBlocked = true;
        break;
      }
    }
    if (!xBlocked) currentPos.x = nextX;

    // Test Z axis against AABBs
    const nextZ = currentPos.z + dz;
    let zBlocked = false;
    for (let i = 0; i < collidersToCheck.length; i++) {
      const col = collidersToCheck[i];
      if (col.type === 'segment' || !col.box) continue;
      if (col.type !== 'wall' && col.type !== 'door' && col.box.yMax <= feetY + CONFIG.STEP_UP_HEIGHT) continue;
      if (check3DCollision(currentPos.x, currentPos.y, nextZ, CONFIG.COLLISION_RADIUS, col.box)) {
        zBlocked = true;
        break;
      }
    }
    if (!zBlocked) currentPos.z = nextZ;

    // Resolve Curved & Diagonal Wall Segment Collisions (2 passes for crisp corner sliding)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < collidersToCheck.length; i++) {
        const col = collidersToCheck[i];
        if (col.type === 'segment') {
          resolveSegmentCollision(currentPos, CONFIG.COLLISION_RADIUS, col, state.currentEyeHeight);
        }
      }
    }
  }

  // 5. Vertical Physics: Gravity, Stairs, Furniture Landing, Ceiling Bonk, Floor Holes & Abyss
  feetY = currentPos.y - state.currentEyeHeight;
  const supportY = getSupportSurfaceY(currentPos.x, currentPos.z, feetY, collidersToCheck);

  state.playerVelocityY -= CONFIG.GRAVITY * dt;
  let nextFeetY = feetY + state.playerVelocityY * dt;

  // Ceiling collision when jumping upward
  if (state.playerVelocityY > 0) {
    const ceilY = floor * CONFIG.FLOOR_HEIGHT + CONFIG.WALL_HEIGHT - 0.15;
    const mz = maze.mergedCellLookup[floor][cellI][cellJ];
    const inMergedOpenCeil = mz && floor < mz.fEnd;
    const inStairOpenCeil = state.stairs.some(st =>
      st.fromFloor === floor && ((st.i1 === cellI && st.j1 === cellJ) || (st.i2 === cellI && st.j2 === cellJ))
    );
    if (!inMergedOpenCeil && !inStairOpenCeil && (nextFeetY + state.currentEyeHeight) > ceilY) {
      nextFeetY = ceilY - state.currentEyeHeight;
      state.playerVelocityY = 0;
    }
  }

  // Landing on floor, stairs, or furniture tops
  if (supportY > -Infinity && nextFeetY <= supportY && state.playerVelocityY <= 0) {
    nextFeetY = supportY;
    state.playerVelocityY = 0;
    state.isOnGround = true;
  } else if (supportY > -Infinity && state.isOnGround && Math.abs(feetY - supportY) <= CONFIG.STEP_UP_HEIGHT + 0.18 && state.playerVelocityY <= 0.1) {
    // Smoothly hug stairs and small steps when walking downhill or up
    nextFeetY = supportY;
    state.playerVelocityY = 0;
    state.isOnGround = true;
  } else {
    state.isOnGround = false;
  }

  currentPos.y = nextFeetY + state.currentEyeHeight;

  // Abyss Pitfall check: fell below floor 0 or deep into an abyss hole
  const currentHole = state.floorHoles[`${floor},${cellI},${cellJ}`];
  if (nextFeetY < -3.0 || (currentHole && currentHole.type === 'abyss' && nextFeetY < floor * CONFIG.FLOOR_HEIGHT - 2.6)) {
    triggerAbyssReset();
    return;
  }

  // 6. Hiding state check
  updateHidingState(currentPos);

  // 7. Footsteps & View Bobbing
  const actualDist = Math.hypot(currentPos.x - prevX, currentPos.z - prevZ);
  if (actualDist > 0.0005 && state.isOnGround) {
    state.distanceTraveled += actualDist;
    const strideDistance = state.isCrouching ? 1.85 : (state.isRunning ? 1.6 : 1.35);

    if (state.distanceTraveled >= strideDistance) {
      state.lastFoot = state.lastFoot === 'left' ? 'right' : 'left';
      const randIdx = Math.floor(Math.random() * 2);
      if (state.footstepSounds && !state.soundMuted) {
        const sound = state.footstepSounds[state.lastFoot][randIdx];
        if (sound) {
          sound.volume = state.isCrouching ? 0.25 : 0.9;
          sound.currentTime = 0;
          sound.play().catch(() => { });
        }
      }
      state.distanceTraveled = 0;
    }

    state.bobTimer += dt * (state.isRunning ? 14.5 : (state.isCrouching ? 6.5 : 9.5));
    const bobAmpY = state.isRunning ? 0.072 : (state.isCrouching ? 0.018 : 0.035);
    const bobAmpZ = state.isRunning ? 0.016 : (state.isCrouching ? 0.004 : 0.008);
    state.camera.position.y = Math.sin(state.bobTimer) * bobAmpY;
    state.camera.rotation.z = Math.cos(state.bobTimer / 2) * bobAmpZ;
  } else {
    state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 0, 8 * dt);
    state.camera.rotation.z = THREE.MathUtils.lerp(state.camera.rotation.z, 0, 8 * dt);
    if (actualDist <= 0.0005) state.bobTimer = 0;
  }
}
