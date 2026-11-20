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
MIN_DEPTH = 1
MAX_DEPTH = 30

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


BOOL_OPTIONS = {"UseBook", "VerboseBook", "Ponder", "TalMode", "TalRandom"}
SPIN_OPTIONS = {
    "Hash": (1, 4096),
    "Threads": (1, 8),
    "MultiPV": (1, 12),
}


def parse_option(name, value):
    if name in BOOL_OPTIONS:
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, str) and value.lower() in {"true", "false"}:
            return value.lower()
        raise ValueError("invalid bool for " + name)
    if name in SPIN_OPTIONS:
        low, high = SPIN_OPTIONS[name]
        number = int(value)
        if number < low or number > high:
            raise ValueError(name + " out of range")
        return str(number)
    raise ValueError("unknown option: " + name)


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
        self.movetime = 250
        self.depth = 12
        self.search_mode = "time"
        self.configured = {}
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
        self._apply_options({"MultiPV": 1})
        self._uci("isready")
        while self.proc.stdout.readline().strip() != "readyok":
            pass
        return name or "unknown"

    def _apply_options(self, options):
        for name, value in options.items():
            parsed = parse_option(name, value)
            self._uci("setoption name " + name + " value " + parsed)
            self.configured[name] = value

    def configure(self, msg):
        options = msg.get("options", {})
        if options is None:
            options = {}
        if not isinstance(options, dict):
            raise ValueError("invalid options")
        movetime = msg.get("movetime", self.movetime)
        movetime = max(MIN_MOVETIME, min(MAX_MOVETIME, int(movetime)))
        depth = msg.get("depth", self.depth)
        depth = max(MIN_DEPTH, min(MAX_DEPTH, int(depth)))
        search_mode = msg.get("searchMode", self.search_mode)
        if search_mode not in ("time", "depth"):
            search_mode = self.search_mode
        self.generation += 1
        self.stop()
        self._apply_options(options)
        self.movetime = movetime
        self.depth = depth
        self.search_mode = search_mode
        self._uci("isready")
        while self.proc.stdout.readline().strip() != "readyok":
            pass
        return {
            "type": "configured",
            "options": self.configured,
            "movetime": self.movetime,
            "depth": self.depth,
            "searchMode": self.search_mode,
            "engine": self.name,
        }

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
        movetime = int(msg.get("movetime", self.movetime))
        movetime = max(MIN_MOVETIME, min(MAX_MOVETIME, movetime))
        depth = int(msg.get("depth", self.depth))
        depth = max(MIN_DEPTH, min(MAX_DEPTH, depth))
        search_mode = msg.get("searchMode", self.search_mode)
        if search_mode not in ("time", "depth"):
            search_mode = self.search_mode

        position = "position startpos" if fen == "startpos" else "position fen " + fen
        if moves:
            position += " moves " + " ".join(moves)

        self.generation += 1
        self.stop()
        self.requests.put((self.generation, msg.get("id"), position, search_mode, movetime, depth))

    def _search_loop(self):
        while True:
            gen, msg_id, position, search_mode, movetime, depth = self.requests.get()
            if gen != self.generation:
                continue
            try:
                self._uci("ucinewgame")
                self._uci(position)
                self._uci("isready")
                while self.proc.stdout.readline().strip() != "readyok":
                    pass
                if search_mode == "depth":
                    self._uci("go depth " + str(depth))
                    lines = self._collect(gen, "depth", depth)
                else:
                    self._uci("go movetime " + str(movetime))
                    lines = self._collect(gen, "time", movetime)
                if gen != self.generation:
                    continue
                send(self._result(msg_id, lines))
            except Exception as exc:
                if gen == self.generation:
                    send({"type": "error", "id": msg_id, "message": str(exc)})

    def _collect(self, gen, mode, value):
        found = {}
        best = None
        if mode == "depth":
            deadline = time.monotonic() + 120
        else:
            deadline = time.monotonic() + value / 1000 + 5
        while best is None and time.monotonic() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                break
            line = line.strip()
            if line.startswith("info ") and " score " in line:
                multipv = MULTIPV_RE.search(line)
                score = SCORE_RE.search(line)
                pv = PV_RE.search(line)
                if score and pv:
                    index = int(multipv.group(1)) if multipv else 1
                    found[index] = {
                        "move": pv.group(1).split()[0],
                        "pv": pv.group(1).split(),
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
            elif kind == "configure":
                send(bridge.configure(msg))
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
