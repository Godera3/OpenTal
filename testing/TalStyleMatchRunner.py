#!/usr/bin/env python3
"""Play UCI matches and measure Tal-style behaviour, not strength.

Results are style metrics (sacrifices, checks, king exposure, follow-up
attacks). Win/loss is recorded but never used to judge the engine.

Requires python-chess. If it is not installed system-wide, set CHESSLIB to
the directory containing the `chess` package.
"""

import argparse
import os
import random
import subprocess
import sys
import time

try:
    import chess
except ImportError:
    lib = os.environ.get("CHESSLIB", "/tmp/opencode/chesslib")
    if os.path.isdir(os.path.join(lib, "chess")):
        sys.path.insert(0, lib)
        import chess
    else:
        sys.exit("python-chess not found; set CHESSLIB to its parent directory")

import chess.pgn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARENA = os.environ.get("ARENA_ENGINES_DIR",
                       os.path.expanduser("~/.arena_linux/Engines"))

# Engine paths are relative to the Arena engines folder.
OPPONENTS = {
    "stockfish": ("Stockfish 10", "Stockfish/stockfish_10_x64_modern_official"),
    "arasan": ("Arasan 21.4", "Arasan/arasanx-21.4-64-popcnt"),
    "toga": ("Toga II 4.01", "TogaII/togaii-4.0.1-x86-64-corei7-flto"),
    "senpai": ("Senpai 2.0", "Senpai/senpai-2.0-popcnt-clang"),
    "spike": ("Spike 1.2", "Spike/spike_1.2"),
    "arminius": ("Arminius 2017", "Arminius/Arminius_2017-01-01-modern_64"),
    "gaviota": ("Gaviota 1.0", "Gaviota/gaviota-1.0-linux64"),
    "aice": ("AICE 0.99.2", "Aice/aice_0922"),
    "alfil": ("Alfil 12 MT", "Alfil/Alfil"),
    "k2": ("K2 v.087", "K2/k2_v.087_64"),
    "v1": ("OpenTal v1 baseline", os.path.join(ROOT, "opental-v1")),
}

VAL = {chess.PAWN: 100, chess.KNIGHT: 325, chess.BISHOP: 335,
       chess.ROOK: 500, chess.QUEEN: 975, chess.KING: 0}


class UCIEngine:
    def __init__(self, path, cwd, options=None):
        self.proc = subprocess.Popen(
            [path], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1, cwd=cwd)
        self.cmd("uci")
        while True:
            line = self.proc.stdout.readline()
            if not line or line.startswith("uciok"):
                break
        for key, value in (options or {}).items():
            self.cmd("setoption name %s value %s" % (key, value))
        self.cmd("isready")
        while True:
            line = self.proc.stdout.readline()
            if line.startswith("readyok"):
                break

    def cmd(self, text):
        self.proc.stdin.write(text + "\n")
        self.proc.stdin.flush()

    def bestmove(self, fen, moves, depth):
        if fen:
            self.cmd("position fen %s moves %s" % (fen, " ".join(moves)))
        else:
            self.cmd("position startpos moves %s" % " ".join(moves))
        self.cmd("go depth %d" % depth)
        while True:
            line = self.proc.stdout.readline()
            if line.startswith("bestmove"):
                return line.split()[1]

    def close(self):
        self.cmd("quit")
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def load_tal_positions(pgn_path, plies, max_games):
    """Take positions from real Tal games: the style we actually want."""
    positions = []
    with open(pgn_path, encoding="utf-8", errors="replace") as f:
        while len(positions) < max_games:
            game = chess.pgn.read_game(f)
            if game is None:
                break
            white = game.headers.get("White", "")
            black = game.headers.get("Black", "")
            if "Tal" not in white and "Tal" not in black:
                continue
            board = game.board()
            history = []
            for move in game.mainline_moves():
                if len(history) == plies:
                    # The FEN is already after `plies` moves, so the engine
                    # must not replay the prefix as well.
                    positions.append((board.fen(), [],
                                      white[:24], black[:24]))
                    break
                history.append(move.uci())
                board.push(move)
    return positions


def play_game(white, black, start_fen, prefix, depth, max_plies):
    board = chess.Board(start_fen)
    for uci in prefix:
        board.push_uci(uci)
    moves = []
    while len(moves) < max_plies and not board.is_game_over(claim_draw=True):
        engine = white if board.turn == chess.WHITE else black
        uci = engine.bestmove(start_fen, prefix + moves, depth)
        if chess.Move.from_uci(uci) not in board.legal_moves:
            break
        board.push_uci(uci)
        moves.append(uci)
    return moves, board.result(claim_draw=True)


def material(board, color):
    return sum(VAL[t] * len(board.pieces(t, color)) for t in VAL)


def advanced_pieces(board, color):
    """Non-pawns that have crossed into the enemy half of the board."""
    for pt in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN):
        for sq in board.pieces(pt, color):
            rank = chess.square_rank(sq)
            if (rank if color else 7 - rank) >= 4:
                yield sq


def measure(fen, prefix, moves, color, result):
    """Style metrics from `color`'s point of view, ignoring the result."""
    board = chess.Board(fen)
    for uci in prefix:
        board.push(uci)
    start = board.copy()
    op = not color
    sacs = checks = captures = storms = 0
    fwd_sum = fwd_moves = 0
    follow3 = follow5 = 0
    liquidated = 0
    min_shield = 6
    own_after_sac = 0

    for i, uci in enumerate(moves):
        move = chess.Move.from_uci(uci)
        if board.turn == color:
            victim = board.piece_type_at(move.to_square)
            attacker = board.piece_type_at(move.from_square)
            if victim is not None:
                captures += 1
            mat_before = material(board, color)
            if board.piece_type_at(move.from_square) == chess.PAWN:
                rank = chess.square_rank(move.to_square)
                rel = rank if color else 7 - rank
                if (rel >= 4 and abs(chess.square_file(move.to_square) -
                                     chess.square_file(board.king(not color))) <= 2):
                    storms += 1
            board.push(move)
            fwd_sum += sum(1 for _ in advanced_pieces(board, color))
            fwd_moves += 1
            if board.is_check():
                checks += 1

            # A capture by a bigger piece is only a sacrifice if the material
            # is still gone after the exchange sequence settles. Stopping at
            # the opponent's reply counts Qxd1+ Rxd1 as a queen sacrifice.
            if victim is not None and VAL[attacker] > VAL[victim] + 100:
                pushed = 0
                for j in range(i + 1, min(i + 4, len(moves))):
                    board.push(chess.Move.from_uci(moves[j]))
                    pushed += 1
                net = material(board, color) - mat_before
                for _ in range(pushed):
                    board.pop()

                if net <= -100:
                    sacs += 1
                    own_after_sac = sum(
                        1 for sq in board.pieces(chess.KNIGHT, color)
                        | board.pieces(chess.BISHOP, color)
                        | board.pieces(chess.ROOK, color)
                        | board.pieces(chess.QUEEN, color)
                        if chess.square_distance(sq, board.king(not color)) < 4)
                    # Follow-up pressure is what separates a sac from a
                    # donation: checks soon after, attackers still near later.
                    tmp = chess.Board(board.fen())
                    own = 0
                    for later in moves[i + 1:]:
                        lm = chess.Move.from_uci(later)
                        if lm not in tmp.legal_moves:
                            break
                        if tmp.turn == color:
                            own += 1
                            tmp.push(lm)
                            if tmp.is_check():
                                if own <= 3:
                                    follow3 += 1
                                if own <= 5:
                                    follow5 += 1
                            if own == 3:
                                nearby = sum(
                                    1 for sq in tmp.pieces(chess.KNIGHT, color)
                                    | tmp.pieces(chess.BISHOP, color)
                                    | tmp.pieces(chess.ROOK, color)
                                    | tmp.pieces(chess.QUEEN, color)
                                    if chess.square_distance(
                                        sq, tmp.king(not color)) < 4)
                                if nearby < 2 and own_after_sac >= 2:
                                    liquidated += 1
                        else:
                            tmp.push(lm)
        else:
            board.push(move)

        op = not color
        shield = sum(1 for sq in chess.SQUARES
                     if board.piece_type_at(sq) == chess.PAWN
                     and board.color_at(sq) == op
                     and chess.square_rank(sq) in (1, 6)
                     and chess.square_file(sq) in (2, 3, 4, 5))
        min_shield = min(min_shield, shield)

    end_mat = material(board, color) - material(board, op)
    start_mat = material(start, color) - material(start, op)
    return dict(sacs=sacs, checks=checks, captures=captures,
                storms=storms, fwd_sum=fwd_sum, fwd_moves=fwd_moves,
                follow3=follow3, follow5=follow5,
                liquidated=liquidated, min_shield=min_shield,
                end_mat=end_mat, start_mat=start_mat,
                result=result)


def write_pgn(path, fen, prefix, moves, result, white_name, black_name, event):
    game = chess.pgn.Game()
    game.headers["Event"] = event
    game.headers["White"] = white_name
    game.headers["Black"] = black_name
    game.headers["Result"] = result
    game.headers["SetUp"] = "1"
    game.headers["FEN"] = fen
    board = chess.Board(fen)
    node = game
    for uci in prefix + moves:
        move = chess.Move.from_uci(uci)
        node = node.add_variation(move)
        board.push(move)
    with open(path, "w", encoding="utf-8") as f:
        f.write(str(game) + "\n\n")


def tal_baseline(pgn_path, plies=None):
    """Measure real Tal with the same yardstick.

    With `plies` set, only the segment after that ply is measured. The engine
    probes start at ply 16, so full-game numbers include quiet openings and
    endgames the engine never sees; the segment row is the fair comparison.
    """
    totals = dict(sacs=0, checks=0, captures=0, storms=0, fwd_sum=0,
                  fwd_moves=0, follow3=0, follow5=0, liquidated=0, games=0)
    with open(pgn_path, encoding="utf-8", errors="replace") as f:
        while True:
            game = chess.pgn.read_game(f)
            if game is None:
                break
            w = game.headers.get("White", "")
            b = game.headers.get("Black", "")
            if "Tal" not in w and "Tal" not in b:
                continue
            color = chess.WHITE if "Tal" in w else chess.BLACK
            full = [m.uci() for m in game.mainline_moves()]
            board = game.board()
            if plies is not None:
                for uci in full[:plies]:
                    board.push_uci(uci)
                moves = full[plies:]
            else:
                moves = full
            if not moves:
                continue
            m = measure(board.fen(), [], moves, color,
                        game.headers.get("Result", "*"))
            for key in totals:
                if key in m:
                    totals[key] += m[key]
            totals["games"] += 1
    n = totals["games"]
    if not n:
        return None
    base = dict(totals)
    for key in ("sacs", "checks", "captures", "storms"):
        base[key] = totals[key] / n
    base["fwd"] = totals["fwd_sum"] / max(1, totals["fwd_moves"])
    base["sacs_total"] = totals["sacs"]
    return base


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--opponent", choices=OPPONENTS, default="stockfish")
    ap.add_argument("--games", type=int, default=2, help="games per colour")
    ap.add_argument("--depth", type=int, default=5, help="fixed search depth")
    ap.add_argument("--plies", type=int, default=16,
                    help="Tal-game ply to start positions from")
    ap.add_argument("--pgn", default=os.path.join(ROOT, "testing",
                                                  "tal-reference-games.pgn"))
    ap.add_argument("--out", default="/tmp/opencode/tal-matches")
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args()

    random.seed(args.seed)
    os.makedirs(args.out, exist_ok=True)
    positions = load_tal_positions(args.pgn, args.plies, args.games * 2)
    if len(positions) < args.games * 2:
        sys.exit("not enough Tal positions at ply %d" % args.plies)

    opp_name, opp_path = OPPONENTS[args.opponent]
    opp_full = opp_path if os.path.isabs(opp_path) else os.path.join(ARENA, opp_path)
    tal = UCIEngine(os.path.join(ROOT, "opental"), ROOT,
                    {"UseBook": "false", "TalRandom": "false"})
    opp = UCIEngine(opp_full, os.path.dirname(opp_full))

    print("OpenTal 2.0 vs %s | depth %d | %d games/side | Tal positions at ply %d"
          % (opp_name, args.depth, args.games, args.plies))
    baseline = tal_baseline(args.pgn)
    segment = tal_baseline(args.pgn, args.plies)
    if baseline:
        print("Tal full games: %.2f true sacs/g %.2f checks/g "
              "%.2f captures/g %.2f storms/g %.2f fwd/own move"
              % (baseline["sacs"], baseline["checks"], baseline["captures"],
                 baseline["storms"], baseline["fwd"]))
    if segment:
        print("Tal from ply %d (phase-matched): %.2f true sacs/g %.2f checks/g "
              "%.2f captures/g %.2f storms/g %.2f fwd/own move, "
              "sac->check within5=%.0f%%"
              % (args.plies, segment["sacs"], segment["checks"],
                 segment["captures"], segment["storms"], segment["fwd"],
                 100.0 * segment["follow5"] / max(1, segment["sacs_total"])))

    totals = dict(sacs=0, checks=0, captures=0, storms=0, fwd_sum=0,
                  fwd_moves=0, follow3=0, follow5=0, liquidated=0, games=0)
    for n in range(args.games * 2):
        fen, prefix, wname, bname = positions[n]
        tal_white = (n % 2 == 0)
        white, black = (tal, opp) if tal_white else (opp, tal)
        wn = "OpenTal 2.0" if tal_white else opp_name
        bn = opp_name if tal_white else "OpenTal 2.0"
        moves, result = play_game(white, black, fen, prefix, args.depth, 160)
        colour = chess.WHITE if tal_white else chess.BLACK
        m = measure(fen, prefix, moves, colour, result)
        totals["games"] += 1
        for key in totals:
            if key in m:
                totals[key] += m[key]
        path = os.path.join(args.out, "game%02d_%s.pgn" %
                            (n + 1, "tal-white" if tal_white else "tal-black"))
        write_pgn(path, fen, prefix, moves, result, wn, bn,
                  "Tal-style probe vs %s" % opp_name)
        print("game %2d %-10s result=%s plies=%3d sacs=%d checks=%d "
              "follow3=%d shield=%d endMat=%+d"
              % (n + 1, "W" if tal_white else "B", result, len(moves),
                 m["sacs"], m["checks"], m["follow3"],
                 m["min_shield"], m["end_mat"]))

    g = totals["games"]
    print("\nOpenTal (%d games): true sacs=%.2f/g checks=%.2f/g captures=%.2f/g "
          "storms=%.2f/g fwd=%.2f/own move, sac->check within3=%.0f%% "
          "within5=%.0f%%, attacker-liquidation=%.0f%%" %
          (g, totals["sacs"] / g, totals["checks"] / g,
           totals["captures"] / g, totals["storms"] / g,
           totals["fwd_sum"] / max(1, totals["fwd_moves"]),
           100.0 * totals["follow3"] / max(1, totals["sacs"]),
           100.0 * totals["follow5"] / max(1, totals["sacs"]),
           100.0 * totals["liquidated"] / max(1, totals["sacs"])))
    print("Result is reported but NOT used to judge the engine - engines do "
          "not get rattled by sacrifices the way people do.")
    print("PGNs: %s" % args.out)
    tal.close()
    opp.close()


if __name__ == "__main__":
    main()
