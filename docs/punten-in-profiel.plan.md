---
plan: punten-in-profiel
titel: Alle punten in het dwarsprofiel (bomen, en de weg eronder)
versie: 1
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 ✅ · F3 ▶           # berekend door de skill
opgesteld: 2026-11-06
opgesteld_door: Claude Code (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: punten-in-profiel.beslis.md
basis_commit: 6f04966
vervangt: -
samenvatting: Het dwarsprofiel toont naast de lijn alle punten in een instelbare strook (standaard ±0,5 m), zodat bomen, stammen en de weg onder de kroon zichtbaar zijn, ook in de PDF en de DXF.
trefwoorden: [dwarsprofiel, punten, puntenwolk, bomen, kroon, maaiveld, strook, pdf, dxf, 2.12.0]
---

# Plan: Alle punten in het dwarsprofiel (bomen, en de weg eronder)

## 1. In het kort
1. Het dwarsprofiel laat nu één lijn zien, die per vakje het bovenste of het onderste punt neemt. Onder een boom loopt die lijn over de kroon, en de weg eronder ontbreekt.
2. Nieuw: naast de lijn staan alle punten als stipjes, uit een strook rond de profiellijn (instelbaar, standaard ±0,5 m). Je ziet dan de vorm van de boom, de stam, en de weg die eronder doorloopt.
3. De lijn blijft, voor maten, hoogtes en de BGT. Als de punten aan staan, volgt de lijn het maaiveld onder de begroeiing (B1).
4. De punten komen ook op de PDF en in de DXF (eigen laag).
5. Het lengteprofiel blijft zoals het is (Marco, 2026-11-06).

## 2. Aanleiding en doel
Marco, 2026-11-06: "ik zie dat je er nu een surface van maak.. maar ik wil in het profiel alle punten zien.. dus ook de vorm van de bomen" en "je mist nu de weg.. die ook onder de boom doorloopt".

Het werk is geslaagd als in een dwarsprofiel door een boom boven een weg drie dingen zichtbaar zijn: de kroon en de stam als punten, het wegdek eronder als punten, en de lijn op het wegdek. Op het scherm, in de PDF en in de DXF.

## 3. Onderzoek en bevindingen
Getoetst tegen `6f04966`.
- **De geladen puntenwolk is 2,5D.** `maakUitdunner` (`viewer.js:1008`) houdt per rastercel één punt over: het bovenste bij "bovenkant", het onderste bij "onderkant" (`oppervlakModus`, `index.html:418`). Onder een kroon is dus óf de kroon óf de grond bewaard, nooit allebei. De stipjes kunnen daarom niet uit `xs/ys/zs` komen.
- **De lijn is altijd één laag.** `berekenDwarsprofielReeks` (`viewer.js:3020`) vraagt elke 25 cm `profielHoogte` op het oppervlak. Ook "Alle punten" (`maakVolleProfielenBinnen`, `viewer.js:2466`) verzamelt wel de ruwe punten per dwarsprofiel (`maakProfielVerzamelaar`, `viewer.js:2389`, met `d.o`/`d.z`), maar `maakReeks` (`viewer.js:2439`) brengt ze terug tot één hoogte per vakje (`laagHoogte`: de bovenste of onderste laag). De ruwe punten worden daarna weggegooid.
- **Er is al een 3D-strook langs de as.** De snoeicheck leest "alle punten in een strook langs de as in 3D (takken blijven staan)" (`index.html:717`, `laadBegroeiing`, `viewer.js:7122`, sink `maakBegroeiingSink`, `viewer.js:6667`), met een maaiveld uit de laagste punten (`begroeiing.grond`). `profielHoogte` (`viewer.js:6655`) gebruikt dat maaiveld al voor de profiellijn als de snoeicheck geladen is. Die weg (lezen in 3D, maaiveld uit de laagste punten) is dus beproefd.
- **De lezers** voor vakken (`leesTegels`, alleen de vakken langs de as), LAS, LAZ en PTS nemen elk een sink (`voegToe(x, y, z, r, g, b, k)`). Een nieuwe sink voor de profielpunten past daarop zonder de lezers te wijzigen.
- **Tekenen:** `tekenDwarsVoorHuidigeStation` → `tekenGrafiek` (`viewer.js:11049`), als SVG. De PDF en de DXF met bladen nemen de SVG-opnames over en wijzen lagen toe op klasse (`viewer.js:9016-9019`). De losse DXF-profielen tekenen met `lijnStukken` op `PV_PROF_MAAIVELD` (`viewer.js:9412`).
- **Schets op de testwolk** (2026-11-06, `testdata/snoei_test/bospad_scan.pts`, station 139 m, buiten de viewer gemaakt met Python): de huidige lijn (bovenkant) loopt van 5,3 naar 13,6 m NAP over twee kronen. Met alle punten binnen ±0,5 m (2.274 punten) zijn de kronen, de stam en het pad eronder zichtbaar. Een maaiveldlijn uit de onderste laag gaf eerst pieken tot 10 m, in vakjes van 10 cm waarin de grond onder de kroon niet geraakt was. Met het filter uit punt 6 verdwenen die pieken. Afbeelding: `tests/uit/schets_punten_in_profiel.png` (niet in git).
- **Aantal punten:** een drone-wolk heeft vaak 200-1000 punten/m². Bij een profiel van 20 m breed en een strook van ±0,5 m zijn dat 4.000-20.000 punten per profiel. Duizenden SVG-cirkels per profiel worden traag (zie B3).

## 4. Niet in scope
- **Punten in het lengteprofiel**: niet gevraagd (Marco, 2026-11-06).
- **De snoeicheck, de doorvaartcontrole en de IFC** blijven zoals ze zijn. Ze gebruiken de stipjes niet.
- **De keuze bovenkant/onderkant voor het bovenaanzicht en de 3D-weergave**: blijft zoals hij is.
- **Een lijn per laag** (bijvoorbeeld een aparte lijn voor de kroon): de stipjes laten de kroon al zien.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Lijn en punten samen; de lijn blijft voor maten, PDF en DXF | Marco, keuze 2026-11-06 |
| Strook instelbaar, standaard ±0,5 m | Marco, keuze 2026-11-06 |
| Ook in PDF en DXF, niet in het lengteprofiel | Marco, keuze 2026-11-06 |
| De weg onder de boom moet zichtbaar zijn | Marco, 2026-11-06 |
| Coördinaten RD, hoogtes m NAP; offset negatief = links | CLAUDE.md |
| Geen objecten per punt; typed arrays; geheugen begrensd | CLAUDE.md, Werken in viewer.js |

## 6. Ontwerp en besluiten (technisch)
- **Lezen.** Een nieuwe sink `maakProfielPuntenSink(stations, pL, pR, strook)`, naar het voorbeeld van `maakProfielVerzamelaar`. Die bewaart per dwarsprofiel de punten binnen ±`strook` als typed arrays (offset, z, klasse, en kleur als die er is). Hij draait over dezelfde lezers als "Alle punten": met een projectmap alleen de vakken langs de as, anders het hele bestand. Het lezen start met een knop "Punten in profiel" in de kop van het dwarsprofiel, met voortgang en Stop, net als "Alle punten". Het resultaat gaat in een cache per sleutel (as, stations, breedte, strook, bestand). Veranderen de as of de strook, dan is opnieuw lezen nodig, en dat meldt de knop.
- **Lijn.** Staan de punten aan, dan komt de lijn per vakje van 10 cm uit de onderste laag van die punten (`laagHoogte` met "onder", of het maaiveld uit klasse 2 als die er is). Zo loopt hij over de weg onder de boom (B1). Een vakje waarin de grond niet geraakt is (alleen kroonpunten) zou een piek geven. Daarom vervalt een vakje dat meer dan 0,5 m boven het laagste vakje binnen ±1 m ligt, en wordt het gat overbrugd. In de schets van 2026-11-06 (zie punt 3) haalde dat alle pieken weg. Alleen bij de stam bleef een kleine bult van ± 0,4 m staan.
- **Tekenen op het scherm.** De punten gaan in één `<path>` van korte streepjes of in een `<canvas>` onder de SVG (B3). Ze hebben een eigen klasse `punt`, en een aan/uit in de legenda van het profiel.
- **PDF.** Er is een eigen tekenroutine voor de punten, als kleine gevulde rondjes of vierkantjes van 0,3 mm in de PDF-schaal. Boven `maxPunten` per profiel wordt in 2D uitgedund (raster op de schaal van een stip), zodat de PDF behapbaar blijft (B3).
- **DXF.** De punten worden `POINT`-entiteiten op een nieuwe laag `PV_PROF_PUNTEN` (kleur 8, grijs), in de profielcoördinaten van het blad, zowel in de losse profielen als in de DXF met bladen. Ook hier uitgedund boven `maxPunten`.
- **Project.** De strookbreedte en de keuze aan/uit gaan mee in het project. De punten zelf niet, die worden opnieuw gelezen.

**Verdieping per besluit:**

- **B1 Welke lijn als de punten aan staan** (nodig vóór F1). Voorstel: de lijn volgt de onderste laag van de punten in de strook (het maaiveld: wegdek onder de boom, bodem onder een brug), met klasse 2 als die er is. Alternatief: de lijn volgt de bestaande keuze bovenkant/onderkant. Bij "bovenkant" loopt hij dan over de kroon en het brugdek. Een nadeel van het voorstel: bij een brug ligt de lijn op de bodem, en het brugdek zie je alleen als punten. De doorvaartcontrole heeft daarvoor eigen lijnen (`lijn-onder`/`lijn-dek`).

- **B2 Kleur van de punten** (nodig vóór F1). Voorstel: grijs, en maaiveldpunten (klasse 2, of de onderste laag) iets donkerder. Dat leest rustig, print goed, en de lijn en de BGT blijven opvallen. Alternatief: de echte kleur uit de wolk (RGB), zoals in het bovenaanzicht. Dat geeft een mooier beeld, maar het is druk op de PDF en zwart-wit printen werkt slecht. Zonder RGB in het bestand is het ook grijs.

- **B3 Hoeveel punten per profiel** (nodig vóór F1). Voorstel: op het scherm alle punten via een `<canvas>`. In PDF en DXF hooguit één punt per 2 × 2 cm in het profiel (uitgedund in 2D, op offset en hoogte), met een maximum van 20.000 per profiel. Alternatief: alles meenemen. Dat is exact, maar bij 50 profielen × 20.000 punten worden de PDF en de DXF honderden MB en traag in AutoCAD.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Punten lezen: sink `maakProfielPuntenSink`, knop "Punten in profiel" met voortgang en Stop, veld "strook ±… m" (standaard 0,5), cache | (1) nieuwe test `tests/profielpunten.test.js` op een testwolk met een "boom" (punten 3-8 m boven een vlak wegdek): per dwarsprofiel door de boom liggen er punten op wegdekhoogte én op kroonhoogte, en alleen binnen ±strook van de profiellijn; (2) dezelfde test met een projectmap (vakken) geeft dezelfde punten als met het losse bestand; (3) Stop laat geen punten achter en de profielen zijn weer zoals voorheen; (4) `node run_alle.js` overal OK | - | M | claude-opus-5-5, medium | `F0:` |
| F1 | ✅ gebouwd | Op het scherm: punten tekenen in het dwarsprofiel, lijn volgens B1, kleur volgens B2, aan/uit in de legenda; strook en aan/uit mee in het project | (1) in de test volgt de lijn bij de boom het wegdek (hoogteverschil < 5 cm), niet de kroon; (2) een screenshot van een dwarsprofiel door een boom boven een weg toont de kroon, de stam en het wegdek als punten, met de lijn op het wegdek (in `tests/uit/`, aan Marco getoond); (3) opslaan en openen van een project bewaart strook en aan/uit; (4) bladeren naar het volgende profiel duurt < 0,5 s bij 20.000 punten (gemeten in de test); (5) `node run_alle.js` overal OK | F0, B1, B2, B3 | M | claude-opus-5-5, medium | `F1:` |
| F2 | ✅ gebouwd | PDF en DXF: punten op de PDF en als POINT op laag `PV_PROF_PUNTEN` (losse profielen en DXF met bladen), uitgedund volgens B3 | (1) de PDF van de testwolk bevat de punten (render van de pagina in `tests/uit/`, aan Marco getoond); (2) de DXF bevat de laag `PV_PROF_PUNTEN` met POINT-entiteiten, en niet meer dan het maximum per profiel; (3) de DXF met bladen heeft de punten binnen het kader van elk profiel; (4) `node run_alle.js` overal OK | F1, B3 | M | claude-opus-5-5, medium | `F2:` |
| F3 | ▶ vrijgegeven | Oplevering 2.12.0: `zet_versie.py`, LEESMIJ, handleiding, bouw (exe, zip, setup), installatietoets, controle door Marco | (1) `node run_alle.js` overal OK; (2) `.\tools\bouw.ps1` levert exe, zip en setup van 2.12.0; (3) `.\tools\bouw_installer.ps1 -Toets` geeft `fouten: geen`; (4) Marco bevestigt op een eigen wolk met bomen langs een weg: punten zichtbaar, weg onder de boom zichtbaar, PDF en DXF in orde | F2 | S | claude-opus-5-5, medium | `2.12.0:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** n.v.t.: alleen de puntenwolk van de gebruiker, lokaal; er gaat niets naar buiten.
**Beveiliging.** n.v.t.: geen nieuwe toegang of netwerkverkeer.
**Gebruikers en handleiding.** Nieuwe knop "Punten in profiel" en een veld "strook" in de kop van het dwarsprofiel. Als de punten aan staan, volgt de lijn het maaiveld onder bomen. Handleiding, Stap 4 (Lengte- en dwarsprofielen) en Stap 5 (PDF) en Stap 7/DXF bijwerken.
**Beheer en configuratie.** Nieuwe instelling `ptsviewer-profielstrook` (localStorage) en twee velden in het project. Nieuwe DXF-laag `PV_PROF_PUNTEN`.
**Releasenotes (kernpunten).** 2.12.0: in het dwarsprofiel alle punten rond de profiellijn, zodat bomen en de weg eronder zichtbaar zijn; ook op de PDF en in de DXF.

## 9. Risico's en terugweg
- **Traag bij grote wolken zonder projectmap**: het hele bestand moet één keer worden doorlopen (net als "Alle punten"). Er zijn voortgang en Stop, en met een projectmap worden alleen de vakken langs de as gelezen.
- **Een zware PDF of DXF**: uitdunnen volgens B3. Een te volle PDF los je op met een smallere strook.
- **De lijn verandert van gedrag als de punten aan staan** (B1). Dat kan verrassen bij een brug. Dat staat in de LEESMIJ, en uitzetten geeft het oude gedrag.
- **Terugweg**: de knop uit = precies het gedrag van 2.11.4. De commits van F0-F3 zijn terug te draaien, en een gebruiker installeert eventueel 2.11.4 opnieuw.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Moet "Punten in profiel" vanzelf aan bij het openen van een project waarin hij aan stond? | Ja, maar het lezen start pas na een klik (het kan lang duren) |
| Maximale strook | 5 m (breder heeft weinig zin en wordt traag) |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-11-06 11:55 | 2026-11-06 12:05 | Marco van Steenbrugge ("Akkoord, bouw F0–F3") | Claude Code, claude-opus-5-5, sessie onbekend | onbekend | onbekend / onbekend | onbekend (nog niet gecommit) | `meet` niet gedraaid; zie F0 van plan installatie |
| F1 | 2026-11-06 12:05 | 2026-11-06 12:26 | Marco van Steenbrugge ("Akkoord, bouw F0–F3") | Claude Code, claude-opus-5-5, sessie onbekend | onbekend | onbekend / onbekend | onbekend (nog niet gecommit) | `meet` niet gedraaid |
| F2 | 2026-11-06 12:26 | 2026-11-06 12:51 | Marco van Steenbrugge ("Akkoord, bouw F0–F3") | Claude Code, claude-opus-5-5, sessie onbekend | onbekend | onbekend / onbekend | onbekend (nog niet gecommit) | `meet` niet gedraaid |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-11-06 12:05 | (1) testwolk met boom: per profiel wegdek- én kroonpunten, alleen binnen ±strook | `node profielpunten.test.js`: station 20, strook ±0,5 m: 3.921 punten (verwacht 3.920 binnen ±0,5 m), wegdek 2.000 (verwacht 2.000) over offset -10 tot +10, ook onder de kroon, kroon 1.051 (verwacht 1.051), stam 779; kroon en stam alleen tussen offset -4,5 en 0,5 m; alle controles OK | gehaald |
| F0 | 2026-11-06 12:05 | (2) projectmap (vakken) geeft dezelfde punten als het losse bestand | zelfde test, deel 3: "projectmap: zelfde aantal punten als het losse bestand (3921 tegen 3921)", gemiddelde hoogte < 1 cm verschil: OK | gehaald |
| F0 | 2026-11-06 12:05 | (3) Stop laat geen punten achter, profielen weer zoals voorheen | zelfde test, deel 2: status "Profielen uit alle punten: gestopt — de profielen komen weer uit de surface"; `profielPunten()` = null; `dwars()[3]` = false: OK | gehaald |
| F0 | 2026-11-06 12:05 | (4) `node run_alle.js` overal OK | 20 tests OK (incl. nieuw `profielpunten.test.js`), "Alle tests geslaagd", exit 0 | gehaald |
| F1 | 2026-11-06 12:26 | (1) bij de boom volgt de lijn het wegdek (< 5 cm), niet de kroon | `node profielpunten.test.js`: "lijn: 200 punten, grootste afwijking van het wegdek 0.0 cm, 49 onder de kroon" OK; extra: talud 1:1 bij station 35, lijn op offset 8 m = 6,97 (verwacht 7,00) OK | gehaald |
| F1 | 2026-11-06 12:26 | (2) screenshot dwarsprofiel door een boom boven een weg, aan Marco getoond | `tests/uit/profielpunten_f1_boom.png` (testwolk) en `tests/uit/profielpunten_f1_bospad.png` (bospad, station 139 m): kroon, stam en pad als punten, lijn op het pad; de bospad-afbeelding is op 2026-11-06 12:26 naar Marco gestuurd | gehaald |
| F1 | 2026-11-06 12:26 | (3) opslaan en openen van een project bewaart strook en aan/uit | zelfde test: `.pvproj` bevat `profielPunten: true, profielStrook: 0.8`; na herladen en openen via Recent: vinkje aan, strook 0,8 — OK | gehaald |
| F1 | 2026-11-06 12:26 | (4) bladeren < 0,5 s bij 20.000 punten | zelfde test: "bladeren: 20720 punten, tekenen 9 ms, met verversen 9 ms" OK | gehaald |
| F1 | 2026-11-06 12:26 | (5) `node run_alle.js` overal OK | 20 tests OK, "Alle tests geslaagd", exit 0 | gehaald |
| F2 | 2026-11-06 12:51 | (1) de PDF van de testwolk bevat de punten (render in `tests/uit/`, aan Marco getoond) | `node profielpunten.test.js` maakt `tests/uit/profielpunten.pdf` (957 kB); pagina 4 gerenderd met PyMuPDF naar `tests/uit/profielpunten_pdf_st20.png`: kroon, stam en wegdek als punten binnen het tekenvlak; om 12:51 naar Marco gestuurd | gehaald |
| F2 | 2026-11-06 12:51 | (2) DXF: laag `PV_PROF_PUNTEN` met POINT-entiteiten, niet meer dan het maximum per profiel | zelfde test: "DXF: 2439 POINT op PV_PROF_PUNTEN, 9 profielen, laag in de tabel: true" OK; uitdunnen "3921 punten → 1599 (max 20.000, vakjes 2 cm) · met max 1.000 → 796" OK | gehaald |
| F2 | 2026-11-06 12:51 | (3) DXF met bladen: punten binnen het kader van elk profiel | zelfde test: "DXF met bladen: 2439 POINT op PV_PROF_PUNTEN, 2439 binnen een kader (11 kaders)" (kader = modelvenster van de viewports) OK | gehaald |
| F2 | 2026-11-06 12:51 | (4) `node run_alle.js` overal OK | 20 tests OK, "Alle tests geslaagd", exit 0 | gehaald |
| F3 | 2026-11-06 13:01 | (1) `node run_alle.js` overal OK | op 2.12.0: "Alle tests geslaagd", exit 0 (20 tests, waaronder `profielpunten.test.js`) | gehaald |
| F3 | 2026-11-06 13:01 | (2) `.\tools\bouw.ps1` levert exe, zip en setup van 2.12.0 | "Klaar: dist\Lutrea-Profielviewer-2.12.0.exe, dist\Lutrea-Profielviewer_compleet_2.12.0.zip en dist\Lutrea-Profielviewer-2.12.0-setup.exe", go test ok, exit 0 | gehaald |
| F3 | 2026-11-06 13:01 | (3) `.\tools\bouw_installer.ps1 -Toets` geeft `fouten: geen` | alle controles OK, "versie in Windows-instellingen is 2.12.0", "fouten: geen", exit 0 | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F0 | Geen aparte knop "Punten in profiel", maar een vinkje "punten" met een veld "strook ±… m"; voortgang en Stop lopen via de bestaande knop "Alle punten" (wordt "■ Stop" tijdens het lezen) | De punten komen uit dezelfde leesronde als "Alle punten"; een tweede knop met eigen Stop zou twee keer hetzelfde doen |
| F1 | Punten getekend als één SVG-pad met stipjes per soort, niet in een `<canvas>` | Zo komen ze vanzelf mee in de PDF (die rastert de SVG) en de DXF met bladen; bladeren bij 20.720 punten kost 9 ms |
| F1 | Geen aan/uit in de legenda; de legenda toont "punten binnen ±… m" en "punten op het maaiveld", aan/uit gaat met het vinkje "punten" | Eén plek om het aan en uit te zetten |
| F1 | Maaiveldlijn: onderste laag rond het 3e laagste punt (2% bij veel punten) i.p.v. `laagHoogte`; een vakje vervalt alleen als het aan béide kanten > 0,5 m hoger ligt | In de test gaf het 10%-punt 30-40 cm te hoog bij de stam, en het eerste filter zou een talud of muur > 0,5 m gladstrijken; nu getoetst met een talud 1:1 |
| F2 | Geen aparte uitvoer voor "losse profielen": de functie `maakDxf` wordt niet aangeroepen; zowel de DXF-knop als de DXF uit het PDF-venster maken de DXF met bladen | Er is in de praktijk één DXF-route; die heeft de punten |
| F2 | Punten buiten het tekenvlak van een profiel vallen weg (op het scherm met een uitsnede, in PDF/DXF door ze niet mee te nemen) | In de eerste PDF liep een hoge kroon over de kop van het profiel heen, en 235 punten in de DXF lagen buiten het venster |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-06 11:51 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- `viewer.js` en `index.html` (stand `6f04966`): `maakUitdunner`, `berekenDwarsprofielReeks`, `maakProfielVerzamelaar`, `maakReeks`, `laagHoogte`, `maakVolleProfielenBinnen`, `laadBegroeiing`, `maakBegroeiingSink`, `profielHoogte`, `tekenDwarsVoorHuidigeStation`, DXF-laagtoewijzing
- Keuzes en woorden van Marco in de chat van 2026-11-06

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
