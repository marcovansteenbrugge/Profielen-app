const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
const D = H.data('snoei_test'), U = H.UIT;
const as = JSON.parse(fs.readFileSync(D + '/as_schouwpad.geojson')).features[0].geometry.coordinates;
// nep-NWB: de as in 3 wegvakken (verlengd tot buiten de wolk), een zijstraat en een fietspad
const n = as.length, d1 = Math.floor(n / 3), d2 = Math.floor(2 * n / 3);
const voor = [[as[0][0] - 60, as[0][1] - 20], ...as.slice(0, d1 + 1)];
const f = (naam, coords, a, b, extra = {}) => ({ type: 'Feature', properties: { stt_naam: naam, wegnummer: '', wvk_id: a * 100 + b, jte_id_beg: a, jte_id_end: b, wegbehsrt: 'G', wegbehnaam: "'s-Hertogenbosch", gme_naam: "'s-Hertogenbosch", bst_code: '', ...extra }, geometry: { type: 'MultiLineString', coordinates: [coords] } });
const mid = as[d1];
const nep = { type: 'FeatureCollection', features: [
  f('Schouwpad', voor, 1, 2), f('Schouwpad', as.slice(d2).reverse(), 4, 3), f('Schouwpad', as.slice(d1, d2 + 1), 2, 3),
  f('Dorpsweg', [[mid[0] - 20, mid[1] + 60], mid], 10, 2), f('Dorpsweg', [mid, [mid[0] + 15, mid[1] - 60]], 2, 11),
  f('', [[as[5][0], as[5][1] + 6], [as[n - 3][0], as[n - 3][1] + 6]], 20, 21, { bst_code: 'FP' }),
], links: [] };
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } }); p.setDefaultTimeout(60000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message));
  let url = '';
  await p.route(/pdok\.nl/, r => r.abort());
  await p.route(/nationaal-wegenbestand-wegen/, r => { url = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nep) }); });
  await p.addInitScript(require('./zonder_map.js'));
  await p.goto(H.URL);
  const st = async () => (await p.textContent('#status')).trim();
  await p.setInputFiles('#ptsBestand', D + '/bospad_scan.pts');
  for (let i = 0; i < 400; i++) { if (/driehoeken/.test(await st())) break; await p.waitForTimeout(250); }
  await p.click('#nwbKnop'); await p.waitForTimeout(1500);
  console.log('url crs RD:', /crs=http%3A%2F%2Fwww.opengis.net%2Fdef%2Fcrs%2FEPSG%2F0%2F28992/.test(url), '| bbox:', decodeURIComponent(url.match(/bbox=([^&]+)/)[1]));
  console.log('info:', await p.textContent('#nwbInfo'));
  console.log('lijst:', await p.$$eval('#nwbLijst button', bs => bs.map(b => b.textContent.trim())));
  await p.screenshot({ path: H.UIT + '/nwb1.png' });
  // klikken op de zijstraat in het bovenaanzicht
  const scherm = await p.evaluate(([x, y]) => { const c = document.getElementById('canvasVlak').getBoundingClientRect(); return null; }, mid);
  { const [sx, sy] = await p.evaluate(([x, y]) => window.__pvTest.naarScherm(x + 7.5, y - 30), mid); const r = await (await p.$('#canvasVlak')).boundingBox();
    await p.mouse.click(r.x + sx, r.y + sy); await p.waitForTimeout(300); console.log('klik op kaart:', await p.textContent('#nwbInfo')); }
  await p.click('#nwbLijst button:has-text("Schouwpad")');
  console.log('gekozen:', await p.textContent('#nwbInfo'));
  await p.click('#nwbMaak'); await p.waitForTimeout(800);
  console.log('status:', await st());
  console.log('as:', await p.evaluate(() => document.getElementById('asKeuze')?.selectedOptions?.[0]?.textContent), '| label', await p.textContent('#stationLabel'));
  await p.screenshot({ path: H.UIT + '/nwb2.png' });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
