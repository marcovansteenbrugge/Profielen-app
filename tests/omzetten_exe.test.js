// Omzetten in de exe (2.11, plan omzetten-in-exe, besluit B2): de exe-code (bron-exe/omzet, via
// pvomzet) maakt byte voor byte dezelfde vakken, overzichten en info.json als de viewer.
// De viewer zet om via de eigen bestandstoegang (zoals in het eigen venster), in modus boven en onder.
// Gebruik: node omzetten_exe.test.js [scan ...]   (standaard dijk_begroeid.las, twee PTS uit testdata en drie lastige PTS)
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const H = require('./hulp');
const { chromium } = H;
const UIT = path.join(H.UIT, 'omzetten');
/** PTS-bestanden met lastige gevallen, gemaakt uit bospad_scan.pts (zelfde regels als de viewer moeten gelden). */
function maakLastigePts() {
  const regels = fs.readFileSync(H.data('snoei_test', 'bospad_scan.pts'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean);
  const pt = (i) => regels[i].split(' ');   // x y z i r g b
  const uit = [], schrijf = (naam, tekst) => { const f = path.join(UIT, naam); fs.writeFileSync(f, tekst); uit.push(f); };
  // zonder kleur, zonder aantal-regel, komma's, BOM, gemengde regeleinden, lege en ongeldige regels
  let t = '\ufeff';
  for (let i = 0; i < regels.length; i += 3) {
    const [x, y, z] = pt(i);
    t += (i % 7 === 0 ? `${x},${y},${z}` : i % 5 === 0 ? `  ${x}\t${y}  ${z}  ` : `${x} ${y} ${z}`) + (i % 11 === 0 ? '\r' : i % 13 === 0 ? '\r\n\r\n' : '\n');
    if (i === 300) t += 'dit is geen punt\n';
    if (i === 600) t += 'NaN 1 2\n';
  }
  schrijf('zonder_kleur.pts', t);
  // 10 kolommen (x y z i r g b nx ny nz) met tabs
  t = `${Math.floor(regels.length / 2)}\n`;
  for (let i = 0; i < regels.length; i += 2) { const [x, y, z, n, r, g, b] = pt(i); t += [x, y, z, n, r, g, b, '0.1', '0.2', '0.97'].join('\t') + '\n'; }
  schrijf('tien_kolommen.pts', t);
  // 6 kolommen (x y z r g b) met rare kleuren later in het bestand, en een aantal dat eerder stopt
  t = `${Math.floor(regels.length / 4) - 500}\r\n`;
  for (let i = 0; i < regels.length; i += 4) {
    const [x, y, z, , r, g, b] = pt(i);
    const k = i / 4;
    const kleur = k < 10 ? [r, g, b] : k % 97 === 0 ? ['300', '-5', '12.7'] : k % 89 === 0 ? [r, g] : k % 83 === 0 ? ['0x1f', '1e2', ''] : [r, g, b];
    t += [x, y, z, ...kleur].join(' ') + '\r\n';
  }
  schrijf('zes_kolommen.pts', t);
  return uit;
}
fs.mkdirSync(UIT, { recursive: true });
const scans = process.argv.slice(2).length ? process.argv.slice(2).map(s => path.resolve(s))
  : [H.data('groot', 'dijk_begroeid.las'), H.data('snoei_test', 'bospad_scan.pts'), H.data('doorvaart_test', 'bodem_multibeam.pts'), ...maakLastigePts()];

/** pvomzet bouwen (Go, zonder cgo). */
function bouwPvomzet() {
  const exe = path.join(UIT, 'pvomzet.exe');
  const go = [process.env.GO, 'go', 'C:\\Program Files\\Go\\bin\\go.exe'].filter(Boolean)
    .find(g => spawnSync(g, ['version'], { encoding: 'utf8' }).status === 0);
  if (!go) throw new Error('Go niet gevonden (zet GO op het pad van go.exe)');
  const r = spawnSync(go, ['build', '-o', exe, './cmd/pvomzet'], { cwd: path.join(H.ROOT, 'bron-exe'), encoding: 'utf8', env: { ...process.env, CGO_ENABLED: '0' } });
  if (r.status !== 0) throw new Error('pvomzet bouwen mislukt: ' + r.stderr);
  return exe;
}
/** Eerste verschil tussen twee vakbestanden, als tekst. */
function verschil(a, b) {
  if (a.length !== b.length) return `lengte ${a.length} tegen ${b.length} bytes`;
  for (let o = 0; o < a.length; o += 16) {
    if (a.compare(b, o, o + 16, o, o + 16) !== 0) {
      const rec = (x) => `x ${x.readInt32LE(o)} y ${x.readInt32LE(o + 4)} z ${x.readInt32LE(o + 8)} k ${x[o + 12]} rgb ${x[o + 13]},${x[o + 14]},${x[o + 15]}`;
      return `punt ${o / 16}: viewer ${rec(a)} | exe ${rec(b)}`;
    }
  }
  return null;
}

(async () => {
  await H.start();
  for (const n of fs.readdirSync(UIT)) if (/^(viewer|exe)_/.test(n)) fs.rmSync(path.join(UIT, n), { recursive: true, force: true });
  const fouten = [];
  const pvomzet = bouwPvomzet();
  const b = await chromium.launch({ ...H.browserOpties(), args: ['--no-sandbox'] });
  for (const scan of scans) {
    for (const modus of ['boven', 'onder']) {
      const label = `${path.basename(scan)} (${modus})`;
      const proj = path.join(UIT, `viewer_${modus}_${path.basename(scan).replace(/\W+/g, '_')}`), exeMap = path.join(UIT, `exe_${modus}_${path.basename(scan).replace(/\W+/g, '_')}`);
      fs.mkdirSync(proj, { recursive: true });
      // 1. via de viewer
      const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
      const p = await ctx.newPage(); p.setDefaultTimeout(600000);
      p.on('pageerror', e => fouten.push(`${label}: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') fouten.push(`${label}: console: ${m.text().slice(0, 200)}`); });
      p.on('dialog', d => d.accept());
      await p.route(/pdok\.nl|brk-kadastrale-kaart/, r => r.abort());
      await p.addInitScript((sleutel) => { window.__pvNatief = Object.freeze({ sleutel, versie: 'test' }); }, H.natief.sleutel);
      await p.goto(H.URL);
      await p.evaluate((modus) => { localStorage.setItem('ptsviewer-oppervlak', modus); localStorage.setItem('ptsviewer-puntdichtheid', '1000000'); }, modus);
      await p.reload();
      H.natief.kiesRij.push(proj);
      let t0 = Date.now();
      await p.setInputFiles('#ptsBestand', scan);
      await p.waitForSelector('#projectMapDialoog[open]'); await p.click('#pmKies');
      for (let i = 0; i < 4800; i++) { const s = await p.textContent('#status'); if (/driehoeken|mislukt/.test(s) || fouten.length) break; await p.waitForTimeout(250); }
      const tViewer = (Date.now() - t0) / 1000;
      console.log(`${label} viewer: ${(await p.textContent('#status')).trim().slice(0, 90)} | ${tViewer.toFixed(1)} s (tot en met laden)`);
      await ctx.close();
      const wolkViewer = path.join(proj, 'puntenwolk', fs.readdirSync(path.join(proj, 'puntenwolk'))[0]);
      // 2. via de exe-code
      t0 = Date.now();
      const r = spawnSync(pvomzet, ['-bron', scan, '-doel', exeMap, '-modus', modus], { encoding: 'utf8' });
      if (r.status !== 0) { fouten.push(`${label}: pvomzet: ${r.stderr.trim()}`); continue; }
      console.log(`${label} exe: ${r.stdout.trim()} | ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      // 3. vergelijken
      const vakkenV = fs.readdirSync(path.join(wolkViewer, 'tegels')).sort(), vakkenE = fs.readdirSync(path.join(exeMap, 'tegels')).sort();
      if (vakkenV.join() !== vakkenE.join()) fouten.push(`${label}: andere vakken: viewer ${vakkenV.length}, exe ${vakkenE.length}`);
      let gelijk = 0, bytes = 0;
      for (const n of vakkenV.filter(n => vakkenE.includes(n))) {
        const a = fs.readFileSync(path.join(wolkViewer, 'tegels', n)), c = fs.readFileSync(path.join(exeMap, 'tegels', n));
        const v = verschil(a, c);
        if (v) fouten.push(`${label}: vak ${n}: ${v}`); else { gelijk++; bytes += a.length; }
      }
      console.log(`${label} vakken: ${gelijk} van ${vakkenV.length} byte voor byte gelijk (${(bytes / 1e6).toFixed(1)} MB)`);
      for (const n of ['overzicht.pvt', 'overzicht_maaiveld.pvt']) {
        const bv = fs.existsSync(path.join(wolkViewer, n)), be = fs.existsSync(path.join(exeMap, n));
        if (bv !== be) { fouten.push(`${label}: ${n} bestaat alleen bij de ${bv ? 'viewer' : 'exe'}`); continue; }
        if (!bv) continue;
        const v = verschil(fs.readFileSync(path.join(wolkViewer, n)), fs.readFileSync(path.join(exeMap, n)));
        console.log(`${label} ${n}: ${v ? 'VERSCHIL ' + v : 'gelijk'}`);
        if (v) fouten.push(`${label}: ${n}: ${v}`);
      }
      const zonder = (i) => { const k = { ...i }; delete k.gemaakt; delete k.viewer; delete k.duurImport; return k; };
      const iv = zonder(JSON.parse(fs.readFileSync(path.join(wolkViewer, 'info.json'), 'utf8'))), ie = zonder(JSON.parse(fs.readFileSync(path.join(exeMap, 'info.json'), 'utf8')));
      const sorteer = (o) => Array.isArray(o) ? o.map(sorteer) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map(k => [k, sorteer(o[k])])) : o;
      const sv = JSON.stringify(sorteer(iv)), se = JSON.stringify(sorteer(ie));
      if (sv !== se) {
        const kV = Object.keys(iv).filter(k => JSON.stringify(sorteer(iv[k])) !== JSON.stringify(sorteer(ie[k])));
        fouten.push(`${label}: info.json verschilt in ${kV.join(', ')}: ${kV.map(k => `${k} viewer ${JSON.stringify(iv[k]).slice(0, 80)} exe ${JSON.stringify(ie[k]).slice(0, 80)}`).join(' | ')}`);
      } else console.log(`${label} info.json: gelijk (zonder gemaakt, viewer, duurImport)`);
    }
  }
  await b.close();
  console.log('fouten:', fouten.join(' | ') || 'geen');
})();
