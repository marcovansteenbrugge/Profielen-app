---
plan: eigen-bestandstoegang
titel: Eigen bestandstoegang, geen toestemmingsvragen meer (versie 2.10.2)
versie: 1
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ▶ · F2 ○ · F3 ○ · F4 ○           # berekend door de skill
opgesteld: 2026-10-27
opgesteld_door: Claude Code, in opdracht van Marco van Steenbrugge
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer (Lutrea Group B.V.)
beslisdocument: eigen-bestandstoegang.beslis.md
basis_commit: 6eb0ae7
vervangt: -
samenvatting: De exe leest en schrijft de bestanden van de viewer zelf, zodat er geen toestemmingsvragen meer zijn en de exe later (fase E) zelf met paden kan werken; fase C van PLAN-2.10.
trefwoorden: [bestandstoegang, projectmap, toestemming, exe, go, webview2, token, 2.10.2, recente projecten, pvproj]
---

# Plan: Eigen bestandstoegang, geen toestemmingsvragen meer (versie 2.10.2)

## 1. In het kort
1. Nu vraagt de viewer elke sessie opnieuw toestemming voor de projectmap, omdat de browser (ook WebView2) bestandstoegang per sessie bewaakt.
2. Straks doet de exe het lezen en schrijven zelf, via een eigen, afgeschermde verbinding die alleen het eigen venster mag gebruiken.
3. De viewer krijgt een tussenstuk dat zich gedraagt als de bestaande browsermappen, zodat de rest van de code (vakken, project, uitvoer) niet verandert.
4. Daarmee: geen toestemmingsvragen meer, recente projecten met één klik, een `.pvproj` openen vanaf een pad, en een puntenwolk op het venster slepen.
5. Dit is fase C van `docs/PLAN-2.10-windows-programma.md` en de brug naar fase E (omzetten in de exe heeft echte paden nodig). Opgeleverd als 2.10.2, in vijf BRBNT-fasen F0 tot en met F4.

## 2. Aanleiding en doel
De viewer gebruikt de File System Access API van de browser: `showDirectoryPicker` voor de projectmap (`viewer.js:1500`, `:9534`), voor de PDF-map (`:11205`), `showOpenFilePicker` voor een los projectbestand (`:9474`), en `requestPermission` bij elk hergebruik van een bewaarde map (`:1481`, `:9355`, `:9524`). Een bewaarde mapverwijzing (recente projecten in IndexedDB `profielviewer`, `:9490`) verliest na een herstart haar toestemming, dus de gebruiker krijgt bij elke sessie een vraag. Daarnaast geeft de browser nooit het echte pad van een map of bestand; daardoor kan de exe in fase E niet zelf een scan omzetten.

Doel (uit PLAN-2.10, fase C): geen enkele toestemmingsvraag meer in het eigen venster, `.pvproj` openen vanaf een pad werkt, alle tests groen. Daarbij: de exe kent de echte paden van de projectmap.

## 3. Onderzoek en bevindingen
Getoetst tegen `basis_commit` 6eb0ae7:
- Bestandsgebruik in `viewer.js` (13.358 regels), alleen via handvatten: `getDirectoryHandle(..., {create})`, `getFileHandle(..., {create})`, `getFile()` (daarna `slice(a, b).arrayBuffer()`/`text()`, o.a. `:1130`, `:1213`, `:1278`, `:1834`), `createWritable()` met `write()`/`close()` (`:1713`, `:1775`, `:4969`), `entries()` (`:9390`, `:9428`, `:9547`), `removeEntry(..., {recursive})` (`:1544`, `:9417`, `:9430`), `isSameEntry` (`:9404`, `:9499`), `queryPermission`/`requestPermission`. Een tussenstuk met precies deze methoden dekt alle plekken.
- De tegelschrijver (`maakTegelSchrijver`, rond `:1711`) houdt veel bestanden tegelijk open (één `createWritable` per vak) en schrijft in delen. Het tussenstuk moet dus veel gelijktijdige schrijfstromen aankunnen.
- Puntenwolken worden geopend via `<input type="file">` (`index.html:396`, `:428`, `:669`, `:673`, `:719`) als `File`; dat werkt in WebView2 zonder toestemmingsvraag. Vakken worden in JavaScript gemaakt en via het map-handvat weggeschreven. Een gesleept `File` werkt daarom ook met het tussenstuk. Alleen fase E heeft het pad van het bronbestand nodig; dat valt buiten dit plan.
- Opslaan met `showSaveFilePicker` (`kiesOpslag`, `:4935`) vraagt geen toestemming achteraf; buiten projectmap blijft dat zo. Binnen een projectmap gaat uitvoer naar `uitvoer\` (`:4929`) en loopt dan via het tussenstuk.
- `bron-exe/main.go` (419 regels): één `http.ServeMux` op 127.0.0.1 met de routes `/__ptsviewer/ping|hartslag|dicht|stop|voorgrond` en `/` (de app). Startparameters worden gelezen in `main()` (`os.Args`, `:269`). Een server op 127.0.0.1 is ook bereikbaar vanuit een gewone browser op dezelfde pc; elke website zou er een verzoek naartoe kunnen sturen. Bestandstoegang zonder afscherming is daarom niet toelaatbaar.
- `github.com/jchv/go-webview2` (de versie in `go.mod`) heeft `Init(js)` (`webview.go:435`, roept `AddScriptToExecuteOnDocumentCreated` aan) en `Bind`. Met `Init` kan de exe vóór de eigen scripts een sessiesleutel in de pagina zetten die een gewone browser niet heeft.
- De tests draaien tegen een eigen Node-server (`tests/hulp.js`, 41 regels, poort 8132), niet tegen de exe. Om het tussenstuk te testen moet die server dezelfde bestands-API krijgen. Go-tests zijn er nog niet; de exe-kant krijgt eigen `go test`-tests.
- Niet vastgesteld: of een Windows-mapkiezer (`IFileOpenDialog` via COM, zonder cgo) goed werkt als hij vanuit een HTTP-verzoek wordt geopend, modaal voor het venster. Komt bij Open vragen; F1 toetst het.

## 4. Niet in scope
- Installatie en de echte bestandskoppeling van `.pvproj` in Windows (dubbelklikken in de Verkenner): fase B. Hier alleen: de exe opent een `.pvproj` dat als startparameter wordt meegegeven, ook doorgegeven door een tweede start.
- Omzetten van scans in de exe en het pad van het bronbestand (fase E).
- Automatisch bijwerken (fase D), ondertekenen (los).
- Het oude Chrome/Edge-venster (`--browservenster`), de dev-server en de tests in Edge zonder sleutel: die blijven de browserroute gebruiken, met toestemmingsvragen zoals nu.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Bestandstoegang in de exe via `/__pv/fs/…`, met sessiesleutel en Origin-controle | PLAN-2.10, fase C |
| Windows-map- en bestandskiezer vanuit de exe (`IFileOpenDialog`, ook `FOS_PICKFOLDERS`) | PLAN-2.10, fase C |
| Tussenstuk in viewer.js dat zich gedraagt als `FileSystemDirectoryHandle`/`FileSystemFileHandle`; rest van de code ongewijzigd | PLAN-2.10, fase C |
| Bouwen blijft `CGO_ENABLED=0` | `tools/bouw.ps1`, plan webview2-venster |
| Server alleen op 127.0.0.1 | plan webview2-venster, punt 8 |
| Tests via `tests/hulp.js` uitgebreid met dezelfde API | PLAN-2.10, fase C |
| Oplevering als 2.10.2 met LEESMIJ-blok, handleiding, groene tests | CLAUDE.md, "Versie ophogen en opleveren"; PLAN-2.10 (versies, 27-10-2026) |

## 6. Ontwerp en besluiten (technisch)
**Afscherming.** Bij de start maakt de exe een willekeurige sessiesleutel (32 bytes, `crypto/rand`). In het eigen venster zet `w.Init(...)` vóór de eigen scripts `window.__pvNatief = { sleutel, versie }`. Elk verzoek naar `/__pv/` moet de header `X-PV-Sleutel` met die sleutel meesturen (vergelijking met `subtle.ConstantTimeCompare`), de `Host` moet `127.0.0.1:<poort>` zijn (tegen DNS-rebinding), en een aanwezige `Origin` moet `http://127.0.0.1:<poort>` zijn. Anders: 403, en een regel in het log. Zonder eigen venster (terugvaloptie) wordt geen sleutel uitgegeven en is `/__pv/` dicht.

**Bestands-API** (`bron-exe/bestanden.go`, nieuw). Alle paden absoluut, en altijd binnen een toegestane map (zie B2):
- `GET /__pv/fs/info?pad=` → soort, grootte, gewijzigd (ms), naam.
- `GET /__pv/fs/lijst?pad=` → namen met soort.
- `GET /__pv/fs/lees?pad=` met `Range: bytes=a-b` → de bytes (`http.ServeContent`, dus bereiken werken vanzelf).
- `POST /__pv/fs/schrijf/start?pad=` → stroom-id; `POST …/deel?id=` (body = bytes, achter elkaar); `POST …/klaar?id=` → tijdelijk bestand naast het doel wordt met `os.Rename` het doel (atomair); `POST …/afbreken?id=`. Open stromen worden bij het stoppen van de exe opgeruimd.
- `POST /__pv/fs/map?pad=` (maken, met tussenmappen), `POST /__pv/fs/weg?pad=&recursief=` (verwijderen).
- `POST /__pv/kies` met `{soort: "map"|"open"|"opslaan", titel, filter, naam}` → pad of leeg (geannuleerd); opent de Windows-kiezer modaal voor het venster (F1).
- `GET/POST /__pv/recent` → de lijst met recente projectmappen (B1).

**Tussenstuk in viewer.js** (nieuwe sectie `/* ──────── Eigen bestandstoegang (exe) */`). `natieveMap(pad)` en `natiefBestand(pad)` geven objecten met `kind`, `name`, `getDirectoryHandle`, `getFileHandle`, `entries`/`values`/`keys`, `removeEntry`, `isSameEntry` (vergelijkt het pad, zonder hoofdletters), `queryPermission`/`requestPermission` (altijd `'granted'`), `getFile()` (een eigen object met `name`, `size`, `lastModified`, `slice(a, b)` → `arrayBuffer()`/`text()` via `Range`, en `text()`/`arrayBuffer()` voor het geheel) en `createWritable()` (schrijft in delen naar een schrijfstroom). Extra veld `pvPad` voor fase E. Waar nu `window.showDirectoryPicker` wordt aangeroepen, kiest één hulpfunctie: met `window.__pvNatief` de exe-kiezer, anders de browserkiezer. Geen andere wijzigingen in de bestaande code.

**Startparameter.** `Lutrea-Profielviewer.exe "<pad>\project.pvproj"` (of een map): de exe geeft het pad aan de pagina (`window.__pvNatief.openen`); de viewer opent de map van dat bestand met `openProjectMap(natieveMap(...))`. Draait de viewer al, dan stuurt de tweede start het pad mee met `/__ptsviewer/voorgrond` (die bestaat sinds 2.10.0).

**Slepen.** Een `.las`/`.laz`/`.pts` op het venster slepen roept `openPuntenwolkA(file)` aan, net als de knop. Een gesleept `.pvproj` opent het project. Hiervoor is geen pad nodig (punt 3).

**Verdieping per besluit** (de leesbare versie staat in het beslisdocument):

- **B1 Recente projecten** (nodig vóór F3). De huidige lijst staat in IndexedDB als browserhandvatten, die na een herstart weer toestemming vragen. Voorstel: de exe bewaart de lijst als paden in `%LOCALAPPDATA%\Lutrea\Profielviewer\recent.json` (laatste 8, zoals nu); het eigen venster gebruikt alleen die lijst. De oude lijst blijft in de browserroute bestaan maar wordt niet overgezet: je opent elk project één keer opnieuw. Alternatief: de oude lijst bij de eerste start overzetten; dat kan niet zonder toestemmingsvraag per map (een handvat geeft geen pad), dus het voorstel is eenvoudiger en even snel voor de gebruiker.
- **B2 Waar mag de exe lezen en schrijven** (nodig vóór F0). Voorstel: alleen binnen mappen en bestanden die de gebruiker deze sessie zelf koos (kiezer, slepen, startparameter) of die in de recente lijst staan; daarbuiten 403. Samen met de sessiesleutel betekent dat: zelfs een fout in de viewer kan niet buiten je projecten schrijven. Alternatief: overal op de schijf, alleen met de sessiesleutel; eenvoudiger, maar een fout of een kwaadaardig bestand in de viewer (bijvoorbeeld een gemanipuleerde DXF die een fout uitbuit) zou dan overal bij kunnen.
- **B3 De browserroute houden** (nodig vóór F2). Voorstel: zonder `window.__pvNatief` (oude venster, dev-server, Edge-tests) werkt alles zoals nu, met toestemmingsvragen; het tussenstuk wordt alleen gebruikt in het eigen venster. Alternatief: de browserroute weghalen; minder code, maar dan geen terugval meer en de bestaande tests moeten allemaal via de nieuwe API.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Bestands-API in de exe (`bestanden.go`): sessiesleutel via `Init`, Host- en Origin-controle, info/lijst/lees met bereik/schrijfstromen met atomair afronden/map/weg, toegestane mappen volgens B2, opruimen bij stoppen | `go vet` schoon en `go test ./...` in `bron-exe` groen, met tests voor: zonder sleutel 403; verkeerde Host 403; pad buiten toegestane map 403 (ook via `..`); lezen met `Range`; schrijven in delen en pas na `klaar` zichtbaar; afbreken laat het doel ongemoeid. Build met `CGO_ENABLED=0` slaagt | B2 | M | Claude Code, high | `F0:` |
| F1 | ▶ vrijgegeven | Windows-kiezer vanuit de exe (`/__pv/kies`): map kiezen, bestand openen, bestand opslaan, via `IFileOpenDialog`/`IFileSaveDialog` zonder cgo, modaal voor het venster; gekozen pad wordt een toegestane map | Build slaagt, `go vet` schoon. Marco bevestigt op zijn laptop: de mapkiezer opent vóór het venster, een gekozen map geeft het pad terug (log), annuleren geeft niets terug en de viewer loopt door | F0 | M | Claude Code, high | `F1:` |
| F2 | ○ niet vrijgegeven | Tussenstuk in viewer.js (`natieveMap`/`natiefBestand`) en één kiezer-hulpfunctie voor alle plekken met `showDirectoryPicker`; `tests/hulp.js` krijgt dezelfde `/__pv/`-API met sleutel; browserroute blijft volgens B3 | Nieuwe test `tests/natieve_map.test.js` (met sleutel via `addInitScript`): projectmap aanmaken, puntenwolk omzetten naar vakken, project opslaan, viewer herladen, project opnieuw openen en vakken lezen, allemaal via de API; geen aanroep van `requestPermission` van de browser; "fouten: geen". `node run_alle.js` helemaal groen | F0, B3 | L | Claude Code, high | `F2:` |
| F3 | ○ niet vrijgegeven | Recente projecten volgens B1, PDF-uitvoermap en los projectbestand via de exe-kiezer, startparameter `.pvproj` (ook doorgegeven door een tweede start), slepen van puntenwolk en `.pvproj` op het venster | `node run_alle.js` groen. Marco bevestigt op zijn laptop: in een sessie met projectmap kiezen, puntenwolk omzetten, opslaan, PDF maken, viewer sluiten en via Recent opnieuw openen komt geen enkele toestemmingsvraag; `Lutrea-Profielviewer.exe "<pad>\x.pvproj"` opent dat project, ook als de viewer al open is; een gesleepte .las of .laz wordt geopend | F1, F2, B1 | M | Claude Code, medium | `F3:` |
| F4 | ○ niet vrijgegeven | Oplevering 2.10.2: `zet_versie.py 2.10.2`, LEESMIJ-blok "Nieuw in 2.10.2", handleiding, `tools/bouw.ps1`, tag `v2.10.2` | `node run_alle.js` en `go test ./...` groen; `dist\Lutrea-Profielviewer-2.10.2.exe` en de zip bestaan; Marco bevestigt de handmatige lijst: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT (PDOK), en met `--browservenster` werkt de projectmap nog zoals in 2.10.1 | F0, F1, F2, F3 | S | Claude Code, medium | `F4:` en `2.10.2:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix; de opleveringscommit volgt de projectregel `2.10.2: <wat>` met tag `v2.10.2`.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** Geen nieuwe persoonsgegevens. Nieuw bestand `%LOCALAPPDATA%\Lutrea\Profielviewer\recent.json` met de paden van de laatste 8 projectmappen (bij B1-voorstel). Er gaat niets naar buiten.
**Beveiliging.** Nieuwe lokale bestands-API op 127.0.0.1, alleen bruikbaar met de sessiesleutel die de exe alleen in het eigen venster zet, met Host- en Origin-controle, en (bij B2-voorstel) alleen binnen gekozen mappen. Geweigerde verzoeken komen in het log. Zonder eigen venster is de API dicht. De sessiesleutel staat nergens op schijf en verandert bij elke start.
**Gebruikers en handleiding.** Geen toestemmingsvragen meer in het eigen venster; recente projecten openen met één klik; mapkiezer is de gewone Windows-kiezer; `.pvproj` als startparameter (koppelen in de Verkenner volgt in fase B); slepen van een puntenwolk op het venster. Recente projecten één keer opnieuw openen (B1). In het oude venster blijft alles als in 2.10.1.
**Beheer en configuratie.** Nieuw bestand `recent.json` (zie boven). Geen nieuwe omgevingsvariabelen. De exe krijgt Go-tests (`go test ./...` in `bron-exe`).
**Releasenotes (kernpunten).** Nieuw: geen toestemmingsvragen meer voor de projectmap; recente projecten blijven werken na herstarten; project openen via de startparameter; puntenwolk slepen op het venster. Gewijzigd: de mapkiezer is de Windows-kiezer.

## 9. Risico's en terugweg
- Beveiliging van de lokale API: de grootste nieuwe aanval-oppervlakte in de exe. Afgevangen met sleutel, Host/Origin-controle en (B2) toegestane mappen; F0 toetst elk van die regels met een Go-test.
- Snelheid: vakken omzetten schrijft duizenden bestanden in delen via HTTP. Lokaal is dat snel, maar niet gemeten; F2 meet de duur van het omzetten van een testwolk via de API tegen de browserroute en noteert die in punt 11.
- Veel gelijktijdige schrijfstromen (één per vak): de exe houdt per stroom een open tijdelijk bestand; bij duizenden vakken kan Windows' limiet op open bestanden spelen. Zo nodig sluit de exe tussen delen en opent opnieuw om achteraan te schrijven.
- COM-kiezer zonder cgo is foutgevoelig (vtables met de hand); F1 is daarom een eigen fase met handmatige toets. Terugval: als `/__pv/kies` mislukt, de browserkiezer (met toestemmingsvraag) zodat je door kunt.
- Terugweg: elke fase is een eigen commit-reeks met prefix (`git revert`); `--browservenster` geeft de oude route; 2.10.1 blijft bruikbaar.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Werkt de COM-kiezer goed als hij vanuit een HTTP-verzoek wordt geopend (eigen thread, modaal voor het venster)? | F1 toetst het; werkt het niet, dan de kiezer via `Dispatch` op de hoofdthread laten openen (planwijziging alleen als de scope verandert) |
| Hoe snel is vakken omzetten via de API vergeleken met de browserroute? | F2 meet het; is het meer dan 1,5 keer zo traag, dan een planwijziging vóór F3 (bijvoorbeeld grotere delen of minder verzoeken) |
| Wat doet de viewer met een project uit de recente lijst waarvan de map verplaatst is? | Melding "map niet gevonden" en de regel uit de lijst halen, zoals nu bij een fout (`viewer.js:9527`) |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-10-27 10:59 | 2026-10-27 11:06 | Marco van Steenbrugge ("Akkoord, bouw F0 van eigen-bestandstoegang op planversie 1.") | Claude Code, claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | medium | 48 / 29.953 | 769842d | transcript (Claude Code 2.1.308) |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-10-27 11:05 | `go vet` schoon | `CGO_ENABLED=0 go vet ./...` in `bron-exe` (met tijdelijke map `app`): geen uitvoer, "VET-SCHOON"; ook met `GOOS=linux` schoon | gehaald |
| F0 | 2026-10-27 11:05 | `go test ./...` in `bron-exe` groen | `CGO_ENABLED=0 go test ./... -v -count=1`: 10 tests PASS, "ok ptsviewer 1.174s" | gehaald |
| F0 | 2026-10-27 11:05 | Test: zonder sleutel 403 | `TestZonderSleutel403` (geen header en verkeerde sleutel: 403; juiste sleutel: 200) en `TestZonderEigenVensterDicht` (geen sleutel uitgegeven: 403): PASS. In de echte exe (proefbuild pv-f0.exe): `/__pv/fs/lijst` zonder sleutel en met sleutel "abc" beide 403, log "verkeerde of ontbrekende sessiesleutel" | gehaald |
| F0 | 2026-10-27 11:05 | Test: verkeerde Host 403 | `TestVerkeerdeHostEnOrigin403`: Host `kwaad.voorbeeld:80` en `localhost:<poort>` 403, Origin `https://kwaad.voorbeeld` 403, eigen Origin 200: PASS | gehaald |
| F0 | 2026-10-27 11:05 | Test: pad buiten toegestane map 403 (ook via `..`) | `TestPadBuitenToegestaneMap403`: lezen, schrijven, map maken en verwijderen buiten de map 403, ook via `\..\` en `/../`, `project2` naast `project`, relatief en leeg pad; gekozen map zelf niet te verwijderen: PASS. `TestKoppelingNaarBuiten403`: junction in de map naar buiten 403: PASS (eerst FAIL met `EvalSymlinks`, hersteld met `echtpad_windows.go`) | gehaald |
| F0 | 2026-10-27 11:05 | Test: lezen met `Range` | `TestLezenMetRange`: `bytes=100-199` en `bytes=990-` geven 206 met precies die bytes, zonder Range 200 met het hele bestand: PASS | gehaald |
| F0 | 2026-10-27 11:05 | Test: schrijven in delen en pas na `klaar` zichtbaar | `TestSchrijvenInDelenPasNaKlaarZichtbaar`: twee delen, doel blijft "oud" tot `klaar`, tijdelijk bestand niet in `lijst`, daarna "nieuw-deel2"; plus 78 stromen tegelijk open en afgerond, geen tijdelijke bestanden over: PASS | gehaald |
| F0 | 2026-10-27 11:05 | Test: afbreken laat het doel ongemoeid | `TestAfbrekenLaatDoelOngemoeid`: bestaand doel blijft "oud", nieuw bestand ontstaat niet, geen tijdelijke bestanden over: PASS. `TestOpruimenBijStoppen`: open stroom bij stoppen opgeruimd: PASS | gehaald |
| F0 | 2026-10-27 11:05 | Build met `CGO_ENABLED=0` slaagt | `go build -trimpath -ldflags "-H windowsgui -s -w"` met `CGO_ENABLED=0`, GOOS windows/amd64: exitcode 0, pv-f0.exe 11.084.288 bytes; gestart: ping "klaar:2.10.1", viewer volledig geladen (log "eerste hartslag"), afsluiten via de knop werkt | gehaald |
| F1 | 2026-10-27 11:11 | Build slaagt | `go build` met `CGO_ENABLED=0`, windows/amd64: exitcode 0, `dist\proef\Lutrea-Profielviewer-F1-proef.exe` 11.111.424 bytes | gehaald |
| F1 | 2026-10-27 11:11 | `go vet` schoon | `CGO_ENABLED=0 go vet ./...` "VET-SCHOON", ook met `GOOS=linux`; `go test ./...` 11 tests PASS, waaronder `TestKiesRoute` (zonder sleutel 403 en kiezer niet geopend, onbekende soort 400, gekozen map daarna toegestaan, annuleren leeg, tweede kiezer tegelijk 409) | gehaald |
| F1 | 2026-10-27 11:11 | Marco bevestigt: de mapkiezer opent vóór het venster | Automatisch (proefexe met `--kiezertest`, vensters van het eigen proces via EnumWindows): alle drie de kiezers hebben het viewervenster als eigenaar en de viewer is uitgeschakeld zolang de kiezer open is (modaal). Bevestiging van Marco nog niet ontvangen | niet toetsbaar |
| F1 | 2026-10-27 11:11 | Marco bevestigt: een gekozen map geeft het pad terug (log) | Nog niet gedaan: een echte keuze vraagt een mens. Wacht op Marco | niet toetsbaar |
| F1 | 2026-10-27 11:11 | Marco bevestigt: annuleren geeft niets terug en de viewer loopt door | Automatisch (Annuleren via IDCANCEL): log "kiezer (map|open|opslaan): geannuleerd", melding "geannuleerd (niets teruggegeven)" voor alle drie; daarna viewer weer bruikbaar en ping "klaar". Bevestiging van Marco nog niet ontvangen | niet toetsbaar |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F0 | Effort medium in plaats van gepland high | Reden onbekend (effort-instelling van de sessie) |
| F0 | Extra: `echtpad_windows.go` (echt pad via `GetFinalPathNameByHandleW`) | De junction-test faalde eerst: Go's `EvalSymlinks` lost een junction niet op, zodat een junction in een projectmap naar buiten kon. Nodig voor B2 |
| F0 | Extra: `tools/bouw.ps1` draait `go vet` en `go test` vóór het bouwen; `BOUWEN.txt` noemt de tests | `go test` heeft de map `app` nodig, die alleen tijdens het bouwen bestaat. Zo draaien de tests bij elke bouw. Via `bouw.ps1` zelf nog niet gedraaid (dat zou `dist\` 2.10.1 overschrijven); dat gebeurt in F4 |
| F0 | Een map die niet leeg is zonder `recursief` verwijderen geeft 409, niet 500 | Windows meldt "map niet leeg" als "bestaat al"; 409 met een duidelijke melding past beter |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-10-27 09:28 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- `docs/PLAN-2.10-windows-programma.md`, fase C en de volgorde van 27-10-2026.
- `docs/webview2-venster.plan.md` (fase A, 2.10.0): venster, `/__ptsviewer/voorgrond`, `Init` in go-webview2.
- `viewer.js` op 6eb0ae7: regels genoemd in punt 3.
- `bron-exe/main.go`, `bron-exe/venster_windows.go`, `tests/hulp.js` op 6eb0ae7.
- `github.com/jchv/go-webview2` v0.0.0-20260205173254-56598839c808, `webview.go` (`Init`, `Bind`).

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
