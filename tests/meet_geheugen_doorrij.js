// Meet het geheugen (JS-heap) van de viewer per stap van de Doorrijhoogte, met de testwolk van 16 miljoen punten.
// Geen test (geen oordeel): laat per stap de piek en wat er na een GC blijft staan zien.
// Gebruik: node meet_geheugen_doorrij.js [pad-naar-wolk] [pad-naar-as]
const path = require('path');
const H = require('./hulp');
const { chromium } = H;
const WOLK = process.argv[2] || path.join(__dirname, '..', 'testdata', 'groot', 'dijk_16mln.laz');
const AS = process.argv[3] || path.join(__dirname, '..', 'testdata', 'groot', 'as_dijk.geojson');

(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox', '--js-flags=--expose-gc'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  await p.addInitScript(require('./zonder_map.js'));
  p.setDefaultTimeout(900000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message));
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl|brk-kadastrale-kaart/, r => r.abort());
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Performance.enable');
  // JS-heap plus de buffers van typed arrays (ArrayBuffer), die buiten de JS-heap staan
  const heap = async () => { const u = await cdp.send('Runtime.getHeapUsage'); return ((u.usedSize || 0) + (u.backingStorageSize || 0)) / 1048576; };
  let piek = 0, loopt = true;
  (async () => { while (loopt) { try { piek = Math.max(piek, await heap()); } catch { /* */ } await new Promise(r => setTimeout(r, 200)); } })();
  const regels = [];
  const stap = async (naam, f) => {
    piek = await heap(); const t0 = Date.now();
    await f();
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    const na = await heap();
    regels.push(`${naam.padEnd(34)} piek ${piek.toFixed(0).padStart(6)} MB · blijft ${na.toFixed(0).padStart(6)} MB · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    console.log(regels[regels.length - 1]);
  };
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async (re, max = 900) => { for (let i = 0; i < max * 4; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } return st(); };
  await stap('leeg', async () => {});
  await stap('puntenwolk A openen', async () => { await p.setInputFiles('#ptsBestand', WOLK); await wacht(/driehoeken/); });
  await stap('as inlezen', async () => { await p.setInputFiles('#asBestand', AS); await p.waitForTimeout(3000); });
  await p.evaluate(() => window.__pvTest.zetWerksoort('doorrij'));
  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');
  await stap('strook inlezen (Uit puntenwolk A)', async () => { await p.click('#drUitA'); await wacht(/ — [0-9.]+ punten in de strook|kon .* niet lezen/); console.log('  ', (await st()).slice(0, 140)); });
  await stap('Controleren', async () => { await p.click('#drControleer'); await p.waitForTimeout(3000); console.log('  ', (await st()).slice(0, 140)); });
  await stap('Profielen meten', async () => { await p.click('#drRwsMeten'); await wacht(/Doorrijprofiel: \d+ doorsnedes|Doorrijprofiel: |geen dak/, 600); console.log('  ', (await st()).slice(0, 140)); });
  loopt = false;
  console.log('\n' + regels.join('\n'));
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
