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

/* Nagemaakte eigen bestandstoegang van de exe (/__pv/, zie bron-exe/bestanden.go), voor tests in
   Edge met window.__pvNatief. Zelfde regels: sessiesleutel, Host, alleen toegestane mappen.
   natief.kiesRij: paden die /__pv/kies achter elkaar teruggeeft ('' = geannuleerd). */
const natief = { sleutel: 'test-' + require('crypto').randomBytes(16).toString('hex'), kiesRij: [], toegestaan: [], verzoeken: 0 };
const stromen = new Map();
const binnen = (p) => {
  if (!p || !path.isAbsolute(p)) return null;
  const echt = path.resolve(p).toLowerCase();
  return natief.toegestaan.some(t => { t = path.resolve(t).toLowerCase(); return echt === t || echt.startsWith(t.replace(/[\/]+$/, '') + path.sep); }) ? path.resolve(p) : null;
};
function natiefVerzoek(req, res, url) {
  const stuur = (code, body, kop = {}) => { res.writeHead(code, { 'Cache-Control': 'no-store', ...kop }); res.end(body); };
  const json = (v) => stuur(200, JSON.stringify(v), { 'Content-Type': 'application/json' });
  const fout = (err) => stuur(err.code === 'ENOENT' ? 404 : (err.code === 'ENOTEMPTY' || err.code === 'EEXIST') ? 409 : 500, String(err.message));
  if (req.headers['x-pv-sleutel'] !== natief.sleutel || req.headers.host !== `127.0.0.1:${POORT}`) return stuur(403, 'geen toegang');
  natief.verzoeken++;
  const route = url.pathname.slice('/__pv/'.length), q = url.searchParams;
  const lees = () => new Promise((ok, mis) => { const d = []; req.on('data', c => d.push(c)); req.on('end', () => ok(Buffer.concat(d))); req.on('error', mis); });
  if (route === 'kies') return lees().then(() => { const pad = natief.kiesRij.length ? natief.kiesRij.shift() : ''; if (pad) natief.toegestaan.push(pad); json({ pad }); });
  if (route.startsWith('fs/schrijf/') && route !== 'fs/schrijf/start') {
    const id = q.get('id'), s = stromen.get(id);
    if (route === 'fs/schrijf/deel') { if (!s) return stuur(404, 'onbekende schrijfstroom'); return lees().then(b => {
      // met &positie=: op die plek schrijven (delen mogen dan tegelijk binnenkomen), anders erachter
      if (q.has('positie')) { const fd = fs.openSync(s.tijdelijk, 'r+'); fs.writeSync(fd, b, 0, b.length, Number(q.get('positie'))); fs.closeSync(fd); }
      else fs.appendFileSync(s.tijdelijk, b);
      stuur(204); }, fout); }
    stromen.delete(id);
    if (route === 'fs/schrijf/klaar') { if (!s) return stuur(404, 'onbekende schrijfstroom'); try { fs.renameSync(s.tijdelijk, s.doel); stuur(204); } catch (e) { fout(e); } return; }
    if (s) fs.rmSync(s.tijdelijk, { force: true });
    return stuur(204);
  }
  const pad = binnen(q.get('pad'));
  if (!pad) return stuur(403, 'pad buiten toegestane mappen');
  try {
    if (route === 'fs/info') { if (!fs.existsSync(pad)) return json({ bestaat: false }); const st = fs.statSync(pad); return json({ bestaat: true, soort: st.isDirectory() ? 'map' : 'bestand', naam: path.basename(pad), grootte: st.size, gewijzigd: st.mtimeMs | 0 }); }
    if (route === 'fs/lijst') return json(fs.readdirSync(pad, { withFileTypes: true }).filter(d => !d.name.endsWith('.pvtmp')).map(d => ({ naam: d.name, soort: d.isDirectory() ? 'map' : 'bestand' })));
    if (route === 'fs/lees') {
      const st = fs.statSync(pad), m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      const kop = { 'Content-Type': 'application/octet-stream', 'Last-Modified': st.mtime.toUTCString() };
      if (!m) return stuur(200, fs.readFileSync(pad), kop);
      const a = m[1] ? Number(m[1]) : st.size - Number(m[2]), b = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      const buf = Buffer.alloc(b - a + 1), fd = fs.openSync(pad, 'r'); fs.readSync(fd, buf, 0, buf.length, a); fs.closeSync(fd);
      return stuur(206, buf, { ...kop, 'Content-Range': `bytes ${a}-${b}/${st.size}` });
    }
    if (route === 'fs/schrijf/start') {
      const id = require('crypto').randomBytes(12).toString('hex'), tijdelijk = path.join(path.dirname(pad), `.${path.basename(pad)}.${id}.pvtmp`);
      fs.writeFileSync(tijdelijk, ''); stromen.set(id, { doel: pad, tijdelijk }); return json({ id });
    }
    if (route === 'fs/map') { fs.mkdirSync(pad, { recursive: true }); return stuur(204); }
    if (route === 'fs/weg') {
      if (natief.toegestaan.some(t => path.resolve(t).toLowerCase() === pad.toLowerCase())) return stuur(403, 'gekozen map zelf niet');
      if (q.get('recursief') === '1') { fs.statSync(pad); fs.rmSync(pad, { recursive: true, force: true }); }
      else if (fs.statSync(pad).isDirectory()) fs.rmdirSync(pad); else fs.unlinkSync(pad);
      return stuur(204);
    }
    stuur(404, 'onbekende route');
  } catch (e) { fout(e); }
}

let server = null;
/** Start de testserver (of gebruik er een die al draait op deze poort). */
async function start() {
  const draait = await new Promise((ok) => { const r = http.get(`http://127.0.0.1:${POORT}/__ptsviewer/ping`, (res) => { res.resume(); ok(true); }); r.on('error', () => ok(false)); r.setTimeout(1000, () => { r.destroy(); ok(false); }); });
  if (draait || server) return;
  server = http.createServer((req, res) => {
    const pad = decodeURIComponent(req.url.split('?')[0]);
    if (pad.startsWith('/__ptsviewer/')) { res.writeHead(204); return res.end(); }
    if (pad.startsWith('/__pv/')) return natiefVerzoek(req, res, new globalThis.URL(req.url, `http://127.0.0.1:${POORT}`));
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
module.exports = { chromium: pw.chromium, ROOT, UIT, URL, POORT, data, start, browserOpties, natief };
