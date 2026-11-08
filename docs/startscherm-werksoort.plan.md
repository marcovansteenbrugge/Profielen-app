---
plan: startscherm-werksoort
titel: Startscherm met vier tools, elk in een eigen kleur
versie: 1
status: deels-vrijgegeven        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ▶ · F1 ▶ · F2 ⏳           # berekend door de skill
opgesteld: 2026-11-08
opgesteld_door: agent, Claude Opus 5.5 (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: startscherm-werksoort.beslis.md
basis_commit: 1114c58
vervangt: -
samenvatting: Bij het starten kies je wat je vandaag doet (Profielen Tool oranje, Doorvaarthoogte blauw, Doorrijhoogte rood, Snoeien groen), met projectnaam en projectmap (kiezen of nieuw maken). De viewer toont dan alleen die tool, in zijn eigen accentkleur; het project onthoudt de tool.
trefwoorden: [startscherm, werksoort, tool, kleur, thema, accentkleur, projectnaam, projectmap, nieuwe map, recente projecten, profielen tool, doorvaart, doorrijhoogte, snoeien, 2.15.0]
---

# Plan: Startscherm met vier tools, elk in een eigen kleur

## 1. In het kort
1. Bij het starten van de Profielviewer verschijnt een startscherm: "Wat ga je vandaag doen?" met vier tegels: **Profielen Tool** (oranje), **Doorvaarthoogte** (blauw), **Doorrijhoogte** (rood) en **Snoeien** (groen).
2. Op hetzelfde scherm vul je de projectnaam in en kies je de projectmap, of maak je een nieuwe map met de projectnaam. Recente projecten staan ernaast, met een gekleurde stip per tool.
3. Daarna toont de viewer alleen die tool: in Doorrijhoogte zie je geen Snoeien of Doorvaart. As, profielen, project en uitvoer blijven er in elke tool.
4. Elke tool heeft een eigen accentkleur in het scherm (kopbalk, knoppen, paneelkoppen, toetsvensters). Tekening, PDF en DXF blijven ongewijzigd.
5. Het project onthoudt zijn tool: open je de Bergstraat, dan start je meteen in Doorrijhoogte (rood).

## 2. Aanleiding en doel
Marco (chat, 2026-11-08): "we hebben nu 4 opties voor 1 tool... nu zitten ze in 1 veld". De kopbalk bevat alle knoppen van alle toetsen tegelijk; wie een doorrijhoogte doet, ziet ook snoeien en doorvaart. Hij vroeg om "een soort inlog [...] dat je vooraf een keuze maakt.. wat ga je doen vandaag", met projectnaam, map aanmaken en kiezen, en kleur per tool. Een schets (tegels) en een kleurvoorstel zijn in de chat getoond.

Geslaagd als: Marco start de viewer, kiest een tool, projectnaam en (nieuwe) map, werkt in een scherm met alleen die tool in zijn kleur, en bij heropenen van het project staat dezelfde tool weer klaar.

## 3. Onderzoek en bevindingen
Uit de code (op 1114c58):
- **Opstarten:** `index.html` heeft een `#opstartScherm` (logo en draaier) dat aan het eind van `viewer.js` wordt weggehaald. Het startscherm kan daarna komen. De exe geeft een project mee bij dubbelklik op een .pvproj (`natief.openen`, viewer.js eind) en roept `window.__pvOpenPad` aan bij een tweede start: dan moet het startscherm worden overgeslagen.
- **Kopbalk:** `<header>` bevat de groepen Puntenwolk, Project, As, Toets en Uitvoer. De groep Toets (`.toetsRaster`) heeft `doorvaartKnop`, `snoeiKnop`, `doorrijKnop` en drie chips. Stationering (`stationeringKnop`) en NWB staan in de groep As en horen bij alle tools.
- **Kleuren:** `:root` in index.html heeft `--ink`, `--paper`, `--surface`, `--line`, `--red`, `--teal`, `--gold`. `--teal` wordt nu als accent gebruikt (`button.aan`, splitter bij aanwijzen). De tekenkleuren in viewer.js (profielen, boxen, rood voor "voldoet niet") staan los daarvan.
- **Project:** `maakProjectBlobBinnen` schrijft `instellingen` (o.a. `doorvaart`, `snoei`, `doorrij`, `pdf`); een veld `werksoort` past daar zonder formaatwijziging. Oude projecten hebben het niet.
- **Recente projecten:** in de exe houdt `bron-exe/recent.go` de lijst bij (`recentProject{Naam, Pad, Tijd, Bestaat}`, max. 8, POST `recent` met alleen `pad`); in de browser IndexedDB `profielviewer`/`recent` (`bewaarRecentProject`, `toonProjectOpenen`). Geen van beide kent een tool.
- **Map maken:** `natieveMap(...).getDirectoryHandle(naam, { create: true })` (viewer.js r. ± 1549) en in de browser `FileSystemDirectoryHandle.getDirectoryHandle(..., { create: true })`; `kiesMap` (r. ± 1619) kiest een map; `maakSubmappen` maakt de indeling. Een nieuwe map met de projectnaam = bovenliggende map kiezen + submap maken; geen nieuwe Go-route nodig.
- **Projectnaam:** de PDF-stempel heeft `projectnaam` (`PDF_OPSLAG`, r. ± 12521); "Nieuw" wist die. De naam uit het startscherm kan daar direct in.
- **Nieuw project:** `projectNieuwKnop` herlaadt de pagina (`location.reload()`); het startscherm komt dan vanzelf terug.
- **Tests:** 7 van de 23 tests gebruiken `doorvaartKnop`, `snoeiKnop` of `doorrijKnop` (doorrijhoogte, doorrijprofiel_rws, doorvaart, dxf_bladen, ifc, projectmap_bospad, stationering_snoei). Alle tests openen `index.html` direct en verwachten de viewer meteen.

## 4. Niet in scope
- Een echte inlog met gebruikers of wachtwoorden: de viewer draait lokaal; het startscherm is een keuze, geen beveiliging.
- Andere tekenkleuren of een andere PDF/DXF per tool.
- Een vijfde tool of het splitsen in vier losse programma's.
- Licenties of rechten per gebruiker.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Vier tools: Profielen (oranje), Doorvaarthoogte (blauw), Doorrijhoogte (rood), Snoeien (groen) | chat Marco, 2026-11-08 |
| In een tool zie je de andere toetsen niet | chat Marco, 2026-11-08 (B1) |
| Het project onthoudt de tool | chat Marco, 2026-11-08 (B4) |
| Bestaande projecten blijven te openen | CLAUDE.md (volledige, werkende opleveringen) |
| Nederlands; geen build-stap; `window.__pvTest` blijft | CLAUDE.md |
| Nieuw hoofdstuk = minorversie | CLAUDE.md |

## 6. Ontwerp en besluiten (technisch)
**Werksoort.** Eén variabele `werksoort` ∈ {`profielen`, `doorvaart`, `doorrij`, `snoei`} plus `alles` (alleen voor tests en de overgang). `zetWerksoort(w)` zet `data-werksoort` op `<body>`, de accentkleur-tokens en het label in de kopbalk.

**Wat zichtbaar is (B1, B2).** CSS op `body[data-werksoort]`: in elke tool blijven Puntenwolk, Project, As (incl. stationering en NWB), Uitvoer en de drie panelen. De groep Toets toont alleen de knop en chip van de eigen tool; in de Profielen Tool verdwijnt de groep Toets helemaal. PDF-opties van andere toetsen (`pdfDoorrij`, `pdfRws`, doorvaart- en snoeibladen) worden in die tool niet getoond en niet meegenomen.

**Kleur (B3).** Nieuwe tokens `--accent`, `--accent-licht`, `--accent-donker` in `:root`, per werksoort gezet:
| Tool | accent | licht | donker |
|---|---|---|---|
| Profielen Tool | #C2650A | #FDF1E4 | #7A3E05 |
| Doorvaarthoogte | #185FA5 | #E6F1FB | #0C447C |
| Doorrijhoogte | #A32D2D | #FCEBEB | #791F1F |
| Snoeien | #3B6D11 | #EAF3DE | #27500A |

Gebruikt in: een streep van 4 px onder de kopbalk, een label met icoon en toolnaam in de kopbalk, `button.aan` en de hoofdknop van de tool (in plaats van `--teal`), de splitter bij aanwijzen, de paneelkoppen (lichte tint met een gekleurd randje links), de as in het bovenaanzicht, en de kop van de toetsvensters (`.pdf-kop`). Niet in: profiellijnen, punten, boxen, rood/groen van een oordeel, PDF, DXF, IFC, GeoPackage.

**Project (B4, B8).** `instellingen.werksoort` in het project. Bij openen: staat hij erin, dan die tool. Oud project zonder veld (B8): raden uit de inhoud (doorrij gecontroleerd → doorrij; brug ingelezen → doorvaart; begroeiing → snoei; anders profielen) en dat in de statusregel melden.

**Wisselen (B7).** Knop "Andere tool…" in de groep Project, met de vraag "Dit project omzetten naar <tool>?". Nieuw (Ctrl+N) brengt je terug naar het startscherm.

**Startscherm (F1).** Een `<dialog>` over de hele viewer, na het opstartscherm:
- vier tegels (B5 voor de naam van de oranje tegel);
- veld Projectnaam (vult ook `projectnaam` van de PDF-stempel);
- Projectmap: "Map kiezen…" (bestaande `kiesMap`), "Nieuwe map maken" (bovenliggende map kiezen, submap met de projectnaam maken met `getDirectoryHandle(naam, { create: true })`, daarna `maakSubmappen`);
- recente projecten met een stip in de kleur van de tool; klikken opent het project (en zijn tool) zonder verdere vragen;
- knop "Start <tool>" in de toolkleur.
Na Start is de projectmap gekozen: bij het inlezen van de puntenwolk vraagt het venster "Projectmap" niet nog eens om een map. "Zonder projectmap" blijft mogelijk (klein knopje, zoals nu).

Recent met tool: in de exe krijgt `recentProject` een veld `Soort` (`json:"soort"`), de POST stuurt `{ pad, soort }`; oude regels zonder soort krijgen een grijze stip. In de browser gaat `soort` mee in IndexedDB.

Overslaan: het startscherm komt niet bij `natief.openen`, bij `__pvOpenPad`, bij een gesleept project en bij `?start=uit` in de adresregel (tests: werksoort `alles`, alles zichtbaar zoals nu). De tests in `tests/hulp.js` openen voortaan met `?start=uit`; een nieuwe test doet het startscherm zelf.

**Programmanaam (B6).** Voorstel: het programma blijft "Lutrea Profielviewer" (exe, installer, startmenu, AppId); alleen de oranje tegel heet "Profielen Tool".

**Verdieping per besluit:**
- **B1 Andere tools zichtbaar?** (nodig vóór F0). Besloten (anders dan ons voorstel): geen wisselknop naar de andere toetsen; in een tool zie je alleen die tool.
- **B2 Wat blijft in elke tool** (nodig vóór F0). Voorstel: Puntenwolk, Project, As (met stationering en NWB), Uitvoer en de panelen in alle tools; alleen de groep Toets verschilt. Alternatief: per tool ook de groep As en Uitvoer inkorten (bijv. geen IFC bij Snoeien).
- **B3 Kleur** (nodig vóór F0). Voorstel: zie de tabel hierboven, alleen in het scherm. Alternatief: ook de PDF-kop en het titelblok in de toolkleur.
- **B4 Project onthoudt de tool** (nodig vóór F0). Besloten: ja.
- **B5 Naam van de oranje tool** (nodig vóór F1). Besloten: "Profielen Tool".
- **B6 Programmanaam** (nodig vóór F2). Voorstel: blijft "Lutrea Profielviewer". Alternatief: het hele programma "Lutrea Profielen Tool" (nieuwe namen voor exe, installer en startmenu; bestaande installaties en snelkoppelingen moeten mee).
- **B7 Van tool wisselen bij een verkeerde keuze** (nodig vóór F0). Voorstel: knop "Andere tool…" in de groep Project, met bevestiging. Alternatief: alleen via Nieuw (dan opnieuw beginnen).
- **B8 Oude projecten zonder tool** (nodig vóór F0). Voorstel: raden uit de inhoud en melden. Alternatief: bij het openen vragen welke tool.
- **B9 Versie** (nodig vóór F2). Voorstel: 2.15.0.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser, dan staat aan het eind van "Hangt af van" `voorwaarde: <wat>`.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ▶ vrijgegeven | Werksoort en kleur in de viewer: tokens per tool, label en streep in de kopbalk, groep Toets per tool, PDF-opties per tool, werksoort in het project, raden bij oude projecten, knop "Andere tool…"; `?start=uit` en `hulp.js` voor de tests | 1. Nieuwe test `werksoort.test.js`: per tool zijn alleen de eigen toetsknop en chip zichtbaar (Profielen Tool: geen), `--accent` heeft de waarde uit de tabel. 2. Project opslaan en heropenen geeft dezelfde tool; een oud project met doorrij-uitkomst opent als Doorrijhoogte. 3. `node run_alle.js` eindigt met "Alle tests geslaagd". 4. Schermafdruk van de viewer in elk van de vier tools. | B1, B2, B3, B4, B7, B8 | M | Opus 5.5, medium | `F0:` |
| F1 | ▶ vrijgegeven, na F0 | Startscherm: vier tegels, projectnaam (ook in de PDF-stempel), map kiezen of nieuwe map maken, recente projecten met kleurstip (exe en browser), overslaan bij dubbelklik, sleep en `?start=uit`; geen tweede mapvraag bij de puntenwolk | 1. Nieuwe test `startscherm.test.js`: tool en naam kiezen, nieuwe map maken (in een tijdelijke map), Start: map bestaat met de submappen, PDF-projectnaam is gezet, de tool staat goed; inlezen van de testwolk vraagt geen map meer. 2. Recente projecten tonen de tool (stip in de juiste kleur), ook in de exe-emulatie; `go test ./...` in `bron-exe` slaagt (recent met soort, oude regels zonder soort). 3. Met `natief.openen` komt het startscherm niet. 4. `node run_alle.js` eindigt met "Alle tests geslaagd". 5. Schermafdruk van het startscherm. | F0, B5 | M | Opus 5.5, medium | `F1:` |
| F2 | ⏳ wacht op B6, B9 | Opleveren 2.15.0: versie, LEESMIJ, handleiding, alle tests, bouwen, installatietoets, commit en tag; Marco controleert | 1. `node run_alle.js` eindigt met "Alle tests geslaagd". 2. `.\tools\bouw_installer.ps1 -Toets` eindigt met `fouten: geen`. 3. Exe, zip en setup in `dist`. 4. Marco bevestigt dat het startscherm en de vier tools goed werken. | F1, B6, B9 | S | Opus 5.5, medium | `F2:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** n.v.t.: er komen geen gebruikersgegevens bij; de projectnaam staat al in de PDF-stempel.
**Beveiliging.** n.v.t.: geen inlog, geen nieuwe externe verbindingen; de Go-route `recent` krijgt alleen een extra veld.
**Gebruikers en handleiding.** Nieuw hoofdstuk "Starten" in de handleiding (startscherm, vier tools, kleuren, wisselen). De bestaande hoofdstukken krijgen per tool een kleurlabel.
**Beheer en configuratie.** `instellingen.werksoort` in het project; `soort` in `recent.json` van de exe. Oude projecten en een oude `recent.json` blijven werken.
**Releasenotes (kernpunten).** Startscherm: kies je tool (Profielen Tool, Doorvaarthoogte, Doorrijhoogte, Snoeien), projectnaam en map; elke tool in zijn eigen kleur en alleen met zijn eigen knoppen; het project onthoudt de tool.

## 9. Risico's en terugweg
- Tests: 7 tests klikken op toetsknoppen. Door `?start=uit` (werksoort `alles`) blijven ze werken; dat wordt in F0 met de volledige testreeks gecontroleerd.
- Verborgen opties die toch meedoen: een PDF-blad van een andere toets (bijv. een oude doorvaartuitkomst in een doorrijproject) wordt in een tool niet getoond en niet meegenomen; de uitkomst blijft wel in het project bewaard.
- Kleur en leesbaarheid: witte tekst op het accent; het oranje is donker genoeg gekozen (#C2650A) voor witte tekst.
- Terugweg: de werksoort is CSS plus één veld; met `?start=uit` werkt de viewer zoals nu. Commits per fase terugzetten.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Moeten collega's een tool kunnen "vastzetten" (altijd starten in bijv. Snoeien)? | Nee; het startscherm onthoudt de laatst gekozen tool als voorkeur |
| Hoort "Dekkingskaart" bij een tool of bij alle? | Bij alle (staat bij de puntenwolk) |
| Moet de exe per tool een eigen snelkoppeling krijgen (bijv. "Lutrea Snoeien")? | Nee, één programma |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-08 11:53 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- Chat met Marco, 2026-11-08: vraag om startscherm, vier tools met kleur; antwoorden op de eerste vier vragen; schets van het startscherm en het kleurvoorstel (in de chat getoond)
- index.html op 1114c58: `:root`-kleuren, `<header>` met de groepen, `.toetsRaster`, `#opstartScherm`
- viewer.js op 1114c58: `maakProjectBlobBinnen`, `bewaarRecentProject`, `toonProjectOpenen`, `openProjectMap`, `kiesMap`, `maakSubmappen`, `projectNieuwKnop`, `PDF_OPSLAG`, opstartcode aan het eind (`natief.openen`, `__pvOpenPad`)
- bron-exe/recent.go op 1114c58: `recentProject`, route `recent`
- tests: 7 tests met toetsknoppen (zie punt 3)

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
