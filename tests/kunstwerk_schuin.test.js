// Schuin kunstwerk (plan kunstwerken-doorsnedes, F3): een viaduct dat onder 20° schuin over de weg ligt. De
// doorsnedes lopen evenwijdig aan de rand van het kunstwerk; de hoek komt uit de dakpunten; een ingevulde hoek
// gaat voor. Gemaakte wolk met bekende maten: weg met 2 % langs- en 2,5 % dwarshelling; dak (onderkant 14,60 m
// NAP) van st. 40 tot 55 op de as, met de randen op st = 40 + o·tan 20° en 55 + o·tan 20° (o + = rechts);
// BGT-wegdeel van 4 m links tot 4 m rechts van de as.
// Gebruik: node kunstwerk_schuin.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'kunstwerk_schuin');
const X0 = 150000, Y0 = 410000;
const weg = (s, o) => 10 + 0.02 * s + 0.025 * o;   // o: + = rechts (as naar +x, rechts = −y)
const DAK = 14.6, HOEK = 20, T = Math.tan(HOEK * Math.PI / 180);

function maakData() {
  fs.mkdirSync(UIT, { recursive: true });
  const r = [];
  const punt = (s, o, z) => r.push(`${(X0 + s).toFixed(3)} ${(Y0 - o).toFixed(3)} ${z.toFixed(4)}`);
  for (let i = 0; i <= 1000; i++) for (let j = -80; j <= 80; j++) punt(i / 10, j / 10, weg(i / 10, j / 10));
  for (let j = -60; j <= 60; j++) {
    const o = j / 10, van = 40 + o * T, tot = 55 + o * T;
    for (let s = Math.ceil(van * 10) / 10; s <= tot + 1e-9; s += 0.1) { punt(s, o, DAK); punt(s, o, DAK + 0.7); }
  }
  const pts = path.join(UIT, 'schuin_viaduct.pts');
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

  // 1. de hoek uit de dakpunten: 20° ± 1°
  const kws = await p.evaluate(() => window.__pvTest.kunstwerken());
  console.log('1 kunstwerken:', JSON.stringify(kws));
  const hoek = kws?.[0]?.rand?.hoek;
  if (kws?.length !== 1) fouten.push(`1: ${kws?.length} kunstwerken (verwacht 1)`);
  if (hoek == null || Math.abs(hoek - HOEK) > 1) fouten.push(`1: hoek ${hoek} (verwacht ${HOEK} ± 1)`);

  // 2. doorsneden evenwijdig aan de rand, 0,2 m binnen de rand op de as (st. 40,2 en 54,8)
  let rws = await meten();
  console.log('2 doorsnedes:', rws.map(d => `${d.label} st. ${d.station.toFixed(2)} hoek ${d.hoek}`).join(', '));
  if (rws.length !== 2 || Math.abs(rws[0].station - 40.2) > 0.3 || Math.abs(rws[1].station - 54.8) > 0.3) fouten.push('2: doorsnedes niet 0,2 m binnen de rand op de as');
  for (const d of rws) if (Math.abs(d.hoek - HOEK) > 1) fouten.push(`2: ${d.label}: hoek ${d.hoek}`);
  const lijn = await p.evaluate((s) => window.__pvTest.dwarslijnScherm(s), rws[0].station);
  // richting van de lijn in RD: dx = Δstation, dy = −Δoffset (rechts = −y); verwacht Δstation/Δoffset = tan 20°
  const dS = lijn.b.x - lijn.a.x, dO = -(lijn.b.y - lijn.a.y);
  console.log('2 lijn in RD:', JSON.stringify({ dS: dS.toFixed(3), dO: dO.toFixed(3), tan: (dS / dO).toFixed(4) }));
  if (Math.abs(dS / dO - T) > 0.02) fouten.push(`2: de doorsnede ligt niet evenwijdig aan de rand (tan ${(dS / dO).toFixed(4)}, verwacht ${T.toFixed(4)})`);

  // 3. doorrijhoogte op kant verharding links, as en kant verharding rechts < 1 cm (weg op het punt van de schuine lijn)
  for (const d of rws) {
    const soorten = d.meetpunten.map(m => m.soort).join(',');
    if (soorten !== 'kant,as,kant') fouten.push(`3: ${d.label}: meetpunten ${soorten}`);
    for (const m of d.meetpunten) {
      const h = d.hoek * Math.PI / 180, s = d.station + m.offset * Math.sin(h), o = m.offset * Math.cos(h);
      const v = DAK - weg(s, o);
      if (m.h == null || Math.abs(m.h - v) >= 0.01) fouten.push(`3: ${d.label} op ${m.offset.toFixed(2)}: ${m.h} (verwacht ${v.toFixed(4)})`);
      if (m.soort === 'kant' && Math.abs(Math.abs(o) - 3.95) > 0.02) fouten.push(`3: ${d.label}: kant verharding niet op 3,95 m haaks op de as (${o.toFixed(3)})`);
    }
  }
  console.log('3 KW1 voor:', rws[0].meetpunten.map(m => `${m.soort} ${m.offset.toFixed(2)}: ${m.h?.toFixed(3)}`).join(' | '));
  await p.click('#drSluit'); await p.waitForTimeout(400);
  await p.evaluate(() => { for (let i = 0; i < 3; i++) document.getElementById('vorigeStation')?.click(); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(H.UIT, 'kunstwerk_schuin.png') });

  // 4. ingevulde hoek gaat voor
  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');
  await p.fill('#drKwLijst [data-kwhoek="1"]', '15'); await p.dispatchEvent('#drKwLijst [data-kwhoek="1"]', 'change'); await p.waitForTimeout(200);
  rws = await meten();
  console.log('4 met hoek 15:', rws.map(d => `${d.label} hoek ${d.hoek}`).join(', '));
  if (rws.some(d => d.hoek !== 15)) fouten.push('4: de ingevulde hoek van 15° gaat niet voor');
  await p.fill('#drKwLijst [data-kwhoek="1"]', ''); await p.dispatchEvent('#drKwLijst [data-kwhoek="1"]', 'change'); await p.waitForTimeout(200);
  rws = await meten();
  if (rws.some(d => Math.abs(d.hoek - HOEK) > 1)) fouten.push('4: na leegmaken niet terug op de automatische hoek');

  // 5. RWS-blad noemt de hoek
  await p.click('#drSluit');
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Test schuin'); z('pdf3D', false); z('pdfRws', true); z('pdfBovenaanzicht', true); z('pdfDwarsprofielen', false); });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdfPad = path.join(H.UIT, 'kunstwerk_schuin.pdf'); await dl.saveAs(pdfPad);
  const { spawnSync } = require('child_process');
  const py = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'n = 0',
    'for pg in d:',
    '    t = " ".join(pg.get_text().split())',
    '    if t.startswith("Doorrijprofiel "):',
    '        n += 1; print("RWSBLAD", t[:140]); pg.get_pixmap(dpi=70).save(sys.argv[2].replace("N", str(n)))',
    '    elif "ONDERDEEL Bovenaanzicht" in t: pg.get_pixmap(dpi=110).save(sys.argv[2].replace("N", "boven"))',
  ].join(String.fromCharCode(10)), pdfPad, path.join(H.UIT, 'kunstwerk_schuin_blad_N.png')], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const bladen = (py.stdout || '').split(/\r?\n/).filter(l => l.startsWith('RWSBLAD'));
  console.log('5 PDF:', bladen.join(' / '), py.stderr ? py.stderr.slice(0, 200) : '');
  if (bladen.length !== 2 || bladen.some(l => !/schuin 2\d\.\d gr/.test(l))) fouten.push('5: RWS-bladen noemen de schuine hoek niet');

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
