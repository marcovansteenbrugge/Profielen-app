const fs = require('fs');
const H = require('./hulp');
const { chromium } = H;
const D = H.data('snoei_test'), U = H.UIT;
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox', '--lang=nl-NL'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, locale: 'nl-NL', acceptDownloads: true });
  const p = await ctx.newPage();
  await p.addInitScript(require('./zonder_map.js'));
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  p.on('dialog', d => { console.log('dialoog:', d.message().split('\n')[0]); d.accept(); });
  await p.route(/pdok\.nl/, r => r.abort());
  const nep = () => {
    // nep-bestandskiezers met bestanden in het geheugen
    window.__bestanden = {}; window.__kiezer = [];
    const maak = (naam) => ({
      kind: 'file', name: naam,
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      getFile: async () => new File([window.__bestanden[naam] || ''], naam, { type: 'application/json' }),
      createWritable: async () => { const delen = []; return { write: async (x) => delen.push(x), close: async () => { window.__bestanden[naam] = new Blob(delen); window.__schrijf = (window.__schrijf || []).concat(naam); } }; },
      remove: async () => { delete window.__bestanden[naam]; },
    });
    window.showSaveFilePicker = async (o) => { window.__kiezer.push('opslaan:' + o.suggestedName); const n = window.__volgendeNaam || o.suggestedName; window.__bestanden[n] = window.__bestanden[n] || ''; return maak(n); };
    window.showOpenFilePicker = async () => { window.__kiezer.push('openen'); return [maak(window.__openNaam)]; };
  };
  await p.addInitScript(nep);
  await p.goto(H.URL);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'ja'); localStorage.setItem('ptsviewer-pdf-v1', JSON.stringify({ projectnaam: 'Oud project', projectnummer: 'P-1', getekend: 'MvS', formaat: 'A1' })); });
  await p.reload();
  const st = async () => (await p.textContent('#status')).trim();
  console.log('knoppen:', await p.evaluate(() => ['projectNieuwKnop', 'projectOpenKnop', 'projectOpslaanKnop', 'projectOpslaanAlsKnop'].map(i => `${document.getElementById(i).textContent}${document.getElementById(i).disabled ? '(uit)' : ''}`).join(' | ')));
  await p.setInputFiles('#ptsBestand', D + '/bospad_scan.pts');
  for (let i = 0; i < 400; i++) { if (/driehoeken/.test(await st())) break; await p.waitForTimeout(250); }
  await p.setInputFiles('#asBestand', D + '/as_schouwpad.geojson'); await p.waitForTimeout(600);
  // 1. Opslaan zonder projectbestand → vraagt om bestand
  await p.click('#projectOpslaanKnop'); await p.waitForTimeout(1500);
  console.log('1 opslaan (nieuw):', await st(), '| kiezer', await p.evaluate(() => window.__kiezer.join(',')), '| label', await p.textContent('#projectBestandNaam'));
  // 2. Opslaan nog eens → overschrijft zonder te vragen
  await p.fill('#dwarsInterval', '7'); await p.dispatchEvent('#dwarsInterval', 'change');
  await p.click('#projectOpslaanKnop'); await p.waitForTimeout(1500);
  console.log('2 opslaan:', await st(), '| kiezer', await p.evaluate(() => window.__kiezer.join(',')), '| geschreven', await p.evaluate(() => window.__schrijf.join(',')));
  // 3. Opslaan als → nieuw bestand, daarna is dat het projectbestand
  await p.evaluate(() => { window.__volgendeNaam = 'variant-B.json'; });
  await p.keyboard.press('Control+Shift+S'); await p.waitForTimeout(1500);
  console.log('3 opslaan als:', await st(), '| label', await p.textContent('#projectBestandNaam'));
  await p.keyboard.press('Control+S'); await p.waitForTimeout(1500);
  console.log('3b ctrl+s:', await st(), '| kiezer', await p.evaluate(() => window.__kiezer.join(',')), '| geschreven', await p.evaluate(() => window.__schrijf.join(',')));
  const inhoud = await p.evaluate(async () => (await window.__bestanden['variant-B.json'].text()).length);
  console.log('   variant-B grootte', inhoud);
  // 4. Nieuw → leeg, projectgegevens weg, eigen naam blijft
  await p.click('#projectNieuwKnop'); await p.waitForLoadState('load'); await p.waitForTimeout(1200);
  console.log('4 nieuw:', await st(), '| opslaan uit?', await p.isDisabled('#projectOpslaanKnop'), '| pdf', await p.evaluate(() => localStorage.getItem('ptsviewer-pdf-v1')));
  console.log('   velden:', await p.evaluate(() => ['pdfProjectnaam', 'pdfGetekend', 'pdfFormaat'].map(i => i + '=' + document.getElementById(i).value).join(' ')));
  // 5. Openen (bestandskiezer) → daarna overschrijft Opslaan dat bestand
  const projectTekst = fs.readFileSync(require('path').join(H.UIT, 'paal_project.json'), 'utf8');
  await p.evaluate((t) => { window.__bestanden['bestaand.json'] = new Blob([t]); window.__openNaam = 'bestaand.json'; }, projectTekst);
  await p.click('#projectOpenKnop'); await p.waitForSelector('#projectOpenDialoog[open]', { timeout: 3000 }).then(() => p.click('#poLos')).catch(() => {});
  for (let i = 0; i < 100; i++) { if (!(await p.isDisabled('#projectOpslaanKnop'))) break; await p.waitForTimeout(250); }
  await p.waitForTimeout(800);
  console.log('5 openen:', await st(), '| label', await p.textContent('#projectBestandNaam'), '| projectnaam', await p.inputValue('#pdfProjectnaam'));
  await p.click('#projectOpslaanKnop'); await p.waitForTimeout(2000);
  console.log('5b opslaan:', await st(), '| kiezer', await p.evaluate(() => window.__kiezer.join(',')), '| geschreven', await p.evaluate(() => (window.__schrijf || []).join(',')));
  console.log('   titel:', await p.getAttribute('#projectOpslaanKnop', 'title'));
  await p.screenshot({ path: H.UIT + '/lint.png', clip: { x: 0, y: 0, width: 1600, height: 190 } });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
