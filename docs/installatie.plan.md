---
plan: installatie
titel: Installer voor de Profielviewer (Inno Setup, per gebruiker)
versie: 1
status: gebouwd        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 ✅           # berekend door de skill
opgesteld: 2026-10-30
opgesteld_door: Claude Code (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: installatie.beslis.md
basis_commit: 9167a2c
vervangt: -
samenvatting: Een setup.exe (Inno Setup) die de Profielviewer per gebruiker installeert zonder beheerdersrechten, met startmenu, verwijderen via Windows en .pvproj dubbelklikken; fase B van PLAN-2.10.
trefwoorden: [installer, installatie, inno setup, setup, startmenu, verwijderen, bestandskoppeling, pvproj, 2.11.4, fase B]
---

# Plan: Installer voor de Profielviewer (Inno Setup, per gebruiker)

## 1. In het kort
1. Naast de losse exe komt er een `Lutrea-Profielviewer-X.Y.Z-setup.exe`, gemaakt met Inno Setup 6.
2. De setup installeert per gebruiker in `%LOCALAPPDATA%\Programs\Lutrea Profielviewer\`, zonder beheerdersrechten.
3. Je krijgt een snelkoppeling in het startmenu (bureaublad optioneel) en kunt de viewer verwijderen via de Windows-instellingen.
4. Dubbelklikken op een `.pvproj` opent het project in de viewer; de exe kan dat al (fase C), alleen de koppeling ontbrak.
5. Instellingen, recente projecten en logo's blijven werken, want die staan los van de plek van de exe.

## 2. Aanleiding en doel
Fase B van PLAN-2.10 (installatie en bestandskoppeling) is op 28-10-2026 geparkeerd. Op 2026-10-30 heeft Marco
haar weer opgepakt, met de keuze voor Inno Setup in plaats van een zelfinstallatie in de Go-exe. Nu wordt de viewer
uitgerold als losse exe (`dist\Lutrea-Profielviewer-2.11.3.exe`) plus zip. De gebruiker zet de exe zelf ergens
neer en maakt zelf een snelkoppeling (LEESMIJ.txt, `maak_snelkoppeling.vbs`). Er is geen vaste plek, geen
verwijderen via Windows en geen `.pvproj` dubbelklikken.

Het werk is geslaagd als het "klaar als" uit PLAN-2.10 fase B klopt: installeren, starten via het startmenu,
verwijderen en opnieuw installeren werken op Marco's laptop. Daarnaast opent dubbelklikken op een `.pvproj`
het project.

## 3. Onderzoek en bevindingen
Getoetst tegen `9167a2c`.
- **De exe is één bestand.** `tools/bouw.ps1` embedt de app (`//go:embed all:app`) en bouwt
  `dist\Lutrea-Profielviewer-<versie>.exe`. Daarnaast staat er niets nodig. De installer hoeft dus maar één bestand te plaatsen.
- **Gegevens staan los van de plek van de exe.** Ze staan in `%LOCALAPPDATA%\Lutrea\Profielviewer\` (`WebView2`,
  `recent.json`, `venster.json`: `bron-exe/venster_windows.go:90,176`, `bron-exe/recent.go:35`) en
  `%LOCALAPPDATA%\Lutrea\PTS-viewer\` (log, oud browserprofiel: `bron-exe/main.go:67,366`). De server draait
  op dezelfde poort 8017 (zelfde origin). Instellingen in localStorage blijven dus gelden als de exe naar een
  andere map gaat.
- **De exe opent al een `.pvproj` vanaf de opdrachtregel.** `startProject()`/`projectPad()` in
  `bron-exe/recent.go:146-176` maken van een `.pvproj` of een projectmap de map die geopend wordt. Draait de
  viewer al, dan geeft een tweede start het pad door en komt het bestaande venster naar voren
  (`vraagVoorgrond`, `bron-exe/main.go`). Er is geen Go-wijziging nodig voor de koppeling.
- **`.las`/`.laz`/`.pts` als startparameter worden niet herkend.** `projectPad` accepteert alleen een map of
  `.pvproj`. "Openen met Profielviewer" voor puntenwolken vraagt dus Go-werk (zie B2).
- **Er is één exemplaar tegelijk.** Een draaiende viewer zet de exe op slot. Een installatie of update terwijl de
  viewer open is, lukt dan niet zonder hem te sluiten (zie B4).
- **Inno Setup 6 is geïnstalleerd** in `C:\Program Files (x86)\Inno Setup 6\` (ISCC.exe, gecontroleerd 2026-10-30).
  De Nederlandse taal staat in de standaardinstallatie (`compiler:Languages\Dutch.isl`); dat controleert F0.
- **Er is een icoon:** `icons/pts-viewer.ico` (ook in `bron-exe/winres/icoon.ico`).
- **De versie** staat in `bron-exe/main.go` (`appVersie = "2.11.3"`) en wordt door `tools/bouw.ps1` uitgelezen.
  Het nieuwe bouwscript leest haar op dezelfde manier.
- **Tests** zijn Node/Playwright (`tests/run_alle.js`) en Go-tests in `bouw.ps1`. Een installatietoets hoort bij
  het bouwen van de setup, niet bij de viewer-tests (zie ontwerp).

## 4. Niet in scope
- **Automatisch bijwerken** (fase D van PLAN-2.10): blijft geparkeerd. Een nieuwe versie installeer je door de nieuwe setup te draaien.
- **Ondertekenen** (los in PLAN-2.10): de setup en de exe blijven ongetekend, dus SmartScreen blijft waarschuwen.
- **Installatie voor alle gebruikers** in Program Files met beheerdersrechten (zie B1).
- **Waar de setup voor collega's komt te staan** (SharePoint e.d.): dat regelt Marco zelf.
- **Zelfinstallatie in de exe**: afgewezen door Marco op 2026-10-30 (keuze Inno Setup).
- **Iets overnemen uit de repo `drone-lijnen-tool`**: Marco 2026-10-30: "dit is dus een verboden map". Alles wordt hier opnieuw opgebouwd.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Inno Setup 6, niet de zelfinstallatie uit PLAN-2.10 fase B | Marco, chat 2026-10-30 |
| Doelplatform Windows 10/11 x64, test op Marco's Windows 11-laptop | PLAN-2.10 |
| Alles in het Nederlands (installer, meldingen, LEESMIJ) | CLAUDE.md, Afspraken met Marco |
| Elke oplevering is een eigen patchversie met LEESMIJ-blok, handleiding en groene tests | CLAUDE.md, Versie ophogen en opleveren |
| Niets lezen uit of schrijven in `drone-lijnen-tool` | Marco, chat 2026-10-30 |

## 6. Ontwerp en besluiten (technisch)
Nieuwe bestanden:
- `tools/profielviewer.iss`: het Inno Setup-script. Parameters `/DVersie=`, `/DBron=` (de gebouwde exe) en
  `/DUitvoer=`, plus `/DToets=1` voor de installatietoets.
- `tools/bouw_installer.ps1`: leest de versie uit `main.go`, controleert dat `dist\Lutrea-Profielviewer-<versie>.exe`
  er is, zoekt `ISCC.exe` (op het pad, anders in `Program Files (x86)`/`Program Files`/`%LOCALAPPDATA%\Programs`)
  en schrijft `dist\Lutrea-Profielviewer-<versie>-setup.exe`. Zonder ISCC stopt het met een duidelijke Nederlandse melding.
  Met `-Toets` bouwt het de toetsvariant en draait het de installatietoets (zie F0).
- `tools/bouw.ps1` blijft zoals het is. Na de exe roept het optioneel `bouw_installer.ps1` aan (B5), zodat één
  commando exe, zip en setup oplevert.

Het setup-script in grote lijnen:
- `PrivilegesRequired=lowest`, `DefaultDirName={localappdata}\Programs\Lutrea Profielviewer`, `UsePreviousAppDir=yes`.
- Een eigen, vaste `AppId` (nieuwe GUID). Bijwerken is dezelfde setup van een nieuwere versie over de oude heen.
- Het bestand `Lutrea-Profielviewer.exe` (zonder versie in de naam, zodat snelkoppelingen en de koppeling blijven kloppen).
- `[Icons]`: startmenu "Lutrea Profielviewer", plus een bureaublad-snelkoppeling als taak die standaard uit staat.
- `[Registry]` in `HKCU\Software\Classes`: `.pvproj` → `LutreaProfielviewer.Project`, met het icoon en
  `"{app}\Lutrea-Profielviewer.exe" "%1"`, met `uninsdeletekey`, en `ChangesAssociations=yes`.
- `[Run]`: aan het eind "Lutrea Profielviewer starten" (niet bij stil installeren).
- `[Languages]`: alleen Nederlands.
- De toetsvariant (`/DToets=1`) krijgt een eigen AppId en naam, geen snelkoppelingen en geen bestandskoppeling.
  Zo raakt een toets een echte installatie nooit.

**Verdieping per besluit:**

- **B1 Installatieplek en rechten** (nodig vóór F0). Voorstel: per gebruiker in
  `{localappdata}\Programs\Lutrea Profielviewer`, `PrivilegesRequired=lowest`. Geen beheerder of IT nodig, en het
  past bij hoe de exe nu al zonder rechten draait (`execution-level: as invoker` in `winres.json`).
  Alternatief: `{autopf}` met beheerdersrechten, één installatie voor alle gebruikers van de pc. Dat vraagt een
  beheerder bij elke update en levert op laptops met één gebruiker niets op. Risico van het voorstel: AppLocker
  kan uitvoeren uit `%LOCALAPPDATA%\Programs` tegenhouden (PLAN-2.10, risico's). Dat test je op een strenge laptop.

- **B2 Welke bestanden koppelen** (nodig vóór F1). Voorstel: alleen `.pvproj`. De exe kan dat al (bevinding 3), dus
  het blijft installer-werk. Alternatief: ook "Openen met Lutrea Profielviewer" voor `.las`/`.laz`/`.pts`. Dat vraagt
  in Go een startparameter die een puntenwolk herkent en aan de viewer doorgeeft (ook bij een tweede start via
  `vraagVoorgrond`), plus tests. Dat is een eigen fase met een eigen versie.

- **B3 Wat blijft er staan na verwijderen** (nodig vóór F0). Voorstel: de verwijderaar haalt alleen de programmamap,
  de snelkoppelingen en de koppeling weg. `%LOCALAPPDATA%\Lutrea\Profielviewer` en `\PTS-viewer` (instellingen,
  stempelgegevens, logo's, recente projecten, log) blijven staan, zodat opnieuw installeren alles terugbrengt.
  Projectmappen van de gebruiker worden nooit aangeraakt. Alternatief: na een vraag ("ook je instellingen
  verwijderen?") ook die mappen weggooien.

- **B4 Viewer staat open tijdens installeren of bijwerken** (nodig vóór F0). Voorstel: `CloseApplications=no`. De
  setup sluit de viewer nooit zelf. Staat de exe op slot, dan meldt Inno "sluit het programma en probeer opnieuw".
  Dat voorkomt dat een lopende omzetting of een niet-opgeslagen project verloren gaat. Alternatief:
  `CloseApplications=yes` (Restart Manager sluit de viewer en start hem daarna opnieuw). Dat is handiger, maar werk
  kan verloren gaan.

- **B5 Losse exe en zip blijven bestaan** (nodig vóór F2). Voorstel: `bouw.ps1` levert voortaan exe, zip én setup,
  en de LEESMIJ noemt de setup als gewone manier. De losse exe blijft voor wie niet kan of wil installeren.
  Alternatief: alleen nog de setup uitleveren. Dat is eenvoudiger, maar wie de setup niet mag draaien, zit dan vast.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | `tools/profielviewer.iss` en `tools/bouw_installer.ps1`: setup bouwen, installeren per gebruiker, startmenu, verwijderen; installatietoets met de toetsvariant | (1) `.\tools\bouw_installer.ps1` maakt `dist\Lutrea-Profielviewer-2.11.3-setup.exe` uit de gebouwde exe, met exitcode 0; (2) zonder exe of zonder ISCC stopt het met een Nederlandse melding en exitcode ≠ 0; (3) `.\tools\bouw_installer.ps1 -Toets` installeert de toetsvariant stil in een toetsmap, vindt daar de exe, vindt de uninstall-sleutel onder HKCU, verwijdert stil en controleert dat de toetsmap en de sleutel weg zijn, en eindigt met `fouten: geen`; (4) het .iss bevat `PrivilegesRequired=lowest` en geen `{autopf}`/`{pf}`; (5) de verwijderaar raakt `%LOCALAPPDATA%\Lutrea` niet aan (geen regel in `[UninstallDelete]` buiten `{app}`) | B1, B3, B4 | M | claude-opus-5-5, medium | `F0:` |
| F1 | ✅ gebouwd | Bestandskoppeling `.pvproj` in HKCU met icoon (niet in de toetsvariant) | (1) het .iss schrijft `.pvproj` → `LutreaProfielviewer.Project` met `"%1"` en `uninsdeletekey`, en `ChangesAssociations=yes`; (2) de toetsvariant schrijft geen koppeling (statische controle in de installatietoets); (3) `go test ./...` groen, inclusief de bestaande toetsen van `projectPad` voor `.pvproj` | F0, B2 | S | claude-opus-5-5, medium | `F1:` |
| F2 | ✅ gebouwd | Oplevering 2.11.4: `zet_versie.py 2.11.4`, LEESMIJ-blok, handleiding, `bouw.ps1` levert ook de setup, tests groen, controle door Marco | (1) `node run_alle.js` met overal OK; (2) `.\tools\bouw.ps1` levert exe, zip en `-setup.exe` van 2.11.4; (3) installatietoets `fouten: geen` op 2.11.4; (4) Marco bevestigt op zijn laptop: installeren, starten via het startmenu, `.pvproj` dubbelklikken opent het project, verwijderen via Windows-instellingen, opnieuw installeren en instellingen nog aanwezig | F1, B5 | S | claude-opus-5-5, medium | `2.11.4:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** n.v.t.: de installer verwerkt geen persoonsgegevens en stuurt niets weg; hij plaatst alleen de exe en registersleutels onder HKCU.
**Beveiliging.** Er is geen beheerdersrecht nodig en er staat niets in HKLM. De setup is niet ondertekend: SmartScreen waarschuwt bij de eerste start ("Meer info" → "Toch uitvoeren"), net als nu bij de exe.
**Gebruikers en handleiding.** Nieuwe installatie-uitleg bovenaan in LEESMIJ en in `docs/handleiding.md`: setup draaien, starten via het startmenu, `.pvproj` dubbelklikken, verwijderen via Instellingen → Apps. Wie nu een losse exe gebruikt: de oude exe en snelkoppeling mogen weg, en instellingen blijven bewaard.
**Beheer en configuratie.** Nieuwe map `%LOCALAPPDATA%\Programs\Lutrea Profielviewer\`. Registersleutels `HKCU\Software\Classes\.pvproj`, `HKCU\Software\Classes\LutreaProfielviewer.Project` en de uninstall-sleutel van Inno. Om te bouwen is Inno Setup 6 nodig.
**Releasenotes (kernpunten).** 2.11.4: de Profielviewer heeft een installer. Installeren zonder beheerdersrechten, startmenu, verwijderen via Windows, `.pvproj` dubbelklikken opent het project.

## 9. Risico's en terugweg
- AppLocker/Defender blokkeert uitvoeren uit `%LOCALAPPDATA%\Programs` of een ongetekende setup. Terugweg: de losse exe blijft bestaan (B5). Test vroeg op een strenge Lutrea-laptop.
- De `.pvproj`-koppeling overschrijft een bestaande koppeling van de gebruiker. Dat is onwaarschijnlijk (eigen extensie). Bij verwijderen gaat de sleutel weg.
- De installatietoets raakt een echte installatie. Dat wordt voorkomen door een eigen AppId, geen snelkoppelingen en geen koppeling in de toetsvariant.
- Terugdraaien: de commits van F0–F2 terugzetten. Een geïnstalleerde versie verwijder je via Instellingen → Apps, en de losse exe werkt daarna gewoon weer.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Moet de setup ook een bureaublad-snelkoppeling aanbieden? | Ja, als vinkje dat standaard uit staat |
| Naam in het startmenu en in Apps | "Lutrea Profielviewer" |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-10-30 23:50 | 2026-10-30 23:52 | Marco van Steenbrugge ("Akkoord, bouw F0–F2") | Claude Code, claude-opus-5-5, sessie onbekend | onbekend | onbekend / onbekend | onbekend (nog niet gecommit) | `meet` vond geen berichten van deze sessie in het interval |
| F1 | 2026-10-30 23:53 | 2026-10-30 23:54 | Marco van Steenbrugge ("Akkoord, bouw F0–F2") | Claude Code, claude-opus-5-5, sessie onbekend | onbekend | onbekend / onbekend | onbekend (nog niet gecommit) | `meet` niet bruikbaar voor deze sessie (zie F0) |
| F2 | 2026-10-30 23:54 | 2026-10-31 00:04 | Marco van Steenbrugge ("Akkoord, bouw F0–F2") | Claude Code, claude-opus-5-5, sessie onbekend | onbekend | onbekend / onbekend | onbekend (nog niet gecommit) | `meet` niet bruikbaar voor deze sessie (zie F0) |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-10-30 23:52 | (1) `bouw_installer.ps1` maakt de setup met exitcode 0 | `.\tools\bouw_installer.ps1` → "Klaar: dist\Lutrea-Profielviewer-2.11.3-setup.exe (5,8 MB)", exit 0 | gehaald |
| F0 | 2026-10-30 23:52 | (2) zonder exe of ISCC: Nederlandse melding, exitcode ≠ 0 | kopie in de scratchmap met versie 9.9.9: "FOUT: …Lutrea-Profielviewer-9.9.9.exe ontbreekt. Bouw eerst de exe: .\tools\bouw.ps1", exit 1; met lege ProgramFiles/LOCALAPPDATA/PATH: "FOUT: Inno Setup 6 (ISCC.exe) is niet gevonden. …", exit 1 | gehaald |
| F0 | 2026-10-30 23:52 | (3) installatietoets: stil installeren, exe, HKCU-sleutel, verwijderen, map en sleutel weg, `fouten: geen` | `.\tools\bouw_installer.ps1 -Toets` → alle 16 controles OK (ook opnieuw installeren over de vorige heen), "fouten: geen", exit 0 | gehaald |
| F0 | 2026-10-30 23:52 | (4) `PrivilegesRequired=lowest`, geen `{autopf}`/`{pf}` | `tools/profielviewer.iss` regel `PrivilegesRequired=lowest`; installatietoets "OK geen Program Files en geen HKLM" | gehaald |
| F0 | 2026-10-30 23:52 | (5) verwijderaar raakt `%LOCALAPPDATA%\Lutrea` niet | `[UninstallDelete]` bevat alleen `Type: dirifempty; Name: "{app}"`; installatietoets "OK de verwijderaar ruimt alleen de eigen programmamap op" | gehaald |
| F1 | 2026-10-30 23:54 | (1) .pvproj → `LutreaProfielviewer.Project` met `"%1"` en `uninsdeletekey`, `ChangesAssociations=yes` | `tools/profielviewer.iss`, sectie `[Registry]` en `[Setup]`; `.\tools\bouw_installer.ps1 -Toets` → "OK .pvproj gekoppeld aan LutreaProfielviewer.Project…", "OK openen geeft het bestand mee als startparameter (%1)", "OK de koppeling gaat weg bij verwijderen (uninsdeletekey)", "OK ChangesAssociations=yes" | gehaald |
| F1 | 2026-10-30 23:54 | (2) toetsvariant schrijft geen koppeling | statisch: de `[Registry]`-regels staan binnen `#ifndef Toets` (controle "…alleen buiten de toetsvariant" OK); bij installeren: "OK toetsvariant laat de .pvproj-koppeling ongemoeid"; totaal "fouten: geen", exit 0 | gehaald |
| F1 | 2026-10-30 23:54 | (3) `go test ./...` groen, inclusief `projectPad` voor `.pvproj` | `go test -count=1 ./...` in `bron-exe` → `ok ptsviewer 3.389s`, `ok ptsviewer/omzet 39.924s`, exit 0; `TestProjectPad` (`bron-exe/recent_test.go:73`) dekt `dijk.pvproj` en `DIJK.PVPROJ` → projectmap | gehaald |
| F2 | 2026-10-31 00:02 | (1) `node run_alle.js` met overal OK | 19 tests OK, "Alle tests geslaagd", exit 0 (stand 2.11.4, viewer ongewijzigd) | gehaald |
| F2 | 2026-10-31 00:02 | (2) `bouw.ps1` levert exe, zip en setup van 2.11.4 | `.\tools\bouw.ps1` → "Klaar: dist\Lutrea-Profielviewer-2.11.4.exe, dist\Lutrea-Profielviewer_compleet_2.11.4.zip en dist\Lutrea-Profielviewer-2.11.4-setup.exe", go test ok, exit 0 | gehaald |
| F2 | 2026-10-31 00:02 | (3) installatietoets `fouten: geen` op 2.11.4 | `.\tools\bouw_installer.ps1 -Toets` → alle controles OK, ook "versie in Windows-instellingen is 2.11.4", "fouten: geen", exit 0 | gehaald |
| F2 | 2026-10-31 00:04 | (4) Marco bevestigt op zijn laptop: installeren, startmenu, .pvproj dubbelklikken, verwijderen, opnieuw installeren met instellingen | Marco van Steenbrugge, 2026-10-31 00:04, via chat, na de vraag "Werken startmenu, .pvproj dubbelklikken, verwijderen en opnieuw installeren?": "Alles werkt"; installatie vooraf gecontroleerd in HKCU (DisplayVersion 2.11.4, .pvproj → LutreaProfielviewer.Project, startmenu-snelkoppeling aanwezig) | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F2 | `bouw.ps1` roept `bouw_installer.ps1` altijd aan, niet "optioneel" (punt 6) | B5: bouwen levert exe, zip én setup; zonder Inno Setup stopt de bouw nu met een duidelijke melding |
| F0–F2 | Model en effort uit `meet` onbekend (geen berichten van deze sessie gevonden) | niet te vergelijken, dus geen afwijking vastgesteld |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-10-30 23:49 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- `docs/PLAN-2.10-windows-programma.md`, fase B en de beslissingen van 28-10-2026 (stand `9167a2c`)
- `tools/bouw.ps1`, `bron-exe/main.go`, `bron-exe/recent.go`, `bron-exe/venster_windows.go`, `bron-exe/winres/winres.json` (stand `9167a2c`)
- Inno Setup 6, geïnstalleerd in `C:\Program Files (x86)\Inno Setup 6\` (gecontroleerd 2026-10-30)

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
