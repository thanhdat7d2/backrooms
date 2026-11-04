import * as THREE from 'three';
import { state, CONFIG } from '../state.js';
import {
  playMonsterHitSound,
  playSpookySound,
  playEntityFootstep,
  playEntityBreathCue,
  setChaseTensionLevel
} from './audio.js';
import { updateHealthHUD } from './physics.js';

export function triggerTeleportFlash() {
  let flashDiv = document.getElementById('teleport-flash');
  if (!flashDiv) {
    flashDiv = document.createElement('div');
    flashDiv.id = 'teleport-flash';
    flashDiv.style.cssText = 'position:fixed;inset:0;background:red;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.05s ease-out;';
    document.body.appendChild(flashDiv);
  }
  flashDiv.style.opacity = '0.75';
  setTimeout(() => {
    flashDiv.style.transition = 'opacity 0.5s ease-in';
    flashDiv.style.opacity = '0';
  }, 50);
}

export function triggerExitFlash(callback) {
  let flashDiv = document.getElementById('exit-flash');
  if (!flashDiv) {
    flashDiv = document.createElement('div');
    flashDiv.id = 'exit-flash';
    flashDiv.style.cssText = 'position:fixed;inset:0;background:white;opacity:0;z-index:9999;pointer-events:none;transition:opacity 0.25s ease-out;';
    document.body.appendChild(flashDiv);
  }
  flashDiv.style.opacity = '1';
  setTimeout(() => {
    if (callback) callback();
    setTimeout(() => {
      flashDiv.style.transition = 'opacity 0.6s ease-in';
      flashDiv.style.opacity = '0';
    }, 300);
  }, 280);
}

export function teleportPlayerSpooky() {
  if (state.isFallingIntoExit) return;
  playMonsterHitSound();

  const maze = state.mazeData;
  const f = state.currentFloor;
  const exitWorldPos = new THREE.Vector3(maze.exit.x, maze.exit.baseY + CONFIG.EYE_HEIGHT, maze.exit.z);
  const currentPlayerPos = state.controls.object.position.clone();
  const currentDistToExit = currentPlayerPos.distanceTo(exitWorldPos);

  const candidateCells = [];
  for (let i = 1; i < maze.N - 1; i++) {
    for (let j = 1; j < maze.N - 1; j++) {
      if (f === maze.exit.floor && i === maze.centerIdx && j === maze.centerIdx) continue;
      if (state.floorHoles[`${f},${i},${j}`]) continue;
      const mz = maze.mergedCellLookup[f][i][j];
      if (mz && f > mz.fStart) continue;
      const cx = maze.cellCX(i);
      const cz = maze.cellCZ(j);
      const cellDist = Math.hypot(cx - exitWorldPos.x, cz - exitWorldPos.z);
      if (cellDist > currentDistToExit + 4.0) {
        candidateCells.push({ x: cx, z: cz });
      }
    }
  }

  const target = candidateCells.length > 0
    ? candidateCells[Math.floor(Math.random() * candidateCells.length)]
    : { x: maze.start.x, z: maze.start.z };

  state.controls.object.position.set(target.x, f * CONFIG.FLOOR_HEIGHT + CONFIG.EYE_HEIGHT, target.z);
  state.playerVelocityY = 0;
  state.isOnGround = true;
  triggerTeleportFlash();
}

export function updateWallPicturesSpooky() {
  if (!state.activeWallPictures || state.activeWallPictures.length === 0) return;
  const playerPos = state.controls.object.position;
  const triggerDistSq = (CONFIG.COLLISION_RADIUS + 0.14) * (CONFIG.COLLISION_RADIUS + 0.14);

  for (let i = 0; i < state.activeWallPictures.length; i++) {
    const pic = state.activeWallPictures[i];
    if (Math.abs(playerPos.y - pic.mesh.position.y) > 1.8) continue;
    const dx = playerPos.x - pic.mesh.position.x;
    const dz = playerPos.z - pic.mesh.position.z;
    if (dx * dx + dz * dz < triggerDistSq) {
      teleportPlayerSpooky();
      break;
    }
  }
}

// ----------------------------------------------------------
// 3D ARTICULATED CHASING ENTITY WITH 2D CHASE IMAGE AS HEAD
// ----------------------------------------------------------
function create3DEntityModel(headTexture) {
  const root = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x141216,
    roughness: 0.78,
    metalness: 0.18
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x261d22,
    roughness: 0.65,
    metalness: 0.25
  });

  // Pelvis
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.22), bodyMat);
  pelvis.position.y = 1.02;
  root.add(pelvis);

  // Hunched Spine / Torso
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.10, 0);
  root.add(torsoGroup);

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.72, 8), bodyMat);
  spine.position.y = 0.36;
  torsoGroup.add(spine);

  // Uncanny ribcage ridges
  for (let r = 0; r < 4; r++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.38 - r * 0.03, 0.045, 0.24), jointMat);
    rib.position.y = 0.24 + r * 0.13;
    torsoGroup.add(rib);
  }

  // Shoulders bar
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.18), bodyMat);
  shoulders.position.y = 0.72;
  torsoGroup.add(shoulders);

  // Articulated Arms (elongated uncanny stalker arms with claws)
  const makeArm = (side) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.36, 0.70, 0);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.56, 7), bodyMat);
    upper.position.y = -0.28;
    armPivot.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.56;
    armPivot.add(elbow);

    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.03, 0.58, 7), jointMat);
    fore.position.y = -0.29;
    elbow.add(fore);

    // 3 elongated claws
    for (let c = -1; c <= 1; c++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.18, 5), jointMat);
      claw.rotation.x = Math.PI;
      claw.position.set(c * 0.028, -0.65, 0.02);
      elbow.add(claw);
    }

    torsoGroup.add(armPivot);
    return { pivot: armPivot, elbow };
  };

  const leftArm = makeArm(-1);
  const rightArm = makeArm(1);

  // Articulated Legs
  const makeLeg = (side) => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.15, 1.0, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.54, 7), bodyMat);
    thigh.position.y = -0.27;
    hipPivot.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.54;
    hipPivot.add(knee);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.52, 7), jointMat);
    shin.position.y = -0.26;
    knee.add(shin);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.24), bodyMat);
    foot.position.set(0, -0.50, 0.06);
    knee.add(foot);

    root.add(hipPivot);
    return { pivot: hipPivot, knee };
  };

  const leftLeg = makeLeg(-1);
  const rightLeg = makeLeg(1);

  // Neck + 2D Chase Image Head!
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.84, 0.08);
  torsoGroup.add(headPivot);

  const img = headTexture && headTexture.image;
  const aspect = img ? (img.width / img.height) : 1.0;
  const headH = 0.62;
  const headW = Math.min(0.75, Math.max(0.42, headH * aspect));

  const headMat = new THREE.MeshBasicMaterial({
    map: headTexture,
    transparent: true,
    side: THREE.DoubleSide
  });
  const headMesh = new THREE.Mesh(new THREE.PlaneGeometry(headW, headH), headMat);
  headMesh.position.y = headH * 0.35;
  headPivot.add(headMesh);

  return {
    root,
    torsoGroup,
    headPivot,
    headMesh,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg
  };
}

function animate3DEntity(monster, dt, isMoving, distToPlayer) {
  const rig = monster.rig;
  if (!rig) return;

  const isChasing = monster.aiState === 'CHASE';
  const cycleSpeed = isMoving ? (isChasing ? 11.5 : 6.0) : 1.8;
  const prevPhase = monster.animPhase;
  monster.animPhase += dt * cycleSpeed;

  // Trigger heavy entity footsteps synced with stride crossings!
  if (isMoving) {
    const prevStep = Math.floor(prevPhase / Math.PI);
    const currStep = Math.floor(monster.animPhase / Math.PI);
    if (currStep > prevStep) {
      playEntityFootstep(distToPlayer);
    }
  }

  const s = Math.sin(monster.animPhase);
  const c = Math.cos(monster.animPhase);
  const strideAmp = isMoving ? (isChasing ? 0.72 : 0.42) : 0.05;

  // Legs gait
  rig.leftLeg.pivot.rotation.x = s * strideAmp;
  rig.leftLeg.knee.rotation.x = Math.max(0, -c * strideAmp * 0.9);
  rig.rightLeg.pivot.rotation.x = -s * strideAmp;
  rig.rightLeg.knee.rotation.x = Math.max(0, c * strideAmp * 0.9);

  // Arms: frantic reaching forward when chasing, swaying when stalking
  if (isChasing) {
    rig.leftArm.pivot.rotation.x = -1.25 + Math.sin(monster.animPhase * 1.2) * 0.32;
    rig.leftArm.elbow.rotation.x = -0.35;
    rig.rightArm.pivot.rotation.x = -1.25 - Math.sin(monster.animPhase * 1.2) * 0.32;
    rig.rightArm.elbow.rotation.x = -0.35;
    rig.torsoGroup.rotation.x = 0.28 + Math.sin(monster.animPhase * 2) * 0.06;
  } else {
    rig.leftArm.pivot.rotation.x = -s * strideAmp * 0.8;
    rig.leftArm.elbow.rotation.x = -0.25;
    rig.rightArm.pivot.rotation.x = s * strideAmp * 0.8;
    rig.rightArm.elbow.rotation.x = -0.25;
    rig.torsoGroup.rotation.x = 0.14;
  }

  // Uncanny jitter & twitching on the 2D image head
  const t = performance.now() * 0.001;
  rig.headMesh.rotation.z = Math.sin(t * 7.5) * 0.18 + (Math.random() - 0.5) * (isChasing ? 0.14 : 0.04);
  const stretch = 1.0 + Math.sin(t * 14.0) * (isChasing ? 0.12 : 0.04);
  rig.headMesh.scale.set(stretch, 2.0 - stretch, 1.0);
}

// ----------------------------------------------------------
// LINE-OF-SIGHT & 3D MULTI-FLOOR PATHFINDING
// ----------------------------------------------------------
function hasLineOfSight(fromPos, toPos) {
  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const dz = toPos.z - fromPos.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > 22.0) return false;
  if (dist < 0.6) return true;

  const maze = state.mazeData;
  const steps = Math.ceil(dist / 0.48);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const px = fromPos.x + dx * t;
    const py = fromPos.y + dy * t;
    const pz = fromPos.z + dz * t;
    const { floor, cellI, cellJ } = maze.worldToCell3D(px, py + CONFIG.EYE_HEIGHT * 0.5, pz);
    const cols = state.gridColliders[`${floor},${cellI},${cellJ}`];
    if (!cols) continue;

    for (let k = 0; k < cols.length; k++) {
      const col = cols[k];
      if (col.type === 'wall' || col.type === 'door' || col.type === 'pillar') {
        const b = col.box;
        if (b && px >= b.xMin && px <= b.xMax && py >= b.yMin && py <= b.yMax && pz >= b.zMin && pz <= b.zMax) {
          // Ignore thin glass window colliders (thickness ~0.12) so entity can see through windows!
          const sx = b.xMax - b.xMin;
          const sz = b.zMax - b.zMin;
          if (Math.min(sx, sz) <= 0.14 && col.type === 'wall') continue;
          return false;
        }
      }
    }
  }
  return true;
}

function findPath3D(startPos, targetPos) {
  const maze = state.mazeData;
  if (!maze) return [];

  const sCell = maze.worldToCell3D(startPos.x, startPos.y + CONFIG.EYE_HEIGHT, startPos.z);
  const tCell = maze.worldToCell3D(targetPos.x, targetPos.y + CONFIG.EYE_HEIGHT, targetPos.z);

  if (sCell.floor === tCell.floor && sCell.cellI === tCell.cellI && sCell.cellJ === tCell.cellJ) {
    return [new THREE.Vector3(targetPos.x, tCell.floor * CONFIG.FLOOR_HEIGHT, targetPos.z)];
  }

  const N = maze.N;
  const startKey = `${sCell.floor},${sCell.cellI},${sCell.cellJ}`;
  const targetKey = `${tCell.floor},${tCell.cellI},${tCell.cellJ}`;

  const stairAdj = new Map();
  for (const st of maze.stairs) {
    const k1 = `${st.fromFloor},${st.i1},${st.j1}`;
    const k2 = `${st.toFloor},${st.i2},${st.j2}`;
    if (!stairAdj.has(k1)) stairAdj.set(k1, []);
    if (!stairAdj.has(k2)) stairAdj.set(k2, []);
    stairAdj.get(k1).push({ f: st.toFloor, i: st.i2, j: st.j2 });
    stairAdj.get(k2).push({ f: st.fromFloor, i: st.i1, j: st.j1 });
  }

  const queue = [{ f: sCell.floor, i: sCell.cellI, j: sCell.cellJ }];
  const visited = new Set([startKey]);
  const parent = new Map();
  let head = 0;
  let found = false;

  while (head < queue.length && head < 1400) {
    const curr = queue[head++];
    const cKey = `${curr.f},${curr.i},${curr.j}`;
    if (cKey === targetKey) { found = true; break; }

    const fl = maze.floors[curr.f];
    if (!fl) continue;
    const { f, i, j } = curr;

    const pushNb = (nf, ni, nj) => {
      const nk = `${nf},${ni},${nj}`;
      if (visited.has(nk)) return;
      visited.add(nk);
      parent.set(nk, curr);
      queue.push({ f: nf, i: ni, j: nj });
    };

    if (i > 0 && !fl.vWalls[i - 1][j]) pushNb(f, i - 1, j);
    if (i < N - 1 && !fl.vWalls[i][j]) pushNb(f, i + 1, j);
    if (j > 0 && !fl.hWalls[i][j - 1]) pushNb(f, i, j - 1);
    if (j < N - 1 && !fl.hWalls[i][j]) pushNb(f, i, j + 1);

    const sts = stairAdj.get(cKey);
    if (sts) {
      for (const nxt of sts) pushNb(nxt.f, nxt.i, nxt.j);
    }
  }

  if (!found) {
    return [new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)];
  }

  const nodes = [];
  let curKey = targetKey;
  let curNode = { f: tCell.floor, i: tCell.cellI, j: tCell.cellJ };
  while (curNode) {
    nodes.push(curNode);
    const p = parent.get(curKey);
    if (!p) break;
    curKey = `${p.f},${p.i},${p.j}`;
    curNode = p;
  }
  nodes.reverse();

  const pts = [];
  for (let k = 1; k < nodes.length; k++) {
    const n = nodes[k];
    pts.push(new THREE.Vector3(maze.cellCX(n.i), n.f * CONFIG.FLOOR_HEIGHT, maze.cellCZ(n.j)));
  }
  pts.push(new THREE.Vector3(targetPos.x, tCell.floor * CONFIG.FLOOR_HEIGHT, targetPos.z));
  return pts;
}

export function spawnChaseMonster() {
  if (state.chasePicTextures.length === 0 || !state.mazeData) return;

  const playerPos = state.controls.object.position;
  const maze = state.mazeData;
  const f = state.currentFloor;

  // Pick a walkable spawn cell 12–20m away on the player's current floor
  let spawnX = playerPos.x, spawnZ = playerPos.z;
  for (let att = 0; att < 35; att++) {
    const i = 1 + Math.floor(Math.random() * (maze.N - 2));
    const j = 1 + Math.floor(Math.random() * (maze.N - 2));
    const cx = maze.cellCX(i);
    const cz = maze.cellCZ(j);
    const d = Math.hypot(cx - playerPos.x, cz - playerPos.z);
    if (d >= 11.0 && d <= 22.0 && !state.floorHoles[`${f},${i},${j}`]) {
      spawnX = cx;
      spawnZ = cz;
      break;
    }
  }

  const texObj = state.chasePicTextures[Math.floor(Math.random() * state.chasePicTextures.length)];
  if (!texObj || !texObj.texture) return;

  const rig = create3DEntityModel(texObj.texture);
  const spawnY = f * CONFIG.FLOOR_HEIGHT;
  rig.root.position.set(spawnX, spawnY, spawnZ);
  state.scene.add(rig.root);

  let activeAudio = null;
  if (state.audioListener) {
    const randAudioUrl = CONFIG.CHASE_AUDIO_FILES[Math.floor(Math.random() * CONFIG.CHASE_AUDIO_FILES.length)];
    const buffer = state.preloadedScaryAudioBuffers[randAudioUrl];
    if (buffer) {
      activeAudio = new THREE.PositionalAudio(state.audioListener);
      activeAudio.setBuffer(buffer);
      activeAudio.setLoop(true);
      activeAudio.setRefDistance(2.2);
      activeAudio.setMaxDistance(20.0);
      activeAudio.setRolloffFactor(1.4);
      activeAudio.setVolume(0.75);
      rig.root.add(activeAudio);
      playSpookySound(activeAudio);
    }
  }

  const baseSpeed = Math.min(3.4 + (state.currentLevel - 1) * 0.45, CONFIG.RUN_SPEED * 0.88);
  state.activeChaseMonster = {
    mesh: rig.root,
    rig,
    audio: activeAudio,
    baseSpeed,
    aiState: 'INVESTIGATE', // Starts hunting toward player's vicinity, escalates to CHASE on LOS!
    lastKnownPos: playerPos.clone(),
    investigateTimer: 6.5,
    losLostTimer: 0,
    despawnTime: Date.now() + 32000 + Math.random() * 14000,
    path: [],
    lastTargetCellKey: '',
    animPhase: 0,
    nextBreathTime: Date.now() + 1800
  };
}

export function removeChaseMonster() {
  if (!state.activeChaseMonster) return;
  if (state.activeChaseMonster.audio) {
    try { if (state.activeChaseMonster.audio.isPlaying) state.activeChaseMonster.audio.stop(); } catch (e) { }
    if (state.activeSpookySound === state.activeChaseMonster.audio) state.activeSpookySound = null;
    try { state.activeChaseMonster.mesh.remove(state.activeChaseMonster.audio); } catch (e) { }
  }
  if (state.activeChaseMonster.mesh) {
    state.scene.remove(state.activeChaseMonster.mesh);
  }
  state.activeChaseMonster = null;
  setChaseTensionLevel(0);
  state.nextChaseSpawnTime = Date.now() + 24000 + Math.random() * 42000;
}

const _moveVec = new THREE.Vector3();
const _entityEye = new THREE.Vector3();
let _lastSpookyAudioUpdate = 0;

export function updateChaseMonster(dt, restartLevelCallback) {
  const now = Date.now();
  const playerPos = state.controls.object.position;

  if (!state.activeChaseMonster && now >= state.nextChaseSpawnTime && !state.isFallingIntoExit) {
    spawnChaseMonster();
  }

  if (!state.activeChaseMonster) {
    setChaseTensionLevel(0);
    return;
  }

  const monster = state.activeChaseMonster;
  if (now >= monster.despawnTime) {
    removeChaseMonster();
    return;
  }

  const mPos = monster.mesh.position;
  const dist3D = mPos.distanceTo(playerPos);

  // Periodic raspy breathing cue
  if (now >= monster.nextBreathTime) {
    playEntityBreathCue(dist3D);
    monster.nextBreathTime = now + (monster.aiState === 'CHASE' ? 1400 : 2800) + Math.random() * 900;
  }

  // 1. Perception / Line-of-Sight & Hiding check
  _entityEye.set(mPos.x, mPos.y + 1.85, mPos.z);
  const sightRange = state.flashlightOn ? 21.0 : 15.5;
  const canSee = !state.isHidden && dist3D < sightRange && hasLineOfSight(_entityEye, playerPos);
  // Running loudly near entity alerts it even without LOS
  const heardPlayer = !state.isCrouching && state.isRunning && dist3D < 7.5;

  if (canSee || heardPlayer) {
    monster.aiState = 'CHASE';
    monster.lastKnownPos.copy(playerPos);
    monster.losLostTimer = 0;
    monster.investigateTimer = 5.5;
  } else if (monster.aiState === 'CHASE') {
    monster.losLostTimer += dt;
    if (monster.losLostTimer > 1.8) {
      // Lost line of sight -> investigate last known position
      monster.aiState = 'INVESTIGATE';
    }
  }

  // 2. Determine movement target & speed by AI state
  let targetPos = monster.lastKnownPos;
  let curSpeed = monster.baseSpeed;

  if (monster.aiState === 'CHASE') {
    curSpeed = monster.baseSpeed * 1.25;
    targetPos = playerPos;
  } else if (monster.aiState === 'INVESTIGATE') {
    curSpeed = monster.baseSpeed * 0.72;
    const distToLast = Math.hypot(mPos.x - monster.lastKnownPos.x, mPos.z - monster.lastKnownPos.z);
    if (distToLast < 1.1) {
      monster.investigateTimer -= dt;
      if (monster.investigateTimer <= 0) {
        // Player successfully evaded / hid -> entity loses aggro and leaves!
        monster.aiState = 'PATROL';
        monster.despawnTime = Math.min(monster.despawnTime, now + 4000);
      }
    }
  } else {
    // PATROL / wandering away after losing aggro
    curSpeed = monster.baseSpeed * 0.55;
  }

  // 3. 3D Multi-Floor Pathfinding
  const tCell = state.mazeData.worldToCell3D(targetPos.x, targetPos.y, targetPos.z);
  const tKey = `${tCell.floor},${tCell.cellI},${tCell.cellJ}`;
  if (!monster.path || monster.path.length === 0 || monster.lastTargetCellKey !== tKey) {
    monster.path = findPath3D(mPos, targetPos);
    monster.lastTargetCellKey = tKey;
  }

  while (monster.path.length > 0) {
    const wp = monster.path[0];
    if (mPos.distanceTo(wp) < 0.35) monster.path.shift();
    else break;
  }

  let isMoving = false;
  if (monster.path.length > 0 && !(monster.aiState === 'INVESTIGATE' && Math.hypot(mPos.x - monster.lastKnownPos.x, mPos.z - monster.lastKnownPos.z) < 1.0)) {
    const wp = monster.path[0];
    _moveVec.subVectors(wp, mPos);
    const len = _moveVec.length();
    if (len > 0.01) {
      _moveVec.divideScalar(len);
      mPos.addScaledVector(_moveVec, Math.min(len, curSpeed * dt));
      isMoving = true;

      // Smoothly face movement direction
      const desiredYaw = Math.atan2(_moveVec.x, _moveVec.z);
      monster.mesh.rotation.y = desiredYaw;
    }
  } else {
    // Look around eerily while searching
    monster.mesh.rotation.y += Math.sin(now * 0.002) * dt * 1.4;
  }

  // Keep 2D head facing the player when in CHASE
  if (monster.aiState === 'CHASE') {
    monster.mesh.lookAt(playerPos.x, mPos.y, playerPos.z);
  }

  // Animate 3D articulated limbs + footstep audio
  animate3DEntity(monster, dt, isMoving, dist3D);

  // Dynamic chase music tension
  if (monster.aiState === 'CHASE') {
    const proximity = Math.max(0.45, 1.0 - dist3D / 22.0);
    setChaseTensionLevel(proximity);
  } else if (monster.aiState === 'INVESTIGATE') {
    setChaseTensionLevel(0.28);
  } else {
    setChaseTensionLevel(0.05);
  }

  // 4. Catch / Damage check (hidden players inside closets/under tables are safe!)
  if (!state.isHidden && dist3D < CONFIG.COLLISION_RADIUS + 0.55 && Math.abs((mPos.y + 1.0) - playerPos.y) < 1.6) {
    state.playerHealth -= 34;
    if (state.playerHealth < 0) state.playerHealth = 0;
    updateHealthHUD();
    removeChaseMonster();
    playMonsterHitSound();
    triggerTeleportFlash();

    if (state.playerHealth <= 0 && restartLevelCallback) {
      restartLevelCallback();
    }
  }
}

export function updateSpookyAudio() {
  if (!state.controls) return;
  const now = performance.now();
  if (now - _lastSpookyAudioUpdate < 160) return;
  _lastSpookyAudioUpdate = now;

  const playerPos = state.controls.object.position;
  const candidates = [];

  state.activeWallPictures.forEach(spot => {
    if (spot.canPlaySound && !spot.hasPlayedSound) {
      const dist = playerPos.distanceTo(spot.mesh.position);
      if (dist < 11.0) {
        candidates.push({ type: 'picture', entity: spot, mesh: spot.mesh, dist });
      }
    }
  });

  if (state.activeChaseMonster && state.activeChaseMonster.mesh) {
    const dist = playerPos.distanceTo(state.activeChaseMonster.mesh.position);
    if (dist < 20.0) {
      candidates.push({ type: 'monster', entity: state.activeChaseMonster, mesh: state.activeChaseMonster.mesh, dist });
    }
  }

  candidates.sort((a, b) => a.dist - b.dist);
  const nearest = candidates[0] || null;

  state.activeWallPictures.forEach(spot => {
    if (!(nearest && nearest.type === 'picture' && nearest.entity === spot) && spot.audio) {
      try { if (spot.audio.isPlaying) spot.audio.stop(); } catch (e) { }
      try { spot.mesh.remove(spot.audio); } catch (e) { }
      spot.audio = null;
    }
  });

  if (state.activeChaseMonster && !(nearest && nearest.type === 'monster') && state.activeChaseMonster.audio) {
    try { if (state.activeChaseMonster.audio.isPlaying) state.activeChaseMonster.audio.stop(); } catch (e) { }
  }

  if (nearest) {
    if (nearest.type === 'picture') {
      const spot = nearest.entity;
      if (!spot.audio && state.audioListener) {
        const randUrl = CONFIG.SCARY_AUDIO_FILES[Math.floor(Math.random() * CONFIG.SCARY_AUDIO_FILES.length)];
        const buffer = state.preloadedScaryAudioBuffers[randUrl];
        if (buffer) {
          const posAudio = new THREE.PositionalAudio(state.audioListener);
          posAudio.setBuffer(buffer);
          posAudio.setLoop(false);
          posAudio.setDistanceModel('linear');
          posAudio.setRefDistance(1.5);
          posAudio.setMaxDistance(11.0);
          posAudio.setVolume(0.75);
          spot.mesh.add(posAudio);
          playSpookySound(posAudio);
          spot.audio = posAudio;
          posAudio.onEnded = () => {
            spot.hasPlayedSound = true;
            if (spot.audio === posAudio) spot.audio = null;
            try { spot.mesh.remove(posAudio); } catch (e) { }
          };
        }
      }
    } else if (nearest.type === 'monster') {
      const monster = nearest.entity;
      if (monster.audio && !monster.audio.isPlaying) {
        playSpookySound(monster.audio);
      }
    }
  }
}
