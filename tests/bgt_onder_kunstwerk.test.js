// BGT onder het kunstwerk doortrekken (plan kunstwerken-doorsnedes, F5) en drie maten in het lengteprofiel.
// Gemaakte wolk: weg met 2 % langs- en 2,5 % dwarshelling; dak (onderkant 14,60 m NAP) van st. 40 tot 55.
// BGT: wegdeel van 4 m links tot 4 m rechts tot st. 39, wegdeel van 4,5 m links tot 4,5 m rechts vanaf st. 56, en
// daartussen alleen een vlak "dek" (het kunstwerk) over de hele breedte: onder het kunstwerk staat dus geen weg in de BGT.
// Verwacht: onder het kunstwerk kant links en rechts op de randen doorgetrokken tussen st. 38 (± 4 m) en st. 57 (± 4,5 m).
// Gebruik: node bgt_onder_kunstwerk.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'bgt_onder_kunstwerk');
const X0 = 150000, Y0 = 410000;
const weg = (s, o) => 10 + 0.02 * s + 0.025 * o;   // o: + = rechts (as naar +x, rechts = −y)
const DAK = 14.6;
const rand = (s) => 4 + 0.5 * Math.max(0, Math.min(1, (s - 38) / (57 - 38)));   // verwachte doorgetrokken rand

function maakData() {
  fs.mkdirSync(UIT, { recursive: true });
  const r = [];
  const punt = (s, o, z) => r.push(`${(X0 + s).toFixed(3)} ${(Y0 - o).toFixed(3)} ${z.toFixed(4)}`);
  for (let i = 0; i <= 1000; i++) for (let j = -80; j <= 80; j++) punt(i / 10, j / 10, weg(i / 10, j / 10));
  for (let i = 400; i <= 550; i++) for (let j = -60; j <= 60; j++) { punt(i / 10, j / 10, DAK); punt(i / 10, j / 10, DAK + 0.7); }
  // vangrail / opstaande rand vlak naast de rechter kant verharding (0,6–0,9 m boven de weg): mag geen "dak" worden
  for (let i = 0; i <= 1000; i++) for (let k = 0; k <= 6; k++) { const s = i / 10, o = rand(s) - 0.04; punt(s, o, weg(s, o) + 0.6 + k * 0.05); }
  const pts = path.join(UIT, 'weg_dak.pts');
  fs.writeFileSync(pts, `${r.length}\n${r.join('\n')}\n`);
  const as = path.join(UIT, 'as_weg.geojson');
  fs.writeFileSync(as, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { naam: 'Weg' }, geometry: { type: 'LineString', coordinates: [[X0, Y0], [X0 + 100, Y0]] } }] }));
  const rh = (s0, s1, o0, o1) => [[[X0 + s0, Y0 - o0], [X0 + s1, Y0 - o0], [X0 + s1, Y0 - o1], [X0 + s0, Y0 - o1], [X0 + s0, Y0 - o0]]];
  const bgt = path.join(UIT, 'bgt.json');
  fs.writeFileSync(bgt, JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { functie: 'rijbaan lokale weg' }, geometry: { type: 'Polygon', coordinates: rh(-5, 39, -4, 4) } },
    { type: 'Feature', properties: { functie: 'rijbaan lokale weg' }, geometry: { type: 'Polygon', coordinates: rh(56, 105, -4.5, 4.5) } },
    { type: 'Feature', properties: { functie: 'dek' }, geometry: { type: 'Polygon', coordinates: rh(39, 56, -10, 10) } },
  ] }));
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
  await p.evaluate(() => document.getElementById('status').textContent = ''); await p.click('#drRwsMeten'); await wacht(/Doorrijprofiel: \d+ doorsnedes|Doorrijprofiel: geen/);
  const rws = await p.evaluate(() => window.__pvTest.rws());

  // 1. onder het kunstwerk kant links en rechts op de doorgetrokken rand, met doorrijhoogte
  const zonder = await p.evaluate(() => { const r = window.__pvTest.bgtDwars(47.5); return r; });
  console.log('1 BGT op st. 47,5:', JSON.stringify(zonder));
  for (const d of rws) {
    const kanten = d.meetpunten.filter(m => m.soort === 'kant');
    const verw = rand(d.station) - 0.05;
    console.log(`1 ${d.label} st. ${d.station.toFixed(2)}:`, kanten.map(m => `${m.offset.toFixed(3)} h ${m.h?.toFixed(3)}${m.doorgetrokken ? ' doorgetrokken' : ''}`).join(' | '), `(verwacht ±${verw.toFixed(3)})`);
    if (kanten.length !== 2) { fouten.push(`1: ${d.label}: ${kanten.length} kant-meetpunten (verwacht 2)`); continue; }
    for (const m of kanten) {
      if (Math.abs(Math.abs(m.offset) - verw) > 0.02) fouten.push(`1: ${d.label}: kant op ${m.offset.toFixed(3)} (verwacht ±${verw.toFixed(3)})`);
      if (!m.doorgetrokken) fouten.push(`1: ${d.label}: kant niet als doorgetrokken gemarkeerd`);
      const v = DAK - weg(d.station, m.offset);
      if (m.h == null || Math.abs(m.h - v) >= 0.01) fouten.push(`1: ${d.label} kant ${m.offset.toFixed(2)}: h ${m.h} (verwacht ${v.toFixed(3)})`);
    }
  }
  // buiten het kunstwerk gewoon de BGT
  const buiten = await p.evaluate(() => window.__pvTest.bgtDwars(20));
  if (!buiten || buiten.doorgetrokken) fouten.push('1: buiten het kunstwerk is de BGT toch doorgetrokken');

  // 2. dwarsprofiel onder het kunstwerk: doorgetrokken BGT gestippeld met legenda
  await p.click('#drSluit'); await p.waitForTimeout(300);
  await p.evaluate(() => window.__pvTest.rwsToon(1)); await p.waitForTimeout(400);
  const gestippeld = await p.evaluate(() => [...document.querySelectorAll('#svgDwars line[stroke-dasharray="7 4"]')].length);
  const legenda = await p.evaluate(() => document.getElementById('svgDwars').textContent);
  console.log('2 gestippelde BGT-balken:', gestippeld, '| legenda:', /BGT doorgetrokken/.test(legenda));
  if (!gestippeld) fouten.push('2: doorgetrokken BGT niet gestippeld in het dwarsprofiel');
  if (!/BGT doorgetrokken/.test(legenda)) fouten.push('2: "BGT doorgetrokken" niet in de legenda');

  // 4. lengteprofiel: drie maten per doorsnede met de waarden van kant links, as en kant rechts
  const maten = await p.evaluate(() => window.__pvTest.kwMaten());
  console.log('4 maten in het lengteprofiel:', maten.join(', '));
  for (const d of rws) {
    const kL = d.meetpunten.find(m => m.soort === 'kant' && m.offset < 0), kR = d.meetpunten.find(m => m.soort === 'kant' && m.offset > 0), a = d.meetpunten.find(m => m.soort === 'as');
    // (F6) alleen de maat op de as in het lengteprofiel; de kanten niet (die staan in het dwarsprofiel)
    if (!a || !maten.includes(`as ${a.h.toFixed(3)}`)) fouten.push(`4: ${d.label}: maat op de as niet in het lengteprofiel`);
    for (const [tag, m] of [['L', kL], ['R', kR]]) if (m && maten.includes(`${tag} ${m.h.toFixed(3)}`)) fouten.push(`4: ${d.label}: maat ${tag} staat toch in het lengteprofiel`);
  }
  await p.screenshot({ path: path.join(H.UIT, 'bgt_onder_kunstwerk.png') });

  // (F6) het dwarsprofiel van een doorsnede toont nog alle drie de maten
  const dwarsMaten = await p.evaluate(() => [...document.querySelectorAll('#svgDwars .dv-maatlijn-tekst, #svgDwars .dv-maatlijn-tekst.rood')].map(t => t.textContent.trim()));
  const pr1 = rws[0], drie = pr1.meetpunten.filter(m => ['kant', 'as'].includes(m.soort)).map(m => m.h.toFixed(2).replace('.', ','));
  console.log('5 maten in het dwarsprofiel:', dwarsMaten.join(', '), '| verwacht:', drie.join(', '));
  for (const v of drie) if (!dwarsMaten.includes(v)) fouten.push(`5: maat ${v} niet in het dwarsprofiel`);

  // 3. RWS-blad noemt "BGT doorgetrokken"
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Test BGT onder kunstwerk'); z('pdf3D', false); z('pdfRws', true); z('pdfLengteprofiel', true); });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdfPad = path.join(H.UIT, 'bgt_onder_kunstwerk.pdf'); await dl.saveAs(pdfPad);
  const { spawnSync } = require('child_process');
  const py = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'n = 0',
    'for i, pg in enumerate(d):',
    '    t = " ".join(pg.get_text().split())',
    '    if t.startswith("Doorrijprofiel "):',
    '        n += 1; print("RWSBLAD", t[:1500]); pg.get_pixmap(dpi=70).save(sys.argv[2].replace("N", str(n)))',
    '    elif "Lengteprofiel" in t[:200]:',
    '        pg.get_pixmap(dpi=70).save(sys.argv[2].replace("N", "lengte"))',
  ].join(String.fromCharCode(10)), pdfPad, path.join(H.UIT, 'bgt_onder_kunstwerk_blad_N.png')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const pdfTekst = py.stdout || '';
  if (!/kant verharding links \(BGT doorgetrokken\)/.test(pdfTekst)) fouten.push('3: "BGT doorgetrokken" niet op het RWS-blad');
  console.log('3 PDF:', (pdfTekst.match(/RWSBLAD/g) || []).length, 'RWS-bladen', py.stderr ? py.stderr.slice(0, 200) : '');

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
