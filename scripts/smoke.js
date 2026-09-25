/**
 * 领域求解冒烟：验证三种结论（无解/唯一/歧义）、序最小方案、四邻接规则，
 * 并启动真实服务器检查 /health。任一项失败以非零退出码结束。
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  solveStains,
  CELL_UNKNOWN,
  CELL_WET,
  CELL_DRY,
} from '../public/solver.js';

const blank = (R, C) => Array.from({ length: R }, () => new Array(C).fill(CELL_UNKNOWN));
let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('领域求解冒烟：');

check('唯一解：全 1 网格恰为 1 个团', () => {
  const res = solveStains({
    rows: 4, cols: 4,
    rowCounts: [4, 4, 4, 4], colCounts: [4, 4, 4, 4],
    cells: blank(4, 4), components: 1,
  });
  assert.equal(res.status, 'unique');
  assert.deepEqual(res.solutions[0], [
    [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1],
  ]);
});

check('无解：行计数之和与列计数之和不相等', () => {
  const res = solveStains({
    rows: 4, cols: 4,
    rowCounts: [2, 2, 2, 2], colCounts: [3, 3, 1, 0],
    cells: blank(4, 4), components: 1,
  });
  assert.equal(res.status, 'none');
});

check('无解：斜角接触不得连通（对角四格是 4 个团而非 1 个）', () => {
  const cells = blank(4, 4);
  cells[0][0] = CELL_WET;
  cells[1][1] = CELL_WET;
  cells[2][2] = CELL_WET;
  cells[3][3] = CELL_WET;
  const res = solveStains({
    rows: 4, cols: 4,
    rowCounts: [1, 1, 1, 1], colCounts: [1, 1, 1, 1],
    cells, components: 1,
  });
  assert.equal(res.status, 'none');
});

check('歧义：同时给出序最小方案与确有不同的替代方案', () => {
  const res = solveStains({
    rows: 4, cols: 4,
    rowCounts: [2, 2, 2, 2], colCounts: [2, 2, 2, 2],
    cells: blank(4, 4), components: 2,
  });
  assert.equal(res.status, 'ambiguous');
  assert.equal(res.solutions.length, 2);
  assert.notDeepEqual(res.solutions[0], res.solutions[1]);
  // 序最小：行优先展开（首单元为最高位、湿 1 干 0）的二进制数更小
  const key = (g) => g.flat().join('');
  assert.ok(key(res.solutions[0]) < key(res.solutions[1]),
    '方案一须为行优先二进制序最小者');
  // 两个方案都满足行列计数
  for (const sol of res.solutions) {
    for (let r = 0; r < 4; r += 1) {
      assert.equal(sol[r].reduce((a, b) => a + b, 0), 2);
    }
    for (let c = 0; c < 4; c += 1) {
      assert.equal(sol.reduce((s, row) => s + row[c], 0), 2);
    }
  }
});

check('确认单元不得改变', () => {
  const cells = blank(4, 4);
  cells[0][0] = CELL_WET;
  cells[3][3] = CELL_DRY;
  const res = solveStains({
    rows: 4, cols: 4,
    rowCounts: [2, 2, 2, 2], colCounts: [2, 2, 2, 2],
    cells, components: 2,
  });
  assert.equal(res.status, 'ambiguous');
  for (const sol of res.solutions) {
    assert.equal(sol[0][0], 1);
    assert.equal(sol[3][3], 0);
  }
});

// 真实服务器健康检查
const port = 18080;
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
let healthy = false;
for (let i = 0; i < 30; i += 1) {
  await wait(200);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    if (r.ok) {
      const body = await r.json();
      if (body.status === 'ok') { healthy = true; break; }
    }
  } catch { /* 服务器尚未就绪 */ }
}
server.kill();
if (!healthy) {
  console.error('  ✗ 服务器 /health 健康检查失败');
  process.exit(1);
}
passed += 1;
console.log('  ✓ 服务器 /health 健康检查');

console.log(`冒烟通过（${passed} 项）`);
