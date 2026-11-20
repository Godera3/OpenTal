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
    const payload = fen + '|' + (flipped === null ? '' : String(flipped)) + '|' + (turn || '');
    if (!force && payload === lastEmitted) return;
    lastEmitted = payload;
    window.postMessage({
      source: 'opental-bridge',
      fen,
      flipped,
      turn
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

  function dispatchPointer(el, type, x, y) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    try { if (typeof PointerEvent === 'function') el.dispatchEvent(new PointerEvent(type, Object.assign({}, opts, { pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }))); } catch (e) {}
    const mouseType = type === 'pointerdown' ? 'mousedown' : (type === 'pointerup' ? 'mouseup' : (type === 'pointermove' ? 'mousemove' : 'click'));
    try { el.dispatchEvent(new MouseEvent(mouseType, opts)); } catch (e) {}
  }

  function tryClickMove(uci, promotion) {
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
    const toEl = document.elementFromPoint(toPt.x, toPt.y) || board;
    dispatchPointer(fromEl, 'pointerdown', fromPt.x, fromPt.y);
    dispatchPointer(fromEl, 'click', fromPt.x, fromPt.y);
    setTimeout(() => {
      dispatchPointer(toEl, 'pointerup', toPt.x, toPt.y);
      dispatchPointer(toEl, 'click', toPt.x, toPt.y);
      if (uci.length >= 5) {
        // best-effort: try clicking promotion piece by letter in common UIs
        setTimeout(() => {
          const wanted = (promotion || 'q').toLowerCase();
          const promo = document.querySelector('[data-piece*="' + wanted + '"], [class*="promotion"][class*="' + wanted + '"], .promotion-piece.' + wanted);
          if (promo) {
            try { promo.click(); } catch (e) {}
          }
        }, 80);
      }
    }, 40);
    return true;
  }

  function tryPlayMove(uci) {
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(String(uci || ''));
    if (!match) return { ok: false, reason: 'bad-move' };
    const from = match[1];
    const to = match[2];
    const promotion = (match[3] || 'q').toLowerCase();
    const game = findGame();
    const board = findBoardElement();

    const attempts = [];
    if (game) {
      if (typeof game.move === 'function') {
        attempts.push(() => game.move({ from, to, promotion }));
        attempts.push(() => game.move({ from, to, promotion: promotion.toUpperCase() }));
        attempts.push(() => game.move(from + to + (match[3] ? promotion : '')));
        attempts.push(() => game.move(from + to));
        attempts.push(() => game.move(from, to, promotion));
      }
      ['playMove', 'makeMove', 'submitMove'].forEach((name) => {
        if (typeof game[name] === 'function') attempts.push(() => game[name]({ from, to, promotion }));
      });
      ['chess', 'chessgame', 'engine'].forEach((key) => {
        try {
          const inner = game[key];
          if (inner && typeof inner.move === 'function') {
            attempts.push(() => inner.move({ from, to, promotion }));
          }
        } catch (e) {}
      });
    }
    if (board && board.game && typeof board.game.move === 'function' && board.game !== game) {
      attempts.push(() => board.game.move({ from, to, promotion }));
    }
    try {
      if (window.chessboard && typeof window.chessboard.getRelationship === 'function') {
        const g = window.chessboard.getRelationship().game;
        if (g && typeof g.move === 'function' && g !== game) attempts.push(() => g.move({ from, to, promotion }));
      }
    } catch (e) {}

    for (const fn of attempts) {
      try {
        const result = fn();
        if (result !== null && result !== false) return { ok: true, method: 'api' };
      } catch (e) { /* try next */ }
    }

    if (tryClickMove(match[0], promotion)) return { ok: true, method: 'click' };
    return { ok: false, reason: 'no-move-method' };
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'opental-content') return;
    if (event.data.type === 'playMove') {
      const move = typeof event.data.move === 'string' ? event.data.move : '';
      const requestId = event.data.requestId;
      let result = { ok: false, reason: 'unhandled' };
      try {
        result = tryPlayMove(move);
      } catch (e) {
        result = { ok: false, reason: String(e) };
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
        setTimeout(() => emit(true), 60);
        setTimeout(() => emit(true), 250);
      }
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