// Schrijft de drie vormen van de scan: dashboard.html (vier tabs, werkt offline en zonder JavaScript), SCAN.md
// (leesbaar op GitHub) en scan.svg (de kaart bovenaan de README). Leest ook een vorige scan terug voor "sinds vorige scan".
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { dashboardHtml } from './dashboard.mjs';

const KLEUR = { groen: '#4cc38a', amber: '#F0A13E', rood: '#f2555a', nvt: '#7a7a7a' };
const LABEL = { groen: 'op orde', amber: 'bijna', rood: 'aandacht nodig', nvt: 'n.v.t.' };
const ICOON_MD = { groen: '🟢', amber: '🟠', rood: '🔴', nvt: '⚪' };
const OORDEEL_MD = { gehaald: '✅ gehaald', niet: '❌ niet gehaald', nvt: '➖ n.v.t.', onbekend: '❔ niet te meten' };
const pct = (g, t) => (t ? Math.round((g / t) * 100) : 0);
const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const mdCel = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');

/** Waar zelfscans blijven: buiten elke repo, per project een map. BRBNT_SCANS_MAP overschrijft (voor tests). */
export const scansMap = () => process.env.BRBNT_SCANS_MAP || path.join(os.homedir(), '.brbnt', 'scans');
export const projectSlug = (naam) => String(naam).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

/**
 * Het gegevensblok uit een eerder dashboard.html, of null. Een dashboard van skillversie 1.4 en later bevat alleen de
 * samenvatting ({ schema: 2, samenvatting }); een ouder dashboard bevat alle gegevens. samenvatting() kan met beide overweg.
 */
export function leesData(htmlPad) {
  try {
    const h = fs.readFileSync(htmlPad, 'utf8');
    const tag = 'type="application/json">';
    const a = h.indexOf(tag) + tag.length;
    return JSON.parse(h.slice(a, h.indexOf('</script>', a)).replace(/\\u003c/g, '<'));
  } catch { return null; }
}

/** De samenvatting van een scan die nodig is om te vergelijken; ook te bewaren als nulmeting. */
export function samenvatting(d) {
  if (d?.samenvatting) return d.samenvatting;
  if (!d?.scan) return null;
  return {
    gegenereerd: d.gegenereerd, commit: d.bron?.kort || null, modus: d.modus || null, versie: d.scan.versie, gehaald: d.scan.gehaald, totaal: d.scan.totaal,
    lagen: d.scan.lagen.map((l) => ({ nr: l.nr, gehaald: l.gehaald, totaal: l.totaal })), oordelen: Object.fromEntries(d.scan.criteria.map((c) => [c.id, c.oordeel])),
    tests: d.laag4?.ci?.laatsteRun?.totaal?.geslaagd ?? null, memories: d.laag2?.memories?.length ?? null, commits: d.git?.totaal ?? null,
  };
}

/** Het dashboard, met alleen de samenvatting als gegevensblok: genoeg om de volgende scan mee te vergelijken. */
export function schrijfHtml(d, uitPad, { font = null } = {}) {
  const fontCss = font && fs.existsSync(font) ? `@font-face{font-family:"Montserrat";src:url(data:font/woff2;base64,${fs.readFileSync(font).toString('base64')}) format("woff2");font-weight:100 900;font-display:swap}` : '';
  fs.writeFileSync(uitPad, dashboardHtml(d, { font: fontCss, gegevens: { schema: 2, samenvatting: samenvatting(d) } }));
}

/** De kaart: zes lagen met balk, score en een woord erbij (status nooit alleen in kleur). */
export function scanSvg(d) {
  const s = d.scan;
  const W = 640, rij = 30, top = 96, H = top + s.lagen.length * rij + 30;
  const font = "font-family=\"'Segoe UI',Helvetica,Arial,sans-serif\"";
  const regels = s.lagen.map((l, i) => {
    const y = top + i * rij;
    const w = Math.round((pct(l.gehaald, l.totaal) / 100) * 250);
    return `<text x="24" y="${y + 14}" fill="#9a9a9a" font-size="12" font-weight="700" ${font}>${l.nr}</text>
  <text x="44" y="${y + 14}" fill="#f5f5f5" font-size="14" font-weight="600" ${font}>${xml(l.naam)}</text>
  <rect x="190" y="${y + 3}" width="250" height="12" rx="6" fill="#3a3a3a"/>
  ${w ? `<rect x="190" y="${y + 3}" width="${w}" height="12" rx="6" fill="${KLEUR[l.kleur]}"/>` : ''}
  <text x="456" y="${y + 14}" fill="${KLEUR[l.kleur]}" font-size="14" font-weight="700" ${font}>${l.totaal ? `${l.gehaald}/${l.totaal}` : '–'}</text>
  <text x="506" y="${y + 14}" fill="${KLEUR[l.kleur]}" font-size="12" font-weight="600" ${font}>${LABEL[l.kleur]}${l.nvt ? ` · ${l.nvt} n.v.t.` : ''}</text>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="BRBNT-scan van ${xml(d.project.naam)}: ${s.gehaald} van ${s.totaal} criteria gehaald, ${LABEL[s.kleur]}">
  <title>BRBNT-scan van ${xml(d.project.naam)}: ${s.gehaald} van ${s.totaal} gehaald</title>
  <rect width="${W}" height="${H}" rx="14" fill="#1c1c1c"/>
  <text x="24" y="33" fill="#f5f5f5" font-size="16" font-weight="800" ${font}>BRBNT-scan · ${xml(d.project.naam)}</text>
  <text x="24" y="52" fill="#9a9a9a" font-size="12" ${font}>stand per commit ${xml(d.bron.kort || '?')} · ${xml(String(d.gegenereerd).slice(0, 10))}</text>
  <text x="${W - 24}" y="50" fill="${KLEUR[s.kleur]}" font-size="34" font-weight="800" text-anchor="end" ${font}>${s.gehaald}<tspan fill="#9a9a9a" font-size="16">/${s.totaal}</tspan></text>
  <text x="${W - 24}" y="70" fill="${KLEUR[s.kleur]}" font-size="12" font-weight="700" text-anchor="end" ${font}>${LABEL[s.kleur]} · ${pct(s.gehaald, s.totaal)}%</text>
  ${regels}
</svg>
`;
}

/** SCAN.md: dezelfde scan als leesbare pagina op GitHub, met klikbare verwijzingen naar de bestanden. */
export function scanMd(d, { vorige = null } = {}) {
  const s = d.scan;
  const blob = d.project.repo ? `https://github.com/${d.project.repo}/blob/${d.bron.hoofdtak}/` : null;
  const link = (tekst, pad) => (blob && pad ? `[${tekst}](${blob}${pad.split('/').map(encodeURIComponent).join('/')})` : tekst);
  const memPad = new Map(d.laag2.memories.map((m) => [m.naam, `memory/${m.bestand}`]));
  const planPad = new Map(d.laag3.plannen.map((p) => [p.naam, p.beslisPad]));
  const item = (t) => { const m = /^([a-z0-9_-]+)/.exec(t); const p = m && (memPad.get(m[1]) || planPad.get(m[1])); return p ? `${link(m[1], p)}${mdCel(t.slice(m[1].length))}` : mdCel(t); };
  const v = d.vergelijking;
  const vgl = !!v;
  const delta = (x) => (v && x != null ? (x > 0 ? ` (▲ +${x})` : x < 0 ? ` (▼ ${x})` : ' (±0)') : '');
  const r = [];
  r.push(`# BRBNT-scan: ${d.project.naam}`, '', '![BRBNT-scan](scan.svg)', '');
  r.push(`**${s.gehaald} van ${s.totaal} meetbare criteria gehaald (${pct(s.gehaald, s.totaal)}%): ${ICOON_MD[s.kleur]} ${LABEL[s.kleur]}**${delta(v?.gehaald)}`, '');
  r.push(`Stand per commit ${d.bron.commit && blob ? `[\`${d.bron.kort}\`](https://github.com/${d.project.repo}/commit/${d.bron.commit})` : `\`${d.bron.kort || '?'}\``} op \`${d.bron.hoofdtak}\`, gescand ${d.gegenereerd.slice(0, 16).replace('T', ' ')} UTC. Criteria versie ${s.versie}.`);
  r.push(vgl ? `Vergeleken met de scan van ${String(vorige.gegenereerd).slice(0, 10)}${vorige.modus === 'zelfscan' ? ' (de zelfscan vóór de setup)' : ''}.` : vorige ? `De vorige scan gebruikte criteria versie ${vorige.versie}; vergelijken kan vanaf de volgende scan.` : 'Dit is de eerste scan.', '');
  r.push('> **Het volledige dashboard:** open [dashboard.html](dashboard.html), kies "Download raw file" en open het bestand. Het werkt ook zonder internet.', '');
  r.push('## Per laag', '', '| Laag | Score | Oordeel | Niet meegeteld | Groeien met |', '|---|---|---|---|---|');
  for (const l of s.lagen) {
    r.push(`| ${l.nr} ${l.naam} | ${l.totaal ? `${l.gehaald}/${l.totaal}` : '–'}${delta(v?.lagen?.[l.nr])} | ${ICOON_MD[l.kleur]} ${LABEL[l.kleur]} | ${[l.nvt && `${l.nvt} n.v.t.`, l.onbekend && `${l.onbekend} niet te meten`].filter(Boolean).join(', ') || '–'} | \`${l.skill}\` |`);
  }
  r.push('', 'Score per laag = gehaald ÷ (gehaald + niet gehaald). Alles gehaald is groen, vanaf 75% amber, daaronder rood.', '');
  const wacht = d.laag3.plannen.filter((p) => p.evaluatie?.wachtOpJou && p.evaluatie.wachtOpJou !== '-');
  r.push('## Nu van jou gevraagd', '', wacht.length ? wacht.map((p) => `- ${link(p.naam, p.beslisPad)}: ${mdCel(p.evaluatie.wachtOpJou)}`).join('\n') : 'Niets: er staat geen besluit of vrijgave open.', '');
  const niv = { rood: '🔴 Actie', oranje: '🟠 Let op', info: 'ℹ️ Info' };
  const ord = { rood: 0, oranje: 1, info: 2 };
  r.push('## Signalen', '', d.signalen.length ? d.signalen.slice().sort((a, b) => ord[a.niveau] - ord[b.niveau]).map((x) => `- ${niv[x.niveau]}: ${mdCel(x.tekst)}`).join('\n') : 'Geen signalen.', '');
  r.push('## Criteria', '');
  for (const l of s.lagen) {
    r.push(`### Laag ${l.nr} · ${l.naam}: ${l.totaal ? `${l.gehaald}/${l.totaal}` : 'n.v.t.'}, ${LABEL[l.kleur]}`, '', '| | # | Criterium | Bewijs |', '|---|---|---|---|');
    const cs = s.criteria.filter((c) => c.laag === l.nr);
    for (const c of cs) r.push(`| ${OORDEEL_MD[c.oordeel]} | ${c.id} | ${mdCel(c.criterium)} | ${mdCel(c.bewijs)} |`);
    const met = cs.filter((c) => c.oordeel === 'niet' && c.items?.length);
    for (const c of met) r.push('', `**${c.id} bevindingen** (groeien met \`${c.skill}\`):`, '', ...c.items.slice(0, 40).map((t) => `- ${item(t)}`), ...(c.items.length > 40 ? [`- en nog ${c.items.length - 40}`] : []));
    r.push('');
  }
  r.push('---', '', 'Gemaakt door de skill `brbnt-scan`. Dit bestand wordt automatisch vervangen; wijzig het niet met de hand.', '');
  return r.join('\n');
}
