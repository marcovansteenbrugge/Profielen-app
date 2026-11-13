# Zelfreflectie en marktvergelijking Lutrea Profielviewer

Stand: 13 november 2026, programma 2.15.0 (2.16-functies gebouwd maar niet uitgeleverd).
Gelezen: CLAUDE.md, docs/ (INDEX, ARCHITECTUUR, handleiding, plan-beslis-index, de beslisdocumenten), LEESMIJ.txt, docs/verkoop, dist/voorstel, en de kengetallen van de code en de git-geschiedenis. Online onderzoek op 13 november 2026.

Leeswijzer: **[feit]** = uit de repo of uit een bron (nummer verwijst naar hoofdstuk 8). **[oordeel]** = mijn inschatting. "Niet gevonden" = gezocht, niet kunnen bevestigen.

---

## 1. Samenvatting

**Positie.** De Profielviewer is geen concurrent van de grote puntenwolkpakketten (Cyclone 3DR, TBC, Terrasolid, TopoDOT, Orbit/iTwin Capture). Die kunnen meer, maar leveren geen Nederlands eindproduct. De Profielviewer is een smal "laatste-kilometer"-gereedschap: van een bestaande wolk in RD/NAP in minuten naar een tekening en een toetsblad zoals een Nederlandse opdrachtgever het wil zien. Die niche is echt, maar klein, en de vier tools zijn daarin ongelijk: Profielen heeft gratis concurrentie (QGIS), Doorrij en Snoeien zijn het meest onderscheidend, Doorvaart is het minst onderbouwd.

**Sterkste punten**
1. NL-eindproduct in één gang: RD/NAP, PDOK (BGT, kadaster, NWB), dijkpalen, PDF op schaal met stempel en DXF met dezelfde layouts. Dat levert geen van de onderzochte pakketten standaard.
2. Toets op ruwe punten met een dekkingskaart ("niet gemeten" is zichtbaar). Dat is inhoudelijk eerlijker dan de meeste clearance-tools, die één minimumwaarde per object geven.
3. Lokaal, zonder beheerdersrechten, zonder cloud, en snel aan te passen aan een klantwens.

**Grootste zwaktes en risico's**
1. Eén ontwikkelaar plus AI, één JS-bestand van 16.216 regels, geen CI op de tests, verouderde architectuurdocumentatie: de bus factor is 1.
2. Weinig bewijs: één echte scan (Loon op Zand), geen vergelijking met een landmeetkundige controlemeting, geen referentieklant op papier, geen prijs. De 1 cm van RWS is met een drone- of MLS-wolk waarschijnlijk niet haalbaar; dat is een grens van de meting, niet van de tool, maar hij raakt de belofte.
3. Niet klantklaar: niet ondertekend (SmartScreen), geen licentiemechanisme, geen automatische update, niet getest op een dichtgezette overheidslaptop.

**Belangrijkste aanbevelingen**
1. Eerst bewijzen, dan uitbreiden: één validatiecase per tool (tool-uitkomst naast een controlemeting) en 2.16 uitleveren vóór de platen de deur uit gaan.
2. Doorvaart naast de RWS-Productspecificatie Brughoogtemetingen leggen, zoals bij Doorrij met de Doorrijprofielen is gedaan; nu toetst de tool tegen niets officieels.
3. Ondertekenen (Azure Artifact Signing), tests in CI, en LandXML als uitvoer: drie kleine stappen die het meeste risico en de meeste wrijving wegnemen.

---

## 2. Marktoverzicht

Prijzen zijn alleen opgenomen als ze in een bron stonden; resellerprijzen zijn indicatief en soms ongedateerd.

| Product | Wat het doet | Overlap met | Sterk | Zwak (voor onze toepassing) | Prijsindicatie | Doelgroep |
|---|---|---|---|---|---|---|
| **QGIS** (gratis) | Hoogteprofiel over puntenwolk, raster, mesh sinds 3.26; COPC; export profiel naar DXF/CSV en print-layout [1][2] | Profielen | Gratis, Marco's collega's kennen het, leest COPC en streamt AHN (plugin) [3] | Geen reeks dwarsprofielen op bladen met stempel, geen toetsen, geen stationering op dijkpalen | € 0 | GIS-gebruikers |
| **CloudCompare** (gratis) | Doorsnedes en profielen langs een polylijn, afstanden wolk-wolk | Profielen, deels toetsen | Gratis, veel formaten (o.a. E57) | Geen RD/PDOK, geen tekenbladen; vraagt een specialist | € 0 | Specialisten *(eigen kennis, geen bron geraadpleegd)* |
| **Global Mapper Pro** | Path Profile met loodrechte profielen in serie, lidar in het profiel alleen in Pro [4] | Profielen | Breed, betaalbaar, veel formaten | Geen NL-bladen, geen toetsen op een as | Pro eeuwigdurend $ 1.750 node-locked (reseller); februari 2026 prijsblad: Standard $ 700 + Pro $ 1.050; abonnement in drie lagen sinds sept. 2026, prijs niet gevonden [5][6] | GIS/lidar-analisten |
| **PointCab Origins** | Doorsnedes en plattegronden uit wolken, CAD-uitvoer; Core en 3D sinds maart 2025 [7] | Profielen | Eenvoudig, gericht op tekeningen | Gebouwgericht, geen as/stationering | Huur € 420/maand (alle modules); onderhoud € 460–680/jaar; basisprijs niet gevonden [7] | Landmeters, architecten |
| **Leica Cyclone 3DR** | Dwarsdoorsnedes weg/tunnel, AI-classificatie, sinds 2026.1 een meegeleverd Clearance-script (voorbeeld: weg–brug) in de Standard-editie [8][9] | Doorrij, Profielen | Clearance nu standaard; AI-classificatie (Coenradie-case in NL) [10] | Geen RWS-bladen, generieke rapportage | £ 2.900/jaar (Leica UK-shop); Pro $ 9.150 (reseller, ongedateerd) [8] | Scanbureaus |
| **Trimble Business Center** | Corridor, dwarsprofielen, AI-extractie van o.a. wegmarkering [11] | Profielen, Doorrij (markering) | Volledige landmeetkundige keten | Zwaar, duur, eigen ecosysteem | Abonnementen per pakket, bedrag niet gevonden [12] | Landmeters, aannemers |
| **TopoDOT** (op MicroStation) | Extractie uit MLS, analysetools o.a. bridge clearance, clearance-profielen, botsingsdetectie [13] | Doorrij | De standaard bij MLS-bureaus | MicroStation nodig *(eigen kennis)*; geen NL-uitvoer | Niet gevonden (leverancier publiceert geen prijs) [14] | Mobile-mappingbureaus |
| **Bentley iTwin Capture Manage & Extract** (Orbit 3DM) | Clearance Checker: per brug één punt met minimale doorrijhoogte, automatisch met brugdetector; export naar GIS [15][16] | Doorrij | Schaalt naar honderden kunstwerken | Geeft een minimum, geen doorrijprofiel met meetpunten per rijbaan | Varieert per regio; "vanaf $ 5.000/jaar" staat bij Orbit 3DM, mogelijk een ander pakket [17] | Wegbeheerders, MLS-bureaus |
| **Terrasolid** (TerraScan/Modeler) | Classificatie, profielen, powerline- en wegtoepassingen | Profielen, Snoeien (indirect) | Marktstandaard classificatie | Expertgereedschap op MicroStation/Spatix | TerraScan € 5.700 + € 855/jaar of € 1.710/jaar (reseller, ongedateerd) [18] | Lidar-specialisten |
| **LiDAR360 + PowerLine** | Vegetatie-indringing bij hoogspanningslijnen, clearance-analyse [19] | Snoeien (ander domein) | Vegetatie-clearance is een uitgewerkt product | Lijnen, niet paden/wegen; geen kadaster | Basis ± $ 4.200; PowerLine-module ± $ 1.200–1.500 (resellers) [19] | Netbeheerders, bosbouw |
| **Pix4Dsurvey / Virtual Surveyor** | Vectoriseren en terrein uit dronewolken | Profielen | Dronegebruikers hebben het al | Geen toetsen, geen NL-bladen | ± $ 199/maand resp. ± $ 150/maand (resellers, tegenstrijdig) [20] | Dronebedrijven |
| **Cyclomedia Street Smart** | Meten in panorama + lidar, LAZ-download, API's [21] | Bron van data, niet van de toets | Landsdekkende data bij gemeenten | Geen bevestigd product voor doorrijhoogte of snoeiprofiel gevonden | Niet gevonden | Gemeenten |
| **Cobra Groeninzicht, Greehill/Terra Nostra** (diensten) | 3D-scan van bomen vanaf auto/quad; boomhoogte, kroon, takvrije stam, takken in het vrije profiel; AI [22][23] | Snoeien | Complete dienst incl. inwinning, boomkennis | Dienst, geen gereedschap; uitkomst per boom, niet per perceel-eigenaar (niet bevestigd) | Niet gevonden | Gemeenten (groenbeheer) |
| **Cintoo, NavVis IVION, Potree** | Webviewer voor opdrachtgevers | Geen directe overlap; wel wat de markt verwacht | Delen met een link | Geen NL-toetsen | Cintoo: geen openbare prijs [24]; Potree gratis | Opdrachtgevers |
| **Civil 3D + ReCap** | Surface uit wolk, alignments, profielen, sections | Profielen | Marco's eigen omgeving; het doel van de uitvoer | Traag pad van wolk naar profielblad; duur | Civil 3D ± € 3.019/jaar, AEC Collection € 3.860/jaar (Belgische Autodesk-site, opmaak onduidelijk) [25] | Ontwerpers |

**Wat hieruit volgt [oordeel].** Niemand in dit lijstje levert "RWS-doorrijprofielblad", "snoeilijst per kadastraal perceel" of "PDF/DXF-bladen op dijkpaal-stationering" uit de doos. Omgekeerd leveren zij wel wat wij missen: registratie, classificatie, AI-extractie, E57, een webviewer en een leverancier met meer dan één persoon. De prijsband van het directe alternatief ligt ruwweg tussen € 0 (QGIS) en € 3.000–6.000 per jaar.

---

## 3. Per tool

### 3.1 Profielen Tool

**Wat bestaat er.** QGIS maakt sinds 3.26 een profiel dwars door een puntenwolk, met export naar DXF, CSV en de print-layout [1][2]. Er is een QGIS-plugin die AHN streamt; AHN5 en AHN6 zijn CC BY 4.0 [3]. AHN6 wordt ingewonnen in 2025–2027 [26]. Global Mapper maakt series loodrechte profielen [4]. Een kant-en-klaar waterschapsproduct dat dwarsprofielen uit een puntenwolk op bladen zet heb ik **niet gevonden**; waterschappen tekenen leggerprofielen op AHN-basis in eigen CAD/GIS [27].

**Waar wij beter zijn.** Reeks dwarsprofielen op schaal op bladen met stempel, DXF met dezelfde layouts, dijkpalen en hectometrering ("DP 12 +40"), alle punten in het profiel (boom en weg eronder), BGT en kadaster in de doorsnede, A/B-vergelijking. Dat is precies het tekenwerk dat in QGIS of Civil 3D uren kost.

**Waar slechter.** Het is het minst unieke deel: een handige collega bereikt 70 % in QGIS, gratis. Geen ontwerpprofiel of leggerprofiel eroverheen, geen oppervlaktes (ophoging/ontgraving) tussen A en B, geen uitzettabel; die drie staan als idee in het voorstel, niet gebouwd [feit, dist/voorstel].

**Wat de markt standaard vindt en ontbreekt.** LandXML (surface en alignment) voor Civil 3D; AHN als bron met één klik; E57; een toets "profiel tegen legger/ontwerp". Voor waterschappen is juist die laatste de reden om profielen te maken.

### 3.2 Doorvaarthoogte

**Wat bestaat er.** RWS heeft een **Productspecificatie Brughoogtemetingen**: RD/NAP van punten aan de onderzijde, het absoluut laagste punt binnen het doorvaartprofiel, hoogteschalen, onderzijde boven- en benedenstrooms, begrenzingspunten van de vaarweg (borden), met sjablonen voor Objectbijlage Brug, Meetrapport en Resultaten en een voorbeeldbrug [28]. De gebruiker is de nautisch beheerder. In hydrografische software (Qinsy, Hypack) heb ik **geen** aparte doorvaarthoogte-module gevonden; laserscanners worden daar wel vanaf het meetvaartuig aangestuurd [29]. Wie de metingen in NL uitvoert: **niet gevonden**.

**Waar wij beter zijn.** Hoogte én diepte in één toets (brugscan + multibeam), dekkingskaart, ruwe punten zodat liggers en leidingen blijven staan. Die combinatie ben ik nergens als product tegengekomen.

**Waar slechter.** De tool toetst tegen eigen maten; de RWS-specificatie komt in de repo niet voor. Het voorstel zegt zelf: "Tegen welke eisen toetsen we?" en "de vraag naar doorvaart komt nog" [feit]. Er is geen echte casus, alleen testgegevens. Meerdere openingen per brug kan niet. De CEMT-klasse is alleen een tekening, geen toets [feit, handleiding regel 335]; de verkoopplaat noemt hem onder de stap "Toetsen".

**Ontbreekt.** Het laagste punt als benoemd resultaat in RD/NAP, hoogteschaal, boven-/benedenstrooms, en de RWS-sjablonen als uitvoer. Dat is het equivalent van wat bij Doorrij wel is gedaan.

**[Oordeel]** Dit is de tool met de minste marktonderbouwing. Niet verder uitbouwen tot er een vrager is, maar wel de specificatie lezen: dat kost een dag en bepaalt of de opzet klopt.

### 3.3 Doorrijhoogte

**Wat bestaat er.** RWS: doorrijprofielen zijn doorrijhoogten en -breedten van viaducten, portalen en bruggen op vaste punten, vooral voor de RDW (ontheffingen exceptioneel transport); de productspecificatie valt onder de Data-eisen Geodetische informatie (S0015) [30]. Volgens een TU Delft/RWS-publicatie (2022) worden de metingen van oudsher in het veld gedaan met total station, afstandmeter of laserscanner door een **opdrachtnemer**, en heeft RWS **jaarlijks MLS-puntenwolken van het hele hoofdwegennet** om ze te valideren. De daar ontwikkelde automatische methode overschat de doorrijhoogte 20–30 mm ten opzichte van de veldmeting; getest op 50 portalen en 20 viaducten [31]. RWS deed al in 2002 een proef met laserscanning (Cyrax) [32]. Commercieel: Orbit/iTwin Clearance Checker (één minimum per brug, automatisch) [15], Cyclone 3DR 2026.1 Clearance-script [9], TopoDOT bridge clearance [13].

**Waar wij beter zijn.** Het doorrijprofiel in de vorm die RWS vraagt (profiel 1 en 2, meetpunten, drie decimalen, doorrijbreedte op 0,5–1,0 m, tekstvak), meerdere kunstwerken langs één as, schuine kunstwerken, een opleverset met invulscherm, en per meetpunt het aantal punten en de spreiding. Geen van de gevonden pakketten maakt dat blad. Voor gemeenten (parkeerdaken, onderdoorgangen, fietstunnels) is er voor zover ik zie helemaal niets op maat.

**Waar slechter.**
- Precisie: RWS vraagt 1 cm [feit, LEESMIJ 2.14.0]; de TU Delft-methode zat op MLS-data 2–3 cm ernaast [31]. Een dronewolk uit fotogrammetrie (Loon op Zand is Metashape [feit, klassen-kiezen.plan]) zal onder een dak eerder slechter zijn. De tool is hier eerlijk over (spreiding, "geen officieel RWS-product"), maar het betekent dat de RWS-route alleen werkt met een terrestrische of goede MLS-scan.
- Onvolledig tegenover de specificatie: portalen, uithouders, VRI's, foto bij het profiel, verificatierapport, mappen en bestandsnamen ontbreken [feit, wensenlijst; rws-oplevering F3 niet vrijgegeven].
- Meetpunten op de strepen klik je aan; TBC en Cyclone halen markering met AI uit de wolk [10][11].
- Geen IFC/GeoPackage van de toets [feit, verkoop/LEESMIJ].
- Schaal: Orbit doet honderden kunstwerken automatisch; wij doen er een paar per as met de hand.

**Risico [oordeel].** RWS werkt zelf aan automatisch afleiden uit eigen jaarlijkse MLS-data [31]. Als dat productie wordt, krimpt de vraag naar losse doorrijprofielmetingen op het hoofdwegennet. De klant is hier dus niet RWS, maar de opdrachtnemer die aan RWS moet leveren, plus gemeenten en provincies zonder zulke data. De specificatie in de repo is van 1 juli 2022; de publicatie verwijst naar een versie uit 2019. Controleer of er een nieuwere is.

### 3.4 Snoeien

**Wat bestaat er.** In NL leveren groenbureaus dit als dienst: Cobra Groeninzicht scant met auto of quad en haalt o.a. de takvrije stam en takken in het vrije profiel uit de wolk [22]; Greehill scant met auto, camera en lidar met AI, in een proef met Terra Nostra en gemeenten [23]. Wetenschappelijk bestaat een open-source keten voor "tree clearance" boven wegen uit lidar (Carnot e.a., ISPRS 2024) [33]. Voor hoogspanningslijnen is vegetatie-clearance een volwassen product (LiDAR360 PowerLine, Cyclone 3DR) [19][9]. Gemeenten hanteren vaste maten (4,20 m boven wegen, 2,5 m boven paden) [34]. Een desktopgereedschap dat een snoeilijst per kadastraal perceel maakt heb ik **niet gevonden**.

**Waar wij beter zijn.** De koppeling met het kadaster (brief aan de eigenaar) en de BGT-voorgevels is het meest onderscheidende idee van het hele programma. Verder: snoeikaart en genummerde lijst voor de ploeg, dekkingskaart, werkt zonder classificatie.

**Waar slechter.** De groenbureaus hebben de boom als object (soort, beheerder, boomnummer uit het beheersysteem) en nemen de inwinning mee; wij hebben "begroeiing op station x". Geen koppeling met een groenbeheersysteem, geen IMBOR-attributen, geen herhaalmeting ("opgelost na snoeien" is een idee). De herkenning is geometrisch; zonder classificatie kunnen luifels en balkons meetellen (F2 van gevel-snoei is vrijgegeven maar nog niet gebouwd [feit]). Geen echte straat gecontroleerd (F4 wacht daarop [feit]).

**Ontbreekt wat de markt verwacht.** Uitvoer die een groenbeheerder kan inlezen (per boom-ID), en een werkstroom "vóór/na". En de vraag wie de klant is: de afdeling groen koopt eerder een dienst dan een programma. **[Oordeel]** Dit verkoopt beter als dienst van Lutrea ("wij leveren de snoeilijst per perceel") dan als licentie.

---

## 4. Uitvoer tegen de verwachting van de markt

| Formaat | Stand [feit] | Verwachting [oordeel, tenzij bron] | Advies |
|---|---|---|---|
| PDF op schaal | Sterk: A4–A0, stempel, bladen per toets | Dit is wat opdrachtgevers vragen | Behouden; het is het visitekaartje |
| DXF | Zelfde bladen als layouts, eigen lagen PV_… | Tekenaars willen **DWG** en **NLCS-lagen**; DXF R2010 opent overal, maar een eigen lagenstructuur betekent omzetten | Lagenvertaaltabel naar NLCS (instelbaar). DWG zelf schrijven is duur (ODA-licentie); DXF + sjabloon is verdedigbaar |
| IFC 4.3 | IfcAlignment, IfcReferent, terrein, ruimtes; gecontroleerd met IfcOpenShell en web-ifc | Civil 3D leest IFC 4.3 via een aparte extensie (2026.1); import is beperkt tot een deel van de geometrie en er zijn bekende plaatsingsproblemen [35][36]. Of een IfcAlignment als Civil 3D-alignment binnenkomt is **niet bevestigd** | De plaat zegt "Openen in Civil 3D": zelf testen in 2026 en het resultaat laten zien. Tot dan voorzichtiger formuleren |
| **LandXML** | Ontbreekt (0 treffers in viewer.js) | De praktische route naar Civil 3D voor surface en alignment; Lutrea's eigen drone-skills leveren het al | Toevoegen: as + maaiveld-TIN + profielen. Klein werk, groot effect |
| GeoPackage | Goed, met opmaak; niet voor Doorrij | Standaard bij gemeenten/waterschappen | Doorrij toevoegen |
| CSV | Alleen snoeilijst | Meetpunten Doorrij en profielpunten ook als tabel (uitzetgegevens) | Kleine uitbreiding |
| E57 (invoer) | Ontbreekt | Terrestrische scanners leveren E57; juist die scans halen de 1 cm | Via omzetstap in de exe of documenteren hoe (CloudCompare → LAZ) |
| Webviewer / 3D Tiles / Potree | Ontbreekt | Opdrachtgevers verwachten steeds vaker een link [24] | Niet zelf hosten. Wel: een losse HTML-uitvoer ("bekijk-bestand") van het resultaat is haalbaar omdat de viewer al een browser-app is |
| BCF | Ontbreekt | Bevindingen (conflict, snoeipunt) uitwisselen in BIM-coördinatie | Later; eerst vraag toetsen |
| IMBOR/OTL-attributen | Ontbreekt | RWS en gemeenten sturen op objecttypen | Later, hooguit als kolomnamen in GeoPackage |
| RWS-sjablonen | Doorrij: eigen bladen in RWS-opzet. Brughoogte: niets | Bij RWS-werk tellen de voorgeschreven sjablonen en bestandsnamen [28][30] | Zie aanbevelingen |

---

## 5. Achteraf anders opbouwen

### Wat de repo laat zien [feit]
- `viewer.js`: 16.216 regels, 1 MB, één IIFE, 36 secties met kopcommentaar, ± 100 toestandsvariabelen op het hoogste niveau. CLAUDE.md noemt nog ± 13.300 regels: in drie weken is er een vijfde bijgekomen.
- `docs/ARCHITECTUUR.md` heet "2.9.5" en beschrijft het Chrome/Edge-venster en de File System Access API. Sindsdien zijn WebView2 (2.10.0), eigen bestandstoegang (2.10.2), omzetten in Go (2.11) en vier tools met een startscherm gekomen. Het document dat een opvolger als eerste leest, klopt niet meer.
- Git: 147 commits van 26 oktober tot 13 november 2026, sterk geclusterd (44 op één dag). Beslisdocumenten tonen fasen die 15–25 minuten na het akkoord "gebouwd" zijn; een deel is "via delegatie" goedgekeurd en staat in het geheugen als "na te lopen".
- Tests: 35 Playwright-bestanden plus Go-tests, alleen lokaal. De enige GitHub-workflow is de BRBNT-scan; de tests draaien niet in CI.
- Niet ondertekend; geen licentiemechanisme; geen automatische update. De tag v2.15.0 ontbreekt (laatste tag v2.14.0).
- Eén echte scan in de voorbeelden (Loon op Zand); de rest is gemaakte testdata.

### Keuze voor keuze

| Keuze | Oordeel | Wat ik nu zou doen | Prijs van omschakelen |
|---|---|---|---|
| Browser-app, alles client-side, lokaal | **Goed gekozen.** Geen server, geen cloud, privacy als verkoopargument, PDF/DXF/3D in één techniek. Past bij overheidsklanten | Houden | – |
| Go-exe + WebView2 + setup per gebruiker | **Goed gekozen**, en goed dat het zware werk (omzetten, bestandstoegang) naar Go is verhuisd. Dat is de juiste richting | Meer rekenwerk naar Go of een Worker (profielen uit alle punten staat al als wens). Electron/Tauri voegt niets toe | – |
| Eén JS-bestand zonder build-stap | **Was goed, is nu de grootste technische schuld.** Geen build-stap is prima; één bestand met gedeelde toestand niet. Elke wijziging in de ene tool kan de andere raken; alleen de tests vangen dat | ES-modules **zonder** bundler (`<script type="module">`): `kern/` (wolk, tegels, as, profiel), `uitvoer/` (pdf, dxf, ifc, gpkg), en één module per tool. JSDoc-types met `// @ts-check` voor gratis typecontrole | M–L: 1–2 weken mechanisch werk met de bestaande tests als vangnet; elke week uitstel maakt het duurder. Gefaseerd te doen (eerst uitvoer, dan tools) |
| Eigen tegelformaat `pv-tegels-1` i.p.v. COPC | **Verdedigbaar, niet ideaal.** 16 bytes per punt in vaste vakken is simpel en snel voor "lees de vakken langs de as". Maar: geen detailniveaus (daarom aparte overzichtsbestanden en de wensen "kleinere vakken" en "uitdunnen"), niemand anders kan het lezen, en de projectmap is groter dan de LAZ | Opnieuw beginnend: COPC. Dat is een geldige LAZ 1.4 met octree, leesbaar in QGIS en elke LAZ-lezer [1][37]; de projectmap zou dan zelf een leverbaar product zijn. Nu: het formaat houden, maar een **COPC-export** (of -import) toevoegen en de wens "kleinere vakken" oplossen met een tweede niveau, niet met een nieuw formaat | Volledig omschakelen: L, en decodeersnelheid van LAZ in de browser is een risico. Export erbij: M |
| JS-arrays voor de werkwolk, Delaunay over alles | Schaalt tot de uitgedunde werkwolk; de 441 mln-case liep eerst vast en is opgelost met klassen kiezen, niet met architectuur [feit, klassen-kiezen.plan] | Maaiveld als raster per vak in plaats van één TIN; typed arrays overal | M |
| Vier tools in één programma | **Goed gekozen** voor onderhoud (één kern, één installatie) en het startscherm maakt het voor de gebruiker vier producten. Risico: Doorvaart lift mee zonder vraag en kost wel onderhoud | Houden. Wel per tool een eigen module en een eigen "klaar voor klanten"-status | Klein, valt samen met de modulesplitsing |
| Playwright in Edge, lokaal | Goede keuze voor een app zonder build-stap; 35 tests is veel voor een eenmansproject | Tests op een Windows-runner in GitHub Actions bij elke push; de grote-wolk-test wekelijks | S: een halve dag |
| Geen code-signing | **Blokkeert klanten.** SmartScreen/AppLocker op een gemeentelaptop houdt een niet-ondertekende setup tegen | Azure Artifact Signing: algemeen beschikbaar in o.a. Europa, Basic- en Premium-plan, certificaat op de gevalideerde naam van de rechtspersoon [38]. Prijs niet bevestigd | S, plus doorlooptijd van de identiteitscontrole |
| Eén ontwikkelaar + AI | Snelheid is het concurrentievoordeel: een RWS-blad in een avond bouwt geen leverancier na. Maar de kennis zit in één hoofd en in chatgeschiedenis; de plan-/beslisdocumenten helpen, de verouderde architectuur niet | Architectuurdocument bij elke minor bijwerken (regel in de opleverlijst); één collega die kan bouwen en uitleveren; een "noodprocedure" van één pagina | S, maar vraagt discipline |
| Tempo: bouwen in minuten, akkoord via chat | De procesdiscipline (plan, besluit, fase) is beter dan bij veel grotere teams. Maar "gebouwd" betekent hier "tests groen op testdata", niet "gecontroleerd op een echte scan". F7 (kunstwerken) en F4 (gevels) wachten juist daarop | Een fase is pas klaar na een controle op echte data; een kleine set echte scans met bekende uitkomst als regressietest | S–M |

### Bus factor [oordeel]
Vandaag: 1. Als Marco uitvalt, kan een collega het programma gebruiken en bouwen (`bouw.ps1` werkt), maar niet verantwoord wijzigen: 16.000 regels in één bestand met een architectuurdocument dat vier hoofdstukken achterloopt. Verzachtend: de tests, de beslisdocumenten, Nederlandse namen en commentaar, en dat een AI-assistent de code kan lezen. Dat laatste is een reële mitigatie, maar geen vervanging van een tweede mens die de meetkundige keuzes begrijpt (hoe "dak" van "weg" wordt gescheiden, wat het ruisfilter weggooit). Voor een klant als RWS is "wie staat er achter als het fout gaat" een inkoopvraag.

---

## 6. Verkoop en positionering

**Wat goed is [oordeel].** De platen zijn concreet en in vaktaal: vier stappen, wat je krijgt, waarom het werkt. De kleine lettertjes zijn eerlijk ("geen officieel RWS-product", "testgegevens", "hoort te worden beoordeeld door een specialist"). De exportplaat met de matrix "nog niet" is ongewoon open en daardoor geloofwaardig. Concurrenten presenteren zich met klantcases, cijfers over tijdwinst en video's (bv. Leica: "in ongeveer 30 minuten geclassificeerd" bij Coenradie [10]); daar zit het verschil.

**Wat mist.**
1. **Bewijs.** Geen enkel getal over nauwkeurigheid of tijdwinst. De "cijfers" op de platen zijn eigenschappen ("3 decimalen", "4 boxen"), geen resultaten. Drie decimalen suggereert millimeterprecisie die de meting niet heeft; een vakman prikt daar doorheen.
2. **Referentie en case.** 's-Hertogenbosch staat in CLAUDE.md, niet op de platen. Eén echte casus met vóór/na (uren, uitkomst naast controlemeting) is meer waard dan alle vijf platen.
3. **Prijs en vorm.** Er staat niet wat je koopt: licentie, dienst, of maatwerk. De voetregel "een proef op je eigen project" is een goed aanbod, maar zonder prijsidee belt een gemeente niet.
4. **Demo.** Geen filmpje, geen voorbeeld-PDF om te downloaden. De echte uitvoer (een RWS-opleverset als PDF) is het beste verkoopmateriaal en ligt al klaar in `dist/voorstel`.
5. **Voor wie.** Elke plaat spreekt "je" aan, maar de koper verschilt: de tekenaar (Profielen), de vaarwegbeheerder (Doorvaart), de opdrachtnemer van RWS of de gemeente (Doorrij), de groenbeheerder (Snoeien).

**Claims die nu niet (helemaal) kloppen [feit, tenzij anders].**
- Doorrij: "Hij vindt zelf de kunstwerken", doorsnedes voor/achter, schuine kunstwerken, dakmodel, opleverset, invulvelden, "toets blijft bewaard": gebouwd, **niet uitgeleverd** (2.16; F7 wacht op controle op een echte scan). De eigen LEESMIJ van de platen zegt dit, de plaat niet.
- Snoeien "langs de gevel": F0 en F1 gebouwd; "twijfel bij luifels en balkons" (F2) en de lijst met afstand tot de gevel (F3) nog niet; nog geen echte straat.
- Doorvaart, stap Toetsen: "Maatgevend schip CEMT I t/m Va". In de tool is dat alleen voor de tekening; de toets gebruikt het profiel.
- Profielen: "441 mln punten in één project getest, dankzij de vakken". Het was 441 mln punten op 136 × 101 m, liep eerst vast en werkt door klassen te kiezen. Juist, maar het wekt de indruk van een groot gebied. De grootste gebiedstest is de dijk van 16 mln punten.
- Export: IFC "Openen in Civil 3D, Solibri, Navisworks, Revit". Gecontroleerd is IfcOpenShell en web-ifc. Voor Civil 3D geldt het voorbehoud uit hoofdstuk 4.
- "Voor gemeente én Rijkswaterstaat": voor RWS ontbreken portalen, foto's, verificatierapport en de 1 cm.

**Positionering [oordeel].** De sterkste boodschap is niet "puntenwolksoftware" (daar verlies je van Leica en Bentley), maar: "het Nederlandse toetsblad uit je bestaande scan, in een uur, op je eigen pc". En per tool één zin over wie het koopt. Overweeg Doorrij en Snoeien als dienst met het programma als motor aan te bieden, en Profielen als het gereedschap dat collega's en bevriende bureaus zelf gebruiken.

---

## 7. Verbeteringen, geprioriteerd

Inspanning: S = dagen, M = 1–3 weken, L = langer. Volgorde = prioriteit.

### Product
| # | Wat | Waarom | Effect | Insp. | Wanneer |
|---|---|---|---|---|---|
| 1 | Validatiecase per tool: tool-uitkomst naast een controlemeting (total station of terrestrische scan), vastgelegd als één A4 | Zonder bewijs geen RWS, en de 1 cm-vraag komt altijd | Groot: maakt elke claim hard of eerlijk begrensd | M | Eerst |
| 2 | 2.16 uitleveren na controle op echte scans (kunstwerken F7, gevels F2–F4) | Platen beloven het al | Belofte en product gelijk | S–M | Eerst |
| 3 | Doorvaart naast de Productspecificatie Brughoogtemetingen leggen; laagste punt, boven-/benedenstrooms, sjablonen | Nu geen norm onder de toets | Maakt Doorvaart verkoopbaar of laat zien dat het anders moet | S (lezen) + M (bouwen, pas bij vraag) | Lezen eerst, bouwen later |
| 4 | Doorrij: portalen/uithouders, foto bij profiel, verificatierapport, RWS-bestandsnamen | Volledigheid tegenover de specificatie | Nodig voor opdrachtnemers van RWS | M–L | Later, na 1 |
| 5 | Profielen: ontwerp-/leggerprofiel eroverheen en verschil A–B met oppervlak | Dit is waarom waterschappen profielen maken | Onderscheid t.o.v. QGIS | M | Later |
| 6 | Snoeien: herhaalmeting (opgelost/niet opgelost) en brief per eigenaar | Sluit de werkstroom van de groenbeheerder | Maakt de dienst compleet | M | Later |

### Techniek
| # | Wat | Waarom | Effect | Insp. | Wanneer |
|---|---|---|---|---|---|
| 7 | Ondertekenen van exe en setup (Azure Artifact Signing) | SmartScreen/AppLocker blokkeert klanten | Voorwaarde voor elke externe gebruiker | S | Eerst |
| 8 | Tests in CI op een Windows-runner bij elke push | Nu hangt alles aan één laptop | Vangnet onder het tempo | S | Eerst |
| 9 | ARCHITECTUUR.md bijwerken naar 2.15/2.16 en als stap in de opleverlijst | Eerste document voor een opvolger klopt niet | Bus factor | S | Eerst |
| 10 | viewer.js splitsen in ES-modules zonder bundler, met `@ts-check` | 16.000 regels gedeelde toestand, groeit 20 % per drie weken | Onderhoudbaarheid, minder regressies tussen tools | M–L | Starten vóór de volgende grote functie |
| 11 | Test op een dichtgezette laptop (AppLocker, Defender, geen admin, WebView2-versie) | Staat al op de wensenlijst; beslist of een gemeente het kan draaien | Voorkomt een mislukte eerste indruk | S | Eerst, na 7 |
| 12 | Regressieset van echte scans met bekende uitkomst | "Gebouwd" is nu "groen op testdata" | Vertrouwen in de meetkunde | M | Later |
| 13 | Tweede persoon die kan bouwen, uitleveren en een fix doen | Bus factor 1 | Continuïteit, ook als verkoopargument | M (inwerken) | Later, maar plannen |
| 14 | Licentie en updates: eenvoudige sleutel per organisatie + melding "nieuwe versie" | Nodig zodra klanten zelf werken | Verkoopbaar als product | M | Later, na keuze dienst/licentie |

### Uitvoer
| # | Wat | Waarom | Effect | Insp. | Wanneer |
|---|---|---|---|---|---|
| 15 | LandXML (as, maaiveld-TIN, profielen) | Praktische route naar Civil 3D; IFC-import daar is beperkt [35] | Direct bruikbaar voor de eigen doelgroep | S–M | Eerst |
| 16 | Doorrij naar GeoPackage, CSV (meetpunten) en IFC | Staat als "nog niet" op de eigen plaat | Matrix dicht | S–M | Eerst/later |
| 17 | DXF-lagen instelbaar naar NLCS | Tekenaars hoeven niet om te zetten | Minder wrijving bij oplevering | S–M | Later |
| 18 | COPC-export van de projectwolk; E57-invoer via de exe | Open formaat, QGIS leest het; terrestrische scans | Minder "eigen formaat"-bezwaar | M | Later |
| 19 | Deelbaar bekijk-bestand (HTML) van het resultaat voor de opdrachtgever | Markt verwacht een viewer-link; wij hosten niets | Onderscheidend zonder cloud | M | Later |

### Verkoop
| # | Wat | Waarom | Effect | Insp. | Wanneer |
|---|---|---|---|---|---|
| 20 | Platen corrigeren (2.16-claims markeren, CEMT, 441 mln, Civil 3D), en toevoegen: één echte case met getallen, een voorbeeld-PDF, een prijs- of dienstvorm, en per plaat voor wie | Belofte moet kloppen op de dag dat de klant belt | Geloofwaardigheid | S | Eerst |

---

## 8. Bronnen

Geraadpleegd op 13 november 2026. Waar alleen een zoekresultaat-samenvatting is gelezen en niet de pagina zelf, staat *(samenvatting)*.

1. QGIS/Lutra, puntenwolken en profieltool, COPC sinds 3.26: https://www.lutraconsulting.co.uk/blog/2022/06/16/pointcloud-in-qgis-update-3/ *(samenvatting)*
2. QGIS-handleiding, Elevation Profile View: https://docs.qgis.org/latest/en/docs/user_manual/map_views/elevation_profile.html *(samenvatting)*
3. QGIS-plugin AHN streamer (licenties AHN1–4 CC0, AHN5–6 CC BY 4.0): https://plugins.qgis.org/plugins/ahn_streamer/ *(samenvatting)*
4. Global Mapper, Path Profile: https://www.bluemarblegeo.com/blog/exploring-the-path-profile-tool/ en https://www.bluemarblegeo.com/knowledgebase/global-mapper/Path_Profile/PathProfile_settings.htm *(samenvatting)*
5. Blue Marble, prijsblad februari 2026: https://www.bluemarblegeo.com/wp-content/uploads/2026/02/Texas-DIR-Pricing-Sheet.pdf ; reseller: https://reach.dog/shop/drone-mapping-tools/products/global-mapper-pro-1-year-updates *(samenvatting)*
6. Global Mapper-abonnement (september 2026): https://www.geoweeknews.com/articles/blue-marble-geographics-advances-its-office-to-field-platform-with-new-global-mapper-offering/ *(samenvatting)*
7. PointCab, licentieoverzicht en changelog 2025: https://pointcab-software.com/en/point-cloud-software/license-overview ; https://pointcab-software.com/en/newsroom/changelog_2025/ ; https://www.laserscanning-europe.com/en/node/3624 *(samenvatting)*
8. Leica Cyclone 3DR, shop en prijs: https://shop.leica-geosystems.com/gb/leica-blk/package/leica-cyclone-3dr ; https://www.shi.com/product/39724246 *(samenvatting)*
9. Cyclone 3DR 2026.1.0 release notes (Clearance-script): https://rcdocs.leica-geosystems.com/cyclone-3dr/2026.1/2026-1-0-cyclone-3dr-release-notes *(samenvatting)*
10. Leica, case Coenradie (AI-classificatie): https://leica-geosystems.com/products/laser-scanners/software/leica-cyclone/leica-cyclone-3dr/coenradie-uses-cyclone-3dr-ai-classification *(samenvatting)*
11. Trimble, AI in TBC (wegmarkering): https://geospatial.trimble.com/en/resources/blog/trimble-business-center-leverages-ai-to-improve-productivity-reduce-errors-and-add-value-to-point-cloud-data *(samenvatting)*
12. Trimble Business Center, abonnementen: https://geospatial.trimble.com/en/products/software/trimble-business-center/subscription-plans *(samenvatting)*
13. TopoDOT, analysetools (bridge clearance): https://www.laserscanning-europe.com/en/node/287 *(samenvatting)*
14. TopoDOT, geen gepubliceerde prijs: https://www.g2.com/products/topodot/pricing *(samenvatting)*
15. Orbit GT kennisbank, Workflow on Bridge Clearance: https://kb.orbitgt.com/recordings/tutorials/bridge_clearance *(samenvatting)*
16. Bentley iTwin Capture Manage & Extract: https://www.bentley.com/software/itwin-capture-manage-extract/ *(samenvatting)*
17. Bentley Orbit 3DM, prijsvermelding: https://www.bentley.com/en/products/brands/orbit-3dm *(samenvatting)*
18. Terrasolid, prijzen: https://radiancefields.com/platforms/terrasolid ; https://www.heliguy.com/products/terrasolid-terrascan/ *(samenvatting)*
19. LiDAR360 en PowerLine-module: https://reach.dog/shop/drone-mapping-tools/products/lidar360-software-main-framework-perpetual-license ; https://reach.dog/shop/drone-mapping-tools/products/lidar360-powerline-module ; https://www.dslrpros.com/products/greenvalley-lipowerline *(samenvatting)*
20. Pix4Dsurvey en Virtual Surveyor: https://pix4d.com/pricing/pix4dsurvey ; https://www.dronefly.com/products/pix4dsurvey ; https://virtual-surveyor.com/pricing ; https://reach.dog/shop/e38-survey-solutions/products/virtual-surveyor-monthly *(samenvatting)*
21. Cyclomedia, LiDAR en Street Smart: https://cyclomedia.com/products/lidar ; https://cyclomedia.com/us/street-smart *(samenvatting)*
22. Cobra Groeninzicht, 3D-scan van bomen: https://www.boomzorg.nl/upload/artikelen/bz614cobra.pdf ; https://stad-en-groen.nl/upload/artikelen/sg721joostverhagen.pdf *(samenvatting)*
23. Greehill / Terra Nostra: https://boomzorg.nl/upload/artikelen/terra-nostra.pdf *(samenvatting)*
24. Cintoo, prijs: https://www.g2.com/products/cintoo/pricing ; https://cintoo.com/buy *(samenvatting)*
25. Autodesk AEC Collection en Civil 3D (BE-NL): https://www.autodesk.com/be-nl/collections/architecture-engineering-construction/overview *(samenvatting)*
26. Nationaal Georegister, AHN6 (inwinning 2025–2027): https://www.nationaalgeoregister.nl/geonetwork/srv/api/records/934a540d-25c5-4661-8c2c-2cc7f7c31541 *(samenvatting)*
27. Waterschap Limburg, dwarsprofielen op AHN-basis: https://www.waterschaplimburg.nl/publish/pages/4696/augustus2025_infosessie_poster_dijkvak_5_dwarsprofielen.pdf ; RWS legger dwarsprofielen: https://data.overheid.nl/dataset/75850-rws-legger---ligging-dwarsprofiel-primaire-keringen *(samenvatting)*
28. Rijkswaterstaat, Brughoogtemetingen (pagina gelezen): https://www.rijkswaterstaat.nl/zakelijk/zakendoen-met-rijkswaterstaat/werkwijzen/werkwijze-in-gww/data-eisen-rijkswaterstaatcontracten/brughoogtemetingen
29. GIM International, 3D Documentation of the Forth Bridge (scanner met Qinsy/Hypack): https://www.gim-international.com/content/article/3d-documentation-of-the-forth-bridge *(samenvatting)*
30. Rijkswaterstaat, Doorrijprofielen (pagina gelezen): https://www.rijkswaterstaat.nl/zakelijk/zakendoen-met-rijkswaterstaat/werkwijzen/werkwijze-in-gww/data-eisen-rijkswaterstaatcontracten/doorrijprofielen
31. Meinderts e.a. (TU Delft / RWS), Clearance measurement validation for highway infrastructure with use of lidar point clouds, ISPRS Archives 2022 (samenvatting en inleiding gelezen): https://isprs-archives.copernicus.org/articles/XLVIII-2-W2-2022/69/2022/isprs-archives-XLVIII-2-W2-2022-69-2022.pdf
32. Rijkswaterstaat, Doorrijhoogte meting met CYRAX (2002): https://open.rijkswaterstaat.nl/@112837/doorrijhoogte-meting-cyrax-eindrapport *(samenvatting)*
33. Carnot e.a., Enhancing Roadway Safety: LiDAR-based Tree Clearance Analysis, ISPRS Annals 2024: https://isprs-annals.copernicus.org/articles/X-4-W4-2024/21/2024/ *(samenvatting)*
34. Gemeentelijke snoeimaten, bv. Zoetermeer: https://cuatro.sim-cdn.nl/zoetermeer/uploads/snoeien-van-bomen.pdf *(samenvatting)*
35. Autodesk, IFC 4.3 Extension voor Civil 3D: https://www.autodesk.com/blogs/aec/2023/05/12/whats-new-in-openbim-and-infrastructure-ifc-4-3-for-civil-3d/ ; ondersteunde geometrie bij import: https://help.autodesk.com/cloudhelp/2023/ENU/Civil3D-IFC/files/GUID-DE483576-24ED-4048-890C-A9A766A0536D.htm *(samenvatting)*
36. Autodesk-forum, IFC4x3-export op verkeerde plek: https://forums.autodesk.com/t5/civil-3d-forum/ifc4x3-export-issue-file-appears-in-wrong-location-despite/m-p/13788647 *(samenvatting)*
37. COPC-uitleg: https://guide.cloudnativegeo.org/copc/index.html *(samenvatting)*
38. Azure Artifact Signing, beschikbaarheid en plannen: https://www.devclass.com/security/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/4079554 ; https://azure.microsoft.com/nl-nl/pricing/details/artifact-signing/ *(samenvatting)*

**Niet gevonden (wel gezocht):** prijzen van TopoDOT, TBC, Cintoo, NavVis en Azure Artifact Signing; welke bureaus de doorrijprofielen en brughoogtemetingen voor RWS uitvoeren; een doorvaarthoogte-module in Qinsy/Hypack; een kant-en-klaar waterschapsproduct voor dwarsprofielen uit puntenwolken; een profielfunctie in de AHN-viewer; een Cyclomedia-product voor doorrijhoogte of snoeiprofiel; de inhoud van de RWS-productspecificaties zelf (alleen de overzichtspagina's gelezen).
