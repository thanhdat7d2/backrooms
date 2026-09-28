import * as THREE from 'three';
import { state, CONFIG } from '../state.js';

export function createEPromptSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Draw black circle with white border
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw white letter E
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
  sprite.scale.set(0.18, 0.18, 1.0); // ~18cm size
  return sprite;
}

// Reusable scratch vectors to avoid per-frame allocations
const _vFront = new THREE.Vector3();
const _vBack = new THREE.Vector3();

// Update doors animations and interaction prompts
export function updateDoors(dt) {
  if (!state.doors || state.doors.length === 0) return;

  const playerPos = state.controls.object.position;
  let nearestHandleDist = Infinity;
  let nearestDoor = null;
  let nearestIsFront = true;

  for (let i = 0; i < state.doors.length; i++) {
    const door = state.doors[i];

    // 1. Swing animation: only update when not yet settled at targetAngle
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

    // Hide prompts by default
    if (door.frontPrompt.visible) door.frontPrompt.visible = false;
    if (door.backPrompt.visible) door.backPrompt.visible = false;

    // 2. Fast coarse distance cull before matrix math (skip doors > 4m away)
    const dx = playerPos.x - door.mesh.position.x;
    const dz = playerPos.z - door.mesh.position.z;
    if (dx * dx + dz * dz > 16.0) continue;

    // Calculate world positions of front and back handles
    const handleOffsetZ = (door.t_door !== undefined ? door.t_door : 0.08) / 2 + 0.005;
    _vFront.set(door.handleLocalPos.x, door.handleLocalPos.y, door.handleLocalPos.z + handleOffsetZ)
      .applyMatrix4(door.hingeGroup.matrixWorld);
    _vBack.set(door.handleLocalPos.x, door.handleLocalPos.y, door.handleLocalPos.z - handleOffsetZ)
      .applyMatrix4(door.hingeGroup.matrixWorld);

    const distFront = playerPos.distanceTo(_vFront);
    const distBack = playerPos.distanceTo(_vBack);
    const minDist = Math.min(distFront, distBack);

    if (minDist < 1.5 && minDist < nearestHandleDist) {
      nearestHandleDist = minDist;
      nearestDoor = door;
      nearestIsFront = distFront < distBack;
    }
  }

  // Show prompt for the nearest door handle within interaction range
  if (nearestDoor) {
    if (nearestIsFront) {
      nearestDoor.frontPrompt.visible = true;
    } else {
      nearestDoor.backPrompt.visible = true;
    }
    state.activeInteractiveDoor = nearestDoor;
  } else {
    state.activeInteractiveDoor = null;
  }
}

// Handle key press E
export function interactWithDoor() {
  if (!state.activeInteractiveDoor) return;

  const door = state.activeInteractiveDoor;
  door.isOpen = !door.isOpen;

  // Toggle target angle (swing open by 90 degrees/1.57 rad)
  door.targetAngle = door.isOpen ? (Math.PI / 1.8) : 0; // Swing open inward/outward

  // Play open/close sound using audio/open.mp3 and audio/close.mp3
  if (!state.soundMuted) {
    const soundPath = door.isOpen ? 'assets/audio/open.mp3' : 'assets/audio/close.mp3';
    const audio = new Audio(soundPath);
    audio.volume = 1.0;
    audio.play().catch(err => {
      console.warn("Door audio play failed:", err);
    });
  }

  // Update physics collider
  updateDoorCollider(door);
}

// Update the door's physics collider in the grid lookup
export function updateDoorCollider(door) {
  const isHoriz = door.wall.type === 'horizontal' || door.wall.type === 'boundary-horizontal';
  
  // Remove existing collider from all grid cells
  const key = `${door.gridI},${door.gridJ}`;
  if (state.gridColliders[key]) {
    state.gridColliders[key] = state.gridColliders[key].filter(c => c.doorId !== door.id);
  }
  const adjKey = isHoriz ? `${door.gridI},${door.gridJ + 1}` : `${door.gridI + 1},${door.gridJ}`;
  if (state.gridColliders[adjKey]) {
    state.gridColliders[adjKey] = state.gridColliders[adjKey].filter(c => c.doorId !== door.id);
  }

  // If door is closed OR it is a weird door (weird doors block player even when open)
  if (!door.isOpen || door.isWeird) {
    // Temporarily set rotation back to closed state to get the closed bounding box
    const tempX = door.hingeGroup.rotation.x;
    const tempY = door.hingeGroup.rotation.y;
    door.hingeGroup.rotation.x = 0;
    door.hingeGroup.rotation.y = 0;
    door.hingeGroup.updateMatrixWorld(true);

    const box3 = new THREE.Box3().setFromObject(door.doorMesh);

    // Restore swing angles
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

    const colliderObj = { type: 'door', doorId: door.id, box: box };

    // Register in grid cells
    if (!state.gridColliders[key]) state.gridColliders[key] = [];
    state.gridColliders[key].push(colliderObj);

    if (!state.gridColliders[adjKey]) state.gridColliders[adjKey] = [];
    state.gridColliders[adjKey].push(colliderObj);
  }
}
