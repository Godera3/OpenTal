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

  function emit() {
    const game = findGame();
    let fen = readFen(game);
    if (!fen) return;
    const turn = readTurn(game);
    if (turn) fen = applyTurnToFen(fen, turn);
    window.postMessage({
      source: 'opental-bridge',
      fen,
      flipped: readFlipped(game),
      turn
    }, '*');
  }

  let scheduled = false;
  function scheduleEmit() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; emit(); }, 80);
  }

  setInterval(emit, 250);
  if (document.documentElement) {
    new MutationObserver(scheduleEmit).observe(document.documentElement, {
      childList: true, subtree: true
    });
  }
  window.addEventListener('load', emit);
  emit();
})();