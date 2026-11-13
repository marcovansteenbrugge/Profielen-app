---
plan: rws-foto
titel: Foto bij het doorrijprofiel met de drie doorrijhoogtes
versie: 1
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 ⏳ · F3 ○ · F4 ⏳           # berekend door de skill
opgesteld: 2026-11-13
opgesteld_door: agent, Claude Opus 5.5 (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: rws-foto.beslis.md
basis_commit: 2266f04
vervangt: -
samenvatting: Per RWS-doorsnede een echte foto uit de meting (camerastand bekend) met de doorrijhoogtes op kant asfalt links, de as en kant asfalt rechts er exact op geprojecteerd; zonder foto's een beeld uit de puntenwolk; als blad in de opleverset en als los JPG.
trefwoorden: [doorrijhoogte, rws, foto, doorrijprofiel, kunstwerk, metashape, camerastand, projectie, 3d, opleverset, avg]
---

# Plan: Foto bij het doorrijprofiel met de drie doorrijhoogtes

## 1. In het kort
1. RWS wil het doorrijprofiel op een foto zien, met de doorrijhoogtes erin (Productspecificaties Doorrijprofielen § 2.6). Marco: "RWS zou graag een foto willen hebben, met daarin de 3 hoogtematen... kantasfalt en de as".
2. Voorstel: een **echte foto uit de meting zelf**. Bij een fotogrammetrische scan (Metashape) of een scan met panorama's is van elke foto bekend waar de camera stond en hoe hij keek. De viewer kiest per doorsnede de beste foto en projecteert de meetpunten er exact op: maatlijnen van de weg tot de onderkant van het kunstwerk, met de waarde in drie decimalen (de laagste in rood).
3. Zijn er geen foto's met camerastand, dan maakt de viewer een **beeld uit de puntenwolk** vanaf de weg, met dezelfde lijnen (terugval).
4. Personen en kentekens op echte foto's worden onherkenbaar gemaakt voordat de foto in de uitvoer komt (AVG § 1.3, besluit B6).
5. Google Street View valt af (zie B1); Cyclomedia is een later vervolg voor klanten met een licentie.

## 2. Aanleiding en doel
Nu: de Doorrijhoogte maakt per doorsnede (kunstwerk voor/achter, bij schuine kunstwerken langs de rand) een RWS-blad met het dwarsprofiel op schaal, de tabel met kant verharding links, as en kant verharding rechts, en het tekstvak. Een foto ontbreekt. In het plan `doorrijprofielen-rws` is bewust gekozen voor "dwarsprofiel op schaal, geen foto-achtig blad" en "een eigen foto toevoegen kan later" (doorrijprofielen-rws.plan.md, punt 4 en 10). De specificatie vraagt wel "foto per profiel per rijbaan met de maten" (§ 2.6, bijlagen C–J), en de verkoopplaat en de wensenlijst noemen het als gemis.

Geslaagd als: bij elke gemeten doorsnede een foto bestaat (bij voorkeur echt, anders uit de puntenwolk) met maatlijnen die op de plek van de meetpunten staan en exact dezelfde waarden tonen als de tabel van het RWS-blad, zonder herkenbare personen of kentekens, en die in de PDF en als JPG wordt opgeleverd.

## 3. Onderzoek en bevindingen
Uit de code (op 2266f04):
- `maak3DBeeldVoorPdf` (viewer.js r. 14690) maakt al een 3D-beeld met three.js voor de PDF: een eigen `WebGLRenderer` met `preserveDrawingBuffer`, wit achtergrond, het terrein uit `bouwDrieDVlak`, de as als buis. Basis voor de terugval (beeld uit de puntenwolk).
- De meetpunten per doorsnede: `rwsVasteMeetpunten(station, r, hoek)` (r. 8951) geeft kant verharding links/rechts (BGT, `rwsKantVerharding`) en de as (offset 0); `rwsMeet` (r. 8960) geeft per meetpunt `weg`, `dak`, `h`, aantallen en spreiding. Schuine doorsnedes via `opLijn(station, o, hoek)`. Elk meetpunt is daarmee een paar RD/NAP-punten (voet op de weg, kop aan het kunstwerk): precies wat geprojecteerd moet worden.
- Doorsnedes en kunstwerken: `drKunstwerken`, `rwsStations` (r. 8854, 8919); namen via `kwNaam`.
- De echte scan in de repo-voorbeelden, LoZ.laz, komt uit Agisoft Metashape (LAS 1.4, EPSG:7415; klassen-kiezen.plan.md punt 2). De foto's van die scan zitten niet in de repo.
- DXF: beelden gaan niet mee in de DXF (handleiding, "Niet in de DXF"). De foto dus ook niet.
- Specificatie (via doorrijprofielen-rws.plan.md punt 3): foto per profiel per rijbaan met de maten; drie decimalen met een punt; tekstvak; AVG § 1.3: personen en kentekens onherkenbaar in foto's en scans.

Online (13-11-2026):
- Google Maps Platform: de Service Specific Terms beperken wat je van Street View mag bewaren (alleen pano_id genoemd als te cachen); of overlay en gebruik in een PDF-oplevering mag, is niet bevestigd. Bron: cloud.google.com/maps-platform/terms/maps-service-terms (versie 2024-05-22).
- Cyclomedia levert landsdekkende panorama's, o.a. aan het Kadaster (aanbesteding panoramabeelden 2025, TenderNed 389759). Een RWS-contract voor panorama's is niet gevonden.

Uit eigen kennis, nog te toetsen met een echte export (Open vragen):
- Metashape exporteert camerastanden als tekst ("Omega Phi Kappa": naam, X, Y, Z, ω, φ, κ in het CRS van het project) en de lenskalibratie als XML (f, cx, cy, k1–k4, p1, p2, beeldgrootte). Daarmee is een punt in RD/NAP met het Brown-model op een pixel te projecteren.
- Mobiele-mappingsystemen leveren panorama's met een trajectbestand (positie en stand per opname); formaten verschillen per leverancier.

Niet vastgesteld: hoe de voorbeeldfoto's in bijlage C–J zijn opgebouwd; of RWS een beeld uit de puntenwolk accepteert; welk systeem de echte RWS-metingen levert.

## 4. Niet in scope
- Google Street View: onnauwkeurige camerastand (meters), beelden niet van de meetdag, licentie onzeker (B1).
- Cyclomedia-panorama's koppelen: later vervolgplan, voor klanten met een licentie.
- Panorama's en trajectbestanden van mobiele-mappingsystemen: pas als er een echt voorbeeld is (Open vragen); het projectiemodel is wel zo opgezet dat een bolvormige panorama later kan.
- Personen en kentekens automatisch herkennen met een AI-model (B6 alternatief): vraagt een model van tientallen MB in het programma.
- Een foto zonder camerastand met de hand uitlijnen: de lijnen zijn dan een tekening, geen meting.
- Portalen, uithouders, VRI's en TDI's; het beeld in DXF of IFC.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| De waarden op de foto zijn exact die van de tabel op het RWS-blad (zelfde `rwsMeet`, geen tweede berekening) | Eén waarheid, zoals in kunstwerken-doorsnedes B12 |
| Drie decimalen met een punt; de laagste waarde in rood | Specificatie § 2.6, doorrijprofielen-rws |
| Meetpunten: kant verharding links, as, kant verharding rechts (plus eventuele aangeklikte meetpunten) | Vraag van Marco; rwsVasteMeetpunten |
| Een foto komt alleen in de uitvoer als personen en kentekens onherkenbaar zijn | AVG § 1.3 van de specificatie |
| Alles lokaal; foto's blijven in de projectmap | Architectuur van de viewer |
| Beelden gaan niet in de DXF | Handleiding, DXF met bladen |

## 6. Ontwerp en besluiten (technisch)
**Foto's met camerastand (F0).**
1. Inlezen: in het venster Doorrijhoogte "Foto's van de meting…": een map met JPG's, het camerastandenbestand (Omega Phi Kappa-tekst) en de kalibratie (XML). Foto's worden niet gekopieerd; de projectmap bewaart de paden en per gebruikte foto een verkleinde kopie (± 2400 px) in `fotos\`.
2. Camera-model: centrale projectie met de rotatie uit ω, φ, κ (fotogrammetrische conventie), brandpuntsafstand en hoofdpunt in pixels, radiale (k1–k4) en tangentiële (p1, p2) vervorming. Een eenheidstest projecteert een bekende set punten en vergelijkt met verwachte pixels.
3. Foto kiezen per doorsnede: alle foto's waarvan de drie voetpunten en kopppunten binnen het beeld vallen (met marge), vóór de camera liggen en het kunstwerk niet van opzij bekijken; daarvan de foto die het meest recht op de doorsnede kijkt en het dichtst bij de rijbaan staat. Zichtbaarheid (dekt een pijler het meetpunt af?) via een dieptetoets tegen de puntenwolk.
4. Overlay als B3: lijnen van voet naar kop, pijlpunten, waarde in drie decimalen, de laagste rood; botsende labels schuiven.

**Beeld uit de puntenwolk (F1, terugval).** Een three.js-scène zoals `maak3DBeeldVoorPdf`, maar met een `THREE.Points` van een strook langs de as in de puntkleur van de scan, de camera op de weg volgens B2, en dezelfde overlay. Wordt gebruikt voor een doorsnede zonder geschikte foto.

**Uitvoer (F2).** Canvas ± 2400 × 1500 px als JPEG voor het PDF-blad (B4) en als bestand `uitvoer\<project>_<KW1 voor>_foto.jpg`. Op het blad staat de bron: "foto <bestandsnaam>, <datum>" of "beeld uit de puntenwolk".

**AVG (F2, B6).** Vóór een echte foto in de uitvoer komt: vlakken vervagen. Voorstel: in het fotovenster rechthoeken slepen over personen en kentekens; de viewer stelt zelf vlakken voor op plekken waar in de puntenwolk binnen het beeld voertuigen of personen staan (punten tussen 0,3 en 3 m boven de weg die geen dak en geen vangrail zijn); niets gaat de uitvoer in zolang de gebruiker niet "gecontroleerd op personen en kentekens" heeft aangevinkt.

**Verdieping per besluit:**

- **B1 Bron van de foto** (nodig vóór F0). *Voorstel:* (1) foto's uit de meting met camerastand, exact geprojecteerd; (2) zonder geschikte foto een beeld uit de puntenwolk; (3) Cyclomedia later als vervolgplan. *Bewust niet:* Google Street View (camerastand op meters, beeld niet van de meetdag, licentie onzeker), en een foto zonder camerastand met de hand uitlijnen. *Alternatief:* alleen het beeld uit de puntenwolk (kleiner, maar geen echte foto).
- **B2 Standpunt** (nodig vóór F1). Voor echte foto's kiest de viewer de foto (punt 6, stap 3) en is het standpunt dat van de camera. Voor de terugval: *voorstel* op de as, 25 m vóór de doorsnede, 1,80 m boven de weg, kijkend naar het kunstwerk; per doorsnede bij te stellen in F3. *Alternatief:* standpunt uit de 3D-weergave.
- **B3 Wat er op de foto staat** (nodig vóór F0). *Voorstel:* de maatlijnen met waarde (laagste rood), de doorsnedelijn over de weg, en een klein kader met kunstwerk, profiel, station, meetdatum en bron. De box van de rijbaan als optie, standaard uit. *Alternatief:* alleen de maatlijnen.
- **B4 Plaats in de uitvoer** (nodig vóór F2). *Voorstel:* een eigen blad "Foto doorrijprofiel" direct na het blad van elke doorsnede, plus een JPG per doorsnede in `uitvoer\`. *Alternatief:* de foto op het bestaande doorsnedeblad naast het dwarsprofiel.
- **B5 Versie** (nodig vóór F4). *Voorstel:* 2.16.0 samen met kunstwerken en RWS-oplevering als het op tijd klaar is, anders 2.16.1. *Alternatief:* eigen patchversie.
- **B6 Personen en kentekens** (nodig vóór F2). *Voorstel:* met de hand vervagen, met voorgestelde vlakken uit de puntenwolk en een verplicht vinkje "gecontroleerd" vóór de uitvoer. *Alternatief A:* de leverancier van de foto's is verantwoordelijk (foto's moeten al geanonimiseerd zijn); de viewer vraagt alleen om bevestiging. *Alternatief B:* automatisch herkennen met een AI-model (groot, buiten dit plan).

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Foto's met camerastand inlezen (Metashape: Omega Phi Kappa + kalibratie-XML), camera-model met lensvervorming, per doorsnede de beste foto kiezen, overlay met de maatlijnen; knop "Foto" per doorsnede; testset: foto's gerenderd uit `twee_viaducten` vanuit bekende camera's, met een bijbehorend standen- en kalibratiebestand | 1. Eenheidstest projectie: bekende punten komen binnen 0,5 px op de verwachte pixel, ook met vervorming. 2. Testset: voor alle vier doorsnedes wordt een foto gekozen en elke maatlijn ligt binnen 3 px van het meetpunt in die foto (test). 3. De getoonde waarden zijn tekstueel gelijk aan de tabel; de laagste is rood (test). 4. Een foto die het meetpunt niet ziet (afgedekt of erachter) wordt niet gekozen (test). 5. Screenshot `tests/uit/rws_foto.png`, door Marco bekeken. 6. `node run_alle.js` geheel groen | B1, B3 | L | claude-opus-5-5, medium | `F0:` |
| F1 | ✅ gebouwd | Terugval: beeld uit de puntenwolk (strook punten, camera op de weg volgens B2, zelfde overlay) voor doorsnedes zonder geschikte foto | 1. Zonder fotoset ontstaat voor alle vier doorsnedes een beeld (test). 2. Waarden gelijk aan de tabel, laagste rood (test). 3. Maatlijnen binnen 5 px van de projectie (test). 4. Screenshot `tests/uit/rws_foto_wolk.png`, door Marco bekeken. 5. `node run_alle.js` geheel groen | F0, B2 | M | claude-opus-5-5, medium | `F1:` |
| F2 | ⏳ wacht op B4, B6 | Uitvoer: fotoblad na elk doorsnedeblad (keuze Doorrijprofielen RWS en de opleverset), JPG per doorsnede in `uitvoer\`, bron op het blad; vervagen volgens B6 vóór de uitvoer; geen foto in de DXF | 1. PDF van de test heeft na elk van de vier doorsnedebladen een fotoblad (test). 2. Vier JPG's met de juiste namen in `uitvoer\` (test). 3. Zonder het vinkje "gecontroleerd" gaat geen echte foto de uitvoer in (test). 4. Een vervaagd vlak is in de JPG vervaagd (test vergelijkt pixels). 5. DXF zonder fotobladen en zonder fout (test). 6. Blad als PNG `tests/uit/rws_foto_blad.png`, door Marco bekeken. 7. `node run_alle.js` geheel groen | F1, B4, B6 | M | claude-opus-5-5, medium | `F2:` |
| F3 | ○ niet vrijgegeven | Per doorsnede een andere foto kiezen, of bij de terugval het standpunt bijstellen; keuze en vervaagde vlakken bewaard in het project | 1. Een andere foto kiezen geeft dezelfde waarden op het andere beeld (test). 2. Opslaan en openen: keuze, standpunt en vlakken gelijk (test). 3. `node run_alle.js` geheel groen | F2, B2 | S | claude-opus-5-5, medium | `F3:` |
| F4 | ⏳ wacht op B5 | Opleveren: versie volgens B5, LEESMIJ, handleiding, controle met echte foto's van een echte meting door Marco | 1. Marco beoordeelt de foto's van een echte meting als bruikbaar (zijn woorden in punt 11). 2. LEESMIJ en handleiding bijgewerkt (plek in het bestand). 3. Installatietoets eindigt met `fouten: geen` | F3, B5 | S | claude-opus-5-5, medium | `F4:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** Echte foto's kunnen personen en kentekens bevatten. Ze blijven op de pc (projectmap, `fotos\` met verkleinde kopieën); niets gaat naar buiten. Vóór een foto in de uitvoer komt, worden personen en kentekens onherkenbaar gemaakt (B6) en bevestigt de gebruiker dat. Het beeld uit de puntenwolk heeft geen leesbare kentekens of gezichten bij gangbare dichtheden; bij een zeer dichte RGB-wolk geldt dezelfde controle. Bewaartermijn: zolang het project bestaat; verwijderen = de map `fotos\` weggooien. Geen externe verwerkers.
**Beveiliging.** n.v.t.: geen nieuwe verbindingen; alleen bestanden die de gebruiker kiest.
**Gebruikers en handleiding.** Nieuw: "Foto's van de meting…" in het venster Doorrijhoogte, knop "Foto" per doorsnede, vervagen en het vinkje "gecontroleerd", fotoblad in de PDF, JPG's in `uitvoer\`. Handleiding: sectie Doorrijhoogte, deel Doorrijprofiel volgens RWS, met hoe je de camerastanden uit Metashape exporteert.
**Beheer en configuratie.** Map `fotos\` in de projectmap; keuzes per doorsnede in het `.pvproj`.
**Releasenotes (kernpunten).** Per doorrijprofiel een foto met de doorrijhoogtes op kant verharding links, de as en kant verharding rechts: een echte foto uit de meting als die er is, anders een beeld uit de puntenwolk; in de PDF en als JPG.

## 9. Risico's en terugweg
- Het exportformaat van Metashape (of van de werkelijke leverancier) wijkt af van wat hier is aangenomen. Mitigatie: eerst één echte export bekijken (Open vragen); het inlezen is een losse functie. Terugweg: de terugval (F1) werkt altijd.
- Onder een kunstwerk zijn foto's donker of van boven genomen (drone); dan is er geen geschikte foto. Gevolg: de terugval wordt gebruikt; de viewer meldt per doorsnede welke bron.
- Projectiefouten door een verkeerde rotatieconventie of vervormingsmodel. Mitigatie: de gerenderde testset met bekende camera's en de eenheidstest.
- RWS accepteert een beeld uit de puntenwolk niet. Dan alleen echte foto's leveren.
- Geheugen: foto's worden pas bij gebruik geladen en verkleind; nooit alle foto's tegelijk.
- Terugdraaien: de functie staat los van de meting; uitzetten via de PDF-keuze, of de fasecommits terugdraaien.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Welk systeem levert de echte RWS-metingen (drone met Metashape, mobiele mapping, terrestrische scanner), en is er een voorbeeld-export van camerastanden? | Metashape (Omega Phi Kappa + kalibratie-XML), zoals LoZ |
| Accepteert RWS een beeld uit de puntenwolk als "foto" (§ 2.6)? | Leveren met de vermelding "beeld uit de puntenwolk"; Marco legt het voor |
| Hoe zien de voorbeeldfoto's in bijlage C–J eruit? | Opmaak volgens B3 |
| Moeten ook aangeklikte meetpunten (strepen, 1 m uit de kantstreep) op de foto? | Ja, alle meetpunten uit de tabel |
| Eén foto per doorsnede, of per rijbaan bij meerdere rijbanen? | Per doorsnede |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-11-13 13:56 | 2026-11-13 14:16 | Marco van Steenbrugge ("Akkoord, bouw F0") | claude-opus-5-5, sessie 31c4edf1-472e-408e-b8d3-24e0044ed5c6 | medium | 54 / 43.297 | onbekend (nog niet gecommit) | transcript (Claude Code 2.1.321) |
| F1 | 2026-11-13 14:57 | 2026-11-13 15:15 | Marco van Steenbrugge ("akkoord"; "maar een proefversie") | claude-opus-5-5, sessie 31c4edf1-472e-408e-b8d3-24e0044ed5c6 | medium | 46 / 32.145 | onbekend (nog niet gecommit) | transcript (Claude Code 2.1.321) |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-11-13 14:16 | 1. Eenheidstest projectie binnen 0,5 px, ook met vervorming | `node tests/rws_foto.test.js`: "1 projectie: 60 punten, grootste verschil 0.0000 px" (viewer `projecteerFoto` tegen het eigen model in de test, k1 −0,04, k2 0,008, p1, p2, cx, cy ≠ 0) | gehaald |
| F0 | 2026-11-13 14:16 | 2. Testset: voor alle vier doorsnedes een foto, elke maatlijn binnen 3 px van het meetpunt | zelfde run: KW1 voor IMG_0101 (0,05 px), KW1 achter IMG_0103 (0,11 px), KW2 voor IMG_0104 (0,12 px), KW2 achter IMG_0105 (0,06 px) | gehaald |
| F0 | 2026-11-13 14:16 | 3. Waarden tekstueel gelijk aan de tabel; de laagste rood | zelfde run: per doorsnede tekst = `h.toFixed(3)` uit `__pvTest.rws()`, precies één lijn rood (#D7261E) en dat is de laagste (bv. KW1 voor 4.094 / 3.995 / 3.896 rood); geen fouten gemeld | gehaald |
| F0 | 2026-11-13 14:16 | 4. Een foto die het meetpunt niet ziet wordt niet gekozen | zelfde run: "4 drone: meetpunt afgedekt · weg-kijkend: meetpunt achter de camera"; geen van beide gekozen | gehaald |
| F0 | 2026-11-13 14:16 | 5. Screenshot `tests/uit/rws_foto.png`, door Marco bekeken | Screenshot en venster getoond in de chat; Marco van Steenbrugge, 2026-11-13 (tussen 14:00 en 14:16), via chat: "ja zo iets wil ik hebben op een echt foto" | gehaald |
| F0 | 2026-11-13 14:16 | 6. `node run_alle.js` geheel groen | `node tests/run_alle.js` (met rws_foto.test.js erbij): 44 regels OK, slot "Alle tests geslaagd" | gehaald |
| F1 | 2026-11-13 15:15 | 1. Zonder fotoset voor alle vier doorsnedes een beeld | `node tests/rws_foto.test.js`: "F1 KW1 voor: wolk", KW1 achter, KW2 voor, KW2 achter: alle vier bron wolk | gehaald |
| F1 | 2026-11-13 15:15 | 2. Waarden gelijk aan de tabel, laagste rood | zelfde run: per doorsnede tekst = h.toFixed(3) uit de tabel, alleen de laagste rood (bv. 4.094 / 3.995 / 3.896 rood); geen fouten | gehaald |
| F1 | 2026-11-13 15:15 | 3. Maatlijnen binnen 5 px van de projectie | zelfde run: eigen pinhole-projectie in de test met de camera van het beeld: alle lijnen binnen 0,07 px; camera op de as 25 m ervoor, 1,80 m boven de weg (B2) | gehaald |
| F1 | 2026-11-13 15:15 | 4. Screenshot `tests/uit/rws_foto_wolk.png`, door Marco bekeken | getoond in de chat (tussen 14:57 en 15:15); oordeel van Marco nog niet gegeven (proefversie `dist/test/Lutrea-Profielviewer-2.15.0-test-rwsfoto.exe` om het op Loon op Zand te bekijken) | niet toetsbaar |
| F1 | 2026-11-13 15:15 | 5. `node run_alle.js` geheel groen | `node tests/run_alle.js`: "Alle tests geslaagd" | gehaald |
| F1 | 2026-11-13 15:15 | 4. Screenshot `tests/uit/rws_foto_wolk.png`, door Marco bekeken | Marco van Steenbrugge, 2026-11-13 15:15, via chat: "Ja, goed zo", als antwoord op de vraag "Is het beeld uit de puntenwolk zo goed, na het proberen op Loon op Zand?" (of hij de proefversie op LoZ heeft gedraaid, staat niet vast) | gehaald |
| F1 | 2026-11-13 15:16 | 1. Zonder fotoset voor alle vier doorsnedes een beeld | zelfde testrun als 15:15 (`node tests/rws_foto.test.js`): alle vier bron wolk | gehaald |
| F1 | 2026-11-13 15:16 | 2. Waarden gelijk aan de tabel, laagste rood | zelfde testrun als 15:15: tekst = tabel, alleen de laagste rood | gehaald |
| F1 | 2026-11-13 15:16 | 3. Maatlijnen binnen 5 px van de projectie | zelfde testrun als 15:15: alle lijnen binnen 0,07 px; camera volgens B2 | gehaald |
| F1 | 2026-11-13 15:16 | 4. Screenshot `tests/uit/rws_foto_wolk.png`, door Marco bekeken | Marco van Steenbrugge, 2026-11-13 15:15, via chat: "Ja, goed zo", als antwoord op de vraag "Is het beeld uit de puntenwolk zo goed, na het proberen op Loon op Zand?" (of hij de proefversie op LoZ heeft gedraaid, staat niet vast) | gehaald |
| F1 | 2026-11-13 15:16 | 5. `node run_alle.js` geheel groen | `node tests/run_alle.js` van vóór 15:15: "Alle tests geslaagd" | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F0 | Zichtbaarheid alleen getoetst tegen het dakmodel en het wegmodel; een pijler of portaal tussen camera en meetpunt wordt niet herkend. De testfoto's zijn gerenderd (PNG), nog niet getoetst op een echte Metashape-export | Pijlers zitten niet in het wegmodel of dakmodel; een echte export was er nog niet (Open vragen). Toetsen op de foto's van Loon op Zand zodra Marco die levert |
| F1 | Weg en dak komen uit de strook van de doorrijtoets (drWolk, zonder kleur), met de kleur van het dichtstbijzijnde werkwolkpunt; het plan noemde alleen een strook uit de vakken. Proefversie als losse test-exe in dist/test, geen oplevering | De werkwolk houdt per vakje vaak alleen het bovenste punt: onder het dak ontbrak de weg (lucht onder het viaduct). Marco: "maar een proefversie" |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-13 13:29 | Eerste versie; om 13:36, vóór enige beoordeling, B1 uitgebreid op verzoek van Marco: echte foto's uit de meting als voorstel, beeld uit de puntenwolk als terugval, Street View bewust niet; B6 (personen en kentekens) en een extra fase toegevoegd | - | Nog geen vrijgave |

## 14. Bronnen
- viewer.js op 2266f04: `maak3DBeeldVoorPdf` (r. 14690), `rwsVasteMeetpunten` (r. 8951), `rwsMeet` (r. 8960), `drKunstwerken` (r. 8854), `rwsLeesLijnen` (r. 9088)
- docs/doorrijprofielen-rws.plan.md (punt 3, 4, 8, 10): specificatie § 1.3 en § 2.6, eerder besluit "foto later"
- docs/klassen-kiezen.plan.md punt 2: LoZ.laz uit Metashape
- docs/kunstwerken-doorsnedes.beslis.md (B12, F4 dakmodel), docs/rws-oplevering.beslis.md (opleverset)
- docs/handleiding.md, sectie DXF met bladen ("Niet in de DXF")
- Google Maps Platform Service Specific Terms, versie 2024-05-22: https://cloud.google.com/maps-platform/terms/maps-service-terms/index-20240522
- TenderNed, panoramabeelden Kadaster 2025 (Cyclomedia): https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties/389759/documenten/12826085/content
- Chat 2026-11-13: vraag van Marco ("RWS zou graag een foto willen hebben, met daarin de 3 hoogtematen... kantasfalt en de as"), voorstel Street View, en "Ja, B1 uitbreiden"

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
