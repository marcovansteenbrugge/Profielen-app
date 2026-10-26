const H = require('./hulp');
const { chromium } = H;
const D = H.data('snoei_test'), U = H.UIT;
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); p.setDefaultTimeout(120000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message));
  await p.route(/pdok\.nl/, r => r.abort());
  await p.addInitScript(() => { window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('zoomproj4', { create: true }); }; });
  await p.goto(H.URL);
  await p.evaluate(async () => { localStorage.setItem('ptsviewer-puntdichtheid', '150000'); const r = await navigator.storage.getDirectory(); try { await r.removeEntry('zoomproj4', { recursive: true }); } catch {} });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  await p.setInputFiles('#ptsBestand', H.data('groot', 'dijk_begroeid.las'));
  await p.waitForSelector('#projectMapDialoog[open]'); await p.click('#pmKies');
  for (let i = 0; i < 2000; i++) { if (/driehoeken/.test(await st())) break; await p.waitForTimeout(250); }
  const box = await (await p.$('#canvasVlak')).boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
  await p.check('#toonVakken'); await p.waitForTimeout(300);
  await p.screenshot({ path: H.UIT + '/z0.png', clip });
  await p.mouse.move(cx, cy);
  for (const [stap, n] of [[1, 2], [2, 3]]) {
    for (let i = 0; i < n; i++) { await p.mouse.wheel(0, -400); await p.waitForTimeout(200); }
    await p.waitForTimeout(stap === 2 ? 150 : 2500);
    console.log('stap', stap, 'vakken', await p.evaluate(() => window.__pvTest.detailVakken()));
    await p.screenshot({ path: U + `/z${stap}.png`, clip });
  }
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
