// As op de voorgevels uit de BGT (plan gevel-snoei, F1). Gemaakte straat: maaiveld 10,00 m NAP; vier panden aan de
// noordkant (y groter), voorgevels op y = Y0, behalve pand 2 (1 m ingesprongen, y = Y0 + 1); een ruwe lijn over het
// midden van de straat op y = Y0 − 6. Bomen: T1 1,2 m voor pand 1 (x 15), T2 in het gat tussen pand 1 en 2 (x 21),
// T3 1,2 m voor pand 2 (x 27). Verwacht: de as volgt de voorgevels, straatkant rechts (zuid), T1 en T3 snoeipunt,
// T2 niet (tussen twee panden telt de box niet). Gebruik: node gevel_as.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'gevel_as');
const X0 = 150000, Y0 = 410000, MV = 10;
const PANDEN = [{ x0: 10, x1: 20, voor: 0 }, { x0: 22, x1: 32, voor: 1 }, { x0: 34, x1: 44, voor: 0 }, { x0: 46, x1: 56, voor: 0 }];

function maakData() {
  fs.mkdirSync(UIT, { recursive: true });
  const r = [];
  const punt = (x, y, z) => r.push(`${(X0 + x).toFixed(3)} ${(Y0 + y).toFixed(3)} ${z.toFixed(3)}`);
  const inPand = (x, y) => PANDEN.some(p => x > p.x0 && x < p.x1 && y > p.voor && y < p.voor + 10);
  for (let i = 0; i <= 660; i++) for (let j = -120; j <= 120; j++) { const x = i / 10, y = j / 10; if (!inPand(x, y)) punt(x, y, MV); }
  for (const p of PANDEN) for (let i = p.x0 * 10; i <= p.x1 * 10; i++) for (let k = 0; k <= 60; k++) punt(i / 10, p.voor + 0.03, MV + k / 10);   // voorgevel
  const boom = (xc, yc) => {
    for (let k = 0; k <= 17; k++) punt(xc, yc, MV + k / 10);
    const R = 0.7; for (let a = -R; a <= R + 1e-9; a += 0.1) for (let b = -R; b <= R + 1e-9; b += 0.1) for (let c = -R; c <= R + 1e-9; c += 0.1) if (a * a + b * b + c * c <= R * R) punt(xc + a, yc + b, MV + 2.5 + c);
  };
  boom(15, -1.2); boom(21, -1.0); boom(27, 1 - 1.2);
  const pts = path.join(UIT, 'straat_panden.pts'); fs.writeFileSync(pts, `${r.length}\n${r.join('\n')}\n`);
  const as = path.join(UIT, 'ruwe_lijn.geojson');
  fs.writeFileSync(as, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { naam: 'Straat' }, geometry: { type: 'LineString', coordinates: [[X0 + 2, Y0 - 6], [X0 + 64, Y0 - 6]] } }] }));
  const bgt = path.join(UIT, 'panden.json');
  fs.writeFileSync(bgt, JSON.stringify({ type: 'FeatureCollection', features: PANDEN.map(p => ({ type: 'Feature', properties: { bgtlaag: 'pand' }, geometry: { type: 'Polygon', coordinates: [[[X0 + p.x0, Y0 + p.voor], [X0 + p.x1, Y0 + p.voor], [X0 + p.x1, Y0 + p.voor + 10], [X0 + p.x0, Y0 + p.voor + 10], [X0 + p.x0, Y0 + p.voor]]] } })) }));
  return { pts, as, bgt, n: r.length };
}
const afstandTotLijn = (q, lijn) => { let m = Infinity; for (let i = 1; i < lijn.length; i++) { const a = lijn[i - 1], b = lijn[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12; const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2)); m = Math.min(m, Math.hypot(q.x - a.x - t * dx, q.y - a.y - t * dy)); } return m; };

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
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-oppervlak', 'onder'); localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async (re, max = 240) => { for (let i = 0; i < max * 4; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } return st(); };
  await p.setInputFiles('#ptsBestand', pts); await wacht(/driehoeken/);
  await p.setInputFiles('#asBestand', as); await p.waitForTimeout(1200);
  await p.setInputFiles('#bgtBestand', bgt); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__pvTest.zetWerksoort('snoei')); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(H.UIT, 'gevel_as_voor.png') });
  await p.click('#snoeiKnop'); await p.waitForSelector('#snDialoog[open]');
  await p.selectOption('#snModus', 'gevel'); await p.waitForTimeout(200);
  const velden = await p.evaluate(() => ({ breedte: getComputedStyle(document.getElementById('snBreedte').closest('.rij')).display, afstand: getComputedStyle(document.getElementById('snGevelAfstand').closest('.rij')).display }));
  console.log('F0-fix velden (display):', JSON.stringify(velden));
  if (velden.breedte !== 'none' || velden.afstand === 'none') fouten.push('F0-fix: breedte nog zichtbaar of afstand verborgen in de gevelmodus');
  // as op de voorgevels
  await p.click('#snGevelAs'); await p.waitForTimeout(500);
  const asG = await p.evaluate(() => window.__pvTest.asNu());
  console.log('1 nieuwe as:', asG.naam, '|', asG.punten.length, 'punten |', JSON.stringify(asG.gevel), '|', (await st()).slice(0, 120));
  // 1. de as ligt op de voorgevels (± 0,05 m), in de goede volgorde
  const lijn = asG.punten.map(q => ({ x: q.x - X0, y: q.y - Y0 }));
  for (const pd of PANDEN) for (const x of [pd.x0 + 1, (pd.x0 + pd.x1) / 2, pd.x1 - 1]) {
    const d = afstandTotLijn({ x, y: pd.voor }, lijn);
    if (d > 0.05) fouten.push(`1: voorgevel van pand x ${pd.x0}-${pd.x1} op ${d.toFixed(3)} m van de as`);
  }
  if (!(lijn[0].x < lijn[lijn.length - 1].x)) fouten.push('1: de as loopt niet in de richting van de ruwe lijn');
  if (asG.gevel?.vakken?.length !== 4) fouten.push(`1: ${asG.gevel?.vakken?.length} gevelvakken (verwacht 4)`);
  // 2. de box aan de straatkant (rechts = zuid)
  if (asG.gevel?.kant !== 'R') fouten.push(`2: straatkant ${asG.gevel?.kant} (verwacht R)`);
  const kantSel = await p.evaluate(() => ({ waarde: document.getElementById('snGevelKant').value, uit: document.getElementById('snGevelKant').disabled, info: document.getElementById('snGevelInfo').textContent }));
  console.log('2 straatkant in het venster:', JSON.stringify(kantSel));
  // snoeicheck langs de nieuwe as
  await p.click('#snUitA'); await wacht(/Begroeiing: .* punten in de strook/);
  await p.fill('#snGevelAfstand', '2'); await p.dispatchEvent('#snGevelAfstand', 'input');
  await p.fill('#snHoogte', '4'); await p.dispatchEvent('#snHoogte', 'input');
  await p.click('#snControleer'); await p.waitForTimeout(800);
  const sp = await p.evaluate(() => window.__pvTest.snoeiPunten());
  const bijX = (q, x) => Math.abs(q.x - (X0 + x)) <= 1.2;
  console.log('3 snoeipunten (x):', JSON.stringify(sp?.map(q => ({ x: +(q.x - X0).toFixed(1), y: +(q.y - Y0).toFixed(1), s0: +q.s0.toFixed(2), s1: +q.s1.toFixed(2), o: q.oDicht }))));
  if (!(sp || []).some(q => bijX(q, 15))) fouten.push('3: T1 voor pand 1 is geen snoeipunt');
  if (!(sp || []).some(q => bijX(q, 27))) fouten.push('3: T3 voor het ingesprongen pand 2 is geen snoeipunt');
  // 3. tussen twee panden telt de box niet
  if ((sp || []).some(q => bijX(q, 21))) fouten.push('3: T2 in het gat tussen twee panden is toch een snoeipunt');
  if ((sp || []).length !== 2) fouten.push(`3: ${sp?.length} snoeipunten (verwacht 2)`);
  await p.click('#snSluit'); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(H.UIT, 'gevel_as_na.png') });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
