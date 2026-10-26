const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
const U = H.data('groot'), D = H.data('snoei_test');
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage(); p.setDefaultTimeout(120000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 200)); });
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl/, r => r.abort());
  await p.route(/brk-kadastrale-kaart/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"type":"FeatureCollection","features":[]}' }));
  await p.addInitScript(() => { window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle(window.__volgendeMap || 'proj1', { create: true }); }; });
  await p.goto(H.URL);
  await p.evaluate(async () => { localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); localStorage.setItem('ptsviewer-a-maaiveld', '1'); localStorage.setItem('ptsviewer-opslaan-vragen', 'ja');
    const r = await navigator.storage.getDirectory(); for (const n of ['proj1', 'proj2']) { try { await r.removeEntry(n, { recursive: true }); } catch {} }
    await new Promise(ok => { const q = indexedDB.deleteDatabase('profielviewer'); q.onsuccess = q.onerror = ok; }); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async (re, max = 480) => { for (let i = 0; i < max; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } return await st(); };
  const lijst = (naam) => p.evaluate(async (naam) => {
    const r = await (await navigator.storage.getDirectory()).getDirectoryHandle(naam); const uit = [];
    const loop = async (d, pad) => { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') { if (n === 'tegels') { let k = 0; for await (const _ of h.entries()) k++; uit.push(pad + 'tegels\\ (' + k + ' vakken)'); } else { uit.push(pad + n + '\\'); await loop(h, pad + '  '); } } else uit.push(pad + n + ' (' + Math.round((await h.getFile()).size / 1e3) + ' kB)'); } };
    await loop(r, '  '); return '\n' + uit.sort().join('\n');
  }, naam);
  await p.setInputFiles('#ptsBestand', U + '/dijk_begroeid.las');
  await p.waitForSelector('#projectMapDialoog[open]'); await p.click('#pmKies');
  console.log('1 laden:', (await wacht(/driehoeken/)).slice(0, 160));
  await p.setInputFiles('#asBestand', U + '/as_begroeid.geojson'); await p.waitForTimeout(1500);
  console.log('2 alle punten vanzelf:', (await wacht(/Profielen uit alle/)).slice(0, 140));
  await p.keyboard.press('Control+S'); console.log('3 opslaan:', await wacht(/Opgeslagen|mislukt/));
  await p.waitForTimeout(1100);
  await p.click('#projectOpslaanKnop'); console.log('4 opnieuw:', await wacht(/backup/));
  await p.click('#dxfKnop'); console.log('5 dxf:', (await wacht(/Opgeslagen: .*dxf|mislukt/)).slice(0, 140));
  console.log('proj1:', await lijst('proj1'));
  // herladen en via recent openen
  await p.reload(); await p.waitForTimeout(1000);
  await p.click('#projectOpenKnop'); await p.waitForSelector('#projectOpenDialoog[open]');
  console.log('6 recent:', await p.$$eval('#poRecent button', bs => bs.map(b => b.textContent.trim())));
  await p.click('#poRecent button');
  console.log('7 geopend:', (await wacht(/driehoeken/)).slice(0, 160), '| as:', await p.textContent('#stationLabel'), '| maaiveld', await p.isChecked('#wolkAMaaiveld'));
  console.log('8 alle punten:', (await wacht(/Profielen uit alle/)).slice(0, 100));
  // opslaan als naar proj2
  await p.evaluate(() => { window.__volgendeMap = 'proj2'; });
  await p.click('#projectOpslaanAlsKnop'); await p.waitForSelector('#projectMapDialoog[open]'); await p.click('#pmKies');
  console.log('9 opslaan als:', await wacht(/Opgeslagen: proj2|mislukt/));
  console.log('proj2:', await lijst('proj2'));
  console.log('label:', await p.textContent('#projectBestandNaam'));
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
