/**
 * 水渍分布复原求解器（领域核心，浏览器与 Node 共用的纯 ESM 模块，无任何依赖）。
 *
 * 问题定义：在 rows×cols 的纸张网格上放置潮湿单元（1）与干燥单元（0），要求
 *  1. 每行潮湿数恰为 rowCounts[r]，每列潮湿数恰为 colCounts[c]（精确相等）；
 *  2. 已确认潮湿/已确认干燥的单元不得改变；
 *  3. 全部潮湿单元按共享边四邻接（斜角不算）恰形成 components 个连通团。
 *
 * 枚举顺序：按“行优先二进制序”升序——把网格按行优先展开、潮湿记 1 干燥记 0、
 * 首单元为最高位所得二进制数越小越先被枚举。因此第一个解即序最小方案，
 * 第二个解即一份确有不同的替代方案；据此判定 无解 / 唯一 / 歧义。
 */

export const CELL_UNKNOWN = 0; // 待定
export const CELL_WET = 1; // 已确认潮湿
export const CELL_DRY = 2; // 已确认干燥

export const MIN_DIM = 4;
export const MAX_DIM = 8;
export const MIN_COMPONENTS = 1;
export const MAX_COMPONENTS = 3;

/** 枚举节点预算：超出即返回 overload，避免极端输入拖垮页面。 */
export const MAX_NODES = 10_000_000;

/** 8 位反转表：REV8[m] 的低 cols 位即“行内首单元为最高位”的二进制序排名键。 */
const REV8 = new Uint8Array(256);
for (let m = 0; m < 256; m += 1) {
  let r = 0;
  for (let b = 0; b < 8; b += 1) if (m & (1 << b)) r |= 1 << (7 - b);
  REV8[m] = r;
}

const POP8 = new Uint8Array(256);
for (let m = 1; m < 256; m += 1) POP8[m] = POP8[m >> 1] + (m & 1);

/**
 * 校验输入结构。返回 { ok: true } 或 { ok: false, error: 中文错误信息 }。
 */
export function validateInput(input) {
  if (input === null || typeof input !== 'object') {
    return { ok: false, error: '输入必须是对象' };
  }
  const { rows, cols, rowCounts, colCounts, cells, components } = input;
  const isInt = Number.isInteger;
  if (!isInt(rows) || rows < MIN_DIM || rows > MAX_DIM) {
    return { ok: false, error: `行数须为 ${MIN_DIM}–${MAX_DIM} 的整数` };
  }
  if (!isInt(cols) || cols < MIN_DIM || cols > MAX_DIM) {
    return { ok: false, error: `列数须为 ${MIN_DIM}–${MAX_DIM} 的整数` };
  }
  if (!isInt(components) || components < MIN_COMPONENTS || components > MAX_COMPONENTS) {
    return { ok: false, error: `水渍团数须为 ${MIN_COMPONENTS}–${MAX_COMPONENTS} 的整数` };
  }
  if (!Array.isArray(rowCounts) || rowCounts.length !== rows) {
    return { ok: false, error: '行计数数组长度须等于行数' };
  }
  if (!Array.isArray(colCounts) || colCounts.length !== cols) {
    return { ok: false, error: '列计数数组长度须等于列数' };
  }
  for (const v of rowCounts) {
    if (!isInt(v) || v < 0 || v > cols) return { ok: false, error: '行计数须为 0 到列数之间的非负整数' };
  }
  for (const v of colCounts) {
    if (!isInt(v) || v < 0 || v > rows) return { ok: false, error: '列计数须为 0 到行数之间的非负整数' };
  }
  if (!Array.isArray(cells) || cells.length !== rows) {
    return { ok: false, error: '单元标记数组行数不符' };
  }
  for (const row of cells) {
    if (!Array.isArray(row) || row.length !== cols) {
      return { ok: false, error: '单元标记数组列数不符' };
    }
    for (const v of row) {
      if (v !== CELL_UNKNOWN && v !== CELL_WET && v !== CELL_DRY) {
        return { ok: false, error: '单元标记取值非法' };
      }
    }
  }
  return { ok: true };
}

/** 统计 0/1 网格中潮湿单元的四邻接连通团数（斜角不连通）。 */
export function countComponents(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const seen = Array.from({ length: rows }, () => new Array(cols).fill(false));
  let count = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (grid[r][c] !== 1 || seen[r][c]) continue;
      count += 1;
      const stack = [[r, c]];
      seen[r][c] = true;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop();
        const nb = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
        for (const [nr, nc] of nb) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols
              && grid[nr][nc] === 1 && !seen[nr][nc]) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
    }
  }
  return count;
}

/**
 * 求解。输入须先经 validateInput 通过。
 * 返回 {
 *   status: 'none' | 'unique' | 'ambiguous' | 'overload',
 *   solutions: [grid, grid?]   // 0/1 二维数组，按行优先二进制序升序，至多两个
 *   stats: { nodes, elapsedMs }
 * }
 */
export function solveStains(input) {
  const started = Date.now();
  const { rows: R, cols: C, rowCounts, colCounts, cells, components: K } = input;

  const none = (stats) => ({ status: 'none', solutions: [], stats });

  // —— 快速整体可行性检查 ——
  let total = 0;
  for (const v of rowCounts) total += v;
  let colTotal = 0;
  for (const v of colCounts) colTotal += v;
  const earlyStats = { nodes: 0, elapsedMs: Date.now() - started };
  if (total !== colTotal) return none(earlyStats); // 行列潮湿总数不一致
  if (total < K) return none(earlyStats); // 潮湿单元总数不足以形成 K 个团

  // 每行确认潮湿/确认干燥掩码（位 c 对应第 c 列）
  const wetMask = new Array(R).fill(0);
  const dryMask = new Array(R).fill(0);
  for (let r = 0; r < R; r += 1) {
    let w = 0;
    let d = 0;
    for (let c = 0; c < C; c += 1) {
      if (cells[r][c] === CELL_WET) w |= 1 << c;
      else if (cells[r][c] === CELL_DRY) d |= 1 << c;
    }
    wetMask[r] = w;
    dryMask[r] = d;
  }

  // 每列可行性：确认潮湿数 ≤ 列计数 ≤ 非确认干燥格数
  for (let c = 0; c < C; c += 1) {
    let fixedWet = 0;
    let notDry = 0;
    for (let r = 0; r < R; r += 1) {
      if (cells[r][c] === CELL_WET) fixedWet += 1;
      if (cells[r][c] !== CELL_DRY) notDry += 1;
    }
    if (colCounts[c] < fixedWet || colCounts[c] > notDry) return none(earlyStats);
  }

  // —— 每行候选模式：满足行计数与确认单元，按行优先二进制序升序 ——
  const patterns = [];
  for (let r = 0; r < R; r += 1) {
    const list = [];
    for (let m = 0; m < (1 << C); m += 1) {
      if (POP8[m] !== rowCounts[r]) continue;
      if ((m & wetMask[r]) !== wetMask[r]) continue; // 确认潮湿必须置 1
      if ((m & dryMask[r]) !== 0) continue; // 确认干燥必须置 0
      list.push(m);
    }
    if (list.length === 0) return none(earlyStats);
    list.sort((a, b) => REV8[a] - REV8[b]);
    patterns.push(list);
  }

  // 行计数后缀和：suffix[r] = 第 r 行起（含）尚未放置的潮湿总数
  const suffix = new Array(R + 1).fill(0);
  for (let r = R - 1; r >= 0; r -= 1) suffix[r] = suffix[r + 1] + rowCounts[r];

  // —— 可回滚并查集（按大小合并、无路径压缩，保证回滚正确）——
  const N = R * C;
  const parent = new Int16Array(N);
  const size = new Int16Array(N);
  const active = new Uint8Array(N);
  let compCount = 0;
  const log = []; // ≥0：激活单元 i；<0：合并，子根为 ~e
  const find = (x) => {
    let y = x;
    while (parent[y] !== y) y = parent[y];
    return y;
  };
  const activate = (i) => {
    active[i] = 1;
    parent[i] = i;
    size[i] = 1;
    compCount += 1;
    log.push(i);
  };
  const union = (a, b) => {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return;
    if (size[ra] < size[rb]) { const t = ra; ra = rb; rb = t; }
    parent[rb] = ra;
    size[ra] += size[rb];
    compCount -= 1;
    log.push(~rb);
  };
  const snapshot = () => log.length;
  const rollback = (snap) => {
    while (log.length > snap) {
      const e = log.pop();
      if (e >= 0) {
        active[e] = 0;
        compCount -= 1;
      } else {
        const child = ~e;
        const root = parent[child];
        size[root] -= size[child];
        parent[child] = child;
        compCount += 1;
      }
    }
  };

  // 连通团统计：stemp 标记法统计触及当前行的开放团与已封闭团数
  const rootStamp = new Int32Array(N).fill(-1);
  const rootMaxRow = new Int16Array(N);
  const seenRoots = new Int16Array(N);
  let stamp = 0;
  const componentStats = (curRow) => {
    stamp += 1;
    let nRoots = 0;
    const end = (curRow + 1) * C;
    for (let i = 0; i < end; i += 1) {
      if (!active[i]) continue;
      const rt = find(i);
      const rowOf = (i / C) | 0;
      if (rootStamp[rt] !== stamp) {
        rootStamp[rt] = stamp;
        rootMaxRow[rt] = rowOf;
        seenRoots[nRoots] = rt;
        nRoots += 1;
      } else if (rowOf > rootMaxRow[rt]) {
        rootMaxRow[rt] = rowOf;
      }
    }
    let sealed = 0;
    for (let t = 0; t < nRoots; t += 1) {
      if (rootMaxRow[seenRoots[t]] < curRow) sealed += 1; // 不触及当前行，永不能再扩张
    }
    return { sealed, open: nRoots - sealed };
  };

  const colPlaced = new Int16Array(C);
  const chosen = new Array(R).fill(0);
  const solutions = [];
  let nodes = 0;
  let overflow = false;

  const recordSolution = () => {
    const grid = [];
    for (let r = 0; r < R; r += 1) {
      const row = [];
      for (let c = 0; c < C; c += 1) row.push((chosen[r] >> c) & 1);
      grid.push(row);
    }
    solutions.push(grid);
  };

  const dfs = (r) => {
    if (solutions.length >= 2 || overflow) return;
    if (r === R) {
      if (compCount === K) recordSolution();
      return;
    }
    const rowsLeftAfter = R - r - 1;
    for (const m of patterns[r]) {
      nodes += 1;
      if (nodes > MAX_NODES) { overflow = true; return; }
      chosen[r] = m;
      const snap = snapshot();
      // 放置第 r 行：激活并与左、上邻居合并
      for (let c = 0; c < C; c += 1) {
        if (!((m >> c) & 1)) continue;
        const i = r * C + c;
        activate(i);
        colPlaced[c] += 1;
        if (c > 0 && ((m >> (c - 1)) & 1)) union(i, i - 1);
        if (r > 0 && active[i - C]) union(i, i - C);
      }
      // 列计数剪枝：已放不得超过目标，剩余行数须够补齐
      let ok = true;
      for (let c = 0; c < C && ok; c += 1) {
        if (colPlaced[c] > colCounts[c] || colPlaced[c] + rowsLeftAfter < colCounts[c]) ok = false;
      }
      // 连通团数剪枝
      if (ok) {
        const { sealed, open } = componentStats(r);
        const remainingWets = suffix[r + 1];
        const lower = sealed + (open > 0 || remainingWets > 0 ? 1 : 0);
        const upper = compCount + remainingWets;
        if (lower > K || upper < K) ok = false;
      }
      if (ok) dfs(r + 1);
      // 回滚第 r 行
      for (let c = 0; c < C; c += 1) {
        if ((m >> c) & 1) colPlaced[c] -= 1;
      }
      rollback(snap);
      if (solutions.length >= 2 || overflow) return;
    }
  };

  dfs(0);

  const stats = { nodes, elapsedMs: Date.now() - started };
  if (overflow) return { status: 'overload', solutions, stats };
  if (solutions.length === 0) return { status: 'none', solutions, stats };
  if (solutions.length === 1) return { status: 'unique', solutions, stats };
  return { status: 'ambiguous', solutions, stats };
}
