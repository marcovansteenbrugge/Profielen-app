// Doorrijhoogte (plan doorrijhoogte, F0): weg en dak uit één puntenwolk, een box op het wegdek en de vrije
// hoogte tot het dak. Gemaakte wolk met bekende maten: weg met 2 % langshelling en 2,5 % dwarshelling, een
// dak (onderkant 14,60 m NAP, bovenkant 15,30 m) van station 40 tot 60, onder het dak van st. 45 tot 55
// geen weg gemeten, en een losse "vogel" boven de weg op st. 20.
// Gebruik: node doorrijhoogte.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'doorrijhoogte');
const X0 = 150000, Y0 = 410000;
const weg = (s, o) => 10 + 0.02 * s + 0.025 * o;   // o: + = rechts van de as (as loopt naar +x, rechts = −y)
const DAK_ONDER = 14.6, DAK_BOVEN = 15.3;

function maakWolk() {
  fs.mkdirSync(UIT, { recursive: true });
  const r = [];
  const punt = (s, o, z) => r.push(`${(X0 + s).toFixed(3)} ${(Y0 - o).toFixed(3)} ${z.toFixed(3)}`);
  for (let s = 0; s <= 100.001; s += 0.1) for (let o = -8; o <= 8.001; o += 0.1) {
    if (s > 45 && s < 55 && Math.abs(o) < 6.5) continue;   // onder het dak: weg niet gemeten
    punt(s, o, weg(s, o));
  }
  for (let s = 40; s <= 60.001; s += 0.1) for (let o = -6; o <= 6.001; o += 0.1) { punt(s, o, DAK_ONDER); punt(s, o, DAK_BOVEN); }
  punt(20, 0.3, 12.0);   // vogel: los punt, telt niet
  const pts = path.join(UIT, 'weg_met_dak.pts');
  fs.writeFileSync(pts, `${r.length}\n${r.join('\n')}\n`);
  const as = path.join(UIT, 'as_weg.geojson');
  fs.writeFileSync(as, JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { naam: 'Weg' }, geometry: { type: 'LineString', coordinates: [[X0, Y0], [X0 + 100, Y0]] } }] }));
  return { pts, as, n: r.length };
}

(async () => {
  await H.start();
  const { pts, as, n } = maakWolk();
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

  // venster, punten uit A, box 3,50 × 4,20
  await p.click('#doorrijKnop');
  await p.waitForSelector('#drDialoog[open]');
  await p.click('#drUitA');
  console.log('inlezen:', (await wacht(/punten in de strook|niet lezen/)).slice(0, 110));
  const zetBox = async (B, H2) => {
    await p.fill('#drBoxen [data-veld="breedte"]', String(B));
    await p.fill('#drBoxen [data-veld="hoogte"]', String(H2));
    await p.click('#drControleer'); await p.waitForTimeout(600);
    return p.evaluate(() => window.__pvTest.doorrij());
  };
  const verwacht = (bx) => DAK_ONDER - weg(bx.kritiek.station, bx.c + bx.B / 2);   // hoogste weg binnen de box (rechts) op het kritieke station

  // 1. H = 4,20: voldoet niet; vrije hoogte en kritiek station kloppen
  let r = await zetBox(3.5, 4.2);
  let bx = r.boxen[0];
  console.log('1 H 4,20:', JSON.stringify({ ok: r.ok, vrijMin: bx.vrijMin?.toFixed(3), verwacht: verwacht(bx).toFixed(3), speling: bx.speling?.toFixed(3), station: bx.kritiek?.station.toFixed(2), conflict: bx.nConflict }));
  if (Math.abs(bx.vrijMin - verwacht(bx)) >= 0.02) fouten.push(`1: vrije hoogte ${bx.vrijMin} wijkt meer dan 2 cm af van ${verwacht(bx)}`);
  if (!(bx.kritiek.station > 59 && bx.kritiek.station <= 60.05)) fouten.push(`1: kritiek station ${bx.kritiek.station} (verwacht bij st. 60: daar ligt de weg het hoogst onder het dak)`);
  if (r.ok || !(bx.speling < -0.8 && bx.speling > -0.9) || !bx.nConflict) fouten.push(`1: H 4,20 moet "voldoet niet" geven met ± 0,84 m tekort (kreeg ok=${r.ok}, speling ${bx.speling})`);
  console.log('1 status:', (await st()).slice(0, 120));
  const regels = await p.textContent('#drResultaat');
  if (!/VOLDOET NIET/.test(regels)) fouten.push('1: oordeel VOLDOET NIET niet in het venster');

  // 2. H = 3,00: voldoet, speling ± 0,36 m
  r = await zetBox(3.5, 3.0);
  bx = r.boxen[0];
  console.log('2 H 3,00:', JSON.stringify({ ok: r.ok, vrijMin: bx.vrijMin?.toFixed(3), speling: bx.speling?.toFixed(3) }));
  if (!r.ok || Math.abs(bx.speling - (verwacht(bx) - 3.0)) >= 0.02) fouten.push(`2: H 3,00 moet voldoen met speling ${(verwacht(bx) - 3).toFixed(3)} (kreeg ok=${r.ok}, speling ${bx.speling})`);

  // 3. weg onder het dak zonder metingen: overbrugd (niet het dak) en als niet gemeten op de dekkingskaart
  const w50 = await p.evaluate(() => window.__pvTest.doorrijWeg(50, 0));
  console.log('3 weg op st. 50 (overbrugd):', w50?.toFixed(3), '| verwacht', weg(50, 0).toFixed(3), '| dekking', JSON.stringify(r.dekking), '| ruis', r.ruis);
  if (w50 == null || Math.abs(w50 - weg(50, 0)) > 0.05) fouten.push(`3: weg onder het dak verkeerd overbrugd (${w50})`);
  console.log('3 niet gemeten:', r.gatM2, 'm² (verwacht ± 10 m × 3,5 m = 35 m²)');
  if (!r.dekking || !r.dekking.gaten || !(r.gatM2 > 25 && r.gatM2 < 45)) fouten.push(`3: het stuk zonder weg onder het dak staat niet goed als niet gemeten op de dekkingskaart (${r.gatM2} m²)`);
  if (!r.ruis) fouten.push('3: de losse vogel werd niet als ruis herkend');

  // 4. (F1) voorwaarde kiezen zet B en H; eigen maten blijven werken
  await p.selectOption('#drBoxen .drBox[data-i="0"] select[data-veld="voorwaarde"]', 'fietspad'); await p.waitForTimeout(500);
  let inst = await p.evaluate(() => window.__pvTest.doorrijInst());
  console.log('4 fietspad:', JSON.stringify(inst.boxen[0]));
  if (inst.boxen[0].breedte != 2 || inst.boxen[0].hoogte != 2.5 || inst.boxen[0].naam !== 'fietspad') fouten.push('4: kiezen van "fietspad" zet B en H niet');
  await p.selectOption('#drBoxen .drBox[data-i="0"] select[data-veld="voorwaarde"]', 'weg'); await p.waitForTimeout(500);
  await p.selectOption('#drBoxen .drBox[data-i="0"] select[data-veld="voorwaarde"]', 'eigen'); await p.waitForTimeout(300);
  await p.fill('#drBoxen .drBox[data-i="0"] [data-veld="breedte"]', '3.5'); await p.fill('#drBoxen .drBox[data-i="0"] [data-veld="hoogte"]', '4.2'); await p.waitForTimeout(400);
  inst = await p.evaluate(() => window.__pvTest.doorrijInst());
  if (inst.boxen[0].breedte != 3.5 || inst.boxen[0].hoogte != 4.2 || inst.boxen[0].voorwaarde !== 'eigen') fouten.push('4: eigen maten werken niet');

  // 5. (F1) twee boxen: rijbaan 3,50 × 4,20 en fietspad 2,00 × 2,50 op 4,5 m rechts; elk een eigen oordeel en kritiek punt
  await p.click('#drBoxErbij'); await p.waitForTimeout(400);
  await p.fill('#drBoxen .drBox[data-i="1"] [data-veld="verschuiving"]', '4.5'); await p.waitForTimeout(400);
  await p.click('#drControleer'); await p.waitForTimeout(800);
  r = await p.evaluate(() => window.__pvTest.doorrij());
  const [b1, b2] = r.boxen;
  const verwacht2 = DAK_ONDER - weg(b2.kritiek.station, b2.c + b2.B / 2) - b2.H;
  console.log('5 twee boxen:', JSON.stringify(r.boxen.map(b => ({ B: b.B, H: b.H, c: b.c, ok: b.ok, speling: b.speling?.toFixed(3), st: b.kritiek?.station.toFixed(1) }))), '| verwacht fietspad', verwacht2.toFixed(3));
  if (r.boxen.length !== 2 || b1.ok || !b2.ok || Math.abs(b2.speling - verwacht2) >= 0.02 || r.ok) fouten.push('5: twee boxen geven niet elk het juiste oordeel');
  if (!/fietspad/.test(await p.textContent('#drResultaat'))) fouten.push('5: de tweede box staat niet in het resultaat');

  // 6. (F1) instellingen komen terug na opslaan en heropenen van het project
  const terug = await p.evaluate(() => window.__pvTest.projectRondje());
  console.log('6 na opslaan en openen:', JSON.stringify(terug.boxen));
  if (terug.boxen.length !== 2 || terug.boxen[1].naam !== 'fietspad' || Number(terug.boxen[1].verschuiving) !== 4.5 || Number(terug.boxen[0].hoogte) !== 4.2) fouten.push('6: de boxen komen niet terug na opslaan en openen');
  await p.waitForTimeout(1500);
  if (!(await p.isVisible('#drDialoog[open]'))) { await p.click('#doorrijKnop'); await p.waitForTimeout(400); }

  // 7. (F2) PDF met het blad Doorrijhoogte (box en kleinste vrije hoogte) en de dekkingskaart
  if (await p.isVisible('#drDialoog[open]')) { await p.click('#drControleer'); await p.waitForTimeout(800); await p.click('#drSluit'); }
  else { await p.click('#doorrijKnop'); await p.click('#drControleer'); await p.waitForTimeout(800); await p.click('#drSluit'); }
  r = await p.evaluate(() => window.__pvTest.doorrij());
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Test doorrijhoogte'); z('pdf3D', false); z('pdfDoorrij', true); });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  const pdfPad = path.join(H.UIT, 'doorrijhoogte.pdf');
  await dl.saveAs(pdfPad);
  console.log('7 PDF:', (await p.textContent('#status')).trim().slice(0, 120));
  const { spawnSync } = require('child_process');
  const py = spawnSync('python', ['-I', '-c', [
    'import sys, pymupdf',
    'd = pymupdf.open(sys.argv[1])',
    'for i, pg in enumerate(d):',
    '    t = " ".join(pg.get_text().split())',
    '    if t.startswith("Doorrijhoogte") or ("Doorrijhoogte -" in t[:400] and "Uitgangspunten" in t):',
    '        print("BLAD", i + 1, t[:1500]); pg.get_pixmap(dpi=70).save(sys.argv[2])',
    '    if "Dekkingskaart doorrijhoogte" in t: print("DEKKING", i + 1)',
  ].join(String.fromCharCode(10)), pdfPad, path.join(H.UIT, 'doorrijhoogte_pdfblad.png')], { encoding: 'utf8' });
  const tekst = py.stdout || '';
  console.log('7 uit de PDF:', tekst.slice(0, 600).replace(/\s+/g, ' '), py.stderr ? py.stderr.slice(0, 200) : '');
  const b1pdf = r.boxen[0];
  const vrijTekst = `${b1pdf.vrijMin.toFixed(2).replace('.', ',')} m`, spelingTekst = `${b1pdf.speling < 0 ? '-' : '+'}${Math.abs(b1pdf.speling).toFixed(2).replace('.', ',')} m`;
  if (!/BLAD \d+/.test(tekst)) fouten.push('7: het blad Doorrijhoogte staat niet in de PDF');
  if (!tekst.includes(vrijTekst) || !tekst.includes(spelingTekst)) fouten.push(`7: kleinste vrije hoogte (${vrijTekst}) of speling (${spelingTekst}) niet op het blad`);
  if (!/DEKKING \d+/.test(tekst)) fouten.push('7: de dekkingskaart van de doorrijhoogte staat niet in de PDF');
  if (!/VOLDOET NIET/.test(tekst)) fouten.push('7: oordeel niet op het blad');

  // schermafdruk: venster, dan dwars- en lengteprofiel
  if (await p.isVisible('#pdfDialoog[open]')) await p.keyboard.press('Escape');
  if (!(await p.isVisible('#drDialoog[open]'))) { await p.click('#doorrijKnop'); await p.waitForTimeout(400); }
  await p.screenshot({ path: path.join(H.UIT, 'doorrijhoogte_venster.png') });
  await p.click('#drSluit');
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(H.UIT, 'doorrijhoogte.png') });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
