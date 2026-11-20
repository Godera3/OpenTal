# Native messaging protocol

Firefox calls the host with one argument: the extension ID. Messages on
stdin/stdout are JSON objects prefixed with a 4-byte little-endian length.

Extension to host:

| type | fields | meaning |
|------|--------|---------|
| `ping` | — | liveness check |
| `analyse` | `id`, `fen`, `moves`, `searchMode`, `movetime`, `depth` | search this position |
| `configure` | `searchMode`, `movetime`, `depth`, `options` | apply UCI options and default search mode/limits |
| `stop` | — | abandon the current search |
| `quit` | — | shut down the bridge |

Host to extension:

| type | fields | meaning |
|------|--------|---------|
| `ready` | `engine`, `evalEngine?`, `host` | UCI handshake complete |
| `pong` | `engine` | response to `ping` |
| `analysis` | `id`, `bestmove`, `score`, `mate`, `lines`, `depth`, `evalScore?`, `evalMate?`, `evalEngine?` | search result |
| `configured` | `engine`, `evalEngine?`, `options`, `movetime`, `depth`, `searchMode` | settings applied |
| `error` | `id?`, `message` | bad request or engine failure |

`fen` is a full UCI FEN string or `startpos`. `moves` is an array of UCI moves
played from that FEN. `searchMode` is `time` or `depth`. In `time` mode the
host runs `go movetime <ms>` (`movetime` clamped to 50–10000). In `depth`
mode it runs `go depth <n>` (`depth` clamped to 1–30).

`options` is an object of validated UCI settings: `Hash` (1–4096),
`Threads` (1–8), `MultiPV` (1–12), `UseBook`, `VerboseBook`, `Ponder`,
`TalMode`, `TalRandom` (booleans). Unknown names or out-of-range values are
rejected.

`score`/`mate` and `lines` describe Tal's chosen move(s) (arrows/chips). When an
evaluation engine is available (e.g. Stockfish), `evalScore`/`evalMate` and
`evalEngine` provide an objective evaluation of the position for the eval bar;
otherwise the bar falls back to Tal's evaluation. All scores are centipawns from
the side to move and mates are signed distances. `lines` is an array of up to
three objects `{ "move": "e2e4", "pv": ["e2e4", "e7e5"], "score": 35, "mate": null }`.

The host keeps one OpenTal process alive. A new `analyse` or `configure`
supersedes any search in flight: the host sends UCI `stop`, drops stale
replies and applies the newest request. `ucinewgame` separates positions so
results are not contaminated by the previous hash.

Validation matters here: a malformed FEN or a newline in a move would be
injected straight into the engine's stdin. The host rejects control
characters and caps the move list length.
