'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  solve,
  validateInput,
  countComponents,
  CELL_UNKNOWN,
  CELL_WET,
  CELL_DRY,
} = require('../solver');

function blankCells(rows, cols) {
  return Array.from({ length: rows }, () => new Array(cols).fill(CELL_UNKNOWN));
}

function makeInput(overrides) {
  return Object.assign({
    rows: 4,
    cols: 4,
    rowCounts: [1, 1, 1, 1],
    colCounts: [1, 1, 1, 1],
    cells: blankCells(4, 4),
    components: 1,
  }, overrides);
}

/** 与求解器无关的暴力枚举：行优先逐格尝试 0 再 1，最多收集 limit 个解。 */
function bruteForce(input, limit = 2) {
  const { rows, cols, rowCounts, colCounts, cells, components: K } = input;
  const sols = [];
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const rowUsed = new Array(rows).fill(0);
  const colUsed = new Array(cols).fill(0);
  const order = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push([r, c]);

  function rec(i) {
    if (sols.length >= limit) return;
    if (i === order.length) {
      for (let r = 0; r < rows; r++) if (rowUsed[r] !== rowCounts[r]) return;
      for (let c = 0; c < cols; c++) if (colUsed[c] !== colCounts[c]) return;
      if (countComponents(grid, rows, cols) !== K) return;
      sols.push(grid.map((row) => row.slice()));
      return;
    }
    const [r, c] = order[i];
    if (cells[r][c] === CELL_DRY) { rec(i + 1); return; }
    if (cells[r][c] === CELL_WET) {
      if (rowUsed[r] < rowCounts[r] && colUsed[c] < colCounts[c]) {
        grid[r][c] = 1; rowUsed[r]++; colUsed[c]++;
        rec(i + 1);
        grid[r][c] = 0; rowUsed[r]--; colUsed[c]--;
      }
      return;
    }
    rec(i + 1); // 先尝试 0 → 行优先二进制序升序
    if (rowUsed[r] < rowCounts[r] && colUsed[c] < colCounts[c]) {
      grid[r][c] = 1; rowUsed[r]++; colUsed[c]++;
      rec(i + 1);
      grid[r][c] = 0; rowUsed[r]--; colUsed[c]--;
    }
  }
  rec(0);
  return sols;
}

function lexCompare(a, b) {
  for (let r = 0; r < a.length; r++) {
    for (let c = 0; c < a[r].length; c++) {
      if (a[r][c] !== b[r][c]) return a[r][c] - b[r][c];
    }
  }
  return 0;
}

function satisfiesConstraints(input, grid) {
  const { rows, cols, rowCounts, colCounts, cells, components: K } = input;
  for (let r = 0; r < rows; r++) {
    let sum = 0;
    for (let c = 0; c < cols; c++) sum += grid[r][c];
    if (sum !== rowCounts[r]) return false;
  }
  for (let c = 0; c < cols; c++) {
    let sum = 0;
    for (let r = 0; r < rows; r++) sum += grid[r][c];
    if (sum !== colCounts[c]) return false;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] === CELL_WET && grid[r][c] !== 1) return false;
      if (cells[r][c] === CELL_DRY && grid[r][c] !== 0) return false;
    }
  }
  return countComponents(grid, rows, cols) === K;
}

test('输入校验：拒绝非法维度、计数与标注', () => {
  assert.strictEqual(validateInput(null).ok, false);
  assert.strictEqual(validateInput(makeInput({ rows: 3 })).ok, false);
  assert.strictEqual(validateInput(makeInput({ rows: 9 })).ok, false);
  assert.strictEqual(validateInput(makeInput({ cols: 2 })).ok, false);
  assert.strictEqual(validateInput(makeInput({ components: 0 })).ok, false);
  assert.strictEqual(validateInput(makeInput({ components: 4 })).ok, false);
  assert.strictEqual(validateInput(makeInput({ components: 1.5 })).ok, false);
  assert.strictEqual(validateInput(makeInput({ rowCounts: [1, 1, 1] })).ok, false);
  assert.strictEqual(validateInput(makeInput({ rowCounts: [1, 1, 1, -1] })).ok, false);
  assert.strictEqual(validateInput(makeInput({ rowCounts: [1, 1, 1, 5] })).ok, false); // 超过列数
  assert.strictEqual(validateInput(makeInput({ colCounts: [1, 1, 1, 1.5] })).ok, false);
  const badCells = blankCells(4, 4);
  badCells[0][0] = 3;
  assert.strictEqual(validateInput(makeInput({ cells: badCells })).ok, false);
  assert.strictEqual(validateInput(makeInput({ cells: blankCells(4, 3) })).ok, false);
  assert.strictEqual(validateInput(makeInput({})).ok, true);
});

test('唯一解：左上角 2x2 水渍团', () => {
  const input = makeInput({
    rowCounts: [2, 2, 0, 0],
    colCounts: [2, 2, 0, 0],
    components: 1,
  });
  const res = solve(input);
  assert.strictEqual(res.status, 'unique');
  assert.strictEqual(res.solutions.length, 1);
  assert.deepStrictEqual(res.solutions[0], [
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  assert.strictEqual(res.meta.exhaustive, true);
});

test('歧义：给出序最小方案与确有不同的替代方案', () => {
  // 3x3 区域每行每列各 2 格：共 6 种布局，恰为 2 团（斜角不连通）
  const input = makeInput({
    rowCounts: [2, 2, 2, 0],
    colCounts: [2, 2, 2, 0],
    components: 2,
  });
  const res = solve(input);
  assert.strictEqual(res.status, 'ambiguous');
  assert.strictEqual(res.solutions.length, 2);
  // 行优先二进制序最小方案
  assert.deepStrictEqual(res.solutions[0], [
    [0, 1, 1, 0],
    [1, 0, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
  ]);
  const [a, b] = res.solutions;
  assert.notDeepStrictEqual(a, b);                 // 确有不同
  assert.ok(lexCompare(a, b) < 0);                 // A 严格小于 B
  assert.ok(satisfiesConstraints(input, a));
  assert.ok(satisfiesConstraints(input, b));
  assert.strictEqual(res.meta.exhaustive, false);
});

test('无解：行列计数总和不相等', () => {
  const res = solve(makeInput({ colCounts: [2, 1, 1, 1] }));
  assert.strictEqual(res.status, 'none');
  assert.deepStrictEqual(res.solutions, []);
});

test('无解：水渍团数不可达（斜角接触不得连通）', () => {
  // 强制潮湿格 (0,0) 与 (3,3)（或 (0,3) 与 (3,0)），只能斜角相望 → 恒为 2 团
  const base = makeInput({
    rowCounts: [1, 0, 0, 1],
    colCounts: [1, 0, 0, 1],
  });
  assert.strictEqual(solve(Object.assign({}, base, { components: 1 })).status, 'none');
  const two = solve(Object.assign({}, base, { components: 2 }));
  assert.strictEqual(two.status, 'ambiguous'); // 恰有两种对角布局
  assert.strictEqual(two.solutions.length, 2);
});

test('斜角不连通：对角两格计为两个独立水渍团', () => {
  const cells = blankCells(4, 4);
  cells[0][0] = CELL_WET;
  cells[1][1] = CELL_WET;
  const base = makeInput({
    rowCounts: [1, 1, 0, 0],
    colCounts: [1, 1, 0, 0],
    cells,
  });
  const asTwo = solve(Object.assign({}, base, { components: 2 }));
  assert.strictEqual(asTwo.status, 'unique');
  assert.strictEqual(asTwo.solutions[0][0][0], 1);
  assert.strictEqual(asTwo.solutions[0][1][1], 1);
  assert.strictEqual(solve(Object.assign({}, base, { components: 1 })).status, 'none');
});

test('确认单元不得改变', () => {
  const cells = blankCells(4, 4);
  cells[0][0] = CELL_WET;
  cells[3][3] = CELL_DRY;
  const input = makeInput({
    rowCounts: [2, 2, 0, 0],
    colCounts: [2, 2, 0, 0],
    cells,
    components: 1,
  });
  const res = solve(input);
  assert.strictEqual(res.status, 'unique');
  assert.strictEqual(res.solutions[0][0][0], 1);
  assert.strictEqual(res.solutions[0][3][3], 0);
});

test('确认标注与计数冲突 → 无解', () => {
  const cells = blankCells(4, 4);
  cells[0][0] = CELL_WET;
  const res = solve(makeInput({ rowCounts: [0, 1, 1, 1], colCounts: [1, 1, 1, 1], cells }));
  assert.strictEqual(res.status, 'none');
});

test('水渍团数超过潮湿格总数 → 无解', () => {
  const res = solve(makeInput({
    rowCounts: [1, 1, 0, 0],
    colCounts: [1, 1, 0, 0],
    components: 3,
  }));
  assert.strictEqual(res.status, 'none');
});

test('全湿网格：8x8 恰为 1 团唯一，2 团无解', () => {
  const cells = blankCells(8, 8);
  const input = makeInput({
    rows: 8,
    cols: 8,
    rowCounts: [8, 8, 8, 8, 8, 8, 8, 8],
    colCounts: [8, 8, 8, 8, 8, 8, 8, 8],
    cells,
  });
  assert.strictEqual(solve(Object.assign({}, input, { components: 1 })).status, 'unique');
  assert.strictEqual(solve(Object.assign({}, input, { components: 2 })).status, 'none');
});

test('大网格性能：8x8 均衡计数快速判定歧义', () => {
  const input = makeInput({
    rows: 8,
    cols: 8,
    rowCounts: [4, 4, 4, 4, 4, 4, 4, 4],
    colCounts: [4, 4, 4, 4, 4, 4, 4, 4],
    cells: blankCells(8, 8),
    components: 1,
  });
  const res = solve(input);
  assert.strictEqual(res.status, 'ambiguous');
  assert.ok(res.meta.nodes < 10_000_000);
});

test('countComponents：四邻接语义', () => {
  const grid = [
    [1, 0, 1],
    [0, 1, 0],
    [1, 1, 0],
  ];
  // (0,0)、(0,2)、(1,1)-(2,1)-(2,0) → 3 团（对角不合并）
  assert.strictEqual(countComponents(grid, 3, 3), 3);
  assert.strictEqual(countComponents([[1, 1], [1, 1]], 2, 2), 1);
  assert.strictEqual(countComponents([[0, 0], [0, 0]], 2, 2), 0);
});

test('与暴力枚举对拍：随机小实例结论与方案完全一致', () => {
  let seed = 20260925;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x80000000;
  };
  for (let iter = 0; iter < 60; iter++) {
    const rows = iter < 45 ? 4 : 5;
    const cols = iter % 3 === 0 ? 5 : 4;
    // 随机生成一个“真实”网格，取其边际计数，并随机确认部分单元
    const truth = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (rand() < 0.4 ? 1 : 0)));
    const rowCounts = truth.map((row) => row.reduce((a, b) => a + b, 0));
    const colCounts = Array.from({ length: cols }, (_, c) =>
      truth.reduce((a, row) => a + row[c], 0));
    const cells = blankCells(rows, cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const roll = rand();
        if (roll < 0.15) cells[r][c] = truth[r][c] === 1 ? CELL_WET : CELL_DRY;
      }
    }
    const input = {
      rows, cols, rowCounts, colCounts, cells,
      components: 1 + Math.floor(rand() * 3),
    };
    const expected = bruteForce(input);
    const got = solve(input);
    const expectedStatus = expected.length === 0 ? 'none' : expected.length === 1 ? 'unique' : 'ambiguous';
    assert.strictEqual(got.status, expectedStatus, `iter ${iter}: ${JSON.stringify(input)}`);
    assert.deepStrictEqual(got.solutions, expected, `iter ${iter}: 方案不一致`);
  }
});
