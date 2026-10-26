const H = require('./hulp');
const { chromium } = H;
const U = H.data('groot');
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  await p.addInitScript(require('./zonder_map.js'));
  p.setDefaultTimeout(600000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  await p.route(/pdok\.nl/, r => r.abort());
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-oppervlak', 'boven'); localStorage.setItem('ptsviewer-a-maaiveld', '0'); localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async () => { for (let i = 0; i < 600; i++) { if (/driehoeken/.test(await st())) return; await p.waitForTimeout(250); } };
  await p.setInputFiles('#ptsBestand', U + '/dijk_begroeid.las'); await wacht();
  console.log('uit:', await st());
  await p.setInputFiles('#asBestand', U + '/as_begroeid.geojson'); await p.waitForTimeout(800);
  await p.evaluate((v) => { const e = document.getElementById('dwarsBreedte'); e.value = v; e.dispatchEvent(new Event('change')); }, '44'); await p.waitForTimeout(500);
  const prof = async () => p.evaluate(() => window.__pvProfiel ? window.__pvProfiel() : null);
  await p.screenshot({ path: H.UIT + '/mv_uit.png' });
  await p.check('#wolkAMaaiveld'); await p.waitForTimeout(500); await wacht();
  console.log('aan:', await st());
  await p.waitForTimeout(800);
  await p.screenshot({ path: H.UIT + '/mv_aan.png' });
  // alle punten met maaiveld
  await p.click('#volleDichtheidKnop');
  for (let i = 0; i < 600; i++) { if (/Profielen uit alle .* punten ·/.test(await st())) break; await p.waitForTimeout(250); }
  console.log('alle punten:', await st());
  await p.waitForTimeout(800);
  await p.screenshot({ path: H.UIT + '/mv_alle.png' });
  // detailstrook met maaiveld
  await p.click('#detailStrookKnop'); await wacht();
  console.log('detailstrook:', await st());
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
