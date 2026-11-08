// Startscherm (2.15.0): tool kiezen, projectnaam, nieuwe map maken, recente projecten met de kleur van hun
// tool, en overslaan als de exe een project meegeeft.
const fs = require('fs'), path = require('path'), os = require('os');
const H = require('./hulp');
const { chromium } = H;
const D = H.data('snoei_test'), U = H.UIT;
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const fouten = [];
  const fout = (t) => { fouten.push(t); console.log('FOUT:', t); };
  const nieuwePagina = async (initScript, arg) => {
    const ctx = await b.newContext({ viewport: { width: 1500, height: 920 } });
    const p = await ctx.newPage(); p.setDefaultTimeout(60000);
    p.on('pageerror', e => fout('pagina: ' + e.message));
    p.on('dialog', d => d.accept());
    await p.route(/pdok\.nl/, r => r.abort());
    await p.addInitScript(initScript, arg);
    return p;
  };
  const stand = (p) => p.evaluate(() => ({
    open: !!document.getElementById('startDialoog')?.open,
    w: window.__pvTest.werksoort(),
    knop: document.getElementById('ssStart').textContent,
    info: document.getElementById('ssInfo').textContent,
    map: document.getElementById('ssMap').textContent,
  }));

  // ── A. in de browser (mappen in de eigen opslag van de browser) ──
  const p = await nieuwePagina(() => {
    window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('ouder', { create: true });
  });
  await p.goto(H.BASIS);
  await p.evaluate(async () => {
    localStorage.clear();
    try { await (await navigator.storage.getDirectory()).removeEntry('ouder', { recursive: true }); } catch { /* nog niet */ }
    await new Promise(ok => { const q = indexedDB.deleteDatabase('profielviewer'); q.onsuccess = q.onerror = ok; });
  });
  await p.reload();
  await p.waitForSelector('#startDialoog[open]');
  let s = await stand(p);
  const tegels = await p.$$eval('#ssTegels .toolTegel', ts => ts.map(t => t.dataset.w + ':' + t.querySelector('b').textContent));
  console.log('A1 startscherm:', JSON.stringify(s), '| tegels:', tegels.join(', '));
  if (!s.open || s.w !== 'profielen' || tegels.length !== 4 || !tegels.includes('profielen:Profielen Tool')) fout('startscherm niet zoals verwacht');
  await p.screenshot({ path: `${U}/startscherm_leeg.png` });
  // Esc sluit het niet
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  if (!(await stand(p)).open) fout('Esc sloot het startscherm');

  await p.click('#ssTegels .toolTegel[data-w="doorrij"]'); await p.waitForTimeout(200);
  s = await stand(p); console.log('A2 doorrij gekozen:', s.w, '|', s.knop);
  if (s.w !== 'doorrij' || s.knop !== 'Start Doorrijhoogte') fout('tegel kiezen werkt niet');
  await p.click('#ssStart'); await p.waitForTimeout(200);
  s = await stand(p); console.log('A3 Start zonder map:', s.info);
  if (!/Kies of maak eerst/.test(s.info)) fout('geen melding bij Start zonder map');
  await p.click('#ssNieuweMap'); await p.waitForTimeout(200);
  s = await stand(p); console.log('A4 nieuwe map zonder naam:', s.info);
  if (!/projectnaam/.test(s.info)) fout('geen melding bij nieuwe map zonder naam');
  await p.fill('#ssNaam', 'Bergstraat test');
  await p.click('#ssNieuweMap'); await p.waitForTimeout(500);
  s = await stand(p); console.log('A5 nieuwe map:', s.map);
  if (s.map !== 'Bergstraat test') fout('nieuwe map niet gekozen');
  await p.screenshot({ path: `${U}/startscherm_gekozen.png` });
  await p.click('#ssStart');
  for (let i = 0; i < 40 && !/Nieuw project/.test(await p.textContent('#status')); i++) await p.waitForTimeout(250);
  s = await stand(p); const status = await p.textContent('#status');
  console.log('A6 na Start:', s.open, s.w, '|', status);
  if (s.open || s.w !== 'doorrij') fout('na Start: startscherm open of verkeerde tool');
  const opSchijf = await p.evaluate(async () => {
    const m = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('ouder')).getDirectoryHandle('Bergstraat test');
    const namen = []; for await (const [n] of m.entries()) namen.push(n);
    const proj = JSON.parse(await (await (await m.getFileHandle('Bergstraat test.pvproj')).getFile()).text());
    const recent = await new Promise(ok => { const r = indexedDB.open('profielviewer', 1); r.onsuccess = () => { const q = r.result.transaction('recent').objectStore('recent').getAll(); q.onsuccess = () => ok(q.result.map(x => ({ naam: x.naam, soort: x.soort }))); }; });
    return { namen: namen.sort(), werksoort: proj.instellingen.werksoort, stempel: document.getElementById('pdfProjectnaam').value, recent };
  });
  console.log('A7 op schijf:', JSON.stringify(opSchijf));
  for (const n of ['Bergstraat test.pvproj', 'backup', 'ondergrond', 'puntenwolk', 'uitvoer']) if (!opSchijf.namen.includes(n)) fout(`${n} ontbreekt in de nieuwe map`);
  if (opSchijf.werksoort !== 'doorrij') fout('tool niet in het projectbestand');
  if (opSchijf.stempel !== 'Bergstraat test') fout('projectnaam niet in het PDF-stempel');
  if (opSchijf.recent[0]?.soort !== 'doorrij') fout('tool niet in de recente projecten');

  // puntenwolk inlezen: er wordt niet nog eens om een map gevraagd
  await p.setInputFiles('#ptsBestand', D + '/bospad_scan.pts');
  let mapVraag = false;
  for (let i = 0; i < 480; i++) {
    if (await p.evaluate(() => !!document.getElementById('projectMapDialoog')?.open)) { mapVraag = true; break; }
    const k = await p.$('#klassenDialoog[open]'); if (k) await H.klassenInlezen(p);
    if (/driehoeken/.test(await p.textContent('#status'))) break;
    await p.waitForTimeout(250);
  }
  console.log('A8 puntenwolk:', mapVraag ? 'MAPVRAAG' : (await p.textContent('#status')).slice(0, 120));
  if (mapVraag) fout('het venster Projectmap vroeg opnieuw om een map');
  await p.screenshot({ path: `${U}/startscherm_na_start.png` });

  // herladen: startscherm met het recente project in rood, en de laatst gekozen tool voorgeselecteerd
  await p.reload(); await p.waitForSelector('#startDialoog[open]'); await p.waitForTimeout(500);
  const recent = await p.$$eval('#ssRecent button', bs => bs.map(k => ({ naam: k.children[1].textContent, kleur: getComputedStyle(k.children[0]).backgroundColor })));
  s = await stand(p); console.log('A9 herladen:', s.w, JSON.stringify(recent));
  if (s.w !== 'doorrij') fout('laatst gekozen tool niet voorgeselecteerd');
  if (recent[0]?.naam !== 'Bergstraat test' || recent[0]?.kleur !== 'rgb(163, 45, 45)') fout('recent project zonder rode stip');
  await p.click('#ssTegels .toolTegel[data-w="snoei"]');
  await p.screenshot({ path: `${U}/startscherm_recent.png` });
  await p.click('#ssRecent button');
  for (let i = 0; i < 80 && (await stand(p)).open; i++) await p.waitForTimeout(250);
  await p.waitForTimeout(1500);
  s = await stand(p); console.log('A10 recent geopend:', s.open, s.w, '|', (await p.textContent('#status')).slice(0, 100));
  if (s.open || s.w !== 'doorrij') fout('recent project opende niet in zijn eigen tool');

  // ── B. eigen venster (exe): project meegegeven bij de start → geen startscherm, tool uit het project ──
  const MAP = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-start-'));
  const projMap = path.join(MAP, 'Brug Zuid');
  fs.mkdirSync(projMap); for (const n of ['puntenwolk', 'ondergrond', 'uitvoer', 'backup']) fs.mkdirSync(path.join(projMap, n));
  const proj = JSON.parse(await p.evaluate(() => window.__pvTest.projectTekst()));
  proj.instellingen.werksoort = 'doorvaart'; proj.puntenwolkMap = null; proj.ondergrond = {};
  fs.writeFileSync(path.join(projMap, 'Brug Zuid.pvproj'), JSON.stringify(proj));
  H.natief.toegestaan.push(MAP);
  H.natief.recent = [{ naam: 'Brug Zuid', pad: projMap, tijd: Date.now(), soort: 'doorvaart' }, { naam: 'Oud project', pad: MAP, tijd: Date.now() - 864e5 }];
  const q = await nieuwePagina(([sleutel, openen]) => { window.__pvNatief = Object.freeze({ sleutel, versie: 'test', openen }); }, [H.natief.sleutel, projMap]);
  await q.goto(H.BASIS); await q.waitForTimeout(2500);
  s = await stand(q); console.log('B1 exe met project:', s.open, s.w, '|', (await q.textContent('#status')).slice(0, 100));
  if (s.open || s.w !== 'doorvaart') fout('met een meegegeven project: startscherm open of verkeerde tool');
  // zonder meegegeven project: recente lijst van het programma, met de kleur van de tool (oude regel grijs)
  const r2 = await nieuwePagina((sleutel) => { window.__pvNatief = Object.freeze({ sleutel, versie: 'test' }); }, H.natief.sleutel);
  await r2.goto(H.BASIS); await r2.waitForSelector('#startDialoog[open]'); await r2.waitForTimeout(500);
  const recentB = await r2.$$eval('#ssRecent button', bs => bs.map(k => k.children[1].textContent + ':' + getComputedStyle(k.children[0]).backgroundColor));
  console.log('B2 recent in de exe:', recentB.join(' | '));
  if (recentB[0] !== 'Brug Zuid:rgb(24, 95, 165)' || !/^Oud project:rgb\(180, 188, 196\)/.test(recentB[1] || '')) fout('kleuren in de recente lijst van de exe kloppen niet');

  fs.rmSync(MAP, { recursive: true, force: true });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
  process.exit(0);
})();
