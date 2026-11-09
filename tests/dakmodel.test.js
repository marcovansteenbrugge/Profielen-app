// Dakmodel (plan kunstwerken-doorsnedes, F4): een kunstwerk met een heel dunne onderkant (1 punt per m²) en een gat van
// 6 m. Het dak wordt een doorlopend vlak; meetpunten zonder dakpunt binnen 10 cm krijgen het dak uit het model
// ("ingevuld", met afstand); in het gat (verder dan 2 m van een dakpunt) blijft "geen dak". De ruisfilter mag de dunne
// onderkant niet weggooien. Gemaakte wolk: weg met 2 % langs- en 2,5 % dwarshelling; dak (onderkant 14,60 m NAP) op hele
// stations 40–45 en 51–55 en hele offsets −6…6 (één punt per m²); BGT-wegdeel van 4 m links tot 4 m rechts van de as.
// Gebruik: node dakmodel.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'dakmodel');
const X0 = 150000, Y0 = 410000;
const weg = (s, o) => 10 + 0.02 * s + 0.025 * o;   // o: + = rechts (as naar +x, rechts = −y)
const DAK = 14.6;

function maakData() {
  fs.mkdirSync(UIT, { recursive: true });
  const r = [];
  const punt = (s, o, z) => r.push(`${(X0 + s).toFixed(3)} ${(Y0 - o).toFixed(3)} ${z.toFixed(4)}`);
  for (let i = 0; i <= 1000; i++) for (let j = -80; j <= 80; j++) punt(i / 10, j / 10, weg(i / 10, j / 10));
  for (let s = 40; s <= 55; s++) { if (s >= 46 && s <= 50) continue; for (let o = -6; o <= 6; o++) punt(s, o, DAK); }
  const pts = path.join(UIT, 'dun_dak.pts');
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
  const meten = async () => { await p.evaluate(() => document.getElementById('status').textContent = ''); await p.click('#drRwsMeten'); await wacht(/Doorrijprofiel: \d+ doorsnedes|Doorrijprofiel: geen/); return p.evaluate(() => window.__pvTest.rws()); };

  // 4. de dunne onderkant valt niet door de ruisfilter: kunstwerken gevonden, punten gered
  const info = await p.evaluate(() => window.__pvTest.dakModelInfo());
  const kws = await p.evaluate(() => window.__pvTest.kunstwerken());
  console.log('4 dakmodel:', JSON.stringify(info), '| kunstwerken:', JSON.stringify(kws?.map(k => [k.van, k.tot])));
  if (!info || info.gered < 100) fouten.push(`4: dunne onderkant niet gered uit de ruisfilter (${info?.gered})`);
  if (!kws?.length || Math.abs(kws[0].van - 40) > 0.5) fouten.push('4: kunstwerk met een dunne onderkant niet gevonden');

  // 1. alle meetpunten hebben een doorrijhoogte binnen 1 cm
  let rws = await meten();
  console.log('1 doorsnedes:', rws.map(d => `${d.label} st. ${d.station.toFixed(2)}: ${d.meetpunten.map(m => `${m.soort} ${m.h?.toFixed(3)} (${m.dakBron}${m.dakAfstand ? ' ' + m.dakAfstand.toFixed(2) : ''})`).join(', ')}`).join(' | '));
  for (const d of rws) for (const m of d.meetpunten) {
    const v = DAK - weg(d.station, m.offset);
    if (m.h == null || Math.abs(m.h - v) >= 0.01) fouten.push(`1: ${d.label} ${m.soort} op ${m.offset}: ${m.h} (verwacht ${v.toFixed(4)})`);
  }
  // 2. zonder dakpunt binnen 10 cm: "ingevuld" met afstand of "gemeten (vakje)"; ingevuld komt voor
  const alle = rws.flatMap(d => d.meetpunten);
  if (alle.some(m => m.dakBron === 'punten')) fouten.push('2: een meetpunt zegt "gemeten uit de punten", maar binnen 10 cm ligt geen 2 dakpunten');
  if (!alle.some(m => m.dakBron === 'ingevuld')) fouten.push('2: geen enkel meetpunt "ingevuld"');
  for (const m of alle.filter(m => m.dakBron === 'ingevuld')) if (!(m.dakAfstand > 0 && m.dakAfstand <= 2)) fouten.push(`2: ingevuld met afstand ${m.dakAfstand}`);
  const tabel = await p.textContent('#drRwsResultaat');
  if (!/ingevuld \(\d,\d m\)/.test(tabel)) fouten.push('2: "ingevuld (… m)" niet in de tabel');

  // 3. in het gat (st. 46–50, verder dan 2 m van een dakpunt) geen dak; vlak naast de rand wel ingevuld
  const inGat = await p.evaluate(() => window.__pvTest.dakOp(48, 0));
  const naRand = await p.evaluate(() => window.__pvTest.dakOp(44.6, 0.4));
  console.log('3 dakOp(48, 0):', JSON.stringify(inGat), '| dakOp(44.6, 0.4):', JSON.stringify(naRand));
  if (inGat) fouten.push('3: in het gat van 6 m toch een dak ingevuld');
  if (!naRand || !naRand.ingevuld || Math.abs(naRand.z - DAK) > 0.005) fouten.push('3: tussen twee dakpunten geen ingevuld dak');
  await p.fill('#drKwLijst [data-doorsnede="1-achter"]', '48'); await p.dispatchEvent('#drKwLijst [data-doorsnede="1-achter"]', 'change'); await p.waitForTimeout(200);
  rws = await meten();
  const gat = rws.find(d => d.label === 'KW1 achter');
  console.log('3 doorsnede in het gat:', gat?.meetpunten.map(m => `${m.soort}: ${m.h}`).join(', '));
  if (!gat || gat.meetpunten.some(m => m.h != null)) fouten.push('3: in het gat geeft een meetpunt toch een doorrijhoogte');
  if (!/geen dak \(niet gemeten\)/.test(await p.textContent('#drRwsResultaat'))) fouten.push('3: "geen dak (niet gemeten)" niet in de tabel');
  await p.fill('#drKwLijst [data-doorsnede="1-achter"]', ''); await p.dispatchEvent('#drKwLijst [data-doorsnede="1-achter"]', 'change'); await p.waitForTimeout(200);
  rws = await meten();

  // 5. kleinste vrije hoogte (B10) en het bovenaanzicht met ingevuld dak
  const dr = await p.evaluate(() => window.__pvTest.doorrij());
  const vMin = dr.boxen[0].vrijMin, verwacht = DAK - weg(55, 1.75);
  console.log('5 kleinste vrije hoogte:', vMin?.toFixed(3), '(verwacht', verwacht.toFixed(3) + ')');
  if (vMin == null || Math.abs(vMin - verwacht) > 0.02) fouten.push(`5: kleinste vrije hoogte ${vMin} (verwacht ${verwacht.toFixed(3)})`);
  await p.screenshot({ path: path.join(H.UIT, 'dakmodel_venster.png') });
  await p.click('#drSluit'); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(H.UIT, 'dakmodel.png') });

  // 6. RWS-blad noemt hoe het object bepaald is
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Test dakmodel'); z('pdf3D', false); z('pdfRws', true); });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdfPad = path.join(H.UIT, 'dakmodel.pdf'); await dl.saveAs(pdfPad);
  const { spawnSync } = require('child_process');
  const py = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'n = 0',
    'for pg in d:',
    '    t = " ".join(pg.get_text().split())',
    '    if t.startswith("Doorrijprofiel "):',
    '        n += 1; print("RWSBLAD", t[:1200]); pg.get_pixmap(dpi=70).save(sys.argv[2].replace("N", str(n)))',
  ].join(String.fromCharCode(10)), pdfPad, path.join(H.UIT, 'dakmodel_blad_N.png')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const pdfTekst = py.stdout || '';
  if (!/ingevuld \(\d\.\d m\)/.test(pdfTekst)) fouten.push('6: "ingevuld (… m)" niet op het RWS-blad');
  if (!/object bepaald/.test(pdfTekst)) fouten.push('6: kolom "object bepaald" niet op het RWS-blad');
  console.log('6 PDF:', (pdfTekst.match(/RWSBLAD/g) || []).length, 'RWS-bladen', py.stderr ? py.stderr.slice(0, 200) : '');

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
