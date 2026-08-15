#!/usr/bin/env python3
"""Local dev server for taimur.sh.

Mirrors what nginx does in production so links written as `/projects` resolve
to `projects.html` locally too:

    try_files $uri $uri.html $uri/ =404;

Also serves the custom 404.html on a miss, and sends no-store so edits show up
on reload without a hard refresh.

    ./serve.py [port]        # default 8899
"""

import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8899
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        fs_path = super().translate_path(path)
        # Directories fall through to the base class (index.html, listing).
        if os.path.isdir(fs_path):
            return fs_path
        # $uri.html — only when the request didn't already ask for one.
        if not os.path.exists(fs_path) and not fs_path.endswith(".html"):
            candidate = fs_path + ".html"
            if os.path.isfile(candidate):
                return candidate
        return fs_path

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            page = os.path.join(ROOT, "404.html")
            if os.path.isfile(page):
                with open(page, "rb") as fh:
                    body = fh.read()
                self.send_response(404, message)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()  # adds Cache-Control
                if self.command != "HEAD":
                    self.wfile.write(body)
                return
        super().send_error(code, message, explain)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"serving {ROOT} at http://localhost:{PORT}  (ctrl-c to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")
