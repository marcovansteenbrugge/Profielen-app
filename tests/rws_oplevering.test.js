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
  for (let i = 0; i <= 1000; i++) for (let j = -80; j <= 80; j++) { const s = i / 10, o = j / 10; if (s >= 35 && s <= 37 && o >= 0.5 && o <= 2) continue; punt(s, o, weg(s, o)); }   // gat onder KW1 (F1: weg niet gemeten)
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

  // F1-3. oordeel zonder "m² weg niet gemeten" (staat al bij "weg gemeten onder het dak"), percentage groot
  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');
  const res = await p.evaluate(() => ({ tekst: document.getElementById('drResultaat').textContent, pct: !!document.querySelector('#drResultaat .drPct'), oordeel: document.querySelector('#drResultaat tr.oordeel td')?.textContent }));
  console.log('F1-3 venster: oordeel', JSON.stringify(res.oordeel), '| groot %:', res.pct, '| gat genoemd:', /niet gemeten/.test(res.tekst));
  if (/m² weg niet gemeten/.test(res.oordeel || '')) fouten.push('F1-3: oordeel noemt nog de m² weg niet gemeten');
  if (!res.pct) fouten.push('F1-3: percentage weg gemeten niet groot');
  if (!/niet gemeten/.test(res.tekst)) fouten.push('F1-3: testgat in de weg niet gevonden (testopzet)');
  // F2. invulvelden
  const invul = { drRwsWeg: 'Bergseweg', drRwsOpdrachtgever: 'Rijkswaterstaat', drRwsMeetbedrijf: 'Lutrea', drRwsMeetmethode: 'mobiele laserscan, type X', drRwsUitgevoerd: 'M. van Steenbrugge', drRwsGecontroleerd: 'J. Jansen' };
  for (const [id, w] of Object.entries(invul)) { await p.fill('#' + id, w); await p.dispatchEvent('#' + id, 'input'); }
  await p.click('#drSluit'); await p.waitForTimeout(300);

  // F1-1/2. RWS-opleverset: bovenaanzicht, Doorrijhoogte (overzicht), lengteprofiel, de doorsnedes, in die volgorde
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Test RWS-opleverset'); z('pdfRwsSet', true); });
  const vinkjes = await p.evaluate(() => Object.fromEntries(['pdfBovenaanzicht', 'pdfDoorrij', 'pdfLengteprofiel', 'pdfRws', 'pdfDwarsprofielen', 'pdf3D'].map(k => [k, document.getElementById(k)?.checked])));
  console.log('F1-1 vinkjes na de keuze:', JSON.stringify(vinkjes));
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdf2 = path.join(H.UIT, 'rws_opleverset.pdf'); await dl2.saveAs(pdf2);
  const py2 = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'for i, pg in enumerate(d):',
    '    t = " ".join(pg.get_text().split())',
    '    print("BLAD", i + 1, t[:8000])',
    '    if t.startswith("Doorrijhoogte"): pg.get_pixmap(dpi=90).save(sys.argv[2])',
  ].join(String.fromCharCode(10)), pdf2, path.join(H.UIT, 'rws_opleverset_blad2.png')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const bladen = (py2.stdout || '').split(/\r?\n/).filter(l => l.startsWith('BLAD'));
  const soort = (l) => /^BLAD 1 N 0 /.test(l) || /ONDERDEEL Bovenaanzicht/.test(l) ? 'boven' : /^BLAD \d+ Doorrijhoogte/.test(l) ? 'doorrij' : /^BLAD \d+ Lengteprofiel/.test(l) ? 'lengte' : /^BLAD \d+ Doorrijprofiel (KW\d (voor|achter))/.test(l) ? l.match(/Doorrijprofiel (KW\d (voor|achter))/)[1] : 'ander';
  const volgorde = bladen.map(soort);
  console.log('F1-1 bladen:', volgorde.join(', '), py2.stderr ? py2.stderr.slice(0, 200) : '');
  const verwacht = ['boven', 'doorrij', 'lengte', 'KW1 voor', 'KW1 achter', 'KW2 voor', 'KW2 achter'];
  if (volgorde.join('|') !== verwacht.join('|')) fouten.push(`F1-1: bladen ${volgorde.join(', ')} (verwacht ${verwacht.join(', ')})`);
  const b2 = bladen.find(l => soort(l) === 'doorrij') || '';
  for (const t of ['1. Wat is getest', '2. Welke profielen', '3. Resultaat', '4. Doorrijhoogtes per doorsnede', 'KW1 voor', 'KW2 achter', 'kant links', 'kant rechts', 'Oordeel']) if (!b2.includes(t)) fouten.push(`F1-2: "${t}" niet op blad 2`);
  if (/m² weg niet gemeten/.test(b2.split('Oordeel')[1] || '')) fouten.push('F1-3: oordeel op blad 2 noemt de m²');
  // F2-1. de invulvelden op blad 2 en op elk RWS-blad, de opdrachtgever in het titelblok
  for (const w of ['Lutrea', 'mobiele laserscan, type X', 'M. van Steenbrugge', 'J. Jansen', 'Bergseweg']) if (!b2.includes(w)) fouten.push(`F2-1: "${w}" niet op blad 2`);
  const rwsBladen = bladen.filter(l => /^BLAD \d+ Doorrijprofiel KW/.test(l));
  for (const l of rwsBladen) for (const w of ['Meetbedrijf: Lutrea', 'Uitgevoerd door: M. van Steenbrugge', 'Gecontroleerd door: J. Jansen']) {
    const [k, v] = w.split(': ');
    if (!l.includes(k) || !l.includes(v)) { fouten.push(`F2-1: "${w}" niet op ${l.slice(0, 40)}`); break; }
  }
  if (!b2.includes('Rijkswaterstaat')) fouten.push('F2-1: opdrachtgever niet in het titelblok van blad 2');
  console.log('F2-1 invulvelden: blad 2', ['Lutrea', 'J. Jansen', 'Rijkswaterstaat'].map(w => b2.includes(w)).join('/'), '| RWS-bladen', rwsBladen.length);
  await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(300);
  if (await p.isVisible('#pdfDialoog[open]')) await p.evaluate(() => document.getElementById('pdfDialoog')?.close());
  await p.evaluate(() => { const e = document.getElementById('pdfRwsSet'); if (e) { e.checked = false; e.dispatchEvent(new Event('change')); } });

  // F4. toets bewaren: na opslaan en openen (zonder de scan) dezelfde uitkomst en dezelfde getallen op blad 2
  const voor = await p.evaluate(() => window.__pvTest.doorrijVingerafdruk());
  const getallen = (t) => (t.split('4. Doorrijhoogtes per doorsnede')[1] || '').match(/\d+\.\d{3}/g) || [];
  const b2Voor = getallen(b2);
  await p.evaluate(() => document.getElementById('status').textContent = '');
  const na = await p.evaluate(() => window.__pvTest.projectRondjeVol()); await p.waitForTimeout(800);
  const status = await st();
  console.log('F4-1 voor:', JSON.stringify(voor).slice(0, 200));
  console.log('F4-1 na  :', JSON.stringify(na).slice(0, 200));
  console.log('F4-2 status:', status.slice(0, 160));
  if (JSON.stringify(voor) !== JSON.stringify(na)) fouten.push('F4-1: uitkomst na opslaan en openen anders dan ervoor');
  if (!voor.doorsnedes.length || voor.doorsnedes.length !== 4) fouten.push(`F4-1: ${voor.doorsnedes.length} doorsnedes bewaard (verwacht 4)`);
  if (!/hersteld, zelfde uitkomst/.test(status)) fouten.push('F4-2: status meldt niet "toets … hersteld, zelfde uitkomst"');
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfRwsSet', true); });
  const [dl4] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdf4 = path.join(H.UIT, 'rws_opleverset_na_openen.pdf'); await dl4.saveAs(pdf4);
  const py4 = spawnSync('python', ['-I', '-c', ['import sys, pymupdf', 'd = pymupdf.open(sys.argv[1])', 'for pg in d:', '    t = " ".join(pg.get_text().split())', '    if t.startswith("Doorrijhoogte"): print(t[:8000]); break'].join(String.fromCharCode(10)), pdf4], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const b2Na = getallen(py4.stdout || '');
  console.log('F4-3 getallen blad 2 voor/na:', b2Voor.length, '/', b2Na.length, '| gelijk:', b2Voor.join(',') === b2Na.join(','));
  if (!b2Voor.length || b2Voor.join(',') !== b2Na.join(',')) fouten.push('F4-3: getallen op blad 2 na openen anders dan ervoor');
  await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(300);
  if (await p.isVisible('#pdfDialoog[open]')) await p.evaluate(() => document.getElementById('pdfDialoog')?.close());
  await p.evaluate(() => { const e = document.getElementById('pdfRwsSet'); if (e) { e.checked = false; e.dispatchEvent(new Event('change')); } });

  // F0-5. automatisch bereik bij verh. 1: het hele kunstwerk (tot de bovenkant) staat in het PDF-lengteprofiel
  await p.fill('#langsHoogteVan', ''); await p.dispatchEvent('#langsHoogteVan', 'change');
  await p.fill('#langsHoogteTot', ''); await p.dispatchEvent('#langsHoogteTot', 'change');
  await p.fill('#langsOverdrijving', '1'); await p.dispatchEvent('#langsOverdrijving', 'change'); await p.waitForTimeout(400);
  const scherm1 = await p.evaluate(() => window.__pvTest.langsAs());
  console.log('F0-5 scherm verh. 1:', JSON.stringify({ hMax: +scherm1.hMax.toFixed(2) }));
  if (!(scherm1.hMax >= 15.9)) fouten.push(`F0-5: bovenkant van KW2 (15,90) valt buiten het lengteprofiel (hMax ${scherm1.hMax})`);
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfRwsSet', false); z('pdfLengteprofiel', true); z('pdfDwarsprofielen', false); z('pdfRws', false); z('pdfDoorrij', false); z('pdfBovenaanzicht', false); });
  const [dl3] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdf3 = path.join(H.UIT, 'rws_lengte_verh1.pdf'); await dl3.saveAs(pdf3);
  spawnSync('python', ['-I', '-c', 'import sys, pymupdf; d = pymupdf.open(sys.argv[1]); d[0].get_pixmap(dpi=80).save(sys.argv[2])', pdf3, path.join(H.UIT, 'rws_lengte_verh1.png')]);
  await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(300);
  if (await p.isVisible('#pdfDialoog[open]')) await p.evaluate(() => document.getElementById('pdfDialoog')?.close());
  await p.fill('#langsHoogteVan', '9'); await p.dispatchEvent('#langsHoogteVan', 'change');
  await p.fill('#langsHoogteTot', '18'); await p.dispatchEvent('#langsHoogteTot', 'change');

  // F0-4. het bereik komt terug na opslaan en openen
  await p.evaluate(() => window.__pvTest.projectRondje()); await p.waitForTimeout(1500);
  const velden = await p.evaluate(() => [document.getElementById('langsHoogteVan').value, document.getElementById('langsHoogteTot').value]);
  console.log('F0-4 na opslaan en openen:', JSON.stringify(velden));
  if (velden[0] !== '9' || velden[1] !== '18') fouten.push('F0-4: hoogtebereik komt niet terug na opslaan en openen');
  // F2-2. de invulvelden komen terug na opslaan en openen
  const inst = await p.evaluate(() => window.__pvTest.doorrijInst().rws);
  const opdr = await p.evaluate(() => document.getElementById('pdfOpdrachtgever')?.value);
  console.log('F2-2 na opslaan en openen:', JSON.stringify({ meetbedrijf: inst?.meetbedrijf, uitgevoerd: inst?.uitgevoerd, gecontroleerd: inst?.gecontroleerd, opdr }));
  if (inst?.meetbedrijf !== 'Lutrea' || inst?.meetmethode !== 'mobiele laserscan, type X' || inst?.uitgevoerd !== 'M. van Steenbrugge' || inst?.gecontroleerd !== 'J. Jansen') fouten.push('F2-2: invulvelden komen niet terug na opslaan en openen');
  if (opdr !== 'Rijkswaterstaat') fouten.push('F2-2: opdrachtgever komt niet terug');

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
