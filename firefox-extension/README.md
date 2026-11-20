# OpenTal Firefox Analysis Extension

A Firefox WebExtension that reads the live Chess.com board, asks the local
OpenTal engine for analysis, and draws the best move and evaluation on the page.
Bot games for offline training are collected separately from Chess.com's
read-only PubAPI.

Status: **first working increment** (2026-11-20). The native bridge and
overlay code exist; the overlay needs to be loaded in Firefox and pointed at
a Chess.com bot game for a live DOM check.

## Load it

1. Register the native host: `python3 native-host/install-native-host.py --install`
2. In Firefox, open `about:debugging#/runtime/this-firefox`, choose
   **Load Temporary Add-on**, and select `source/manifest.json`.
3. Open a Chess.com bot game or unrated puzzle. The Tal-gold arrow appears as
   soon as the board is detected. The badge shows `book` for opening-book
   moves or a centipawn/mate score once the engine is searching.

Temporary add-ons are removed when Firefox closes; this is deliberate while
the project is unfinished.

## Decisions made 2026-11-20

| Question | Decision |
|----------|----------|
| First working version | Analysis overlay: best move, evaluation, arrow |
| Engine runtime | Native messaging host launching the existing `opental` binary |
| Training data | Chess.com PubAPI (read-only public REST) |

## Fair-play boundary

Chess.com's Fair Play policy (last updated 2026-03-25) says "All of your moves
must be your own" and bans tools that analyse positions during play — but it
explicitly exempts games against computer bots and unrated puzzles. The help
centre states: "Computer games and unrated puzzles … are the only exceptions
to the rules above. Since these games and puzzles are not rated or against a
real person, you are free to experiment with any tools and learn however you
choose!"

Use this extension only in bot games or unrated puzzles. It must never be
used in a live game against a human. Sources and exact wording are in
`documentation/Chess-Com-Integration.md`.

## Layout

- `documentation/` — decisions, reference-extension analysis, site integration notes
- `source/` — WebExtension code (manifest, content scripts, background, UI)
- `native-host/` — local native-messaging helper and its installer
- `training/` — PubAPI downloader and dataset builder for bot games

## Relationship to the engine

The native host starts `../opental` with the working directory set to the
OpenTal repository root: the engine resolves `books/ph-tal2.bin` relative to
its cwd and prints a `go to ...` debug line at startup. UCI options exposed by
the current binary: `Hash`, `Threads`, `MultiPV`, `Clear Hash`, `Ponder`,
`UseBook`, `VerboseBook`, `MainBookFile`, `TimeBuffer`, `TalMode`, `TalRandom`.
