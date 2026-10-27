// Omzetten door het programma vanuit de viewer (2.11.0, plan omzetten-in-exe F2): in het eigen
// venster kiest "Openen…" de scan met de Windows-kiezer (B3), het programma zet om met voortgang en
// Afbreken, en lukt het niet dan zet de viewer zelf om (B4). De testserver (hulp.js) doet de
// omzettaak van de exe na met pvomzet (dezelfde Go-code).
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'omzetten_viewer');
(async () => {
  await H.start();
  H.pvomzet();
  fs.rmSync(UIT, { recursive: true, force: true });
  fs.mkdirSync(path.join(UIT, 'scans'), { recursive: true });
  const scan = (naam) => { const f = path.join(UIT, 'scans', naam); fs.copyFileSync(H.data('groot', 'dijk_begroeid.las'), f); return f; };
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(120000);
  const fouten = [];
  p.on('pageerror', e => { fouten.push(e.message); console.log('!! pagina:', e.message); });
  p.on('console', m => { if (m.type() === 'error') { fouten.push('console: ' + m.text().slice(0, 200)); console.log('!! console:', m.text().slice(0, 200)); } });
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl|brk-kadastrale-kaart/, r => r.abort());
  await p.addInitScript((sleutel) => {
    window.__pvNatief = Object.freeze({ sleutel, versie: 'test' });
    // het bestandsveld van de browser mag niet meer gebruikt worden voor puntenwolk A
    window.__veldGeklikt = 0;
    const klik = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () { if (this.id === 'ptsBestand') window.__veldGeklikt++; return klik.call(this); };
  }, H.natief.sleutel);
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const openen = async (scanPad, projMap) => {
    H.natief.kiesRij.push(scanPad);
    await p.click('button.bestandOpen[data-voor="ptsBestand"]');
    if (projMap) { fs.mkdirSync(projMap, { recursive: true }); H.natief.kiesRij.push(projMap); await p.waitForSelector('#projectMapDialoog[open]'); await p.click('#pmKies'); }
  };
  const volg = async (stop, max = 240) => {   // statusregels verzamelen tot stop(status) waar is
    const gezien = [];
    for (let i = 0; i < max * 10; i++) { const s = await st(); if (gezien[gezien.length - 1] !== s) gezien.push(s); if (stop(s) || fouten.length) break; await p.waitForTimeout(100); }
    return gezien;
  };
  const geenTijdelijk = (map) => !fs.existsSync(map) || fs.readdirSync(map).every(n => !n.endsWith('.pvtmp'));

  // 1. omzetten door het programma, met voortgang
  const proj1 = path.join(UIT, 'proj1');
  let n0 = H.natief.omzettingen;
  await openen(scan('dijk1.las'), proj1);
  let gezien = await volg(s => /driehoeken/.test(s));
  const voortgang = gezien.filter(s => /omzetten naar vakken \(programma\)… \d+%/.test(s));
  console.log('1 voortgang:', voortgang.length, 'regels, bv.', voortgang.slice(0, 3).map(s => s.replace(/^.*?… /, '')).join(' | '));
  console.log('1 klaar:', (await st()).slice(0, 60), '…', (await st()).match(/· omgezet in .*$/)?.[0]);
  const info1 = JSON.parse(fs.readFileSync(path.join(proj1, 'puntenwolk', 'A - dijk1', 'info.json'), 'utf8'));
  console.log('1 info.json: aantal', info1.aantal, '| vakken', info1.tegels.length, '| gemaakt door', info1.viewer, '| omzettaken', H.natief.omzettingen - n0);
  if (H.natief.omzettingen - n0 !== 1 || !/pvomzet/.test(info1.viewer)) fouten.push('niet omgezet door het programma');
  if (!voortgang.length) fouten.push('geen voortgang gezien');
  if (!/omgezet in \d+ s door het programma/.test(await st())) fouten.push('omzettijd niet zichtbaar');
  if (!geenTijdelijk(path.join(proj1, 'puntenwolk'))) fouten.push('tijdelijke map blijft staan');

  // 2. afbreken: niets blijft achter, de viewer blijft bruikbaar
  await p.reload(); await p.waitForTimeout(800);
  const proj2 = path.join(UIT, 'proj2');
  await openen(scan('dijk2.las'), proj2);
  await p.waitForSelector('#omzetAfbreken:not([hidden])');
  await p.waitForTimeout(300);
  await p.click('#omzetAfbreken');
  gezien = await volg(s => /afgebroken|driehoeken/.test(s), 60);
  console.log('2 na afbreken:', await st(), '| knop zichtbaar:', await p.isVisible('#omzetAfbreken'));
  const wolk2 = path.join(proj2, 'puntenwolk', 'A - dijk2');
  const over = fs.existsSync(wolk2) ? fs.readdirSync(wolk2) : [];
  console.log('2 in de map:', JSON.stringify(over), '| tijdelijk over:', !geenTijdelijk(path.join(proj2, 'puntenwolk')));
  if (!/afgebroken/.test(await st())) fouten.push('afbreken niet gemeld');
  if (over.length) fouten.push(`na afbreken staat er iets in ${wolk2}: ${over}`);
  if (!geenTijdelijk(path.join(proj2, 'puntenwolk'))) fouten.push('tijdelijke map blijft staan na afbreken');
  // dezelfde scan opnieuw: werkt gewoon
  await openen(path.join(UIT, 'scans', 'dijk2.las'), null);
  await volg(s => /driehoeken/.test(s));
  console.log('2 daarna opnieuw:', (await st()).slice(0, 50), '…', (await st()).match(/· omgezet in .*$/)?.[0]);
  if (!fs.existsSync(path.join(wolk2, 'info.json'))) fouten.push('na afbreken niet opnieuw om te zetten');

  // 3. het programma kan niet omzetten: de viewer zet zelf om (terugval, B4), via stukjes lezen met Range
  await p.reload(); await p.waitForTimeout(800);
  H.natief.omzetFout = 'proef: dit formaat zet het programma niet om';
  const proj3 = path.join(UIT, 'proj3');
  await openen(scan('dijk3.las'), proj3);
  gezien = await volg(s => /driehoeken/.test(s));
  H.natief.omzetFout = null;
  const melding = gezien.find(s => /het programma kon niet omzetten/.test(s));
  const info3 = JSON.parse(fs.readFileSync(path.join(proj3, 'puntenwolk', 'A - dijk3', 'info.json'), 'utf8'));
  console.log('3 melding:', melding?.slice(0, 120));
  console.log('3 info.json: aantal', info3.aantal, '| gemaakt door', info3.viewer, '|', (await st()).match(/· omgezet in .*$/)?.[0]);
  if (!melding) fouten.push('geen melding bij de terugval');
  if (info3.aantal !== 3000000 || /pvomzet/.test(info3.viewer)) fouten.push('terugval zette niet om in de viewer');
  // de vakken van de terugval zijn gelijk aan die van het programma (B2)
  const vak = (proj, n) => fs.readFileSync(path.join(proj, 'puntenwolk', n, 'tegels', '1640_7780.pvt'));
  if (!vak(proj3, 'A - dijk3').equals(vak(proj1, 'A - dijk1'))) fouten.push('vakken van de terugval wijken af');

  const veld = await p.evaluate(() => window.__veldGeklikt);
  console.log('bestandsveld van de browser gebruikt:', veld);
  if (veld) fouten.push('het bestandsveld van de browser werd gebruikt');
  await p.screenshot({ path: path.join(H.UIT, 'omzetten_viewer.png') });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
