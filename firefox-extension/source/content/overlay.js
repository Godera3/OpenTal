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
      .wrap { position: absolute; inset: 0; font-family: "Inter", "Segoe UI", system-ui, sans-serif; }
      svg.board { display: block; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
      .pv-arrow { stroke-linecap: round; filter: drop-shadow(0 0 0.08px rgba(0,0,0,0.6)); }
      .pv1 { stroke: #60a5fa; fill: #60a5fa; stroke-width: 0.14; opacity: 0.95; }
      .pv2 { stroke: #ffd166; fill: #ffd166; stroke-width: 0.11; opacity: 0.78; }
      .pv3 { stroke: #c4b5fd; fill: #c4b5fd; stroke-width: 0.11; opacity: 0.78; }
      .topbar {
        position: absolute; top: 6px; left: 6px; right: 6px;
        display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
        pointer-events: none;
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
      .chip.pv1 { border-color: rgba(96,165,250,0.35); color: #60a5fa; }
      .chip.pv2 { border-color: rgba(255,209,102,0.35); color: #ffd166; }
      .chip.pv3 { border-color: rgba(196,181,253,0.35); color: #c4b5fd; }
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
      .ghost {
        border-radius: 10px; padding: 8px 10px; cursor: pointer;
        font: 700 12px/1 system-ui, sans-serif; border: 1px solid rgba(255,209,102,0.25);
        background: transparent; color: #ffd166; flex: 1;
      }
      .status { margin-top: 8px; min-height: 14px; font: 500 11px/1.3 system-ui, sans-serif; color: rgba(243,239,230,0.7); }
    </style>
    <div class="wrap">
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
        <div class="sub">Tal-style analysis for both sides. Bot games & puzzles only.</div>

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
          <button class="ghost" id="reset" title="Reset defaults">Reset defaults</button>
        </div>
        <div class="status" id="status"></div>
      </div>
    </div>`;

  const OPENINGS = {
    '': 'Starting Position',
    'e2e4': "King's Pawn",
    'd2d4': "Queen's Pawn",
    'c2c4': 'English Opening',
    'g1f3': 'Réti Opening',
    'b2b3': 'Nimzowitsch-Larsen Attack',
    'f2f4': "Bird's Opening",
    'g2g3': "King's Fianchetto",
    'e2e4 e7e5': 'Open Game',
    'e2e4 c7c5': 'Sicilian Defense',
    'e2e4 e7e6': 'French Defense',
    'e2e4 c7c6': 'Caro-Kann Defense',
    'e2e4 d7d5': 'Scandinavian Defense',
    'e2e4 g8f6': 'Alekhine Defense',
    'e2e4 d7d6': 'Pirc Defense',
    'e2e4 g7g6': 'Modern Defense',
    'e2e4 b8c6': 'Nimzowitsch Defense',
    'd2d4 d7d5': 'Closed Game',
    'd2d4 g8f6': 'Indian Defense',
    'd2d4 f7f5': 'Dutch Defense',
    'd2d4 e7e6': "Queen's Pawn Game",
    'd2d4 d7d6': 'Rat Defense',
    'd2d4 g7g6': 'Modern Defense',
    'c2c4 e7e5': 'English: Reversed Sicilian',
    'c2c4 c7c5': 'English: Symmetrical',
    'c2c4 g8f6': 'English: Indian',
    'g1f3 d7d5': 'Réti Opening',
    'g1f3 g8f6': 'Réti Opening',
    'e2e4 e7e5 g1f3': "King's Knight Opening",
    'e2e4 e7e5 g1f3 b8c6': 'Open Game',
    'e2e4 e7e5 g1f3 b8c6 f1b5': 'Ruy Lopez',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6': 'Ruy Lopez: Morphy Defense',
    'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6': 'Ruy Lopez: Berlin Defense',
    'e2e4 e7e5 g1f3 b8c6 f1b5 f8c5': 'Ruy Lopez: Classical Defense',
    'e2e4 e7e5 g1f3 b8c6 f1c4': 'Italian Game',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5': 'Giuoco Piano',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4': 'Evans Gambit',
    'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6': 'Two Knights Defense',
    'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 g1g5': 'Two Knights: Fried Liver Attack',
    'e2e4 e7e5 g1f3 b8c6 d2d4': 'Scotch Game',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4': 'Scotch Game',
    'e2e4 e7e5 g1f3 b8c6 b1c3': 'Four Knights Game',
    'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6': 'Four Knights Game',
    'e2e4 e7e5 g1f3 g8f6': 'Petrov Defense',
    'e2e4 e7e5 g1f3 g8f6 f3e5': 'Petrov: Classical',
    'e2e4 e7e5 g1f3 d7d6': 'Philidor Defense',
    'e2e4 e7e5 f2f4': "King's Gambit",
    'e2e4 e7e5 f2f4 e5f4': "King's Gambit Accepted",
    'e2e4 e7e5 b1c3': 'Vienna Game',
    'e2e4 e7e5 b1c3 g8f6': 'Vienna Game',
    'e2e4 e7e5 d2d4': 'Center Game',
    'e2e4 c7c5 g1f3': 'Sicilian Defense',
    'e2e4 c7c5 g1f3 d7d6': 'Sicilian Defense',
    'e2e4 c7c5 g1f3 b8c6': 'Sicilian Defense',
    'e2e4 c7c5 g1f3 e7e6': 'Sicilian: Kan/Taimanov',
    'e2e4 c7c5 g1f3 g7g6': 'Sicilian: Hyperaccelerated Dragon',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4': 'Sicilian: Open',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3': 'Sicilian: Open',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6': 'Sicilian Najdorf',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6': 'Sicilian Dragon',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e6': 'Sicilian Scheveningen',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 b8c6': 'Sicilian Classical',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4': 'Sicilian: Open',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g7g6': 'Sicilian Accelerated Dragon',
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4': 'Sicilian: Kan/Taimanov',
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 a7a6': 'Sicilian Kan',
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6': 'Sicilian Taimanov',
    'e2e4 c7c5 b1c3': 'Sicilian: Closed',
    'e2e4 c7c5 c2c3': 'Sicilian: Alapin',
    'e2e4 c7c5 d2d4': 'Sicilian: Smith-Morra Gambit',
    'e2e4 e7e6 d2d4 d7d5': 'French Defense',
    'e2e4 e7e6 d2d4 d7d5 b1c3': 'French Defense',
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6': 'French: Classical',
    'e2e4 e7e6 d2d4 d7d5 b1c3 f8b4': 'French: Winawer',
    'e2e4 e7e6 d2d4 d7d5 b1d2': 'French: Tarrasch',
    'e2e4 e7e6 d2d4 d7d5 e4e5': 'French: Advance',
    'e2e4 e7e6 d2d4 d7d5 e4d5': 'French: Exchange',
    'e2e4 c7c6 d2d4 d7d5': 'Caro-Kann Defense',
    'e2e4 c7c6 d2d4 d7d5 b1c3': 'Caro-Kann: Classical',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 b3e4': 'Caro-Kann: Classical',
    'e2e4 c7c6 d2d4 d7d5 e4e5': 'Caro-Kann: Advance',
    'e2e4 c7c6 d2d4 d7d5 e4d5': 'Caro-Kann: Exchange',
    'e2e4 d7d5 e4d5': 'Scandinavian Defense',
    'e2e4 d7d5 e4d5 d8d5': 'Scandinavian: Main Line',
    'e2e4 d7d5 e4d5 g8f6': 'Scandinavian: Modern',
    'd2d4 d7d5 c2c4': "Queen's Gambit",
    'd2d4 d7d5 c2c4 e7e6': "Queen's Gambit Declined",
    'd2d4 d7d5 c2c4 e7e6 b1c3': "Queen's Gambit Declined",
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6': "Queen's Gambit Declined",
    'd2d4 d7d5 c2c4 c7c6': 'Slav Defense',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3': 'Slav Defense',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4': 'Slav: Accepted',
    'd2d4 d7d5 c2c4 d5c4': "Queen's Gambit Accepted",
    'd2d4 d7d5 c2c4 e7e5': 'Albin Countergambit',
    'd2d4 g8f6 c2c4 e7e6': 'Indian Defense',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4': 'Nimzo-Indian Defense',
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6': "Queen's Indian Defense",
    'd2d4 g8f6 c2c4 e7e6 g2g3': 'Catalan Opening',
    'd2d4 g8f6 c2c4 e7e6 g2g3 d7d5': 'Catalan Opening',
    'd2d4 g8f6 c2c4 g7g6': "King's Indian / Grünfeld",
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7': "King's Indian Defense",
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6': "King's Indian Defense",
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8': "King's Indian: Classical",
    'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5': 'Grünfeld Defense',
    'd2d4 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 g8d5': 'Grünfeld: Exchange',
    'd2d4 g8f6 c2c4 e7e6 g1f3 f8b4': 'Bogo-Indian Defense',
    'd2d4 g8f6 c2c4 c7c5 d4d5': 'Benoni Defense',
    'd2d4 g8f6 c2c4 c7c5 d4d5 e7e6': 'Modern Benoni',
    'd2d4 f7f5 c2c4': 'Dutch Defense',
    'd2d4 f7f5 c2c4 g8f6': 'Dutch Defense',
    'd2d4 f7f5 g2g3': 'Dutch: Leningrad setup',
    'd2d4 d7d5 g1f3 g8f6 c2c4': "Queen's Gambit",
    'g1f3 d7d5 c2c4': 'Réti: Queen\'s Gambit',
    'c2c4 e7e5 b1c3': 'English Opening',
    'c2c4 e7e5 b1c3 g8f6': 'English: Four Knights',
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6 c2c3 e8g8 h2h3': 'Ruy Lopez: Closed',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 c1g5': 'Sicilian Najdorf: Main Line',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 f1e2': 'Sicilian Najdorf: Opocensky',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3': 'Nimzo-Indian: Rubinstein'
  };

  let host = null;
  let shadow = null;
  let flipped = false;
  let revision = -1;
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let panelOpen = false;
  let saveTimer = null;
  let saveVersion = 0;
  let outsideBound = false;
  let lastMoves = [];
  let lastTurn = null;
  let lastPlayer = null; // 'w' or 'b' only when explicitly detected
  let lastFen = null;
  let lastAnalysis = null;

  function ensureHost() {
    if (host && host.isConnected && shadow) return;
    const existing = document.getElementById(HOST_ID);
    if (existing && existing.shadowRoot) {
      host = existing;
      shadow = existing.shadowRoot;
      return;
    }
    host = document.createElement('div');
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: 'fixed', left: '0', top: '0', width: '0', height: '0',
      display: 'block', pointerEvents: 'none', zIndex: '2147483647', overflow: 'visible'
    });
    shadow = host.attachShadow({ mode: 'open' });
    const doc = new DOMParser().parseFromString(MARKUP, 'text/html');
    shadow.append(...Array.from(doc.head.childNodes), ...Array.from(doc.body.childNodes));
    (document.body || document.documentElement).appendChild(host);
    bindControls();
    loadSettings();
    place();
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

  function closePanel() {
    panelOpen = false;
    if (shadow) $('panel').classList.add('hidden');
  }

  function queueAutoSave(patch = null, delay = 350) {
    settings = Object.assign({}, readForm(), patch || {});
    syncForm();
    if (saveTimer) clearTimeout(saveTimer);
    setStatus('Saving…');
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void persistSettings();
    }, delay);
  }

  async function persistSettings() {
    const version = ++saveVersion;
    const next = Object.assign({}, readForm());
    settings = next;
    try {
      const response = await browser.runtime.sendMessage({ type: 'saveSettings', settings: next });
      if (version !== saveVersion) return;
      if (response && response.settings) settings = response.settings;
      syncForm();
      setStatus('Saved. Re-analysing…');
      const state = window.OpenTalBoard && window.OpenTalBoard.current ? window.OpenTalBoard.current() : null;
      requestAnalysis(state);
    } catch (error) {
      if (version !== saveVersion) return;
      setStatus('Could not save settings.');
    }
  }

  function bindControls() {
    $('gear').addEventListener('click', (event) => {
      event.stopPropagation();
      panelOpen = !panelOpen;
      $('panel').classList.toggle('hidden', !panelOpen);
      if (!panelOpen) setStatus('');
    });

    $('modeTime').addEventListener('click', () => {
      queueAutoSave({ searchMode: 'time' }, 0);
    });
    $('modeDepth').addEventListener('click', () => {
      queueAutoSave({ searchMode: 'depth' }, 0);
    });

    ['movetime', 'depth', 'hash', 'threads', 'multiPv'].forEach((id) => {
      $(id).addEventListener('input', () => queueAutoSave(null, 400));
      $(id).addEventListener('change', () => queueAutoSave(null, 0));
    });

    ['useBook', 'talMode', 'talRandom', 'ponder'].forEach((id) => {
      $(id).addEventListener('change', () => queueAutoSave(null, 0));
    });

    $('reset').addEventListener('click', () => {
      settings = Object.assign({}, DEFAULT_SETTINGS);
      syncForm();
      queueAutoSave(null, 0);
    });

    if (!outsideBound) {
      document.addEventListener('pointerdown', (event) => {
        if (!panelOpen || !shadow || !host || !host.isConnected) return;
        const path = event.composedPath ? event.composedPath() : [];
        const panel = $('panel');
        const gear = $('gear');
        if ((panel && path.includes(panel)) || (gear && path.includes(gear))) return;
        closePanel();
      }, true);
      outsideBound = true;
    }
  }

  async function loadSettings() {
    try {
      const response = await browser.runtime.sendMessage({ type: 'getSettings' });
      if (response && response.settings) settings = Object.assign({}, DEFAULT_SETTINGS, response.settings);
    } catch (error) { /* use defaults */ }
    syncForm();
  }

  function findBoardElementFallback() {
    const selectors = [
      'wc-chess-board', 'chess-board', 'cg-board',
      '#board-single', '#board', '.board-layout-main', '.board'
    ];
    let best = null;
    let bestArea = 0;
    for (const sel of selectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          if (!el || !el.isConnected) return;
          const rect = el.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (rect.width >= 80 && rect.height >= 80 && area >= bestArea) {
            best = el;
            bestArea = area;
          }
        });
      } catch (e) { /* ignore */ }
    }
    if (best) return best;
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.isConnected) return el;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  let placeQueued = false;
  let placeTimer = null;
  function place() {
    ensureHost();
    if (!host) return;
    const state = window.OpenTalBoard && window.OpenTalBoard.current ? window.OpenTalBoard.current() : null;
    let element = state && state.board;
    if (!element || !element.isConnected || element.getBoundingClientRect().width < 80) {
      element = findBoardElementFallback();
    }
    window.OpenTalDebug = window.OpenTalDebug || {};
    window.OpenTalDebug.placeElement = element ? (element.tagName || element.nodeName || 'node') : null;
    if (!element || !element.isConnected) {
      if (!placeTimer) placeTimer = setTimeout(() => { placeTimer = null; place(); }, 250);
      return;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      if (!placeTimer) placeTimer = setTimeout(() => { placeTimer = null; place(); }, 250);
      return;
    }
    if (placeTimer) { clearTimeout(placeTimer); placeTimer = null; }
    host.style.left = Math.round(rect.left) + 'px';
    host.style.top = Math.round(rect.top) + 'px';
    host.style.width = Math.round(rect.width) + 'px';
    host.style.height = Math.round(rect.height) + 'px';
    window.OpenTalDebug.hostRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }
  function schedulePlace() {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(() => {
      placeQueued = false;
      place();
    });
  }
  setInterval(place, 1000);

  function squareCentre(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    const state = window.OpenTalBoard && window.OpenTalBoard.current ? window.OpenTalBoard.current() : null;
    const isFlipped = state && typeof state.flipped === 'boolean' ? state.flipped : flipped;
    return isFlipped
      ? { x: 7 - file + 0.5, y: rank + 0.5 }
      : { x: file + 0.5, y: 7 - rank + 0.5 };
  }

  function formatScore(line) {
    if (!line) return '';
    if (line.mate != null) return 'M' + Math.abs(line.mate);
    if (line.score != null) return (line.score >= 0 ? '+' : '') + (line.score / 100).toFixed(2);
    return 'book';
  }

  function openingName(moves, bestMove) {
    const base = Array.isArray(moves) ? moves.filter(Boolean) : [];
    const seqs = [];
    if (bestMove && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove)) seqs.push(base.concat([bestMove]));
    seqs.push(base);
    for (const seq of seqs) {
      for (let len = seq.length; len >= 0; len--) {
        const key = seq.slice(0, len).join(' ');
        if (Object.prototype.hasOwnProperty.call(OPENINGS, key)) return OPENINGS[key];
      }
    }
    return null;
  }

  function clear() {
    if (!shadow) return;
    const arrows = $('arrows');
    const lines = $('lines');
    if (arrows) arrows.replaceChildren();
    if (lines) { lines.replaceChildren(); lines.classList.add('hidden'); }
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
    const ux = dx / length, uy = dy / length;
    const px = -uy, py = ux;
    const headLen = rank === 1 ? 0.30 : 0.26;
    const headWidth = rank === 1 ? 0.17 : 0.14;
    const shaftWidth = rank === 1 ? 0.15 : 0.12;
    const tipX = to.x - ux * 0.06;
    const tipY = to.y - uy * 0.06;
    const baseX = tipX - ux * headLen;
    const baseY = tipY - uy * headLen;
    const ns = 'http://www.w3.org/2000/svg';

    const shaft = document.createElementNS(ns, 'line');
    shaft.setAttribute('class', 'pv-arrow ' + cls);
    shaft.setAttribute('x1', from.x);
    shaft.setAttribute('y1', from.y);
    shaft.setAttribute('x2', baseX);
    shaft.setAttribute('y2', baseY);
    shaft.setAttribute('stroke-width', String(shaftWidth));
    svgGroup.appendChild(shaft);

    const head = document.createElementNS(ns, 'polygon');
    head.setAttribute('class', cls);
    head.setAttribute('points', [
      tipX, tipY,
      baseX + px * headWidth, baseY + py * headWidth,
      baseX - px * headWidth, baseY - py * headWidth
    ].join(' '));
    svgGroup.appendChild(head);
    return true;
  }

  function draw(result) {
    try {
      ensureHost();
      window.OpenTalDebug = window.OpenTalDebug || {};
      window.OpenTalDebug.lastResult = result;
      window.OpenTalDebug.lastDrawAt = Date.now();
      lastAnalysis = result || null;
      clear();

      const best = result && result.bestmove != null ? String(result.bestmove) : '';
      const hasLines = result && Array.isArray(result.lines) && result.lines.length > 0;
      const candidates = hasLines ? result.lines.slice(0, 3) : (best ? [{ move: best, score: result.score, mate: result.mate }] : []);

      const badge = $('badge');
      if (!candidates.length || !/^([a-h][1-8])([a-h][1-8])/.test(candidates[0].move || best)) {
        const shown = best ? best : '(empty)';
        if (badge) badge.textContent = 'TAL — NO MOVE [' + shown + ']';
        place();
        schedulePlace();
        return;
      }

      const arrows = $('arrows');
      const lineBox = $('lines');
      let drawn = 0;
      // draw in reverse so PV1 is on top
      for (let i = candidates.length - 1; i >= 0; i--) {
        if (arrows && drawArrow(arrows, candidates[i].move, i + 1)) drawn++;
      }
      window.OpenTalDebug.lastDrawnArrows = drawn;

      const top = candidates[0];
      const isBook = top.score == null && top.mate == null;
      let label = formatScore(top);
      if (isBook) {
        const opening = openingName(lastMoves, top.move);
        label = opening ? ('book · ' + opening) : 'book';
      }
      const sideName = lastTurn === 'w' ? 'White' : (lastTurn === 'b' ? 'Black' : '');
      const mine = (lastPlayer === 'w' || lastPlayer === 'b') && lastPlayer === lastTurn ? ' (you)' : '';
      if (badge) badge.textContent = 'TAL ' + top.move + ' · ' + label + (sideName ? ' · ' + sideName + ' to move' + mine : '');

      if (candidates.length > 1 && lineBox) {
        candidates.forEach((line, index) => {
          const chip = document.createElement('span');
          chip.className = 'chip pv' + (index + 1);
          chip.textContent = (index + 1) + '. ' + line.move + ' ' + formatScore(line);
          lineBox.appendChild(chip);
        });
        lineBox.classList.remove('hidden');
      }

      setStatus(panelOpen ? 'Ready.' : ($('status') ? $('status').textContent : ''));
      place();
      schedulePlace();
      requestAnimationFrame(place);
      setTimeout(place, 120);
    } catch (e) {
      console.log('[OpenTal] draw error', e);
      try { if ($('badge')) $('badge').textContent = 'TAL — draw error'; } catch (e2) {}
    }
  }

  function requestAnalysis(state) {
    if (!state || !state.fen) return;
    ensureHost();
    $('badge').textContent = 'TAL …';
    browser.runtime.sendMessage({
      type: 'analyse',
      fen: state.fen,
      moves: Array.isArray(state.moves) ? state.moves : [],
      revision: state.revision,
      movetime: settings.movetime
    }).catch((error) => {
      $('badge').textContent = 'TAL — bridge unavailable';
      console.log('[OpenTal] send failed', error);
    });
  }

  let retryTimer = null;
  function scheduleRetry(delay) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      const state = window.OpenTalBoard && window.OpenTalBoard.current ? window.OpenTalBoard.current() : null;
      if (state && state.fen) requestAnalysis(state);
    }, typeof delay === 'number' ? delay : 1200);
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'analysis') {
      if (msg.revision != null && msg.revision < revision) return;
      console.log('[OpenTal] analysis', msg);
      draw(msg);
    } else if (msg.type === 'error') {
      if (msg.revision != null && msg.revision < revision) return;
      console.log('[OpenTal] error', msg);
      ensureHost();
      clear();
      $('badge').textContent = 'TAL — ' + (msg.message || 'error').slice(0, 48);
      setStatus(panelOpen ? ('Retrying… ' + (msg.message || 'error')) : $('status').textContent);
      scheduleRetry(1500);
    }
  });

  window.OpenTalBoard.start((state) => {
    revision = state.revision;
    flipped = !!state.flipped;
    lastTurn = state.turn || (state.fen ? state.fen.split(' ')[1] : null);
    if (state.player === 'w' || state.player === 'b') lastPlayer = state.player;
    lastFen = state.fen || null;
    lastMoves = Array.isArray(state.moves) ? state.moves.slice() : [];
    lastAnalysis = null;
    clear();
    ensureHost();
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    window.OpenTalDebug = window.OpenTalDebug || {};
    window.OpenTalDebug.lastSentFen = state.fen;
    window.OpenTalDebug.lastMoves = lastMoves.slice();
    window.OpenTalDebug.lastPlayer = lastPlayer;
    window.OpenTalDebug.lastState = state;
    console.log('[OpenTal] state', state.source, 'turn', lastTurn, 'player', lastPlayer, 'flipped', state.flipped, state.fen, 'moves', lastMoves.length);
    place();
    requestAnalysis(state);
  });

  window.addEventListener('resize', schedulePlace);
  window.addEventListener('scroll', schedulePlace, true);
})();
