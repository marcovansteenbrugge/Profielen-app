// RWS-oplevering (plan rws-oplevering): F0 hoogtebereik van het lengteprofiel en de labels boven het kunstwerk.
// Gemaakte wolk: weg met 2 % langs- en 2,5 % dwarshelling; KW1 (dak 14,60, bovenkant 15,30 m NAP) van st. 30 tot 45,
// KW2 (dak 15,20, bovenkant 15,90 m NAP) van st. 60 tot 75; BGT-wegdeel van 4 m links tot 4 m rechts.
// Gebruik: node rws_oplevering.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'rws_oplevering');
const X0 = 150000, Y0 = 410000;
const weg = (s, o) => 10 + 0.02 * s + 0.025 * o;
const KW = [{ van: 30, tot: 45, dak: 14.6 }, { van: 60, tot: 75, dak: 15.2 }];

function maakData() {
  fs.mkdirSync(UIT, { recursive: true });
  const r = [];
  const punt = (s, o, z) => r.push(`${(X0 + s).toFixed(3)} ${(Y0 - o).toFixed(3)} ${z.toFixed(4)}`);
  for (let i = 0; i <= 1000; i++) for (let j = -80; j <= 80; j++) punt(i / 10, j / 10, weg(i / 10, j / 10));
  for (const k of KW) for (let i = k.van * 10; i <= k.tot * 10; i++) for (let j = -60; j <= 60; j++) { punt(i / 10, j / 10, k.dak); punt(i / 10, j / 10, k.dak + 0.7); }
  const pts = path.join(UIT, 'twee_viaducten.pts');
  fs.writeFileSync(pts, `${r.length}\n${r.join('\n')}\n`);
  const as = path.join(UIT, 'as_weg.geojson');
  fs.writeFileSync(as, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { naam: 'Weg' }, geometry: { type: 'LineString', coordinates: [[X0, Y0], [X0 + 100, Y0]] } }] }));
  const bgt = path.join(UIT, 'wegdeel.json');
  fs.writeFileSync(bgt, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { functie: 'rijbaan lokale weg' }, geometry: { type: 'Polygon', coordinates: [[[X0 - 5, Y0 - 4], [X0 + 105, Y0 - 4], [X0 + 105, Y0 + 4], [X0 - 5, Y0 + 4], [X0 - 5, Y0 - 4]]] } }] }));
  return { pts, as, bgt, n: r.length };
}

(async () => {
  await H.start();
  const { pts, as, bgt, n } = maakData();
  console.log('wolk:', n.toLocaleString('nl-NL'), 'punten');
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  await p.addInitScript(require('./zonder_map.js'));
  p.setDefaultTimeout(300000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl|brk-kadastrale-kaart/, r => r.abort());
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-oppervlak', 'boven'); localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async (re, max = 240) => { for (let i = 0; i < max * 4; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } return st(); };
  await p.setInputFiles('#ptsBestand', pts); await wacht(/driehoeken/);
  await p.setInputFiles('#asBestand', as); await p.waitForTimeout(1200);
  await p.setInputFiles('#bgtBestand', bgt); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__pvTest.zetWerksoort('doorrij')); await p.waitForTimeout(300);
  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');
  await p.click('#drUitA'); await wacht(/ — [0-9.]+ punten in de strook/);
  await p.fill('#drBoxen [data-veld="breedte"]', '3.5'); await p.fill('#drBoxen [data-veld="hoogte"]', '4.2');
  await p.click('#drControleer'); await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById('status').textContent = ''); await p.click('#drRwsMeten'); await wacht(/Doorrijprofiel: \d+ doorsnedes/);
  await p.click('#drSluit'); await p.waitForTimeout(300);

  // F0-2. leeg = automatisch
  const auto = await p.evaluate(() => window.__pvTest.langsAs());
  console.log('F0-2 automatisch:', JSON.stringify(auto && { hMin: +auto.hMin.toFixed(2), hMax: +auto.hMax.toFixed(2) }));
  if (!auto || (Math.abs(auto.hMin - 9) < 0.01 && Math.abs(auto.hMax - 18) < 0.01)) fouten.push('F0-2: automatisch bereik niet anders dan 9–18');

  // F0-1. vast bereik 9–18 m NAP: precies van boven- tot onderrand van de grafiek
  await p.fill('#langsHoogteVan', '9'); await p.dispatchEvent('#langsHoogteVan', 'change');
  await p.fill('#langsHoogteTot', '18'); await p.dispatchEvent('#langsHoogteTot', 'change'); await p.waitForTimeout(400);
  const vast = await p.evaluate(() => window.__pvTest.langsAs());
  console.log('F0-1 vast:', JSON.stringify(vast));
  if (!vast || Math.abs(vast.hMin - 9) > 1e-6 || Math.abs(vast.hMax - 18) > 1e-6) fouten.push('F0-1: bereik niet 9–18');
  else if (Math.abs(vast.yBoven - vast.margeT) > 0.5 || Math.abs(vast.yOnder - (vast.hoog - vast.margeB)) > 0.5) fouten.push('F0-1: 9–18 vult de grafiek niet precies');

  // F0-3. labels boven het kunstwerk (niet bovenin de grafiek), slepen werkt nog (kunstwerken.test)
  const labels = await p.evaluate(() => ['1-voor', '1-achter', '2-voor', '2-achter'].map(k => { const e = document.querySelector(`#svgLangs [data-kwgreep="${k}"] rect`); return e ? { y: +e.getAttribute('y'), h: +e.getAttribute('height') } : null; }));
  const yVan = (z) => vast.yOnder - (z - vast.hMin) / (vast.hMax - vast.hMin) * (vast.yOnder - vast.yBoven);
  const toppen = [15.3, 15.3, 15.9, 15.9];
  console.log('F0-3 labels:', JSON.stringify(labels.map((l, i) => l && { onder: +(l.y + l.h).toFixed(1), dakTop: +yVan(toppen[i]).toFixed(1) })));
  labels.forEach((l, i) => {
    if (!l) { fouten.push(`F0-3: label ${i + 1} ontbreekt`); return; }
    if (l.y + l.h > yVan(toppen[i]) + 0.5) fouten.push(`F0-3: label ${i + 1} staat niet boven het kunstwerk`);
    if (yVan(toppen[i]) - (l.y + l.h) > 30) fouten.push(`F0-3: label ${i + 1} staat niet vlak boven het kunstwerk (${(yVan(toppen[i]) - (l.y + l.h)).toFixed(0)} px ertussen)`);
  });
  await p.locator('#svgLangs').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(H.UIT, 'rws_oplevering_lengteprofiel.png') });

  // F0-1b. PDF: het lengteprofiel met het vaste bereik
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Test RWS-oplevering'); z('pdf3D', false); z('pdfLengteprofiel', true); z('pdfDwarsprofielen', false); z('pdfRws', false); z('pdfDoorrij', false); z('pdfBovenaanzicht', false); });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdfPad = path.join(H.UIT, 'rws_oplevering_f0.pdf'); await dl.saveAs(pdfPad);
  const { spawnSync } = require('child_process');
  const py = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'for pg in d:',
    '    t = " ".join(pg.get_text().split())',
    '    if "Lengteprofiel" in t[:300]:',
    '        print("LENGTE", t[:400]); pg.get_pixmap(dpi=70).save(sys.argv[2]); break',
  ].join(String.fromCharCode(10)), pdfPad, path.join(H.UIT, 'rws_oplevering_lengte_pdf.png')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  console.log('F0-1b PDF:', (py.stdout || '').slice(0, 200), py.stderr ? py.stderr.slice(0, 200) : '');
  if (!/hoogte 9,00 - 18,00 m NAP/.test(py.stdout || '')) fouten.push('F0-1b: PDF-lengteprofiel noemt het vaste bereik niet');
  await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(300);
  if (await p.isVisible('#pdfDialoog[open]')) await p.evaluate(() => document.getElementById('pdfDialoog')?.close());

  // F0-4. het bereik komt terug na opslaan en openen
  await p.evaluate(() => window.__pvTest.projectRondje()); await p.waitForTimeout(1500);
  const velden = await p.evaluate(() => [document.getElementById('langsHoogteVan').value, document.getElementById('langsHoogteTot').value]);
  console.log('F0-4 na opslaan en openen:', JSON.stringify(velden));
  if (velden[0] !== '9' || velden[1] !== '18') fouten.push('F0-4: hoogtebereik komt niet terug na opslaan en openen');

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
