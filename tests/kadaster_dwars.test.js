// Kadaster in het dwarsprofiel aan en uit (2.11.1): de perceelgrenzen verdwijnen uit het
// dwarsprofiel en uit de DXF als het vinkje "kadaster" uit staat, en de keuze wordt onthouden.
const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox', '--lang=nl-NL'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, locale: 'nl-NL', acceptDownloads: true });
  const p = await ctx.newPage();
  await p.addInitScript(require('./zonder_map.js'));
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 200)); });
  await p.route(/pdok\.nl/, r => r.abort());
  await p.route(/brk-kadastrale-kaart/, r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(H.data('snoei_test', 'kadaster_percelen.geojson')) }));
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-oppervlak', 'onder'); localStorage.removeItem('ptsviewer-kadaster-in-profiel'); });
  await p.reload();
  const wacht = async (re, n = 400) => { for (let i = 0; i < n; i++) { if (re.test(await p.textContent('#status'))) return; await p.waitForTimeout(250); } };
  const D = H.data('snoei_test');
  const laad = async () => {
    await p.setInputFiles('#ptsBestand', D + '/bospad_scan.pts'); await wacht(/driehoeken/);
    await p.setInputFiles('#asBestand', D + '/as_schouwpad.geojson'); await p.waitForTimeout(800);
    await p.click('#kadasterOphalenKnop'); await wacht(/percelen opgehaald/, 40); await p.waitForTimeout(500);
  };
  // perceelgrenzen in het dwarsprofiel: de paarse streeplijnen
  const grenzen = () => p.$$eval('#svgDwars line[stroke="#7A3E9D"]', ls => ls.length);
  const dxfKadaster = async () => {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.click('#dxfKnop')]);
    const tekst = fs.readFileSync(await dl.path(), 'utf8');
    return (tekst.match(/\nPV_PROF_KADASTER\r?\n/g) || []).length;
  };
  await laad();
  const aan = await grenzen(), dxfAan = await dxfKadaster();
  console.log('1 aan: vinkje', await p.isChecked('#kadasterInProfiel'), '| grenzen in dwarsprofiel', aan, '| DXF-elementen op PV_PROF_KADASTER', dxfAan);
  if (!aan) fouten.push('geen kadastergrenzen in het dwarsprofiel terwijl het vinkje aan staat');
  if (!dxfAan) fouten.push('geen kadaster in de DXF terwijl het vinkje aan staat');
  await p.uncheck('#kadasterInProfiel'); await p.waitForTimeout(300);
  const uit = await grenzen(), dxfUit = await dxfKadaster();
  console.log('2 uit: grenzen in dwarsprofiel', uit, '| DXF-elementen op PV_PROF_KADASTER', dxfUit, '| BGT-keuze blijft', await p.inputValue('#bgtInProfiel'));
  if (uit) fouten.push('kadastergrenzen blijven staan terwijl het vinkje uit staat');
  if (dxfUit) fouten.push('kadaster in de DXF terwijl het vinkje uit staat');
  // onthouden na herladen
  await p.reload(); await p.waitForTimeout(800);
  console.log('3 na herladen: vinkje', await p.isChecked('#kadasterInProfiel'));
  if (await p.isChecked('#kadasterInProfiel')) fouten.push('keuze niet onthouden');
  await laad();
  console.log('4 na herladen geladen: grenzen in dwarsprofiel', await grenzen());
  if (await grenzen()) fouten.push('na herladen toch kadastergrenzen');
  await p.check('#kadasterInProfiel'); await p.waitForTimeout(300);
  console.log('5 weer aan: grenzen in dwarsprofiel', await grenzen());
  if (!(await grenzen())) fouten.push('na weer aanzetten geen kadastergrenzen');
  await p.evaluate(() => localStorage.removeItem('ptsviewer-kadaster-in-profiel'));
  await p.locator('#dwarsPaneel').screenshot({ path: H.UIT + '/kadaster_dwars.png' });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
