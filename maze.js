/**
 * Maze Generator module 
 * Uses a non-uniform grid so corridor widths genuinely vary.
 */

export class MazeGenerator {
  static generate(level, eyeHeight = 1.6) {
    const D = 100 + 40 * level;     // maze diameter (meters)
    const S = D / Math.sqrt(2);     // maze side length (meters)


    const targetAvgCell = 3; // nxn maze cells
    let N = Math.round(S / targetAvgCell); // length of a grid (meters)
    if (N % 2 === 0) N += 1;
    N = Math.max(7, N); // at least 7x7

    const centerIdx = Math.floor(N / 2);

    // ----------------------------------------------------------
    // 1. Non-uniform column widths (X) and row heights (Z)
    //    Each dimension is randomly between MIN and MAX, then
    //    scaled so the total exactly equals S.
    // ----------------------------------------------------------
    const WALL_T = 0.4; // wall thickness (metres)
    const MIN_CELL = 1.3; // smallest cell (→ ~0.9m walkable corridor)
    const MAX_CELL = 4.6; // largest cell  (→ ~4.2m wide corridor)

    // Pick 1 thin column/row on small maps, 2 on larger maps
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

    // Pick 1 impassable thin column/row on small maps, 2 on larger maps
    const impassableCols = [];
    const impassableRows = [];
    const numImpassable = level >= 3 ? 2 : 1;
    while (impassableCols.length < numImpassable) {
      const idx = 2 + Math.floor(Math.random() * (N - 4));
      if (idx !== centerIdx && !thinCols.includes(idx) && !impassableCols.includes(idx)) {
        impassableCols.push(idx);
      }
    }
    while (impassableRows.length < numImpassable) {
      const idx = 2 + Math.floor(Math.random() * (N - 4));
      if (idx !== centerIdx && !thinRows.includes(idx) && !impassableRows.includes(idx)) {
        impassableRows.push(idx);
      }
    }

    const rawCW = Array.from({ length: N }, () => MIN_CELL + Math.random() * (MAX_CELL - MIN_CELL));
    const rawRH = Array.from({ length: N }, () => MIN_CELL + Math.random() * (MAX_CELL - MIN_CELL));

    // Dedicate thin columns and rows to be exactly 1.2m wide (0.8m walkable width)
    let thinColsSum = 0;
    thinCols.forEach(idx => { thinColsSum += 1.2; rawCW[idx] = 0; });
    let thinRowsSum = 0;
    thinRows.forEach(idx => { thinRowsSum += 1.2; rawRH[idx] = 0; });

    // Dedicate impassable columns and rows to be exactly 0.5m wide (impossible to walk through)
    let impassableColsSum = 0;
    impassableCols.forEach(idx => { impassableColsSum += 0.5; rawCW[idx] = 0; });
    let impassableRowsSum = 0;
    impassableRows.forEach(idx => { impassableRowsSum += 0.5; rawRH[idx] = 0; });

    const sumCW = rawCW.reduce((a, b) => a + b, 0);
    const sumRH = rawRH.reduce((a, b) => a + b, 0);
    const colWidths = rawCW.map((v, idx) => {
      if (thinCols.includes(idx)) return 1.2;
      if (impassableCols.includes(idx)) return 0.5;
      return v * (S - thinColsSum - impassableColsSum) / sumCW;
    });
    const rowHeights = rawRH.map((v, idx) => {
      if (thinRows.includes(idx)) return 1.2;
      if (impassableRows.includes(idx)) return 0.5;
      return v * (S - thinRowsSum - impassableRowsSum) / sumRH;
    });

    // Cumulative starting positions (origin = top-left corner = -S/2)
    const colX = Array(N + 1); colX[0] = -S / 2;
    for (let i = 0; i < N; i++) colX[i + 1] = colX[i] + colWidths[i];

    const rowZ = Array(N + 1); rowZ[0] = -S / 2;
    for (let j = 0; j < N; j++) rowZ[j + 1] = rowZ[j] + rowHeights[j];

    // Cell centre helpers
    const cellCX = i => colX[i] + colWidths[i] / 2;
    const cellCZ = j => rowZ[j] + rowHeights[j] / 2;

    // ----------------------------------------------------------
    // 2. DFS maze generation
    // ----------------------------------------------------------
    // hWalls[i][j] = wall between row j and j+1 in column i  (runs along X)
    // vWalls[i][j] = wall between column i and i+1 in row j   (runs along Z)
    const hWalls = Array.from({ length: N }, () => Array(N - 1).fill(true));
    const vWalls = Array.from({ length: N - 1 }, () => Array(N).fill(true));

    const visited = Array.from({ length: N }, () => Array(N).fill(false));
    const stack = [];

    function neighbors(i, j) {
      const n = [];
      if (i > 0 && !visited[i - 1][j]) n.push({ i: i - 1, j, dir: 'W' });
      if (i < N - 1 && !visited[i + 1][j]) n.push({ i: i + 1, j, dir: 'E' });
      if (j > 0 && !visited[i][j - 1]) n.push({ i, j: j - 1, dir: 'S' });
      if (j < N - 1 && !visited[i][j + 1]) n.push({ i, j: j + 1, dir: 'N' });
      return n;
    }

    visited[0][0] = true;
    let cur = { i: 0, j: 0 };
    let cnt = 1;

    while (cnt < N * N) {
      const nb = neighbors(cur.i, cur.j);
      if (nb.length) {
        const nx = nb[Math.floor(Math.random() * nb.length)];
        if (nx.dir === 'W') vWalls[nx.i][nx.j] = false;
        else if (nx.dir === 'E') vWalls[cur.i][cur.j] = false;
        else if (nx.dir === 'S') hWalls[cur.i][nx.j] = false;
        else hWalls[cur.i][cur.j] = false;
        visited[nx.i][nx.j] = true;
        stack.push(cur); cur = { i: nx.i, j: nx.j }; cnt++;
      } else if (stack.length) {
        cur = stack.pop();
      } else {
        // Find any unvisited and connect
        outer: for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          if (!visited[i][j]) {
            if (i > 0 && visited[i - 1][j]) { vWalls[i - 1][j] = false; visited[i][j] = true; cnt++; cur = { i, j }; break outer; }
            if (i < N - 1 && visited[i + 1][j]) { vWalls[i][j] = false; visited[i][j] = true; cnt++; cur = { i, j }; break outer; }
            if (j > 0 && visited[i][j - 1]) { hWalls[i][j - 1] = false; visited[i][j] = true; cnt++; cur = { i, j }; break outer; }
            if (j < N - 1 && visited[i][j + 1]) { hWalls[i][j] = false; visited[i][j] = true; cnt++; cur = { i, j }; break outer; }
          }
        }
      }
    }

    // ----------------------------------------------------------
    // 2b. Force thin columns and rows to be straight corridors (but reduced length)
    // ----------------------------------------------------------
    thinCols.forEach(col => {
      const length = Math.floor((N - 1) * 0.4); // 40% of the maze length
      const start = Math.floor(Math.random() * (N - length));
      for (let j = start; j < start + length; j++) {
        hWalls[col][j] = false;
      }
    });
    thinRows.forEach(row => {
      const length = Math.floor((N - 1) * 0.4);
      const start = Math.floor(Math.random() * (N - length));
      for (let i = start; i < start + length; i++) {
        vWalls[i][row] = false;
      }
    });

    impassableCols.forEach(col => {
      const length = Math.floor((N - 1) * 0.4); // 40% of the maze length
      const start = Math.floor(Math.random() * (N - length));
      for (let j = start; j < start + length; j++) {
        hWalls[col][j] = false;
      }
    });
    impassableRows.forEach(row => {
      const length = Math.floor((N - 1) * 0.4);
      const start = Math.floor(Math.random() * (N - length));
      for (let i = start; i < start + length; i++) {
        vWalls[i][row] = false;
      }
    });

    // ----------------------------------------------------------
    // 3. Add loops (~20% wall removal) to defeat wall-following
    // ----------------------------------------------------------
    const shuffle = arr => { for (let k = arr.length - 1; k > 0; k--) { const r = Math.floor(Math.random() * (k + 1));[arr[k], arr[r]] = [arr[r], arr[k]]; } };
    const allH = [], allV = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N - 1; j++) if (hWalls[i][j]) allH.push({ i, j });
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < N; j++) if (vWalls[i][j]) allV.push({ i, j });
    shuffle(allH); shuffle(allV);
    for (let k = 0; k < Math.floor(allH.length * 0.20); k++) { const { i, j } = allH[k]; if (i > 0 && i < N - 1) hWalls[i][j] = false; }
    for (let k = 0; k < Math.floor(allV.length * 0.20); k++) { const { i, j } = allV[k]; if (j > 0 && j < N - 1) vWalls[i][j] = false; }

    // ----------------------------------------------------------
    // 4. Rooms — very large rooms (few) + normal rooms
    // ----------------------------------------------------------
    const numRoomsTarget = Math.max(6, Math.floor(N / 2));
    const roomCells = new Set();
    const roomCoordsList = [];

    // Target very large rooms: e.g. 1 on level 1, 1-2 on level 2, 2-3 on level 3+
    const numVeryLargeRooms = Math.max(1, Math.floor(level / 2) + 1);

    // Very large room generation
    for (let attempt = 0; attempt < numVeryLargeRooms * 8 && roomCoordsList.length < numVeryLargeRooms; attempt++) {
      const size = 5 + Math.min(3, Math.floor(level - 1)) + Math.floor(Math.random() * 2);
      const rw = size;
      const rh = size;

      if (N <= rw + 3 || N <= rh + 3) continue;
      const sI = Math.floor(Math.random() * (N - rw - 2)) + 1;
      const sJ = Math.floor(Math.random() * (N - rh - 2)) + 1;

      let bad = false;
      for (let i = sI; i < sI + rw && !bad; i++) {
        for (let j = sJ; j < sJ + rh && !bad; j++) {
          if ((i === centerIdx && j === centerIdx) || (i <= 1 && j <= 1) || (i >= N - 2 && j >= N - 2)) bad = true;
          // Avoid thin and impassable columns/rows to keep room boundaries solid
          if (thinCols.includes(i) || thinRows.includes(j) || impassableCols.includes(i) || impassableRows.includes(j)) bad = true;
          // Avoid overlapping with existing rooms
          if (roomCells.has(`${i},${j}`)) bad = true;
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
      roomCoordsList.push({ startI: sI, startJ: sJ, rw, rh, isVeryLarge: true });
    }

    // Normal rooms generation (to fill up to numRoomsTarget)
    for (let attempt = 0; attempt < numRoomsTarget * 4 && roomCoordsList.length < numRoomsTarget; attempt++) {
      const minRoomSize = 2 + Math.min(2, Math.floor(level / 2));
      const maxRoomSize = 3 + Math.min(3, Math.floor(level));
      const rw = minRoomSize + Math.floor(Math.random() * (maxRoomSize - minRoomSize + 1));
      const rh = minRoomSize + Math.floor(Math.random() * (maxRoomSize - minRoomSize + 1));

      if (N <= rw + 3 || N <= rh + 3) continue;
      const sI = Math.floor(Math.random() * (N - rw - 2)) + 1;
      const sJ = Math.floor(Math.random() * (N - rh - 2)) + 1;

      let bad = false;
      for (let i = sI; i < sI + rw && !bad; i++) {
        for (let j = sJ; j < sJ + rh && !bad; j++) {
          if ((i === centerIdx && j === centerIdx) || (i <= 1 && j <= 1) || (i >= N - 2 && j >= N - 2)) bad = true;
          // Avoid thin and impassable columns/rows to keep room boundaries solid
          if (thinCols.includes(i) || thinRows.includes(j) || impassableCols.includes(i) || impassableRows.includes(j)) bad = true;
          // Avoid overlapping with existing rooms
          if (roomCells.has(`${i},${j}`)) bad = true;
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
      roomCoordsList.push({ startI: sI, startJ: sJ, rw, rh, isVeryLarge: false });
    }

    // ----------------------------------------------------------
    // 4b. Seal room boundaries and create exactly 1 or 2 exits (no random holes)
    // ----------------------------------------------------------
    const noHolesWalls = new Set();

    roomCoordsList.forEach(({ startI, startJ, rw, rh }) => {
      const boundaries = [];

      // Top boundary
      if (startJ > 0) {
        for (let i = startI; i < startI + rw; i++) {
          boundaries.push({ type: 'h', i, j: startJ - 1 });
        }
      }
      // Bottom boundary
      if (startJ + rh < N) {
        for (let i = startI; i < startI + rw; i++) {
          boundaries.push({ type: 'h', i, j: startJ + rh - 1 });
        }
      }
      // Left boundary
      if (startI > 0) {
        for (let j = startJ; j < startJ + rh; j++) {
          boundaries.push({ type: 'v', i: startI - 1, j });
        }
      }
      // Right boundary
      if (startI + rw < N) {
        for (let j = startJ; j < startJ + rh; j++) {
          boundaries.push({ type: 'v', i: startI + rw - 1, j });
        }
      }

      // Close all boundary walls
      boundaries.forEach(b => {
        if (b.type === 'h') hWalls[b.i][b.j] = true;
        else vWalls[b.i][b.j] = true;
      });

      // Randomly select 1 or 2 exits to open
      const numExits = Math.random() < 0.5 ? 1 : 2;
      const shuffledBoundaries = [...boundaries].sort(() => Math.random() - 0.5);
      const exits = shuffledBoundaries.slice(0, Math.min(numExits, shuffledBoundaries.length));

      exits.forEach(b => {
        if (b.type === 'h') hWalls[b.i][b.j] = false;
        else vWalls[b.i][b.j] = false;
      });

      // Mark closed boundaries as "no holes"
      boundaries.forEach(b => {
        const isExit = exits.some(ex => ex.type === b.type && ex.i === b.i && ex.j === b.j);
        if (!isExit) {
          noHolesWalls.add(`${b.type},${b.i},${b.j}`);
        }
      });
    });

    // ----------------------------------------------------------
    // 4c. Set up center exit island loop to defeat wall-following rule
    // ----------------------------------------------------------
    const c = centerIdx;
    if (c > 1 && c < N - 2) {
      // Carve the 3x3 loop corridors surrounding the center cell
      vWalls[c - 1][c - 1] = false;
      vWalls[c][c - 1] = false;
      hWalls[c - 1][c - 1] = false;
      hWalls[c - 1][c] = false;
      vWalls[c - 1][c + 1] = false;
      vWalls[c][c + 1] = false;
      hWalls[c + 1][c - 1] = false;
      hWalls[c + 1][c] = false;

      // Close all 4 walls of the center cell
      hWalls[c][c - 1] = true;
      hWalls[c][c] = true;
      vWalls[c - 1][c] = true;
      vWalls[c][c] = true;

      // Open exactly 1 entrance (top wall)
      hWalls[c][c - 1] = false;

      // Ensure center boundaries are not randomly punctured with holes
      noHolesWalls.add(`h,${c},${c - 1}`);
      noHolesWalls.add(`h,${c},${c}`);
      noHolesWalls.add(`v,${c - 1},${c}`);
      noHolesWalls.add(`v,${c},${c}`);
    }

    // ----------------------------------------------------------
    // 4d. BFS Connection Solver to guarantee 100% solvability
    // ----------------------------------------------------------
    function ensureAllConnected() {
      const visited = Array.from({ length: N }, () => Array(N).fill(false));
      let visitedCount = 0;
      const q = [];

      function visit(i, j) {
        visited[i][j] = true;
        visitedCount++;
        q.push({ i, j });
      }

      // Start BFS from entrance
      visit(0, 0);

      while (true) {
        while (q.length > 0) {
          const curr = q.shift();
          const { i, j } = curr;

          // West (moving horizontally)
          if (i > 0 && !visited[i - 1][j] && !vWalls[i - 1][j] && rowHeights[j] >= 0.75) visit(i - 1, j);
          // East (moving horizontally)
          if (i < N - 1 && !visited[i + 1][j] && !vWalls[i][j] && rowHeights[j] >= 0.75) visit(i + 1, j);
          // South (moving vertically)
          if (j > 0 && !visited[i][j - 1] && !hWalls[i][j - 1] && colWidths[i] >= 0.75) visit(i, j - 1);
          // North (moving vertically)
          if (j < N - 1 && !visited[i][j + 1] && !hWalls[i][j] && colWidths[i] >= 0.75) visit(i, j + 1);
        }

        if (visitedCount === N * N) break;

        // Find boundary candidate edges between visited and unvisited regions
        const candidates = [];
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            if (visited[i][j]) continue;

            // Horizontal candidates (West/East) are valid if row j is passable
            if (i > 0 && visited[i - 1][j] && rowHeights[j] >= 0.75) {
              candidates.push({ unvis: { i, j }, vis: { i: i - 1, j }, type: 'v', wallI: i - 1, wallJ: j });
            }
            if (i < N - 1 && visited[i + 1][j] && rowHeights[j] >= 0.75) {
              candidates.push({ unvis: { i, j }, vis: { i: i + 1, j }, type: 'v', wallI: i, wallJ: j });
            }
            // Vertical candidates (South/North) are valid if column i is passable
            if (j > 0 && visited[i][j - 1] && colWidths[i] >= 0.75) {
              candidates.push({ unvis: { i, j }, vis: { i, j: j - 1 }, type: 'h', wallI: i, wallJ: j - 1 });
            }
            if (j < N - 1 && visited[i][j + 1] && colWidths[i] >= 0.75) {
              candidates.push({ unvis: { i, j }, vis: { i, j: j + 1 }, type: 'h', wallI: i, wallJ: j });
            }
          }
        }

        if (candidates.length === 0) break;

        // Prefer candidate walls that are NOT room/exit boundaries
        const safeCandidates = candidates.filter(c => {
          const key = `${c.type},${c.wallI},${c.wallJ}`;
          return !noHolesWalls.has(key);
        });

        const chosen = safeCandidates.length > 0
          ? safeCandidates[Math.floor(Math.random() * safeCandidates.length)]
          : candidates[Math.floor(Math.random() * candidates.length)];

        if (chosen.type === 'h') {
          hWalls[chosen.wallI][chosen.wallJ] = false;
        } else {
          vWalls[chosen.wallI][chosen.wallJ] = false;
        }

        visit(chosen.unvis.i, chosen.unvis.j);
      }
    }

    ensureAllConnected();

    // ----------------------------------------------------------
    // 5. Multiple pillars per room
    // ----------------------------------------------------------
    const pillars = [];
    const pillarSet = new Set();

    roomCoordsList.forEach(({ startI, startJ, rw, rh }) => {
      const area = rw * rh;
      const numP = Math.min(4, Math.max(1, Math.floor(area / 4) + (Math.random() < 0.5 ? 1 : 0)));
      const placed = [];
      for (let att = 0; att < numP * 6 && placed.length < numP; att++) {
        const pI = startI + Math.floor(Math.random() * rw);
        const pJ = startJ + Math.floor(Math.random() * rh);
        const key = `${pI},${pJ}`;
        if (pillarSet.has(key)) continue;
        if (placed.some(p => Math.abs(p.pI - pI) < 2 && Math.abs(p.pJ - pJ) < 2) && area < 6) continue;

        // Prevent placing pillars near the exit or in cells that are too narrow
        if (Math.abs(pI - centerIdx) <= 1 && Math.abs(pJ - centerIdx) <= 1) continue;
        if (colWidths[pI] < 2.5 || rowHeights[pJ] < 2.5) continue;

        pillarSet.add(key);
        placed.push({ pI, pJ });
        const maxDim = Math.min(colWidths[pI], rowHeights[pJ]) * 0.42;
        const w = 0.4 + Math.random() * (maxDim - 0.4);
        const l = 0.4 + Math.random() * (maxDim - 0.4);
        pillars.push({ x: cellCX(pI), z: cellCZ(pJ), w, l, gridI: pI, gridJ: pJ });
      }
    });

    // ----------------------------------------------------------
    // 6. Build wall segments
    //    Horizontal wall at boundary between row j and j+1:
    //      Z = rowZ[j+1], spans X from colX[startI] to colX[endI+1]
    //    Vertical wall at boundary between column i and i+1:
    //      X = colX[i+1], spans Z from rowZ[startJ] to rowZ[endJ+1]
    // ----------------------------------------------------------
    const wallSegments = [];
    const THICK = WALL_T;

    // Horizontal inner walls
    for (let j = 0; j < N - 1; j++) {
      let i = 0;
      while (i < N) {
        if (hWalls[i][j]) {
          const startI = i;
          while (i < N && hWalls[i][j]) i++;
          const endI = i - 1;
          const wStartX = colX[startI];
          const wEndX = colX[endI + 1];
          const wLen = wEndX - wStartX;
          const wX = (wStartX + wEndX) / 2;
          const wZ = rowZ[j + 1];
          wallSegments.push({ type: 'horizontal', x: wX, z: wZ, length: wLen, thickness: THICK, gridI: startI, gridJ: j, count: endI - startI + 1 });
        } else i++;
      }
    }

    // Vertical inner walls
    for (let i = 0; i < N - 1; i++) {
      let j = 0;
      while (j < N) {
        if (vWalls[i][j]) {
          const startJ = j;
          while (j < N && vWalls[i][j]) j++;
          const endJ = j - 1;
          const wStartZ = rowZ[startJ];
          const wEndZ = rowZ[endJ + 1];
          const wLen = wEndZ - wStartZ;
          const wZ = (wStartZ + wEndZ) / 2;
          const wX = colX[i + 1];
          wallSegments.push({ type: 'vertical', x: wX, z: wZ, length: wLen, thickness: THICK, gridI: i, gridJ: startJ, count: endJ - startJ + 1 });
        } else j++;
      }
    }

    // Boundary walls
    // West: x = colX[0] = -S/2, rows 0..N-1
    {
      const sJ = 0, eJ = N - 1, wLen = rowZ[eJ + 1] - rowZ[sJ];
      wallSegments.push({ type: 'boundary-vertical', x: colX[0], z: (rowZ[sJ] + rowZ[eJ + 1]) / 2, length: wLen, thickness: THICK, gridI: 0, gridJ: sJ, count: eJ - sJ + 1 });
    }
    // East: x = colX[N] = S/2, rows 0..N-1
    {
      const sJ = 0, eJ = N - 1, wLen = rowZ[eJ + 1] - rowZ[sJ];
      wallSegments.push({ type: 'boundary-vertical', x: colX[N], z: (rowZ[sJ] + rowZ[eJ + 1]) / 2, length: wLen, thickness: THICK, gridI: N - 1, gridJ: sJ, count: eJ - sJ + 1 });
    }
    // South: z = rowZ[0] = -S/2, cols 0..N-1
    {
      const sI = 0, eI = N - 1, wLen = colX[eI + 1] - colX[sI];
      wallSegments.push({ type: 'boundary-horizontal', x: (colX[sI] + colX[eI + 1]) / 2, z: rowZ[0], length: wLen, thickness: THICK, gridI: sI, gridJ: 0, count: eI - sI + 1 });
    }
    // North: z = rowZ[N] = S/2, cols 0..N-1
    {
      const sI = 0, eI = N - 1, wLen = colX[eI + 1] - colX[sI];
      wallSegments.push({ type: 'boundary-horizontal', x: (colX[sI] + colX[eI + 1]) / 2, z: rowZ[N], length: wLen, thickness: THICK, gridI: sI, gridJ: N - 1, count: eI - sI + 1 });
    }

    // ----------------------------------------------------------
    // 6b. Add random holes on some inner walls
    // ----------------------------------------------------------
    const wallHeight = eyeHeight * 2.2;
    const innerWalls = wallSegments.filter(w => w.type === 'horizontal' || w.type === 'vertical');
    innerWalls.forEach(wall => {
      // Check if this wall segment contains any sealed room boundaries
      let cannotHaveHole = false;
      const isHoriz = wall.type === 'horizontal';
      for (let k = 0; k < wall.count; k++) {
        const i = isHoriz ? wall.gridI + k : wall.gridI;
        const j = isHoriz ? wall.gridJ : wall.gridJ + k;
        const key = `${isHoriz ? 'h' : 'v'},${i},${j}`;
        if (noHolesWalls.has(key)) {
          cannotHaveHole = true;
          break;
        }
      }
      if (cannotHaveHole) return;

      // 45% chance of having a hole if the wall is long enough (increased to have more doors)
      if (Math.random() < 0.45) {
        const minSideWall = 0.2; // minimum wall remaining on each side
        const maxLengthForHole = wall.length - 2 * minSideWall;
        if (maxLengthForHole > 1.15) { // Needs to be wide enough for a door (1.116m)
          // Choose offset along wall length (local coords from -length/2 to length/2)
          const w_door = 1.116;
          const h_door = 2.10;
          const halfL = wall.length / 2;

          // 85% chance of the hole being a door (to make doors appear more)
          const isDoor = Math.random() < 0.85;
          let isWeird = false;
          let holeW = w_door;
          let holeH = h_door;
          let yBottom = 0;
          let hingeDir = 'left';
          let rotated = false;

          if (isDoor) {
            isWeird = Math.random() < 0.25; // 25% of doors are weird
            const canBeHorizontal = maxLengthForHole > h_door;
            const dirs = canBeHorizontal ? ['left', 'right', 'top', 'bottom'] : ['left', 'right'];
            hingeDir = dirs[Math.floor(Math.random() * dirs.length)];

            rotated = (hingeDir === 'top' || hingeDir === 'bottom');
            if (rotated) {
              holeW = h_door;
              holeH = w_door;
            } else {
              holeW = w_door;
              holeH = h_door;
            }

            if (isWeird) {
              yBottom = Math.random() * (wallHeight - holeH - 0.2);
            } else {
              // 60% of normal doors are on the floor, 40% are floating/random height
              if (Math.random() < 0.6) {
                yBottom = 0;
              } else {
                yBottom = Math.random() * (wallHeight - holeH - 0.2);
              }
            }
          } else {
            // Normal random hole
            holeW = 0.5 + Math.random() * (maxLengthForHole - 0.5);
            const isLargeHole = Math.random() < 0.6;
            if (isLargeHole) {
              holeH = 1.65 + Math.random() * 0.6;
              yBottom = Math.random() < 0.4 ? 0 : 0.2 + Math.random() * 0.6;
            } else {
              holeH = 0.4 + Math.random() * 0.8;
              yBottom = 0.6 + Math.random() * 0.8;
            }
            if (yBottom + holeH > wallHeight - 0.2) {
              holeH = wallHeight - 0.2 - yBottom;
            }
          }

          const minOffset = -halfL + minSideWall + holeW / 2;
          const maxOffset = halfL - minSideWall - holeW / 2;
          const holeOffset = minOffset + Math.random() * (maxOffset - minOffset);

          if (holeH > 0.3) {
            wall.hole = {
              width: holeW,
              offset: holeOffset,
              yBottom: yBottom,
              yTop: yBottom + holeH,
              height: holeH,
              isDoor: isDoor,
              isWeird: isWeird,
              hingeDir: hingeDir,
              rotated: rotated
            };
          }
        }
      }
    });

    // ----------------------------------------------------------
    // 7. Light tiles (block-based non-adjacent placement)
    // ----------------------------------------------------------
    const lightTiles = [];
    const lightSet = new Set();
    const blockSize = 3;
    const blockList = [];
    for (let bx = 0; bx < Math.ceil(N / blockSize); bx++)
      for (let by = 0; by < Math.ceil(N / blockSize); by++)
        blockList.push({ bx, by });
    shuffle(blockList);

    blockList.forEach(({ bx, by }) => {
      const cells = [];
      const sI = bx * blockSize, eI = Math.min(N - 1, sI + blockSize - 1);
      const sJ = by * blockSize, eJ = Math.min(N - 1, sJ + blockSize - 1);
      for (let i = sI; i <= eI; i++) for (let j = sJ; j <= eJ; j++) cells.push({ i, j });
      shuffle(cells);
      for (const { i, j } of cells) {
        if ((i === centerIdx && j === centerIdx) || (i === 0 && j === 0) || (i === N - 1 && j === N - 1)) continue;
        if (pillars.some(p => p.gridI === i && p.gridJ === j)) continue;
        const nb = [`${i - 1},${j}`, `${i + 1},${j}`, `${i},${j - 1}`, `${i},${j + 1}`, `${i - 1},${j - 1}`, `${i + 1},${j + 1}`, `${i - 1},${j + 1}`, `${i + 1},${j - 1}`];
        if (nb.some(k => lightSet.has(k))) continue;
        lightTiles.push({ gridI: i, gridJ: j, x: cellCX(i), z: cellCZ(j) });
        lightSet.add(`${i},${j}`);
        break;
      }
    });

    // ----------------------------------------------------------
    // 8. worldToCell helper for game.js
    //    Binary-search the cumulative arrays to find grid (i,j)
    //    for any world (x, z) position.
    // ----------------------------------------------------------
    function worldToCell(worldX, worldZ) {
      let ci = N - 1;
      for (let i = 0; i < N; i++) { if (worldX < colX[i + 1]) { ci = i; break; } }
      let cj = N - 1;
      for (let j = 0; j < N; j++) { if (worldZ < rowZ[j + 1]) { cj = j; break; } }
      return { cellI: Math.max(0, Math.min(N - 1, ci)), cellJ: Math.max(0, Math.min(N - 1, cj)) };
    }

    // Exit cell world position (center of centerIdx cell)
    const exitX = cellCX(centerIdx);
    const exitZ = cellCZ(centerIdx);
    // Exit cell half-size (for hole geometry)
    const exitHalfW = colWidths[centerIdx] / 2;
    const exitHalfH = rowHeights[centerIdx] / 2;

    return {
      N,
      cellSize: S / N, // kept for any legacy code, avg cell size
      sideLength: S,
      level,
      centerIdx,
      colWidths, rowHeights,
      colX, rowZ,
      cellCX, cellCZ,
      worldToCell,
      walls: wallSegments,
      pillars,
      lights: lightTiles,
      hWalls,
      vWalls,
      exit: { x: exitX, z: exitZ, halfW: exitHalfW, halfH: exitHalfH },
      start: {
        x: cellCX(0),
        z: cellCZ(0)
      },
      start2: {
        x: cellCX(N - 1),
        z: cellCZ(N - 1)
      }
    };
  }
}
