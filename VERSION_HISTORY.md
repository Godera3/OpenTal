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

## Phase-matched scoreboard, then the follow-up fix

The next audit found a measurement defect: the harness compared full Tal games
with engine games starting at ply 16. Tal's quiet openings and endgames were
included in his row and not in OpenTal's. `tal_baseline(pgn, plies)` now
measures Tal's own continuation from the same ply, and the harness also records
pawn storms and forward pieces (non-pawns in the enemy half, per own move).

Tal from ply 16, 100 games: 1.91 sacs/g, 3.53 checks/g, 8.30 captures/g,
1.84 storms/g, 0.82 forward pieces/own move, sac→check within 5 92%.

The remaining follow-up gap had a structural cause. `EvaluateKingAttack()`
zeroed the whole attack score when the attacker had no queen, and the
initiative term treated *one* piece near the enemy king as an attack. A sac
made with two attackers therefore stopped paying as an attack the moment the
position settled, so no follow-up was rewarded. The initiative term now needs
three attackers within distance 4 of the king. Twelve depth-5 games against
Stockfish 10, before → after:

| Metric | Tal (ply 16) | Before | After |
|---|---|---|---|
| true sacs/game | 1.91 | 1.75 | 1.42 |
| checks/game | 3.53 | 2.75 | **4.00** |
| captures/game | 8.30 | 6.58 | 6.17 |
| pawn storms/game | 1.84 | 1.17 | **1.92** |
| forward pieces/own move | 0.82 | 1.26 | 1.28 |
| sac → check within 3 | 53% | 43% | **59%** |
| sac → check within 5 | 92% | 62% | **88%** |
| attacker-liquidation | 15% | 10% | 24% |

Checks, storms and both follow-up columns now sit at Tal's row; sacs and
captures are low and liquidation is high. Against v1 at depth 6 the same build
scored 6.5/10 (previous build 3.5/10). Five repeat depth-6 matches against
AICE scored 4.0, 4.0, 4.5, 3.0 and 5.0 out of 6 (median 4.0); the earlier
4.5/6 was one sample, not a fixed floor. Specimen agreement stays 17/41.

Five rejected bounded experiments, all on the same sample: a queenless attack
at half or quarter weight sent checks to 5.67/6.08 per game; 1.25× check-threat
bonuses gave 3.75 checks/g but collapsed follow-up to 14%/36%; `W_INITIATIVE`
350 with three attackers dropped storms to 0.67/g; `W_FWD` 60 fixed forward
pieces to 1.10 but collapsed follow-up to 35%/65%; `W_FOREST` 220 on top of the
three-attacker rule cut captures to 5.42/g. `W_FWD` 90 was the closest call —
it restored sacs to 2.08/g and storms to 1.92/g but cost checks (2.92/g) and
follow-up (48%/76%) — so the three-attacker rule stands alone.

The low capture count is partly the opponent, not the engine: the same build
makes 10.1 captures/game against v1 and 6.17 against Stockfish, which does not
hang pieces the way Tal's human opponents did. It is reported, not tuned away.

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

## Bounded sacrifice lookahead: tried and rejected (2026-11-20)

Tal's sacs create an attack the static eval cannot see: 80% of them happen
with only 0–1 pieces already near the king, and 81% cost 100–500cp. Our sacs
cost 900–1000cp in 35% of cases. The hypothesis was that a bounded lookahead
past the forced reply would let search see the attack being bought. Four
variants were threaded through `Search()` with a `sac_ply` marker, all PV-only
and capped so the tree could not blow up. Sixteen depth-5 games against
Stockfish from the same Tal positions:

| Build | sacs/g | checks/g | storms/g | fwd/own | sac→check ≤3 | ≤5 |
|---|---|---|---|---|---|---|
| Tal, ply 16 | 1.91 | 3.53 | 1.84 | 0.82 | 53% | 92% |
| Baseline `c044716` | 1.31 | 3.75 | 1.81 | 1.19 | 67% | 90% |
| One ply on sac node | 1.62 | 5.12 | 1.31 | 1.08 | 58% | 73% |
| One ply on capture sacs only | 1.38 | 6.06 | 1.06 | 1.10 | 64% | 82% |

Two earlier twelve-game probes extended checking moves after a sac instead.
The first had the parity wrong and extended the *opponent's* checks: sacs
2.08/g, checks 4.75/g, storms 1.00/g, follow-up 12%/32%. Correcting it to our
own checks at +2/+4 plies gave sacs 1.67/g, checks 5.42/g, storms 1.42/g,
follow-up 45%/55%. Every form of the extension moved sacs and forward pieces
toward Tal while pushing checks far above Tal's row and cutting pawn storms.
Runtime rose from 5.8 s to 8–9 s for the same sixteen games. No variant beat
the baseline overall, so `search.cpp` and `rodent.h` were restored from
`c044716` and rebuilt.

The conclusion is structural, not a weight: extending the search amplifies
checking lines without teaching the eval what a sac *buys* (opened file,
removed defender, exposed king). The next attempt has to value those
consequences after the exchange settles; a search extension is the wrong
instrument.

## Hunt compensation: the eval values what survives (2026-11-20)

`W_HUNT` (100) pays for the attack left after a material sacrifice: at least
two of our non-pawns within distance 3 of the enemy king, at most one enemy
non-pawn within distance 2 of it, and a broken pawn shield. The score is capped
and multiplied by the same `deficit_factor` as initiative, so a large material
deficit cannot fund a desperado. Unlike initiative it does not require a queen
and does not require three attackers — that gate was what turned the
initiative term off in exactly the positions Tal sacrifices from.

Sixteen depth-5 games against Stockfish, same Tal positions:

| Metric | Tal, ply 16 | Baseline `c044716` | With `W_HUNT` |
|---|---|---|---|
| true sacs/game | 1.91 | 1.31 | **2.06** |
| checks/game | 3.53 | 3.75 | **3.88** |
| captures/game | 8.30 | 6.12 | 6.19 |
| pawn storms/game | 1.84 | 1.81 | 1.31 |
| forward pieces/own move | 0.82 | 1.19 | **1.06** |
| sac → check within 3 | 53% | 67% | **64%** |
| sac → check within 5 | 92% | 90% | **97%** |
| attacker-liquidation | 15% | 19% | **9%** |

Sacs, checks, follow-up, forward pieces and liquidation all move toward Tal.
Storms fall and captures stay low; captures remain opponent-dependent (10.1/g
against v1). Specimen agreement is unchanged at 17/41. The weak-engine floor
holds: 7.0/10 against v1 (was 6.5) and 3.5/6, 4.0/6, 5.0/6 against AICE over
three runs — the same noisy range as before.

Depth 7 still shows the known limit: 2.33 sacs, 5.58 checks, 8.58 captures,
1.33 storms, 1.46 forward pieces, follow-up 29%/39%. Checks are far above
Tal's row and follow-up is still weak, but both are much better than the old
depth-7 build (1.75 checks, 26% follow-up).

Rejected settings on the same twelve-game sample: cap 150 with two defenders
allowed gave 1.83 sacs but 6.33 checks and 50% follow-up; cap 60 gave 2.92
sacs; cap 150 with three attackers gave 1.56 forward pieces; cap 60 with one
defender gave 1.67 checks and 0.67 storms. The narrow gate (two attackers,
one defender, cap 100) was the only setting that improved both sac count and
follow-up without check spam.

One build note: `rodent.h` holds a parallel `paramNames` table, so adding an
enum without its name entry — or rebuilding only the touched `.cpp` files —
leaves mixed enum layouts and makes the search hang for 60 s. The parameter
and its name were added together and the tree was rebuilt with `make clean`.

## Depth-7 investigation: a length artifact and a local optimum (2026-11-20)

Depth 7 still looks worse per game, but part of that is game length. Sixteen
games averaged 102.5 plies at depth 7 against 77.2 at depth 5 (33% longer).
Measured per own move from ply 16 (101 Tal games):

| Rate per own move | Tal | d5 | d6 | d7 |
|---|---|---|---|---|
| sacs | 0.058 | 0.054 | 0.043 | 0.044 |
| checks | 0.106 | 0.101 | 0.094 | 0.114 |
| captures | 0.250 | 0.161 | 0.168 | 0.158 |
| pawn storms | 0.055 | 0.034 | 0.048 | 0.028 |

So depth-7 checks are 8% above Tal per move, not the 50% implied by the
per-game row (5.81 vs 3.88). The genuine depth-7 defect is follow-up: 44%/67%
versus 64%/97% at depth 5. `TalStyleMatchRunner.py` now prints both views.

Eight levers were measured and none cleared the bar; the engine stays at
`ccc99ca` with no code change:

- Moving the singular extension from `depth > 5` to `depth > 6` gave identical
  depth-7 numbers — it is not the cause.
- `W_HUNT` cap 70 at depth 7: 2.25 sacs, 4.08 checks, 2.08 storms, 37%/44%
  follow-up, 26% liquidation. Cap 50: 2.08 sacs, 3.92 checks, 28%/44%, 32%.
  Lower caps buy checks and storms back but destroy follow-up.
- Tapering the raw king-attack bonus by material deficit (start 400, /8): at
  depth 7, 2.75 sacs, 5.33 checks, 8.92 captures, 2.00 storms, 39%/55%. A
  harsher taper (start 250, /6) gave 2.00 sacs, 5.50 checks, 8.08 captures,
  1.67 storms, 38%/62% at depth 7 but regressed depth 5 to 1.75 sacs, 5.88
  checks, 1.19 storms, 1.37 forward pieces. The diagnosis — deeper search
  finds more checks in dead positions (49 of 93 depth-7 checks come after ply
  50) — held, but taxing the attack bonus cannot fix it without hurting real
  sac lines.
- `W_STORM` 350: 1.69 sacs, 5.50 checks, 1.19 storms — the storms column
  moved the wrong way.
- `W_FWD` 90: 2.67 sacs, 5.50 checks, 8.33 captures, 0.94 forward pieces,
  28%/50% follow-up. `W_FWD` 60: 1.58 sacs, 4.00 checks, 1.83 storms, 16%
  liquidation but 1.19 forward pieces and 58%/89% follow-up.
- Gating `W_HUNT` on a check threat (`e->att >= 12`): 1.83 sacs but 6.83
  checks — the gate funds checks everywhere, not just after sacs.
- `W_FOREST` 200: 2.33 sacs, 4.42 checks, 6.75 captures, 1.67 storms, 14%
  liquidation, but follow-up fell to 54%/75%.

Every volume lever raises sacs/captures/storms while collapsing follow-up;
every follow-up lever suppresses volume. With twelve games moving a whole sac
per game between builds, none of these single-lever results is strong enough
to replace the W_HUNT build. The remaining ~18% is not a missing idea but a
ceiling: Tal's sacs were selected for their follow-up, and the engine has no
cheap way to select for that without paying for it in check volume.

## Storms and captures: opponent-driven, and another budget trade (2026-11-20)

The two weak supporting columns were attacked next. Tal from ply 16 makes
8.32 captures and 1.84 storms per game; the engine makes 6.19 and 1.31.

The capture gap is mostly the opponent. Stockfish makes 11.75 captures per
game against OpenTal, while Tal's real opponents made only 7.89 against him —
the engine is on the receiving end of material grabs, so its own capture count
cannot match Tal's without a different opponent. OpenTal recaptures 17% of
those captures against Tal's 31%, but zeroing `W_INITIATIVE` and `W_HUNT`
left the recapture rate at 16% and *lowered* captures to 5.58: the
deficit-based bonuses are not what makes it decline recaptures.

The storm term already pays the maximum: `P_ST_3` and `P_ST_4` are clamped at
−50 and `W_STORM` is 250, so raising the weight to 350 made storms fall to
1.19. A new bounded term that paid for our own advanced pawns only while a
hunt was on gave the one consistent capture gain found — two independent
position sets (ply 16 and ply 18): captures 6.19 → 6.75 and 6.56 → 7.44 —
but sacs fell 2.06 → 1.62 and 1.88 → 1.69, while storms and follow-up moved
in opposite directions between the two sets. Adding `W_HUNT` 130 to restore
the sacs collapsed follow-up to 21%/32%. The term was reverted.

So the pattern from the depth-7 investigation repeats: the only lever that
raises captures takes sacs away. No engine change was kept; code remains at
`ccc99ca`.
