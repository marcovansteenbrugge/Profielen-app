# Plan 2.10 — de Profielviewer als echt Windows-programma

Vastgelegd op 26 oktober 2026 (Marco en Claude). Status: **fase A klaar (2.10.0, patch 2.10.1); volgende: fase C**. Werk dit plan bij
als een fase klaar is of als er iets verandert (vink af, noteer beslissingen onderaan).

## Waarom

Nu is de exe een startprogramma dat een lokale server draait en de viewer in een kaal Chrome/Edge-venster
opent. Dat geeft:
- afhankelijkheid van Chrome/Edge + een eigen browserprofiel (soms leeg/donker venster bij de eerste start);
- elke sessie opnieuw toestemming vragen voor de projectmap (File System Access API);
- de geheugengrens van een browsertabblad ("Out of Memory" bij 10 mln punten + opslaan);
- geen bestandskoppeling (.pvproj dubbelklikken), geen installatie, updates = exe handmatig vervangen;
- de Windows-waarschuwing "Windows heeft uw pc beschermd" (niet ondertekend).

## Gekozen richting: optie 2

Eigen Windows-venster met **WebView2** (de Edge-webweergave die in Windows 10/11 zit) in de bestaande Go-exe.
De viewer (index.html/viewer.js) blijft vrijwel ongewijzigd, dus nieuwe functies blijven net zo snel te bouwen.
Afgewezen: alles opnieuw native bouwen (maanden werk, alle uitvoer opnieuw), of zo laten.

Doelplatform: Windows 10/11 x64. Marco test op zijn Windows 11-laptop.

## Fasen

**Volgorde (vastgelegd 27-10-2026):** A ✅ → **C** → **E** (E1, E2, E3) → B → D; ondertekenen los.
Waarom zo:
- **C vóór E**: de exe kan grote scans pas zelf omzetten als hij het echte pad van het bronbestand en de
  projectmap kent; de browser geeft alleen een handvat zonder pad. C maakt dat pad beschikbaar.
- **E zo vroeg mogelijk**: hier zit de winst voor de data (geen browsergeheugen, alle kernen). Opgeknipt:
  E1 LAS en PTS (eenvoudig), E2 LAZ (onzeker: begint met een haalbaarheidsproef), E3 optioneel
  "profielen uit alle punten" via de exe.
- **B na C**: `.pvproj` dubbelklikken werkt pas met eigen bestandstoegang; verder is B gemak, geen data.
- **D na B**: bijwerken heeft een vaste installatieplek nodig, en de plek voor updates is nog open.

Versienummers schuiven op: 2.10.1 werd een patch (log, foutmelding, bouwscript). Voorlopig: C = 2.10.2,
E1 = 2.11.0, E2/E3 = 2.11.x, B en D daarna. Elke fase krijgt een eigen plan- en beslisdocument
(`docs/<naam>.plan.md` en `.beslis.md`, skill brbnt-plan); dit bestand blijft het overzicht.

Grootte, vergeleken met fase A (vier kleine deelfasen, gebouwd en getoetst op één avond); geen
tijdsinschatting, de werkelijke meting staat per fase in het plan:
C 2 à 3 × A · E1 ± 2 × A · E2 onbekend (mogelijk het grootste stuk) · E3 ± A · B ± A · D ± A.

Elke fase wordt een eigen (patch)versie met LEESMIJ-blok, handleiding-update en groene tests.
Houd de oude manier (Chrome/Edge-app-venster) als **terugvaloptie** zolang WebView2 nieuw is.

### Fase A — eigen venster (2.10.0) ✅
Gebouwd en getoetst 26–27 oktober 2026: zie `docs/webview2-venster.plan.md` en `.beslis.md`.
- [ ] Go-binding voor WebView2 kiezen en uitproberen, bij voorkeur zonder cgo (zodat `CGO_ENABLED=0` blijft):
      `github.com/jchv/go-webview2` (eigen loader in Go, geen DLL nodig) of `github.com/wailsapp/go-webview2`.
- [ ] Bestaande http-server houden (127.0.0.1:8017) en WebView2 daarheen laten navigeren: zelfde origin,
      dus localStorage/IndexedDB/service worker blijven werken.
- [ ] WebView2-gegevensmap: `%LOCALAPPDATA%\Lutrea\Profielviewer\WebView2`. Let op: instellingen uit het oude
      Chrome-profiel (o.a. PDF-stempelgegevens, logo's, recente projecten) gaan niet vanzelf mee → eenmalig
      "instellingen overnemen" aanbieden of in de LEESMIJ melden.
- [ ] Venster: titel met versie, icoon, gemaximaliseerd starten, grootte/positie onthouden.
- [ ] Venster dicht = programma stopt (hartslag-logica alleen nog voor de terugvaloptie).
- [ ] Eén exemplaar: start je hem nog een keer, dan het bestaande venster naar voren (+ meegegeven bestand doorgeven, zie fase C).
- [ ] WebView2-runtime ontbreekt (zeldzaam)? Melding + terugvallen op het Chrome/Edge-app-venster.
- [ ] DevTools uit in de opgeleverde versie (aan met een omgevingsvariabele, bv. `PV_DEVTOOLS=1`).
- [ ] .syso opnieuw maken met go-winres (versie 2.10.0 is langer dan 2.9.5; zie tools/zet_versie.py).
- Klaar als: start < 3 s zonder Chrome-profiel, sluiten stopt het proces, alle tests groen,
  handmatig: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT (PDOK).

### Fase B — installatie en bestandskoppeling (na E)
- [ ] Zelfinstallatie zonder beheerdersrechten: bij de eerste start vanuit Downloads aanbieden om te
      installeren in `%LOCALAPPDATA%\Programs\Lutrea Profielviewer\`.
- [ ] Startmenu-snelkoppeling (en optioneel bureaublad).
- [ ] Verwijderen via Windows-instellingen: `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\LutreaProfielviewer`.
- [ ] Bestandskoppeling `.pvproj` (HKCU\Software\Classes): dubbelklikken opent het project; eigen icoon.
      (Openen vanaf een pad vraagt fase C.)
- [ ] Optioneel: "Openen met Profielviewer" voor .las/.laz/.pts.
- Klaar als: installeren, starten via startmenu, verwijderen en opnieuw installeren werken op Marco's laptop.

### Fase C — eigen bestandstoegang, geen toestemmingsvragen meer (2.10.2)
Plan: `docs/eigen-bestandstoegang.plan.md` en `.beslis.md`.
- [ ] In de exe: `/__pv/fs/…` (lijst, lees met bereik, schrijf atomair via tijdelijk bestand + hernoemen,
      map maken, verwijderen, info). **Beveiliging**: sessietoken dat de exe in de WebView2-pagina zet
      (bv. `AddScriptToExecuteOnDocumentCreated`) en dat elk verzoek als header meestuurt, plus Origin-controle.
      Zonder token geen toegang (anders kan een willekeurige website in een gewone browser lokale bestanden aanspreken).
- [ ] Windows-mapkiezer en bestandskiezer vanuit de exe (`IFileOpenDialog`, ook met `FOS_PICKFOLDERS`).
- [ ] In viewer.js een adapter die zich gedraagt als `FileSystemDirectoryHandle`/`FileSystemFileHandle`
      (`getDirectoryHandle`, `getFileHandle`, `entries`, `removeEntry`, `createWritable`, `getFile`, `isSameEntry`,
      `queryPermission`/`requestPermission` → altijd toegestaan), zodat `projectMap` gewoon een "native map" wordt
      en de rest van de code (tegels, project, uitvoer) niet hoeft te veranderen.
- [ ] Recente projecten als pad; `.pvproj` dubbelklikken → `openProjectMap(nativeMap(map van het bestand))`.
- [ ] Slepen van een .las/.laz/.pts op het venster opent de puntenwolk.
- Klaar als: geen enkele toestemmingsvraag meer, .pvproj dubbelklikken werkt, alle tests groen
  (tests kunnen de adapter testen met de testserver in tests/hulp.js uitgebreid met dezelfde `/__pv/fs`-API).

### Fase D — automatisch bijwerken (na B)
- [ ] Update-adres instelbaar (standaard ingebakken bij het bouwen): een JSON
      `{ "versie": "2.10.4", "url": "…/Lutrea-Profielviewer-2.10.4.exe", "sha256": "…", "notities": "…" }`.
- [ ] Bij het starten (hooguit 1× per dag) controleren; in de viewer een balk "Versie x beschikbaar — Bijwerken".
- [ ] Downloaden naar een tijdelijk bestand, sha256 controleren, lopende exe hernoemen naar `.oud`,
      nieuwe op zijn plek, herstarten; `.oud` bij de volgende start opruimen.
- [ ] **Open**: waar komen de updates te staan? (SharePoint/OneDrive van Lutrea, een website, GitHub Releases.)
      SharePoint-links zijn vaak geen directe downloads; even uitzoeken.

### Fase E — omzetten van grote scans in de exe (2.11, direct na C)
- [ ] `importeerNaarTegels` naar Go: LAS en PTS eerst (eenvoudig), daarna LAZ (geen kant-en-klare Go-bibliotheek:
      laz-perf als WASM in wazero draaien, of een port). Zelfde formaat `pv-tegels-1` (zie ARCHITECTUUR.md).
- [ ] Voortgang naar de viewer (polling of server-sent events), afbreken mogelijk.
- [ ] Doel: Wallach (79 mln punten) en groter zonder browsergeheugen; meerdere processorkernen.
- [ ] Daarna ook "profielen uit alle punten" en het detail-bovenaanzicht via de exe (optioneel).

### Los: ondertekenen
- [ ] Code-signing-certificaat op naam van Lutrea Group B.V. (OV-certificaat of de signing-dienst van Microsoft);
      `signtool` in `tools/bouw.ps1`. Moet via Lutrea zelf worden aangevraagd. Tot die tijd blijft de
      SmartScreen-waarschuwing bij nieuwe versies.

## Risico's en aandachtspunten
- Bedrijfsbeveiliging op laptops (AppLocker/Defender) kan uitvoeren uit `%LOCALAPPDATA%\Programs` of een
  niet-ondertekende exe tegenhouden → vroeg testen op een "strenge" Lutrea-laptop.
- WebView2 en de File System Access API: werkt, maar toestemmingen gedragen zich anders dan in Chrome → fase C lost dat op.
- Geheugen blijft in fase A–D hetzelfde als in de browser (WebView2 = Chromium). Pas fase E haalt het zware werk eruit.
- Instellingen uit het oude browserprofiel gaan niet vanzelf mee (fase A).

## Beslissingen en open vragen
- 26-10-2026: optie 2 gekozen (WebView2-venster, viewer-code blijft). Eigen tegelformaat i.p.v. COPC (2.9.0).
- 26-10-2026: verder werken in Claude Code op Marco's Windows 11-laptop, met git.
- 27-10-2026: fase A klaar (2.10.0); patch 2.10.1. Volgorde voor de rest: C → E → B → D (zie Fasen).
- Open: plek voor updates (fase D); certificaat (los); .las/.laz ook koppelen (fase B, optioneel).
