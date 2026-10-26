const H = require('./hulp');
const { chromium } = H;
const U = H.data('groot'), BESTAND = process.argv[2] || 'dijk_16mln.las', AS = process.argv[3] || 'as_dijk.geojson';
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 } });
  const p = await ctx.newPage(); p.setDefaultTimeout(1800000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 200)); }); p.on('crash', () => fouten.push('CRASH'));
  await p.route(/pdok\.nl/, r => r.abort());
  await p.addInitScript(() => { window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('testproject', { create: true }); }; });
  await p.goto(H.URL);
  await p.evaluate(async () => { localStorage.setItem('ptsviewer-puntdichtheid', '2000000'); localStorage.setItem('ptsviewer-a-maaiveld', '0'); localStorage.setItem('ptsviewer-oppervlak', 'boven');
    if (!location.search.includes('houd')) { const r = await navigator.storage.getDirectory(); try { await r.removeEntry('testproject', { recursive: true }); } catch {} } });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const heap = () => p.evaluate(() => { window.gc && window.gc(); return Math.round(performance.memory.usedJSHeapSize / 1e6); });
  const wacht = async (re, max = 7200) => { for (let i = 0; i < max; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } };
  for (const ronde of [1, 2]) {
    if (ronde === 2) { await p.reload(); await p.waitForTimeout(800); }
    let t = Date.now();
    await p.setInputFiles('#ptsBestand', U + '/' + BESTAND);
    await p.waitForSelector('#projectMapDialoog[open]', { timeout: 10000 }).then(() => p.click('#pmKies')).catch(() => console.log('(geen dialoog)'));
    await wacht(/driehoeken|mislukt/);
    console.log(`ronde ${ronde}: ${(await st()).slice(0, 170)} | ${(Date.now() - t) / 1000} s | heap ${await heap()} MB`);
  }
  console.log('projectmap:', await p.evaluate(async () => {
    const r = await (await navigator.storage.getDirectory()).getDirectoryHandle('testproject');
    const uit = []; let tot = 0, nT = 0;
    const loop = async (d, pad) => { for await (const [n, h] of d.entries()) { if (h.kind === 'directory') { if (n === 'tegels') { for await (const [, f] of h.entries()) { nT++; tot += (await f.getFile()).size; } uit.push(pad + n + '\\ (' + nT + ' vakken, ' + Math.round(tot / 1e6) + ' MB)'); } else { uit.push(pad + n + '\\'); await loop(h, pad + '  '); } } else uit.push(pad + n + ' (' + Math.round((await h.getFile()).size / 1e3) + ' kB)'); } };
    await loop(r, '  '); return '\n' + uit.join('\n');
  }));
  await p.setInputFiles('#asBestand', U + '/' + AS); await p.waitForTimeout(1500);
  let t = Date.now();
  await p.click('#volleDichtheidKnop');
  const s = await wacht(/Profielen uit alle .* punten ·/);
  console.log('alle punten:', s.slice(0, 200), '|', (Date.now() - t) / 1000, 's');
  t = Date.now();
  await p.click('#detailStrookKnop');
  console.log('detailstrook:', (await wacht(/detailstrook langs de as/)).slice(0, 200), '|', (Date.now() - t) / 1000, 's');
  await p.screenshot({ path: H.UIT + '/scherm.png' });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
