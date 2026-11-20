# Reference: ChessAssist v30.0.2

Source: `/home/gabriel/Downloads/ChessAssist-v30.0.2.zip`, unpacked read-only
to `/tmp/opencode/ChessAssist-v30-reference/`. Nothing from the ZIP was copied
into this repository. The extension is minified and closed-source.

## What it is

- Chrome Manifest V3, `content.js` (1.98 MB, minified) injected at
  `document_start`, plus a `background.js` service worker.
- React panel UI under `assets/`, Supabase auth/entitlements, version checks,
  premium gating and network calls. None of that belongs in our tool.
- Local engine bundle: Stockfish 18 Lite, Stockfish 19, Dragon, Maia3, Torch
  (WASM), a 6 MB Polyglot `book.bin`, and an explanation engine.

## Board detection (ideas we can reuse)

`content.js` contains a board selector list:

```
chess-board, wc-chess-board, .board, cg-board, #board-single,
#board-layout-main, .round__app
```

and more specific fallbacks such as `main.round .round__app__board cg-board`,
`.round__app .cg-wrap cg-board`, `#board-layout-main .board`, `cg-board`,
`#chess_board`. It reads moves from the DOM (`readMovesFromDom`, selectors
`node, u8t, kwdb, m2, san, .move`, `.main-line-ply`, `[data-ply]`,
`.node.white-move`) and bundles chess.js to reconstruct positions. It tracks
`lastFen`, `fenBefore`, `fenAfter`, `positionRevision`, `playedMoves`,
orientation (`turn-white`/`turn-black`), and game-over selectors.

Its injected page bridge (`engines/chesscom-page-bridge.js` — deobfuscated)
shows how to reach Chess.com's own game object:

```js
const board = document.querySelector('wc-chess-board, chess-board, .board');
const game = board && board.game;          // also window.game
game.getLegalMoves();
game.move({ ...move, promotionType: 'q', animate: true, userGenerated: true });
```

We only need the read side; the `game.move(...)` autoplay path is deliberately
not used.

## Overlay (ideas we can reuse)

- Overlay roots: `chessassist-arrow-overlay-root` and
  `chessassist-lichess-arrow-overlay-root`; arrows marked with
  `data-chessassist-arrow-overlay="true"`.
- Arrow geometry: `arrowGeometries`, `getArrows`, `updateArrows`,
  `toChessArrows`, `boardSize`; the overlay is positioned from
  `getBoundingClientRect()` and re-checked with `MutationObserver`.
- Settings include `displayMoves`, `numberOfArrows`, `highlightSquares`,
  `showOpponentMove`, arrow colours and an eval-bar host
  (`[data-chessassist="eval-bar-root"]`).
- Shadow DOM is used (`chessassist-shadow-`, `#chessassist-root`) to limit
  interference with the host page.

## What we do differently

| ChessAssist v30 | OpenTal extension |
|-----------------|-------------------|
| Chrome MV3 service worker | Firefox MV2 persistent background (native messaging needs it) |
| Bundled WASM engines | Native host running the real `opental` binary |
| Supabase account, entitlements, telemetry, version lock | None; fully local |
| Premium-gated opponent move | Not in scope |
| Autoplay bridge | Not in scope |
| Engine best move after analysis | Tal-book move shown immediately from move 1, then engine search |

## Fair-play note

The product markets live assistance on Chess.com. Chess.com's Fair Play policy
bans engine help in live/rated games against humans, but explicitly exempts
games against computer bots and unrated puzzles. Our target is bot games.
Detection and overlay techniques are reused as ideas; no code was copied.
