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

// Update doors animations and interaction prompts
export function updateDoors(dt) {
  if (!state.doors || state.doors.length === 0) return;

  const playerPos = state.controls.object.position;
  let nearestHandleDist = Infinity;
  let nearestDoor = null;

  state.doors.forEach(door => {
    // 1. Swing animation: interpolate current angle towards target angle
    const speed = 6.0; // animation speed
    door.angle = THREE.MathUtils.lerp(door.angle, door.targetAngle, speed * dt);
    
    // Set hingeGroup rotation based on hinge direction
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

    // 2. Proximity and Handle checks
    // Calculate world positions of front and back handles using handleLocalPos relative to hingeGroup
    const handleOffsetZ = (door.t_door !== undefined ? door.t_door : 0.08) / 2 + 0.005;
    const frontHandleWorld = new THREE.Vector3()
      .copy(door.handleLocalPos)
      .add(new THREE.Vector3(0, 0, handleOffsetZ))
      .applyMatrix4(door.hingeGroup.matrixWorld);
    const backHandleWorld = new THREE.Vector3()
      .copy(door.handleLocalPos)
      .add(new THREE.Vector3(0, 0, -handleOffsetZ))
      .applyMatrix4(door.hingeGroup.matrixWorld);

    const distFront = playerPos.distanceTo(frontHandleWorld);
    const distBack = playerPos.distanceTo(backHandleWorld);
    const minDist = Math.min(distFront, distBack);

    // Hide prompts by default
    door.frontPrompt.visible = false;
    door.backPrompt.visible = false;

    if (minDist < 1.8) {
      if (minDist < nearestHandleDist) {
        nearestHandleDist = minDist;
        nearestDoor = door;
      }
    }
  });

  // Show prompt for the nearest door handle within interaction range
  if (nearestDoor && nearestHandleDist < 1.5) {
    const handleOffsetZ = (nearestDoor.t_door !== undefined ? nearestDoor.t_door : 0.08) / 2 + 0.005;
    const frontHandleWorld = new THREE.Vector3()
      .copy(nearestDoor.handleLocalPos)
      .add(new THREE.Vector3(0, 0, handleOffsetZ))
      .applyMatrix4(nearestDoor.hingeGroup.matrixWorld);
    const backHandleWorld = new THREE.Vector3()
      .copy(nearestDoor.handleLocalPos)
      .add(new THREE.Vector3(0, 0, -handleOffsetZ))
      .applyMatrix4(nearestDoor.hingeGroup.matrixWorld);

    const distFront = playerPos.distanceTo(frontHandleWorld);
    const distBack = playerPos.distanceTo(backHandleWorld);

    if (distFront < distBack) {
      nearestDoor.frontPrompt.visible = true;
    } else {
      nearestDoor.backPrompt.visible = true;
    }

    // Save active door for interaction key E
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
