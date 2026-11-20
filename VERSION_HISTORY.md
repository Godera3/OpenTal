# OpenTal version history

## v1.1 "Pure Mikhail Tal Edition" — baseline (preserved)

This is the version that exists right now. It is frozen at git tag
`v1.1-baseline` and on branch `main` at commit `03c77a6`. Do not modify it in
place. All v2 work happens on branch `v2-tal-style`.

### What it is

Rodent (Pawel Koziol, 2011-2017), itself derived from Sungorus 1.4 (Pablo
Vazquez, 2009-2011), retuned toward attacking chess. C++14, UCI, built with
`-O3 -march=native -DUSE_THREADS`. GPLv3.

### How the Tal style is implemented

- `cParam::InitTalStyle()` (`sources/src/params.cpp:836`) overrides the base
  weights: king-attack and check bonuses roughly doubled, king tropism doubled,
  `W_OWN_ATT` 350 vs `W_OPP_ATT` 100, `W_THREATS` 250, `W_STORM` 250, own pawn
  shield neutralized, rook activity parameters maxed, forward-piece weight
  `W_FWD` 120, and `hist_perc` 300 / `hist_limit` 40000 so risky moves are still
  considered. `InitTables()` steepens the king-danger curve.
- `sources/src/eval.cpp:708-740`: the only surviving sacrifice logic is a bonus
  capped at 100 cp, a 25 cp exchange-sacrifice nudge, and small per-piece and
  proportional attack bonuses. The larger signature Tal bonuses were removed in
  commits `201a8bb` and `63d7519` because unbounded stacking produced
  hallucinated evaluations.
- `sources/src/search.cpp`: standard pruning is fully active — futility at depth
  6, LMR table, standard null-move reduction, check extension in PV nodes or at
  depth < 12, recapture extension. Sacrifices get pruned like any other
  quiet-looking move.
- `sources/src/uci.cpp:281-301`: up to 2.5x thinking time in high-attack positions.
- `sources/src/main.cpp`: fixes the book to `ph-tal2.bin`, enables ponder and the
  book.

### Measured behavior

Builds cleanly. The `uci` handshake is clean: one `id name`, Hash default 128 MB,
128 MB actually allocated. `go depth 5` from the start position plays `e2e4`.

### Deliberate limits

This version attacks only when the attack is provably sound. It does not seek
material imbalance for its own sake and it does not deliberately enter chaotic
positions. Those are the traits v2 is meant to add. Strength is not the goal.

## v2 "Tal style" — planned, not started

Work happens on branch `v2-tal-style`, and begins only after `books/ph-tal2.bin`
is verified to contain Mikhail Tal's games.

Order of work:

1. Verify the opening book is genuinely Tal's games.
2. Replace the scattered sacrifice bonuses with one bounded "initiative" score,
   so material can be subordinated to attack without hallucinated evaluations.
3. Make search sacrifice-aware: exempt sacrifice moves from futility, LMR and
   null-move pruning so the attack lines actually get searched.
4. Add a complexity / "forest" term that seeks messy, tactical positions.
5. Add an unpredictability option: prefer attacking moves among near-equal best
   moves.

Success is measured by style — sacrifices, checks, exposed enemy kings, decisive
games and opening variety — not by Elo.
