// Klassen kiezen (plan klassen-kiezen, F1): bij het openen van een LAS met meer klassen vraagt een venster
// welke klassen worden ingelezen; alleen die komen in de vakken, via het programma én via de viewer.
// Dezelfde keuze hergebruikt de vakken, een andere zet opnieuw om. "Klassen…" wijzigt de keuze later;
// de as blijft staan en afbreken of mislukken laat de oude vakken staan. Een LAS met één klasse vraagt niets.
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'klassen_kiezen');

/** Kopie van dijk_begroeid.las (formaat 2, klassen 2/3/4) met klasse 3 en 4 → 6 (of alles → 2). */
function maakScan(naam, alleenMaaiveld = false) {
  const b = fs.readFileSync(H.data('groot', 'dijk_begroeid.las'));
  const off = b.readUInt32LE(96), rl = b.readUInt16LE(105), n = b.readUInt32LE(107);
  for (let i = 0; i < n; i++) {
    const o = off + i * rl + 15, k = b[o] & 31;
    if (alleenMaaiveld) b[o] = (b[o] & ~31) | 2; else if (k === 3 || k === 4) b[o] = (b[o] & ~31) | 6;
  }
  const f = path.join(UIT, 'scans', naam);
  fs.writeFileSync(f, b);
  return f;
}
/** Klassen die in de vakken van een puntenwolkmap staan (volgens info.json). */
function klassenInVakken(wolk) {
  const info = JSON.parse(fs.readFileSync(path.join(wolk, 'info.json'), 'utf8'));
  const k = new Set();
  const map = path.join(wolk, info.bestanden?.tegels || 'tegels');
  for (const n of fs.readdirSync(map)) { const b = fs.readFileSync(path.join(map, n)); for (let o = 12; o < b.length; o += 16) k.add(b[o]); }
  return { info, klassen: [...k].sort((a, c) => a - c) };
}

(async () => {
  await H.start();
  H.pvomzet();
  fs.rmSync(UIT, { recursive: true, force: true });
  fs.mkdirSync(path.join(UIT, 'scans'), { recursive: true });
  const scanK = maakScan('klassen.las'), scanV = maakScan('klassen_viewer.las'), scanEen = maakScan('een_klasse.las', true);
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(120000);
  const fouten = [];
  const verwacht = (t) => /proef|status of 500/.test(t);   // de opzettelijke schrijffout in stap 6
  p.on('pageerror', e => { fouten.push(e.message); console.log('!! pagina:', e.message); });
  p.on('console', m => { if (m.type() === 'error' && !verwacht(m.text())) { fouten.push('console: ' + m.text().slice(0, 200)); console.log('!! console:', m.text().slice(0, 200)); } });
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl|brk-kadastrale-kaart/, r => r.abort());
  await p.addInitScript((sleutel) => {
    window.__pvNatief = Object.freeze({ sleutel, versie: 'test' });
    window.__klassenGeopend = 0;
    document.addEventListener('DOMContentLoaded', () => {
      const d = document.getElementById('klassenDialoog');
      if (d) new MutationObserver(() => { if (d.open) window.__klassenGeopend++; }).observe(d, { attributes: true, attributeFilter: ['open'] });
    });
  }, H.natief.sleutel);
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async (re = /driehoeken/, max = 240) => { for (let i = 0; i < max * 10; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(100); } return st(); };
  const openen = async (scanPad, projMap, klassen) => {
    H.natief.kiesRij.push(scanPad);
    await p.click('button.bestandOpen[data-voor="ptsBestand"]');
    if (klassen !== undefined) await H.klassenInlezen(p, klassen);
    if (projMap) { fs.mkdirSync(projMap, { recursive: true }); H.natief.kiesRij.push(projMap); await p.waitForSelector('#projectMapDialoog[open]'); await p.click('#pmKies'); }
  };
  const wijzig = async (klassen) => { await p.click('#klassenKnop'); await H.klassenInlezen(p, klassen); };
  const zelfde = (a, c) => JSON.stringify(a) === JSON.stringify(c);
  const asLengte = () => p.evaluate(() => window.__pvTest.lengte());

  // 1. via het programma: alleen klasse 2
  const proj1 = path.join(UIT, 'proj1'), wolk1 = path.join(proj1, 'puntenwolk', 'A - klassen');
  let n0 = H.natief.omzettingen || 0;
  await openen(scanK, proj1, [2]);
  console.log('1 programma:', (await wacht()).slice(0, 70), '…', (await st()).match(/· klassen: .*$/)?.[0]);
  let r = klassenInVakken(wolk1);
  console.log('1 vakken:', r.klassen, '| keuze', r.info.klassenKeuze, '| bron', JSON.stringify(r.info.klassenBron), '| aan programma', JSON.stringify(H.natief.laatsteKlassen));
  if (!zelfde(r.klassen, [2]) || !zelfde(r.info.klassenKeuze, [2]) || !zelfde(H.natief.laatsteKlassen, [2])) fouten.push('1: vakken bevatten niet alleen klasse 2');
  if (!r.info.klassenBron?.['6'] || !/pvomzet/.test(r.info.viewer) || (H.natief.omzettingen || 0) - n0 !== 1) fouten.push('1: niet door het programma of klassenBron mist klasse 6');
  if (!/· klassen: 2 maaiveld/.test(await st())) fouten.push('1: keuze niet in de statusregel');
  if (await p.isHidden('#klassenKnop')) fouten.push('1: knop Klassen… niet zichtbaar');

  // 2. zelfde keuze: hergebruiken; andere keuze: opnieuw omzetten
  n0 = H.natief.omzettingen;
  await openen(scanK, null, [2]);
  const s2 = await wacht();
  console.log('2 zelfde keuze:', H.natief.omzettingen - n0, 'omzettingen |', /hergebruikt/.test(JSON.stringify(await p.evaluate(() => document.getElementById('status').textContent))) || 'zie status');
  if (H.natief.omzettingen !== n0) fouten.push('2: zelfde keuze zette opnieuw om');
  await openen(scanK, null, [2, 6]);
  await wacht();
  r = klassenInVakken(wolk1);
  console.log('2 andere keuze:', H.natief.omzettingen - n0, 'omzetting(en) | vakken', r.klassen, '| keuze', r.info.klassenKeuze);
  if (H.natief.omzettingen - n0 !== 1 || !zelfde(r.klassen, [2, 6]) || r.info.klassenKeuze !== null) fouten.push('2: andere keuze niet opnieuw omgezet');
  void s2;

  // 3. Klassen…: terug naar alleen 2, dan 6 erbij; de as blijft staan
  await p.setInputFiles('#asBestand', H.data('groot', 'as_begroeid.geojson')); await p.waitForTimeout(1500);
  const L = await asLengte();
  await wijzig([2]); await wacht(/klassen: 2 maaiveld$/);
  r = klassenInVakken(wolk1);
  console.log('3 alleen 2:', r.klassen, '| as', L.toFixed(1), '→', (await asLengte()).toFixed(1));
  if (!zelfde(r.klassen, [2]) || Math.abs((await asLengte()) - L) > 1e-6) fouten.push('3: Klassen… naar [2] klopt niet of de as verdween');
  await wijzig([2, 6]); await wacht(/klassen: alle$/);
  r = klassenInVakken(wolk1);
  console.log('3 erbij 6:', r.klassen, '| as', (await asLengte()).toFixed(1), '|', (await st()).match(/· klassen: .*$/)?.[0]);
  if (!zelfde(r.klassen, [2, 6]) || Math.abs((await asLengte()) - L) > 1e-6) fouten.push('3: klasse 6 erbij klopt niet of de as verdween');

  // 4. afbreken via het programma: de vakken met 2 en 6 blijven staan
  H.natief.omzetPauze = 5000;
  await wijzig([6]);
  await p.waitForSelector('#omzetAfbreken:not([hidden])');
  await p.click('#omzetAfbreken');
  await wacht(/afgebroken/, 60);
  H.natief.omzetPauze = 0;
  r = klassenInVakken(wolk1);
  console.log('4 na afbreken:', (await st()).slice(0, 60), '| vakken', r.klassen, '| map', fs.readdirSync(path.join(proj1, 'puntenwolk')).join(', '));
  if (!zelfde(r.klassen, [2, 6]) || r.info.klassenKeuze !== null || fs.readdirSync(path.join(proj1, 'puntenwolk')).some(n => n.endsWith('.pvtmp'))) fouten.push('4: afbreken liet de oude vakken niet (schoon) staan');

  // 5. via de viewer (het programma kan niet): openen met alleen 2, dan Klassen… met 6 erbij
  H.natief.omzetFout = 'het programma zet niet om (test)';
  await p.reload(); await p.waitForTimeout(800);
  const proj2 = path.join(UIT, 'proj2'), wolk2 = path.join(proj2, 'puntenwolk', 'A - klassen_viewer');
  await openen(scanV, proj2, [2]);
  const s5 = await wacht();
  if (!fs.existsSync(path.join(wolk2, 'info.json'))) { console.log('5 status:', s5, '| fouten:', fouten.join(' | ')); throw new Error('5: geen info.json'); }
  r = klassenInVakken(wolk2);
  console.log('5 viewer:', r.klassen, '| keuze', r.info.klassenKeuze, '| gemaakt door', r.info.viewer);
  if (!zelfde(r.klassen, [2]) || /pvomzet/.test(r.info.viewer) || !r.info.klassenBron?.['6']) fouten.push('5: viewer zette niet alleen klasse 2 om');
  await p.setInputFiles('#asBestand', H.data('groot', 'as_begroeid.geojson')); await p.waitForTimeout(1500);
  const L2 = await asLengte();
  await wijzig([2, 6]); await wacht(/klassen: alle$/);
  r = klassenInVakken(wolk2);
  const inhoud2 = fs.readdirSync(wolk2).sort();
  console.log('5 viewer erbij 6:', r.klassen, '| bestanden', JSON.stringify(r.info.bestanden), '| map', inhoud2.join(', '));
  if (!zelfde(r.klassen, [2, 6]) || !r.info.bestanden || inhoud2.includes('tegels') || Math.abs((await asLengte()) - L2) > 1e-6) fouten.push('5: Klassen… via de viewer klopt niet (of oude vakken bleven staan, of de as verdween)');

  // 6. via de viewer mislukt het schrijven: de vakken met 2 en 6 blijven, geen restanten
  await p.route(/\/__pv\/fs\/schrijf\/start/, (route) => /overzicht-/.test(decodeURIComponent(route.request().url())) ? route.fulfill({ status: 500, body: 'proef: schrijven mislukt' }) : route.continue());
  await wijzig([6]);
  await wacht(/mislukt|proef/, 120);
  await p.waitForTimeout(500);
  await p.unroute(/\/__pv\/fs\/schrijf\/start/);
  H.natief.omzetFout = null;
  const voor = r.info.bestanden.tegels;
  r = klassenInVakken(wolk2);
  const inhoud3 = fs.readdirSync(wolk2).sort();
  console.log('6 na mislukken:', (await st()).slice(0, 80), '| vakken', r.klassen, '| map', inhoud3.join(', '));
  if (!zelfde(r.klassen, [2, 6]) || r.info.bestanden.tegels !== voor || inhoud3.filter(n => /^tegels/.test(n)).length !== 1) fouten.push('6: mislukt omzetten via de viewer liet de oude vakken niet (schoon) staan');
  fouten.splice(0, fouten.length, ...fouten.filter(f => !verwacht(f)));

  // 7. één klasse: geen venster
  await p.reload(); await p.waitForTimeout(800);
  const g0 = await p.evaluate(() => window.__klassenGeopend);
  await openen(scanEen, path.join(UIT, 'proj3'));
  await wacht();
  const g1 = await p.evaluate(() => window.__klassenGeopend);
  console.log('7 één klasse:', (await st()).slice(0, 60), '| venster geopend:', g1 - g0, '| knop zichtbaar:', await p.isVisible('#klassenKnop'));
  if (g1 !== g0) fouten.push('7: venster bij een LAS met één klasse');
  if (await p.isVisible('#klassenKnop')) fouten.push('7: knop Klassen… zichtbaar bij één klasse');

  // schermafdruk van het venster
  H.natief.kiesRij.push(scanK);
  await p.click('button.bestandOpen[data-voor="ptsBestand"]');
  await p.waitForSelector('#klassenDialoog[open]');
  await p.screenshot({ path: path.join(H.UIT, 'klassen_kiezen.png') });
  await p.click('#klAnnuleer');
  await wacht(/geannuleerd/, 10);
  if (!/geannuleerd/.test(await st())) fouten.push('annuleren niet gemeld');

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
