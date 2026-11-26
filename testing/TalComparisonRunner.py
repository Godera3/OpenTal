#!/usr/bin/env python3
"""Play OpenTal v1 against v2 and score BOTH sides with the Tal yardstick.

TalStyleMatchRunner only measures the engine under test, which cannot answer
"which one is more Tal". This runner uses the same positions, metrics and
fixed depth for both binaries so the comparison is symmetric.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from TalStyleMatchRunner import (  # noqa: E402
    ROOT, OPPONENTS, UCIEngine, load_tal_positions, measure,
    play_game, resolve_engine, tal_baseline, write_pgn,
)

V2 = "OpenTal 2.0 (new Tal)"
V1 = "OpenTal 1.1 (old Tal)"


def blank():
    return dict(sacs=0, checks=0, captures=0, follow3=0, follow5=0,
                liquidated=0, games=0, wins=0, losses=0, draws=0,
                end_mat=0)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--opponent", choices=sorted(set(OPPONENTS) | {"v1"}),
                    default="v1", help="engine to compare against")
    ap.add_argument("--old-as-a", action="store_true",
                    help="put v1 in the seat normally used by v2")
    ap.add_argument("--games", type=int, default=3, help="games per colour")
    ap.add_argument("--depth", type=int, default=6, help="fixed search depth")
    ap.add_argument("--plies", type=int, default=16,
                    help="Tal-game ply to start positions from")
    ap.add_argument("--pgn", default=os.path.join(
        ROOT, "testing", "tal-reference-games.pgn"))
    ap.add_argument("--out", default="/tmp/opencode/tal-v1-v2")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    positions = load_tal_positions(args.pgn, args.plies, args.games * 2)
    if len(positions) < args.games * 2:
        sys.exit("not enough Tal positions at ply %d" % args.plies)

    opp_name, opp_path = OPPONENTS[args.opponent]
    opp_full = resolve_engine(opp_path)
    a_name = V1 if args.old_as_a else V2
    a_path = (os.path.join(ROOT, "opental-v1") if args.old_as_a
              else os.path.join(ROOT, "opental"))
    a_opts = ({"UseBook": "false"} if args.old_as_a
              else {"UseBook": "false", "TalRandom": "false"})
    engine_a = UCIEngine(a_path, ROOT, a_opts)
    opp = UCIEngine(opp_full, os.path.dirname(opp_full))
    base = tal_baseline(args.pgn)
    totals = {opp_name: blank(), a_name: blank()}

    print("%s vs %s | depth %d | %d games/side | ply %d"
          % (a_name, opp_name, args.depth, args.games, args.plies))
    if base:
        print("Real Tal: %.2f true sacs/g %.2f checks/g, sac->check "
              "within5=%.0f%%, liquidation=%.0f%%"
              % (base["sacs"], base["checks"],
                 100.0 * base["follow5"] / max(1, base["sacs_total"]),
                 100.0 * base["liquidated"] / max(1, base["sacs_total"])))

    for n in range(args.games * 2):
        fen, prefix, _, _ = positions[n]
        a_white = (n % 2 == 0)
        white, black = (engine_a, opp) if a_white else (opp, engine_a)
        wn, bn = (a_name, opp_name) if a_white else (opp_name, a_name)
        moves, result = play_game(white, black, fen, prefix,
                                  args.depth, 160)
        for color, name in ((True, wn), (False, bn)):
            m = measure(fen, prefix, moves, color, result)
            t = totals[name]
            t["games"] += 1
            for key in ("sacs", "checks", "captures", "follow3",
                        "follow5", "liquidated", "end_mat"):
                t[key] += m[key]
            if result == "1-0":
                t["wins" if color else "losses"] += 1
            elif result == "0-1":
                t["wins" if not color else "losses"] += 1
            else:
                t["draws"] += 1
        path = os.path.join(args.out, "game%02d_%s-vs-%s.pgn" %
                            (n + 1, "a" if a_white else "opp",
                             "opp" if a_white else "a"))
        write_pgn(path, fen, prefix, moves, result, wn, bn,
                  "%s vs %s | Tal position ply %d"
                  % (a_name, opp_name, args.plies))
        print("game %2d engineA=%s result=%s plies=%3d"
              % (n + 1, "W" if a_white else "B", result, len(moves)))

    print()
    for name in (opp_name, a_name):
        t = totals[name]
        g = t["games"]
        s = max(1, t["sacs"])
        print("%s (%d games): sacs=%.2f/g checks=%.2f/g captures=%.2f/g "
              "sac->check<=5=%.0f%% liquidation=%.0f%% endMat=%+d "
              "score=%.1f/%.1f"
              % (name, g, t["sacs"] / g, t["checks"] / g,
                 t["captures"] / g, 100.0 * t["follow5"] / s,
                 100.0 * t["liquidated"] / s, t["end_mat"] / g,
                 t["wins"] + 0.5 * t["draws"], g))
    print("PGNs: %s" % args.out)
    opp.close()
    engine_a.close()


if __name__ == "__main__":
    main()
