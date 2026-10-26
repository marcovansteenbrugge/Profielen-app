# Lutrea Profielviewer — werkafspraken voor Claude Code

Lees dit eerst. Daarna, afhankelijk van de taak: `docs/ARCHITECTUUR.md` (hoe het in elkaar zit),
`docs/PLAN-2.10-windows-programma.md` (het lopende plan), `tests/README.md` (testen).

## Wat is dit

De Lutrea Profielviewer is een eigen tool van Marco van Steenbrugge (Lutrea Group B.V., Breda).
Hij maakt van een puntenwolk (.las/.laz/.pts, RD/NAP) een as, lengte- en dwarsprofielen en
uitvoer: PDF (op schaal, met stempel), DXF (zelfde bladen als layouts), IFC 4.3, GeoPackage, CSV.
Met toetsen: doorvaartcontrole (brug), snoeicheck (bomen langs een pad + kadaster), dekkingskaart,
stationering (dijkpalen/hectometrering). Gebruikers: Marco en collega's; klanten o.a. Gemeente
's-Hertogenbosch. Huidige versie: **2.9.5** (zie `bron-exe/main.go`, `appVersie`).

- `index.html` + `viewer.js` (één groot bestand, ± 13.300 regels, één IIFE) = de hele viewer (browser-app).
- `vendor/` = bibliotheken (three.js, jsPDF, d3-delaunay, laz-perf (wasm), sql.js). Niet aanpassen.
- `bron-exe/` = de Windows-exe in Go: embedt de app, start een lokale server en opent een venster.
- `LEESMIJ.txt` = gebruikersuitleg + "Nieuw in x.y.z" per versie (nieuwste bovenaan, onder de installatie-uitleg).
- `docs/handleiding.md` = de handleiding (export van de Claude-doc; vanaf nu hier bijhouden).
- `tests/` = automatische tests (Playwright in Edge), `testdata/` = testwolken.

## Afspraken met Marco

- **Altijd Nederlands**: antwoorden, UI-teksten, statusmeldingen, commentaar in de code, LEESMIJ.
- **Volledige, werkende opleveringen**: een gebouwde exe (+ zip), geen losse codefragmenten.
- **Visuele terugkoppeling**: laat zien hoe het eruitziet (screenshot van scherm/PDF/DXF-render) bij UI-wijzigingen.
- Marco is CAD/BIM-specialist (Civil 3D, QGIS, NLCS); termen als as, station, offset, maaiveld, NAP, RD, BGT, legger kent hij.
- Bij twijfel over iets wat lastig terug te draaien is: eerst vragen. Anders: doen en kort melden.
- Liever een kleine, geteste stap (nieuwe patchversie) dan een grote onafgemaakte.

## Versie ophogen en opleveren

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

## Werken in viewer.js

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

## Testen

Zie `tests/README.md`. Kort: `cd tests && npm install && node run_alle.js` (Edge, poort 8132).
Elke test print aan het eind `fouten: geen` als alles goed ging. Testwolk van 16 miljoen punten:
`testdata/groot/maak_dijk_16mln.py` (Python + numpy + laspy) en `node run_alle.js groot`.

## Lopend plan

**Versie 2.10: van "browservenster" naar een echt Windows-programma** — zie `docs/PLAN-2.10-windows-programma.md`.
Begin daar bij fase A. Na elke fase: testen op Marco's Windows 11-laptop, opleveren als patchversie.
