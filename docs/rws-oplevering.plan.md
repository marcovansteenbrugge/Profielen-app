---
plan: rws-oplevering
titel: RWS-opleverset voor de doorrijhoogte, met invulscherm en verificatierapport
versie: 1
status: ter-akkoord        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ⏳ · F1 ⏳ · F2 ⏳ · F3 ○           # berekend door de skill
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
1. Eén keuze **RWS-oplevering** in het PDF-venster zet precies de vier onderdelen aan, in deze volgorde: **bovenaanzicht**, het blad **Doorrijhoogte** (met het oordeel, bv. "voldoet"), het **lengteprofiel** en **alle doorsnedes** van de kunstwerken (bij twee kunstwerken vier RWS-bladen).
2. Het **lengteprofiel** krijgt velden "hoogte van … tot … m NAP" (leeg = automatisch), op het scherm en in de PDF; de labels KW1 voor, KW1 achter enz. komen **boven het kunstwerk** te staan in plaats van bovenin de grafiek.
3. Een **invulscherm** voor wat niet uit de scan komt (opdrachtgever, meetbedrijf, meetmethode en instrument, uitgevoerd en gecontroleerd door, naast de bestaande weg, rijbaan, object, meetdatum en bijzonderheden); die gegevens komen op de bladen.
4. Later een **verificatierapport** volgens de RWS-eisen, met alle maten automatisch eruit. Die fase start pas als de eisen (hoofdstuk of bijlage van de Productspecificaties) en bij voorkeur een voorbeeld zijn aangeleverd.

## 2. Aanleiding en doel
Marco (chat, 2026-11-09): "Nu wil ik nadenken over een RWS opleverblad.. iets in de trent van het invul / test scherm wat we invullen.. en daar komen alle maten uit lopen... die moeten we denk ik terug laten komen. een door verrificatei rapport". Daarna: "wat leveren 1) bovenaanzicht 2) de inhoud onder het kopje Doorrijhoogte (daar staat dan Voldoet) 3) het lengteprofiel 4) alle 4 de doorsnedes" en "let op bij het lengteprofiel.. dat de tekst KW1 en KW2 boven het kunstwerk staan (misschien een invul veld maken.. vanaf welke hoogte tot welke hoogte het profiel zichtbaar".

Nu (op fcb3b4c) bestaan de onderdelen al als losse vinkjes in het PDF-venster (`pdfBovenaanzicht`, `pdfDoorrij`, `pdfRws`, `pdfLengteprofiel`, `pdfDwarsprofielen`), maar in een andere volgorde (bovenaanzicht, Doorrijhoogte, RWS-bladen, lengteprofiel, dwarsprofielen) en zonder één keuze voor de set. Het lengteprofiel schaalt de hoogte vanzelf; de kunstwerklabels staan vast bovenin de grafiek, waar ze in een echte scan over de dakpunten heen kunnen vallen. Een verificatierapport bestaat niet (bewust buiten scope gelaten in doorrijprofielen-rws).

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
- **B4 Invulscherm** (nodig vóór F2). Voorstel: extra velden in het bestaande Doorrijhoogte-venster (opdrachtgever, meetbedrijf, meetmethode en instrument, uitgevoerd door, gecontroleerd door). Alternatief: een apart venster "RWS-oplevering" met alle velden en een knop "Opleverset maken".

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ⏳ wacht op B2, B3 | Lengteprofiel: hoogtebereik van/tot (scherm en PDF, in het project) en labels boven het kunstwerk | 1. Met "van 9 tot 18" toont het lengteprofiel precies 9–18 m NAP, op het scherm en in de PDF (screenshot). 2. Leeg = automatisch zoals nu. 3. De labels KW1 voor/achter staan boven het dak van het kunstwerk, niet bovenin de grafiek (screenshot), en slepen werkt nog. 4. Het bereik komt terug na opslaan en openen. 5. `node run_alle.js` geheel groen. | B2, B3 | S | Opus 5.5, medium | `F0:` |
| F1 | ⏳ wacht op B1 | Keuze RWS-oplevering: vier onderdelen in de volgorde bovenaanzicht, Doorrijhoogte, lengteprofiel, doorsnedes; titel `pdfRws` bijgewerkt | 1. Met de keuze heeft de PDF precies: Bovenaanzicht, Doorrijhoogte (met oordeel), Lengteprofiel, en per doorsnede een RWS-blad, in die volgorde (test op de paginatitels). 2. Zonder de keuze blijft de PDF zoals nu. 3. `node run_alle.js` geheel groen. | F0, B1 | S | Opus 5.5, medium | `F1:` |
| F2 | ⏳ wacht op B4 | Invulscherm: extra velden, op de RWS-bladen en in het titelblok, bewaard in het project | 1. De ingevulde velden staan op elk RWS-blad (test op de PDF-tekst). 2. Ze komen terug na opslaan en openen. 3. `node run_alle.js` geheel groen. | F1, B4 | S | Opus 5.5, medium | `F2:` |
| F3 | ○ niet vrijgegeven | Verificatierapport volgens de RWS-eisen (inhoud en vorm volgen in een nieuwe planversie) | Wordt vastgesteld in de planversie na aanlevering van de eisen. | F2, voorwaarde: RWS-eisen voor het verificatierapport en bij voorkeur een voorbeeld aangeleverd door Marco | M | Opus 5.5, medium | `F3:` |

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
| 1 | 2026-11-09 17:25 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- viewer.js op fcb3b4c: `maakPdf` (paginavolgorde), `tekenLangs`/`tekenGrafiek` (lengteprofiel, labels doorsnedes), `doorrij.rws`.
- index.html op fcb3b4c: PDF-venster (r. ± 1026–1033), Doorrijhoogte-venster.
- docs/kunstwerken-doorsnedes.plan.md (versie 5) en docs/doorrijprofielen-rws.plan.md.
- Chat met Marco, 2026-11-09 (wensen voor de opleverset).

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
