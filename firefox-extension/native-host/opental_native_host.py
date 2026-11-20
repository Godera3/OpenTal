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
    try:
        data = json.dumps(msg, separators=(",", ":")).encode("utf-8")
        with out_lock:
            sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
            sys.stdout.buffer.flush()
    except Exception:
        try:
            sys.stdout.buffer.close()
        except Exception:
            pass
        os._exit(0)


def recv():
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    (length,) = struct.unpack("<I", header)
    if length <= 0 or length > 1024 * 1024:
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
        self.proc = None
        self.stdout_queue = None
        self.reader_thread = None
        self.stdin_lock = threading.Lock()
        self.generation = 0
        self.requests = queue.Queue()
        self.movetime = 250
        self.depth = 12
        self.search_mode = "time"
        self.configured = {}
        self.name = "unknown"
        self._start()
        threading.Thread(target=self._search_loop, daemon=True).start()

    def _alive(self):
        return self.proc is not None and self.proc.poll() is None

    def _kill(self):
        p = self.proc
        self.proc = None
        if not p:
            return
        try:
            if p.stdin:
                p.stdin.close()
        except Exception:
            pass
        try:
            p.kill()
        except Exception:
            pass
        try:
            p.wait(timeout=1)
        except Exception:
            pass

    def _reader(self, proc, outq):
        try:
            while True:
                line = proc.stdout.readline()
                if line == "":
                    outq.put(None)
                    return
                outq.put(line.rstrip("\r\n"))
        except Exception:
            try:
                outq.put(None)
            except Exception:
                pass

    def _start(self):
        self._kill()
        self.stdout_queue = queue.Queue()
        self.proc = subprocess.Popen(
            [str(ENGINE)],
            cwd=str(ROOT),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self.reader_thread = threading.Thread(target=self._reader, args=(self.proc, self.stdout_queue), daemon=True)
        self.reader_thread.start()
        self.name = self._handshake()
        if self.configured:
            self._apply_options(self.configured)
        self._wait_ready(15)

    def _ensure(self):
        if not self._alive():
            self._start()

    def _readline(self, timeout):
        try:
            line = self.stdout_queue.get(timeout=max(0.0, timeout))
        except queue.Empty:
            return ""
        return line  # str or None (EOF)

    def _drain_lines(self, max_wait=0.0):
        end = time.monotonic() + max_wait
        while True:
            timeout = max(0.0, end - time.monotonic())
            line = self._readline(timeout)
            if line == "":
                break
            if line is None:
                break
            yield line

    def _wait_ready(self, timeout):
        self._uci("isready")
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            line = self._readline(min(0.5, max(0.05, end - time.monotonic())))
            if line is None:
                raise RuntimeError("OpenTal exited waiting for readyok")
            if line == "":
                continue
            if line.strip() == "readyok":
                return
        raise RuntimeError("Timed out waiting for readyok")

    def _uci(self, command):
        with self.stdin_lock:
            if not self._alive() or not self.proc or not self.proc.stdin:
                raise RuntimeError("OpenTal is not running")
            try:
                self.proc.stdin.write(command + "\n")
                self.proc.stdin.flush()
            except Exception as exc:
                raise RuntimeError("OpenTal write failed: " + str(exc))

    def _handshake(self):
        self._uci("uci")
        name = None
        end = time.monotonic() + 20
        while time.monotonic() < end:
            line = self._readline(min(0.5, max(0.05, end - time.monotonic())))
            if line is None:
                raise RuntimeError("OpenTal exited during UCI handshake")
            if line == "":
                continue
            s = line.strip()
            if s.startswith("id name "):
                name = s[8:]
            elif s == "uciok":
                return name or "unknown"
        raise RuntimeError("Timed out during UCI handshake")

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
        self._ensure()
        try:
            self._apply_options(options)
            self.movetime = movetime
            self.depth = depth
            self.search_mode = search_mode
            self._wait_ready(15)
        except Exception:
            self._start()
            if options:
                self._apply_options(options)
            self.movetime = movetime
            self.depth = depth
            self.search_mode = search_mode
            self._wait_ready(15)
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
            if self._alive() and self.proc and self.proc.stdin:
                try:
                    self.proc.stdin.write("stop\n")
                    self.proc.stdin.flush()
                except Exception:
                    pass

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

        if fen == "startpos":
            position = "position startpos"
            if moves:
                position += " moves " + " ".join(moves)
        else:
            position = "position fen " + fen

        self.generation += 1
        self.stop()
        self.requests.put((self.generation, msg.get("id"), position, search_mode, movetime, depth))

    def _collect(self, gen, mode, value):
        found = {}
        best = None
        if mode == "depth":
            deadline = time.monotonic() + 120
        else:
            deadline = time.monotonic() + value / 1000 + 8
        while time.monotonic() < deadline:
            if gen != self.generation:
                return found, None
            line = self._readline(min(0.25, max(0.02, deadline - time.monotonic())))
            if line is None:
                return found, None
            if line == "":
                continue
            s = line.strip()
            if s.startswith("info ") and " score " in s:
                multipv = MULTIPV_RE.search(s)
                score = SCORE_RE.search(s)
                pv = PV_RE.search(s)
                if score and pv:
                    index = int(multipv.group(1)) if multipv else 1
                    pv_moves = pv.group(1).split()
                    if pv_moves:
                        found[index] = {
                            "move": pv_moves[0],
                            "pv": pv_moves,
                            "score": int(score.group(2)) if score.group(1) == "cp" else None,
                            "mate": int(score.group(2)) if score.group(1) == "mate" else None,
                        }
            elif s.startswith("bestmove "):
                parts = s.split()
                best = parts[1] if len(parts) > 1 else "(none)"
                return found, best
        return found, best

    def _run_search(self, gen, position, search_mode, movetime, depth):
        self._ensure()
        self._uci("ucinewgame")
        self._uci(position)
        self._wait_ready(15)
        if search_mode == "depth":
            self._uci("go depth " + str(depth))
            return self._collect(gen, "depth", depth)
        else:
            self._uci("go movetime " + str(movetime))
            return self._collect(gen, "time", movetime)

    def _search_loop(self):
        while True:
            gen, msg_id, position, search_mode, movetime, depth = self.requests.get()
            if gen != self.generation:
                continue
            try:
                found, best = self._run_search(gen, position, search_mode, movetime, depth)
                if gen != self.generation:
                    continue
                if best is None and self._alive():
                    self.stop()
                    f2, b2 = self._collect(gen, search_mode, 2)
                    if b2:
                        found.update(f2)
                        best = b2
                if best is None and not self._alive():
                    raise RuntimeError("OpenTal engine exited during search")
                if best is None:
                    raise RuntimeError("No bestmove received from engine")
                if gen == self.generation:
                    send(self._result(msg_id, (found, best)))
            except Exception as exc:
                if gen != self.generation:
                    continue
                try:
                    self._start()
                    found, best = self._run_search(gen, position, search_mode, movetime, depth)
                    if gen != self.generation:
                        continue
                    if best is None:
                        raise RuntimeError(str(exc))
                    send(self._result(msg_id, (found, best)))
                except Exception as exc2:
                    if gen == self.generation:
                        send({"type": "error", "id": msg_id, "message": str(exc2)})

    def _result(self, msg_id, collected):
        found, best = collected
        top = found.get(1, {})
        lines = [found[k] for k in sorted(found) if k <= 3]
        return {
            "type": "analysis",
            "id": msg_id,
            "bestmove": best,
            "score": top.get("score"),
            "mate": top.get("mate"),
            "lines": lines,
        }


def main():
    try:
        bridge = EngineBridge()
    except Exception as exc:
        send({"type": "error", "message": str(exc)})
        return
    send({"type": "ready", "engine": bridge.name, "host": HOST_NAME})
    while True:
        try:
            msg = recv()
        except Exception as exc:
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
        except Exception as exc:
            send({"type": "error", "id": msg.get("id"), "message": str(exc)})
    try:
        bridge.stop()
        bridge._kill()
    except Exception:
        pass


if __name__ == "__main__":
    main()
