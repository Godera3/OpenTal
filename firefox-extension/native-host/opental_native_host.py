#!/usr/bin/env python3
"""Native messaging bridge between the Firefox extension and OpenTal UCI."""

import json
import os
import queue
import re
import shutil
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
EVAL_MOVETIME = 350
EVAL_DEPTH = 14

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


def find_stockfish():
    env = os.environ.get("OPENTAL_STOCKFISH")
    if env:
        p = Path(env).expanduser()
        if p.is_file() and os.access(p, os.X_OK):
            return str(p)
    candidates = [
        Path.home() / ".arena_linux/Engines/Stockfish/stockfish_10_x64_bmi2_official",
        Path.home() / ".arena_linux/Engines/Stockfish/stockfish_10_x64_modern_official",
        Path.home() / ".arena_linux/Engines/Stockfish/stockfish_10_x64_official",
        Path.home() / ".arena_linux/Engines/Stockfish/stockfish",
        ROOT / "stockfish",
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    which = shutil.which("stockfish")
    return which


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


class UciEngine:
    def __init__(self, path, cwd, label):
        self.path = str(path)
        self.cwd = str(cwd)
        self.label = label
        self.proc = subprocess.Popen(
            [self.path],
            cwd=self.cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self.lock = threading.Lock()
        self.name = self._handshake()

    def _send(self, command):
        with self.lock:
            if self.proc.poll() is not None or self.proc.stdin.closed:
                raise RuntimeError(self.label + " not running")
            self.proc.stdin.write(command + "\n")
            self.proc.stdin.flush()

    def _handshake(self):
        self._send("uci")
        name = self.label
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError(self.label + " exited during UCI handshake")
            line = line.strip()
            if line.startswith("id name "):
                name = line[8:]
            if line == "uciok":
                break
        self._send("isready")
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError(self.label + " exited waiting for readyok")
            if line.strip() == "readyok":
                break
        return name

    def setoption(self, name, value):
        self._send("setoption name " + name + " value " + str(value))

    def stop(self):
        try:
            with self.lock:
                if self.proc.poll() is None and not self.proc.stdin.closed:
                    self.proc.stdin.write("stop\n")
                    self.proc.stdin.flush()
        except Exception:
            pass

    def search(self, position, movetime, depth, max_lines=3):
        with self.lock:
            if self.proc.poll() is not None or self.proc.stdin.closed:
                raise RuntimeError(self.label + " not running")
            self.proc.stdin.write("ucinewgame\n")
            self.proc.stdin.write(position + "\n")
            self.proc.stdin.write("isready\n")
            self.proc.stdin.flush()
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError(self.label + " exited during search setup")
            if line.strip() == "readyok":
                break
        if depth is not None:
            go = "go depth " + str(int(depth))
            deadline = time.monotonic() + 120
        else:
            go = "go movetime " + str(int(movetime))
            deadline = time.monotonic() + max(0.05, int(movetime) / 1000.0) + 5.0
        self._send(go)
        found = {}
        best = None
        while time.monotonic() < deadline:
            line = self.proc.stdout.readline()
            if not line:
                break
            line = line.strip()
            if line.startswith("info ") and " score " in line and " pv " in line:
                multipv = MULTIPV_RE.search(line)
                score = SCORE_RE.search(line)
                pv = PV_RE.search(line)
                if score and pv:
                    index = int(multipv.group(1)) if multipv else 1
                    tokens = pv.group(1).split()
                    if tokens:
                        found[index] = {
                            "move": tokens[0],
                            "pv": tokens,
                            "score": int(score.group(2)) if score.group(1) == "cp" else None,
                            "mate": int(score.group(2)) if score.group(1) == "mate" else None,
                        }
            elif line.startswith("bestmove "):
                parts = line.split()
                best = parts[1] if len(parts) > 1 else "(none)"
                break
        if best is None:
            self.stop()
            # drain until bestmove or timeout
            end = time.monotonic() + 1.0
            while time.monotonic() < end:
                line = self.proc.stdout.readline()
                if not line:
                    break
                line = line.strip()
                if line.startswith("bestmove "):
                    parts = line.split()
                    best = parts[1] if len(parts) > 1 else "(none)"
                    break
        lines = [found[k] for k in sorted(found) if k <= max_lines]
        top = found.get(1, {})
        return {
            "bestmove": best,
            "score": top.get("score"),
            "mate": top.get("mate"),
            "lines": lines,
        }


class EngineBridge:
    def __init__(self):
        if not ENGINE.is_file():
            raise RuntimeError("OpenTal binary not found: " + str(ENGINE))
        self.tal = UciEngine(ENGINE, ROOT, "OpenTal")
        self.eval_engine = None
        self.eval_name = None
        stockfish_path = find_stockfish()
        if stockfish_path:
            try:
                self.eval_engine = UciEngine(stockfish_path, os.path.dirname(stockfish_path) or ROOT, "Stockfish")
                self.eval_name = self.eval_engine.name
                try:
                    self.eval_engine.setoption("Threads", 1)
                    self.eval_engine.setoption("Hash", 64)
                except Exception:
                    pass
            except Exception:
                self.eval_engine = None
                self.eval_name = None
        self.generation = 0
        self.requests = queue.Queue()
        self.movetime = 250
        self.depth = 12
        self.search_mode = "time"
        self.configured = {}
        self.name = self.tal.name
        self._apply_tal_options({"MultiPV": 1})
        threading.Thread(target=self._search_loop, daemon=True).start()

    def _apply_tal_options(self, options):
        for name, value in options.items():
            parsed = parse_option(name, value)
            self.tal.setoption(name, parsed)
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
        self.tal.stop()
        if self.eval_engine:
            self.eval_engine.stop()
        self._apply_tal_options(options)
        if self.eval_engine:
            try:
                if "Hash" in options:
                    self.eval_engine.setoption("Hash", max(16, min(256, int(options["Hash"]))))
                if "Threads" in options:
                    self.eval_engine.setoption("Threads", max(1, min(4, int(options["Threads"]))))
            except Exception:
                pass
        self.movetime = movetime
        self.depth = depth
        self.search_mode = search_mode
        return {
            "type": "configured",
            "options": self.configured,
            "movetime": self.movetime,
            "depth": self.depth,
            "searchMode": self.search_mode,
            "engine": self.name,
            "evalEngine": self.eval_name,
        }

    def stop(self):
        self.tal.stop()
        if self.eval_engine:
            self.eval_engine.stop()

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
                # Run Tal (arrows/lines) and Stockfish (eval bar) in parallel.
                results = {}

                def run_tal():
                    try:
                        if search_mode == "depth":
                            results["tal"] = self.tal.search(position, movetime, depth, max_lines=3)
                        else:
                            results["tal"] = self.tal.search(position, movetime, None, max_lines=3)
                    except Exception as exc:
                        results["tal_error"] = str(exc)

                def run_eval():
                    if not self.eval_engine:
                        return
                    try:
                        ems = max(150, min(EVAL_MOVETIME, movetime if search_mode == "time" else EVAL_MOVETIME))
                        results["eval"] = self.eval_engine.search(position, ems, None, max_lines=1)
                    except Exception:
                        results["eval"] = None

                threads = [threading.Thread(target=run_tal), threading.Thread(target=run_eval)]
                for t in threads:
                    t.start()
                for t in threads:
                    t.join()

                if gen != self.generation:
                    continue
                if "tal_error" in results:
                    raise RuntimeError(results["tal_error"])
                tal = results.get("tal") or {}
                ev = results.get("eval") or {}
                msg = {
                    "type": "analysis",
                    "id": msg_id,
                    "bestmove": tal.get("bestmove"),
                    "score": tal.get("score"),
                    "mate": tal.get("mate"),
                    "lines": tal.get("lines") or [],
                    "evalScore": ev.get("score"),
                    "evalMate": ev.get("mate"),
                    "evalEngine": self.eval_name,
                }
                send(msg)
            except Exception as exc:
                if gen == self.generation:
                    send({"type": "error", "id": msg_id, "message": str(exc)})


def main():
    bridge = EngineBridge()
    send({"type": "ready", "engine": bridge.name, "evalEngine": bridge.eval_name, "host": HOST_NAME})
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
