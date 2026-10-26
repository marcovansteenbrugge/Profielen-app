const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
const D = H.data('snoei_test'), U = H.UIT;
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); p.setDefaultTimeout(120000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl/, r => r.abort());
  await p.route(/brk-kadastrale-kaart/, r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(D + '/kadaster_percelen.geojson') }));
  await p.addInitScript(() => { window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('bospadproj', { create: true }); }; });
  await p.goto(H.URL);
  await p.evaluate(async () => { localStorage.setItem('ptsviewer-puntdichtheid', '300000'); localStorage.setItem('ptsviewer-a-maaiveld', '0'); localStorage.setItem('ptsviewer-oppervlak', 'onder');
    const r = await navigator.storage.getDirectory(); try { await r.removeEntry('bospadproj', { recursive: true }); } catch {}
    await new Promise(ok => { const q = indexedDB.deleteDatabase('profielviewer'); q.onsuccess = q.onerror = ok; }); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async (re, max = 480) => { for (let i = 0; i < max; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } return await st(); };
  await p.setInputFiles('#ptsBestand', D + '/bospad_scan.pts');
  await p.waitForSelector('#projectMapDialoog[open]'); await p.click('#pmKies');
  console.log('1:', (await wacht(/driehoeken/)).slice(0, 150));
  await p.setInputFiles('#asBestand', D + '/as_schouwpad.geojson'); await p.waitForTimeout(800);
  await p.evaluate((v) => { const e = document.getElementById('dwarsBreedte'); e.value = v; e.dispatchEvent(new Event('change')); }, '16');
  console.log('2:', (await wacht(/Profielen uit alle .* punten ·/)).slice(0, 130));
  await p.click('#kadasterOphalenKnop'); await p.waitForTimeout(2500);
  await p.click('#snoeiKnop'); await p.waitForTimeout(300); await p.click('#snUitA');
  console.log('3 begroeiing:', (await wacht(/Begroeiing: .* punten in de strook(?!.*%)/)).slice(0, 150));
  await p.click('#snControleer'); await p.waitForTimeout(800);
  const snoei1 = await p.evaluate(() => document.querySelectorAll('#snLijst tbody tr').length);
  await p.click('#snSluit'); await p.waitForTimeout(300);
  // inzoomen: volle vakken in het bovenaanzicht
  await p.mouse.move(400, 560); for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -400); await p.waitForTimeout(200); }
  await p.waitForTimeout(2500);
  console.log('4 detailvakken geladen:', await p.evaluate(() => window.__pvTest.detailVakken()));
  await p.screenshot({ path: H.UIT + '/zoom_detail.png', clip: { x: 0, y: 300, width: 790, height: 640 } });
  await p.keyboard.press('Control+S'); await p.waitForTimeout(3000);
  console.log('5 opslaan:', await st());
  console.log('ondergrond:', await p.evaluate(async () => { const r = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('bospadproj')).getDirectoryHandle('ondergrond'); const u = []; for await (const [n, h] of r.entries()) u.push(n + ' ' + Math.round((await h.getFile()).size / 1e3) + ' kB'); return u.join(', '); }));
  await p.reload(); await p.waitForTimeout(800);
  await p.click('#projectOpenKnop'); await p.waitForSelector('#projectOpenDialoog[open]'); await p.click('#poRecent button');
  console.log('6 geopend:', (await wacht(/driehoeken/)).slice(0, 120));
  await p.waitForTimeout(1500);
  console.log('7 percelen', await p.evaluate(() => window.__pvTest.percelen()), '| snoeirijen voor/na', snoei1, await p.evaluate(() => document.querySelectorAll('#snLijst tbody tr').length), '| oppervlak', await p.inputValue('#oppervlakModus'));
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
