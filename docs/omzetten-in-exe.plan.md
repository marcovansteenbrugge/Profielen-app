---
plan: omzetten-in-exe
titel: Grote scans omzetten in het programma zelf (versie 2.11)
versie: 2
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 ✅ · F3 ✅ · F4 ○ · F5 ⏳ · F6 ○           # berekend door de skill
opgesteld: 2026-10-27
opgesteld_door: Claude Code, in opdracht van Marco van Steenbrugge
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer (Lutrea Group B.V.)
beslisdocument: omzetten-in-exe.beslis.md
basis_commit: d052abc
vervangt: -
samenvatting: De exe zet LAS, PTS en daarna LAZ zelf om naar vakken (pv-tegels-1), op alle processorkernen en buiten het geheugen van het venster; fase E van PLAN-2.10.
trefwoorden: [omzetten, vakken, tegels, las, laz, pts, go, wazero, laz-perf, 2.11, geheugen, kernen, wallach]
---

# Plan: Grote scans omzetten in het programma zelf (versie 2.11)

## 1. In het kort
1. Nu zet de viewer een puntenwolk in het venster om naar vakken: één processorkern, en alles gaat door het geheugen van het venster (± 4 GB).
2. Straks doet de exe dat zelf, met het echte pad van de scan, op meerdere kernen en buiten het venster. De viewer toont alleen de voortgang en kan afbreken.
3. Het resultaat is precies hetzelfde als nu: dezelfde vakken, byte voor byte. De rest van de viewer merkt er niets van, en oude projectmappen blijven gewoon werken.
4. Eerst LAS en PTS (versie 2.11.0). Daarna LAZ, dat begint met een proef of de bestaande LAZ-decoder (laz-perf) in de exe kan draaien (versie 2.11.2; 2.11.1 werd een losse patch).
5. Dit is fase E van `docs/PLAN-2.10-windows-programma.md` (deelfasen E1 en E2). E3 ("profielen uit alle punten" via de exe) zit hier niet in.

## 2. Aanleiding en doel
PLAN-2.10 noemt als reden voor de Windows-versie onder meer "de geheugengrens van een browsertabblad" en als doel van fase E: "Wallach (79 mln punten) en groter zonder browsergeheugen; meerdere processorkernen".

Nu (gelezen in `viewer.js`, basis_commit d052abc): `importeerNaarTegels` (rond regel 1900) leest de scan met `leesLasPunten`/`leesLazPunten`/`leesPts` in blokken en geeft elk punt aan `maakTegelSchrijver` (regel 1808). Die schrijft per vak van 50 × 50 m in het formaat `pv-tegels-1` en bouwt intussen twee overzichten (alle punten en maaiveld, elk via `maakUitdunner(4.000.000)` en daarna `dunUit` naar 2 miljoen). Alles draait op de hoofdthread van het venster; LAZ wordt chunk voor chunk gedecodeerd met laz-perf (WebAssembly, één thread).

Gemeten op Marco's laptop (24 logische processors, 47 GB geheugen): `dijk_begroeid.las` (3 miljoen punten, 78 MB) omzetten kost 5 tot 7,5 s in het venster (meting bij F2 van plan eigen-bestandstoegang). Voor Wallach (79 mln) en voor LAZ is er nog geen meting; zie Open vragen.

Geslaagd als:
- de exe LAS en PTS (2.11.0) en daarna LAZ (2.11.2) omzet naar vakken die byte voor byte gelijk zijn aan wat de viewer nu maakt;
- het omzetten van een grote scan aantoonbaar sneller is dan in het venster, en het geheugen van het venster daarbij niet meegroeit met de scan;
- voortgang en afbreken werken, en alle tests groen zijn.

## 3. Onderzoek en bevindingen
Getoetst tegen basis_commit d052abc:
- **Tegelformaat** (`viewer.js:1800`, `docs/ARCHITECTUUR.md` "Tegelwolk"): 16 bytes per punt, little-endian `int32 x, int32 y` (mm t.o.v. `info.oorsprong`), `int32 z` (mm NAP), `uint8 klasse, r, g, b`. Vakken `tegels\<tx>_<ty>.pvt` met `tx = floor(x / 50)`. `info.json` met oorsprong, aantal, bbox, klassen, `tegels: [[tx, ty, n, minZ, maxZ]]`, overzicht, bron. Oorsprong = eerste punt afgerond naar beneden op 1000 m.
- **Afronding**: de viewer schrijft `Math.round((x - ox) * 1000)`. JavaScript rondt een halve waarde naar boven af (−2,5 → −2); Go's `math.Round` rondt van nul af (−2,5 → −3). De Go-versie moet `math.Floor(v + 0.5)` gebruiken. `Math.floor` en `Math.imul` (hash) hebben een exact Go-equivalent.
- **Kleur**: de schrijver kijkt eerst naar 200.000 punten (`voorraad`) om te bepalen of kleur 8- of 16-bits is (`deler` 1 of 256). Dezelfde volgorde in Go geeft dezelfde bytes.
- **Overzichten**: `maakUitdunner` (rond regel 1004) en `dunUit` (regel 1392) zijn deterministisch (vaste hashfunctie, vaste volgorde, `oppervlakModus` boven/onder). Een exacte Go-port geeft dezelfde overzichtsbestanden.
- **PTS** (`leesPts`, regel 1111): platte tekst, eerste regel het aantal, kolomherkenning voor kleur op de eerste puntregel (6, 7, 9 of 10 kolommen), scheidingstekens spaties, tabs of komma's.
- **LAS** (`leesLasHeader` regel 1182, `leesLasPunten` regel 1330): versie 1.2 tot en met 1.4, puntformaten 0 tot en met 10, kleurpositie per formaat (`LAS_RGB_OFFSET`), klasse in byte 15 (formaat 0 tot 5) of 16 (formaat 6 en hoger). Eenvoudig in Go.
- **LAZ** (`leesLazPunten` regel 1258): laz-perf als WebAssembly (`vendor/laz-perf/laz-perf.wasm`, 214 kB), chunk voor chunk, met de chunk-tabel uit `vendor/laz-perf/chunktable.js`; alleen vaste chunk-grootte. Een kant-en-klare, betrouwbare LAZ-decoder in pure Go is niet vastgesteld. Een WebAssembly-runtime in pure Go bestaat (wazero), dus laz-perf zou in de exe kunnen draaien zonder cgo. Of de wasm-module (gebouwd met Emscripten) daar zonder zijn JavaScript-lijm werkt, is niet vastgesteld: daarvoor is de proef in F4.
- **Pad van de scan**: een puntenwolk komt nu binnen via `<input type="file">` (`index.html:396`), zonder pad. Sinds 2.10.2 heeft de exe een Windows-kiezer (`/__pv/kies`) die het pad wel geeft. Een gesleept bestand heeft geen pad.
- **Bestands-API en tests**: sinds 2.10.2 schrijft de viewer via `/__pv/fs/…` in de projectmap; `tests/hulp.js` maakt die API na en `tests/natieve_map.test.js` test hem. De exe-code is één Go-package (`bron-exe`, module `ptsviewer`) met `go test`.
- **Testdata**: `testdata/groot/dijk_begroeid.las` (3 mln punten, LAS 1.4, met kleur en klassen), PTS-bestanden in `testdata/snoei_test` en `testdata/doorvaart_test`. Er staat **geen LAZ-bestand** in de repo, en de 16-miljoen-wolk (`maak_dijk_16mln.py`) is niet aangemaakt.

## 4. Niet in scope
- E3 uit PLAN-2.10: "profielen uit alle punten" en het detail-bovenaanzicht via de exe. Eerst zien wat E1 en E2 opleveren; daarna een eigen plan.
- De vergelijkingswolk (B), de doorvaartscans (onder- en bovenzijde brug) en de snoeicheck-wolk: die worden niet naar vakken omgezet en blijven zoals ze zijn.
- Het lezen van vakken (`leesTegels`, overzicht) blijft in de viewer.
- LAZ met variabele chunk-grootte en LAZ zonder chunk-tabel: ook nu niet ondersteund.
- Zonder projectmap inlezen (de uitgedunde wolk, zoals in 2.8): blijft in de viewer.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| `importeerNaarTegels` naar Go, zelfde formaat `pv-tegels-1` | PLAN-2.10, fase E |
| Eerst LAS en PTS (E1, 2.11.0), daarna LAZ met een haalbaarheidsproef (E2, 2.11.x) | PLAN-2.10, volgorde (27-10-2026) |
| LAZ via laz-perf als WASM in wazero, of een port | PLAN-2.10, fase E |
| Voortgang naar de viewer en afbreken mogelijk | PLAN-2.10, fase E |
| Bouwen blijft `CGO_ENABLED=0` | `tools/bouw.ps1`, plan webview2-venster |
| Alleen binnen toegestane mappen lezen en schrijven | besluit B2 van plan eigen-bestandstoegang |
| Het oude venster blijft werken zoals nu | besluit B3 van plan eigen-bestandstoegang |
| Oplevering met LEESMIJ-blok, handleiding en groene tests | CLAUDE.md, "Versie ophogen en opleveren" |

## 6. Ontwerp en besluiten (technisch)
**Onderdelen in de exe** (nieuwe bestanden in `bron-exe`, zelfde package):
- `omzet_tegels.go`: de tegelschrijver (vakken in geheugenblokken, per vak een open bestand dat in delen wordt bijgeschreven), de twee overzicht-uitdunners en `dunUit` als exacte port, en `info.json`. Schrijft eerst naar een tijdelijke map naast het doel en zet die pas na afloop op zijn plek, zodat een afgebroken omzetting geen halve vakken achterlaat.
- `omzet_las.go`, `omzet_pts.go`, later `omzet_laz.go`: lezers die punten in de oorspronkelijke volgorde aan de schrijver geven. Het lezen en ontleden gebeurt parallel in blokken (LAS: vaste recordlengte; PTS: blokken op regelgrens; LAZ: per chunk). De resultaten gaan in volgorde naar de schrijver, zodat de vakken byte voor byte gelijk blijven.
- `omzet_taak.go`: één omzetting tegelijk. `POST /__pv/omzet/start` met `{bron, doel, modus}` (bron = pad van de scan, doel = de map `puntenwolk\A - <naam>`, modus = boven/onder) → `{id}`; `GET /__pv/omzet/stand?id=` → `{fase, gelezen, totaal, klaar, fout, info}`; `POST /__pv/omzet/afbreken?id=`. Zelfde sessiesleutel en toegestane mappen als de bestands-API.
- `cmd/pvomzet` (alleen voor tests): roept dezelfde code aan vanaf de opdrachtregel, zodat `tests/hulp.js` de omzetting kan nadoen en een test de uitkomst kan vergelijken met die van de viewer.

**In de viewer**: in het eigen venster opent "Openen…" bij de puntenwolk de Windows-kiezer van de exe (dan is het pad bekend). Is er een projectmap en is het een LAS of PTS (later ook LAZ), dan vraagt `tegelbronVoor` de exe om te omzetten, toont de voortgang in de statusregel met een knop Afbreken, en opent daarna de vakken met `maakTegelbron` zoals nu. Zonder pad (slepen, oude venster) of bij een fout van de exe zet de viewer om zoals nu.

**Gelijkheid als toets**: een nieuwe test zet dezelfde scan om via de viewer (zoals nu) en via de exe-code, en vergelijkt alle vakken, beide overzichten en `info.json` (zonder `gemaakt`, `viewer` en `duurImport`).

**Verdieping per besluit** (de leesbare versie staat in het beslisdocument):

- **B1 Waar het omzetten draait** (nodig vóór F0). Voorstel: in de exe (Go), zoals PLAN-2.10 zegt. Voordelen: alle kernen, geheugen buiten het venster, en de basis voor E3. Alternatief: in de viewer met Web Workers (meerdere threads in het venster). Dat is minder werk en heeft geen tweede implementatie nodig, maar het geheugen blijft in het venster en de schrijver blijft op één thread.
- **B2 Dezelfde vakken als nu** (nodig vóór F0). Voorstel: de exe maakt byte voor byte dezelfde vakken, overzichten en `info.json` als de viewer. Dan is de bestaande viewer de toets, en kunnen oude en nieuwe projectmappen door elkaar gebruikt worden. Kost een exacte port van de uitdunners, met aandacht voor afronding. Alternatief: "gelijkwaardig" (zelfde punten, mogelijk een ander overzicht). Minder werk, maar dan is er geen harde toets en kan een project er na opnieuw omzetten net anders uitzien.
- **B3 Scan kiezen in het eigen venster** (nodig vóór F2). Voorstel: "Openen…" bij de puntenwolk gebruikt in het eigen venster de Windows-kiezer van de exe, zodat het pad bekend is en de exe kan omzetten. Slepen blijft werken, maar zet om in het venster (zonder pad). Alternatief: de browserkiezer houden en alleen omzetten in de exe als het pad op een andere manier bekend is (bijvoorbeeld via Recent). Dan gebruikt bijna niemand de nieuwe route.
- **B4 Terugval naar omzetten in het venster** (nodig vóór F2). Voorstel: lukt het in de exe niet (onbekend formaat, fout), dan meldt de viewer dat en zet hij om zoals nu. Het oude venster zet altijd om zoals nu. Alternatief: geen terugval, alleen een foutmelding. Eenvoudiger, maar dan kan een scan die nu werkt ineens niet meer.
- **B5 Hoe LAZ in de exe komt** (nodig vóór F5, na de proef in F4). Voorstel: laz-perf (dezelfde decoder als nu) als WebAssembly in wazero, een runtime in pure Go, zodat de uitkomst gelijk is aan nu en bouwen zonder cgo blijft. Per processorkern een eigen instantie. Alternatieven: een LAZ-decoder in pure Go (niet vastgesteld dat er een betrouwbare is; zelf porten is groot werk), of LAZ in het venster laten met meerdere Web Workers. De keuze valt na F4: die meet of laz-perf in wazero werkt, bit voor bit gelijk is en hoe snel het is.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Tegelschrijver, overzichten en `info.json` in Go (`omzet_tegels.go`) en de LAS-lezer (`omzet_las.go`), parallel lezen met ordelijke uitvoer; `cmd/pvomzet` voor de tests | `go vet` schoon en `go test ./...` groen, met tests voor afronding van halve millimeters (ook negatief) en voor 8- en 16-bits kleur. Nieuwe test `tests/omzetten_exe.test.js`: `dijk_begroeid.las` via de viewer en via `pvomzet` geeft byte voor byte dezelfde vakken, `overzicht.pvt`, `overzicht_maaiveld.pvt` en `info.json` (zonder `gemaakt`, `viewer`, `duurImport`), in modus boven en onder; "fouten: geen". Tijd van `pvomzet` op die scan gemeten en genoteerd | B1, B2 | L | Claude Code, high | `F0:` |
| F1 | ✅ gebouwd | PTS-lezer in Go (`omzet_pts.go`), parallel in blokken op regelgrens, met dezelfde kolomherkenning als `leesPts` | `go test ./...` groen. `tests/omzetten_exe.test.js` vergelijkt ook `bospad_scan.pts` (met kleur) en `bodem_multibeam.pts` (zonder kleur) byte voor byte; "fouten: geen" | F0 | M | Claude Code, medium | `F1:` |
| F2 | ✅ gebouwd | Omzettaak in de exe (`/__pv/omzet/start`, `/stand`, `/afbreken`) met sessiesleutel en toegestane mappen; tijdelijke map en pas na afloop op zijn plek. In de viewer: Windows-kiezer voor "Openen…" (B3), omzetten via de exe met voortgang en Afbreken, terugval (B4). `tests/hulp.js` doet de omzettaak na met `pvomzet` | `go test ./...` groen met tests voor: zonder sleutel 403, bron of doel buiten toegestane mappen 403, afbreken laat geen vakken achter, tweede taak tegelijk 409. `node run_alle.js` helemaal groen; in een nieuwe test opent een LAS via de kiezer, wordt omgezet via de exe-taak (zichtbaar in de testserver), toont voortgang en opent daarna; afbreken laat de map leeg en de viewer bruikbaar. Marco bevestigt op zijn laptop: een grote LAS (bijvoorbeeld Halsteren) via Openen… zet om met voortgang, Afbreken werkt, en de tijd staat in de statusregel | F1, B3, B4 | L | Claude Code, high | `F2:` |
| F3 | ✅ gebouwd | Oplevering 2.11.0: `zet_versie.py 2.11.0` (andere lengte: `.syso` opnieuw), LEESMIJ-blok "Nieuw in 2.11.0", handleiding, `tools/bouw.ps1`, tag `v2.11.0` | `node run_alle.js` en `go test ./...` groen; `dist\Lutrea-Profielviewer-2.11.0.exe` en de zip bestaan; Marco bevestigt de handmatige lijst: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT, en met `--browservenster` werkt alles zoals in 2.10.2 | F0, F1, F2 | S | Claude Code, medium | `F3:` en `2.11.0:` |
| F4 | ○ niet vrijgegeven | Proef LAZ: laz-perf.wasm in wazero (pure Go) laten draaien en één LAZ volledig decoderen; een LAZ-testbestand maken uit `dijk_begroeid.las` (Python, laspy met lazrs) | Rapport in punt 11 met: werkt de module zonder JavaScript-lijm (ja/nee, met wat er nodig was); alle punten bit voor bit gelijk aan de viewer (zelfde x, y, z, klasse, kleur); snelheid per kern en met alle kernen, vergeleken met de viewer op dezelfde LAZ; build met `CGO_ENABLED=0` slaagt. Daarna B5 voorleggen | F0 | M | Claude Code, high | `F4:` |
| F5 | ⏳ wacht op B5 | LAZ in de exe volgens B5 (`omzet_laz.go`): chunk-tabel, per kern een decoder, ordelijke uitvoer naar de schrijver; viewer gebruikt de exe-taak ook voor LAZ | `go test ./...` groen; `tests/omzetten_exe.test.js` vergelijkt de LAZ-testscan byte voor byte; `node run_alle.js` groen. Marco bevestigt op zijn laptop: een echte LAZ (bijvoorbeeld Wallach) zet om via de exe, sneller dan in 2.10.2 (tijd in de statusregel), en de profielen zien er hetzelfde uit | F4, B5 | L | Claude Code, high | `F5:` |
| F6 | ○ niet vrijgegeven | Oplevering 2.11.2: versie, LEESMIJ-blok "Nieuw in 2.11.2", handleiding, bouwen, tag `v2.11.2` | `node run_alle.js` en `go test ./...` groen; exe en zip bestaan; Marco bevestigt de handmatige lijst zoals bij F3, nu ook met een LAZ | F5 | S | Claude Code, medium | `F6:` en `2.11.2:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix. De opleveringscommits volgen de projectregel `X.Y.Z: <wat>` met tag `vX.Y.Z`.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** n.v.t.: er worden geen persoonsgegevens verwerkt; de scan en de vakken blijven op de eigen pc, er gaat niets naar internet.
**Beveiliging.** De omzettaak leest een bron en schrijft een doelmap: zelfde sessiesleutel, Host- en Origin-controle en toegestane mappen als de bestands-API (B2 van plan eigen-bestandstoegang). De bron moet een gekozen bestand zijn of in een toegestane map staan. Een kapotte of kwaadaardige scan mag de exe niet laten crashen of buiten de doelmap laten schrijven: de lezers controleren lengtes en aantallen, en een fout stopt alleen de taak. Bij F5 draait laz-perf in wazero in een afgeschermde omgeving zonder toegang tot bestanden.
**Gebruikers en handleiding.** In het eigen venster opent "Openen…" bij de puntenwolk de Windows-kiezer. Omzetten gaat sneller, met een knop Afbreken. Het resultaat en de projectmap blijven hetzelfde. Handleiding: sectie "Projectmap en vakken" en Stap 1 (puntenwolk inlezen).
**Beheer en configuratie.** Geen nieuwe instellingen. De exe gebruikt tijdens het omzetten meer processorkernen en geheugen buiten het venster.
**Releasenotes (kernpunten).** 2.11.0: grote LAS- en PTS-scans worden in het programma zelf omgezet, op alle kernen, met voortgang en afbreken. 2.11.2: hetzelfde voor LAZ.

## 9. Risico's en terugweg
- **Kleine verschillen in de vakken** (afronding, kleur, volgorde). Afgevangen met de byte-voor-byte-toets in F0 en F1. Terugweg: de viewer zet om zoals nu (B4).
- **laz-perf werkt niet in wazero, of is te traag.** F4 is daarom een proef met een rapport; B5 valt pas daarna. Terugweg: LAZ blijft in de viewer, of een alternatief uit B5. De 2.11.0-oplevering hangt daar niet van af.
- **Geheugen in de exe** bij heel grote scans: de schrijver houdt per vak een blok van 8192 punten (128 kB) vast, de overzichten elk tot 4 miljoen punten. Bij tienduizenden vakken kan dat oplopen; de schrijver moet dan vaker wegschrijven. F2 meet het geheugen bij een grote scan.
- **Twee implementaties** (viewer en exe) die uit elkaar kunnen lopen bij een latere wijziging van het formaat. Afgevangen doordat de gelijkheidstest in `run_alle` blijft staan.
- **Virusscanner of trage schijf** remmen het parallel lezen af. Meten bij Marco (F2, F5).
- Terugweg in het algemeen: elke fase is een eigen commit; in 2.11.x blijft de omzetting in de viewer bestaan.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Hoe lang duurt het omzetten van Wallach (79 mln) en Halsteren nu in 2.10.2, en zijn het LAS of LAZ? | F0 meet de exe-tijd op `dijk_begroeid.las`; F2 en F5 vragen Marco de tijd van een grote scan, vóór en na |
| Werkt laz-perf.wasm (Emscripten) in wazero zonder zijn JavaScript-lijm? | F4 zoekt het uit; lukt het niet, dan stellen we bij B5 een alternatief voor |
| Mag er een LAZ-testbestand (± 20 MB) in de repo, of wordt het in de test aangemaakt? | In de test aanmaken met Python (laspy en lazrs), net als `maak_dijk_16mln.py`; niet in git |
| Hoeveel kernen gebruikt de exe als Marco intussen andere programma's gebruikt? | Alle kernen min één |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-10-27 16:49 | 2026-10-27 17:05 | Marco van Steenbrugge ("F0 vrijgegeven") | Claude Code, claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | medium | 46 / 50.765 | bd8f1c8 | transcript (Claude Code 2.1.308) |
| F1 | 2026-10-27 17:06 | 2026-10-27 17:16 | Marco van Steenbrugge ("F1 vrijgegeven") | Claude Code, claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | medium | 28 / 22.639 | 8a5d575 | transcript (Claude Code 2.1.308) |
| F2 | 2026-10-27 17:18 | 2026-10-27 20:54 | Marco van Steenbrugge ("F2 vrijgegeven") | Claude Code, claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | medium | 138 / 71.666 | db05290, e4f237b, 2713017, cadf65b, 0edbe95 | transcript (Claude Code 2.1.308) |
| F3 | 2026-10-27 20:55 | 2026-10-27 21:08 | Marco van Steenbrugge ("F3 vrijgegeven") | Claude Code, claude-opus-5-5, sessie 7adc2aac-c45a-4d30-8ce9-d77758bd19f5 | medium | 32 / 12.705 | b5e219c, be42c3f | transcript (Claude Code 2.1.308) |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-10-27 17:05 | `go vet` schoon | `CGO_ENABLED=0 go vet ./...` in `bron-exe` (met tijdelijke map `app`): "VET-SCHOON" | gehaald |
| F0 | 2026-10-27 17:05 | `go test ./...` groen | `CGO_ENABLED=0 go test -count=1 ./...`: "ok ptsviewer" en "ok ptsviewer/omzet", 22 tests PASS (7 nieuw in `omzet/omzet_test.go`) | gehaald |
| F0 | 2026-10-27 17:05 | Test voor afronding van halve millimeters (ook negatief) | `TestRondZoalsJavaScript` (2,5 → 3; −2,5 → −2; −0,5 → 0; 0,49999999999999994 → 0; …), `TestNaarInt32ZoalsJavaScript` en `TestSchrijverHalveMillimeter` (z = −0,5 mm wordt 0, −1002,5 mm wordt −1002, zoals Math.round): PASS | gehaald |
| F0 | 2026-10-27 17:05 | Test voor 8- en 16-bits kleur | `TestSchrijverKleurdiepte`: 8-bits (rood 200 blijft 200, een latere 40000 wordt 255), 16-bits (51200 wordt 200, 40000 wordt 156), geen kleur: PASS | gehaald |
| F0 | 2026-10-27 17:05 | Nieuwe test `tests/omzetten_exe.test.js`: `dijk_begroeid.las` via de viewer en via `pvomzet` byte voor byte dezelfde vakken, `overzicht.pvt`, `overzicht_maaiveld.pvt` en `info.json` (zonder `gemaakt`, `viewer`, `duurImport`), in modus boven en onder | Modus boven en onder: "vakken: 16 van 16 byte voor byte gelijk (48.0 MB)", "overzicht.pvt: gelijk", "overzicht_maaiveld.pvt: gelijk", "info.json: gelijk (zonder gemaakt, viewer, duurImport)"; ook `bron.gewijzigd` gelijk | gehaald |
| F0 | 2026-10-27 17:05 | "fouten: geen" | `node omzetten_exe.test.js`: "fouten: geen"; in `node run_alle.js` (17:04): 16 van 16 OK, "Alle tests geslaagd" | gehaald |
| F0 | 2026-10-27 17:05 | Tijd van `pvomzet` op die scan gemeten en genoteerd | `pvomzet` op `dijk_begroeid.las` (3 mln punten, 24 logische processors): 2,35 / 2,42 / 2,43 s (drie runs), in de test 2,4 tot 2,7 s. Ter vergelijking: de viewer deed in dezelfde test 12,5 s tot en met laden; het omzetten zelf duurde daarin ± 7 s (meting F2 van plan eigen-bestandstoegang). De eerste Go-versie deed 7,0 s; de winst komt uit dunUit (zie punt 12) | gehaald |
| F1 | 2026-10-27 17:16 | `go test ./...` groen | `CGO_ENABLED=0 go test -count=1 ./...`: "ok ptsviewer" en "ok ptsviewer/omzet", 25 tests PASS (nieuw: `TestJsNummer`, `TestJsDelen`, `TestRgbKolom`); `go vet` schoon | gehaald |
| F1 | 2026-10-27 17:16 | `tests/omzetten_exe.test.js` vergelijkt ook `bospad_scan.pts` (met kleur) en `bodem_multibeam.pts` (zonder kleur) byte voor byte | In modus boven en onder: `bospad_scan.pts` "7 van 7 byte voor byte gelijk", overzicht en info.json gelijk; `bodem_multibeam.pts` "10 van 10", overzicht en info.json gelijk. `bodem_multibeam.pts` blijkt wel kleur te hebben; daarom ook `zonder_kleur.pts` (zonder kleur, kommas, BOM, gemengde regeleinden, ongeldige regels): "7 van 7", plus `tien_kolommen.pts` en `zes_kolommen.pts` (rare kleuren, aantal-regel die eerder stopt): alles gelijk | gehaald |
| F1 | 2026-10-27 17:16 | "fouten: geen" | `node omzetten_exe.test.js`: "fouten: geen" (14 vergelijkingen); `node run_alle.js` (17:15): 16 van 16 OK, "Alle tests geslaagd" | gehaald |
| F2 | 2026-10-27 17:49 | `go test ./...` groen | `CGO_ENABLED=0 go test -count=1 ./...`: "ok ptsviewer", "ok ptsviewer/omzet", 28 tests PASS; `go vet` schoon | gehaald |
| F2 | 2026-10-27 17:49 | Go-test: zonder sleutel 403 | `TestOmzetAfscherming`: `omzet/start` zonder sleutel 403: PASS. Ook in de proefexe: `/__pv/omzet/start` zonder sleutel 403 | gehaald |
| F2 | 2026-10-27 17:49 | Go-test: bron of doel buiten toegestane mappen 403 | `TestOmzetAfscherming`: bron buiten 403, doel buiten 403, de gekozen map zelf als doel 403, en geen doelmap aangemaakt: PASS | gehaald |
| F2 | 2026-10-27 17:49 | Go-test: afbreken laat geen vakken achter | `TestOmzetAfbrekenLaatNietsAchter`: na afbreken fase "afgebroken", geen doelmap en geen `.pvtmp`; daarna kan een nieuwe omzetting; ook bij het stoppen van de exe opgeruimd: PASS. `TestOmzetVervangtOudDoel`: oud vak weg, nieuwe vakken op hun plek; een kapotte scan geeft "fout" zonder doelmap: PASS | gehaald |
| F2 | 2026-10-27 17:49 | Go-test: tweede taak tegelijk 409 | `TestOmzetAfbrekenLaatNietsAchter`: tweede start tijdens een lopende omzetting 409: PASS | gehaald |
| F2 | 2026-10-27 17:49 | `node run_alle.js` helemaal groen | `node run_alle.js` (17:45): 17 van 17 OK, "Alle tests geslaagd" | gehaald |
| F2 | 2026-10-27 17:49 | Nieuwe test: een LAS opent via de kiezer, wordt omgezet via de exe-taak (zichtbaar in de testserver), toont voortgang en opent daarna | `tests/omzetten_viewer.test.js` ronde 1: Openen... via `/__pv/kies` (bestandsveld van de browser 0 keer gebruikt), 1 omzettaak in de testserver (`pvomzet`), info.json "gemaakt door pvomzet (testserver)", 5 voortgangsregels ("17% · 0 s, 37% · 1 s, 57% · 1 s"), daarna geladen met "· omgezet in 2 s door het programma"; "fouten: geen" | gehaald |
| F2 | 2026-10-27 17:49 | Nieuwe test: afbreken laat de map leeg en de viewer bruikbaar | Ronde 2: Afbreken → "dijk2.las: omzetten afgebroken", knop weer verborgen, map `A - dijk2` leeg, geen `.pvtmp`; dezelfde scan daarna opnieuw: omgezet en geladen. Ronde 3 (terugval, B4): melding "het programma kon niet omzetten (…); de viewer zet om…", de viewer zet om via stukken lezen (Range), en de vakken zijn gelijk aan die van het programma | gehaald |
| F2 | 2026-10-27 17:49 | Marco bevestigt op zijn laptop: een grote LAS (bijvoorbeeld Halsteren) via Openen… zet om met voortgang, Afbreken werkt, en de tijd staat in de statusregel | Nog niet gedaan. Proefexe `dist\proef\Lutrea-Profielviewer-2.11-proef.exe` gebouwd (11.279.360 bytes, `CGO_ENABLED=0`); rooktest: ping "klaar", omzettaak zonder sleutel 403, stoppen werkt. Wacht op Marco | niet toetsbaar |
| F2 | 2026-10-27 18:22 | Marco bevestigt op zijn laptop: een grote LAS (bijvoorbeeld Halsteren) via Openen… zet om met voortgang, Afbreken werkt, en de tijd staat in de statusregel | Marco van Steenbrugge, 18:20, via chat: "de test app werkt naar behoren". Log van zijn run (17:51–18:19): kiezer (open) "DIJK Halsteren..las" en kiezer (map) "001-Halsteren", maar geen "omzetten gestart": de vakken uit 2.9.1 (26-10) zijn hergebruikt, dus voortgang, Afbreken en tijd zijn niet aan bod gekomen. Wel gemeten met dezelfde code (`pvomzet`) op die scan: 52.461.129 punten in 11,1 s (2.9.1 in de viewer: 37 s), piekgeheugen 959 MB, 71 van 71 vakken en beide overzichten byte voor byte gelijk aan die van 2.9.1. Nieuwe controle met een lege projectmap gevraagd | niet toetsbaar |
| F2 | 2026-10-27 20:50 | Marco bevestigt op zijn laptop: een grote LAS (bijvoorbeeld Halsteren) via Openen… zet om met voortgang, Afbreken werkt, en de tijd staat in de statusregel | Marco van Steenbrugge, 20:48, via chat: "Ja: met een lege projectmap zag ik de voortgang, de omzettijd stond in de statusregel, en Afbreken werkte." Het log van de run 20:45–20:47 toont geen "kiezer (open)" en geen "omzetten gestart", alleen twee keer "kiezer (map)" (001-test, 002-test); beide mappen bevatten de vakken van 2.9.1 (viewer "2.9.1", 37 s), dus gekopieerd via Opslaan als, niet omgezet; 002-test is onvolledig (43 van 71 vakken, viewer 4 s later afgesloten). Bevestiging en log spreken elkaar tegen; opnieuw nagevraagd | niet toetsbaar |
| F2 | 2026-10-27 20:54 | `go test ./...` groen | Ongewijzigd sinds 17:49 (code db05290): 28 tests PASS | gehaald |
| F2 | 2026-10-27 20:54 | Go-test: zonder sleutel 403 | Ongewijzigd sinds 17:49: `TestOmzetAfscherming` PASS; proefexe zonder sleutel 403 | gehaald |
| F2 | 2026-10-27 20:54 | Go-test: bron of doel buiten toegestane mappen 403 | Ongewijzigd sinds 17:49: `TestOmzetAfscherming` PASS | gehaald |
| F2 | 2026-10-27 20:54 | Go-test: afbreken laat geen vakken achter | Ongewijzigd sinds 17:49: `TestOmzetAfbrekenLaatNietsAchter` en `TestOmzetVervangtOudDoel` PASS | gehaald |
| F2 | 2026-10-27 20:54 | Go-test: tweede taak tegelijk 409 | Ongewijzigd sinds 17:49: PASS | gehaald |
| F2 | 2026-10-27 20:54 | `node run_alle.js` helemaal groen | Ongewijzigd sinds 17:45: 17 van 17 OK | gehaald |
| F2 | 2026-10-27 20:54 | Nieuwe test: een LAS opent via de kiezer, wordt omgezet via de exe-taak (zichtbaar in de testserver), toont voortgang en opent daarna | Ongewijzigd sinds 17:49: `omzetten_viewer.test.js` ronde 1, "fouten: geen" | gehaald |
| F2 | 2026-10-27 20:54 | Nieuwe test: afbreken laat de map leeg en de viewer bruikbaar | Ongewijzigd sinds 17:49: ronde 2 en 3, "fouten: geen" | gehaald |
| F2 | 2026-10-27 20:54 | Marco bevestigt op zijn laptop: een grote LAS (bijvoorbeeld Halsteren) via Openen… zet om met voortgang, Afbreken werkt, en de tijd staat in de statusregel | Marco van Steenbrugge, 20:53, via chat: "Ja, volgens de stappen: na Nieuw en Openen… bij de puntenwolk zag ik de voortgang, de omzettijd stond in de statusregel, en Afbreken werkte." en "heb het alleen om gedraaid" (eerst afgebroken). Log van zijn run (20:50–20:52): "kiezer (open): DIJK Halsteren..las", "omzetten gestart … 003-test", "omzetten afgebroken na 7.5 s", daarna "omzetten klaar: 52461129 punten in 71 vakken, 9.7 s" (003-test) en "9.5 s" (004-test). In 004-test: info.json "Lutrea Profielviewer 2.10.2 (exe)", 71 vakken, byte voor byte gelijk aan de vakken van 2.9.1; geen .pvtmp over | gehaald |
| F3 | 2026-10-27 21:02 | `node run_alle.js` en `go test ./...` groen | `node run_alle.js` op 2.11.0 (20:57–21:01): 17 van 17 OK, "Alle tests geslaagd". `tools\bouw.ps1` draaide `go vet` en `go test`: "ok ptsviewer", "ok ptsviewer/omzet" | gehaald |
| F3 | 2026-10-27 21:02 | `dist\Lutrea-Profielviewer-2.11.0.exe` en de zip bestaan | `dist\Lutrea-Profielviewer-2.11.0.exe` 11.279.360 bytes en `dist\Lutrea-Profielviewer_compleet_2.11.0.zip` 5.694.879 bytes (21:01); versie-info 2.11.0; gestart: ping "klaar:2.11.0", omzettaak zonder sleutel 403, `viewer.js?v=73`; zip 57 bestanden met `bron-exe\omzet\*.go` en `omzet_taak.go`. Commit b5e219c, tag v2.11.0 gepusht | gehaald |
| F3 | 2026-10-27 21:02 | Marco bevestigt de handmatige lijst: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT, en met `--browservenster` werkt alles zoals in 2.10.2 | Nog niet gedaan; wacht op Marco | niet toetsbaar |
| F3 | 2026-10-27 21:08 | `node run_alle.js` en `go test ./...` groen | Ongewijzigd sinds 21:02 (commit b5e219c): 17 van 17 OK; go test groen in bouw.ps1 | gehaald |
| F3 | 2026-10-27 21:08 | `dist\Lutrea-Profielviewer-2.11.0.exe` en de zip bestaan | Ongewijzigd sinds 21:02: beide in `dist\`, tag v2.11.0 gepusht | gehaald |
| F3 | 2026-10-27 21:08 | Marco bevestigt de handmatige lijst: puntenwolk openen (Wallach/Halsteren), projectmap, PDF/DXF opslaan, 3D, luchtfoto/BGT, en met `--browservenster` werkt alles zoals in 2.10.2 | Marco van Steenbrugge, 21:07, via chat: "Ja, in 2.11.0 werkt alles: puntenwolk openen (Wallach/Halsteren), projectmap, PDF en DXF opslaan, 3D, luchtfoto en BGT; met --browservenster werkt alles zoals in 2.10.2." Log op de ontwikkel-pc: start 2.11.0 om 21:03, "omzetten klaar: 52461129 punten in 71 vakken, 9.1 s" (999-test); een start met --browservenster staat er niet in (mogelijk elders getest). Het oordeel steunt op zijn bevestiging | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F0 | Effort medium in plaats van gepland high | Reden onbekend (effort-instelling van de sessie) |
| F0 | De omzetcode staat in een eigen package `bron-exe/omzet` in plaats van in het hoofdpackage | `cmd/pvomzet` kan het hoofdpackage (package main) niet gebruiken; zo delen exe en testprogramma dezelfde code |
| F0 | `dunUit` en de uitdunners gebruiken in Go een andere hash, en `dunUit` een vast raster over de kernen in plaats van de hashtabel | De eerste letterlijke vertaling deed 7,0 s, driekwart in `dunUit` (ook in de viewer ± 4 s). Welk punt per cel blijft en de volgorde hangen alleen af van de cel en de punten, niet van de tabel; `TestDunUitZelfdeAlsViewer` toetst het raster tegen de werkwijze van de viewer, en de gelijkheidstest bevestigt het. Daarna 2,4 s |
| F0 | De vakken worden nog direct in de doelmap geschreven; een map met vakken wordt geweigerd | De tijdelijke map en het pas-na-afloop-op-zijn-plek-zetten horen bij de omzettaak in F2 |
| F1 | `bodem_multibeam.pts` heeft wel kleur (7 kolommen); de toets "zonder kleur" gebeurt met een zelfgemaakt `zonder_kleur.pts`, plus twee extra lastige bestanden | Het plan nam aan dat het bestand geen kleur had; gelezen met `head` |
| F1 | Schrijver en uitdunners nemen de kleur als getal (float64) in plaats van als 16-bits waarde | Uit een PTS komt de kleur als getal uit de tekst; de viewer rekent dan met kommagetallen of negatieve waarden en bewaart ze zoals Uint16Array en setUint8. LAS blijft gelijk (16-bits waarden zijn exact) |
| F2 | Geheugen en snelheid gemeten op de 16-miljoen-wolk (`maak_dijk_16mln.py`): eerst 20,7 s en 2,3 GB piek, na begrenzen (uitdunners in één keer naar hun limiet, minder rasters in dunUit, kleinere buffers per vak, minder blokken vooruit, GOGC 50 tijdens het omzetten) en de twee overzichten op eigen kernen: 9 tot 10 s en ± 1,1 GB. De viewer deed dezelfde wolk in 36 tot 38 s (tot en met laden). Op 16 miljoen punten ook byte voor byte gelijk (85 vakken, 256 MB, boven en onder) | Plan punt 9 vroeg het geheugen bij een grote scan te meten; de eerste meting was te hoog voor Wallach (79 mln) |
| F2 | De omzettijd wordt na het laden achter de statusregel gezet ("· omgezet in 2 s door het programma"), ook bij omzetten in de viewer ("· omgezet in 11 s") | Anders overschrijft de laadmelding hem, en dan kan Marco de tijd niet aflezen (criterium) |
| F2 | `pvomzet` heeft een vlag `-voortgang`, en `tests/hulp.js` bouwt `pvomzet` zelf (gedeeld door beide tests) | Nodig om de omzettaak in de testserver na te doen met voortgang |
| F2 | Effort medium in plaats van gepland high | Reden onbekend (effort-instelling van de sessie) |
| F2 | De handmatige controle kostte drie rondes; de eerste twee raakten het omzetten niet (vakken hergebruikt, daarna Opslaan als) | De controle-instructie noemde niet dat er geen project open mocht staan; de derde keer met stappen (Project → Nieuw eerst). Het tijdvak van de uitvoeringsrij bevat die wachttijd |
| F2 | Gemeten op Halsteren (52,5 mln punten, 1,8 GB LAS): 9,5 tot 11,1 s in het programma tegen 37 s in de viewer van 2.9.1, piekgeheugen 959 MB, vakken gelijk | Vergelijkingspunt uit open vraag 1 |
| F3 | `.syso` niet opnieuw gemaakt | 2.10.2 en 2.11.0 hebben dezelfde lengte; `zet_versie.py` werkte de versie-info zelf bij (gecontroleerd: versie-info 2.11.0) |
| F3 | Tijdvak bevat de wachttijd op Marco's handmatige controle (21:02 tot 21:07) | Wachten op Marco |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-10-27 16:30 | Eerste versie | - | Nog geen vrijgave |
| 2 | 2026-10-27 21:16 | Versienummer van de LAZ-oplevering: 2.11.2 in plaats van 2.11.1 (2.11.1 werd een losse patch: kadaster in het dwarsprofiel aan/uit, op verzoek van Marco: "Lever het kadaster-vinkje nu op als patch 2.11.1; LAZ wordt dan 2.11.2.") | F6 | F6 was nog niet vrijgegeven; geen vrijgave vervalt |

## 14. Bronnen
- `viewer.js` op d052abc: `maakUitdunner` (± 1004), `leesPts` (1111), `leesLasHeader` (1182), `leesLazPunten` (1258), `leesLasPunten` (1330), `dunUit` (1392), tegelformaat en `maakTegelSchrijver` (1800–1900), `importeerNaarTegels`, `tegelbronVoor`
- `docs/ARCHITECTUUR.md`, sectie "Tegelwolk"
- `docs/PLAN-2.10-windows-programma.md`, fase E en volgorde (27-10-2026)
- `docs/eigen-bestandstoegang.plan.md` (bestands-API, kiezer, B2 en B3) en de snelheidsmeting bij F2 daarvan
- `vendor/laz-perf/` (laz-perf.wasm, chunktable.js)
- `testdata/groot/`, `testdata/snoei_test/`, `testdata/doorvaart_test/`
- Laptop van Marco: 24 logische processors, 47 GB geheugen (gemeten 2026-10-27)

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
