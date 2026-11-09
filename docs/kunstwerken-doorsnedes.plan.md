---
plan: kunstwerken-doorsnedes
titel: Meerdere kunstwerken, met voor- en achterzijde in het lengteprofiel
versie: 2
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 ▶ · F3 ▶ · F4 ⏳           # berekend door de skill
opgesteld: 2026-11-09
opgesteld_door: agent, Claude Opus 5.5 (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: kunstwerken-doorsnedes.beslis.md
basis_commit: 0945306
vervangt: -
samenvatting: Het doorrijprofiel (RWS) kent meerdere kunstwerken achter elkaar langs één as. Per kunstwerk komt er een doorsnede aan de voorkant en een aan de achterzijde, met hoogtes op kant asfalt links, de as en kant asfalt rechts. De doorsnedes staan als lijnen in het lengteprofiel en zijn daar te verschuiven.
trefwoorden: [doorrijhoogte, doorrijprofiel, RWS, kunstwerk, viaduct, voorkant, achterzijde, doorsnede, lengteprofiel, verschuiven, kant asfalt, as, 2.16.0]
---

# Plan: Meerdere kunstwerken, met voor- en achterzijde in het lengteprofiel

## 1. In het kort
1. De Doorrijhoogte vindt zelf de kunstwerken langs de as: elk stuk met een dak erboven is een kunstwerk (KW1, KW2, …).
2. Per kunstwerk komen er twee doorsnedes: aan de **voorkant** en aan de **achterzijde**, net binnen de rand van het dak (zoals nu profiel 1 en 2).
3. In elke doorsnede wordt de doorrijhoogte gemeten op drie vaste punten: **kant asfalt links**, **de as** en **kant asfalt rechts**. Eigen aangeklikte meetpunten (strepen e.d.) blijven mogelijk.
4. In het **lengteprofiel** staat elke doorsnede als verticale lijn met een label ("KW1 voor") en een maatlijn van de weg tot de onderkant van het kunstwerk met de doorrijhoogte op de as ("4.803"), zoals de pijlen in Bijlage C. Je kunt die lijn **verschuiven** door hem te slepen; daarna wordt die doorsnede opnieuw gemeten.
5. De RWS-bladen in de PDF krijgen één blad per doorsnede (bij twee kunstwerken dus vier).
6. (versie 2) In de Doorrijhoogte zijn de dwarsprofielen alleen deze doorsnedes, niet meer om de zoveel meter.
7. (versie 2) Ligt het kunstwerk schuin over de as, dan draaien de doorsnedes mee: ze lopen evenwijdig aan de rand van het kunstwerk.

## 2. Aanleiding en doel
Marco (chat, 2026-11-09): "ik wil in het lengteprofiel de dwarsdoorsnedes zien... want de hoogte moeten we testen op: Voorkant kunstwerk 1, Achterzijde kunstwerk 1, Voorkant kunstwerk 2, Achterzijde kunstwerk 2". Bij de vraag hoorde Bijlage C van de RWS-specificatie (voorbeeld kunstwerk: hoogtes op de kant verharding, de strepen en de doorrijbreedte). "In ons geval: kantasfalt links.. midden en kantasfalt rechts". Antwoorden op de vragen: midden is meestal de as van de weg; het zijn twee kunstwerken achter elkaar langs dezelfde as en in dezelfde puntenwolk; voor- en achterzijde graag zelf zoeken, en "misschien kan je het zo maken.. dat ik de doorsnede in het lengteprofiel kan verschuiven".

Nu (2.14.0) kent het doorrijprofiel één kunstwerk met twee doorsnedes (profiel 1 en 2), op het eerste en laatste station waar een dak boven de eerste box ligt. Bij twee kunstwerken achter elkaar liggen profiel 1 en 2 dus aan de voorkant van KW1 en de achterzijde van KW2; de achterzijde van KW1 en de voorkant van KW2 ontbreken. De doorsnedes zijn in het lengteprofiel niet te zien.

Aanvulling (chat, 2026-11-09, na de vrijgave van F0 en F1): "ik zie in de BGT de kantasfalt zitten... kunnen we die in de doorsnede laten zien?? en dan wil ik graag de 3 maten zien... kantasfalt 2x en op de as" (dat is F0); "dus niet profielen elke vaste afstand ... dus maar 4 profielen heb ik nu nodig"; "wat ik zie is dat het kunstwerk schuin over de as gaat... en zou de profielen dus iets willen draaien zodat ze haaks op het kunstwerk zitten".

Geslaagd als: bij een as onder twee viaducten door staan in het lengteprofiel vier lijnen (KW1 voor, KW1 achter, KW2 voor, KW2 achter) met hun doorrijhoogte; elke lijn is te verschuiven; per doorsnede zijn de hoogtes op kant asfalt links, as en kant asfalt rechts bekend, en de PDF heeft vier RWS-bladen.

## 3. Onderzoek en bevindingen
Uit de code (op 0945306):
- **Dak per box:** `voerDoorrijUit` (viewer.js r. ± 7995–8035) houdt per box alleen `dakVan` en `dakTot` bij: het kleinste en grootste station met een dakpunt boven de box. Tussen twee kunstwerken gaat die informatie verloren. Wel is er `vrijLangs` per box (vrije hoogte per stationvak van `BS` m, `NaN` waar geen dak is): daaruit zijn de stukken met dak (kunstwerken) af te leiden.
- **Doorsnedes nu:** `rwsStations(r)` (r. 8387) geeft `p1`, `p2` uit `doorrij.rws.p1/p2` of automatisch `dakVan + 0,2` en `dakTot − 0,2`. `rwsMeten()` (r. 8485) leest de ruwe punten onder die twee lijnen (alleen de vakken eronder bij een tegelbron) en maakt `drRws.profielen` (`nr`, `station`, `punten {o, z}`).
- **Meetpunten:** `rwsBerekenProfiel` (r. 8471) = kant verharding uit de BGT (`rwsKantVerharding`, ± 5 cm binnen de rand van het weg-vak) + eigen meetpunten (`doorrij.rws.meetpunten`, offset en soort, gelden voor alle profielen). `rwsMeet` (r. 8410) geeft weg, dak, h, aantallen en spreiding binnen ± 0,10 m. Een meetpunt op de as (offset 0) bestaat nog niet.
- **Doorrijbreedte:** `rwsBreedte` per profiel en `rwsBreedteLangs` (30 m voor tot 30 m na het dak, op `dakVan`/`dakTot`).
- **Lengteprofiel:** `tekenLangs()` (r. 12510) tekent de SVG; `svgLangs` heeft pointerdown/move/up voor pannen (r. 15288–15302) en wheel voor zoomen. Er is geen sleep-interactie op onderdelen in het lengteprofiel; die moet vóór het pannen gaan (eigen handvat, pannen alleen als niet op een handvat geklikt).
- **Dialoog:** index.html r. 861 heeft de velden `drP1` en `drP2` ("Profiel 1 st. … Profiel 2 st. …") en r. 867 één veld Object. `RWS_STANDAARD` (r. 8361) bewaart `p1`, `p2`, `meetpunten`, `weg`, `object`, … in het project (`doorrij.rws`).
- **PDF:** de RWS-bladen komen per `drRws.profielen`-item (zie `pdfOnderdelen` r. ± 12825 en de bladopbouw); meer profielen geeft vanzelf meer bladen, het tekstvak heeft één Object.
- **Dwarsprofielen:** `dwarsStations` (de stations van de gewone dwarsprofielen, om de "interval" meter) bepalen ◀ ▶ in het scherm en de dwarsprofielbladen in de PDF; `berekenDwarsprofiel(station)` maakt altijd een lijn haaks op de as (via `puntOpStationOffset`). Een schuine doorsnede past daar niet in: die heeft per punt een ander station.
- **Schuine lijnen lezen:** `rwsLeesLijnen` werkt al met een lijn van punt a in richting (ux, uy) in RD; een andere richting is daar alleen een andere eenheidsvector. De weg onder de lijn (`r.wegOp(station, offset)`) vraagt per punt het station en de offset, die uit de RD-coördinaat te halen zijn (`stationOffsetVan` of de projectie op de as).
- **Tests:** `tests/doorrijprofiel_rws.test.js` gebruikt `__pvTest.rws()` (nr, station, meetpunten) en de testwolk met één viaduct. Voor twee kunstwerken is een testwolk nodig (uitbreiden van de bestaande generator of een tweede dak in de test).

## 4. Niet in scope
- Herkennen van wegmarkering uit de punten: de strepen blijven aanklikken (staat op de wensenlijst).
- Andere voertuigcontouren dan de rechthoekige box.
- Meer dan één as tegelijk (bijvoorbeeld twee rijbanen met elk een eigen as): per as werk je zoals nu.
- Officieel RWS-verificatierapport, foto's en mappenstructuur (blijft buiten, zoals in 2.14.0).

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Doorsnedes aan voorkant en achterzijde van elk kunstwerk | chat Marco, 2026-11-09 |
| Meetpunten kant asfalt links, as, kant asfalt rechts; "midden is meestal de as van de weg" | chat Marco, 2026-11-09 |
| Twee kunstwerken achter elkaar, langs dezelfde as, in dezelfde puntenwolk | chat Marco, 2026-11-09 |
| Voor- en achterzijde zelf zoeken; doorsnede in het lengteprofiel verschuiven | chat Marco, 2026-11-09 |
| RWS Productspecificaties Doorrijprofielen (1 juli 2022), Bijlage C als voorbeeld | aangeleverd door Marco, 2026-11-09 |
| Bestaande projecten met profiel 1 en 2 blijven werken | CLAUDE.md (volledige, werkende opleveringen) |
| Nederlands, geen build-stap, `window.__pvTest` blijft | CLAUDE.md |

## 6. Ontwerp en besluiten (technisch)
**Kunstwerken vinden.** Na `voerDoorrijUit` worden uit `vrijLangs` van de eerste box de aaneengesloten stukken met dak bepaald. Twee stukken met minder dan `KW_GAT` m (voorstel 5 m) zonder dak ertussen horen bij hetzelfde kunstwerk (een naad of een stuk zonder punten). Elk stuk heeft `van`, `tot` (het eerste en laatste dakpunt, zoals nu `dakVan`/`dakTot` maar per stuk). Stukken korter dan 1 m (een bord, een losse tak) tellen niet. Resultaat: `r.kunstwerken = [{ nr, van, tot }]`.

**Doorsnedes.** Per kunstwerk twee: voorkant op `van + 0,2` en achterzijde op `tot − 0,2` ("voor" = de kant met het laagste station, in de richting van oplopend station). Bewaard in het project als `doorrij.rws.doorsnedes = [{ kw, kant: 'voor'|'achter', station|null }]`: `null` = automatisch, een getal = verschoven of ingevuld. Oude projecten met `p1`/`p2` worden bij openen omgezet naar KW1 voor en de achterzijde van het laatste kunstwerk (zoals ze nu ook liggen).

**Meetpunten.** Per doorsnede standaard: kant asfalt links en rechts (zoals nu uit de BGT) en een nieuw meetpunt **as** op offset 0 (soort `as`, label "as"). Ontbreekt de BGT-rand, dan blijft de regel staan met "geen kant uit de BGT". Eigen meetpunten blijven zoals nu.

**Lezen.** `rwsMeten` leest de ruwe punten onder alle doorsnedes in één keer (de lijnen-lus bestaat al voor twee; dat wordt een lijst). Na het verschuiven van één doorsnede wordt alleen die opnieuw gelezen.

**Lengteprofiel.** `tekenLangs` tekent per doorsnede een verticale lijn over de hoogte van het profiel, met bovenaan een label "KW1 voor" en de laagste doorrijhoogte van die doorsnede. Het label is het handvat: pointerdown op een handvat start slepen in plaats van pannen; tijdens slepen volgt de lijn de muis (stationering op 0,1 m), met een hulplabel met het station; bij loslaten wordt het station bewaard en die doorsnede opnieuw gemeten. Dubbelklik op het handvat zet hem terug op automatisch.

**Verdieping per besluit:**

- **B1 Kunstwerken vinden** (nodig vóór F0). Voorstel: automatisch uit de stukken met dak, met `KW_GAT` = 5 m. Alternatief: zelf per kunstwerk het begin- en eindstation invullen. Automatisch werkt bij losse viaducten; bij een kunstwerk met een grote open tussenruimte (twee dekken met een lichtstraat) ziet hij twee kunstwerken: dan kan Marco de doorsnedes verschuiven, maar niet samenvoegen. Een veld "samenvoegen als het gat kleiner is dan … m" in de dialoog vangt dat op.
- **B2 Meetpunten per doorsnede** (nodig vóór F0). Voorstel: kant asfalt links, as, kant asfalt rechts standaard, en eigen meetpunten zoals nu. Alternatief: alleen deze drie, zonder eigen meetpunten. Eigen meetpunten (strepen, ophangconstructie) zijn in RWS-opdrachten nodig (Bijlage C toont ze), dus die blijven.
- **B3 Verschuiven in het lengteprofiel** (nodig vóór F1). Voorstel: slepen aan het label, daarna die ene doorsnede automatisch opnieuw meten uit de ruwe punten. Alternatief: slepen verschuift alleen de lijn; opnieuw meten pas na een klik op "Profielen meten". Automatisch meten kost bij een grote wolk een paar seconden per doorsnede (alleen de vakken eronder), maar de getallen kloppen dan altijd met de lijn.
- **B4 Naam per kunstwerk op het RWS-blad** (nodig vóór F0). Voorstel: per kunstwerk een eigen veld Object (standaard "Kunstwerk 1", "Kunstwerk 2"). Alternatief: één veld Object voor alles, met "KW1"/"KW2" erachter.
- **B5 Versie** (nodig vóór F4). Voorstel: 2.16.0 (nieuw hoofdstuk). Alternatief: 2.15.1.
- **B6 Alleen de doorsnedes als dwarsprofielen** (nodig vóór F2). Voorstel: in de tool Doorrijhoogte zijn de dwarsprofielen (◀ ▶ in het scherm, de dwarsprofielbladen in de PDF) alleen de doorsnedes van de kunstwerken, zodra die gemeten zijn; een vinkje "alleen de doorsnedes" in het paneel Dwarsprofiel, standaard aan in Doorrijhoogte. Alternatief: de gewone dwarsprofielen blijven en je zet ze zelf uit in de PDF. Technisch: `dwarsStations` wordt in die modus de lijst stations van `drRws.profielen`; het interval-veld is dan uitgeschakeld.
- **B7 Schuine doorsnedes** (nodig vóór F3). Voorstel: per kunstwerk de richting van de rand zelf bepalen uit de dakpunten (een rechte lijn door de rand aan de voorkant en aan de achterzijde, kleinste kwadraten in RD), met een veld "hoek" per kunstwerk om die bij te stellen (0° = haaks op de as). De doorsnede loopt dan evenwijdig aan de rand, door het punt op de as op dat station. Per punt op de lijn worden station en offset berekend, zodat weg, dak en de vaste meetpunten (kant asfalt uit de BGT langs de schuine lijn, de as op het snijpunt) kloppen; het blad toont de doorsnede met de afstand langs de schuine lijn en vermeldt de hoek. Alternatief: alleen een hoek die je zelf invult. Twijfel: "haaks op het kunstwerk" lezen we als evenwijdig aan de voor- en achterkant (de gevel) van het kunstwerk; dat vragen we na in het beslisdocument.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Kunstwerken vinden, twee doorsnedes per kunstwerk, meetpunt as, tabel in het venster, een RWS-blad per doorsnede, oude projecten omzetten; testwolk met twee kunstwerken | 1. Test met twee daken: `__pvTest.rws()` geeft vier doorsnedes (KW1 voor/achter, KW2 voor/achter) op de verwachte stations (± 0,3 m). 2. Elke doorsnede heeft meetpunten kant links, as (offset 0) en kant rechts met een doorrijhoogte. 3. De PDF heeft vier RWS-bladen. 4. Een project met `p1`/`p2` opent zonder fout met die stations. 5. `node run_alle.js` geheel groen. | B1, B2, B4 | M | Opus 5.5, medium | `F0:` |
| F1 | ✅ gebouwd | Lijnen en labels in het lengteprofiel, met maatvoering (maatlijn van de weg tot de onderkant van het kunstwerk op de as, met de doorrijhoogte), slepen aan het label, opnieuw meten, dubbelklik = automatisch | 1. Het lengteprofiel toont per doorsnede een lijn met label en een maatlijn met de doorrijhoogte op de as in drie decimalen (zichtbaar op een screenshot; de waarde gelijk aan die van het meetpunt as). 2. In de test: slepen van het label van KW1 achter verschuift het station en geeft nieuwe hoogtes. 3. Pannen naast een label werkt nog. 4. Het verschoven station staat na opslaan en openen nog op dezelfde plek. 5. `node run_alle.js` geheel groen. | F0, B3 | M | Opus 5.5, medium | `F1:` |
| F2 | ▶ vrijgegeven | Alleen de doorsnedes als dwarsprofielen in de tool Doorrijhoogte (scherm en PDF), vinkje in het paneel Dwarsprofiel | 1. Na "Profielen meten" gaat ◀ ▶ in de test alleen langs de vier doorsnedes. 2. De PDF heeft geen dwarsprofielbladen om de 5 m meer, wel de vier RWS-bladen. 3. Vinkje uit: de gewone dwarsprofielen komen terug. 4. `node run_alle.js` geheel groen. | F0, B6 | S | Opus 5.5, medium | `F2:` |
| F3 | ▶ vrijgegeven | Schuine doorsnedes: richting van de rand per kunstwerk uit de dakpunten, veld hoek, meten langs de schuine lijn, dwarsprofiel en RWS-blad langs die lijn, lijn in het bovenaanzicht | 1. Testwolk met een kunstwerk onder 20° schuin: de gevonden hoek is 20° ± 1°. 2. De doorsnede ligt in het bovenaanzicht evenwijdig aan de rand (screenshot). 3. De doorrijhoogte op kant asfalt links, as en kant asfalt rechts klopt op < 1 cm. 4. Een ingevulde hoek gaat voor. 5. `node run_alle.js` geheel groen. | F0, B7 | M | Opus 5.5, medium | `F3:` |
| F4 | ⏳ wacht op B5 | Opleveren: versie, LEESMIJ, handleiding, tests, bouwen, installatietoets, commit; Marco controleert | 1. `node run_alle.js` geheel groen. 2. `.\tools\bouw_installer.ps1 -Toets` eindigt met `fouten: geen`. 3. Exe, zip en setup in `dist`. 4. Marco bevestigt dat het op een echte scan met twee kunstwerken klopt. | F1, F2, F3, B5 | S | Opus 5.5, medium | `F4:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** n.v.t.: alleen meetgegevens van de puntenwolk, geen persoonsgegevens.
**Beveiliging.** n.v.t.: geen nieuwe verbindingen of bestanden buiten de projectmap.
**Gebruikers en handleiding.** De velden Profiel 1 en Profiel 2 in het venster worden een lijst met doorsnedes per kunstwerk; de handleiding (Doorrijhoogte, doorrijprofiel RWS) krijgt uitleg over kunstwerken, het meetpunt as en het slepen in het lengteprofiel.
**Beheer en configuratie.** Projectbestand: `doorrij.rws.doorsnedes` en een object per kunstwerk; oude `p1`/`p2` worden omgezet. Geen nieuwe instellingen.
**Releasenotes (kernpunten).** Meerdere kunstwerken langs één as; per kunstwerk doorsnedes aan voor- en achterzijde; meetpunt op de as; doorsnedes zichtbaar en verschuifbaar in het lengteprofiel; een RWS-blad per doorsnede.

## 9. Risico's en terugweg
- Een kunstwerk met een open tussenruimte wordt als twee gezien. Terugweg: het veld "samenvoegen als het gat kleiner is dan … m", of de doorsnedes verschuiven.
- Borden, portalen of takken boven de weg kunnen als (kort) kunstwerk worden gezien. Terugweg: stukken korter dan 1 m tellen niet; de grens is een constante die we kunnen bijstellen.
- Slepen in het lengteprofiel kan botsen met pannen. Terugweg: alleen het label is handvat; elders blijft pannen zoals nu.
- Terugdraaien: de fasen zijn losse commits; terugzetten naar 2.15.0 geeft het oude gedrag met profiel 1 en 2.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Moet de doorrijbreedte ook per kunstwerk (30 m voor tot 30 m na elk kunstwerk)? | Ja, per kunstwerk, met de kleinste per kunstwerk in de tabel |
| Moet "voor" altijd de kant met het laagste station zijn, of de kant waar het verkeer vandaan komt? | Laagste station (de rijrichting kent de viewer niet) |
| Bij meer dan twee kunstwerken: allemaal tonen? | Ja, zonder maximum, maar het venster toont ze onder elkaar |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-11-09 08:54 | 2026-11-09 09:30 | Marco van Steenbrugge ("Akkoord, bouw F0–F1") | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 120 / 60.297 | onbekend (commit volgt na deze toetsing) | transcript (Claude Code 2.1.317) |
| F1 | 2026-11-09 09:42 | 2026-11-09 10:06 | Marco van Steenbrugge ("Akkoord, bouw F1–F3") | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 50 / 24.948 | onbekend (commit volgt na deze toetsing) | transcript (Claude Code 2.1.317) |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-11-09 09:30 | 1. Test met twee daken: vier doorsnedes (KW1 voor/achter, KW2 voor/achter) op de verwachte stations (± 0,3 m) | `node kunstwerken.test.js` (`tests/uit/kunstwerken_f0.log`): "1 doorsnedes: KW1 voor st. 30.2, KW1 achter st. 44.8, KW2 voor st. 60.2, KW2 achter st. 74.8" (daken st. 30–45 en 60–75), "fouten: geen" | gehaald |
| F0 | 2026-11-09 09:30 | 2. Elke doorsnede heeft meetpunten kant links, as (offset 0) en kant rechts met een doorrijhoogte | zelfde log: de test eist per doorsnede de soorten "kant,as,kant" en een hoogte binnen 1 cm van dak − weg; "2 hoogtes KW2 achter: kant -3.95: 3.804 \| as 0: 3.705 \| kant 3.95: 3.606", "fouten: geen" | gehaald |
| F0 | 2026-11-09 09:30 | 3. De PDF heeft vier RWS-bladen | zelfde log: vier regels RWSBLAD "Doorrijprofiel KW1 voor - Viaduct Noord", "KW1 achter - Viaduct Noord", "KW2 voor - Viaduct Zuid", "KW2 achter - Viaduct Zuid"; de test eist precies 4 | gehaald |
| F0 | 2026-11-09 09:30 | 4. Een project met `p1`/`p2` opent zonder fout met die stations | zelfde log: "6 doorsnedes met oude p1/p2: KW1 voor st. 31, …, KW2 achter st. 73" en na opslaan en openen p1 "31", p2 "73"; geen paginafout | gehaald |
| F0 | 2026-11-09 09:30 | 5. `node run_alle.js` geheel groen | `tests/uit/run_alle_kw_f0.log`: 26 tests "OK" (incl. kunstwerken.test.js), "Alle tests geslaagd"; na een laatste kleine wijziging (breder stationveld) doorrijhoogte, doorrijprofiel_rws en kunstwerken opnieuw: alle drie "fouten: geen" | gehaald |
| F1 | 2026-11-09 10:06 | 1. Het lengteprofiel toont per doorsnede een lijn met label en een maatlijn met de doorrijhoogte op de as in drie decimalen (screenshot; waarde gelijk aan het meetpunt as) | `node kunstwerken.test.js` (`tests/uit/kunstwerken_log.txt`): "F1 grepen: [1154,1244,1340,1430]" (vier labels), "maten: … 3.995, 3.705, 3.995, 3.705 \| as: 3.995, 3.705, 3.995, 3.705" (de test eist elke as-waarde als maat); `tests/uit/kunstwerken_lengteprofiel.png` bekeken: lijnen KW1 voor, KW1 achter, KW2 voor, KW2 achter met maatlijnen 3.995 / 3.705 | gehaald |
| F1 | 2026-11-09 10:06 | 2. Slepen van het label van KW1 achter verschuift het station en geeft nieuwe hoogtes | zelfde log: "F1 na slepen: KW1 achter st. 42 \| as 3.760" (verwacht 14,60 − 10,84 = 3,76), status "KW1 achter op st. 42,00 · doorrijhoogte op de as 3,760 m"; dubbelklik: "F1 na dubbelklik: KW1 achter st. 44.8" | gehaald |
| F1 | 2026-11-09 10:06 | 3. Pannen naast een label werkt nog | zelfde test: slepen in het lengteprofiel naast de labels laat de stations ongewijzigd (controle op naPan), geen fout; "fouten: geen" | gehaald |
| F1 | 2026-11-09 10:06 | 4. Het verschoven station staat na opslaan en openen nog op dezelfde plek | zelfde log: na slepen staat `doorsnedes['1-achter']` = 42 in de projectinstellingen; na opslaan en openen (`projectRondje`): "doorsnedes":{"2-voor":61.5} terug (zelfde opslagplek als slepen), de test eist beide | gehaald |
| F1 | 2026-11-09 10:06 | 5. `node run_alle.js` geheel groen | `tests/uit/run_alle_kw_f1.log`: 26 tests "OK", "Alle tests geslaagd" | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-09 08:52 | Eerste versie | - | Nog geen vrijgave |
| 2 | 2026-11-09 09:31 | Drie wensen van Marco toegevoegd: maatvoering in het lengteprofiel (F1), alleen de doorsnedes als dwarsprofielen (nieuwe fase F2, besluit B6) en schuine doorsnedes evenwijdig aan de rand van het kunstwerk (nieuwe fase F3, besluit B7). De oplevering heet nu F4 en hangt ook af van F2 en F3. | F1, F4 (was F2), B5 (nodig vóór F4 in plaats van F2) | F0 blijft vrijgegeven; de vrijgave van F1 vervalt (op planversie 1); F2, F3 en F4 hebben nog geen vrijgave |

## 14. Bronnen
- viewer.js op 0945306: `voerDoorrijUit`, `rwsStations`, `rwsMeten`, `rwsBerekenProfiel`, `rwsBreedteLangs`, `tekenLangs`, de pointer-afhandeling van `svgLangs`.
- index.html op 0945306: venster `drDialoog` (velden `drP1`, `drP2`, `drRwsObject`).
- docs/doorrijprofielen-rws.plan.md (2.14.0).
- RWS Productspecificaties Doorrijprofielen, 1 juli 2022, Bijlage C "Voorbeeld kunstwerk" (afbeelding in de chat, 2026-11-09).

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
