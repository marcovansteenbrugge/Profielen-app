// Zet de automatische scan in een project neer: de scripts in .brbnt/scan/, een eigen workflow, en een
// sectie in de README tussen vaste markeringen. Veilig herhaalbaar: wat al klopt blijft ongewijzigd, en
// niets buiten die drie plekken wordt aangeraakt. Met droog = true wordt alleen berekend wat er zou gebeuren.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { leesData, samenvatting, projectSlug, scansMap } from './uitvoer.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HIER, '../assets');
export const SCRIPTS = ['scan.mjs', 'verzamel.mjs', 'criteria.mjs', 'github.mjs', 'uitvoer.mjs', 'dashboard.mjs', 'installeer.mjs'];
// Wat een eerdere versie van de skill in .brbnt/scan/ zette en nu niet meer nodig is: bij bijwerken weg.
export const VERVALLEN = ['template.html'];
const START = '<!-- brbnt-scan:start';
const EINDE = '<!-- brbnt-scan:end -->';

// Een bron op Windows kan CRLF hebben (core.autocrlf); wat de skill in een project zet, heeft altijd LF.
const leesLf = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function zoekPlanScript() {
  return [path.resolve(HIER, '../../brbnt-plan/scripts/plan.mjs'), path.join(os.homedir(), '.claude/skills/brbnt-plan/scripts/plan.mjs'), path.join(HIER, 'plan.mjs')]
    .find((p) => fs.existsSync(p)) || null;
}

// De scan draait altijd op een runner van GitHub, met Node van setup-node; hij neemt niets over van de runner of
// de container van de tests (waarom: in het sjabloon). Alleen de hoofdtak verschilt per project.
export function maakWorkflow({ hoofdtak }) {
  return leesLf(path.join(ASSETS, 'brbnt-scan.yml.template')).replaceAll('%%HOOFDTAK%%', hoofdtak);
}

/** De README met de sectie tussen de markeringen erin; zonder README een nieuwe met de projectnaam als kop. */
export function readmeMetSectie(bestaand, { sectie, projectnaam }) {
  const eol = bestaand && bestaand.includes('\r\n') ? '\r\n' : '\n';
  const blok = sectie.replace(/\r?\n/g, eol).trimEnd();
  if (!bestaand) return `# ${projectnaam}${eol}${eol}${blok}${eol}`;
  const a = bestaand.indexOf(START);
  const b = bestaand.indexOf(EINDE);
  if (a !== -1 && b > a) return bestaand.slice(0, a) + blok + bestaand.slice(b + EINDE.length);
  const regels = bestaand.split(/\r?\n/);
  const h1 = regels.findIndex((r) => /^# /.test(r));
  if (h1 === -1) return blok + eol + eol + bestaand;
  // Na de kop en de alinea die er direct onder staat.
  let i = h1 + 1;
  while (i < regels.length && regels[i].trim() === '') i++;
  while (i < regels.length && regels[i].trim() !== '' && !/^#/.test(regels[i])) i++;
  return [...regels.slice(0, i), '', ...blok.split(eol), ...regels.slice(i)].join(eol);
}

const git = (root, a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

export function installeer(root, { droog = false } = {}) {
  const ROOT = path.resolve(root);
  const acties = [];
  const meldingen = [];
  const zet = (rel, inhoud, binair = false) => {
    const p = path.join(ROOT, rel);
    const oud = fs.existsSync(p) ? fs.readFileSync(p, binair ? undefined : 'utf8') : null;
    // Regeleinden tellen niet: een checkout met core.autocrlf zet LF om in CRLF, en dat is geen wijziging.
    const gelijk = oud != null && (binair ? Buffer.compare(oud, inhoud) === 0 : oud.replace(/\r\n/g, '\n') === inhoud.replace(/\r\n/g, '\n'));
    acties.push({ pad: rel, wat: oud == null ? 'nieuw' : gelijk ? 'ongewijzigd' : 'bijgewerkt' });
    if (!droog && !gelijk) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, inhoud); }
  };
  if (git(ROOT, ['rev-parse', '--is-inside-work-tree']) !== 'true') meldingen.push('Dit project staat niet in git: de workflow kan pas draaien als het op GitHub staat.');
  const hoofdtak = git(ROOT, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).replace(/^origin\//, '') || (git(ROOT, ['rev-parse', '--verify', '-q', 'main']) ? 'main' : git(ROOT, ['branch', '--show-current']) || 'main');

  // 1. De scripts, met plan.mjs erbij zodat CI niets van buiten nodig heeft.
  for (const f of SCRIPTS) zet(`.brbnt/scan/${f}`, leesLf(path.join(HIER, f)));
  for (const f of VERVALLEN) {
    const rel = `.brbnt/scan/${f}`;
    if (!fs.existsSync(path.join(ROOT, rel))) continue;
    acties.push({ pad: rel, wat: 'verwijderd' });
    if (!droog) fs.rmSync(path.join(ROOT, rel));
  }
  const planScript = zoekPlanScript();
  if (planScript) zet('.brbnt/scan/plan.mjs', leesLf(planScript));
  else meldingen.push('plan.mjs van brbnt-plan is niet gevonden: in CI zijn de statussen van plannen dan niet te berekenen.');
  zet('.brbnt/scan/README.md', '# .brbnt/scan\n\nDeze map is van de skill `brbnt-scan`: de scripts waarmee de workflow `brbnt-scan` de BRBNT-scan van dit project bijwerkt, met een kopie van `plan.mjs` van `brbnt-plan`. Wijzig niets met de hand; de skill werkt deze map bij.\n');

  // 2. De workflow; een eigen bestand met dezelfde naam laten we staan.
  const wfRel = '.github/workflows/brbnt-scan.yml';
  const wfPad = path.join(ROOT, wfRel);
  if (fs.existsSync(wfPad) && !/brbnt-scan: v\d/.test(fs.readFileSync(wfPad, 'utf8'))) {
    meldingen.push(`${wfRel} bestaat al en is niet van brbnt-scan: niet aangeraakt.`);
    acties.push({ pad: wfRel, wat: 'overgeslagen' });
  } else {
    zet(wfRel, maakWorkflow({ hoofdtak }));
  }

  // 3. De README-sectie.
  const readmeNaam = ['README.md', 'Readme.md', 'readme.md'].find((f) => fs.existsSync(path.join(ROOT, f))) || 'README.md';
  const readmeOud = fs.existsSync(path.join(ROOT, readmeNaam)) ? fs.readFileSync(path.join(ROOT, readmeNaam), 'utf8') : null;
  const sectie = leesLf(path.join(ASSETS, 'readme-sectie.md.template')).replaceAll('%%HOOFDTAK%%', hoofdtak);
  const hoofd = path.dirname(path.resolve(ROOT, git(ROOT, ['rev-parse', '--path-format=absolute', '--git-common-dir']) || path.join(ROOT, '.git')));
  zet(readmeNaam, readmeMetSectie(readmeOud, { sectie, projectnaam: path.basename(hoofd) }));

  // 4. De laatste zelfscan als nulmeting, alleen de eerste keer.
  const nulRel = '.brbnt/scan/nulmeting.json';
  if (!fs.existsSync(path.join(ROOT, nulRel))) {
    const map = path.join(scansMap(), projectSlug(path.basename(hoofd)));
    const laatste = fs.existsSync(map) ? fs.readdirSync(map).filter((f) => f.endsWith('.html')).sort().pop() : null;
    const s = laatste ? samenvatting(leesData(path.join(map, laatste))) : null;
    if (s) { zet(nulRel, JSON.stringify(s, null, 1) + '\n'); meldingen.push(`De zelfscan van ${s.gegenereerd.slice(0, 10)} (${s.gehaald}/${s.totaal}) wordt de nulmeting.`); }
  }
  return { hoofdtak, acties, meldingen };
}
