# Simpele statische server voor lokale ontwikkeling, met cache-headers uit —
# python -m http.server stuurt geen Cache-Control mee, waardoor Chrome
# viewer.js/index.html soms alsnog uit de disk-cache serveert na een refresh
# (zelfs een harde refresh loste dat niet altijd op). Dit voorkomt dat.
import http.server
import threading
import sys


class GeenCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
    }

    def do_GET(self):
        # hartslag van de pagina (gebruikt door Lutrea-Profielviewer.exe) — hier niets mee doen
        if self.path.startswith("/__ptsviewer/"):
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        # afsluitknop in de viewer
        if self.path.startswith("/__ptsviewer/stop"):
            self.send_response(204)
            self.end_headers()
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.path.startswith("/__ptsviewer/"):   # bv. "dicht" bij het sluiten van het venster
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # geen log per bestand in het venster

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    poort = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    map_ = sys.argv[2] if len(sys.argv) > 2 else "."

    def handler(*args, **kwargs):
        return GeenCacheHandler(*args, directory=map_, **kwargs)

    # alleen op deze computer bereikbaar (niet vanaf het netwerk)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", poort), handler)
    print(f"Lutrea Profielviewer draait op http://localhost:{poort}/index.html  (venster sluiten = stoppen)")
    server.serve_forever()
