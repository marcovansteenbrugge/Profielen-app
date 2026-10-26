const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
const D = H.data('snoei_test'), U = H.UIT;
const MET_PDF = process.argv.includes('pdf'), GATEN = process.argv.includes('gaten');
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox', '--lang=nl-NL'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, locale: 'nl-NL', acceptDownloads: true });
  const p = await ctx.newPage();
  await p.addInitScript(require('./zonder_map.js'));
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  await p.route(/pdok\.nl/, r => r.abort());
  await p.route(/brk-kadastrale-kaart/, r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(D + '/kadaster_percelen.geojson') }));
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-oppervlak', 'onder'); });
  await p.reload();
  await p.setInputFiles('#ptsBestand', D + (GATEN ? '/bospad_scan_gaten.pts' : '/bospad_scan.pts'));
  for (let i = 0; i < 400; i++) { if (/driehoeken/.test(await p.textContent('#status'))) break; await p.waitForTimeout(250); }
  await p.setInputFiles('#asBestand', D + '/as_schouwpad.geojson'); await p.waitForTimeout(600);
  await p.evaluate((v) => { const e = document.getElementById('dwarsBreedte'); e.value = v; e.dispatchEvent(new Event('change')); }, '16');
  await p.fill('#dwarsInterval', '5'); await p.dispatchEvent('#dwarsInterval', 'change');
  // stationering: dijkpalen
  await p.click('#stationeringKnop'); await p.waitForTimeout(200);
  await p.setInputFiles('#paalBestand', D + '/dijkpalen.geojson'); await p.waitForTimeout(500);
  console.log('status:', (await p.textContent('#status')).trim());
  console.log('knop:', await p.textContent('#stationeringKnop'));
  console.log((await p.evaluate(() => [...document.querySelectorAll('#paalResultaat tr, #paalResultaat p')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).join('\n'))));
  await p.check('#paalProfielen'); await p.waitForTimeout(300);
  console.log('stations:', await p.evaluate(() => window.__pv ? '' : ''));
  await p.screenshot({ path: H.UIT + '/paal_dialoog.png' });
  await p.click('#paalSluit'); await p.waitForTimeout(300);
  console.log('label:', await p.textContent('#stationLabel'));
  await p.fill('#paalGaNaar', 'DP 33 +10'); await p.press('#paalGaNaar', 'Enter'); await p.waitForTimeout(300);
  console.log('ga naar DP 33 +10 →', await p.textContent('#stationLabel'), '|', (await p.textContent('#status')).trim());
  await p.fill('#paalGaNaar', '34+0'); await p.press('#paalGaNaar', 'Enter'); await p.waitForTimeout(300);
  console.log('ga naar 34+0 →', await p.textContent('#stationLabel'));
  await p.screenshot({ path: H.UIT + '/paal_scherm.png' });
  // snoeicheck + kadaster
  await p.click('#snoeiKnop'); await p.waitForTimeout(300);
  await p.click('#snUitA');
  for (let i = 0; i < 100; i++) { if (/Begroeiing: .* punten in de strook/.test(await p.textContent('#status')) && !/%/.test(await p.textContent('#status'))) break; await p.waitForTimeout(200); }
  await p.click('#snControleer'); await p.waitForTimeout(800);
  console.log((await p.evaluate(() => [...document.querySelectorAll('#snResultaat tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).join('\n'))));
  console.log((await p.evaluate(() => [...document.querySelectorAll('#snLijst tbody tr')].slice(0, 4).map(r => r.textContent.replace(/\s+/g, ' ').trim()).join('\n'))));
  await p.screenshot({ path: H.UIT + '/paal_snoei.png' });
  await p.click('#snSluit'); await p.waitForTimeout(300);
  await p.uncheck('#toonDwarslijnen'); await p.waitForTimeout(200);
  await p.mouse.move(640, 560); for (let i = 0; i < 2; i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(150); }
  await p.waitForTimeout(400);
  await p.screenshot({ path: H.UIT + '/paal_snoei_kaart.png', clip: { x: 0, y: 300, width: 905, height: 650 } });
  await p.check('#toonDwarslijnen');
  await p.click('#snoeiKnop'); await p.waitForTimeout(300);
  const [csv] = await Promise.all([p.waitForEvent('download'), p.click('#snCsv')]); await csv.saveAs(H.UIT + '/snoeilijst.csv');
  console.log('csv:', fs.readFileSync(U + '/snoeilijst.csv', 'utf8').split('\n').slice(1, 3).join('\n'));
  await p.click('#snSluit'); await p.waitForTimeout(400);
  // hectometrering
  await p.click('#stationeringKnop'); await p.waitForTimeout(200);
  await p.check('input[name="paalModus"][value="hm"]'); await p.fill('#paalHmStart', '12.34'); await p.dispatchEvent('#paalHmStart', 'input'); await p.waitForTimeout(300);
  console.log('hm:', (await p.evaluate(() => [...document.querySelectorAll('#paalResultaat tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).join(' | '))));
  await p.click('#paalSluit'); await p.waitForTimeout(300);
  console.log('label hm:', await p.textContent('#stationLabel'));
  await p.screenshot({ path: H.UIT + '/hm_scherm.png' });
  // terug naar palen
  await p.click('#stationeringKnop'); await p.check('input[name="paalModus"][value="palen"]'); await p.waitForTimeout(200); await p.click('#paalSluit');
  if (MET_PDF) {
    await p.click('#printKnop'); await p.waitForTimeout(400);
    await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Testset dijkpalen'); z('pdf3D', false); });
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
    await dl.saveAs(H.UIT + '/paal.pdf'); console.log('PDF:', (await p.textContent('#status')).trim());
    const [g] = await Promise.all([p.waitForEvent('download'), p.click('#gpkgKnop')]); await g.saveAs(H.UIT + '/paal.gpkg');
    console.log('GPKG:', (await p.textContent('#status')).trim().slice(0, 300));
    const [dx] = await Promise.all([p.waitForEvent('download'), p.click('#dxfKnop')]); await dx.saveAs(H.UIT + '/paal.dxf');
  }
  const [pj] = await Promise.all([p.waitForEvent('download'), p.click('#projectOpslaanKnop')]); await pj.saveAs(H.UIT + '/paal_project.json');
  await p.reload(); await p.waitForTimeout(800);
  await p.setInputFiles('#projectLadenVeld', U + '/paal_project.json');
  for (let i = 0; i < 100; i++) { if (/DP/.test(await p.textContent('#stationLabel') || '')) break; await p.waitForTimeout(250); }
  console.log('na herladen:', await p.textContent('#stationLabel'), '|', await p.textContent('#stationeringKnop'));
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
