// Logo's van de stempel gaan mee in het project (2.11.3): opslaan met klant- en makerlogo, op de pc
// andere logo's kiezen, het project openen → de logo's van het project staan er weer. Een project van
// vóór 2.11.3 (zonder logo's) laat de huidige logo's staan. De stempelvelden gaan al langer mee.
const H = require('./hulp');
const { chromium } = H;
const D = H.data('snoei_test');
(async () => {
  await H.start();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox', '--lang=nl-NL'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 950 }, locale: 'nl-NL' });
  const p = await ctx.newPage();
  await p.addInitScript(require('./zonder_map.js'));
  const fouten = []; p.on('pageerror', e => fouten.push(e.message)); p.on('console', m => { if (m.type() === 'error') fouten.push('console: ' + m.text().slice(0, 300)); });
  p.on('dialog', d => d.accept());
  await p.route(/pdok\.nl/, r => r.abort());
  await p.addInitScript(() => {
    // nep-bestandskiezers met bestanden in het geheugen (sessionStorage overleeft de herlaad van Nieuw)
    const lees = () => JSON.parse(sessionStorage.getItem('__bestanden') || '{}');
    const maak = (naam) => ({
      kind: 'file', name: naam,
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      getFile: async () => new File([lees()[naam] || ''], naam, { type: 'application/json' }),
      createWritable: async () => { const delen = []; return { write: async (x) => delen.push(x), close: async () => { const t = await new Blob(delen).text(); const a = lees(); a[naam] = t; sessionStorage.setItem('__bestanden', JSON.stringify(a)); } }; },
    });
    window.showSaveFilePicker = async (o) => maak(o.suggestedName);
    window.showOpenFilePicker = async () => [maak(sessionStorage.getItem('__openNaam'))];
  });
  // een logo als PNG-dataURL in een kleur
  const logo = (kleur) => p.evaluate((kleur) => { const c = document.createElement('canvas'); c.width = 60; c.height = 20; const g = c.getContext('2d'); g.fillStyle = kleur; g.fillRect(0, 0, 60, 20); return JSON.stringify({ data: c.toDataURL('image/png'), w: 60, h: 20 }); }, kleur);
  const zetLogos = async (klant, maker) => { await p.evaluate(([k, m]) => { localStorage.setItem('ptsviewer-klantlogo', k); localStorage.setItem('ptsviewer-makerlogo', m); }, [klant, maker]); };
  const getoond = () => p.evaluate(() => ({ klant: document.getElementById('pdfKlantLogoVoorbeeld').hidden ? null : document.getElementById('pdfKlantLogoVoorbeeld').src, maker: document.getElementById('pdfMakerLogoVoorbeeld').src, naam: document.getElementById('pdfProjectnaam').value }));
  const st = async () => (await p.textContent('#status')).trim();
  const openen = async (naam) => {
    await p.evaluate((n) => sessionStorage.setItem('__openNaam', n), naam);
    await p.click('#projectOpenKnop'); await p.waitForSelector('#projectOpenDialoog[open]', { timeout: 3000 }).then(() => p.click('#poLos')).catch(() => {});
    for (let i = 0; i < 100; i++) { if (/geopend|driehoeken/.test(await st()) && !(await p.isDisabled('#projectOpslaanKnop'))) break; await p.waitForTimeout(250); }
    await p.waitForTimeout(500);
    // het project heeft geen puntenwolk: het wordt toegepast zodra de scan is ingelezen
    await p.setInputFiles('#ptsBestand', D + '/bospad_scan.pts');
    for (let i = 0; i < 400; i++) { if (/driehoeken/.test(await st())) break; await p.waitForTimeout(250); }
    await p.waitForTimeout(800);
  };

  await p.goto(H.URL);
  const rood = await logo('#c00'), blauw = await logo('#00c'), groen = await logo('#0a0'), geel = await logo('#cc0');
  await zetLogos(rood, blauw);
  await p.evaluate(() => { localStorage.setItem('ptsviewer-opslaan-vragen', 'ja'); localStorage.setItem('ptsviewer-pdf-v1', JSON.stringify({ projectnaam: 'Dijk Den Bosch', opdrachtgever: 'Gemeente', getekend: 'MvS' })); });
  await p.reload();
  await p.setInputFiles('#ptsBestand', D + '/bospad_scan.pts');
  for (let i = 0; i < 400; i++) { if (/driehoeken/.test(await st())) break; await p.waitForTimeout(250); }
  await p.setInputFiles('#asBestand', D + '/as_schouwpad.geojson'); await p.waitForTimeout(600);
  const voor = await getoond();
  await p.uncheck('#projectMetPuntenwolk');   // klein houden: de test gaat over de logo's
  await p.click('#projectOpslaanKnop'); await p.waitForTimeout(1500);
  const json = await p.evaluate(() => JSON.parse(JSON.parse(sessionStorage.getItem('__bestanden'))['bospad_scan-project.json']));
  const inProject = json.instellingen?.logos;
  console.log('1 opgeslagen: logos in project', !!inProject, '| klant rood', inProject?.klant?.data === JSON.parse(rood).data, '| maker blauw', inProject?.maker?.data === JSON.parse(blauw).data, '| projectnaam', json.instellingen?.pdf?.projectnaam);
  if (!inProject || inProject.klant?.data !== JSON.parse(rood).data || inProject.maker?.data !== JSON.parse(blauw).data) fouten.push('logo\'s niet in het project');
  // een "oud" project: hetzelfde, maar zonder logo's (zoals vóór 2.11.3)
  await p.evaluate(() => { const a = JSON.parse(sessionStorage.getItem('__bestanden')); const j = JSON.parse(a['bospad_scan-project.json']); delete j.instellingen.logos; j.instellingen.pdf.projectnaam = 'Oud project'; a['oud.json'] = JSON.stringify(j); sessionStorage.setItem('__bestanden', JSON.stringify(a)); });

  // 2. Nieuw, op de pc andere logo's en een ander stempel; dan het project openen
  await p.click('#projectNieuwKnop'); await p.waitForLoadState('load'); await p.waitForTimeout(1000);
  await zetLogos(groen, geel);
  await p.evaluate(() => localStorage.setItem('ptsviewer-pdf-v1', JSON.stringify({ projectnaam: 'Ander project', getekend: 'XY' })));
  await p.reload(); await p.waitForTimeout(800);
  const tussen = await getoond();
  await openen('bospad_scan-project.json');
  const na = await getoond();
  console.log('2 na openen: klantlogo terug', na.klant === voor.klant, '| makerlogo terug', na.maker === voor.maker, '| projectnaam', na.naam, '| (vóór openen groen/geel:', tussen.klant !== voor.klant && tussen.maker !== voor.maker, ')');
  if (na.klant !== voor.klant || na.maker !== voor.maker) fouten.push('logo\'s van het project niet terug na openen');
  if (na.naam !== 'Dijk Den Bosch') fouten.push('stempel niet terug na openen');

  // 3. een project zonder logo's (van vóór 2.11.3): de huidige logo's blijven staan
  await p.click('#projectNieuwKnop'); await p.waitForLoadState('load'); await p.waitForTimeout(1000);
  await zetLogos(groen, geel); await p.reload(); await p.waitForTimeout(800);
  const huidig = await getoond();
  await openen('oud.json');
  const oud = await getoond();
  console.log('3 oud project: logo\'s blijven', oud.klant === huidig.klant && oud.maker === huidig.maker, '| projectnaam', oud.naam);
  if (oud.klant !== huidig.klant || oud.maker !== huidig.maker) fouten.push('oud project haalde de logo\'s weg');

  await p.screenshot({ path: H.UIT + '/project_logos.png' });
  console.log('fouten:', fouten.join(' | ') || 'geen');
  await b.close();
})();
