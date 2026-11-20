# Verification of books/ph-tal2.bin

Date: 2026-11-20
Result: CONFIRMED — the book is built from Mikhail Tal's games.

## Method

A Polyglot book stores no player names or game metadata: only 16-byte
position/move/weight records. Verification is therefore statistical. I replayed
89 games from "The Life and Games of Mikhail Tal" (brianerdelyi/ChessPGN) and,
as a control, 60 games from Fischer's "My 60 Memorable Games". For every
position in which the player under test was to move, I computed the Polyglot
Zobrist key and looked it up in both books, then checked whether the move that
player actually played was present for that key.

## Results

| Player games | Book | Positions found | Actual move in book | Book's top move played | Avg ply depth |
|---|---|---:|---:|---:|---:|
| Tal | ph-tal2.bin | 2508 | 2391 (95.3%) | 91.5% | 26.8 |
| Tal | rodent.bin | 1046 | 878 (83.9%) | 71.3% | 10.8 |
| Fischer | ph-tal2.bin | 552 | 460 (83.3%) | 75.5% | 9.7 |
| Fischer | rodent.bin | 698 | 613 (87.8%) | 77.7% | 12.2 |

The cross-over is the proof. `ph-tal2.bin` follows Tal deep into his games
(average 26.8 plies, about 13 full moves) and reproduces 95.3% of his actual
moves, with the book's highest-weighted move being Tal's choice 91.5% of the
time. The stock `rodent.bin` follows Tal only to ply 10.8. Against Fischer the
advantage reverses: the Tal book goes shallow (9.7 plies) and the rodent book
matches Fischer's moves better (87.8% vs 83.3%). This is a Tal-specific book,
not a generic book under a new name.

## Caveats

- The Tal sample is 89 curated games from one book, which may resemble the set
  used to build `ph-tal2.bin`. Either way the underlying moves are Tal's.
- The book has 116,637 distinct positions; 66.5% of them also occur in
  `rodent.bin`, which is expected because openings are shared.
- Every `learn` field is zero — there is no embedded metadata to inspect.

## Tooling

Analysis used python-chess 1.11.2 installed only under `/tmp/opencode/chesslib`,
an isolated temporary directory. No system packages, services or daemons were
added or changed.
