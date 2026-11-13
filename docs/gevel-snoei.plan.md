---
plan: gevel-snoei
titel: Snoeien langs gevels: vrije ruimte vanaf de voorgevel, as uit de BGT
versie: 1
status: ter-akkoord        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ⏳ · F1 ⏳ · F2 ⏳ · F3 ⏳ · F4 ⏳           # berekend door de skill
opgesteld: 2026-11-13
opgesteld_door: agent, Claude Opus 5.5 (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: gevel-snoei.beslis.md
basis_commit: a003d0d
vervangt: -
samenvatting: De snoeitool toetst ook de vrije ruimte vóór gevels: de as op de voorgevels (uit de BGT-panden), een box aan de straatkant van de gevel tot een vaste afstand (bv. 2 m), en alles wat daarin groeit komt op de snoeikaart en in de snoeilijst per perceel; ook zonder classificatie van de puntenwolk.
trefwoorden: [snoeien, gevel, voorgevel, pand, BGT, vrije ruimte, afstand tot gevel, box, perceel, kadaster, classificatie, groenindex]
---

# Plan: Snoeien langs gevels: vrije ruimte vanaf de voorgevel, as uit de BGT

## 1. In het kort
1. De snoeitool krijgt een soort toets **langs gevels**: tussen de voorkant van de gevel en een boom moet een vaste afstand vrij zijn (bijvoorbeeld 2 m), tot een vrije hoogte.
2. De **as** komt uit de **BGT**: je trekt ruw een lijn langs de straat en de viewer zoekt de voorgevels van de panden langs die lijn en maakt daar de as van.
3. De **box** ligt automatisch aan de straatkant van de gevel, van de gevel tot de afstand (bv. 2 m).
4. De **gevel zelf** telt niet als begroeiing, ook **zonder classificatie**: punten binnen het pand (BGT-omtrek) en een dunne strook langs de gevel tellen niet mee; kleur (groen) helpt waar de wolk RGB heeft; twijfel (een luifel, balkon of dakrand die uitsteekt) wordt gemarkeerd in plaats van stil als snoeipunt geteld.
5. De **snoeilijst per perceel**, zoals nu, met per snoeipunt de afstand tot de gevel.

## 2. Aanleiding en doel
Marco (chat, 2026-11-13): "de vraag is gekomen.. dat we een test uitvoeren... dat we een bepaalde afstand vanaf de gevels van woningen moeten gaan kijken. we moeten dus de as leggen op voorkant gevel en dan een box neerleggen langs die gevels en daarbinnen moeten we snoeien". Antwoorden op de vragen: "1) er moeten tussen voorkant gevel en de boom bv 2 meter zitten 2) het moet ook zonder classificatie kunnen werken 3) het mooiste zou zijn.. dat je voorkant gevel uit de BGT kan halen 4) per perceel zou het mooi zijn".

Nu (op a003d0d) kan het met de hand: as tekenen langs de gevel, breedte B = 2 m en verschuiving ±1 m. Maar de gevel zelf, vensterbanken, luifels en balkons tellen als begroeiing, en de as langs een hele straat met losse panden tekenen is veel werk.

Geslaagd als: in een straat met woningen zet je met één ruwe lijn de as op de voorgevels, de box ligt vanzelf aan de straatkant, en de snoeikaart en snoeilijst (per perceel) tonen alleen begroeiing binnen 2 m van de gevel, niet de gevels zelf, ook bij een puntenwolk zonder classificatie.

## 3. Onderzoek en bevindingen
Uit de code (op a003d0d):
- **Snoeicheck:** `voerSnoeiUit` (viewer.js) slaat bij de punten alleen grond (klasse 2, als die er is), ruis (klasse 7) en punten lager dan `minHoogte` boven het pad over. Gebouwpunten (klasse 6) en zonder classificatie alle punten van de gevel tellen dus als begroeiing.
- **Box:** `SN_STANDAARD` heeft `breedte`, `hoogte`, `marge`, `verschuiving` (midden t.o.v. de as); een box aan één kant kan nu alleen door verschuiving = ±B/2. De hoogte van het "pad" wordt per 0,5 m langs de as op het midden van de box uit het grondraster gehaald.
- **Kleur:** de strook van de begroeiing (`maakBegroeiingSink`) bewaart x, y, z en klasse, geen RGB; voor een groenindex moet de kleur mee de strook in (de lezers geven r, g, b al door aan `voegToe`).
- **BGT-panden:** de laag `pand` wordt al opgehaald (lijst van BGT-lagen, r. ± 653) en als vlak getekend; `bgtLagen` bevat de ringen. De voorgevel is een rand van zo'n ring.
- **As uit een externe bron:** `haalNwbOp` maakt al een as uit NWB-wegvakken; hetzelfde idee (lijnstukken zoeken, sorteren langs een lijn, as maken) is bruikbaar voor gevels.
- **Perceel:** de snoeilijst heeft al een kolom "boom op perceel" (kadaster, r. ± 15548).

## 4. Niet in scope
- Adressen (BAG) in de snoeilijst: per perceel volstaat (antwoord 4).
- Achtergevels en zijgevels: alleen de voorgevel aan de straatkant.
- Een machine-learning-classificatie van de puntenwolk.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Tussen voorkant gevel en boom bv. 2 m vrij | chat Marco, 2026-11-13 |
| Moet ook zonder classificatie werken | chat Marco, 2026-11-13 |
| Voorgevel bij voorkeur uit de BGT | chat Marco, 2026-11-13 |
| Snoeilijst per perceel | chat Marco, 2026-11-13 |
| Nederlands, geen build-stap, `window.__pvTest` blijft | CLAUDE.md |

## 6. Ontwerp en besluiten (technisch)
**Gevelmodus in de snoeitool.** Een keuze "langs een pad" (zoals nu) of "langs gevels". In de gevelmodus: afstand vanaf de gevel D (voorstel 2,0 m), vrije hoogte H boven het maaiveld, snoeimarge M zoals nu; de box loopt van de gevel (offset 0) tot D aan de straatkant. De straatkant volgt uit de BGT (de kant buiten het pand); bij een met de hand getekende as kies je L of R.

**As uit de BGT-voorgevels (F1).** Je trekt een ruwe lijn langs de straat (of gebruikt de bestaande as/NWB). De viewer zoekt randen van BGT-panden die (a) binnen 30 m van die lijn liggen, (b) ongeveer evenwijdig zijn (binnen 30°) en (c) met de buitenkant naar de lijn kijken; per pand de rand(en) aan de straatkant. Die randen worden gesorteerd langs de lijn en samengevoegd tot één as; tussen twee panden met een opening loopt de as recht door langs de lijn van de gevels (zodat stationering en lengteprofiel doorlopen), maar daar telt de box niet (geen gevel → niets te toetsen).

**Gevel en bouwdelen niet als begroeiing (F0, F2).**
- Met classificatie: klasse 6 (gebouw) en 17 (brug) tellen niet.
- Altijd: punten binnen een BGT-pand en binnen een strook van `GEVEL_ZONE` (voorstel 0,3 m) vanaf de gevel tellen niet.
- Zonder classificatie, met RGB: een groenindex (ExG = 2g − r − b) per punt; duidelijk niet-groen in de gevelzone tot 1 m (een luifel, balkon, dakrand) wordt "twijfel".
- Zonder classificatie en zonder RGB: punten die aan de gevel vastzitten (doorlopend vanaf de gevelzone, in een vlakke laag) worden "twijfel".
- Twijfel komt niet stil in de snoeilijst: een eigen kleur op de snoeikaart en een eigen regel "controleren (mogelijk bouwdeel)".

**Snoeilijst (F3).** Per perceel zoals nu, met per snoeipunt de kleinste afstand tot de gevel (m) en de hoogte.

**Verdieping per besluit:**

- **B1 Box langs de gevel** (nodig vóór F0). Voorstel: afstand D vanaf de gevel (standaard 2,0 m, instelbaar), aan de straatkant; vrije hoogte H boven het maaiveld (standaard 4,0 m, instelbaar). Alternatief: H tot de dakgoot van het pand (uit de punten). Een vaste H is voorspelbaar; tot de dakgoot hangt af van elk pand en van de scan.
- **B2 As uit de BGT** (nodig vóór F1). Voorstel: ruwe lijn langs de straat trekken, de viewer zoekt de voorgevels erbij. Alternatief: per pand de voorgevel aanklikken. Het voorstel is sneller voor een hele straat; aanklikken is preciezer bij hoekpanden.
- **B3 Bouwdelen zonder classificatie** (nodig vóór F2). Voorstel: niet stil wegfilteren maar markeren als "twijfel (mogelijk bouwdeel)", met kleur als hulpmiddel waar die er is. Alternatief: alles binnen 1 m van de gevel negeren. Negeren mist begroeiing die tegen de gevel groeit; markeren laat de keuze bij de controleur.
- **B4 Snoeilijst** (nodig vóór F3). Voorstel: per perceel zoals nu, plus de afstand tot de gevel per snoeipunt. Alternatief: per pand.
- **B5 Versie** (nodig vóór F4). Voorstel: samen met de andere openstaande opleveringen (2.16.0).

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ⏳ wacht op B1 | Gevelmodus: box van de gevel tot D aan één kant, vrije hoogte H; gebouwpunten (klasse 6/17, binnen het pand, gevelzone 0,3 m) tellen niet | 1. Testwolk met een gevel en een boom op 1,2 m van de gevel: de boom is een snoeipunt, de gevel niet (ook zonder classificatie). 2. Een boom op 2,5 m is geen snoeipunt. 3. Met classificatie telt klasse 6 niet. 4. Het gewone pad werkt zoals nu (bestaande tests groen). 5. `node run_alle.js` geheel groen. | B1 | M | Opus 5.5, medium | `F0:` |
| F1 | ⏳ wacht op B2 | As uit de BGT-voorgevels: ruwe lijn langs de straat → voorgevels → as; straatkant automatisch | 1. Testgegevens met vier panden langs een straat (één met een inspringende gevel, één hoekpand): de as ligt op de voorgevels (± 0,05 m) en volgt ze in de goede volgorde (screenshot). 2. De box ligt aan de straatkant. 3. Tussen twee panden telt de box niet. 4. `node run_alle.js` geheel groen. | F0, B2 | M | Opus 5.5, medium | `F1:` |
| F2 | ⏳ wacht op B3 | Zonder classificatie: kleur (groenindex) mee de strook in; luifel/balkon/dakrand als "twijfel" op de kaart en in de lijst | 1. Testwolk zonder classificatie met een luifel van 1 m (grijs) en een struik (groen) voor de gevel: struik = snoeipunt, luifel = twijfel. 2. Zonder RGB: de luifel (vast aan de gevel, vlak) = twijfel. 3. `node run_alle.js` geheel groen. | F0, B3 | M | Opus 5.5, medium | `F2:` |
| F3 | ⏳ wacht op B4 | Snoeilijst per perceel met afstand tot de gevel; PDF en GeoPackage | 1. Snoeilijst en PDF tonen per snoeipunt het perceel en de afstand tot de gevel (test op de PDF-tekst). 2. `node run_alle.js` geheel groen. | F1, F2, B4 | S | Opus 5.5, medium | `F3:` |
| F4 | ⏳ wacht op B5 | Opleveren (samen met de andere openstaande opleveringen) | 1. `node run_alle.js` geheel groen. 2. Installatietoets "fouten: geen". 3. Marco bevestigt op een echte straat. | F3, B5 | S | Opus 5.5, medium | `F4:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** De snoeilijst per perceel bevat kadastrale perceelnummers (zoals nu); geen namen of adressen.
**Beveiliging.** n.v.t. (BGT komt al van PDOK).
**Gebruikers en handleiding.** Snoeivenster: keuze "langs een pad" of "langs gevels", afstand vanaf de gevel; knop "As uit voorgevels (BGT)". Handleiding: stuk "Snoeien langs gevels".
**Beheer en configuratie.** Projectbestand: de gevelmodus en D.
**Releasenotes (kernpunten).** Snoeien langs gevels: vrije ruimte vanaf de voorgevel, as uit de BGT, gevel telt niet mee, ook zonder classificatie; twijfel bij bouwdelen.

## 9. Risico's en terugweg
- BGT-panden liggen niet altijd precies op de gevel (BGT-nauwkeurigheid ± 0,1–0,3 m). Terugweg: de gevelzone (0,3 m) en een knop om de as een paar centimeter te verschuiven.
- Uitstekende bouwdelen zonder classificatie en zonder RGB zijn niet zeker van begroeiing te onderscheiden. Terugweg: markeren als twijfel (B3), niet stil weglaten.
- Het gewone pad mag niet veranderen: de gevelmodus is een aparte keuze; bestaande tests blijven groen.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Tot welke hoogte moet het vrij zijn? | 4,0 m boven het maaiveld (instelbaar) |
| Geldt de 2 m ook boven de stoep tot aan de rijbaan, of alleen tot 2 m? | Alleen de strook van 0 tot D vanaf de gevel |
| Moeten hagen en tuinen van de bewoners zelf mee, of alleen openbaar groen? | Alles wat in de box groeit; het perceel in de lijst laat zien van wie het is |

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
| 1 | 2026-11-13 08:57 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- viewer.js op a003d0d: `voerSnoeiUit`, `SN_STANDAARD`, `maakBegroeiingSink`, `haalNwbOp`, BGT-lagen (`pand`), snoeilijst in `maakPdf`.
- index.html op a003d0d: Snoeivenster.
- Chat met Marco, 2026-11-13.

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
