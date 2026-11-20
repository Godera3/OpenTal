/* Draws Tal's move and provides in-browser engine settings. */

(function () {
  const HOST_ID = 'opental-overlay-root';
  const DEFAULT_SETTINGS = {
    searchMode: 'time',
    movetime: 250,
    depth: 12,
    hash: 128,
    threads: 1,
    multiPv: 1,
    useBook: true,
    talMode: true,
    talRandom: false,
    ponder: true
  };

  const MARKUP = `
    <style>
      :host { all: initial; }
      .wrap { position: absolute; inset: 0; overflow: visible; font-family: "Inter", "Segoe UI", system-ui, sans-serif; }
      svg.board { display: block; width: 100%; height: 100%; overflow: visible; }
      .pv-arrow { stroke-linecap: round; filter: drop-shadow(0 0 0.08px rgba(0,0,0,0.6)); }
      .pv1 { stroke: #60a5fa; stroke-width: 0.14; opacity: 0.95; }
      .pv2 { stroke: #ffd166; stroke-width: 0.11; opacity: 0.78; }
      .pv3 { stroke: #c4b5fd; stroke-width: 0.11; opacity: 0.78; }
      .evalbar {
        position: absolute; left: -28px; top: 0; bottom: 0; width: 16px;
        border-radius: 8px; overflow: hidden; pointer-events: none; z-index: 3;
        background: linear-gradient(180deg, #2b2c33 0%, #14151b 100%);
        border: 1px solid rgba(255,255,255,0.18);
        box-shadow: 0 10px 28px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.04);
      }
      .eval-fill {
        position: absolute; left: 0; right: 0; bottom: 0; height: 50%;
        background: linear-gradient(180deg, #ffffff 0%, #e6e9f0 55%, #d8dde8 100%);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
        transition: height .35s cubic-bezier(.22,.8,.24,1), top .35s cubic-bezier(.22,.8,.24,1), bottom .35s cubic-bezier(.22,.8,.24,1);
      }
      .eval-mid {
        position: absolute; left: 2px; right: 2px; top: 50%; height: 2px; border-radius: 2px;
        background: rgba(255,209,102,0.55); transform: translateY(-1px);
        z-index: 2;
      }
      .eval-text {
        position: absolute; left: -36px; bottom: -22px; width: 32px; text-align: center;
        padding: 3px 0; border-radius: 7px; pointer-events: none; z-index: 3;
        font: 700 10px/1.1 ui-monospace, SFMono-Regular, monospace;
        color: #f7f4ea; background: rgba(12,12,16,0.88);
        border: 1px solid rgba(255,209,102,0.22);
        box-shadow: 0 6px 16px rgba(0,0,0,0.35);
        white-space: nowrap;
      }
      .topbar {
        position: absolute; top: 6px; left: 6px; right: 6px;
        display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
        pointer-events: none; z-index: 4;
      }
      .left { display: flex; flex-direction: column; gap: 4px; max-width: calc(100% - 44px); }
      .badge, .gear, .chip {
        pointer-events: auto;
        border: 1px solid rgba(255, 209, 102, 0.28);
        background: rgba(10, 10, 14, 0.78);
        color: #ffd166;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: 0 8px 24px rgba(0,0,0,0.28);
      }
      .badge {
        padding: 5px 10px; border-radius: 999px;
        font: 600 12px/1.2 system-ui, sans-serif; letter-spacing: 0.02em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .lines { display: flex; flex-wrap: wrap; gap: 4px; pointer-events: none; }
      .lines.hidden { display: none; }
      .chip {
        padding: 3px 8px; border-radius: 999px;
        font: 600 11px/1.2 ui-monospace, SFMono-Regular, monospace;
      }
      .chip.pv1 { border-color: rgba(96,165,250,0.4); color: #60a5fa; }
      .chip.pv2 { border-color: rgba(255,209,102,0.4); color: #ffd166; }
      .chip.pv3 { border-color: rgba(196,181,253,0.4); color: #c4b5fd; }
      .gear {
        width: 30px; height: 30px; border-radius: 10px; cursor: pointer; flex: 0 0 auto;
        display: grid; place-items: center; font-size: 15px; transition: transform .15s ease, background .15s ease;
      }
      .gear:hover { background: rgba(255, 209, 102, 0.12); transform: rotate(20deg); }
      .panel {
        position: absolute; top: 42px; right: 6px; width: min(320px, calc(100% - 12px));
        pointer-events: auto; color: #f3efe6;
        background: linear-gradient(180deg, rgba(18,18,24,0.96), rgba(10,10,14,0.96));
        border: 1px solid rgba(255, 209, 102, 0.18);
        border-radius: 16px; padding: 14px;
        box-shadow: 0 18px 50px rgba(0,0,0,0.45);
        backdrop-filter: blur(14px);
      }
      .panel.hidden { display: none; }
      .title { font: 700 14px/1.2 system-ui, sans-serif; color: #ffd166; margin-bottom: 2px; }
      .sub { font: 500 11px/1.4 system-ui, sans-serif; color: rgba(243,239,230,0.65); margin-bottom: 12px; }
      .row { margin-bottom: 10px; }
      .row-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5px; }
      .label { font: 600 12px/1.2 system-ui, sans-serif; color: #f3efe6; }
      .value { font: 600 11px/1.2 ui-monospace, SFMono-Regular, monospace; color: #ffd166; }
      input[type=range] { width: 100%; accent-color: #ffd166; cursor: pointer; height: 4px; }
      .mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .mode-btn {
        border-radius: 10px; padding: 7px 8px; cursor: pointer;
        font: 700 11px/1 system-ui, sans-serif;
        border: 1px solid rgba(255,209,102,0.18);
        background: rgba(255,255,255,0.03); color: rgba(243,239,230,0.8);
      }
      .mode-btn.active { background: rgba(255,209,102,0.16); color: #ffd166; border-color: rgba(255,209,102,0.35); }
      .row.disabled { opacity: 0.4; }
      .row.disabled input { pointer-events: none; }
      .toggles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0 12px; }
      .toggle {
        display: flex; align-items: center; gap: 8px; padding: 8px 9px;
        border-radius: 10px; background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.05); cursor: pointer;
        font: 600 11px/1.2 system-ui, sans-serif; color: rgba(243,239,230,0.9);
      }
      .toggle input { accent-color: #ffd166; margin: 0; }
      .actions { display: flex; gap: 8px; align-items: center; }
      .save, .ghost {
        border-radius: 10px; padding: 8px 10px; cursor: pointer;
        font: 700 12px/1 system-ui, sans-serif; border: 1px solid rgba(255,209,102,0.25);
      }
      .save { background: #ffd166; color: #141218; flex: 1; }
      .ghost { background: transparent; color: #ffd166; }
      .status { margin-top: 8px; min-height: 14px; font: 500 11px/1.3 system-ui, sans-serif; color: rgba(243,239,230,0.7); }
    </style>
    <div class="wrap">
      <div class="evalbar" id="evalbar"><div class="eval-fill" id="evalFill"></div><div class="eval-mid"></div></div>
      <div class="eval-text" id="evalText">0.0</div>
      <svg class="board" viewBox="0 0 8 8" preserveAspectRatio="none">
        <defs>
          <marker id="head-pv1" viewBox="0 0 3 3" markerWidth="3" markerHeight="3" refX="2.2" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3 Z" fill="#60a5fa"></path></marker>
          <marker id="head-pv2" viewBox="0 0 3 3" markerWidth="3" markerHeight="3" refX="2.2" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3 Z" fill="#ffd166"></path></marker>
          <marker id="head-pv3" viewBox="0 0 3 3" markerWidth="3" markerHeight="3" refX="2.2" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3 Z" fill="#c4b5fd"></path></marker>
        </defs>
        <g id="arrows"></g>
      </svg>
      <div class="topbar">
        <div class="left">
          <div class="badge" id="badge">TAL …</div>
          <div class="lines hidden" id="lines"></div>
        </div>
        <button class="gear" id="gear" title="OpenTal settings">⚙</button>
      </div>
      <div class="panel hidden" id="panel">
        <div class="title">OpenTal</div>
        <div class="sub">Tal-style analysis on this board. Bot games and puzzles only.</div>

        <div class="row">
          <div class="row-head"><span class="label">Search</span><span class="value" id="modeVal"></span></div>
          <div class="mode-switch">
            <button class="mode-btn" id="modeTime" type="button">Time</button>
            <button class="mode-btn" id="modeDepth" type="button">Fixed depth</button>
          </div>
        </div>
        <div class="row" id="movetimeRow">
          <div class="row-head"><span class="label">Think time</span><span class="value" id="movetimeVal"></span></div>
          <input id="movetime" type="range" min="100" max="4000" step="50">
        </div>
        <div class="row" id="depthRow">
          <div class="row-head"><span class="label">Depth</span><span class="value" id="depthVal"></span></div>
          <input id="depth" type="range" min="1" max="30" step="1">
        </div>
        <div class="row">
          <div class="row-head"><span class="label">Hash</span><span class="value" id="hashVal"></span></div>
          <input id="hash" type="range" min="16" max="1024" step="16">
        </div>
        <div class="row">
          <div class="row-head"><span class="label">Threads</span><span class="value" id="threadsVal"></span></div>
          <input id="threads" type="range" min="1" max="8" step="1">
        </div>
        <div class="row">
          <div class="row-head"><span class="label">Lines</span><span class="value" id="multiPvVal"></span></div>
          <input id="multiPv" type="range" min="1" max="3" step="1">
        </div>

        <div class="toggles">
          <label class="toggle"><input id="useBook" type="checkbox">Opening book</label>
          <label class="toggle"><input id="talMode" type="checkbox">Tal mode</label>
          <label class="toggle"><input id="talRandom" type="checkbox">Tal randomness</label>
          <label class="toggle"><input id="ponder" type="checkbox">Ponder</label>
        </div>

        <div class="actions">
          <button class="save" id="save">Save & apply</button>
          <button class="ghost" id="reset" title="Reset defaults">Reset</button>
        </div>
        <div class="status" id="status"></div>
      </div>
    </div>`;

  let host = null;
  let shadow = null;
  let flipped = false;
  let revision = -1;
  let sideToMove = 'w';
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let panelOpen = false;
  let lastEval = null; // { score, mate } in side-to-move perspective, or null

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: 'fixed', left: '0', top: '0', width: '0', height: '0',
      pointerEvents: 'none', zIndex: '2147483646'
    });
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = MARKUP;
    document.body.appendChild(host);
    bindControls();
    loadSettings();
  }

  function $(id) { return shadow.getElementById(id); }

  function setStatus(text) {
    const node = $('status');
    if (node) node.textContent = text || '';
  }

  function syncForm() {
    const isDepth = settings.searchMode === 'depth';
    $('movetime').value = settings.movetime;
    $('depth').value = settings.depth;
    $('hash').value = settings.hash;
    $('threads').value = settings.threads;
    $('multiPv').value = settings.multiPv;
    $('useBook').checked = !!settings.useBook;
    $('talMode').checked = !!settings.talMode;
    $('talRandom').checked = !!settings.talRandom;
    $('ponder').checked = !!settings.ponder;
    $('movetimeVal').textContent = settings.movetime + ' ms';
    $('depthVal').textContent = String(settings.depth);
    $('hashVal').textContent = settings.hash + ' MB';
    $('threadsVal').textContent = String(settings.threads);
    $('multiPvVal').textContent = String(settings.multiPv);
    $('modeVal').textContent = isDepth ? 'Fixed depth' : 'Time';
    $('modeTime').classList.toggle('active', !isDepth);
    $('modeDepth').classList.toggle('active', isDepth);
    $('movetimeRow').classList.toggle('disabled', isDepth);
    $('depthRow').classList.toggle('disabled', !isDepth);
  }

  function readForm() {
    return {
      searchMode: settings.searchMode,
      movetime: Number($('movetime').value),
      depth: Number($('depth').value),
      hash: Number($('hash').value),
      threads: Number($('threads').value),
      multiPv: Number($('multiPv').value),
      useBook: $('useBook').checked,
      talMode: $('talMode').checked,
      talRandom: $('talRandom').checked,
      ponder: $('ponder').checked
    };
  }

  function bindControls() {
    $('gear').addEventListener('click', (event) => {
      event.stopPropagation();
      panelOpen = !panelOpen;
      $('panel').classList.toggle('hidden', !panelOpen);
    });
    $('modeTime').addEventListener('click', () => {
      settings = Object.assign({}, settings, readForm(), { searchMode: 'time' });
      syncForm();
    });
    $('modeDepth').addEventListener('click', () => {
      settings = Object.assign({}, settings, readForm(), { searchMode: 'depth' });
      syncForm();
    });
    ['movetime', 'depth', 'hash', 'threads', 'multiPv'].forEach((id) => {
      $(id).addEventListener('input', () => {
        settings = Object.assign({}, settings, readForm());
        syncForm();
      });
    });
    $('save').addEventListener('click', async () => {
      settings = readForm();
      setStatus('Applying…');
      try {
        const response = await browser.runtime.sendMessage({ type: 'saveSettings', settings });
        if (response && response.settings) settings = response.settings;
        syncForm();
        setStatus('Saved. Re-analysing…');
        requestAnalysis(window.OpenTalBoard.current());
      } catch (error) {
        setStatus('Could not save settings.');
      }
    });
    $('reset').addEventListener('click', () => {
      settings = Object.assign({}, DEFAULT_SETTINGS);
      syncForm();
      setStatus('Defaults restored (not saved yet).');
    });
  }

  async function loadSettings() {
    try {
      const response = await browser.runtime.sendMessage({ type: 'getSettings' });
      if (response && response.settings) settings = Object.assign({}, DEFAULT_SETTINGS, response.settings);
    } catch (error) { /* use defaults */ }
    syncForm();
  }

  let placeQueued = false;
  function place() {
    ensureHost();
    const state = window.OpenTalBoard.current();
    const element = state && state.board;
    if (!element || !element.isConnected) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    host.style.left = rect.left + 'px';
    host.style.top = rect.top + 'px';
    host.style.width = rect.width + 'px';
    host.style.height = rect.height + 'px';
  }
  function schedulePlace() {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(() => {
      placeQueued = false;
      place();
    });
  }

  function squareCentre(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    return flipped
      ? { x: 7 - file + 0.5, y: rank + 0.5 }
      : { x: file + 0.5, y: 7 - rank + 0.5 };
  }

  function formatScore(line) {
    if (!line) return '';
    if (line.mate != null) return 'M' + Math.abs(line.mate);
    if (line.score != null) return (line.score >= 0 ? '+' : '') + (line.score / 100).toFixed(2);
    return 'book';
  }

  function evalToWhite(evalData) {
    if (!evalData) return null;
    if (evalData.book) return { type: 'book' };
    if (evalData.mate != null) {
      return { type: 'mate', value: (sideToMove === 'w' ? evalData.mate : -evalData.mate) };
    }
    if (evalData.score != null) {
      return { type: 'cp', value: (sideToMove === 'w' ? evalData.score : -evalData.score) };
    }
    return null;
  }

  function renderEval() {
    if (!shadow) return;
    const fill = $('evalFill');
    const text = $('evalText');
    if (!fill || !text) return;
    const white = evalToWhite(lastEval);
    let pct = 50;
    let label = '…';
    if (white && white.type === 'mate') {
      pct = white.value > 0 ? 100 : 0;
      label = (white.value > 0 ? 'M' : '-M') + Math.abs(white.value);
    } else if (white && white.type === 'cp') {
      const cp = white.value;
      pct = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
      pct = Math.max(2, Math.min(98, pct));
      const pawns = cp / 100;
      label = (pawns >= 0 ? '+' : '') + pawns.toFixed(1);
    } else if (white && white.type === 'book') {
      label = 'book';
      pct = 50;
    }
    const whiteOnBottom = !flipped;
    if (whiteOnBottom) {
      fill.style.bottom = '0';
      fill.style.top = 'auto';
      fill.style.height = pct + '%';
    } else {
      fill.style.top = '0';
      fill.style.bottom = 'auto';
      fill.style.height = pct + '%';
    }
    text.textContent = label;
  }

  function clear() {
    if (!shadow) return;
    const arrows = $('arrows');
    const lines = $('lines');
    if (arrows) arrows.innerHTML = '';
    if (lines) { lines.innerHTML = ''; lines.classList.add('hidden'); }
  }

  function drawArrow(svgGroup, move, rank) {
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(move || '');
    if (!match) return false;
    const cls = 'pv' + rank;
    const from = squareCentre(match[1]);
    const to = squareCentre(match[2]);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const tip = { x: to.x - (0.28 * dx) / length, y: to.y - (0.28 * dy) / length };
    const ns = 'http://www.w3.org/2000/svg';

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('class', 'pv-arrow ' + cls);
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', tip.x);
    line.setAttribute('y2', tip.y);
    line.setAttribute('marker-end', 'url(#head-' + cls + ')');
    svgGroup.appendChild(line);
    return true;
  }

  function draw(result) {
    ensureHost();
    window.OpenTalDebug = window.OpenTalDebug || {};
    window.OpenTalDebug.lastResult = result;
    clear();
    const best = result && result.bestmove != null ? String(result.bestmove) : '';
    const hasLines = result && Array.isArray(result.lines) && result.lines.length > 0;
    const candidates = hasLines
      ? result.lines.filter((line) => line && /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.test(line.move || '')).slice(0, 3)
      : (best ? [{ move: best, score: result.score, mate: result.mate }] : []);

    if (!candidates.length || !/^([a-h][1-8])([a-h][1-8])/.test(candidates[0].move || best)) {
      const shown = best ? best : '(empty)';
      $('badge').textContent = 'TAL — NO MOVE [' + shown + ']';
      lastEval = null;
      renderEval();
      place();
      return;
    }

    const arrows = $('arrows');
    const lineBox = $('lines');
    // draw in reverse so PV1 is on top
    for (let i = candidates.length - 1; i >= 0; i--) {
      drawArrow(arrows, candidates[i].move, i + 1);
    }

    const top = candidates[0];
    $('badge').textContent = 'TAL ' + top.move + ' · ' + formatScore(top);
    const hasEval = result && (result.evalScore != null || result.evalMate != null);
    if (hasEval) {
      lastEval = { score: result.evalScore, mate: result.evalMate, engine: result.evalEngine || 'Stockfish' };
    } else if (top.score == null && top.mate == null) {
      lastEval = { book: true };
    } else {
      lastEval = { score: top.score, mate: top.mate };
    }
    renderEval();

    const linesToShow = hasLines ? candidates : (candidates.length > 1 ? candidates : []);
    if (linesToShow.length > 1) {
      linesToShow.forEach((line, index) => {
        const chip = document.createElement('span');
        chip.className = 'chip pv' + (index + 1);
        const pv = Array.isArray(line.pv) ? line.pv.slice(0, 3).join(' ') : '';
        chip.textContent = (index + 1) + '. ' + line.move + ' ' + formatScore(line) + (pv ? '  ' + pv : '');
        chip.title = Array.isArray(line.pv) ? line.pv.join(' ') : line.move;
        lineBox.appendChild(chip);
      });
      lineBox.classList.remove('hidden');
    }

    setStatus(panelOpen ? 'Ready.' : $('status').textContent);
    place();
  }

  function requestAnalysis(state) {
    if (!state || !state.fen) return;
    ensureHost();
    sideToMove = state.turn || (state.fen ? state.fen.split(' ')[1] : sideToMove) || 'w';
    lastEval = null;
    renderEval();
    $('badge').textContent = 'TAL …';
    browser.runtime.sendMessage({
      type: 'analyse',
      fen: state.fen,
      revision: state.revision,
      movetime: settings.movetime
    }).catch((error) => {
      $('badge').textContent = 'TAL — bridge unavailable';
      console.log('[OpenTal] send failed', error);
    });
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'analysis') {
      if (msg.revision != null && msg.revision < revision) return;
      console.log('[OpenTal] analysis', msg);
      draw(msg);
    } else if (msg.type === 'error') {
      console.log('[OpenTal] error', msg);
      ensureHost();
      clear();
      lastEval = null;
      renderEval();
      $('badge').textContent = 'TAL — ' + (msg.message || 'error').slice(0, 48);
    }
  });

  window.OpenTalBoard.start((state) => {
    revision = state.revision;
    flipped = !!state.flipped;
    sideToMove = state.turn || (state.fen ? state.fen.split(' ')[1] : 'w') || 'w';
    clear();
    ensureHost();
    lastEval = null;
    renderEval();
    window.OpenTalDebug = window.OpenTalDebug || {};
    window.OpenTalDebug.lastSentFen = state.fen;
    window.OpenTalDebug.lastState = state;
    console.log('[OpenTal] analyse', state.source, state.turn, state.flipped, state.fen);
    place();
    requestAnalysis(state);
  });

  window.addEventListener('resize', schedulePlace);
  window.addEventListener('scroll', schedulePlace, true);
})();
