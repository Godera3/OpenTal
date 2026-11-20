#!/usr/bin/env python3
"""Native messaging bridge between the Firefox extension and OpenTal UCI."""

import json
import os
import queue
import re
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

HOST_NAME = "com.opental.analysis"
EXTENSION_ID = "opental@local"
ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "opental"
MAX_MOVES = 500
MIN_MOVETIME = 50
MAX_MOVETIME = 10000

SCORE_RE = re.compile(r"\bscore\s+(cp|mate)\s+(-?\d+)")
PV_RE = re.compile(r"\bpv\s+(.*)$")
MULTIPV_RE = re.compile(r"\bmultipv\s+(\d+)")

out_lock = threading.Lock()


def send(msg):
    data = json.dumps(msg, separators=(",", ":")).encode("utf-8")
    with out_lock:
        sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
        sys.stdout.buffer.flush()


def recv():
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    length = struct.unpack("<I", header)[0]
    if length > 1024 * 1024:
        raise ValueError("native message too large")
    payload = sys.stdin.buffer.read(length)
    if len(payload) != length:
        return None
    return json.loads(payload.decode("utf-8"))


def clean_token(value, label):
    if not isinstance(value, str) or "\n" in value or "\r" in value:
        raise ValueError("invalid " + label)
    return value


class EngineBridge:
    def __init__(self):
        if not ENGINE.is_file():
            raise RuntimeError("OpenTal binary not found: " + str(ENGINE))
        self.proc = subprocess.Popen(
            [str(ENGINE)],
            cwd=str(ROOT),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self.stdin_lock = threading.Lock()
        self.generation = 0
        self.requests = queue.Queue()
        self.name = self._handshake()
        threading.Thread(target=self._search_loop, daemon=True).start()

    def _uci(self, command):
        with self.stdin_lock:
            if self.proc.stdin.closed:
                raise RuntimeError("OpenTal stdin closed")
            self.proc.stdin.write(command + "\n")
            self.proc.stdin.flush()

    def _handshake(self):
        self._uci("uci")
        name = None
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("OpenTal exited during UCI handshake")
            line = line.strip()
            if line.startswith("id name "):
                name = line[8:]
            if line == "uciok":
                break
        self._uci("setoption name MultiPV value 3")
        self._uci("isready")
        while self.proc.stdout.readline().strip() != "readyok":
            pass
        return name or "unknown"

    def stop(self):
        with self.stdin_lock:
            if not self.proc.stdin.closed:
                self.proc.stdin.write("stop\n")
                self.proc.stdin.flush()

    def analyse(self, msg):
        fen = clean_token(msg.get("fen", "startpos"), "fen")
        moves = msg.get("moves", [])
        if not isinstance(moves, list) or len(moves) > MAX_MOVES:
            raise ValueError("invalid move list")
        moves = [clean_token(m, "move") for m in moves]
        movetime = int(msg.get("movetime", 1000))
        movetime = max(MIN_MOVETIME, min(MAX_MOVETIME, movetime))

        position = "position startpos" if fen == "startpos" else "position fen " + fen
        if moves:
            position += " moves " + " ".join(moves)

        self.generation += 1
        self.stop()
        self.requests.put((self.generation, msg.get("id"), position, movetime))

    def _search_loop(self):
        while True:
            gen, msg_id, position, movetime = self.requests.get()
            if gen != self.generation:
                continue
            try:
                self._uci("ucinewgame")
                self._uci(position)
                self._uci("isready")
                while self.proc.stdout.readline().strip() != "readyok":
                    pass
                self._uci("go movetime " + str(movetime))
                lines = self._collect(gen, movetime)
                if gen != self.generation:
                    continue
                send(self._result(msg_id, lines))
            except Exception as exc:
                if gen == self.generation:
                    send({"type": "error", "id": msg_id, "message": str(exc)})

    def _collect(self, gen, movetime):
        found = {}
        best = None
        deadline = time.monotonic() + movetime / 1000 + 5
        while best is None and time.monotonic() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                break
            line = line.strip()
            if line.startswith("info ") and " score " in line:
                index = int((MULTIPV_RE.search(line) or [None, "1"])[1])
                score = SCORE_RE.search(line)
                pv = PV_RE.search(line)
                if score and pv:
                    found[index] = {
                        "move": pv.group(2).split()[0],
                        "pv": pv.group(2).split(),
                        "score": int(score.group(2)) if score.group(1) == "cp" else None,
                        "mate": int(score.group(2)) if score.group(1) == "mate" else None,
                    }
            elif line.startswith("bestmove "):
                best = line.split()[1]
        if best is None:
            self.stop()
        return found, best

    def _result(self, msg_id, collected):
        found, best = collected
        top = found.get(1, {})
        return {
            "type": "analysis",
            "id": msg_id,
            "bestmove": best,
            "score": top.get("score"),
            "mate": top.get("mate"),
            "depth": top.get("depth"),
            "lines": [found[k] for k in sorted(found) if k <= 3],
        }


def main():
    bridge = EngineBridge()
    send({"type": "ready", "engine": bridge.name, "host": HOST_NAME})
    while True:
        try:
            msg = recv()
        except (ValueError, json.JSONDecodeError) as exc:
            send({"type": "error", "message": "bad native message: " + str(exc)})
            continue
        if msg is None:
            break
        kind = msg.get("type")
        try:
            if kind == "ping":
                send({"type": "pong", "engine": bridge.name})
            elif kind == "analyse":
                bridge.analyse(msg)
            elif kind == "stop":
                bridge.stop()
            elif kind == "quit":
                break
            else:
                send({"type": "error", "id": msg.get("id"), "message": "unknown type"})
        except (ValueError, TypeError) as exc:
            send({"type": "error", "id": msg.get("id"), "message": str(exc)})


if __name__ == "__main__":
    main()
