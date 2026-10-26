---
name: brbnt-scan
description: Scant een project op de zes lagen van het BRBNT-systeem en toont het oordeel per laag in een dashboard, met bewijs per criterium en de skill die elk gat oplost. Twee standen. Zelfscan, op elk project en ook vóór project-setup, zonder iets in het project te veranderen; gebruik dit wanneer iemand vraagt om een zelfscan, een BRBNT-scan, een nulmeting of eindmeting, of "hoe staat mijn project ervoor". Installeren, zodat het dashboard automatisch wordt bijgehouden (workflow, README-kaart, SCAN.md op GitHub); dit doet brbnt-project-setup standaard, of iemand vraagt erom ("zet de scan aan", "installeer het dashboard", "werk de scan bij"). Niet voor het oplossen van de bevindingen zelf: daarvoor noemt de scan per gat de skill.
---

# BRBNT scan: zelfscan en automatisch dashboard

Dit is de zesde BRBNT-skill, naast `brbnt-project-setup`, `brbnt-memory`,
`brbnt-skill-scaffold`, `brbnt-parallel-setup` en `brbnt-plan`. De andere vijf bouwen
de lagen; deze laat zien hoe ver een project is, op echte gegevens uit de repo en
GitHub, zodat je ziet wat werkt en wat de volgende stap is.

## Wat dit doet
Meet een project tegen een vaste lijst criteria per laag (`scripts/criteria.mjs`) en
schrijft het resultaat in drie vormen:

| Bestand | Voor wie | Waar |
|---|---|---|
| `dashboard.html` | wie het project volgt: vier tabs (Standaard, Waar we staan, Volgende stap, Effort in tokens en tijd); werkt offline en zonder JavaScript | zelfscan: `~/.brbnt/scans/<project>/<datum>-UTC.html`; geïnstalleerd: tak `brbnt-dashboard` |
| `SCAN.md` | wie op GitHub kijkt: de scan als pagina, met links naar de bestanden | tak `brbnt-dashboard` |
| `scan.svg` | de README: een kaart met de zes lagen | tak `brbnt-dashboard` |

Per criterium is het oordeel gehaald, niet gehaald, n.v.t. of niet te meten, altijd met
het bewijs erbij. Score per laag = gehaald ÷ (gehaald + niet gehaald). Alles gehaald is
groen, vanaf 75% amber, daaronder rood; een status staat er altijd ook in woorden bij.
Hoeveel criteria per laag n.v.t. of niet te meten zijn, wordt altijd getoond.

Naast de criteria noteert de scan signalen (actie, let op, info), zoals een app-versie die
voorloopt op de gepubliceerde build of paden in CLAUDE.md die niet in de repo staan. Ze tellen
niet mee in de score. `SCAN.md` noemt ze allemaal; het dashboard toont onder "Ook opgemerkt" alleen
de signalen die het niet al elders laat zien (als criterium, in Volgende stap of bij de CI).

## Contract (hard, niet onderhandelbaar binnen deze skill)
1. **Een zelfscan schrijft nooit in het project.** Geen bestand, geen map, geen commit.
   Het resultaat gaat naar `~/.brbnt/scans/<project>/`. Ligt die map binnen het project,
   dan weigert het script. Daardoor is een zelfscan veilig op elk project, ook op dat van
   een deelnemer op de eerste dag, en ook vóór `brbnt-project-setup`.
2. **Oordelen komen alleen uit `scripts/criteria.mjs`.** Jij verandert, verzacht of
   interpreteert een oordeel nooit, en je zet er geen met de hand. Wat het script niet kan
   meten heet "niet te meten"; je vult het niet in met een schatting. Vind je een oordeel
   onjuist, dan meld je dat als mogelijke fout in de criteria, met het bewijs, in plaats van
   het in je samenvatting anders te presenteren.
3. **Toon altijd het hele oordeel.** Bij de score per laag hoort het aantal n.v.t. en niet
   te meten, en de lijst van wat niet gehaald is. Een score zonder die lijst geef je niet.
4. **Criteria en drempels zijn voor elk project gelijk.** Geen uitzonderingen per project.
   Een wijziging in de criteria gaat in `criteria.mjs`, met een hogere `CRITERIA_VERSIE`;
   alleen scans met dezelfde versie worden met elkaar vergeleken, en dan alleen over de
   criteria die in beide scans gemeten zijn.
5. **Alleen lezen, niets versturen.** De scan leest de repo, git en (met `gh` of het token
   in CI) GitHub. Hij stuurt geen gegevens naar een andere dienst.
6. **Installeren alleen na akkoord, en altijd eerst droog.** Toon wat
   `installeer --droog` zou doen en schrijf pas na een expliciet ja. Komt de vraag vanuit
   `brbnt-project-setup`, dan vraagt de setup dat akkoord; het akkoord op de setup als
   geheel telt daarvoor alleen als het voorstel van de setup deze installatie noemde.
7. **Installeren raakt precies drie plekken:** `.brbnt/scan/`,
   `.github/workflows/brbnt-scan.yml` (alleen als dat bestand ontbreekt of van deze skill
   is) en de README tussen `<!-- brbnt-scan:start` en `<!-- brbnt-scan:end -->`. Niets
   anders. Opnieuw installeren op een project dat al klopt verandert niets.
8. **Jij commit en pusht niet vanzelf.** Na een installatie stel je voor de nieuwe
   bestanden te committen volgens de git-regels in de CLAUDE.md van het project (tak en PR
   waar dat de regel is). De tak `brbnt-dashboard` is van de workflow: nooit met de hand
   aanpassen; de scan maakt geen commits op de hoofdtak.
9. **Deze skill verwijst nergens naar andere organisaties, projecten of externe
   standaarden.** Alles wat hij schrijft gaat over dit project.
10. **Historie: zelfscans worden aangevuld, het dashboard wordt vervangen.** Elke zelfscan is
    een nieuw bestand met datum en tijd; een eerdere wordt nooit overschreven. Het dashboard op
    de tak `brbnt-dashboard` wordt bij elke run vervangen; de vorige scan dient alleen als
    vergelijkingsbasis. De nulmeting (`.brbnt/scan/nulmeting.json`) wordt eenmalig gezet bij
    de eerste installatie en daarna nooit overschreven.

## Wat deze skill niet kan
- **Hij toetst of iets er is en of het klopt met zichzelf, niet of het goed is.** Een
  CLAUDE.md met alle vereisten kan nog steeds slechte regels bevatten; een memory met een Why
  kan een verkeerde reden noemen. Een groene laag betekent: de structuur staat en is
  consistent. Niet: het werk is goed.
- **Afdwinging ziet hij alleen als de tekst ernaar verwijst.** Een regel in CLAUDE.md telt als
  afgedwongen als hij een bestaande test, hook of check noemt; een test die een regel bewaakt
  zonder dat de regel ernaar verwijst, ziet hij niet.
- **Branch protection en andere GitHub-instellingen leest hij niet.** Criterium 4.6 kijkt
  alleen naar een pre-push-hook; zonder hook is het "niet te meten", niet "niet gehaald".
- **Of direct op de hoofdtak werken mag, leest hij alleen uit CLAUDE.md** (criterium 5.2), aan
  een zin als "alles gaat direct op main" of "directly to main". Een ontkende zin ("nooit
  direct op main") en een niet ingevulde placeholder tellen niet; staat het alleen in een
  ander document, dan ziet hij het niet.
- **In CI ziet hij de machine van de ontwikkelaar niet:** geïnstalleerde skills en memories
  buiten de repo zijn daar "niet te meten". Een zelfscan ziet ze wel, maar alleen op de
  machine waarop hij draait.
- **Paden in CLAUDE.md herkent hij aan hun vorm:** tekst tussen backticks met een bekende
  extensie of een `/` aan het eind. Een pad met een `/` vooraan dat niet in de repo staat, telt
  als webadres (zoals `/en/`), niet als ontbrekend bestand; `SCAN.md`, `dashboard.html` en
  `scan.svg` staan op de tak `brbnt-dashboard` en tellen ook niet als ontbrekend.
- **Testbestanden herkent hij aan hun naam:** `*.test.*` en `*.spec.*` (JavaScript en
  TypeScript), `test_*.py` en `*_test.py`, `*_test.go`, en voor .NET een klasse `*Tests` of
  `*Test` (C#, F#, VB) in een testproject (onder een map `test` of `tests`, of in een project
  zoals `App.Tests`). Een test met een andere naam telt niet mee, en een test in `.claude/` of
  `.brbnt/` ook niet: die hoort bij een skill, niet bij de testsuite van het project.
- **Testaantallen haalt hij uit de CI-log** en herkent daarin Vitest en Jest. Bij een ander
  testraamwerk zijn de aantallen en criterium 4.4 "niet te meten".

## Modus: altijd volledig
Er is geen delta-modus: elke scan beoordeelt alle criteria opnieuw. Een scan duurt seconden
tot een halve minuut, en een oordeel dat op een vorige run leunt zou een verbetering of
achteruitgang kunnen missen. Wat veranderde sinds de vorige keer, berekent de scan achteraf
door te vergelijken met de vorige scan (zie "State-bestanden").

## State-bestanden
- `~/.brbnt/scans/<project>/<datum>-UTC.html`: elke zelfscan, met datum en tijd in UTC in de naam
  (bijvoorbeeld `2026-09-30-09-45-UTC.html`; de kop van het dashboard toont de lokale tijd); de
  laatste is de vergelijkingsbasis voor de volgende zelfscan en, bij installatie, de nulmeting.
- `.brbnt/scan/nulmeting.json` in het project: de samenvatting van de laatste zelfscan vóór de
  installatie, zodat de eerste automatische scan de groei sinds de nulmeting laat zien.
- `dashboard.html` op de tak `brbnt-dashboard`: de vergelijkingsbasis voor de volgende run in
  CI. Het dashboard bevat daarvoor alleen een samenvatting van de scan als gegevensblok, geen
  volledige plannen of documenten. Er is geen ander watermerk.

## Hulpmiddel
Alles zit in `scripts/scan.mjs` (alleen Node en git nodig; `gh` of een GitHub-token is
optioneel): `zelfscan [project] [--open]`, `bouw [project] --uit <map> [--vorige
<dashboard.html>]`, `installeer [project] [--droog]`, `versie`, `help`. Het script vindt
`plan.mjs` van `brbnt-plan` zelf (naastgelegen skill of `~/.claude/skills/`); zonder dat
script zijn de statussen van plannen niet te berekenen en staan die criteria op "niet te
meten". Tests: `node --test scripts/tests/scan.test.mjs`.

## Stappenplan

### A. Zelfscan
1. Bepaal het project: de root van de git-repo waarin je werkt, of de map die de gebruiker
   noemt. Wijkt de docs-map af van `docs/`, `_docs/` of `app/docs/`, geef hem mee met
   `--docs`.
2. Draai `node <skillmap>/scripts/scan.mjs zelfscan <project> --open`. Dat duurt meestal
   tien seconden tot een halve minuut; het ophalen van de CI-gegevens is het langste deel.
3. Toon de uitkomst uit de uitvoer van het script (contract 3): de score, per laag de
   score met n.v.t. en niet te meten, wat niet gehaald is gegroepeerd per skill, en de
   volgende stap die het script noemt. Noem het pad van het dashboard.
4. Is er nog geen CLAUDE.md, zeg dan dat `brbnt-project-setup` de eerste stap is en vraag of
   je die mag starten. Start hem niet vanzelf. Na de setup wordt deze zelfscan de nulmeting.
5. Is de scan al geïnstalleerd (`.brbnt/scan/` bestaat), noem dan ook dat het bijgehouden
   dashboard op GitHub staat (README, of `SCAN.md` op de tak `brbnt-dashboard`), en ga naar C
   als de skill nieuwer is dan de geïnstalleerde versie.

### B. Installeren
1. Controleer of het project in git staat en een GitHub-remote heeft. Zonder GitHub kan de
   workflow niet draaien: zeg dat, en vraag of je toch wilt installeren (de README-kaart
   werkt dan pas na het koppelen).
2. Draai `installeer <project> --droog` en toon de lijst: welke bestanden nieuw, bijgewerkt of
   verwijderd zijn, en de meldingen (bijvoorbeeld welke zelfscan de nulmeting wordt). Noem erbij dat de
   workflow altijd op een runner van GitHub draait (ook als de tests van het project op een eigen
   runner draaien; dat kost Actions-minuten van het account, twee jobs per run), en dat hij één
   job heeft die mag schrijven, alleen naar de tak `brbnt-dashboard`, met `--force` omdat die tak
   bij elke run wordt vervangen. Heeft het project regels voor workflows (bijvoorbeeld alleen
   leesrechten, alleen een eigen runner, of nooit `--force`), leg dat dan eerst voor: de
   installatie wijkt daar dan van af. Vraag akkoord (contract 6).
3. Na akkoord: draai `installeer <project>` en toon het resultaat.
4. Stel voor de nieuwe bestanden te committen volgens de regels van het project (contract 8).
   Vertel wat er daarna gebeurt: na de volgende push naar de hoofdtak, of met de hand via
   Actions > brbnt-scan > Run workflow (`gh workflow run brbnt-scan`), verschijnt de tak
   `brbnt-dashboard`, en vanaf dan toont de README de kaart.
5. Faalt de eerste run bij het publiceren met een fout over rechten, dan beperkt de organisatie
   of de repo wat een workflow mag (Settings > Actions > General). Dat is een instelling van de
   eigenaar; wijzig hem niet zelf. De workflow vraagt zijn rechten zelf per job aan, dus de
   standaard "alleen lezen" van een repo is geen beletsel.

### C. Bijwerken
Vergelijk `node .brbnt/scan/scan.mjs versie` in het project met `versie` van deze skill. Is
de skill nieuwer, doe dan B vanaf stap 2: de droge lijst laat zien wat er verandert. Een bestand
dat een eerdere versie in `.brbnt/scan/` zette en dat niet meer nodig is (zoals `template.html`
van voor 1.4.0), haalt de installatie weg; de droge lijst noemt het als verwijderd.

### D. In CI (hier doe je niets)
De workflow draait na elke push naar de hoofdtak, elke ochtend en met de hand; nooit door een
andere workflow of een pull request, en altijd op een runner van GitHub (`ubuntu-latest`, met
Node van `setup-node`): de scan is licht, moet ook draaien als een eigen runner uit staat, en een
eigen runner bewaart zijn werkmap tussen runs. Hij is strikt opgezet:
- de workflow als geheel krijgt geen rechten (`permissions: {}`);
- de job `scan` leest alleen (repo, CI-runs, pull requests), checkt uit zonder het token te
  bewaren, haalt de vorige scan van de tak `brbnt-dashboard` (de eerste keer de nulmeting uit
  `.brbnt/scan/nulmeting.json`), draait `node .brbnt/scan/scan.mjs bouw` en geeft dashboard,
  `SCAN.md` en kaart door als artefact;
- de job `publiceren` mag alleen `contents` schrijven, draait geen code uit de repo, en
  vervangt de tak `brbnt-dashboard` met één nieuwe commit, zodat hij geen geschiedenis opbouwt;
- elke action staat vast op een volledige commit.
Omdat hij niet wacht op de testrun van dezelfde push, staat die run pas in de volgende scan
(uiterlijk de volgende ochtend). Wat in CI niet te zien is (de skills op de machine van de
ontwikkelaar, de memories buiten de repo) staat daar als "niet te meten".

## Materiaal
- `scripts/scan.mjs`: de opdrachten; `scripts/verzamel.mjs`: leest het project;
  `scripts/criteria.mjs`: de criteria, drempels en versie; `scripts/github.mjs`: CI-gegevens
  via `gh` of de GitHub-API; `scripts/uitvoer.mjs`: `SCAN.md`, kaart en het wegschrijven van
  het dashboard; `scripts/dashboard.mjs`: het dashboard, in Node opgebouwd tot HTML zonder
  script (tabs en details bij aanwijzen met CSS); `scripts/installeer.mjs`: de installatie.
- `assets/brbnt-scan.yml.template`: de workflow, altijd op een runner van GitHub; de installatie
  vult alleen de hoofdtak in.
- `assets/readme-sectie.md.template`: de README-sectie met de kaart en de links. Beide sjablonen
  zijn identiek aan hun tegenhanger in `11. Skill templates/` in de hoofdrepo.
- `scripts/tests/scan.test.mjs`: de tests, op tijdelijke projecten zonder netwerk.
- Wijzig de skill in de bron (de skillsrepo) en werk de kopie in `~/.claude/skills` daaruit bij,
  pas na een vergelijking: wijkt de kopie af van de laatst gecommitte bron, dan heeft iemand haar
  direct aangepast; leg dat eerst voor in plaats van het te overschrijven. Wijzigt een sjabloon,
  werk dan ook `11. Skill templates/` bij, en altijd de zips in `12. Starterskit/`.
