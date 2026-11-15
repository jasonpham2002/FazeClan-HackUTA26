"""Local preview only. Serve modules correctly even with Windows MIME overrides."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.mjs': 'application/javascript; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Server(ThreadingHTTPServer):
    allow_reuse_address = False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5187)
    args = parser.parse_args()
    handler = partial(Handler, directory=str(Path(__file__).resolve().parent))
    with Server(('127.0.0.1', args.port), handler) as server:
        print(f'Fan frontend: http://127.0.0.1:{args.port} (local preview only)', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
