#!/usr/bin/env python3
"""
WebBIOS Development Server

Serves the WebBIOS project with required COOP/COEP headers
for SharedArrayBuffer and pthreads support.
"""

import http.server
import socketserver
import os
import sys

PORT = 8080

class WebBIOSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, format, *args):
        path = args[0].split()[1] if len(args[0].split()) > 1 else ''
        if path.endswith('.wasm'):
            print(f"\033[36m[WASM]\033[0m {args[0]}")
        elif path.endswith('.data'):
            print(f"\033[33m[DATA]\033[0m {args[0]}")
        else:
            print(f"\033[32m[HTTP]\033[0m {args[0]}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        PORT = int(sys.argv[1])
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with socketserver.TCPServer(("", PORT), WebBIOSHandler) as httpd:
        print("=" * 50)
        print("  WebBIOS Development Server")
        print("=" * 50)
        print(f"\n  URL: http://localhost:{PORT}/WebBIOS.html")
        print(f"  Directory: {os.getcwd()}")
        print("\n  Required headers (COOP/COEP) are enabled.")
        print("  Press Ctrl+C to stop.\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nServer stopped.")
