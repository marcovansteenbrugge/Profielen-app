---
plan: webview2-venster
titel: Eigen programmavenster met WebView2 (versie 2.10.0)
versie: 1
status: gebouwd        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 ✅ · F3 ✅           # berekend door de skill
opgesteld: 2026-10-26
opgesteld_door: Claude Code, in opdracht van Marco van Steenbrugge
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer (Lutrea Group B.V.)
beslisdocument: webview2-venster.beslis.md
basis_commit: 71b0103
vervangt: -
samenvatting: De exe opent de viewer in een eigen WebView2-venster in plaats van een Chrome/Edge-app-venster; fase A van PLAN-2.10.
trefwoorden: [webview2, exe, go, venster, windows, 2.10.0, terugvaloptie, instellingen]
---

# Plan: Eigen programmavenster met WebView2 (versie 2.10.0)

## 1. In het kort
1. De exe opent de viewer straks in een eigen Windows-venster (WebView2, de Edge-webweergave die in Windows 10/11 zit), niet meer in een kaal Chrome/Edge-venster met een eigen browserprofiel.
2. De viewer zelf (index.html/viewer.js) verandert vrijwel niet: het venster laadt dezelfde lokale server op 127.0.0.1:8017.
3. Venster dicht = programma stopt; een tweede keer starten brengt het bestaande venster naar voren.
4. Het oude Chrome/Edge-venster blijft als terugvaloptie bestaan zolang WebView2 nieuw is.
5. Dit is fase A van `docs/PLAN-2.10-windows-programma.md`, opgeleverd als versie 2.10.0, in vier BRBNT-fasen F0 tot en met F3.

## 2. Aanleiding en doel
Nu start `bron-exe/main.go` een lokale server en daarna Chrome of Edge met `--app=URL --user-data-dir=%LOCALAPPDATA%\Lutrea\PTS-viewer\browserprofiel` en een reeks vlaggen tegen welkomstschermen (`openVenster`). Het programma stopt via een hartslag uit de pagina (`/__ptsviewer/hartslag`, `/__ptsviewer/dicht`) en heeft bewakingslogica voor een leeg venster bij de eerste start. Dat geeft de problemen uit PLAN-2.10 ("Waarom"): afhankelijkheid van Chrome/Edge en een eigen browserprofiel, soms een leeg of donker venster bij de eerste start, en een omslachtige stopregeling.

Doel: een eigen venster dat snel en betrouwbaar opent en sluit. Geslaagd als (uit PLAN-2.10, fase A): start < 3 s zonder Chrome-profiel, sluiten stopt het proces, alle tests groen, en handmatig werken: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT (PDOK).

## 3. Onderzoek en bevindingen
Getoetst tegen `basis_commit` 71b0103:
- `bron-exe/main.go` (354 regels): server op `vastePoort = 8017`; bezet door een oudere versie → die wordt gestopt via `/__ptsviewer/stop`; bezet door dezelfde versie → status "start" (niets doen) of "klaar" (nog een venster openen naar die server); anders een vrije poort (`127.0.0.1:0`). Een andere poort betekent een andere origin, dus andere localStorage/IndexedDB.
- `openVenster` zoekt Chrome of Edge (`zoekBrowser`, ook `PTS_BROWSER`), anders de standaardbrowser (`openStandaardBrowser`). Dat blijft de terugvaloptie.
- Stoppen nu: Afsluiten-knop (`viewer.js:4315`, POST `/__ptsviewer/stop`), of "dicht" + 15 s geen hartslag, of 10 min geen hartslag. De hartslag loopt in een worker in `index.html:960-976`.
- `bron-exe/os_windows.go` gebruikt alleen `syscall` (MessageBoxW, verborgen console). `go.mod` heeft nog geen afhankelijkheden; bouwen met `CGO_ENABLED=0` (`tools/bouw.ps1`, `bron-exe/BOUWEN.txt`).
- Proefbouw (in een losse map buiten de repo, 26-10-2026): `github.com/jchv/go-webview2` (versie `v0.0.0-20260205173254-56598839c808`, met `jchv/go-winloader`) bouwt met `GOOS=windows GOARCH=amd64 CGO_ENABLED=0` tot een exe van 3,7 MB. **Niet** gedraaid: hier is geen Windows. Of het venster echt opent, toetst Marco in F0.
- `github.com/wailsapp/go-webview2` heeft getagde versies (laatste v1.0.23), maar is een lagere laag (WebView2-besturing zonder venster en berichtenlus); het venster moet je dan zelf maken.
- `bron-exe/winres/winres.json` staat op 2.9.5; `tools/zet_versie.py` past dat aan, en bij een langer versienummer moet de `.syso` opnieuw (CLAUDE.md, "Versie ophogen en opleveren").
- De tests (`tests/`, Playwright in Edge) testen de viewer via hun eigen testserver (`tests/hulp.js`, poort 8132), niet de exe. De exe-wijziging valt dus buiten de automatische tests; het venster wordt handmatig getoetst.
- Niet vastgesteld: hoe WebView2 zich gedraagt bij `showDirectoryPicker` (projectmap) en de service worker (`index.html:957`). Komt bij Open vragen; F0 toetst het.

## 4. Niet in scope
- Installatie, startmenu en bestandskoppeling `.pvproj` (fase B van PLAN-2.10).
- Eigen bestandstoegang zonder toestemmingsvragen (fase C).
- Automatisch bijwerken (fase D) en omzetten in de exe (fase E).
- Ondertekenen met een certificaat (los punt in PLAN-2.10).
- Geheugengrens: WebView2 is ook Chromium, de grens blijft gelijk (PLAN-2.10, risico's).

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| WebView2-venster in de bestaande Go-exe, viewer-code blijft (optie 2) | PLAN-2.10, besluit 26-10-2026 |
| Bouwen blijft `CGO_ENABLED=0` | PLAN-2.10 fase A, `tools/bouw.ps1` |
| Bestaande server op 127.0.0.1:8017 blijft, WebView2 navigeert daarheen | PLAN-2.10 fase A |
| WebView2-gegevensmap `%LOCALAPPDATA%\Lutrea\Profielviewer\WebView2` | PLAN-2.10 fase A |
| DevTools uit in de oplevering, aan met `PV_DEVTOOLS=1` | PLAN-2.10 fase A |
| Doelplatform Windows 10/11 x64, getest op Marco's Windows 11-laptop | PLAN-2.10, CLAUDE.md |
| Oplevering als 2.10.0 met LEESMIJ-blok, handleiding en groene tests | CLAUDE.md, "Versie ophogen en opleveren" |

## 6. Ontwerp en besluiten (technisch)
**Stroom.** `main()` start de server zoals nu. Daarna, in plaats van `openVenster`: `openWebView2(url)` maakt een venster (titel "Lutrea Profielviewer 2.10.0", icoon uit de exe, gemaximaliseerd of de onthouden positie), gegevensmap `%LOCALAPPDATA%\Lutrea\Profielviewer\WebView2`, navigeert naar `http://127.0.0.1:<poort>/index.html` en draait de berichtenlus. Komt `Run()` terug (venster dicht), dan stopt het programma. De Afsluiten-knop (POST `/__ptsviewer/stop`) sluit het venster via de berichtenlus (`Dispatch` + `Terminate`). Lukt het maken van WebView2 niet (runtime ontbreekt), dan melding en terugval op `openVenster` met de bestaande hartslag-logica. De hartslag in `index.html` blijft staan: onschadelijk in WebView2, en nodig voor de terugvaloptie.

**Eén exemplaar.** Een tweede start vindt de draaiende viewer via `/__ptsviewer/ping` (status "klaar") en stuurt een nieuw verzoek `/__ptsviewer/voorgrond`; het eerste proces haalt zijn venster naar voren (`ShowWindow` + `SetForegroundWindow`). Windows kan dat tegenhouden (focus-bescherming); dan knippert het taakbalkicoon. Het meegeven van een bestand komt in fase C.

**Venster onthouden.** Positie, grootte en gemaximaliseerd in `%LOCALAPPDATA%\Lutrea\Profielviewer\venster.json`, gelezen bij de start en geschreven bij het sluiten. Valt de positie buiten alle schermen, dan gemaximaliseerd op het hoofdscherm.

**Verdieping per besluit** (de leesbare versie staat in het beslisdocument):

- **B1 Go-binding voor WebView2** (nodig vóór F0). Voorstel `github.com/jchv/go-webview2`: eigen loader in Go (geen `WebView2Loader.dll` mee te leveren), geeft venster en berichtenlus kant-en-klaar, en bouwt aantoonbaar met `CGO_ENABLED=0` (zie punt 3). Nadeel: geen getagde releases (pseudo-versie), kleine gebruikersgroep; we zetten de versie vast in `go.mod`/`go.sum`. Alternatief `github.com/wailsapp/go-webview2`: getagde versies en gebruikt door Wails, maar zonder venster: het venster, de berichtenlus en het formaatgedrag moeten we zelf in Win32 schrijven (meer code in `os_windows.go`).
- **B2 Terugvaloptie: hoe kom je in het oude venster** (nodig vóór F0). Voorstel: automatisch als WebView2 niet start, én met de hand via de startparameter `--browservenster` (ook via de omgevingsvariabele `PV_VENSTER=browser`), zodat je bij een probleem met het nieuwe venster door kunt werken. Alternatief: alleen automatisch; eenvoudiger, maar bij een WebView2-probleem dat de runtime niet als "ontbreekt" ziet, kun je niet terug zonder de oude exe.
- **B3 Instellingen uit het oude browserprofiel** (nodig vóór F2). PDF-stempelgegevens, logo's, recente projectmappen en andere instellingen staan in localStorage (`ptsviewer-*`, `pv.*`) en IndexedDB `profielviewer` van het oude Chrome/Edge-profiel. WebView2 gebruikt een eigen gegevensmap, dus die zijn er de eerste keer niet. Voorstel: in de viewer de knoppen "Instellingen exporteren" (JSON-bestand met alle `ptsviewer-*`/`pv.*`-sleutels) en "Instellingen importeren"; wie overstapt start één keer met `--browservenster`, exporteert, en importeert in het nieuwe venster. LEESMIJ legt het uit. Recente projectmappen (IndexedDB, mapverwijzingen) gaan niet mee: die zijn aan het browserprofiel gebonden; je opent de map één keer opnieuw. Alternatief: alleen een melding in de LEESMIJ ("stel je stempel opnieuw in"); geen code, maar iedere collega moet alles opnieuw invullen. Een derde route, de LevelDB-bestanden van het Chrome-profiel uitlezen in de exe, is afgewezen: fragiel en afhankelijk van interne Chrome-formaten.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Eigen WebView2-venster: binding in `go.mod`, venster naar de bestaande server, titel met versie, icoon, gemaximaliseerd, gegevensmap, venster dicht = proces stopt, Afsluiten-knop sluit het venster, terugval op Chrome/Edge (automatisch en handmatig), DevTools alleen met `PV_DEVTOOLS=1` | `GOOS=windows CGO_ENABLED=0 go build` slaagt en `go vet` is schoon. Marco bevestigt op zijn laptop: venster opent binnen 3 s zonder Chrome-profiel; sluiten (kruisje en Afsluiten-knop) stopt het proces (Taakbeheer); met `--browservenster` opent het oude venster; F12 doet niets zonder `PV_DEVTOOLS=1` | B1, B2 | M | Claude Code, high | `F0:` |
| F1 | ✅ gebouwd | Eén exemplaar (`/__ptsviewer/voorgrond`) en venster onthouden (`venster.json`) | Build slaagt. Marco bevestigt: tweede start opent geen tweede venster en brengt het bestaande naar voren; positie en grootte zijn na herstart hetzelfde; buiten beeld → gemaximaliseerd | F0 | S | Claude Code, medium | `F1:` |
| F2 | ✅ gebouwd | Instellingen overnemen volgens B3 | Volgens B3. Bij het voorstel: nieuwe test in `tests/` die exporteren en importeren van `ptsviewer-*`/`pv.*` toetst en `fouten: geen` geeft; Marco bevestigt dat zijn PDF-stempel na import in het nieuwe venster staat | F0, B3 | S | Claude Code, medium | `F2:` |
| F3 | ✅ gebouwd | Oplevering 2.10.0: `zet_versie.py 2.10.0`, `.syso` opnieuw, LEESMIJ-blok "Nieuw in 2.10.0", handleiding, `tools/bouw.ps1`, tag `v2.10.0` | `node run_alle.js` helemaal groen (Marco's laptop of hier met Chromium); `dist\Lutrea-Profielviewer-2.10.0.exe` en de zip bestaan; Marco bevestigt de handmatige lijst: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT (PDOK) | F0, F1, F2 | S | Claude Code, medium | `F3:` en `2.10.0:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix; de opleveringscommit volgt de projectregel `2.10.0: <wat>` met tag `v2.10.0`.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** Geen nieuwe persoonsgegevens. Instellingen (o.a. PDF-stempelgegevens met namen) verhuizen van het oude browserprofiel naar de WebView2-gegevensmap op dezelfde pc; bij B3-voorstel ook in een exportbestand dat de gebruiker zelf bewaart. Geen externe verwerkers erbij.
**Beveiliging.** De server blijft alleen op 127.0.0.1. DevTools uit in de oplevering. Nieuw verzoek `/__ptsviewer/voorgrond` doet alleen "venster naar voren", zonder gegevens. Eigen bestandstoegang (en de token-beveiliging daarvoor) komt pas in fase C.
**Gebruikers en handleiding.** Eigen venster in plaats van Chrome/Edge; eerste start zonder welkomstschermen; instellingen één keer overnemen (B3); startparameter `--browservenster` als noodroute.
**Beheer en configuratie.** Nieuwe map `%LOCALAPPDATA%\Lutrea\Profielviewer\` (WebView2-gegevens, `venster.json`); het oude `%LOCALAPPDATA%\Lutrea\PTS-viewer\` blijft voor de log en de terugvaloptie. Nieuwe omgevingsvariabelen `PV_DEVTOOLS`, `PV_VENSTER`.
**Releasenotes (kernpunten).** Nieuw: eigen programmavenster; programma stopt meteen bij sluiten; nog een keer starten brengt het venster naar voren; venster onthoudt plek en grootte; instellingen overnemen. Gewijzigd: Chrome of Edge is niet meer nodig (WebView2 zit in Windows).

## 9. Risico's en terugweg
- WebView2-runtime ontbreekt of is door beheer uitgeschakeld: automatische terugval op het Chrome/Edge-venster (B2).
- Bedrijfsbeveiliging (AppLocker/Defender) op een strenge Lutrea-laptop: vroeg testen (PLAN-2.10, risico's).
- `jchv/go-webview2` heeft geen getagde releases: versie vast in `go.sum`; bij problemen overstappen op B1-alternatief is een herschrijving van `openWebView2`, de rest blijft.
- Projectmap-toestemmingen gedragen zich in WebView2 anders dan in Chrome (PLAN-2.10, risico's); fase C lost dat op, F0 toetst dat het in elk geval werkt.
- Terugweg: elke fase is een eigen commit-reeks met prefix (`git revert`); de 2.9.5-exe blijft bruikbaar; `--browservenster` geeft het oude gedrag binnen 2.10.0.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Werken `showDirectoryPicker` (projectmap) en de service worker in WebView2 zoals in Edge? | F0 toetst het op Marco's laptop; werkt het niet, dan een planwijziging vóór F1 |
| Waar test je de "strenge" Lutrea-laptop (AppLocker/Defender)? | Na F3 op een collega-laptop, buiten dit plan |
| Draaien de tests vóór F3 op Marco's laptop of hier in de cloud met Chromium (`PV_CHROMIUM`)? | Beide: hier als eerste controle, op de laptop als bewijs voor F3 |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-10-26 23:09 | 2026-10-26 23:28 | Marco van Steenbrugge | Bouw: Claude Code, sessie session_01CGaZKrr6zGoWaXP63so657, model onbekend (commit-trailer noemt Claude Opus 5.5). Toetsing: claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | bouw onbekend; toetsing medium | bouw onbekend; toetsing 70 / 9.386 | b313806 | git (bouw); transcript Claude Code 2.1.308 (toetsing) |
| F1 | 2026-10-26 23:29 | 2026-10-26 23:43 | Marco van Steenbrugge | claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | medium | 104 / 31.613 | 214d055 | transcript Claude Code 2.1.308 (interval bevat ook de scan-update, zie punt 12) |
| F2 | 2026-10-26 23:46 | 2026-10-27 08:56 | Marco van Steenbrugge | claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | medium | 60 / 19.225 | d89d56c, 2a4119b | transcript Claude Code 2.1.308 (interval bevat de nacht tot Marco's controle, zie punt 12) |
| F3 | 2026-10-27 08:57 | 2026-10-27 09:07 | Marco van Steenbrugge | claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | medium | 50 / 13.767 | e6c4230, 0fffd2d, 0afc460, 5e9c67e | transcript Claude Code 2.1.308 |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-10-26 23:28 | `GOOS=windows CGO_ENABLED=0 go build` slaagt | `.\tools\bouw.ps1` (Go 1.27.0, zet GOOS=windows, GOARCH=amd64, CGO_ENABLED=0): "Klaar: dist\Lutrea-Profielviewer-2.9.5.exe en dist\Lutrea-Profielviewer_compleet_2.9.5.zip", exe 11.012.608 bytes | gehaald |
| F0 | 2026-10-26 23:28 | `go vet` is schoon | `go vet .` in `bron-exe` met GOOS=windows, CGO_ENABLED=0 en de embed-map `app` gevuld zoals in bouw.ps1: geen uitvoer, exit 0 | gehaald |
| F0 | 2026-10-26 23:28 | Venster opent binnen 3 s | Start gemeten met PowerShell Stopwatch tot `MainWindowTitle` er is: "venster na 0.72 s, titel: 'Lutrea Profielviewer 2.9.5'"; log: start 23:24:40, "eerste hartslag van de pagina: viewer is volledig geladen" 23:24:41.54. Marco van Steenbrugge, 23:25, via chat: "ja ziet er goed uit" | gehaald |
| F0 | 2026-10-26 23:28 | Zonder Chrome-profiel | `%LOCALAPPDATA%\Lutrea\PTS-viewer\browserprofiel` laatst gewijzigd 22:53:13, vóór en na de start gelijk; alleen `%LOCALAPPDATA%\Lutrea\Profielviewer\WebView2` gebruikt; draaiende processen `msedgewebview2`, geen `chrome`/`msedge --app` van de exe | gehaald |
| F0 | 2026-10-26 23:28 | Sluiten met het kruisje stopt het proces | Marco sloot pid 13212 met het kruisje ("kruisje is gelijk weg"); log 23:27:26 "venster gesloten, programma stopt"; `Get-Process -Id 13212`: niet meer actief, geen `Lutrea*`-proces | gehaald |
| F0 | 2026-10-26 23:28 | Sluiten met de Afsluiten-knop stopt het proces | Marco sloot pid 43904 met de knop; log 23:24:56 "afsluiten via de knop", 23:24:56 "venster gesloten, programma stopt"; `Get-Process -Id 43904`: niet meer actief | gehaald |
| F0 | 2026-10-26 23:28 | Met `--browservenster` opent het oude venster | Start met `--browservenster`: log 23:27:56 "oude venster gevraagd (--browservenster of PV_VENSTER=browser)"; exe zonder eigen venster; proces `msedge.exe --app=http://127.0.0.1:8017/...` (pid 45648); na sluiten door Marco ("hij is dicht") exe en Edge gestopt, log 23:28:21 "venster gesloten, programma stopt" | gehaald |
| F0 | 2026-10-26 23:28 | F12 doet niets zonder `PV_DEVTOOLS=1` | Gestart zonder `PV_DEVTOOLS`; Marco van Steenbrugge, via chat: "bij f12 gebeurt er niets" | gehaald |
| F1 | 2026-10-26 23:43 | Build slaagt | `.\tools\bouw.ps1` na de F1-wijziging: "Klaar: dist\Lutrea-Profielviewer-2.9.5.exe en dist\Lutrea-Profielviewer_compleet_2.9.5.zip"; `go vet .` exit 0 voor windows en linux; `gofmt -d` zonder verschil (op CRLF na) | gehaald |
| F1 | 2026-10-26 23:43 | Tweede start opent geen tweede venster en brengt het bestaande naar voren | Venster A (pid 27448) geminimaliseerd, daarna tweede start B (pid 20944): B gestopt met exitcode 0; log 23:38:58 "viewer draait al: bestaande venster naar voren gehaald"; A daarna niet geminimaliseerd en voorgrondvenster; één `Lutrea*`-proces, 0 browser-app-vensters. Marco van Steenbrugge, 23:43, via chat: "ja alles werkt gewoon netjes" | gehaald |
| F1 | 2026-10-26 23:43 | Positie en grootte zijn na herstart hetzelfde | Marco verkleinde, verplaatste en sloot het venster; `venster.json` 23:41:51: `{"X":203,"Y":137,"Breedte":2346,"Hoogte":1070,"Gemaximaliseerd":false}`; na herstart (pid 27856) `GetWindowRect`: links 203, boven 137, 2346×1070, niet gemaximaliseerd. Eerder ook gemaximaliseerd bewaard en zo teruggekomen (pid 11692). Marco van Steenbrugge, 23:43, via chat: "ja alles werkt gewoon netjes" | gehaald |
| F1 | 2026-10-26 23:43 | Buiten beeld → gemaximaliseerd | `venster.json` met de hand gezet op X/Y = -30000; na start (pid 40420) `IsZoomed` = True; log 23:42:21 "onthouden vensterplek valt buiten beeld: gemaximaliseerd" | gehaald |
| F2 | 2026-10-26 23:51 | Nieuwe test in `tests/` die exporteren en importeren van `ptsviewer-*`/`pv.*` toetst | `node instellingen.test.js`: export bevat ptsviewer-klantlogo, ptsviewer-pdf-v1, ptsviewer-puntdichtheid, pv.drieDLagen (geen pv.bezig, geen vreemde sleutel); vreemd bestand geweigerd; na import in een leeg profiel "PDF-stempel gelijk"; "fouten: geen" | gehaald |
| F2 | 2026-10-26 23:51 | De test geeft `fouten: geen` (en de suite blijft groen) | `node run_alle.js` (Edge): 14 van 14 OK, waaronder instellingen.test.js, "Alle tests geslaagd", exit 0 | gehaald |
| F2 | 2026-10-26 23:51 | Marco bevestigt dat zijn PDF-stempel na import in het nieuwe venster staat | Nog niet beoordeeld: Marco is na 23:46 offline; bevestiging volgt | niet toetsbaar |
| F2 | 2026-10-27 08:55 | Nieuwe test in `tests/` die exporteren en importeren van `ptsviewer-*`/`pv.*` toetst | `node instellingen.test.js` opnieuw (08:55): export bevat ptsviewer-klantlogo, ptsviewer-pdf-v1, ptsviewer-puntdichtheid, pv.drieDLagen; vreemd bestand geweigerd ("… is geen instellingenbestand van de Profielviewer …"); na import "PDF-stempel gelijk · puntdichtheid 3000000"; "fouten: geen" | gehaald |
| F2 | 2026-10-27 08:55 | De test geeft `fouten: geen` (en de suite blijft groen) | `node instellingen.test.js` 08:55: "fouten: geen"; `node run_alle.js` (Edge, 2026-10-26 23:51, sindsdien geen codewijziging, commit d89d56c): 14 van 14 OK, "Alle tests geslaagd", exit 0 | gehaald |
| F2 | 2026-10-27 08:55 | Marco bevestigt dat zijn PDF-stempel na import in het nieuwe venster staat | Marco van Steenbrugge, 2026-10-27 08:55, via chat: "Ja, mijn PDF-stempel staat na importeren in het nieuwe venster." | gehaald |
| F3 | 2026-10-27 09:02 | `node run_alle.js` helemaal groen | Op Marco's laptop (Edge), na de versiewijziging: 14 van 14 OK, waaronder instellingen.test.js, "Alle tests geslaagd", exit 0 | gehaald |
| F3 | 2026-10-27 09:02 | `dist\Lutrea-Profielviewer-2.10.0.exe` en de zip bestaan | `.\tools\bouw.ps1`: "Klaar: dist\Lutrea-Profielviewer-2.10.0.exe en dist\Lutrea-Profielviewer_compleet_2.10.0.zip"; exe 11.024.896 bytes, bestandsversie 2.10.0; zip 5.531.893 bytes, 38 items (zelfde aantal als 2.9.5). Eerste bouwpoging: zip mislukt (exe even op slot), tweede poging goed; tag v2.10.0 gepusht (commit 0fffd2d) | gehaald |
| F3 | 2026-10-27 09:02 | Marco bevestigt de handmatige lijst: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT (PDOK) | Nog niet beoordeeld: wacht op Marco | niet toetsbaar |
| F3 | 2026-10-27 09:07 | `node run_alle.js` helemaal groen | Op Marco's laptop (Edge), 2026-10-27 09:01, na de versiewijziging en vóór commit 0fffd2d: 14 van 14 OK, "Alle tests geslaagd", exit 0 | gehaald |
| F3 | 2026-10-27 09:07 | `dist\Lutrea-Profielviewer-2.10.0.exe` en de zip bestaan | `dist\Lutrea-Profielviewer-2.10.0.exe` (11.024.896 bytes, bestandsversie 2.10.0) en `dist\Lutrea-Profielviewer_compleet_2.10.0.zip` (5.531.893 bytes, 38 items), gebouwd 09:02; tag v2.10.0 op 0fffd2d gepusht | gehaald |
| F3 | 2026-10-27 09:07 | Marco bevestigt de handmatige lijst: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT (PDOK) | Marco van Steenbrugge, 2026-10-27 09:07, via chat: "Ja, in 2.10.0 werkt alles: puntenwolk openen, projectmap, PDF en DXF opslaan, 3D, luchtfoto en BGT." | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F0 | Gepland effort high; de toetsing liep op effort medium (de bouw zelf: onbekend) | reden onbekend |
| F0 | Bouw en toetsing in twee sessies: bouw in een cloudsessie (commit b313806), toetsing op Marco's laptop in een lokale sessie; Go 1.27.0 daarvoor via winget geïnstalleerd | Go ontbrak op de laptop; Marco koos installatie via winget |
| F0 | Tijden van de eerdere sessie (vrijgave 22:09, commits) staan in UTC; tijden vanaf de toetsing in lokale tijd (UTC+1). Start F0 in punt 11 is omgerekend naar lokale tijd (22:09 UTC = 23:09) | de cloudsessie draaide in UTC |
| F0 | Open vraag projectmap/service worker: alleen deels getoetst. Marco, via chat: "hij is halsteren aan het inlezen.. dus ja"; de service worker (`/sw.js`) wordt opgevraagd (log) | geen F0-criterium; de projectmap-toestemmingen blijven een aandachtspunt voor fase C |
| F1 | Het meetinterval (23:29–23:43) bevat ook het bijwerken van de BRBNT-scan naar v1.2 op verzoek van Marco; tokens zijn dus niet alleen F1 | tussendoor gevraagd via /brbnt-scan |
| F1 | Waargenomen, niet opgelost: een tweede start overschrijft `PTS-viewer\log.txt` terwijl het eerste proces erin schrijft (NUL-tekens in de log). Bestond al vóór F1 (`startLog` in `main.go`), maar komt nu vaker voor | buiten de scope van F1; voorstel voor F3 of een losse fix |
| F2 | Het meetinterval (23:46–08:56) bevat de nacht: de bouw was om 23:51 klaar, de laatste controle (PDF-stempel) deed Marco de volgende ochtend | Marco ging na de vrijgave offline |
| F3 | Bouwscript: de eerste zip mislukte (exe even op slot, waarschijnlijk virusscan) terwijl `bouw.ps1` toch "Klaar" meldde; tweede bouw goed. Niet opgelost: `bouw.ps1` stopt niet bij een fout | buiten de scope van F3; voorstel voor een losse fix (2.10.1), samen met de log.txt-fix en de verwijzing "Instellingen → Exporteren" in de foutmelding |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-10-26 22:06 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- `bron-exe/main.go`, `bron-exe/os_windows.go`, `bron-exe/go.mod`, `bron-exe/winres/winres.json`, `bron-exe/BOUWEN.txt` (stand 71b0103)
- `tools/bouw.ps1`, `tools/zet_versie.py`, `index.html` (regels 957-976), `viewer.js` (regels 1488-1500, 4315-4319) (stand 71b0103)
- `docs/PLAN-2.10-windows-programma.md` (fase A, risico's, beslissingen), `docs/ARCHITECTUUR.md` (stand 71b0103)
- Proefbouw `github.com/jchv/go-webview2` met `CGO_ENABLED=0`, 26-10-2026 (buiten de repo)

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
