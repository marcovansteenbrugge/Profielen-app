const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
const U = H.UIT, MODUS = process.argv[2] || 'bospad';
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox', '--lang=nl-NL'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, locale: 'nl-NL', acceptDownloads: true });
  const p = await ctx.newPage();
  await p.addInitScript(require('./zonder_map.js'));
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  await p.route(/pdok\.nl/, r => r.abort());
  await p.route(/brk-kadastrale-kaart/, r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(H.data('snoei_test', 'kadaster_percelen.geojson')) }));
  await p.goto(H.URL);
  await p.evaluate((m) => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-oppervlak', m === 'bospad' ? 'onder' : 'boven'); }, MODUS);
  await p.reload();
  const wacht = async (re, n = 400) => { for (let i = 0; i < n; i++) { if (re.test(await p.textContent('#status'))) return; await p.waitForTimeout(250); } };
  if (MODUS === 'bospad') {
    const D = H.data('snoei_test');
    await p.setInputFiles('#ptsBestand', D + '/bospad_scan_gaten.pts'); await wacht(/driehoeken/);
    await p.setInputFiles('#asBestand', D + '/as_schouwpad.geojson'); await p.waitForTimeout(600);
    await p.evaluate((v) => { const e = document.getElementById('dwarsBreedte'); e.value = v; e.dispatchEvent(new Event('change')); }, '16');
    await p.fill('#dwarsInterval', '5'); await p.dispatchEvent('#dwarsInterval', 'change');
    await p.click('#stationeringKnop'); await p.setInputFiles('#paalBestand', D + '/dijkpalen.geojson'); await p.waitForTimeout(400); await p.check('#paalProfielen'); await p.click('#paalSluit');
    await p.click('#snoeiKnop'); await p.waitForTimeout(300); await p.click('#snUitA');
    for (let i = 0; i < 100; i++) { const t = await p.textContent('#status'); if (/Begroeiing: .* punten in de strook/.test(t) && !/%/.test(t)) break; await p.waitForTimeout(200); }
    await p.click('#snKadOphalen'); await p.waitForTimeout(600);
    await p.click('#snControleer'); await p.waitForTimeout(800); await p.click('#snSluit');
  } else {
    const D = H.data('doorvaart_test');
    await p.setInputFiles('#ptsBestand', D + '/bodem_multibeam_gaten.pts'); await wacht(/driehoeken/);
    await p.setInputFiles('#asBestand', D + '/as_vaarweg.geojson'); await p.waitForTimeout(600);
    await p.evaluate((v) => { const e = document.getElementById('dwarsBreedte'); e.value = v; e.dispatchEvent(new Event('change')); }, '60');
    await p.fill('#dwarsInterval', '5'); await p.dispatchEvent('#dwarsInterval', 'change');
    await p.fill('#waterpeil', '0.40'); await p.dispatchEvent('#waterpeil', 'input');
    await p.click('#stationeringKnop'); await p.check('input[name="paalModus"][value="hm"]'); await p.fill('#paalHmStart', '3.2'); await p.dispatchEvent('#paalHmStart', 'input'); await p.click('#paalSluit');
    await p.click('#doorvaartKnop'); await p.waitForTimeout(300);
    await p.setInputFiles('#dvOnderBestand', D + '/brug_onderzijde_gaten.pts'); await wacht(/onderzijde brug: .* punten/, 100);
    await p.setInputFiles('#dvBovenBestand', D + '/brug_bovenzijde.pts'); await wacht(/bovenzijde brug: .* punten/, 100);
    const vul = async (id, v) => { await p.fill('#' + id, String(v)); await p.dispatchEvent('#' + id, 'input'); };
    await vul('dvToetspeil', '1.10'); await vul('dvHoogte', '4.5'); await vul('dvBreedte', '20'); await vul('dvDiepte', '3.0'); await vul('dvDieptePeil', '0.40');
    await p.click('#dvControleer'); await p.waitForTimeout(1200); await p.click('#dvSluit');
  }
  const t0 = Date.now();
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }).catch(async e => { console.log('STATUS:', await p.textContent('#status'), fouten.join('|')); throw e; }), p.click('#ifcKnop')]);
  await dl.saveAs(`${H.UIT}/${MODUS}.ifc`);
  console.log('IFC:', (await p.textContent('#status')).trim(), `(${Date.now() - t0} ms)`);
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
