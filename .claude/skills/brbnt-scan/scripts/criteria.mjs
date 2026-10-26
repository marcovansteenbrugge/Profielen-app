// BRBNT-scan: de criteria per laag. EEN bron; een criterium toevoegen is een regel erbij.
// Verhoog CRITERIA_VERSIE bij elke inhoudelijke wijziging: "sinds vorige scan" vergelijkt alleen gelijke versies.
// Elk criterium levert { oordeel, bewijs, items? } met oordeel 'gehaald' | 'niet' | 'nvt' | 'onbekend'.
// Score per laag = gehaald / (gehaald + niet). Alles gehaald groen, vanaf 75% amber, daaronder rood.
//
// Versies: 1 eerste lijst. 2 een leeg geheugen telt bij 2.8 als niet gehaald (was n.v.t.).
// 3 criterium 4.4 kijkt per testbestand of het in CI draait (was per testlaag).
// 4 criterium 3.8 telt ook de prefix uit de kolom Commit-prefix van een plan (zoals CMS-F2:, naast F2:); testklassen van
//   .NET (*Tests.cs in een testproject) tellen als testbestand bij 4.1, 4.4 en 4.5; tests in .claude/ (van een skill) niet meer.
// 5 criterium 5.2 is ook gehaald als CLAUDE.md vastlegt dat werk direct op de hoofdtak mag (was alleen via pull requests).
// Geen nieuwe versie nodig als alleen verandert WAT te meten is (zoals 1.4 en 5.3 die in CI "niet te
// meten" werden): vergelijken gebeurt toch alleen over criteria die in beide scans gemeten zijn.

export const CRITERIA_VERSIE = 5;
export const DREMPELS = { ciRuns: 30, ciMinPct: 90, wachtDagen: 7, worktreeDagen: 14, geheugenDagen: 30, prCommits: 50 };

const ok = (bewijs, items) => ({ oordeel: 'gehaald', bewijs, items });
const niet = (bewijs, items) => ({ oordeel: 'niet', bewijs, items });
const nvt = (bewijs) => ({ oordeel: 'nvt', bewijs });
const onbekend = (bewijs) => ({ oordeel: 'onbekend', bewijs });
const dagenGeleden = (iso, nu) => (nu - new Date(String(iso).replace(' ', 'T'))) / 86400000;
const DATUM_RE = /\b(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2} (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)( \d{4})?)\b/i;
const gebouwdeFasen = (p) => (p.evaluatie?.fases || []).filter((f) => f.soort === 'gebouwd').map((f) => f.id);

/**
 * De zin in CLAUDE.md die vastlegt dat werk direct op de hoofdtak mag (het sjabloon van brbnt-project-setup vraagt "wanneer
 * direct op main mag"), of null. Een ontkenning vlak ervoor of erna ("nooit direct op main", "direct op main mag niet") en een
 * niet ingevulde placeholder ({{...}}) tellen niet.
 */
export function directOpHoofdtak(md, hoofdtak = 'main') {
  const tak = String(hoofdtak).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const frase = new RegExp(`\\b(direct|directly|rechtstreeks)\\s+(op|naar|on|to|into)\\s+(de\\s+|the\\s+)?(${tak}|hoofdtak|main branch)\\b`, 'i');
  for (const regel of String(md || '').split('\n')) {
    if (regel.includes('{{')) continue;
    for (const zin of regel.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').split(/(?<=[.!?;])\s+/)) {
      const m = frase.exec(zin);
      if (!m) continue;
      if (/\b(nooit|niet|never|not|no|geen)\b(\s+\S+){0,3}\s*$/i.test(zin.slice(0, m.index))) continue;
      if (/^\W*(\S+\s+){0,3}?(niet|nooit|not|never|verboden|forbidden)\b/i.test(zin.slice(m.index + m[0].length))) continue;
      return zin.replace(/\*\*/g, '').trim();
    }
  }
  return null;
}

export const LAGEN = [
  { nr: 1, naam: 'Werkregels', skill: 'brbnt-project-setup' },
  { nr: 2, naam: 'Geheugen', skill: 'brbnt-memory' },
  { nr: 3, naam: 'Plan en besluit', skill: 'brbnt-plan' },
  { nr: 4, naam: 'Afdwinging', skill: 'brbnt-skill-scaffold' },
  { nr: 5, naam: 'Parallel werken', skill: 'brbnt-parallel-setup' },
  { nr: 6, naam: 'Modelgebruik', skill: 'brbnt-plan' },
];

export const CRITERIA = [
  // ---------- Laag 1: werkregels ----------
  { id: '1.1', criterium: 'CLAUDE.md staat in de root', skill: 'brbnt-project-setup',
    meet: ({ d }) => (d.laag1.claude.bytes ? ok(`CLAUDE.md, ${d.laag1.claude.regels} regels`) : niet('Geen CLAUDE.md in de root')) },
  { id: '1.2', criterium: 'Sectie "Plan en besluit" met de markering op de huidige versie (v1)', skill: 'brbnt-project-setup',
    meet: ({ d }) => (d.laag1.claude.markering === 'v1' ? ok('Markering brbnt-plan-regel: v1 gevonden') : niet(d.laag1.claude.markering ? `Markering ${d.laag1.claude.markering}, huidige versie is v1` : 'Geen markering brbnt-plan-regel')) },
  { id: '1.3', criterium: 'Vereisten V1 tot en met V5 zijn aanwezig', skill: 'brbnt-project-setup',
    meet: ({ d }) => { const mis = d.laag1.vereisten.filter((v) => /^V[1-5]$/.test(v.id) && v.oordeel !== 'aanwezig'); return mis.length ? niet(`${mis.length} van 5 ontbreekt`, mis.map((v) => `${v.id} ${v.naam}${v.toelichting ? ': ' + v.toelichting : ''}`)) : ok('V1 tot en met V5 aanwezig'); } },
  { id: '1.4', criterium: 'Minstens één regel wordt aantoonbaar afgedwongen', skill: 'brbnt-project-setup',
    meet: ({ d }) => { const r = d.laag1.claude.secties.flatMap((s) => s.lijst || []); if (!d.laag1.claude.bytes) return niet('Geen CLAUDE.md'); const af = r.filter((x) => x.afdwinging.some((a) => a.gevonden)); if (af.length) return ok(`${af.length} van ${r.length} regels noemen een bestaande test, hook of check`, af.map((x) => x.titel)); const buiten = r.filter((x) => x.afdwinging.some((a) => a.buitenRepo)); return buiten.length ? onbekend(`Alleen bewaking buiten de repo genoemd, hier niet te controleren (${buiten.map((x) => x.titel).join('; ')})`) : niet(`Geen van de ${r.length} regels noemt een test, hook of check die bestaat`); } },
  { id: '1.5', criterium: 'Elke bewaking die CLAUDE.md noemt, bestaat ook', skill: 'brbnt-project-setup',
    meet: ({ d }) => { const refs = d.laag1.claude.secties.flatMap((s) => (s.lijst || []).flatMap((x) => x.afdwinging)); if (!refs.length) return nvt('CLAUDE.md noemt geen bewaking'); const buiten = refs.filter((a) => a.buitenRepo && !a.gevonden); const mis = refs.filter((a) => !a.gevonden && !a.buitenRepo); const noot = buiten.length ? ` (${buiten.length} buiten de repo, hier niet te controleren: ${buiten.map((a) => a.pad).join(', ')})` : ''; return mis.length ? niet(`${mis.length} genoemde bewaking(en) niet gevonden${noot}`, mis.map((a) => a.pad)) : ok(`Alle ${refs.length - buiten.length} genoemde bewakingen in de repo bestaan${noot}`); } },

  // ---------- Laag 2: geheugen ----------
  { id: '2.1', criterium: 'memory/MEMORY.md staat in de repo', skill: 'brbnt-project-setup',
    meet: ({ d }) => (d.laag2.index.inGit ? ok('memory/MEMORY.md is gecommit') : niet(d.laag2.index.md ? 'memory/MEMORY.md bestaat, maar staat niet in versiebeheer' : 'Geen memory/MEMORY.md')) },
  { id: '2.2', criterium: 'Index en map sluiten op elkaar, in beide richtingen', skill: 'brbnt-memory',
    meet: ({ d }) => { const p = d.laag2.problemen; const n = p.nietInIndex.length + p.indexZonderBestand.length; if (!d.laag2.memories.length && !d.laag2.index.regels) return nvt('Nog geen memories'); return n ? niet(`${n} afwijking(en)`, [...p.nietInIndex.map((f) => `${f}: niet in de index`), ...p.indexZonderBestand.map((f) => `${f}: indexregel zonder bestand`)]) : ok(`${d.laag2.memories.length} bestanden, ${d.laag2.index.regels} indexregels`); } },
  { id: '2.3', criterium: 'Elke memory heeft name, description en een geldig type', skill: 'brbnt-memory',
    meet: ({ d }) => { if (!d.laag2.memories.length) return nvt('Nog geen memories'); const mis = d.laag2.memories.filter((m) => !m.naam || !m.beschrijving || !['feedback', 'project', 'reference', 'user'].includes(m.type)); return mis.length ? niet(`${mis.length} onvolledig`, mis.map((m) => m.bestand)) : ok(`Alle ${d.laag2.memories.length} compleet`); } },
  { id: '2.4', criterium: 'Geen kapotte [[links]]', skill: 'brbnt-memory',
    meet: ({ d }) => { if (!d.laag2.memories.length) return nvt('Nog geen memories'); const k = d.laag2.problemen.kapotteLinks; return k.length ? niet(`${k.length} link(s) wijzen nergens heen`, k.map((x) => `${x.van} → ${x.naar}`)) : ok('Alle links wijzen naar een bestaande memory'); } },
  { id: '2.5', criterium: 'Elke feedback-memory heeft Why én How to apply', skill: 'brbnt-memory',
    meet: ({ d }) => { const f = d.laag2.memories.filter((m) => m.type === 'feedback'); if (!f.length) return nvt('Geen feedback-memories'); const mis = f.filter((m) => !m.why || !m.how); return mis.length ? niet(`${mis.length} van ${f.length} onvolledig`, mis.map((m) => `${m.naam}: mist ${[!m.why && 'Why', !m.how && 'How to apply'].filter(Boolean).join(' en ')}`)) : ok(`Alle ${f.length} compleet`); } },
  { id: '2.6', criterium: 'Elke project-memory heeft een Why', skill: 'brbnt-memory',
    meet: ({ d }) => { const f = d.laag2.memories.filter((m) => m.type === 'project'); if (!f.length) return nvt('Geen project-memories'); const mis = f.filter((m) => !m.why); return mis.length ? niet(`${mis.length} van ${f.length} zonder Why`, mis.map((m) => m.naam)) : ok(`Alle ${f.length} met Why`); } },
  { id: '2.7', criterium: 'Elke memory noemt een datum als herkomst (user-memory uitgezonderd)', skill: 'brbnt-memory',
    meet: ({ d }) => { const f = d.laag2.memories.filter((m) => m.type !== 'user'); if (!f.length) return nvt('Nog geen memories'); const mis = f.filter((m) => !DATUM_RE.test(m.md) && !DATUM_RE.test(m.hook || '')); return mis.length ? niet(`${mis.length} zonder datum`, mis.map((m) => m.naam)) : ok(`Alle ${f.length} noemen een datum`); } },
  { id: '2.8', criterium: 'Het geheugen leeft: iets gewijzigd in de laatste 30 dagen', skill: 'brbnt-memory',
    meet: ({ d, nu }) => { if (!d.laag2.memories.length) return niet(`Het archief in de repo is leeg${d.laag2.buitenRepo?.aantal ? `; ${d.laag2.buitenRepo.aantal} memories staan alleen buiten de repo, op de machine die scande` : ''}`); const r = d.laag2.memories.filter((m) => { const t = m.gewijzigd || m.git?.laatst?.datum; return t && dagenGeleden(t, nu) <= DREMPELS.geheugenDagen; }); return r.length ? ok(`${r.length} memories gewijzigd in de laatste ${DREMPELS.geheugenDagen} dagen`) : niet(`Niets gewijzigd in ${DREMPELS.geheugenDagen} dagen`); } },

  // ---------- Laag 3: plan en besluit ----------
  { id: '3.1', criterium: 'Docs-map met plan-beslis-index.md', skill: 'brbnt-plan',
    meet: ({ d }) => (d.laag3.docsDir && d.laag3.index ? ok(`${d.laag3.docsDir}/plan-beslis-index.md`) : niet(d.laag3.docsDir ? 'Docs-map zonder index' : 'Geen docs-map')) },
  { id: '3.2', criterium: 'Minstens één plan in het standaardformaat (plan + beslisdocument)', skill: 'brbnt-plan',
    meet: ({ d }) => { const p = d.laag3.plannen.filter((x) => x.beslisMd); return p.length ? ok(`${p.length} plan(nen)`, p.map((x) => x.naam)) : niet('Geen <naam>.plan.md met beslisdocument'); } },
  { id: '3.3', criterium: 'De index en de statussen kloppen met wat sync berekent', skill: 'brbnt-plan',
    meet: ({ d }) => { const s = d.laag3.sync; if (!d.laag3.plannen.length) return nvt('Geen plannen'); if (!d.laag3.planScriptBeschikbaar) return onbekend('plan.mjs niet beschikbaar'); if (!s) return onbekend('sync niet gedraaid'); if (s.fout) return onbekend(s.fout); return s.gewijzigd.length ? niet('sync zou bestanden aanpassen', s.gewijzigd) : ok('sync (droogloop): niets aan te passen'); } },
  { id: '3.4', criterium: 'Elk genomen besluit heeft wie, wanneer en via wat', skill: 'brbnt-plan',
    meet: ({ d }) => { const k = d.laag3.plannen.flatMap((p) => p.kaarten.filter((x) => !/⏳/.test(x.glyph)).map((x) => ({ ...x, plan: p.naam }))); if (!k.length) return nvt('Nog geen genomen besluiten'); const mis = k.filter((x) => !x.besluitDoor || !x.op || !x.via); return mis.length ? niet(`${mis.length} van ${k.length} zonder volledige vastlegging`, mis.map((x) => `${x.plan} ${x.id} ${x.onderwerp}`)) : ok(`Alle ${k.length} besluiten volledig vastgelegd`); } },
  { id: '3.5', criterium: 'Elke vrijgave heeft een naam, een tijdstip en een planversie', skill: 'brbnt-plan',
    meet: ({ d }) => { const v = d.laag3.plannen.flatMap((p) => p.vrijgave.filter((r) => /✅|⚠/.test(r.Vrijgave || '')).map((r) => ({ ...r, plan: p.naam }))); if (!v.length) return nvt('Nog geen vrijgaven'); const mis = v.filter((r) => !/versie\s+\d+/i.test(r.Vrijgave) || !/\d{4}-\d{2}-\d{2}/.test(r['Door, wanneer'] || '') || !/[A-Za-z]/.test((r['Door, wanneer'] || '').replace(/\d{4}-\d{2}-\d{2}.*/, ''))); return mis.length ? niet(`${mis.length} onvolledig`, mis.map((r) => `${r.plan} ${r.Fase}`)) : ok(`Alle ${v.length} vrijgaven volledig`); } },
  { id: '3.6', criterium: 'Elke gebouwde fase haalt de toets-poort (plan.mjs toets)', skill: 'brbnt-plan',
    meet: ({ d, plan }) => { if (!d.laag3.plannen.length) return nvt('Geen plannen'); if (!plan?.checkToets) return onbekend('plan.mjs niet beschikbaar'); const r = d.laag3.plannen.flatMap((p) => gebouwdeFasen(p).map((f) => ({ p, f, t: plan.checkToets(p.naam, f, p.planMd) }))); if (!r.length) return nvt('Nog geen gebouwde fasen'); const mis = r.filter((x) => !x.t.toegestaan); return mis.length ? niet(`${mis.length} van ${r.length} geblokkeerd`, mis.map((x) => `${x.p.naam} ${x.f}: ${(x.t.redenen || []).join('; ')}`)) : ok(`${r.length} van ${r.length} gebouwde fasen getoetst per criterium`); } },
  { id: '3.7', criterium: 'De planversie in de kop is de hoogste versie uit het wijzigingslog', skill: 'brbnt-plan',
    meet: ({ d }) => { if (!d.laag3.plannen.length) return nvt('Geen plannen'); const mis = d.laag3.plannen.filter((p) => p.versieKop && p.versieKop !== p.versie); return mis.length ? niet(`${mis.length} plan(nen) wijken af`, mis.map((p) => `${p.naam}: kop v${p.versieKop}, wijzigingslog v${p.versie}`)) : ok('Kop en wijzigingslog gelijk'); } },
  { id: '3.8', criterium: 'Commits voor planwerk dragen de fase-prefix uit het plan (F2: of CMS-F2:)', skill: 'brbnt-plan',
    meet: ({ d }) => { const n = d.laag3.plannen.reduce((a, p) => a + gebouwdeFasen(p).length, 0); if (!n) return nvt('Nog geen gebouwde fasen'); if (!d.bron.git) return onbekend('Geen git'); return d.git.faseCommits > 0 ? ok(`${d.git.faseCommits} commit(s) met een fase-prefix`) : niet(`${n} gebouwde fasen, maar geen enkele commit met een fase-prefix (alle takken doorzocht)`); } },
  { id: '3.9', criterium: 'Niets wacht langer dan 7 dagen op de beslisser', skill: 'brbnt-plan',
    meet: ({ d, nu }) => { if (!d.laag3.plannen.length) return nvt('Geen plannen'); const w = d.laag3.plannen.filter((p) => p.evaluatie?.wachtOpJou && p.evaluatie.wachtOpJou !== '-'); if (!w.length) return ok('Er wacht niets op de beslisser'); const oud = w.filter((p) => { const laatst = [p.voorgelegd, ...p.historie.map((h) => h['Datum en tijd'])].filter(Boolean).sort().pop(); return laatst && dagenGeleden(laatst, nu) > DREMPELS.wachtDagen; }); return oud.length ? niet(`${oud.length} plan(nen) wachten langer dan ${DREMPELS.wachtDagen} dagen`, oud.map((p) => `${p.naam}: ${p.evaluatie.wachtOpJou}`)) : ok(`${w.length} plan(nen) wachten, korter dan ${DREMPELS.wachtDagen} dagen`); } },

  // ---------- Laag 4: afdwinging ----------
  { id: '4.1', criterium: 'Er is een testsuite en die draait in CI', skill: 'brbnt-skill-scaffold',
    meet: ({ d }) => { const t = Object.values(d.laag4.tests.lagen).reduce((a, x) => a + x.bestanden, 0); const wf = d.laag4.workflows.filter((w) => !w.eigen); if (!t) return niet('Geen testbestanden'); if (!wf.length) return niet(`${t} testbestanden, maar geen CI-workflow`); return ok(`${t} testbestanden, workflow ${wf.map((w) => w.pad).join(', ')}`); } },
  { id: '4.2', criterium: 'De laatste run op de hoofdtak is geslaagd', skill: 'brbnt-skill-scaffold',
    meet: ({ d }) => { const c = d.laag4.ci; if (!c.beschikbaar) return onbekend(c.reden); const r = c.laatsteRun?.run; if (!r) return onbekend(`Geen afgeronde run op ${d.bron.hoofdtak}`); return r.conclusion === 'success' ? ok(`Run #${r.number} geslaagd`) : niet(`Run #${r.number}: ${r.conclusion}`); } },
  { id: '4.3', criterium: 'Minstens 90% van de laatste 30 runs is geslaagd (geannuleerd telt niet)', skill: 'brbnt-skill-scaffold',
    meet: ({ d }) => { const c = d.laag4.ci; if (!c.beschikbaar) return onbekend(c.reden); const r = c.runs.filter((x) => x.status === 'completed').slice(0, DREMPELS.ciRuns).filter((x) => x.conclusion !== 'cancelled' && x.conclusion !== 'skipped'); if (!r.length) return onbekend('Geen afgeronde runs'); const g = r.filter((x) => x.conclusion === 'success').length; const pct = Math.round((g / r.length) * 100); return pct >= DREMPELS.ciMinPct ? ok(`${g} van ${r.length} geslaagd (${pct}%)`) : niet(`${g} van ${r.length} geslaagd (${pct}%)`); } },
  { id: '4.4', criterium: 'Elk testbestand in de repo draait in CI', skill: 'brbnt-skill-scaffold',
    meet: ({ d }) => { const t = Object.values(d.laag4.tests.lagen).reduce((a, x) => a + x.bestanden, 0); if (!t) return nvt('Geen testbestanden'); const mis = d.laag4.tests.nietInCi; if (mis == null) return onbekend('Geen CI-log met testbestanden om mee te vergelijken'); if (!mis.length) return ok(`Alle ${t} testbestanden staan in de log van de laatste run`); const perMap = Object.entries(mis.reduce((a, f) => { const k = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.'; a[k] = (a[k] || 0) + 1; return a; }, {})); return niet(`${mis.length} van ${t} testbestanden draaien niet in CI`, perMap.map(([k, n]) => `${k}/: ${n} bestand(en)`)); } },
  { id: '4.5', criterium: 'Minstens één bewakingstest (architectuur of drift)', skill: 'brbnt-skill-scaffold',
    meet: ({ d }) => (d.laag4.tests.bewaking.length ? ok(`${d.laag4.tests.bewaking.length} bewakingstests`, d.laag4.tests.bewaking) : niet('Geen test met drift, parity, architectuur of conformance in de naam')) },
  { id: '4.6', criterium: 'Direct naar de hoofdtak pushen wordt tegengehouden', skill: 'brbnt-skill-scaffold',
    meet: ({ d }) => { const h = d.laag4.hooks.find((x) => x.beschermt); return h ? ok(`${h.pad}${d.laag4.hooksPath ? `, core.hooksPath = ${d.laag4.hooksPath}` : ''}`) : onbekend('Geen pre-push-hook; branch protection bij GitHub wordt niet uitgelezen'); } },
  { id: '4.7', criterium: 'Uitrollen gebeurt alleen na een groene test', skill: 'brbnt-skill-scaffold',
    meet: ({ d }) => { const dep = d.laag4.workflows.filter((w) => !w.eigen).flatMap((w) => w.jobs).filter((j) => /deploy|uitrol|release/i.test(j.id + ' ' + j.naam)); if (!dep.length) return nvt('Geen uitroljob in CI'); const mis = dep.filter((j) => !j.needs); return mis.length ? niet('Uitroljob zonder needs op de test', mis.map((j) => j.id)) : ok(dep.map((j) => `${j.naam} na ${j.needs}`).join(', ')); } },
  { id: '4.8', criterium: 'Alle skills die CLAUDE.md noemt, zijn beschikbaar', skill: 'brbnt-skill-scaffold',
    meet: ({ d }) => { const s = d.laag4.skills; if (!s.length) return nvt('CLAUDE.md noemt geen skills'); if (d.modus === 'ci') return onbekend('In CI zijn de skills van de ontwikkelaar niet te zien'); const mis = s.filter((x) => !x.beschikbaar); return mis.length ? niet(`${mis.length} niet gevonden`, mis.map((x) => x.naam)) : ok(`${s.length} van ${s.length} beschikbaar`, s.map((x) => x.naam)); } },

  // ---------- Laag 5: parallel werken ----------
  { id: '5.1', criterium: 'Er is een poortafspraak (addendum-parallel-ontwikkeling.md)', skill: 'brbnt-parallel-setup',
    meet: ({ d }) => (d.laag5.addendum ? ok(d.laag5.addendum) : niet('Geen addendum-parallel-ontwikkeling.md')) },
  { id: '5.2', criterium: 'De laatste 50 commits op de hoofdtak kwamen via een pull request, of CLAUDE.md legt vast dat direct op de hoofdtak mag', skill: 'brbnt-parallel-setup',
    meet: ({ d }) => {
      const c = d.git.hoofdtakCommits; if (!c.length) return onbekend('Geen historie op de hoofdtak');
      const pr = c.filter((s) => /\(#\d+\)\s*$|^Merge pull request/.test(s)); if (pr.length === c.length) return ok(`${pr.length} van ${c.length}`);
      const tak = d.bron.hoofdtak || 'main'; const zin = directOpHoofdtak(d.laag1.claude.md, tak);
      return zin ? ok(`${c.length - pr.length} van ${c.length} direct op ${tak}, zoals vastgelegd in CLAUDE.md: "${zin.length > 200 ? `${zin.slice(0, 197)}...` : zin}"`)
        : niet(`${pr.length} van ${c.length} via een PR, en CLAUDE.md legt niet vast dat direct op ${tak} mag`);
    } },
  { id: '5.3', criterium: 'Geen verweesde worktrees (zonder tak, of langer dan 14 dagen stil)', skill: 'brbnt-parallel-setup',
    meet: ({ d, nu }) => { if (!d.bron.git) return onbekend('Geen git'); if (d.modus === 'ci') return onbekend('Worktrees staan op de machines van de ontwikkelaars; CI ziet ze niet'); const w = d.laag5.worktrees.slice(1); if (!w.length) return ok('Geen extra worktrees'); const mis = w.filter((x) => x.tak === '(los, geen tak)' || (x.datum && dagenGeleden(x.datum, nu) > DREMPELS.worktreeDagen)); return mis.length ? niet(`${mis.length} verweesd`, mis.map((x) => `${String(x.pad).split('/').pop()}: ${x.tak}, laatste commit ${String(x.datum).slice(0, 10)}`)) : ok(`${w.length} actieve worktree(s)`); } },
  { id: '5.4', criterium: "Geen remote takken meer van al gemergde PR's", skill: 'brbnt-parallel-setup',
    meet: ({ d }) => { if (!d.laag4.ci.beschikbaar) return onbekend('PR-gegevens niet opgehaald'); const t = d.laag5.takken.filter((x) => x.remote && x.pr?.staat === 'MERGED'); return t.length ? niet(`${t.length} tak(ken) kunnen weg`, t.map((x) => `${x.naam} (#${x.pr.nummer})`)) : ok('Geen achtergebleven takken'); } },
  { id: '5.5', criterium: 'De dev-poorten volgen de poortformule', skill: 'brbnt-parallel-setup',
    meet: ({ d }) => (d.laag5.addendum ? onbekend('Poortformule vergelijken is nog niet gebouwd') : nvt('Geen addendum, dus geen formule om aan te toetsen')) },

  // ---------- Laag 6: modelgebruik ----------
  { id: '6.1', criterium: 'Elke gebouwde fase heeft een uitvoeringsrij', skill: 'brbnt-plan',
    meet: ({ d }) => { const r = d.laag3.plannen.flatMap((p) => gebouwdeFasen(p).map((f) => ({ p, f }))); if (!r.length) return nvt('Nog geen gebouwde fasen'); const mis = r.filter(({ p, f }) => !p.uitvoering.some((u) => String(u.Fase).replace(/\s.*$/, '') === f)); return mis.length ? niet(`${mis.length} zonder rij`, mis.map(({ p, f }) => `${p.naam} ${f}`)) : ok(`${r.length} van ${r.length}`); } },
  { id: '6.2', criterium: 'Niets geschat: elke meetwaarde is gemeten of staat als "onbekend"', skill: 'brbnt-plan',
    meet: ({ d }) => { const u = d.laag3.plannen.flatMap((p) => p.uitvoering.map((x) => ({ p, x }))); if (!u.length) return nvt('Geen uitvoeringsrijen'); const mis = u.filter(({ x }) => { const k = Object.keys(x).find((c) => /Tokens/i.test(c)); const v = x[k] || ''; return !/\d[\d.]*\s*\/\s*\d/.test(v) && !/onbekend/i.test(v); }); return mis.length ? niet(`${mis.length} cel(len) zonder meting of "onbekend"`, mis.map(({ p, x }) => `${p.naam} ${x.Fase}`)) : ok(`${u.length} rijen, alle gemeten of "onbekend"`); } },
  { id: '6.3', criterium: 'Elke fase heeft een gepland model en effort', skill: 'brbnt-plan',
    meet: ({ d }) => { const f = d.laag3.plannen.flatMap((p) => p.fasering.map((x) => ({ p, x }))); if (!f.length) return nvt('Geen fasen'); const mis = f.filter(({ x }) => !(x['Gepland model en effort'] || '').trim() || x['Gepland model en effort'] === '-'); return mis.length ? niet(`${mis.length} zonder planning`, mis.map(({ p, x }) => `${p.naam} ${x.Fase}`)) : ok(`${f.length} fasen gepland`); } },
  { id: '6.4', criterium: 'Elke afwijking tussen gepland en gemeten effort staat in punt 12', skill: 'brbnt-plan',
    meet: ({ d }) => { if (!d.laag3.plannen.some((p) => p.uitvoering.length)) return nvt('Geen uitvoeringsrijen'); const r = []; for (const p of d.laag3.plannen) for (const u of p.uitvoering) { const f = p.fasering.find((x) => x.Fase === String(u.Fase).replace(/\s.*$/, '')); const gepland = (/,\s*(\w+)/.exec(f?.['Gepland model en effort'] || '') || [])[1]; const gemeten = (u.Effort || '').trim(); if (!gepland || !gemeten || /onbekend/i.test(gemeten) || gepland === gemeten) continue; const vast = p.afwijkingen.some((a) => a.Fase === f.Fase && /effort|model/i.test(a['Wat week af van het plan'] || '')); r.push({ id: `${p.naam} ${f.Fase}: gepland ${gepland}, gemeten ${gemeten}`, vast }); } if (!r.length) return ok('Geen afwijkingen tussen gepland en gemeten'); const mis = r.filter((x) => !x.vast); return mis.length ? niet(`${mis.length} afwijking(en) niet vastgelegd`, mis.map((x) => x.id)) : ok(`${r.length} afwijking(en), alle vastgelegd`, r.map((x) => x.id)); } },
  { id: '6.5', criterium: 'Fasen zijn behapbaar: geen enkele groter dan L', skill: 'brbnt-plan',
    meet: ({ d }) => { const f = d.laag3.plannen.flatMap((p) => p.fasering.map((x) => ({ p, x }))); if (!f.length) return nvt('Geen fasen'); const mis = f.filter(({ x }) => /XL/i.test(x.Omvang || '')); return mis.length ? niet(`${mis.length} fase(n) groter dan L`, mis.map(({ p, x }) => `${p.naam} ${x.Fase}`)) : ok(`${f.length} fasen, grootste ${['L', 'M', 'S'].find((s) => f.some(({ x }) => (x.Omvang || '').trim() === s)) || '?'}`); } },
  { id: '6.6', criterium: 'Het onderzoek is apart vastgelegd (plan punt 3, of een onderzoeksdocument)', skill: 'brbnt-plan',
    meet: ({ d }) => { if (!d.laag3.plannen.length) return nvt('Geen plannen'); const mis = d.laag3.plannen.filter((p) => { const s = /^## 3\.[^\n]*\n([\s\S]*?)(?=^## )/m.exec(p.planMd)?.[1] || ''; return s.replace(/\s|n\.v\.t\.?/gi, '').length < 40; }); return mis.length ? niet(`${mis.length} plan(nen) zonder onderzoek`, mis.map((p) => p.naam)) : ok(`Alle plannen hebben onderzoek${d.laag3.onderzoek.length ? `, plus ${d.laag3.onderzoek.length} onderzoeksdocumenten` : ''}`); } },
].map((c) => ({ ...c, laag: +c.id[0] }));

export function kleurVan(gehaald, totaal) {
  if (!totaal) return 'nvt';
  if (gehaald === totaal) return 'groen';
  return gehaald / totaal >= 0.75 ? 'amber' : 'rood';
}

/**
 * Het verschil met een vorige scan, alleen over criteria die in BEIDE scans gemeten zijn (gehaald of niet).
 * Zo telt een criterium dat in CI niet te meten is (zoals 4.8) niet als achteruitgang ten opzichte van een zelfscan.
 */
export function vergelijk(s, vorige) {
  if (!vorige || vorige.versie !== s.versie || !vorige.oordelen) return null;
  const gemeten = (o) => o === 'gehaald' || o === 'niet';
  const beide = s.criteria.filter((c) => gemeten(c.oordeel) && gemeten(vorige.oordelen[c.id]));
  const telt = (lijst, bron) => lijst.filter((c) => (bron ? vorige.oordelen[c.id] : c.oordeel) === 'gehaald').length;
  const lagen = Object.fromEntries(LAGEN.map((l) => { const cs = beide.filter((c) => c.laag === l.nr); return [l.nr, telt(cs) - telt(cs, true)]; }));
  const veranderd = s.criteria.filter((c) => vorige.oordelen[c.id] && vorige.oordelen[c.id] !== c.oordeel).map((c) => ({ id: c.id, was: vorige.oordelen[c.id], nu: c.oordeel }));
  return { gehaald: telt(beide) - telt(beide, true), lagen, veranderd, vergeleken: beide.length, sinds: vorige.gegenereerd, modus: vorige.modus || null };
}

/** Past alle criteria toe op de verzamelde gegevens. */
export function scan(d, { nu = new Date(d.gegenereerd), plan = null } = {}) {
  const criteria = CRITERIA.map((c) => {
    let r;
    try { r = c.meet({ d, nu, plan }); } catch (e) { r = onbekend(`Meetfout: ${e.message}`); }
    return { id: c.id, laag: c.laag, criterium: c.criterium, skill: c.skill, ...r };
  });
  const lagen = LAGEN.map((l) => {
    const cs = criteria.filter((c) => c.laag === l.nr);
    const gehaald = cs.filter((c) => c.oordeel === 'gehaald').length;
    const totaal = cs.filter((c) => c.oordeel === 'gehaald' || c.oordeel === 'niet').length;
    return { ...l, gehaald, totaal, kleur: kleurVan(gehaald, totaal), nvt: cs.filter((c) => c.oordeel === 'nvt').length, onbekend: cs.filter((c) => c.oordeel === 'onbekend').length };
  });
  const gehaald = lagen.reduce((a, l) => a + l.gehaald, 0);
  const totaal = lagen.reduce((a, l) => a + l.totaal, 0);
  return { versie: CRITERIA_VERSIE, drempels: DREMPELS, criteria, lagen, gehaald, totaal, kleur: kleurVan(gehaald, totaal) };
}
