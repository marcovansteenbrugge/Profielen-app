# Architectuur — Lutrea Profielviewer 2.9.5

## Overzicht

```
Lutrea-Profielviewer.exe (Go, bron-exe/)
 ├─ embedt app/ (index.html, viewer.js, vendor/, icons/, …)
 ├─ http-server op 127.0.0.1:8017 (bezet? dan een vrije poort)
 └─ opent Chrome of Edge als app-venster (--app=…, eigen profiel)
        └─ index.html + viewer.js = de hele viewer (alles client-side)
               ├─ PDOK (internet): BGT, bomen, luchtfoto, kadaster (BRK), NWB wegen/vaarwegen
               └─ bestanden: <input type=file>, File System Access API (projectmap), downloads
```

## De exe (bron-exe/main.go)

- `//go:embed all:app` — `tools/bouw.ps1` kopieert de app-bestanden eerst naar `bron-exe/app/`.
- Draait er al een viewer op poort 8017 (`/__ptsviewer/ping`)? Dan alleen een venster openen naar die server.
- Browser: Chrome of Edge (`zoekBrowser`) met `--app=URL --user-data-dir=%LOCALAPPDATA%\Lutrea\PTS-viewer\browserprofiel`
  en een reeks vlaggen tegen welkomstschermen. Log: `%LOCALAPPDATA%\Lutrea\PTS-viewer\log.txt`.
- Stoppen: de pagina stuurt een hartslag (`/__ptsviewer/hartslag`, vanuit een Web Worker, elke 10 s) en bij sluiten
  `dicht` (sendBeacon). Stopregels: `dicht` + 15 s geen hartslag → stoppen; browserproces weg + 10 min stil → stoppen
  (crashmarge, zodat Vernieuwen na een "Out of Memory" werkt); `/__ptsviewer/stop` = Afsluiten-knop.
- `rsrc_windows_amd64.syso` = icoon, versie-info, manifest (DPI-aware). Te maken met go-winres uit `winres/winres.json`.

## viewer.js — de belangrijkste onderdelen

Eén IIFE. Globale toestand o.a.:
`xs, ys, zs, cs` (werkwolk A, JS-arrays), `delaunay` (d3-delaunay) + `incident` (CSR: driehoeken per punt),
`assen / actieveAs / asPunten`, `dwarsStations`, `laatsteBestand` (File óf tegelbron), `projectMap`,
`volleProfielen` (profielen uit alle punten), `detailStrook`, `wolkB`, `brugOnder/brugBoven`, `begroeiing`,
`bgtLagen`, `boomLagen`, `percelen`, `palen`.

### Inlezen
- Lezers: `leesPts`, `leesLasHeader`, `leesLasPunten`, `leesLazPunten` (laz-perf wasm, per chunk).
- Alle lezers voeden een **sink**: `voegToe(x, y, z, r, g, b, klasse)`, `aantalGezien`, `resultaat()`,
  optioneel `async naBlok()` (wordt tussen blokken afgewacht — gebruikt door de tegelschrijver).
- Sinks: `maakUitdunner(limiet)` (raster, per cel hoogste/laagste punt; eigen hashtabel in typed arrays),
  `maakMaaiveldKeuze` (klasse 2 als het bestand geclassificeerd is), `alleenGrondVan`, `maakStrookFilter`
  (strook langs de as), `maakProfielVerzamelaar` (punten bij de profiellijnen), `maakBegroeiingSink`.
- `dunUit(xs, ys, zs, max, cs)` = exact uitdunnen naar het doelaantal (raster + hashtabel).
- `laadBestand(bron, behoud, strook)` → `activeerPuntenwolk(...)` bouwt de surface (`new d3.Delaunay(platteCoords)`,
  `lichtNet` ruimt hulptabellen op, `bouwIncidentie`).
- `hoogteOp(x, y)`: `delaunay.find` met hint (vorige punt) + `zoekDriehoek` (driehoeken van het punt en zijn buren).

### Tegelwolk ("vakken", sinds 2.9.0)
- Eenmalig omzetten: `importeerNaarTegels(bestand, wolkMap)` met `maakTegelSchrijver` → in de projectmap:
  `puntenwolk\A - <scan>\info.json`, `overzicht.pvt`, `overzicht_maaiveld.pvt`, `tegels\<tx>_<ty>.pvt`.
- Vakken van 50 × 50 m (`TEGEL_M`), formaat `pv-tegels-1`, 16 bytes per punt little-endian:
  `int32 x, int32 y` (mm t.o.v. `info.oorsprong`), `int32 z` (mm NAP), `uint8 klasse, r, g, b`.
- `info.json`: oorsprong, aantal, bbox, klassen (telling), `tegels: [[tx, ty, n, minZ, maxZ], …]`, overzicht, bron (naam/grootte/datum).
- `maakTegelbron(map, info)` gedraagt zich als "bestand" voor de rest (`laatsteBestand.tegelbron === true`).
- `leesTegels(bron, onVoortgang, sink, kader, tegelFilter)` — alleen de vakken die nodig zijn
  (`tegelsLangsAs(half)`, `profielKader`, `strookKader`). `leesOverzicht` voor de werkwolk.
- Profielen komen automatisch uit alle punten (`planVolleProfielen` → `maakVolleProfielen`).
- Bovenaanzicht: `zichtbareVakken` + `laadDetailVakken` (cache ± 16 mln punten, max 10 mln in beeld),
  `rasterPunten`/`blokjesInPix` (ImageData i.p.v. fillRect), `tekenVakkenRaster`, `tekenSchaalEnDetail`.

### Project
- Projectmap (sinds 2.9.0): `<map>.pvproj` (JSON, `formaat: 'pvproj-1'`, verwijst naar `puntenwolkMap`),
  `ondergrond\bgt.json|bomen.json|kadaster.json`, `uitvoer\`, `backup\` (vorige 10 .pvproj).
  Functies: `vraagProjectMap`, `projectOpslaanInMap`, `openProjectMap`, `toonProjectOpenen` (recent: IndexedDB).
  Toegang via de File System Access API (`showDirectoryPicker`) — vraagt per sessie toestemming (zie het plan, fase C).
- Los bestand (oud, .json): `opslaanLosBestand`, `openLosProjectbestand`, `laadProjectBestand`.
- `maakProjectBlob(opties)`: puntenwolken als `@@PV-BINAIR-n@@` in de JSON, base64 in stukken in de Blob.
  `leesProjectTekst` haalt die velden er vóór `JSON.parse` uit. `pasProjectToe(project)` zet alles terug.
- Uitvoer met een projectmap gaat via `kiesOpslag` direct naar `uitvoer\` (`vrijeNaam`: _2, _3 …).

### Uitvoer
- PDF: `maakPdf(inst, onVoortgang, handle, voorbeeld, dxf)` (jsPDF; bladen: bovenaanzicht, lengteprofiel,
  dwarsprofielen, doorvaart, snoeilijst, dekking, 3D). Stempel/legenda/kader.
- DXF: `DxfSchrijver` (R2010, sjabloon) — `maakDxfMetBladen` maakt dezelfde bladen als layouts met viewports.
- IFC 4.3: `maakIfc` + `IfcSchrijver` (IfcAlignment, IfcReferent, terrein, ruimtes).
- GeoPackage: sql.js. CSV: snoeilijst.

### Toetsen en extra's
- Doorvaart (`dv…`, doorvaartbox onder een brug), snoeicheck (`sn…`, begroeiing in een strook, percelen),
  dekkingskaart (`maakDekking`), stationering (`palen`, dijkpalen / hectometrering), NWB-as (`haalNwbOp`, `nwbRoute`).
- Profielbreedte links/rechts los: `profielL()`, `profielR()`, `profielBreedte()` (verborgen veld `dwarsBreedte` = L+R).
- 3D: three.js; boven 3 mln punten een lichter net (`drieDPunten`).
- Vastlopers: `markeerBezig/markeerKlaar` (localStorage `pv.bezig`), melding bij de volgende start (`controleerVorigeCrash`).
