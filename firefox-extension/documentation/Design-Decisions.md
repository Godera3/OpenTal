# Design decisions

## Scope of version 1

Build an analysis overlay, not a passive logger and not an autoplayer. The
extension detects the Chess.com board, sends the position to OpenTal, and
renders the engine's best move, score and arrow on the page. The player still
makes every move.

**Added 2026-11-20:** the Tal move must light up on the board **from the very
beginning of the game**, not only after the first search. OpenTal's internal
`ph-tal2.bin` book answers `position startpos` and early positions instantly
(`go movetime 1000` returned `bestmove e2e4` / `g1f3` in 0.00 s), so the
overlay can show a Tal move at move 1 and hand over to search once the book
runs out. Everything else (eval bar, multiple arrows, opponent move, puzzle
support) comes later.

The reference product is the closed-source "Chess Assist" extension by
banerus.com (Chrome Web Store ID `ngfdpjedacdodgknkkcdmfojnfmgaoib`). Its
unpacked v30.0.2 source was supplied locally and analysed without copying code
into this repository; see `Reference-ChessAssist-v30.md`. An MIT-licensed
open-source extension, `Gnomee1337/chess-assistant`, is a secondary
architectural template; it is not the product the user pointed at.

## Engine boundary

Firefox WebExtensions cannot execute the native `opental` ELF directly. The
chosen bridge is a native messaging host:

```
content script (chess.com DOM)
    -> background script (extension)
    -> native host (Python, stdin/stdout JSON lines)
    -> OpenTal process (UCI over stdin/stdout)
    -> same path back
```

Rationale: no Emscripten is installed, a WASM port would need real work for
threads and book-file I/O, and the native host keeps full engine strength and
the existing opening book. The cost is a one-time helper registration on this
machine.

The host must launch the engine with cwd = OpenTal repository root. Engine
identity for verification: `id name OpenTal 2.0 - Tal Style Edition`, author
line `Pawel Koziol (Rodent), Pablo Vazquez (Sungorus 1.4), Gabriel (OpenTal
Tal-style edition)`.

## Data boundary

Bot-game data comes from Chess.com's public read-only REST API. The extension
does not scrape private data and does not send moves to Chess.com. Downloaded
PGNs stay on disk under `training/` and are used to tune and test OpenTal
offline.

## Fair-play boundary

Corrected 2026-11-20 after reading the actual policy: Chess.com's Fair Play
rules explicitly exempt games against computer bots and unrated puzzles.
"Computer games and unrated puzzles … are the only exceptions to the rules
above … you are free to experiment with any tools and learn however you
choose!" (help centre article 8583921). The tool is therefore intended for
bot games only. Live or rated games against humans are out of scope and must
never be assisted. It stays local: no distribution, no autoplay, no accounts.
