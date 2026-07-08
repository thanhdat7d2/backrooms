import * as THREE from 'three';
import { state, CONFIG } from './state.js';
import { playMonsterHitSound, playSpookySound } from './audio.js';
import { updateHealthHUD } from './physics.js';

export function triggerTeleportFlash() {
  let flashDiv = document.getElementById('teleport-flash');
  if (!flashDiv) {
    flashDiv = document.createElement('div');
    flashDiv.id = 'teleport-flash';
    flashDiv.style.position = 'fixed';
    flashDiv.style.top = '0';
    flashDiv.style.left = '0';
    flashDiv.style.width = '100vw';
    flashDiv.style.height = '100vh';
    flashDiv.style.backgroundColor = 'red';
    flashDiv.style.opacity = '0';
    flashDiv.style.zIndex = '9999';
    flashDiv.style.pointerEvents = 'none';
    flashDiv.style.transition = 'opacity 0.05s ease-out';
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
    flashDiv.style.position = 'fixed';
    flashDiv.style.top = '0';
    flashDiv.style.left = '0';
    flashDiv.style.width = '100vw';
    flashDiv.style.height = '100vh';
    flashDiv.style.backgroundColor = 'white';
    flashDiv.style.opacity = '0';
    flashDiv.style.zIndex = '9999';
    flashDiv.style.pointerEvents = 'none';
    flashDiv.style.transition = 'opacity 0.25s ease-out';
    document.body.appendChild(flashDiv);
  }

  // Flash to full white
  flashDiv.style.opacity = '1';
  setTimeout(() => {
    if (callback) callback();
    // Fade out the flash after a short hold
    setTimeout(() => {
      flashDiv.style.transition = 'opacity 0.6s ease-in';
      flashDiv.style.opacity = '0';
    }, 300);
  }, 280);
}

export function teleportPlayerSpooky() {
  if (state.isFallingIntoExit) return;

  // Play jumpscare sound instantly
  playMonsterHitSound();

  const exitWorldPos = new THREE.Vector3(state.mazeData.exit.x, CONFIG.EYE_HEIGHT, state.mazeData.exit.z);
  const currentPlayerPos = state.controls.object.position.clone();
  const currentDistToExit = currentPlayerPos.distanceTo(exitWorldPos);

  // Find all cells further from the exit than current player pos + 5m
  const candidateCells = [];
  const N = state.mazeData.N;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if ((i === 0 && j === 0) || (i === state.mazeData.centerIdx && j === state.mazeData.centerIdx)) continue;

      const cx = state.mazeData.cellCX(i);
      const cz = state.mazeData.cellCZ(j);
      const cellPos = new THREE.Vector3(cx, CONFIG.EYE_HEIGHT, cz);
      const cellDist = cellPos.distanceTo(exitWorldPos);

      if (cellDist > currentDistToExit + 5.0) {
        candidateCells.push({ x: cx, z: cz });
      }
    }
  }

  let targetCell = null;
  if (candidateCells.length > 0) {
    targetCell = candidateCells[Math.floor(Math.random() * candidateCells.length)];
  } else {
    // If no cells are further (player is in the furthest corner), find the absolute furthest cell
    let maxDist = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const cx = state.mazeData.cellCX(i);
        const cz = state.mazeData.cellCZ(j);
        const cellPos = new THREE.Vector3(cx, CONFIG.EYE_HEIGHT, cz);
        const cellDist = cellPos.distanceTo(exitWorldPos);
        if (cellDist > maxDist) {
          maxDist = cellDist;
          targetCell = { x: cx, z: cz };
        }
      }
    }
  }

  if (targetCell) {
    state.controls.object.position.set(targetCell.x, CONFIG.EYE_HEIGHT, targetCell.z);
    state.playerVelocityY = 0;
    state.isOnGround = true;
    triggerTeleportFlash();
  }
}

export function updateWallPicturesSpooky() {
  if (!state.activeWallPictures || state.activeWallPictures.length === 0) return;

  const playerPos = state.controls.object.position;

  state.activeWallPictures.forEach(spot => {
    const mesh = spot.mesh;

    // Collision teleportation trigger
    const dx = playerPos.x - mesh.position.x;
    const dz = playerPos.z - mesh.position.z;
    const dist2D = Math.sqrt(dx * dx + dz * dz);
    if (dist2D < CONFIG.COLLISION_RADIUS + 0.1) {
      teleportPlayerSpooky();
    }
  });
}

export function spawnChaseMonster() {
  if (state.chasePicTextures.length === 0) return;

  const playerPos = state.controls.object.position;

  // Calculate spawn position exactly 15m away in a random direction
  const theta = Math.random() * Math.PI * 2;
  let spawnX = playerPos.x + Math.cos(theta) * 15.0;
  let spawnZ = playerPos.z + Math.sin(theta) * 15.0;

  // Clamp to keep the monster inside the boundaries of the maze
  const bound = (state.mazeData.sideLength / 2) - 1.0;
  spawnX = Math.max(-bound, Math.min(bound, spawnX));
  spawnZ = Math.max(-bound, Math.min(bound, spawnZ));

  const texObj = state.chasePicTextures[Math.floor(Math.random() * state.chasePicTextures.length)];
  if (!texObj || !texObj.texture) return;
  const texture = texObj.texture;

  const img = texture.image;
  const aspect = img ? (img.width / img.height) : 1.0;

  // Lock height to exactly 2.08m (1.6 * 1.3)
  const height = 1.6 * 1.3;
  const width = height * aspect;

  const planeGeom = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });

  const monsterMesh = new THREE.Mesh(planeGeom, mat);
  monsterMesh.position.set(spawnX, height / 2, spawnZ);
  state.scene.add(monsterMesh);

  let activeAudio = null;
  if (state.audioListener) {
    const randAudioUrl = CONFIG.CHASE_AUDIO_FILES[Math.floor(Math.random() * CONFIG.CHASE_AUDIO_FILES.length)];
    const buffer = state.preloadedScaryAudioBuffers[randAudioUrl];
    if (buffer) {
      activeAudio = new THREE.PositionalAudio(state.audioListener);
      activeAudio.setBuffer(buffer);
      activeAudio.setLoop(true);
      activeAudio.setRefDistance(2.0);
      activeAudio.setMaxDistance(20.0);
      activeAudio.setRolloffFactor(1.5);
      activeAudio.setVolume(0.95);

      monsterMesh.add(activeAudio);
      playSpookySound(activeAudio);
    }
  }

  // Duration: 4-10 seconds
  const duration = 9000 + Math.random() * 6000;
  // Speed: get faster each level (not faster than player running speed)
  const speed = Math.min(2.2 + (state.currentLevel - 1) * 0.5, CONFIG.RUN_SPEED);

  state.activeChaseMonster = {
    mesh: monsterMesh,
    audio: activeAudio,
    speed: speed,
    disappearTime: Date.now() + duration,
    path: [],
    lastPlayerCell: null
  };
}

export function removeChaseMonster() {
  if (!state.activeChaseMonster) return;

  if (state.activeChaseMonster.audio) {
    try {
      if (state.activeChaseMonster.audio.isPlaying) {
        state.activeChaseMonster.audio.stop();
      }
    } catch (e) { }
    if (state.activeSpookySound === state.activeChaseMonster.audio) {
      state.activeSpookySound = null;
    }
    try {
      state.activeChaseMonster.mesh.remove(state.activeChaseMonster.audio);
    } catch (e) { }
  }

  if (state.activeChaseMonster.mesh) {
    state.scene.remove(state.activeChaseMonster.mesh);
  }

  state.activeChaseMonster = null;
  state.nextChaseSpawnTime = Date.now() + 25000 + Math.random() * 50000;
}

function findPathToPlayer(monsterPos, playerPos) {
  if (!state.mazeData || !state.mazeData.hWalls || !state.mazeData.vWalls) return [];

  const startCell = state.mazeData.worldToCell(monsterPos.x, monsterPos.z);
  const targetCell = state.mazeData.worldToCell(playerPos.x, playerPos.z);

  const startI = startCell.cellI;
  const startJ = startCell.cellJ;
  const targetI = targetCell.cellI;
  const targetJ = targetCell.cellJ;

  if (startI === targetI && startJ === targetJ) {
    return [new THREE.Vector3(playerPos.x, monsterPos.y, playerPos.z)];
  }

  const N = state.mazeData.N;
  const hWalls = state.mazeData.hWalls;
  const vWalls = state.mazeData.vWalls;
  const colWidths = state.mazeData.colWidths;
  const rowHeights = state.mazeData.rowHeights;

  const queue = [{ i: startI, j: startJ }];
  const visited = Array.from({ length: N }, () => Array(N).fill(false));
  const parent = Array.from({ length: N }, () => Array(N).fill(null));
  visited[startI][startJ] = true;

  let found = false;
  while (queue.length > 0) {
    const curr = queue.shift();

    if (curr.i === targetI && curr.j === targetJ) {
      found = true;
      break;
    }

    const { i, j } = curr;
    // West (moving horizontally)
    if (i > 0 && !visited[i - 1][j] && !vWalls[i - 1][j] && rowHeights[j] >= 0.75) {
      visited[i - 1][j] = true;
      parent[i - 1][j] = { i, j };
      queue.push({ i: i - 1, j });
    }
    // East (moving horizontally)
    if (i < N - 1 && !visited[i + 1][j] && !vWalls[i][j] && rowHeights[j] >= 0.75) {
      visited[i + 1][j] = true;
      parent[i + 1][j] = { i, j };
      queue.push({ i: i + 1, j });
    }
    // South (moving vertically)
    if (j > 0 && !visited[i][j - 1] && !hWalls[i][j - 1] && colWidths[i] >= 0.75) {
      visited[i][j - 1] = true;
      parent[i][j - 1] = { i, j };
      queue.push({ i, j: j - 1 });
    }
    // North (moving vertically)
    if (j < N - 1 && !visited[i][j + 1] && !hWalls[i][j] && colWidths[i] >= 0.75) {
      visited[i][j + 1] = true;
      parent[i][j + 1] = { i, j };
      queue.push({ i, j: j + 1 });
    }
  }

  if (!found) {
    return [new THREE.Vector3(playerPos.x, monsterPos.y, playerPos.z)];
  }

  const path = [];
  let curr = { i: targetI, j: targetJ };
  while (curr !== null) {
    path.push(curr);
    curr = parent[curr.i][curr.j];
  }
  path.reverse();

  const points = [];
  for (let k = 1; k < path.length; k++) {
    const cell = path[k];
    points.push(new THREE.Vector3(state.mazeData.cellCX(cell.i), monsterPos.y, state.mazeData.cellCZ(cell.j)));
  }

  points.push(new THREE.Vector3(playerPos.x, monsterPos.y, playerPos.z));

  return points;
}

export function updateChaseMonster(dt, restartLevelCallback) {
  const now = Date.now();
  const playerPos = state.controls.object.position;

  // 1. Spawning check
  if (!state.activeChaseMonster && now >= state.nextChaseSpawnTime && !state.isFallingIntoExit) {
    spawnChaseMonster();
  }

  // 2. Chase update
  if (state.activeChaseMonster) {
    const monster = state.activeChaseMonster;

    if (now >= monster.disappearTime) {
      removeChaseMonster();
      return;
    }

    // Recalculate path if it's empty or player has changed cells
    const playerCell = state.mazeData.worldToCell(playerPos.x, playerPos.z);
    if (!monster.path || monster.path.length === 0 ||
        !monster.lastPlayerCell ||
        monster.lastPlayerCell.cellI !== playerCell.cellI ||
        monster.lastPlayerCell.cellJ !== playerCell.cellJ) {
      monster.path = findPathToPlayer(monster.mesh.position, playerPos);
      monster.lastPlayerCell = playerCell;
    }

    while (monster.path.length > 0) {
      const nextTarget = monster.path[0];
      const distance = monster.mesh.position.distanceTo(nextTarget);

      if (distance < 0.25) {
        monster.path.shift();
      } else {
        break;
      }
    }

    if (monster.path.length > 0) {
      const target = monster.path[0];
      const dir = new THREE.Vector3().subVectors(target, monster.mesh.position);
      dir.y = 0;
      dir.normalize();

      monster.mesh.position.addScaledVector(dir, monster.speed * dt);
    }

    // Always look at the player
    monster.mesh.lookAt(playerPos.x, monster.mesh.position.y, playerPos.z);

    // Apply dynamic creepy tilting and stretching
    const timeSec = now * 0.001;
    const tiltZ = Math.sin(timeSec * 8.0) * 0.35;
    const leanX = Math.cos(timeSec * 6.0) * 0.20;
    monster.mesh.rotateZ(tiltZ);
    monster.mesh.rotateX(leanX);

    const baseStretchX = 1.0 + Math.sin(timeSec * 15.0) * 0.15;
    const baseStretchY = 1.0 + Math.cos(timeSec * 18.0) * 0.15;
    const jitterX = (Math.random() - 0.5) * 0.1;
    const jitterY = (Math.random() - 0.5) * 0.1;
    monster.mesh.scale.set(baseStretchX + jitterX, baseStretchY + jitterY, 1.0);

    // Check collision with player
    const dx = playerPos.x - monster.mesh.position.x;
    const dz = playerPos.z - monster.mesh.position.z;
    const dist2D = Math.sqrt(dx * dx + dz * dz);
    if (dist2D < CONFIG.COLLISION_RADIUS + 0.3) {
      // Inflict damage
      state.playerHealth -= 34; // 3 hits to kill
      if (state.playerHealth < 0) state.playerHealth = 0;
      updateHealthHUD();

      // Despawn monster
      removeChaseMonster();

      // Play hitsound and trigger red flash
      playMonsterHitSound();
      triggerTeleportFlash();

      if (state.playerHealth <= 0) {
        if (restartLevelCallback) {
          restartLevelCallback();
        }
      }
    }
  }
}

export function updateSpookyAudio() {
  if (!state.controls) return;
  const playerPos = state.controls.object.position;

  // 1. Gather all candidates within range
  const candidates = [];

  state.activeWallPictures.forEach(spot => {
    if (spot.canPlaySound && !spot.hasPlayedSound) {
      const dist = playerPos.distanceTo(spot.mesh.position);
      if (dist < 12.0) {
        candidates.push({
          type: 'picture',
          entity: spot,
          mesh: spot.mesh,
          dist: dist
        });
      }
    }
  });

  if (state.activeChaseMonster && state.activeChaseMonster.mesh) {
    const dist = playerPos.distanceTo(state.activeChaseMonster.mesh.position);
    if (dist < 20.0) {
      candidates.push({
        type: 'monster',
        entity: state.activeChaseMonster,
        mesh: state.activeChaseMonster.mesh,
        dist: dist
      });
    }
  }

  // Sort by distance (closest first)
  candidates.sort((a, b) => a.dist - b.dist);
  const nearest = candidates[0] || null;

  // 2. Stop audio for all non-nearest entities
  state.activeWallPictures.forEach(spot => {
    if (nearest && nearest.type === 'picture' && nearest.entity === spot) {
      // Will handle in Step 3
    } else {
      if (spot.audio) {
        try {
          if (spot.audio.isPlaying) {
            spot.audio.stop();
          }
        } catch (e) { }
        try {
          spot.mesh.remove(spot.audio);
        } catch (e) { }
        spot.audio = null;
      }
    }
  });

  if (state.activeChaseMonster) {
    const isNearestMonster = nearest && nearest.type === 'monster';
    if (!isNearestMonster && state.activeChaseMonster.audio) {
      try {
        if (state.activeChaseMonster.audio.isPlaying) {
          state.activeChaseMonster.audio.stop();
        }
      } catch (e) { }
    }
  }

  // 3. Start or resume nearest audio
  if (nearest) {
    if (nearest.type === 'picture') {
      const spot = nearest.entity;
      if (!spot.audio) {
        if (state.audioListener) {
          const randUrl = CONFIG.SCARY_AUDIO_FILES[Math.floor(Math.random() * CONFIG.SCARY_AUDIO_FILES.length)];
          const buffer = state.preloadedScaryAudioBuffers[randUrl];
          if (buffer) {
            const posAudio = new THREE.PositionalAudio(state.audioListener);
            posAudio.setBuffer(buffer);
            posAudio.setLoop(false); // Play once, do not repeat
            posAudio.setDistanceModel('linear');
            posAudio.setRefDistance(1.5);
            posAudio.setMaxDistance(12.0);
            posAudio.setRolloffFactor(1.0);
            posAudio.setVolume(0.8);

            spot.mesh.add(posAudio);
            playSpookySound(posAudio);

            spot.audio = posAudio;

            posAudio.onEnded = () => {
              spot.hasPlayedSound = true; // Never play sound again
              if (spot.audio === posAudio) {
                spot.audio = null;
              }
              try {
                spot.mesh.remove(posAudio);
              } catch (e) { }
            };
          }
        }
      } else {
        if (!spot.audio.isPlaying) {
          playSpookySound(spot.audio);
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
