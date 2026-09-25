'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { server } = require('../server');

let base;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function blankCells(rows, cols) {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

test('GET /health 返回 200 与 ok', async () => {
  const res = await fetch(base + '/health');
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
});

test('GET / 返回前端页面', async () => {
  const res = await fetch(base + '/');
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const html = await res.text();
  assert.match(html, /水渍分布复原/);
});

test('GET /app.js 与 /styles.css 可访问', async () => {
  for (const p of ['/app.js', '/styles.css']) {
    const res = await fetch(base + p);
    assert.strictEqual(res.status, 200, p);
  }
});

test('POST /api/solve 返回歧义与两个确有不同的方案', async () => {
  const res = await fetch(base + '/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: 4,
      cols: 4,
      rowCounts: [2, 2, 2, 0],
      colCounts: [2, 2, 2, 0],
      cells: blankCells(4, 4),
      components: 2,
    }),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.status, 'ambiguous');
  assert.strictEqual(body.solutions.length, 2);
  assert.notDeepStrictEqual(body.solutions[0], body.solutions[1]);
});

test('POST /api/solve 非法输入返回 400 与明细', async () => {
  const res = await fetch(base + '/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: 3 }),
  });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(Array.isArray(body.details));
  assert.ok(body.details.length > 0);
});

test('POST /api/solve 非 JSON 请求体返回 400', async () => {
  const res = await fetch(base + '/api/solve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json',
  });
  assert.strictEqual(res.status, 400);
});

test('路径穿越无法读取服务文件', async () => {
  for (const p of ['/../solver.js', '/%2e%2e/solver.js', '/%2e%2e%2f%solver.js']) {
    const res = await fetch(base + p);
    assert.ok([400, 403, 404].includes(res.status), `${p} -> ${res.status}`);
  }
});

test('未定义路径返回 404，未支持方法返回 405', async () => {
  const res = await fetch(base + '/no-such-file');
  assert.strictEqual(res.status, 404);
  const res2 = await fetch(base + '/health', { method: 'DELETE' });
  assert.strictEqual(res2.status, 405);
});
