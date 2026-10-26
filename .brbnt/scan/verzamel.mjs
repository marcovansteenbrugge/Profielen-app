// Verzamelt alles wat het dashboard en de scan nodig hebben uit een project: de repo, git en (optioneel) GitHub.
// Leest alleen; schrijft nooit iets in het project. Werkt ook op een kaal project zonder CLAUDE.md, memory/,
// git-remote of CI: wat ontbreekt, blijft leeg en wordt in de scan "niet gehaald" of "niet te meten".
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { maakGithub, haalCi } from './github.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const MAANDEN = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december';
// Wat de scan zelf op de tak brbnt-dashboard schrijft: een verwijzing ernaar in CLAUDE.md is geen ontbrekend bestand.
const SCAN_UITVOER = ['SCAN.md', 'dashboard.html', 'scan.svg'];
export const PRODUCTSKILLS = ['brbnt-project-setup', 'brbnt-memory', 'brbnt-plan', 'brbnt-skill-scaffold', 'brbnt-parallel-setup', 'brbnt-scan'];

/** plan.mjs van brbnt-plan: naast deze scripts (in een project: .brbnt/scan/), als naastgelegen skill, of globaal. */
export async function laadPlan() {
  const kandidaten = [
    path.join(HIER, 'plan.mjs'),
    path.resolve(HIER, '../../brbnt-plan/scripts/plan.mjs'),
    path.join(os.homedir(), '.claude/skills/brbnt-plan/scripts/plan.mjs'),
  ];
  for (const k of kandidaten) if (fs.existsSync(k)) { try { return await import(pathToFileURL(k).href); } catch { /* volgende */ } }
  return null;
}

export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const r of m[1].split('\n')) {
    const k = /^\s*([A-Za-z_]+):\s*(.*)$/.exec(r);
    if (k) fm[k[1]] = k[2].replace(/^["']|["']$/g, '').trim();
  }
  return { fm, body: text.slice(m[0].length) };
}
export function tabel(lines, kopRe) {
  const i = lines.findIndex((l) => kopRe.test(l));
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && !lines[j].trim().startsWith('|')) { if (/^#{1,3} /.test(lines[j])) return null; j++; }
  if (j >= lines.length) return null;
  const rij = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());
  const koppen = rij(lines[j]);
  const rows = [];
  for (let k = j + 2; k < lines.length && lines[k].trim().startsWith('|'); k++) {
    const c = rij(lines[k]);
    const o = {};
    koppen.forEach((h, n) => { o[h || '_'] = c[n] ?? ''; });
    rows.push(o);
  }
  return { koppen, rows };
}
export function sectie(md, kopRe) {
  const lines = md.split('\n');
  const i = lines.findIndex((l) => kopRe.test(l));
  if (i < 0) return null;
  const niveau = /^(#+)/.exec(lines[i])[1].length;
  let j = i + 1;
  while (j < lines.length && !(new RegExp(`^#{1,${niveau}} `).test(lines[j]))) j++;
  return lines.slice(i + 1, j).join('\n').trim();
}

/**
 * @param {string} root projectmap
 * @param {object} o  docs, modus ('zelfscan' | 'ci'), token (GitHub), linkBasis
 */
export async function verzamel(root, o = {}) {
  const ROOT = path.resolve(root);
  const nu = o.nu ? new Date(o.nu) : new Date();
  const modus = o.modus || 'zelfscan';
  const plan = await laadPlan();
  const sh = (cmd, a) => {
    try { return execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
  };
  const lees = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch { return null; } };
  const bestaat = (p) => fs.existsSync(path.join(ROOT, p));
  const isGit = sh('git', ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';
  const shGit = sh;
  const shAlleenGit = (cmd, x) => (cmd === 'git' && !isGit ? null : shGit(cmd, x));
  const tracked = isGit ? (shAlleenGit('git', ['ls-files']) || '').split('\n').filter(Boolean) : lijstBestanden(ROOT);
  const trackedSet = new Set(tracked);
  // Bij een worktree: de oorspronkelijke checkout. Paden buiten de repo en de Claude-projectmap hangen daaraan.
  const HOOFD = (() => { const g = isGit ? (shAlleenGit('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']) || '').trim() : ''; return g ? path.dirname(path.resolve(g)) : ROOT; })();
  const signalen = [];
  // soort: een vaste naam per signaal (en waar nuttig de details), zodat het dashboard weet welke het elders al laat zien.
  const signaal = (niveau, laag, tekst, doel, extra) => signalen.push({ niveau, laag, tekst, doel, ...extra });
  // De historie per bestand in EEN doorloop van git log (een aanroep per bestand kost bij grote repo's minuten).
  const perBestand = new Map();
  if (isGit) {
    let cur = null;
    for (const l of (shAlleenGit('git', ['log', '--format=%x01%h|%aI|%an|%s', '--name-only']) || '').split('\n')) {
      if (l.startsWith('\x01')) { const [h, d, a, ...s] = l.slice(1).split('|'); cur = { hash: h, datum: d, auteur: a, onderwerp: s.join('|') }; continue; }
      if (!l.trim() || !cur) continue;
      const r = perBestand.get(l);
      if (r) { r.eerst = cur; r.aantal++; } else perBestand.set(l, { eerst: cur, laatst: cur, aantal: 1 });
    }
  }
  const gitFile = (p) => perBestand.get(p) || null;

  // ---------- project en bron ----------
  const pkgPad = ['package.json', 'app/package.json'].find(bestaat) || tracked.find((f) => /^[^/]+\/package\.json$/.test(f));
  let pkg = {};
  try { pkg = pkgPad ? JSON.parse(lees(pkgPad)) : {}; } catch { pkg = {}; }
  const remote = (shAlleenGit('git', ['remote', 'get-url', 'origin']) || '').trim();
  const ghRepo = process.env.GITHUB_REPOSITORY || /github\.com[/:](.+?)(\.git)?$/.exec(remote)?.[1] || null;
  const head = (shAlleenGit('git', ['log', '-1', '--format=%H|%h|%aI|%an|%s']) || '').trim().split('|');
  const status = (shAlleenGit('git', ['status', '--porcelain']) || '').split('\n').filter(Boolean);
  const huidigeTak = (shAlleenGit('git', ['branch', '--show-current']) || '').trim();
  const hoofdtak = (shAlleenGit('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']) || '').trim().replace(/^origin\//, '')
    || ['main', 'master'].find((t) => shAlleenGit('git', ['rev-parse', '--verify', '-q', t]) != null) || huidigeTak || 'main';
  const apkMetaPad = tracked.find((p) => p.endsWith('apk-meta.json'));
  let apkMeta = null;
  try { apkMeta = apkMetaPad ? JSON.parse(lees(apkMetaPad)) : null; } catch { apkMeta = null; }
  const bron = { git: isGit, commit: head[0] || null, kort: head[1] || null, datum: head[2] || null, auteur: head[3] || null, onderwerp: head.slice(4).join('|') || null, tak: huidigeTak, hoofdtak, gewijzigd: status.map((l) => l.slice(3)) };
  if (!isGit) signaal('oranje', 'git', 'Dit project staat niet in git: historie, auteurs en CI zijn niet te meten', 'git', { soort: 'geen-git' });
  if (status.length) signaal('oranje', 'git', `${status.length} bestand(en) niet gecommit op het moment van scannen`, 'git', { soort: 'niet-gecommit' });

  // ---------- laag 1: CLAUDE.md ----------
  const claudeMd = lees('CLAUDE.md') || '';
  const claudeSecties = [];
  {
    let cur = null;
    for (const l of claudeMd.split('\n')) {
      const m = /^## (.+)$/.exec(l);
      if (m) { cur = { titel: m[1].trim(), md: '' }; claudeSecties.push(cur); continue; }
      if (cur) cur.md += l + '\n';
    }
    const afdwingRe = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[\w-]+\.py$|_test\.(py|go)$|^\.githooks\/|^\.husky\/|check-[\w-]+\.m?js$|\.github\/workflows\//;
    for (const s of claudeSecties) {
      s.md = s.md.trim();
      s.regels = (s.md.match(/^- /gm) || []).length;
      const blokken = [];
      for (const l of s.md.split('\n')) {
        if (/^- /.test(l)) blokken.push(l.slice(2));
        else if (blokken.length && (/^\s+\S/.test(l) || (l.trim() && !/^#/.test(l)))) blokken[blokken.length - 1] += '\n' + l.trim();
      }
      s.lijst = blokken.map((t) => {
        const titel = /^\*\*(.+?)\*\*/.exec(t)?.[1]?.replace(/[:.]$/, '') || t.replace(/[*`]/g, '').split(/[.:]\s/)[0].slice(0, 110);
        const refs = [...t.matchAll(/`([^`\s]+)`/g)].map((m) => m[1].replace(/[),.:;]+$/, '')).filter((p) => !p.includes('*') && !/^\.[a-z.]+$/.test(p) && (afdwingRe.test(p) || afdwingRe.test(p.split('/').pop())));
        for (const m of t.matchAll(/`[^`]*?((?:\.\.\/)+[^`\s]*check-[\w-]+\.m?js)[^`]*`/g)) refs.push(m[1]);
        const uniek = [...new Map(refs.sort((a, b) => a.length - b.length).map((p) => [p.split('/').pop(), p])).values()];
        const afdwinging = uniek.map((p) => p.startsWith('../')
          ? { pad: p, gevonden: [HOOFD, ...tracked.filter((f) => f.endsWith('/package.json')).map((f) => path.join(HOOFD, path.dirname(f)))].some((b) => fs.existsSync(path.resolve(b, p))) ? '(buiten de repo) ' + p : null, buitenRepo: true }
          : { pad: p, gevonden: tracked.find((f) => f === p || f.endsWith('/' + p) || f.endsWith('/' + p.split('/').pop())) || null });
        const datums = [...t.matchAll(new RegExp(`\\b(\\d{1,2} (?:${MAANDEN}) \\d{4})`, 'g'))].map((m) => m[1]);
        return { titel, tekst: t, afdwinging, sinds: datums[0] || null };
      });
    }
  }
  const markering = /brbnt-plan-regel:\s*(v\d+)/.exec(claudeMd)?.[1] || null;
  const docsDir = o.docs || ['_docs', 'docs', 'app/docs'].find(bestaat) || null;
  const verwijzingen = [];
  {
    const gezien = new Set();
    for (const m of claudeMd.matchAll(/`([^`\s]+)`/g)) {
      const t = m[1].replace(/[),.:;]+$/, '');
      if (/^\.[a-z.]+$/.test(t) || !/[/.]/.test(t) || /^https?:/.test(t) || /^\.{1,2}$/.test(t) || /[*<>{}$=]/.test(t) || /^\d/.test(t) || /^-/.test(t)) continue;
      if (!/\.(ts|tsx|js|mjs|cjs|jsx|json|jsonc|md|yml|yaml|py|go|cs|sql|html|css|txt|toml|apk)$/.test(t) && !t.endsWith('/')) continue;
      if (gezien.has(t)) continue;
      gezien.add(t);
      // Een pad met een / vooraan is een webadres (zoals /en/ of /api/) of een pad vanaf de root van de repo: het telt
      // alleen als ontbrekend als het ook zonder die / niet in de repo staat. SCAN.md, dashboard.html en scan.svg schrijft
      // de scan zelf op de tak brbnt-dashboard; op de hoofdtak horen ze niet.
      const p = t.replace(/^\.?\//, '').replace(/\/$/, '');
      const buitenRepo = t.startsWith('../') || t.startsWith('~');
      const scanUitvoer = !buitenRepo && SCAN_UITVOER.includes(p) && trackedSet.has('.brbnt/scan/scan.mjs');
      const gevonden = buitenRepo ? null : scanUitvoer ? `${p} op de tak brbnt-dashboard` : tracked.find((f) => f === p || f.endsWith('/' + p) || f.startsWith(p + '/') || f.includes('/' + p + '/') || (docsDir && f.startsWith(`${docsDir}/${p}`))) || null;
      verwijzingen.push({ pad: t, gevonden, buitenRepo, webadres: t.startsWith('/') && !gevonden });
    }
  }
  const nietGevonden = verwijzingen.filter((v) => !v.gevonden && !v.buitenRepo && !v.webadres);
  if (nietGevonden.length) signaal('info', 'laag1', `CLAUDE.md noemt ${nietGevonden.length} pad(en) die niet in de repo staan (kan bewust zijn, bijvoorbeeld een vervallen bestand)`, 'laag1', { soort: 'claude-paden', paden: nietGevonden.map((v) => v.pad) });

  const pb = sectie(claudeMd, /^## (Plan en besluit|Plan and decision)/i) || '';
  const planSkillBeschikbaar = modus === 'ci' ? null : fs.existsSync(path.join(os.homedir(), '.claude/skills/brbnt-plan')) || bestaat('.claude/skills/brbnt-plan');
  const vereisten = [
    { id: 'V1', naam: 'Plan-plicht', oordeel: /brbnt-plan/.test(pb) && /nieuwe functie|new feature/i.test(pb) ? 'aanwezig' : 'ontbreekt' },
    { id: 'V2', naam: 'Bouwen na akkoord', oordeel: /akkoord|approv/i.test(pb) && /bouw nooit|never build/i.test(pb) ? 'aanwezig' : 'ontbreekt' },
    { id: 'V3', naam: 'Plaats en zoekvolgorde', oordeel: /plan-beslis-index/.test(pb) ? 'aanwezig' : 'ontbreekt' },
    { id: 'V4', naam: 'Fase-prefix in commits', oordeel: /fase-prefix|phase prefix/i.test(pb) ? 'aanwezig' : 'ontbreekt' },
    { id: 'V5', naam: 'Structuurregel (Repository Structure noemt de docs-locatie)', oordeel: /^## (Repository Structure|Repositorystructuur)/m.test(claudeMd) ? 'aanwezig' : 'ontbreekt', toelichting: /^## (Repository Structure|Repositorystructuur)/m.test(claudeMd) ? '' : 'Geen sectie Repository Structure in CLAUDE.md.' },
    { id: 'V6', naam: 'De docs-map bestaat', oordeel: docsDir ? 'aanwezig' : 'ontbreekt', toelichting: docsDir || '' },
    { id: 'V7', naam: 'memory/ met MEMORY.md bestaat', oordeel: bestaat('memory/MEMORY.md') ? 'aanwezig' : 'ontbreekt' },
    { id: 'V8', naam: 'Skill brbnt-plan beschikbaar', oordeel: planSkillBeschikbaar == null ? 'niet te meten' : planSkillBeschikbaar ? 'aanwezig' : 'ontbreekt', toelichting: planSkillBeschikbaar == null ? 'In CI zijn de skills van de ontwikkelaar niet te zien.' : 'Gecontroleerd op de machine die scande.' },
    { id: 'V9', naam: 'BRBNT-scan geïnstalleerd', oordeel: trackedSet.has('.brbnt/scan/scan.mjs') && /brbnt-scan: v\d/.test(lees('.github/workflows/brbnt-scan.yml') || '') ? 'aanwezig' : 'ontbreekt', toelichting: 'Scripts in .brbnt/scan/ en de workflow brbnt-scan; of ze actueel zijn, toetst brbnt-project-setup (route C).' },
  ];
  if (claudeMd) vereisten.filter((v) => v.oordeel === 'ontbreekt').forEach((v) => signaal('info', 'laag1', `${v.id} ${v.naam}: ontbreekt`, 'laag1', { soort: 'vereiste', id: v.id }));
  else signaal('rood', 'laag1', 'Er is nog geen CLAUDE.md: begin met brbnt-project-setup', 'laag1', { soort: 'geen-claude' });

  const ontwerpPad = ['ONTWERP.md', 'app/ONTWERP.md', 'docs/ONTWERP.md', 'ARCHITECTURE.md', 'docs/ARCHITECTURE.md'].find(bestaat) || null;
  const ontwerpMd = ontwerpPad ? lees(ontwerpPad) : null;
  const ontwerp = ontwerpMd ? {
    pad: ontwerpPad, bytes: Buffer.byteLength(ontwerpMd), regels: ontwerpMd.split('\n').length,
    hoofdstukken: [...ontwerpMd.matchAll(/^## (\d+)\.\s+(.+?)(?:\s+\((?:vastgelegd|toegevoegd)\s+([^)]*)\))?\s*$/gm)].map((m) => ({ nr: +m[1], titel: m[2], datum: m[3] || null })),
    md: ontwerpMd,
  } : null;

  // ---------- laag 2: memory ----------
  const memDir = 'memory';
  const memIndex = lees(`${memDir}/MEMORY.md`) || '';
  const indexLinks = [...memIndex.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)\s*[\u2014\u2013:-]\s*(.*)$/gm)].map((m) => ({ titel: m[1], bestand: m[2], hook: m[3] }));
  const memBestanden = bestaat(memDir) ? fs.readdirSync(path.join(ROOT, memDir)).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').sort() : [];
  const memories = memBestanden.map((f) => {
    const text = lees(`${memDir}/${f}`) || '';
    const { fm, body } = frontmatter(text);
    // Labels mogen Engels (zoals het sjabloon) of Nederlands zijn.
    const why = /\*\*(?:Why|Waarom):\*\*\s*([\s\S]*?)(?=\n\n|\*\*(?:How to apply|Hoe toe te passen|Toepassen)|$)/.exec(body)?.[1]?.trim() || null;
    const how = /\*\*(?:How to apply|Hoe toe te passen|Toepassen):\*\*\s*([\s\S]*?)(?=\n\n|$)/.exec(body)?.[1]?.trim() || null;
    const links = [...new Set([...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]))];
    const vastgelegd = new RegExp(`(?:Vastgelegd|vastgelegd|Sinds|sinds|Besloten|besloten)\\s+(?:op\\s+)?(\\d{1,2}[ -](?:${MAANDEN}|\\d{1,2})[ -]\\d{4})`).exec(body)?.[1] || null;
    const idx = indexLinks.find((l) => l.bestand === f);
    return {
      bestand: f, naam: fm.name || f.replace(/\.md$/, ''), beschrijving: fm.description || '', type: fm.type || /type:\s*(\w+)/.exec(text)?.[1] || 'onbekend',
      gewijzigd: fm.modified || null, vastgelegd, why, how, links, git: gitFile(`${memDir}/${f}`), inIndex: !!idx, indexTitel: idx?.titel || null, hook: idx?.hook || null, md: body.trim(),
    };
  });
  const memNamen = new Set(memories.map((m) => m.naam));
  memories.forEach((m) => { m.kapot = m.links.filter((l) => !memNamen.has(l)); m.backlinks = memories.filter((x) => x.links.includes(m.naam)).map((x) => x.naam); });
  const memProblemen = {
    nietInIndex: memories.filter((m) => !m.inIndex).map((m) => m.bestand),
    indexZonderBestand: indexLinks.filter((l) => !memBestanden.includes(l.bestand)).map((l) => l.bestand),
    kapotteLinks: memories.flatMap((m) => m.kapot.map((k) => ({ van: m.naam, naar: k }))),
    zonderWhy: memories.filter((m) => ['feedback', 'project'].includes(m.type) && !m.why).map((m) => m.naam),
  };
  let memBuitenRepo = null;
  if (modus !== 'ci') {
    const claudeMemDir = path.join(os.homedir(), '.claude', 'projects', HOOFD.replace(/[^a-zA-Z0-9]/g, '-'), 'memory');
    try {
      const buiten = fs.readdirSync(claudeMemDir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md' && !memBestanden.includes(f));
      memBuitenRepo = { map: claudeMemDir, aantal: buiten.length };
      if (buiten.length) signaal('oranje', 'laag2', `${buiten.length} memories staan alleen in de Claude-projectmap op deze machine en niet in de repo`, 'laag2', { soort: 'memory-buiten-repo' });
    } catch { /* geen projectmap op deze machine */ }
  }
  if (memProblemen.nietInIndex.length) signaal('oranje', 'laag2', `${memProblemen.nietInIndex.length} memory-bestand(en) staan niet in MEMORY.md`, 'laag2', { soort: 'memory-index' });
  if (memProblemen.indexZonderBestand.length) signaal('rood', 'laag2', `${memProblemen.indexZonderBestand.length} regel(s) in MEMORY.md wijzen naar een bestand dat niet bestaat`, 'laag2', { soort: 'memory-index' });
  if (memProblemen.kapotteLinks.length) signaal('oranje', 'laag2', `${memProblemen.kapotteLinks.length} [[link(s)]] tussen memories wijzen nergens heen`, 'laag2', { soort: 'memory-link' });
  if (memProblemen.zonderWhy.length) signaal('info', 'laag2', `${memProblemen.zonderWhy.length} feedback-/project-memories zonder een expliciete Why-regel`, 'laag2', { soort: 'memory-why' });

  // ---------- laag 3: plannen en besluiten ----------
  const plannen = [];
  if (docsDir && bestaat(docsDir)) {
    for (const f of fs.readdirSync(path.join(ROOT, docsDir)).filter((x) => x.endsWith('.plan.md')).sort()) {
      const naam = f.replace(/\.plan\.md$/, '');
      const planMd = lees(`${docsDir}/${f}`) || '';
      const beslisMd = lees(`${docsDir}/${naam}.beslis.md`) || '';
      const pfm = frontmatter(planMd).fm;
      const bfm = frontmatter(beslisMd).fm;
      const pl = planMd.split('\n');
      const bl = beslisMd.split('\n');
      const fasering = tabel(pl, /^## (\d+\.\s*)?Fasering/)?.rows || [];
      const vrijgave = tabel(bl, /^## Vrijgave per fase/)?.rows || [];
      const uitvoering = tabel(pl, /^## (\d+\.\s*)?Uitvoering/)?.rows || [];
      const toetsing = tabel(pl, /^### Toetsing per fase/)?.rows || [];
      const afwijkingen = tabel(pl, /^## (\d+\.\s*)?Afwijkingen/)?.rows || [];
      const wijzigingslog = tabel(pl, /^## (\d+\.\s*)?Wijzigingslog/)?.rows || [];
      const historie = tabel(bl, /^## Historie/)?.rows || [];
      const kop = /^> \*\*Nu van jou gevraagd:\*\*([\s\S]*?)(?=\n[^>]|\n> \*\*[A-Z])/m.exec(beslisMd)?.[1]?.replace(/\n> ?/g, ' ').trim() || null;
      const later = /^> \*\*Later nodig:\*\*(.*)$/m.exec(beslisMd)?.[1]?.trim() || null;
      const akkoorden = [...beslisMd.matchAll(/^Letterlijk akkoord \(([^)]*)\):\s*(.*)$/gm)].map((m) => ({ over: m[1], tekst: m[2] }));
      const kaarten = [...beslisMd.matchAll(/^### (\S+) (B\d+) · (.+)$([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)].map((m) => {
        const r = /\*\*Besloten door\*\* ([^·]+)· \*\*op\*\* ([^·]+)· \*\*via\*\* ([^·]+)· \*\*over\*\* (.*?)(?: · \*\*nodig vóór\*\* (.*))?$/m.exec(m[4]);
        return { glyph: m[1], id: m[2], onderwerp: m[3].trim(), besluitDoor: r?.[1]?.trim() || null, op: r?.[2]?.trim() || null, via: r?.[3]?.trim() || null, over: r?.[4]?.trim() || null, beslist: /\*\*Je beslist:\*\*\s*(.*)/.exec(m[4])?.[1] || null };
      });
      let evaluatie = null;
      if (plan?.evaluate) {
        try { const ev = plan.evaluate(planMd, beslisMd || null); evaluatie = { status: ev.status, voortgang: ev.voortgang, wachtOpJou: ev.wacht, laatstVrijgegeven: ev.laatst, fases: ev.fases.map((x) => ({ id: x.id, soort: x.soort, tekst: x.tekst })) }; } catch (e) { evaluatie = { fout: e.message }; }
      }
      const tokens = uitvoering.map((u) => { const k = Object.keys(u).find((x) => /Tokens/i.test(x)); const m = /([\d.]+)\s*\/\s*([\d.]+)/.exec(u[k] || ''); return m ? { in: +m[1].replace(/\./g, ''), uit: +m[2].replace(/\./g, '') } : null; });
      const toetsOordeel = toetsing.reduce((a, t) => { const x = (t.Oordeel || '').toLowerCase(); a[x] = (a[x] || 0) + 1; return a; }, {});
      const logVersies = wijzigingslog.map((w) => parseInt(w.Versie, 10)).filter(Number.isFinite);
      const huidigeVersie = Math.max(+pfm.versie || 1, ...logVersies);
      if (logVersies.length && +pfm.versie && Math.max(...logVersies) > +pfm.versie) signaal('oranje', 'laag3', `Plan ${naam}: de kop zegt versie ${pfm.versie}, het wijzigingslog loopt tot versie ${Math.max(...logVersies)}`, 'plan:' + naam, { soort: 'plan-versie', plan: naam });
      plannen.push({
        naam, titel: pfm.titel || naam, versie: huidigeVersie, versieKop: +pfm.versie || null, status: evaluatie?.status || pfm.status, opgesteld: pfm.opgesteld, opgesteldDoor: pfm.opgesteld_door, beslisser: pfm.beslisser, voorgelegd: bfm.voorgelegd,
        basisCommit: pfm.basis_commit, samenvatting: pfm.samenvatting, trefwoorden: (pfm.trefwoorden || '').replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean),
        fasering, vrijgave, kaarten, uitvoering, tokens, toetsing: toetsing.length, toetsOordeel, afwijkingen, wijzigingslog, historie, nuGevraagd: kop, later, akkoorden, evaluatie,
        planPad: `${docsDir}/${f}`, beslisPad: `${docsDir}/${naam}.beslis.md`, planMd, beslisMd,
      });
      const wacht = evaluatie?.wachtOpJou;
      if (wacht && wacht !== '-') signaal('rood', 'laag3', `Plan ${naam} wacht op jou: ${wacht}`, 'plan:' + naam, { soort: 'plan-wacht', plan: naam });
      for (const v of vrijgave) {
        if (!/⚠/.test(v.Vrijgave || '')) continue;
        const gebouwd = /✅/.test(v.Gebouwd || '');
        signaal(gebouwd ? 'info' : 'oranje', 'laag3', gebouwd ? `Plan ${naam}: ${v.Fase} is gebouwd; de vrijgave staat op "${v.Vrijgave.replace(/^⚠\s*/, '')}"` : `Plan ${naam}: vrijgave van ${v.Fase} is vervallen`, 'plan:' + naam, { soort: gebouwd ? 'vrijgave-vervallen-gebouwd' : 'vrijgave-vervallen', plan: naam, fase: v.Fase });
      }
    }
  }
  const ouder = (map) => (docsDir && bestaat(`${docsDir}/${map}`) ? fs.readdirSync(path.join(ROOT, docsDir, map)).filter((f) => f.endsWith('.md')).sort() : []).map((f) => {
    const md = lees(`${docsDir}/${map}/${f}`) || '';
    return { bestand: f, pad: `${docsDir}/${map}/${f}`, titel: /^# (.+)$/m.exec(md)?.[1] || f, status: /^Status:\s*(.+)$/m.exec(md)?.[1]?.replace(/\*\*/g, '') || null, regels: md.split('\n').length, git: gitFile(`${docsDir}/${map}/${f}`), md };
  });
  // De fase-prefixen uit de kolom Commit-prefix van de plannen (bijvoorbeeld CMS-F2: naast andere plannen); F<n>: telt altijd.
  const fasePrefixen = [...new Set(plannen.flatMap((p) => p.fasering.flatMap((r) => {
    const cel = r['Commit-prefix'] || '';
    const code = [...cel.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    return code.length ? code : [cel.trim()];
  })))].filter((x) => x && !/^[-\u2013\u2014]$/.test(x));
  const ouderePlannen = ouder('plannen');
  const onderzoek = ouder('onderzoek');

  // ---------- laag 4: tests, CI, hooks, skills ----------
  const testRe = /\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[\w-]+\.py$|_test\.(py|go)$/;
  // .NET: een klasse *Test of *Tests (C#, F#, VB) in een testproject, dus onder een map test(s) of een projectmap met een deel
  // *Tests (App.Tests, App.Tests.Integration, App.UnitTests); zo telt bijvoorbeeld tools/Check/SmokeTest.cs niet.
  const dotnetTest = (f) => /\wTests?\.(cs|fs|vb)$/.test(f) && /(^|\/)([Tt]ests?|[^/]*\.[A-Za-z]*Tests?(\.[^/]*)?)\//.test(f);
  // Tests in .brbnt/ en .claude/ horen bij een skill (zoals de meegeleverde brbnt-plan), niet bij de testsuite van het project.
  const testBestanden = tracked.filter((f) => (testRe.test(f) || dotnetTest(f)) && !/^\.(brbnt|claude)\//.test(f));
  // Een map (of een deel van een .NET-projectnaam zoals App.Tests.E2E of App.IntegrationTests) noemt de laag.
  const mapDeel = (f, re) => f.split('/').slice(0, -1).some((m) => m.split('.').some((x) => re.test(x)));
  const heuristiek = (f) => (mapDeel(f, /^(e2e|E2E)$/) || /playwright|cypress/.test(f) ? 'e2e' : /\.test\.[jt]sx$/.test(f) ? 'component' : mapDeel(f, /^(integration|integratie|Integration|IntegrationTests)$/) ? 'integratie' : 'unit');
  const workflows = tracked.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f)).map((f) => {
    const y = lees(f) || '';
    const jobsDeel = y.slice(Math.max(0, y.search(/^jobs:/m)));
    const jobs = [...jobsDeel.matchAll(/^ {2}([A-Za-z0-9_-]+):\n((?: {4}.*\n|\s*\n)*)/gm)].map((m) => ({
      id: m[1], naam: /^ {4}name:\s*(.+)$/m.exec(m[2])?.[1] || m[1], runsOn: /^ {4}runs-on:\s*(.+)$/m.exec(m[2])?.[1] || null,
      container: /^ {6}image:\s*(.+)$/m.exec(m[2])?.[1] || /^ {4}container:\s*(\S.+)$/m.exec(m[2])?.[1] || null, needs: /^ {4}needs:\s*(.+)$/m.exec(m[2])?.[1] || null,
      stappen: [...m[2].matchAll(/^ {6}- (?:name:\s*(.+)|run:\s*(.+)|uses:\s*(.+))$/gm)].map((s) => s[1] || (s[2] ? 'run: ' + s[2] : 'uses: ' + s[3])),
    }));
    const on = /^on:\n((?: {2}.*\n)+)/m.exec(y)?.[1] || '';
    return { pad: f, naam: /^name:\s*(.+)$/m.exec(y)?.[1]?.trim() || path.basename(f).replace(/\.ya?ml$/, ''), triggers: [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), jobs, eigen: /brbnt-scan: v\d/.test(y), md: '```yaml\n' + y + '\n```' };
  });
  const gh = maakGithub({ repo: ghRepo, token: o.token ?? process.env.GITHUB_TOKEN ?? null, sh });
  const ci = await haalCi(gh, { repo: ghRepo, hoofdtak });
  if (ci.beschikbaar) {
    const main = ci.laatsteRun?.run;
    if (main && main.conclusion !== 'success') signaal('rood', 'laag4', `Laatste CI-run op ${hoofdtak}: ${main.conclusion}`, 'laag4', { soort: 'ci-laatste' });
    const rood = ci.runs.filter((r) => r.conclusion === 'failure').length;
    if (rood) signaal('info', 'laag4', `${rood} van de laatste ${ci.runs.length} CI-runs faalden`, 'laag4', { soort: 'ci-gefaald' });
  }
  // Per testbestand de laag: uit de CI-log als die er is (projectlabel), anders uit pad en naam.
  const inLog = (f) => (ci.laatsteRun?.perBestand || []).find((b) => f === b.bestand || f.endsWith('/' + b.bestand));
  const lagen = {};
  const nietInCi = [];
  for (const f of testBestanden) {
    const b = inLog(f);
    const l = b?.laag || heuristiek(f);
    (lagen[l] ||= { bestanden: 0 }).bestanden++;
    if (ci.laatsteRun?.perBestand?.length && !b) nietInCi.push(f);
  }
  const bewaking = testBestanden.filter((f) => /(drift|parity|draagbaarheid|architect|boundar|conformance)/i.test(f));
  const hooks = tracked.filter((f) => f.startsWith('.githooks/') || (f.startsWith('.husky/') && !f.includes('/_/'))).map((f) => ({ pad: f, uitleg: (lees(f) || '').split('\n').filter((l) => l.startsWith('#') && !l.startsWith('#!')).slice(0, 2).map((l) => l.replace(/^#\s?/, '')).join(' '), beschermt: /pre-push$/.test(f) && /\b(main|master)\b/.test(lees(f) || ''), md: '```sh\n' + (lees(f) || '') + '\n```' }));
  const hooksPath = (shAlleenGit('git', ['config', 'core.hooksPath']) || '').trim() || null;
  const genoemd = [...new Set([...claudeMd.matchAll(/`([a-z0-9][a-z0-9-]+)`/g)].map((m) => m[1]))];
  const skillDir = (s) => [path.join(ROOT, '.claude/skills', s), path.join(os.homedir(), '.claude/skills', s)].find((d) => fs.existsSync(path.join(d, 'SKILL.md')));
  const skills = genoemd.filter((s) => PRODUCTSKILLS.includes(s) || skillDir(s)).map((s) => {
    const dir = modus === 'ci' ? null : skillDir(s);
    let desc = null;
    if (dir) {
      const fmTekst = /^---\n([\s\S]*?)\n---/.exec(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n'))?.[1] || '';
      const m = /^description:[ \t]*(.*)((?:\n[ \t]+.*)*)/m.exec(fmTekst);
      desc = m ? (/^[>|]-?$/.test(m[1].trim()) ? m[2] : m[1] + ' ' + m[2]).replace(/\s+/g, ' ').trim().slice(0, 220) : null;
    }
    return { naam: s, beschikbaar: modus === 'ci' ? null : !!dir, lokaal: dir ? dir.startsWith(ROOT) : false, beschrijving: desc };
  });
  const alleDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const bekend = ['react', 'vue', 'svelte', 'next', 'hono', 'express', 'drizzle-orm', 'prisma', 'vite', 'vitest', 'jest', 'typescript', 'wrangler', 'tailwindcss', 'eslint', '@playwright/test', '@capacitor/core'];
  const deps = { runtime: Object.keys(pkg.dependencies || {}).length, dev: Object.keys(pkg.devDependencies || {}).length, belangrijk: Object.fromEntries(bekend.filter((k) => alleDeps[k]).map((k) => [k, alleDeps[k]])) };
  const migraties = tracked.filter((f) => /migrations?\/.*\.sql$/.test(f)).length;

  // ---------- laag 5: parallel ----------
  const worktrees = (shAlleenGit('git', ['worktree', 'list', '--porcelain']) || '').split('\n\n').filter(Boolean).map((b) => ({
    pad: /^worktree (.+)$/m.exec(b)?.[1], head: /^HEAD (\w{7})/m.exec(b)?.[1], tak: /^branch refs\/heads\/(.+)$/m.exec(b)?.[1] || (/^detached/m.test(b) ? '(los, geen tak)' : null),
  })).map((w) => ({ ...w, datum: w.head ? (shAlleenGit('git', ['log', '-1', '--format=%cI', w.head]) || '').trim() || null : null }));
  const takken = (shAlleenGit('git', ['for-each-ref', '--format=%(refname:short)|%(committerdate:iso-strict)|%(subject)', 'refs/heads', 'refs/remotes/origin']) || '').trim().split('\n')
    .filter((l) => l && !l.includes('/HEAD|') && !/^origin\|/.test(l) && !/^(origin\/)?brbnt-dashboard\|/.test(l)).map((l) => {
      const [naam, datum, ...s] = l.split('|');
      const kort = naam.replace(/^origin\//, '');
      const pr = (ci.prs || []).find((p) => p.headRefName === kort);
      return { naam, datum, onderwerp: s.join('|'), remote: naam.startsWith('origin/'), pr: pr ? { nummer: pr.number, staat: pr.state } : null };
    });
  const kanWeg = takken.filter((t) => t.remote && t.pr?.staat === 'MERGED');
  if (kanWeg.length) signaal('info', 'laag5', `${kanWeg.length} remote tak(ken) horen bij een al gemergde PR en kunnen weg`, 'laag5', { soort: 'takken-gemerged' });
  if (worktrees.some((w) => w.tak === '(los, geen tak)')) signaal('info', 'laag5', `${worktrees.filter((w) => w.tak === '(los, geen tak)').length} worktree(s) zonder tak (detached HEAD)`, 'laag5', { soort: 'worktree-los' });
  let launch = null;
  try { launch = bestaat('.claude/launch.json') ? JSON.parse(lees('.claude/launch.json')) : null; } catch { launch = null; }
  const addendum = tracked.find((f) => /addendum-parallel/.test(f)) || null;

  // ---------- git ----------
  const commits = (shAlleenGit('git', ['log', '--format=%h|%aI|%an|%s']) || '').trim().split('\n').filter(Boolean).map((l) => {
    const [hash, datum, auteur, ...s] = l.split('|');
    const onderwerp = s.join('|');
    const versie = /^v(\d+\.\d+\.\d+)\b/.exec(onderwerp)?.[1] || null;
    const pr = /\(#(\d+)\)\s*$/.exec(onderwerp)?.[1] || null;
    const fase = /^(F\d+):/.exec(onderwerp)?.[1] || null;
    return { hash, datum, auteur, onderwerp, versie, pr: pr ? +pr : null, fase, cat: versie ? 'release' : fase ? 'fase' : /^([A-Za-z][\w-]*):/.exec(onderwerp)?.[1] || 'overig' };
  });
  const perWeek = {};
  for (const c of commits) { const d = new Date(c.datum); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); perWeek[k] = (perWeek[k] || 0) + 1; }
  // Een versie telt een keer: de oudste commit met dat nummer is de release.
  const releaseMap = new Map();
  for (const c of commits.filter((x) => x.versie).reverse()) if (!releaseMap.has(c.versie)) releaseMap.set(c.versie, c);
  const releases = [...releaseMap.values()].reverse();
  const git = {
    totaal: commits.length, eerste: commits[commits.length - 1] || null, commits: commits.slice(0, 200), releases,
    perWeek: Object.entries(perWeek).sort().map(([week, n]) => ({ week, n })), auteurs: Object.entries(commits.reduce((a, c) => ((a[c.auteur] = (a[c.auteur] || 0) + 1), a), {})).map(([naam, n]) => ({ naam, n })),
    tags: (shAlleenGit('git', ['tag', '--sort=-creatordate']) || '').trim().split('\n').filter(Boolean),
    // Alleen eigen takken en die van origin: een CI-runner kan oude PR-referenties (pull/N/merge) bewaren.
    faseCommits: (shAlleenGit('git', ['log', '--branches', '--remotes=origin', '--format=%s']) || '').split('\n').filter((s) => /^F\d+:/.test(s) || fasePrefixen.some((p) => s.startsWith(p))).length,
    hoofdtakCommits: (shAlleenGit('git', ['log', hoofdtak, '--first-parent', '-50', '--format=%s']) || '').split('\n').filter(Boolean),
  };
  const laatsteRelease = releases[0]?.versie || null;
  const versie = { app: pkg.version || git.tags[0] || null, laatsteReleaseCommit: laatsteRelease, apk: apkMeta?.version || null, apkBytes: apkMeta?.bytes || null };
  if (versie.app && versie.apk && versie.app !== versie.apk) signaal('rood', 'versie', `App-versie ${versie.app} en gepubliceerde build ${versie.apk} lopen uiteen`, 'cockpit', { soort: 'versie-app' });
  if (pkg.version && laatsteRelease && pkg.version !== laatsteRelease) signaal('oranje', 'versie', `package.json zegt ${pkg.version}, de laatste release-commit ${laatsteRelease}`, 'cockpit', { soort: 'versie-package' });

  // ---------- documenten ----------
  const docSoort = (f) => (/\.md$/.test(f) ? 'markdown' : /\.docx?$/.test(f) ? 'Word' : /\.xlsx?$/.test(f) ? 'Excel' : /\.pptx?$/.test(f) ? 'PowerPoint' : /\.pdf$/.test(f) ? 'PDF' : /\.mp4$/.test(f) ? 'video' : /\.(png|jpe?g|svg)$/.test(f) ? 'afbeelding' : /\.html$/.test(f) ? 'HTML' : /\.json$/.test(f) ? 'JSON' : 'overig');
  const docGroep = (f) => (/handleiding|manual|guide/i.test(f) ? 'Handleidingen' : /zakelijk|business|legal/i.test(f) ? 'Zakelijk' : /design/i.test(f) ? 'Design' : /promo/i.test(f) ? 'Promo' : /README|TESTING|CONTRIBUTING/i.test(f) ? 'Leeswijzers' : 'Overig');
  const docKandidaten = tracked.filter((f) => (docsDir && f.startsWith(docsDir + '/') && !/\/(plannen|onderzoek)\//.test(f) && !/\.(plan|beslis)\.md$/.test(f) && !/plan-beslis-index/.test(f) && !/screenshots\//.test(f) && !/\/dashboard\//.test(f)) || /^([^/]+\/)?(README|TESTING|CONTRIBUTING)\.md$/i.test(f));
  const documenten = docKandidaten.map((f) => {
    let bytes = null;
    try { bytes = fs.statSync(path.join(ROOT, f)).size; } catch { /* weg */ }
    const md = /\.md$/.test(f) && bytes != null && bytes < 600000 ? lees(f) : null;
    return { pad: f, soort: docSoort(f), groep: docGroep(f), bytes, git: gitFile(f), titel: md ? /^# (.+)$/m.exec(md)?.[1] || path.basename(f) : path.basename(f), md };
  });

  let sync = null;
  if (plan?.syncDocs && docsDir && bestaat(docsDir)) { try { sync = plan.syncDocs(path.join(ROOT, docsDir), { dryRun: true }); } catch (e) { sync = { fout: e.message }; } }

  const naam = /^# (.+?)(?:\s*[\u2014:-]\s*(?:CLAUDE\.md|Project Root))?\s*$/m.exec(claudeMd)?.[1]?.trim() || pkg.name || path.basename(HOOFD);
  const overzicht = (sectie(claudeMd, /^## (Project Overview|Projectoverzicht|Kern-invariant)/i) || '').split('\n\n')[0] || null;
  const linkBasis = o.linkBasis || (modus === 'ci' && ghRepo ? `https://github.com/${ghRepo}/blob/${hoofdtak}/` : pathToFileURL(ROOT + path.sep).href);
  return {
    schema: 1, gegenereerd: nu.toISOString(), modus, linkBasis,
    project: { naam, map: path.basename(HOOFD), repo: ghRepo, remote, kernInvariant: overzicht && !/^\{\{/.test(overzicht) ? overzicht : null },
    bron, versie, signalen,
    laag1: { claude: { pad: 'CLAUDE.md', bytes: Buffer.byteLength(claudeMd), regels: claudeMd ? claudeMd.split('\n').length : 0, markering, secties: claudeSecties, md: claudeMd }, verwijzingen, vereisten, ontwerp },
    laag2: { index: { pad: `${memDir}/MEMORY.md`, regels: indexLinks.length, md: memIndex, inGit: isGit && trackedSet.has(`${memDir}/MEMORY.md`) }, memories, problemen: memProblemen, buitenRepo: memBuitenRepo },
    laag3: { docsDir, index: docsDir ? lees(`${docsDir}/plan-beslis-index.md`) : null, plannen, ouderePlannen, onderzoek, sync, planScriptBeschikbaar: !!plan },
    laag4: { tests: { lagen, bewaking, nietInCi: ci.laatsteRun?.perBestand?.length ? nietInCi : null, configs: tracked.filter((f) => /(vitest|jest|playwright|pytest|cypress).*\.(c|m)?[jt]s$|pytest\.ini$/.test(f)) }, ci, workflows, hooks, hooksPath, skills, scripts: pkg.scripts || {}, deps, migraties },
    laag5: { worktrees, takken, launch, addendum },
    git, documenten, screenshots: tracked.filter((f) => /screenshots\//.test(f)).length,
  };
}

/** Bestanden van een map zonder git, zonder node_modules en verborgen mappen, als relatieve paden. */
function lijstBestanden(root, sub = '', uit = []) {
  let items = [];
  try { items = fs.readdirSync(path.join(root, sub), { withFileTypes: true }); } catch { return uit; }
  for (const d of items) {
    if (d.name === 'node_modules' || (d.name.startsWith('.') && d.name !== '.github' && d.name !== '.githooks')) continue;
    const rel = sub ? `${sub}/${d.name}` : d.name;
    if (d.isDirectory()) { if (uit.length < 20000) lijstBestanden(root, rel, uit); } else uit.push(rel);
  }
  return uit;
}
