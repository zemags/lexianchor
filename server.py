#!/usr/bin/env python3
"""Tiny local server for LexiAnchor. No third-party packages required."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8080"))
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".webmanifest": "application/manifest+json",
        ".sqlite": "application/x-sqlite3",
    }

if __name__ == "__main__":
    print(f"LexiAnchor: http://localhost:{PORT}")
    print("Для телефона в той же Wi-Fi сети откройте: http://IP-НОУТБУКА:%d" % PORT)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
