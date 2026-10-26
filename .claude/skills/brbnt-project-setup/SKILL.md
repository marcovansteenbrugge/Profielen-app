---
name: brbnt-project-setup
description: Richt laag 1 en 2 van het BRBNT-systeem in voor het huidige project, een CLAUDE.md-instructiebestand en een memory/-archief (MEMORY.md), ingevuld op basis van wat er al in de codebase staat. Bestaat er al een instructiebestand, dan migreert deze skill het: back-up eerst, daarna een nieuw gestandaardiseerd CLAUDE.md, met incidentele regels verplaatst naar het geheugenarchief. Gebruik dit wanneer iemand vraagt om een instructiebestand, geheugensysteem of CLAUDE.md op te zetten of te migreren, "laag 1 en 2 van BRBNT" wil inrichten, net gestart is met Module 1 van de BRBNT-workshop, of vraagt "zet mijn project klaar voor AI-samenwerking", of wanneer brbnt-plan meldt dat de structuur voor plannen en besluiten nog ontbreekt. Zet in elke route ook de BRBNT-scan neer (via de skill brbnt-scan): een zelfscan als nulmeting en een dashboard dat daarna automatisch wordt bijgehouden, zodat je er na de setup niet meer over hoeft na te denken. Veilig herhaalbaar: is het project al eerder ingericht, dan controleert de skill het bestaande CLAUDE.md inhoudelijk en stelt hij alleen de ontbrekende onderdelen voor (bijvoorbeeld de sectie "Plan en besluit" of de BRBNT-scan), zonder de rest aan te raken.
---

# BRBNT project-setup: CLAUDE.md + memory/

Dit is de eerste van zes BRBNT-skills (`brbnt-project-setup`, `brbnt-memory`,
`brbnt-skill-scaffold`, `brbnt-parallel-setup`, `brbnt-plan`, `brbnt-scan`) die samen de
trainingssjablonen uit de starter-kit vervangen: in plaats van dat de gebruiker zelf
`.template`-bestanden kopieert, hernoemt en met de hand invult, doet deze skill dat
gericht, op basis van wat er in het project staat, en met bevestiging vooraf.

## Wat dit doet
Zet **laag 1** (CLAUDE.md, statische werkregels, inclusief de sectie "Plan en
besluit") en **laag 2** (memory/MEMORY.md, het opvraagbare archief) op voor het
huidige project, en zorgt dat de docs-map voor plannen en beslisdocumenten bestaat.
Werkt in drie scenario's, die de skill zelf herkent in stap 1:

- **Al ingericht project (route C):** het CLAUDE.md volgt de standaardstructuur maar
  mist mogelijk nieuwere onderdelen. De skill controleert het bestand inhoudelijk
  tegen `assets/vereisten.md`, stelt alleen de ontbrekende onderdelen voor, en raakt
  niets anders aan. Dit is ook de route voor projecten die met een oudere versie van
  deze skill zijn ingericht.

- **Geen bestaand instructiebestand (route B):** inspecteert het project, vult de
  sjabloonsecties in, vraagt gericht naar de resterende beleidskeuzes, en schrijft
  pas na bevestiging.
- **Bestaand instructiebestand dat de standaardstructuur niet volgt (route A):**
  back-upt het origineel eerst, altijd,
  zonder te vragen. Combineert daarna de bestaande inhoud met een verse
  projectinspectie tot een nieuw gestandaardiseerd CLAUDE.md, en verplaatst
  incidentele regels (uitzonderingen, eenmalige besluiten) naar een gemigreerd
  geheugenbestand in `memory/`, in plaats van ze in laag 1 te laten staan.

In elke route zet de setup ook de **BRBNT-scan** neer, via de skill `brbnt-scan`:
eerst een zelfscan als nulmeting (die schrijft niets in het project), en na akkoord de
automatische scan (workflow, README-kaart, dashboard op GitHub). Na de setup houdt de
scan zichzelf bij; daar hoeft niemand meer aan te denken.

Alle routes sluiten af met een rapport, zodat het resultaat altijd te controleren
en (dankzij de back-up) terug te draaien is. De skill richt zich uitsluitend op het
instructiebestand van dit project, de `memory/`-map, de docs-map en, via `brbnt-scan`,
de plekken van de scan; nooit op andere bestanden of andere tooling.

## Contract (hard, niet onderhandelbaar binnen deze skill)
- **Een bestaand CLAUDE.md wordt nooit zonder back-up overschreven.** Bestaat het
  bestand al, dan wordt het als allereerste actie gekopieerd naar
  `CLAUDE.md.backup-<YYYY-MM-DD>` in de project-root (bestaat die naam al vandaag:
  oplopend suffix `-2`, `-3`, ...), vóórdat er iets wordt herschreven. Dit vervangt
  het vroegere "stop en vraag": in plaats van te weigeren, maakt de skill het
  resultaat altijd terugdraaibaar, en gaat daarna gewoon door.
- **Geen enkele regel uit het oude bestand gaat verloren.** Alles wat niet
  expliciet als stabiel is geclassificeerd, wordt letterlijk (niet herschreven of
  samengevat) overgenomen in het gemigreerde geheugenbestand.
- **Classificatie stabiel/incidenteel wordt herleid, niet verzonnen.** Een regel
  telt als incidenteel wanneer die een uitzondering, een eenmalig besluit of een
  specifiek incident beschrijft (bijv. begint met "behalve wanneer", verwijst naar
  een datum of eenmalige gebeurtenis, of geldt duidelijk niet universeel).
  Twijfelgevallen worden als stabiel behandeld: verlies van informatie is erger
  dan een regel die net op de verkeerde plek staat. Een datum die alleen de herkomst
  van een blijvende regel aangeeft (bijvoorbeeld "sinds maart verplicht"), maakt die regel
  niet incidenteel. Voorbeeld: "Sinds incident X wordt Y altijd gedaan" is een blijvende
  regel en dus stabiel.
- **De Why van gemigreerde incidentele items wordt nooit verzonnen, maar wél
  overgenomen als hij er al staat.** Elke regel die een concrete datum of
  tijdsverwijzing bevat telt als een aanwezige Why, ongeacht de exacte formulering:
  "sinds we op {datum} X deden", "vastgelegd op {datum}", "besloten op {datum}",
  "op {datum} gebeurde X" zijn allemaal gelijkwaardig. Bij twijfel of een
  tijdsverwijzing concreet genoeg is: wél als aanwezige Why behandelen, dat is
  veiliger dan een echte Why overschrijven. Alleen wanneer een regel géén enkele
  datum of tijdsverwijzing bevat, krijgt het item de markering "Why onbekend,
  gemigreerd op {datum} vanuit het oude CLAUDE.md, aan te vullen via de
  `brbnt-memory`-skill zodra de context bekend is". Nooit het omgekeerde: een al
  aanwezige Why vervangen door "onbekend".
- **Nul incidentele items is een geldige uitkomst, geen fout.** Classificeert
  alles als stabiel, dan wordt er geen `memory/project_gemigreerd_<datum>.md`
  aangemaakt en geen regel aan `memory/MEMORY.md` toegevoegd (er is niets om naar
  te verwijzen). Dit wordt wél expliciet in het rapport genoemd ("0 incidentele
  items, geen migratiebestand nodig"), nooit stilzwijgend overgeslagen: het
  verschil tussen "bewust niets gevonden" en "deze stap vergeten" moet voor de
  gebruiker altijd zichtbaar zijn.
- **Repository Structure toont de daadwerkelijke top-level indeling, nooit een
  vaste aanname over `tests/` of `docs/` op root-niveau.** Veel projecten nesten
  hun tests en docs onder een applicatiemap (bijv. `app/test/`, `app/docs/`) in
  plaats van op root. Neem over wat er werkelijk staat; laat een map weg als hij
  niet bestaat in plaats van hem te verzinnen omdat het sjabloon hem noemt.
- **Een stabiele claim die de projectinspectie niet kan bevestigen, wordt
  overgenomen mét een vlag, nooit stilzwijgend als geverifieerd feit gepresenteerd
  en nooit stilzwijgend weggelaten.** Bijvoorbeeld: het oude bestand noemt een
  backend die niet als aparte mapstructuur wordt aangetroffen. Neem de claim over,
  voeg een korte, zichtbare aantekening toe dat de inspectie dit niet kon
  bevestigen.
- **Placeholders die een beleids- of ontwerpbeslissing vereisen (git-regels,
  scope-grenzen, welke conventie als test wordt afgedwongen) worden nooit
  verzonnen.** Zijn ze niet af te leiden uit het project én niet al aanwezig in
  een bestaand CLAUDE.md, dan wordt er kort en gericht naar gevraagd, of blijft
  het een `{{...}}`-placeholder.
- **`memory/` wordt aangemaakt als die nog niet bestaat**, met `MEMORY.md` als
  index. Bij route A krijgt die index meteen een regel die naar het gemigreerde
  bestand wijst; bij route B blijft de index leeg (dat vult zichzelf pas met de
  tijd, via `brbnt-memory`). Ook bij route A met 0 incidentele items wordt `memory/` met
  een `MEMORY.md` aangemaakt als die map nog niet bestond.
- **Route B blijft read-only tot expliciete bevestiging.** Er is bij route B niets
  om te verliezen (geen bestaand bestand), maar de beleidsplaceholders vereisen
  nog steeds een menselijke keuze: toon het voorstel, schrijf pas na akkoord, en nooit
  in dezelfde stap waarin je het voorstel voor het eerst toont.
- **Route C herschrijft nooit; hij vult aan.** Alleen onderdelen die volgens
  `assets/vereisten.md` ontbreken worden voorgesteld, per punt, met de exacte tekst
  en de plek in het bestand. Er wordt alleen geschreven wat de gebruiker goedkeurt,
  en niets anders in het bestand verandert (ook geen opmaak of volgorde). Een regel
  in eigen woorden telt als aanwezig; een strijdige regel wordt benoemd en
  voorgelegd, nooit stilzwijgend vervangen. De back-up gaat vóór het schrijven, en
  alleen als er iets te schrijven valt: is alles aanwezig, meld dan "geen
  wijzigingen nodig" en maak geen back-up.
- **De skill is idempotent.** Een tweede keer draaien op een project dat al voldoet,
  levert "alles aanwezig" op en verandert niets.
- **Hoe route C toevoegt.**
  (a) Ontbreekt de hele sectie "Plan en besluit", voeg dan de volledige sectie toe, met
  kop en markering `brbnt-plan-regel: vN`, direct vóór "Scope-grenzen" (Scope
  Boundaries), en vóór een scheidingslijn die dat kopje voorafgaat. Ontbreekt dat kopje,
  zet de sectie dan vóór het eerstvolgende kopje uit het sjabloon dat er wel is, of
  anders vóór het laatste kopje. Voeg geen scheidingslijnen toe. Ontbreken alleen enkele regels in een bestaande sectie, voeg dan
  alleen die regels toe en laat de markering staan.
  (b) Neem de regeleinden (LF of CRLF) van het bestaande bestand over.
  (c) Schrijf de toegevoegde tekst in de overheersende taal van het bestaande bestand
  en vertaal het sjabloon inhoudelijk trouw. De markering `brbnt-plan-regel: vN`, de
  skillnaam `brbnt-plan` en bestandsnamen (`<naam>.plan.md`, `<naam>.beslis.md`,
  `plan-beslis-index.md`) blijven ongewijzigd; de controle van `brbnt-plan` herkent de
  markering. De vertaalde kop volgt de stijl van de bestaande kopjes.
  (d) Raakt één regel meerdere vereisten, of staan er meerdere regels bij één vereiste,
  dan geldt het zwaarste oordeel (strijdig, gedeeltelijk, ontbreekt, aanwezig); noem alle
  betrokken regels.
  (e) Een regel wordt alleen verwijderd op uitdrukkelijk verzoek van de gebruiker, nadat
  de back-up er is, en alleen die ene regel. Meld het in het rapport.
  (f) Bied bij een strijdige regel drie opties: (1) de regel verwijderen, (2) de regel
  laten staan en de sectie toch toevoegen, (3) de regel laten staan en de betrokken
  vereisten overslaan. Kiest de gebruiker 2 of 3, meld dan expliciet dat het bestand
  tegenstrijdige regels bevat, respectievelijk welke vereisten zijn overgeslagen.
  Een bestaande bestandsnaam die afwijkt van `<naam>.plan.md` is geen strijdigheid;
  noem hem als opmerking.
  (g) Tekst van de gebruiker die naar externe standaarden verwijst, blijft ongewijzigd
  staan; het verbod op verwijzingen geldt alleen voor wat de skill zelf schrijft.
- **Neem bij elke schrijfactie de regeleinden (LF of CRLF) van het bestaande of
  vervangen bestand over;** nieuwe bestanden krijgen LF.
- **Instructiecommentaar uit `CLAUDE.md.template` wordt niet meegeschreven.**
  HTML-commentaar in dat sjabloon is instructie voor jou; alleen de markering
  `brbnt-plan-regel` blijft. `MEMORY.md.template` schrijf je ongewijzigd, alleen met de
  projectnaam ingevuld.
  Optionele blokken (zoals Database-regels) laat je weg als het project er geen aanleiding
  voor geeft. Placeholders die je niet kunt afleiden blijven `{{...}}` en komen in het
  rapport.
- **De `docs-locatie` wordt afgeleid, niet verzonnen.** Bestaat `docs/` of
  `app/docs/`, neem die over; bestaat geen van beide, stel dan `docs/` voor en maak
  de map pas aan na akkoord. Noemt het bestaande CLAUDE.md al een plek voor documentatie
  (ook de projectroot), neem die dan over of leg de keuze voor. Een lege docs-map is
  prima: de index maakt `brbnt-plan` aan zodra er een plan is.
- **De BRBNT-scan hoort bij elke route, maar wordt alleen na akkoord geïnstalleerd.**
  Is er voor dit project nog geen zelfscan, dan draai je die in stap 1 (hij schrijft
  niets in het project en wordt bij de installatie de nulmeting). Het voorstel van elke
  route noemt de installatie als apart punt, met de lijst die `brbnt-scan installeer
  --droog` geeft; alleen een akkoord op een voorstel waarin dat punt stond, telt ervoor.
  Weigert de gebruiker, installeer dan niet en noem V9 in het rapport als open punt. De
  installatie zelf doet `brbnt-scan`, onder zijn eigen contract (precies drie plekken:
  `.brbnt/scan/`, `.github/workflows/brbnt-scan.yml` en een README-sectie tussen
  markeringen); deze skill schrijft zelf niets van de scan. De back-up van CLAUDE.md is
  alleen nodig als CLAUDE.md verandert: alleen de scan installeren raakt het niet.
  Ontbreekt de skill `brbnt-scan`: adviseer installatie, installeer hem niet zelf, en
  meld dat de nulmeting en V9 daardoor open blijven.
- **Deze skill verwijst nergens naar andere organisaties, projecten of externe
  standaarden.** Alles wat hij schrijft gaat over dit project.

## Stappenplan

1. **Check op een bestaand instructiebestand.** Zoek naar `CLAUDE.md` in de
   project-root (en, als dat ontbreekt, naar vergelijkbare bestanden als
   `AGENTS.md` of `.cursorrules`, en meld dat expliciet). Negeer bestanden die
   `CLAUDE.md.backup-*` heten.
   - Bestaat het niet: ga naar **route B**.
   - Bestaat het en volgt het de standaardstructuur, dat wil zeggen dat er minstens
     vier van deze negen kopjes in staan (in Nederlandse of Engelse vorm): Project
     Overview, Repository Structure, Tech Stack, Architectuur, Git-regels, Testing
     Strategy, Gedragsregels, Scope-grenzen, Conventies die worden afgedwongen: ga
     naar **route C**. Haalt het bestand net aan de drempel van vier, zeg dat erbij, zodat
     de gebruiker kan zeggen dat het eigenlijk een eigen bestand is (route A).
   - Bestaat het maar volgt het de structuur niet: ga naar **route A**. Route A
     gebruikt het huidige sjabloon en levert dus vanzelf een bestand met de sectie
     "Plan en besluit".
   Zeg in één zin welke route je koos en waarom.

   **Nulmeting.** Staat er voor dit project nog geen zelfscan onder
   `~/.brbnt/scans/<project>/`, draai dan `brbnt-scan` in de stand zelfscan (zonder
   `--open`) en noem de uitkomst in één regel ("nulmeting: 12 van 38"). Hij schrijft
   niets in het project. Staat er al een, gebruik die dan; draai er geen tweede.

### Route A: migratie van een bestaand instructiebestand

2. **Maak de back-up direct**, vóór enige andere actie: kopieer het bestaande
   bestand naar `CLAUDE.md.backup-<YYYY-MM-DD>` (oplopend suffix bij
   naamsconflict). Dit gebeurt altijd, zonder te vragen: dit is de garantie die
   de rest van deze route veilig maakt.

3. **Inspecteer het project**, zoals in route B stap 2: `package.json`,
   `*.csproj`/`*.sln`, `requirements.txt`/`pyproject.toml`, `go.mod`, `Gemfile`,
   CI-config, en de top-level directorystructuur. Neem de indeling over zoals hij
   werkelijk is (zie Contract: geen vaste `tests/`/`docs/`-aanname).

4. **Classificeer elke inhoudelijke regel uit het oude bestand** als stabiel of
   incidenteel, volgens de regel in het Contract hierboven.

5. **Stel het nieuwe CLAUDE.md samen**: `assets/CLAUDE.md.template`, ingevuld met
   de projectinspectie én de stabiele regels uit het oude bestand. Ontbrekende
   beleidsplaceholders: kort en gericht navragen (net als in route B stap 3), niet
   aannemen. Vul `{{docs-locatie}}` in vanuit wat het project heeft (zie Contract)
   en neem de sectie "Plan en besluit" ongewijzigd over. Stabiele regels die bij geen
   sectie van het sjabloon passen, komen letterlijk onder "Gedragsregels". Rijen van de
   Tech Stack-tabel die je niet kunt afleiden, blijven staan met het label en `{{...}}` als
   waarde. Toon vóór het schrijven een
   korte samenvatting (classificatie, docs-locatie, open placeholders, en als apart punt
   de BRBNT-scan met de lijst van `brbnt-scan installeer --droog`) en vraag akkoord;
   de back-up is er dan al.

6. **Schrijf het gemigreerde geheugenbestand, tenzij er 0 incidentele items
   zijn** (zie Contract): `memory/project_gemigreerd_<YYYY-MM-DD>.md`, elk
   incidenteel item letterlijk overgenomen, met **Why** (overgenomen of "onbekend"
   per item) en **How to apply** ("niet vastgelegd, aan te vullen via `brbnt-memory`").
   Het bestand krijgt een kop met `name`, `description` en `type: project`, en de
   verwijzing in `memory/MEMORY.md` staat als `- [Gemigreerde regels](bestand): één
   regel hook` onder een kop "Gemigreerd".

7. **Schrijf `CLAUDE.md`** (het bestand dat in stap 2 al gebackupt is). Was er
   een gemigreerd geheugenbestand (stap 6), werk dan ook `memory/MEMORY.md` bij
   met een regel die ernaar wijst; was er geen (0 incidenteel), laat een bestaand
   `memory/MEMORY.md` dan ongewijzigd. Bestaat `memory/` nog niet, maak hem dan aan
   met `MEMORY.md` uit `assets/MEMORY.md.template` (ook bij 0 incidentele items). Maak
   de docs-map aan als die nog niet bestaat. Was er akkoord op de BRBNT-scan, laat
   `brbnt-scan` hem dan installeren (`installeer <project>`).

8. **Rapporteer**, met precies deze zes onderdelen:
   - back-up gemaakt (bestandsnaam + locatie)
   - nieuwe/bijgewerkte bestanden neergezet (welke)
   - items aangemerkt als stabiel (opgesomd)
   - items aangemerkt als incidenteel en verplaatst (opgesomd, met verwijzing naar
     het gemigreerde bestand); staat dit aantal op 0, meld dat dan expliciet
     ("0 incidentele items, geen migratiebestand nodig") in plaats van dit
     onderdeel gewoon leeg te laten
   - open placeholders (met sectie), en open punten zoals dat `brbnt-plan` nog
     geïnstalleerd moet worden
   - de BRBNT-scan: de nulmeting (score), en geïnstalleerd (welke bestanden) of niet
     (waarom); na de installatie ook wat er gebeurt (zie `brbnt-scan`, stap B4)

### Route C: bijwerken van een al ingericht project

2. **Lees `assets/vereisten.md` en het bestaande CLAUDE.md**, en beoordeel elke
   vereiste (V1 tot en met V5): aanwezig, gedeeltelijk, ontbreekt of strijdig. Op
   betekenis, niet op letterlijke tekst. Een regel in eigen woorden telt als
   aanwezig; twijfel je, kies dan "gedeeltelijk" en leg uit wat er mist. Raakt één
   regel meerdere vereisten, dan geldt het zwaarste oordeel (zie Contract). Staat er
   een markering `brbnt-plan-regel: vN`, vergelijk die dan met de huidige versie in
   `assets/vereisten.md`.

3. **Controleer wat buiten het bestand hoort** (V6 tot en met V9): bestaat de
   docs-map, bestaat `memory/MEMORY.md`, is de skill `brbnt-plan` beschikbaar
   (onder `~/.claude/skills/` of `.claude/skills/`), en is de BRBNT-scan geïnstalleerd
   en actueel (V9: `brbnt-scan installeer --droog` meldt alles "ongewijzigd").
   Ontbreekt een skill: adviseer installatie, installeer hem niet zelf.

4. **Toon het voorstel.** Eén overzicht met per vereiste het oordeel, en per
   ontbrekend of gedeeltelijk punt de exacte tekst die je zou toevoegen en de plek
   in het bestand (welke sectie, waar). Strijdige regels benoem je apart, met de
   vraag wat de gebruiker wil; je vervangt ze niet. Vul de `docs-locatie` in vanuit
   wat het project werkelijk heeft. Ontbreekt V9 of is hij verouderd, neem dan de lijst
   van `brbnt-scan installeer --droog` op als apart punt. Vraag akkoord per punt of voor
   alles.
   Voldoen het bestand en de mappen aan V1 tot en met V7 en V9: meld "alles aanwezig,
   geen wijzigingen nodig", noem een ontbrekende `brbnt-plan` (V8) apart als open punt,
   sla stap 5 en 6 over en ga naar 7.

5. **Maak de back-up**, vlak vóór het schrijven: kopieer `CLAUDE.md` naar
   `CLAUDE.md.backup-<YYYY-MM-DD>` (oplopend suffix bij naamsconflict). Is alleen V9
   goedgekeurd, dan verandert CLAUDE.md niet en is er geen back-up nodig.

6. **Schrijf alleen de goedgekeurde punten.** Voeg de tekst toe op de voorgestelde
   plek en maak ontbrekende mappen aan (docs-map, `memory/` met `MEMORY.md` uit
   `assets/MEMORY.md.template`). Verander niets anders in het bestand. Is V9
   goedgekeurd, laat `brbnt-scan` de scan dan installeren of bijwerken.

7. **Rapporteer**, met deze onderdelen:
   - per vereiste het oordeel (aanwezig, gedeeltelijk, ontbrak, strijdig)
   - wat is toegevoegd, en waar
   - wat bewust niet is overgenomen (op verzoek van de gebruiker), en strijdige
     regels die zijn blijven staan
   - de back-up (bestandsnaam), of "geen wijzigingen, geen back-up nodig"
   - open punten, bijvoorbeeld dat `brbnt-plan` nog geïnstalleerd moet worden
   - de BRBNT-scan: de nulmeting (score), en geïnstalleerd, bijgewerkt of niet (waarom)
   - opmerkingen over onaangeroerde tekst die mogelijk verouderd is (bijvoorbeeld een
     verwijzing naar een sectie die niet meer bestaat); die wijzig je niet

### Route B: fris project, nog geen instructiebestand

2. **Inspecteer het project.** Lees wat redelijkerwijs de tech stack en structuur
   verraadt: `package.json`, `*.csproj`/`*.sln`, `requirements.txt`/`pyproject.toml`,
   `go.mod`, `Gemfile`, een CI-configbestand (`.github/workflows/*`), en de
   top-level directorystructuur. Doel: de `Tech Stack`-tabel, `Repository Structure`
   en `Testing Strategy`-secties van het sjabloon zoveel mogelijk zelf invullen in
   plaats van de gebruiker dat te laten doen. Repository Structure toont de
   daadwerkelijke indeling (zie Contract: geen vaste `tests/`/`docs/`-aanname);
   nest het project die ergens anders (bijv. onder een applicatiemap), neem dat
   dan over.

3. **Vul `assets/CLAUDE.md.template` in** met de afgeleide waarden. Laat elke
   placeholder die een menselijke beslissing vereist (git-regels, scope-grenzen,
   welke conventie als test wordt afgedwongen) staan, of stel er één gerichte vraag
   over. Niet meer dan nodig: dit hoeft geen volledig interview te worden.
   `{{docs-locatie}}` volgt uit het project (zie Contract), en de sectie "Plan en
   besluit" neem je ongewijzigd over.

4. **Toon het voorstel** (het volledige concept-bestand, of een duidelijke
   samenvatting per sectie als het bestand lang is, en als apart punt de BRBNT-scan met
   de lijst van `brbnt-scan installeer --droog`) en vraag expliciete bevestiging
   vóór stap 5.

5. **Schrijf `CLAUDE.md`** naar de project-root, pas na bevestiging.

6. **Maak `memory/`** aan als die nog niet bestaat, en plaats daarin
   `assets/MEMORY.md.template` als `memory/MEMORY.md`, met alleen `{{Projectnaam}}`
   ingevuld. De inhoud blijft verder leeg: dat is bewust, laag 2 vult zichzelf pas
   met de tijd, via de `brbnt-memory`-skill, niet in één keer vooraf. Maak ook de
   docs-map aan als die nog niet bestaat. Was er akkoord op de BRBNT-scan, laat
   `brbnt-scan` hem dan installeren (`installeer <project>`).

7. **Rapporteer**: welk bestand is aangemaakt, welke placeholders de gebruiker zelf
   nog moet invullen (met bestandsnaam + sectie, niet alleen "er staan nog wat
   dingen open"), en één zin over wat er nu anders is (laag 1 en 2 staan; het
   project heeft een stabiel instructiebestand en een plek voor het opvraagbare
   archief). Noem ook dat `brbnt-plan` geïnstalleerd moet zijn, omdat het bestand ernaar
   verwijst. Noem de BRBNT-scan: de nulmeting (score), en geïnstalleerd of niet (waarom).

## Materiaal
- `assets/CLAUDE.md.template`: bron voor route A stap 5 / route B stap 3, identiek
  aan `11. Skill templates/CLAUDE.md.template` in de hoofdrepo. Bevat de sectie
  "Plan en besluit" met de markering `brbnt-plan-regel: v1`.
- `assets/vereisten.md`: de lijst waartegen route C een al ingericht project
  controleert, inclusief V9 (de BRBNT-scan). Een nieuwe vereiste toevoegen is één rij erbij; oudere projecten
  worden dan bij de eerstvolgende controle vanzelf bijgewerkt.
- `assets/MEMORY.md.template`: bron voor route B stap 6, identiek aan
  `11. Skill templates/MEMORY.md.template` in de hoofdrepo. Start leeg-met-labels,
  omdat een net aangemaakt project nog geen memories heeft om in te vullen; dat
  geldt ook voor wie het sjabloon met de hand invult. Er is bewust één versie, zodat
  de twee niet uit elkaar kunnen lopen.
- Route A schrijft geen los template, maar een gevuld bestand
  (`memory/project_gemigreerd_<datum>.md`) met per item: de regel letterlijk, **Why**
  (overgenomen datum, of "onbekend" volgens het Contract) en **How to apply** ("niet
  vastgelegd"). De structuur staat hier, zodat de skill ook zonder de map met
  handmatige sjablonen werkt.
