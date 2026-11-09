// Doorrijhoogte: inlezen van de strook stoppen met de knop Stoppen, met de testwolk van 16 miljoen punten
// (het inlezen duurt dan lang genoeg). Daarna opnieuw inlezen moet gewoon werken.
// Zware test: draait alleen met  node run_alle.js groot  (of los: node doorrij_stoppen.test.js)
const path = require('path');
const H = require('./hulp');
const { chromium } = H;
const WOLK = path.join(__dirname, '..', 'testdata', 'groot', 'dijk_16mln.laz');
const AS = path.join(__dirname, '..', 'testdata', 'groot', 'as_dijk.geojson');

(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  await p.addInitScript(require('./zonder_map.js'));
  p.setDefaultTimeout(600000);
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl|brk-kadastrale-kaart/, r => r.abort());
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'nee'); localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  const wacht = async (re, max = 600) => { for (let i = 0; i < max * 4; i++) { const s = await st(); if (re.test(s) || fouten.length) return s; await p.waitForTimeout(250); } return st(); };
  await p.setInputFiles('#ptsBestand', WOLK); await wacht(/driehoeken/);
  await p.setInputFiles('#asBestand', AS); await p.waitForTimeout(3000);
  await p.click('#doorrijKnop'); await p.waitForSelector('#drDialoog[open]');

  // 1. tijdens het inlezen: knop Stoppen zichtbaar, lopende tijd in het venster, inleesknoppen uit
  await p.click('#drUitA');
  for (let i = 0; i < 40; i++) { if (/0:0[2-9]/.test(await p.textContent('#drNaam'))) break; await p.waitForTimeout(250); }
  const tijdens = { naam: (await p.textContent('#drNaam')).trim(), stop: await p.isVisible('#drStop'), uitA: await p.isDisabled('#drUitA') };
  console.log('1 tijdens het inlezen:', JSON.stringify(tijdens));
  if (!tijdens.stop) fouten.push('1: knop Stoppen niet zichtbaar tijdens het inlezen');
  if (!/inlezen… \d+% · .* · \d+:\d\d/.test(tijdens.naam)) fouten.push('1: geen lopende tijd in het venster');
  if (!tijdens.uitA) fouten.push('1: "Uit puntenwolk A" niet uitgeschakeld tijdens het inlezen');
  await p.screenshot({ path: path.join(H.UIT, 'doorrij_stoppen_tijdens.png') });

  // 2. Stoppen: binnen een paar seconden gestopt, geen foutmelding, knoppen weer aan, niets ingelezen
  const t0 = Date.now();
  await p.click('#drStop');
  const s2 = await wacht(/gestopt/, 30);
  const na = { status: s2, sec: (Date.now() - t0) / 1000, stop: await p.isVisible('#drStop'), uitA: await p.isDisabled('#drUitA'), naam: (await p.textContent('#drNaam')).trim() };
  console.log('2 na Stoppen:', JSON.stringify(na));
  if (!/gestopt na \d+:\d\d/.test(na.status)) fouten.push('2: status meldt niet dat het inlezen gestopt is');
  if (na.sec > 10) fouten.push(`2: stoppen duurde ${na.sec} s`);
  if (na.stop || na.uitA) fouten.push('2: knoppen niet terug na stoppen');
  if (na.naam !== 'niet ingelezen') fouten.push(`2: na stoppen staat er "${na.naam}" (verwacht "niet ingelezen")`);

  // 3. opnieuw inlezen werkt gewoon tot het einde
  await p.click('#drUitA');
  const s3 = await wacht(/ — [0-9.]+ punten in de strook/);
  console.log('3 opnieuw:', s3.slice(0, 120));
  if (!/punten in de strook/.test(s3)) fouten.push('3: opnieuw inlezen na stoppen lukt niet');
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
