#!/usr/bin/env python3
"""Register or remove the OpenTal native messaging host for Firefox."""

import json
import os
import sys
from pathlib import Path

HOST_NAME = "com.opental.analysis"
EXTENSION_ID = "opental@local"
DESTINATION = Path.home() / ".mozilla" / "native-messaging-hosts" / (HOST_NAME + ".json")
HOST_SCRIPT = Path(__file__).resolve().parent / "opental_native_host.py"


def install():
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "name": HOST_NAME,
        "description": "OpenTal UCI bridge for the OpenTal Firefox extension",
        "path": str(HOST_SCRIPT),
        "type": "stdio",
        "allowed_extensions": [EXTENSION_ID],
    }
    DESTINATION.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    HOST_SCRIPT.chmod(HOST_SCRIPT.stat().st_mode | 0o111)
    print("installed", DESTINATION)
    print("revert: rm -f", DESTINATION)


def uninstall():
    if DESTINATION.exists():
        DESTINATION.unlink()
        print("removed", DESTINATION)
    else:
        print("nothing to remove at", DESTINATION)


if __name__ == "__main__":
    if "--uninstall" in sys.argv:
        uninstall()
    elif "--install" in sys.argv or len(sys.argv) == 1:
        install()
    else:
        print("usage: install-native-host.py [--install|--uninstall]")
        sys.exit(2)
