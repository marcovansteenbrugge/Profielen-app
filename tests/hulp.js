// Gedeelde hulp voor de automatische tests (Playwright).
// - start een eigen lokale server (Node, geen Python nodig) op poort 8132 die de viewer serveert
// - browser: Microsoft Edge (Windows, standaard) of een eigen Chromium via PV_CHROMIUM
// - testdata uit ../testdata, uitvoer (screenshots, pdf's) in ./uit
const path = require('path'), http = require('http'), fs = require('fs');
let pw;
try { pw = require('playwright-core'); } catch { pw = require('playwright'); }

const ROOT = path.resolve(__dirname, '..');
const UIT = path.join(__dirname, 'uit');
fs.mkdirSync(UIT, { recursive: true });
const POORT = Number(process.env.PV_POORT || 8132);
const URL = `http://127.0.0.1:${POORT}/index.html`;
const data = (...d) => path.join(ROOT, 'testdata', ...d);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

let server = null;
/** Start de testserver (of gebruik er een die al draait op deze poort). */
async function start() {
  const draait = await new Promise((ok) => { const r = http.get(`http://127.0.0.1:${POORT}/__ptsviewer/ping`, (res) => { res.resume(); ok(true); }); r.on('error', () => ok(false)); r.setTimeout(1000, () => { r.destroy(); ok(false); }); });
  if (draait || server) return;
  server = http.createServer((req, res) => {
    const pad = decodeURIComponent(req.url.split('?')[0]);
    if (pad.startsWith('/__ptsviewer/')) { res.writeHead(204); return res.end(); }
    const bestand = path.join(ROOT, pad === '/' ? 'index.html' : pad);
    if (!bestand.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(bestand, (err, inhoud) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(bestand).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(inhoud);
    });
  });
  await new Promise((ok) => server.listen(POORT, '127.0.0.1', ok));
  server.unref();   // het testproces mag stoppen als de test klaar is
}
/** Opties voor chromium.launch(): eigen Chromium (PV_CHROMIUM) of de geïnstalleerde Edge. */
function browserOpties() {
  return process.env.PV_CHROMIUM ? { executablePath: process.env.PV_CHROMIUM } : { channel: process.env.PV_KANAAL || 'msedge' };
}
module.exports = { chromium: pw.chromium, ROOT, UIT, URL, POORT, data, start, browserOpties };
