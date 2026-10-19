/**
 * Multi-Floor Maze Generator (4 stacked floors)
 * Integrates curved corridors, arbitrary-angle diagonal walls, merged vertical zones,
 * scattered staircases, floor holes & pitfalls, structured room archetypes,
 * see-through window cutouts, and mixed/transitional biome regions.
 */
import { CONFIG } from '../state.js';
import { THEME_BIOME_LIST, BIOME_DEFS } from '../systems/biomes.js';

const ROOM_ARCHETYPES = [
  'living_room',
  'office',
  'hospital_ward',
  'classroom',
  'storage',
  'car_garage'
];

function shuffle(arr) {
  for (let k = arr.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1));
    [arr[k], arr[r]] = [arr[r], arr[k]];
  }
  return arr;
}

export class MazeGenerator {
  static generate(level, eyeHeight = CONFIG.EYE_HEIGHT) {
    const NUM_FLOORS = CONFIG.NUM_FLOORS; // 4 floors
    const FLOOR_HEIGHT = CONFIG.FLOOR_HEIGHT;
    const WALL_HEIGHT = CONFIG.WALL_HEIGHT;
    const WALL_T = 0.4;

    // Slightly tighter footprint per floor since we have 4 full stacked floors
    const D = 76 + 24 * Math.min(level, 6);
    const S = D / Math.sqrt(2);
    const targetAvgCell = 3.2;
    let N = Math.round(S / targetAvgCell);
    if (N % 2 === 0) N += 1;
    N = Math.max(13, Math.min(25, N));

    const centerIdx = Math.floor(N / 2);

    // ----------------------------------------------------------
    // 1. Shared Non-Uniform Column Widths (X) and Row Heights (Z)
    // ----------------------------------------------------------
    const MIN_CELL = 2.0;
    const MAX_CELL = 4.4;

    const thinCols = [];
    const thinRows = [];
    const numThin = level >= 3 ? 2 : 1;
    while (thinCols.length < numThin) {
      const idx = 2 + Math.floor(Math.random() * (N - 4));
      if (idx !== centerIdx && !thinCols.includes(idx)) thinCols.push(idx);
    }
    while (thinRows.length < numThin) {
      const idx = 2 + Math.floor(Math.random() * (N - 4));
      if (idx !== centerIdx && !thinRows.includes(idx)) thinRows.push(idx);
    }

    const rawCW = Array.from({ length: N }, () => MIN_CELL + Math.random() * (MAX_CELL - MIN_CELL));
    const rawRH = Array.from({ length: N }, () => MIN_CELL + Math.random() * (MAX_CELL - MIN_CELL));

    let thinColsSum = 0;
    thinCols.forEach(idx => { thinColsSum += 1.3; rawCW[idx] = 0; });
    let thinRowsSum = 0;
    thinRows.forEach(idx => { thinRowsSum += 1.3; rawRH[idx] = 0; });

    const sumCW = rawCW.reduce((a, b) => a + b, 0);
    const sumRH = rawRH.reduce((a, b) => a + b, 0);
    const colWidths = rawCW.map((v, idx) => thinCols.includes(idx) ? 1.3 : v * (S - thinColsSum) / sumCW);
    const rowHeights = rawRH.map((v, idx) => thinRows.includes(idx) ? 1.3 : v * (S - thinRowsSum) / sumRH);

    const colX = Array(N + 1);
    colX[0] = -S / 2;
    for (let i = 0; i < N; i++) colX[i + 1] = colX[i] + colWidths[i];

    const rowZ = Array(N + 1);
    rowZ[0] = -S / 2;
    for (let j = 0; j < N; j++) rowZ[j + 1] = rowZ[j] + rowHeights[j];

    const cellCX = i => colX[i] + colWidths[i] / 2;
    const cellCZ = j => rowZ[j] + rowHeights[j] / 2;

    function worldToCell(worldX, worldZ) {
      let ci = N - 1;
      for (let i = 0; i < N; i++) {
        if (worldX < colX[i + 1]) { ci = i; break; }
      }
      let cj = N - 1;
      for (let j = 0; j < N; j++) {
        if (worldZ < rowZ[j + 1]) { cj = j; break; }
      }
      return {
        cellI: Math.max(0, Math.min(N - 1, ci)),
        cellJ: Math.max(0, Math.min(N - 1, cj))
      };
    }

    function worldToCell3D(worldX, worldY, worldZ) {
      const { cellI, cellJ } = worldToCell(worldX, worldZ);
      const feetY = worldY - CONFIG.EYE_HEIGHT + 0.5;
      let floor = Math.floor(feetY / FLOOR_HEIGHT);
      floor = Math.max(0, Math.min(NUM_FLOORS - 1, floor));
      return { floor, cellI, cellJ };
    }

    // Choose exit floor (Floor 2 or 3 so player explores vertically)
    const exitFloor = Math.min(NUM_FLOORS - 1, 1 + ((level) % (NUM_FLOORS - 1)));
    const startFloor = 0;

    // ----------------------------------------------------------
    // 2. Merged Vertical Zones (spanning 2, 3, or all 4 floors)
    // ----------------------------------------------------------
    const mergedZones = [];
    const mergedCellLookup = Array.from({ length: NUM_FLOORS }, () =>
      Array.from({ length: N }, () => Array(N).fill(null))
    );

    const numMergedTarget = 3 + Math.floor(Math.random() * 3); // 3 to 5 multi-floor atriums
    for (let att = 0; att < numMergedTarget * 10 && mergedZones.length < numMergedTarget; att++) {
      const rw = 2 + Math.floor(Math.random() * 3); // 2..4 cells wide
      const rh = 2 + Math.floor(Math.random() * 3); // 2..4 cells deep
      if (N <= rw + 4 || N <= rh + 4) continue;
      const sI = 2 + Math.floor(Math.random() * (N - rw - 4));
      const sJ = 2 + Math.floor(Math.random() * (N - rh - 4));

      // Pick random contiguous floor span (e.g., [1,2], [2,3], [0,1,2], [0,1,2,3])
      const fStart = Math.floor(Math.random() * (NUM_FLOORS - 1));
      const maxSpan = NUM_FLOORS - 1 - fStart;
      const fEnd = fStart + 1 + Math.floor(Math.random() * maxSpan);

      // Avoid start cell (0,0) and exit cell (centerIdx, centerIdx)
      let bad = false;
      for (let i = sI - 1; i <= sI + rw && !bad; i++) {
        for (let j = sJ - 1; j <= sJ + rh && !bad; j++) {
          if (i < 0 || i >= N || j < 0 || j >= N) continue;
          if ((i === centerIdx && j === centerIdx) || (i <= 1 && j <= 1)) bad = true;
          for (let f = fStart; f <= fEnd; f++) {
            if (mergedCellLookup[f][i][j]) bad = true;
          }
        }
      }
      if (bad) continue;

      const zone = {
        id: mergedZones.length,
        startI: sI,
        startJ: sJ,
        rw,
        rh,
        fStart,
        fEnd,
        xMin: colX[sI],
        xMax: colX[sI + rw],
        zMin: rowZ[sJ],
        zMax: rowZ[sJ + rh]
      };
      mergedZones.push(zone);
      for (let f = fStart; f <= fEnd; f++) {
        for (let i = sI; i < sI + rw; i++) {
          for (let j = sJ; j < sJ + rh; j++) {
            mergedCellLookup[f][i][j] = zone;
          }
        }
      }
    }

    // ----------------------------------------------------------
    // 3. Dedicated Scattered Stair System (connecting f <-> f+1)
    // ----------------------------------------------------------
    const stairs = [];
    const stairCellSet = new Set(); // `${f},${i},${j}`

    for (let f = 0; f < NUM_FLOORS - 1; f++) {
      const targetStairs = 4 + Math.floor(Math.random() * 2); // 4-5 stairs per floor transition (12-15 total!)
      let placed = 0;
      for (let att = 0; att < targetStairs * 30 && placed < targetStairs; att++) {
        const dir = Math.floor(Math.random() * 4); // 0:+X, 1:-X, 2:+Z, 3:-Z
        const di = dir === 0 ? 1 : (dir === 1 ? -1 : 0);
        const dj = dir === 2 ? 1 : (dir === 3 ? -1 : 0);

        const i1 = 1 + Math.floor(Math.random() * (N - 2));
        const j1 = 1 + Math.floor(Math.random() * (N - 2));
        const i2 = i1 + di;
        const j2 = j1 + dj;
        if (i2 < 1 || i2 >= N - 1 || j2 < 1 || j2 >= N - 1) continue;

        // Avoid thin cols/rows, center exit, spawn, merged zones, and existing stairs
        if (colWidths[i1] < 2.3 || colWidths[i2] < 2.3 || rowHeights[j1] < 2.3 || rowHeights[j2] < 2.3) continue;
        if ((i1 === 0 && j1 === 0) || (i2 === 0 && j2 === 0)) continue;
        if ((Math.abs(i1 - centerIdx) <= 1 && Math.abs(j1 - centerIdx) <= 1) ||
            (Math.abs(i2 - centerIdx) <= 1 && Math.abs(j2 - centerIdx) <= 1)) continue;
        if (mergedCellLookup[f][i1][j1] || mergedCellLookup[f][i2][j2] ||
            mergedCellLookup[f + 1][i1][j1] || mergedCellLookup[f + 1][i2][j2]) continue;

        // Keep stairs well-spaced from each other on same floor
        let tooClose = false;
        for (const st of stairs) {
          if (st.fromFloor === f || st.toFloor === f || st.fromFloor === f + 1) {
            const dist = Math.hypot(st.i1 - i1, st.j1 - j1);
            if (dist < 3.5) { tooClose = true; break; }
          }
        }
        if (tooClose) continue;

        const keys = [
          `${f},${i1},${j1}`, `${f},${i2},${j2}`,
          `${f + 1},${i1},${j1}`, `${f + 1},${i2},${j2}`
        ];
        if (keys.some(k => stairCellSet.has(k))) continue;

        keys.forEach(k => stairCellSet.add(k));

        // Compute world bounds of the 2-cell stair shaft
        const minI = Math.min(i1, i2);
        const maxI = Math.max(i1, i2);
        const minJ = Math.min(j1, j2);
        const maxJ = Math.max(j1, j2);

        const shaftXMin = colX[minI];
        const shaftXMax = colX[maxI + 1];
        const shaftZMin = rowZ[minJ];
        const shaftZMax = rowZ[maxJ + 1];

        // Ramp goes from entry cell (i1,j1) at baseY to exit cell (i2,j2) at topY
        const baseY = f * FLOOR_HEIGHT;
        const topY = (f + 1) * FLOOR_HEIGHT;

        // Keep stair compact (1.15m wide) so players always have plenty of space to walk around it on both floors
        let xMin, xMax, zMin, zMax;
        if (di !== 0) {
          // Runs along X
          const cz = (rowZ[j1] + rowZ[j1 + 1]) / 2;
          const halfW = Math.min(0.58, (rowZ[j1 + 1] - rowZ[j1]) * 0.26);
          xMin = shaftXMin + 0.45;
          xMax = shaftXMax - 0.45;
          zMin = cz - halfW;
          zMax = cz + halfW;
        } else {
          // Runs along Z
          const cx = (colX[i1] + colX[i1 + 1]) / 2;
          const halfW = Math.min(0.58, (colX[i1 + 1] - colX[i1]) * 0.26);
          xMin = cx - halfW;
          xMax = cx + halfW;
          zMin = shaftZMin + 0.45;
          zMax = shaftZMax - 0.45;
        }

        stairs.push({
          id: stairs.length,
          fromFloor: f,
          toFloor: f + 1,
          i1, j1, i2, j2,
          di, dj,
          baseY,
          topY,
          xMin, xMax, zMin, zMax,
          shaftXMin, shaftXMax, shaftZMin, shaftZMax,
          entryX: cellCX(i1),
          entryZ: cellCZ(j1),
          exitX: cellCX(i2),
          exitZ: cellCZ(j2)
        });
        placed++;
      }
    }

    // ----------------------------------------------------------
    // 4. Generate Each Floor Independently (with integrated curved & diagonal walls!)
    // ----------------------------------------------------------
    const floors = [];

    for (let f = 0; f < NUM_FLOORS; f++) {
      const baseY = f * FLOOR_HEIGHT;

      // 4a. Mixed / Transitional Biome Map (Noisy Voronoi regions)
      const biomeGrid = Array.from({ length: N }, () => Array(N).fill('base'));
      const numSeeds = 4 + Math.floor(Math.random() * 3); // 4-6 biome zones per floor
      const pickedBiomes = shuffle([...THEME_BIOME_LIST]).slice(0, numSeeds - 1);
      const biomeSeeds = [
        { biome: 'base', i: Math.floor(Math.random() * N), j: Math.floor(Math.random() * N) }
      ];
      // Guarantee start cell is base skin on floor 0 for classic Backrooms opening, then transitions!
      if (f === startFloor) {
        biomeSeeds[0].i = 1;
        biomeSeeds[0].j = 1;
      }
      for (const b of pickedBiomes) {
        biomeSeeds.push({
          biome: b,
          i: Math.floor(Math.random() * N),
          j: Math.floor(Math.random() * N)
        });
      }

      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          let bestB = 'base';
          let bestD = Infinity;
          for (const seed of biomeSeeds) {
            const warp = Math.sin(i * 0.7 + j * 0.5 + f * 2.1) * 1.4;
            const d = Math.hypot(i - seed.i, j - seed.j) + warp;
            if (d < bestD) {
              bestD = d;
              bestB = seed.biome;
            }
          }
          biomeGrid[i][j] = bestB;
        }
      }

      // 4b. Walls arrays + Non-axis-aligned Curved/Diagonal reservation BEFORE carving!
      const hWalls = Array.from({ length: N }, () => Array(N - 1).fill(true));
      const vWalls = Array.from({ length: N - 1 }, () => Array(N).fill(true));
      const customWalls = []; // { x1, z1, x2, z2, thickness, biomeId, floor, kind: 'curved'|'diagonal' }
      const specialZoneCells = new Set(); // cells reserved by curved/diagonal corridors
      const noHolesWalls = new Set();

      // Reserve Curved Corridors (smooth 90° arc corridors spanning 2x2 cell blocks)
      // Integrated directly into generation: carves open interior, omits internal square walls,
      // and places smooth multi-segment curved walls as the actual corridor boundaries!
      const numCurves = 2 + Math.floor(Math.random() * 2); // 2-3 curved corridors per floor
      let curvesPlaced = 0;
      for (let att = 0; att < 40 && curvesPlaced < numCurves; att++) {
        const sI = 1 + Math.floor(Math.random() * (N - 4));
        const sJ = 1 + Math.floor(Math.random() * (N - 4));
        // Check 2x2 block is free of stairs, merged zones, center, spawn, thin cols
        let bad = false;
        for (let i = sI; i < sI + 2 && !bad; i++) {
          for (let j = sJ; j < sJ + 2 && !bad; j++) {
            if (colWidths[i] < 2.2 || rowHeights[j] < 2.2) bad = true;
            if ((i <= 1 && j <= 1) || (Math.abs(i - centerIdx) <= 1 && Math.abs(j - centerIdx) <= 1)) bad = true;
            if (stairCellSet.has(`${f},${i},${j}`) || mergedCellLookup[f][i][j] || specialZoneCells.has(`${i},${j}`)) bad = true;
          }
        }
        if (bad) continue;

        // Open internal walls of the 2x2 curved zone
        hWalls[sI][sJ] = false;
        hWalls[sI + 1][sJ] = false;
        vWalls[sI][sJ] = false;
        vWalls[sI][sJ + 1] = false;

        // Pick which corner is the center of curvature (0:SW, 1:SE, 2:NW, 3:NE)
        const corner = Math.floor(Math.random() * 4);
        const x0 = colX[sI], x1 = colX[sI + 2];
        const z0 = rowZ[sJ], z1 = rowZ[sJ + 2];
        const w = x1 - x0;
        const h = z1 - z0;
        const R_outer = Math.min(w, h) * 0.96;
        const R_inner = Math.min(w, h) * 0.34;

        let cx, cz, aStart, aEnd;
        if (corner === 0) {
          cx = x0; cz = z0; aStart = 0; aEnd = Math.PI / 2;
          // Open entrance on bottom-right & top-left, close outer square edges that arc replaces
          if (sJ > 0) hWalls[sI + 1][sJ - 1] = false;
          if (sI > 0) vWalls[sI - 1][sJ + 1] = false;
          if (sI + 2 < N) { vWalls[sI + 1][sJ] = false; vWalls[sI + 1][sJ + 1] = false; }
          if (sJ + 2 < N) { hWalls[sI][sJ + 1] = false; hWalls[sI + 1][sJ + 1] = false; }
        } else if (corner === 1) {
          cx = x1; cz = z0; aStart = Math.PI / 2; aEnd = Math.PI;
          if (sJ > 0) hWalls[sI][sJ - 1] = false;
          if (sI + 2 < N) vWalls[sI + 1][sJ + 1] = false;
          if (sI > 0) { vWalls[sI - 1][sJ] = false; vWalls[sI - 1][sJ + 1] = false; }
          if (sJ + 2 < N) { hWalls[sI][sJ + 1] = false; hWalls[sI + 1][sJ + 1] = false; }
        } else if (corner === 2) {
          cx = x0; cz = z1; aStart = -Math.PI / 2; aEnd = 0;
          if (sJ + 2 < N) hWalls[sI + 1][sJ + 1] = false;
          if (sI > 0) vWalls[sI - 1][sJ] = false;
          if (sI + 2 < N) { vWalls[sI + 1][sJ] = false; vWalls[sI + 1][sJ + 1] = false; }
          if (sJ > 0) { hWalls[sI][sJ - 1] = false; hWalls[sI + 1][sJ - 1] = false; }
        } else {
          cx = x1; cz = z1; aStart = Math.PI; aEnd = Math.PI * 1.5;
          if (sJ + 2 < N) hWalls[sI][sJ + 1] = false;
          if (sI + 2 < N) vWalls[sI + 1][sJ] = false;
          if (sI > 0) { vWalls[sI - 1][sJ] = false; vWalls[sI - 1][sJ + 1] = false; }
          if (sJ > 0) { hWalls[sI][sJ - 1] = false; hWalls[sI + 1][sJ - 1] = false; }
        }

        const biomeId = biomeGrid[sI][sJ];
        const segs = 7; // Smooth 7-chord curve
        for (let k = 0; k < segs; k++) {
          const t0 = aStart + (aEnd - aStart) * (k / segs);
          const t1 = aStart + (aEnd - aStart) * ((k + 1) / segs);
          // Outer curved wall
          customWalls.push({
            x1: cx + Math.cos(t0) * R_outer,
            z1: cz + Math.sin(t0) * R_outer,
            x2: cx + Math.cos(t1) * R_outer,
            z2: cz + Math.sin(t1) * R_outer,
            thickness: 0.34,
            biomeId,
            floor: f,
            kind: 'curved'
          });
          // Inner curved wall
          customWalls.push({
            x1: cx + Math.cos(t0) * R_inner,
            z1: cz + Math.sin(t0) * R_inner,
            x2: cx + Math.cos(t1) * R_inner,
            z2: cz + Math.sin(t1) * R_inner,
            thickness: 0.34,
            biomeId,
            floor: f,
            kind: 'curved'
          });
        }

        for (let i = sI; i < sI + 2; i++) {
          for (let j = sJ; j < sJ + 2; j++) {
            specialZoneCells.add(`${i},${j}`);
          }
        }
        curvesPlaced++;
      }

      // Reserve Arbitrary-Angle Diagonal Wall Corridors (2x2 or 3x2 angled chambers/passages)
      const numDiags = 2 + Math.floor(Math.random() * 2); // 2-3 diagonal wall zones per floor
      let diagsPlaced = 0;
      for (let att = 0; att < 40 && diagsPlaced < numDiags; att++) {
        const sI = 1 + Math.floor(Math.random() * (N - 4));
        const sJ = 1 + Math.floor(Math.random() * (N - 4));
        let bad = false;
        for (let i = sI; i < sI + 2 && !bad; i++) {
          for (let j = sJ; j < sJ + 2 && !bad; j++) {
            if (colWidths[i] < 2.2 || rowHeights[j] < 2.2) bad = true;
            if ((i <= 1 && j <= 1) || (Math.abs(i - centerIdx) <= 1 && Math.abs(j - centerIdx) <= 1)) bad = true;
            if (stairCellSet.has(`${f},${i},${j}`) || mergedCellLookup[f][i][j] || specialZoneCells.has(`${i},${j}`)) bad = true;
          }
        }
        if (bad) continue;

        // Open internal square walls and replace with a true arbitrary-angle diagonal corridor
        hWalls[sI][sJ] = false;
        hWalls[sI + 1][sJ] = false;
        vWalls[sI][sJ] = false;
        vWalls[sI][sJ + 1] = false;

        const x0 = colX[sI], x1 = colX[sI + 2];
        const z0 = rowZ[sJ], z1 = rowZ[sJ + 2];
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        // Arbitrary angle between 22° and 68° (or 112° and 158°)
        const angle = (Math.random() < 0.5 ? 1 : -1) * (0.38 + Math.random() * 0.80);
        const dirX = Math.cos(angle);
        const dirZ = Math.sin(angle);
        const perpX = -dirZ;
        const perpZ = dirX;
        const halfLen = Math.min(x1 - x0, z1 - z0) * 0.48;
        const halfCorridorW = 1.05; // 2.1m wide diagonal corridor

        const biomeId = biomeGrid[sI][sJ];
        // Two parallel diagonal walls forming an angled corridor
        for (const side of [-1, 1]) {
          const ox = cx + perpX * halfCorridorW * side;
          const oz = cz + perpZ * halfCorridorW * side;
          customWalls.push({
            x1: ox - dirX * halfLen,
            z1: oz - dirZ * halfLen,
            x2: ox + dirX * halfLen,
            z2: oz + dirZ * halfLen,
            thickness: 0.34,
            biomeId,
            floor: f,
            kind: 'diagonal'
          });
        }

        for (let i = sI; i < sI + 2; i++) {
          for (let j = sJ; j < sJ + 2; j++) {
            specialZoneCells.add(`${i},${j}`);
          }
        }
        diagsPlaced++;
      }

      // 4c. DFS Maze Carving
      const visited = Array.from({ length: N }, () => Array(N).fill(false));
      const stack = [];
      const getUnvisitedNeighbors = (i, j) => {
        const nb = [];
        if (i > 0 && !visited[i - 1][j]) nb.push({ i: i - 1, j, dir: 'W' });
        if (i < N - 1 && !visited[i + 1][j]) nb.push({ i: i + 1, j, dir: 'E' });
        if (j > 0 && !visited[i][j - 1]) nb.push({ i, j: j - 1, dir: 'S' });
        if (j < N - 1 && !visited[i][j + 1]) nb.push({ i, j: j + 1, dir: 'N' });
        return nb;
      };

      visited[0][0] = true;
      let cur = { i: 0, j: 0 };
      let cnt = 1;
      while (cnt < N * N) {
        const nb = getUnvisitedNeighbors(cur.i, cur.j);
        if (nb.length) {
          const nx = nb[Math.floor(Math.random() * nb.length)];
          if (nx.dir === 'W') vWalls[nx.i][nx.j] = false;
          else if (nx.dir === 'E') vWalls[cur.i][cur.j] = false;
          else if (nx.dir === 'S') hWalls[cur.i][nx.j] = false;
          else hWalls[cur.i][cur.j] = false;
          visited[nx.i][nx.j] = true;
          stack.push(cur);
          cur = { i: nx.i, j: nx.j };
          cnt++;
        } else if (stack.length) {
          cur = stack.pop();
        } else {
          outer: for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
              if (!visited[i][j]) {
                if (i > 0 && visited[i - 1][j]) { vWalls[i - 1][j] = false; visited[i][j] = true; cnt++; cur = { i, j }; break outer; }
                if (i < N - 1 && visited[i + 1][j]) { vWalls[i][j] = false; visited[i][j] = true; cnt++; cur = { i, j }; break outer; }
                if (j > 0 && visited[i][j - 1]) { hWalls[i][j - 1] = false; visited[i][j] = true; cnt++; cur = { i, j }; break outer; }
                if (j < N - 1 && visited[i][j + 1]) { hWalls[i][j] = false; visited[i][j] = true; cnt++; cur = { i, j }; break outer; }
              }
            }
          }
        }
      }

      // Add loops (~22% wall removal)
      const allH = [], allV = [];
      for (let i = 0; i < N; i++) for (let j = 0; j < N - 1; j++) if (hWalls[i][j]) allH.push({ i, j });
      for (let i = 0; i < N - 1; i++) for (let j = 0; j < N; j++) if (vWalls[i][j]) allV.push({ i, j });
      shuffle(allH);
      shuffle(allV);
      for (let k = 0; k < Math.floor(allH.length * 0.22); k++) {
        const { i, j } = allH[k];
        if (i > 0 && i < N - 1) hWalls[i][j] = false;
      }
      for (let k = 0; k < Math.floor(allV.length * 0.22); k++) {
        const { i, j } = allV[k];
        if (j > 0 && j < N - 1) vWalls[i][j] = false;
      }

      // 4d. Open internal walls of Merged Vertical Zones on this floor
      mergedZones.forEach(zone => {
        if (f >= zone.fStart && f <= zone.fEnd) {
          for (let i = zone.startI; i < zone.startI + zone.rw; i++) {
            for (let j = zone.startJ; j < zone.startJ + zone.rh; j++) {
              if (j < zone.startJ + zone.rh - 1) hWalls[i][j] = false;
              if (i < zone.startI + zone.rw - 1) vWalls[i][j] = false;
            }
          }
        }
      });

      // Open internal walls of staircases on this floor
      stairs.forEach(st => {
        if (st.fromFloor === f || st.toFloor === f) {
          if (st.di === 1) vWalls[st.i1][st.j1] = false;
          else if (st.di === -1) vWalls[st.i2][st.j2] = false;
          else if (st.dj === 1) hWalls[st.i1][st.j1] = false;
          else if (st.dj === -1) hWalls[st.i2][st.j2] = false;
        }
      });

      // 4e. Structured Room Generation with Archetypes
      const roomCells = new Set();
      const rooms = [];
      const numRoomsTarget = Math.max(4, Math.floor(N / 3));

      // Try placing 1 Car Garage (very large 4x4 or 5x4) on floor 0 or 1
      const archetypeQueue = [];
      if (f === 0 || f === 1) archetypeQueue.push('car_garage');
      const otherArchetypes = shuffle(['living_room', 'office', 'hospital_ward', 'classroom', 'storage']);
      while (archetypeQueue.length < numRoomsTarget) {
        archetypeQueue.push(otherArchetypes[archetypeQueue.length % otherArchetypes.length]);
      }

      for (const archetype of archetypeQueue) {
        const isGarage = archetype === 'car_garage';
        const minSize = isGarage ? 4 : (archetype === 'storage' ? 2 : 2);
        const maxSize = isGarage ? 5 : (archetype === 'storage' ? 3 : 4);

        for (let att = 0; att < 24; att++) {
          const rw = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
          const rh = minSize + Math.floor(Math.random() * (maxSize - minSize + 1));
          if (N <= rw + 3 || N <= rh + 3) continue;

          const sI = 1 + Math.floor(Math.random() * (N - rw - 2));
          const sJ = 1 + Math.floor(Math.random() * (N - rh - 2));

          let bad = false;
          for (let i = sI; i < sI + rw && !bad; i++) {
            for (let j = sJ; j < sJ + rh && !bad; j++) {
              if ((i === centerIdx && j === centerIdx) || (i <= 1 && j <= 1)) bad = true;
              if (thinCols.includes(i) || thinRows.includes(j)) bad = true;
              if (roomCells.has(`${i},${j}`) || specialZoneCells.has(`${i},${j}`)) bad = true;
              if (stairCellSet.has(`${f},${i},${j}`) || mergedCellLookup[f][i][j]) bad = true;
            }
          }
          if (bad) continue;

          for (let i = sI; i < sI + rw; i++) {
            for (let j = sJ; j < sJ + rh; j++) {
              roomCells.add(`${i},${j}`);
              if (j < sJ + rh - 1) hWalls[i][j] = false;
              if (i < sI + rw - 1) vWalls[i][j] = false;
            }
          }

          // Seal room perimeter and carve 1-2 exits + 1-3 see-through window cutouts!
          const boundaries = [];
          if (sJ > 0) for (let i = sI; i < sI + rw; i++) boundaries.push({ type: 'h', i, j: sJ - 1 });
          if (sJ + rh < N) for (let i = sI; i < sI + rw; i++) boundaries.push({ type: 'h', i, j: sJ + rh - 1 });
          if (sI > 0) for (let j = sJ; j < sJ + rh; j++) boundaries.push({ type: 'v', i: sI - 1, j });
          if (sI + rw < N) for (let j = sJ; j < sJ + rh; j++) boundaries.push({ type: 'v', i: sI + rw - 1, j });

          boundaries.forEach(b => {
            if (b.type === 'h') hWalls[b.i][b.j] = true;
            else vWalls[b.i][b.j] = true;
          });

          const shuffledB = shuffle([...boundaries]);
          const numExits = Math.random() < 0.45 ? 1 : 2;
          const exits = shuffledB.slice(0, Math.min(numExits, shuffledB.length));
          exits.forEach(b => {
            if (b.type === 'h') hWalls[b.i][b.j] = false;
            else vWalls[b.i][b.j] = false;
          });

          // Pick 1-3 remaining closed boundary walls to have real see-through cutout windows!
          const windowWalls = [];
          const closedB = shuffledB.slice(exits.length);
          const numWins = Math.min(isGarage ? 3 : 2, closedB.length);
          for (let w = 0; w < numWins; w++) {
            windowWalls.push(closedB[w]);
          }

          closedB.forEach(b => {
            noHolesWalls.add(`${b.type},${b.i},${b.j}`);
          });

          const centerBiome = biomeGrid[sI + Math.floor(rw / 2)][sJ + Math.floor(rh / 2)];
          // Override archetype if inside hospital biome
          const finalArchetype = (centerBiome === 'hospital' && !isGarage) ? 'hospital_ward' : archetype;

          rooms.push({
            floor: f,
            baseY,
            startI: sI,
            startJ: sJ,
            rw,
            rh,
            isVeryLarge: isGarage || (rw * rh >= 12),
            archetype: finalArchetype,
            biomeId: centerBiome,
            xMin: colX[sI],
            xMax: colX[sI + rw],
            zMin: rowZ[sJ],
            zMax: rowZ[sJ + rh],
            exits,
            windowWalls
          });
          break;
        }
      }

      // 4f. Center exit island on exitFloor
      if (f === exitFloor && centerIdx > 1 && centerIdx < N - 2) {
        const c = centerIdx;
        vWalls[c - 1][c - 1] = false;
        vWalls[c][c - 1] = false;
        hWalls[c - 1][c - 1] = false;
        hWalls[c - 1][c] = false;
        vWalls[c - 1][c + 1] = false;
        vWalls[c][c + 1] = false;
        hWalls[c + 1][c - 1] = false;
        hWalls[c + 1][c] = false;

        hWalls[c][c - 1] = false; // 1 entrance
        hWalls[c][c] = true;
        vWalls[c - 1][c] = true;
        vWalls[c][c] = true;

        noHolesWalls.add(`h,${c},${c - 1}`);
        noHolesWalls.add(`h,${c},${c}`);
        noHolesWalls.add(`v,${c - 1},${c}`);
        noHolesWalls.add(`v,${c},${c}`);
      }

      // 4g. Guarantee full connectivity on this floor
      {
        const vis = Array.from({ length: N }, () => Array(N).fill(false));
        let vCount = 0;
        const q = [];
        const mark = (i, j) => { vis[i][j] = true; vCount++; q.push({ i, j }); };
        mark(0, 0);

        while (true) {
          while (q.length > 0) {
            const { i, j } = q.shift();
            if (i > 0 && !vis[i - 1][j] && !vWalls[i - 1][j]) mark(i - 1, j);
            if (i < N - 1 && !vis[i + 1][j] && !vWalls[i][j]) mark(i + 1, j);
            if (j > 0 && !vis[i][j - 1] && !hWalls[i][j - 1]) mark(i, j - 1);
            if (j < N - 1 && !vis[i][j + 1] && !hWalls[i][j]) mark(i, j + 1);
          }
          if (vCount === N * N) break;

          const cands = [];
          for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
              if (vis[i][j]) continue;
              if (i > 0 && vis[i - 1][j]) cands.push({ unvis: { i, j }, type: 'v', wi: i - 1, wj: j });
              if (i < N - 1 && vis[i + 1][j]) cands.push({ unvis: { i, j }, type: 'v', wi: i, wj: j });
              if (j > 0 && vis[i][j - 1]) cands.push({ unvis: { i, j }, type: 'h', wi: i, wj: j - 1 });
              if (j < N - 1 && vis[i][j + 1]) cands.push({ unvis: { i, j }, type: 'h', wi: i, wj: j });
            }
          }
          if (cands.length === 0) break;
          const safe = cands.filter(c => !noHolesWalls.has(`${c.type},${c.wi},${c.wj}`));
          const chosen = (safe.length ? safe : cands)[Math.floor(Math.random() * (safe.length || cands.length))];
          if (chosen.type === 'h') hWalls[chosen.wi][chosen.wj] = false;
          else vWalls[chosen.wi][chosen.wj] = false;
          mark(chosen.unvis.i, chosen.unvis.j);
        }
      }

      // 4h. Pillars inside rooms
      const pillars = [];
      const pillarSet = new Set();
      rooms.forEach(room => {
        const area = room.rw * room.rh;
        const numP = room.archetype === 'car_garage' ? 2 : Math.min(3, Math.max(0, Math.floor(area / 6)));
        for (let att = 0; att < numP * 6 && pillars.filter(p => p.roomRef === room).length < numP; att++) {
          const pI = room.startI + Math.floor(Math.random() * room.rw);
          const pJ = room.startJ + Math.floor(Math.random() * room.rh);
          const key = `${pI},${pJ}`;
          if (pillarSet.has(key)) continue;
          if (colWidths[pI] < 2.5 || rowHeights[pJ] < 2.5) continue;
          pillarSet.add(key);
          const w = 0.45 + Math.random() * 0.35;
          const l = 0.45 + Math.random() * 0.35;
          pillars.push({
            floor: f,
            baseY,
            x: cellCX(pI),
            z: cellCZ(pJ),
            w,
            l,
            gridI: pI,
            gridJ: pJ,
            biomeId: biomeGrid[pI][pJ],
            roomRef: room
          });
        }
      });

      // 4i. Floor Holes & Pitfalls (drop-through on floors 1..3, abyss pitfalls on floor 0 + occasional deep shaft)
      const floorHoles = [];
      const holeSet = new Set();
      const numHoles = 5 + Math.floor(Math.random() * 4); // 5-8 floor holes per floor
      for (let att = 0; att < numHoles * 12 && floorHoles.length < numHoles; att++) {
        const hi = 1 + Math.floor(Math.random() * (N - 2));
        const hj = 1 + Math.floor(Math.random() * (N - 2));
        const key = `${hi},${hj}`;
        if (holeSet.has(key)) continue;
        if ((hi <= 1 && hj <= 1) || (Math.abs(hi - centerIdx) <= 1 && Math.abs(hj - centerIdx) <= 1)) continue;
        if (stairCellSet.has(`${f},${hi},${hj}`) || mergedCellLookup[f][hi][hj] || pillarSet.has(key)) continue;
        if (colWidths[hi] < 1.8 || rowHeights[hj] < 1.8) continue;

        holeSet.add(key);
        const holeType = (f === 0 || Math.random() < 0.2) ? 'abyss' : 'drop';
        // Make hole slightly inset so player can walk around edges or jump over it
        const padX = Math.min(0.45, colWidths[hi] * 0.18);
        const padZ = Math.min(0.45, rowHeights[hj] * 0.18);
        floorHoles.push({
          floor: f,
          i: hi,
          j: hj,
          type: holeType,
          xMin: colX[hi] + padX,
          xMax: colX[hi + 1] - padX,
          zMin: rowZ[hj] + padZ,
          zMax: rowZ[hj + 1] - padZ,
          cx: cellCX(hi),
          cz: cellCZ(hj)
        });
      }

      // 4j. Build Wall Segments (keeping window walls & doors)
      const windowWallLookup = new Set();
      rooms.forEach(room => {
        (room.windowWalls || []).forEach(w => windowWallLookup.add(`${w.type},${w.i},${w.j}`));
      });

      const wallSegments = [];

      // Horizontal inner walls — split per-cell if biome changes or has a window so biome/window alignment is exact
      for (let j = 0; j < N - 1; j++) {
        let i = 0;
        while (i < N) {
          if (hWalls[i][j]) {
            const startI = i;
            const startBiome = biomeGrid[i][j];
            const isWin = windowWallLookup.has(`h,${i},${j}`);
            i++;
            // Merge consecutive cells only if same biome and neither is a window wall
            if (!isWin) {
              while (i < N && hWalls[i][j] && biomeGrid[i][j] === startBiome && !windowWallLookup.has(`h,${i},${j}`)) {
                i++;
              }
            }
            const endI = i - 1;
            const wStartX = colX[startI];
            const wEndX = colX[endI + 1];
            const wLen = wEndX - wStartX;
            const seg = {
              type: 'horizontal',
              floor: f,
              baseY,
              x: (wStartX + wEndX) / 2,
              z: rowZ[j + 1],
              length: wLen,
              thickness: WALL_T,
              gridI: startI,
              gridJ: j,
              count: endI - startI + 1,
              continuesPrev: startI > 0 && hWalls[startI - 1][j],
              continuesNext: endI + 1 < N && hWalls[endI + 1][j],
              biomeId: startBiome
            };
            if (isWin && wLen > 1.3) {
              const winW = Math.min(1.6, wLen - 0.5);
              seg.hole = {
                width: winW,
                offset: 0,
                yBottom: 1.0,
                yTop: 2.35,
                height: 1.35,
                isWindow: true,
                isDoor: false
              };
            }
            wallSegments.push(seg);
          } else {
            i++;
          }
        }
      }

      // Vertical inner walls
      for (let i = 0; i < N - 1; i++) {
        let j = 0;
        while (j < N) {
          if (vWalls[i][j]) {
            const startJ = j;
            const startBiome = biomeGrid[i][j];
            const isWin = windowWallLookup.has(`v,${i},${j}`);
            j++;
            if (!isWin) {
              while (j < N && vWalls[i][j] && biomeGrid[i][j] === startBiome && !windowWallLookup.has(`v,${i},${j}`)) {
                j++;
              }
            }
            const endJ = j - 1;
            const wStartZ = rowZ[startJ];
            const wEndZ = rowZ[endJ + 1];
            const wLen = wEndZ - wStartZ;
            const seg = {
              type: 'vertical',
              floor: f,
              baseY,
              x: colX[i + 1],
              z: (wStartZ + wEndZ) / 2,
              length: wLen,
              thickness: WALL_T,
              gridI: i,
              gridJ: startJ,
              count: endJ - startJ + 1,
              continuesPrev: startJ > 0 && vWalls[i][startJ - 1],
              continuesNext: endJ + 1 < N && vWalls[i][endJ + 1],
              biomeId: startBiome
            };
            if (isWin && wLen > 1.3) {
              const winW = Math.min(1.6, wLen - 0.5);
              seg.hole = {
                width: winW,
                offset: 0,
                yBottom: 1.0,
                yTop: 2.35,
                height: 1.35,
                isWindow: true,
                isDoor: false
              };
            }
            wallSegments.push(seg);
          } else {
            j++;
          }
        }
      }

      // Exterior Boundary Walls (split into sections so some have surreal exterior vista windows!)
      const addBoundaryWall = (type, isHoriz, fixedCoord, coords, fixedIdx) => {
        for (let k = 0; k < N; k++) {
          const wStart = coords[k];
          const wEnd = coords[k + 1];
          const wLen = wEnd - wStart;
          const bId = isHoriz ? biomeGrid[k][fixedIdx] : biomeGrid[fixedIdx][k];
          const seg = {
            type,
            floor: f,
            baseY,
            x: isHoriz ? (wStart + wEnd) / 2 : fixedCoord,
            z: isHoriz ? fixedCoord : (wStart + wEnd) / 2,
            length: wLen,
            thickness: WALL_T,
            gridI: isHoriz ? k : fixedIdx,
            gridJ: isHoriz ? fixedIdx : k,
            count: 1,
            biomeId: bId
          };
          // 18% chance of an exterior see-through window overlooking a surreal exterior vista!
          if (wLen > 1.8 && Math.random() < 0.18) {
            seg.hole = {
              width: Math.min(1.7, wLen - 0.6),
              offset: 0,
              yBottom: 0.95,
              yTop: 2.40,
              height: 1.45,
              isWindow: true,
              isExteriorWindow: true,
              isDoor: false
            };
          }
          wallSegments.push(seg);
        }
      };

      addBoundaryWall('boundary-vertical', false, colX[0], rowZ, 0);
      addBoundaryWall('boundary-vertical', false, colX[N], rowZ, N - 1);
      addBoundaryWall('boundary-horizontal', true, rowZ[0], colX, 0);
      addBoundaryWall('boundary-horizontal', true, rowZ[N], colX, N - 1);

      // 4k. Random doors & holes on inner walls (including surreal doors!)
      const innerWalls = wallSegments.filter(w => (w.type === 'horizontal' || w.type === 'vertical') && !w.hole);
      innerWalls.forEach(wall => {
        let cannotHaveHole = false;
        const isHoriz = wall.type === 'horizontal';
        for (let k = 0; k < wall.count; k++) {
          const i = isHoriz ? wall.gridI + k : wall.gridI;
          const j = isHoriz ? wall.gridJ : wall.gridJ + k;
          if (noHolesWalls.has(`${isHoriz ? 'h' : 'v'},${i},${j}`)) {
            cannotHaveHole = true;
            break;
          }
        }
        if (cannotHaveHole) return;

        if (Math.random() < 0.42) {
          const minSideWall = 0.22;
          const maxLen = wall.length - 2 * minSideWall;
          if (maxLen > 1.2) {
            const w_door = 1.116;
            const h_door = 2.10;
            const halfL = wall.length / 2;
            const roll = Math.random();

            if (roll < 0.72) {
              // Door (25% surreal/weird: floating, upside-down, sideways, or dead-end!)
              const isWeird = Math.random() < 0.25;
              const isDeadEnd = Math.random() < 0.14;
              const canBeHoriz = maxLen > h_door;
              const dirs = canBeHoriz ? ['left', 'right', 'top', 'bottom'] : ['left', 'right'];
              const hingeDir = isWeird ? dirs[Math.floor(Math.random() * dirs.length)] : (Math.random() < 0.5 ? 'left' : 'right');
              const rotated = (hingeDir === 'top' || hingeDir === 'bottom');
              const holeW = rotated ? h_door : w_door;
              const holeH = rotated ? w_door : h_door;
              let yBottom = 0;
              if (isWeird || Math.random() < 0.25) {
                yBottom = Math.random() * Math.max(0.1, WALL_HEIGHT - holeH - 0.2);
              }
              const minOff = -halfL + minSideWall + holeW / 2;
              const maxOff = halfL - minSideWall - holeW / 2;
              const holeOffset = minOff + Math.random() * Math.max(0, maxOff - minOff);
              wall.hole = {
                width: holeW,
                offset: holeOffset,
                yBottom,
                yTop: yBottom + holeH,
                height: holeH,
                isDoor: true,
                isWeird,
                isDeadEnd,
                hingeDir,
                rotated
              };
            } else if (roll < 0.88) {
              // Interior see-through window between corridors!
              const winW = Math.min(1.5, maxLen - 0.2);
              const minOff = -halfL + minSideWall + winW / 2;
              const maxOff = halfL - minSideWall - winW / 2;
              wall.hole = {
                width: winW,
                offset: minOff + Math.random() * Math.max(0, maxOff - minOff),
                yBottom: 1.0,
                yTop: 2.3,
                height: 1.3,
                isWindow: true,
                isDoor: false
              };
            } else {
              // Pass-through crawl/jump hole
              const holeW = 0.7 + Math.random() * Math.min(1.4, maxLen - 0.7);
              const holeH = 1.1 + Math.random() * 1.1;
              const yBottom = Math.random() < 0.45 ? 0 : 0.35 + Math.random() * 0.5;
              const clampedH = Math.min(holeH, WALL_HEIGHT - 0.25 - yBottom);
              if (clampedH > 0.45) {
                const minOff = -halfL + minSideWall + holeW / 2;
                const maxOff = halfL - minSideWall - holeW / 2;
                wall.hole = {
                  width: holeW,
                  offset: minOff + Math.random() * Math.max(0, maxOff - minOff),
                  yBottom,
                  yTop: yBottom + clampedH,
                  height: clampedH,
                  isDoor: false,
                  isWindow: false
                };
              }
            }
          }
        }
      });

      // 4l. Light Fixtures (varied colors, ceiling lights + flickering flags)
      const lightTiles = [];
      const lightSet = new Set();
      const blockSize = 3;
      const blockList = [];
      for (let bx = 0; bx < Math.ceil(N / blockSize); bx++) {
        for (let by = 0; by < Math.ceil(N / blockSize); by++) {
          blockList.push({ bx, by });
        }
      }
      shuffle(blockList);

      blockList.forEach(({ bx, by }) => {
        const cells = [];
        const sI = bx * blockSize, eI = Math.min(N - 1, sI + blockSize - 1);
        const sJ = by * blockSize, eJ = Math.min(N - 1, sJ + blockSize - 1);
        for (let i = sI; i <= eI; i++) for (let j = sJ; j <= eJ; j++) cells.push({ i, j });
        shuffle(cells);
        for (const { i, j } of cells) {
          if (f === exitFloor && i === centerIdx && j === centerIdx) continue;
          if (pillarSet.has(`${i},${j}`)) continue;
          // Don't hang ceiling light in open shaft of a merged zone unless it's the top floor of the zone
          const mz = mergedCellLookup[f][i][j];
          if (mz && f < mz.fEnd) continue;

          const nb = [`${i - 1},${j}`, `${i + 1},${j}`, `${i},${j - 1}`, `${i},${j + 1}`];
          if (nb.some(k => lightSet.has(k))) continue;

          const bId = biomeGrid[i][j];
          const bDef = BIOME_DEFS[bId] || BIOME_DEFS.base;
          const palette = bDef.lightColors || [0xfff0c4];
          // Occasional eerie red emergency / cyan / green accent light
          let color = palette[Math.floor(Math.random() * palette.length)];
          if (Math.random() < 0.08) {
            const accentColors = [0xff2a2a, 0x33ffee, 0x55ff66, 0xff8822];
            color = accentColors[Math.floor(Math.random() * accentColors.length)];
          }
          const flicker = Math.random() < 0.22;

          lightTiles.push({
            floor: f,
            gridI: i,
            gridJ: j,
            x: cellCX(i),
            y: baseY + WALL_HEIGHT - 0.01,
            z: cellCZ(j),
            color,
            flicker,
            sourceType: 'ceiling'
          });
          lightSet.add(`${i},${j}`);
          break;
        }
      });

      floors.push({
        floor: f,
        baseY,
        hWalls,
        vWalls,
        walls: wallSegments,
        customWalls,
        pillars,
        rooms,
        lights: lightTiles,
        floorHoles,
        biomeGrid
      });
    }

    const exitX = cellCX(centerIdx);
    const exitZ = cellCZ(centerIdx);
    const exitHalfW = colWidths[centerIdx] / 2;
    const exitHalfH = rowHeights[centerIdx] / 2;

    return {
      N,
      numFloors: NUM_FLOORS,
      floorHeight: FLOOR_HEIGHT,
      wallHeight: WALL_HEIGHT,
      cellSize: S / N,
      sideLength: S,
      level,
      centerIdx,
      colWidths,
      rowHeights,
      colX,
      rowZ,
      cellCX,
      cellCZ,
      worldToCell,
      worldToCell3D,
      floors,
      mergedZones,
      mergedCellLookup,
      stairs,
      // Legacy top-level convenience references pointing to floor 0
      hWalls: floors[0].hWalls,
      vWalls: floors[0].vWalls,
      walls: floors.flatMap(fl => fl.walls),
      pillars: floors.flatMap(fl => fl.pillars),
      rooms: floors.flatMap(fl => fl.rooms),
      lights: floors.flatMap(fl => fl.lights),
      exit: {
        floor: exitFloor,
        baseY: exitFloor * FLOOR_HEIGHT,
        x: exitX,
        z: exitZ,
        halfW: exitHalfW,
        halfH: exitHalfH
      },
      start: {
        floor: startFloor,
        baseY: startFloor * FLOOR_HEIGHT,
        x: cellCX(0),
        z: cellCZ(0)
      }
    };
  }
}
