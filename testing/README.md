# Tal-style match harness

`TalStyleMatchRunner.py` plays UCI matches and measures **style**, not strength.
It uses the engines installed in Arena, driven directly through UCI — no GUI
needed — and starts games from positions taken from Tal's own games, so the
question being asked is "would Tal play like this here?", not "who won?".

## Why results are not the scoreboard

Tal's sacrifices worked partly because human defenders get rattled: the king
gets dragged into the open and they crack. Engines do not get rattled. A sacrifice
that terrifying a person is simply a lost piece against a calculation engine.
So win/loss is recorded for context, but the yardstick is the behaviour:

- **true sacs/game** — captures by a bigger piece where the mover is still down
  at least 100cp after the exchange settles (up to three more plies). Counting
  only the immediate reply made queen trades like `Bxc4 Qxd1+ Rxd1` look like
  sacrifices; counting every big-piece-takes-small-piece capture was worse still
  — winning a free pawn with a queen registered as Tal style.
- **checks/game** — moves giving check
- **sac -> check within 3/5** — whether a sacrifice actually generates an attack
  (this separates a sac from a donation)
- **attacker-liquidation** — after a sac, whether the attacking pieces are still
  near the enemy king three moves later (the "sac then trade everything off"
  failure mode)
- **min enemy shield** — how far the opponent's king cover was stripped

Every run prints the same metrics measured on 100 real Tal games, so the
comparison is apples-to-apples.

## Running

Requires `python-chess`. This machine has an isolated copy, so:

    PYTHONPATH=/tmp/opencode/chesslib python3 testing/TalStyleMatchRunner.py \
        --opponent stockfish --games 3 --depth 5 --plies 16

Options:

- `--opponent` — stockfish, arasan, toga, senpai, spike, arminius, gaviota,
  aice, alfil, k2, v1
- `--games` — games per colour (2 means 4 games total)
- `--depth` — fixed search depth in plies; 5 matches the current Arena setting
- `--plies` — which ply of the Tal games to start from (16 = move 9)
- `--out` — where PGNs are written (default `/tmp/opencode/tal-matches`)

Opponent binaries are read from `~/.arena_linux/Engines`; override with
`ARENA_ENGINES_DIR`. The reference games are `testing/tal-reference-games.pgn`.

## Result (Stockfish 10, depth 5, 12 games, three-attacker rule)

Tal's row is now measured from **the same ply** as the engine games; full-game
numbers (1.98 sacs, 3.57 checks, 9.14 captures, 2.15 storms) include phases the
probe never sees and should not be used as the target.

| Metric | Tal from ply 16 | OpenTal (12 games) |
|---|---|---|
| true sacs/game | 1.91 | 1.42 |
| checks/game | 3.53 | **4.00** |
| captures/game | 8.30 | 6.17 |
| pawn storms/game | 1.84 | **1.92** |
| forward pieces/own move | 0.82 | 1.28 |
| sac -> check within 3 | 53% | **59%** |
| sac -> check within 5 | 92% | **88%** |
| attacker-liquidation | 15% | 24% |

OpenTal usually loses these games — expected against an engine that never
panics — but the scoreboard is the style columns, not the result. The root
aggression bias (fail-low queen grabs), doubled check bonuses (check spam),
and unlimited initiative at a large deficit (desperado sacs) were fixed
earlier. The initiative term now requires three attackers near the enemy king,
which brought checks, storms and both follow-up columns to Tal's row. Sacs and
captures are low, liquidation is high, and forward pieces are high; those are
reported rather than tuned away. Capture count also depends on the opponent:
the same build makes 10.1 captures/game against v1, which does not defend like
Stockfish.

Sample sizes are small: twelve games move by a whole sac per game between
builds, so only changes that survive several levers are kept. Normalising to
*own moves* rather than games changes the picture — Tal makes 0.106 checks and
0.250 captures per own move from ply 16; OpenTal 0.107 and 0.164 — because
games have different lengths. See `VERSION_HISTORY.md` for the rejected
experiments, including four bounded sacrifice-lookahead variants in `search.cpp`
that inflated checks and are not in the current build.

The guardrail: do not tune to change the result column. Tune only when a style
metric drifts away from Tal's row.

## Named specimen: the queen-sac game

`tal-queen-sac-vs-1800.pgn` is a Tal game against a chess.com 1800 human. It is
the sharpest style specimen in the set: Tal stacks four sacrifices, then plays
`18.Qxg6+!!`, hunts the king, and wins after `21.Rxe7+`.

`tal_specimen_probe.py` replays it, reports where OpenTal agrees with Tal at
depth 5, and prints Stockfish's verdict on every Tal sac:

    PYTHONPATH=/tmp/opencode/chesslib python3 testing/tal_specimen_probe.py

Current result: OpenTal matches 17/41 plies. Stockfish calls `16.Nxd5`,
`17...Rxh4` and `20...Rxh3` best moves; it prefers a quiet move to `13.Bxd5`
and `21.Rxe7+`, and scores `18.Qxg6+` as lost (−2190 at depth 14, −7086 at depth
18). The engine agrees with two of the three sound sacs and refuses the two
lost ones. That refusal is the style-vs-soundness boundary this probe exists to
make visible, not a gap to tune away.

## Comparing the two engines

`TalComparisonRunner.py` scores **both** sides from the same Tal positions,
which is what answers "which one is more Tal":

    PYTHONPATH=/tmp/opencode/chesslib python3 testing/TalComparisonRunner.py \
        --opponent v1 --games 5 --depth 6

`--opponent` accepts any engine from the match runner; `--old-as-a` puts v1 in
v2's seat so both engines can be measured against the same stable opponent.
Latest depth-6 results: v2 scores 3.5/10 against v1 and 4.5/6 against AICE,
so the weak-engine floor holds. Earlier builds scored 6/10 and 6/6 before the
check-spam and desperado-sac fixes; those trades are recorded in
`VERSION_HISTORY.md`. Style is the scoreboard here, not the result column.
