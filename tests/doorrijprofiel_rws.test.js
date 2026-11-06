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
  await p.click('#drRwsMeten'); await wacht(/Doorrijprofiel: profiel 1/);
  let rws = await p.evaluate(() => window.__pvTest.rws());
  console.log('1 profielen:', JSON.stringify(rws));
  const [p1, p2] = rws;
  if (!(Math.abs(p1.station - 40.2) <= 0.25 && Math.abs(p2.station - 59.8) <= 0.25)) fouten.push(`1: profielen niet op de dakranden (${p1.station}, ${p2.station})`);
  for (const pr of rws) {
    const kant = pr.meetpunten.filter(m => m.soort === 'kant');
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

  // 3. minimale doorrijhoogte per rijbaan = kleinste vrije hoogte van de box
  const r = await p.evaluate(() => window.__pvTest.doorrij());
  const minTekst = r.boxen[0].vrijMin.toFixed(3).replace('.', ',');
  const tabel3 = await p.textContent('#drRwsResultaat');
  console.log('3 minimale doorrijhoogte rijbaan:', minTekst, '| in de tabel:', tabel3.includes(minTekst));
  if (!tabel3.includes(minTekst)) fouten.push('3: minimale doorrijhoogte per rijbaan niet in de tabel');
  await p.screenshot({ path: path.join(H.UIT, 'doorrijprofiel_rws_venster.png') });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
