import {
  solveStains,
  validateInput,
  CELL_UNKNOWN,
  CELL_WET,
  CELL_DRY,
  MIN_DIM,
  MAX_DIM,
  MIN_COMPONENTS,
  MAX_COMPONENTS,
} from './solver.js';

const CELL_CYCLE = {
  [CELL_UNKNOWN]: CELL_WET,
  [CELL_WET]: CELL_DRY,
  [CELL_DRY]: CELL_UNKNOWN,
};
const CELL_CLASS = {
  [CELL_UNKNOWN]: 'unknown',
  [CELL_WET]: 'wet',
  [CELL_DRY]: 'dry',
};
const CELL_TEXT = {
  [CELL_UNKNOWN]: '？',
  [CELL_WET]: '湿',
  [CELL_DRY]: '干',
};
const CELL_LABEL = {
  [CELL_UNKNOWN]: '待定',
  [CELL_WET]: '已确认潮湿',
  [CELL_DRY]: '已确认干燥',
};
const STATUS_TEXT = {
  none: '无解',
  unique: '唯一结论',
  ambiguous: '存在歧义',
  overload: '枚举量过大',
};

const LOCAL_KEY = 'stain-restore-state-v1';

const els = {
  rows: document.getElementById('rows'),
  cols: document.getElementById('cols'),
  components: document.getElementById('components'),
  newGrid: document.getElementById('new-grid'),
  clearMarks: document.getElementById('clear-marks'),
  gridWrap: document.getElementById('grid-wrap'),
  solve: document.getElementById('solve'),
  saveStatus: document.getElementById('save-status'),
  draftError: document.getElementById('draft-error'),
  result: document.getElementById('result'),
};

/** 当前草稿：{ rows, cols, components, rowCounts, colCounts, cells } */
let draft = null;
/** 当前展示的结论及其对应的草稿指纹；草稿一旦修改即清除。 */
let currentResult = null;
let saveTimer = null;

// ---------- 草稿构造与指纹 ----------

function blankCells(R, C) {
  return Array.from({ length: R }, () => new Array(C).fill(CELL_UNKNOWN));
}

function makeDraft(R, C) {
  return {
    rows: R,
    cols: C,
    components: 1,
    rowCounts: new Array(R).fill(0),
    colCounts: new Array(C).fill(0),
    cells: blankCells(R, C),
  };
}

function fingerprint(d) {
  return JSON.stringify(d);
}

function solverInput() {
  return {
    rows: draft.rows,
    cols: draft.cols,
    rowCounts: draft.rowCounts.slice(),
    colCounts: draft.colCounts.slice(),
    cells: draft.cells.map((row) => row.slice()),
    components: draft.components,
  };
}

// ---------- 持久化（服务器 + localStorage 双写） ----------

function persistState() {
  const state = {
    draft,
    result: currentResult
      ? { fingerprint: currentResult.fingerprint, outcome: currentResult.outcome }
      : null,
  };
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch { /* 隐私模式等场景下忽略 */ }
  fetch('/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(state),
  })
    .then((r) => { if (!r.ok) throw new Error(); setSaveStatus('已保存到本机'); })
    .catch(() => setSaveStatus('已保存到浏览器本地存储（服务器不可达）'));
}

function schedulePersist() {
  setSaveStatus('保存中…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistState, 400);
}

async function loadState() {
  try {
    const r = await fetch('/api/state');
    const data = await r.json();
    if (data.saved && data.state && data.state.draft) return data.state;
  } catch { /* 服务器不可达时回退 localStorage */ }
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state && state.draft) return state;
    }
  } catch { /* 忽略损坏数据 */ }
  return null;
}

// ---------- 渲染：控件与草稿网格 ----------

function fillSelect(sel, min, max, suffix) {
  sel.innerHTML = '';
  for (let v = min; v <= max; v += 1) {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = `${v} ${suffix}`;
    sel.appendChild(opt);
  }
}

function renderControls() {
  els.rows.value = String(draft.rows);
  els.cols.value = String(draft.cols);
  els.components.value = String(draft.components);
}

function renderGrid() {
  const { rows: R, cols: C } = draft;
  const table = document.createElement('table');
  table.className = 'grid';

  for (let r = 0; r < R; r += 1) {
    const tr = document.createElement('tr');
    for (let c = 0; c < C; c += 1) {
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cell ${CELL_CLASS[draft.cells[r][c]]}`;
      btn.textContent = CELL_TEXT[draft.cells[r][c]];
      btn.title = `第 ${r + 1} 行第 ${c + 1} 列：${CELL_LABEL[draft.cells[r][c]]}（点击切换）`;
      btn.dataset.r = String(r);
      btn.dataset.c = String(c);
      btn.addEventListener('click', () => onCellClick(r, c));
      td.appendChild(btn);
      tr.appendChild(td);
    }
    const tdCount = document.createElement('td');
    tdCount.className = 'count-cell';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(C);
    input.step = '1';
    input.value = String(draft.rowCounts[r]);
    input.title = `第 ${r + 1} 行潮湿数（精确）`;
    input.dataset.row = String(r);
    input.addEventListener('input', () => onRowCount(r, input));
    tdCount.appendChild(input);
    tr.appendChild(tdCount);
    table.appendChild(tr);
  }

  const trCounts = document.createElement('tr');
  for (let c = 0; c < C; c += 1) {
    const td = document.createElement('td');
    td.className = 'count-cell';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(R);
    input.step = '1';
    input.value = String(draft.colCounts[c]);
    input.title = `第 ${c + 1} 列潮湿数（精确）`;
    input.dataset.col = String(c);
    input.addEventListener('input', () => onColCount(c, input));
    td.appendChild(input);
    trCounts.appendChild(td);
  }
  const corner = document.createElement('td');
  corner.className = 'count-cell corner';
  corner.textContent = '← 行列计数';
  trCounts.appendChild(corner);
  table.appendChild(trCounts);

  els.gridWrap.innerHTML = '';
  els.gridWrap.appendChild(table);
}

// ---------- 渲染：结论 ----------

function renderSolutionGrid(grid, confirmedCells) {
  const table = document.createElement('table');
  table.className = 'grid solution';
  for (let r = 0; r < grid.length; r += 1) {
    const tr = document.createElement('tr');
    for (let c = 0; c < grid[r].length; c += 1) {
      const td = document.createElement('td');
      const wet = grid[r][c] === 1;
      td.className = `sol-cell ${wet ? 'wet' : 'dry'}`;
      td.textContent = wet ? '湿' : '·';
      const mark = confirmedCells[r][c];
      if (mark === CELL_WET || mark === CELL_DRY) {
        td.classList.add('confirmed');
        td.title = `第 ${r + 1} 行第 ${c + 1} 列（${CELL_LABEL[mark]}，未被改变）`;
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  return table;
}

function renderResult() {
  els.result.innerHTML = '';
  if (!currentResult) {
    els.result.innerHTML = '<p class="placeholder">尚无结论。请完善草稿后点击「复原」。</p>';
    return;
  }
  const { outcome } = currentResult;
  const banner = document.createElement('p');
  banner.className = `status status-${outcome.status}`;
  banner.textContent = STATUS_TEXT[outcome.status] ?? outcome.status;
  els.result.appendChild(banner);

  if (outcome.status === 'none') {
    const p = document.createElement('p');
    p.textContent = '不存在同时满足全部行、列计数，确认单元约束，且水渍团数恰为指定值的网格。请检查计数与确认标记。';
    els.result.appendChild(p);
    return;
  }
  if (outcome.status === 'overload') {
    const p = document.createElement('p');
    p.textContent = '候选网格规模超出本机枚举预算，未能穷尽。请增加确认单元或调整计数后重试。';
    els.result.appendChild(p);
    return;
  }

  const stats = document.createElement('p');
  stats.className = 'stats';
  stats.textContent = `（枚举节点 ${outcome.stats.nodes}，耗时 ${outcome.stats.elapsedMs} ms）`;
  els.result.appendChild(stats);

  if (outcome.status === 'unique') {
    const h = document.createElement('h3');
    h.textContent = '唯一的水渍分布';
    els.result.appendChild(h);
    els.result.appendChild(renderSolutionGrid(outcome.solutions[0], currentResult.cells));
    return;
  }

  // 歧义：同时展示序最小方案与确有不同的替代方案
  const note = document.createElement('p');
  note.textContent = '满足条件的方案不止一个，以下同时给出按行优先二进制序最小的方案与一份确有不同的替代方案：';
  els.result.appendChild(note);
  const wrap = document.createElement('div');
  wrap.className = 'solutions';

  const boxA = document.createElement('figure');
  const capA = document.createElement('figcaption');
  capA.textContent = '方案一（行优先二进制序最小）';
  boxA.appendChild(capA);
  boxA.appendChild(renderSolutionGrid(outcome.solutions[0], currentResult.cells));

  const boxB = document.createElement('figure');
  const capB = document.createElement('figcaption');
  capB.textContent = '方案二（确有不同的替代方案）';
  boxB.appendChild(capB);
  boxB.appendChild(renderSolutionGrid(outcome.solutions[1], currentResult.cells));

  wrap.appendChild(boxA);
  wrap.appendChild(boxB);
  els.result.appendChild(wrap);
}

// ---------- 交互 ----------

function setSaveStatus(text) {
  els.saveStatus.textContent = text;
}

/** 草稿被修改：旧结论立即失效，不再显示。 */
function onDraftChanged() {
  currentResult = null;
  renderResult();
  els.draftError.textContent = '';
  schedulePersist();
}

function onCellClick(r, c) {
  draft.cells[r][c] = CELL_CYCLE[draft.cells[r][c]];
  const btn = els.gridWrap.querySelector(`button[data-r="${r}"][data-c="${c}"]`);
  const v = draft.cells[r][c];
  btn.className = `cell ${CELL_CLASS[v]}`;
  btn.textContent = CELL_TEXT[v];
  btn.title = `第 ${r + 1} 行第 ${c + 1} 列：${CELL_LABEL[v]}（点击切换）`;
  onDraftChanged();
}

function parseCount(input, max) {
  const v = Number(input.value);
  if (!Number.isInteger(v) || v < 0 || v > max) return null;
  return v;
}

function onRowCount(r, input) {
  const v = parseCount(input, draft.cols);
  if (v === null) {
    els.draftError.textContent = `第 ${r + 1} 行计数须为 0–${draft.cols} 的整数`;
    return;
  }
  draft.rowCounts[r] = v;
  onDraftChanged();
}

function onColCount(c, input) {
  const v = parseCount(input, draft.rows);
  if (v === null) {
    els.draftError.textContent = `第 ${c + 1} 列计数须为 0–${draft.rows} 的整数`;
    return;
  }
  draft.colCounts[c] = v;
  onDraftChanged();
}

function onNewGrid() {
  const R = Number(els.rows.value);
  const C = Number(els.cols.value);
  const components = Number(els.components.value);
  const old = draft;
  draft = makeDraft(R, C);
  draft.components = components;
  // 尽量保留重叠区域的确认标记与计数，减少重复录入
  if (old) {
    for (let r = 0; r < Math.min(R, old.rows); r += 1) {
      draft.rowCounts[r] = old.rowCounts[r];
      for (let c = 0; c < Math.min(C, old.cols); c += 1) {
        draft.cells[r][c] = old.cells[r][c];
      }
    }
    for (let c = 0; c < Math.min(C, old.cols); c += 1) draft.colCounts[c] = old.colCounts[c];
  }
  renderGrid();
  onDraftChanged();
}

function onClearMarks() {
  draft.cells = blankCells(draft.rows, draft.cols);
  renderGrid();
  onDraftChanged();
}

function onComponentsChanged() {
  draft.components = Number(els.components.value);
  onDraftChanged();
}

function onSolve() {
  const input = solverInput();
  const check = validateInput(input);
  if (!check.ok) {
    els.draftError.textContent = check.error;
    return;
  }
  els.draftError.textContent = '';
  els.solve.disabled = true;
  els.solve.textContent = '枚举中…';
  // 让按钮状态先渲染，再执行可能耗时的枚举
  setTimeout(() => {
    try {
      const outcome = solveStains(input);
      currentResult = {
        fingerprint: fingerprint(draft),
        cells: draft.cells.map((row) => row.slice()),
        outcome,
      };
      renderResult();
      schedulePersist();
    } finally {
      els.solve.disabled = false;
      els.solve.textContent = '复原';
    }
  }, 30);
}

// ---------- 启动 ----------

function init() {
  fillSelect(els.rows, MIN_DIM, MAX_DIM, '行');
  fillSelect(els.cols, MIN_DIM, MAX_DIM, '列');
  fillSelect(els.components, MIN_COMPONENTS, MAX_COMPONENTS, '个团');

  els.newGrid.addEventListener('click', onNewGrid);
  els.clearMarks.addEventListener('click', onClearMarks);
  els.components.addEventListener('change', onComponentsChanged);
  els.solve.addEventListener('click', onSolve);

  loadState().then((state) => {
    if (state && validateInput({
      ...state.draft,
      rowCounts: state.draft.rowCounts,
      colCounts: state.draft.colCounts,
    }).ok) {
      draft = state.draft;
      // 仅当保存的结论与草稿指纹一致时才恢复显示
      if (state.result && state.result.fingerprint === fingerprint(draft)) {
        currentResult = {
          fingerprint: state.result.fingerprint,
          cells: draft.cells.map((row) => row.slice()),
          outcome: state.result.outcome,
        };
      }
    } else {
      draft = makeDraft(MIN_DIM, MIN_DIM);
    }
    renderControls();
    renderGrid();
    renderResult();
  });
}

init();
