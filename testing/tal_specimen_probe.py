#!/usr/bin/env python3
"""Replay a Tal style specimen and report how closely OpenTal matches it.

This is a style check, not a strength check. It prints the engine's depth-5
choice at every ply, flags the moves where Tal sacrificed material, and gives
the objective engine verdict on the key queen sacrifice so the tradeoff between
"looks like Tal" and "is objectively sound" stays visible.

    PYTHONPATH=/tmp/opencode/chesslib python3 testing/tal_specimen_probe.py
"""

import os
import subprocess
import sys

try:
    import chess
    import chess.pgn
except ImportError:
    sys.path.insert(0, os.environ.get("CHESSLIB", "/tmp/opencode/chesslib"))
    import chess
    import chess.pgn

from TalStyleMatchRunner import measure, VAL

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECIMEN = os.path.join(ROOT, "testing", "tal-queen-sac-vs-1800.pgn")


class UCI:
    def __init__(self, path, depth, book=False):
        self.depth = depth
        self.proc = subprocess.Popen(
            [path], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1,
            cwd=os.path.dirname(path))
        self.cmd("uci")
        while True:
            if self.cmd_wait("uciok"):
                break
        self.cmd("setoption name UseBook value %s" %
                 ("true" if book else "false"))

    def cmd_wait(self, prefix):
        while True:
            line = self.proc.stdout.readline()
            if not line:
                return False
            if line.startswith(prefix):
                return True

    def cmd(self, text):
        self.proc.stdin.write(text + "\n")
        self.proc.stdin.flush()

    def ask(self, fen):
        self.cmd("position fen " + fen)
        self.cmd("go depth %d" % self.depth)
        score = pv = None
        while True:
            line = self.proc.stdout.readline()
            if line.startswith("info") and "score cp" in line and " pv " in line:
                try:
                    score = int(line.split("score cp ")[1].split()[0])
                    pv = line.split(" pv ")[1].strip()
                except (ValueError, IndexError):
                    pass
            if line.startswith("bestmove"):
                return line.split()[1], score, pv

    def close(self):
        self.cmd("quit")
        try:
            self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def material_diff(board):
    return sum(VAL[t] * (len(board.pieces(t, chess.WHITE)) -
                         len(board.pieces(t, chess.BLACK))) for t in VAL)


def main():
    with open(SPECIMEN, encoding="utf-8") as f:
        game = chess.pgn.read_game(f)
    moves = [m.uci() for m in game.mainline_moves()]

    board = chess.Board()
    played = []
    for uci in moves:
        played.append((board.fen(), uci, material_diff(board), board.turn))
        board.push_uci(uci)
    metrics = measure(chess.Board().fen(), [], moves, chess.WHITE,
                      game.headers.get("Result", "*"))

    engine = UCI(os.path.join(ROOT, "opental"), 5)
    agrees = 0
    sacs = []
    print("Tal specimen: %d plies | style: %d sacs, %d checks, "
          "min enemy shield %d" %
          (len(moves), metrics["sacs"], metrics["checks"],
           metrics["min_shield"]))
    print("\nply  side  move     mat(W-B)  OpenTal(d5)  score   agree  note")
    for i, (fen, uci, mat, turn) in enumerate(played):
        best, score, pv = engine.ask(fen)
        side = "W" if turn else "B"
        ok = best == uci
        agrees += ok
        b = chess.Board(fen)
        move = chess.Move.from_uci(uci)
        victim = b.piece_type_at(move.to_square)
        attacker = b.piece_type_at(move.from_square)
        is_sac = victim is not None and VAL[attacker] > VAL[victim] + 100
        if is_sac:
            sacs.append((i + 1, b.san(move)))
        note = "SAC" if is_sac else ""
        if side == "W" and not ok:
            note = (note + " KEY").strip()
        print("%3d  %s     %-7s %7d  %-11s %6s  %-5s  %s" %
              (i + 1, side, b.san(move), mat, best, score,
               "yes" if ok else "no", note))
    engine.close()

    print("\nAgreement with Tal: %d/%d plies (%.0f%%)" %
          (agrees, len(moves), 100.0 * agrees / len(moves)))
    print("Tal's sacrifices:", ", ".join("%d.%s" % (n, m) for n, m in sacs))

    # Objective verdict on the queen-sacrifice position (after 18...fxg6).
    qfen = played[35][0]  # ply 36 = 18...fxg6, White to move
    board = chess.Board(qfen)
    board.push_uci(played[35][1])
    post = board.fen()
    sf = os.path.expanduser(
        "~/.arena_linux/Engines/Stockfish/stockfish_10_x64_modern_official")
    if os.path.exists(sf):
        p = subprocess.Popen(
            [sf], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1,
            cwd=os.path.dirname(sf))
        p.stdin.write("uci\n")
        p.stdin.flush()
        while True:
            if p.stdout.readline().startswith("uciok"):
                break
        p.stdin.write("position fen " + post + "\n")
        p.stdin.write("go depth 18\n")
        p.stdin.flush()
        last = ""
        while True:
            line = p.stdout.readline()
            if line.startswith("info") and "score" in line:
                last = line.strip()
            if line.startswith("bestmove"):
                break
        p.stdin.write("quit\n")
        p.stdin.flush()
        p.wait(timeout=5)
        score = last.split("score cp ")[1].split()[0] if "score cp " in last else "?"
        print("\nAfter the queen sac, Stockfish depth 18: %s cp "
              "(negative = objectively lost)" % score)


if __name__ == "__main__":
    main()
