---
beslis: klassen-kiezen
titel: Kiezen welke classificaties worden ingelezen
plan: klassen-kiezen.plan.md
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
voorgelegd: 2026-11-06 14:31          # datum en tijd waarop de beslisser dit heeft gekregen; wordt door de skill gezet
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
---

> Legenda: ✅ akkoord of klaar · ✏️ akkoord, maar anders · ⏳ nog niet beoordeeld · 🔨 wordt gebouwd · ▶ vrijgegeven, nog niet gestart · ○ nog niet vrijgegeven · ⚠ vrijgave vervallen door planwijziging

# Beslisdocument: Kiezen welke classificaties worden ingelezen

> **Nu van jou gevraagd:** de testversie `dist	est\Lutrea-Profielviewer-2.12.1-test.exe` proberen op LoZ.laz; je controle is het laatste deel van F2.
> **Later nodig:** niets.

Bij het openen van een LAS of LAZ krijg je straks eerst een venstertje waarin je per classificatie (maaiveld, weg, gebouw, …) aanvinkt wat je wilt inlezen. Alleen dat komt in de vakken, zodat een zeer dichte wolk als LoZ.laz werkbaar wordt. Met de knop "Klassen wijzigen…" vink je later een klasse bij of af, zodat je de wolk stap voor stap aankleedt. Inzoomen werkt zoals nu (ingezoomd meer punten), alleen met de gekozen klassen. Het werk is verdeeld in drie fasen.

## Vrijgave per fase
Een fase mag pas starten als de vrijgave er staat én alle besluiten waar de fase op leunt zijn genomen. Een vrijgave blijft geldig zolang het plan voor die fase en die besluiten niet is gewijzigd; het plan houdt dat bij in het wijzigingslog.

| Fase | Wat wordt gebouwd | Vrijgave | Door, wanneer | Leunt op | Gebouwd |
|---|---|---|---|---|---|
| F0 | Het programma zet alleen de gekozen klassen om en noteert de keuze | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-11-06 14:34 | B1 | ✅ 2026-11-06 14:38 |
| F1 | Het venster met de vinkjes in de viewer, en de knop "Klassen wijzigen…" om later een klasse bij of af te vinken | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-11-06 14:34 | B1, B2 | ✅ 2026-11-06 15:05 |
| F2 | Uitleveren (tests, LEESMIJ, handleiding, exe en setup), met jouw controle op LoZ.laz | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-11-06 14:34 | B3 | - |

Letterlijk akkoord (F0 tot en met F2, via chat): "Akkoord, bouw F0–F2", als antwoord op de vraag "Akkoord met B1–B3 zoals voorgesteld, en bouwen op planversie 1, fase F0 t/m F2?"

## Overzicht besluiten
| | # | Onderwerp | Besluit | Nodig vóór |
|---|---|---|---|---|
| ✅ | B1 | Waar het filter zit | Ons voorstel | F0 |
| ✅ | B2 | Wanneer het venster verschijnt | Ons voorstel | F1 |
| ✅ | B3 | Welke versie | Ons voorstel | F2 |

## Besluiten

### ✅ B1 · Waar het filter zit
**Je beslist:** of de klassen die je niet kiest helemaal niet in de vakken komen, of dat alles erin gaat en je pas bij het bekijken filtert.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Filteren tijdens het omzetten: wat je niet kiest, komt niet in de vakken; later bij- of afvinken met "Klassen wijzigen…" | Eén keer omzetten met per klasse eigen vakken, en klassen in de viewer aan- en uitzetten |
| **Voordeel** | Vakken worden echt kleiner; vakkenformaat blijft gelijk | Wisselen zonder opnieuw om te zetten |
| **Nadeel** | Elke wijziging betekent opnieuw omzetten (bij LoZ ongeveer een minuut); tot het klaar is, houd je je oude keuze | Ander vakkenformaat; alles staat op schijf (bij LoZ 6,7 GB) |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-11-06 14:34 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B1

### ✅ B2 · Wanneer het venster verschijnt
**Je beslist:** of je bij elke nieuwe scan het venster met de vinkjes krijgt, of dat het een vaste instelling wordt.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Venster bij elke nieuwe LAS/LAZ met twee of meer klassen; je ziet het aandeel per klasse, en je vorige keuze staat al aangevinkt | Geen venster, een vaste instelling in het instellingenpaneel |
| **Voordeel** | Je ziet wat er in de wolk zit en kiest bewust | Geen extra klik bij het openen |
| **Nadeel** | Eén klik extra bij het openen | Je vergeet de instelling makkelijk en ziet niet wat er in de wolk zit |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-11-06 14:34 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B2

### ✅ B3 · Welke versie
**Je beslist:** of dit een eigen versie wordt na 2.12.0, of dat het in 2.12.0 meegaat (die wacht nu op jouw controle van de punten in het dwarsprofiel).

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Eigen versie 2.12.1, na 2.12.0 | Meenemen in 2.12.0 |
| **Voordeel** | 2.12.0 blijft zoals je hem controleert; kleine stap | Eén oplevering |
| **Nadeel** | Twee opleveringen kort na elkaar | Je moet 2.12.0 opnieuw controleren |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-11-06 14:34 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B3

## Historie
Alleen aanvullen, nooit herschrijven. De technische uitvoeringsdetails staan in het plan, punt 11.

| Datum en tijd | Wat | Door |
|---|---|---|
| 2026-11-06 14:31 | Plan opgesteld en voorgelegd | Claude Opus 5.5 (agent) |
| 2026-11-06 14:33 | Plan versie 1 aangevuld vóór enig besluit, op wens van Marco ("ja doe eerste dat je.. dan kan ik kiezen hoe ver ik hem aankleed"): knop "Klassen wijzigen…", alternatief bij B1 is nu vakken per klasse, uitdunnen blijft buiten dit plan | Claude Opus 5.5 (agent) |
| 2026-11-06 14:34 | B1, B2, B3 akkoord (ons voorstel) en vrijgave F0 tot en met F2 op planversie 1: "Akkoord, bouw F0–F2" | Marco van Steenbrugge, via chat |
| 2026-11-06 14:38 | F0 gebouwd: het programma zet alleen de gekozen klassen om (LoZ.laz met maaiveld en weg: 146,6 mln punten, 2,3 GB, 38 s) | Claude Opus 5.5 (agent) |
| 2026-11-06 15:05 | F1 gebouwd: het venster en de knop Klassen…; testversie gebouwd in dist	est | Claude Opus 5.5 (agent) |

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
