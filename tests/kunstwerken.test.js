// Meerdere kunstwerken (plan kunstwerken-doorsnedes, F0): twee viaducten achter elkaar langs één as. Per
// kunstwerk een doorsnede aan de voorkant en de achterzijde, meetpunten kant verharding links, as en kant
// verharding rechts, een RWS-blad per doorsnede, samenvoegen bij een groter gat, eigen station, oud project.
// Gemaakte wolk met bekende maten: weg met 2 % langs- en 2,5 % dwarshelling; KW1 (dak 14,60 m NAP) van st. 30
// tot 45, KW2 (dak 15,20 m NAP) van st. 60 tot 75; BGT-wegdeel van 4 m links tot 4 m rechts van de as.
// Gebruik: node kunstwerken.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'kunstwerken');
const X0 = 150000, Y0 = 410000;
const weg = (s, o) => 10 + 0.02 * s + 0.025 * o;   // o: + = rechts (as naar +x, rechts = −y)
const KW = [{ van: 30, tot: 45, dak: 14.6 }, { van: 60, tot: 75, dak: 15.2 }];
const dakOp = (s) => (KW.find(k => s >= k.van - 0.5 && s <= k.tot + 0.5) || {}).dak;

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

  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');
  await p.click('#drUitA'); await wacht(/ — [0-9.]+ punten in de strook/);
  await p.fill('#drBoxen [data-veld="breedte"]', '3.5'); await p.fill('#drBoxen [data-veld="hoogte"]', '4.2');
  await p.click('#drControleer'); await p.waitForTimeout(800);
  const meten = async () => { await p.evaluate(() => document.getElementById('status').textContent = ''); await p.click('#drRwsMeten'); await wacht(/Doorrijprofiel: \d+ doorsnedes|Doorrijprofiel: geen/); return p.evaluate(() => window.__pvTest.rws()); };

  // 1. twee kunstwerken, vier doorsnedes op de dakranden
  const kws = await p.evaluate(() => window.__pvTest.kunstwerken());
  console.log('1 kunstwerken:', JSON.stringify(kws));
  if (kws?.length !== 2 || Math.abs(kws[0].van - 30) > 0.2 || Math.abs(kws[0].tot - 45) > 0.2 || Math.abs(kws[1].van - 60) > 0.2 || Math.abs(kws[1].tot - 75) > 0.2) fouten.push('1: niet twee kunstwerken op st. 30–45 en 60–75');
  const lijstTekst = await p.textContent('#drKwLijst');
  if (!/KW1/.test(lijstTekst) || !/KW2/.test(lijstTekst)) fouten.push('1: KW1 en KW2 niet in het venster');
  let rws = await meten();
  console.log('1 doorsnedes:', rws.map(d => `${d.label} st. ${d.station}`).join(', '));
  const verwacht = [['KW1 voor', 30.2], ['KW1 achter', 44.8], ['KW2 voor', 60.2], ['KW2 achter', 74.8]];
  if (rws.length !== 4) fouten.push(`1: ${rws.length} doorsnedes (verwacht 4)`);
  verwacht.forEach(([l, s], i) => { const d = rws[i]; if (!d || d.label !== l || Math.abs(d.station - s) > 0.3) fouten.push(`1: doorsnede ${i + 1} is ${d?.label} op ${d?.station} (verwacht ${l} op ± ${s})`); });

  // 2. meetpunten kant verharding links, as en kant verharding rechts, met de juiste doorrijhoogte (< 1 cm)
  for (const d of rws) {
    const soorten = d.meetpunten.map(m => m.soort).join(',');
    if (soorten !== 'kant,as,kant') fouten.push(`2: ${d.label}: meetpunten ${soorten} (verwacht kant,as,kant)`);
    for (const m of d.meetpunten) {
      const v = dakOp(d.station) - weg(d.station, m.offset);
      if (m.h == null || Math.abs(m.h - v) >= 0.01) fouten.push(`2: ${d.label} op ${m.offset}: ${m.h} (verwacht ${v.toFixed(4)})`);
    }
  }
  console.log('2 hoogtes KW2 achter:', rws[3]?.meetpunten.map(m => `${m.soort} ${m.offset}: ${m.h?.toFixed(3)}`).join(' | '));
  await p.screenshot({ path: path.join(H.UIT, 'kunstwerken_venster.png') });

  // F1. lengteprofiel: per doorsnede een lijn met label en de maat op de as; slepen verschuift en meet opnieuw
  await p.click('#drSluit'); await p.waitForTimeout(400);
  const grepen = await p.evaluate(() => ['1-voor', '1-achter', '2-voor', '2-achter'].map(k => window.__pvTest.kwGreep(k)));
  const maten = await p.evaluate(() => window.__pvTest.kwMaten());
  const asMaten = rws.map(d => d.meetpunten.find(m => m.soort === 'as')?.h?.toFixed(3));
  console.log('F1 grepen:', JSON.stringify(grepen.map(g => g && Math.round(g.x))), '| maten:', maten.join(', '), '| as:', asMaten.join(', '));
  if (grepen.some(g => !g)) fouten.push('F1: niet bij elke doorsnede een label in het lengteprofiel');
  for (const m of asMaten) if (!maten.includes(m)) fouten.push(`F1: maat ${m} op de as niet in het lengteprofiel`);
  await p.locator('#svgLangs').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(H.UIT, 'kunstwerken_lengteprofiel.png') });
  // pannen naast een label werkt nog en verschuift geen doorsnede
  const box = await p.locator('#svgLangs').boundingBox();
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7); await p.mouse.down(); await p.mouse.move(box.x + box.width * 0.5 + 40, box.y + box.height * 0.7, { steps: 4 }); await p.mouse.up();
  const naPan = await p.evaluate(() => window.__pvTest.rws().map(d => d.station));
  if (naPan[1] !== rws[1].station) fouten.push('F1: pannen verschoof een doorsnede');
  await p.evaluate(() => { document.getElementById('langsZoomReset')?.click(); });
  // slepen: KW1 achter naar st. 42
  const g1 = await p.evaluate(() => window.__pvTest.kwGreep('1-achter'));
  const x42 = await p.evaluate(() => window.__pvTest.langsXVoor(42));
  await p.evaluate(() => document.getElementById('status').textContent = '');
  await p.mouse.move(g1.x, g1.y); await p.mouse.down(); await p.mouse.move(x42, g1.y, { steps: 8 }); await p.mouse.up();
  await wacht(/KW1 achter op st\./);
  let na = await p.evaluate(() => window.__pvTest.rws());
  const kw1aN = na.find(d => d.sleutel === '1-achter' || d.label === 'KW1 achter');
  const asN = kw1aN?.meetpunten.find(m => m.soort === 'as');
  console.log('F1 na slepen: KW1 achter st.', kw1aN?.station, '| as', asN?.h?.toFixed(3), '|', (await st()).slice(0, 90));
  if (!kw1aN || Math.abs(kw1aN.station - 42) > 0.25) fouten.push(`F1: KW1 achter na slepen op ${kw1aN?.station} (verwacht ± 42)`);
  if (!asN || Math.abs(asN.h - (dakOp(kw1aN.station) - weg(kw1aN.station, 0))) >= 0.01) fouten.push('F1: na slepen is de doorsnede niet opnieuw gemeten');
  await p.screenshot({ path: path.join(H.UIT, 'kunstwerken_lengteprofiel_gesleept.png') });
  // bewaard in het project
  const inst = await p.evaluate(() => window.__pvTest.doorrijInst());
  if (Math.abs(Number(inst.rws?.doorsnedes?.['1-achter']) - kw1aN.station) > 0.001) fouten.push('F1: het verschoven station staat niet in het project');
  // dubbelklik op het label: terug op automatisch
  const g2 = await p.evaluate(() => window.__pvTest.kwGreep('1-achter'));
  await p.evaluate(() => document.getElementById('status').textContent = '');
  await p.mouse.dblclick(g2.x, g2.y); await wacht(/KW1 achter op st\./);
  na = await p.evaluate(() => window.__pvTest.rws());
  console.log('F1 na dubbelklik: KW1 achter st.', na[1].station);
  if (Math.abs(na[1].station - 44.8) > 0.3) fouten.push('F1: dubbelklik zet KW1 achter niet terug op automatisch');
  rws = na;
  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');

  // 3. PDF: vier RWS-bladen, elk met het label en de naam van zijn kunstwerk
  await p.fill('#drKwLijst [data-kwnaam="1"]', 'Viaduct Noord'); await p.dispatchEvent('#drKwLijst [data-kwnaam="1"]', 'change');
  await p.fill('#drKwLijst [data-kwnaam="2"]', 'Viaduct Zuid'); await p.dispatchEvent('#drKwLijst [data-kwnaam="2"]', 'change');
  await p.click('#drSluit');
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Test kunstwerken'); z('pdf3D', false); z('pdfRws', true); z('pdfDwarsprofielen', false); });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdfPad = path.join(H.UIT, 'kunstwerken.pdf');
  await dl.saveAs(pdfPad);
  const { spawnSync } = require('child_process');
  const py = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'n = 0',
    'for i, pg in enumerate(d):',
    '    t = " ".join(pg.get_text().split())',
    '    if t.startswith("Doorrijprofiel "):',
    '        n += 1; print("RWSBLAD", t[:60]); pg.get_pixmap(dpi=70).save(sys.argv[2].replace("N", str(n)))',
  ].join(String.fromCharCode(10)), pdfPad, path.join(H.UIT, 'kunstwerken_blad_N.png')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const bladen = (py.stdout || '').split('\n').filter(l => l.startsWith('RWSBLAD'));
  console.log('3 PDF:', bladen.join(' / '), py.stderr ? py.stderr.slice(0, 300) : '');
  if (bladen.length !== 4) fouten.push(`3: ${bladen.length} RWS-bladen (verwacht 4)`);
  for (const t of ['KW1 voor - Viaduct Noord', 'KW1 achter - Viaduct Noord', 'KW2 voor - Viaduct Zuid', 'KW2 achter - Viaduct Zuid']) if (!bladen.some(l => l.includes(t))) fouten.push(`3: geen blad "${t}"`);
  await p.keyboard.press('Escape').catch(() => {});

  // 4. samenvoegen bij een groter gat (20 m > 15 m tussen de daken): één kunstwerk, twee doorsnedes
  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');
  await p.fill('#drKwGat', '20'); await p.dispatchEvent('#drKwGat', 'change');
  await p.click('#drControleer'); await p.waitForTimeout(800);
  rws = await meten();
  console.log('4 met gat 20 m:', rws.map(d => `${d.label} st. ${d.station}`).join(', '));
  if (rws.length !== 2 || Math.abs(rws[0].station - 30.2) > 0.3 || Math.abs(rws[1].station - 74.8) > 0.3) fouten.push('4: met een gat van 20 m geen één kunstwerk van st. 30 tot 75');
  await p.fill('#drKwGat', ''); await p.dispatchEvent('#drKwGat', 'change');
  await p.click('#drControleer'); await p.waitForTimeout(800);

  // 5. eigen station voor KW1 achter
  await p.fill('#drKwLijst [data-doorsnede="1-achter"]', '43'); await p.dispatchEvent('#drKwLijst [data-doorsnede="1-achter"]', 'change'); await p.waitForTimeout(200);
  rws = await meten();
  const kw1a = rws.find(d => d.label === 'KW1 achter');
  console.log('5 eigen station KW1 achter:', kw1a?.station);
  if (!kw1a || Math.abs(kw1a.station - 43) > 0.01) fouten.push('5: KW1 achter niet op het ingevulde station 43');

  // 6. project van vóór 2.16.0 (profiel 1 en 2): p1 = KW1 voor, p2 = achterzijde van het laatste kunstwerk
  await p.evaluate(() => window.__pvTest.rwsOudeStations('31', '73'));
  rws = await meten();
  console.log('6 doorsnedes met oude p1/p2:', rws.map(d => `${d.label} st. ${d.station}`).join(', '));
  if (rws.length !== 4 || Math.abs(rws[0].station - 31) > 0.01 || Math.abs(rws[3].station - 73) > 0.01) fouten.push('6: oude stations p1/p2 niet op KW1 voor en KW2 achter');
  await p.evaluate(() => document.querySelector('#drKwLijst [data-doorsnede="2-voor"]')?.focus());
  await p.fill('#drKwLijst [data-doorsnede="2-voor"]', '61.5'); await p.dispatchEvent('#drKwLijst [data-doorsnede="2-voor"]', 'change'); await p.waitForTimeout(200);
  const terug = await p.evaluate(() => window.__pvTest.projectRondje());
  if (Number(terug.rws?.doorsnedes?.['2-voor']) !== 61.5) fouten.push('F1: een verschoven station komt niet terug na opslaan en openen');
  console.log('6 na opslaan en openen:', JSON.stringify({ p1: terug.rws?.p1, p2: terug.rws?.p2, doorsnedes: terug.rws?.doorsnedes, objecten: terug.rws?.objecten }));
  if (terug.rws?.p1 !== '31' || terug.rws?.p2 !== '73' || terug.rws?.objecten?.[1] !== 'Viaduct Zuid') fouten.push('6: stations of namen van de kunstwerken komen niet terug na opslaan en openen');

  // F2. tool Doorrijhoogte: de dwarsprofielen zijn alleen de doorsnedes (scherm en PDF); vinkje uit = gewone profielen
  await p.evaluate(() => window.__pvTest.rwsOudeStations('', ''));
  await p.evaluate(() => window.__pvTest.zetWerksoort('doorrij')); await p.waitForTimeout(300);
  if (!(await p.isVisible('#drDialoog[open]'))) { await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]'); }
  await p.click('#drControleer'); await p.waitForTimeout(800);
  rws = await meten();
  await p.click('#drSluit'); await p.waitForTimeout(300);
  let ds = await p.evaluate(() => window.__pvTest.dwarsStations());
  const kwSt = rws.map(d => d.station).sort((a, b) => a - b);
  console.log('F2 dwarsprofielen:', ds.join(', '), '| vinkje zichtbaar:', await p.isVisible('#dwarsAlleenKw'));
  if (ds.length !== 4 || ds.some((v, i) => Math.abs(v - kwSt[i]) > 1e-6)) fouten.push(`F2: dwarsprofielen zijn niet de vier doorsnedes (${ds.join(', ')})`);
  if (!(await p.isVisible('#dwarsAlleenKw'))) fouten.push('F2: vinkje "alleen doorsnedes" niet zichtbaar in Doorrijhoogte');
  if (!(await p.isDisabled('#dwarsInterval'))) fouten.push('F2: interval niet uitgeschakeld');
  // ◀ ▶ gaat langs de vier doorsnedes
  const labels = [];
  await p.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById('vorigeStation')?.click(); });
  for (let i = 0; i < 4; i++) { labels.push((await p.textContent('#stationLabel')).trim()); await p.click('#volgendeStation').catch(() => {}); await p.waitForTimeout(150); }
  console.log('F2 ◀ ▶:', labels.map(l => l.slice(0, 40)).join(' / '));
  ['KW1 voor', 'KW1 achter', 'KW2 voor', 'KW2 achter'].forEach((l, i) => { if (!labels[i]?.includes(l)) fouten.push(`F2: dwarsprofiel ${i + 1} is niet ${l} (${labels[i]})`); });
  await p.screenshot({ path: path.join(H.UIT, 'kunstwerken_alleen_doorsnedes.png') });
  // PDF: geen gewone dwarsprofielbladen, wel de vier RWS-bladen
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdf3D', false); z('pdfRws', true); z('pdfDwarsprofielen', true); });
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdf2 = path.join(H.UIT, 'kunstwerken_alleen.pdf'); await dl2.saveAs(pdf2);
  const py2 = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'for pg in d:',
    '    t = " ".join(pg.get_text().split())',
    '    print("RWS" if t.startswith("Doorrijprofiel ") else ("DWARS" if "Dwarsprofielen station" in t else "ANDER"))',
  ].join(String.fromCharCode(10)), pdf2], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const soorten = (py2.stdout || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  console.log('F2 PDF-bladen:', soorten.join(' '), py2.stderr ? py2.stderr.slice(0, 200) : '');
  if (soorten.filter(x => x === 'RWS').length !== 4) fouten.push('F2: niet vier RWS-bladen');
  if (soorten.includes('DWARS')) fouten.push('F2: toch gewone dwarsprofielbladen in de PDF');
  await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(300);
  if (await p.isVisible('#pdfDialoog[open]')) await p.evaluate(() => document.getElementById('pdfDialoog')?.close());
  // vinkje uit: de gewone dwarsprofielen om de 5 m komen terug
  await p.uncheck('#dwarsAlleenKw'); await p.waitForTimeout(300);
  ds = await p.evaluate(() => window.__pvTest.dwarsStations());
  console.log('F2 vinkje uit:', ds.length, 'dwarsprofielen');
  if (ds.length !== 21) fouten.push(`F2: met het vinkje uit ${ds.length} dwarsprofielen (verwacht 21, elke 5 m)`);
  await p.check('#dwarsAlleenKw');

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
