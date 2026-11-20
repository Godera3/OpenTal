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

- **true sacs/game** — captures by a bigger piece where the mover's material is
  actually down at least 100cp once the opponent has replied. An earlier version
  counted every big-piece-takes-small-piece capture, so winning a free pawn with
  a queen registered as a "sacrifice"; that inflated both rows and hid the fact
  that OpenTal donates material far more often than Tal.
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

## Result (Stockfish 10, depth 5, 6 games, corrected sac definition)

| Metric | Real Tal (100 games) | OpenTal (6 games) |
|---|---|---|
| true sacs/game | 1.33 | **2.50** |
| checks/game | 3.57 | 3.33 |
| sac -> check within 3 | 59% | 47% |
| sac -> check within 5 | 98% | 67% |
| attacker-liquidation | 13% | 0% |

OpenTal loses these games — expected against an engine that never panics — but
the scoreboard is the style columns, not the result. With the corrected sac
definition it is clear the engine sacrifices almost twice as often as Tal and
the sacs generate fewer follow-up checks. That is the donation failure mode,
not Tal's intuition.

The guardrail: do not tune to change the result column. Tune only when a style
metric drifts away from Tal's row.

## Named specimen: the queen-sac game

`tal-queen-sac-vs-1800.pgn` is a Tal game against a chess.com 1800 human. It is
the sharpest style specimen in the set: Tal stacks four sacrifices, then plays
`18.Qxg6+!!`, hunts the king, and wins after `21.Rxe7+`.

`tal_specimen_probe.py` replays it and reports where OpenTal agrees with Tal at
depth 5, plus the objective engine verdict on the queen sac:

    PYTHONPATH=/tmp/opencode/chesslib python3 testing/tal_specimen_probe.py

Current result: OpenTal matches 17/41 plies. It finds the small sacrifices
(`Bxd5`, `Nxd5`, `Rxh4`, `Rxh3`) but refuses the decisive ones (`Qxg6+`,
`Rxe7+`) because its attack compensation is gated on owning a queen and capped
at 300 cp. Stockfish scores the post-sac position around -7000 cp: the sac was
objectively lost and worked only because the human resigned. That is the
style-vs-soundness tradeoff this probe exists to make visible.
