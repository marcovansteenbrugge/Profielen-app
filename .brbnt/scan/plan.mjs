#!/usr/bin/env node
// brbnt-plan: deterministische controles voor plan- en beslisdocumenten.
//
//   node plan.mjs preflight [projectroot] [--docs <pad>] [--json]
//   node plan.mjs poort <naam> <fase> [docsdir] [--json]
//   node plan.mjs sync [docsdir] [--dry-run]
//   node plan.mjs meet --van <ISO> --tot <ISO> [--sessie <id>] [--projectdir <dir>] [--transcriptdir <dir>] [--json]
//   node plan.mjs help
//
// Alleen ingebouwde Node-modules. Alle functies zijn geexporteerd zodat de tests ze direct kunnen aanroepen.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXIT_OK = 0;
export const EXIT_FOUT = 1;
export const EXIT_GEBLOKKEERD = 2;
export const EXIT_PREFLIGHT = 3;

// ---------------------------------------------------------------------------
// Tekst-hulpjes
// ---------------------------------------------------------------------------

export const stripVS = (s) => s.replace(/\uFE0F/g, '');
export const cleanCell = (s) => s.replace(/\*\*/g, '').trim();
export const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const bare = (line) => line.replace(/\r$/, '');
export const splitLines = (text) => text.split('\n');
const startsWithGlyph = (cell, glyph) => stripVS(cleanCell(cell)).startsWith(stripVS(glyph));
const upper = (s) => s.toUpperCase();

function ids(cell, letter) {
  const alle = (cell || '').match(/\b[FB]\d+\b/gi) || [];
  const hoofd = alle.map(upper);
  return letter ? hoofd.filter((x) => x.startsWith(letter)) : hoofd;
}

const sorteerId = (a, b) => Number(a.slice(1)) - Number(b.slice(1));

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export function findFrontmatter(lines) {
  const streepjes = [];
  for (let i = 0; i < lines.length && streepjes.length < 2; i++) {
    if (bare(lines[i]).trim() === '---') streepjes.push(i);
  }
  return streepjes.length === 2 ? { start: streepjes[0], end: streepjes[1] } : null;
}

function splitComment(rest) {
  const m = /(^|\s+)#.*$/.exec(rest);
  return m ? { value: rest.slice(0, m.index), comment: m[0] } : { value: rest, comment: '' };
}

function unquote(s) {
  const t = s.trim();
  const quoted = t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0];
  return quoted ? t.slice(1, -1) : t;
}

function parseValue(raw) {
  const v = raw.trim();
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(unquote).filter((x) => x !== '');
  }
  return unquote(v);
}

export function parseFrontmatter(text) {
  const lines = splitLines(text);
  const fm = findFrontmatter(lines);
  const result = {};
  if (!fm) return result;
  for (let i = fm.start + 1; i < fm.end; i++) {
    const m = /^([A-Za-z0-9_-]+):(.*)$/.exec(bare(lines[i]));
    if (m) result[m[1]] = parseValue(splitComment(m[2]).value);
  }
  return result;
}

/** Zet een frontmatter-waarde, met behoud van een eventueel commentaar erachter. Geeft 'gewijzigd', 'gelijk' of 'ontbreekt'. */
export function setFrontmatterValue(lines, key, newValue) {
  const fm = findFrontmatter(lines);
  if (!fm) return 'ontbreekt';
  const sleutel = new RegExp(`^(\\s*${key}:)(\\s*)(.*)$`);
  for (let i = fm.start + 1; i < fm.end; i++) {
    const cr = lines[i].endsWith('\r') ? '\r' : '';
    const m = sleutel.exec(bare(lines[i]));
    if (!m) continue;
    const { value, comment } = splitComment(m[3]);
    if (value.trim() === newValue) return 'gelijk';
    const spatie = m[2] === '' || (value === '' && comment.startsWith('#')) ? ' ' : m[2];
    const commentSpatie = comment.startsWith('#') ? ' ' : '';
    lines[i] = `${m[1]}${spatie}${newValue}${commentSpatie}${comment}${cr}`;
    return 'gewijzigd';
  }
  return 'ontbreekt';
}

// ---------------------------------------------------------------------------
// Tabellen
// ---------------------------------------------------------------------------

const isTableLine = (l) => l.trim().startsWith('|');
const isSeparator = (l) => l.includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(l);

function rowParts(line) {
  const m = /^(\s*\|)(.*?)(\|?\s*)$/.exec(line);
  const body = m ? m[2] : line;
  return { voor: m ? m[1] : '|', delen: body.split(/(?<!\\)\|/), na: m ? m[3] : '|' };
}

export function splitRow(line) {
  return rowParts(line).delen.map(cleanCell);
}

/** Vind de eerste tabel onder een kopje. Stopt bij het volgende kopje van niveau 1-2. */
export function readTable(lines, headingRe) {
  const kop = lines.findIndex((l) => headingRe.test(bare(l)));
  if (kop === -1) return null;
  let i = kop + 1;
  for (; i < lines.length; i++) {
    const l = bare(lines[i]);
    if (/^#{1,2}\s/.test(l)) return null;
    if (isTableLine(l)) break;
  }
  if (i >= lines.length || !isSeparator(bare(lines[i + 1] ?? ''))) return null;
  const headers = splitRow(bare(lines[i]));
  const rows = [];
  for (let j = i + 2; j < lines.length && isTableLine(bare(lines[j])); j++) {
    rows.push({ line: j, cells: splitRow(bare(lines[j])) });
  }
  return { headers, rows };
}

/** Kolom zoeken op kopjestekst (hoofdletter- en accentongevoelig): eerst exact, dan begint-met. */
export function findCol(headers, name, { exact = false } = {}) {
  const gezocht = norm(name);
  const h = headers.map(norm);
  const exactIdx = h.indexOf(gezocht);
  if (exactIdx !== -1 || exact || gezocht === '') return exactIdx;
  return h.findIndex((x) => x.startsWith(gezocht));
}

/** Vervang een cel in een tabelrij, de rest van de regel blijft byte-voor-byte gelijk. */
export function replaceCell(line, index, newText) {
  const cr = line.endsWith('\r') ? '\r' : '';
  const { voor, delen, na } = rowParts(bare(line));
  delen[index] = ` ${newText} `;
  return `${voor}${delen.join('|')}${na}${cr}`;
}

const cell = (row, idx) => (idx >= 0 && idx < row.cells.length ? row.cells[idx] : '');

// ---------------------------------------------------------------------------
// Document-model: plan en beslisdocument
// ---------------------------------------------------------------------------

const FASE_RE = /^##\s+(\d+\.\s*)?Fasering/i;
const VRIJGAVE_RE = /^##\s+(\d+\.\s*)?Vrijgave per fase/i;
const BESLUITEN_RE = /^##\s+(\d+\.\s*)?Overzicht besluiten/i;
const LOG_RE = /^##\s+(\d+\.\s*)?Wijzigingslog/i;

export function parsePlan(text) {
  const lines = splitLines(text);
  const fm = parseFrontmatter(text);
  const fases = [];
  const faseTab = readTable(lines, FASE_RE);
  if (faseTab) {
    const cFase = findCol(faseTab.headers, 'Fase', { exact: true });
    const cStatus = findCol(faseTab.headers, 'Status', { exact: true });
    const cHangt = findCol(faseTab.headers, 'Hangt af van');
    for (const row of faseTab.rows) {
      const id = upper(cell(row, cFase));
      if (!/^F\d+$/.test(id)) continue;
      const hangt = cell(row, cHangt);
      fases.push({ id, regel: row.line, statusKolom: cStatus, statusTekst: cell(row, cStatus), deps: { b: ids(hangt, 'B'), f: ids(hangt, 'F').filter((f) => f !== id) } });
    }
  }
  const log = [];
  const logTab = readTable(lines, LOG_RE);
  if (logTab) {
    const cVersie = findCol(logTab.headers, 'Versie', { exact: true });
    const cGeraakt = findCol(logTab.headers, 'Geraakt');
    for (const row of logTab.rows) {
      const versie = parseInt(cell(row, cVersie), 10);
      if (Number.isFinite(versie)) log.push({ versie, geraakt: new Set(ids(cell(row, cGeraakt))) });
    }
  }
  const fmVersie = parseInt(fm.versie, 10);
  const versies = [...log.map((r) => r.versie), ...(Number.isFinite(fmVersie) ? [fmVersie] : [])];
  return { lines, fm, fases, log, huidigeVersie: versies.length ? Math.max(...versies) : 1 };
}

const TIJD_RE = /\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?/;

export function parseBeslis(text) {
  const lines = splitLines(text);
  const fm = parseFrontmatter(text);
  const vrijgaves = new Map();
  const vTab = readTable(lines, VRIJGAVE_RE);
  if (vTab) {
    const c = {
      fase: findCol(vTab.headers, 'Fase', { exact: true }),
      vrijgave: findCol(vTab.headers, 'Vrijgave', { exact: true }),
      door: findCol(vTab.headers, 'Door'),
      leunt: findCol(vTab.headers, 'Leunt op'),
      gebouwd: findCol(vTab.headers, 'Gebouwd', { exact: true }),
    };
    for (const row of vTab.rows) {
      const id = upper(cell(row, c.fase));
      if (!/^F\d+$/.test(id)) continue;
      const vrijgave = cell(row, c.vrijgave);
      const door = cell(row, c.door);
      const gebouwd = cell(row, c.gebouwd);
      const versie = /planversie\s+(\d+)/i.exec(vrijgave);
      const tijd = TIJD_RE.exec(door);
      vrijgaves.set(id, {
        glyphOk: startsWithGlyph(vrijgave, '✅'),
        planversie: versie ? Number(versie[1]) : null,
        doorOk: door !== '' && door !== '-',
        tijd: tijd ? tijd[0].replace('T', ' ') : null,
        leuntOp: ids(cell(row, c.leunt), 'B'),
        gebouwd: startsWithGlyph(gebouwd, '✅') ? 'ja' : startsWithGlyph(gebouwd, '🔨') ? 'lopend' : 'nee',
      });
    }
  }
  const besluiten = new Map();
  const bTab = readTable(lines, BESLUITEN_RE);
  if (bTab) {
    const gl = findCol(bTab.headers, '');
    const cGlyph = gl === -1 ? 0 : gl;
    const cNr = findCol(bTab.headers, '#', { exact: true });
    const cBesluit = findCol(bTab.headers, 'Besluit', { exact: true });
    for (const row of bTab.rows) {
      const id = upper(cell(row, cNr));
      if (!/^B\d+$/.test(id)) continue;
      const glyphTekst = stripVS(cell(row, cGlyph));
      const besluitTekst = cell(row, cBesluit);
      const besloten = glyphTekst.startsWith('✅') || glyphTekst.startsWith('✏') || /vervallen/i.test(besluitTekst);
      besluiten.set(id, { besloten, glyph: glyphTekst || 'onbekend' });
    }
  }
  return { lines, fm, vrijgaves, besluiten };
}

// ---------------------------------------------------------------------------
// Status-berekening
// ---------------------------------------------------------------------------

const heeftWaarde = (v) => typeof v === 'string' && v.trim() !== '' && v.trim() !== '-';

/** Welke wijzigingslog-rijen maken de vrijgave van fase `fase` ongeldig? */
export function vervallenDoor(fase, planversie, plan) {
  if (planversie == null) return [];
  const relevant = new Set([fase.id, ...fase.deps.b]);
  return plan.log.filter((r) => r.versie > planversie && [...r.geraakt].some((g) => relevant.has(g)));
}

/** Beoordeel de vrijgave van een fase: is er een volledige vrijgave, en is die nog geldig? */
export function beoordeelVrijgave(fase, vr, plan) {
  if (!vr) return { aanwezig: false, gegeven: false, probleem: 'niet', vervallen: [], geldig: false };
  let probleem = null;
  if (!vr.glyphOk) probleem = 'niet';
  else if (vr.planversie == null) probleem = 'planversie';
  else if (!vr.doorOk) probleem = 'door';
  const gegeven = probleem === null;
  const vervallen = gegeven ? vervallenDoor(fase, vr.planversie, plan) : [];
  return { aanwezig: true, gegeven, probleem, vervallen, geldig: gegeven && vervallen.length === 0 };
}

const FASE_TEKST = {
  gebouwd: '✅ gebouwd',
  lopend: '🔨 lopend',
  vrijgegeven: '▶ vrijgegeven',
  vervallen: '⚠ vrijgave vervallen',
  niet: '○ niet vrijgegeven',
};

function beoordeelFase(fase, plan, beslis) {
  if (!beslis) return { id: fase.id, soort: 'niet', tekst: FASE_TEKST.niet, openB: [], vrijgave: beoordeelVrijgave(fase, null, plan) };
  const vr = beslis.vrijgaves.get(fase.id);
  const vrijgave = beoordeelVrijgave(fase, vr, plan);
  const openB = fase.deps.b.filter((b) => !beslis.besluiten.get(b)?.besloten);
  const basis = { id: fase.id, openB, vrijgave, tijd: vr?.tijd ?? null };
  const soort = (s, tekst = FASE_TEKST[s]) => ({ ...basis, soort: s, tekst });
  if (vr?.gebouwd === 'ja') return soort('gebouwd');
  if (vr?.gebouwd === 'lopend') return soort('lopend');
  if (vrijgave.geldig && openB.length === 0) return soort('vrijgegeven');
  if (openB.length > 0) return soort('wacht', `⏳ wacht op ${openB.join(', ')}`);
  if (vrijgave.gegeven && vrijgave.vervallen.length > 0) return soort('vervallen');
  return soort('niet');
}

const GLYPH_VAN = { gebouwd: '✅', lopend: '🔨', vrijgegeven: '▶', wacht: '⏳', vervallen: '⚠', niet: '○' };

function bepaalPlanStatus(plan, beslis, fases) {
  const handmatig = String(plan.fm.status_handmatig ?? '').trim();
  if (handmatig === 'geparkeerd' || handmatig === 'vervallen') return handmatig;
  if (fases.length === 0) return 'concept';
  if (fases.every((f) => f.soort === 'gebouwd')) return heeftWaarde(plan.fm.afgesloten) ? 'afgerond' : 'gebouwd';
  if (fases.some((f) => f.soort === 'gebouwd' || f.soort === 'lopend')) return 'in-uitvoering';
  if (fases.every((f) => f.vrijgave.geldig)) return 'vrijgegeven';
  if (fases.some((f) => f.vrijgave.geldig)) return 'deels-vrijgegeven';
  if (beslis && heeftWaarde(beslis.fm.voorgelegd)) return 'ter-akkoord';
  return 'concept';
}

/** "B4 (vóór F3)": open besluiten die een nog niet gebouwde fase blokkeren, plus "vrijgave F3" als alleen de vrijgave nog ontbreekt. */
function wachtOpJou(plan, fases) {
  const perFase = new Map();
  const gezien = new Set();
  const vrijgaveNodig = [];
  for (const f of fases) {
    if (f.soort === 'gebouwd') continue;
    const nieuw = f.openB.filter((b) => !gezien.has(b));
    nieuw.forEach((b) => gezien.add(b));
    if (nieuw.length) perFase.set(f.id, nieuw);
    if (f.openB.length === 0 && f.wachtOpFase.length === 0 && (f.soort === 'niet' || f.soort === 'vervallen')) vrijgaveNodig.push(`vrijgave ${f.id}`);
  }
  const groepen = [...perFase].map(([id, bs]) => `${bs.sort(sorteerId).join(', ')} (vóór ${id})`);
  const alles = [...groepen, ...vrijgaveNodig];
  return alles.length ? alles.join(', ') : '-';
}

/** "F0 t/m F2, 2026-09-19": aaneengesloten fasen met een geldige vrijgave, plus de datum van de laatste vrijgave. */
function laatstVrijgegeven(fases) {
  const groepen = [];
  let huidige = [];
  for (const f of fases) {
    if (f.vrijgave.geldig) huidige.push(f.id);
    else if (huidige.length) { groepen.push(huidige); huidige = []; }
  }
  if (huidige.length) groepen.push(huidige);
  if (groepen.length === 0) return '-';
  const tekst = groepen.map((g) => (g.length === 1 ? g[0] : `${g[0]} t/m ${g[g.length - 1]}`)).join(', ');
  const tijden = fases.filter((f) => f.vrijgave.geldig && f.tijd).map((f) => f.tijd).sort();
  return tijden.length ? `${tekst}, ${tijden[tijden.length - 1].slice(0, 10)}` : tekst;
}

/** Alles wat sync en de index nodig hebben, berekend uit de twee documenten. `beslisText` mag null zijn. */
export function evaluate(planText, beslisText) {
  const plan = parsePlan(planText);
  const beslis = beslisText == null ? null : parseBeslis(beslisText);
  const fases = plan.fases.map((f) => beoordeelFase(f, plan, beslis));
  const soortVan = new Map(fases.map((f) => [f.id, f.soort]));
  plan.fases.forEach((pf, i) => {
    const ongebouwd = pf.deps.f.filter((d) => soortVan.get(d) !== 'gebouwd');
    fases[i].wachtOpFase = ongebouwd;
    if (fases[i].soort === 'vrijgegeven' && ongebouwd.length) fases[i].tekst = `▶ vrijgegeven, na ${ongebouwd.join(', ')}`;
  });
  return {
    plan,
    beslis,
    fases,
    status: bepaalPlanStatus(plan, beslis, fases),
    voortgang: fases.length ? fases.map((f) => `${f.id} ${GLYPH_VAN[f.soort]}`).join(' · ') : '-',
    wacht: beslis ? wachtOpJou(plan, fases) : '-',
    laatst: laatstVrijgegeven(fases),
  };
}

export function beslisserNaam(plan, beslis) {
  const bron = plan.fm.beslisser || beslis?.fm.beslisser || '';
  return String(bron).replace(/\s*\(.*\)\s*$/, '').trim();
}

// ---------------------------------------------------------------------------
// Bestanden en mappen
// ---------------------------------------------------------------------------

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const leesTekst = (p) => fs.readFileSync(p, 'utf8');

/** De projectroot vanaf `start` omhoog: de eerste map met een CLAUDE.md of een .git. Geeft null als die er niet is. */
export function vindProjectroot(start) {
  let dir = path.resolve(start);
  for (let stap = 0; stap < 12; stap++) {
    if (isFile(path.join(dir, 'CLAUDE.md')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const ouder = path.dirname(dir);
    if (ouder === dir) break;
    dir = ouder;
  }
  return null;
}

/**
 * Docs-map bepalen: expliciet pad, anders `docs`, anders `app/docs` (relatief aan `basis`).
 * Met `omhoog` zoekt hij ook in de mappen boven `basis`, maar nooit voorbij de projectroot
 * (zonder projectroot wordt alleen `basis` zelf bekeken). Geeft null als niets bestaat.
 */
export function resolveDocsDir(basis, expliciet, { omhoog = false } = {}) {
  if (expliciet) {
    const p = path.resolve(basis, expliciet);
    return isDir(p) ? p : null;
  }
  const start = path.resolve(basis);
  const grens = omhoog ? vindProjectroot(start) : null;
  let dir = start;
  for (let stap = 0; stap < 12; stap++) {
    // Sta je in de docs-map zelf (met plannen erin), dan is dat de docs-map.
    if (omhoog && path.basename(dir) === 'docs' && fs.readdirSync(dir).some((f) => f.endsWith('.plan.md'))) return dir;
    for (const kandidaat of ['docs', path.join('app', 'docs')]) {
      const p = path.resolve(dir, kandidaat);
      if (isDir(p)) return p;
    }
    if (!omhoog || !grens || dir === grens) break;
    const ouder = path.dirname(dir);
    if (ouder === dir) break;
    dir = ouder;
  }
  return null;
}

// ---------------------------------------------------------------------------
// preflight
// ---------------------------------------------------------------------------

const SETUP_ACTIE = 'Draai de skill `brbnt-project-setup` om CLAUDE.md, de sectie "Plan en besluit" en de docs-map in te richten.';

// De actie past bij wat er ontbreekt: een bestaand CLAUDE.md wordt bijgewerkt, niet opnieuw ingericht.
function setupActie({ heeftClaude, heeftSectie, docsMap }) {
  if (!heeftClaude) return SETUP_ACTIE;
  const delen = [];
  if (!heeftSectie) delen.push('de sectie "Plan en besluit" aan CLAUDE.md toe te voegen');
  if (!docsMap) delen.push('de docs-map aan te maken');
  return `Draai de skill \`brbnt-project-setup\` om ${delen.join(' en ')}; de rest van CLAUDE.md blijft ongemoeid.`;
}

export function preflight(projectroot, { docs } = {}) {
  const root = path.resolve(projectroot);
  const claudePad = path.join(root, 'CLAUDE.md');
  const heeftClaude = isFile(claudePad);
  const tekst = heeftClaude ? leesTekst(claudePad) : '';
  const marker = /brbnt-plan-regel:\s*(v\d+)/i.exec(tekst);
  // De markering wint van de kop: setup mag de kop vertalen naar de taal van het bestand.
  const heeftSectie = Boolean(marker) || /^#{1,3}\s+.*(Plan en besluit|Plan and decision)/im.test(tekst);
  const docsMap = resolveDocsDir(root, docs);

  const ontbrekend = [];
  if (!heeftClaude) ontbrekend.push(`CLAUDE.md ontbreekt in ${root}`);
  else if (!heeftSectie) ontbrekend.push('CLAUDE.md heeft geen kopje "Plan en besluit"');
  if (!docsMap) ontbrekend.push(docs ? `docs-map ontbreekt: ${docs}` : 'docs-map ontbreekt (gezocht: docs en app/docs)');

  return {
    ok: ontbrekend.length === 0,
    claudeMd: heeftClaude,
    sectie: heeftSectie,
    regelVersie: marker ? marker[1].toLowerCase() : null,
    docsMap,
    ontbrekend,
    acties: ontbrekend.length ? [setupActie({ heeftClaude, heeftSectie, docsMap })] : [],
  };
}

function preflightTekst(r) {
  if (r.ok) {
    const regel = r.regelVersie ? `regelversie ${r.regelVersie}` : 'geen versiemarker `brbnt-plan-regel: vN` gevonden, dat is toegestaan';
    return [
      'Preflight OK: het project is klaar voor plan en besluit.',
      `- CLAUDE.md met kopje "Plan en besluit" (${regel})`,
      `- docs-map: ${r.docsMap}`,
    ].join('\n');
  }
  return ['Preflight mislukt. Wat ontbreekt:', ...r.ontbrekend.map((o) => `- ${o}`), ...r.acties.map((a) => `Actie: ${a}`)].join('\n');
}

// ---------------------------------------------------------------------------
// poort
// ---------------------------------------------------------------------------

export function normaliseerFase(invoer) {
  const t = String(invoer).trim().toUpperCase();
  return /^\d+$/.test(t) ? `F${t}` : t;
}

/**
 * De bouwpoort. planText/beslisText zijn null als het bestand ontbreekt.
 * Geeft { toegestaan, redenen, acties, waarschuwingen }; redenen[i] hoort bij acties[i].
 */
export function checkPoort(naam, faseInvoer, planText, beslisText) {
  const fase = normaliseerFase(faseInvoer);
  const redenen = [];
  const acties = [];
  const waarschuwingen = [];
  const blokkeer = (reden, actie) => { redenen.push(reden); acties.push(actie); };
  const klaar = () => ({ toegestaan: redenen.length === 0, redenen, acties, waarschuwingen });

  if (planText == null) {
    blokkeer(`Planbestand ${naam}.plan.md ontbreekt`, `Stel eerst het plan op met de skill brbnt-plan (${naam}.plan.md in de docs-map)`);
  }
  if (beslisText == null) {
    blokkeer(`Beslisdocument ${naam}.beslis.md ontbreekt`, `Maak ${naam}.beslis.md aan bij het plan en leg de besluiten voor aan de beslisser`);
  }
  if (planText == null || beslisText == null) return klaar();

  const plan = parsePlan(planText);
  const beslis = parseBeslis(beslisText);
  const beslisser = beslisserNaam(plan, beslis) || 'de beslisser';
  const f = plan.fases.find((x) => x.id === fase);
  if (!f) {
    blokkeer(`${fase} staat niet in de fasering van het plan`, `Controleer het fasenummer, of voeg ${fase} eerst toe aan het plan en vraag daarna vrijgave`);
    return klaar();
  }

  const vr = beslis.vrijgaves.get(fase);
  if (vr?.gebouwd === 'ja') {
    blokkeer(`${fase} is al gebouwd`, 'Kies een fase die nog niet gebouwd is');
    return klaar();
  }

  controleerVrijgave(fase, f, vr, plan, beslisser, blokkeer);
  controleerBesluiten(f, beslis, beslisser, blokkeer);
  controleerFaseAfhankelijkheden(f, beslis, blokkeer);

  if (vr) {
    const leunt = [...vr.leuntOp].sort(sorteerId).join(', ') || '-';
    const hangt = [...f.deps.b].sort(sorteerId).join(', ') || '-';
    if (leunt !== hangt) {
      waarschuwingen.push(`Het beslisdocument zegt dat ${fase} leunt op ${leunt}, het plan zegt ${hangt}. Trek beide gelijk.`);
    }
  }
  return klaar();
}

function controleerVrijgave(fase, f, vr, plan, beslisser, blokkeer) {
  const oordeel = beoordeelVrijgave(f, vr, plan);
  const vraagZin = `vrijgave voor ${fase} op planversie ${plan.huidigeVersie} aan ${beslisser}`;
  const vraag = `Vraag ${vraagZin}`;
  if (!oordeel.aanwezig) {
    blokkeer(`${fase} staat niet in "Vrijgave per fase" van het beslisdocument`, `Voeg ${fase} toe aan "Vrijgave per fase". ${vraag}`);
  } else if (oordeel.probleem === 'niet') {
    blokkeer(`${fase} is niet vrijgegeven`, vraag);
  } else if (oordeel.probleem === 'planversie') {
    blokkeer(`De vrijgave van ${fase} noemt geen planversie`, `Leg vast op welke planversie de vrijgave is gegeven. Twijfel je, vraag dan ${vraagZin}`);
  } else if (oordeel.probleem === 'door') {
    blokkeer(`De vrijgave van ${fase} zegt niet door wie en wanneer`, `Leg vast wie de vrijgave gaf en wanneer, of vraag ${vraagZin}`);
  } else if (oordeel.vervallen.length > 0) {
    const rij = oordeel.vervallen[0];
    const geraakt = [...rij.geraakt].filter((g) => g === fase || f.deps.b.includes(g)).join(', ');
    blokkeer(
      `De vrijgave van ${fase} (planversie ${vr.planversie}) is vervallen: planversie ${rij.versie} raakte ${geraakt}`,
      `Vraag opnieuw vrijgave voor ${fase} op planversie ${plan.huidigeVersie} aan ${beslisser}`,
    );
  }
}

function controleerBesluiten(f, beslis, beslisser, blokkeer) {
  for (const b of f.deps.b) {
    const besluit = beslis.besluiten.get(b);
    if (besluit?.besloten) continue;
    const stand = besluit ? `is nog niet genomen (${besluit.glyph})` : 'staat niet in "Overzicht besluiten"';
    blokkeer(`Besluit ${b} ${stand}`, `Leg besluit ${b} voor aan ${beslisser}`);
  }
}

function controleerFaseAfhankelijkheden(f, beslis, blokkeer) {
  for (const dep of f.deps.f) {
    if (beslis.vrijgaves.get(dep)?.gebouwd === 'ja') continue;
    blokkeer(`${dep} is nog niet gebouwd`, `Rond eerst ${dep} af`);
  }
}

function poortTekst(naam, fase, r) {
  const kop = r.toegestaan
    ? `TOEGESTAAN: ${fase} van ${naam} mag worden gebouwd.`
    : `GEBLOKKEERD: ${fase} van ${naam} mag nog niet worden gebouwd.`;
  const regels = [kop];
  r.redenen.forEach((reden, i) => {
    regels.push(`- Reden: ${reden}`, `  Actie: ${r.acties[i]}`);
  });
  r.waarschuwingen.forEach((w) => regels.push(`Waarschuwing: ${w}`));
  return regels.join('\n');
}

// ---------------------------------------------------------------------------
// sync en index
// ---------------------------------------------------------------------------

const PLAN_SUFFIX = '.plan.md';
const INDEX_NAAM = 'plan-beslis-index.md';

// ---------------------------------------------------------------------------
// toets: mag deze fase als gebouwd worden gemarkeerd?
// ---------------------------------------------------------------------------

const TOETS_RE = /^###\s+Toetsing per fase/i;

/** Oordeel uit een cel: 'gehaald', 'niet gehaald', 'niet toetsbaar' of 'onbekend' (glyphs voorop worden genegeerd). */
export function oordeelVan(celTekst) {
  const t = norm(celTekst).replace(/^[^a-z]+/, '');
  if (t.startsWith('niet gehaald')) return 'niet gehaald';
  if (t.startsWith('niet toetsbaar')) return 'niet toetsbaar';
  if (t.startsWith('gehaald')) return 'gehaald';
  return 'onbekend';
}

/**
 * De afrondingspoort. Een fase mag pas als gebouwd worden gemarkeerd als de laatste toetsing in punt 11
 * ("Toetsing per fase") voor elk vastgelegd criterium 'gehaald' zegt. Geeft { toegestaan, redenen, acties, waarschuwingen }.
 */
export function checkToets(naam, faseInvoer, planText) {
  const fase = normaliseerFase(faseInvoer);
  const redenen = [];
  const acties = [];
  const blokkeer = (reden, actie) => { redenen.push(reden); acties.push(actie); };
  const klaar = () => ({ toegestaan: redenen.length === 0, redenen, acties, waarschuwingen: [] });
  if (planText == null) {
    blokkeer(`Planbestand ${naam}.plan.md ontbreekt`, `Stel eerst het plan op met de skill brbnt-plan (${naam}.plan.md in de docs-map)`);
    return klaar();
  }
  const plan = parsePlan(planText);
  if (!plan.fases.some((x) => x.id === fase)) {
    blokkeer(`${fase} staat niet in de fasering van het plan`, 'Controleer het fasenummer');
    return klaar();
  }
  const tab = readTable(plan.lines, TOETS_RE);
  const cFase = tab ? findCol(tab.headers, 'Fase', { exact: true }) : -1;
  const cTijd = tab ? findCol(tab.headers, 'Tijdstip') : -1;
  const cCrit = tab ? findCol(tab.headers, 'Criterium') : -1;
  const cOordeel = tab ? findCol(tab.headers, 'Oordeel') : -1;
  const rijen = tab ? tab.rows.filter((r) => upper(cell(r, cFase)) === fase) : [];
  if (!tab || cOordeel === -1 || rijen.length === 0) {
    blokkeer(
      `Er is geen toetsing van ${fase} vastgelegd in punt 11 (Toetsing per fase)`,
      `Toets elk acceptatiecriterium van ${fase} afzonderlijk met bewijs en leg elk criterium vast als een rij in Toetsing per fase`,
    );
    return klaar();
  }
  // Alleen de laatste toetsing telt: de rijen met het laatste tijdstip (zonder tijdstippen: alle rijen).
  const laatste = cTijd === -1 ? '' : rijen.map((r) => cell(r, cTijd)).sort().at(-1);
  const actueel = cTijd === -1 ? rijen : rijen.filter((r) => cell(r, cTijd) === laatste);
  for (const r of actueel) {
    const oordeel = oordeelVan(cell(r, cOordeel));
    if (oordeel === 'gehaald') continue;
    const crit = cell(r, cCrit) || '(zonder omschrijving)';
    const reden = oordeel === 'onbekend'
      ? `Het oordeel bij "${crit}" is niet ingevuld als gehaald, niet gehaald of niet toetsbaar`
      : `Criterium "${crit}" is ${oordeel}`;
    const actie = oordeel === 'niet toetsbaar'
      ? 'Laat een mens het criterium beoordelen en leg dat vast, of pas het criterium aan via een planwijziging (stap E)'
      : 'Herstel het criterium, toets opnieuw en leg de nieuwe toetsing vast';
    blokkeer(reden, actie);
  }
  return klaar();
}

function toetsTekst(naam, fase, r) {
  const kop = r.toegestaan
    ? `TOEGESTAAN: ${fase} van ${naam} mag als gebouwd worden gemarkeerd.`
    : `GEBLOKKEERD: ${fase} van ${naam} mag nog niet als gebouwd worden gemarkeerd.`;
  const regels = [kop];
  r.redenen.forEach((reden, i) => { regels.push(`- Reden: ${reden}`, `  Actie: ${r.acties[i]}`); });
  return regels.join('\n');
}

function eolVan(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Herschrijf alleen status, voortgang en de Status-kolom van de fasering. */
export function updatePlanText(planText, ev) {
  const lines = splitLines(planText);
  const notities = [];
  for (const [sleutel, waarde] of [['status', ev.status], ['voortgang', ev.voortgang]]) {
    if (setFrontmatterValue(lines, sleutel, waarde) === 'ontbreekt') notities.push(`sleutel \`${sleutel}\` ontbreekt in de kop van het plan`);
  }
  for (const f of ev.plan.fases) {
    if (f.statusKolom < 0) continue;
    const gewenst = ev.fases.find((x) => x.id === f.id).tekst;
    if (cleanCell(f.statusTekst) !== gewenst) lines[f.regel] = replaceCell(lines[f.regel], f.statusKolom, gewenst);
  }
  return { tekst: lines.join('\n'), notities };
}

export function updateBeslisText(beslisText, status) {
  const lines = splitLines(beslisText);
  const notities = [];
  if (setFrontmatterValue(lines, 'status', status) === 'ontbreekt') notities.push('sleutel `status` ontbreekt in de kop van het beslisdocument');
  return { tekst: lines.join('\n'), notities };
}

const celTekst = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '-';

export function bouwIndex(rijen, eol = '\n') {
  const regels = [
    '# Index van plannen en beslisdocumenten',
    '',
    '> Wordt door de skill gegenereerd uit de kopgegevens van elk plan en beslisdocument, nooit met de hand bijgehouden.',
    '> Zoekvolgorde voor Claude: eerst deze index, dan het (korte) beslisdocument, en pas als er techniek nodig is het plan.',
    '> Legenda: ✅ gebouwd · 🔨 lopend · ▶ vrijgegeven · ⏳ wacht op besluit · ⚠ vrijgave vervallen · ○ nog niet vrijgegeven',
    '',
    '| Naam | Titel | Status | Voortgang per fase | Wacht op jou | Beslisser | Laatst vrijgegeven | Samenvatting | Trefwoorden |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rijen.map((r) => `| ${[r.naam, r.titel, r.status, r.voortgang, r.wacht, r.beslisser, r.laatst, r.samenvatting, r.trefwoorden].map(celTekst).join(' | ')} |`),
    '',
    '**Statussen** (berekend, nooit met de hand gezet): concept · ter-akkoord · deels-vrijgegeven · vrijgegeven · in-uitvoering · gebouwd · afgerond · geparkeerd · vervallen.',
    'Een plan is **deels-vrijgegeven** zodra minstens één fase mag starten terwijl andere fasen nog op een besluit wachten. Dat is een normale toestand, geen tussenstop: de vrijgegeven fasen kunnen al gebouwd worden.',
    '',
    '**Naamgeving:** `docs/<naam>.plan.md` en `docs/<naam>.beslis.md` (sorteren samen), index: `docs/plan-beslis-index.md`.',
    '',
  ];
  return regels.join(eol);
}

function indexRij(naam, ev) {
  const fm = ev.plan.fm;
  const trefwoorden = Array.isArray(fm.trefwoorden) ? fm.trefwoorden.join(', ') : fm.trefwoorden;
  return {
    naam,
    titel: fm.titel || naam,
    status: ev.status,
    voortgang: ev.voortgang,
    wacht: ev.wacht,
    beslisser: beslisserNaam(ev.plan, ev.beslis),
    laatst: ev.laatst,
    samenvatting: fm.samenvatting,
    trefwoorden,
  };
}

/** Werk alle plannen in `docsDir` bij en schrijf de index. Bij dryRun wordt niets geschreven. */
export function syncDocs(docsDir, { dryRun = false } = {}) {
  const planBestanden = fs.readdirSync(docsDir).filter((f) => f.endsWith(PLAN_SUFFIX)).sort();
  const rijen = [];
  const gewijzigd = [];
  const notities = [];
  let eol = null;

  const schrijfAlsAnders = (pad, oud, nieuw) => {
    if (oud === nieuw) return;
    gewijzigd.push(path.basename(pad));
    if (!dryRun) fs.writeFileSync(pad, nieuw, 'utf8');
  };

  for (const bestand of planBestanden) {
    const naam = bestand.slice(0, -PLAN_SUFFIX.length);
    const planPad = path.join(docsDir, bestand);
    const beslisPad = path.join(docsDir, `${naam}.beslis.md`);
    const planTekst = leesTekst(planPad);
    const beslisTekst = isFile(beslisPad) ? leesTekst(beslisPad) : null;
    eol ??= eolVan(planTekst);

    const ev = evaluate(planTekst, beslisTekst);
    const plan = updatePlanText(planTekst, ev);
    schrijfAlsAnders(planPad, planTekst, plan.tekst);
    plan.notities.forEach((n) => notities.push(`${bestand}: ${n}`));
    if (beslisTekst != null) {
      const beslis = updateBeslisText(beslisTekst, ev.status);
      schrijfAlsAnders(beslisPad, beslisTekst, beslis.tekst);
      beslis.notities.forEach((n) => notities.push(`${naam}.beslis.md: ${n}`));
    }
    rijen.push(indexRij(naam, ev));
  }

  const indexPad = path.join(docsDir, INDEX_NAAM);
  const oudIndex = isFile(indexPad) ? leesTekst(indexPad) : '';
  const nieuwIndex = bouwIndex(rijen, oudIndex ? eolVan(oudIndex) : eol ?? '\n');
  schrijfAlsAnders(indexPad, oudIndex, nieuwIndex);
  return { rijen, gewijzigd, notities };
}

function syncTekst(docsDir, r, dryRun) {
  const regels = [`Sync van ${docsDir}${dryRun ? ' (droogloop, er wordt niets geschreven)' : ''}`, ''];
  if (r.rijen.length === 0) regels.push('Geen *.plan.md gevonden.');
  else {
    regels.push('Naam | Status | Voortgang | Wacht op jou');
    r.rijen.forEach((x) => regels.push(`${x.naam} | ${x.status} | ${x.voortgang} | ${x.wacht}`));
  }
  regels.push('');
  if (r.gewijzigd.length === 0) regels.push('Niets aangepast: alles was al actueel.');
  else regels.push(`${dryRun ? 'Zou aanpassen' : 'Aangepast'}: ${r.gewijzigd.join(', ')}`);
  r.notities.forEach((n) => regels.push(`Let op: ${n}`));
  return regels.join('\n');
}

// ---------------------------------------------------------------------------
// meet: werkinterval meten uit het Claude Code-transcript
// ---------------------------------------------------------------------------

const ONBEKEND = 'onbekend';

export const slugVan = (p) => p.replace(/[^a-zA-Z0-9]/g, '-');

export function defaultTranscriptDir(projectdir) {
  return path.join(os.homedir(), '.claude', 'projects', slugVan(path.resolve(projectdir)));
}

/** Kies het transcriptbestand: opgegeven sessie, anders het nieuwste *.jsonl. Geeft null als er niets is. */
export function kiesTranscript(dir, sessie) {
  if (sessie) {
    const naam = sessie.endsWith('.jsonl') ? sessie : `${sessie}.jsonl`;
    const pad = path.join(dir, naam);
    return isFile(pad) ? pad : null;
  }
  if (!isDir(dir)) return null;
  const kandidaten = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ pad: path.join(dir, f), tijd: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.tijd - a.tijd);
  return kandidaten.length ? kandidaten[0].pad : null;
}

export function parseJsonl(text) {
  const records = [];
  let onleesbaar = 0;
  for (const regel of text.split('\n')) {
    if (regel.trim() === '') continue;
    try {
      const o = JSON.parse(regel);
      if (o && typeof o === 'object' && !Array.isArray(o)) records.push(o);
      else onleesbaar++;
    } catch {
      onleesbaar++;
    }
  }
  return { records, onleesbaar };
}

/** Meest voorkomende tekstwaarde, plus de verdeling. Geen waarden -> ONBEKEND. */
function meestVoorkomend(waarden) {
  const teller = new Map();
  for (const w of waarden) if (typeof w === 'string' && w.trim() !== '') teller.set(w, (teller.get(w) ?? 0) + 1);
  if (teller.size === 0) return { waarde: ONBEKEND, verdeling: [] };
  const verdeling = [...teller].sort((a, b) => b[1] - a[1]);
  return { waarde: verdeling[0][0], verdeling };
}

const effortVan = (r) => (typeof r.effort === 'string' ? r.effort : typeof r.perTurnEffort === 'string' ? r.perTurnEffort : null);
const isGetal = (x) => typeof x === 'number' && Number.isFinite(x);

/** Laatste record per message.id; records zonder id blijven allemaal staan. */
function ontdubbel(records) {
  const perId = new Map();
  const zonderId = [];
  for (const r of records) {
    const id = r.message.id;
    if (typeof id === 'string' && id !== '') perId.set(id, r);
    else zonderId.push(r);
  }
  return [...perId.values(), ...zonderId];
}

function verdelingTekst(naam, meting) {
  if (meting.verdeling.length < 2) return null;
  return `${naam} wisselde (${meting.verdeling.map(([w, n]) => `${w}: ${n}`).join(', ')}); meest voorkomende genomen.`;
}

/**
 * Meet [van, tot] (ms sinds epoch) over de transcript-records. Nooit een schatting: onbekend blijft "onbekend".
 * `sessie` is de sessie-id (uit de bestandsnaam).
 */
export function meetRecords(records, van, tot, sessie) {
  const opmerkingen = ['Tokens zijn invoer en uitvoer zonder cache.'];
  const assistant = records.filter((r) => r.type === 'assistant' && r.message && typeof r.message === 'object');
  const zijspoor = assistant.filter((r) => r.isSidechain === true);
  if (zijspoor.length > 0) opmerkingen.push('Sub-agents (zijspoor-records) zijn niet meegeteld.');

  const echt = assistant.filter((r) => r.isSidechain !== true && r.message.model !== '<synthetic>');
  const zonderTijd = echt.filter((r) => !Number.isFinite(Date.parse(r.timestamp)));
  if (zonderTijd.length > 0) opmerkingen.push(`${zonderTijd.length} record(s) zonder leesbaar tijdstip overgeslagen.`);
  const inInterval = ontdubbel(echt).filter((r) => {
    const t = Date.parse(r.timestamp);
    return Number.isFinite(t) && t >= van && t <= tot;
  });

  const model = meestVoorkomend(inInterval.map((r) => r.message.model));
  const effort = meestVoorkomend(inInterval.map(effortVan));
  const versie = meestVoorkomend(inInterval.map((r) => r.version));
  for (const [naam, m] of [['Model', model], ['Effort', effort], ['Versie', versie]]) {
    const t = verdelingTekst(naam, m);
    if (t) opmerkingen.push(t);
  }

  const { tokensIn, tokensOut } = somTokens(inInterval, opmerkingen);
  if (inInterval.length === 0) opmerkingen.push('Geen assistent-berichten gevonden in dit interval.');

  return {
    sessie: sessie || ONBEKEND,
    model: model.waarde,
    effort: effort.waarde,
    tokensIn,
    tokensOut,
    versie: versie.waarde,
    berichten: inInterval.length,
    bron: `transcript (Claude Code ${versie.waarde})`,
    opmerking: opmerkingen.join(' '),
  };
}

function somTokens(records, opmerkingen) {
  if (records.length === 0) return { tokensIn: ONBEKEND, tokensOut: ONBEKEND };
  const som = (veld) => {
    const waarden = records.map((r) => r.message.usage?.[veld]);
    if (!waarden.every(isGetal)) {
      opmerkingen.push(`Niet elk bericht bevat ${veld}; die som is daarom onbekend.`);
      return ONBEKEND;
    }
    return waarden.reduce((a, b) => a + b, 0);
  };
  return { tokensIn: som('input_tokens'), tokensOut: som('output_tokens') };
}

export const puntGetal = (n) => (isGetal(n) ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ONBEKEND);

/** Meet vanuit een bestand; een ontbrekend of onleesbaar transcript geeft een resultaat vol "onbekend". */
export function meet({ van, tot, sessie, projectdir, transcriptdir }) {
  const dir = transcriptdir ? path.resolve(transcriptdir) : defaultTranscriptDir(projectdir ?? process.cwd());
  const pad = kiesTranscript(dir, sessie);
  if (!pad) {
    const leeg = meetRecords([], van, tot, sessie);
    leeg.opmerking = `Geen transcript gevonden in ${dir}${sessie ? ` voor sessie ${sessie}` : ''}. ${leeg.opmerking}`;
    return leeg;
  }
  let tekst = '';
  try {
    tekst = leesTekst(pad);
  } catch (e) {
    const leeg = meetRecords([], van, tot, path.basename(pad, '.jsonl'));
    leeg.opmerking = `Transcript niet te lezen (${e.code ?? 'fout'}). ${leeg.opmerking}`;
    return leeg;
  }
  const { records, onleesbaar } = parseJsonl(tekst);
  const resultaat = meetRecords(records, van, tot, path.basename(pad, '.jsonl'));
  if (onleesbaar > 0) resultaat.opmerking += ` ${onleesbaar} onleesbare regel(s) overgeslagen.`;
  return resultaat;
}

export function meetCellen(r) {
  const tokens = `${puntGetal(r.tokensIn)} / ${puntGetal(r.tokensOut)}`;
  return { effort: r.effort, tokens, bron: r.bron };
}

function meetTekst(r, van, tot) {
  const c = meetCellen(r);
  return [
    `Meting sessie ${r.sessie}, ${van} tot ${tot}`,
    `Model: ${r.model}`,
    `Effort: ${r.effort}`,
    `Claude Code-versie: ${r.versie}`,
    `Berichten: ${r.berichten}`,
    `Tokens invoer / uitvoer: ${c.tokens}`,
    `Opmerking: ${r.opmerking}`,
    '',
    'Plak in de tabel bij punt 11 (Uitvoering), kolommen Effort, Tokens invoer / uitvoer en Bron:',
    `| ${c.effort} | ${c.tokens} | ${c.bron} |`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `brbnt-plan: deterministische controles voor plan- en beslisdocumenten

Gebruik:
  node plan.mjs preflight [projectroot] [--docs <pad>] [--json]
      Controleert CLAUDE.md, het kopje "Plan en besluit" en de docs-map. Exit 0 = OK, exit 3 = iets ontbreekt.
  node plan.mjs poort <naam> <fase> [docsdir] [--json]
      De bouwpoort voor een fase. Exit 0 = TOEGESTAAN, exit 2 = GEBLOKKEERD (met reden en actie).
  node plan.mjs toets <naam> <fase> [docsdir] [--json]
      De afrondingspoort: mag de fase als gebouwd worden gemarkeerd? Alleen als de laatste toetsing in punt 11 (Toetsing per fase) elk criterium als gehaald vastlegt. Exit 0 = TOEGESTAAN, exit 2 = GEBLOKKEERD.
  node plan.mjs sync [docsdir] [--dry-run]
      Berekent status en voortgang, werkt kopgegevens en Status-kolom bij en schrijft plan-beslis-index.md.
  node plan.mjs meet --van <ISO> --tot <ISO> [--sessie <id>] [--projectdir <dir>] [--transcriptdir <dir>] [--json]
      Meet model, effort en tokens (zonder cache) van een werkinterval uit het Claude Code-transcript.
  node plan.mjs help

De docs-map is standaard "docs", anders "app/docs", gezocht vanaf de huidige map omhoog tot de projectroot (de map met CLAUDE.md of .git). Exit 1 betekent: verkeerd gebruik of onverwachte fout.`;

export function parseArgs(argv, { waarde = [], schakelaar = [] } = {}) {
  const positioneel = [];
  const vlaggen = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positioneel.push(a); continue; }
    const naam = a.slice(2);
    if (schakelaar.includes(naam)) vlaggen[naam] = true;
    else if (waarde.includes(naam)) {
      if (i + 1 >= argv.length) throw new Error(`--${naam} verwacht een waarde`);
      vlaggen[naam] = argv[++i];
    } else throw new Error(`Onbekende optie --${naam}`);
  }
  return { positioneel, vlaggen };
}

const uit = (code, stdout = '', stderr = '') => ({ code, stdout: stdout ? `${stdout}\n` : '', stderr: stderr ? `${stderr}\n` : '' });
const json = (obj) => JSON.stringify(obj, null, 2);

function cmdPreflight(argv) {
  const { positioneel, vlaggen } = parseArgs(argv, { waarde: ['docs'], schakelaar: ['json'] });
  const r = preflight(positioneel[0] ?? vindProjectroot(process.cwd()) ?? process.cwd(), { docs: vlaggen.docs });
  const stdout = vlaggen.json ? json(r) : preflightTekst(r);
  return uit(r.ok ? EXIT_OK : EXIT_PREFLIGHT, stdout);
}

function cmdPoort(argv) {
  const { positioneel, vlaggen } = parseArgs(argv, { schakelaar: ['json'] });
  const [naam, fase, docsArg] = positioneel;
  if (!naam || !fase) return uit(EXIT_FOUT, '', 'Gebruik: poort <naam> <fase> [docsdir] [--json]');
  const docsDir = resolveDocsDir(process.cwd(), docsArg, { omhoog: true });
  let r;
  if (!docsDir) {
    r = {
      toegestaan: false,
      redenen: [`De docs-map is niet gevonden${docsArg ? `: ${docsArg}` : ' (gezocht: docs en app/docs)'}`],
      acties: [SETUP_ACTIE],
      waarschuwingen: [],
    };
  } else {
    const planPad = path.join(docsDir, `${naam}.plan.md`);
    const beslisPad = path.join(docsDir, `${naam}.beslis.md`);
    r = checkPoort(naam, fase, isFile(planPad) ? leesTekst(planPad) : null, isFile(beslisPad) ? leesTekst(beslisPad) : null);
  }
  const stdout = vlaggen.json ? json(r) : poortTekst(naam, normaliseerFase(fase), r);
  return uit(r.toegestaan ? EXIT_OK : EXIT_GEBLOKKEERD, stdout);
}

function cmdToets(argv) {
  const { positioneel, vlaggen } = parseArgs(argv, { schakelaar: ['json'] });
  const [naam, fase, docsArg] = positioneel;
  if (!naam || !fase) return uit(EXIT_FOUT, '', 'Gebruik: toets <naam> <fase> [docsdir] [--json]');
  const docsDir = resolveDocsDir(process.cwd(), docsArg, { omhoog: true });
  let r;
  if (!docsDir) {
    r = { toegestaan: false, redenen: [`De docs-map is niet gevonden${docsArg ? `: ${docsArg}` : ' (gezocht: docs en app/docs)'}`], acties: [SETUP_ACTIE], waarschuwingen: [] };
  } else {
    const planPad = path.join(docsDir, `${naam}.plan.md`);
    r = checkToets(naam, fase, isFile(planPad) ? leesTekst(planPad) : null);
  }
  const stdout = vlaggen.json ? json(r) : toetsTekst(naam, normaliseerFase(fase), r);
  return uit(r.toegestaan ? EXIT_OK : EXIT_GEBLOKKEERD, stdout);
}

function cmdSync(argv) {
  const { positioneel, vlaggen } = parseArgs(argv, { schakelaar: ['dry-run'] });
  const docsDir = resolveDocsDir(process.cwd(), positioneel[0], { omhoog: true });
  if (!docsDir) return uit(EXIT_FOUT, '', `De docs-map is niet gevonden${positioneel[0] ? `: ${positioneel[0]}` : ' (gezocht: docs en app/docs)'}.`);
  const r = syncDocs(docsDir, { dryRun: Boolean(vlaggen['dry-run']) });
  return uit(EXIT_OK, syncTekst(docsDir, r, Boolean(vlaggen['dry-run'])));
}

function cmdMeet(argv) {
  const { vlaggen } = parseArgs(argv, { waarde: ['van', 'tot', 'sessie', 'projectdir', 'transcriptdir'], schakelaar: ['json'] });
  if (!vlaggen.van || !vlaggen.tot) return uit(EXIT_FOUT, '', 'Gebruik: meet --van <ISO> --tot <ISO> [--sessie <id>] [--projectdir <dir>] [--transcriptdir <dir>] [--json]');
  const van = Date.parse(vlaggen.van);
  const tot = Date.parse(vlaggen.tot);
  if (!Number.isFinite(van)) return uit(EXIT_FOUT, '', `--van is geen geldig ISO-tijdstip: ${vlaggen.van}`);
  if (!Number.isFinite(tot)) return uit(EXIT_FOUT, '', `--tot is geen geldig ISO-tijdstip: ${vlaggen.tot}`);
  if (tot < van) return uit(EXIT_FOUT, '', '--tot ligt voor --van.');
  const r = meet({ van, tot, sessie: vlaggen.sessie, projectdir: vlaggen.projectdir, transcriptdir: vlaggen.transcriptdir });
  return uit(EXIT_OK, vlaggen.json ? json(r) : meetTekst(r, vlaggen.van, vlaggen.tot));
}

/** Voert een subcommando uit en geeft { code, stdout, stderr }; schrijft zelf niets. */
export function main(argv) {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case 'preflight': return cmdPreflight(rest);
      case 'poort': return cmdPoort(rest);
      case 'toets': return cmdToets(rest);
      case 'sync': return cmdSync(rest);
      case 'meet': return cmdMeet(rest);
      case undefined:
      case 'help':
      case '--help':
      case '-h': return uit(EXIT_OK, HELP);
      default: return uit(EXIT_FOUT, '', `Onbekend subcommando "${cmd}". Zie: node plan.mjs help`);
    }
  } catch (e) {
    return uit(EXIT_FOUT, '', `Fout: ${e.message}`);
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const r = main(process.argv.slice(2));
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  process.exitCode = r.code;
}
