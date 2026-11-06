---
plan: klassen-kiezen
titel: Kiezen welke classificaties worden ingelezen
versie: 1
status: gebouwd        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 ✅           # berekend door de skill
opgesteld: 2026-11-06
opgesteld_door: agent, Claude Opus 5.5 (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: klassen-kiezen.beslis.md
basis_commit: d7c3d09
vervangt: -
samenvatting: Bij het openen van een LAS/LAZ kiest de gebruiker welke classificaties (maaiveld, weg, gebouw, …) worden ingelezen; de rest komt niet in de vakken, zodat zeer dichte wolken (zoals LoZ.laz, 441 mln punten) werkbaar worden.
trefwoorden: [classificatie, klassen, filter, las, laz, omzetten, vakken, tegels, metashape, geheugen, loon op zand]
---

# Plan: Kiezen welke classificaties worden ingelezen

## 1. In het kort
1. Bij het openen van een LAS/LAZ met meer dan één klasse verschijnt eerst een venstertje: per klasse een vinkje, met de naam en het aandeel uit een snelle steekproef.
2. Alleen de aangevinkte klassen gaan de vakken in, zowel bij het omzetten door het programma (Go) als bij het omzetten door de viewer en bij het laden zonder projectmap.
3. De keuze staat in `info.json`. Met de knop "Klassen wijzigen…" in het paneel vink je later een klasse bij of af; de wolk wordt dan opnieuw omgezet, en de oude vakken blijven staan tot het nieuwe omzetten klaar is.
4. Zo kleed je de wolk stap voor stap aan: eerst bijvoorbeeld maaiveld en weg, later het kunstwerk erbij (wens van Marco, 2026-11-06).

## 2. Aanleiding en doel
LoZ.laz (Agisoft Metashape, LAS 1.4, puntformaat 7, 441.392.301 punten, 136 × 101 m, EPSG:7415) loopt vast in de viewer. Het omzetten zelf lukt wel: `puntenwolk\A - LoZ\info.json` meldt `duurImport: 57` s, 11 vakken en 6,7 GB op schijf. Gemiddeld is dat ruim 40 miljoen punten per vak van 50 × 50 m, dus zo'n 640 MB per vak. De viewer leest een vak in zijn geheel in (`leesTegels`, viewer.js r. 2050–2065: `arrayBuffer()` van het hele bestand en een lus per punt). Bij een profiel of bij inzoomen zijn dat al snel meerdere vakken, ver boven de ± 4 GB van het venster.

Klassen in de wolk (uit `info.json`): 6 (gebouw) 240,1 mln · 2 (maaiveld) 88,1 mln · 11 (wegdek) 58,5 mln · 5 (hoge vegetatie) 44,4 mln · 66 10,2 mln · 67 0,05 mln. Met alleen 2 + 11 blijven er 146,6 mln punten over (33 %). Ligging uit een steekproef van 25 %: klasse 6 ligt over het hele gebied (11,6–19,8 m NAP), klasse 66 vooral rond x 132.570, y 404.140, en klasse 67 op één plek (13,7 m NAP). Het kunstwerk zit waarschijnlijk in 6 en/of 66. Klasse 6 alleen is al 240 mln punten; dat blijft zwaar (zie punt 4 en 10).

Geslaagd als: de gebruiker vóór het omzetten klassen kan uitvinken, later klassen kan bij- of afvinken, de vakken alleen die klassen bevatten, `info.json` de keuze vastlegt, en een wolk met een andere keuze niet stilzwijgend wordt hergebruikt.

## 3. Onderzoek en bevindingen
- **Het programma zet om in Go**, niet in de viewer: `tegelbronVoor` (viewer.js r. 1741) roept bij het eigen venster `omzettenDoorProgramma` aan (`POST omzet/start` met `bron`, `doel`, `modus`). Die route is `omzetStart` in `bron-exe/omzet_taak.go` r. 110. Lukt dat niet, dan zet de viewer zelf om met `importeerNaarTegels` (r. 2013).
- **Go-schrijver**: `Schrijver.VoegToe` (`bron-exe/omzet/tegels.go` r. 200) telt `klassen[k]` en schrijft daarna elk punt. Een filter hoort hier: tellen voor de bron, alleen schrijven als de klasse gekozen is. Zo blijven het overzicht en het maaiveldoverzicht ook gefilterd, want die worden in `schrijf` gevuld.
- **Viewer-schrijver**: `maakTegelSchrijver.voegToe` (viewer.js r. 1943) heeft dezelfde opbouw.
- **Laden zonder projectmap**: `leesLazPunten`/`leesLasPunten` (r. 1267/1339) geven elk punt met klasse aan `dunner.voegToe`. Een filter kan als omhulsel om de sink.
- **Opnieuw omzetten zonder verlies**: het programma zet om in een tijdelijke map (`doel + "." + id + tijdelijkAchter`) en zet die pas op zijn plek als alles klaar is (`omzetTaak.draai`, `bron-exe/omzet_taak.go`). Afbreken laat de oude vakken staan. De viewer-terugval wist de oude vakken wél eerst (viewer.js r. 1767); bij "Klassen wijzigen…" moet die ook via een tijdelijke map.
- **Hergebruik**: `tegelbronVoor` hergebruikt vakken als `info.bron.grootte` en `gewijzigd` gelijk zijn (r. 1748). De klassenkeuze moet daar ook meetellen.
- **Klassen vooraf**: de LAS 1.4-header heeft geen telling per klasse. De viewer heeft al een steekproef die chunks over het hele bestand verdeelt (`leesLazPunten` met `isSteekproef`, r. 1275–1285), die over Range-verzoeken leest en dus ook bij een bestand van vele GB snel is.
- **Andere plekken met klasse 2**: r. 1810, 1855 en 4909 gebruiken `info.klassen[2]` om te bepalen of er een maaiveld is. Zonder klasse 2 in de keuze valt het maaiveldoverzicht weg; dat is gewenst.
- **LAZ van Metashape**: vaste chunk van 50.000, chunktabel in orde, record 39 bytes (formaat 7 plus 3 extra bytes). Er zijn geen problemen met het formaat zelf (gemeten met een eigen leesscript op LoZ.laz).

## 4. Niet in scope
- Uitdunnen tijdens het omzetten (bijv. in 3D-hokjes van 2 cm, zodat wanden en onderkant van een kunstwerk blijven). Marco wil eerst de klassenkeuze en daarna zelf bepalen hoe ver hij de wolk aankleedt (chat, 2026-11-06); uitdunnen kan een volgend plan worden.
- Kleinere vakken dan 50 m bij zeer dichte wolken. Dat wijzigt het formaat `pv-tegels-1`.
- Klassen aan- en uitzetten in een al omgezette wolk zonder opnieuw om te zetten. Dat lost de geheugenlast niet op, want de vakken blijven even groot.
- Een vergelijkingswolk (B): die gebruikt al standaard alleen klasse 2 (`maakVergelijkFilter`).
- PTS-bestanden: die hebben geen classificatie.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Altijd Nederlands in UI en commentaar | CLAUDE.md, afspraken met Marco |
| Formaat `pv-tegels-1` blijft gelijk; alleen `info.json` krijgt velden erbij | CLAUDE.md (architectuur), oudere vakken moeten blijven werken |
| Programma en viewer zetten om met dezelfde uitkomst (paritytest) | `tests/omzetten_parity.test.js`, plan omzetten-in-exe |
| Kleine, geteste stap; patchversie | CLAUDE.md |

## 6. Ontwerp en besluiten (technisch)
**Stroom.** Bij het openen van een LAS/LAZ (A, met of zonder projectmap):
1. Steekproef: `telKlassen(bestand, header)` leest ± 40 chunks verspreid over het bestand en levert telling per klasse. LAS: blokjes zoals de bestaande steekproef.
2. Is er maar één klasse (of alleen 0/1), dan geen venster en gaat alles mee zoals nu.
3. Anders een venster "Welke klassen inlezen?": per klasse een vinkje, de Nederlandse naam (ASPRS: 0 nooit geclassificeerd, 1 niet geclassificeerd, 2 maaiveld, 3 lage vegetatie, 4 middelhoge vegetatie, 5 hoge vegetatie, 6 gebouw, 7 ruis (laag), 9 water, 10 spoor, 11 wegdek, 13–16 draden/masten, 17 brugdek, 18 ruis (hoog); 64 en hoger "eigen klasse N") en het aandeel in %. Knoppen: Alles, Alleen maaiveld, Inlezen, Annuleren.
4. De keuze gaat mee als `klassen: [2, 11]` (of afwezig = alles) naar `omzet/start`, naar `importeerNaarTegels` en naar de sink bij laden zonder projectmap.
5. `info.json` krijgt `klassenKeuze` (lijst, of `null` = alles) en `klassenBron` (telling over het hele bestand). `klassen` en `aantal` blijven gaan over wat er in de vakken zit.
6. Hergebruik in `tegelbronVoor`: alleen als ook `klassenKeuze` gelijk is. Anders wordt opnieuw omgezet.
7. Knop "Klassen wijzigen…" in het paneel van wolk A (alleen bij een tegelbron met `klassenBron` met twee of meer klassen): opent hetzelfde venster, nu met de exacte telling uit `klassenBron` en de huidige keuze aangevinkt. Bij Inlezen: opnieuw omzetten met de nieuwe keuze (programma: tijdelijke map zoals nu; viewer-terugval: eerst in `<wolkmap>.nieuw`, dan wisselen), daarna de wolk opnieuw laden. As, profielen en instellingen blijven staan. Oude vakken (zonder `klassenBron`) tonen de knop ook, met de telling uit `info.klassen`.

**Go.** `Opdracht.Klassen []uint8` (nil = alles) → `Schrijver.toegestaan [256]bool`. In `VoegToe`: `klassenBron[k]++`; niet toegestaan → return vóór de bbox en de rest. `omzetStart` neemt `klassen` aan (alleen 0–255, ten hoogste 256 waarden). `pvomzet` krijgt `-klassen 2,11` voor de tests.

**Verdieping per besluit:**

- **B1 Waar het filter zit** (nodig vóór F0). Voorstel: tijdens het omzetten; wat niet gekozen is, komt niet in de vakken. Een klasse bij- of afvinken kan later met "Klassen wijzigen…" (opnieuw omzetten, bij LoZ ± 1 minuut; het uitpakken van de LAZ kost de meeste tijd, dus alleen de extra klasse toevoegen scheelt nauwelijks). Alternatief: één keer omzetten met per klasse een eigen set vakken (submap per klasse), zodat aan- en uitzetten zonder omzetten kan. Dat is sneller om te wisselen, maar wijzigt het vakkenformaat en zet alles op schijf. Marco koos in de chat voor de eerste manier, met de knop (2026-11-06); het besluit zelf staat nog open tot het formeel is beantwoord.
- **B2 Wanneer het venster verschijnt** (nodig vóór F1). Voorstel: bij elke nieuwe LAS/LAZ met twee of meer klassen, standaard alles aangevinkt, met de laatste keuze onthouden in localStorage (`pv.klassenKeuze`) als die klassen in het bestand zitten. Alternatief: geen venster, maar een vaste instelling in het instellingenpaneel. Dat is rustiger, maar je vergeet hem makkelijk en ziet niet wat er in de wolk zit.
- **B3 Welke versie** (nodig vóór F2). 2.12.0 staat klaar en wacht op jouw controle (plan punten-in-profiel, F3). Voorstel: dit wordt 2.12.1, na 2.12.0. Alternatief: meenemen in 2.12.0, één oplevering, maar dan moet je opnieuw controleren.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Go: klassenfilter in `Schrijver`, `Opdracht.Klassen`, `klassen` in `omzet/start`, `-klassen` in pvomzet, `klassenKeuze` en `klassenBron` in info.json | 1. `go test ./...` in bron-exe slaagt, met een nieuwe test die met `Klassen: [2]` alleen klasse-2-punten in de vakken vindt. 2. pvomzet op LoZ.laz met `-klassen 2,11` geeft `aantal` 146.630.100 en `klassenBron` met alle zes klassen. 3. Zonder `klassen` is info.json gelijk aan nu, afgezien van de nieuwe velden. | B1 | M | Opus 5.5, medium | `F0:` |
| F1 | ✅ gebouwd | Viewer: steekproef van de klassen, het venster, het filter in `importeerNaarTegels` en bij laden zonder map, keuze naar `omzet/start`, hergebruikcheck op `klassenKeuze`, knop "Klassen wijzigen…" | 1. Een nieuwe test (`tests/klassen_kiezen.test.js`) opent een LAS met klassen 2 en 6, kiest alleen 2 en toetst dat de vakken alleen klasse 2 bevatten, via het programma én via de viewer. 2. Opnieuw openen met een andere keuze zet opnieuw om, met dezelfde keuze worden de vakken hergebruikt. 3. Een LAS met één klasse toont geen venster. 4. Met "Klassen wijzigen…" klasse 6 erbij: daarna bevatten de vakken klasse 2 en 6, en de as blijft staan; afbreken laat de vakken met alleen klasse 2 staan (beide routes). 5. Screenshot van het venster op LoZ.laz. | F0, B1, B2 | M | Opus 5.5, medium | `F1:` |
| F2 | ✅ gebouwd | Opleveren: versie ophogen, LEESMIJ, handleiding, `node run_alle.js` groen, bouwen, installatietoets, commit en tag; jouw controle op LoZ.laz | 1. `node run_alle.js` eindigt met `fouten: geen`. 2. `.\tools\bouw_installer.ps1 -Toets` eindigt met `fouten: geen`. 3. Exe, zip en setup staan in `dist`. 4. Marco bevestigt dat LoZ.laz met een beperkte keuze te openen en te profileren is. | F1, B3 | S | Opus 5.5, medium | `F2:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** n.v.t.: er worden geen persoonsgegevens verwerkt; alles blijft lokaal.
**Beveiliging.** `omzet/start` krijgt één veld erbij, dat wordt gecontroleerd (alleen getallen 0–255). Verder niets.
**Gebruikers en handleiding.** Nieuw venster bij het openen van een geclassificeerde scan; handleiding, sectie puntenwolk openen, krijgt uitleg over de klassenkeuze en het opnieuw omzetten.
**Beheer en configuratie.** Nieuwe localStorage-sleutel `pv.klassenKeuze`; nieuwe velden in info.json (oude info.json blijft geldig, ontbrekend = alles).
**Releasenotes (kernpunten).** Bij het openen van een LAS/LAZ kies je welke classificaties je inleest. Zeer dichte drone- en fotogrammetriewolken worden zo werkbaar.

## 9. Risico's en terugweg
- Paritytest programma en viewer kan verschillen als het filter niet op dezelfde plek zit. Beide filteren vóór de bbox en het overzicht; de bestaande paritytest draait met en zonder keuze.
- Een gebruiker vinkt per ongeluk het maaiveld uit en ziet geen maaiveldprofiel. Het venster toont de keuze, de statusregel noemt de gekozen klassen, en opnieuw openen met een andere keuze zet opnieuw om.
- Terugweg: de keuze is optioneel; zonder `klassen` werkt alles als nu. Terugdraaien is de commits van F0 en F1 terugzetten.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Wat betekenen klasse 66 en 67 in de Metashape-export van LoZ? | "Eigen klasse 66" / "Eigen klasse 67" in het venster |
| Wat deed je precies toen de viewer vastliep (openen, inzoomen, dwarsprofielen maken)? | Aannemen dat het het lezen van de grote vakken bij profiel of inzoomen is (zie punt 2) |
| Is filteren op klasse genoeg, of wil je ook uitdunnen bij het omzetten? | Alleen filteren in dit plan; na F2 beslist Marco of uitdunnen een volgend plan wordt |

Inzoomen werkt na dit plan hetzelfde als nu: uitgezoomd het grove overzicht, ingezoomd de volle vakken van wat in beeld is, maar dan alleen met de gekozen klassen.

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-11-06 14:34 | 2026-11-06 14:38 | Marco van Steenbrugge | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 14 / 7.268 | f87a006 | transcript (Claude Code 2.1.317) |
| F1 | 2026-11-06 14:39 | 2026-11-06 15:05 | Marco van Steenbrugge | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 94 / 61.118 | 494024c | transcript (Claude Code 2.1.317) |
| F2 | 2026-11-06 15:05 | 2026-11-07 00:55 | Marco van Steenbrugge | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 48 / 12.127 | d6a108d | transcript (Claude Code 2.1.317); tokens gemeten tot de bouw, de wachttijd op de controle telt niet mee |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-11-06 14:38 | 1. `go test ./...` slaagt, met een nieuwe test voor `Klassen: [2]` | `go vet ./... && go test ./...` in bron-exe (met app-map): `ok ptsviewer`, `ok ptsviewer/omzet`; nieuwe test `TestOmzetKlassenKeuze` in `bron-exe/omzet/omzet_test.go` controleert dat de vakken alleen klasse 2 bevatten | gehaald |
| F0 | 2026-11-06 14:38 | 2. pvomzet op LoZ.laz met `-klassen 2,11` geeft `aantal` 146.630.100 en `klassenBron` met alle zes klassen | `pvomzet -klassen 2,11` op LoZ.laz: `{"aantal":146630100,"seconden":38.19,"vakken":11}`; info.json `klassenKeuze` [2, 11], `klassenBron` met 2, 5, 6, 11, 66, 67; 2,3 GB in plaats van 6,7 GB | gehaald |
| F0 | 2026-11-06 14:38 | 3. Zonder `klassen` is info.json gelijk aan nu, afgezien van de nieuwe velden | oude pvomzet (git archive HEAD d7c3d09) en nieuwe op `testdata/groot/dijk_16mln.las`: info.json zonder `gemaakt`/`duurImport` gelijk op `klassenKeuze` (null) en `klassenBron` na; vakken en overzichten bytegelijk (`cmp`) | gehaald |
| F1 | 2026-11-06 15:04 | 1. Nieuwe test opent een LAS met klassen 2 en 6, kiest alleen 2; vakken bevatten alleen klasse 2, via het programma én via de viewer | `node klassen_kiezen.test.js`: stap 1 "1 vakken: [ 2 ] \| keuze [ 2 ] \| aan programma [2]" (pvomzet), stap 5 "5 viewer: [ 2 ] \| keuze [ 2 ] \| gemaakt door 2.12.0" (viewer); eind "fouten: geen" | gehaald |
| F1 | 2026-11-06 15:04 | 2. Opnieuw openen met andere keuze zet opnieuw om, met dezelfde keuze worden de vakken hergebruikt | stap 2: "zelfde keuze: 0 omzettingen", "andere keuze: 1 omzetting(en) \| vakken [ 2, 6 ]" | gehaald |
| F1 | 2026-11-06 15:04 | 3. Een LAS met één klasse toont geen venster | stap 7: "venster geopend: 0 \| knop zichtbaar: false" | gehaald |
| F1 | 2026-11-06 15:04 | 4. Met Klassen… klasse 6 erbij: vakken bevatten 2 en 6 en de as blijft; afbreken laat de vakken staan (beide routes) | programma: stap 3 "erbij 6: [ 2, 6 ] \| as 280.0" (as vóór 280.0), stap 4 afbreken "omzetten afgebroken \| vakken [ 2, 6 ]", geen .pvtmp; viewer: stap 5 "erbij 6: [ 2, 6 ]", oude `tegels` weg; stap 6 schrijffout halverwege: "vakken [ 2, 6 ]", één tegelmap. De viewer-route heeft geen afbreekknop; daar is mislukken getoetst (zie punt 12) | gehaald |
| F1 | 2026-11-06 15:04 | 5. Screenshot van het venster op LoZ.laz | `tests/uit/klassen_kiezen_LoZ.png`: venster na 0,9 s met klassen 2, 5, 6, 11, 66, 67 en "± 89% van de punten (steekproef)" met 5 uitgevinkt | gehaald |
| F2 | 2026-11-06 15:24 | 1. `node run_alle.js` eindigt met `fouten: geen` | `node run_alle.js`: 21 tests "OK", eindregel "Alle tests geslaagd" (elke test met "fouten: geen") | gehaald |
| F2 | 2026-11-06 15:24 | 2. `.\tools\bouw_installer.ps1 -Toets` eindigt met `fouten: geen` | uitvoer: "geïnstalleerde exe is de gebouwde exe van 2.12.1", "versie in Windows-instellingen is 2.12.1", eindregel "fouten: geen" | gehaald |
| F2 | 2026-11-06 15:24 | 3. Exe, zip en setup staan in `dist` | `dist\Lutrea-Profielviewer-2.12.1.exe` (13.493.248 bytes), `_compleet_2.12.1.zip` (6.509.759), `-2.12.1-setup.exe` (6.107.339) | gehaald |
| F2 | 2026-11-06 15:24 | 4. Marco bevestigt dat LoZ.laz met een beperkte keuze te openen en te profileren is | nog niet beoordeeld: wacht op Marco | niet toetsbaar |
| F2 | 2026-11-06 15:25 | 4. Marco bevestigt dat LoZ.laz met een beperkte keuze te openen en te profileren is | Marco van Steenbrugge, 2026-11-06 15:25, via chat: "ja het werkt bij het inladen.. heb nog neit goed kunnen testen of ik de onder en bovenkant kan zien tegelijk". Openen bevestigd, profileren nog niet | niet toetsbaar |
| F2 | 2026-11-07 00:55 | 4. Marco bevestigt dat LoZ.laz met een beperkte keuze te openen en te profileren is | Marco van Steenbrugge, 2026-11-07 00:49, via chat: "Ja, het klopt" (op de vraag "Kloppen profiel 1 en 2 en het RWS-blad bij de Bergstraat in 2.14.0?") en daarna "heb alles kunnen testen". LoZ.laz is daarbij met een klassenkeuze geopend en geprofileerd (Bergstraat, profielen en doorrijhoogte) | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F1 | Criterium 4 "afbreken (beide routes)": de viewer-route heeft geen afbreekknop; daar is een schrijffout halverwege getoetst in plaats van afbreken | Afbreken bestaat alleen bij het omzetten door het programma |
| F1 | Testserver (`tests/hulp.js`): wijzigingstijd niet meer afgekapt (`mtimeMs \| 0` → `Math.floor`) en een instelbare pauze vóór het omzetten (`natief.omzetPauze`) | De afgekapte tijd liet hergebruik in de tests nooit slagen; de pauze maakt afbreken betrouwbaar te testen |
| F1 | De bestaande tests maaiveld, natieve_map, omzetten_parity, omzetten_viewer, projectmap en zoom_vakken klikken nu het klassenvenster weg (`H.klassenInlezen`) | dijk_begroeid.las heeft drie klassen, dus het venster verschijnt |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-06 14:30 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- viewer.js op d7c3d09: `tegelbronVoor` r. 1741, `omzettenDoorProgramma` r. 1711, `maakTegelSchrijver` r. 1901, `importeerNaarTegels` r. 2013, `leesTegels` r. 2050, `leesLazPunten` r. 1267
- bron-exe/omzet/tegels.go (`Schrijver.VoegToe` r. 200), bron-exe/omzet/omzet.go, bron-exe/omzet_taak.go (`omzetStart` r. 110), bron-exe/cmd/pvomzet/main.go
- `Projecten\007-Loon op zand\puntenwolk\A - LoZ\info.json` (gemaakt 2026-11-06 13:15 UTC door 2.12.0 (exe))
- LoZ.laz-header en een steekproef van 3 mln punten, gelezen met laspy op 2026-11-06

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
