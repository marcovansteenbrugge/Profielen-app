// Testset testdata/gevel_test (straat met voorgevels aan twee kanten, zonder classificatie): ruwe lijn → "As op
// de voorgevels" (twee assen, noord en zuid) → snoeicheck per as met 2 m vrije ruimte. De snoeipunten moeten
// precies de bomen zijn die in verwacht.csv op "ja" staan. Gebruik: node gevel_dataset.test.js
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const MAP = path.join(__dirname, '..', 'testdata', 'gevel_test');

(async () => {
  await H.start();
  const bomen = fs.readFileSync(path.join(MAP, 'verwacht.csv'), 'utf8').trim().split('\n').slice(1).map(r => r.split(';'))
    .map(([naam, kant, x, y, , , ernst]) => ({ naam, kant, x: +x, y: +y, ernst: ernst.trim(), snoei: ernst.trim() !== 'nee' }));
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  await p.addInitScript(require('./zonder_map.js'));
  p.setDefaultTimeout(300000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl|brk-kadastrale-kaart/, r => r.abort());
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async (re, max = 240) => { for (let i = 0; i < max * 4; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } return st(); };
  await p.setInputFiles('#ptsBestand', path.join(MAP, 'straat_gevels.pts')); await wacht(/driehoeken/);
  await p.setInputFiles('#asBestand', path.join(MAP, 'ruwe_lijn.geojson')); await p.waitForTimeout(1200);
  await p.setInputFiles('#bgtBestand', path.join(MAP, 'bgt_panden.geojson')); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__pvTest.zetWerksoort('snoei')); await p.waitForTimeout(300);
  await p.click('#snoeiKnop'); await p.waitForSelector('#snDialoog[open]');
  await p.selectOption('#snModus', 'gevel'); await p.waitForTimeout(200);
  await p.click('#snGevelAs'); await p.waitForTimeout(600);
  console.log('as op de voorgevels:', await st());
  const assen = await p.evaluate(() => [...document.getElementById('asKeuze').options].map((o, i) => ({ i, naam: o.textContent })));
  const gevelAssen = assen.filter(a => /Voorgevels/.test(a.naam));
  if (gevelAssen.length !== 2) fouten.push(`${gevelAssen.length} gevelassen (verwacht 2: noord en zuid)`);
  const gevonden = new Set(), ernstVan = {};
  for (const a of gevelAssen) {
    await p.evaluate((i) => { const s = document.getElementById('asKeuze'); s.value = String(i); s.dispatchEvent(new Event('change')); }, a.i);
    await p.waitForTimeout(500);
    if (!(await p.$('#snDialoog[open]'))) { await p.click('#snoeiKnop'); await p.waitForSelector('#snDialoog[open]'); }
    await p.selectOption('#snModus', 'gevel'); await p.waitForTimeout(200);
    await p.click('#snUitA'); await wacht(/Begroeiing: .* punten in de strook/);
    await p.fill('#snGevelAfstand', '2'); await p.dispatchEvent('#snGevelAfstand', 'input');
    await p.fill('#snHoogte', '7'); await p.dispatchEvent('#snHoogte', 'input');
    await p.click('#snControleer'); await p.waitForTimeout(900);
    const asG = await p.evaluate(() => window.__pvTest.asNu());
    const sp = await p.evaluate(() => window.__pvTest.snoeiPunten()) || [];
    const bij = sp.map(q => { const bt = bomen.reduce((m, t) => (Math.hypot(t.x - q.x, t.y - q.y) < Math.hypot(m.x - q.x, m.y - q.y) ? t : m)); return { boom: bt.naam, afst: +Math.hypot(bt.x - q.x, bt.y - q.y).toFixed(1), ernst: q.ernst }; });
    if (process.env.DETAIL) console.log(JSON.stringify({ vakken: asG.gevel?.vakken, as: asG.punten.map(q => [+(q.x - 150820).toFixed(2), +(q.y - 411760).toFixed(2)]), sp: sp.map(q => ({ x: +(q.x - 150820).toFixed(2), y: +(q.y - 411760).toFixed(2), s0: +q.s0.toFixed(2), s1: +q.s1.toFixed(2), o: q.oDicht, ernst: q.ernst })) }));
    console.log(`${a.naam}: ${asG.gevel?.vakken?.length} gevels, straatkant ${asG.gevel?.kant} | snoeipunten:`, JSON.stringify(bij));
    for (const q of bij) { if (q.afst > 3) fouten.push(`${a.naam}: snoeipunt ver van een boom (${q.afst} m van ${q.boom})`); else { gevonden.add(q.boom); if (ernstVan[q.boom] !== 'rood') ernstVan[q.boom] = q.ernst; } }
    await p.click('#snSluit'); await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(H.UIT, `gevel_dataset_${gevelAssen.indexOf(a) + 1}.png`) });
  }
  for (const t of bomen) {
    if (t.snoei && !gevonden.has(t.naam)) fouten.push(`${t.naam} (${t.kant}) had een snoeipunt moeten zijn`);
    if (!t.snoei && gevonden.has(t.naam)) fouten.push(`${t.naam} (${t.kant}) is ten onrechte een snoeipunt`);
    if (t.snoei && gevonden.has(t.naam) && ernstVan[t.naam] !== t.ernst) fouten.push(`${t.naam}: ${ernstVan[t.naam]} (verwacht ${t.ernst})`);
  }
  console.log('snoeipunten bij:', [...gevonden].sort().join(', '), '| verwacht:', bomen.filter(t => t.snoei).map(t => `${t.naam} ${t.ernst}`).join(', '));
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
