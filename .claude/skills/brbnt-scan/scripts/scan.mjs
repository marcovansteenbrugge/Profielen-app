#!/usr/bin/env node
// brbnt-scan: de BRBNT-scan van een project, als zelfscan (schrijft niets in het project) of als
// automatisch bijgehouden dashboard (in CI). Alleen Node en git nodig; gh of een GitHub-token is optioneel.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verzamel, laadPlan } from './verzamel.mjs';
import { scan, vergelijk } from './criteria.mjs';
import { schrijfHtml, scanMd, scanSvg, leesData, samenvatting, projectSlug, scansMap } from './uitvoer.mjs';
import { installeer } from './installeer.mjs';

export const SCAN_VERSIE = '1.4.2';
const LABEL = { groen: 'op orde', amber: 'bijna', rood: 'aandacht nodig', nvt: 'n.v.t.' };

const HELP = `brbnt-scan ${SCAN_VERSIE}

  node scan.mjs zelfscan [project] [--open]
      Scant het project en slaat het dashboard op buiten de repo (~/.brbnt/scans/<project>/).
      Verandert niets in het project. Werkt ook zonder CLAUDE.md, CI of GitHub.
  node scan.mjs bouw [project] --uit <map> [--vorige <dashboard.html>] [--font <woff2>]
      Schrijft dashboard.html, SCAN.md en scan.svg naar <map>. Dit draait de workflow in CI.
  node scan.mjs installeer [project] [--droog]
      Zet de automatische scan in het project: .brbnt/scan/, de workflow en de README-sectie.
      Met --droog alleen tonen wat er zou gebeuren.
  node scan.mjs versie

  Opties: --docs <map> als de docs-map geen docs/, _docs/ of app/docs/ is.`;

const args = process.argv.slice(2);
const optie = (n, d = null) => { const i = args.indexOf(n); return i > -1 ? args[i + 1] : d; };
const vlag = (n) => args.includes(n);
const MET_WAARDE = ['--uit', '--vorige', '--font', '--docs', '--linkbasis', '--modus'];
const positie = () => args.slice(1).find((a, i, l) => !a.startsWith('--') && !(i > 0 && MET_WAARDE.includes(l[i - 1]))) || '.';

/** Verzamelen en scannen in een keer. */
export async function maakScan(root, o = {}) {
  const d = await verzamel(root, o);
  d.scan = scan(d, { plan: await laadPlan(), nu: o.nu ? new Date(o.nu) : new Date(d.gegenereerd) });
  if (o.vorige) { d.vorige = o.vorige; d.vergelijking = vergelijk(d.scan, o.vorige); }
  return d;
}

/** Het huisfont als het project het zelf meelevert; anders valt het dashboard terug op het systeemfont. */
function vindFont(root) {
  try {
    const f = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').find((x) => /Montserrat[^/]*\.woff2$/i.test(x));
    return f ? path.join(root, f) : null;
  } catch { return null; }
}

export function samenvattingTekst(d, pad) {
  const s = d.scan;
  const r = [`BRBNT-scan van ${d.project.naam}: ${s.gehaald} van ${s.totaal} (${s.totaal ? Math.round((s.gehaald / s.totaal) * 100) : 0}%), ${LABEL[s.kleur]}`];
  const v = d.vergelijking;
  if (v) r.push(`  Sinds de vorige scan (${String(v.sinds).slice(0, 10)}): ${v.gehaald > 0 ? '+' + v.gehaald : v.gehaald === 0 ? '±0' : v.gehaald}, over ${v.vergeleken} criteria die in beide gemeten zijn${v.veranderd.length ? `; veranderd: ${v.veranderd.map((x) => `${x.id} ${x.was} → ${x.nu}`).join(', ')}` : ''}`);
  else if (d.vorige) r.push(`  De vorige scan gebruikte criteria versie ${d.vorige.versie}: nog niet te vergelijken.`);
  for (const l of s.lagen) r.push(`  ${l.nr} ${l.naam.padEnd(16)} ${(l.totaal ? `${l.gehaald}/${l.totaal}` : '-').padStart(5)}  ${l.totaal ? LABEL[l.kleur] : 'niets meetbaar'}${l.nvt ? `, ${l.nvt} n.v.t.` : ''}${l.onbekend ? `, ${l.onbekend} niet te meten` : ''}`);
  const niet = s.criteria.filter((c) => c.oordeel === 'niet');
  if (niet.length) r.push('', `Niet gehaald (${niet.length}):`, ...niet.map((c) => `  ${c.id} ${c.criterium}: ${c.bewijs}  [${c.skill}]`));
  const perSkill = Object.entries(niet.reduce((a, c) => ((a[c.skill] = (a[c.skill] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);
  const volgende = !d.laag1.claude.bytes ? 'brbnt-project-setup' : perSkill[0]?.[0];
  if (volgende) r.push('', `Volgende stap: ${volgende}${perSkill.length ? ` (lost ${niet.filter((c) => c.skill === volgende).length} criteria op)` : ''}`);
  if (pad) r.push('', `Dashboard: ${pad}`);
  return r.join('\n');
}

function open(pad) {
  const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', pad]] : process.platform === 'darwin' ? ['open', [pad]] : ['xdg-open', [pad]];
  try { spawn(cmd, a, { detached: true, stdio: 'ignore' }).unref(); } catch { /* openen is een gemak, geen eis */ }
}

async function main() {
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '--help') return console.log(HELP);
  if (cmd === 'versie') return console.log(SCAN_VERSIE);
  const root = path.resolve(positie());
  if (!fs.existsSync(root)) throw new Error(`Map bestaat niet: ${root}`);

  if (cmd === 'zelfscan') {
    const map0 = scansMap();
    if (path.resolve(map0).startsWith(root + path.sep)) throw new Error(`De scanmap ligt binnen het project (${map0}); een zelfscan schrijft nooit in het project.`);
    const d0 = await verzamel(root, { modus: 'zelfscan', docs: optie('--docs') });
    const map = path.join(map0, projectSlug(d0.project.map));
    const eerder = fs.existsSync(map) ? fs.readdirSync(map).filter((f) => f.endsWith('.html')).sort().pop() : null;
    const d = d0;
    d.scan = scan(d, { plan: await laadPlan(), nu: new Date(d.gegenereerd) });
    const vorige = eerder ? samenvatting(leesData(path.join(map, eerder))) : null;
    if (vorige) { d.vorige = vorige; d.vergelijking = vergelijk(d.scan, vorige); }
    fs.mkdirSync(map, { recursive: true });
    // De naam draagt de tijd in UTC (zoals gegenereerd), en zegt dat ook; de kop van het dashboard toont de lokale tijd.
    const stempel = d.gegenereerd.slice(0, 16).replace(/[:T]/g, '-');
    const pad = path.join(map, `${stempel}-UTC.html`);
    schrijfHtml(d, pad, { font: optie('--font') || vindFont(root) });
    console.log(samenvattingTekst(d, pad));
    if (vlag('--open')) open(pad);
    return;
  }

  if (cmd === 'bouw') {
    const uit = path.resolve(optie('--uit', path.join(root, '.brbnt-scan-uit')));
    let vorige = optie('--vorige') ? samenvatting(leesData(path.resolve(optie('--vorige')))) : null;
    const nul = path.join(root, '.brbnt/scan/nulmeting.json');
    if (!vorige && fs.existsSync(nul)) { try { vorige = JSON.parse(fs.readFileSync(nul, 'utf8')); } catch { vorige = null; } }
    const d = await maakScan(root, { modus: process.env.GITHUB_ACTIONS === 'true' ? 'ci' : optie('--modus', 'ci'), docs: optie('--docs'), linkBasis: optie('--linkbasis'), vorige });
    fs.mkdirSync(uit, { recursive: true });
    schrijfHtml(d, path.join(uit, 'dashboard.html'), { font: optie('--font') || vindFont(root) });
    fs.writeFileSync(path.join(uit, 'SCAN.md'), scanMd(d, { vorige }));
    fs.writeFileSync(path.join(uit, 'scan.svg'), scanSvg(d));
    console.log(samenvattingTekst(d, uit));
    return;
  }

  if (cmd === 'installeer') {
    const r = installeer(root, { droog: vlag('--droog') });
    console.log(`${vlag('--droog') ? 'Zou doen' : 'Gedaan'} in ${root} (hoofdtak ${r.hoofdtak}, de scan op een runner van GitHub):`);
    for (const a of r.acties) console.log(`  ${a.wat.padEnd(11)} ${a.pad}`);
    for (const m of r.meldingen) console.log(`  Let op: ${m}`);
    const iets = r.acties.some((a) => ['nieuw', 'bijgewerkt', 'verwijderd'].includes(a.wat));
    if (!iets) console.log('  Alles is al actueel: niets te doen.');
    return;
  }
  throw new Error(`Onbekend commando "${cmd}". Zie: node scan.mjs help`);
}

const direct = (() => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (direct) main().catch((e) => { console.error(`Fout: ${e.message}`); process.exitCode = 1; });
