(function () {
  'use strict';

  var DRAFT_KEY = 'stain-restorer:draft:v1';
  var RESULT_KEY = 'stain-restorer:result:v1';
  var UNKNOWN = 0, WET = 1, DRY = 2;
  var CELL_CLASS = ['unknown', 'wet', 'dry'];
  var CELL_LABEL = ['待定', '已确认潮湿', '已确认干燥'];
  var VERDICT_TEXT = { none: '无解', unique: '唯一结论', ambiguous: '存在歧义' };

  var els = {
    rows: document.getElementById('rows'),
    cols: document.getElementById('cols'),
    components: document.getElementById('components'),
    editor: document.getElementById('grid-editor'),
    balance: document.getElementById('balance-hint'),
    solveBtn: document.getElementById('solve-btn'),
    resetCellsBtn: document.getElementById('reset-cells-btn'),
    resetCountsBtn: document.getElementById('reset-counts-btn'),
    resultPanel: document.getElementById('result-panel'),
    verdict: document.getElementById('verdict'),
    solutions: document.getElementById('solutions'),
    meta: document.getElementById('result-meta'),
    error: document.getElementById('error-panel'),
  };

  function repeat(n, v) { return Array.from({ length: n }, function () { return v; }); }
  function range(n) { return Array.from({ length: n }, function (_, i) { return i; }); }
  function clampInt(v, lo, hi, fallback) {
    v = Number.parseInt(v, 10);
    if (Number.isNaN(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  }

  function defaultDraft() {
    var rows = 6, cols = 6;
    return {
      rows: rows,
      cols: cols,
      components: 1,
      rowCounts: repeat(rows, 0),
      colCounts: repeat(cols, 0),
      cells: range(rows).map(function () { return repeat(cols, UNKNOWN); }),
    };
  }

  function sanitizeDraft(d) {
    if (!d || typeof d !== 'object') return defaultDraft();
    var rows = clampInt(d.rows, 4, 8, 6);
    var cols = clampInt(d.cols, 4, 8, 6);
    return {
      rows: rows,
      cols: cols,
      components: clampInt(d.components, 1, 3, 1),
      rowCounts: range(rows).map(function (r) {
        return clampInt(Array.isArray(d.rowCounts) ? d.rowCounts[r] : 0, 0, cols, 0);
      }),
      colCounts: range(cols).map(function (c) {
        return clampInt(Array.isArray(d.colCounts) ? d.colCounts[c] : 0, 0, rows, 0);
      }),
      cells: range(rows).map(function (r) {
        return range(cols).map(function (c) {
          var v = Array.isArray(d.cells) && Array.isArray(d.cells[r]) ? d.cells[r][c] : UNKNOWN;
          return v === WET || v === DRY ? v : UNKNOWN;
        });
      }),
    };
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (raw) return sanitizeDraft(JSON.parse(raw));
    } catch (err) { /* 忽略损坏的本地草稿 */ }
    return defaultDraft();
  }

  var draft = loadDraft();

  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (err) { /* 忽略 */ }
  }

  function fingerprint() { return JSON.stringify(draft); }

  function clearResult() {
    els.resultPanel.hidden = true;
    els.verdict.innerHTML = '';
    els.solutions.innerHTML = '';
    els.meta.textContent = '';
    try { localStorage.removeItem(RESULT_KEY); } catch (err) { /* 忽略 */ }
  }

  // 草稿一旦修改，旧结论立即失效且不再展示
  function onDraftChanged() {
    saveDraft();
    clearResult();
    renderBalance();
  }

  function renderEditor() {
    var html = '<table class="editor"><thead><tr><th class="corner">行＼列</th>';
    for (var c = 0; c < draft.cols; c++) {
      html += '<th><input class="count-input" type="number" min="0" max="' + draft.rows + '"' +
        ' data-col="' + c + '" value="' + draft.colCounts[c] + '"' +
        ' aria-label="第' + (c + 1) + '列潮湿计数"></th>';
    }
    html += '</tr></thead><tbody>';
    for (var r = 0; r < draft.rows; r++) {
      html += '<tr><th><input class="count-input" type="number" min="0" max="' + draft.cols + '"' +
        ' data-row="' + r + '" value="' + draft.rowCounts[r] + '"' +
        ' aria-label="第' + (r + 1) + '行潮湿计数"></th>';
      for (var c2 = 0; c2 < draft.cols; c2++) {
        var v = draft.cells[r][c2];
        html += '<td class="cell ' + CELL_CLASS[v] + '" tabindex="0" role="button"' +
          ' data-r="' + r + '" data-c="' + c2 + '" title="' + CELL_LABEL[v] + '"' +
          ' aria-label="第' + (r + 1) + '行第' + (c2 + 1) + '列，' + CELL_LABEL[v] + '"></td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    els.editor.innerHTML = html;
  }

  function renderBalance() {
    var rs = draft.rowCounts.reduce(function (a, b) { return a + b; }, 0);
    var cs = draft.colCounts.reduce(function (a, b) { return a + b; }, 0);
    var wet = 0;
    draft.cells.forEach(function (row) {
      row.forEach(function (v) { if (v === WET) wet++; });
    });
    var msg = '行计数总和 ' + rs + ' ｜ 列计数总和 ' + cs + ' ｜ 已确认潮湿 ' + wet + ' 格';
    if (rs !== cs) msg += ' —— 行列总和不相等，必定无解';
    els.balance.textContent = msg;
    els.balance.classList.toggle('warn', rs !== cs);
  }

  function cycleCell(td) {
    var r = Number(td.dataset.r);
    var c = Number(td.dataset.c);
    var v = (draft.cells[r][c] + 1) % 3;
    draft.cells[r][c] = v;
    td.className = 'cell ' + CELL_CLASS[v];
    td.title = CELL_LABEL[v];
    td.setAttribute('aria-label', '第' + (r + 1) + '行第' + (c + 1) + '列，' + CELL_LABEL[v]);
    onDraftChanged();
  }

  els.editor.addEventListener('click', function (ev) {
    var td = ev.target.closest('td.cell');
    if (td) cycleCell(td);
  });

  els.editor.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var td = ev.target.closest('td.cell');
    if (!td) return;
    ev.preventDefault();
    cycleCell(td);
  });

  els.editor.addEventListener('change', function (ev) {
    var input = ev.target.closest('input.count-input');
    if (!input) return;
    if (input.dataset.row !== undefined) {
      var r = Number(input.dataset.row);
      draft.rowCounts[r] = clampInt(input.value, 0, draft.cols, 0);
      input.value = draft.rowCounts[r];
    } else if (input.dataset.col !== undefined) {
      var c = Number(input.dataset.col);
      draft.colCounts[c] = clampInt(input.value, 0, draft.rows, 0);
      input.value = draft.colCounts[c];
    }
    onDraftChanged();
  });

  function resize(rows, cols) {
    var old = draft;
    draft = {
      rows: rows,
      cols: cols,
      components: old.components,
      rowCounts: range(rows).map(function (r) {
        return r < old.rowCounts.length ? Math.min(old.rowCounts[r], cols) : 0;
      }),
      colCounts: range(cols).map(function (c) {
        return c < old.colCounts.length ? Math.min(old.colCounts[c], rows) : 0;
      }),
      cells: range(rows).map(function (r) {
        return range(cols).map(function (c) {
          return r < old.rows && c < old.cols ? old.cells[r][c] : UNKNOWN;
        });
      }),
    };
    renderEditor();
    onDraftChanged();
  }

  els.rows.addEventListener('change', function () { resize(clampInt(els.rows.value, 4, 8, 6), draft.cols); });
  els.cols.addEventListener('change', function () { resize(draft.rows, clampInt(els.cols.value, 4, 8, 6)); });
  els.components.addEventListener('change', function () {
    draft.components = clampInt(els.components.value, 1, 3, 1);
    onDraftChanged();
  });

  els.resetCellsBtn.addEventListener('click', function () {
    draft.cells = range(draft.rows).map(function () { return repeat(draft.cols, UNKNOWN); });
    renderEditor();
    onDraftChanged();
  });
  els.resetCountsBtn.addEventListener('click', function () {
    draft.rowCounts = repeat(draft.rows, 0);
    draft.colCounts = repeat(draft.cols, 0);
    renderEditor();
    onDraftChanged();
  });

  function showError(msg) {
    els.error.textContent = msg;
    els.error.hidden = false;
  }
  function hideError() {
    els.error.hidden = true;
    els.error.textContent = '';
  }

  function payload() {
    return {
      rows: draft.rows,
      cols: draft.cols,
      rowCounts: draft.rowCounts,
      colCounts: draft.colCounts,
      cells: draft.cells,
      components: draft.components,
    };
  }

  function solve() {
    hideError();
    els.solveBtn.disabled = true;
    els.solveBtn.textContent = '复原中…';
    fetch('/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload()),
    })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok) {
            showError(data && data.details ? data.details.join('；')
              : (data && data.error) || ('服务错误（HTTP ' + res.status + '）'));
            return;
          }
          renderResult(data);
          try {
            localStorage.setItem(RESULT_KEY, JSON.stringify({ fingerprint: fingerprint(), result: data }));
          } catch (err) { /* 忽略 */ }
        });
      })
      .catch(function () { showError('无法连接本机求解服务。'); })
      .finally(function () {
        els.solveBtn.disabled = false;
        els.solveBtn.textContent = '复原';
      });
  }

  function verdictNote(data) {
    if (data.status === 'none') {
      return '<p class="note">在给定行列计数、确认标注与 ' + draft.components +
        ' 个水渍团的约束下，不存在任何合法网格（已穷举全部可能）。</p>';
    }
    if (data.status === 'unique') {
      return '<p class="note">所有约束共同确定了唯一的潮湿分布（已穷举全部可能）。</p>';
    }
    return '<p class="note">至少存在两种合法网格，无法凭现有证据排除歧义；' +
      '琥珀色高亮为两方案确有不同的单元，可针对这些单元补充透射成像取证。</p>';
  }

  function renderResult(data) {
    els.resultPanel.hidden = false;
    els.verdict.innerHTML = '<span class="badge ' + data.status + '">' +
      VERDICT_TEXT[data.status] + '</span>' + verdictNote(data);
    els.solutions.innerHTML = '';
    if (data.status === 'unique') {
      els.solutions.appendChild(solutionPanel('复原方案', data.solutions[0], null));
    } else if (data.status === 'ambiguous') {
      var pair = document.createElement('div');
      pair.className = 'solution-pair';
      pair.appendChild(solutionPanel('方案 A · 行优先二进制序最小', data.solutions[0], data.solutions[1]));
      pair.appendChild(solutionPanel('方案 B · 替代方案（确有不同）', data.solutions[1], data.solutions[0]));
      els.solutions.appendChild(pair);
    }
    if (data.meta) {
      els.meta.textContent = '枚举节点 ' + data.meta.nodes + ' ｜ 耗时 ' + data.meta.elapsedMs + ' ms' +
        (data.meta.exhaustive ? ' ｜ 已穷举全部可能网格' : '');
    }
    els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function solutionPanel(title, solution, compareTo) {
    var panel = document.createElement('div');
    panel.className = 'solution-panel';
    var h = document.createElement('h3');
    h.textContent = title;
    panel.appendChild(h);
    panel.appendChild(renderSolutionGrid(solution, compareTo));
    return panel;
  }

  function renderSolutionGrid(solution, compareTo) {
    var table = document.createElement('table');
    table.className = 'solution';
    for (var r = 0; r < solution.length; r++) {
      var tr = table.insertRow();
      for (var c = 0; c < solution[r].length; c++) {
        var td = tr.insertCell();
        var wet = solution[r][c] === 1;
        td.className = wet ? 'wet' : 'dry';
        var mark = draft.cells[r] ? draft.cells[r][c] : UNKNOWN;
        if (mark === WET) td.classList.add('mark-wet');
        else if (mark === DRY) td.classList.add('mark-dry');
        if (compareTo && compareTo[r][c] !== solution[r][c]) td.classList.add('diff');
        td.title = (wet ? '潮湿' : '干燥') +
          (mark === WET ? '（已确认潮湿）' : mark === DRY ? '（已确认干燥）' : '');
      }
    }
    return table;
  }

  els.solveBtn.addEventListener('click', solve);

  function init() {
    els.rows.value = String(draft.rows);
    els.cols.value = String(draft.cols);
    els.components.value = String(draft.components);
    renderEditor();
    renderBalance();
    // 恢复最近结论：仅当草稿自上次求解后未被修改
    try {
      var raw = localStorage.getItem(RESULT_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && saved.fingerprint === fingerprint() && saved.result) {
          renderResult(saved.result);
        }
      }
    } catch (err) { /* 忽略损坏的本地结论 */ }
  }

  init();
})();
