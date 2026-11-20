# OpenTal native messaging host

Firefox cannot run the native `opental` ELF from a WebExtension. This host is
a local Python process that Firefox starts through native messaging; it wraps
OpenTal's UCI interface over length-prefixed JSON on stdin/stdout.

## Install once

```bash
python3 native-host/install-native-host.py --install
```

That writes `~/.mozilla/native-messaging-hosts/com.opental.analysis.json`
pointing at `native-host/opental_native_host.py`, and makes the script
executable. The allowed extension ID is `opental@local`, matching the
Firefox manifest.

Revert:

```bash
python3 native-host/install-native-host.py --uninstall
# or: rm -f ~/.mozilla/native-messaging-hosts/com.opental.analysis.json
```

No system packages are installed. Nothing is added to autostart; Firefox
launches the host only while the extension is active.

## Behaviour

- Starts `../opental` with cwd set to the OpenTal repository root so the
  `books/ph-tal2.bin` path resolves.
- Keeps one engine process alive, sending `ucinewgame` between positions.
- `MultiPV` is 3. A new `analyse` request supersedes the one in flight.
- Tal-book positions return `bestmove` in about 20 ms; out-of-book positions
  use `go movetime` (600 ms from the overlay).

The protocol is documented in `../documentation/Native-Messaging-Protocol.md`.
