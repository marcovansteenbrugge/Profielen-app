---
beslis: installatie
titel: Installer voor de Profielviewer (Inno Setup, per gebruiker)
plan: installatie.plan.md
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
voorgelegd: 2026-10-30 23:49          # datum en tijd waarop de beslisser dit heeft gekregen; wordt door de skill gezet
status: gebouwd        # berekend door de skill, nooit met de hand gezet
---

> Legenda: ✅ akkoord of klaar · ✏️ akkoord, maar anders · ⏳ nog niet beoordeeld · 🔨 wordt gebouwd · ▶ vrijgegeven, nog niet gestart · ○ nog niet vrijgegeven · ⚠ vrijgave vervallen door planwijziging

# Beslisdocument: Installer voor de Profielviewer (Inno Setup, per gebruiker)

> **Nu van jou gevraagd:** niets. F0 tot en met F2 zijn gebouwd en door jou gecontroleerd.
> **Later nodig:** niets.

De Profielviewer krijgt een setup.exe. Daarmee installeer je hem zonder beheerder, start je hem vanuit het startmenu en verwijder je hem via de Windows-instellingen. Dubbelklikken op een projectbestand (.pvproj) opent voortaan het project. Het werk is verdeeld in drie fasen.

## Vrijgave per fase
Een fase mag pas starten als de vrijgave er staat én alle besluiten waar de fase op leunt zijn genomen. Een vrijgave blijft geldig zolang het plan voor die fase en die besluiten niet is gewijzigd; het plan houdt dat bij in het wijzigingslog.

| Fase | Wat wordt gebouwd | Vrijgave | Door, wanneer | Leunt op | Gebouwd |
|---|---|---|---|---|---|
| F0 | De setup zelf: installeren, startmenu, verwijderen, plus een automatische installatietoets | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-30 23:50 | B1, B3, B4 | ✅ 2026-10-30 23:52 |
| F1 | Dubbelklikken op een .pvproj opent het project | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-30 23:50 | B2 | ✅ 2026-10-30 23:54 |
| F2 | Uitleveren als versie 2.11.4, met LEESMIJ, handleiding en jouw controle op je laptop | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-10-30 23:50 | B5 | ✅ 2026-10-31 00:04 |

Letterlijk akkoord (F0 tot en met F2, via chat): "Akkoord, bouw F0–F2", als antwoord op de vraag "Akkoord met de voorstellen B1 t/m B5 en vrijgave van F0 t/m F2?"

## Overzicht besluiten
| | # | Onderwerp | Besluit | Nodig vóór |
|---|---|---|---|---|
| ✅ | B1 | Waar komt de viewer te staan | Ons voorstel | F0 |
| ✅ | B2 | Welke bestanden openen met dubbelklikken | Ons voorstel | F1 |
| ✅ | B3 | Wat blijft er staan na verwijderen | Ons voorstel | F0 |
| ✅ | B4 | De viewer staat open tijdens installeren | Ons voorstel | F0 |
| ✅ | B5 | Blijft de losse exe bestaan | Ons voorstel | F2 |

## Besluiten

### ✅ B1 · Waar komt de viewer te staan
**Je beslist:** of iedere gebruiker de viewer zelf installeert, of dat hij één keer per pc met beheerdersrechten wordt geïnstalleerd.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Per gebruiker, in je eigen programmamap, zonder beheerder | Voor de hele pc, in Program Files, met beheerder |
| **Voordeel** | Iedereen kan zelf installeren en bijwerken, zonder IT | Eén installatie voor alle gebruikers van een pc |
| **Nadeel** | Een streng beveiligde laptop kan het blokkeren (vroeg testen) | Elke update vraagt een beheerder |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-30 23:50 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B1

### ✅ B2 · Welke bestanden openen met dubbelklikken
**Je beslist:** of alleen projectbestanden (.pvproj) aan de viewer worden gekoppeld, of ook puntenwolken.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Alleen .pvproj | Ook "Openen met Profielviewer" voor .las, .laz en .pts |
| **Voordeel** | Het programma kan dit al, dus alleen installer-werk | Een scan direct vanuit de Verkenner openen |
| **Nadeel** | Een scan open je nog via de viewer of door hem te slepen | Er moet iets bij in het programma zelf, met een eigen versie |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-30 23:50 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B2

### ✅ B3 · Wat blijft er staan na verwijderen
**Je beslist:** of je instellingen bewaard blijven als iemand de viewer verwijdert.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Alleen het programma gaat weg; instellingen, stempel, logo's en recente projecten blijven | Bij verwijderen vragen of ook de instellingen weg moeten |
| **Voordeel** | Opnieuw installeren brengt alles terug, ook na een mislukte update | Een pc blijft echt schoon achter |
| **Nadeel** | Er blijft een kleine map met instellingen achter | Wie per ongeluk "ja" zegt, is zijn stempel en logo's kwijt |

Projectmappen worden in beide gevallen nooit aangeraakt.

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-30 23:50 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B3

### ✅ B4 · De viewer staat open tijdens installeren
**Je beslist:** wat de setup doet als de viewer nog open staat, bijvoorbeeld bij het installeren van een nieuwe versie.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | De setup zegt "sluit de viewer en probeer opnieuw" en sluit hem nooit zelf | De setup sluit de viewer zelf en start hem daarna opnieuw |
| **Voordeel** | Een lopende omzetting of een niet-opgeslagen project gaat nooit verloren | Eén klik minder |
| **Nadeel** | Je moet zelf de viewer sluiten | Werk dat niet is opgeslagen, kan verloren gaan |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-30 23:50 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B4

### ✅ B5 · Blijft de losse exe bestaan
**Je beslist:** of je naast de setup ook de losse exe en de zip blijft uitleveren.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Bouwen levert exe, zip én setup; de setup is de gewone manier | Alleen nog de setup |
| **Voordeel** | Wie niet mag installeren, kan de losse exe nog gebruiken | Eén manier, minder uitleg |
| **Nadeel** | Twee manieren in de LEESMIJ | Geen uitweg als installeren op een laptop geblokkeerd is |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-10-30 23:50 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B5

## Historie
Alleen aanvullen, nooit herschrijven. De technische uitvoeringsdetails staan in het plan, punt 11.

| Datum en tijd | Wat | Door |
|---|---|---|
| 2026-10-30 23:47 | Fase B van PLAN-2.10 heropend; gekozen voor Inno Setup in plaats van zelfinstallatie in de exe | Marco van Steenbrugge, via chat |
| 2026-10-30 23:49 | Plan opgesteld (versie 1) | Claude Code (claude-opus-5-5) |
| 2026-10-30 23:49 | Voorgelegd aan Marco van Steenbrugge | Claude Code (claude-opus-5-5) |
| 2026-10-30 23:50 | Tijden van opstellen en voorleggen gecorrigeerd: eerst stonden er geschatte tijden (23:58/23:59), gemeten is 23:49 | Claude Code (claude-opus-5-5) |
| 2026-10-30 23:50 | Marco van Steenbrugge als beslisser: hij is de gebruiker van de sessie en sprak de aanname in de chat niet tegen | Claude Code (claude-opus-5-5) |
| 2026-10-30 23:50 | B1 t/m B5 besloten conform ons voorstel; vrijgave F0 tot en met F2 op planversie 1 | Marco van Steenbrugge, via chat |
| 2026-10-30 23:52 | F0 gebouwd en per criterium getoetst (setup, installatietoets) | Claude Code (claude-opus-5-5) |
| 2026-10-30 23:54 | F1 gebouwd en per criterium getoetst (.pvproj-koppeling) | Claude Code (claude-opus-5-5) |
| 2026-10-31 00:04 | Controle op de laptop: "Alles werkt" | Marco van Steenbrugge, via chat |
| 2026-10-31 00:04 | F2 gebouwd (2.11.4: setup, LEESMIJ, handleiding, tests groen) | Claude Code (claude-opus-5-5) |

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
