// Foto bij het doorrijprofiel (plan rws-foto, F0): foto's van de meting met hun camerastand (Metashape: Omega Phi
// Kappa + kalibratie-XML) inlezen, per doorsnede de beste foto kiezen en de maatlijnen erop projecteren.
// De test maakt zelf de foto's: de wolk met twee viaducten (zoals kunstwerken.test.js), gerenderd vanuit bekende
// camera's met lensvervorming, met een eigen projectie (los van de viewer). Zo staat vast waar elke lijn moet liggen.
// Gebruik: node rws_foto.test.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'rws_foto');
const X0 = 150000, Y0 = 410000;
const weg = (s, o) => 10 + 0.02 * s + 0.025 * o;   // o: + = rechts (as naar +x, rechts = −y)
const KW = [{ van: 30, tot: 45, dak: 14.6 }, { van: 60, tot: 75, dak: 15.2 }];
const dakOp = (s) => (KW.find(k => s >= k.van - 0.5 && s <= k.tot + 0.5) || {}).dak;
const KAL = { w: 1600, h: 1067, f: 1250, cx: 10.5, cy: -7.25, b1: 0, b2: 0, k1: -0.04, k2: 0.008, k3: 0, k4: 0, p1: 0.0004, p2: -0.0002 };

// ── eigen camera-model (los van de viewer geschreven) ──
const rad = (g) => g * Math.PI / 180;
function rot(om, ph, ka) {
  const Rx = [[1, 0, 0], [0, Math.cos(rad(om)), -Math.sin(rad(om))], [0, Math.sin(rad(om)), Math.cos(rad(om))]];
  const Ry = [[Math.cos(rad(ph)), 0, Math.sin(rad(ph))], [0, 1, 0], [-Math.sin(rad(ph)), 0, Math.cos(rad(ph))]];
  const Rz = [[Math.cos(rad(ka)), -Math.sin(rad(ka)), 0], [Math.sin(rad(ka)), Math.cos(rad(ka)), 0], [0, 0, 1]];
  const mul = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
  return mul(mul(Rx, Ry), Rz);
}
function proj(cam, P) {
  const d = [P[0] - cam.X, P[1] - cam.Y, P[2] - cam.Z];
  const c = [0, 1, 2].map(j => cam.R[0][j] * d[0] + cam.R[1][j] * d[1] + cam.R[2][j] * d[2]);
  if (c[2] > -0.05) return null;
  const x = c[0] / -c[2], y = c[1] / c[2], r2 = x * x + y * y, k = KAL;
  const rd = 1 + k.k1 * r2 + k.k2 * r2 * r2 + k.k3 * r2 ** 3 + k.k4 * r2 ** 4;
  const xd = x * rd + k.p1 * (r2 + 2 * x * x) + 2 * k.p2 * x * y, yd = y * rd + k.p2 * (r2 + 2 * y * y) + 2 * k.p1 * x * y;
  return { u: k.w / 2 + k.cx + xd * k.f + xd * k.b1 + yd * k.b2, v: k.h / 2 + k.cy + yd * k.f, z: -c[2] };
}
/** Camera op (s, o, z) die naar (s, o, z) kijkt; standen als ω, φ, κ (afgerond zoals in een export). */
function camera(naam, [s, o, z], [ts, to, tz]) {
  const C = [X0 + s, Y0 - o, z], T = [X0 + ts, Y0 - to, tz];
  const f = T.map((v, i) => v - C[i]), n = Math.hypot(...f); f.forEach((v, i) => f[i] = v / n);
  const rechts = [f[1], -f[0], 0], nr = Math.hypot(...rechts); rechts.forEach((v, i) => rechts[i] = v / nr);   // f × (0,0,1)
  const op = [rechts[1] * f[2] - rechts[2] * f[1], rechts[2] * f[0] - rechts[0] * f[2], rechts[0] * f[1] - rechts[1] * f[0]];
  const R0 = [0, 1, 2].map(i => [rechts[i], op[i], -f[i]]);   // kolommen: x rechts, y omhoog, z achteruit
  const ph = Math.asin(Math.max(-1, Math.min(1, R0[0][2]))) * 180 / Math.PI;
  const om = Math.atan2(-R0[1][2], R0[2][2]) * 180 / Math.PI, ka = Math.atan2(-R0[0][1], R0[0][0]) * 180 / Math.PI;
  const a = [om, ph, ka].map(v => Math.round(v * 1e6) / 1e6);
  return { naam, X: C[0], Y: C[1], Z: C[2], om: a[0], ph: a[1], ka: a[2], R: rot(...a) };
}
const CAMS = [
  camera('IMG_0101.png', [6, 0.5, weg(6, 0.5) + 1.8], [30.2, 0, 12.9]),        // KW1 voor, recht ervoor
  camera('IMG_0102.png', [18, 7, weg(18, 7) + 1.6], [30.2, -1, 12.6]),        // KW1 voor, van opzij
  camera('IMG_0103.png', [56, -0.5, weg(56, -0.5) + 1.8], [44.8, 0, 13.4]),   // KW1 achter
  camera('IMG_0104.png', [49, 0.5, weg(49, 0.5) + 1.8], [60.2, 0, 13.7]),     // KW2 voor
  camera('IMG_0105.png', [97, -0.5, weg(97, -0.5) + 1.8], [74.8, 0, 13.9]),   // KW2 achter
  camera('IMG_0106.png', [27, 0, 26], [30.5, 0, 13]),                         // drone boven: de meetpunten zitten onder het dak
  camera('IMG_0107.png', [4, 0, weg(4, 0) + 1.8], [-10, 0, 11]),              // kijkt van het kunstwerk weg
];

// ── wolk met kleur ──
function wolk() {
  const r = [];
  for (let i = 0; i <= 1000; i++) for (let j = -80; j <= 80; j++) {
    const s = i / 10, o = j / 10;
    const lijn = (Math.abs(Math.abs(o) - 3.6) < 0.08) || (Math.abs(o) < 0.08 && Math.floor(s / 3) % 2 === 0);
    const kl = Math.abs(o) > 4 ? [92, 128, 70] : lijn ? [235, 235, 230] : [88 + (i * 7 + j * 3) % 9, 90 + (i * 5 + j) % 9, 94];
    r.push([s, o, weg(s, o), kl]);
  }
  for (const k of KW) for (let i = k.van * 10; i <= k.tot * 10; i++) for (let j = -60; j <= 60; j++) {
    const g = 168 + (i * 3 + j * 5) % 12;
    r.push([i / 10, j / 10, k.dak, [g, g - 4, g - 10]]); r.push([i / 10, j / 10, k.dak + 0.7, [120, 116, 108]]);
  }
  return r;
}
function png(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const blok = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const ruw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(ruw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blok('IHDR', ihdr), blok('IDAT', zlib.deflateSync(ruw)), blok('IEND', Buffer.alloc(0))]);
}
function render(cam, punten) {
  const { w, h } = KAL, rgb = Buffer.alloc(w * h * 3), zb = new Float32Array(w * h).fill(Infinity);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; rgb[i] = 196 - y / h * 40; rgb[i + 1] = 214 - y / h * 30; rgb[i + 2] = 232; }
  for (const [s, o, z, kl] of punten) {
    const q = proj(cam, [X0 + s, Y0 - o, z]); if (!q) continue;
    const r = Math.max(1, Math.round(KAL.f * 0.06 / q.z));
    const u0 = Math.round(q.u), v0 = Math.round(q.v);
    if (u0 < -r || u0 >= w + r || v0 < -r || v0 >= h + r) continue;
    for (let v = Math.max(0, v0 - r); v <= Math.min(h - 1, v0 + r); v++) for (let u = Math.max(0, u0 - r); u <= Math.min(w - 1, u0 + r); u++) {
      const i = v * w + u; if (q.z >= zb[i]) continue; zb[i] = q.z;
      const sch = Math.max(0.55, 1 - q.z / 220);
      rgb[i * 3] = kl[0] * sch; rgb[i * 3 + 1] = kl[1] * sch; rgb[i * 3 + 2] = kl[2] * sch;
    }
  }
  return png(w, h, rgb);
}

function maakData() {
  fs.mkdirSync(UIT, { recursive: true });
  const punten = wolk();
  const pts = path.join(UIT, 'twee_viaducten.pts');
  fs.writeFileSync(pts, `${punten.length}\n${punten.map(([s, o, z]) => `${(X0 + s).toFixed(3)} ${(Y0 - o).toFixed(3)} ${z.toFixed(4)}`).join('\n')}\n`);
  const as = path.join(UIT, 'as_weg.geojson');
  fs.writeFileSync(as, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { naam: 'Weg' }, geometry: { type: 'LineString', coordinates: [[X0, Y0], [X0 + 100, Y0]] } }] }));
  const bgt = path.join(UIT, 'wegdeel.json');
  fs.writeFileSync(bgt, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { functie: 'rijbaan lokale weg' }, geometry: { type: 'Polygon', coordinates: [[[X0 - 5, Y0 - 4], [X0 + 105, Y0 - 4], [X0 + 105, Y0 + 4], [X0 - 5, Y0 + 4], [X0 - 5, Y0 - 4]]] } }] }));
  const fotos = CAMS.map(c => { const f = path.join(UIT, c.naam); fs.writeFileSync(f, render(c, punten)); return f; });
  const opk = path.join(UIT, 'cameras_opk.txt');
  fs.writeFileSync(opk, '# CoordinateSystem: PROJCS["Amersfoort / RD New + NAP height"]\n#Label\tX/Easting\tY/Northing\tZ/Altitude\tOmega\tPhi\tKappa\tr11\tr12\tr13\tr21\tr22\tr23\tr31\tr32\tr33\n'
    + CAMS.map(c => [c.naam, c.X.toFixed(6), c.Y.toFixed(6), c.Z.toFixed(6), c.om, c.ph, c.ka, ...c.R.flat().map(v => v.toFixed(9))].join('\t')).join('\n') + '\n');
  const kal = path.join(UIT, 'kalibratie.xml');
  fs.writeFileSync(kal, `<?xml version="1.0" encoding="UTF-8"?>\n<calibration>\n  <projection>frame</projection>\n  <width>${KAL.w}</width>\n  <height>${KAL.h}</height>\n`
    + ['f', 'cx', 'cy', 'k1', 'k2', 'p1', 'p2'].map(k => `  <${k}>${KAL[k]}</${k}>`).join('\n') + '\n  <date>2026-11-13T12:00:00Z</date>\n</calibration>\n');
  return { pts, as, bgt, fotos, opk, kal, n: punten.length };
}

(async () => {
  await H.start();
  const t0 = Date.now();
  const { pts, as, bgt, fotos, opk, kal, n } = maakData();
  console.log('wolk:', n.toLocaleString('nl-NL'), 'punten ·', fotos.length, 'foto\'s gerenderd in', ((Date.now() - t0) / 1000).toFixed(1), 's');
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
  await p.evaluate(() => document.getElementById('status').textContent = '');
  await p.click('#drRwsMeten'); await wacht(/Doorrijprofiel: \d+ doorsnedes|Doorrijprofiel: geen/);
  const rws = await p.evaluate(() => window.__pvTest.rws());
  console.log('doorsnedes:', rws.map(d => `${d.label} st. ${d.station}`).join(', '));
  if (rws.length !== 4) fouten.push(`${rws.length} doorsnedes (verwacht 4)`);

  // 1. projectie: de viewer rekent hetzelfde als het eigen model, binnen 0,5 px (met lensvervorming)
  const cam = CAMS[0], proef = [];
  for (let k = 0; k < 60; k++) proef.push([X0 + 12 + (k * 7) % 30, Y0 + ((k * 13) % 17) - 8, 9 + (k * 11) % 9]);
  const viewer = await p.evaluate(([kal, opk, pnt]) => window.__pvTest.rwsFotoProjecteer(kal, opk, pnt), [KAL, [cam.X, cam.Y, cam.Z, cam.om, cam.ph, cam.ka], proef]);
  let maxD = 0, nVergeleken = 0;
  proef.forEach((P, k) => { const a = proj(cam, P), v = viewer[k]; if (!a !== !v) { fouten.push(`1: punt ${k}: voor/achter de camera verschilt`); return; } if (!a) return; nVergeleken++; maxD = Math.max(maxD, Math.hypot(a.u - v.u, a.v - v.v)); });
  console.log(`1 projectie: ${nVergeleken} punten, grootste verschil ${maxD.toFixed(4)} px`);
  if (nVergeleken < 30 || maxD > 0.5) fouten.push(`1: projectie wijkt ${maxD.toFixed(3)} px af (max 0,5)`);

  // foto's kiezen
  await p.setInputFiles('#drFotoBestand', [...fotos, opk, kal]);
  await wacht(/Foto's van de meting:/);
  console.log('fotoset:', await st());
  const set = await p.evaluate(() => window.__pvTest.rwsFotoSet());
  if (set?.cams.length !== CAMS.length) fouten.push(`fotoset: ${set?.cams.length} camera's (verwacht ${CAMS.length})`);

  // 2–4. per doorsnede de juiste foto, lijnen op de meetpunten, waarden gelijk aan de tabel, laagste rood
  const verwachtFoto = ['IMG_0101.png', 'IMG_0103.png', 'IMG_0104.png', 'IMG_0105.png'];
  for (let i = 0; i < rws.length; i++) {
    const d = rws[i], res = await p.evaluate((k) => window.__pvTest.rwsFoto(k), i);
    const c = CAMS.find(x => x.naam === res.foto);
    console.log(`2 ${d.label}: foto ${res.foto} · ${res.lijnen.map(l => `${l.tekst}${l.rood ? ' (rood)' : ''}`).join(' | ')}`);
    if (res.foto !== verwachtFoto[i]) fouten.push(`2: ${d.label}: foto ${res.foto} (verwacht ${verwachtFoto[i]})`);
    if (res.lijnen.length !== d.meetpunten.length) fouten.push(`2: ${d.label}: ${res.lijnen.length} maatlijnen (verwacht ${d.meetpunten.length})`);
    let maxL = 0;
    for (const l of res.lijnen) {
      const X = X0 + d.station, Y = Y0 - l.offset;
      const a = proj(c, [X, Y, weg(d.station, l.offset)]), bk = proj(c, [X, Y, dakOp(d.station)]);
      maxL = Math.max(maxL, Math.hypot(a.u - l.voet.u, a.v - l.voet.v), Math.hypot(bk.u - l.kop.u, bk.v - l.kop.v));
      // 3. tekst gelijk aan de tabel
      const m = d.meetpunten.find(x => Math.abs(x.offset - l.offset) < 1e-9);
      if (!m || l.tekst !== m.h.toFixed(3)) fouten.push(`3: ${d.label} op ${l.offset}: "${l.tekst}" ≠ tabel ${m?.h?.toFixed(3)}`);
    }
    if (maxL > 3) fouten.push(`2: ${d.label}: maatlijn ${maxL.toFixed(2)} px naast het meetpunt (max 3)`);
    const minH = Math.min(...d.meetpunten.filter(m => m.h != null).map(m => m.h));
    const rood = res.lijnen.filter(l => l.rood);
    if (rood.length !== 1 || rood[0].tekst !== minH.toFixed(3) || rood[0].kleur.toLowerCase() !== '#d7261e') fouten.push(`3: ${d.label}: de laagste (${minH.toFixed(3)}) is niet als enige rood`);
    console.log(`  lijnen binnen ${maxL.toFixed(2)} px van het meetpunt`);
    // 4. de foto's die het meetpunt niet zien
    if (i === 0) {
      const k6 = res.kandidaten.find(k => k.foto === 'IMG_0106.png'), k7 = res.kandidaten.find(k => k.foto === 'IMG_0107.png');
      console.log(`4 drone: ${k6?.reden} · weg-kijkend: ${k7?.reden}`);
      if (!k6 || k6.ok || !/afgedekt/.test(k6.reden)) fouten.push(`4: de drone boven het dak is niet als afgedekt herkend (${k6?.reden})`);
      if (!k7 || k7.ok || !/achter de camera/.test(k7.reden)) fouten.push(`4: de foto die wegkijkt is niet uitgesloten (${k7?.reden})`);
    }
  }

  // 5. in het venster: knop Foto bij KW1 voor
  await p.click('.drFoto[data-nr="1"]'); await p.waitForSelector('#fotoDialoog[open]');
  for (let i = 0; i < 40 && !/^Foto IMG/.test(await p.textContent('#fotoInfo')); i++) await p.waitForTimeout(250);
  console.log('5 venster:', await p.textContent('#fotoInfo'));
  if (!/^Foto IMG_0101/.test(await p.textContent('#fotoInfo'))) fouten.push('5: het fotovenster toont de foto niet');
  await p.screenshot({ path: path.join(H.UIT, 'rws_foto_venster.png') });
  const bewaarCanvas = async (naam) => { const d = await p.evaluate(() => document.getElementById('fotoCanvas').toDataURL('image/png')); fs.writeFileSync(path.join(H.UIT, naam), Buffer.from(d.split(',')[1], 'base64')); };
  await bewaarCanvas('rws_foto.png');
  await p.click('#fotoVolgende'); for (let i = 0; i < 40 && !/IMG_0103/.test(await p.textContent('#fotoInfo')); i++) await p.waitForTimeout(250);
  await bewaarCanvas('rws_foto_kw1_achter.png');
  if (!/IMG_0103/.test(await p.textContent('#fotoInfo'))) fouten.push('5: ▶ gaat niet naar de volgende doorsnede');

  await b.close(); await H.stop?.();
  console.log(fouten.length ? 'fouten:\n- ' + fouten.join('\n- ') : 'fouten: geen');
  process.exit(fouten.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
