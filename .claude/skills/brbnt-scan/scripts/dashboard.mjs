// Het dashboard: vier tabs (Standaard, Waar we staan, Volgende stap, Effort), in Node opgebouwd tot kant-en-klare HTML.
// Er draait geen script: tabs en de keuze tokens/tijd zijn keuzerondjes, details bij aanwijzen zijn CSS. Zo werkt de
// pagina ook in een voorbeeldvenster dat geen JavaScript uitvoert. De volledige plannen en documenten staan er niet in;
// alleen een kleine samenvatting als gegevensblok, als vergelijkingsbasis voor de volgende scan.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = (x) => (x == null ? 'onbekend' : Math.round(x).toLocaleString('nl-NL'));
const kort = (x) => (x >= 1e6 ? `${(x / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} mln` : x >= 1e4 ? `${Math.round(x / 1e3)}k` : x >= 1e3 ? `${(x / 1e3).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}k` : String(x));
const duur = (m) => (m == null ? 'onbekend' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}u ${String(m % 60).padStart(2, '0')}m`);
const sec = (s) => (s == null ? '–' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const meer = (x, een, veel) => `${x} ${x === 1 ? een : veel}`;
const schoon = (s) => String(s ?? '').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
// Een fasetitel: de eerste zin van "Wat wordt gebouwd", afgekapt op een natuurlijke grens.
const titelKort = (s, max = 110) => {
  s = schoon(s).split(/;\s/)[0];
  if (s.length <= max) return s;
  const knip = s.lastIndexOf(', ', max) > 50 ? s.lastIndexOf(', ', max) : s.lastIndexOf(' ', max);
  return s.slice(0, knip) + '…';
};

const MODELLEN = ['opus', 'fable', 'sonnet', 'haiku'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// Kleur = model, licht = effort (donker laag, licht hoog); gearceerd = effort niet gemeten. Gecontroleerd op het
// kaartvlak #2e2e2e: elke reeks is een oplopende tint, en de modellen zijn ook bij kleurenblindheid te scheiden.
const TINT = {
  opus: ['#215fbc', '#3a78d7', '#5291f2', '#76abff', '#a1c6ff'],
  fable: ['#a63d02', '#c5521c', '#e06b39', '#fd8453', '#ffad8d'],
  sonnet: ['#047554', '#0a9068', '#36a980', '#54c398', '#70ddb1'],
  haiku: ['#6451ac', '#7b69c6', '#9281e1', '#aa9afc', '#c3baff'],
};
const tint = (m, e) => { const r = TINT[m]; if (!r) return '#8a8a8a'; const i = EFFORTS.indexOf(e); return r[i < 0 ? 2 : i]; };
const vulling = (m, e) => (EFFORTS.includes(e) || e === 'n.v.t.' ? tint(m, e) : `url(#arcering-${TINT[m] ? m : 'anders'})`);

function model(s) {
  const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(s || '');
  return m ? { id: m[1], naam: `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}` } : null;
}
function effortUit(s) { const e = /\b(low|medium|high|xhigh|max)\b/i.exec(s || ''); return e ? e[1].toLowerCase() : /n\.v\.t\./.test(s || '') ? 'n.v.t.' : 'onbekend'; }

/** Wat het dashboard toont, afgeleid uit de scangegevens: plannen met fasen en uitvoeringen, en de CI-runs van criterium 4.3. */
export function bereken(D) {
  // De tijden in de plannen zijn lokaal, de scan zelf in UTC. Tonen in de tijdzone van de laatste commit; zonder commit in UTC.
  const m0 = /([+-])(\d\d):(\d\d)$/.exec(D.bron?.datum || '');
  const off = m0 ? (m0[1] === '-' ? -1 : 1) * (+m0[2] * 60 + +m0[3]) : 0;
  const lokaal = (iso, opt) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + off * 60000).toLocaleString('nl-NL', { timeZone: 'UTC', ...opt }) : ''; };
  const gh = D.project?.repo ? `https://github.com/${D.project.repo}` : null;
  const blob = D.linkBasis || null;

  const plannen = (D.laag3?.plannen || []).map((p) => {
    const fasering = p.fasering || [];
    const vrij = Object.fromEntries((p.vrijgave || []).map((v) => [v.Fase, v]));
    const faseTitel = (id) => vrij[id]?.['Wat wordt gebouwd'] || (fasering.find((f) => f.Fase === id) || {}).Scope || '';
    // Zonder plan.mjs is er geen evaluatie; dan de status zoals het plan hem noemt.
    const bron = p.evaluatie?.fases?.length ? p.evaluatie.fases : fasering.map((f) => { const s = f.Status || ''; return { id: f.Fase, tekst: s, soort: /✅/.test(s) ? 'gebouwd' : /🔨/.test(s) ? 'lopend' : /▶/.test(s) ? 'vrijgegeven' : /⏳/.test(s) ? 'wacht' : /⚠/.test(s) ? 'vervallen' : 'niet' }; });
    const fasen = bron.map((f) => {
      const tekst = String(f.tekst || '');
      const g = /(\d{4}-\d\d-\d\d \d\d:\d\d)/.exec(vrij[f.id]?.Gebouwd || '');
      const soort = f.soort === 'vrijgegeven' && /, na /.test(tekst) ? 'vrijgegeven-na' : f.soort;
      return { id: String(f.id || ''), soort, tekst, titel: faseTitel(f.id), wacht: tekst.match(/B\d+/g) || [], naFasen: (/, na (.*)$/.exec(tekst) || [])[1] || '', gebouwdOp: g ? g[1] : null };
    });
    const open = (p.kaarten || []).filter((k) => k.glyph === '⏳').map((k) => ({ id: k.id, onderwerp: k.onderwerp, houdtTegen: fasen.filter((f) => f.wacht.includes(k.id)).map((f) => f.id) }));
    const wacht = p.evaluatie?.wachtOpJou && p.evaluatie.wachtOpJou !== '-' ? p.evaluatie.wachtOpJou : '';
    const vrijgaven = [...wacht.matchAll(/vrijgave (F\d+)/g)].map((m) => { const f = fasen.find((x) => x.id === m[1]); return { id: m[1], titel: f?.titel || '', vervallen: f?.soort === 'vervallen' }; });
    const delen = (p.uitvoering || []).map((u, i) => {
      const k = (re) => u[Object.keys(u).find((x) => re.test(x))] || '';
      const label = String(u.Fase || `#${i + 1}`);
      const fase = label.replace(/\s.*$/, '');
      const st = k(/^Start/), ei = k(/^Einde/).trim();
      const eiVol = /^\d\d:\d\d$/.test(ei) ? `${st.slice(0, 10)} ${ei}` : ei;
      const min = st && eiVol ? Math.round((new Date(eiVol.replace(' ', 'T')) - new Date(st.replace(' ', 'T'))) / 60000) : null;
      const m = model(k(/Uitgevoerd/)) || { id: 'anders', naam: 'model onbekend' };
      const effort = effortUit(k(/Effort/));
      const gp = (fasering.find((f) => f.Fase === fase) || {})['Gepland model en effort'] || '';
      const gm = model(gp), ge = effortUit(gp);
      // Een toetsing is geen bouw: het geplande model en effort gelden voor de bouw, dus daar vergelijken we niet.
      const toetsing = /toetsing/i.test(label);
      let afwijking = null;
      if (gm && !toetsing) {
        if (gm.id !== m.id) afwijking = 'model';
        else if (EFFORTS.includes(effort) && EFFORTS.includes(ge) && effort !== ge) afwijking = EFFORTS.indexOf(effort) > EFFORTS.indexOf(ge) ? 'hoger' : 'lager';
        else if (!EFFORTS.includes(effort) && EFFORTS.includes(ge)) afwijking = 'onbekend';
      }
      return {
        i, label, fase, titel: faseTitel(fase), model: m.naam, modelId: m.id, effort,
        in: p.tokens?.[i]?.in ?? null, uit: p.tokens?.[i]?.uit ?? null, min: Number.isFinite(min) && min >= 0 ? min : null,
        commits: (k(/Commits/).match(/\b[0-9a-f]{7,40}\b/g) || []).length,
        gepland: gm ? `${gm.naam} · ${ge}` : schoon(gp).replace(/\s*\(.*$/, ''), geplandBekend: !!gm, toetsing, afwijking,
      };
    });
    const laatst = fasen.map((f) => f.gebouwdOp).filter(Boolean).sort().pop() || null;
    return { naam: p.naam, titel: p.titel || p.naam, status: String(p.status || ''), fasen, open, vrijgaven, delen, laatst,
      planUrl: blob && p.planPad ? blob + p.planPad : null, beslisUrl: blob && p.beslisPad ? blob + p.beslisPad : null };
  });

  // Dezelfde runs als criterium 4.3: de laatste afgeronde, geannuleerd en overgeslagen tellen niet mee in het percentage.
  const ci = D.laag4?.ci || {};
  const afgerond = (ci.runs || []).filter((r) => r.status === 'completed').slice(0, D.scan?.drempels?.ciRuns || 30);
  const telt = afgerond.filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
  const duren = afgerond.map((r) => r.duurSec).filter((x) => x != null).sort((a, b) => a - b);
  const CI = ci.beschikbaar ? {
    runs: afgerond.slice().reverse(), geslaagd: telt.filter((r) => r.conclusion === 'success').length, telt: telt.length,
    gefaald: afgerond.filter((r) => r.conclusion === 'failure').length, anders: afgerond.filter((r) => r.conclusion !== 'success' && r.conclusion !== 'failure').length,
    mediaan: duren.length ? duren[Math.floor(duren.length / 2)] : null, gemiddeld: duren.length ? Math.round(duren.reduce((a, x) => a + x, 0) / duren.length) : null,
    norm: D.scan?.drempels?.ciMinPct ?? 90, laatste: ci.laatsteRun?.run || null, bezig: (ci.runs || []).filter((r) => r.status !== 'completed'), url: gh ? `${gh}/actions` : null,
  } : null;

  return { plannen, CI, lokaal, tijdzone: !!m0, gh };
}

const EFFORTNAAM = (e) => (e === 'onbekend' ? 'effort onbekend' : e);
// Hoe een uitvoering zich verhoudt tot het plan; een toetsing is geen bouw en wordt niet vergeleken.
const AFW = { gelijk: ['ok', '✓ zoals gepland'], hoger: ['let', '↑ hoger effort dan gepland'], lager: ['let', '↓ lager effort dan gepland'], model: ['let', 'ander model dan gepland'], onbekend: ['grijs', 'effort niet gemeten'], toetsing: ['grijs', 'toetsing'] };
// "F7 (afronding en toetsing)" wordt "F7 toetsing", "F14 (herwerk)" wordt "F14 herwerk": kort genoeg voor het midden van een donut.
const korteLabel = (d) => d.label.replace(/\s*\((.*)\)$/, (m, x) => ` ${/toetsing/i.test(x) ? 'toetsing' : x.split(' ')[0]}`);
const vlak = (m, e) => `<svg class="vlak" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="${vulling(m, e)}"/></svg>`;

// Een donut. items: { k, w, fill, groot, klein } (groot en klein al veilig); zonder waarde geen segment. Elk item heeft
// een eigen tekst voor het midden, zodat aanwijzen (ook van een chip buiten de donut) de waarde van dat deel toont.
function ringSvg(items, attr, { groot, klein, label }, leeg = ['onbekend', 'niet gemeten']) {
  const ds = items.filter((x) => x.w != null && x.w > 0);
  const som = ds.reduce((a, x) => a + x.w, 0);
  const R = 62, r = 41, c = 70; let a0 = -Math.PI / 2;
  const pt = (rr, a) => `${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)}`;
  const boog = (a1, a2) => { const g = a2 - a1 > Math.PI ? 1 : 0; return `M${pt(R, a1)} A${R} ${R} 0 ${g} 1 ${pt(R, a2)} L${pt(r, a2)} A${r} ${r} 0 ${g} 0 ${pt(r, a1)}Z`; };
  const segs = !som ? `<circle cx="${c}" cy="${c}" r="${(R + r) / 2}" fill="none" stroke="#6a6a6a" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 7"/>`
    : ds.map((x) => {
      const a = (x.w / som) * Math.PI * 2;
      const el = ds.length === 1 ? `<circle cx="${c}" cy="${c}" r="${(R + r) / 2}" fill="none" stroke="${x.fill}" stroke-width="${R - r}" data-${attr}="${x.k}" tabindex="0"/>`
        : `<path d="${boog(a0, a0 + a)}" fill="${x.fill}" stroke="#2e2e2e" stroke-width="1.5" data-${attr}="${x.k}" tabindex="0"/>`;
      a0 += a; return el;
    }).join('');
  const midden = (g, k) => `<text x="${c}" y="${c + 2}" class="cg">${g}</text><text x="${c}" y="${c + 18}" class="ck">${k}</text>`;
  const per = items.map((x) => `<g class="cd" data-${attr}c="${x.k}">${midden(x.groot, x.klein)}</g>`).join('');
  return `<svg viewBox="0 0 140 140" role="img" aria-label="${esc(label)}">${segs}<g class="c0">${som ? midden(groot, klein) : midden(...leeg)}</g>${per}</svg>`;
}

// Aanwijzen en aanklikken zonder script. Aanwijzen gaat altijd voor: een aangeklikt deel telt alleen zolang er niets
// anders wordt aangewezen, zodat er nooit twee teksten over elkaar staan.
function aanwijsCss(bak, a, aantal) {
  const hov = (w = '') => `${bak}:has([data-${a}${w}]:hover)`;
  const foc = (w = '') => `${bak}:has([data-${a}${w}]:focus):not(:has([data-${a}]:hover))`;
  const r = [`${hov()} [data-${a}],${foc()} [data-${a}]{opacity:.3}`, `${hov()} :is(.c0,.d0),${foc()} :is(.c0,.d0){visibility:hidden}`];
  for (let i = 0; i < aantal; i++) {
    const w = `="${i}"`;
    r.push(`${hov(w)} [data-${a}${w}],${foc(w)} [data-${a}${w}]{opacity:1}`);
    r.push(`${hov(w)} :is([data-${a}c${w}],[data-${a}i${w}]),${foc(w)} :is([data-${a}c${w}],[data-${a}i${w}]){visibility:visible}`);
  }
  return r.join('\n');
}

/**
 * Het dashboard als volledige HTML-pagina. font: een @font-face-regel (of leeg); gegevens: het blok dat de volgende
 * scan terugleest om te vergelijken (zie leesData en samenvatting in uitvoer.mjs).
 */
export function dashboardHtml(D, { font = '', gegevens = null } = {}) {
  const { plannen: P, CI, lokaal, tijdzone, gh } = bereken(D);
  const SC = D.scan;
  const KLEUR = { groen: ['groen', '✓', 'op orde'], amber: ['amber', '!', 'bijna'], rood: ['rood', '!', 'aandacht nodig'], nvt: ['nvt', '–', 'n.v.t.'] };
  const badge = (k) => `<span class="badge s-${KLEUR[k][0]}"><i aria-hidden="true">${KLEUR[k][1]}</i>${KLEUR[k][2]}</span>`;
  const teller = (aantal, k, titel = '') => `<span class="teller s-${k}"${titel ? ` title="${esc(titel)}"` : ''}>${aantal}</span>`;
  // Een ingeklapte sectie met een getal achter de titel, zodat ze het beeld niet vertroebelt.
  const sectie = (cls, titel, chip, inhoud, extra = '') => `<details class="sectie ${cls}"><summary><span class="pijl" aria-hidden="true"></span><h4>${titel}</h4>${chip}${extra}</summary><div class="sectie-inhoud">${inhoud}</div></details>`;
  const OORDEEL = { gehaald: ['groen', '✓', 'gehaald'], niet: ['rood', '✕', 'niet gehaald'], nvt: ['nvt', '–', 'n.v.t.'], onbekend: ['nvt', '?', 'niet te meten'] };
  const fail = SC.criteria.filter((c) => c.oordeel === 'niet');
  const v = D.vergelijking;
  const link = (url, tekst) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${tekst}</a>` : tekst);
  const kortDatum = (iso) => lokaal(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const geenPlannen = '<div class="card"><p class="leeg">Nog geen plannen gevonden. Een plan maak je met de skill <code>brbnt-plan</code>.</p></div>';

  /* ---------- Standaard ---------- */
  const critRij = (c, metSkill = false) => `<div class="crit s-${OORDEEL[c.oordeel][0]}"><span class="ic" title="${OORDEEL[c.oordeel][2]}">${OORDEEL[c.oordeel][1]}</span><b class="id">${esc(c.id)}</b><span class="tx">${esc(c.criterium)}<small>${esc(c.bewijs)}${metSkill ? ` · groeien met <code>${esc(c.skill)}</code>` : ''}</small>${metSkill && c.items?.length ? `<ul>${c.items.slice(0, 12).map((x) => `<li>${esc(x)}</li>`).join('')}${c.items.length > 12 ? `<li class="muted">en nog ${c.items.length - 12}</li>` : ''}</ul>` : ''}</span></div>`;
  const vgl = v ? (v.veranderd?.length ? `Sinds de scan van ${kortDatum(v.sinds)}: ${v.veranderd.map((x) => `${x.id} ${OORDEEL[x.was]?.[2] || x.was} → ${OORDEEL[x.nu]?.[2] || x.nu}`).join(', ')}` : `Gelijk aan de scan van ${kortDatum(v.sinds)}`) : 'Eerste scan: de volgende laat zien wat er veranderde.';
  const lagen = SC.lagen.map((l) => `<details class="laag s-${l.kleur}"><summary><span class="nr">${l.nr}</span><span class="nm">${esc(l.naam)}${l.nvt || l.onbekend ? `<small>${[l.nvt && `${l.nvt} n.v.t.`, l.onbekend && `${l.onbekend} niet te meten`].filter(Boolean).join(' · ')}</small>` : ''}</span><span class="sbar"><span style="width:${pct(l.gehaald, l.totaal)}%"></span></span><span class="fr">${l.totaal ? `${l.gehaald}/${l.totaal}` : '–'}</span>${badge(l.kleur)}<span class="pijl" aria-hidden="true"></span></summary><div class="criteria">${SC.criteria.filter((c) => c.laag === l.nr).map((c) => critRij(c)).join('')}</div></details>`).join('');
  const nietLijst = sectie('niet-lijst', 'Niet gehaald', teller(fail.length, fail.length ? 'rood' : 'groen'), fail.length ? fail.map((c) => critRij(c, true)).join('') : '<p class="leeg">Niets: alle meetbare criteria zijn gehaald.</p>');
  let ciKaart = `<div class="card"><h3>CI</h3><p class="leeg">${esc(D.laag4?.ci?.reden || 'De CI-gegevens waren niet beschikbaar bij deze scan.')}</p></div>`;
  if (CI && !CI.runs.length) ciKaart = '<div class="card"><h3>CI</h3><p class="leeg">Nog geen afgeronde runs.</p></div>';
  else if (CI) {
    const max = Math.max(1, ...CI.runs.map((r) => r.duurSec || 0));
    const stap = [60, 120, 300, 600, 900, 1800, 3600, 7200].find((s) => max / s <= 4) || 7200;
    const top = Math.ceil(max / stap) * stap;
    const tijdLab = (s) => (s >= 3600 ? `${s / 3600}u` : `${s / 60}m`);
    const lijnen = Array.from({ length: top / stap + 1 }, (_, i) => i * stap).map((t) => `<span class="lijn${t ? '' : ' nul'}" style="bottom:${((t / top) * 100).toFixed(2)}%"></span><span class="lab" style="bottom:${((t / top) * 100).toFixed(2)}%">${tijdLab(t)}</span>`).join('');
    const staven = CI.runs.map((r, i) => {
      const s = r.conclusion === 'success' ? ['ok', '✓ geslaagd'] : r.conclusion === 'failure' ? ['fout', '✕ gefaald'] : ['anders', `○ ${r.conclusion || r.status}`];
      return `<span class="staaf ${s[0]} ${i < CI.runs.length / 2 ? 'links' : 'rechts'}" tabindex="0" style="height:${Math.max(1.5, ((r.duurSec || 0) / top) * 100).toFixed(1)}%"><span class="tip"><b>#${esc(r.number)} ${s[1]}</b> · ${sec(r.duurSec)}<br>${esc(r.displayTitle)}<br><span class="muted">${kortDatum(r.createdAt)} · ${esc(r.headBranch || '')}</span></span></span>`;
    }).join('');
    const ok = pct(CI.geslaagd, CI.telt) >= CI.norm;
    const L = CI.laatste;
    ciKaart = `<div class="card ci"><div class="kaartkop"><h3>CI: de laatste ${CI.runs.length} afgeronde runs</h3>${CI.url ? link(CI.url, 'Actions op GitHub →') : ''}</div>
      <div class="cijfers">
        <div><span class="groot ${ok ? 'goed' : 'slecht'}">${CI.geslaagd}<small>/${CI.telt}</small></span><span class="sub">geslaagd (${pct(CI.geslaagd, CI.telt)}%); de norm is ${CI.norm}% (4.3)</span></div>
        <div><span class="groot">${sec(CI.mediaan)}</span><span class="sub">mediaan per run: de middelste van de ${CI.runs.length}</span></div>
        <div><span class="groot">${sec(CI.gemiddeld)}</span><span class="sub">gemiddeld per run: alles opgeteld, gedeeld door ${CI.runs.length}</span></div>
        ${L ? `<div><span class="groot ${L.conclusion === 'success' ? 'goed' : 'slecht'}">${L.conclusion === 'success' ? '✓' : '✕'} #${esc(L.number)}</span><span class="sub">laatste run op de hoofdtak, ${kortDatum(L.createdAt)} (4.2)</span></div>` : ''}
      </div>
      <div class="grafiek">${lijnen}<div class="staven">${staven}</div></div>
      <div class="as"><span>${lokaal(CI.runs[0].createdAt, { day: 'numeric', month: 'short' })}</span><span>oud → nieuw · hoogte = duur</span><span>${lokaal(CI.runs.at(-1).createdAt, { day: 'numeric', month: 'short' })}</span></div>
      <div class="legenda"><span><i class="dot ok"></i>✓ geslaagd ${CI.runs.filter((r) => r.conclusion === 'success').length}</span><span><i class="dot fout"></i>✕ gefaald ${CI.gefaald}</span>${CI.anders ? `<span><i class="dot anders"></i>○ geannuleerd of anders ${CI.anders}</span>` : ''}</div>
      ${CI.bezig.length ? `<p class="klein">Nog bezig tijdens de scan: ${CI.bezig.map((r) => `#${esc(r.number)}`).join(', ')}. Die telt mee in de volgende scan.</p>` : ''}</div>`;
  }
  // Signalen tellen niet mee in de score. Wat het dashboard elders al laat zien, valt hier weg: als criterium (CLAUDE.md
  // 1.1, vereisten V1 tot en met V8 in 1.3, 2.1, 3.1 en 4.8, geheugen 2.2 tot en met 2.6, planversie 3.7, worktrees 5.3,
  // gemergde takken 5.4), in Volgende stap (wachtende plannen, een vervallen vrijgave die op jou wacht) of bij de CI (4.2,
  // 4.3). De rest staat onder "Ook opgemerkt", bij ontbrekende paden met de paden erbij.
  const ELDERS = ['geen-claude', 'memory-index', 'memory-link', 'memory-why', 'plan-versie', 'plan-wacht', 'ci-laatste', 'ci-gefaald', 'worktree-los', 'takken-gemerged'];
  const inVolgendeStap = new Set(P.flatMap((p) => p.vrijgaven.map((x) => `${p.naam}:${x.id}`)));
  const NIVEAU = { rood: ['rood', '!', 'actie'], oranje: ['amber', '!', 'let op'], info: ['nvt', 'i', 'info'] };
  const opgemerkt = (D.signalen || []).filter((s) => !ELDERS.includes(s.soort)
    && !(s.soort === 'vereiste' && /^V[1-8]$/.test(s.id || ''))
    && !(s.soort === 'vrijgave-vervallen' && inVolgendeStap.has(`${s.plan}:${s.fase}`)))
    .sort((a, b) => Object.keys(NIVEAU).indexOf(a.niveau) - Object.keys(NIVEAU).indexOf(b.niveau));
  const bijSignaal = (s) => s.paden || [];
  const verdeling0 = Object.keys(NIVEAU).map((n) => [n, opgemerkt.filter((s) => s.niveau === n).length]).filter(([, x]) => x).map(([n, x]) => `${x} ${NIVEAU[n][2]}`).join(', ');
  const opgemerktBlok = opgemerkt.length ? sectie('opgemerkt', 'Ook opgemerkt', teller(opgemerkt.length, (NIVEAU[opgemerkt[0].niveau] || NIVEAU.info)[0], verdeling0),
    opgemerkt.map((s) => { const [k, i, w] = NIVEAU[s.niveau] || NIVEAU.info; return `<div class="sig s-${k}"><span class="badge s-${k}"><i aria-hidden="true">${i}</i>${w}</span><span class="tx">${esc(s.tekst)}${bijSignaal(s).length ? `<small>${bijSignaal(s).map(esc).join(' · ')}</small>` : ''}</span></div>`; }).join(''),
    '<small>telt niet mee in de score</small>') : '';
  const paneel1 = `<div class="card"><div class="kaartkop"><h3>Zes lagen</h3><span class="sub">${esc(vgl)} · klap een laag open voor de criteria</span></div>${lagen}${nietLijst}${opgemerktBlok}</div>${ciKaart}`;

  /* ---------- Waar we staan ---------- */
  const SOORT = {
    gebouwd: ['gebouwd', '✅ gebouwd'], lopend: ['in uitvoering', '🔨 in uitvoering'], vrijgegeven: ['klaar om te bouwen', '▶ vrijgegeven, klaar om te bouwen'],
    'vrijgegeven-na': ['vrijgegeven, wacht op een fase', '▶ vrijgegeven, bouwen na'], wacht: ['wacht op een besluit', '⏳ wacht op'], vervallen: ['vrijgave vervallen', '⚠ vrijgave vervallen'], niet: ['nog niet vrijgegeven', '○ nog niet vrijgegeven'],
  };
  const alleF = P.flatMap((p) => p.fasen);
  const tel = Object.fromEntries(Object.keys(SOORT).map((k) => [k, alleF.filter((f) => f.soort === k).length]));
  const volg = { 'in-uitvoering': 0, 'deels-vrijgegeven': 1, vrijgegeven: 2, 'ter-akkoord': 3, gebouwd: 4, afgerond: 5 };
  const PS = P.slice().sort((a, b) => (volg[a.status] ?? 9) - (volg[b.status] ?? 9) || String(b.laatst || '').localeCompare(String(a.laatst || '')) || String(a.titel).localeCompare(String(b.titel)));
  const kaartVan = Object.fromEntries(P.flatMap((p) => p.open.map((b) => [`${p.naam}:${b.id}`, b])));
  const statusTekst = (p, f) => {
    if (f.soort === 'gebouwd') return `✅ gebouwd${f.gebouwdOp ? ` op ${f.gebouwdOp.slice(8, 10)}-${f.gebouwdOp.slice(5, 7)} ${f.gebouwdOp.slice(11)}` : ''}`;
    if (f.soort === 'wacht') return `⏳ wacht op ${f.wacht.map((b) => `${b}${kaartVan[`${p.naam}:${b}`] ? ` (${esc(kaartVan[`${p.naam}:${b}`].onderwerp)})` : ''}`).join(', ')}`;
    if (f.soort === 'vrijgegeven-na') return `▶ vrijgegeven, bouwen na ${esc(f.naFasen)}`;
    return SOORT[f.soort]?.[1] || esc(f.tekst);
  };
  const soorten = Object.entries(tel).filter(([, x]) => x);
  const verdeling = `<div class="verdeling" role="img" aria-label="${soorten.map(([k, x]) => `${x} ${SOORT[k][0]}`).join(', ')}">${soorten.map(([k, x]) => `<span class="v-${k}" style="flex:${x}"></span>`).join('')}</div>
    <div class="legenda">${soorten.map(([k, x]) => `<span><i class="f ${k}" aria-hidden="true"></i>${SOORT[k][0]} <b>${x}</b></span>`).join('')}</div>`;
  const planRijen = PS.map((p) => { const g = p.fasen.filter((f) => f.soort === 'gebouwd').length; return `<div class="plan"><div class="t">${link(p.planUrl, esc(p.titel))}<small>${esc(p.status.replace(/-/g, ' '))}${p.laatst ? ` · laatst gebouwd ${p.laatst.slice(8, 10)}-${p.laatst.slice(5, 7)}` : ''}</small></div>
    <div class="strip">${p.fasen.map((f) => `<span class="f ${f.soort}" tabindex="0" aria-label="${esc(f.id)}: ${esc(SOORT[f.soort]?.[0] || f.tekst)}">${esc(f.id.replace(/^F/, ''))}<span class="tip"><b>${esc(f.id)}</b> ${esc(titelKort(f.titel, 160))}<br>${statusTekst(p, f)}</span></span>`).join('')}</div>
    <div class="tel">${g}/${p.fasen.length}<small>gebouwd</small></div></div>`; }).join('');
  const paneel2 = P.length ? `<div class="card"><div class="kaartkop"><h3>Alle fasen</h3><span class="sub">${meer(alleF.length, 'fase', 'fasen')} in ${meer(P.length, 'plan', 'plannen')}</span></div>${verdeling}</div>
    <div class="card"><div class="kaartkop"><h3>Per plan</h3><span class="sub">wijs een fase aan voor de titel en de status</span></div>${planRijen}</div>` : geenPlannen;

  /* ---------- Volgende stap ---------- */
  const SOORTEN = [['besluit', 'Besluit', 'besluit', 'besluiten'], ['vrij', 'Vrijgave', 'vrijgave', 'vrijgaven'], ['bouw', 'Bouwen', 'te bouwen', 'te bouwen'], ['lopend', 'Loopt', 'loopt', 'lopen']];
  const stapPlannen = PS.map((p) => {
    const it = { besluit: [], vrij: [], bouw: [], lopend: [] };
    p.open.forEach((b) => it.besluit.push(`<b>${esc(b.id)}</b> ${esc(b.onderwerp)}${b.houdtTegen.length ? ` <small>houdt ${b.houdtTegen.join(', ')} tegen</small>` : ''}`));
    p.vrijgaven.forEach((x) => it.vrij.push(`<b>${esc(x.id)}</b> ${esc(titelKort(x.titel))}${x.vervallen ? ' <small>de vorige vrijgave is vervallen</small>' : ''}`));
    p.fasen.filter((f) => f.soort === 'vrijgegeven').forEach((f) => it.bouw.push(`<b>${esc(f.id)}</b> ${esc(titelKort(f.titel))} <small>vrijgegeven, kan starten</small>`));
    p.fasen.filter((f) => f.soort === 'lopend').forEach((f) => it.lopend.push(`<b>${esc(f.id)}</b> ${esc(titelKort(f.titel))}`));
    if (!Object.values(it).some((x) => x.length)) return null;
    const chips = SOORTEN.filter(([k]) => it[k].length).map(([k, , een, veel]) => `<span class="chip ${k}"><b>${it[k].length}</b> ${it[k].length === 1 ? een : veel}</span>`).join('');
    const lijst = SOORTEN.flatMap(([k, label]) => it[k].map((x) => `<li><span class="soort ${k}">${label}</span><span>${x}</span></li>`)).join('');
    return `<details class="stapplan"><summary><span class="pijl" aria-hidden="true"></span><span class="t">${esc(p.titel)}<small>${esc(p.status.replace(/-/g, ' '))}</small></span><span class="chips">${chips}</span></summary><div class="inhoud"><ul>${lijst}</ul>${p.beslisUrl ? `<p class="doc">${link(p.beslisUrl, 'Open het beslisdocument →')}</p>` : ''}</div></details>`;
  }).filter(Boolean);
  const nietsNodig = PS.filter((p) => !p.open.length && !p.vrijgaven.length && !p.fasen.some((f) => f.soort === 'vrijgegeven' || f.soort === 'lopend'));
  const wachtend = PS.filter((p) => p.open.length || p.vrijgaven.length).length;
  const klaar = alleF.filter((f) => f.soort === 'vrijgegeven').length;
  const paneel3 = P.length ? `<div class="card"><div class="kaartkop"><h3>Per plan</h3><span class="sub">klap een plan open voor wat er nodig is</span></div>${stapPlannen.join('') || '<p class="leeg">Niets. Alle besluiten zijn genomen en alle vrijgegeven fasen zijn gebouwd.</p>'}${stapPlannen.length && nietsNodig.length ? `<p class="leeg">Niets nodig bij: ${nietsNodig.map((p) => esc(p.titel)).join(', ')}.</p>` : ''}</div>` : geenPlannen;

  /* ---------- Effort ---------- */
  const delen = P.flatMap((p) => p.delen.map((d) => ({ ...d, p })));
  const metTok = delen.filter((d) => d.uit != null), metTijd = delen.filter((d) => d.min != null);
  const totUit = metTok.reduce((a, d) => a + d.uit, 0), totIn = metTok.reduce((a, d) => a + (d.in || 0), 0), totMin = metTijd.reduce((a, d) => a + d.min, 0);
  const modelOrde = (a, b) => ((MODELLEN.indexOf(a) + 99) % 99) - ((MODELLEN.indexOf(b) + 99) % 99);
  const combos = [...new Set(delen.map((d) => `${d.modelId}|${d.effort}`))].sort((a, b) => { const [ma, ea] = a.split('|'), [mb, eb] = b.split('|'); return modelOrde(ma, mb) || (EFFORTS.indexOf(eb) + 1 || -1) - (EFFORTS.indexOf(ea) + 1 || -1); });
  const comboRij = combos.map((c) => { const [m, e] = c.split('|'); const ds = delen.filter((d) => d.modelId === m && d.effort === e); return { m, e, naam: ds[0].model, n: ds.length, uit: ds.reduce((a, d) => a + (d.uit || 0), 0), min: ds.reduce((a, d) => a + (d.min || 0), 0), onbTok: ds.filter((d) => d.uit == null).length, onbTijd: ds.filter((d) => d.min == null).length }; });
  const afw = delen.reduce((a, d) => { if (d.afwijking) a[d.afwijking] = (a[d.afwijking] || 0) + 1; return a; }, {});
  const afwZin = [afw.hoger && `${afw.hoger} op een hoger effort`, afw.lager && `${afw.lager} op een lager effort`, afw.model && `${afw.model} op een ander model`].filter(Boolean);
  const afwTekst = afwZin.length ? `Anders dan gepland: ${afwZin.join(', ')}${afw.onbekend ? `; bij ${afw.onbekend} is het effort niet gemeten` : ''}.` : afw.onbekend ? `Bij ${afw.onbekend} is het effort niet gemeten; de rest draaide zoals gepland.` : 'Alles draaide op het geplande model en effort.';

  const totaalDeel = (maat) => {
    const w = (r) => (maat === 'tok' ? r.uit : r.min) || null;
    const onb = (r) => (maat === 'tok' ? r.onbTok : r.onbTijd);
    const som = comboRij.reduce((a, r) => a + (w(r) || 0), 0), onbTot = comboRij.reduce((a, r) => a + onb(r), 0);
    const waarde = (x) => (maat === 'tok' ? n(x) : duur(x));
    const items = comboRij.map((r, k) => ({ k, w: w(r), fill: vulling(r.m, r.e), groot: w(r) ? (maat === 'tok' ? kort(r.uit) : duur(r.min)) : 'onbekend', klein: w(r) ? `${pct(w(r), som)}% van het totaal` : 'niet gemeten' }));
    const svg = ringSvg(items, 'k', { groot: maat === 'tok' ? kort(som) : duur(som), klein: maat === 'tok' ? 'uitvoertokens' : 'doorlooptijd', label: `${maat === 'tok' ? 'Uitvoertokens' : 'Tijd'} per model en effort` });
    const onbKol = (x) => (onbTot ? `<span class="r${x ? '' : ' muted'}">${x || '–'}</span>` : '');
    const rijen = comboRij.map((r, k) => `<div class="lrij" data-k="${k}"><span>${vlak(r.m, r.e)}</span><span class="nm">${esc(r.naam)} · ${esc(EFFORTNAAM(r.e))}</span><span class="r">${r.n}</span>${onbKol(onb(r))}<span class="r w">${w(r) ? waarde(w(r)) : '<span class="muted">onbekend</span>'}</span></div>`).join('');
    return `<div class="totaal-inhoud als-${maat}"><div class="ring">${svg}</div><div class="lgrid${onbTot ? '' : ' drie'}"><div class="lrij kop"><span></span><span></span><span class="r"><span class="lang">Uitvoeringen</span><span class="kort">Aantal</span></span>${onbTot ? '<span class="r"><span class="lang">Niet gemeten</span><span class="kort">Onbekend</span></span>' : ''}<span class="r"><span class="lang">${maat === 'tok' ? 'Uitvoertokens' : 'Tijd'}</span><span class="kort">${maat === 'tok' ? 'Tokens' : 'Tijd'}</span></span></div>${rijen}<div class="lrij tot"><span></span><span class="nm">Totaal</span><span class="r">${delen.length}</span>${onbKol(onbTot)}<span class="r w">${waarde(som)}</span></div></div></div>`;
  };

  const kaartVoor = (p) => {
    const tok = p.delen.reduce((a, d) => a + (d.uit || 0), 0), mn = p.delen.reduce((a, d) => a + (d.min || 0), 0);
    const zonderTok = p.delen.filter((d) => d.uit == null), zonderTijd = p.delen.filter((d) => d.min == null);
    const planCombos = comboRij.map((r) => ({ ...r, np: p.delen.filter((d) => d.modelId === r.m && d.effort === r.e).length })).filter((r) => r.np);
    const items = (maat) => p.delen.map((d) => ({ k: d.i, w: maat === 'tok' ? d.uit : d.min, fill: vulling(d.modelId, d.effort), groot: maat === 'tok' ? (d.uit == null ? 'onbekend' : kort(d.uit)) : duur(d.min), klein: esc(korteLabel(d)) }));
    const zonder = (lijst) => (lijst.length ? `<div class="zonder"><span class="muted">niet gemeten:</span> ${lijst.map((d) => `<span class="fchip" data-d="${d.i}" tabindex="0">${esc(korteLabel(d))}</span>`).join('')}</div>` : '');
    const det = p.delen.map((d) => {
      const a = d.toetsing ? 'toetsing' : d.afwijking || (d.geplandBekend ? 'gelijk' : null);
      const extra = [d.in != null && `${n(d.in)} invoertokens`, d.gepland && a !== 'gelijk' && `gepland${d.toetsing ? ' voor de bouw' : ''}: ${esc(d.gepland)}`].filter(Boolean).join(' · ');
      return `<div class="deel" data-di="${d.i}"><div class="dk"><span class="fase">${esc(d.label)}</span><span class="mdl">${vlak(d.modelId, d.effort)}${esc(d.model)} · ${esc(EFFORTNAAM(d.effort))}</span>${a ? `<span class="pl ${AFW[a][0]}">${AFW[a][1]}</span>` : ''}</div>
        <p class="dt">${esc(titelKort(d.titel, 160))}</p>
        <div class="ds"><div><b>${d.uit != null ? n(d.uit) : 'onbekend'}</b><span>uitvoertokens</span></div><div><b>${duur(d.min)}</b><span>tijd</span></div><div><b>${d.commits || '–'}</b><span>${d.commits === 1 ? 'commit' : 'commits'}</span></div></div>${extra ? `<div class="dv">${extra}</div>` : ''}</div>`;
    }).join('');
    const d0 = `<div class="deel d0"><div class="ds"><div><b>${tok ? n(tok) : 'onbekend'}</b><span>uitvoertokens${tok && zonderTok.length ? `, ${zonderTok.length} niet gemeten` : ''}</span></div><div><b>${duur(mn)}</b><span>doorlooptijd</span></div></div><div class="dm">${planCombos.map((r) => `<span class="nowrap">${vlak(r.m, r.e)}${esc(r.naam)} · ${esc(EFFORTNAAM(r.e))} <span class="muted">${r.np}×</span></span>`).join('')}</div><div class="hint">Wijs een deel van de donut aan voor de details.</div></div>`;
    return `<div class="kaart card"><div class="kk"><b>${esc(p.titel)}</b><small>${meer(p.delen.length, 'uitvoering', 'uitvoeringen')}</small></div><div class="lijf"><div class="ring"><div class="als-tok">${ringSvg(items('tok'), 'd', { groot: kort(tok), klein: 'uitvoertokens', label: `${p.titel}: ${n(tok)} uitvoertokens` })}${zonder(zonderTok)}</div><div class="als-tijd">${ringSvg(items('tijd'), 'd', { groot: duur(mn), klein: 'doorlooptijd', label: `${p.titel}: ${duur(mn)}` })}${zonder(zonderTijd)}</div></div><div class="detail">${d0}${det}</div></div></div>`;
  };
  const nogNiets = PS.filter((p) => !p.delen.length);
  const onbTok = delen.length - metTok.length;
  const paneel4 = !delen.length ? `<div class="card"><p class="leeg">Nog geen uitvoeringen vastgelegd in de plannen. Tokens en tijd verschijnen hier zodra een fase is gebouwd en gemeten.</p></div>` : `<input class="vh" type="radio" name="maat" id="m-tok" checked><input class="vh" type="radio" name="maat" id="m-tijd">
    <div class="maten">
      <label class="maat card" for="m-tok"><span class="l">Uitvoertokens</span><span class="groot">${n(totUit)}</span><span class="sub">invoer (zonder cache) ${n(totIn)}${onbTok ? ` · bij ${onbTok} van de ${delen.length} uitvoeringen niet gemeten` : ''}</span><span class="keuze"></span></label>
      <label class="maat card" for="m-tijd"><span class="l">Doorlooptijd</span><span class="groot">${duur(totMin)}</span><span class="sub">som van start tot einde per uitvoering, inclusief wachten en toesteltest</span><span class="keuze"></span></label>
    </div>
    <div class="card"><div class="kaartkop"><h3>Per model en effort</h3><span class="sub">kleur = model · lichter = hoger effort · gearceerd = effort niet gemeten</span></div>${totaalDeel('tok')}${totaalDeel('tijd')}<p class="klein afw">${esc(afwTekst)}</p></div>
    <div class="kaarten">${PS.filter((p) => p.delen.length).map(kaartVoor).join('')}</div>
    ${nogNiets.length ? `<p class="leeg ruim">Nog niet uitgevoerd: ${nogNiets.map((p) => esc(p.titel)).join(', ')}.</p>` : ''}`;

  /* ---------- tegels en pagina ---------- */
  const maxDelen = Math.max(0, ...P.map((p) => p.delen.length));
  const TABS = [
    ['standaard', 'Standaard', `<span class="v s-${SC.kleur}" style="color:var(--s)">${SC.gehaald}<small>/${SC.totaal}</small></span><span class="s">${badge(SC.kleur)} ${fail.length ? `${meer(fail.length, 'criterium', 'criteria')} niet gehaald` : 'alles gehaald'}</span>`, paneel1],
    ['nu', 'Waar we staan', P.length ? `<span class="v">${tel.gebouwd}<small>/${meer(alleF.length, 'fase', 'fasen')}</small></span><span class="s">gebouwd, in ${meer(P.length, 'plan', 'plannen')}</span>` : '<span class="v">–</span><span class="s">nog geen plannen</span>', paneel2],
    ['volgende', 'Volgende stap', P.length ? `<span class="v">${wachtend}<small>/${meer(P.length, 'plan', 'plannen')}</small></span><span class="s">wachten op jou${klaar ? ` · ${meer(klaar, 'fase kan', 'fasen kunnen')} starten` : ''}</span>` : '<span class="v">–</span><span class="s">nog geen plannen</span>', paneel3],
    ['effort', 'Effort', delen.length ? `<span class="v">${kort(totUit)}<small> tokens</small></span><span class="s">${duur(totMin)} doorlooptijd</span>` : '<span class="v">–</span><span class="s">nog niets uitgevoerd</span>', paneel4],
  ];
  const gemaakt = lokaal(D.gegenereerd, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + (tijdzone ? '' : ' UTC');
  const blok = gegevens ? `<script id="brbnt-data" type="application/json">${JSON.stringify(gegevens).replace(/</g, '\\u003c')}</script>\n` : '';

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#1c1c1c">
<title>BRBNT-dashboard · ${esc(D.project.naam)}</title>
<style>
${font}
:root{
  --brand:#FFDD25; --page:#1c1c1c; --card:#2e2e2e; --line:#3d3d3d;
  --text:#f5f5f5; --text2:#c9c9c9; --muted:#9a9a9a;
  --groen:#4cc38a; --amber:#F0A13E; --rood:#ff7276; --blauw:#7fb2f0; --nvt:#7a7a7a;
  --font:"Montserrat",ui-sans-serif,system-ui,"Segoe UI",sans-serif;
  color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--page);color:var(--text);font:14px/1.45 var(--font)}
main{max-width:1200px;margin:0 auto;padding:20px 16px 48px}
a{color:inherit;text-decoration-color:#ffffff55;text-underline-offset:2px}
a:hover{text-decoration-color:var(--brand)}
h1{font-size:22px;margin:0;letter-spacing:-.01em}
h3{font-size:15px;margin:0}
h4{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 6px}
small,.sub{color:var(--muted);font-size:12px}
.muted{color:var(--muted)}
.klein{font-size:12.5px;color:var(--text2)}
.nowrap{white-space:nowrap}
code{font-family:ui-monospace,Consolas,monospace;font-size:11.5px;border:1px solid var(--line);border-radius:5px;padding:0 5px;color:var(--text2)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0}
.card + .card{margin-top:14px}
.kaartkop{display:flex;justify-content:space-between;align-items:baseline;gap:6px 12px;flex-wrap:wrap;margin-bottom:10px}
.leeg{color:var(--muted);font-size:12.5px;margin:8px 0 0}
.leeg.ruim{margin-top:14px}
.kop{margin-bottom:16px}
.vh{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
.groot{font-size:28px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}
.groot small{font-size:14px;font-weight:600}
.groot.goed{color:var(--groen)} .groot.slecht{color:var(--rood)}
summary{list-style:none;cursor:pointer}
summary::-webkit-details-marker{display:none}
.pijl::before{content:'▸';color:var(--text2);font-size:14px;display:inline-block;transition:transform .15s}
details[open] > summary .pijl::before{transform:rotate(90deg)}

/* tabs: vier tegels, zonder script */
.tegels{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}
.tegel{display:flex;flex-direction:column;gap:4px;cursor:pointer;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;transition:border-color .1s,background .1s}
.tegel:hover{border-color:#5a5a5a}
.tegel .q{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}
.tegel .v{font-size:28px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums}
.tegel .v small{font-size:14px;color:var(--muted);font-weight:600}
.tegel .s{font-size:12px;color:var(--text2)}
#t-standaard:checked ~ .tegels [for=t-standaard],#t-nu:checked ~ .tegels [for=t-nu],#t-volgende:checked ~ .tegels [for=t-volgende],#t-effort:checked ~ .tegels [for=t-effort]{background:#353535;border-color:var(--brand);box-shadow:inset 0 3px 0 var(--brand)}
#t-standaard:checked ~ .tegels [for=t-standaard] .q,#t-nu:checked ~ .tegels [for=t-nu] .q,#t-volgende:checked ~ .tegels [for=t-volgende] .q,#t-effort:checked ~ .tegels [for=t-effort] .q{color:var(--brand)}
#t-standaard:focus-visible ~ .tegels [for=t-standaard],#t-nu:focus-visible ~ .tegels [for=t-nu],#t-volgende:focus-visible ~ .tegels [for=t-volgende],#t-effort:focus-visible ~ .tegels [for=t-effort]{outline:2px solid var(--brand);outline-offset:2px}
.paneel{display:none}
#t-standaard:checked ~ #p-standaard,#t-nu:checked ~ #p-nu,#t-volgende:checked ~ #p-volgende,#t-effort:checked ~ #p-effort{display:block}
@media (max-width:900px){.tegels{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* status: altijd kleur plus teken en woord */
.s-groen{--s:var(--groen)} .s-amber{--s:var(--amber)} .s-rood{--s:var(--rood)} .s-nvt{--s:var(--nvt)}
.badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:1px 9px 1px 3px;font-size:11.5px;font-weight:700;color:var(--s);background:color-mix(in srgb,var(--s) 14%,transparent);border:1px solid color-mix(in srgb,var(--s) 45%,transparent);white-space:nowrap}
.badge i{width:15px;height:15px;border-radius:50%;background:var(--s);color:#141414;display:grid;place-items:center;font-style:normal;font-size:10px;font-weight:900}

/* Standaard: per laag in- en uitklappen */
details.laag{border-top:1px solid #ffffff10}
details.laag:first-of-type{border-top:0}
details.laag > summary{display:grid;grid-template-columns:16px minmax(120px,200px) minmax(60px,1fr) 44px 124px 12px;grid-template-areas:"nr nm bar fr bd pl";gap:12px;align-items:center;padding:8px 4px;border-radius:8px}
details.laag > summary:hover{background:#ffffff08}
.laag .nr{grid-area:nr;color:var(--muted);font-weight:800;font-size:12px}
.laag .nm{grid-area:nm;font-weight:700}
.laag .nm small{display:block;font-weight:500;font-size:11.5px}
.laag .sbar{grid-area:bar}
.laag .fr{grid-area:fr;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.laag .badge{grid-area:bd;justify-self:start}
.laag .pijl{grid-area:pl}
.sbar{height:10px;border-radius:5px;background:#ffffff12;overflow:hidden;display:block}
.sbar > span{display:block;height:100%;background:var(--s);border-radius:5px}
@media (max-width:600px){details.laag > summary{grid-template-columns:16px minmax(0,1fr) auto 12px;grid-template-areas:"nr nm fr pl" ". bar bd .";row-gap:6px}}
.criteria{padding:2px 4px 10px 32px}
.crit{display:grid;grid-template-columns:20px 34px minmax(0,1fr);gap:8px;padding:6px 0;font-size:13px;border-top:1px solid #ffffff0a}
.crit:first-child{border-top:0}
.crit .ic{width:18px;height:18px;border-radius:50%;background:var(--s);color:#141414;display:grid;place-items:center;font-size:10px;font-weight:900;margin-top:1px}
.crit .id{font-variant-numeric:tabular-nums;color:var(--text2)}
.crit.s-rood .id{color:var(--rood)}
.crit small{display:block}
.crit ul{margin:4px 0 0;padding-left:18px;font-size:12px;color:var(--text2)}
details.sectie{margin-top:10px;border-top:1px solid var(--line)}
details.sectie + details.sectie{margin-top:0}
details.sectie > summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 4px;border-radius:8px}
details.sectie > summary:hover{background:#ffffff08}
details.sectie > summary h4{margin:0}
.sectie-inhoud{padding:0 4px 8px 24px}
@media (max-width:600px){.sectie-inhoud{padding-left:4px}}
.teller{display:inline-grid;place-items:center;min-width:22px;height:20px;padding:0 7px;border-radius:999px;font-size:11.5px;font-weight:800;line-height:1;color:#141414;background:var(--s);font-variant-numeric:tabular-nums}
.sig{display:grid;grid-template-columns:78px minmax(0,1fr);gap:10px;align-items:baseline;padding:5px 0;font-size:13px}
.sig .badge{justify-self:start}
.sig small{display:block;font-size:12px;overflow-wrap:anywhere}
@media (max-width:600px){.criteria{padding-left:4px}}
.cijfers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 20px;margin-bottom:16px}
.cijfers > div{display:flex;flex-direction:column;gap:2px}
@media (max-width:800px){.cijfers{grid-template-columns:repeat(2,minmax(0,1fr))}}
.grafiek{position:relative;height:170px;margin:26px 0 4px 40px}
.grafiek .lijn{position:absolute;left:0;right:0;border-top:1px dashed #ffffff1a}
.grafiek .lijn.nul{border-top:1px solid #555}
.grafiek .lab{position:absolute;left:-40px;width:32px;text-align:right;font-size:11px;color:var(--muted);transform:translateY(50%)}
.staven{position:absolute;inset:0;display:flex;align-items:flex-end;gap:4px}
.staaf{position:relative;flex:1;min-width:3px;border-radius:3px 3px 0 0}
.staaf.ok{background:var(--groen)} .staaf.fout{background:var(--rood)} .staaf.anders{background:var(--nvt)}
.staaf:is(:hover,:focus){outline:2px solid var(--text);outline-offset:1px}
.as{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--muted);margin:6px 0 10px 40px}
.legenda{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--text2)}
.legenda > span{display:inline-flex;align-items:center;gap:6px}
.legenda b{color:var(--text)}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.dot.ok{background:var(--groen)} .dot.fout{background:var(--rood)} .dot.anders{background:var(--nvt)}

/* tooltips zonder script: het kind wordt zichtbaar bij aanwijzen of focus */
.tip{display:none;position:absolute;left:0;z-index:5;width:max-content;max-width:min(440px,100%);background:#141414;border:1px solid #555;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;color:var(--text2);box-shadow:0 8px 24px #000a;font-weight:500;text-align:left;pointer-events:none}
.tip b{color:var(--text)}
:is(.staaf,.f):is(:hover,:focus) > .tip{display:block}
.staaf .tip{bottom:calc(100% + 8px);max-width:340px}
.staaf.rechts .tip{left:auto;right:0}
@media (max-width:640px){.staaf{position:static}.staaf .tip,.staaf.rechts .tip{left:0;right:0;width:auto;max-width:none}}

/* Waar we staan */
.verdeling{display:flex;gap:2px;height:18px;border-radius:5px;overflow:hidden;margin:4px 0 10px}
.v-gebouwd,.f.gebouwd{background:var(--groen);color:#10261b}
.v-lopend,.f.lopend{background:var(--brand);color:#282828}
.v-vrijgegeven,.f.vrijgegeven{background:var(--blauw);color:#14233a}
.v-vrijgegeven-na{background:color-mix(in srgb,var(--blauw) 35%,var(--card))}
.f.vrijgegeven-na{background:color-mix(in srgb,var(--blauw) 22%,transparent);border:1.5px solid var(--blauw);color:var(--blauw)}
.v-wacht{background:var(--amber)}
.f.wacht{background:color-mix(in srgb,var(--amber) 22%,transparent);border:1.5px solid var(--amber);color:var(--amber)}
.v-vervallen{background:color-mix(in srgb,var(--rood) 60%,var(--card))}
.f.vervallen{border:1.5px dashed var(--rood);color:var(--rood)}
.v-niet{background:#4a4a4a}
.f.niet{border:1.5px solid #555;color:var(--muted)}
.legenda .f{width:14px;height:12px;padding:0}
.plan{display:grid;grid-template-columns:minmax(0,250px) minmax(0,1fr) 64px;gap:14px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.plan .t{font-weight:700;font-size:13.5px}
.plan .t small{display:block;font-weight:500}
.plan .t a{text-decoration:none}.plan .t a:hover{text-decoration:underline}
.plan .tel{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
.plan .tel small{display:block;font-weight:500;font-size:11px}
@media (max-width:720px){.plan{grid-template-columns:1fr 56px}.plan .strip{grid-column:1/-1;grid-row:2}}
.strip{position:relative;display:flex;flex-wrap:wrap;gap:3px}
.strip .tip{top:calc(100% + 6px)}
.f{width:26px;height:22px;border-radius:4px;display:grid;place-items:center;font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;cursor:default}
.f:is(:hover,:focus){outline:2px solid var(--text);outline-offset:1px}

/* Volgende stap: per plan in- en uitklappen, met een chip per soort */
details.stapplan{border-top:1px solid var(--line)}
details.stapplan > summary{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:11px 4px;border-radius:8px}
details.stapplan > summary:hover{background:#ffffff08}
.stapplan .t{font-weight:700;font-size:13.5px}
.stapplan .t small{display:block;font-weight:500}
.chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.chip b{font-weight:800}
.chip.besluit,.soort.besluit{color:#241703;background:var(--amber)}
.chip.vrij,.soort.vrij{color:var(--amber);border:1px solid color-mix(in srgb,var(--amber) 60%,transparent)}
.chip.bouw,.soort.bouw{color:var(--blauw);border:1px solid color-mix(in srgb,var(--blauw) 60%,transparent)}
.chip.lopend,.soort.lopend{color:#282828;background:var(--brand)}
@media (max-width:600px){details.stapplan > summary{grid-template-columns:12px minmax(0,1fr)}.chips{grid-column:2;justify-content:flex-start}}
.inhoud{padding:2px 4px 14px 28px}
.inhoud ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px;font-size:13px}
.inhoud li{display:grid;grid-template-columns:74px 1fr;gap:10px;align-items:baseline}
.inhoud li small{margin-left:4px}
.soort{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;border-radius:5px;padding:1px 6px;text-align:center}
.doc{margin:12px 0 0;font-size:13px}
.doc a{text-decoration:none;color:var(--brand)}.doc a:hover{text-decoration:underline}
@media (max-width:600px){.inhoud{padding-left:4px}}

/* Effort: tokens of tijd kiezen, met de grote blokken als schakelaar */
.maten{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.maten > .maat{display:flex;flex-direction:column;gap:2px;cursor:pointer;margin:0;transition:border-color .1s,background .1s}
.maat:hover{border-color:#5a5a5a}
.maat .l{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)}
.maat .keuze{margin-top:8px;font-size:11.5px;color:var(--muted)}
.maat .keuze::before{content:'○ klik om dit in de donuts te tonen'}
#m-tok:checked ~ .maten [for=m-tok],#m-tijd:checked ~ .maten [for=m-tijd]{border-color:var(--brand);box-shadow:inset 0 3px 0 var(--brand);background:#353535}
#m-tok:checked ~ .maten [for=m-tok] .keuze::before,#m-tijd:checked ~ .maten [for=m-tijd] .keuze::before{content:'● de donuts tonen dit';color:var(--brand)}
#m-tok:focus-visible ~ .maten [for=m-tok],#m-tijd:focus-visible ~ .maten [for=m-tijd]{outline:2px solid var(--brand);outline-offset:2px}
#m-tok:checked ~ * .als-tijd,#m-tijd:checked ~ * .als-tok{display:none}
.totaal-inhoud{display:grid;grid-template-columns:200px minmax(0,1fr);gap:28px;align-items:center}
@media (max-width:700px){.totaal-inhoud{grid-template-columns:1fr;gap:12px}.totaal-inhoud .ring{max-width:200px;margin:0 auto}}
.lgrid{display:flex;flex-direction:column;max-width:660px}
.lrij{display:grid;grid-template-columns:14px minmax(0,1fr) 92px 92px 104px;gap:10px;align-items:center;padding:6px 6px;border-radius:6px;font-size:13px;transition:opacity .1s}
.drie .lrij{grid-template-columns:14px minmax(0,1fr) 92px 104px}
.lrij.kop .kort{display:none}
.lrij.kop{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding-top:0}
.lrij.tot{border-top:1px solid var(--line);font-weight:700;margin-top:2px}
.lrij[data-k]:hover{background:#ffffff0a}
.lrij .r{text-align:right;font-variant-numeric:tabular-nums}
.lrij .w{font-weight:700}
@media (max-width:600px){.lrij{grid-template-columns:12px minmax(0,1fr) 38px 48px 78px;gap:6px;padding:6px 2px}.drie .lrij{grid-template-columns:12px minmax(0,1fr) 44px 78px}.lrij.kop{font-size:9.5px;letter-spacing:.02em}.lrij.kop .lang{display:none}.lrij.kop .kort{display:inline}}
.afw{margin:12px 0 0}
.vlak{width:12px;height:12px;flex:none;vertical-align:-1px;margin-right:6px}
.lrij .vlak{margin-right:0;display:block}
.kaarten{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:14px;margin-top:14px}
.kaarten .card{margin:0}
@media (max-width:520px){.kaarten{grid-template-columns:1fr}}
.kk{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:10px}
.kk small{white-space:nowrap}
.lijf{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;align-items:center}
@media (max-width:420px){.lijf{grid-template-columns:1fr}.lijf .ring{max-width:170px;margin:0 auto}}
.ring svg{width:100%;height:auto;display:block}
.ring path,.ring circle[data-k],.ring circle[data-d]{transition:opacity .1s;outline:none}
.ring [data-d]:focus-visible,.ring [data-k]:focus-visible{stroke:#fff;stroke-width:2}
.cg{fill:var(--text);font-size:17px;font-weight:800;text-anchor:middle;font-family:var(--font)}
.ck{fill:var(--muted);font-size:10px;text-anchor:middle;font-family:var(--font)}
.cd{visibility:hidden}
.zonder{display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:center;margin-top:6px;font-size:11px}
.fchip{border:1px dashed #666;border-radius:5px;padding:0 5px;color:var(--text2);cursor:default;transition:opacity .1s}
.fchip:is(:hover,:focus){border-color:var(--text);outline:none}
.detail{display:grid;font-size:12.5px;color:var(--text2);line-height:1.55}
.detail > *{grid-area:1/1;visibility:hidden}
.detail > .d0{visibility:visible}
.detail b{color:var(--text)}
.deel{display:flex;flex-direction:column;gap:7px;min-width:0}
.dk{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.fase{font-weight:800;font-size:12px;color:var(--text);background:#404040;border-radius:5px;padding:1px 7px}
.mdl{display:inline-flex;align-items:center;font-size:12.5px;font-weight:600;color:var(--text)}
.pl{font-size:11px;font-weight:700;border-radius:999px;padding:0 8px;white-space:nowrap}
.pl.ok{color:var(--groen);border:1px solid color-mix(in srgb,var(--groen) 50%,transparent)}
.pl.let{color:var(--amber);border:1px solid color-mix(in srgb,var(--amber) 50%,transparent)}
.pl.grijs{color:var(--muted);border:1px solid #555}
.dt{margin:0;color:var(--text2);font-size:12.5px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ds{display:flex;flex-wrap:wrap;gap:6px 22px}
.ds > div{display:flex;flex-direction:column}
.ds b{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2}
.ds span{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.dv{font-size:11.5px;color:var(--muted)}
.dm{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--text2)}
.hint{font-size:11.5px;color:var(--muted)}
${aanwijsCss('.kaart', 'd', maxDelen)}
${aanwijsCss('.totaal-inhoud', 'k', comboRij.length)}
@media (max-width:480px){.groot{font-size:21px}.maten{gap:8px}.maat{padding:12px}.tegels{gap:8px}.tegel{padding:10px 12px}.tegel .v{font-size:22px}.tegel .s{font-size:11px}.tegel .s .badge{display:none}.cijfers .groot{font-size:21px}}
footer{margin-top:28px;color:var(--muted);font-size:11.5px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media print{.paneel{display:block!important;break-before:page}.tegels{display:none}}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${[...Object.keys(TINT), 'anders'].map((m) => `<pattern id="arcering-${m}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${tint(m, 'medium')}"/><rect width="2.5" height="6" fill="${TINT[m] ? TINT[m][0] : '#555'}"/></pattern>`).join('')}</defs></svg>
<main>
<header class="kop"><h1>${esc(D.project.naam)}</h1><div class="sub">BRBNT-scan van ${esc(gemaakt)} · ${gh && D.bron?.commit ? link(`${gh}/commit/${D.bron.commit}`, `commit ${esc(D.bron.kort)}`) : `commit ${esc(D.bron?.kort || '?')}`} · criteria versie ${esc(SC.versie)}</div></header>
${TABS.map(([id], i) => `<input class="vh" type="radio" name="vraag" id="t-${id}"${i === 0 ? ' checked' : ''}>`).join('\n')}
<nav class="tegels" aria-label="Onderdelen">${TABS.map(([id, naam, inhoud]) => `<label class="tegel" for="t-${id}"><span class="q">${naam}</span>${inhoud}</label>`).join('')}</nav>
${TABS.map(([id, naam, , paneel]) => `<section class="paneel" id="p-${id}" aria-label="${esc(naam)}">${paneel}</section>`).join('\n')}
<footer><span>Gemaakt door de skill brbnt-scan. Alles gemeten, niets geschat; wat niet te meten was, staat er als onbekend.</span>${gh ? link(gh, 'Repository op GitHub →') : ''}</footer>
</main>
${blok}</body>
</html>
`;
}
