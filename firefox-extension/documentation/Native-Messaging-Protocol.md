# Native messaging protocol

Firefox calls the host with one argument: the extension ID. Messages on
stdin/stdout are JSON objects prefixed with a 4-byte little-endian length.

Extension to host:

| type | fields | meaning |
|------|--------|---------|
| `ping` | — | liveness check |
| `analyse` | `id`, `fen`, `moves`, `movetime` | search this position |
| `stop` | — | abandon the current search |
| `quit` | — | shut down the bridge |

Host to extension:

| type | fields | meaning |
|------|--------|---------|
| `ready` | `engine`, `host` | UCI handshake complete |
| `pong` | `engine` | response to `ping` |
| `analysis` | `id`, `bestmove`, `score`, `mate`, `lines`, `depth` | search result |
| `error` | `id?`, `message` | bad request or engine failure |

`fen` is a full UCI FEN string or `startpos`. `moves` is an array of UCI moves
played from that FEN. `movetime` is milliseconds, clamped to 50–10000.

`score` is centipawns from the side to move. `mate` is the signed mate distance
when present, otherwise `null`. `lines` is an array of up to three objects
`{ "move": "e2e4", "pv": ["e2e4", "e7e5"], "score": 35, "mate": null }`.

The host keeps one OpenTal process alive. A new `analyse` supersedes any
search in flight: the host sends UCI `stop`, drops stale replies and searches
only the newest request. `ucinewgame` separates positions so results are not
contaminated by the previous hash.

Validation matters here: a malformed FEN or a newline in a move would be
injected straight into the engine's stdin. The host rejects control
characters and caps the move list length.
