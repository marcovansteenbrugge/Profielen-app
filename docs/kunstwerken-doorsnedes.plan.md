---
plan: kunstwerken-doorsnedes
titel: Meerdere kunstwerken, met voor- en achterzijde in het lengteprofiel
versie: 1
status: ter-akkoord        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ⏳ · F1 ⏳ · F2 ⏳           # berekend door de skill
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
4. In het **lengteprofiel** staat elke doorsnede als verticale lijn met een label ("KW1 voor · 4,803"). Je kunt die lijn **verschuiven** door hem te slepen; daarna wordt die doorsnede opnieuw gemeten.
5. De RWS-bladen in de PDF krijgen één blad per doorsnede (bij twee kunstwerken dus vier).

## 2. Aanleiding en doel
Marco (chat, 2026-11-09): "ik wil in het lengteprofiel de dwarsdoorsnedes zien... want de hoogte moeten we testen op: Voorkant kunstwerk 1, Achterzijde kunstwerk 1, Voorkant kunstwerk 2, Achterzijde kunstwerk 2". Bij de vraag hoorde Bijlage C van de RWS-specificatie (voorbeeld kunstwerk: hoogtes op de kant verharding, de strepen en de doorrijbreedte). "In ons geval: kantasfalt links.. midden en kantasfalt rechts". Antwoorden op de vragen: midden is meestal de as van de weg; het zijn twee kunstwerken achter elkaar langs dezelfde as en in dezelfde puntenwolk; voor- en achterzijde graag zelf zoeken, en "misschien kan je het zo maken.. dat ik de doorsnede in het lengteprofiel kan verschuiven".

Nu (2.14.0) kent het doorrijprofiel één kunstwerk met twee doorsnedes (profiel 1 en 2), op het eerste en laatste station waar een dak boven de eerste box ligt. Bij twee kunstwerken achter elkaar liggen profiel 1 en 2 dus aan de voorkant van KW1 en de achterzijde van KW2; de achterzijde van KW1 en de voorkant van KW2 ontbreken. De doorsnedes zijn in het lengteprofiel niet te zien.

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
- **B5 Versie** (nodig vóór F2). Voorstel: 2.16.0 (nieuw hoofdstuk). Alternatief: 2.15.1.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ⏳ wacht op B1, B2, B4 | Kunstwerken vinden, twee doorsnedes per kunstwerk, meetpunt as, tabel in het venster, een RWS-blad per doorsnede, oude projecten omzetten; testwolk met twee kunstwerken | 1. Test met twee daken: `__pvTest.rws()` geeft vier doorsnedes (KW1 voor/achter, KW2 voor/achter) op de verwachte stations (± 0,3 m). 2. Elke doorsnede heeft meetpunten kant links, as (offset 0) en kant rechts met een doorrijhoogte. 3. De PDF heeft vier RWS-bladen. 4. Een project met `p1`/`p2` opent zonder fout met die stations. 5. `node run_alle.js` geheel groen. | B1, B2, B4 | M | Opus 5.5, medium | `F0:` |
| F1 | ⏳ wacht op B3 | Lijnen en labels in het lengteprofiel, slepen aan het label, opnieuw meten, dubbelklik = automatisch | 1. Het lengteprofiel toont per doorsnede een lijn met label (zichtbaar op een screenshot). 2. In de test: slepen van het label van KW1 achter verschuift het station en geeft nieuwe hoogtes. 3. Pannen naast een label werkt nog. 4. Het verschoven station staat na opslaan en openen nog op dezelfde plek. 5. `node run_alle.js` geheel groen. | F0, B3 | M | Opus 5.5, medium | `F1:` |
| F2 | ⏳ wacht op B5 | Opleveren: versie, LEESMIJ, handleiding, tests, bouwen, installatietoets, commit; Marco controleert | 1. `node run_alle.js` geheel groen. 2. `.\tools\bouw_installer.ps1 -Toets` eindigt met `fouten: geen`. 3. Exe, zip en setup in `dist`. 4. Marco bevestigt dat het op een echte scan met twee kunstwerken klopt. | F1, B5 | S | Opus 5.5, medium | `F2:` |

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

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-09 08:55 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- viewer.js op 0945306: `voerDoorrijUit`, `rwsStations`, `rwsMeten`, `rwsBerekenProfiel`, `rwsBreedteLangs`, `tekenLangs`, de pointer-afhandeling van `svgLangs`.
- index.html op 0945306: venster `drDialoog` (velden `drP1`, `drP2`, `drRwsObject`).
- docs/doorrijprofielen-rws.plan.md (2.14.0).
- RWS Productspecificaties Doorrijprofielen, 1 juli 2022, Bijlage C "Voorbeeld kunstwerk" (afbeelding in de chat, 2026-11-09).

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
