---
beslis: omzetten-in-exe
titel: Grote scans omzetten in het programma zelf (versie 2.11)
plan: omzetten-in-exe.plan.md
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer (Lutrea Group B.V.)
voorgelegd: 2026-10-27 16:35          # datum en tijd waarop de beslisser dit heeft gekregen; wordt door de skill gezet
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
---

> Legenda: ✅ akkoord of klaar · ✏️ akkoord, maar anders · ⏳ nog niet beoordeeld · 🔨 wordt gebouwd · ▶ vrijgegeven, nog niet gestart · ○ nog niet vrijgegeven · ⚠ vrijgave vervallen door planwijziging

# Beslisdocument: Grote scans omzetten in het programma zelf (versie 2.11)

> **Nu van jou gevraagd:** de vrijgave van **F3** (oplevering 2.11.0); F4 (de LAZ-proef) kan los daarvan.
> **Later nodig:** B5 vóór F5 (na de proef in F4); vrijgave van F4 tot en met F6.

Nu zet de viewer een scan in het venster om naar vakken, op één processorkern en binnen het geheugen van het venster. Straks doet het programma dat zelf, op alle kernen en daarbuiten, met precies hetzelfde resultaat. Het werk gaat in zeven fasen: eerst LAS en PTS (versie 2.11.0), daarna LAZ (2.11.1), dat begint met een proef. Elke fase start pas na jouw akkoord.

## Vrijgave per fase
Een fase mag pas starten als de vrijgave er staat én alle besluiten waar de fase op leunt zijn genomen. Een vrijgave blijft geldig zolang het plan voor die fase en die besluiten niet is gewijzigd; het plan houdt dat bij in het wijzigingslog.

| Fase | Wat wordt gebouwd | Vrijgave | Door, wanneer | Leunt op | Gebouwd |
|---|---|---|---|---|---|
| F0 | Het programma kan een LAS omzetten naar vakken, precies zoals de viewer dat nu doet (nog zonder knop in de viewer) | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-27 16:49 | B1, B2 | ✅ 2026-10-27 17:05 |
| F1 | Hetzelfde voor PTS | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-27 17:06 | - | ✅ 2026-10-27 17:16 |
| F2 | De viewer laat het programma omzetten: scan kiezen met de Windows-kiezer, voortgang, knop Afbreken; lukt het niet, dan zoals nu | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-27 17:18 | B3, B4 | ✅ 2026-10-27 20:54 |
| F3 | Oplevering 2.11.0: versie, LEESMIJ, handleiding, tests, exe en zip | ○ nog niet | - | - | - |
| F4 | Proef: kan de LAZ-decoder van de viewer ook in het programma draaien, en hoe snel | ○ nog niet | - | - | - |
| F5 | LAZ omzetten in het programma | ○ nog niet | - | B5 | - |
| F6 | Oplevering 2.11.1: versie, LEESMIJ, handleiding, tests, exe en zip | ○ nog niet | - | - | - |

Letterlijk akkoord (F0, via chat): "F0 vrijgegeven"

Letterlijk akkoord (F1, via chat): "F1 vrijgegeven"

Letterlijk akkoord (F2, via chat): "F2 vrijgegeven"

## Overzicht besluiten
| | # | Onderwerp | Besluit | Nodig vóór |
|---|---|---|---|---|
| ✅ | B1 | Waar het omzetten draait | Ons voorstel | F0 |
| ✅ | B2 | Dezelfde vakken als nu | Ons voorstel | F0 |
| ✅ | B3 | Scan kiezen in het eigen venster | Ons voorstel | F2 |
| ✅ | B4 | Terugval als het programma niet kan omzetten | Ons voorstel | F2 |
| ⏳ | B5 | Hoe LAZ in het programma komt | **Nog niet beoordeeld** | F5 |

## Besluiten

### ✅ B1 · Waar het omzetten draait
**Je beslist:** of het programma zelf de scan omzet, of dat de viewer het blijft doen, maar dan op meerdere kernen.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Het programma (de exe) zet om, buiten het venster | De viewer blijft omzetten, maar verdeelt het lezen over meerdere kernen |
| **Voordeel** | Alle kernen, en het geheugen van het venster groeit niet mee met de scan; ook de basis om later de profielen sneller te maken | Minder werk; één plek waar het omzetten staat |
| **Nadeel** | Het omzetten bestaat dan twee keer (exe en viewer), dus een test moet bewaken dat ze gelijk blijven | Het geheugen blijft in het venster; het wegschrijven blijft op één kern |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-27 16:33 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B1

### ✅ B2 · Dezelfde vakken als nu
**Je beslist:** of het programma precies dezelfde vakken moet maken als de viewer nu, tot op de byte, of dat "gelijkwaardig" genoeg is.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Precies dezelfde vakken, overzichten en gegevens als nu | Dezelfde punten, maar het overzicht mag iets anders uitvallen |
| **Voordeel** | Een harde toets: de viewer zelf is de controle. Oude en nieuwe projectmappen zijn uitwisselbaar, en een project ziet er na opnieuw omzetten hetzelfde uit | Minder werk |
| **Nadeel** | Meer zorg in het nabouwen (bijvoorbeeld hoe halve millimeters worden afgerond) | Geen harde toets; een project kan er na opnieuw omzetten net anders uitzien |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-27 16:33 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B2

### ✅ B3 · Scan kiezen in het eigen venster
**Je beslist:** hoe je in het eigen venster een puntenwolk kiest, zodat het programma weet waar het bestand staat.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | "Openen…" bij de puntenwolk opent de Windows-kiezer van het programma. Slepen blijft werken, maar zet om zoals nu (bij slepen is het pad onbekend) | De huidige kiezer houden; het programma zet alleen om als het pad op een andere manier bekend is |
| **Voordeel** | Elke scan die je via Openen… kiest, gaat via de snelle route | Er verandert niets aan het openen |
| **Nadeel** | De kiezer ziet er net iets anders uit dan nu (de gewone Windows-kiezer) | Bijna geen scan gaat via de snelle route |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-27 17:17 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B3

### ✅ B4 · Terugval als het programma niet kan omzetten
**Je beslist:** wat er gebeurt als het programma een scan niet kan omzetten (onbekend formaat, fout).

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | De viewer meldt het en zet om zoals nu; het oude venster zet altijd om zoals nu | Alleen een foutmelding |
| **Voordeel** | Een scan die nu werkt, blijft altijd werken | Eenvoudiger; een fout valt meteen op |
| **Nadeel** | Het omzetten in de viewer moet blijven bestaan en getest worden | Een scan die nu werkt, kan ineens niet meer |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-27 17:17 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B4

### ⏳ B5 · Hoe LAZ in het programma komt
**Je beslist:** welke LAZ-decoder het programma gebruikt. Dit besluit leg ik pas voor na de proef in F4, met de meetuitkomsten erbij.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Dezelfde decoder als de viewer nu (laz-perf), in het programma gedraaid, één per kern | Een andere decoder, of LAZ in de viewer laten met meerdere kernen |
| **Voordeel** | Precies dezelfde uitkomst als nu; bewezen op een LAZ van 627 miljoen punten | Mogelijk sneller (andere decoder) of minder werk (in de viewer laten) |
| **Nadeel** | Onzeker of het zonder extra onderdelen werkt; daarvoor is de proef | Een andere decoder is onbewezen; in de viewer blijft het geheugen in het venster |

**Jouw keuze**
- [ ] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** nog niemand · **status** nog niet beoordeeld · **wacht op** Marco van Steenbrugge · **voorgelegd op** 2026-10-27 16:35 · **nodig vóór** F5

Meer uitleg: plan, punt 6, B5

## Historie
Alleen aanvullen, nooit herschrijven. De technische uitvoeringsdetails staan in het plan, punt 11.

| Datum en tijd | Wat | Door |
|---|---|---|
| 2026-10-27 16:35 | Plan opgesteld en voorgelegd | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 16:33 | B1 en B2 akkoord met voorstel ("B1 en B2 akkoord met jullie voorstel.") | Marco van Steenbrugge, via chat |
| 2026-10-27 16:49 | Vrijgave F0 op planversie 1 ("F0 vrijgegeven") | Marco van Steenbrugge, via chat |
| 2026-10-27 17:05 | F0 gebouwd en per criterium getoetst: de vakken van het programma zijn byte voor byte gelijk aan die van de viewer; 3 mln punten in ± 2,5 s | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 17:06 | Vrijgave F1 op planversie 1 ("F1 vrijgegeven") | Marco van Steenbrugge, via chat |
| 2026-10-27 17:16 | F1 gebouwd en per criterium getoetst: ook PTS-bestanden geven byte voor byte dezelfde vakken als de viewer, ook bij lastige bestanden | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 17:17 | B3 en B4 akkoord met voorstel ("B3 en B4 akkoord met jullie voorstel.") | Marco van Steenbrugge, via chat |
| 2026-10-27 17:18 | Vrijgave F2 op planversie 1 ("F2 vrijgegeven") | Marco van Steenbrugge, via chat |
| 2026-10-27 17:49 | F2 uitgevoerd en automatisch getoetst (alle tests groen; 16 mln punten in ± 10 s tegen ± 37 s in de viewer); proefversie klaar, wacht op Marco's controle | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-27 18:22 | Marco meldt: "de test app werkt naar behoren"; in zijn test zijn de bestaande vakken van Halsteren hergebruikt, dus het omzetten zelf is nog niet bekeken. Nieuwe controle met een lege projectmap gevraagd. Gemeten: Halsteren in 11,1 s door het programma (2.9.1: 37 s), vakken gelijk | Marco van Steenbrugge, via chat; meting Claude Code |
| 2026-10-27 20:50 | Marco bevestigt: "Ja: met een lege projectmap zag ik de voortgang, de omzettijd stond in de statusregel, en Afbreken werkte." Het log laat zien dat er geen scan is omgezet maar een project is gekopieerd (Opslaan als); opnieuw nagevraagd, met de stappen erbij | Marco van Steenbrugge, via chat; controle log Claude Code |
| 2026-10-27 20:54 | Marco bevestigt: "Ja, volgens de stappen: na Nieuw en Openen… bij de puntenwolk zag ik de voortgang, de omzettijd stond in de statusregel, en Afbreken werkte." en "heb het alleen om gedraaid"; het log bevestigt het (afgebroken na 7,5 s, daarna omgezet in 9,7 en 9,5 s) | Marco van Steenbrugge, via chat |
| 2026-10-27 20:54 | F2 gebouwd en per criterium getoetst: Halsteren (52,5 mln punten) in ± 10 s door het programma, tegen 37 s in de viewer | Claude Code, in opdracht van Marco van Steenbrugge |

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
