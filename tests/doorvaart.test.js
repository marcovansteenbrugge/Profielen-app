const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
const D = H.data('doorvaart_test'), U = H.UIT;
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox', '--lang=nl-NL'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, locale: 'nl-NL', acceptDownloads: true });
  const p = await ctx.newPage();
  await p.addInitScript(require('./zonder_map.js'));
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  await p.route(/pdok\.nl/, r => r.abort());
  await p.goto(H.URL);
  await p.evaluate(() => localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'));
  await p.setInputFiles('#ptsBestand', D + '/bodem_multibeam.pts');
  for (let i = 0; i < 400; i++) { if (/driehoeken/.test(await p.textContent('#status'))) break; await p.waitForTimeout(250); }
  await p.setInputFiles('#asBestand', D + '/as_vaarweg.geojson'); await p.waitForTimeout(600);
  await p.evaluate((v) => { const e = document.getElementById('dwarsBreedte'); e.value = v; e.dispatchEvent(new Event('change')); }, '60');
  await p.fill('#dwarsInterval', '2'); await p.dispatchEvent('#dwarsInterval', 'change');
  await p.fill('#waterpeil', '0.40'); await p.dispatchEvent('#waterpeil', 'input');
  await p.fill('#maatDwars', '5'); await p.dispatchEvent('#maatDwars', 'change');
  await p.click('#doorvaartKnop'); await p.waitForTimeout(300);
  await p.setInputFiles('#dvOnderBestand', D + '/brug_onderzijde.pts');
  for (let i = 0; i < 100; i++) { if (/onderzijde brug: .* punten/.test(await p.textContent('#status'))) break; await p.waitForTimeout(200); }
  await p.setInputFiles('#dvBovenBestand', D + '/brug_bovenzijde.pts');
  for (let i = 0; i < 100; i++) { if (/bovenzijde brug: .* punten/.test(await p.textContent('#status'))) break; await p.waitForTimeout(200); }
  const vul = async (id, v) => { await p.fill('#' + id, String(v)); await p.dispatchEvent('#' + id, 'input'); };
  await vul('dvToetspeil', '1.10'); await vul('dvHoogte', '4.5'); await vul('dvBreedte', '20'); await vul('dvDiepte', '3.0'); await vul('dvDieptePeil', '0.40');
  await p.click('#dvControleer'); await p.waitForTimeout(1200);
  console.log('status:', (await p.textContent('#status')).trim());
  console.log('auto:', await p.textContent('#dvAutoTekst'));
  console.log((await p.evaluate(() => [...document.querySelectorAll('#dvResultaat tr')].map(r => r.textContent.replace(/\s+/g, ' ').trim()).join('\n'))));
  await p.locator('#dvDialoog').screenshot({ path: H.UIT + '/dv_dialoog.png' });
  await p.click('#dvSluit'); await p.waitForTimeout(600);
  console.log('station:', await p.textContent('#stationLabel'), '| chip:', await p.textContent('#dvChip'));
  await p.screenshot({ path: H.UIT + '/dv_scherm.png' });
  // PDF
  await p.click('#printKnop'); await p.waitForTimeout(400);
  await p.evaluate(() => { const z = (k, v) => { const e = document.getElementById(k); if (!e) return; if (typeof v === 'boolean') e.checked = v; else e.value = v; e.dispatchEvent(new Event('change')); }; z('pdfLuchtfoto', false); z('pdfFormaat', 'A3'); z('pdfProjectnaam', 'Testset doorvaart brug'); z('pdfBladen', '1-4,15'); });
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 300000 }), p.click('#pdfMaak')]);
  await dl.saveAs(H.UIT + '/dv.pdf'); console.log('PDF:', (await p.textContent('#status')).trim());
  // GPKG + project
  const [g] = await Promise.all([p.waitForEvent('download'), p.click('#gpkgKnop')]); await g.saveAs(H.UIT + '/dv.gpkg');
  console.log('GPKG:', (await p.textContent('#status')).trim().slice(0, 300));
  const [pj] = await Promise.all([p.waitForEvent('download'), p.click('#projectOpslaanKnop')]); await pj.saveAs(H.UIT + '/dv_project.json');
  console.log('project MB:', (fs.statSync(U + '/dv_project.json').size / 1e6).toFixed(1));
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
