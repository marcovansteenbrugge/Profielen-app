// Tools (2.15.0): per tool alleen de eigen toets, eigen accentkleur, en het project onthoudt de tool.
const H = require('./hulp');
const { chromium } = H;
const D = H.data('snoei_test'), U = H.UIT;
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  await p.addInitScript(require('./zonder_map.js'));
  const fouten = []; p.on('pageerror', e => fouten.push(e.message));
  const fout = (t) => { fouten.push(t); console.log('FOUT:', t); };
  await p.route(/pdok\.nl/, r => r.abort());
  await p.goto(H.URL);
  await p.evaluate(() => localStorage.setItem('ptsviewer-a-maaiveld', '0'));
  await p.reload();

  const stand = () => p.evaluate(() => {
    const zicht = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && !!e.closest('section') && getComputedStyle(e.closest('section')).display !== 'none'; };
    const label = (id) => getComputedStyle(document.getElementById(id).closest('label')).display !== 'none';
    return {
      w: window.__pvTest.werksoort(),
      accent: getComputedStyle(document.body).getPropertyValue('--accent').trim().toUpperCase(),
      knoppen: ['doorvaartKnop', 'snoeiKnop', 'doorrijKnop'].filter(zicht),
      chips: ['dvChip', 'snChip', 'drChip'].filter(zicht),
      pdf: ['pdfDoorvaart', 'pdfSnoei', 'pdfDoorrij', 'pdfRws'].filter(label),
      label: getComputedStyle(document.getElementById('toolLabel')).display !== 'none' ? document.getElementById('toolNaam').textContent : null,
      andere: getComputedStyle(document.getElementById('andereToolKnop')).display !== 'none',
    };
  });

  // 1. zonder tool ('alles'): alles zoals vóór 2.15.0
  let s = await stand();
  console.log('alles:', JSON.stringify(s));
  if (s.w !== 'alles' || s.knoppen.length !== 3 || s.pdf.length !== 4 || s.label || s.andere || s.accent !== '#1E7FA6') fout('stand alles klopt niet');

  await p.setInputFiles('#ptsBestand', D + '/bospad_scan.pts');
  for (let i = 0; i < 400; i++) { if (/driehoeken/.test(await p.textContent('#status'))) break; await p.waitForTimeout(250); }
  await p.setInputFiles('#asBestand', D + '/as_schouwpad.geojson'); await p.waitForTimeout(1500);

  // 2. per tool
  const verwacht = {
    profielen: { accent: '#C2650A', knoppen: [], pdf: [], naam: 'Profielen Tool' },
    doorvaart: { accent: '#185FA5', knoppen: ['doorvaartKnop'], chips: ['dvChip'], pdf: ['pdfDoorvaart'], naam: 'Doorvaarthoogte' },
    doorrij: { accent: '#A32D2D', knoppen: ['doorrijKnop'], chips: ['drChip'], pdf: ['pdfDoorrij', 'pdfRws'], naam: 'Doorrijhoogte' },
    snoei: { accent: '#3B6D11', knoppen: ['snoeiKnop'], chips: ['snChip'], pdf: ['pdfSnoei'], naam: 'Snoeien' },
  };
  for (const [w, v] of Object.entries(verwacht)) {
    await p.evaluate((w) => window.__pvTest.zetWerksoort(w), w); await p.waitForTimeout(300);
    s = await stand();
    console.log(w + ':', JSON.stringify(s));
    if (s.accent !== v.accent) fout(`${w}: accent ${s.accent}, verwacht ${v.accent}`);
    if (JSON.stringify(s.knoppen) !== JSON.stringify(v.knoppen)) fout(`${w}: knoppen ${s.knoppen}`);
    if (JSON.stringify(s.chips) !== JSON.stringify(v.chips || [])) fout(`${w}: chips ${s.chips}`);
    if (JSON.stringify(s.pdf) !== JSON.stringify(v.pdf)) fout(`${w}: pdf-opties ${s.pdf}`);
    if (s.label !== v.naam) fout(`${w}: label ${s.label}`);
    if (!s.andere) fout(`${w}: knop Andere tool ontbreekt`);
    await p.screenshot({ path: `${U}/werksoort_${w}.png` });
  }

  // 3. project onthoudt de tool
  await p.evaluate(() => window.__pvTest.zetWerksoort('doorrij'));
  const tekst = await p.evaluate(() => window.__pvTest.projectTekst());
  const proj = JSON.parse(tekst);
  console.log('in project:', proj.instellingen.werksoort, 'doorrij.gecontroleerd:', proj.instellingen.doorrij?.gecontroleerd);
  if (proj.instellingen.werksoort !== 'doorrij') fout('werksoort niet in het project');
  await p.evaluate(() => window.__pvTest.zetWerksoort('profielen'));
  await p.evaluate((t) => window.__pvTest.laadProjectTekst(t), tekst); await p.waitForTimeout(800);
  s = await stand(); console.log('na openen:', s.w);
  if (s.w !== 'doorrij') fout(`project opende in ${s.w}, verwacht doorrij`);

  // 4. oud project (zonder tool): raden uit de inhoud
  const oud = (aanpas) => { const o = JSON.parse(tekst); delete o.instellingen.werksoort; aanpas(o); return JSON.stringify(o); };
  const gevallen = [
    ['doorrij gecontroleerd', (o) => { o.instellingen.doorrij.gecontroleerd = true; }, 'doorrij'],
    ['niets', (o) => { delete o.instellingen.doorrij.gecontroleerd; o.brug = null; o.begroeiing = null; }, 'profielen'],
  ];
  for (const [naam, aanpas, w] of gevallen) {
    await p.evaluate(() => window.__pvTest.zetWerksoort('snoei'));
    await p.evaluate((t) => window.__pvTest.laadProjectTekst(t), oud(aanpas)); await p.waitForTimeout(800);
    s = await stand(); const st = await p.textContent('#status');
    console.log(`oud project (${naam}):`, s.w, '|', st.slice(-110));
    if (s.w !== w) fout(`oud project (${naam}) opende in ${s.w}, verwacht ${w}`);
    if (!/geraden uit de inhoud/.test(st)) fout(`oud project (${naam}): geen melding dat de tool geraden is`);
  }
  // raden zonder pagina: brug en begroeiing
  const r = await p.evaluate(() => [window.__pvTest.werksoortVanProject({ instellingen: {}, brug: { onder: {} } }).w, window.__pvTest.werksoortVanProject({ instellingen: {}, begroeiing: {} }).w]);
  console.log('raden brug/begroeiing:', r.join(', '));
  if (r[0] !== 'doorvaart' || r[1] !== 'snoei') fout('raden brug/begroeiing klopt niet');

  // 5. in de stand 'alles' (tests) laat een project de stand staan
  await p.evaluate(() => window.__pvTest.zetWerksoort('alles'));
  await p.evaluate((t) => window.__pvTest.laadProjectTekst(t), tekst); await p.waitForTimeout(800);
  s = await stand(); console.log('alles + project:', s.w);
  if (s.w !== 'alles') fout('stand alles verdween bij project openen');

  // 6. Andere tool… (dialoog) en ?werksoort= in de adresregel
  await p.evaluate(() => window.__pvTest.zetWerksoort('profielen'));
  await p.click('#andereToolKnop'); await p.waitForSelector('#toolDialoog[open]');
  await p.screenshot({ path: `${U}/werksoort_dialoog.png` });
  await p.click('#tdTegels .toolTegel[data-w="snoei"]'); await p.waitForTimeout(300);
  s = await stand(); console.log('na Andere tool:', s.w);
  if (s.w !== 'snoei') fout('Andere tool zette de tool niet');
  await p.goto(H.URL + '?werksoort=doorvaart'); await p.waitForTimeout(800);
  s = await stand(); console.log('adresregel:', s.w);
  if (s.w !== 'doorvaart') fout('?werksoort= werkt niet');

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
  process.exit(0);
})();
