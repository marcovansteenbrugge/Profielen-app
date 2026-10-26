---
beslis: webview2-venster
titel: Eigen programmavenster met WebView2 (versie 2.10.0)
plan: webview2-venster.plan.md
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer (Lutrea Group B.V.)
voorgelegd: 2026-10-26 22:06          # datum en tijd waarop de beslisser dit heeft gekregen; wordt door de skill gezet
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
---

> Legenda: ✅ akkoord of klaar · ✏️ akkoord, maar anders · ⏳ nog niet beoordeeld · 🔨 wordt gebouwd · ▶ vrijgegeven, nog niet gestart · ○ nog niet vrijgegeven · ⚠ vrijgave vervallen door planwijziging

# Beslisdocument: Eigen programmavenster met WebView2 (versie 2.10.0)

> **Nu van jou gevraagd:** controleer F2: start de viewer met `--browservenster`, kies onder Project bij "instellingen" **Exporteren…**, sluit, start de viewer gewoon, kies **Importeren…** met dat bestand en kijk of je PDF-stempel in het PDF-venster staat. Zeg daarna of het klopt.
> **Later nodig:** vrijgave van **F3** (oplevering 2.10.0).

De Profielviewer opent straks in een eigen Windows-venster in plaats van in een kaal Chrome- of Edge-venster, zonder welkomstschermen of een apart browserprofiel. De viewer zelf blijft hetzelfde; het werk gaat in vier fasen, en elke fase start pas na jouw akkoord.

## Vrijgave per fase
Een fase mag pas starten als de vrijgave er staat én alle besluiten waar de fase op leunt zijn genomen. Een vrijgave blijft geldig zolang het plan voor die fase en die besluiten niet is gewijzigd; het plan houdt dat bij in het wijzigingslog.

| Fase | Wat wordt gebouwd | Vrijgave | Door, wanneer | Leunt op | Gebouwd |
|---|---|---|---|---|---|
| F0 | Eigen venster: openen, sluiten, Afsluiten-knop, noodroute naar het oude venster | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-26 22:09 | B1, B2 | ✅ 2026-10-26 23:28 |
| F1 | Eén venster tegelijk, en het venster onthoudt plek en grootte | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-26 22:09 | - | ✅ 2026-10-26 23:43 |
| F2 | Instellingen meenemen uit het oude venster | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-26 23:46 | B3 | - |
| F3 | Oplevering 2.10.0: versie, LEESMIJ, handleiding, tests, exe en zip | ○ nog niet | - | - | - |

Letterlijk akkoord (F0 tot en met F1, via chat): "akkoord voor bouwen F0 en F1"

Letterlijk akkoord (F2, via chat): "F2 vrijgegeven"

## Overzicht besluiten
| | # | Onderwerp | Besluit | Nodig vóór |
|---|---|---|---|---|
| ✅ | B1 | Welke bouwsteen voor het venster | Ons voorstel | F0 |
| ✅ | B2 | Hoe kom je terug in het oude venster | Ons voorstel | F0 |
| ✅ | B3 | Hoe gaan je instellingen mee | Ons voorstel | F2 |

## Besluiten

### ✅ B1 · Welke bouwsteen voor het venster
**Je beslist:** met welk kant-en-klaar onderdeel we het nieuwe venster in de exe bouwen.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | `go-webview2` van jchv: levert venster en webweergave samen | `go-webview2` van Wails: alleen de webweergave, het venster bouwen we zelf |
| **Voordeel** | Minder eigen code; hier al proefgebouwd zonder extra bestanden | Bekendere, stabielere bron met officiële versienummers |
| **Nadeel** | Kleinere bron zonder officiële versienummers (we zetten de versie vast) | Meer eigen code voor het venster, meer kans op venstergedoe |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-26 22:09 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B1

### ✅ B2 · Hoe kom je terug in het oude venster
**Je beslist:** wanneer de viewer nog in het oude Chrome/Edge-venster opent.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Vanzelf als het nieuwe venster niet kan starten, én met de hand via een startoptie (`--browservenster`) | Alleen vanzelf als het nieuwe venster niet kan starten |
| **Voordeel** | Bij elk probleem met het nieuwe venster kun je meteen door | Eenvoudiger, één manier minder |
| **Nadeel** | Een extra optie om uit te leggen in de LEESMIJ | Gaat het nieuwe venster op een andere manier mis, dan heb je de oude exe nodig |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-26 22:09 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B2

### ✅ B3 · Hoe gaan je instellingen mee
**Je beslist:** hoe stempelgegevens, logo's en andere instellingen uit het oude venster in het nieuwe komen.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Knoppen "Instellingen exporteren" en "importeren": één keer in het oude venster exporteren, in het nieuwe importeren | Alleen een uitleg in de LEESMIJ: instellingen opnieuw invullen |
| **Voordeel** | Niemand hoeft stempel en logo's opnieuw in te stellen | Geen extra werk aan de viewer |
| **Nadeel** | Extra knoppen en een extra fase; recente projectmappen moet je wel één keer opnieuw openen | Elke collega moet alles opnieuw invullen |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-26 23:45 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B3, en punt 8 (gegevens en privacy)

## Historie
Alleen aanvullen, nooit herschrijven. De technische uitvoeringsdetails staan in het plan, punt 11.

| Datum en tijd | Wat | Door |
|---|---|---|
| 2026-10-26 22:06 | Marco van Steenbrugge bevestigd als beslisser ("Ja ik ben Marco"), via chat | Marco van Steenbrugge, via chat |
| 2026-10-26 22:06 | Plan opgesteld en voorgelegd | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-26 22:09 | B1 en B2 akkoord met voorstel ("B1 en B2 akkoord") | Marco van Steenbrugge, via chat |
| 2026-10-26 22:09 | Vrijgave F0 en F1 op planversie 1 | Marco van Steenbrugge, via chat |
| 2026-10-26 23:28 | F0 gebouwd en per criterium getoetst op Marco's laptop (venster, sluiten, noodroute, F12); tijden hierboven staan in UTC, vanaf hier lokale tijd | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-26 23:43 | F1 gebouwd en per criterium getoetst op Marco's laptop (tweede start, plek en grootte, buiten beeld) | Claude Code, in opdracht van Marco van Steenbrugge |
| 2026-10-26 23:45 | B3 akkoord met voorstel ("B3 akkoord") | Marco van Steenbrugge, via chat |
| 2026-10-26 23:46 | Vrijgave F2 op planversie 1 ("F2 vrijgegeven"); daarna toestemming: "daarna mag je alles pushen en committen" | Marco van Steenbrugge, via chat |
| 2026-10-26 23:51 | F2 uitgevoerd en automatisch getoetst (alle tests groen); wacht op Marco's controle van de PDF-stempel | Claude Code, in opdracht van Marco van Steenbrugge |

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
