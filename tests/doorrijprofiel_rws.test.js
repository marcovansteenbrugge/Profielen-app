// Doorrijprofiel volgens RWS (plan doorrijprofielen-rws, F0): profiel 1 en 2 op de dakranden, meetpunten
// (kant verharding uit de BGT, aangeklikt in het dwarsprofiel), hoogtes uit de ruwe punten, minimale
// doorrijhoogte per rijbaan. Gemaakte wolk met bekende maten: weg met 2 % langs- en 2,5 % dwarshelling,
// dak (onderkant 14,60 m NAP) van st. 40 tot 60, BGT-wegdeel van 4 m links tot 4 m rechts van de as.
// Gebruik: node doorrijprofiel_rws.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'doorrijprofiel_rws');
const X0 = 150000, Y0 = 410000;
const weg = (s, o) => 10 + 0.02 * s + 0.025 * o;   // o: + = rechts (as naar +x, rechts = −y)
const DAK = 14.6;

function maakData() {
  fs.mkdirSync(UIT, { recursive: true });
  const r = [];
  const punt = (s, o, z) => r.push(`${(X0 + s).toFixed(3)} ${(Y0 - o).toFixed(3)} ${z.toFixed(4)}`);
  for (let i = 0; i <= 1000; i++) for (let j = -80; j <= 80; j++) punt(i / 10, j / 10, weg(i / 10, j / 10));
  for (let i = 400; i <= 600; i++) for (let j = -60; j <= 60; j++) { punt(i / 10, j / 10, DAK); punt(i / 10, j / 10, DAK + 0.7); }
  // (F1) geleiderails: links op −4,6 m over de hele as, rechts op +4,4 m tot st. 50; kolom op st. 25 van +2,85 tot +3,15 m
  for (let i = 0; i <= 1000; i++) for (let k = 0; k <= 6; k++) { const s = i / 10, h = 0.6 + k * 0.05; punt(s, -4.6, weg(s, -4.6) + h); if (s <= 50) punt(s, 4.4, weg(s, 4.4) + h); }
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) for (let k = 0; k <= 30; k++) { const s = 24.85 + i * 0.05, o = 2.85 + j * 0.05; punt(s, o, weg(s, o) + k * 0.1); }
  const pts = path.join(UIT, 'weg_met_dak.pts');
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
  console.log('BGT:', (await st()).slice(0, 100));

  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');
  await p.click('#drUitA'); await wacht(/ — [0-9.]+ punten in de strook/);
  await p.fill('#drBoxen [data-veld="breedte"]', '3.5'); await p.fill('#drBoxen [data-veld="hoogte"]', '4.2');
  await p.click('#drControleer'); await p.waitForTimeout(800);

  // 1. profiel 1 en 2 op de dakranden; hoogtes op de kant verharding < 1 cm
  await p.click('#drRwsMeten'); await wacht(/Doorrijprofiel: \d+ doorsnedes/);
  let rws = await p.evaluate(() => window.__pvTest.rws());
  console.log('1 profielen:', JSON.stringify(rws));
  const [p1, p2] = rws;
  if (rws.length !== 2) fouten.push(`1: ${rws.length} doorsnedes (verwacht 2: één kunstwerk)`);
  if (!(Math.abs(p1.station - 40.2) <= 0.25 && Math.abs(p2.station - 59.8) <= 0.25)) fouten.push(`1: profielen niet op de dakranden (${p1.station}, ${p2.station})`);
  if (p1.label !== 'KW1 voor' || p2.label !== 'KW1 achter') fouten.push(`1: labels ${p1.label}, ${p2.label} (verwacht KW1 voor, KW1 achter)`);
  for (const pr of rws) {
    const kant = pr.meetpunten.filter(m => m.soort === 'kant');
    const as = pr.meetpunten.find(m => m.soort === 'as');
    if (!as || as.offset !== 0 || as.h == null || Math.abs(as.h - (DAK - weg(pr.station, 0))) >= 0.01) fouten.push(`1: profiel ${pr.nr}: meetpunt op de as ontbreekt of klopt niet (${JSON.stringify(as)})`);
    if (kant.length !== 2) fouten.push(`1: profiel ${pr.nr}: ${kant.length} meetpunten kant verharding (verwacht 2)`);
    for (const m of kant) {
      const verwacht = DAK - weg(pr.station, m.offset);
      if (m.h == null || Math.abs(m.h - verwacht) >= 0.01) fouten.push(`1: profiel ${pr.nr} op ${m.offset}: ${m.h} (verwacht ${verwacht.toFixed(4)})`);
    }
  }

  // 2. een meetpunt aanklikken in profiel 1, daarna weer weghalen
  await p.selectOption('#drMeetSoort', 'markering');
  await p.click('#drRwsKlik'); await p.waitForTimeout(800);
  const x = await p.evaluate(() => window.__pvTest.dwarsKlikX(1.5));
  const y = await p.evaluate(() => { const r = document.getElementById('svgDwars').getBoundingClientRect(); return r.top + r.height * 0.4; });
  await p.mouse.click(x, y); await p.waitForTimeout(500);
  rws = await p.evaluate(() => window.__pvTest.rws());
  const geklikt = rws[0].meetpunten.find(m => m.soort === 'markering');
  console.log('2 aangeklikt:', JSON.stringify(geklikt), '| status:', (await st()).slice(0, 90));
  if (!geklikt || Math.abs(geklikt.offset - 1.5) > 0.05) fouten.push('2: aangeklikt meetpunt niet op ± 1,5 m');
  else if (Math.abs(geklikt.h - (DAK - weg(rws[0].station, geklikt.offset))) >= 0.01) fouten.push(`2: hoogte aangeklikt meetpunt ${geklikt.h}`);
  await p.screenshot({ path: path.join(H.UIT, 'doorrijprofiel_rws.png') });
  await p.keyboard.press('Escape'); await p.waitForSelector('#drDialoog[open]');
  const tabel = await p.textContent('#drRwsResultaat');
  if (!/wegmarkering/.test(tabel)) fouten.push('2: aangeklikt meetpunt niet in de tabel');
  await p.click('#drMeetLijst .drMpWeg'); await p.waitForTimeout(300);
  rws = await p.evaluate(() => window.__pvTest.rws());
  if (rws[0].meetpunten.some(m => m.soort === 'markering')) fouten.push('2: meetpunt niet weggehaald');

  // 4. (F1) doorrijbreedte op 0,5–1,0 m: profiel 1 tussen de rails (9,00), profiel 2 rail links en kant verharding rechts (8,60),
  //    kleinste breedte bij de kolom op st. 25 (7,45)
  rws = await p.evaluate(() => window.__pvTest.rws());
  const bmin = await p.evaluate(() => window.__pvTest.rwsBreedteMin());
  console.log('4 doorrijbreedte:', JSON.stringify(rws.map(pr => pr.breedte)), '| kleinste:', JSON.stringify(bmin && { b: bmin.breedte, st: bmin.station, L: bmin.links, R: bmin.rechts }));
  if (!rws[0].breedte || Math.abs(rws[0].breedte.breedte - 9.0) >= 0.01 || rws[0].breedte.links.soort !== 'obstakel' || rws[0].breedte.rechts.soort !== 'obstakel') fouten.push('4: doorrijbreedte profiel 1 niet 9,00 m tussen de rails');
  if (!rws[1].breedte || Math.abs(rws[1].breedte.breedte - 8.6) >= 0.01 || rws[1].breedte.rechts.soort !== 'kant verharding') fouten.push('4: zonder rail rechts moet de kant verharding de breedte begrenzen (8,60 m)');
  if (!bmin || Math.abs(bmin.breedte - 7.45) >= 0.01 || Math.abs(bmin.station - 25) > 0.5) fouten.push('4: de kolom 15 m voor het dak bepaalt niet de kleinste breedte (7,45 m bij st. 25)');
  if (!/Doorrijbreedte/.test(await p.textContent('#drRwsResultaat'))) fouten.push('4: doorrijbreedte niet in de tabel');

  // 3. minimale doorrijhoogte per rijbaan = kleinste vrije hoogte van de box
  const r = await p.evaluate(() => window.__pvTest.doorrij());
  const minTekst = r.boxen[0].vrijMin.toFixed(3).replace('.', ',');
  const tabel3 = await p.textContent('#drRwsResultaat');
  console.log('3 minimale doorrijhoogte rijbaan:', minTekst, '| in de tabel:', tabel3.includes(minTekst));
  if (!tabel3.includes(minTekst)) fouten.push('3: minimale doorrijhoogte per rijbaan niet in de tabel');
  await p.screenshot({ path: path.join(H.UIT, 'doorrijprofiel_rws_venster.png') });

  // 6. box uitzetten: alleen de maatvoering blijft (box, B en H weg; doorrijhoogtes blijven)
  await p.evaluate(() => window.__pvTest.rwsToon(1)); await p.waitForTimeout(400);
  const telBox = () => p.evaluate(() => document.querySelectorAll('#svgDwars rect[stroke-dasharray="10 4 2 4"]').length);
  const telMaat = () => p.evaluate(() => [...document.querySelectorAll('#svgDwars text')].filter(t => /^3,[0-9]{2}$/.test(t.textContent.trim())).length);
  const voor = { box: await telBox(), maat: await telMaat() };
  if (!(await p.isVisible('#drDialoog[open]'))) { await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]'); }
  await p.uncheck('#drBoxTonen'); await p.waitForTimeout(600);
  await p.click('#drSluit'); await p.waitForTimeout(300);
  await p.evaluate(() => window.__pvTest.rwsToon(1)); await p.waitForTimeout(400);
  const na = { box: await telBox(), maat: await telMaat(), vrij: await p.evaluate(() => [...document.querySelectorAll('#svgDwars text, #svgLangs text')].filter(t => /^vrij /.test(t.textContent.trim())).length) };
  console.log('6 box aan:', JSON.stringify(voor), '| box uit:', JSON.stringify(na));
  if (!(voor.box >= 1)) fouten.push('6: box niet getekend met het vinkje aan');
  if (na.box !== 0) fouten.push('6: box nog getekend met het vinkje uit');
  if (na.vrij !== 0) fouten.push('6: maat "vrij" nog getekend met de box uit');
  if (!(na.maat >= 2)) fouten.push('6: maatvoering (doorrijhoogtes) verdwenen met de box uit');
  await p.screenshot({ path: path.join(H.UIT, 'doorrijprofiel_rws_zonder_box.png') });
  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');

  // 5. (F2) PDF: per profiel een blad, drie decimalen met punt, minimale doorrijhoogte in het tekstvak
  await p.fill('#drRwsWeg', 'Teststraat'); await p.fill('#drKwLijst [data-kwnaam="1"]', 'Testviaduct'); await p.dispatchEvent('#drKwLijst [data-kwnaam="1"]', 'change'); await p.fill('#drRwsMeetdatum', '06-11-2026');
  await p.click('#drSluit');
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Test doorrijprofiel'); z('pdf3D', false); z('pdfRws', true); z('pdfDwarsprofielen', false); });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdfPad = path.join(H.UIT, 'doorrijprofiel_rws.pdf');
  await dl.saveAs(pdfPad);
  const { spawnSync } = require('child_process');
  const py = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'n = 0',
    'for i, pg in enumerate(d):',
    '    t = " ".join(pg.get_text().split())',
    '    if t.startswith("Doorrijprofiel "):',
    '        n += 1; print("RWSBLAD", i + 1, t[:900]); pg.get_pixmap(dpi=70).save(sys.argv[2].replace("N", str(n)))',
  ].join(String.fromCharCode(10)), pdfPad, path.join(H.UIT, 'doorrijprofiel_rws_blad_N.png')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const pdfTekst = py.stdout || '';
  console.log('5 PDF:', pdfTekst.replace(/\s+/g, ' ').slice(0, 900), py.stderr ? py.stderr.slice(0, 300) : '');
  const bladen = (pdfTekst.match(/RWSBLAD/g) || []).length;
  if (bladen !== 2) fouten.push(`5: ${bladen} RWS-bladen in de PDF (verwacht 2)`);
  for (const t of ['3.696', '3.353', 'Teststraat', 'Testviaduct', 'Doorrijprofiel KW1 voor - Testviaduct', 'voorkant kunstwerk 1', 'kant verharding links', '06-11-2026', 'Minimale doorrijhoogte:', '9.000']) if (!pdfTekst.includes(t)) fouten.push(`5: "${t}" niet op het RWS-blad`);
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
