// Lijst "Project openen": elke regel leesbaar (naam en datum in de knop, niets buiten de knop, geen tekst die
// wegvalt achter de rand). Vult de recente projecten in IndexedDB met lange en korte namen.
// Gebruik: node project_openen_lijst.test.js
const path = require('path');
const H = require('./hulp');
const { chromium } = H;

(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.addInitScript(require('./zonder_map.js'));
  const fouten = []; p.on('pageerror', e => fouten.push(e.message));
  await p.route(/pdok\.nl|brk-kadastrale-kaart/, r => r.abort());
  await p.goto(H.URL);
  await p.evaluate(() => new Promise((ok, fout) => {
    const r = indexedDB.open('profielviewer', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('recent', { keyPath: 'naam' });
    r.onsuccess = () => {
      const tx = r.result.transaction('recent', 'readwrite'), st = tx.objectStore('recent');
      const nu = Date.now();
      const namen = [['Doorrijhoogte A2 Kunstwerken Vught - Boxtel noordbaan inclusief op- en afritten', 'doorvaart'],
        ['Bospad', 'snoei'], ['Snoeicheck Vlijmenseweg en Pettelaarseschans gevels oostzijde', 'snoei'],
        ['Dijkpalen Maas km 12-18', 'alles'], ['Test', 'alles']];
      namen.forEach(([naam, soort], i) => st.put({ naam, soort, tijd: nu - i * 86400000 * 3, handle: null }));
      tx.oncomplete = () => ok(); tx.onerror = () => fout(tx.error);
    };
    r.onerror = () => fout(r.error);
  }));
  await p.reload();
  await p.evaluate(() => { try { document.getElementById('startDialoog')?.close(); } catch { /* */ } });
  await p.evaluate(() => document.getElementById('projectOpenKnop').click());
  await p.waitForSelector('#projectOpenDialoog[open]'); await p.waitForTimeout(300);
  const m = await p.evaluate(() => [...document.querySelectorAll('#poRecent button')].map(k => {
    const kr = k.getBoundingClientRect();
    return [...k.querySelectorAll('b, span:not(.toolStip)')].map(e => {
      const r = e.getBoundingClientRect();
      return { tekst: e.textContent, binnen: r.left >= kr.left - 0.5 && r.right <= kr.right + 0.5 && r.top >= kr.top - 0.5 && r.bottom <= kr.bottom + 0.5,
        regels: Math.round(r.height / parseFloat(getComputedStyle(e).lineHeight || 16)) || 1, kleur: getComputedStyle(e).color, afgekapt: e.scrollWidth > e.clientWidth + 1 };
    }).concat([{ knopHoogte: Math.round(kr.height) }]);
  }));
  for (const regel of m) console.log(JSON.stringify(regel));
  for (const regel of m) for (const e of regel) {
    if (e.tekst === undefined) continue;
    if (!e.binnen) fouten.push(`"${e.tekst.slice(0, 40)}" valt buiten de knop`);
  }
  // het gekleurde bolletje heeft geen tekst; elke regel heeft een datum
  const stippen = await p.evaluate(() => [...document.querySelectorAll('#poRecent .toolStip')].map(e => e.textContent));
  if (stippen.some(t => t)) fouten.push('tekst in het bolletje: ' + stippen.find(t => t));
  for (const regel of m) if (!regel.some(e => /\d{4}/.test(e.tekst || ''))) fouten.push(`geen datum bij "${regel[0].tekst}"`);
  // de datum staat op één regel
  for (const regel of m) { const d = regel.find(e => e.tekst?.startsWith('·') || /\d{4}/.test(e.tekst || '')); if (d && d.regels > 1) fouten.push(`datum "${d.tekst}" breekt af over ${d.regels} regels`); }
  await p.locator('#projectOpenDialoog').screenshot({ path: path.join(H.UIT, 'project_openen_lijst.png') });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
