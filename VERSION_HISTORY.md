# OpenTal version history

## v1.1 "Pure Mikhail Tal Edition" — baseline (preserved)

This is the version that exists right now. It is frozen at git tag
`v1.1-baseline` (`a4e0191`) and on branch `main` (`5e5e77a`). Do not modify it
in place. All v2 work happens on branch `v2-tal-style`.

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

## Book verification

Before any engine change, `books/ph-tal2.bin` was confirmed to be built from
Tal's games. Polyglot books carry no names, so verification was statistical: 89
real Tal games and 60 Fischer games (control) were replayed, and for every
position the actual played move was looked up in both `ph-tal2.bin` and the
stock `rodent.bin`.

- Tal moves found in `ph-tal2.bin`: 95.3%, followed to an average of 26.8 plies.
- Tal moves in `rodent.bin`: 83.9%, only 10.8 plies deep.
- Fischer moves: the advantage reverses — `rodent.bin` 87.8% / 12.2 plies vs
  `ph-tal2.bin` 83.3% / 9.7 plies.

The book really is Tal's, to roughly 13 full moves deep. Full method and table
in `PH-TAL2-BOOK-VERIFICATION.md`.

## v2.0 "Tal Style Edition" — current engine

Branch `v2-tal-style`. This is the `opental` binary; v1.1 remains frozen as
`opental-v1`, on `main`, and at tag `v1.1-baseline`.

Where v1 attacked only when the attack was provably sound, v2 is built to
subordinate material to the attack and to seek chaos. Five changes:

1. **One bounded initiative score** (`eval.cpp`, `W_INITIATIVE` = 300). The old
   stack of small sacrifice bonuses is gone. A material deficit now earns back
   up to 500 cp, scaled by a saturated king-attack measure and the number of
   pieces near the enemy king, and only while the attacker still has a queen.
   The score is hard-capped, so the 1500 cp hallucinations that forced the old
   code to be deleted cannot recur.
2. **A "forest" term** (`eval.cpp`, `W_FOREST` = 140). Rewards mutual tension
   (own attacks landing on enemy pieces) and an exposed enemy king. This is the
   style fingerprint — a preference for messy, tactical positions — and is
   capped independently.
3. **Sacrifice-aware search** (`search.cpp`). Moves that drop material — giving
   away a piece, or moving a non-pawn to a square the enemy attacks — are tagged
   and exempted from futility pruning, both late-move reductions and the bad-
   capture reduction. Null-move reduction is shallower and its verification
   search is deferred, so sacrificial lines survive long enough for the attack
   to be seen. (An explicit sacrifice extension was tried and removed: it
   stacked with check/recapture extensions and blew up the tree. The pruning
   exemptions alone are enough.)
4. **No root bias on search bounds** (`search.cpp`). An earlier build added
   +4 cp for captures and +8 for checks at the root. That looked like Tal
   aggression but promoted fail-low queen grabs: a null-window search returns a
   bound, not an exact score, and the small bonus pushed a bad capture past good
   quiet moves. The bias is gone; forcing play comes from the evaluation instead.
5. **`TalRandom` option** (`uci_options.cpp`, default false). When on, the
   aggression bias is widened and a small bounded random jitter is added to root
   move selection, so the engine is not deterministic — the unpredictability
   that made Tal hard to prepare for. It is off by default for reproducibility.

The engine now identifies itself as `id name OpenTal 2.0 - Tal Style Edition`,
so the two binaries are distinguishable at the UCI handshake.

### Measured behavior

Builds cleanly; UCI handshake is clean (one `id name`, Hash 128 MB, `TalMode`
always on, new `TalRandom` toggle). In a 6-game self-play series against the
frozen v1, v2 delivered 57 checks to v1's 3 — it consistently drags the king
into the open. Results were draws/cutoffs, not wins: strength was never the
target.

Success is style — sacrifices, checks, exposed enemy kings, decisive games,
opening variety — not Elo.

### Reaudit and fixes (same day)

A full reaudit of the first v2 build found nine flaws, all fixed before this
build:

- **PV desync (high):** `aggr + jitter` could crown a move without updating the
  PV, so the TT stored a wrong `EXACT` score. PV now always tracks the chosen
  move.
- **Exposed-king mis-scale:** the shield masks have 6 usable pawn squares, not
  8, so kings were never scored as fully shielded. Corrected to 6.
- **Over-broad sacrifice tag:** `fl_sac` flagged every minor-takes-pawn,
  disabling pruning on ordinary captures. Now limited to real material drops.
- **Thread-unsafe `rand()`:** TalRandom jitter used global `rand()` across SMP
  threads. Replaced with a per-thread xorshift seeded by thread id.
- **TalMode reset TalRandom:** setting TalMode called `InitTalStyle()` which
  reset the random toggle to off. The toggle is now preserved.
- **Array bound:** `danger[att]` had no lower clamp. Now clamped to `>= 0`.
- **Initiative too generous:** 500 cp refunded a whole queen and scaled linearly
  with the deficit, rewarding bigger donations. Lowered to 300 cp, with the
  deficit factor saturating at one exchange and a requirement of at least two
  pieces near the enemy king before any initiative is paid.
- Style survives the fixes: post-fix self-play still produced ~4.75 sacs and
  ~6.5 checks per game (Tal's own games average 3.83 sacs and 3.68 checks), and
  enemy king shield was driven to 0 in every game.

## No-brainer sacrifice defect (defect 2)

The user's verdict on the corrected harness was that OpenTal still sacrificed
"like a no brainer". The root cause was not the initiative term but a search
bug in `SearchRoot()`: a small positive bias was added to each move's score at
the root (+4 cp for a capture, +8 for a check). In a null-window search a move
that fails low returns an upper bound, not an exact score, so a queen grab
whose true value was around -500 cp could come back as a bound near zero and
then be promoted by the bias.

The test position was the Tal specimen at move 15: `15...Qxb4` loses a queen to
`16.cxb4`, but OpenTal chose it. With the bias removed it plays `15...Rac8`
instead. The +8 check bias had the same flaw; removing both leaves Tal style
to the evaluation, which is where it belongs. Two bounded tuning attempts were
allowed — disabling `W_INITIATIVE` outright made style worse and was reverted,
and removing the root bias is the fix that shipped. Tuning stopped there.

The harness metric was corrected alongside the engine fix. A "true sac" is now
a capture by a bigger piece where the mover is still down at least 100 cp once
the exchange settles (up to three plies): counting only the immediate reply
made `Bxc4 Qxd1+ Rxd1` look like a queen sacrifice. This raised Tal's own
baseline from 1.33 to 1.98 sacs/game. Final corrected numbers, Stockfish 10,
depth 5, six games from Tal positions:

| Metric | Real Tal | OpenTal before | OpenTal after |
|---|---|---|---|
| true sacs/game | 1.98 | 3.17 | **2.33** |
| checks/game | 3.57 | 3.33 | **3.67** |
| sac -> check within 5 | 88% | 74% | 64% |
| attacker-liquidation | 15% | 0% | 29% |

Sacrifice frequency and check frequency now sit close to Tal's row and the
specific hanging-queen blunder is gone. The remaining gap is follow-up: sacs
still turn into checks less often than Tal's, and attacking pieces liquidate
more often. That is reported, not tuned away — the sample is six games and the
stop condition was two bounded attempts. Result column is context only.

## v1 vs v2: which one is the better Tal

`testing/TalComparisonRunner.py` plays the two binaries from the same Tal
positions and scores **both** sides with the same yardstick (the old harness
only scored v2). At depth 6:

| Match | v1 score | v2 score | v1 sacs / checks | v2 sacs / checks |
|---|---|---|---|---|
| v2 vs v1, 10 games | 4.0 | **6.0** | 2.30 / 5.80 | 2.00 / 8.60 |
| vs Stockfish 10, 6 games | 2.0 | 1.5 | 1.67 / 2.67 | 2.33 / 6.50 |
| vs AICE 0.99.2, 6 games | — | **6.0** | — | 1.83 / 5.17 |

Neither version is cleanly "more Tal": v1 is closer on check frequency and
sac-to-check ratio, v2 on sacrifice frequency and raw strength. v2 beats v1
head-to-head and crushes a weak engine, so the "random human" concern is not
real — the problem was that v2 checked far more than Tal (6.50/g vs 3.57) and
one 160-ply game produced 33 checks without converting.

Root cause was the doubled check-threat bonuses in `InitTalStyle()`:
`N_CHK` 4→8, `B_CHK` 6→12, `R_CHK` 11→22, `Q_CHK` 12→25, all feeding the king
attack score that drives both eval and check extensions. Returning them to base
values in this build cut checks against Stockfish from 6.50 to **3.33** (Tal
3.57), cut attacker-liquidation from 36% to 7% (Tal 15%), and raised the
Stockfish score from 1.5/6 to 3.0/6. The weak-engine floor still holds (4.5/6
vs AICE); the only regression is the v1 head-to-head, 6/10 → 4.5/10, which is
one game in a ten-game sample. Recorded rather than hidden.

## Why the sacs did not turn into attacks

The remaining follow-up gap was not a missing style bonus. Inspecting the
`sacs` in real games showed most were desperado captures from positions already
a rook or queen down: `Rxb2` at −210, `Rxg6` at −500, `Nxg6` at −1035,
`Rxg7+` at −1460. The one sac made from a balanced position, `Qxf1+` at +75,
produced exactly the Tal pattern: `Ra1++`, `R1a2++`.

The mechanism was in the initiative term: `deficit_factor` reached its 100%
cap at a 350cp deficit and stayed there no matter how deep the hole, so a lost
position still received the full 300cp "attack compensation" and could keep
funding pointless sacs. It now tapers past a 500cp deficit.

Twelve-game samples against Stockfish 10 at depth 5, before → after:

| Metric | Real Tal | Before | After |
|---|---|---|---|
| true sacs/game | 1.98 | 2.17 | **1.75** |
| checks/game | 3.57 | 3.50 | 2.75 |
| sac -> check within 3 | 52% | 23% | **43%** |
| sac -> check within 5 | 88% | 54% | **62%** |
| attacker-liquidation | 15% | 19% | **10%** |

The follow-up and liquidation gaps narrowed and sac frequency moved toward
Tal's row; check frequency moved away from it. That trade is recorded rather
than hidden. The weak-engine floor holds (4.5/6 vs AICE); the v1 head-to-head
went 4.5/10 → 3.5/10 in another small sample.

## The decisive specimen sacs: not a defect

The specimen's `18.Qxg6+` and `21.Rxe7+` were never reproduced. That is
intentional, not an unfinished style gap. `tal_specimen_probe.py` now prints an
objective verdict for every Tal sac (Stockfish 10, depth 14, score from the sac
side):

| Tal sac | Stockfish verdict | Post-sac score |
|---|---|---|
| 13.Bxd5 | prefers e4 | −665 |
| 16.Nxd5 | **best move** | −791 |
| 17...Rxh4 | **best move** | +839 |
| 18.Qxg6+ | prefers Qg2 | −2190 (−7086 at depth 18) |
| 20...Rxh3 | **best move** | won (mate) |
| 21.Rxe7+ | prefers f4 | lost (mate in 5) |

Three sacs are objectively best and the engine already agrees with two of them.
`13.Bxd5` costs about 85cp at depth 16 — a defensible speculative sac, but
OpenTal's `e4` is sounder. The queen sac was a blunder that happened to work
because the human resigned; forcing it would be the blind donation this engine
is explicitly not supposed to make. Raising `W_FOREST` from 140 to 180/220 was
tested as a sound alternative: it moved specimen agreement by at most one ply
and destabilised the style metrics, so it was reverted. Agreement is 17/41
plies; the remaining mismatches are sound opening choices, not missing Tal.
