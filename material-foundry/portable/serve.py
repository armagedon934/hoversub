#!/usr/bin/env python3
"""Local launcher for Material Foundry / Understand Code (macOS, Linux, Windows with Python).

Serves the app folder on this computer only (127.0.0.1) and opens it in the browser.
Nothing is sent anywhere; close this window (or press Ctrl+C) to stop.
"""
import functools
import http.server
import os
import sys
import threading
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(os.path.dirname(HERE), "app")
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".zip": "application/zip",
    ".txt": "text/plain; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


def main():
    if not os.path.isfile(os.path.join(APP, "index.html")):
        print("The 'app' folder was not found next to this launcher. Please unpack the whole ZIP first.")
        sys.exit(1)
    handler = functools.partial(Handler, directory=APP)
    server = None
    for port in range(8765, 8786):
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError:
            continue
    if server is None:
        print("No free port between 8765 and 8785.")
        sys.exit(1)
    url = f"http://127.0.0.1:{server.server_address[1]}/" + ("" if "--materials" in sys.argv else "#code")
    print("Material Foundry is running:", url)
    print("Программа запущена:", url)
    print("Close this window or press Ctrl+C to stop. / Чтобы остановить, закройте это окно или нажмите Ctrl+C.")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
