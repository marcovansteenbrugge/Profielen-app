---
name: brbnt-skill-scaffold
description: Zet een nieuwe skill op voor terugkerend werk, te beginnen bij het contract (wat mag nooit veranderen), pas daarna het stappenplan. Gebruik dit wanneer iemand vraagt om iets te automatiseren, "hier een skill van te maken", een terugkerende taak wil vastleggen, of tijdens Module 5 een terugkerende taak in het team wil identificeren. Weigert door te gaan als het contract niet is in te vullen: dat is een signaal dat het werk nog niet rijp is voor een skill.
---

# BRBNT skill-scaffold: een nieuwe skill opzetten

Derde van zes BRBNT-skills. Deze skill maakt andere skills: hij is zelf het
levende voorbeeld van laag 4 (skills met een hard contract) uit de methode.

## Wat dit doet
Zet een nieuwe skill op voor werk dat vaker dan twee keer op dezelfde manier
terugkomt. Begint bij het contract, niet bij het stappenplan: als er geen
antwoord komt op "wat mag nooit veranderen, ongeacht hoe dit wordt aangeroepen?",
stopt de skill en meldt dat dit werk nog niet rijp is voor automatisering.

## Contract (hard, niet onderhandelbaar binnen deze skill)
- **Geen scaffold zonder ingevuld contract.** Een `Contract`-sectie met alleen
  placeholders is geen contract. Kan de gebruiker de kernvraag niet beantwoorden
  ("wat mag nooit veranderen, wat is altijd berekend, nooit handmatig gezet?"),
  dan wordt er geen skill aangemaakt; de skill legt uit waarom en stelt voor het
  werk eerst een paar keer met de hand te doen tot het patroon duidelijk is. Toon
  bij die weigering, als voorbeeld, hoe een wél voldoende scherpe contractregel
  eruitziet (bijv. "het versienummer in de header wordt altijd uit `package.json`
  gelezen, nooit handmatig getypt"), zodat de gebruiker ziet wat wél genoeg is.
- **Elk van de vier contractbullets in het sjabloon (Status/berekend,
  Logs/historie, Scope-grens, Read-only) wordt uitgevraagd, niet alleen de eerste
  twee.** Blijft een van de vier onbeantwoord, laat 'm dan als `{{...}}`-placeholder
  staan (nooit verzinnen), maar vráág er eerst wél expliciet naar — zie
  Stappenplan stap 1.
- **"Logs/historie zijn append-only" is niet universeel.** Sommig terugkerend werk
  vereist juist een idempotente in-place-update (bijv. één bericht dat steeds
  wordt bijgewerkt, niet aangevuld met een nieuw bericht per run). Neem nooit
  append-only aan; vraag expliciet welk patroon van toepassing is.
- **"Wat deze skill niet kan" is een verplichte sectie.** Elke skill heeft
  grenzen: gevallen die hij niet ziet, niet kan toetsen of niet kan afdwingen.
  Vraag die expliciet uit en schrijf ze op, inclusief wat een schone run daarom
  níét betekent. Laat de sectie nooit weg: een skill zonder opgeschreven grenzen
  lijkt betrouwbaarder dan hij is.
- **Nooit een bestaande skill-map overschrijven.** Bestaat `<locatie>/skills/<naam>/`
  al, dan wordt dat gemeld; de gebruiker kiest een andere naam of past de
  bestaande skill zelf aan. **Voer deze check altijd uit, ook (juist) als de rest
  van het scenario al compleet en overtuigend aanvoelt** — een scherp contract is
  geen vervanging voor deze check, de verleiding om 'm als afgehandelde formaliteit
  over te slaan is dan het grootst.
- **Vraag expliciet naar de locatie**: project-lokaal (`.claude/skills/<naam>/`,
  alleen voor dit project) of gebruikersbreed (`~/.claude/skills/<naam>/`, voor
  alle projecten). Neem dit nooit stilzwijgend aan, ook niet als een locatie op
  zichzelf plausibel lijkt. Stel de locatie- en naamvraag als twee aparte vragen,
  nooit samengevoegd in één zin: anders verdwijnt de locatie-helft makkelijk als
  de gebruiker alleen een naam geeft.
- **De Modus-sectie (delta vs. full) is optioneel, geen verplicht invulveld.**
  Niet elk terugkerend werk heeft een zinvol onderscheid tussen "alleen wat
  veranderd is" en "alles opnieuw". Is dat onderscheid niet van toepassing, laat
  de sectie dan expliciet weg in plaats van 'm met een nietszeggend antwoord
  ("n.v.t.") te vullen: weglaten is een ondubbelzinnig signaal, "n.v.t." laat een
  latere lezer gissen of het een bewuste keuze was of een vergeten invulveld.
- **"State-bestanden" is geen optionele sectie**, maar mag naar waarheid leeg
  zijn: is het werk stateless, vul dan expliciet "geen, want stateless" in plaats
  van de sectie leeg te laten of iets te verzinnen.

## Stappenplan

1. **Vraag naar het contract eerst, vóór het stappenplan, en dek alle vier de
   contractbullets uit het sjabloon af, niet alleen de eerste twee:**
   - "Wat mag nooit veranderen, ongeacht hoe deze skill wordt aangeroepen?"
   - "Is er iets dat altijd berekend moet worden in plaats van handmatig gezet?"
   - "Houdt dit een log of historie bij? Zo ja: is dat append-only (elke run voegt
     toe), of juist een idempotente in-place-update (bijv. één bericht dat steeds
     wordt bijgewerkt)? Neem hier niets van beide aan."
   - "Wat mag deze skill wel/niet aanraken (scope-grens)?"
   - "Wanneer mag deze skill schrijven, en wanneer moet hij alleen signaleren en
     de mens laten beslissen (read-only-grens)?"
   - "Wat kan deze skill niet zien of niet afdwingen, en wat betekent een schone
     run daarom níét?"
   Blijft de kernvraag (eerste bullet) vaag na doorvragen, stop en leg uit waarom
   dit nog geen skill is, mét een voorbeeld van een wél scherp genoeg antwoord
   (zie Contract hierboven). Blijft een van de overige vier vragen onbeantwoord,
   ga wél door maar laat dat veld als `{{...}}`-placeholder staan in stap 5 —
   nooit invullen met een aanname.

2. **Vraag naar het stappenplan**: wat zijn de concrete stappen, in welke
   volgorde, en wat is de laatste stap (vaak: valideren tegen het contract
   vóór wegschrijven).

3. **Vraag of Delta/Full relevant is.** Zo ja: wat is het watermerk en waar wordt
   het opgeslagen? Zo nee: laat de sectie weg (zie Contract). Is het werk
   stateless, vul "State-bestanden" dan expliciet met "geen, want stateless".

4. **Vraag naar de locatie** (project-lokaal of gebruikersbreed), als aparte
   vraag, los van de naamvraag. Neem niets aan, ook geen plausibele locatie.

5. **Vraag naar de naam** (kebab-case, beschrijft het werk, niet de
   implementatie) en controleer meteen of `<locatie>/skills/<naam>/` al bestaat.
   Bestaat die al: meld dat en stop (zie Contract) — ook als het contract er tot
   nu toe scherp en compleet uitzag, dat is geen vrijstelling van deze check.

6. **Vul `assets/SKILL.md.template` in** met het contract, "Wat deze skill niet
   kan", het stappenplan, en (indien van toepassing) de modus-sectie. Elk contractveld dat in stap 1 niet
   beantwoord is, blijft een zichtbare `{{...}}`-placeholder.

7. **Toon het concept** en vraag bevestiging vóór wegschrijven.

8. **Schrijf de skill** naar `<locatie>/skills/<naam>/SKILL.md`.

9. **Sluit af** met een korte samenvatting en een aanmoediging om de nieuwe
   skill op een klein, laagrisico-geval te testen vóór serieus gebruik, zoals
   `brbnt-project-setup` zelf ook eerst op een leeg project is getest.

## Materiaal
- `assets/SKILL.md.template`, identiek aan `11. Skill templates/SKILL.md.template`
  in de hoofdrepo.
