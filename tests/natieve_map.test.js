// Eigen bestandstoegang (2.10.2): de projectmap via /__pv/ (zoals in het eigen venster van de exe),
// zonder browserkiezer en zonder toestemmingsvragen. De testserver (hulp.js) maakt de API van de exe na.
// Vergelijkt ook de snelheid van het omzetten naar vakken met de browsermap (OPFS).
const fs = require('fs'), path = require('path');
const H = require('./hulp');
const { chromium } = H;
const U = H.data('groot');
const MAP = path.join(H.UIT, 'natief');
(async () => {
  await H.start();
  fs.rmSync(MAP, { recursive: true, force: true });
  fs.mkdirSync(path.join(MAP, 'proj1'), { recursive: true });
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const fouten = [];
  const nieuwePagina = async (metNatief) => {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
    const p = await ctx.newPage(); p.setDefaultTimeout(120000);
    p.on('pageerror', e => { fouten.push(e.message); console.log('!! pagina:', e.message); }); p.on('console', m => { if (m.type() === 'error') { fouten.push('console: ' + m.text().slice(0, 200)); console.log('!! console:', m.text().slice(0, 300)); } });
    p.on('dialog', d => d.accept());
    await p.route(/pdok\.nl/, r => r.abort());
    await p.route(/brk-kadastrale-kaart/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"type":"FeatureCollection","features":[]}' }));
    if (metNatief) await p.addInitScript((sleutel) => {
      window.__pvNatief = Object.freeze({ sleutel, versie: 'test' });
      // de browserroute mag in het eigen venster niet meer gebruikt worden
      window.__browserKiezer = 0; window.__toestemming = 0;
      window.showDirectoryPicker = async () => { window.__browserKiezer++; throw new DOMException('browserkiezer gebruikt', 'AbortError'); };
      if (window.FileSystemHandle) {
        const rp = FileSystemHandle.prototype.requestPermission, qp = FileSystemHandle.prototype.queryPermission;
        FileSystemHandle.prototype.requestPermission = function (...a) { window.__toestemming++; return rp?.apply(this, a); };
        FileSystemHandle.prototype.queryPermission = function (...a) { window.__toestemming++; return qp?.apply(this, a); };
      }
    }, H.natief.sleutel);
    else await p.addInitScript(() => { window.showDirectoryPicker = async () => { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle('vergelijk', { create: true }); }; });
    await p.goto(H.URL);
    await p.evaluate(async () => { localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); localStorage.setItem('ptsviewer-a-maaiveld', '1'); localStorage.setItem('ptsviewer-opslaan-vragen', 'ja');
      try { await (await navigator.storage.getDirectory()).removeEntry('vergelijk', { recursive: true }); } catch {}
      await new Promise(ok => { const q = indexedDB.deleteDatabase('profielviewer'); q.onsuccess = q.onerror = ok; }); });
    await p.reload();
    return p;
  };
  const st = async (pg) => (await pg.textContent('#status')).trim();
  const wachter = (p) => async (re, max = 960) => { for (let i = 0; i < max; i++) { const s = (await p.textContent('#status')).trim(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } return (await p.textContent('#status')).trim(); };
  const lijst = (d, pad = '  ') => fs.readdirSync(d, { withFileTypes: true }).sort((a, c) => a.name.localeCompare(c.name)).flatMap(e => e.isDirectory()
    ? (e.name === 'tegels' ? [`${pad}tegels\\ (${fs.readdirSync(path.join(d, e.name)).length} vakken)`] : [`${pad}${e.name}\\`, ...lijst(path.join(d, e.name), pad + '  ')])
    : [`${pad}${e.name} (${Math.round(fs.statSync(path.join(d, e.name)).size / 1e3)} kB)`]);
  const tijdelijk = (d) => fs.readdirSync(d, { withFileTypes: true, recursive: true }).filter(e => e.name.endsWith('.pvtmp')).length;

  // 1. via de eigen bestandstoegang
  const p = await nieuwePagina(true), wacht = wachter(p);
  console.log('0 natief in de pagina:', await p.evaluate(() => !!window.__pvNatief));
  H.natief.kiesRij.push(path.join(MAP, 'proj1'));
  let t0 = Date.now();
  await p.setInputFiles('#ptsBestand', U + '/dijk_begroeid.las');
  await p.waitForSelector('#projectMapDialoog[open]'); await p.click('#pmKies');
  console.log('1 laden:', (await wacht(/driehoeken/)).slice(0, 160));
  const tNatief = (Date.now() - t0) / 1000;
  await p.setInputFiles('#asBestand', U + '/as_begroeid.geojson'); await p.waitForTimeout(1500);
  console.log('2 alle punten uit de vakken:', (await wacht(/Profielen uit alle/)).slice(0, 140));
  // eerst "alle punten" laten afmaken, anders overschrijft die melding "Opgeslagen"
  await wacht(/Profielen uit alle [\d.]+ punten/);
  await p.keyboard.press('Control+S'); console.log('3 opslaan:', await wacht(/Opgeslagen|mislukt/));
  await p.waitForTimeout(1100);
  await p.click('#projectOpslaanKnop'); console.log('4 opnieuw (backup):', await wacht(/backup|mislukt/));
  await p.click('#dxfKnop'); console.log('5 dxf naar uitvoer:', (await wacht(/Opgeslagen: .*dxf|mislukt/)).slice(0, 140));
  console.log('proj1 op schijf:\n' + lijst(path.join(MAP, 'proj1')).join('\n'));
  // 2. herladen en de map opnieuw openen (via de kiezer van de exe)
  await p.reload(); await p.waitForTimeout(1000);
  H.natief.kiesRij.push(path.join(MAP, 'proj1'));
  await p.click('#projectOpenKnop'); await p.waitForSelector('#projectOpenDialoog[open]');
  await p.click('#poMap');
  console.log('6 opnieuw geopend:', (await wacht(/driehoeken/)).slice(0, 160), '| as:', await p.textContent('#stationLabel'), '| maaiveld', await p.isChecked('#wolkAMaaiveld'));
  console.log('7 alle punten uit de vakken:', (await wacht(/Profielen uit alle/)).slice(0, 100));
  console.log('label:', await p.textContent('#projectBestandNaam'));
  // 2b. recente projecten (bijgehouden door de exe): na herladen met één klik, zonder kiezer
  // eerst wachten tot "alle punten" klaar is: herladen tijdens het lezen breekt verzoeken af
  await wacht(/Profielen uit alle [\d.]+ punten/);
  await p.reload(); await p.waitForTimeout(1000);
  await p.click('#projectOpenKnop'); await p.waitForSelector('#projectOpenDialoog[open]');
  const recent = await p.$$eval('#poRecent button', bs => bs.map(b => b.textContent.trim() + ' [' + b.title + ']'));
  console.log('6b recent:', recent);
  if (!recent.length || !/proj1/.test(recent[0])) fouten.push('proj1 staat niet in de recente projecten');
  await p.click('#poRecent button');
  console.log('6c via recent geopend:', (await wacht(/driehoeken/)).slice(0, 80), '| label:', await p.textContent('#projectBestandNaam'));
  if (!/976\.185/.test(await st(p))) fouten.push('via recent niet geopend');
  await wacht(/Profielen uit alle [\d.]+ punten/);
  // 2c. los projectbestand kiezen (.pvproj): opent de projectmap eromheen
  await p.reload(); await p.waitForTimeout(1000);
  H.natief.kiesRij.push(path.join(MAP, 'proj1', 'proj1.pvproj'));
  await p.click('#projectOpenKnop'); await p.waitForSelector('#projectOpenDialoog[open]');
  await p.click('#poLos');
  console.log('6d .pvproj gekozen:', (await wacht(/driehoeken/)).slice(0, 80), '| label:', await p.textContent('#projectBestandNaam'));
  if (!/976\.185/.test(await st(p))) fouten.push('gekozen .pvproj niet geopend');
  await wacht(/Profielen uit alle [\d.]+ punten/);
  // 2d. slepen: een puntenwolk opent als A (in de projectmap omgezet naar vakken)
  const sleep = (url, naam) => p.evaluate(async ({ url, naam }) => {
    const b = await (await fetch(url)).blob(), dt = new DataTransfer();
    dt.items.add(new File([b], naam));
    const doel = document.querySelector('#bovenaanzicht, canvas') || document.body;
    doel.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    doel.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { url, naam });
  await sleep('/testdata/doorvaart_test/bodem_multibeam.pts', 'bodem_multibeam.pts');
  console.log('6e puntenwolk gesleept:', (await wacht(/bodem_multibeam.*(driehoeken|punten)|driehoeken/)).slice(0, 100));
  await p.waitForTimeout(1500);
  if (!fs.existsSync(path.join(MAP, 'proj1', 'puntenwolk', 'A - bodem_multibeam', 'info.json'))) fouten.push('gesleepte puntenwolk niet omgezet in de projectmap');
  // 2e. slepen van een .pvproj: gevonden in de recente projecten, dus de hele projectmap
  await p.evaluate(() => { document.getElementById('status').textContent = ''; });
  await sleep('/tests/uit/natief/proj1/proj1.pvproj', 'proj1.pvproj');
  await wacht(/Profielen uit alle [\d.]+ punten|driehoeken/);
  console.log('6f .pvproj gesleept:', (await wacht(/driehoeken|los geopend/)).slice(0, 100), '| label:', await p.textContent('#projectBestandNaam'));
  if (!/976\.185/.test(await st(p))) fouten.push('gesleept .pvproj opende niet het project met de vakken');

  // 3. geannuleerde kiezer: niets gebeurt
  await p.click('#projectOpenKnop'); await p.waitForSelector('#projectOpenDialoog[open]');
  await p.click('#poMap'); await p.waitForTimeout(500);
  console.log('8 annuleren: dialoog nog open', await p.isVisible('#projectOpenDialoog[open]'), '| melding:', JSON.stringify(await p.textContent('#poInfo')));
  await p.click('#poAnnuleer');
  const teller = await p.evaluate(() => ({ browserKiezer: window.__browserKiezer, toestemming: window.__toestemming }));
  console.log('browserkiezer gebruikt:', teller.browserKiezer, '| toestemmingsvragen van de browser:', teller.toestemming, '| verzoeken naar /__pv/:', H.natief.verzoeken, '| tijdelijke bestanden over:', tijdelijk(MAP));
  if (teller.browserKiezer || teller.toestemming) fouten.push(`browserroute gebruikt: ${JSON.stringify(teller)}`);
  if (!H.natief.verzoeken) fouten.push('geen verzoeken naar /__pv/ (draait er een andere server op de poort?)');
  if (tijdelijk(MAP)) fouten.push('tijdelijke bestanden blijven staan');
  const pv = path.join(MAP, 'proj1');
  for (const moet of ['proj1.pvproj', 'backup', 'uitvoer', 'ondergrond']) if (!fs.existsSync(path.join(pv, moet))) fouten.push(`ontbreekt: ${moet}`);
  const wolk = fs.readdirSync(path.join(pv, 'puntenwolk'))[0];
  const vakken = wolk ? fs.readdirSync(path.join(pv, 'puntenwolk', wolk, 'tegels')).length : 0;
  if (!vakken) fouten.push('geen vakken geschreven');
  if (!fs.readdirSync(path.join(pv, 'uitvoer')).some(n => n.endsWith('.dxf'))) fouten.push('geen dxf in uitvoer');

  // 4. vergelijking: hetzelfde omzetten via de browsermap (OPFS)
  const q = await nieuwePagina(false), wachtQ = wachter(q);
  t0 = Date.now();
  await q.setInputFiles('#ptsBestand', U + '/dijk_begroeid.las');
  await q.waitForSelector('#projectMapDialoog[open]'); await q.click('#pmKies');
  console.log('9 vergelijking (browsermap):', (await wachtQ(/driehoeken/)).slice(0, 100));
  const tBrowser = (Date.now() - t0) / 1000;
  const factor = tNatief / tBrowser;
  console.log(`snelheid omzetten: eigen toegang ${tNatief.toFixed(1)} s, browsermap ${tBrowser.toFixed(1)} s, factor ${factor.toFixed(2)} (grens 1,5)`);
  if (factor > 1.5) fouten.push(`omzetten via de eigen toegang ${factor.toFixed(2)}× zo traag als via de browsermap`);
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
