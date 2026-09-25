'use strict';

/**
 * 领域求解冒烟：用已知答案的实例验证求解器与 HTTP 服务，
 * 全部通过则以退出码 0 结束，否则以 1 结束。
 */

const assert = require('node:assert');
const { solve } = require('../solver');
const { server } = require('../server');

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
  } catch (err) {
    failures++;
    console.error('  ✗', name, '-', err.message);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (err) {
    failures++;
    console.error('  ✗', name, '-', err.message);
  }
}

function blankCells(rows, cols) {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

// ---------- 领域求解冒烟 ----------

console.log('[1/2] 领域求解冒烟');

check('唯一结论：左上角 2x2 水渍团', () => {
  const res = solve({
    rows: 4, cols: 4,
    rowCounts: [2, 2, 0, 0], colCounts: [2, 2, 0, 0],
    cells: blankCells(4, 4), components: 1,
  });
  assert.strictEqual(res.status, 'unique');
  assert.deepStrictEqual(res.solutions[0], [
    [1, 1, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0],
  ]);
});

check('存在歧义：序最小方案 + 确有不同的替代方案', () => {
  const res = solve({
    rows: 4, cols: 4,
    rowCounts: [2, 2, 2, 0], colCounts: [2, 2, 2, 0],
    cells: blankCells(4, 4), components: 2,
  });
  assert.strictEqual(res.status, 'ambiguous');
  assert.strictEqual(res.solutions.length, 2);
  assert.deepStrictEqual(res.solutions[0], [
    [0, 1, 1, 0], [1, 0, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0],
  ]);
  assert.notDeepStrictEqual(res.solutions[0], res.solutions[1]);
});

check('无解：行列计数总和不相等', () => {
  const res = solve({
    rows: 4, cols: 4,
    rowCounts: [1, 1, 1, 1], colCounts: [2, 1, 1, 1],
    cells: blankCells(4, 4), components: 1,
  });
  assert.strictEqual(res.status, 'none');
});

check('斜角接触不连通：对角两格恰为 2 团', () => {
  const cells = blankCells(4, 4);
  cells[0][0] = 1;
  cells[1][1] = 1;
  const res = solve({
    rows: 4, cols: 4,
    rowCounts: [1, 1, 0, 0], colCounts: [1, 1, 0, 0],
    cells, components: 2,
  });
  assert.strictEqual(res.status, 'unique');
});

// ---------- HTTP 冒烟 ----------

async function main() {
  console.log('[2/2] HTTP 服务冒烟');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  await checkAsync('GET /health → 200 ok', async () => {
    const res = await fetch(base + '/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).status, 'ok');
  });

  await checkAsync('GET / → 前端页面', async () => {
    const res = await fetch(base + '/');
    assert.strictEqual(res.status, 200);
    assert.match(await res.text(), /水渍分布复原/);
  });

  await checkAsync('POST /api/solve → 领域结论', async () => {
    const res = await fetch(base + '/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: 4, cols: 4,
        rowCounts: [2, 2, 0, 0], colCounts: [2, 2, 0, 0],
        cells: blankCells(4, 4), components: 1,
      }),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).status, 'unique');
  });

  await checkAsync('POST /api/solve 非法输入 → 400', async () => {
    const res = await fetch(base + '/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: 99 }),
    });
    assert.strictEqual(res.status, 400);
  });

  server.close();

  if (failures > 0) {
    console.error(`SMOKE FAILED: ${failures} 项未通过`);
    process.exit(1);
  }
  console.log('SMOKE OK');
  process.exit(0);
}

main().catch((err) => {
  console.error('SMOKE FAILED:', err);
  process.exit(1);
});
