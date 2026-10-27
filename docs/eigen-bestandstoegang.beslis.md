---
beslis: eigen-bestandstoegang
titel: Eigen bestandstoegang, geen toestemmingsvragen meer (versie 2.10.2)
plan: eigen-bestandstoegang.plan.md
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer (Lutrea Group B.V.)
voorgelegd: 2026-10-27 09:35          # datum en tijd waarop de beslisser dit heeft gekregen; wordt door de skill gezet
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
---

> Legenda: ✅ akkoord of klaar · ✏️ akkoord, maar anders · ⏳ nog niet beoordeeld · 🔨 wordt gebouwd · ▶ vrijgegeven, nog niet gestart · ○ nog niet vrijgegeven · ⚠ vrijgave vervallen door planwijziging

# Beslisdocument: Eigen bestandstoegang, geen toestemmingsvragen meer (versie 2.10.2)

> **Nu van jou gevraagd:** de vrijgave van **F4** (oplevering 2.10.2: versie, LEESMIJ, handleiding, tests, exe en zip; daarna je controle van de handmatige lijst).
> **Later nodig:** niets.

Nu vraagt de viewer bij elke sessie opnieuw toestemming voor je projectmap, omdat de browser dat bewaakt. Straks leest en schrijft het programma je bestanden zelf, zodat die vragen verdwijnen, recente projecten na een herstart gewoon werken en het programma later (fase E) grote scans zelf kan omzetten. Het werk gaat in vijf fasen, en elke fase start pas na jouw akkoord.

## Vrijgave per fase
Een fase mag pas starten als de vrijgave er staat én alle besluiten waar de fase op leunt zijn genomen. Een vrijgave blijft geldig zolang het plan voor die fase en die besluiten niet is gewijzigd; het plan houdt dat bij in het wijzigingslog.

| Fase | Wat wordt gebouwd | Vrijgave | Door, wanneer | Leunt op | Gebouwd |
|---|---|---|---|---|---|
| F0 | Het programma kan zelf bestanden lezen en schrijven, afgeschermd zodat alleen het eigen venster dat mag | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-27 10:59 | B2 | ✅ 2026-10-27 11:06 |
| F1 | De gewone Windows-kiezer voor mappen en bestanden, vanuit het programma | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-27 11:07 | - | ✅ 2026-10-27 11:19 |
| F2 | De viewer gebruikt die nieuwe toegang voor de projectmap; alles werkt verder zoals je gewend bent | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-27 11:20 | B3 | ✅ 2026-10-27 13:34 |
| F3 | Recente projecten, PDF-map, los projectbestand, project openen vanaf een pad, puntenwolk op het venster slepen | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-27 13:43 | B1 | ✅ 2026-10-27 14:31 |
| F4 | Oplevering 2.10.2: versie, LEESMIJ, handleiding, tests, exe en zip | ○ nog niet | - | - | - |

Letterlijk akkoord (F0, via chat): "Akkoord, bouw F0 van eigen-bestandstoegang op planversie 1."

Letterlijk akkoord (F1, via chat): "Akkoord, bouw F1 van eigen-bestandstoegang op planversie 1."

Letterlijk akkoord (F2, via chat): "Akkoord, bouw F2 van eigen-bestandstoegang op planversie 1."

Letterlijk akkoord (F3, via chat): "Akkoord, bouw F3 van eigen-bestandstoegang op planversie 1."

## Overzicht besluiten
| | # | Onderwerp | Besluit | Nodig vóór |
|---|---|---|---|---|
| ✅ | B2 | Waar mag het programma lezen en schrijven | Ons voorstel | F0 |
| ✅ | B3 | Blijft de oude manier bestaan | Ons voorstel | F2 |
| ✅ | B1 | Wat gebeurt er met je lijst recente projecten | Ons voorstel | F3 |

## Besluiten

### ✅ B2 · Waar mag het programma lezen en schrijven
**Je beslist:** of het programma overal op je schijf bij mag, of alleen bij de mappen en bestanden die jij zelf hebt gekozen.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Alleen in mappen en bestanden die je zelf koos (kiezer, slepen, openen) of die in je recente projecten staan | Overal op je schijf, zolang het verzoek uit het eigen venster komt |
| **Voordeel** | Zelfs een fout in de viewer, of een kwaadaardig bestand dat je opent, kan niet buiten je projecten komen | Iets eenvoudiger te bouwen |
| **Nadeel** | Iets meer werk om bij te houden welke mappen gekozen zijn | Een fout of kwaadaardig bestand kan in principe overal bij |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-27 10:58 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B2

### ✅ B3 · Blijft de oude manier bestaan
**Je beslist:** of het oude venster (`--browservenster`) zijn projectmap nog op de oude manier mag openen, met toestemmingsvragen, als terugvaloptie.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Ja: in het eigen venster de nieuwe toegang, in het oude venster alles zoals in 2.10.1 | Nee: de oude manier verdwijnt helemaal |
| **Voordeel** | Je houdt een noodroute als er iets misgaat met de nieuwe toegang; de bestaande tests blijven werken | Minder code om te onderhouden |
| **Nadeel** | Twee manieren naast elkaar in de code | Geen terugval meer; alle tests moeten om |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-27 10:58 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B3

### ✅ B1 · Wat gebeurt er met je lijst recente projecten
**Je beslist:** of je huidige lijst recente projecten mee moet naar de nieuwe manier.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Een nieuwe lijst, die het programma zelf bijhoudt; elk project open je één keer opnieuw via de kiezer | De oude lijst overzetten bij de eerste start |
| **Voordeel** | Eenvoudig, en daarna blijft de lijst werken, ook na herstarten, zonder vragen | Je ziet je oude lijst meteen terug |
| **Nadeel** | De lijst begint leeg | Kan niet zonder voor elke map nog één keer toestemming te vragen, dus voor jou niet sneller |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-27 10:58 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B1

## Historie
Alleen aanvullen, nooit herschrijven. De technische uitvoeringsdetails staan in het plan, punt 11.

| Datum en tijd | Wat | Door |
|---|---|---|
| 2026-10-27 09:35 | Plan opgesteld en voorgelegd (Marco is een uur weg: "je hebt alle controle"; besluiten en vrijgave wachten op hem) | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 10:58 | Marco van Steenbrugge als beslisser bevestigd in deze sessie (eerder: "Ja ik ben Marco"), via chat | Marco van Steenbrugge, via chat |
| 2026-10-27 10:58 | B1, B2 en B3 akkoord met voorstel ("B1, B2 en B3 akkoord met jullie voorstel.") | Marco van Steenbrugge, via chat |
| 2026-10-27 10:59 | Vrijgave F0 op planversie 1 | Marco van Steenbrugge, via chat |
| 2026-10-27 11:06 | F0 gebouwd en per criterium getoetst (alle Go-tests groen, ook een extra controle op snelkoppelingen naar buiten de projectmap) | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 11:07 | Vrijgave F1 op planversie 1 | Marco van Steenbrugge, via chat |
| 2026-10-27 11:11 | F1 uitgevoerd en automatisch getoetst (kiezers modaal, annuleren werkt); wacht op Marco's controle met een echte keuze | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 11:18 | Marco bevestigt: "Ja: de kiezers openden vóór het venster, mijn gekozen map stond in de melding en na annuleren liep de viewer door." | Marco van Steenbrugge, via chat |
| 2026-10-27 11:19 | F1 gebouwd en per criterium getoetst | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 11:20 | Vrijgave F2 op planversie 1 | Marco van Steenbrugge, via chat |
| 2026-10-27 13:34 | F2 gebouwd en per criterium getoetst (alle 15 tests groen; omzetten via de nieuwe toegang 0,96 tot 1,37 keer de tijd van de oude, binnen de grens 1,5) | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 13:43 | Vrijgave F3 op planversie 1 | Marco van Steenbrugge, via chat |
| 2026-10-27 14:28 | F3 uitgevoerd en automatisch getoetst (alle tests groen; startparameter en tweede start in de echte exe gecontroleerd); wacht op Marco's controle op zijn laptop | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 14:31 | Marco meldt: "ik heb net F3 getest.. .geen problemen"; in het log op de ontwikkel-pc staat die test niet (één run 14:26–14:28 zonder kiezer of project). Per controlepunt nagevraagd | Marco van Steenbrugge, via chat |
| 2026-10-27 14:31 | Marco bevestigt: "Ja: in een hele sessie (map kiezen, omzetten, opslaan, PDF, herstarten en via Recent openen) kwam geen toestemmingsvraag; een .pvproj als parameter opende, ook met de viewer al open; een gesleepte .las/.laz opende." | Marco van Steenbrugge, via chat |
| 2026-10-27 14:31 | F3 gebouwd en per criterium getoetst | Claude Code, in opdracht van Marco van Steenbrugge |

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
