// Draait alle snelle tests na elkaar en vat samen. Gebruik: node run_alle.js  (vanuit de map tests)
// De zware test groot_import.test.js (16 miljoen punten) draait alleen met: node run_alle.js groot
const { spawnSync } = require('child_process');
const tests = [
  ['stationering_snoei.test.js', 'pdf'], ['doorvaart.test.js'], ['ifc.test.js'], ['ifc.test.js', 'brug'],
  ['dxf_bladen.test.js', 'brug', 'A3'], ['project_losbestand.test.js'], ['lagen_aanuit.test.js'],
  ['maaiveld.test.js'], ['projectmap.test.js'], ['projectmap_bospad.test.js'], ['links_rechts.test.js'],
  ['nwb.test.js'], ['zoom_vakken.test.js'], ['instellingen.test.js'], ['natieve_map.test.js'],
  ['omzetten_exe.test.js'],
];
if (process.argv.includes('groot')) tests.push(['groot_import.test.js']);
let fout = 0;
for (const [t, ...arg] of tests) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [t, ...arg], { cwd: __dirname, encoding: 'utf8', timeout: 30 * 60 * 1000 });
  const uit = (r.stdout || '') + (r.stderr || '');
  const regel = (uit.match(/fouten: .*/g) || []).pop() || '(geen "fouten:"-regel)';
  const ok = r.status === 0 && /fouten: geen/.test(regel);
  if (!ok) fout++;
  console.log(`${ok ? 'OK  ' : 'FOUT'} ${[t, ...arg].join(' ').padEnd(40)} ${Math.round((Date.now() - t0) / 1000)} s  ${ok ? '' : regel + (r.status ? ` (exit ${r.status})` : '')}`);
  if (!ok) console.log(uit.split('\n').filter(l => l && !/agent-proxy/.test(l)).slice(-12).map(l => '      ' + l).join('\n'));
}
console.log(fout ? `\n${fout} test(s) mislukt` : '\nAlle tests geslaagd');
process.exit(fout ? 1 : 0);
