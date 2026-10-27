# Lutrea Profielviewer — handleiding

Oct 27, 2026 · @Marco van Steenbrugge · versie 2.10.1

## Wat is de Profielviewer

De Profielviewer maakt van een puntenwolk (.pts, .las of .laz) in een paar minuten een lengteprofiel, dwarsprofielen en een PDF-tekening op schaal. Alles draait op je eigen pc; alleen BGT, bomen, luchtfoto en de kadastrale kaart komen van internet (PDOK).

Daarnaast zitten er twee toetsen in. De **doorvaartcontrole** kijkt of een schip onder een brug past, in hoogte én diepte. De **snoeicheck** zoekt de takken die in de vrije ruimte boven een pad hangen en maakt een snoeikaart en snoeilijst. Alles gaat ook naar AutoCAD/Civil 3D (DXF) en QGIS (GeoPackage).

**Starten**

1. Dubbelklik `Lutrea-Profielviewer-2.10.1.exe`. Er is niets te installeren. Zet het bestand waar je wilt (bureaublad, C:\\Tools) en maak eventueel een snelkoppeling.
2. De eerste keer kan Windows "Windows heeft uw pc beschermd" tonen: kies **Meer informatie → Toch uitvoeren**. Het programma is (nog) niet digitaal ondertekend.
3. De viewer opent in een eigen programmavenster (WebView2, zit in Windows 10 en 11; Chrome of Edge is niet nodig). Venster dicht = programma stopt. Het venster onthoudt plek en grootte.
4. Controleer het versienummer naast de titel linksboven (nu **2.10.1**).

**Al open?** Start je de viewer nog een keer, dan komt het venster dat al open is naar voren; er komt geen tweede venster.

**Overstappen van een versie vóór 2.10.0.** Het eigen venster begint met lege instellingen. Neem ze één keer over:

1. Start de exe met `--browservenster` (zet dat in een snelkoppeling achter het doel). Dan opent het oude Chrome/Edge-venster, met je oude instellingen.
2. Kies in het lint **PROJECT → instellingen → Exporteren…** en bewaar het bestand.
3. Sluit de viewer en start hem gewoon.
4. Kies **PROJECT → instellingen → Importeren…** met dat bestand. De viewer start opnieuw met je instellingen.

Mee gaan: PDF-stempel en titelblok, logo's, puntdichtheid en weergave-instellingen. Recente projectmappen gaan niet mee; open die één keer opnieuw.

**Oude versie nog actief?** Een nieuwe exe sluit een oudere versie die nog op de achtergrond draait vanzelf af. Zie je toch oude knoppen, sluit dan alle vensters van de viewer en start de nieuwe exe opnieuw.

**Wat gaat erin, wat komt eruit**

| Erin | Eruit |
| --- | --- |
| Puntenwolk: .pts (ReCap, Cyclone), .las, .laz | PDF-tekening (A4 t/m A0), één bestand of losse bladen |
| BGT en bomen van PDOK, of eigen GeoJSON / DXF | DXF voor AutoCAD / Civil 3D (RD New, m NAP) |
| Kadastrale percelen van PDOK, of eigen GeoJSON / GeoPackage | GeoPackage voor QGIS, met opmaak en 3D-stijl |
| As uit GeoPackage, GeoJSON, shapefile of DXF | Projectbestand (.json), met of zonder puntenwolk |
| Tweede puntenwolk om te vergelijken | Snoeilijst als CSV (opent in Excel) |
| Scans van de onder- en bovenzijde van een brug |  |

Vastgelopen of een leeg venster? Start dan het oude venster met `--browservenster`, en stuur het logbestand mee: `%LOCALAPPDATA%\Lutrea\PTS-viewer\log.txt` (plak het pad in de adresbalk van de Verkenner). Elke start schrijft erachter; boven 1 MB staat het oudere deel in `log.vorige.txt`.

## Het scherm

Het scherm heeft drie vlakken: links het bovenaanzicht, rechtsboven het lengteprofiel en rechtsonder het dwarsprofiel. De grijze balken ertussen kun je verslepen om een vlak groter te maken.

Bovenin staat het **lint** met vijf groepen: PUNTENWOLK, PROJECT, AS, TOETS en UITVOER. Klik op een kop om die groep in of uit te klappen; de viewer onthoudt dat. Daaronder staat de statusbalk met meldingen en de knop Afsluiten.

&#91;image: Het lint met de groepen PUNTENWOLK, PROJECT, AS, TOETS en UITVOER, daaronder de statusbalk\]

&#91;image: Hoofdscherm met de puntenwolk van 's-Hertogenbosch, een as en het dwarsprofiel met waterpeil\]

| Plek | Wat je daar doet |
| --- | --- |
| Lint: PUNTENWOLK | Puntenwolk openen, aantal punten, oppervlak (boven- of onderkant), randen strak, wolk B om te vergelijken |
| Lint: PROJECT | Nieuw, Openen, Opslaan (overschrijft het geopende projectbestand) en Opslaan als (nieuw bestand), met of zonder puntenwolk |
| Lint: AS | As kiezen, + As, naam, Teken as, Wis as, As inlezen, ⇄ Omdraaien, Detailstrook, profiellijnen en lengteprofiel tonen |
| Lint: TOETS | Doorvaart… en Snoeien…, met daaronder de uitkomst |
| Lint: UITVOER | PDF…, DXF (AutoCAD) en GeoPackage (QGIS) |
| Statusbalk | Wat de viewer net deed: punten, laadtijd, meldingen bij opslaan; rechts Afsluiten |
| Bovenaanzicht | Zoomen (Venster, Alles, Vorige, + en −), kleur, 3D; daaronder Ondergrond: luchtfoto, BGT, bomen, kadaster |
| Lengteprofiel | Hoogte langs de as; stap, maten elke, verhouding, zoomen |
| Dwarsprofiel | Profiel haaks op de as; breedte, interval, waterpeil, BGT, bladeren met ◀ ▶ |

In de bestandsknoppen staat op jouw pc "Bestand kiezen"; op de screenshots staat de Engelse tekst "Choose File".

## Stap 1 — Puntenwolk inlezen

Kies in de bovenste balk het bestand (.pts, .las of .laz). De viewer dunt de wolk uit tot het gekozen aantal punten, maakt er een driehoeksnet (surface) van en toont het bovenaanzicht. Een PTS van 350 MB (4,9 miljoen punten) staat er in ruim een halve minuut.

| Instelling | Wat het doet | Advies |
| --- | --- | --- |
| **punten** | Maximaal aantal punten voor de surface: 150.000 t/m 10 miljoen. Meer punten = kleinere details (greppels, randen, opsluitbanden) scherper | 300.000 voor overzicht; 1–2 miljoen voor detail; 5–10 miljoen voor fijn detail (bij 10 miljoen ± 1 minuut inlezen, ± 2,5 GB geheugen, project ± 200 MB). Voor de profielen zelf is Alle punten het nauwkeurigst |
| **oppervlak** | Liggen er punten boven elkaar (brugdek boven de bodem, boomkruin boven maaiveld): **bovenkant** = hoogste punt, **onderkant** = laagste punt | Bovenkant voor wegen en kades, onderkant voor maaiveld onder bomen of de bodem onder een brug |
| **randen strak** | Dicht de gaten in een open hek of smalle muur, zodat die een doorlopende lijn wordt in plaats van een kam van pieken (alleen bij bovenkant) | Aan laten |
| **alles inlezen** | Bij LAS/LAZ boven 900.000 punten wordt standaard een steekproef gelezen; aangevinkt leest hij echt alles van schijf | Alleen als detail ontbreekt |
| **maaiveld** | Bij een LAS/LAZ met classificatie alleen de grondpunten (klasse 2) gebruiken. Begroeiing, gras, hekwerk en paaltjes vallen weg uit de surface en de profielen, ook bij Alle punten en Detailstrook. Een .pts of een LAS zonder classificatie gebruikt vanzelf alle punten | Aan voor dijk- en maaiveldprofielen uit een geclassificeerde LAS/LAZ. Bij een .pts met begroeiing: kies onderkant |
| **kleur** (bovenaanzicht) | **RGB (inmeting)** = de kleur uit de puntenwolk, **hoogte** = kleurverloop op hoogte | RGB voor herkenbaarheid |

Wijzig je punten, oppervlak of randen strak, dan leest de viewer het bestand opnieuw in. Je as en BGT blijven staan.

**PTS uit ReCap.** Een PTS die je in ReCap uit meerdere LAS-tegels hebt samengevoegd (x y z r g b nx ny nz) wordt herkend, inclusief de kleur. Ook PTS met 4, 6, 7 of 10 kolommen werken.

**Vergelijken met een tweede wolk.** Met **+ vergelijk met** laad je wolk B, bijvoorbeeld AHN naast een dronemeting of een tweede meetmoment. Met **maaiveld** aangevinkt gebruikt hij van B alleen de maaiveldpunten (klasse 2). In de profielen verschijnt B als paarse lijn; met de vinkjes A en B zet je elk aan of uit.

**Meer detail langs de as** (na het tekenen van de as, stap 3):

- **Detailstrook** leest het bestand opnieuw en bewaart alleen een strook rond de as (profielbreedte + 2 m), op veel hogere dichtheid.
- **Alle punten** (bij het dwarsprofiel) berekent de profielen uit álle meetpunten vlak naast de profiellijn, zonder uitdunnen en zonder driehoeksnet. Bij heel grote bestanden duurt dat enkele minuten.

## Stap 2 — BGT, DXF en bomen erbij

BGT is niet verplicht, maar maakt de profielen veel beter leesbaar: je ziet waar de weg, de berm, het water of de kademuur begint, met de hoogte op die grens.

**In het bovenaanzicht**

- **BGT ophalen** haalt de BGT van PDOK op voor het gebied van de puntenwolk (internet nodig).
- **of Bestand kiezen** opent een eigen bestand: een DXF (bv. een BGT- of ontwerptekening, uit DWG opgeslagen als DXF) of GeoJSON. Bij een DXF kies je in een venster welke lagen je wilt; lagen als tekst, maatvoering en KLIC staan standaard uit.
- **alleen lijnen / lijnen + vlakken** bepaalt alleen hoe het bovenaanzicht eruitziet, niet wat er in het profiel komt.
- **Bomen ophalen** of een eigen GeoJSON zet bomen in het bovenaanzicht en als boomsymbool in de dwarsprofielen.
- **Kadaster ophalen** haalt de kadastrale kaart (BRK) van PDOK op: perceelgrenzen met sectie en nummer, in het bovenaanzicht en als paarse streeplijnen in het dwarsprofiel. Met **Bestand…** open je eigen percelen (GeoJSON of GeoPackage in RD). Eigenaren staan er niet in; die vraag je op bij het Kadaster.
- **Wis BGT / Wis bomen** haalt ze weer weg.

**Aan en uit zetten.** BGT, Bomen en Kadaster hebben in de balk Ondergrond een vinkje voor hun naam. Na het laden zet je daarmee de laag aan of uit in het bovenaanzicht. De gegevens blijven geladen, dus de snoeilijst per perceel blijft gewoon werken. Wis haalt de laag echt weg. De PDF en de exports volgen hun eigen vinkjes.

**In het dwarsprofiel** (keuze **BGT** in de kop van het dwarsprofiel, werkt ook in de PDF)

| Keuze | Wat je ziet |
| --- | --- |
| uit | Geen BGT |
| balk | Gekleurde band onder het profiel met per strook de naam en breedte (bv. "weg 6.97") |
| + hoogtes | Band + rode hoogtes op de exacte snijpunten met de BGT-grenzen (standaard) |
| + namen | Band + hoogtes + een stippellijn met de naam op elke grens (kademuur, kant verharding, insteek …) |

**Band of maatketting.** De gekleurde band kan alleen als de BGT **vlakken** heeft. Heb je alleen lijnen (bijvoorbeeld een DXF met kademuur en kant verharding), dan komt er op die plek een **maatketting**: een maatlijn met schuine streepjes op elke lijn en de afstanden ertussen, tot de randen van het profiel.

## Stap 3 — De as tekenen en aanpassen

De as bepaalt alles: het lengteprofiel loopt over de as, de dwarsprofielen staan er haaks op. Station 0 is het eerste punt dat je klikt.

1. Klik **Teken as**.
2. Klik punten in het bovenaanzicht langs het tracé.
3. Klik **Klaar met tekenen**.

&#91;image: As tekenen in het bovenaanzicht\]

| Actie | Hoe |
| --- | --- |
| Punt toevoegen | Klik (tijdens het tekenen) |
| Punt verplaatsen, ook begin of eind | Sleep het punt |
| Punt verwijderen | Rechtermuisknop op het punt |
| Laatste punt weg | Backspace |
| Verder tekenen aan een bestaande as | Kies de as en klik **Teken as** |
| Nieuwe as erbij | **+ As** (de huidige as blijft bewaard) |
| Andere as kiezen | Keuzelijst **As 1**, of klik op een grijze as in het bovenaanzicht |
| As een naam geven | ✎ |
| As weghalen | **Wis as** |
| As uit een bestand | As inlezen…: GeoPackage, GeoJSON, shapefile of DXF (RD). Een eigen GeoPackage of DXF van de viewer leest alleen de as terug |
| Richting omdraaien | ⇄ Omdraaien: station 0 aan de andere kant, L en R wisselen mee |

**Kijkrichting.** Je kijkt in het dwarsprofiel altijd in de richting van oplopend station: L is links van de as, R rechts. Teken de as dus in de richting waarin je de profielen wilt lezen.

**Dwarsprofiellijnen.** Met het vinkje **dwarsprofielen** zie je in het bovenaanzicht alle profiellijnen met hun stationsnummer, en linksonder bijvoorbeeld "6 dwarsprofielen · elke 10 m · 50 m breed". Zo zie je vooraf wat er in de PDF komt.

## Stap 4 — Lengte- en dwarsprofielen

Zodra de as er is, rekent de viewer beide profielen uit. Alles wat je hier instelt, komt ook zo in de PDF.

**Lengteprofiel** (hoogte over de as)

&#91;image: Lengteprofiel\]

- **stap**: om de hoeveel meter een hoogte wordt bepaald.
- **maten elke**: om de hoeveel meter er een hoogtegetal bij staat (0 = geen getallen).
- **verh. 1:** hoeveel keer de hoogteverschillen worden uitvergroot (5 = vijf keer).
- Het vinkje **lengteprofiel tonen** in de bovenste balk verbergt het paneel als je meer ruimte voor het dwarsprofiel wilt.

**Dwarsprofiel** (haaks op de as, per station)

&#91;image: Dwarsprofiel met waterpeil, NAP-lijn, afstandsschaal en legenda\]

| Instelling | Betekenis |
| --- | --- |
| breedte | Totale breedte van het profiel, bv. 50 m = 25 m links en rechts van de as |
| interval | Afstand tussen de dwarsprofielen langs de as, bv. elke 10 m |
| waterpeil | Hoogte in m NAP; geeft een waterlijn met ▽ en lichtblauw water waar het profiel lager ligt. Leeg = uit |
| maten elke | Om de hoeveel meter een zwart hoogtegetal; 0 = alleen de rode BGT-hoogtes |
| verh. 1: | Overdrijving van de hoogte (1 = ware verhouding) |
| ◀ ▶ | Vorig / volgend station |

**Wat er in het dwarsprofiel staat**

- **Afstandsschaal** onderlangs (−20 … 0 … 20 m) met lichte verticale rasterlijnen; de stappen passen zich aan bij inzoomen.
- **NAP 0,00** als donkere streep-stippellijn; 0.00 op de hoogte-as staat vet.
- **L en R** bovenin, de **as** als rode stippellijn met de asnaam.
- **Legenda** rechts, met alleen wat er in dit profiel staat, en onderaan de profielbreedte. Op het scherm verschijnt de legenda als het paneel breed genoeg is; sleep anders de middelste balk naar links.
- **BGT-band of maatketting** onder het profiel (stap 2).

**Zoomen in een profiel.** Muiswiel = in- en uitzoomen, slepen = verschuiven, ⬚ = zoomen op een rechthoek, ⤢ = alles weer in beeld. De getallen blijven leesbaar en schuiven mee.

## Stap 5 — PDF maken

Klik **PDF…** in de bovenste balk. Rechtsonder zie je meteen een voorbeeld van elk blad; met ◀ ▶ blader je erdoorheen. Klik **PDF maken** als het goed is.

&#91;image: Het PDF-venster met voorbeeld\]

**Blad**

| Instelling | Keuzes en uitleg |
| --- | --- |
| Papierformaat / oriëntatie | A4 t/m A0, liggend of staand |
| Bladindeling | **Kolom rechts**: kader met vakverdeling, rechts een kolom met legenda, opmerkingen en stempel (vanaf A3 liggend). **Balk onder**: compacte stempel over de hele breedte (A4 en A3 staand gebruiken altijd de balk) |
| Teksthoogte | Hoofdletterhoogte zoals in CAD: automatisch 2,5 mm t/m A2 en 3,5 mm op A1/A0, of zelf 1,8 / 2,5 / 3,5 / 5,0 mm. Stempel en legenda schalen mee |
| Vragen waar ik opsla | Aan: je kiest map en naam (de map wordt onthouden). Uit: naar Downloads |
| Bladen | Leeg = alles; of bv. **4** of **2-5, 8**. Knop **alleen dit blad** bij het voorbeeld vult het in |
| Elk blad als los PDF-bestand | Elk blad een eigen bestand: naam\_blad01.pdf, naam\_blad02.pdf … |
| Resolutie kaart | 100–300 dpi voor het bovenaanzicht; 150 is een goede middenweg |

**Inhoud**

- Kies **bovenaanzicht**, **lengteprofiel** en/of **dwarsprofielen**; bij meerdere assen de **actieve as** of **alle assen**.
- **Vanaf / tot station** beperkt de dwarsprofielen tot een stuk van de as.
- **Schaal dwarsprof.**: bladbreed, of vast 1:50 t/m 1:500. Past een schaal niet op het blad, dan kiest hij de eerstvolgende die past en meldt dat.
- **Profielen per blad**: automatisch (zoveel als past) of een vast aantal. **Verh. dwars** is een eigen overdrijving voor de PDF.
- Bij het bovenaanzicht: puntenwolk, BGT, bomen, luchtfoto PDOK, stationsnummers en het **3D-beeld bij het bovenaanzicht**.
- **3D-beeld (eigen blad)**: een groot 3D-beeld direct na het bovenaanzicht, vanuit het standpunt van de 3D-weergave.
- **Doorvaartcontrole (eigen blad)**: de maatgevende doorsnede onder de brug op grote schaal, met de uitgangspunten en het oordeel.
- **Snoeilijst (eigen blad)**: alle snoeipunten in een tabel, en met kadastrale percelen ook een blad per perceel. Het bovenaanzicht wordt dan de snoeikaart.

**Titelblok (stempel)**

Vul projectnaam, projectnummer, opdrachtgever, omschrijving, getekend, gecontroleerd, status, revisie en datum in. Ze worden onthouden voor de volgende keer.

- **Logo opdrachtgever**: kies een PNG, JPG of SVG; witte randen worden weggesneden en het logo komt groot bovenin de stempel. Het Lutrea-logo staat apart onder "Opgesteld door". Met × haal je het logo weg.
- **Tekeningnummer**: eindigt het op cijfers (LUT-DO-DKT-0001), dan telt het per blad door.
- **Opmerkingen**: eigen regels, onder de vaste opmerkingen (maten in meters, hoogtes t.o.v. NAP, RD-coördinaten, bron van de puntenwolk, waterpeil).

**Zo ziet het resultaat eruit** (A1, kolom rechts, teksthoogte automatisch 3,5 mm):

&#91;image: Blad 1: bovenaanzicht met legenda, 3D-beeld, opmerkingen en stempel\]

&#91;image: Blad met dwarsprofielen op 1:100, één legenda per blad in de kolom\]

## Stap 6 — Project opslaan en 3D

**Project opslaan** bewaart je werk in één .json-bestand: de assen, BGT en bomen, alle instellingen (ook het waterpeil) en, met het vinkje **met puntenwolk**, de uitgedunde puntenwolk zelf. Met **Openen…** open je het later weer, zonder het oorspronkelijke .pts/.las/.laz.

| Knop | Sneltoets | Wat het doet |
| --- | --- | --- |
| **Nieuw** | Ctrl+N | Sluit het huidige project en begint leeg. Projectnaam, -nummer, tekeningnummer, opdrachtgever, omschrijving en revisie in de stempel worden leeggemaakt; je eigen naam, status, schalen en logo's blijven staan |
| **Openen…** | Ctrl+O | Opent een projectbestand en onthoudt het: onder de knoppen staat in welk bestand Opslaan schrijft |
| **Opslaan** | Ctrl+S | Schrijft in het geopende projectbestand (overschrijft het, zonder te vragen). Nog geen projectbestand? Dan vraagt hij er één, net als Opslaan als |
| **Opslaan als…** | Ctrl+Shift+S | Vraagt altijd om een nieuw bestand. Daarna is dat het projectbestand waar Opslaan in schrijft |

Overschrijven is veilig: er wordt eerst naar een tijdelijk bestand geschreven, en pas als alles erin staat vervangt dat het oude project.

**Instellingen** (onder de projectknoppen) bewaart met **Exporteren…** je eigen instellingen in een los bestand: PDF-stempel en titelblok, logo's, puntdichtheid en weergave. Met **Importeren…** zet je ze op een andere pc of in een nieuwe versie terug. Een projectbestand neemt deze instellingen niet mee.

- Met puntenwolk wordt het bestand groter: bij 2 miljoen punten met kleur ongeveer 38 MB, bij 10 miljoen ongeveer 200 MB.
- Na opslaan via "Vragen waar ik opsla" toont de statusregel de grootte, bv. "Opgeslagen: … (38.2 MB)". Mislukt het, dan krijg je een melding en gaat het bestand naar Downloads.
- **Detailstrook** en **Alle punten** lezen het oorspronkelijke bestand opnieuw; die werken pas weer als je dat bestand opnieuw kiest.

**3D-weergave.** Klik **3D** in het bovenaanzicht.

&#91;image: 3D-weergave van de kade met bodempeiling\]

| Knop / muis | Wat het doet |
| --- | --- |
| Slepen | Draaien |
| Muiswiel | In- en uitzoomen |
| Rechtermuisknop slepen | Verschuiven |
| Boven / Schuin / ⟳ 90° | Vast aanzicht: van boven, schuin vanuit het noordwesten, 90° verder draaien |
| Vlak | Wisselen tussen draadmodel en gevuld vlak |
| ⛶ | Volledig scherm |
| Lagen (linksboven) | Elke laag los aan of uit: bodem, brug, water, doorvaartbox, conflicten, schip, maaiveld, begroeiing, doorloopprofiel, as |
| Naar brug / Naar snoeipunt | Camera naar de doorvaart onder de brug, of naar het volgende snoeipunt (klik nog eens voor het volgende) |

Het 3D-beeld in de PDF neemt het standpunt over dat je hier hebt ingesteld. Heb je de 3D-weergave niet geopend, dan kijkt het vanaf het water naar de kade.

## Stap 7 — Naar AutoCAD, Civil 3D en QGIS

Onder UITVOER in het lint staan naast PDF… twee knoppen. Beide schrijven in RD New (EPSG:28992) met hoogtes in m NAP.

| Knop | Wat je krijgt | Openen in |
| --- | --- | --- |
| **DXF** (AutoCAD) | Dezelfde bladen als de PDF, elk als layout met kader, stempel en viewports op schaal. In model space de situatie in RD/NAP (3D) en de lengte- en dwarsprofielen op ware grootte ernaast. Elk onderdeel op een eigen laag (PV\_…), eenheden in meters, met geolocatie. Zie DXF met bladen | AutoCAD, Civil 3D |
| **GeoPackage** (QGIS) | Lagen met opmaak: as\_lijn, dwarsprofiel\_lijnen, dwarsprofiel\_3d, profielpunten (met hoogte en verschil A/B), lengteprofiel, bgt\_grenzen; met de toetsen ook doorvaart\_box, doorvaart\_conflicten, snoeipunten, snoeiprofiel, begroeiing\_in\_profiel en kadastrale\_percelen | QGIS (ook 3D-kaartweergave), ArcGIS, FME |

- **In QGIS in 3D**: open de GeoPackage en kies Beeld → 3D-kaartweergaven → Nieuwe 3D-kaartweergave. De 3D-lagen staan op hun echte hoogte.
- **As terug inlezen**: met **As inlezen…** (lint, AS) lees je een as uit een eigen GeoPackage of DXF van de viewer weer in. Ook een as uit GeoJSON, shapefile of een andere DXF werkt.

**As uit het NWB.** Met **NWB-as…** (lint, AS) haal je de hartlijnen uit het Nationaal Wegenbestand van PDOK op, in het gebied van de puntenwolk. Kies *wegen, straten, fietspaden* of *vaarwegen*. Daarna kies je een straat in de lijst, of je klikt op een lijn in het bovenaanzicht; de lijst toont naam, lengte en beheerder. Klik dan op **Maak as**. De aansluitende wegvakken worden aan elkaar geregen; bij een rotonde of splitsing neemt de viewer de langste doorgaande route. Alleen het deel bij de puntenwolk wordt de as. Het NWB ligt op ± 1 m nauwkeurig, dus pas de as daarna zo nodig aan. Hiervoor is internet nodig.

**Links en rechts los.** Bij Profiel vul je **links** en **rechts** apart in, in meters, gezien in de richting van oplopend station. Dat werkt overal door: in de dwarsprofielen (ook uit alle punten), de BGT-doorsnede, het bovenaanzicht, de PDF, DXF, IFC en GeoPackage. Bij oudere projecten wordt de breedte gelijk verdeeld.

## Doorvaartcontrole

De doorvaartcontrole toetst of een doorvaartprofiel (breedte × hoogte boven een toetswaterstand, eventueel met een vereiste diepte) vrij is onder een brug. De toets gebruikt de ruwe meetpunten van de onderzijde van de brug, niet een gemiddeld vlak.

1. Open de bodempeiling als puntenwolk (stap 1) en teken of lees de **as van de vaarweg** in, in de vaarrichting.
2. Vul bij het dwarsprofiel eventueel het **waterpeil** in.
3. Klik in het lint **TOETS → Doorvaart…** en open de scan van de **onderzijde** van de brug. De **bovenzijde** is optioneel en alleen voor het beeld.
4. Vul het doorvaartprofiel in en klik **Controleren**. Het dwarsprofiel springt naar het kritieke punt.

&#91;image: Het venster Doorvaartcontrole met de maten, het resultaat en de maatgevende doorsnede\]

| Veld | Betekenis |
| --- | --- |
| Toetswaterstand | Waterstand waartegen de hoogte wordt getoetst, bv. maatgevend hoogwater. Leeg = het waterpeil van het dwarsprofiel |
| Hoogte H / Breedte B | Het doorvaartprofiel: H boven de toetswaterstand, B breed |
| Verschuiving | Midden van het profiel t.o.v. de as (+ = rechts) |
| Vereiste diepte D + waterstand diepte | Leeg = geen dieptetoets. Anders mag de bodem binnen het profiel niet hoger liggen dan die waterstand − D |
| Lengte / marge | Stations waar het profiel ligt; leeg = automatisch: waar de brug ligt plus de marge (standaard 10 m) |
| Ruisfilter | Losse punten (vogels, spatwater) tellen niet mee: een punt telt als er binnen 0,5 m genoeg andere punten liggen |
| Maatgevend schip | CEMT-klasse I t/m Va of eigen maten; alleen voor de tekening, de toets is het profiel zelf |

**Wat je terugkrijgt**

- **Oordeel** met de kleinste vrije hoogte (en waar), het tekort, de vrije breedte op hoogte H, de kleinste waterdiepte en hoeveel losse punten zijn genegeerd.
- **Profielen**: het doorvaartprofiel als streep-stippellijn, de brug als grijze doorsnede, conflicten rood gearceerd, maatvoering en het schip als lijnwerk.
- **3D**: brug, water, het profiel (groen = voldoet, rood = voldoet niet) en de conflictpunten. Met **Naar brug** sta je er direct voor.
- **PDF**: het blad Doorvaartcontrole met de maatgevende doorsnede op grote schaal, de uitgangspunten, het oordeel en het dwarsprofiel bij het kritieke punt.
- **GeoPackage**: doorvaart\_box en doorvaart\_conflicten. De brugscans gaan mee in het project.

&#91;image: 3D-weergave: brugscan boven de vaarweg met het doorvaartprofiel en de plek waar het knelt\]

Je kunt de maten achteraf aanpassen; het oordeel rekent direct opnieuw. Het oordeel is een toets op de meetgegevens en hoort te worden beoordeeld door een specialist.

## Snoeicheck

De snoeicheck zoekt alle begroeiing die in de vrije doorloopruimte boven een pad hangt, en maakt daar een genummerde snoeikaart en snoeilijst van. Standaard is de vrije ruimte 2,00 m breed × 2,50 m hoog boven het pad, met 0,50 m snoeimarge.

1. Open de scan van het pad en de bomen als puntenwolk (stap 1) en teken of lees de **as van het pad** in.
2. Klik **TOETS → Snoeien…** en dan **Uit puntenwolk A** (dezelfde scan) of **Ander bestand…**. De viewer leest alle punten in een strook langs de as opnieuw in, in 3D, zodat takken blijven staan.
3. Haal eventueel de **kadastrale percelen** op (Ophalen (PDOK) of Bestand…).
4. Controleer de maten en klik **Controleren**. Klik in de snoeilijst op een regel om erheen te gaan.

&#91;image: Het venster Snoeicheck met begroeiing, percelen, het doorloopprofiel, het resultaat en de snoeilijst\]

| Veld | Betekenis |
| --- | --- |
| Breedte B / Vrije hoogte H | De vrije ruimte: B breed (midden op de as), H boven het pad. Het profiel volgt het pad, ook op een helling |
| Snoeimarge | Ruimer snoeien i.v.m. aangroei. Begroeiing hierin is oranje: meenemen, maar het pad is niet geblokkeerd |
| Verschuiving / Lengte | Midden van het profiel t.o.v. de as; welke stations (leeg = de hele as) |
| Negeer lager dan | Gras en lage planten tellen niet mee (standaard 0,30 m boven het eigen maaiveld) |
| Ruisfilter | Losse punten (vogel, vlieg, spinrag) tellen niet mee |
| Snoeipunt max. | Een doorlopende haag of bomenrij wordt genummerd in stukken van maximaal deze lengte (standaard 5 m) |
| Profiellijn = maaiveld | De lijn in de profielen volgt het maaiveld uit de snoeicheck, niet het terreinmodel van A (dat kan door de kronen lopen) |

**Het maaiveld** bepaalt de viewer zelf uit de laagste punten; bij een LAS met klasse 2 uit de grondpunten. Of A op boven- of onderkant staat, maakt voor de toets niet uit.

**De snoeilijst** geeft per snoeipunt: station, kant (L, R of L+R als het over het pad hangt), hoogte boven het pad, afstand tot het hart, hoeveel er terug moet, de soort (tak van opzij, kroon van boven, struik/stam vanaf de grond) en de RD-coördinaat. Rood = snoeien (in het profiel), oranje = meenemen (alleen in de marge).

**Kadastrale percelen.** Bij elk snoeipunt zoekt de viewer de stam van de boom (een kolom begroeiing die van laag naar hoog doorloopt) en het perceel waar die stam staat. Op de kaart loopt een groene stippellijn van het snoeipunt naar de stam. De stam is een schatting; staat een struik precies op een perceelgrens, controleer het dan in het veld.

&#91;image: Snoeikaart: genummerde snoeipunten, perceelgrenzen met sectie en nummer en de stammen\]

**Uitvoer**

- **Bovenaanzicht en PDF**: de snoeikaart met profiel, marge, begroeiing, percelen en nummers.
- **PDF-bladen** Snoeilijst en Snoeilijst per perceel (handig voor de brief aan de eigenaar).
- **Snoeilijst (CSV)** in het venster: opent in Excel, met perceel en stamcoördinaat.
- **GeoPackage**: snoeipunten, snoeiprofiel, begroeiing\_in\_profiel en kadastrale\_percelen.
- **3D**: het profiel als tunnel over het pad; **Naar snoeipunt** loopt de punten af. Loopt het terreinmodel van A door de kronen, dan zet de viewer de laag Bodem uit en Maaiveld (strook) aan.

&#91;image: 3D: het doorloopprofiel als tunnel over het pad, met de takken in rood en oranje\]

## Stationering: dijkpalen en hectometrering

Met **Stationering…** (lint, groep As) heet een plek op de as "DP 12 +40" in plaats van "station 342 m": 40 m voorbij dijkpaal 12, gemeten langs de as. De meters blijven de basis; de stationering komt er overal bij.

| Keuze | Wat je opgeeft | Zo ziet het eruit |
| --- | --- | --- |
| Meters (standaard) | niets | st. 342,0 m |
| Dijkpalen uit een bestand | GeoPackage, GeoJSON, CSV/TXT (x;y;naam) of DXF met teksten | DP 12 +40 |
| Hectometrering berekenen | de kilometrering bij station 0 en de richting | hm 12.3 +40 |

1. Lees de as in en klik **Stationering…**.
2. Kies **Bestand…** en open de dijkpalen. Elke paal wordt loodrecht op de as gelegd; palen verder dan **max. tot de as** (standaard 50 m) tellen niet mee.
3. Controleer rechts in het venster: palen op de as, de afstand ertussen en begin en eind van de as. Lopen de paalnummers tegen de as in, dan zegt het venster dat; klik dan **⇄ Omdraaien**.
4. Vink **dwarsprofielen op de palen uitlijnen** aan voor een profiel op elke paal en daartussen om de interval.

Staat in het bestand alleen een nummer (12), dan maakt het **voorvoegsel** er DP 12 van. Naast de pijltjes van het dwarsprofiel zit **ga naar**: typ 125, DP 12 +40, 12+40 of hm 3.4 +20 en druk Enter.

**Waar de stationering terugkomt:** stationslabel, palen in bovenaanzicht en lengteprofiel, titels van lengte- en dwarsprofielen in de PDF, de doorvaartregels, de snoeilijst (kolom dijkpaal), CSV, GeoPackage (laag stationering) en DXF. De palen worden mee opgeslagen in het project.

&#91;image: Bovenaanzicht met de dijkpalen DP 31 t/m DP 36 langs het pad, profielen op de palen uitgelijnd en DP-lijnen in het lengteprofiel\]

## Dekkingskaart

Een toets zegt alleen iets waar gemeten is; de dekkingskaart laat zien waar dat niet zo is. Ze rekent vanzelf mee bij de doorvaartcontrole en de snoeicheck, je hoeft niets aan te zetten.

Het toetsgebied wordt verdeeld in vakjes van 0,5 tot 2 m (afhankelijk van de puntdichtheid). Een vakje met minstens één meetpunt telt als gemeten.

| Toets | Wat moet gemeten zijn | Wat telt als meting |
| --- | --- | --- |
| Doorvaart — onderzijde | het deel van de box onder het brugdek (dek = bovenzijde, of ingesloten tussen gemeten vakjes) | ruisvrije punten van de onderzijde |
| Doorvaart — bodem (bij een vereiste diepte) | de hele box | de meetpunten van A, niet het terreinmodel dat over gaten heen trekt |
| Snoeicheck | het hele profiel + de marge | elk punt: grond, gras of begroeiing |

**In het resultaat** staat het percentage dat gemeten is en per niet-gemeten plek het station (en de dijkpaal), de offset, het oppervlak en de hoogte van de rand eromheen. Is er een gat, dan wordt het oordeel oranje, bijvoorbeeld "VOLDOET — 14 m² niet gemeten". Plekken kleiner dan 1 m² (bodem 2 m²) tellen mee in het percentage, niet in de lijst.

**In het bovenaanzicht** zijn niet-gemeten plekken gearceerd met een gestreepte rand en een label. De PDF krijgt bij de doorvaart een eigen blad **Dekkingskaart**: de box langs de as met de gaten genummerd, en een tabel met per plek of de rand dicht bij de toets ligt ("nameten"). De GeoPackage krijgt de laag niet\_gemeten.

&#91;image: PDF-blad Dekkingskaart: de doorvaartbox langs de as met drie genummerde niet-gemeten plekken en de tabel eronder\]

Vuistregel: een rand die ruim boven de box ligt (onderzijde) of ruim onder de vereiste diepte (bodem) maakt een klein gat onschuldig. Ligt de rand er dichtbij of in, laat die plek dan nameten voordat je "voldoet" rapporteert.

## IFC 4.3 (openBIM)

**IFC 4.3** (lint, groep Uitvoer) maakt één IFC-bestand voor Civil 3D, Solibri, Navisworks, BIMcollab, Revit of BlenderBIM. Het exporteert de actieve as met alles wat erbij hoort, georefereerd in RD New en NAP.

| In het bestand | Als | Waarvoor |
| --- | --- | --- |
| De as | IfcAlignment, horizontaal en verticaal (uit het lengteprofiel) | stationering en de aslijn in 3D |
| Station 0, dijkpalen, hectometers | IfcReferent, met afstand langs en tot de as | dezelfde stationering als in de viewer |
| Maaiveld | terrein-driehoeksnet in een strook langs de as | ondergrond voor het ontwerp |
| Dwarsprofielen | 3D-lijnen op de echte plek | controle van het ontwerp per profiel |
| Doorvaartbox, doorloopprofiel, snoeimarge | vrij te houden ruimte (IfcSpatialZone) | botsingscontrole tegen een brug- of beplantingsontwerp |
| Snoeipunten, conflicten, niet-gemeten plekken | objecten met hun gegevens (Lutrea\_…) | bevindingen in het BIM-model, te filteren op eigenschap |

De coördinaten in het bestand zijn lokaal ten opzichte van een basispunt (afgerond op 100 m); de software rekent ze via de kaartconversie terug naar RD. Het basispunt staat in de statusregel na het opslaan.

Voor het maaiveld kiest de export per vakje het laagste punt en haalt hij pieken zoals boomkronen eruit, met maximaal ongeveer 60.000 punten. Zo blijft het bestand licht: de testset bospad wordt 0,9 MB, de brug 1,8 MB.

&#91;image: Het IFC-bestand van de testset bospad: maaiveld, het doorloopprofiel als vrije ruimte en de snoeipunten als rode blokken\]

Het bestand is gecontroleerd met IfcOpenShell en web-ifc. Open het de eerste keer in je eigen Civil 3D of Solibri en meld wat er niet goed overkomt.

## DXF met bladen (AutoCAD / Civil 3D)

Vanaf versie 2.8.0 maakt **DXF** (lint, Uitvoer) één tekening met **dezelfde bladen als de PDF**. Je kunt hem in AutoCAD of Civil 3D net zo plotten als de PDF, maar de lijnen blijven bewerkbaar. De DXF gebruikt de instellingen uit het PDF-venster: formaat, schalen, welke bladen en de projectgegevens voor de stempel. In het PDF-venster staat daarom ook een knop **DXF maken** naast **PDF maken**.

**Wat er in de tekening zit**

| Waar | Wat |
| --- | --- |
| Layouts | Elk PDF-blad is een layout: 01 Bovenaanzicht, 02 Doorvaartcontrole, 03 Snoeilijst, 04 Lengteprofiel, 05 Dwarsprofielen st. … Met kader, stempel (projectgegevens, logo als tekst, QR-code), legenda en opmerkingen. Plotinstelling DWG To PDF.pc3 op ISO-papier |
| Viewports | Het bovenaanzicht en de profielen staan niet als losse lijnen op het blad: een viewport kijkt op schaal naar model space (zelfde schaal als de PDF). De viewports zijn vergrendeld en liggen op laag PV\_BLAD\_VIEWPORT, die niet plot |
| Model space, links | De situatie op RD-coördinaten en NAP: as, 3D-dwarsprofielen, BGT, bomen, kadaster, dijkpalen, snoeipunten, doorvaartbox, dekkingskaart |
| Model space, rechts | De lengte- en dwarsprofielen op ware grootte: 1 eenheid = 1 m in de lengte, de hoogte maal de overdrijving. Elk blad ligt onder het vorige |

Alles ligt op eigen lagen (PV\_PROF\_…, PV\_KAART\_…, PV\_BLAD\_…), met kleuren, lijndiktes, stippellijnen en transparantie zoals in de PDF. Pas je iets aan in model space, dan zie je dat meteen terug op het blad.

**Niet in de DXF**

- Luchtfoto, puntenwolkbeeld en het 3D-blad: dat zijn beelden. De kaart ligt op RD-coördinaten, dus de luchtfoto hang je in Civil 3D zelf achter het bovenaanzicht.
- Het Lutrea-logo staat als tekst in de stempel.
- De witte vulling achter de nummers van de gaten valt weg; de nummers staan er wel.

De tekening is gecontroleerd met ezdxf (0 fouten). Meldt AutoCAD bij het openen toch iets, typ dan eenmalig AUDIT.

## Projectmap en vakken (alle punten)

Vanaf versie 2.9.0 staat alles van een project in één map die je zelf kiest, bijvoorbeeld een map *Profielviewer* in de projectmap van de opdracht. De puntenwolk wordt daarin één keer omgezet naar vakken van 50 × 50 m met **alle** punten. Er gaat geen data meer verloren door uitdunnen.

| Map of bestand | Wat erin staat |
| --- | --- |
| `<map>.pvproj` | Het project: as, instellingen, verwijzingen. Klein, heet zoals de map |
| `puntenwolk\A - <scan>\` | De puntenwolk in vakken: `info.json`, een overzicht en `tegels\` met alle punten (hoogte, klasse, kleur). Eigen formaat van de viewer, ± 16 bytes per punt |
| `ondergrond\` | BGT, bomen en kadaster zoals opgehaald, zodat het project ook offline compleet is |
| `uitvoer\` | PDF, DXF, IFC, GeoPackage en CSV gaan hier zonder vragen naartoe. Bestaat de naam al, dan komt er \_2, \_3 achter |
| `backup\` | Vóór elk opslaan de vorige versie van het .pvproj; de laatste 10 blijven staan |

**Zo werkt het**

- **Puntenwolk openen**: de eerste keer vraagt de viewer om de projectmap. Daarna leest hij de scan één keer helemaal door en zet hem om naar vakken. Dat duurt even (16 miljoen punten ± 1 minuut). Open je dezelfde scan later opnieuw, dan gebruikt hij de vakken meteen.
- **Profielen**: die komen vanzelf uit alle punten. Na elke wijziging van de as leest de viewer alleen de vakken langs de as, dat duurt een paar seconden. De knop Alle punten staat dan vanzelf aan.
- **Bovenaanzicht**: ver uitgezoomd zie je een overzicht van ± 2 miljoen punten. Zoom je in tot ongeveer 16 vakken in beeld, dan laadt hij de volle vakken met alle punten.
- **Ook uit de vakken**: Detailstrook, de begroeiing van de snoeicheck en het vinkje maaiveld.
- **Opslaan** (Ctrl+S) schrijft `<map>.pvproj`; de vorige versie gaat eerst naar `backup\`. **Opslaan als** kiest een andere map; de vakken gaan mee.
- **Openen** (Ctrl+O): kies een projectmap, of klik op een recent project. Oude .json-projecten open je met **Los bestand (.json)**.
- **Zonder projectmap** kan nog steeds. Dan werkt alles zoals in versie 2.8, met de uitgedunde puntenwolk.

De originele scan blijft staan waar hij stond. Bewaar die zelf: de vakken zijn het eigen formaat van de viewer, geen LAS.

## Tips en veelgestelde vragen

**Vastgelopen?** Krijg je “Out of Memory”, dan was de puntenwolk te groot voor het geheugen van de browser. Klik op Vernieuwen: de viewer meldt bij de start waarbij het misging en zet het aantal punten terug naar 2 miljoen. Werk bij grote wolken liever met 2 miljoen punten plus Alle punten of Detailstrook dan met 10 miljoen.

| Probleem of vraag | Oplossing |
| --- | --- |
| Ik zie oude knoppen of een ouder versienummer | Er draait nog een oude viewer. Sluit alle vensters en start de nieuwe exe; kijk of naast de titel 2.10.0 (of nieuwer) staat |
| Mijn PDF-stempel en logo's zijn weg na de overstap naar 2.10.0 | Het eigen venster begint met lege instellingen. Neem ze over met **PROJECT → instellingen → Exporteren…/Importeren…** (zie Starten) |
| Het eigen venster blijft leeg of start niet | Start de exe met `--browservenster`: dan opent het oude Chrome/Edge-venster |
| Kleur blijft grijs bij een PTS | Kies **kleur → RGB (inmeting)**. Heeft de PTS geen kleurkolommen, dan is alleen "hoogte" mogelijk |
| Een hek of smalle muur geeft een kam van pieken | Zet **randen strak** aan (alleen bij oppervlak bovenkant) |
| Brugdek en waterbodem lopen door elkaar | Kies **oppervlak bovenkant** voor het dek of **onderkant** voor de bodem |
| Geen gekleurde BGT-band onder het profiel | De BGT heeft alleen lijnen, geen vlakken: je krijgt dan een maatketting. Staat BGT in het dwarsprofiel op **uit**? |
| Legenda niet zichtbaar in het dwarsprofiel op het scherm | Het paneel is te smal; sleep de middelste balk naar links |
| BGT ophalen of luchtfoto doet niets | Daarvoor is internet nodig (PDOK). Een eigen DXF of GeoJSON werkt altijd |
| Verticale "gordijnen" in het 3D-beeld | Dat zijn driehoeken tussen een hoog en laag punt (boom, kademuur naar de waterbodem). Het beeld is indicatief |
| PDF wordt groot of traag | Kies een lagere resolutie kaart, minder punten, of zet de luchtfoto uit |
| Projectbestand is leeg (0 KB) | Sinds 2.0.9 meldt de viewer het als opslaan mislukt. Sla opnieuw op; probeer anders zonder puntenwolk |
| Teksten op A0 te klein | Zet **Teksthoogte** op 3,5 of 5,0 mm |
| Het lint past niet op mijn scherm | Klik op de kop van een groep die je weinig gebruikt (bv. PROJECT) om hem in te klappen |
| Snoeicheck: "Uit puntenwolk A" is grijs | Puntenwolk A komt uit een project of er is nog geen as. Teken de as, of kies het bestand met "Ander bestand…" |
| Snoeicheck: melding dat de as is gewijzigd | De begroeiing is gelezen in een strook langs de oude as. Lees de begroeiing opnieuw in |
| De profiellijn loopt door de boomkronen | Zet in de snoeicheck "profiellijn = maaiveld uit de snoeicheck" aan, of lees A in met oppervlak onderkant en minder punten |
| Kadaster ophalen geeft een fout | Daarvoor is internet nodig (PDOK). Download de percelen anders zelf als GeoJSON of GeoPackage en kies Bestand… |
| Doorvaart: losse punten onder de brug geven een conflict | Verhoog het ruisfilter (aantal punten binnen 0,5 m) |

**Vuistregels voor een nette tekening**

- Teken de as in de leesrichting van de profielen (L en R).
- Kies breedte en interval vóór de PDF en controleer in het bovenaanzicht met het vinkje **dwarsprofielen** welke profielen er komen.
- Bekijk eerst het voorbeeld in het PDF-venster en maak met **Bladen** alleen het blad dat je wilt controleren.
