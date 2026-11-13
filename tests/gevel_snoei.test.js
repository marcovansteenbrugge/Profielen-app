// Snoeien langs gevels (plan gevel-snoei). Gemaakte straat: maaiveld 10,00 m NAP; een woning (BGT-pand) van st. 10
// tot 50, 0 tot 10 m links van de as (de as ligt op de voorgevel), gevel tot 16 m, plat dak; boom A met kroon op
// 1,2 m voor de gevel (st. 20), boom B op 3,2 m (st. 35). LAS-variant met classificatie: een luifel (klasse 6) op
// 0,5–1,5 m voor de gevel (st. 42). Gebruik: node gevel_snoei.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'gevel_snoei');
const X0 = 150000, Y0 = 410000, MV = 10;

function punten() {
  const r = [];   // [s, o, z, klasse]
  for (let i = 0; i <= 600; i++) for (let j = -120; j <= 80; j++) { const s = i / 10, o = j / 10; if (s > 10 && s < 50 && o < 0) continue; r.push([s, o, MV, 2]); }
  for (let i = 100; i <= 500; i++) for (let k = 0; k <= 60; k++) { r.push([i / 10, -0.02, MV + k / 10, 6]); r.push([i / 10, -0.08, MV + k / 10, 6]); }   // voorgevel
  for (let i = 100; i <= 500; i++) for (let j = 0; j <= 100; j++) r.push([i / 10, -j / 10, MV + 6, 6]);   // dak
  const boom = (sc, oc, zc, R) => {
    for (let k = 0; k <= 17; k++) for (const [ds, dc] of [[0, 0], [0.05, 0], [0, 0.05], [-0.05, 0], [0, -0.05]]) r.push([sc + ds, oc + dc, MV + k / 10, 5]);   // stam
    for (let a = -R; a <= R + 1e-9; a += 0.1) for (let b = -R; b <= R + 1e-9; b += 0.1) for (let c = -R; c <= R + 1e-9; c += 0.1) if (a * a + b * b + c * c <= R * R) r.push([sc + a, oc + b, zc + c, 5]);
  };
  boom(20, 1.2, MV + 2.5, 0.8);
  boom(35, 3.2, MV + 2.5, 0.5);
  return r;
}
function schrijfPts(pad, r) { fs.writeFileSync(pad, `${r.length}\n${r.map(([s, o, z]) => `${(X0 + s).toFixed(3)} ${(Y0 - o).toFixed(3)} ${z.toFixed(3)}`).join('\n')}\n`); }
function schrijfLas(pad, r) {
  const n = r.length, kop = Buffer.alloc(227), sc = 0.001;
  const xs = r.map(q => X0 + q[0]), ys = r.map(q => Y0 - q[1]), zs = r.map(q => q[2]);
  kop.write('LASF', 0); kop.writeUInt8(1, 24); kop.writeUInt8(2, 25); kop.write('Profielviewer test', 26); kop.write('gevel_snoei.test.js', 58);
  kop.writeUInt16LE(313, 90); kop.writeUInt16LE(2026, 92); kop.writeUInt16LE(227, 94); kop.writeUInt32LE(227, 96); kop.writeUInt32LE(0, 100);
  kop.writeUInt8(0, 104); kop.writeUInt16LE(20, 105); kop.writeUInt32LE(n, 107); kop.writeUInt32LE(n, 111);
  kop.writeDoubleLE(sc, 131); kop.writeDoubleLE(sc, 139); kop.writeDoubleLE(sc, 147); kop.writeDoubleLE(X0, 155); kop.writeDoubleLE(Y0, 163); kop.writeDoubleLE(0, 171);
  const mx = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity), mn = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);
  kop.writeDoubleLE(mx(xs), 179); kop.writeDoubleLE(mn(xs), 187); kop.writeDoubleLE(mx(ys), 195); kop.writeDoubleLE(mn(ys), 203); kop.writeDoubleLE(mx(zs), 211); kop.writeDoubleLE(mn(zs), 219);
  const pt = Buffer.alloc(20 * n);
  for (let i = 0; i < n; i++) { const o = i * 20; pt.writeInt32LE(Math.round((xs[i] - X0) / sc), o); pt.writeInt32LE(Math.round((ys[i] - Y0) / sc), o + 4); pt.writeInt32LE(Math.round(zs[i] / sc), o + 8); pt.writeUInt8(1 | (1 << 3), o + 14); pt.writeUInt8(r[i][3], o + 15); }
  fs.writeFileSync(pad, Buffer.concat([kop, pt]));
}
function maakData() {
  fs.mkdirSync(UIT, { recursive: true });
  const r = punten();
  const pts = path.join(UIT, 'straat.pts'); schrijfPts(pts, r);
  const metLuifel = r.concat((() => { const l = []; for (let i = 415; i <= 425; i++) for (let j = 5; j <= 15; j++) for (const dz of [0, 0.05, 0.1]) l.push([i / 10, j / 10, MV + 2.2 + dz, 6]); return l; })());
  const las = path.join(UIT, 'straat_luifel.las'); schrijfLas(las, metLuifel);
  const as = path.join(UIT, 'as_gevel.geojson');
  fs.writeFileSync(as, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { naam: 'Gevels' }, geometry: { type: 'LineString', coordinates: [[X0 + 5, Y0], [X0 + 55, Y0]] } }] }));
  const bgt = path.join(UIT, 'pand.json');
  fs.writeFileSync(bgt, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { bgtlaag: 'pand' }, geometry: { type: 'Polygon', coordinates: [[[X0 + 10, Y0], [X0 + 50, Y0], [X0 + 50, Y0 + 10], [X0 + 10, Y0 + 10], [X0 + 10, Y0]]] } }] }));
  return { pts, las, as, bgt, n: r.length };
}

(async () => {
  await H.start();
  const { pts, las, as, bgt, n } = maakData();
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
  await p.click('#snoeiKnop'); await p.waitForSelector('#snDialoog[open]');
  await p.click('#snUitA'); await wacht(/Begroeiing: .* punten in de strook/);
  await p.selectOption('#snModus', 'gevel'); await p.waitForTimeout(200);
  await p.fill('#snGevelAfstand', '2'); await p.dispatchEvent('#snGevelAfstand', 'input');
  await p.selectOption('#snGevelKant', 'R');
  await p.fill('#snHoogte', '4'); await p.dispatchEvent('#snHoogte', 'input');
  await p.click('#snControleer'); await p.waitForTimeout(800);
  const zichtbaar = await p.evaluate(() => ({ breedte: !document.getElementById('snBreedte').closest('.rij').hidden, afstand: !document.getElementById('snGevelAfstand').closest('.rij').hidden }));
  let sp = await p.evaluate(() => window.__pvTest.snoeiPunten());
  console.log('F0 velden:', JSON.stringify(zichtbaar), '| snoeipunten:', JSON.stringify(sp?.map(q => ({ nr: q.nr, s: +((q.s0 + q.s1) / 2).toFixed(1), x: +(q.x - X0).toFixed(1), ernst: q.ernst }))));
  if (zichtbaar.breedte || !zichtbaar.afstand) fouten.push('F0: velden van de gevelmodus niet goed zichtbaar');
  // 1. boom A (1,2 m voor de gevel) is een snoeipunt, de gevel niet
  // de as begint 5 m voor het pand: station = x − (X0 + 5); daarom op de RD-x van het snoeipunt toetsen
  const bijX = (q, x) => Math.abs(q.x - (X0 + x)) <= 1.5;
  const bijA = (sp || []).filter(q => bijX(q, 20));
  const gevel = (sp || []).filter(q => !bijX(q, 20));
  if (bijA.length !== 1) fouten.push(`1: boom A op 1,2 m geeft ${bijA.length} snoeipunten (verwacht 1)`);
  if (gevel.length) fouten.push(`1: ${gevel.length} snoeipunten buiten boom A (de gevel telt mee?): ${gevel.map(q => `st. ${q.s0.toFixed(1)}-${q.s1.toFixed(1)}`).join(', ')}`);
  // 2. boom B op 3,2 m is geen snoeipunt (zit al in "gevel" hierboven als het misgaat)
  if ((sp || []).some(q => bijX(q, 35))) fouten.push('2: boom B op 3,2 m is toch een snoeipunt');
  const tabel = await p.textContent('#snResultaat');
  if (!/Vrije ruimte voor de gevel/.test(tabel)) fouten.push('F0: resultaat noemt de vrije ruimte voor de gevel niet');
  await p.screenshot({ path: path.join(H.UIT, 'gevel_snoei_f0.png') });
  // 3. met classificatie: de luifel (klasse 6) op 0,5–1,5 m telt niet
  await p.setInputFiles('#snBestand', las); await wacht(/Begroeiing: straat_luifel\.las — .* punten in de strook/);
  await p.click('#snControleer'); await p.waitForTimeout(800);
  sp = await p.evaluate(() => window.__pvTest.snoeiPunten());
  console.log('3 met classificatie (x):', JSON.stringify(sp?.map(q => +(q.x - X0).toFixed(1))));
  if ((sp || []).some(q => bijX(q, 42))) fouten.push('3: de luifel (klasse 6) is een snoeipunt');
  if (!(sp || []).some(q => bijX(q, 20))) fouten.push('3: boom A ontbreekt met classificatie');
  // 4. het gewone pad werkt zoals nu: modus terug op pad
  await p.selectOption('#snModus', 'pad'); await p.waitForTimeout(200);
  const pad = await p.evaluate(() => !document.getElementById('snBreedte').closest('.rij').hidden);
  if (!pad) fouten.push('4: breedte niet terug bij "langs een pad"');
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
