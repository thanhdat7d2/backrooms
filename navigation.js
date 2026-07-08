import * as THREE from 'three';
import { state } from './state.js';

export function findPathToExit() {
  if (!state.mazeData || !state.mazeData.hWalls || !state.mazeData.vWalls) return [];

  const playerPos = state.controls.object.position;
  const startCell = state.mazeData.worldToCell(playerPos.x, playerPos.z);
  const targetI = state.mazeData.centerIdx;
  const targetJ = state.mazeData.centerIdx;

  const startI = startCell.cellI;
  const startJ = startCell.cellJ;

  if (startI === targetI && startJ === targetJ) {
    return [new THREE.Vector3(playerPos.x, 0.05, playerPos.z), new THREE.Vector3(state.mazeData.exit.x, 0.05, state.mazeData.exit.z)];
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

  if (!found) return [];

  // Reconstruct path
  const path = [];
  let curr = { i: targetI, j: targetJ };
  while (curr !== null) {
    path.push(curr);
    curr = parent[curr.i][curr.j];
  }
  path.reverse();

  const points = [];
  // Start exactly at player pos (clamped slightly off floor)
  points.push(new THREE.Vector3(playerPos.x, 0.05, playerPos.z));

  for (let k = 1; k < path.length - 1; k++) {
    const cell = path[k];
    points.push(new THREE.Vector3(state.mazeData.cellCX(cell.i), 0.05, state.mazeData.cellCZ(cell.j)));
  }

  // End at the center exit coordinate
  points.push(new THREE.Vector3(state.mazeData.exit.x, 0.05, state.mazeData.exit.z));

  return points;
}

export function updateNavigationLine() {
  if (!state.showNavLine || !state.controls.isLocked) {
    if (state.navLineMesh) {
      state.scene.remove(state.navLineMesh);
      state.navLineMesh.geometry.dispose();
      state.navLineMesh = null;
    }
    state.lastNavCellI = -1;
    state.lastNavCellJ = -1;
    return;
  }

  const playerPos = state.controls.object.position;
  const currentCell = state.mazeData.worldToCell(playerPos.x, playerPos.z);
  const cellI = currentCell.cellI;
  const cellJ = currentCell.cellJ;

  if (state.navLineMesh && cellI === state.lastNavCellI && cellJ === state.lastNavCellJ) {
    // Just update the player's position (index 0) dynamically to avoid recalculating BFS every frame
    const positionAttr = state.navLineMesh.geometry.attributes.position;
    if (positionAttr) {
      positionAttr.setXYZ(0, playerPos.x, 0.05, playerPos.z);
      positionAttr.needsUpdate = true;
      state.navLineMesh.geometry.computeBoundingBox();
      state.navLineMesh.geometry.computeBoundingSphere();
    }
    return;
  }

  // Cell changed or line doesn't exist, calculate new path
  state.lastNavCellI = cellI;
  state.lastNavCellJ = cellJ;

  if (state.navLineMesh) {
    state.scene.remove(state.navLineMesh);
    state.navLineMesh.geometry.dispose();
    state.navLineMesh = null;
  }

  const points = findPathToExit();
  if (points.length < 2) {
    console.warn('Navigation path points count < 2. Path not found. Points:', points);
    return;
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);

  if (!state.navLineMaterial) {
    state.navLineMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 3,
      fog: false
    });
  }

  state.navLineMesh = new THREE.Line(geometry, state.navLineMaterial);
  state.navLineMesh.frustumCulled = false; // Prevent culling when player moves/turns camera away
  state.scene.add(state.navLineMesh);
}

export function toggleNavigationLine() {
  state.showNavLine = !state.showNavLine;
  if (!state.showNavLine) {
    if (state.navLineMesh) {
      state.scene.remove(state.navLineMesh);
      state.navLineMesh.geometry.dispose();
      state.navLineMesh = null;
    }
    state.lastNavCellI = -1;
    state.lastNavCellJ = -1;
  } else {
    updateNavigationLine();
  }
}
