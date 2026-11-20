(function () {
  if (window.__opentalBridgeInstalled) return;
  window.__opentalBridgeInstalled = true;

  function findGame() {
    const selectors = ['wc-chess-board', 'chess-board', '.board'];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.game) return element.game;
    }
    try {
      if (window.chessboard && typeof window.chessboard.getRelationship === 'function') {
        const game = window.chessboard.getRelationship().game;
        if (game) return game;
      }
    } catch (error) { /* unavailable */ }
    return window.game || null;
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

  function emit() {
    const fen = readFen(findGame());
    if (fen) window.postMessage({ source: 'opental-bridge', fen }, '*');
  }

  setInterval(emit, 350);
  if (document.documentElement) {
    new MutationObserver(emit).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true
    });
  }
  window.addEventListener('load', emit);
  emit();
})();