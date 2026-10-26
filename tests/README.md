# Tests

Automatische tests met Playwright. Ze starten zelf een kleine server (poort 8132, zie `hulp.js`)
en draaien in **Microsoft Edge** (staat op elke Windows 10/11-pc).

## Eenmalig
```
cd tests
npm install            # playwright-core
```
(Geen `npx playwright install` nodig: we gebruiken de geïnstalleerde Edge.)
Andere browser: zet `PV_CHROMIUM` op het pad van een chrome.exe/chromium, of `PV_KANAAL=chrome`.

## Draaien
```
node run_alle.js            # alle snelle tests (± 5 minuten)
node run_alle.js groot      # plus de zware test met 16 miljoen punten
node maaiveld.test.js       # één test los
```
Elke test print aan het eind `fouten: geen` als alles goed ging; run_alle.js zet er OK/FOUT voor.
Uitvoer (screenshots, PDF, DXF, …) komt in `tests/uit/` — handig om te bekijken.

## Wat er getest wordt
| Test | Wat |
|---|---|
| stationering_snoei | dijkpalen, hectometrering, snoeicheck + kadaster, CSV, PDF, GeoPackage, DXF, project opslaan/openen |
| doorvaart | doorvaartcontrole onder een brug (multibeam + onder-/bovenzijde brug), PDF, GeoPackage |
| ifc (bospad / brug) | IFC 4.3-export |
| dxf_bladen brug A3 | DXF met dezelfde bladen als de PDF (layouts, viewports) |
| project_losbestand | oude manier: project als los .json (Nieuw, Opslaan, Opslaan als, Openen) — gebruikt `uit/paal_project.json` van stationering_snoei |
| lagen_aanuit | BGT/bomen/kadaster aan-uit in het bovenaanzicht |
| maaiveld | vinkje maaiveld (klasse 2), Alle punten, Detailstrook |
| projectmap | projectmap: omzetten naar vakken, opslaan + backup, uitvoer\, recent openen, Opslaan als |
| projectmap_bospad | projectmap met .pts, kadaster, snoeicheck uit de vakken, inzoomen |
| links_rechts | profielbreedte links/rechts los, PDF/DXF/IFC, opslaan/openen |
| nwb | As uit het NWB (met nagemaakte PDOK-gegevens) |
| zoom_vakken | vakkenraster en schaalbalk bij inzoomen |
| groot_import | 16 mln punten omzetten, Alle punten, Detailstrook (vraagt `testdata/groot/dijk_16mln.las`) |

De projectmap-tests gebruiken de "Origin Private File System" van de browser als nep-projectmap
(`showDirectoryPicker` wordt in de test vervangen). PDOK wordt in de tests geblokkeerd of nagemaakt.

## Testdata
- `testdata/snoei_test/` — bospad (puntenwolk, as, kadaster, dijkpalen); `maak_testdata.py` maakt ze opnieuw.
- `testdata/doorvaart_test/` — vaarweg met brug (multibeam, onder-/bovenzijde, as).
- `testdata/groot/` — `dijk_begroeid.las` (3 mln punten, met begroeiing in klasse 3/4) en de scripts
  `maak_dijk_16mln.py` / `maak_dijk_begroeid.py` (Python + numpy + laspy; draaien in die map).
