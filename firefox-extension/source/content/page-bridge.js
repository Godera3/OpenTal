(function () {
  if (window.__opentalBridgeInstalled) return;
  window.__opentalBridgeInstalled = true;

  function findBoardElement() {
    return document.querySelector('wc-chess-board, chess-board, cg-board');
  }

  function findGame() {
    const board = findBoardElement();
    if (board && board.game) return board.game;
    try {
      if (window.chessboard && typeof window.chessboard.getRelationship === 'function') {
        const game = window.chessboard.getRelationship().game;
        if (game) return game;
      }
    } catch (error) { /* unavailable */ }
    try {
      if (window.game && typeof window.game.fen === 'function') return window.game;
    } catch (error) { /* unavailable */ }
    return null;
  }

  function readFen(game) {
    if (!game) return null;
    try {
      if (typeof game.getFEN === 'function') return String(game.getFEN());
      if (typeof game.fen === 'function') return String(game.fen());
      if (typeof game.getFen === 'function') return String(game.getFen());
      if (game.state && typeof game.state.fen === 'string') return game.state.fen;
    } catch (error) { /* stale during navigation */ }
    return null;
  }

  function normalizeTurn(value) {
    if (value == null) return null;
    if (value === 1 || value === '1' || value === 'w' || value === 'white') return 'w';
    if (value === 2 || value === '2' || value === 'b' || value === 'black') return 'b';
    return null;
  }

  function readTurn(game) {
    if (!game) return null;
    const candidates = ['getTurn', 'turn', 'getSideToMove', 'getPlayingTurn'];
    for (const name of candidates) {
      try {
        if (typeof game[name] === 'function') {
          const turn = normalizeTurn(game[name]());
          if (turn) return turn;
        }
      } catch (error) { /* ignore */ }
    }
    return null;
  }

  function applyTurnToFen(fen, turn) {
    if (!fen || !turn) return fen;
    const parts = String(fen).split(' ');
    if (parts.length < 2) return fen;
    parts[1] = turn;
    return parts.join(' ');
  }

  function readFlipped(game) {
    try {
      if (game && typeof game.getIsFlipped === 'function') return !!game.getIsFlipped();
    } catch (error) { /* ignore */ }
    const board = findBoardElement();
    if (board) {
      try {
        if (typeof board.flipped === 'boolean') return board.flipped;
      } catch (error) { /* ignore */ }
      try {
        if (board.getAttribute && board.getAttribute('flipped') != null) {
          const value = board.getAttribute('flipped');
          return value === '' || value === 'true' || value === 'flipped';
        }
      } catch (error) { /* ignore */ }
      if (board.classList && board.classList.contains('flipped')) return true;
    }
    return null;
  }

  function readPlayerColor(game, flipped) {
    const tryColor = (value) => {
      if (value == null) return null;
      if (typeof value === 'object') {
        if ('color' in value) return tryColor(value.color);
        if ('playingAs' in value) return tryColor(value.playingAs);
      }
      const n = normalizeTurn(value);
      if (n) return n;
      const s = String(value).toLowerCase();
      if (s === 'white') return 'w';
      if (s === 'black') return 'b';
      return null;
    };

    const sources = [game];
    try {
      if (window.chessboard && typeof window.chessboard.getRelationship === 'function') {
        const rel = window.chessboard.getRelationship();
        if (rel) sources.push(rel, rel.game);
      }
    } catch (error) { /* ignore */ }
    try {
      const board = findBoardElement();
      if (board && board.game) sources.push(board.game);
    } catch (error) { /* ignore */ }

    const methods = [
      'getPlayingAs', 'getPlayingAsColor', 'getPlayerColor', 'getMyColor',
      'getUserColor', 'getPerspective', 'getOrientation', 'getBottomColor',
      'getBottomPlayerColor', 'getSide', 'getColor'
    ];
    const props = [
      'playingAs', 'playingAsColor', 'playerColor', 'myColor', 'userColor',
      'perspective', 'orientation', 'bottomColor', 'side', 'color'
    ];

    for (const src of sources) {
      if (!src) continue;
      for (const name of methods) {
        try {
          if (typeof src[name] === 'function') {
            const c = tryColor(src[name]());
            if (c) return c;
          }
        } catch (error) { /* ignore */ }
      }
      for (const name of props) {
        try {
          const c = tryColor(src[name]);
          if (c) return c;
        } catch (error) { /* ignore */ }
      }
    }

    // Fallback: in bot games/puzzles board is usually oriented with the player at bottom.
    if (flipped === true) return 'b';
    if (flipped === false) return 'w';
    return null;
  }

  let lastEmitted = '';
  let dragging = false;

  function emit(force) {
    if (dragging && !force) return;
    const game = findGame();
    let fen = readFen(game);
    if (!fen) return;
    const turn = readTurn(game);
    if (turn) fen = applyTurnToFen(fen, turn);
    const flipped = readFlipped(game);
    const player = readPlayerColor(game, flipped);
    const payload = fen + '|' + (flipped === null ? '' : String(flipped)) + '|' + (turn || '') + '|' + (player || '');
    if (!force && payload === lastEmitted) return;
    lastEmitted = payload;
    window.postMessage({
      source: 'opental-bridge',
      fen,
      flipped,
      turn,
      player
    }, '*');
  }

  function squareClientPoint(square, flipped, rect) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    const xIndex = flipped ? 7 - file : file;
    const yIndex = flipped ? rank : 7 - rank;
    return {
      x: rect.left + (xIndex + 0.5) * rect.width / 8,
      y: rect.top + (yIndex + 0.5) * rect.height / 8
    };
  }

  function dispatchPointer(el, type, x, y, buttons) {
    if (!el) return;
    const btns = buttons != null ? buttons : (type === 'pointerup' ? 0 : 1);
    const opts = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, button: 0, buttons: btns };
    try {
      if (typeof PointerEvent === 'function') {
        el.dispatchEvent(new PointerEvent(type, Object.assign({}, opts, { pointerType: 'mouse', isPrimary: true, pointerId: 1 })));
      }
    } catch (e) {}
    const mouseType = type === 'pointerdown' ? 'mousedown' : (type === 'pointerup' ? 'mouseup' : (type === 'pointermove' ? 'mousemove' : 'click'));
    try { el.dispatchEvent(new MouseEvent(mouseType, Object.assign({}, opts))); } catch (e) {}
  }

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  async function tryClickMove(uci, promotion, fenBefore) {
    const board = findBoardElement();
    if (!board) return false;
    const rect = board.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const game = findGame();
    const flipped = readFlipped(game);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const fromPt = squareClientPoint(from, !!flipped, rect);
    const toPt = squareClientPoint(to, !!flipped, rect);

    const fromEl = document.elementFromPoint(fromPt.x, fromPt.y) || board;
    dispatchPointer(fromEl, 'pointerdown', fromPt.x, fromPt.y, 1);
    dispatchPointer(board, 'pointerdown', fromPt.x, fromPt.y, 1);
    dispatchPointer(fromEl, 'pointermove', fromPt.x, fromPt.y, 1);
    await sleep(30);
    const midX = (fromPt.x + toPt.x) / 2;
    const midY = (fromPt.y + toPt.y) / 2;
    dispatchPointer(board, 'pointermove', midX, midY, 1);
    await sleep(30);
    dispatchPointer(board, 'pointermove', toPt.x, toPt.y, 1);
    const toEl = document.elementFromPoint(toPt.x, toPt.y) || board;
    dispatchPointer(toEl, 'pointerup', toPt.x, toPt.y, 0);
    dispatchPointer(board, 'pointerup', toPt.x, toPt.y, 0);
    await sleep(20);
    // click fallback sequence for boards that expect clicks
    dispatchPointer(fromEl, 'click', fromPt.x, fromPt.y, 0);
    await sleep(60);
    const toEl2 = document.elementFromPoint(toPt.x, toPt.y) || board;
    dispatchPointer(toEl2, 'click', toPt.x, toPt.y, 0);

    if (uci.length >= 5) {
      await sleep(150);
      const wanted = (promotion || 'q').toLowerCase();
      const selectors = [
        '[data-piece="' + wanted + '"]',
        '[data-piece="w' + wanted + '"]',
        '[data-piece="b' + wanted + '"]',
        '.promotion-piece.' + wanted,
        '.promotion-piece[class*="' + wanted + '"]',
        'div[class*="promotion"] [class*="' + wanted + '"]'
      ];
      for (const sel of selectors) {
        try {
          const promo = document.querySelector(sel);
          if (promo) { promo.click(); break; }
        } catch (e) {}
      }
    }

    await sleep(220);
    try {
      const fenAfter = readFen(findGame());
      if (fenBefore && fenAfter && fenAfter !== fenBefore) return true;
    } catch (e) {}
    return false;
  }

  async function tryApiMove(uci, fenBefore) {
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(String(uci || ''));
    if (!match) return false;
    const from = match[1];
    const to = match[2];
    const promotion = (match[3] || 'q').toLowerCase();
    const game = findGame();
    const board = findBoardElement();

    const attempts = [];
    const addMoveAttempts = (obj) => {
      if (!obj) return;
      if (typeof obj.move === 'function') {
        attempts.push(() => obj.move({ from, to, promotion }));
        attempts.push(() => obj.move({ from, to, promotion: promotion.toUpperCase() }));
        attempts.push(() => obj.move({ from, to }));
        attempts.push(() => obj.move(from + to + (match[3] ? promotion : '')));
        attempts.push(() => obj.move(from + to));
        attempts.push(() => obj.move(from, to, promotion));
      }
      ['playMove', 'makeMove', 'submitMove', 'movePiece', 'doMove'].forEach((name) => {
        if (typeof obj[name] === 'function') {
          attempts.push(() => obj[name]({ from, to, promotion }));
          attempts.push(() => obj[name](from + to + (match[3] ? promotion : '')));
          attempts.push(() => obj[name](from, to, promotion));
        }
      });
    };

    addMoveAttempts(game);
    if (board && board.game && board.game !== game) addMoveAttempts(board.game);
    try {
      if (window.chessboard && typeof window.chessboard.getRelationship === 'function') {
        const g = window.chessboard.getRelationship().game;
        if (g && g !== game) addMoveAttempts(g);
      }
    } catch (e) {}
    if (game) {
      ['chess', 'chessgame', 'engine', 'state', 'api'].forEach((key) => {
        try { addMoveAttempts(game[key]); } catch (e) {}
      });
    }

    for (const fn of attempts) {
      let before = fenBefore;
      try { if (!before) before = readFen(findGame()); } catch (e) {}
      try {
        const result = fn();
        if (result === null || result === false) continue;
        // truthy or undefined: verify actual position change before claiming success
        await sleep(140);
        let after = null;
        try { after = readFen(findGame()); } catch (e) {}
        if (before && after && after !== before) return true;
        if (!before && after) return true;
        // no observed change -> try next candidate
      } catch (e) { /* try next */ }
    }
    return false;
  }

  async function tryPlayMove(uci) {
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(String(uci || ''));
    if (!match) return { ok: false, reason: 'bad-move' };
    const promotion = (match[3] || 'q').toLowerCase();
    const fenBefore = (() => { try { return readFen(findGame()); } catch (e) { return null; } })();

    if (await tryApiMove(match[0], fenBefore)) {
      return { ok: true, method: 'api' };
    }

    const clicked = await tryClickMove(match[0], promotion, fenBefore);
    if (clicked) return { ok: true, method: 'click' };
    return { ok: false, reason: 'no-board-change' };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'opental-content') return;
    if (event.data.type === 'playMove') {
      const move = typeof event.data.move === 'string' ? event.data.move : '';
      const requestId = event.data.requestId;
      (async () => {
        let result = { ok: false, reason: 'unhandled' };
        try {
          result = await tryPlayMove(move);
          console.log('[OpenTal bridge] playMove', move, result);
        } catch (e) {
          result = { ok: false, reason: String(e) };
          console.log('[OpenTal bridge] playMove error', move, e);
        }
        window.postMessage({
          source: 'opental-bridge',
          type: 'movePlayed',
          requestId,
          move,
          ok: !!result.ok,
          method: result.method || null,
          reason: result.reason || null
        }, '*');
        if (result.ok) {
          setTimeout(() => emit(true), 80);
          setTimeout(() => emit(true), 300);
          setTimeout(() => emit(true), 700);
        }
      })();
    }
  });

  let scheduled = false;
  function scheduleEmit() {
    if (dragging || scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; emit(); }, 120);
  }

  setInterval(() => emit(), 400);
  if (document.documentElement) {
    new MutationObserver(scheduleEmit).observe(document.documentElement, {
      childList: true, subtree: true
    });
  }

  window.addEventListener('pointerdown', () => { dragging = true; }, true);
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    setTimeout(() => emit(true), 30);
    setTimeout(() => emit(true), 180);
  };
  window.addEventListener('pointerup', endDrag, true);
  window.addEventListener('pointercancel', endDrag, true);
  window.addEventListener('load', () => emit(true));
  emit(true);
})();