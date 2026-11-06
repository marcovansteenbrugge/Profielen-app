---
plan: doorrijprofielen-rws
titel: Doorrijprofielen volgens RWS (profiel 1 en 2, meetpunten, doorrijbreedte)
versie: 1
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
voortgang: F0 ✅ · F1 ▶ · F2 ▶ · F3 ▶           # berekend door de skill
opgesteld: 2026-11-06
opgesteld_door: agent, Claude Opus 5.5 (claude-opus-5-5)
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
beslisdocument: doorrijprofielen-rws.beslis.md
basis_commit: dca7102
vervangt: -
samenvatting: De doorrijhoogte (2.13.0) uitbreiden naar een doorrijprofiel in RWS-stijl: profiel 1 en 2 aan voor- en achterkant van het kunstwerk, doorrijhoogtes op meetpunten uit de ruwe punten, minimale doorrijhoogte per rijbaan, doorrijbreedte op 0,5–1,0 m en een PDF-blad per profiel met drie decimalen en tekstvak.
trefwoorden: [doorrijprofiel, doorrijhoogte, doorrijbreedte, rijkswaterstaat, rws, productspecificaties, kunstwerk, viaduct, onderdoorgang, meetpunten, 2.14.0]
---

# Plan: Doorrijprofielen volgens RWS (profiel 1 en 2, meetpunten, doorrijbreedte)

## 1. In het kort
1. In het venster Doorrijhoogte komt een deel "Doorrijprofiel (RWS)": de viewer zet profiel 1 en 2 op de voor- en achterkant van het dak of kunstwerk.
2. In elk profiel meet hij de doorrijhoogte op meetpunten: de kant van de verharding (uit de BGT) en punten die je zelf aanklikt (wegmarkering, kantstreep + 1 m, ophangconstructies).
3. Die hoogtes komen uit de ruwe, niet uitgedunde punten rond het meetpunt, met het aantal punten en de spreiding erbij, zodat je ziet of de precisie-eis haalbaar is.
4. Per profiel de doorrijbreedte op 0,5–1,0 m boven de weg (tussen geleiderail, wanden of kolommen).
5. Een PDF-blad per profiel in RWS-stijl: maten in drie decimalen met punt (4.661), de minimale doorrijhoogte in rood, en een tekstvak (weg, rijbaan, station, meetdatum, profiel, object).

## 2. Aanleiding en doel
Marco legde de Productspecificaties Doorrijprofielen van Rijkswaterstaat (1 juli 2022, 45 blz.) en het wijzigingsdocument (2019 → 2022) voor met de vraag of we er iets aan hebben. De doorrijhoogte uit 2.13.0 geeft één kleinste vrije hoogte per box; RWS vraagt meer: twee vaste profielen per kunstwerk, hoogtes op voorgeschreven punten, de minimale doorrijhoogte per rijbaan, de doorrijbreedte en een vaste presentatie.

Geslaagd als: Marco voor een kunstwerk (LoZ.laz, Bergstraat) profiel 1 en 2 met hoogtes op de meetpunten, de minimale doorrijhoogte per rijbaan en de doorrijbreedte krijgt, en een PDF-blad per profiel dat herkenbaar is als RWS-doorrijprofiel.

## 3. Onderzoek en bevindingen
Uit de productspecificatie (bron: `Productspecificaties Doorrijprofielen-20220701.pdf`):
- **Definities (§ 1.1):** doorrijhoogte = afstand loodrecht op het wegdek tussen object en weggedeelte; minimale doorrijhoogte = de kortste daarvan, ook buiten de profielen (bijlage J); doorrijbreedte = minimale horizontale afstand haaks op de rijbaan tussen obstakels; obstakel = voorwerp dat bij aanrijding ernstige schade of letsel geeft.
- **Precisie (§ 2.2.1):** σ doorrijhoogte ≤ 1,0 cm; betrouwbaarheid (§ 2.2.2): proces aantoonbaar gecontroleerd. Precisie doorrijbreedte (§ 2.4.1): in de tekst niet uit te lezen (figuur), staat bij Open vragen.
- **Plaats van de hoogtes (§ 2.3.1 en 2.3.3):** minimale doorrijhoogte per rijbaan; 2 profielen aan beide zijden van het kunstwerk (profiel 1 = voorzijde in oplopende kilometrering, profiel 2 = achterzijde; bij onderdoorgangen rechts/links van de bovenliggende weg); kunstwerken met minder dan 3 m tussenruimte zijn één kunstwerk; per profiel hoogtes bij (a) de wegmarkeringen, (b) 1 m uit de kantstreep, (c) de kant verharding, (d) ophangconstructies die lager hangen dan het kunstwerk.
- **Doorrijbreedte (§ 2.5):** gemeten tussen 0,5 en 1 m hoogte (hoogte geleiderail); zonder duidelijke obstakels de kant verharding; obstakels tot ± 30 m voor of na het object tellen mee.
- **Presentatie (§ 2.6, bijlagen C–J):** foto per profiel per rijbaan met de maten; drie decimalen met een punt (wijzigingsdocument: "aantal decimalen en het decimaal scheidingsteken" toegevoegd in § 2.6 eis 1); tekstvak (wit) met rijksweg, rijbaan, kilometer, meetdatum, profiel, viaduct, minimale doorrijhoogte (rood).
- **AVG (§ 1.3):** personen en kentekens onherkenbaar in foto's en scans.

Uit de code (op dca7102):
- `voerDoorrijUit` (viewer.js, sectie Doorrijhoogte) berekent weg, dak, boxen en `vrijLangs` per station; de dakpunten zitten in `r.S/O/Z/cls`, uitgedund in 3D (bij LoZ vakjes van ± 4 cm).
- Ruwe punten langs lijnen lezen kan al: `maakProfielVerzamelaar` en `leesTegels` (nu in stukken van 32 MB) voor "Alle punten".
- BGT-grenzen in een dwarsprofiel: `bgtDoorsnede(station, pL, pR)` geeft grenzen met labels (weg, berm, …): bruikbaar voor de kant verharding. Wegmarkering staat niet in de BGT; de vakken hebben geen intensiteit, wel RGB.
- Beschikbare breedte bij hoogte H bestaat al in de doorvaart (`res.beschikbaar`, viewer.js r. ± 6024): zelfde idee, andere hoogte.
- PDF-bladen: het doorrijhoogteblad (F2 van plan doorrijhoogte) is de basis.

## 4. Niet in scope
- Foto's: RWS levert het doorrijprofiel op een foto. Wij tekenen het op het dwarsprofiel uit de puntenwolk. Een eigen foto toevoegen kan later.
- Wegmarkering automatisch herkennen uit de kleur van de punten: zie B1; eerst aanklikken.
- Portalen, uithouders, VRI's en TDI's (§ 2.3.4–2.3.5): kunnen met dezelfde meetpunten, maar zijn hier niet uitgewerkt.
- Verificatierapport, directorystructuur en bestandsnamen van RWS (bijlagen A en B).
- De precisie-eis zelf: die hangt af van de meting. De viewer laat zien hoeveel punten en welke spreiding er per meetpunt is, maar maakt een dronewolk niet nauwkeuriger.

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Bouwt voort op de doorrijhoogte (2.13.0); doorvaart blijft ongewijzigd | plan doorrijhoogte |
| RWS-productspecificatie is referentie, geen verplichting (gemeente 's-Hertogenbosch) | chat 2026-11-06 |
| Nederlands; RD/NAP; geen build-stap | CLAUDE.md |
| Nieuw hoofdstuk = minorversie | CLAUDE.md |

## 6. Ontwerp en besluiten (technisch)
**Stroom.**
1. Na "Controleren" in het venster Doorrijhoogte: deel "Doorrijprofiel (RWS)" met profiel 1 en 2 (B2), per profiel een lijst meetpunten (B1) en een tabel.
2. Hoogtes op de meetpunten (B3): de vakken langs de twee profiellijnen worden zonder uitdunnen gelezen (zoals "Alle punten"). Per meetpunt: weg = mediaan van de onderste laag binnen ± 0,10 m; dak = laagste niet-losse punt boven de weg binnen ± 0,10 m; doorrijhoogte = dak − weg. Erbij: aantal punten en de spreiding (standaardafwijking) van weg en dak.
3. Minimale doorrijhoogte per rijbaan: de kleinste vrije hoogte van de box van die rijbaan uit 2.13.0, ook buiten de profielen (bijlage J), met de plek.
4. Doorrijbreedte (B4): punten tussen 0,5 en 1,0 m boven de weg zijn obstakels; vanaf het midden van de rijbaan de vrije breedte naar links en rechts, in het profiel en tot 30 m ervoor en erna (kleinste telt).
5. Tekenen: in het dwarsprofiel van profiel 1 en 2 verticale pijlen per meetpunt met de hoogte, de doorrijbreedte als maatlijn op 0,75 m, de minimale doorrijhoogte rood.
6. PDF (B5, B6): een blad per profiel per rijbaan, met het profiel op schaal, de maten in drie decimalen met punt, en een wit tekstvak.

**Verdieping per besluit:**
- **B1 Meetpunten** (nodig vóór F0). Voorstel: automatisch de kant verharding links en rechts uit de BGT (grens tussen weg en iets anders in `bgtDoorsnede`), plus zelf meetpunten toevoegen door in het dwarsprofiel te klikken (wegmarkering, kantstreep + 1 m, ophangconstructie), met een soort per punt; verwijderen kan ook. Alternatief: wegmarkering automatisch zoeken op witte punten in de kleur (RGB) rond de profiellijn; meer werk en minder zeker bij schaduw onder een dak.
- **B2 Plaats van profiel 1 en 2** (nodig vóór F0). Voorstel: automatisch op de rand van het dak boven de rijbaan (eerste en laatste station met dak boven de box, 0,2 m naar binnen), profiel 1 aan de kant van het laagste station; zelf te verschuiven met een stationsveld. Alternatief: altijd zelf de stations invullen.
- **B3 Hoogtes uit ruwe punten** (nodig vóór F0). Voorstel: per meetpunt de niet-uitgedunde punten binnen ± 0,10 m, met aantal en spreiding in de tabel. Alternatief: uit de uitgedunde strook van 2.13.0 (sneller, maar vakjes van 3–5 cm, dus de precisie-eis van 1 cm is dan niet te onderbouwen).
- **B4 Doorrijbreedte** (nodig vóór F1). Voorstel: op 0,5–1,0 m boven de weg, in het profiel en tot 30 m ervoor en erna, kleinste breedte telt; zonder obstakel de kant verharding (BGT). Alternatief: alleen in de profielen zelf.
- **B5 Getalnotatie** (nodig vóór F2). Voorstel: alleen op het RWS-blad drie decimalen met punt (4.661), zoals de specificatie vraagt; de rest van de viewer houdt komma en twee decimalen. Alternatief: een instelling "RWS-notatie" voor de hele viewer.
- **B6 Tekstvak** (nodig vóór F2). Voorstel: wit tekstvak met weg/straat, rijbaan, station (en km/dijkpaal als de stationering aan staat), meetdatum, profiel (1 of 2), object, minimale doorrijhoogte (rood), bijzonderheden; weg, object en meetdatum in te vullen in het venster, meetdatum standaard uit de LAS-header. Alternatief: alleen de gegevens uit het titelblok van de PDF.
- **B7 Versie** (nodig vóór F3). Voorstel: 2.14.0, na 2.13.0.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig. Wacht een fase bewust op iets buiten dit plan in plaats van op de beslisser (zoals het einde van een blok of een livegang), zet dan aan het eind van "Hangt af van" `voorwaarde: <wat>`; tot haar vrijgave vraagt die fase niets van de beslisser.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | Profiel 1 en 2, meetpunten (BGT + aanklikken), hoogtes uit ruwe punten met aantal en spreiding, minimale doorrijhoogte per rijbaan, tabel en pijlen in het dwarsprofiel | 1. Nieuwe test met gemaakte wolk (weg met helling, dak met bekende onderkant, BGT-randen): profiel 1 en 2 op de dakranden (± 0,25 m), hoogtes op de meetpunten < 1 cm van de bekende waarden. 2. Een aangeklikt meetpunt verschijnt in de tabel en verdwijnt na verwijderen. 3. Minimale doorrijhoogte per rijbaan gelijk aan de kleinste vrije hoogte uit 2.13.0. 4. Schermafdruk op LoZ.laz. | B1, B2, B3 | L | Opus 5.5, medium | `F0:` |
| F1 | ▶ vrijgegeven | Doorrijbreedte op 0,5–1,0 m in de profielen en tot 30 m ervoor en erna | 1. Test met twee "geleiderails" op bekende afstand en een kolom 15 m voor het dak: breedte < 1 cm van de bekende, de kolom bepaalt de kleinste breedte. 2. Zonder obstakel: kant verharding als begrenzing. | F0, B4 | M | Opus 5.5, medium | `F1:` |
| F2 | ▶ vrijgegeven, na F1 | PDF-blad per profiel per rijbaan in RWS-stijl, met tekstvak | 1. Test maakt de PDF: per profiel een blad, maten met drie decimalen en punt, minimale doorrijhoogte rood in het tekstvak. 2. Render bekeken (schermafdruk). | F1, B5, B6 | M | Opus 5.5, medium | `F2:` |
| F3 | ▶ vrijgegeven, na F2 | Opleveren 2.14.0: LEESMIJ, handleiding, alle tests, bouwen, installatietoets, commit en tag; Marco controleert op LoZ.laz | 1. `node run_alle.js` eindigt met "Alle tests geslaagd". 2. `.\tools\bouw_installer.ps1 -Toets` eindigt met `fouten: geen`. 3. Exe, zip en setup in `dist`. 4. Marco bevestigt dat profiel 1 en 2 bij de Bergstraat kloppen. | F2, B7 | S | Opus 5.5, medium | `F3:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** Puntenwolken kunnen personen en kentekens bevatten (§ 1.3 van de specificatie). De viewer toont alleen punten, geen foto's; bij een eigen foto later moet dit opnieuw bekeken worden.
**Beveiliging.** n.v.t.: geen nieuwe routes of externe verbindingen.
**Gebruikers en handleiding.** Nieuw deel in het venster Doorrijhoogte, nieuw PDF-blad, uitleg in de handleiding (sectie Doorrijhoogte).
**Beheer en configuratie.** Meetpunten en tekstvak gaan mee in het project.
**Releasenotes (kernpunten).** Doorrijprofielen in RWS-stijl: profiel 1 en 2, hoogtes op meetpunten, minimale doorrijhoogte per rijbaan, doorrijbreedte, PDF-blad per profiel.

## 9. Risico's en terugweg
- Precisie: een fotogrammetrische dronewolk haalt σ ≤ 1 cm meestal niet. De tabel toont aantal en spreiding per meetpunt; het blad vermeldt dat de precisie van de meting afhangt.
- Onder een dak is de weg vaak deels niet gemeten: een meetpunt zonder weg krijgt "niet gemeten" in plaats van een overbrugde waarde.
- Ruwe punten lezen langs twee profielen is snel (alleen de vakken eronder), maar bij LoZ-dichtheid zijn dat honderden MB: in stukken lezen bestaat al.
- Terugweg: het is een los deel van het venster; de commits van een fase terugzetten raakt 2.13.0 niet.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Welke precisie-eis geldt voor de doorrijbreedte (§ 2.4.1, alleen als figuur in de PDF)? | Geen eis in de tool; aantal punten en spreiding tonen |
| Moet het blad ook "foto-achtig" (perspectief vanaf de weg) kunnen, zoals de RWS-voorbeelden? | Nee, dwarsprofiel op schaal |
| Voor wie is dit in eerste instantie: gemeente 's-Hertogenbosch of RWS-werk? | Gemeente; RWS-notatie als optie |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F0 | 2026-11-06 23:04 | 2026-11-06 23:31 | Marco van Steenbrugge | claude-opus-5-5, sessie edd2df6b-18e1-4f63-a42c-b1d21a3dc22e | medium | 66 / 38.189 | a63ff94 | transcript (Claude Code 2.1.317) |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F0 | 2026-11-06 23:31 | 1. Profiel 1 en 2 op de dakranden (± 0,25 m), hoogtes op de meetpunten < 1 cm van de bekende waarden | `node doorrijprofiel_rws.test.js`: profiel 1 st. 40,2, profiel 2 st. 59,8 (dak van 40 tot 60); kant verharding uit de BGT op ± 3,95 m; hoogtes 3,8938 / 3,6963 / 3,5038 / 3,3063 tegen verwacht 3,8948 / 3,6973 / 3,5048 / 3,3073 (1 mm); "fouten: geen" | gehaald |
| F0 | 2026-11-06 23:31 | 2. Een aangeklikt meetpunt verschijnt in de tabel en verdwijnt na verwijderen | zelfde test: klik op 1,5 m in profiel 1 → meetpunt "markering" op 1,49 m, h 3,7588 (verwacht 3,7588), "wegmarkering" in de tabel; na ✕ weg | gehaald |
| F0 | 2026-11-06 23:31 | 3. Minimale doorrijhoogte per rijbaan gelijk aan de kleinste vrije hoogte uit 2.13.0 | zelfde test: "3,353" van de box staat in de tabel "Minimale doorrijhoogte per rijbaan" | gehaald |
| F0 | 2026-11-06 23:31 | 4. Schermafdruk op LoZ.laz | `tests/uit/doorrijprofiel_rws_LoZ.png` en `_venster.png`: LoZ.laz zonder projectmap, ruwe punten onder profiel 1 en 2 in 169 s gelezen. De as is door mij afgeleid en ligt niet onder het dak, dus de profielen vallen op een paal en een auto (st. 0,2 en 57,7) en er is geen BGT: de inhoudelijke controle onder het dak volgt met Marco's as in F3 | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F0 | Profielen tonen via een tijdelijk station (drToon) in plaats van ze aan de dwarsprofielen toe te voegen | De gewone profielreeks (en de PDF-dwarsprofielen) blijft ongewijzigd |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-11-06 22:58 | Eerste versie | - | Nog geen vrijgave |

## 14. Bronnen
- Rijkswaterstaat, Productspecificaties Doorrijprofielen, versie 1 juli 2022 (45 blz.), §§ 1.1, 1.3, 2.2, 2.3.1, 2.3.3, 2.4, 2.5, 2.6, bijlagen C, J
- Rijkswaterstaat, Wijzigingen Productspecificaties Doorrijprofielen 2019 → 2022 (5 blz.)
- viewer.js op dca7102: sectie Doorrijhoogte (`voerDoorrijUit`), `bgtDoorsnede` r. 3277, `maakProfielVerzamelaar`, `leesTegels`, doorvaart `res.beschikbaar`
- plan doorrijhoogte (2.13.0)

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
