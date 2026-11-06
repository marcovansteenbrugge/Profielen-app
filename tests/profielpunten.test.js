// Punten in het dwarsprofiel (plan punten-in-profiel): een nagemaakte wolk met een boom boven een vlakke weg.
// Toetst: punten binnen ± strook van de profiellijn, wegdek én kroon zichtbaar, zelfde punten uit een projectmap
// (vakken) als uit het losse bestand, en Stop laat geen punten achter.
// Gebruik: node profielpunten.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;

// ── testwolk: weg (z = 5,00) van 40 × 20 m, boom op x = 20, y = +2 (links van de as) ──
const X0 = 155000, Y0 = 385000;
const ptn = [];
// (y net naast het raster van 10 cm van de profiellijn, zodat elk vakje wegdekpunten heeft; bij x = 32-38 rechts een
// talud 1:1 dat vanaf y = -6 tot 4 m oploopt: de lijn moet dat volgen, niet gladstrijken)
const talud = (x, y) => (x >= 32 && x <= 38 && y < -6 ? -6 - y : 0);
for (let i = 0; i < 400; i++) for (let j = 0; j < 200; j++) { const x = 0.05 + i * 0.1, y = -9.97 + j * 0.1; ptn.push([x, y, 5.0 + talud(x, y)]); }
const BX = 20, BY = 2;
for (let a = 0; a < 24; a++) for (let h = 0; h < 30; h++) {           // stam, straal 0,25 m, 5,1-8,0 m
  const t = a / 24 * 2 * Math.PI; ptn.push([BX + 0.25 * Math.cos(t), BY + 0.25 * Math.sin(t), 5.1 + h * 0.1]);
}
const NK = 6000;                                                       // kroon: bol, straal 2,5 m rond z = 10,5
for (let n = 0; n < NK; n++) {
  const z = 1 - 2 * (n + 0.5) / NK, r = Math.sqrt(1 - z * z), t = n * Math.PI * (3 - Math.sqrt(5));
  ptn.push([BX + 2.5 * r * Math.cos(t), BY + 2.5 * r * Math.sin(t), 10.5 + 2.5 * z]);
}
const WOLK = path.join(H.UIT, 'profielpunten_boom.pts'), AS = path.join(H.UIT, 'profielpunten_as.geojson');
fs.writeFileSync(WOLK, ptn.length + '\n' + ptn.map(([x, y, z]) => `${(X0 + x).toFixed(3)} ${(Y0 + y).toFixed(3)} ${z.toFixed(3)} 0 120 120 120`).join('\n') + '\n');
fs.writeFileSync(AS, JSON.stringify({ type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::28992' } },
  features: [{ type: 'Feature', properties: { naam: 'As testweg' }, geometry: { type: 'LineString', coordinates: [[X0, Y0], [X0 + 40, Y0]] } }] }));
// verwacht bij station 20 met strook ±0,5 m: alle punten met |x - 20| <= 0,5 en |y| <= 10
const verwacht = (s) => ptn.filter(([x, y]) => Math.abs(x - 20) <= s && Math.abs(y) <= 10);

(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const fouten = [];
  const controle = (goed, wat) => { console.log(`${goed ? 'OK  ' : 'FOUT'} ${wat}`); if (!goed) fouten.push(wat); };
  const nieuwePagina = async (zonderMap) => {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(120000);
    p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
    p.on('dialog', d => d.accept());
    await p.route(/pdok\.nl/, r => r.abort());
    if (zonderMap) await p.addInitScript(require('./zonder_map.js'));
    else await p.addInitScript(() => { window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('ppunten', { create: true }); }; });
    await p.goto(H.URL);
    await p.evaluate(async () => {
      localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-oppervlak', 'boven'); localStorage.setItem('ptsviewer-a-maaiveld', '0');
      localStorage.setItem('ptsviewer-profielpunten', '0'); localStorage.setItem('ptsviewer-profielstrook', '0.5');
      try { await (await navigator.storage.getDirectory()).removeEntry('ppunten', { recursive: true }); } catch { /* */ }
    });
    await p.reload();
    return p;
  };
  const st = async (p) => (await p.textContent('#status')).trim();
  const wacht = async (p, re, max = 480) => { for (let i = 0; i < max; i++) { const s = await st(p); if (re.test(s)) return s; await p.waitForTimeout(250); } return await st(p); };
  const naarStation = async (p, s) => { await p.fill('#paalGaNaar', String(s)); await p.press('#paalGaNaar', 'Enter'); await p.waitForTimeout(300); };

  // ── 1. los bestand ──
  const p = await nieuwePagina(true);
  await p.setInputFiles('#ptsBestand', WOLK);
  console.log('laden:', (await wacht(p, /driehoeken/)).slice(0, 120));
  await p.setInputFiles('#asBestand', AS); await p.waitForTimeout(1000);
  await naarStation(p, 20);
  console.log('station:', await p.textContent('#stationLabel'));
  controle(await p.evaluate(() => window.__pvTest.profielPunten()) === null, 'zonder vinkje geen punten in het profiel');
  await p.check('#profielPunten');
  const s1 = await wacht(p, /punten in de profielen|gestopt|mislukt/);
  console.log('punten aan:', s1);
  const r = await p.evaluate(() => window.__pvTest.profielPunten());
  controle(r && Math.abs(r.station - 20) < 1e-6 && r.strook === 0.5, `punten bij station 20 met strook ±0,5 m (${r && r.o.length} punten)`);
  if (r) {
    const v = verwacht(0.5), weg = r.z.filter(z => z < 5.05).length, kroon = r.z.filter(z => z > 8.2).length, stam = r.o.filter((o, i) => r.z[i] > 5.05 && r.z[i] < 8.05).length;
    const vWeg = v.filter(q => q[2] < 5.05).length, vKroon = v.filter(q => q[2] > 8.2).length;
    console.log(`  punten ${r.o.length} (verwacht ${v.length}) · wegdek ${weg} (verwacht ${vWeg}) · kroon ${kroon} (verwacht ${vKroon}) · stam ${stam}`);
    controle(Math.abs(r.o.length - v.length) <= Math.max(3, v.length * 0.005), 'aantal punten = punten binnen ±0,5 m van de profiellijn');
    controle(weg === vWeg && Math.min(...r.o) < -9.8 && Math.max(...r.o) > 9.8, 'wegdek over de hele breedte, ook onder de boom');
    controle(r.o.some((o, i) => r.z[i] < 5.05 && o > -3 && o < -1), 'wegdek recht onder de kroon (offset -3 tot -1 m)');
    controle(Math.abs(kroon - vKroon) <= 3 && kroon > 50, 'kroon als punten');
    controle(r.o.every((o, i) => r.z[i] < 5.05 || (o > -4.6 && o < 0.6)), 'kroon en stam links van de as (offset -4,5 tot 0,5 m), rest is wegdek');
  }
  controle((await p.evaluate(() => window.__pvTest.dwars()))[3] === true, 'de profiellijn komt uit alle punten');
  // F1: de lijn volgt het wegdek, ook onder de kroon (B1)
  const lijn = (await p.evaluate(() => window.__pvTest.dwarsLijn())).filter(([, h]) => h != null);
  const afwijking = Math.max(...lijn.map(([, h]) => Math.abs(h - 5.0)));
  const onderKroon = lijn.filter(([o]) => o > -4.5 && o < 0.5);
  console.log(`  lijn: ${lijn.length} punten, grootste afwijking van het wegdek ${(afwijking * 100).toFixed(1)} cm, ${onderKroon.length} onder de kroon`);
  console.log('  afwijkend:', lijn.filter(([, h]) => Math.abs(h - 5) >= 0.05).map(([o, h]) => o.toFixed(2) + ':' + h.toFixed(2)).join(' '));
  controle(afwijking < 0.05 && onderKroon.length > 30, 'de lijn ligt op het wegdek, ook onder de kroon (< 5 cm)');
  controle(await p.evaluate(() => document.querySelectorAll('#svgDwars path.punten').length) >= 2, 'punten getekend (grijs en grond)');
  // talud 1:1 bij station 35: de lijn volgt de helling (offset 8 m = y -8 → 2 m boven het wegdek)
  await naarStation(p, 35);
  const lijn35 = (await p.evaluate(() => window.__pvTest.dwarsLijn())).filter(([, h]) => h != null);
  const op8 = lijn35.filter(([o]) => Math.abs(o - 8) < 0.06).map(([, h]) => h);
  console.log(`  talud: lijn op offset 8 m = ${op8.map(h => h.toFixed(2)).join(', ')} (verwacht 7,00)`);
  controle(op8.length && op8.every(h => Math.abs(h - 7.0) < 0.1), 'de lijn volgt een talud 1:1 (niet gladgestreken)');
  await naarStation(p, 20);
  await p.locator('#svgDwars').screenshot({ path: H.UIT + '/profielpunten_f1_boom.png' }).catch(() => p.screenshot({ path: H.UIT + '/profielpunten_f1_boom.png' }));
  // F1: snelheid bij ± 20.000 punten (strook ±3,5 m)
  await p.fill('#profielStrook', '3.5'); await p.dispatchEvent('#profielStrook', 'change');
  await wacht(p, /strook ±3,5 m/);
  const tijd = await p.evaluate(async () => {
    const n = window.__pvTest.profielPunten().o.length;
    document.getElementById('volgendeStation').click(); await new Promise(r => setTimeout(r, 50));
    const t0 = performance.now(); document.getElementById('vorigeStation').click(); const t = performance.now() - t0;
    await new Promise(r => requestAnimationFrame(() => r()));
    return { n, ms: t, totaal: performance.now() - t0 };
  });
  console.log(`  bladeren: ${tijd.n} punten, tekenen ${Math.round(tijd.ms)} ms, met verversen ${Math.round(tijd.totaal)} ms`);
  controle(tijd.n > 15000 && tijd.totaal < 500, 'naar een profiel met ± 20.000 punten bladeren duurt < 0,5 s');
  await p.fill('#profielStrook', '0.5'); await p.dispatchEvent('#profielStrook', 'change');
  await wacht(p, /strook ±0,5 m/);

  // ── F2: PDF en DXF ──
  const n35 = await p.evaluate(() => window.__pvTest.profielPunten().o.length);
  const dun = await p.evaluate(() => [window.__pvTest.profielPuntenUitgedund(20000), window.__pvTest.profielPuntenUitgedund(1000)]);
  console.log(`  uitdunnen: ${n35} punten → ${dun[0]} (max 20.000, vakjes 2 cm) · met max 1.000 → ${dun[1]}`);
  controle(dun[0] <= 20000 && dun[0] > 0 && dun[1] <= 1000 && dun[1] > 0, 'uitdunnen houdt zich aan het maximum per profiel');
  const telPunten = (tekst) => { const ent = tekst.split(/\r?\n  0\r?\n/); const pts = [];
    for (const e of ent) if (/^POINT\r?\n/.test(e) && /\n  8\r?\nPV_PROF_PUNTEN\r?\n/.test(e)) { const x = +/\n 10\r?\n([-\d.e]+)/.exec(e)[1], y = +/\n 20\r?\n([-\d.e]+)/.exec(e)[1]; pts.push([x, y]); }
    return pts; };
  const [dl1] = await Promise.all([p.waitForEvent('download', { timeout: 240000 }), p.click('#dxfKnop')]);
  await dl1.saveAs(H.UIT + '/profielpunten.dxf');
  const dxf1 = fs.readFileSync(H.UIT + '/profielpunten.dxf', 'utf8'), pts1 = telPunten(dxf1);
  const aantalProf = await p.evaluate(() => document.getElementById('stationLabel').textContent.match(/\/(\d+)\)/)[1]);
  console.log(`  DXF: ${pts1.length} POINT op PV_PROF_PUNTEN, ${aantalProf} profielen, laag in de tabel: ${/\n  2\r?\nPV_PROF_PUNTEN\r?\n/.test(dxf1)}`);
  controle(pts1.length > 1000 && pts1.length <= 20000 * aantalProf && /\n  2\r?\nPV_PROF_PUNTEN\r?\n/.test(dxf1), 'DXF: punten als POINT op laag PV_PROF_PUNTEN, niet meer dan het maximum per profiel');
  await p.click('#printKnop'); await p.waitForTimeout(500);
  await p.evaluate(() => { const e = document.getElementById('pdfLuchtfoto'); if (e) { e.checked = false; e.dispatchEvent(new Event('change')); } });
  const [pd] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  await pd.saveAs(H.UIT + '/profielpunten.pdf');
  console.log('  PDF:', (await st(p)).slice(0, 120), Math.round(fs.statSync(H.UIT + '/profielpunten.pdf').size / 1e3), 'kB');
  if (!(await p.isVisible('#pdfDxf'))) { await p.click('#printKnop'); await p.waitForTimeout(600); }
  const [dd] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfDxf')]);
  await dd.saveAs(H.UIT + '/profielpunten_bladen.dxf');
  const dxf2 = fs.readFileSync(H.UIT + '/profielpunten_bladen.dxf', 'utf8'), pts2 = telPunten(dxf2);
  // kaders van de profielen: de modelruimte-vensters van de viewports op de bladen; elk punt moet in een ervan liggen
  const kaders = [];
  for (const e of dxf2.split(/\r?\n  0\r?\n/)) if (/^VIEWPORT/.test(e)) {
    const v = (c) => { const m = new RegExp('\\n\\s*' + c + '\\r?\\n([-\\d.e]+)').exec(e); return m ? +m[1] : null; };
    const cx = v(12), cy = v(22), h = v(45), w = v(40), hp = v(41);
    if (cx != null && h && w && hp && Math.abs(cx) > 1000) { const b = h * w / hp; kaders.push([cx - b / 2, cx + b / 2, cy - h / 2, cy + h / 2]); }
  }
  const binnen = pts2.filter(([x, y]) => kaders.some(([a, b2, c, d2]) => x >= a - 1e-6 && x <= b2 + 1e-6 && y >= c - 1e-6 && y <= d2 + 1e-6)).length;
  console.log(`  DXF met bladen: ${pts2.length} POINT op PV_PROF_PUNTEN, ${binnen} binnen een kader (${kaders.length} kaders)`);
  controle(pts2.length > 1000 && binnen === pts2.length, 'DXF met bladen: punten binnen het kader van de profielen');
  await p.keyboard.press('Escape');

  // ── 2. Stop: andere strook, meteen stoppen → geen punten, profielen weer uit de surface ──
  await p.uncheck('#profielPunten'); await p.waitForTimeout(300);
  await p.evaluate(() => {
    document.getElementById('profielStrook').value = '1';
    const cb = document.getElementById('profielPunten'); cb.checked = true; cb.dispatchEvent(new Event('change'));
    document.getElementById('volleDichtheidKnop').click();
  });
  const s2 = await wacht(p, /gestopt|strook ±1 m/);
  console.log('stop:', s2);
  controle(/gestopt/.test(s2), 'Stop breekt het lezen af');
  controle(await p.evaluate(() => window.__pvTest.profielPunten()) === null, 'na Stop geen punten in het profiel');
  controle((await p.evaluate(() => window.__pvTest.dwars()))[3] === false, 'na Stop komen de profielen weer uit de surface');

  // ── 3. projectmap (vakken): dezelfde punten ──
  const q = await nieuwePagina(false);
  await q.setInputFiles('#ptsBestand', WOLK);
  await q.waitForSelector('#projectMapDialoog[open]'); await q.click('#pmKies');
  console.log('projectmap laden:', (await wacht(q, /driehoeken/)).slice(0, 120));
  await q.setInputFiles('#asBestand', AS); await q.waitForTimeout(1000);
  await wacht(q, /Profielen uit alle [\d.]+ punten/);
  await naarStation(q, 20);
  await q.check('#profielPunten');
  console.log('projectmap punten:', await wacht(q, /punten in de profielen|gestopt|mislukt/));
  const rv = await q.evaluate(() => window.__pvTest.profielPunten());
  controle(rv && r && Math.abs(rv.o.length - r.o.length) <= Math.max(3, r.o.length * 0.005), `projectmap: zelfde aantal punten als het losse bestand (${rv && rv.o.length} tegen ${r && r.o.length})`);
  if (rv && r) {
    const som = (a) => a.reduce((s, v) => s + v, 0);
    controle(Math.abs(som(rv.z) / rv.z.length - som(r.z) / r.z.length) < 0.01, 'projectmap: zelfde gemiddelde hoogte (< 1 cm verschil)');
  }

  // F1: strook en aan/uit gaan mee in het project
  await q.fill('#profielStrook', '0.8'); await q.dispatchEvent('#profielStrook', 'change');
  await wacht(q, /strook ±0,8 m/);
  await q.keyboard.press('Control+S'); console.log('opslaan:', await wacht(q, /Opgeslagen|mislukt/));
  const inst = await q.evaluate(async () => {
    const m = await (await navigator.storage.getDirectory()).getDirectoryHandle('ppunten');
    for await (const [n, h] of m.entries()) if (/\.pvproj$/i.test(n)) return JSON.parse(await (await h.getFile()).text()).instellingen;
    return null;
  });
  controle(inst && inst.profielPunten === true && inst.profielStrook === 0.8, `project bewaart punten aan en strook ±0,8 m (${inst && JSON.stringify({ p: inst.profielPunten, s: inst.profielStrook })})`);
  await q.evaluate(() => { localStorage.setItem('ptsviewer-profielpunten', '0'); localStorage.setItem('ptsviewer-profielstrook', '0.5'); });
  await q.reload(); await q.waitForTimeout(1000);
  await q.click('#projectOpenKnop'); await q.waitForSelector('#projectOpenDialoog[open]'); await q.click('#poRecent button');
  await wacht(q, /driehoeken/);
  const terug = await q.evaluate(() => [document.getElementById('profielPunten').checked, Number(document.getElementById('profielStrook').value)]);
  controle(terug[0] === true && terug[1] === 0.8, `na openen van het project: punten aan, strook ±0,8 m (${terug})`);

  // F1: schermafdruk op de bospad-testwolk (bomen langs een pad), station 139 m
  const w = await nieuwePagina(true);
  await w.setInputFiles('#ptsBestand', H.data('snoei_test', 'bospad_scan.pts')); await wacht(w, /driehoeken/);
  await w.setInputFiles('#asBestand', H.data('snoei_test', 'as_schouwpad.geojson')); await w.waitForTimeout(1000);
  await w.fill('#dwarsInterval', '1'); await w.dispatchEvent('#dwarsInterval', 'change'); await w.waitForTimeout(500);
  await naarStation(w, 139);
  await w.check('#profielPunten'); console.log('bospad:', (await wacht(w, /punten in de profielen|mislukt/)).slice(0, 200));
  await naarStation(w, 139); await w.waitForTimeout(300);
  await w.screenshot({ path: H.UIT + '/profielpunten_f1_bospad.png' });

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
