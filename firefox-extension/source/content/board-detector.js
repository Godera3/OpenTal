/* Reads the live Chess.com position. Prefers the site's own game object. */

(function () {
  // Order matters: a wrapper such as #board-layout-main also contains the
  // board, and querySelector would return it first in document order.
  const BOARD_SELECTORS = [
    'wc-chess-board', 'chess-board', 'main.round .round__app__board cg-board',
    '.round__app .cg-wrap cg-board', '.board-layout-main .board',
    'cg-board', '#board-single', '#board', '.board', '.round__app'
  ];

  const PIECE_SELECTOR = 'piece[class*="square-"], [class*="piece"][class*="square-"]';
  const PIECE_CODES = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };

  let board = null;
  let lastFen = null;
  let bridgeFen = null;
  let revision = 0;
  const listeners = [];

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'opental-bridge') return;
    if (typeof event.data.fen === 'string') bridgeFen = event.data.fen;
  });

  try {
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('content/page-bridge.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (error) { /* extension context unavailable */ }

  function findBoard() {
    for (const selector of BOARD_SELECTORS) {
      const found = document.querySelector(selector);
      if (found) {
        board = found;
        return board;
      }
    }
    board = null;
    return null;
  }

  function fromBridge() {
    return bridgeFen;
  }

  function fromSiteApi() {
    try {
      const site = window.wrappedJSObject && window.wrappedJSObject.chessboard;
      if (site && typeof site.getRelationship === 'function') {
        const game = site.getRelationship().game;
        if (game && typeof game.getFEN === 'function') return String(game.getFEN());
      }
    } catch (error) { /* page state not ready */ }
    return null;
  }

  function collectPieces(root, out) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(PIECE_SELECTOR).forEach((el) => out.push(el));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) collectPieces(el.shadowRoot, out);
    });
  }

  function fromDom() {
    const root = board || document;
    const pieces = [];
    collectPieces(root, pieces);
    if (!pieces.length) collectPieces(document, pieces);
    if (!pieces.length) return null;

    const squares = new Array(64).fill('');
    pieces.forEach((el) => {
      const cls = typeof el.className === 'string'
        ? el.className
        : (el.className && el.className.baseVal) || '';
      const coord = /square-(\d)(\d)/.exec(cls);
      const type = /(king|queen|rook|bishop|knight|pawn)/.exec(cls) || /(wk|wq|wr|wb|wn|wp|bk|bq|br|bb|bn|bp)/.exec(cls);
      if (!coord || !type) return;
      const file = Number(coord[1]) - 1;
      const rank = Number(coord[2]) - 1;
      if (file < 0 || file > 7 || rank < 0 || rank > 7) return;
      let code = PIECE_CODES[type[1]];
      if (!code) {
        const short = type[1];
        code = short[0] === 'w' ? short[1].toUpperCase() : short[1];
      }
      const white = /(?:^|\s|-)w|white/.test(cls);
      squares[rank * 8 + file] = white ? code.toUpperCase() : code.toLowerCase();
    });

    let placement = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = squares[rank * 8 + file];
        if (!piece) {
          empty++;
        } else {
          if (empty) placement += empty;
          empty = 0;
          placement += piece;
        }
      }
      if (empty) placement += empty;
      if (rank) placement += '/';
    }

    const turn = document.querySelector('.turn-black') ? 'b' : 'w';
    const at = (file, rank) => squares[rank * 8 + file];
    let castling = '';
    if (at(4, 0) === 'K') {
      if (at(7, 0) === 'R') castling += 'K';
      if (at(0, 0) === 'R') castling += 'Q';
    }
    if (at(4, 7) === 'k') {
      if (at(7, 7) === 'r') castling += 'k';
      if (at(0, 7) === 'r') castling += 'q';
    }
    return placement + ' ' + turn + ' ' + (castling || '-') + ' - 0 1';
  }

  function flipped() {
    return !!document.querySelector(
      '.cg-wrap.orientation-black, .orientation-black, wc-chess-board[flipped]'
    );
  }

  function current() {
    if (!board || !board.isConnected) findBoard();
    const fen = fromBridge() || fromSiteApi() || fromDom();
    if (!fen) return null;
    return { fen, flipped: flipped(), board, revision, source: fromBridge() ? 'bridge' : (fromSiteApi() ? 'api' : 'dom') };
  }

  function tick() {
    const state = current();
    if (!state || state.fen === lastFen) return;
    lastFen = state.fen;
    revision++;
    state.revision = revision;
    window.OpenTalDebug.lastState = state;
    listeners.forEach((listener) => listener(state));
  }

  let scheduled = false;
  function scheduleTick() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; tick(); }, 60);
  }

  window.OpenTalDebug = window.OpenTalDebug || { lastState: null };

  window.OpenTalBoard = {
    start(listener) {
      listeners.push(listener);
      findBoard();
      tick();
      setInterval(tick, 300);
      const observer = new MutationObserver(scheduleTick);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener('resize', scheduleTick);
    },
    current
  };
})();
