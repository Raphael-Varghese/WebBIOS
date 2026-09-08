#!/usr/bin/env python3
"""
WebBIOS Development Server (P0)

Serves the WebBIOS project with:
1. Required COOP/COEP headers for SharedArrayBuffer + pthreads
2. WebSocket proxy on port 8081 for guest OS network access
3. Colored request logging

Usage:
    python3 server.py              # HTTP on 8080, WebSocket on 8081
    python3 server.py 8080 8081    # Custom ports
"""

import http.server
import socketserver
import os
import sys
import asyncio
import threading

try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False

HTTP_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
WS_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8081


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
        elif path.endswith('.js'):
            print(f"\033[35m[JS]\033[0m   {args[0]}")
        else:
            print(f"\033[32m[HTTP]\033[0m {args[0]}")


def run_http():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with socketserver.TCPServer(("", HTTP_PORT), WebBIOSHandler) as httpd:
        print(f"\033[32m[HTTP]\033[0m Server running at http://localhost:{HTTP_PORT}/index.html")
        httpd.serve_forever()


connected_clients = set()


async def ws_handler(websocket, path):
    print(f"\033[34m[WS]\033[0m   Client connected from {websocket.remote_address}")
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            for client in connected_clients:
                if client != websocket and client.open:
                    await client.send(message)
    except Exception:
        pass
    finally:
        connected_clients.discard(websocket)
        print(f"\033[34m[WS]\033[0m   Client disconnected")


async def run_ws_async():
    print(f"\033[34m[WS]\033[0m   WebSocket proxy running at ws://localhost:{WS_PORT}")
    async with websockets.serve(ws_handler, "", WS_PORT):
        await asyncio.Future()


def run_ws():
    asyncio.run(run_ws_async())


if __name__ == '__main__':
    print("=" * 55)
    print("  WebBIOS P0 Development Server")
    print("=" * 55)
    print(f"\n  HTTP:  http://localhost:{HTTP_PORT}/index.html")
    if HAS_WEBSOCKETS:
        print(f"  WS:    ws://localhost:{WS_PORT} (QEMU network proxy)")
    else:
        print("  WS:    pip install websockets to enable network proxy")
    print("\n  Press Ctrl+C to stop.\n")

    http_thread = threading.Thread(target=run_http, daemon=True)
    http_thread.start()

    if HAS_WEBSOCKETS:
        ws_thread = threading.Thread(target=run_ws, daemon=True)
        ws_thread.start()

    try:
        http_thread.join()
    except KeyboardInterrupt:
        print("\n\nServer stopped.")