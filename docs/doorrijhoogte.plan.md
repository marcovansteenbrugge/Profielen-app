---
plan: doorrijhoogte
titel: Doorrijhoogte: vrije hoogte onder een dak of kunstwerk toetsen
versie: 1
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ▶ · F2 ▶ · F3 ▶           # berekend door de skill
opgesteld: 2026-11-06
opgesteld_door: agent, Claude Opus 5.5 (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: doorrijhoogte.beslis.md
basis_commit: 1ebccb6
vervangt: -
samenvatting: Een eigen toets "Doorrijhoogte" naast Doorvaart en Snoeien. De as ligt op de weg, een box (breedte × hoogte) staat op het wegdek, en de tool laat zien hoeveel ruimte er tussen de box en het dak zit. Bodem en dak haalt de tool zelf uit één puntenwolk.
trefwoorden: [doorrijhoogte, vrije hoogte, doorrijprofiel, kunstwerk, viaduct, overkapping, onderdoorgang, box, wegdek, dak, toets, loon op zand, 2.13.0]
---

# Plan: Doorrijhoogte: vrije hoogte onder een dak of kunstwerk toetsen

## 1. In het kort
1. Onder TOETS komt een eigen knop **Doorrijhoogte…**, naast Doorvaart en Snoeien. De doorvaart blijft zoals hij is.
2. De as ligt op de weg. Op het wegdek staat een box van breedte B × hoogte H (geen schip, gewoon een rechthoek), die het wegdek volgt.
3. De tool rekent per station uit hoeveel ruimte er tussen de bovenkant van de box en het dak zit (speling), en waar die het kleinst is.
4. Bodem en dak haalt de tool zelf uit één puntenwolk: de onderste laag is de weg, wat erboven zit is het dak. Een apart bestand voor het dak mag ook.
5. Je kiest een voorwaarde uit een lijst (bijvoorbeeld 4,20 m weg, 2,50 m fietspad) of vult eigen maten in.

## 2. Aanleiding en doel
Bij LoZ.laz (Loon op Zand, Bergstraat) loopt een weg onder een dak of kunstwerk door. De vraag is de doorrijhoogte. De bestaande Doorvaart-toets past niet goed:
- de box staat op één vaste "toetswaterstand" in plaats van op het wegdek;
- er staat een schip in het profiel ("nu zit er een boot in mijn wegprofiel", Marco, 2026-11-06);
- het dak moet als apart bestand worden ingelezen. Bij LoZ.laz zitten bodem en dak in één bestand; dat is nu met de hand gesplitst (bodem onder 12,5 m NAP, dak erboven).

Geslaagd als: Marco op LoZ.laz, met alleen het originele bestand, de doorrijhoogte onder het dak kan toetsen, met de kleinste vrije hoogte, de speling ten opzichte van de gekozen voorwaarde, de plek waar die zit, en een PDF-blad.

## 3. Onderzoek en bevindingen
- **Doorvaart** (`viewer.js` r. 5540–6355, `voerDoorvaartUit` r. 5950): box van B × H boven toetspeil `k.P` (één getal). Onderzijde brug uit een apart bestand (`laadBrugBestand` r. 6199, leest het hele bestand zonder vakken). Ruisfilter in 3D, kritiek punt, beschikbare breedte, dekkingskaart (`maakDekking` r. 5672). Schip tekenen is instelbaar (`DV_STANDAARD.weergave`).
- **Snoeicheck** (r. 6950 e.v., `voerSnoeiUit` r. 7128): de beste basis. Punten uit puntenwolk A in een strook langs de as, in 3D bewaard ("uit puntenwolk A", ook uit de vakken). Een eigen grondraster uit de laagste punten per vak (`maakGrondRaster`), dus het maakt niet uit of A met bovenkant of onderkant is ingelezen. De box (B × H, verschuiving) volgt het pad langs de as (`zcOp`). Ruisfilter in 3D, snoeipunten, PDF-blad en snoeikaart bestaan al.
- **Verschil met de snoeicheck**: de snoeicheck slaat klasse-2-punten over als grond (r. 7150). Bij LoZ.laz is de bovenkant van het dak deels klasse 2: een kwart van de klasse-2-punten ligt op 15–16 m NAP (gemeten uit de vakken, 2026-11-06). De doorrijhoogte mag dus niet op klasse vertrouwen, maar moet op hoogte boven de weg werken. De snoeicheck kijkt ook alleen naar punten ín het profiel; voor de doorrijhoogte is ook de ruimte erboven nodig (speling).
- **Weg onder het dak deels niet gemeten**: bij LoZ.laz heeft maar 26 % van de vakjes van 1 × 1 m met dak (> 14,5 m) ook bodempunten (< 11 m). Waar onder het dak geen weg gemeten is, geeft "laagste punt per vak" het dak als grond. Die vakken moeten herkend worden (veel hoger dan de weg ervoor en erna) en overbrugd uit de weg eromheen, en op de dekkingskaart als niet gemeten staan.
- **Hoogtes LoZ.laz** (uit de vakken): weg 10,3–10,8 m NAP, dak 15–16 m NAP, daartussen wanden. De klassenkeuze (2.12.1) werkt hier gewoon mee.

## 4. Niet in scope
- Doorvaart wijzigen: die blijft zoals hij is (wens Marco: "hou de doorvaart ook... want die vraag komt nog").
- Een profiel van vrije ruimte met afgeschuinde hoeken of een voertuigcontour: eerst een rechthoek ("een vierkant zou nu voldoende zijn"). Kan later.
- Spoor (profiel van vrije ruimte ProRail): andere normen en vormen.
- DXF- en IFC-uitvoer van de toets: eerst het PDF-blad, zoals bij de snoeicheck.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Eigen kopje "Doorrijhoogte", doorvaart blijft | Marco, chat 2026-11-06 |
| As op de bodem, box op de weg met breedte en hoogte, laten zien hoever we onder het dak zitten | Marco, chat 2026-11-06 |
| Een rechthoek is genoeg, geen schip | Marco, chat 2026-11-06 |
| Andere voorwaarden kunnen kiezen om te testen | Marco, chat 2026-11-06 |
| Bodem en dak uit één bestand ("het zou mooi zijn als de tool het zou kunnen doen") | Marco, chat 2026-11-06 |
| Altijd Nederlands; RD/NAP; geen build-stap | CLAUDE.md |
| Nieuw hoofdstuk = minorversie | CLAUDE.md |

## 6. Ontwerp en besluiten (technisch)
**Stroom.**
1. Knop **Doorrijhoogte…** onder TOETS (naast `doorvaartKnop` en `snoeiKnop`, `index.html` r. 498) opent een eigen venster: voorwaarde (lijst), breedte B, hoogte H, marge, verschuiving, stations van/tot (leeg = waar een dak boven de weg ligt, plus marge), knop **Controleren**.
2. Punten: zoals de snoeicheck uit puntenwolk A (vakken of werkwolk) in een strook langs de as, of het dak uit een apart bestand (B2).
3. Weg: eigen grondraster (laagste laag per vak). Vakken die meer dan ± 1,5 m boven de weg ervoor en erna liggen (alleen dak geraakt) vallen weg en worden lineair overbrugd langs de as; ze tellen op de dekkingskaart als niet gemeten.
4. Dak: alle punten die meer dan `minH` (standaard 0,5 m) boven de weg liggen, binnen de boxbreedte plus een rand. Ruisfilter in 3D zoals bij doorvaart en snoeicheck.
5. Onderkant van de box per station: zie B5. Per station: vrije hoogte = laagste dakpunt boven de box-onderkant binnen de breedte; speling = vrije hoogte − H. Oordeel: voldoet als de kleinste speling ≥ 0 (en ≥ marge voor "ruim").
6. Tekenen: box in dwars- en lengteprofiel (onderkant volgt de weg), met de vrije hoogte en de speling als maat op het kritieke station; in het bovenaanzicht de footprint van het dak en het kritieke punt. Geen schip.
7. Uitvoer: PDF-blad "Doorrijhoogte" met box, kritieke doorsnede, lengteprofiel met vrije hoogte, tabel per voorwaarde, en de dekkingskaart. Instellingen gaan mee in het project.

**Verdieping per besluit:**

- **B1 Eigen onderdeel** (nodig vóór F0). Voorstel: eigen knop en venster, met een eigen rekenstuk dat de snoeicheck hergebruikt (punten uit A, grondraster, ruisfilter) en de dekkingskaart van de doorvaart. Alternatief: een modus "weg" binnen de doorvaart. Dat is minder code, maar het venster blijft vol watertermen en het schip.
- **B2 Bodem en dak uit één wolk** (nodig vóór F0). Voorstel: standaard uit puntenwolk A (onderste laag = weg, wat er meer dan 0,5 m boven ligt = dak), met de optie "dak uit ander bestand" (zoals de doorvaart). Alternatief: altijd twee bestanden. Eenvoudiger, maar dan blijft het splitsen in ReCap of met de hand nodig.
- **B3 Voorwaarden** (nodig vóór F1). Voorstel: een lijst met hoogte en breedte, aan te vullen: hoofdweg/vrachtverkeer 4,50 m; gewone weg 4,20 m; bus 4,00 m; hulpdiensten 4,00 m × 3,50 m; fietspad 2,50 m; voetpad 2,30 m; eigen maten. Plus een marge (standaard 0,10 m). De waarden zijn een voorstel uit de gangbare praktijk, geen norm; Marco stelt ze vast. Alternatief: alleen eigen maten, zonder lijst.
- **B4 Meerdere voorwaarden tegelijk** (nodig vóór F1). Voorstel: ja, tot vier boxen tegelijk (bijv. rijbaan 4,20 m en fietspad 2,50 m, elk met eigen breedte en verschuiving), elk met eigen oordeel, in één controle en op één PDF-blad. Alternatief: één box per keer; snel wisselen met de lijst.
- **B5 Onderkant van de box** (nodig vóór F0). Voorstel: per station het hoogste punt van de weg binnen de boxbreedte (veilige kant bij dwarshelling en bolling). Alternatief: de weg op het midden van de box (de as); dat geeft bij dwarshelling een paar centimeter meer ruimte dan er aan de hoge kant is.
- **B6 Versie** (nodig vóór F3). Voorstel: 2.13.0, na 2.12.1. Alternatief: 2.12.2.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Knop en venster "Doorrijhoogte", rekenstuk (weg uit de onderste laag met overbrugde gaten, dak erboven, vrije hoogte en speling per station, kritiek punt), box op de weg in dwars- en lengteprofiel, geen schip | 1. Nieuwe test `tests/doorrijhoogte.test.js` met een gemaakte wolk (weg met dwarshelling en een dak op bekende hoogte, deels zonder weg eronder): gemeten vrije hoogte wijkt < 2 cm af van de bekende, het kritieke station klopt. 2. Bij een dak lager dan H: oordeel "voldoet niet" met de juiste tekortkoming. 3. De vakken onder het dak zonder weg staan als niet gemeten op de dekkingskaart en tellen niet als weg. 4. Schermafdruk van venster en dwarsprofiel op LoZ.laz, alleen met het originele bestand. 5. De bestaande doorvaarttest blijft groen. | B1, B2, B5 | L | Opus 5.5, medium | `F0:` |
| F1 | ▶ vrijgegeven | Voorwaarden-lijst, eigen maten, marge, meerdere boxen tegelijk | 1. Test: kiezen uit de lijst zet B en H; eigen maten werken. 2. Test met twee boxen (4,20 × 3,50 en 2,50 × 2,00 met verschuiving): elk een eigen oordeel en kritiek punt. 3. Instellingen komen terug na opslaan en heropenen van het project. | F0, B3, B4 | M | Opus 5.5, medium | `F1:` |
| F2 | ▶ vrijgegeven, na F1 | PDF-blad "Doorrijhoogte" met box, kritieke doorsnede, lengteprofiel met vrije hoogte, tabel per voorwaarde en dekkingskaart | 1. Test maakt de PDF; het blad staat erin met de juiste kleinste vrije hoogte en speling. 2. Render van het blad op LoZ.laz bekeken (schermafdruk). | F1 | M | Opus 5.5, medium | `F2:` |
| F3 | ▶ vrijgegeven, na F2 | Opleveren: versie, LEESMIJ, handleiding, alle tests, bouwen, installatietoets, commit en tag; Marco controleert op LoZ.laz | 1. `node run_alle.js` eindigt met `fouten: geen`. 2. `.\tools\bouw_installer.ps1 -Toets` eindigt met `fouten: geen`. 3. Exe, zip en setup in `dist`. 4. Marco bevestigt dat de doorrijhoogte onder het dak bij LoZ.laz klopt. | F2, B6 | S | Opus 5.5, medium | `F3:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** n.v.t.: geen persoonsgegevens; alles blijft lokaal.
**Beveiliging.** n.v.t.: geen nieuwe routes in de exe, geen externe verbindingen.
**Gebruikers en handleiding.** Nieuw kopje Doorrijhoogte onder TOETS, nieuwe sectie in de handleiding (naast Doorvaart en Snoeicheck), nieuw PDF-blad.
**Beheer en configuratie.** Instellingen in het project en in localStorage (`ptsviewer-doorrij*`), zoals bij doorvaart en snoeicheck.
**Releasenotes (kernpunten).** Nieuwe toets Doorrijhoogte: box op het wegdek, vrije hoogte en speling onder een dak of kunstwerk, bodem en dak uit één puntenwolk, voorwaarden uit een lijst of eigen maten, PDF-blad.

## 9. Risico's en terugweg
- Onder een dak zonder gemeten weg kan de weg verkeerd geschat worden. Overbruggen alleen over beperkte lengte (standaard tot 20 m), daarbuiten "niet gemeten"; altijd zichtbaar op de dekkingskaart.
- Wanden of kolommen naast de weg binnen de boxbreedte tellen als obstakel. Dat is juist (ze beperken de doorrijbreedte), maar kan verrassen; het kritieke punt wordt getoond.
- Bij een zeer dichte wolk (LoZ.laz) kan het lezen van de strook zwaar zijn. Alleen de vakken langs de as worden gelezen, uitgedund in 3D zoals bij de snoeicheck.
- Terugweg: het is een los onderdeel; de knop weghalen of de commits van de fase terugzetten raakt de rest niet.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Welke normen of eisen houden jullie of de gemeente aan voor de doorrijhoogte (CROW, RVV, eigen eisen)? | De lijst uit B3 als voorstel, met eigen maten erbij |
| Moet de speling ook als lijn in het lengteprofiel (vrije hoogte langs de hele as)? | Ja, als stippellijn van de onderkant van het dak |
| In het dwarsprofiel van 2.12.1 waren op station 75 geen grijze punten te zien, terwijl de statusregel ze meldde. Zie je ze bij andere stations wel? | Onderzoeken bij de controle van 2.12.1, los van dit plan |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-11-06 21:18 | 2026-11-06 21:54 | Marco van Steenbrugge | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 136 / 72.561 | b38991d | transcript (Claude Code 2.1.317) |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-11-06 21:54 | 1. Test met gemaakte wolk: vrije hoogte < 2 cm afwijking, kritiek station klopt | `node doorrijhoogte.test.js`: "vrijMin 3.353, verwacht 3.356" (3 mm), "station 60.00" (verwacht st. 60, hoogste weg onder het dak); "fouten: geen" | gehaald |
| F0 | 2026-11-06 21:54 | 2. Dak lager dan H: "voldoet niet" met de juiste tekortkoming | zelfde test: H 4,20 → ok=false, speling −0,847 (verwacht −0,844); venster toont "VOLDOET NIET"; H 3,00 → ok=true, speling +0,353 | gehaald |
| F0 | 2026-11-06 21:54 | 3. Vakken onder het dak zonder weg als niet gemeten op de dekkingskaart, tellen niet als weg | zelfde test: weg op st. 50 overbrugd 11,002 (verwacht 11,000, niet het dak op 14,60); "niet gemeten: 40 m²" (verwacht ± 35 m²), 1 plek; losse vogel als ruis herkend | gehaald |
| F0 | 2026-11-06 21:54 | 4. Schermafdruk van venster en dwarsprofiel op LoZ.laz, alleen met het originele bestand | `tests/uit/doorrijhoogte_LoZ.png` en `_venster.png`: LoZ.laz zonder projectmap, klassen 2/6/11/66/67, strook 3.976.823 punten (vakjes 4 cm), box 3,50 × 4,20 op de weg. De as is door mij afgeleid en loopt over het plein naast het dak (paal en auto gevonden), niet onder het dak; de controle onder het dak volgt met Marco's as in F3 | gehaald |
| F0 | 2026-11-06 21:54 | 5. De bestaande doorvaarttest blijft groen | `node doorvaart.test.js`: "fouten: geen"; ook stationering_snoei, zoom_vakken, projectmap, natieve_map, profielpunten "fouten: geen" | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F0 | Reparatie in `maakBegroeiingSink` en `maakBrugSink`: het 3D-uitdunvakje groeide bij elke portie punten (bij LoZ.laz tot 10 km); nu eerst uitdunnen met het huidige vakje | Gevonden bij de proef op LoZ.laz; trof ook snoeicheck en doorvaart bij zeer dichte wolken |
| F0 | Reparatie in `leesTegels`: vakken in stukken van 32 MB lezen (Range) in plaats van in één keer | "Profielen uit alle punten mislukt: Failed to fetch" bij Marco (vakken van ± 450 MB); trof ook punten in het profiel, detailstrook en doorrijhoogte |
| F0 | Testversie `dist	est\Lutrea-Profielviewer-2.13.0-test-doorrijhoogte.exe` gebouwd op verzoek van Marco | "je mag al een test versie maken" |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-06 21:15 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- viewer.js op 1ebccb6: Doorvaart r. 5540–6355 (`voerDoorvaartUit` r. 5950, `maakDekking` r. 5672, `laadBrugBestand` r. 6199), Snoeicheck r. 6950 e.v. (`voerSnoeiUit` r. 7128)
- index.html: TOETS-knoppen r. 498–499
- `Projecten\007-Loon op zand\puntenwolk\A - LoZ\tegels`: hoogteverdeling en klassen per hoogte, gemeten 2026-11-06
- Schermafdruk van Marco (2.12.1, Bergstraat, station 75), 2026-11-06
- Chat met Marco, 2026-11-06 (wensen in punt 5)

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
