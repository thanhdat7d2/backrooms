import * as THREE from 'three';
import { state, CONFIG } from '../state.js';

// 3D Multi-Floor BFS Navigation Path to Exit across all 4 floors & staircases
export function findPathToExit() {
  const maze = state.mazeData;
  if (!maze || !maze.floors) return [];

  const playerPos = state.controls.object.position;
  const startCell = maze.worldToCell3D(playerPos.x, playerPos.y, playerPos.z);
  const targetF = maze.exit.floor;
  const targetI = maze.centerIdx;
  const targetJ = maze.centerIdx;

  const startKey = `${startCell.floor},${startCell.cellI},${startCell.cellJ}`;
  const targetKey = `${targetF},${targetI},${targetJ}`;

  if (startKey === targetKey) {
    const y = targetF * CONFIG.FLOOR_HEIGHT + 0.12;
    return [
      new THREE.Vector3(playerPos.x, y, playerPos.z),
      new THREE.Vector3(maze.exit.x, y, maze.exit.z)
    ];
  }

  const N = maze.N;
  const stairAdj = new Map();
  for (const st of maze.stairs) {
    const k1 = `${st.fromFloor},${st.i1},${st.j1}`;
    const k2 = `${st.toFloor},${st.i2},${st.j2}`;
    if (!stairAdj.has(k1)) stairAdj.set(k1, []);
    if (!stairAdj.has(k2)) stairAdj.set(k2, []);
    stairAdj.get(k1).push({ f: st.toFloor, i: st.i2, j: st.j2 });
    stairAdj.get(k2).push({ f: st.fromFloor, i: st.i1, j: st.j1 });
  }

  const queue = [{ f: startCell.floor, i: startCell.cellI, j: startCell.cellJ }];
  const visited = new Set([startKey]);
  const parent = new Map();
  let head = 0;
  let found = false;

  while (head < queue.length) {
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

  if (!found) return [];

  const path = [];
  let curKey = targetKey;
  let curNode = { f: targetF, i: targetI, j: targetJ };
  while (curNode) {
    path.push(curNode);
    const p = parent.get(curKey);
    if (!p) break;
    curKey = `${p.f},${p.i},${p.j}`;
    curNode = p;
  }
  path.reverse();

  const points = [];
  points.push(new THREE.Vector3(playerPos.x, playerPos.y - state.currentEyeHeight + 0.12, playerPos.z));
  for (let k = 1; k < path.length - 1; k++) {
    const cell = path[k];
    points.push(new THREE.Vector3(maze.cellCX(cell.i), cell.f * CONFIG.FLOOR_HEIGHT + 0.14, maze.cellCZ(cell.j)));
  }
  points.push(new THREE.Vector3(maze.exit.x, targetF * CONFIG.FLOOR_HEIGHT + 0.14, maze.exit.z));
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
    state.lastNavFloor = -1;
    return;
  }

  const playerPos = state.controls.object.position;
  const currentCell = state.mazeData.worldToCell3D(playerPos.x, playerPos.y, playerPos.z);

  if (state.navLineMesh &&
      currentCell.floor === state.lastNavFloor &&
      currentCell.cellI === state.lastNavCellI &&
      currentCell.cellJ === state.lastNavCellJ) {
    const positionAttr = state.navLineMesh.geometry.attributes.position;
    if (positionAttr) {
      positionAttr.setXYZ(0, playerPos.x, playerPos.y - state.currentEyeHeight + 0.12, playerPos.z);
      positionAttr.needsUpdate = true;
    }
    return;
  }

  state.lastNavFloor = currentCell.floor;
  state.lastNavCellI = currentCell.cellI;
  state.lastNavCellJ = currentCell.cellJ;

  if (state.navLineMesh) {
    state.scene.remove(state.navLineMesh);
    state.navLineMesh.geometry.dispose();
    state.navLineMesh = null;
  }

  const points = findPathToExit();
  if (points.length < 2) return;

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  if (!state.navLineMaterial) {
    state.navLineMaterial = new THREE.LineBasicMaterial({ color: 0xff2244, linewidth: 3, fog: false });
  }
  state.navLineMesh = new THREE.Line(geometry, state.navLineMaterial);
  state.navLineMesh.frustumCulled = false;
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
    state.lastNavFloor = -1;
  } else {
    updateNavigationLine();
  }
}
