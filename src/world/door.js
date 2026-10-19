import * as THREE from 'three';
import { state } from '../state.js';

export function createEPromptSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: true,
    sizeAttenuation: true
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.18, 0.18, 1.0);
  return sprite;
}

const _vFront = new THREE.Vector3();
const _vBack = new THREE.Vector3();

export function updateDoors(dt) {
  if (!state.doors || state.doors.length === 0) return;

  const playerPos = state.controls.object.position;
  let nearestHandleDist = Infinity;
  let nearestDoor = null;
  let nearestIsFront = true;

  for (let i = 0; i < state.doors.length; i++) {
    const door = state.doors[i];

    // 1. Swing animation
    if (Math.abs(door.angle - door.targetAngle) > 0.001) {
      const speed = 6.0;
      door.angle = THREE.MathUtils.lerp(door.angle, door.targetAngle, Math.min(1, speed * dt));
      if (Math.abs(door.angle - door.targetAngle) <= 0.001) {
        door.angle = door.targetAngle;
      }

      if (door.hingeDir === 'left') {
        door.hingeGroup.rotation.y = door.angle;
        door.hingeGroup.rotation.x = 0;
      } else if (door.hingeDir === 'right') {
        door.hingeGroup.rotation.y = -door.angle;
        door.hingeGroup.rotation.x = 0;
      } else if (door.hingeDir === 'top') {
        door.hingeGroup.rotation.y = 0;
        door.hingeGroup.rotation.x = door.angle;
      } else if (door.hingeDir === 'bottom') {
        door.hingeGroup.rotation.y = 0;
        door.hingeGroup.rotation.x = -door.angle;
      }
    }

    if (door.frontPrompt.visible) door.frontPrompt.visible = false;
    if (door.backPrompt.visible) door.backPrompt.visible = false;

    // 2. Fast 3D distance cull
    const dy = Math.abs(playerPos.y - door.mesh.position.y);
    if (dy > 2.2) continue;
    const dx = playerPos.x - door.mesh.position.x;
    const dz = playerPos.z - door.mesh.position.z;
    if (dx * dx + dz * dz > 16.0) continue;

    const handleOffsetZ = (door.t_door !== undefined ? door.t_door : 0.08) / 2 + 0.005;
    _vFront.set(door.handleLocalPos.x, door.handleLocalPos.y, door.handleLocalPos.z + handleOffsetZ)
      .applyMatrix4(door.hingeGroup.matrixWorld);
    _vBack.set(door.handleLocalPos.x, door.handleLocalPos.y, door.handleLocalPos.z - handleOffsetZ)
      .applyMatrix4(door.hingeGroup.matrixWorld);

    const distFront = playerPos.distanceTo(_vFront);
    const distBack = playerPos.distanceTo(_vBack);
    const minDist = Math.min(distFront, distBack);

    if (minDist < 1.75 && minDist < nearestHandleDist) {
      nearestHandleDist = minDist;
      nearestDoor = door;
      nearestIsFront = distFront < distBack;
    }
  }

  if (nearestDoor) {
    if (nearestIsFront) nearestDoor.frontPrompt.visible = true;
    else nearestDoor.backPrompt.visible = true;
    state.activeInteractiveDoor = nearestDoor;
  } else {
    state.activeInteractiveDoor = null;
  }
}

export function interactWithDoor() {
  if (!state.activeInteractiveDoor) return;

  const door = state.activeInteractiveDoor;
  door.isOpen = !door.isOpen;
  door.targetAngle = door.isOpen ? (Math.PI / 1.8) : 0;

  if (!state.soundMuted) {
    const soundPath = door.isOpen ? 'assets/audio/open.mp3' : 'assets/audio/close.mp3';
    const audio = new Audio(soundPath);
    audio.volume = 1.0;
    audio.play().catch(() => { });
  }

  updateDoorCollider(door);
}

export function updateDoorCollider(door) {
  const isHoriz = door.wall.type === 'horizontal' || door.wall.type === 'boundary-horizontal';
  const f = door.floor || 0;

  const key = `${f},${door.gridI},${door.gridJ}`;
  if (state.gridColliders[key]) {
    state.gridColliders[key] = state.gridColliders[key].filter(c => c.doorId !== door.id);
  }
  const adjKey = isHoriz ? `${f},${door.gridI},${door.gridJ + 1}` : `${f},${door.gridI + 1},${door.gridJ}`;
  if (state.gridColliders[adjKey]) {
    state.gridColliders[adjKey] = state.gridColliders[adjKey].filter(c => c.doorId !== door.id);
  }

  // Closed doors, weird doors, or dead-end doors block passage
  if (!door.isOpen || door.isWeird || door.isDeadEnd) {
    const tempX = door.hingeGroup.rotation.x;
    const tempY = door.hingeGroup.rotation.y;
    door.hingeGroup.rotation.x = 0;
    door.hingeGroup.rotation.y = 0;
    door.hingeGroup.updateMatrixWorld(true);

    const box3 = new THREE.Box3().setFromObject(door.doorMesh);

    door.hingeGroup.rotation.x = tempX;
    door.hingeGroup.rotation.y = tempY;
    door.hingeGroup.updateMatrixWorld(true);

    const box = {
      xMin: box3.min.x,
      xMax: box3.max.x,
      yMin: box3.min.y,
      yMax: box3.max.y,
      zMin: box3.min.z,
      zMax: box3.max.z
    };

    const colliderObj = { type: 'door', doorId: door.id, box };
    if (!state.gridColliders[key]) state.gridColliders[key] = [];
    state.gridColliders[key].push(colliderObj);
    if (!state.gridColliders[adjKey]) state.gridColliders[adjKey] = [];
    state.gridColliders[adjKey].push(colliderObj);
  }
}
