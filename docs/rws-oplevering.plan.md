---
plan: rws-oplevering
titel: RWS-opleverset voor de doorrijhoogte, met invulscherm en verificatierapport
versie: 2
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 ✅ · F3 ○ · F4 ✅           # berekend door de skill
opgesteld: 2026-11-09
opgesteld_door: agent, Claude Opus 5.5 (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: rws-oplevering.beslis.md
basis_commit: fcb3b4c
vervangt: -
samenvatting: Eén RWS-opleverset uit de Doorrijhoogte (bovenaanzicht, blad Doorrijhoogte met het oordeel, lengteprofiel, de doorsnedes van de kunstwerken) met een invulscherm voor de gegevens die niet uit de scan komen, een instelbaar hoogtebereik van het lengteprofiel met de kunstwerklabels boven het kunstwerk, en later een verificatierapport volgens de eisen van RWS.
trefwoorden: [RWS, oplevering, opleverset, verificatierapport, doorrijhoogte, doorrijprofiel, lengteprofiel, hoogtebereik, kunstwerk, invulscherm, PDF]
---

# Plan: RWS-opleverset voor de doorrijhoogte, met invulscherm en verificatierapport

## 1. In het kort
1. Eén keuze **RWS-oplevering** in het PDF-venster zet precies de vier onderdelen aan, in deze volgorde: **bovenaanzicht**, blad 2 **Doorrijhoogte** (overzicht: wat is getest, welke profielen, het resultaat en de doorrijhoogtes per doorsnede, B5), het **lengteprofiel** en **alle doorsnedes** van de kunstwerken (bij twee kunstwerken vier RWS-bladen).
2. Het **lengteprofiel** krijgt velden "hoogte van … tot … m NAP" (leeg = automatisch), op het scherm en in de PDF; de labels KW1 voor, KW1 achter enz. komen **boven het kunstwerk** te staan in plaats van bovenin de grafiek.
3. Een **invulscherm** voor wat niet uit de scan komt (opdrachtgever, meetbedrijf, meetmethode en instrument, uitgevoerd en gecontroleerd door, naast de bestaande weg, rijbaan, object, meetdatum en bijzonderheden); die gegevens komen op de bladen.
4. (versie 2) **De toets bewaren in het project**: bij opslaan gaat de strook van de doorrijhoogte, de gemeten doorsnedes en een vingerafdruk van de uitkomst mee; bij openen komt precies hetzelfde resultaat terug, zonder de scan opnieuw te lezen of de doorsnedes opnieuw te meten.
5. Later een **verificatierapport** volgens de RWS-eisen, met alle maten automatisch eruit. Die fase start pas als de eisen (hoofdstuk of bijlage van de Productspecificaties) en bij voorkeur een voorbeeld zijn aangeleverd.

## 2. Aanleiding en doel
Marco (chat, 2026-11-09): "Nu wil ik nadenken over een RWS opleverblad.. iets in de trent van het invul / test scherm wat we invullen.. en daar komen alle maten uit lopen... die moeten we denk ik terug laten komen. een door verrificatei rapport". Daarna: "wat leveren 1) bovenaanzicht 2) de inhoud onder het kopje Doorrijhoogte (daar staat dan Voldoet) 3) het lengteprofiel 4) alle 4 de doorsnedes" en "let op bij het lengteprofiel.. dat de tekst KW1 en KW2 boven het kunstwerk staan (misschien een invul veld maken.. vanaf welke hoogte tot welke hoogte het profiel zichtbaar".

Nu (op fcb3b4c) bestaan de onderdelen al als losse vinkjes in het PDF-venster (`pdfBovenaanzicht`, `pdfDoorrij`, `pdfRws`, `pdfLengteprofiel`, `pdfDwarsprofielen`), maar in een andere volgorde (bovenaanzicht, Doorrijhoogte, RWS-bladen, lengteprofiel, dwarsprofielen) en zonder één keuze voor de set. Het lengteprofiel schaalt de hoogte vanzelf; de kunstwerklabels staan vast bovenin de grafiek, waar ze in een echte scan over de dakpunten heen kunnen vallen. Een verificatierapport bestaat niet (bewust buiten scope gelaten in doorrijprofielen-rws).

Daarna (chat, 2026-11-09), bij het voorbeeld van blad 2: "dit wil ik allemaal zien" (het Resultaat en de RWS-tabellen uit het Doorrijhoogte-venster), "wat hebben we getest.. welke profielen... en wat is het resultaat in tekst.. daarna de profielen langs en dwars", over "2 m² niet gemeten": "dat staat ook 2 regels hoger... misschien het % groter neerzetten.. en bij het oordeel weghalen", en "Ja, opnemen".

Aanvulling (chat, 2026-11-09, versie 2): "en als ik het model opsla.. moet hij wel de toets onhouden.. en niet daarna opnieuw gaan rekenene... ik moet het zelfde resultaat krijgen als daarvoor"; op het voorstel (uitkomst in het projectbestand, bij openen dezelfde uitkomst, opnieuw rekenen alleen op verzoek): "helemaal goed"; daarna "voor nu heb je alle akkoord om het af te maken" en "je mag ze zelf goedkeuren".

Geslaagd als: met één keuze komt er een PDF met bovenaanzicht, blad Doorrijhoogte, lengteprofiel en de RWS-bladen van alle doorsnedes, in die volgorde, met de ingevulde gegevens op de bladen; in het lengteprofiel staan de labels boven het kunstwerk binnen een hoogtebereik dat je zelf kunt zetten.

## 3. Onderzoek en bevindingen
Uit de code (op fcb3b4c):
- **PDF-volgorde:** `maakPdf` maakt de pagina's in deze volgorde: Bovenaanzicht (viewer.js r. ± 14883), 3D-beeld, Doorvaart, …, Doorrijhoogte (r. ± 15157), RWS-bladen per doorsnede (r. ± 15262), …, Lengteprofiel (r. ± 15495), Dwarsprofielen. De volgorde van Marco (lengteprofiel vóór de doorsnedes) vraagt dus een andere volgorde voor deze set.
- **Vinkjes:** index.html r. ± 1026–1033; `pdfDoorrij` en `pdfRws` zijn alleen zichtbaar in de tool Doorrijhoogte. De titel van `pdfRws` zegt nog "Per profiel (1 en 2)" en klopt niet meer sinds de kunstwerken (meer doorsnedes).
- **Lengteprofiel:** `tekenLangs` → `tekenGrafiek(svgLangs, …, overdrijving, langsZoom)`; de hoogte komt uit de gegevens (hMin/hMax met 10 % marge) en de overdrijving. Er is geen vast hoogtebereik. De labels van de doorsnedes staan op `ly = margeT + 2·tegen` (bovenrand van de grafiek), los van het kunstwerk.
- **Invulgegevens nu:** `doorrij.rws` heeft weg, object (per kunstwerk), meetdatum, bijzonderheden, rijbaan; het RWS-blad heeft een tekstvak met vier regels. Het titelblok van de PDF heeft projectnaam, opdrachtgever, tekeningnummer enz. (`PDF_OPSLAG`).
- **RWS-eisen voor het verificatierapport:** niet in de repo en niet bekend; niet te verzinnen (zie Open vragen).

## 4. Niet in scope
- Een officiële RWS-goedkeuring of -toets: de viewer maakt de set; de toets doet RWS.
- Foto's bij de doorsnedes (staat op de wensenlijst).
- De inhoud van het verificatierapport vóórdat de eisen zijn aangeleverd.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Opleveren: bovenaanzicht, blad Doorrijhoogte (oordeel), lengteprofiel, alle doorsnedes | chat Marco, 2026-11-09 |
| Labels KW1/KW2 boven het kunstwerk; hoogtebereik van het lengteprofiel instelbaar | chat Marco, 2026-11-09 |
| Alle maten komen vanzelf uit de viewer; invullen alleen wat niet uit de scan komt | chat Marco, 2026-11-09 |
| Verificatierapport volgens RWS; eisen worden aangeleverd | chat Marco, 2026-11-09 |
| Nederlands, geen build-stap, `window.__pvTest` blijft | CLAUDE.md |

## 6. Ontwerp en besluiten (technisch)
**Opleverset.** Een knop of keuze "RWS-oplevering" in het PDF-venster (alleen in de tool Doorrijhoogte) zet `pdfBovenaanzicht`, `pdfDoorrij`, `pdfLengteprofiel` en `pdfRws` aan en de rest uit, en zet een vlag `inst.rwsSet`. Met die vlag maakt `maakPdf` de RWS-bladen ná het lengteprofiel (volgorde van Marco). De titel van `pdfRws` wordt "Per doorsnede van elk kunstwerk een blad in RWS-stijl…".

**Hoogtebereik lengteprofiel.** Twee velden in het paneel Lengteprofiel: "hoogte van … tot … m NAP" (leeg = automatisch). In `tekenGrafiek` (alleen lengteprofiel) vervangen ze hMin/hMax; in de PDF ook. Bewaard in het project.

**Labels boven het kunstwerk.** Per doorsnede het label op de hoogte van het hoogste dakpunt van dat kunstwerk (uit `drResultaat`, klasse 1/2, binnen de boxbreedte rond dat station) plus een kleine marge, geklemd binnen het zichtbare bereik; op het scherm blijft het label het sleephandvat.

**Invulscherm.** In het deel Doorrijprofiel (RWS) van het Doorrijhoogte-venster extra velden; ze komen in het tekstvak van de RWS-bladen en (opdrachtgever) in het titelblok.

**Verificatierapport.** Pas na aanlevering van de eisen; inhoud en vorm worden dan in een nieuwe planversie uitgewerkt.

**Verdieping per besluit:**

- **B1 Opleverset kiezen** (nodig vóór F1). Voorstel: één keuze "RWS-oplevering" die de vier onderdelen in de volgorde van Marco zet. Alternatief: alleen de volgorde aanpassen; de vinkjes zet je zelf.
- **B2 Hoogtebereik lengteprofiel** (nodig vóór F0). Voorstel: velden "hoogte van … tot … m NAP", leeg = automatisch, voor scherm én PDF. Alternatief: alleen in de PDF.
- **B3 Labels boven het kunstwerk** (nodig vóór F0). Voorstel: label net boven het hoogste dakpunt van het kunstwerk (binnen het zichtbare bereik). Alternatief: bovenin de grafiek laten staan en alleen het hoogtebereik instelbaar maken.
- **B5 Inhoud van blad 2** (nodig vóór F1). Besloten door Marco op basis van het voorbeeld (`docs/rws-oplevering-blad2-voorbeeld.png`): een overzichtsblad zonder groot dwarsprofiel. Links 1. Wat is getest (toets, box, gecontroleerd stuk, meetpunten, niet meegeteld), 2. Welke profielen (per kunstwerk de stations en hoek, KW1 voor/achter enz., en op welk blad lengte- en dwarsprofielen staan), 3. Resultaat (kleinste vrije hoogte, speling, minimale doorrijhoogte, laagste in de doorsnedes, weg gemeten onder het dak met het percentage groot, niet gemeten met de plek, oordeel). Rechts per doorsnede de tabel met kant links, as en kant rechts (offset, weg, dak, doorrijhoogte, dak bepaald, punten, spreiding), de laagste rood. Het oordeel zonder de m² niet gemeten (die staat al twee regels hoger), ook in het Doorrijhoogte-venster. Technisch: een nieuwe paginafunctie in `maakPdf` die bij de opleverset het huidige blad Doorrijhoogte vervangt; de gegevens komen uit `drRegels` en `drRws`.
- **B6 Toets bewaren** (nodig vóór F4). Voorstel: bij opslaan gaan mee (net als de strook van de snoeicheck, `project.begroeiing`): de strook van de doorrijhoogte (`drWolk`, en `drDak` als die er is) via `codeerWolk`, alle doorsnedes van `drRws` met hun ruwe punten (o, z), en een vingerafdruk van de uitkomst (oordeel, kleinste vrije hoogte per box, per doorsnede de doorrijhoogtes). Bij openen: strook terug, Controleren opnieuw uit die strook (zelfde invoer, zelfde uitkomst), de doorsnedes terug uit de bewaarde punten (niet opnieuw lezen), en de uitkomst vergeleken met de vingerafdruk; gelijk: "toets van <datum> hersteld, zelfde uitkomst"; anders een melding met wat afwijkt. Alternatief: alleen de getallen bewaren en tonen zonder de strook (dan geen tekening van de punten na openen). Het voorstel houdt profielen, bladen en PDF volledig gelijk.
- **B4 Invulscherm** (nodig vóór F2). Voorstel: extra velden in het bestaande Doorrijhoogte-venster (opdrachtgever, meetbedrijf, meetmethode en instrument, uitgevoerd door, gecontroleerd door). Alternatief: een apart venster "RWS-oplevering" met alle velden en een knop "Opleverset maken".

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Lengteprofiel: hoogtebereik van/tot (scherm en PDF, in het project) en labels boven het kunstwerk | 1. Met "van 9 tot 18" toont het lengteprofiel precies 9–18 m NAP, op het scherm en in de PDF (screenshot). 2. Leeg = automatisch zoals nu. 3. De labels KW1 voor/achter staan boven het dak van het kunstwerk, niet bovenin de grafiek (screenshot), en slepen werkt nog. 4. Het bereik komt terug na opslaan en openen. 5. `node run_alle.js` geheel groen. | B2, B3 | S | Opus 5.5, medium | `F0:` |
| F1 | ✅ gebouwd | Keuze RWS-oplevering: vier onderdelen in de volgorde bovenaanzicht, blad 2 Doorrijhoogte (overzicht volgens B5), lengteprofiel, doorsnedes; oordeel zonder m² (ook in het venster); titel `pdfRws` bijgewerkt | 1. Met de keuze heeft de PDF precies: Bovenaanzicht, Doorrijhoogte, Lengteprofiel, en per doorsnede een RWS-blad, in die volgorde (test op de paginatitels). 2. Blad 2 heeft de kopjes "Wat is getest", "Welke profielen", "Resultaat" en per doorsnede een tabel met kant links, as en kant rechts, en lijkt op het voorbeeld (screenshot). 3. Het oordeel staat zonder "m² weg niet gemeten", op blad 2 en in het venster. 4. Zonder de keuze blijft de PDF zoals nu. 5. `node run_alle.js` geheel groen. | F0, B1, B5 | S | Opus 5.5, medium | `F1:` |
| F2 | ✅ gebouwd | Invulscherm: extra velden, op de RWS-bladen en in het titelblok, bewaard in het project | 1. De ingevulde velden staan op elk RWS-blad (test op de PDF-tekst). 2. Ze komen terug na opslaan en openen. 3. `node run_alle.js` geheel groen. | F1, B4 | S | Opus 5.5, medium | `F2:` |
| F3 | ○ niet vrijgegeven | Verificatierapport volgens de RWS-eisen (inhoud en vorm volgen in een nieuwe planversie) | Wordt vastgesteld in de planversie na aanlevering van de eisen. | F2, voorwaarde: RWS-eisen voor het verificatierapport en bij voorkeur een voorbeeld aangeleverd door Marco | M | Opus 5.5, medium | `F3:` |
| F4 | ✅ gebouwd | Toets bewaren: strook, doorsnedes met ruwe punten en vingerafdruk in het projectbestand; bij openen dezelfde uitkomst zonder de scan en zonder opnieuw te meten | 1. Na opslaan en openen (zonder de scan bij de hand) staan het resultaat, alle doorsnedes en hun doorrijhoogtes er weer, identiek tot op 0,1 mm (test). 2. De status meldt "toets … hersteld, zelfde uitkomst". 3. De PDF-opleverset na openen heeft dezelfde getallen als ervoor (test op de PDF-tekst). 4. Een project zonder bewaarde toets opent zoals nu. 5. `node run_alle.js` geheel groen. | F2, B6 | M | Opus 5.5, medium | `F4:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.
De oplevering (versie, LEESMIJ, handleiding, bouwen) gebeurt samen met de oplevering van het plan kunstwerken-doorsnedes (fase F7 daar, besluit B5).

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** Namen bij "uitgevoerd door" en "gecontroleerd door" komen op de bladen en in het projectbestand; geen andere verwerking.
**Beveiliging.** n.v.t.
**Gebruikers en handleiding.** PDF-venster: keuze RWS-oplevering; paneel Lengteprofiel: hoogtebereik; Doorrijhoogte-venster: extra invulvelden. De handleiding (Doorrijhoogte, doorrijprofiel RWS) krijgt een stuk "RWS-opleverset".
**Beheer en configuratie.** Projectbestand: hoogtebereik lengteprofiel en de invulvelden.
**Releasenotes (kernpunten).** RWS-opleverset met één keuze; hoogtebereik van het lengteprofiel; kunstwerklabels boven het kunstwerk; invulvelden op de RWS-bladen.

## 9. Risico's en terugweg
- Een vast hoogtebereik kan delen van het profiel buiten beeld laten vallen. Terugweg: leeg = automatisch.
- Een andere paginavolgorde alleen bij de opleverset; de gewone PDF blijft gelijk, dus bestaande werkwijzen veranderen niet.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Wat eist RWS precies in het verificatierapport (hoofdstuk of bijlage van de Productspecificaties Doorrijprofielen)? | F3 start niet |
| Is er een voorbeeld van een opleverblad of verificatierapport dat RWS of Lutrea al gebruikt? | Opmaak in de stijl van de bestaande RWS-bladen |
| Moet het 3D-beeld of de dekkingskaart ook in de opleverset? | Nee (alleen de vier onderdelen) |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-11-09 17:35 | 2026-11-09 17:49 | Marco van Steenbrugge ("Akkoord, bouw F0–F2") | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 54 / 32.444 | onbekend (commit volgt na deze toetsing) | transcript (Claude Code 2.1.317) |
| F1 | 2026-11-09 17:49 | 2026-11-09 18:09 | Marco van Steenbrugge ("Akkoord, bouw F0–F2") | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 72 / 28.925 | onbekend (commit volgt na deze toetsing) | transcript (Claude Code 2.1.317) |
| F2 | 2026-11-09 18:09 | 2026-11-09 18:22 | Marco van Steenbrugge ("Akkoord, bouw F0–F2") | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 30 / 13.762 | onbekend (commit volgt na deze toetsing) | transcript (Claude Code 2.1.317) |
| F4 | 2026-11-09 18:23 | 2026-11-09 18:35 | Marco van Steenbrugge ("voor nu heb je alle akkoord om het af te maken / je mag ze zelf goedkeuren") | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 12 / 3.260 | onbekend (commit volgt na deze toetsing) | transcript (Claude Code 2.1.317) |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-11-09 17:49 | 1. Met "van 9 tot 18" toont het lengteprofiel precies 9–18 m NAP, op het scherm en in de PDF (screenshot) | `node rws_oplevering.test.js` (`tests/uit/rws_oplevering_log.txt`): "F0-1 vast: {hMin 9, hMax 18, yBoven 24 = margeT 24, yOnder 251 = hoog 283 − margeB 32}"; PDF: "hoogte 9,00 - 18,00 m NAP"; `tests/uit/rws_oplevering_lengteprofiel.png` en `tests/uit/rws_oplevering_lengte_pdf.png` bekeken: as van 9,00 tot 18,00 | gehaald |
| F0 | 2026-11-09 17:49 | 2. Leeg = automatisch zoals nu | zelfde log: "F0-2 automatisch: {hMin 9.38, hMax 16.86}" (uit de gegevens met marge) | gehaald |
| F0 | 2026-11-09 17:49 | 3. De labels KW1 voor/achter staan boven het dak van het kunstwerk, niet bovenin de grafiek (screenshot), en slepen werkt nog | zelfde log: "F0-3 labels: onder 86.1 / dakTop 92.1 (KW1), onder 71 / dakTop 77 (KW2)": onderkant label 6 px boven de bovenkant van het dak; screenshots bekeken; slepen: `kunstwerken.test.js` in de volledige run "OK" (F1 na slepen en dubbelklik) | gehaald |
| F0 | 2026-11-09 17:49 | 4. Het bereik komt terug na opslaan en openen | zelfde log: "F0-4 na opslaan en openen: [\"9\",\"18\"]" | gehaald |
| F0 | 2026-11-09 17:49 | 5. `node run_alle.js` geheel groen | `tests/uit/run_alle_r0.log`: 30 tests "OK" (incl. rws_oplevering.test.js), "Alle tests geslaagd" | gehaald |
| F1 | 2026-11-09 18:09 | 1. Met de keuze heeft de PDF precies: Bovenaanzicht, Doorrijhoogte, Lengteprofiel, en per doorsnede een RWS-blad, in die volgorde (test op de paginatitels) | `node rws_oplevering.test.js` (`tests/uit/rws_oplevering_log.txt`): "F1-1 bladen: boven, doorrij, lengte, KW1 voor, KW1 achter, KW2 voor, KW2 achter" (7 bladen); vinkjes na de keuze: bovenaanzicht, doorrij, lengteprofiel, rws aan, dwarsprofielen en 3D uit | gehaald |
| F1 | 2026-11-09 18:09 | 2. Blad 2 heeft de kopjes "Wat is getest", "Welke profielen", "Resultaat" en per doorsnede een tabel met kant links, as en kant rechts, en lijkt op het voorbeeld (screenshot) | zelfde test: de PDF-tekst van blad 2 bevat "1. Wat is getest", "2. Welke profielen", "3. Resultaat", "4. Doorrijhoogtes per doorsnede", "KW1 voor", "KW2 achter", "kant links", "kant rechts", "Oordeel"; `tests/uit/rws_opleverset_blad2.png` en uitsnede `tests/uit/rws_blad2_tabel.png` bekeken: zelfde indeling als het voorbeeld, koppen leesbaar | gehaald |
| F1 | 2026-11-09 18:09 | 3. Het oordeel staat zonder "m² weg niet gemeten", op blad 2 en in het venster | zelfde log: "F1-3 venster: oordeel \"VOLDOET NIET\" \| groot %: true \| gat genoemd: true" (testgat onder KW1); blad 2: na "Oordeel" geen "m² weg niet gemeten" | gehaald |
| F1 | 2026-11-09 18:09 | 4. Zonder de keuze blijft de PDF zoals nu | `doorrijprofiel_rws.test.js`, `kunstwerken.test.js`, `dakmodel.test.js`, `bgt_onder_kunstwerk.test.js` (vaste paginavolgorde en RWS-bladen zonder de keuze) in de volledige run "OK"; in `rws_oplevering.test.js` F0-5 een PDF zonder de keuze met alleen het lengteprofiel | gehaald |
| F1 | 2026-11-09 18:09 | 5. `node run_alle.js` geheel groen | `tests/uit/run_alle_r1.log`: 30 tests "OK", "Alle tests geslaagd" | gehaald |
| F2 | 2026-11-09 18:22 | 1. De ingevulde velden staan op elk RWS-blad (test op de PDF-tekst) | `node rws_oplevering.test.js` (`tests/uit/rws_oplevering_log.txt`): "F2-1 invulvelden: blad 2 true/true/true \| RWS-bladen 4"; de test eist Meetbedrijf, Uitgevoerd door en Gecontroleerd door met hun waarde op alle 4 RWS-bladen, de waarden op blad 2 en de opdrachtgever in het titelblok; uitsnede `tests/uit/rws_tekstvak.png` bekeken | gehaald |
| F2 | 2026-11-09 18:22 | 2. Ze komen terug na opslaan en openen | zelfde log: "F2-2 na opslaan en openen: {meetbedrijf Lutrea, uitgevoerd M. van Steenbrugge, gecontroleerd J. Jansen, opdr Rijkswaterstaat}" | gehaald |
| F2 | 2026-11-09 18:22 | 3. `node run_alle.js` geheel groen | `tests/uit/run_alle_r2.log`: 30 tests "OK", "Alle tests geslaagd" | gehaald |
| F4 | 2026-11-09 18:35 | 1. Na opslaan en openen (zonder de scan bij de hand) staan het resultaat, alle doorsnedes en hun doorrijhoogtes er weer, identiek tot op 0,1 mm (test) | `node rws_oplevering.test.js` (`tests/uit/rws_oplevering_log.txt`): vingerafdruk vóór en na `projectRondjeVol` (project opgeslagen en geopend, strook en doorsnedes gewist, geen scan) gelijk: "oordeel voldoet niet, boxen [3.653], KW1 voor h [4.0938, 3.995, 3.8963] …" (4 doorsnedes); de test eist exacte gelijkheid op 0,1 mm | gehaald |
| F4 | 2026-11-09 18:35 | 2. De status meldt "toets … hersteld, zelfde uitkomst" | zelfde log: "F4-2 status: Doorrijhoogte: toets van 09-11-2026, 18:23 hersteld, zelfde uitkomst (voldoet niet, 4 doorsnedes)" | gehaald |
| F4 | 2026-11-09 18:35 | 3. De PDF-opleverset na openen heeft dezelfde getallen als ervoor (test op de PDF-tekst) | zelfde log: "F4-3 getallen blad 2 voor/na: 37 / 37 \| gelijk: true" | gehaald |
| F4 | 2026-11-09 18:35 | 4. Een project zonder bewaarde toets opent zoals nu | `werksoort.test.js`, `projectmap.test.js`, `project_losbestand.test.js`, `doorrijhoogte.test.js` (projectRondje zonder strook) in de volledige run "OK" | gehaald |
| F4 | 2026-11-09 18:35 | 5. `node run_alle.js` geheel groen | `tests/uit/run_alle_r4.log`: 30 tests "OK", "Alle tests geslaagd" | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F1 | Ook meegenomen: het automatische hoogtebereik van het lengteprofiel loopt nu tot de bovenkant van het kunstwerk (scherm en PDF); bij "verh. 1" viel het dak in de PDF buiten de grafiek. | Melding van Marco tijdens F1 (schermafdruk van de PDF) |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-09 17:25 | Eerste versie | - | Nog geen vrijgave |
| 2 | 2026-11-09 18:23 | Nieuwe fase F4 (toets bewaren in het project) met besluit B6, op verzoek van Marco | F4, B6 (nieuw) | F0-F2 blijven vrijgegeven; F4 vrijgegeven via delegatie (zie beslisdocument) |

## 14. Bronnen
- viewer.js op fcb3b4c: `maakPdf` (paginavolgorde), `tekenLangs`/`tekenGrafiek` (lengteprofiel, labels doorsnedes), `doorrij.rws`.
- index.html op fcb3b4c: PDF-venster (r. ± 1026–1033), Doorrijhoogte-venster.
- docs/kunstwerken-doorsnedes.plan.md (versie 5) en docs/doorrijprofielen-rws.plan.md.
- Chat met Marco, 2026-11-09 (wensen voor de opleverset).

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
