---
name: brbnt-memory
description: Legt een correctie, besluit, of externe referentie vast als een nieuwe memory in het BRBNT-geheugenarchief (memory/), met het juiste type (feedback/project/reference), de juiste bestandsnaam, en een bijgewerkte index. Corrigeert ook een feit in een bestaande memory dat aantoonbaar niet meer klopt, met datum en met de oude tekst zichtbaar. Gebruik dit wanneer iemand vraagt om iets te onthouden, een correctie of incident vast te leggen, een besluit te documenteren, of tijdens Module 2 een correctie wil herschrijven als memory-bestand. Dit is een herhaalde actie: één keer per nieuwe memory, niet eenmalig per project.
---

# BRBNT memory: een memory vastleggen, of een verouderd feit corrigeren

Dit is de tweede van zes BRBNT-skills. Waar `brbnt-project-setup` eenmalig laag 1
en 2 opzet, is dit de skill die laag 2 daadwerkelijk vult: elke keer dat er iets is
om vast te leggen, opnieuw aangeroepen. Vereist dat `memory/MEMORY.md` al bestaat
(via `brbnt-project-setup`); bestaat die nog niet, verwijs daarnaar in plaats van
zelf een archief te improviseren.

## Wat dit doet
Bepaalt het juiste memory-type, verzamelt de inhoud (regel/feit + Why + How to
apply), schrijft een nieuw bestand in `memory/` met een consistente naam, werkt
`memory/MEMORY.md` bij in dezelfde actie, en stelt relevante `[[wikilinks]]` naar
bestaande memories voor. Klopt een feit in een bestaande memory niet meer, dan
corrigeert de skill dat waar het staat, zichtbaar en gedateerd (zie "Een verouderd
feit corrigeren").

## Contract (hard, niet onderhandelbaar binnen deze skill)
- **Het incident, de datum, of de motivatie wordt NOOIT verzonnen.** Dit is de
  kern van Module 2: een regel zonder een concreet moment erachter gaat verloren.
  Geeft de gebruiker geen concreet moment (datum + wat er gebeurde), dan
  vráágt de skill ernaar. Een vage samenvatting ("dit ging eerder ook mis") is
  onvoldoende; een schatting of aanname van de skill zelf is nooit toegestaan.
- **"How to apply" blijft bij wat de gebruiker heeft gegeven.** Voeg geen eigen
  nuances, uitzonderingen of randgevallen toe die niet genoemd zijn, ook niet als
  ze plausibel klinken. Ontbreekt een nuance die de regel echt nodig heeft, laat
  die dan open of vraag ernaar; dat hoort bij stap 6 (concept tonen, bevestigen)
  thuis, niet bij zelf invullen.
- **Nooit een bestaand memory-bestand overschrijven.** Lijkt de nieuwe memory op
  een bestaande (zelfde onderwerp, overlappende bestandsnaam), dan wordt dat
  gemeld en gevraagd of dit een aanvulling op het bestaande bestand is, of
  echt een nieuwe, losse memory. **Is het overlappende item onderdeel van een
  gemigreerd verzamelbestand** (bijv. `project_gemigreerd_<datum>.md`, door
  `brbnt-project-setup` geschreven), dan is dat bestand een bevroren
  migratie-snapshot, geen levend per-onderwerp-bestand: kies dan altijd voor een
  nieuwe, losse memory met een wikilink terug naar het gemigreerde item, nooit
  voor het muteren van de snapshot zelf. Een puur additieve verwijzingsregel
  tóévoegen aan het gemigreerde item (zonder bestaande tekst te wijzigen) mag wel.
- **Een verouderd feit mag worden gecorrigeerd waar het staat, maar nooit
  stilzwijgend.** Aanvullen onderaan laat de onjuiste zin bovenaan staan, en wie
  alleen de bovenste helft leest, leest dan nog steeds iets wat niet klopt.
  Daarom mag een feitelijke bewering die aantoonbaar niet meer klopt (een status,
  een verwijzing, een locatie, een regelnummer) worden gecorrigeerd, onder vier
  voorwaarden:
  - er is een concrete bron voor de correctie (commit, bestand, besluitdocument);
    zonder bron wordt er niet gecorrigeerd maar gevraagd;
  - de oude tekst blijft zichtbaar: doorgestreept, met de correctie en de datum
    erachter, bijv. `~~nog niet in een commit vastgelegd~~ vastgelegd in 1898c4c
    (gecorrigeerd 2026-09-10)`;
  - de Why wordt nooit gecorrigeerd, want die beschrijft wat er op dat moment
    gebeurde; de How to apply alleen bij een expliciet nieuw besluit van de
    gebruiker;
  - is de reikwijdte van de memory gegroeid, dan mag de `description` in de kop
    mee, zodat de memory vindbaar blijft; de indexregel in `MEMORY.md` gaat dan in
    dezelfde actie mee.
  Dit is de enige uitzondering op de regel hierboven, en hij overschrijft niets:
  de oude tekst blijft staan. Gemigreerde verzamelbestanden blijven hierbuiten:
  die worden nooit gemuteerd.
- **`memory/MEMORY.md` wordt altijd in dezelfde actie bijgewerkt als het nieuwe
  bestand wordt geschreven.** Nooit een memory-bestand achterlaten zonder
  indexregel: dat is precies het soort documentatie-drift dat de methode zelf
  probeert te voorkomen (index en archief mogen nooit uit elkaar lopen).
- **De indexregel blijft kort** (hook + pointer, geen samenvatting van de hele
  memory in de index zelf). Detail hoort in het memory-bestand, niet in
  `MEMORY.md`.

## Stappenplan

1. **Controleer dat `memory/MEMORY.md` al bestaat.** Bestaat die niet, stop hier:
   verwijs naar `brbnt-project-setup` (die zet laag 1+2 op) en ga niet verder.
   Dit is geen kanttekening maar de eerste harde stap: sla hem niet over omdat
   een scenario verder compleet en overtuigend oogt.

2. **Bepaal het type.** feedback = correctie/bevestiging over HOE gewerkt wordt
   (proces, niet product); project = feit/besluit over het product zelf
   (architectuur, scope, status); reference = pointer naar iets buiten dit
   archief (extern systeem, recept, locatie). Is dit niet meteen duidelijk uit
   wat de gebruiker vertelt, vraag er kort naar in plaats van te gokken.

3. **Verzamel de inhoud voor dat type**, volgens het bijbehorende sjabloon
   (zie Materiaal). Voor feedback/project is dat: de regel/het feit, de Why
   (incident/motivatie + datum, eventueel commit-hash), en How to apply. Voor
   reference: de pointer zelf en wanneer die te raadplegen. Ontbreekt de Why
   (datum + concreet moment), vraag daar expliciet naar; ga niet verder zonder.

4. **Kies een bestandsnaam**: `<type>_<korte-naam-in-snake-case>.md`, bijvoorbeeld
   `feedback_geen_git_add_a.md` of `project_tenancy_subdomain_only.md`. Controleer
   of `memory/` al een vergelijkbaar bestand heeft (zoek op onderwerp, niet alleen
   op exacte naam) voordat je verdergaat. Vind je een overlappend onderwerp binnen
   een gemigreerd verzamelbestand, zie het Contract hierboven: nieuwe, losse
   memory + wikilink, nooit de snapshot muteren. Gaat het niet om iets nieuws maar
   om een feit in een bestaande memory dat niet meer klopt, volg dan "Een verouderd
   feit corrigeren" hieronder.

5. **Zoek relevante bestaande memories** om als `[[wikilink]]` te noemen: scan de
   `description`-velden en bestandsnamen in `memory/` op overlappende onderwerpen.
   Stel 1-3 links voor, niet meer dan relevant is; is er niets relevants, forceer
   dan geen link.

6. **Toon het concept-bestand** en vraag bevestiging vóór het wegschrijven,
   vooral als de skill zelf iets heeft moeten aanvullen of herformuleren.

7. **Schrijf het memory-bestand** naar `memory/<bestandsnaam>.md`.

8. **Werk `memory/MEMORY.md` bij**: voeg één regel toe onder de juiste sectie
   (Werkafspraken & voorkeuren voor feedback, Referentie voor reference,
   Architectuur-besluiten & valkuilen voor project), in het bestaande
   hook-en-pointer-formaat.

9. **Sluit af met een korte samenvatting**: welk bestand is aangemaakt, welke
   indexregel is toegevoegd, en welke links zijn gelegd.

## Een verouderd feit corrigeren

1. **Lees het bestaande bestand volledig** en wijs de bewering aan die niet meer
   klopt, met bestand en regel.
2. **Noem de bron** die laat zien dat het niet meer klopt (commit, bestand,
   besluitdocument). Is er geen bron, corrigeer dan niet: vraag de gebruiker.
3. **Toon de correctie als diff**: de oude tekst doorgestreept, met de correctie en
   de datum erachter. De Why blijft ongewijzigd.
4. **Is de reikwijdte gegroeid**, stel dan ook een aangepaste `description` en
   indexregel voor.
5. **Schrijf na bevestiging**, en werk `memory/MEMORY.md` in dezelfde actie bij als
   de indexregel meeverandert.

## Materiaal
- `assets/memory-feedback.md.template`
- `assets/memory-project.md.template`
- `assets/memory-reference.md.template`

Alle drie identiek aan hun tegenhanger in `11. Skill templates/` in de hoofdrepo.
