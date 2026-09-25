'use strict';

/**
 * 领域求解器：纸本文物水渍分布复原。
 *
 * 在以下约束下于本机联合枚举所有合法网格：
 *   - 每行、每列的潮湿单元数与透射成像计数精确相等；
 *   - 已确认潮湿 / 已确认干燥的单元不得改变；
 *   - 全部潮湿单元按共享边的四邻接关系（斜角接触不算连通）
 *     恰好形成指定数量（1-3）的连通水渍团。
 *
 * 输出顺序约定为“行优先二进制序”：第 0 行第 0 列是二进制数的最高位，
 * 0 < 1。按此序找到的第一个方案即序最小方案；一旦找到 2 个方案即可
 * 判定“存在歧义”，无需继续枚举（唯一 / 无解的判定均已穷举全部可能）。
 */

const CELL_UNKNOWN = 0; // 待定
const CELL_WET = 1;     // 已确认潮湿
const CELL_DRY = 2;     // 已确认干燥

const MIN_SIDE = 4;
const MAX_SIDE = 8;
const MIN_COMPONENTS = 1;
const MAX_COMPONENTS = 3;

const SOLUTION_LIMIT = 2;        // 0 / 1 / ≥2 足以判定三种结论
const NODE_BUDGET = 10_000_000;  // 防御性上限，正常规模远低于此

function isInt(v) {
  return Number.isInteger(v);
}

/** 校验求解输入，返回 { ok, errors }。 */
function validateInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['请求必须是 JSON 对象'] };
  }
  const { rows, cols, rowCounts, colCounts, cells, components } = input;

  if (!isInt(rows) || rows < MIN_SIDE || rows > MAX_SIDE) {
    errors.push(`行数须为 ${MIN_SIDE}-${MAX_SIDE} 的整数`);
  }
  if (!isInt(cols) || cols < MIN_SIDE || cols > MAX_SIDE) {
    errors.push(`列数须为 ${MIN_SIDE}-${MAX_SIDE} 的整数`);
  }
  if (!isInt(components) || components < MIN_COMPONENTS || components > MAX_COMPONENTS) {
    errors.push(`水渍团数须为 ${MIN_COMPONENTS}-${MAX_COMPONENTS} 的整数`);
  }
  if (errors.length > 0) return { ok: false, errors };

  if (!Array.isArray(rowCounts) || rowCounts.length !== rows ||
      rowCounts.some((v) => !isInt(v) || v < 0 || v > cols)) {
    errors.push('行计数须为长度等于行数、取值 0..列数 的非负整数数组');
  }
  if (!Array.isArray(colCounts) || colCounts.length !== cols ||
      colCounts.some((v) => !isInt(v) || v < 0 || v > rows)) {
    errors.push('列计数须为长度等于列数、取值 0..行数 的非负整数数组');
  }
  if (!Array.isArray(cells) || cells.length !== rows ||
      cells.some((row) => !Array.isArray(row) || row.length !== cols ||
        row.some((v) => v !== CELL_UNKNOWN && v !== CELL_WET && v !== CELL_DRY))) {
    errors.push('单元标注须为 行数×列数 的数组，取值 0(待定)/1(已确认潮湿)/2(已确认干燥)');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 生成某行的全部合法位型：恰好 count 个潮湿位，且不违反确认标注。
 * 每个位型带 key：以第 0 列为最高位的二进制数值，用于行优先二进制序排序。
 */
function genRowPatterns(cols, count, cellRow) {
  const forced = []; // 已确认潮湿的列
  const free = [];   // 待定（可干可湿）的列
  for (let c = 0; c < cols; c++) {
    if (cellRow[c] === CELL_WET) forced.push(c);
    else if (cellRow[c] !== CELL_DRY) free.push(c);
  }
  const need = count - forced.length;
  const patterns = [];
  if (need < 0 || need > free.length) return patterns;

  const chosen = [];
  const emit = () => {
    let mask = 0;
    let key = 0;
    for (const c of forced) { mask |= 1 << c; key |= 1 << (cols - 1 - c); }
    for (const c of chosen) { mask |= 1 << c; key |= 1 << (cols - 1 - c); }
    patterns.push({ mask, key, count });
  };
  const rec = (idx, left) => {
    if (left === 0) { emit(); return; }
    for (let i = idx; i <= free.length - left; i++) {
      chosen.push(free[i]);
      rec(i + 1, left - 1);
      chosen.pop();
    }
  };
  rec(0, need);
  return patterns;
}

/** 精确统计网格中四邻接连通团的数量（斜角不连通）。 */
function countComponents(grid, rows, cols) {
  const seen = new Uint8Array(rows * cols);
  const stack = [];
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = r * cols + c;
      if (grid[r][c] !== 1 || seen[start]) continue;
      count++;
      seen[start] = 1;
      stack.push(start);
      while (stack.length > 0) {
        const cur = stack.pop();
        const cr = Math.floor(cur / cols);
        const cc = cur % cols;
        if (cr > 0 && grid[cr - 1][cc] === 1 && !seen[cur - cols]) { seen[cur - cols] = 1; stack.push(cur - cols); }
        if (cr < rows - 1 && grid[cr + 1][cc] === 1 && !seen[cur + cols]) { seen[cur + cols] = 1; stack.push(cur + cols); }
        if (cc > 0 && grid[cr][cc - 1] === 1 && !seen[cur - 1]) { seen[cur - 1] = 1; stack.push(cur - 1); }
        if (cc < cols - 1 && grid[cr][cc + 1] === 1 && !seen[cur + 1]) { seen[cur + 1] = 1; stack.push(cur + 1); }
      }
    }
  }
  return count;
}

/**
 * 求解入口。返回：
 *   { status: 'none' | 'unique' | 'ambiguous',
 *     solutions: [grid, ...],   // 0/1/2 个；第 1 个为行优先二进制序最小
 *     meta: { nodes, elapsedMs, exhaustive } }
 * 输入非法时抛出 code='EINVAL' 的错误；超出枚举预算抛出 code='EBUDGET'。
 */
function solve(input) {
  const startedAt = Date.now();
  const check = validateInput(input);
  if (!check.ok) {
    const err = new Error('invalid input: ' + check.errors.join('; '));
    err.code = 'EINVAL';
    throw err;
  }
  const { rows, cols, rowCounts, colCounts, cells } = input;
  const K = input.components;

  const finish = (status, solutions, nodes) => ({
    status,
    solutions,
    meta: { nodes, elapsedMs: Date.now() - startedAt, exhaustive: solutions.length < SOLUTION_LIMIT },
  });

  // 快速判负：行列总和必须一致；每个连通团至少占一格
  const totalWet = rowCounts.reduce((a, b) => a + b, 0);
  const colTotal = colCounts.reduce((a, b) => a + b, 0);
  if (totalWet !== colTotal || totalWet < K) return finish('none', [], 0);

  // 每列已确认潮湿数不得超过该列计数
  for (let c = 0; c < cols; c++) {
    let confirmed = 0;
    for (let r = 0; r < rows; r++) if (cells[r][c] === CELL_WET) confirmed++;
    if (confirmed > colCounts[c]) return finish('none', [], 0);
  }

  // 每行的合法位型，按行优先二进制序升序（保证首个解即序最小）
  const rowPatterns = [];
  for (let r = 0; r < rows; r++) {
    const patterns = genRowPatterns(cols, rowCounts[r], cells[r]);
    if (patterns.length === 0) return finish('none', [], 0);
    patterns.sort((a, b) => a.key - b.key);
    rowPatterns.push(patterns);
  }

  const solutions = [];
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const colUsed = new Array(cols).fill(0);

  // 可回滚并查集：随行放置增量跟踪连通团
  const parent = new Int32Array(rows * cols);
  const rank = new Int8Array(rows * cols);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const ufLog = [];

  let nodes = 0;
  let closed = 0;      // 已封闭（不再可能被未来行触及）的连通团数
  let frontier = [];   // 当前最后一行所触及的连通团根
  let prevMask = 0;    // 上一行的潮湿位型
  let placedWet = 0;   // 已放置的潮湿单元总数

  const find = (x) => { while (parent[x] !== x) x = parent[x]; return x; };
  const union = (a, b) => {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) { const t = ra; ra = rb; rb = t; }
    ufLog.push((rb << 1) | (rank[ra] === rank[rb] ? 1 : 0));
    parent[rb] = ra;
    if (rank[ra] === rank[rb]) rank[ra]++;
  };
  const undoTo = (mark) => {
    while (ufLog.length > mark) {
      const entry = ufLog.pop();
      const child = entry >> 1;
      const inc = entry & 1;
      const p = parent[child];
      parent[child] = child;
      if (inc) rank[p]--;
    }
  };

  function dfs(r) {
    if (solutions.length >= SOLUTION_LIMIT) return;
    if (++nodes > NODE_BUDGET) {
      const err = new Error('search budget exceeded');
      err.code = 'EBUDGET';
      throw err;
    }
    for (const pat of rowPatterns[r]) {
      // 列容量快速检查
      let capacityOk = true;
      for (let c = 0; c < cols; c++) {
        if ((pat.mask & (1 << c)) !== 0 && colUsed[c] + 1 > colCounts[c]) { capacityOk = false; break; }
      }
      if (!capacityOk) continue;

      const savedClosed = closed;
      const savedFrontier = frontier;
      const savedPrevMask = prevMask;
      const savedPlaced = placedWet;
      const mark = ufLog.length;

      // 放置第 r 行
      for (let c = 0; c < cols; c++) {
        const wet = (pat.mask & (1 << c)) !== 0;
        grid[r][c] = wet ? 1 : 0;
        if (wet) colUsed[c]++;
      }
      placedWet += pat.count;

      // 增量并查集：行内横向合并 + 与上一行的纵向合并
      const base = r * cols;
      for (let c = 0; c < cols; c++) {
        if ((pat.mask & (1 << c)) !== 0) {
          if (c > 0 && (pat.mask & (1 << (c - 1))) !== 0) union(base + c, base + c - 1);
          if (r > 0 && (prevMask & (1 << c)) !== 0) union(base + c, base + c - cols);
        }
      }
      // 新 frontier；不再被触及的旧连通团封闭（封闭团永远无法再合并）
      const newFrontier = [];
      {
        const seenRoots = new Set();
        for (let c = 0; c < cols; c++) {
          if ((pat.mask & (1 << c)) !== 0) {
            const root = find(base + c);
            if (!seenRoots.has(root)) { seenRoots.add(root); newFrontier.push(root); }
          }
        }
      }
      const newRootSet = new Set(newFrontier);
      // 注意用 find 解析旧根：两个开放团可能刚在本行合并，
      // 被合并的旧根不再是根，但其连通团仍然开放，不得误计为封闭
      for (const root of frontier) if (!newRootSet.has(find(root))) closed++;
      frontier = newFrontier;
      prevMask = pat.mask;

      const rowsLeft = rows - 1 - r;
      const remainingWet = totalWet - placedWet;

      // 剪枝一：每列剩余行数须足以达成列计数，且不得超限
      let feasible = true;
      for (let c = 0; c < cols; c++) {
        if (colUsed[c] > colCounts[c] || colUsed[c] + rowsLeft < colCounts[c]) { feasible = false; break; }
      }
      // 剪枝二：连通团数的可达区间 [minPossible, maxPossible]
      // （开放团可能相互合并，故 closed+open>K 不能作为剪枝条件）
      if (feasible) {
        const open = frontier.length;
        const minPossible = closed + (open > 0 || remainingWet > 0 ? 1 : 0);
        const maxPossible = closed + open + remainingWet;
        if (K < minPossible || K > maxPossible) feasible = false;
        else if (remainingWet === 0 && closed + open !== K) feasible = false;
      }

      if (feasible) {
        if (r === rows - 1) {
          // 叶子：用精确 BFS 复核连通团数后收录
          if (countComponents(grid, rows, cols) === K) {
            solutions.push(grid.map((row) => row.slice()));
          }
        } else {
          dfs(r + 1);
        }
      }

      // 回溯
      undoTo(mark);
      closed = savedClosed;
      frontier = savedFrontier;
      prevMask = savedPrevMask;
      placedWet = savedPlaced;
      for (let c = 0; c < cols; c++) if ((pat.mask & (1 << c)) !== 0) colUsed[c]--;

      if (solutions.length >= SOLUTION_LIMIT) return;
    }
  }

  dfs(0);

  const status = solutions.length === 0 ? 'none' : solutions.length === 1 ? 'unique' : 'ambiguous';
  return finish(status, solutions, nodes);
}

module.exports = {
  solve,
  validateInput,
  genRowPatterns,
  countComponents,
  CELL_UNKNOWN,
  CELL_WET,
  CELL_DRY,
  MIN_SIDE,
  MAX_SIDE,
  MIN_COMPONENTS,
  MAX_COMPONENTS,
};
