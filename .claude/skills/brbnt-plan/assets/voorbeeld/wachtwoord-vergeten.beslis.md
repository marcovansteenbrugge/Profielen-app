---
beslis: wachtwoord-vergeten
titel: Wachtwoord vergeten
plan: wachtwoord-vergeten.plan.md
beslisser: Marieke Visser (opdrachtgever)
voorgelegd: 2026-09-19 09:20
status: in-uitvoering        # berekend uit de vrijgave per fase en de uitvoeringsstand
---

> VOORBEELD met fictieve namen en tijden. Gewone taal, geen techniek: wie meer uitleg nodig heeft, vindt die in het plan.
> Legenda: ✅ akkoord of klaar · ✏️ akkoord, maar anders · ⏳ nog niet beoordeeld · 🔨 wordt gebouwd · ▶ vrijgegeven, nog niet gestart · ○ nog niet vrijgegeven · ⚠ vrijgave vervallen door planwijziging

# Beslisdocument: Wachtwoord vergeten

> **Nu van jou gevraagd:** niets. F0 tot en met F2 mogen worden gebouwd.
> **Later nodig:** besluit **B4**, vóór F3 kan starten. Dit mag wachten tot F2 klaar is.

Gebruikers die hun wachtwoord kwijt zijn, kunnen straks zelf een nieuw wachtwoord instellen, zonder de beheerder. Ze krijgen daarvoor een link die kort geldig is.

## Vrijgave per fase
Een fase mag pas starten als de vrijgave er staat én alle besluiten waar de fase op leunt zijn genomen. Een vrijgave blijft geldig zolang het plan voor die fase en die besluiten niet is gewijzigd; het plan houdt dat bij in het wijzigingslog (nu versie 2, alleen F3 en B4 geraakt).

| Fase | Wat wordt gebouwd | Vrijgave | Door, wanneer | Leunt op | Gebouwd |
|---|---|---|---|---|---|
| F0 | Aanvraagformulier "wachtwoord vergeten" | ✅ ja, op planversie 1 | Marieke Visser · 2026-09-19 09:52 | B2, B5 | ✅ 2026-09-19 11:40 |
| F1 | Link die 15 minuten werkt | ✅ ja, op planversie 1 | Marieke Visser · 2026-09-19 09:52 | B1 | ✅ 2026-09-19 10:58 |
| F2 | Mail klaarzetten voor de gebruiker | ✅ ja, op planversie 1 | Marieke Visser · 2026-09-19 09:52 | B3 | 🔨 sinds 2026-09-19 11:46 |
| F3 | Nieuw wachtwoord instellen | ⏳ wacht op B4 | - | B4 | - |

Letterlijk akkoord (F0 tot en met F2, via chat): "Akkoord, begin maar met de bouw."

## Overzicht besluiten
| | # | Onderwerp | Besluit | Nodig vóór |
|---|---|---|---|---|
| ✅ | B1 | Hoe lang werkt de link | Ons voorstel | F1 |
| ✅ | B2 | Wat zien onbekende adressen | Ons voorstel | F0 |
| ✅ | B3 | Hoe komt de mail bij de gebruiker | Ons voorstel | F2 |
| ⏳ | B4 | Wat gebeurt er op andere apparaten | **Nog niet beoordeeld** | F3 |
| ✏️ | B5 | Hoe vaak mag je een link aanvragen | **Anders:** vijf per uur | F0 |

## Besluiten

### ✅ B1 · Hoe lang werkt de link
**Je beslist:** hoe lang iemand de tijd heeft om via de link een nieuw wachtwoord in te stellen.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | 15 minuten, en de link werkt één keer | Een uur |
| **Voordeel** | Een verdwaalde link is snel waardeloos | Rustiger voor de gebruiker |
| **Nadeel** | Wie te laat is, vraagt een nieuwe aan | Langer risico als de link uitlekt |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marieke Visser · **op** 2026-09-19 09:41 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B1

### ✅ B2 · Wat zien onbekende adressen
**Je beslist:** wat iemand ziet die een e-mailadres invult dat wij niet kennen.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Iedereen ziet dezelfde melding, ook bij onbekende adressen | Een duidelijke foutmelding |
| **Voordeel** | Niemand kan raden welke adressen een account hebben | Handiger bij een typfout |
| **Nadeel** | Bij een typfout is de melding minder duidelijk | Verklapt wie een account heeft |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marieke Visser · **op** 2026-09-19 09:41 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B2

### ✅ B3 · Hoe komt de mail bij de gebruiker
**Je beslist:** hoe de link bij de gebruiker terechtkomt in deze eerste versie.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Nog geen echte mail: de mail wordt als bestand op de server klaargezet | Meteen een mailprovider koppelen |
| **Voordeel** | De hele flow is bouwbaar en testbaar, zonder externe partij | Gebruikers krijgen echt een mail |
| **Nadeel** | In gebruik ontvangt nog niemand een mail | Extra werk, en een externe partij in de privacyafspraken |

**Jouw keuze**
- [x] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** Marieke Visser · **op** 2026-09-19 09:41 · **via** chat · **over** ons voorstel, planversie 1

Meer uitleg: plan, punt 6, B3, en punt 8 (gegevens en privacy)

### ⏳ B4 · Wat gebeurt er op andere apparaten
**Je beslist:** of iemand die al ergens is ingelogd, ingelogd blijft nadat het wachtwoord is gereset.
*Nog niet nodig: dit mag wachten tot F2 klaar is.*

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Alle andere apparaten worden uitgelogd | Iedereen blijft ingelogd |
| **Voordeel** | Wie meekeek, is buitengesloten | Geen gedoe voor de gebruiker |
| **Nadeel** | Opnieuw inloggen op andere apparaten | Een indringer blijft ingelogd |

**Jouw keuze**
- [ ] Akkoord met ons voorstel
- [ ] Anders:
- [ ] Vervalt

**Besloten door** nog niemand · **status** nog niet beoordeeld · **wacht op** Marieke Visser · **voorgelegd op** 2026-09-19 11:20 · **nodig vóór** F3

Meer uitleg: plan, punt 6, B4 (uitgewerkt na onderzoek tijdens F0)

### ✏️ B5 · Hoe vaak mag je een link aanvragen
**Je beslist:** hoeveel keer per uur iemand een resetlink kan aanvragen voor hetzelfde adres.

| | Ons voorstel | Alternatief |
|---|---|---|
| **Wat** | Drie keer per uur | Geen limiet |
| **Voordeel** | Beperkt misbruik, zoals andermans postvak volsturen | Eenvoudiger |
| **Nadeel** | Na de grens gebeurt er niets zichtbaars | Uitnodigend voor misbruik |

**Jouw keuze**
- [ ] Akkoord met ons voorstel
- [x] Anders: **vijf keer per uur**, gebruikers typen vaak eerst een verkeerd adres
- [ ] Vervalt

**Besloten door** Marieke Visser · **op** 2026-09-19 09:41 · **via** chat · **over** anders dan ons voorstel: vijf keer per uur, planversie 1

Meer uitleg: plan, punt 6, B5

## Historie
Alleen aanvullen, nooit herschrijven. De technische uitvoeringsdetails staan in het plan, punt 11.

| Datum en tijd | Wat | Door |
|---|---|---|
| 2026-09-19 09:10 | Plan opgesteld | Claude Code, in opdracht van Marieke Visser |
| 2026-09-19 09:41 | B1, B2, B3 akkoord met voorstel, B5 anders (vijf per uur) | Marieke Visser, via chat |
| 2026-09-19 09:48 | Plan aangepast aan B5 | Claude Code |
| 2026-09-19 09:52 | Vrijgave F0, F1, F2 | Marieke Visser, via chat |
| 2026-09-19 10:58 | F1 uitgevoerd | Claude Code |
| 2026-09-19 11:20 | B4 uitgewerkt en bewust open gelaten, F3 nog niet vrijgegeven | Claude Code |
| 2026-09-19 11:40 | F0 uitgevoerd | Claude Code |
