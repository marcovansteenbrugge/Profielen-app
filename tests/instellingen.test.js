// Instellingen exporteren en importeren (overstap van het oude Chrome/Edge-venster naar
// het eigen programmavenster): alle ptsviewer-*/pv.*-sleutels gaan mee, pv.bezig niet,
// en een vreemd bestand wordt geweigerd. Twee browsercontexten = twee gescheiden profielen.
const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
const U = H.UIT;
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  const fouten = [];
  const nieuwePagina = async () => {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
    const p = await ctx.newPage();
    await p.addInitScript(require('./zonder_map.js'));
    // geen opslaan-venster: het bestand gaat via de Downloads-route
    await p.addInitScript(() => { delete window.showSaveFilePicker; });
    p.on('pageerror', e => fouten.push(e.message));
    p.on('dialog', d => d.accept());
    await p.route(/pdok\.nl/, r => r.abort());
    await p.goto(H.URL);
    return p;
  };
  const stempel = JSON.stringify({ getekend: 'M. van Steenbrugge', gecontroleerd: 'J. Jansen', opdrachtgever: 'Waterschap Test', projectnr: 'P-2026-017' });
  const mee = {
    'ptsviewer-pdf-v1': stempel,
    'ptsviewer-klantlogo': JSON.stringify({ naam: 'klant.png', data: 'data:image/png;base64,iVBORw0KGgo=' }),
    'ptsviewer-puntdichtheid': '3000000',
    'pv.drieDLagen': JSON.stringify({ bgt: false }),
  };

  // 1. oud profiel: instellingen zetten en exporteren
  const oud = await nieuwePagina();
  await oud.evaluate(([mee]) => {
    for (const [k, v] of Object.entries(mee)) localStorage.setItem(k, v);
    localStorage.setItem('pv.bezig', JSON.stringify({ wat: 'test' }));
    localStorage.setItem('ander-programma', 'niet meenemen');
  }, [mee]);
  const [dl] = await Promise.all([oud.waitForEvent('download'), oud.click('#instellingenExportKnop')]);
  const pad = U + '/instellingen_export.json';
  await dl.saveAs(pad);
  const exp = JSON.parse(fs.readFileSync(pad, 'utf8'));
  console.log('export:', exp.soort, 'versie', exp.versie, 'sleutels', Object.keys(exp.sleutels).sort().join(', '));
  for (const [k, v] of Object.entries(mee)) if (exp.sleutels[k] !== v) fouten.push(`export mist of wijzigt ${k}`);
  if ('pv.bezig' in exp.sleutels) fouten.push('pv.bezig hoort niet in de export');
  if ('ander-programma' in exp.sleutels) fouten.push('vreemde sleutel in de export');
  console.log('status oud:', await oud.textContent('#status'));

  // 2. nieuw (leeg) profiel: eerst een vreemd bestand, dan de export importeren
  const nieuw = await nieuwePagina();
  if (await nieuw.evaluate(() => localStorage.getItem('ptsviewer-pdf-v1'))) fouten.push('nieuw profiel is niet leeg');
  const vreemd = U + '/instellingen_vreemd.json';
  fs.writeFileSync(vreemd, JSON.stringify({ soort: 'iets-anders', sleutels: { 'ptsviewer-pdf-v1': 'x' } }));
  await nieuw.setInputFiles('#instellingenLadenVeld', vreemd);
  await nieuw.waitForTimeout(500);
  const meldVreemd = await nieuw.textContent('#status');
  console.log('vreemd bestand:', meldVreemd);
  if (!/geen instellingenbestand/.test(meldVreemd)) fouten.push('vreemd bestand niet geweigerd');
  if (await nieuw.evaluate(() => localStorage.getItem('ptsviewer-pdf-v1'))) fouten.push('vreemd bestand toch overgenomen');

  await Promise.all([nieuw.waitForEvent('load'), nieuw.setInputFiles('#instellingenLadenVeld', pad)]);
  const na = await nieuw.evaluate((k) => Object.fromEntries(k.map(x => [x, localStorage.getItem(x)])), [...Object.keys(mee), 'pv.bezig']);
  for (const [k, v] of Object.entries(mee)) if (na[k] !== v) fouten.push(`import: ${k} is ${na[k]}`);
  if (na['pv.bezig'] !== null) fouten.push('pv.bezig is meegekomen');
  console.log('na import: PDF-stempel', na['ptsviewer-pdf-v1'] === stempel ? 'gelijk' : 'ANDERS', '· puntdichtheid', na['ptsviewer-puntdichtheid']);

  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
