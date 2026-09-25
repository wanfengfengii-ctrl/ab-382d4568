import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  solveStains,
  validateInput,
  countComponents,
  CELL_UNKNOWN,
  CELL_WET,
  CELL_DRY,
  MAX_COMPONENTS,
} from '../public/solver.js';

/** 暴力枚举全部 2^(R*C) 网格，返回按行优先二进制序升序的全部合法解。 */
function bruteForce({ rows: R, cols: C, rowCounts, colCounts, cells, components: K }) {
  const solutions = [];
  const total = R * C;
  for (let bits = 0; bits < (1 << total); bits += 1) {
    const grid = [];
    let ok = true;
    for (let r = 0; r < R && ok; r += 1) {
      const row = [];
      for (let c = 0; c < C; c += 1) row.push((bits >> (r * C + c)) & 1);
      grid.push(row);
    }
    // 确认单元
    for (let r = 0; r < R && ok; r += 1) {
      for (let c = 0; c < C && ok; c += 1) {
        if (cells[r][c] === CELL_WET && grid[r][c] !== 1) ok = false;
        if (cells[r][c] === CELL_DRY && grid[r][c] !== 0) ok = false;
      }
    }
    if (!ok) continue;
    for (let r = 0; r < R && ok; r += 1) {
      if (grid[r].reduce((a, b) => a + b, 0) !== rowCounts[r]) ok = false;
    }
    for (let c = 0; c < C && ok; c += 1) {
      let s = 0;
      for (let r = 0; r < R; r += 1) s += grid[r][c];
      if (s !== colCounts[c]) ok = false;
    }
    if (!ok) continue;
    if (countComponents(grid) !== K) continue;
    solutions.push(grid);
  }
  // 行优先二进制序：首单元为最高位，潮湿 1 干燥 0，数值小者在前
  const key = (grid) => {
    let k = 0n;
    for (const row of grid) for (const v of row) k = (k << 1n) | BigInt(v);
    return k;
  };
  solutions.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return solutions;
}

function blankCells(R, C) {
  return Array.from({ length: R }, () => new Array(C).fill(CELL_UNKNOWN));
}

/** 以确定性伪随机数生成随机用例。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCase(rand) {
  // 限定 4×4，使暴力枚举（2^16）可承受。
  // 先随机生成一个真实网格并反推行列计数与团数，保证较高可解率，
  // 从而三种结论（无解/唯一/歧义）都能被覆盖。
  const R = 4;
  const C = 4;
  const truth = Array.from({ length: R },
    () => Array.from({ length: C }, () => (rand() < 0.45 ? 1 : 0)));
  const rowCounts = truth.map((row) => row.reduce((a, b) => a + b, 0));
  const colCounts = Array.from({ length: C },
    (_, c) => truth.reduce((s, row) => s + row[c], 0));
  const cells = blankCells(R, C);
  // 从真实网格中随机揭示部分单元作为确认标记
  for (let r = 0; r < R; r += 1) {
    for (let c = 0; c < C; c += 1) {
      const p = rand();
      if (p < 0.15) cells[r][c] = truth[r][c] === 1 ? CELL_WET : CELL_DRY;
    }
  }
  const actualK = countComponents(truth);
  // 多数情况取真实团数（可解），偶尔偏移以制造无解
  let components = actualK;
  const q = rand();
  if (q < 0.2) components = Math.min(MAX_COMPONENTS, actualK + 1);
  else if (q < 0.3) components = Math.max(1, actualK - 1);
  components = Math.max(1, Math.min(3, components));
  return { rows: R, cols: C, rowCounts, colCounts, cells, components };
}

test('validateInput 拒绝非法输入', () => {
  const base = {
    rows: 4, cols: 4,
    rowCounts: [0, 0, 0, 0], colCounts: [0, 0, 0, 0],
    cells: blankCells(4, 4), components: 1,
  };
  assert.equal(validateInput(base).ok, true);
  assert.equal(validateInput(null).ok, false);
  assert.equal(validateInput({ ...base, rows: 3 }).ok, false);
  assert.equal(validateInput({ ...base, rows: 9 }).ok, false);
  assert.equal(validateInput({ ...base, cols: 2 }).ok, false);
  assert.equal(validateInput({ ...base, components: 0 }).ok, false);
  assert.equal(validateInput({ ...base, components: 4 }).ok, false);
  assert.equal(validateInput({ ...base, rowCounts: [0, 0, 0] }).ok, false);
  assert.equal(validateInput({ ...base, rowCounts: [0, 0, 0, -1] }).ok, false);
  assert.equal(validateInput({ ...base, rowCounts: [0, 0, 0, 5] }).ok, false);
  assert.equal(validateInput({ ...base, rowCounts: [0, 0, 0, 1.5] }).ok, false);
  assert.equal(validateInput({ ...base, colCounts: [0, 0, 0, 0, 0] }).ok, false);
  assert.equal(validateInput({ ...base, cells: blankCells(3, 4) }).ok, false);
  const badCell = blankCells(4, 4);
  badCell[1][1] = 7;
  assert.equal(validateInput({ ...base, cells: badCell }).ok, false);
});

test('countComponents 遵循四邻接、斜角不连通', () => {
  assert.equal(countComponents([
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]), 4); // 纯对角线互不相连
  assert.equal(countComponents([
    [1, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 1],
    [0, 0, 0, 0],
  ]), 2);
  assert.equal(countComponents([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]), 0);
});

test('唯一解：全 1 网格', () => {
  const R = 4; const C = 4;
  const res = solveStains({
    rows: R, cols: C,
    rowCounts: [C, C, C, C],
    colCounts: [R, R, R, R],
    cells: blankCells(R, C),
    components: 1,
  });
  assert.equal(res.status, 'unique');
  assert.deepEqual(res.solutions[0], [
    [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1],
  ]);
});

test('无解：行列总数不一致 / 团数超过潮湿总数', () => {
  const R = 4; const C = 4;
  assert.equal(solveStains({
    rows: R, cols: C,
    rowCounts: [1, 0, 0, 0], colCounts: [0, 0, 0, 0],
    cells: blankCells(R, C), components: 1,
  }).status, 'none');
  assert.equal(solveStains({
    rows: R, cols: C,
    rowCounts: [1, 0, 0, 0], colCounts: [1, 0, 0, 0],
    cells: blankCells(R, C), components: 2,
  }).status, 'none');
});

test('确认单元不得改变', () => {
  const R = 4; const C = 4;
  const cells = blankCells(R, C);
  cells[0][0] = CELL_WET;
  cells[3][3] = CELL_DRY;
  // 该约束下 1 个团无解（暴力枚举已核实），2 个团有且仅有两个解
  const impossible = solveStains({
    rows: R, cols: C,
    rowCounts: [2, 2, 2, 2], colCounts: [2, 2, 2, 2],
    cells, components: 1,
  });
  assert.equal(impossible.status, 'none');
  const res = solveStains({
    rows: R, cols: C,
    rowCounts: [2, 2, 2, 2], colCounts: [2, 2, 2, 2],
    cells, components: 2,
  });
  assert.equal(res.status, 'ambiguous');
  for (const sol of res.solutions) {
    assert.equal(sol[0][0], 1);
    assert.equal(sol[3][3], 0);
  }
});

test('歧义时给出序最小方案与确有不同的替代方案', () => {
  const R = 4; const C = 4;
  const input = {
    rows: R, cols: C,
    rowCounts: [1, 1, 1, 1], colCounts: [1, 1, 1, 1],
    cells: blankCells(R, C), components: 4,
  };
  const res = solveStains(input);
  assert.equal(res.status, 'ambiguous');
  assert.equal(res.solutions.length, 2);
  assert.notDeepEqual(res.solutions[0], res.solutions[1]);
  const bf = bruteForce(input);
  assert.ok(bf.length >= 2);
  assert.deepEqual(res.solutions[0], bf[0]); // 序最小
  assert.deepEqual(res.solutions[1], bf[1]); // 次小（确有不同的替代）
});

test('与暴力枚举随机对照 200 例', () => {
  const rand = mulberry32(20260925);
  let seenNone = 0; let seenUnique = 0; let seenAmbiguous = 0;
  for (let t = 0; t < 200; t += 1) {
    const input = randomCase(rand);
    assert.equal(validateInput(input).ok, true);
    const res = solveStains(input);
    assert.notEqual(res.status, 'overload', `用例 ${t} 超出枚举预算`);
    const bf = bruteForce(input);
    const expectStatus = bf.length === 0 ? 'none' : bf.length === 1 ? 'unique' : 'ambiguous';
    assert.equal(res.status, expectStatus, `用例 ${t} 状态不符`);
    assert.deepEqual(res.solutions, bf.slice(0, 2), `用例 ${t} 解不符`);
    if (expectStatus === 'none') seenNone += 1;
    else if (expectStatus === 'unique') seenUnique += 1;
    else seenAmbiguous += 1;
  }
  // 确保对照集三种结论都覆盖到
  assert.ok(seenNone > 0, '未覆盖无解');
  assert.ok(seenUnique > 0, '未覆盖唯一解');
  assert.ok(seenAmbiguous > 0, '未覆盖歧义');
});

test('8×8 最大规模在预算内完成', () => {
  const R = 8; const C = 8;
  const res = solveStains({
    rows: R, cols: C,
    rowCounts: [4, 4, 4, 4, 4, 4, 4, 4],
    colCounts: [4, 4, 4, 4, 4, 4, 4, 4],
    cells: blankCells(R, C),
    components: 1,
  });
  assert.notEqual(res.status, 'overload');
  assert.ok(res.status === 'ambiguous'); // 对称大网格必有大量解
});
