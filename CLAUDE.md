# Lutrea Profielviewer: Project Root

## Project Overview
Lees dit eerst. Daarna, afhankelijk van de taak: `docs/ARCHITECTUUR.md` (hoe het in elkaar zit),
`docs/PLAN-2.10-windows-programma.md` (het lopende plan), `tests/README.md` (testen).

De Lutrea Profielviewer is een eigen tool van Marco van Steenbrugge (Lutrea Group B.V., Breda).
Hij maakt van een puntenwolk (.las/.laz/.pts, RD/NAP) een as, lengte- en dwarsprofielen en
uitvoer: PDF (op schaal, met stempel), DXF (zelfde bladen als layouts), IFC 4.3, GeoPackage, CSV.
Met toetsen: doorvaartcontrole (brug), snoeicheck (bomen langs een pad + kadaster), dekkingskaart,
stationering (dijkpalen/hectometrering). Gebruikers: Marco en collega's; klanten o.a. Gemeente
's-Hertogenbosch. Het versienummer staat in `bron-exe/main.go` (`appVersie`).

## Repository Structure
```
/
├── index.html + viewer.js   # De hele viewer (browser-app); viewer.js is één groot bestand, ± 13.300 regels, één IIFE
├── vendor/                  # Bibliotheken (three.js, jsPDF, d3-delaunay, laz-perf (wasm), sql.js). Niet aanpassen.
├── bron-exe/                # De Windows-exe in Go: embedt de app, start een lokale server en opent een venster
├── tools/                   # zet_versie.py, bouw.ps1, bouw.sh
├── tests/                   # Automatische tests (Playwright in Edge), zie tests/README.md
├── testdata/                # Testwolken (doorvaart_test, snoei_test, groot)
├── docs/                    # ARCHITECTUUR.md, handleiding.md, plannen en beslisdocumenten (zie "Plan en besluit")
├── icons/, sw.js, manifest.webmanifest, merk-lutrea.png
├── dev-server.py            # Lokaal draaien zonder exe
├── LEESMIJ.txt              # Gebruikersuitleg + "Nieuw in x.y.z" per versie (nieuwste bovenaan, onder de installatie-uitleg)
├── memory/                  # Geheugenarchief (MEMORY.md = index)
└── CLAUDE.md                # Dit bestand
```
- `docs/handleiding.md` = de handleiding (export van de Claude-doc; vanaf nu hier bijhouden).

## Tech Stack
| Laag | Technologie |
|---|---|
| Viewer | HTML + JavaScript zonder build-stap (`index.html` laadt `viewer.js` direct) |
| Bibliotheken | three.js, jsPDF, d3-delaunay, laz-perf (wasm), sql.js (in `vendor/`) |
| Windows-exe | Go 1.24 (`bron-exe/`, module `ptsviewer`), go-winres voor icoon/versie-info |
| Externe data | PDOK: BGT, bomen, luchtfoto, kadaster (BRK), NWB |
| Tests | Playwright (`playwright-core`) in Microsoft Edge, Node |
| CI/CD | {{nog geen: tests draaien lokaal op Windows}} |
| Distributie | `dist\Lutrea-Profielviewer-X.Y.Z.exe` + `_compleet_X.Y.Z.zip` via `tools\bouw.ps1` |

## Architectuur
- Alles draait client-side in de viewer; de exe embedt de app (`//go:embed all:app`), serveert hem op
  127.0.0.1:8017 (bezet? dan een vrije poort) en opent Chrome/Edge als app-venster. Details: `docs/ARCHITECTUUR.md`.
- Grote puntenwolken worden eenmalig omgezet naar een eigen tegelformaat (`pv-tegels-1`, vakken van 50 × 50 m) in de projectmap.

---

## Git-regels
- Commit met `X.Y.Z: <wat>` en tag `vX.Y.Z` bij een oplevering.
- Alles gaat direct op `main`; geen aparte branches of pull requests nodig.
- Nooit `--force` zonder expliciete toestemming.

## Testing Strategy
Zie `tests/README.md`. Kort: `cd tests && npm install && node run_alle.js` (Edge, poort 8132).
Elke test print aan het eind `fouten: geen` als alles goed ging. Testwolk van 16 miljoen punten:
`testdata/groot/maak_dijk_16mln.py` (Python + numpy + laspy) en `node run_alle.js groot`.

---

## Gedragsregels
- Vraag door bij twijfel; nooit aannames doen over intentie of scope.
- Leg na elke wijziging kort uit wat en waarom.
- Werk in stappen: één logische eenheid per keer, niet alles ineens.
- Vraag altijd bevestiging vóór destructieve acties.

### Afspraken met Marco
- **Altijd Nederlands**: antwoorden, UI-teksten, statusmeldingen, commentaar in de code, LEESMIJ.
- **Volledige, werkende opleveringen**: een gebouwde exe (+ zip), geen losse codefragmenten.
- **Visuele terugkoppeling**: laat zien hoe het eruitziet (screenshot van scherm/PDF/DXF-render) bij UI-wijzigingen.
- Marco is CAD/BIM-specialist (Civil 3D, QGIS, NLCS); termen als as, station, offset, maaiveld, NAP, RD, BGT, legger kent hij.
- Bij twijfel over iets wat lastig terug te draaien is: eerst vragen. Anders: doen en kort melden.
- Liever een kleine, geteste stap (nieuwe patchversie) dan een grote onafgemaakte.

### Versie ophogen en opleveren
1. `python tools/zet_versie.py X.Y.Z` — past index.html (titel, label, `viewer.js?v=N`), main.go,
   LEESMIJ (kopregel), `bron-exe/winres/winres.json` en de `.syso` aan.
   - Andere lengte van het versienummer (2.9.5 → 2.10.0)? Dan de `.syso` opnieuw maken (het script zegt hoe:
     `go run github.com/tc-hib/go-winres@latest make --in winres/winres.json --out rsrc` in `bron-exe`).
2. Bovenaan in LEESMIJ.txt een blok `Nieuw in X.Y.Z — <titel>` (stijl: zie de bestaande blokken).
3. `docs/handleiding.md` bijwerken (versieregel bovenaan + de betreffende sectie).
4. `tests`: `node run_alle.js` moet helemaal groen zijn (zie tests/README.md).
5. Bouwen: `.\tools\bouw.ps1` → `dist\Lutrea-Profielviewer-X.Y.Z.exe` en `dist\Lutrea-Profielviewer_compleet_X.Y.Z.zip`.
6. Git: commit met `X.Y.Z: <wat>` en tag `vX.Y.Z`.

Patchversie (2.9.x) voor fixes en kleine features; minor (2.10.0) voor een nieuw hoofdstuk.

### Werken in viewer.js
- Zoek met grep; de secties beginnen met kopcommentaar `/* ──────── … */`. Namen zijn Nederlands
  (`laadBestand`, `maakPdf`, `tegelbronVoor`, `projectOpslaanInMap`, `berekenDwarsprofiel`, …).
- Geen build-stap: index.html laadt viewer.js direct. Na een wijziging: `viewer.js?v=N` ophogen (doet zet_versie.py).
- Lokaal draaien zonder exe: `python dev-server.py 8132 .` en open http://127.0.0.1:8132/index.html,
  of de testserver uit tests/hulp.js.
- `window.__pvTest` is een haakje voor de tests (hoogteOp, dwars, detailVakken, …). Laten staan.
- Instellingen staan in localStorage (`ptsviewer-*`, `pv.*`), recente projectmappen in IndexedDB `profielviewer`.
- Grote puntenwolken: denk aan geheugen (browsertabblad ± 4 GB). Typed arrays waar het kan; nooit
  per punt objecten maken; lange lussen opdelen met `await new Promise(r => setTimeout(r, 0))`.
- Coördinaten altijd RD (EPSG:28992), hoogtes m NAP. Offset negatief = links van de as (in de richting van oplopend station).

## Plan en besluit
<!-- brbnt-plan-regel: v1 -->
- Bij een nieuwe functie, een wijziging die uit meer dan één fase bestaat, een schema- of architectuurwijziging, of wanneer de gebruiker erom vraagt: stel eerst een plan en een beslisdocument op met de skill `brbnt-plan`, ook wanneer je in plan mode werkt. Bij een kleine, afgebakende fix is dat niet nodig.
- Bouw nooit voordat de beslisser akkoord heeft gegeven voor die fase in het beslisdocument. Ontbreekt het akkoord, of is het niet expliciet genoeg, dan stel je voor om het eerst op te halen in plaats van te beginnen.
- Plannen en beslisdocumenten staan in `docs/` als `<naam>.plan.md` en `<naam>.beslis.md`. Zoek eerst in `plan-beslis-index.md`, lees dan het beslisdocument, en open het plan alleen als je techniek nodig hebt.
- Commit-berichten voor planwerk beginnen met de fase-prefix uit het plan, bijvoorbeeld `F2:`.

## Scope-grenzen
- `vendor/` = bibliotheken. Niet aanpassen.
- `bron-exe/app/` en `dist/` worden door `tools/bouw.ps1` gemaakt (staan in `.gitignore`); niet met de hand bewerken.
- {{Overige scope-grenzen, bijv. wat buiten deze repo valt}}

## Conventies die worden afgedwongen (niet alleen gedocumenteerd)
Afgedwongen:
- `window.__pvTest` blijft bestaan: afgedwongen door `tests/links_rechts.test.js`, `tests/nwb.test.js` en `tests/projectmap_bospad.test.js` (alleen als de tests lokaal draaien).

Nog niet afgedwongen, wel afgesproken:
- Alle tests groen vóór een oplevering (`node run_alle.js`): alleen een afspraak, er is nog geen CI of hook.
- Altijd Nederlands in UI-teksten en codecommentaar: alleen een afspraak, nog niet getest.
