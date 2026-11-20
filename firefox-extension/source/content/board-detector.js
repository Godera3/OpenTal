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
  const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const FILES = 'abcdefgh';

  let board = null;
  let lastFen = null;
  let bridgeState = null;
  let revision = 0;
  let dragging = false;
  let domObserver = null;
  let observedRoot = null;
  let moveHistory = [];
  const listeners = [];

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'opental-bridge') return;
    if (typeof event.data.fen === 'string') {
      bridgeState = {
        fen: event.data.fen,
        flipped: typeof event.data.flipped === 'boolean' ? event.data.flipped : null,
        turn: typeof event.data.turn === 'string' ? event.data.turn : null,
        player: typeof event.data.player === 'string' ? event.data.player : null
      };
    }
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
        if (typeof syncObserver === 'function') {
          try { syncObserver(); } catch (error) { /* init order */ }
        }
        return board;
      }
    }
    board = null;
    return null;
  }

  function fromBridge() {
    return bridgeState && bridgeState.fen ? bridgeState.fen : null;
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

  function collectPieces(root, out, depth) {
    if (!root || !root.querySelectorAll || depth > 4) return;
    try {
      root.querySelectorAll(PIECE_SELECTOR).forEach((el) => out.push(el));
      // Traverse shadow roots on likely hosts instead of scanning every element.
      root.querySelectorAll('wc-chess-board, chess-board, cg-board, .board').forEach((el) => {
        if (el.shadowRoot) collectPieces(el.shadowRoot, out, depth + 1);
      });
      if (root.host && root !== document) {
        // already inside a shadow root; avoid re-walking all descendants
      }
    } catch (error) { /* ignore */ }
  }

  function fromDom() {
    const root = board || document;
    const pieces = [];
    collectPieces(root, pieces, 0);
    if (!pieces.length && root !== document) collectPieces(document, pieces, 0);
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

  function domFlipped() {
    const elements = [
      board,
      document.querySelector('wc-chess-board'),
      document.querySelector('chess-board'),
      document.querySelector('cg-board')
    ].filter(Boolean);
    for (const element of elements) {
      if (element.classList && element.classList.contains('flipped')) return true;
      if (element.hasAttribute && element.hasAttribute('flipped')) return true;
      if (element.getAttribute && element.getAttribute('data-flipped') === 'true') return true;
      if (element.closest && element.closest('.flipped, .board-flipped, .orientation-black')) return true;
    }
    return !!document.querySelector('.cg-wrap.orientation-black, .orientation-black, .board-layout-chessboard.flipped');
  }

  function placementOf(fen) {
    return typeof fen === 'string' ? fen.split(' ')[0] : '';
  }

  function parseBoard(placement) {
    const rows = String(placement || '').split('/');
    if (rows.length !== 8) return null;
    const out = new Array(64).fill('');
    for (let r = 0; r < 8; r++) {
      const rank = 7 - r;
      let file = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') {
          file += Number(ch);
        } else {
          if (file > 7 || rank < 0 || rank > 7) return null;
          out[rank * 8 + file] = ch;
          file++;
        }
      }
      if (file !== 8) return null;
    }
    return out;
  }

  function squareName(index) {
    return FILES[index % 8] + String(Math.floor(index / 8) + 1);
  }

  function isWhitePiece(piece) { return piece >= 'A' && piece <= 'Z'; }
  function isBlackPiece(piece) { return piece >= 'a' && piece <= 'z'; }

  function deriveUciMove(prevFen, nextFen) {
    const prevPlacement = placementOf(prevFen);
    const nextPlacement = placementOf(nextFen);
    if (!prevPlacement || !nextPlacement || prevPlacement === nextPlacement) return null;
    const prev = parseBoard(prevPlacement);
    const next = parseBoard(nextPlacement);
    if (!prev || !next) return null;
    const prevParts = String(prevFen).split(' ');
    const active = prevParts[1] === 'b' ? 'b' : 'w';
    const mine = active === 'w' ? isWhitePiece : isBlackPiece;

    const diffs = [];
    for (let i = 0; i < 64; i++) {
      if (prev[i] !== next[i]) diffs.push(i);
    }
    if (diffs.length === 4) {
      const movedKings = diffs.filter((i) => prev[i].toLowerCase() === 'k' || next[i].toLowerCase() === 'k');
      if (movedKings.length >= 2) {
        if (active === 'w') {
          if (prev[4] === 'K' && next[6] === 'K') return 'e1g1';
          if (prev[4] === 'K' && next[2] === 'K') return 'e1c1';
        } else {
          if (prev[60] === 'k' && next[62] === 'k') return 'e8g8';
          if (prev[60] === 'k' && next[58] === 'k') return 'e8c8';
        }
      }
      return null;
    }

    if (diffs.length === 3) {
      const from = diffs.find((i) => mine(prev[i]) && !next[i]);
      const to = diffs.find((i) => !prev[i] && mine(next[i]));
      if (from == null || to == null) return null;
      if (prev[from].toLowerCase() !== 'p') return null;
      return squareName(from) + squareName(to);
    }

    if (diffs.length === 2) {
      let from = diffs.find((i) => mine(prev[i]) && !next[i]);
      let to = diffs.find((i) => mine(next[i]) && i !== from);
      if (from == null || to == null) {
        from = diffs.find((i) => mine(prev[i]));
        to = diffs.find((i) => i !== from);
      }
      if (from == null || to == null) return null;
      let promo = '';
      if (prev[from].toLowerCase() === 'p' && next[to].toLowerCase() !== 'p') {
        promo = next[to].toLowerCase();
      }
      return squareName(from) + squareName(to) + promo;
    }

    return null;
  }

  function updateMoveHistory(prevFen, nextFen) {
    const nextPlacement = placementOf(nextFen);
    if (!nextPlacement) return;
    if (nextPlacement === START_PLACEMENT) {
      moveHistory = [];
      return;
    }
    if (!prevFen) {
      moveHistory = [];
      return;
    }
    const move = deriveUciMove(prevFen, nextFen);
    if (move) {
      moveHistory = moveHistory.concat([move]);
    } else if (placementOf(prevFen) !== nextPlacement) {
      // Position changed but we can't reliably map it to a single move.
      moveHistory = [];
    }
  }

  function current() {
    if (!board || !board.isConnected) findBoard();
    const fen = fromBridge() || fromSiteApi() || fromDom();
    if (!fen) return null;
    const flipped = bridgeState && typeof bridgeState.flipped === 'boolean'
      ? bridgeState.flipped
      : domFlipped();
    const turn = bridgeState && bridgeState.turn ? bridgeState.turn : (fen.split(' ')[1] || null);
    const player = bridgeState && bridgeState.player ? bridgeState.player : null;
    return { fen, flipped, board, revision, turn, player, moves: moveHistory.slice(), source: fromBridge() ? 'bridge' : (fromSiteApi() ? 'api' : 'dom') };
  }

  function tick(force) {
    if (dragging && !force) return;
    const stateWithoutMoves = (() => {
      if (!board || !board.isConnected) findBoard();
      const fen = fromBridge() || fromSiteApi() || fromDom();
      if (!fen) return null;
      const flipped = bridgeState && typeof bridgeState.flipped === 'boolean'
        ? bridgeState.flipped
        : domFlipped();
      const turn = bridgeState && bridgeState.turn ? bridgeState.turn : (fen.split(' ')[1] || null);
      const player = bridgeState && bridgeState.player ? bridgeState.player : null;
      return { fen, flipped, board, revision, turn, player, source: fromBridge() ? 'bridge' : (fromSiteApi() ? 'api' : 'dom') };
    })();
    if (!stateWithoutMoves || stateWithoutMoves.fen === lastFen) return;
    updateMoveHistory(lastFen, stateWithoutMoves.fen);
    lastFen = stateWithoutMoves.fen;
    revision++;
    const state = Object.assign({}, stateWithoutMoves, { revision, moves: moveHistory.slice() });
    window.OpenTalDebug.lastState = state;
    listeners.forEach((listener) => listener(state));
  }

  let scheduled = false;
  function scheduleTick() {
    if (dragging || scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; tick(); }, 100);
  }

  function syncObserver() {
    const root = board || document.documentElement;
    if (!root || root === observedRoot) return;
    try {
      if (domObserver) domObserver.disconnect();
      domObserver = new MutationObserver(scheduleTick);
      domObserver.observe(root, { childList: true, subtree: true });
      observedRoot = root;
    } catch (error) { /* ignore */ }
  }

  window.addEventListener('pointerdown', () => { dragging = true; }, true);
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    setTimeout(() => tick(true), 40);
    setTimeout(() => tick(true), 220);
  };
  window.addEventListener('pointerup', endDrag, true);
  window.addEventListener('pointercancel', endDrag, true);

  window.OpenTalDebug = window.OpenTalDebug || { lastState: null };

  window.OpenTalBoard = {
    start(listener) {
      listeners.push(listener);
      findBoard();
      syncObserver();
      tick(true);
      setInterval(() => {
        if (!board || !board.isConnected) {
          const prev = observedRoot;
          findBoard();
          if (observedRoot !== (board || document.documentElement)) syncObserver();
          if (prev && !board) syncObserver();
        }
        syncObserver();
        tick();
      }, 400);
      window.addEventListener('resize', () => { placeOrTick(); });
      function placeOrTick() { scheduleTick(); }
    },
    current
  };
})();
