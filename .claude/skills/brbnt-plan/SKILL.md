---
name: brbnt-plan
description: Maakt en bewaakt het plan- en beslisdocument voor een wijziging, en zorgt dat er pas wordt gebouwd na expliciet akkoord per fase. Start automatisch wanneer iemand vraagt om een plan, ontwerp, aanpak of fasering, wanneer je in plan mode werkt, wanneer een taak een nieuwe functie, meerdere fasen of een schema- of architectuurwijziging omvat, wanneer iemand vraagt naar de status, voortgang of vrijgave van een bestaand plan, en wanneer iemand wil beginnen met bouwen terwijl er een plan bestaat (startcontrole). Niet voor een kleine, afgebakende fix en niet voor een productroadmap zonder codewijziging. Controleert eerst of het project is ingericht (CLAUDE.md met de sectie "Plan en besluit") en stelt anders brbnt-project-setup voor.
---

# BRBNT plan: plan- en beslisdocument met bouwpoort

Dit is de vijfde van zes BRBNT-skills, naast `brbnt-project-setup`, `brbnt-memory`,
`brbnt-skill-scaffold`, `brbnt-parallel-setup` en `brbnt-scan`. Hij hoort bij Module 3 (Plan, Do,
Check, Act): een besluit dat alleen in een gesprek bestaat, verdampt, dus elk plan
krijgt een beslisdocument met wie wat wanneer akkoord gaf, en er wordt niet gebouwd
voordat dat akkoord er is.

## Wat dit doet
Per wijziging twee documenten, naast elkaar in de docs-map van het project:

| Bestand | Voor wie | Inhoud |
|---|---|---|
| `<naam>.plan.md` | uitvoerder, later ook handleidingen, releasenotes, privacy | menselijke uitleg, techniek, onderzoeksbevindingen, fasering, uitvoeringsgegevens |
| `<naam>.beslis.md` | de beslisser | gewone taal: wat je beslist, vrijgave per fase, wie wat wanneer akkoord gaf |
| `plan-beslis-index.md` | snel zoeken | gegenereerde index met status en voortgang per fase |

Zoekvolgorde: eerst de index, dan het (korte) beslisdocument, en pas als techniek
nodig is het plan.

## Contract (hard, niet onderhandelbaar binnen deze skill)
1. **Geen bouwen zonder vrijgave.** Bouwen is: code, migraties, configuratie of
   commits met inhoud voor een fase. Onderzoeken, code lezen en plan- en
   beslisdocumenten schrijven mag altijd. Vóór elke fase draait de poortcontrole
   (stap C). Staat die op GEBLOKKEERD, dan bouw je niet: je toont de redenen en stelt
   de actie voor.
2. **Akkoord is expliciet, persoonlijk en aan een planversie gekoppeld.**
   - *Telt:* een duidelijke bevestiging van de beslisser (naam en rol staan in het
     plan) waaruit blijkt waarop, bijvoorbeeld "Akkoord, bouw F0 tot en met F2"; een
     door de beslisser zelf aangevinkte keuze in het beslisdocument; of goedkeuring
     van plan mode (vastgelegd als zodanig, zie contract 12).
   - *Telt niet:* "ok", "prima", "ja" op een andere vraag, een wedervraag, "ja,
     maar ...", stilte, akkoord van een agent of van een ander dan de beslisser, of
     akkoord op een eerdere planversie.
   - Bij twijfel stel je één precieze vraag ("Akkoord om te bouwen op plan X,
     versie N, fase F0 tot en met F2?"). Nooit aannemen, nooit "dan ga ik ervan uit".
   - *Wie akkoord geeft:* de gebruiker van de sessie. Vraag bij de eerste akkoordvraag
     eenmalig of die persoon de beslisser is (naam uit het plan) en leg dat vast. Is het
     iemand anders: noteer "X namens Y" en laat de beslisser bevestigen; tot die
     bevestiging telt het niet. Leg de bevestiging vast in de Historie ("<naam>
     bevestigd als beslisser, via chat"). Vraag het ook wanneer iemand ongevraagd
     akkoord geeft en dit nog niet is vastgelegd.
3. **De menselijke velden vul je nooit zelf in.** Wie er besloten heeft, de gekozen
   optie, het tijdstip en de letterlijke bewoording komen uit wat de beslisser
   werkelijk zei of zelf invulde. Zet nooit een ✅ op een besluit dat de beslisser
   niet nam, ook niet als jouw voorstel vanzelf spreekt. Alleen jouw eigen acties
   (plan opgesteld, fase uitgevoerd) schrijf je zelf in de Historie.
4. **Vrijgave is per fase.** Een fase mag pas starten als alle vier waar zijn: (a) de
   vrijgave voor die fase staat in het beslisdocument, met naam en tijdstip;
   (b) alle besluiten waar de fase op leunt zijn genomen (✅, ✏️ of vervallen);
   (c) alle fasen waar zij van afhangt zijn gebouwd; (d) de vrijgave is nog geldig,
   dus het wijzigingslog van het plan raakt deze fase en haar besluiten niet met een
   nieuwere versie dan de vrijgave. Besluiten die pas later nodig zijn, mogen open
   blijven terwijl eerdere fasen worden gebouwd.
5. **Een planwijziging na akkoord verhoogt de versie.** Het wijzigingslog noemt welke
   fasen en besluiten geraakt zijn; alleen die verliezen hun akkoord. Zeg dat
   expliciet tegen de gebruiker. Een "anders"-besluit verwerk je in het plan vóór de
   vrijgave wordt gevraagd, zodat er nooit een akkoord staat op tekst die niet meer
   klopt.
   Vanaf de eerste beoordeling door de beslisser (een besluit beantwoord of vrijgave
   gegeven) verhoogt elke inhoudelijke planwijziging de versie. Alleen een statuszin
   bijwerken (bijvoorbeeld "nog open" wordt "besloten", conform het voorstel) is geen
   inhoudelijke wijziging en geeft geen nieuwe versie. Geeft de beslisser vrijgave in
   hetzelfde bericht als een "anders"-besluit, leg dan alleen de besluiten vast,
   verwerk de wijziging, toon de nieuwe versie en vraag de precieze zin één keer
   opnieuw.
6. **Twee lagen, elk op zijn plek.** Het plan heeft altijd de 14 kopjes van het
   sjabloon (is iets niet van toepassing: "n.v.t." en de reden). Het beslisdocument is
   gewone taal zonder techniek, één kaart per besluit, met een verwijzing naar het
   plan voor verdieping. Een besluit heeft één nummer: uitleg in het beslisdocument,
   techniek in het plan onder hetzelfde nummer. Noem de eenheid waarop akkoord wordt
   gegeven in beide documenten altijd een "fase", ook in de inleiding van het
   beslisdocument; het woord "stap" gebruik je daar niet, want dan lijkt het alsof er
   iets anders wordt bedoeld.
7. **Eerst onderzoeken, dan schrijven.** Lees de code en relevante documenten, noteer
   bevindingen met hun bron, en toets tegen de `basis_commit`. Wat je niet kon
   vaststellen, presenteer je niet als feit: het komt bij Open vragen.
8. **Uitvoeringsgegevens komen uit metingen of zijn "onbekend".** Tokens, model,
   effort en tijden haal je uit het script (`meet`) of uit git; wat niet te meten is,
   noteer je als "onbekend". Nooit schatten. Het uitvoeringslog wordt alleen
   aangevuld, nooit herschreven.
9. **Statussen worden berekend, nooit met de hand gezet.** Dat doet `sync`, dat ook
   de index bijwerkt.
10. **Alleen standaard markdown.** Geen ruwe HTML: die rendert niet overal.
11. **Naamgeving en plaats.** `<naam>.plan.md`, `<naam>.beslis.md` en
    `plan-beslis-index.md` in de docs-map (de `docs-locatie` uit CLAUDE.md, anders
    `docs/`). De naam is kort, kebab-case, zonder datum of nummer; je verwijst naar
    een plan op naam, niet op pad. Bestaande plannen in een ander formaat migreer je
    niet en herschrijf je niet; alleen nieuwe plannen volgen deze standaard.
12. **In plan mode schrijf je geen bestanden.** Stel het plan op in het sjabloon als
    het plan dat de gebruiker te zien krijgt. Na goedkeuring schrijf je plan en
    beslisdocument en leg je vast "via plan mode-goedkeuring" met je eigen
    tijdstempel (er is geen ander record). Die goedkeuring legt op zichzelf geen enkel
    besluit vast: een besluit wordt alleen ✅ als de beslisser het apart heeft
    beantwoord, ook als jouw voorstel in het goedgekeurde plan staat. Vrijgave via plan
    mode geldt alleen voor fasen zonder open besluit; staat er iets open, dan vraag je dat
    eerst na. De goedkeurder is de gebruiker van de sessie (zie contract 2 over identiteit). Vraag
    de open besluiten dan eerst apart aan de beslisser, en noteer dat de plan
    mode-goedkeuring alleen de fasen zonder open besluit dekt. Toon in plan mode ook de
    besluiten in het kort (per besluit de vraag en jouw voorstel).
13. **Deze skill wijzigt nooit CLAUDE.md.** Ontbreekt de structuur, dan stel je
    `brbnt-project-setup` voor en wacht je op akkoord (stap 0).
14. **Wanneer wel, wanneer geen plan.** Wel: een nieuwe functie, een wijziging in meer
    dan één fase, een schema- of architectuurwijziging, of als de gebruiker erom vraagt.
    Geen plan voor een kleine, afgebakende fix (één logische wijziging, één commit, geen
    schema of architectuur): zeg dat kort en ga door. Bij twijfel: vraag.
15. **Geen "gebouwd" zonder toetsing per criterium.** Een fase wordt pas als gebouwd
    gemarkeerd nadat elk acceptatiecriterium uit punt 7 afzonderlijk is getoetst met
    bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een
    bestand. "Ik heb die test zelf geschreven, dus hij dekt het" is geen bewijs; een
    criterium aannemen omdat jij het zelf schreef evenmin. Per criterium is het oordeel
    gehaald, niet gehaald of niet toetsbaar, en niet toetsbaar telt nooit als gehaald.
    Is één criterium niet gehaald of niet toetsbaar, dan wordt de fase niet gemarkeerd,
    ook niet gedeeltelijk. De toetsing staat in punt 11 onder "Toetsing per fase" en
    `toets` controleert haar.

## Hulpmiddel
De deterministische controles zitten in één script naast dit bestand:
`node ~/.claude/skills/brbnt-plan/scripts/plan.mjs <opdracht>` (bij een project-lokale
installatie: `.claude/skills/brbnt-plan/scripts/plan.mjs`). Opdrachten: `preflight`,
`poort <naam> <fase>`, `toets <naam> <fase>`, `sync`, `meet`, `help`. Het script draait vanuit de projectroot of een submap (het zoekt zelf de
docs-map, nooit voorbij de projectroot) en heeft alleen Node nodig, geen installatie. Tijden noteer je in lokale tijd
als `YYYY-MM-DD HH:MM` (haal ze uit `date`); aan `meet` geef je ISO-tijden met offset
(`date -Iseconds`). **Is Node er niet, dan pas je dezelfde regels met de hand toe** (contract 4
voor de poort) en zeg je dat erbij; het contract geldt met of zonder script.

## Stappenplan

### 0. Startcontrole: is het project ingericht?
Draai `preflight`. Het controleert: bestaat `CLAUDE.md`, staat daar de sectie "Plan
en besluit" in, bestaat de docs-map. Ontbreekt iets: stop, leg in één zin uit
waarom ("het plan landt op een structuur die er nog niet is") en stel voor
`brbnt-project-setup` te starten. Na akkoord draait de setup (nieuw project, oude
setup of eigen bestand: de setup kiest zelf de route). Het akkoord op jouw vraag is
niet het akkoord op wat de setup voorstelt: de setup vraagt daar zelf om. Draai daarna
`preflight` opnieuw en ga verder bij stap A. Doe geen stap van het plan voordat dit
staat. Weigert de gebruiker: zeg dat de bouwpoort zonder de CLAUDE.md-sectie niet is
verankerd, en bied aan het plan alleen in de chat te tonen, zonder bestanden en zonder
vrijgave vast te leggen. Wacht op het antwoord. Zegt de gebruiker ja op het chat-plan, doe dan het onderzoek
(lezen mag) en toon het plan alleen in de chat. Zonder docs-map kan de poort niet
draaien: bouwen mag dan alleen na expliciet akkoord per fase in de chat (contract 2); je
legt niets vast en zegt dat erbij.

### A. Plan maken
1. Bepaal naam, docs-map en beslisser met rol (vraag als die niet in het project staan;
   is de rol onbekend, schrijf dan "rol onbekend"), en noteer `git rev-parse --short HEAD`
   als `basis_commit` (is er geen git: "onbekend").
2. Onderzoek (contract 7). Lees de code die het plan raakt.
3. Vul `assets/plan.md.template`. Houd fasen klein en elk onafhankelijk toetsbaar,
   met toetsbare acceptatiecriteria; leg per besluit vast vóór welke fase het nodig is.
4. Maak het beslisdocument uit `assets/beslis.md.template`: een kaart per besluit in
   gewone taal, het overzicht, en de vrijgave-tabel met alle fasen op "○ nog niet".
   Het voorbeeld in `assets/voorbeeld/` toont het gewenste niveau.
5. Zet `voorgelegd` in het beslisdocument (datum en tijd) op het moment dat je het plan
   aan de beslisser toont, en draai daarna `sync`.
6. Toon wat er is en wat er van de beslisser gevraagd wordt (de regel "Nu van jou
   gevraagd"). Bouw niets. In plan mode: toon alleen het plan (contract 12).

### B. Akkoord ophalen
1. Leg de besluiten voor die nodig zijn voor de eerstvolgende fasen; wat pas later
   nodig is, mag wachten.
2. Leg elk antwoord vast: het keuzevak, de regel `**Besloten door** <naam> · **op**
   <datum tijd> · **via** <chat, document of plan mode> · **over** <ons voorstel of anders
   dan ons voorstel: ...>` met de letterlijke bewoording, en een regel in de Historie. Een
   besluit dat de beslisser nog niet nam, of bewust uitstelt ("dat beslis ik later"), blijft
   zichtbaar als "Nog niet beoordeeld"; noteer het uitstel in de Historie.
3. Kiest de beslisser "anders": pas het plan aan (techniek, en zo nodig een nieuwe
   versie) en werk het beslisdocument bij, vóór je om vrijgave vraagt.
4. Vraag vrijgave per fase met de precieze zin uit contract 2. Leg vast in de
   vrijgave-tabel (naam, tijdstip, planversie) en onder de tabel als `Letterlijk akkoord
   (F0 tot en met F1, via chat): "..."`. Draai `sync`.

### C. Startcontrole voor elke bouwactie
1. Draai `poort <naam> <fase>`, per fase (vraagt iemand om "F0 tot en met F3", draai hem
   dan voor elke fase).
2. **TOEGESTAAN:** noteer de starttijd voor het uitvoeringslog en bouw.
   **GEBLOKKEERD:** toon de redenen en de voorgestelde acties ("leg B4 voor aan
   <beslisser>", "vraag vrijgave voor F3 op planversie 2", "rond F2 eerst af") en
   wacht. Ga nooit door "omdat het klein is".
3. Vraagt iemand om te bouwen terwijl er wel plan-plicht is maar geen plan bestaat:
   stel voor eerst een plan te maken (stap A).

### D. Afronden en loggen na een fase
1. **Toets elk acceptatiecriterium afzonderlijk (contract 15).** Splits de cel
   "Acceptatie" van de fase in losse criteria en toets elk met een uitgevoerde controle
   of een aanwijsbare plek in een bestand. Leg per criterium één rij vast in punt 11,
   tabel "Toetsing per fase": fase, tijdstip, criterium, controle en uitkomst, en oordeel
   (gehaald, niet gehaald of niet toetsbaar). Alleen aanvullen: een nieuwe toetsing voegt
   rijen met een nieuw tijdstip toe. Kan een criterium alleen een mens beoordelen, dan
   vraag je dat na en noteer je het oordeel met naam, tijdstip en de woorden van die
   persoon in de kolom "Controle en uitkomst" (contract 3).
2. Draai `toets <naam> <fase>`. **GEBLOKKEERD:** markeer de fase niet als gebouwd. Toon per
   criterium wat er mis is en stel de actie voor: herstellen en opnieuw toetsen, of
   het criterium aanpassen via stap E als het niet toetsbaar is. De fase blijft lopend.
   Gedeeltelijk afronden bestaat niet. **TOEGESTAAN:** ga verder bij 3.
3. Draai `meet --van <start> --tot <einde>` en vul de rij in punt 11 van het plan:
   opdracht van, uitgevoerd door (model en sessie), effort, tokens, commits (de
   commits met de fase-prefix in dat tijdvak; is er geen commit of geen git, dan
   "onbekend") en bron. De sessie neem je over uit `meet` voor een nieuwe rij; een bestaande rij herschrijf je
   nooit (bij herwerk voeg je een nieuwe rij toe, met "(herwerk)" achter de fase).
   Afwijkingen van het plan komen in punt 12. Vergelijk daarvoor model en effort uit
   `meet` met "Gepland model en effort" van die fase in punt 7. Wijkt een van beide af
   (bijvoorbeeld gepland "medium", gemeten "max"), voeg dan een rij toe in punt 12 met de
   fase, wat afweek en waarom; ken je de reden niet, schrijf dan "reden onbekend". Is de
   gemeten waarde "onbekend", dan valt er niets te vergelijken en is dat geen afwijking.
   Noteer op dezelfde manier een afwijkende scope of acceptatie.
4. Zet in het beslisdocument bij de fase "Gebouwd" op ✅ met datum en tijd van het einde
   en voeg een regel aan de Historie toe. Werk de kop "Nu van jou gevraagd" en "Later
   nodig" van het beslisdocument bij. Technische details staan alleen in het plan.
5. Draai `sync` en stel voor om plan, beslisdocument en `plan-beslis-index.md` te
   committen (alleen die).

### E. Plan wijzigen na akkoord
Verhoog de versie (contract 5), schrijf een regel in het wijzigingslog met wat er
veranderde en welke fasen en besluiten geraakt zijn, werk de plantekst bij zodat er
geen zin achterblijft die niet meer klopt, en zeg tegen de gebruiker welke vrijgaven
vervallen en welke geldig blijven. Een geraakt besluit zet je terug op "Nog niet
beoordeeld". In de vrijgave-cel van een vervallen fase schrijf je `⚠ vervallen (was: ja,
op planversie N)`; het script berekent zelf of een vrijgave vervalt. Annoteer de regel "Letterlijk akkoord" van een vervallen
fase met "(F2 vervallen op versie N)". Werk ook toelichtingen bij niet-geraakte besluiten
bij als ze niet meer kloppen, en noem dat in het wijzigingslog zonder ze in Geraakt te
zetten. Werk de kop "Nu van jou gevraagd" en "Later nodig" bij. Vraag alleen opnieuw
akkoord voor het geraakte deel.

Raakt de wijziging een fase die al gebouwd is, leg de keuze dan voor: **heropenen** (zet
de Gebouwd-cel terug op `-` en schrijf in de Historie "F2 heropend: planwijziging versie
N"; de uitvoeringsrij blijft staan) of het herwerk als **nieuwe fase** toevoegen (de
gebouwde fase blijft gebouwd).

### F. Zoeken
Begin bij `plan-beslis-index.md`, lees dan het beslisdocument, en open het plan alleen
als je techniek nodig hebt.

## Materiaal
- `assets/plan.md.template` en `assets/beslis.md.template`: de vaste structuur;
  identiek aan dezelfde bestanden in `11. Skill templates/` in de hoofdrepo (er is
  bewust één versie).
- `assets/voorbeeld/`: een volledig ingevuld voorbeeld (plan, beslisdocument, index)
  op de wachtwoord-vergeten-flow, met fictieve namen en tijden.
- `scripts/plan.mjs`: poortcontrole, startcontrole, statusberekening en index,
  meting uit het sessietranscript. Tests: `node --test scripts/tests/plan.test.mjs`.
