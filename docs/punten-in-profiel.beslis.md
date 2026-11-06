---
beslis: punten-in-profiel
titel: Alle punten in het dwarsprofiel (bomen, en de weg eronder)
plan: punten-in-profiel.plan.md
beslisser: Marco van Steenbrugge, eigenaar van de Profielviewer
voorgelegd: 2026-11-06 11:54          # datum en tijd waarop de beslisser dit heeft gekregen; wordt door de skill gezet
status: in-uitvoering        # berekend door de skill, nooit met de hand gezet
---

> Legenda: ✅ akkoord of klaar · ✏️ akkoord, maar anders · ⏳ nog niet beoordeeld · 🔨 wordt gebouwd · ▶ vrijgegeven, nog niet gestart · ○ nog niet vrijgegeven · ⚠ vrijgave vervallen door planwijziging

# Beslisdocument: Alle punten in het dwarsprofiel (bomen, en de weg eronder)

> **Nu van jou gevraagd:** je controle van 2.12.0 op een eigen wolk (F3): bomen en de weg eronder in het dwarsprofiel, punten in PDF en DXF.
> **Later nodig:** niets.

Het dwarsprofiel laat straks naast de lijn ook alle punten zien uit een strook rond de profiellijn (standaard ±0,5 m, instelbaar). Zo zie je de vorm van de bomen en de weg die eronder doorloopt, op het scherm, op de PDF en in de DXF. Het werk is verdeeld in vier fasen. De schets op de testwolk staat in `tests/uit/schets_punten_in_profiel.png`.

## Vrijgave per fase
Een fase mag pas starten als de vrijgave er staat én alle besluiten waar de fase op leunt zijn genomen. Een vrijgave blijft geldig zolang het plan voor die fase en die besluiten niet is gewijzigd; het plan houdt dat bij in het wijzigingslog.

| Fase | Wat wordt gebouwd | Vrijgave | Door, wanneer | Leunt op | Gebouwd |
|---|---|---|---|---|---|
| F0 | De punten rond elk dwarsprofiel inlezen (knop "Punten in profiel", veld voor de strook) | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-11-06 11:55 | - | ✅ 2026-11-06 12:05 |
| F1 | De punten in het dwarsprofiel op het scherm, met de lijn op het maaiveld | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-11-06 11:55 | B1, B2, B3 | ✅ 2026-11-06 12:26 |
| F2 | De punten op de PDF en in de DXF (eigen laag) | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-11-06 11:55 | B3 | ✅ 2026-11-06 12:51 |
| F3 | Uitleveren als versie 2.12.0, met jouw controle op een eigen wolk | ✅ ja, op planversie 1 | Marco van Steenbrugge · 2026-11-06 11:55 | - | - |

Letterlijk akkoord (F0 tot en met F3, via chat): "Akkoord, bouw F0–F3", als antwoord op de vraag "Akkoord met B1–B3 zoals voorgesteld, en bouwen op planversie 1, fase F0 t/m F3?"

## Overzicht besluiten
| | # | Onderwerp | Besluit | Nodig vóór |
|---|---|---|---|---|
| ✅ | B1 | Welke lijn als de punten aan staan | Ons voorstel | F1 |
| ✅ | B2 | Kleur van de punten | Ons voorstel | F1 |
| ✅ | B3 | Hoeveel punten per profiel | Ons voorstel | F1 |

## Besluiten

### ✅ B1 · Welke lijn als de punten aan staan
**Je beslist:** waar de profiellijn loopt als je de punten ziet: over het maaiveld onder de boom, of over de bovenkant.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | De lijn volgt het maaiveld: de weg onder de boom, de bodem onder een brug | De lijn blijft de keuze bovenkant/onderkant volgen, zoals nu |
| **Voordeel** | Maten en hoogtes gaan over de weg; de boom zie je als punten | Er verandert niets aan de lijn |
| **Nadeel** | Bij een brug ligt de lijn op de bodem; het brugdek zie je alleen als punten | Bij "bovenkant" loopt de lijn over de kroon, zoals nu |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-11-06 11:55 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B1

### ✅ B2 · Kleur van de punten
**Je beslist:** in welke kleur de punten in het profiel staan.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Grijs, en de grondpunten iets donkerder | De echte kleur uit de scan (zoals in het bovenaanzicht) |
| **Voordeel** | Rustig, goed te printen; lijn en BGT blijven opvallen | Mooier, en je herkent wat je ziet |
| **Nadeel** | Minder sprekend | Druk op de PDF, en slecht in zwart-wit |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-11-06 11:55 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B2

### ✅ B3 · Hoeveel punten per profiel
**Je beslist:** of de PDF en de DXF alle punten krijgen, of een uitgedunde set.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Op het scherm alles; in PDF en DXF hooguit één punt per 2 × 2 cm in het profiel, en maximaal 20.000 per profiel | Overal alle punten |
| **Voordeel** | PDF en DXF blijven klein en vlot in AutoCAD; de vorm blijft hetzelfde | Exact alles |
| **Nadeel** | Niet elk gemeten punt staat in de DXF | Bij 50 profielen honderden MB, en traag |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marco van Steenbrugge · **op** 2026-11-06 11:55 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B3

## Historie
Alleen aanvullen, nooit herschrijven. De technische uitvoeringsdetails staan in het plan, punt 11.

| Datum en tijd | Wat | Door |
|---|---|---|
| 2026-11-06 11:51 | Vraag: "ik wil in het profiel alle punten zien.. dus ook de vorm van de bomen" en "je mist nu de weg.. die ook onder de boom doorloopt"; gekozen: lijn + punten, strook instelbaar ±0,5 m, ook in PDF en DXF | Marco van Steenbrugge, via chat |
| 2026-11-06 11:54 | Plan opgesteld (versie 1), met schets op de testwolk; voorgelegd | Claude Code (claude-opus-5-5) |
| 2026-11-06 11:55 | B1, B2 en B3 besloten conform ons voorstel; vrijgave F0 tot en met F3 op planversie 1 | Marco van Steenbrugge, via chat |
| 2026-11-06 12:05 | F0 gebouwd en per criterium getoetst (punten inlezen; vinkje "punten" met strookveld) | Claude Code (claude-opus-5-5) |
| 2026-11-06 12:26 | F1 gebouwd en per criterium getoetst (punten op het scherm, lijn op het maaiveld, mee in het project); afbeelding naar Marco gestuurd | Claude Code (claude-opus-5-5) |
| 2026-11-06 12:51 | F2 gebouwd en per criterium getoetst (punten in PDF en DXF, laag PV_PROF_PUNTEN); PDF-afbeelding naar Marco gestuurd | Claude Code (claude-opus-5-5) |
| 2026-11-06 13:01 | F3 automatisch getoetst (tests, bouw 2.12.0, installatietoets); wacht op Marco's controle op een eigen wolk | Claude Code (claude-opus-5-5) |
| 2026-11-06 13:26 | Tussenstand opslaan: "goed... sla maar op voor nu"; F3 nog niet afgerond, tag v2.12.0 volgt na de controle | Marco van Steenbrugge, via chat |

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
