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

- **sacs/game** — moves giving up more material than they capture
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

## Pilot result (Stockfish 10, depth 5, 4 games)

| Metric | Real Tal (100 games) | OpenTal (4 games) |
|---|---|---|
| sacs/game | 3.87 | 3.75 |
| checks/game | 3.57 | 4.00 |
| sac -> check within 3 | 46% | 53% |
| sac -> check within 5 | 76% | 100% |
| attacker-liquidation | 10% | 0% |

OpenTal lost all four games — expected against an engine that never panics —
but it matched or beat Tal on every style measure. That is the signal to use.

The guardrail: do not tune to change the result column. Tune only when a style
metric drifts away from Tal's row.
