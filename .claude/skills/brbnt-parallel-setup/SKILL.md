---
name: brbnt-parallel-setup
description: Richt laag 5 van het BRBNT-systeem in voor het huidige project, een addendum-parallel-ontwikkeling.md met een poortformule en worktree-afspraken, ingevuld op basis van de daadwerkelijke dev-server- en API-poorten in het project. Gebruik dit wanneer iemand wil gaan werken met meerdere sessies of worktrees tegelijk, vraagt om poorttoewijzing te regelen, of tijdens Module 6 de poort- en branch-afspraak voor het eigen project wil vastleggen. Eenmalige actie per project.
---

# BRBNT parallel-setup: addendum-parallel-ontwikkeling.md

Vierde van de zes BRBNT-skills. Eenmalig per project, zoals
`brbnt-project-setup`, maar dan voor laag 5 (parallelle infrastructuur)
in plaats van laag 1/2.

## Wat dit doet
Zet het addendum voor parallel ontwikkelen op: een vuistregel voor
worktree-versus-hoofdbranch, een poortformule per component, en (optioneel, na
bevestiging) een poort-registry-bestand. De poortformule wordt niet generiek
ingevuld, maar afgeleid van wat er al in het project draait.

## Contract (hard, niet onderhandelbaar binnen deze skill)
- **Nooit een bestaand addendum overschrijven.** Bestaat er al een
  `docs/addendum-parallel-ontwikkeling.md` of vergelijkbaar bestand, dan stopt de
  skill, toont de inhoud, en vraagt hoe de gebruiker verder wil. Dit geldt ook als
  de gevraagde wijziging klein en op zich redelijk klinkt (bijv. "verander de
  vuistregel van 2 naar 1 uur"): een kleine gevraagde wijziging is geen vrijstelling
  van deze regel, want het bestand kan sindsdien handmatig zijn aangevuld met
  context die een automatische wijziging zou kunnen overschrijven.
- **Poorten worden nooit verzonnen, en het concept "poorten" wordt niet
  klakkeloos verondersteld van toepassing te zijn.** De skill leidt de
  basispoorten af uit wat het project al gebruikt (dev-server-scripts,
  `launchSettings.json`, `docker-compose.yml`, `.env`-bestanden). Twee aparte
  situaties, niet met elkaar verwarren:
  - **Poorten zijn relevant maar niet eenduidig af te leiden:** vraag er expliciet
    naar, verzin nooit een plausibel klinkend getal.
  - **Onduidelijk of poorten hier überhaupt relevant zijn** (bijv. een
    documentatie-/tooling-repo zonder ooit-gelijktijdig-draaiend proces): vraag dit
    eerst expliciet uit vóórdat je de poorttabel invult. Blijkt het niet relevant:
    schrijf het addendum tóch (worktree-lifecycle en permissie-afspraken blijven
    van waarde), maar markeer het poorten-gedeelte zichtbaar als "vermoedelijk
    n.v.t., graag bevestigen" in plaats van het stilzwijgend leeg te laten of te
    negeren.
  - **Niet elk project heeft gescheiden frontend-/backend-poorten.** Bij een
    gecombineerde lokale dev-server (bijv. via `@cloudflare/vite-plugin`, waarbij
    frontend en Worker in één proces draaien) is "geen eigen poort" voor de
    backend-rij een geldig, niet-verzonnen antwoord — dwing dan geen aparte
    formule af waar er maar één proces is.
  - **Lokaal per-worktree versus remote gedeeld, niet hetzelfde behandelen.**
    Cloud-bindings (D1/R2/KV/etc.) die remote gedeeld zijn, zijn niet automatisch
    hetzelfde als hun lokale/emulatie-tegenhanger: lokale migratie-state leeft
    vaak per worktree/checkout, terwijl de remote resource gedeeld en vast is.
    Vraag dit apart uit i.p.v. beide op één hoop te gooien in de "gedeelde
    services"-rij.
- **Een poort-registry-bestand (bijv. `.claude/worktrees/ports.json`) wordt
  alleen aangemaakt na expliciete bevestiging.** Dit is een nieuw soort
  state-bestand in de repo; dat introduceer je niet stilzwijgend. Dit is een
  aparte bevestiging, los van de bevestiging om het addendum zelf weg te
  schrijven — instemming met het een impliceert nooit instemming met het ander.
- **Het registry staat buiten git, in de hoofdcheckout.** Een bestand dat in git
  staat, heeft in elke worktree een eigen kopie: dan ziet de ene worktree niet
  welk slot de andere heeft geclaimd, en is het registry juist niet de enige bron
  van waarheid. Stel bij het aanmaken daarom altijd een `.gitignore`-regel voor, en
  laat worktrees het registry via het volledige pad in de hoofdcheckout lezen.
- **Automatisch mergen alleen als ook de runtime-data ongewijzigd is.** Staan er
  bestanden in git die de draaiende applicatie zelf herschrijft (lokale data,
  seed-bestanden), dan veranderen die in een worktree zodra iemand de app daar
  gebruikt. Neem die paden op in de merge-voorwaarde (`git status` op die paden
  moet leeg zijn); anders merget de automaat de runtime-data van de worktree mee
  naar de hoofdbranch.
- **De {{X}}-uur-vuistregel (wanneer een taak een eigen worktree verdient) wordt
  aan de gebruiker gevraagd**, niet aangenomen. Verschilt sterk per team/project.
  Staat er iets in het project dat hierop lijkt (bijv. een regel over
  werk-granulariteit), controleer dan eerst of die daadwerkelijk over
  worktree/branch-keuze gaat vóór je 'm hergebruikt — een regel over iets anders
  met vergelijkbare bewoording telt niet als antwoord.

## Stappenplan

1. **Check op een bestaand addendum.** Zoek naar `docs/addendum-parallel-ontwikkeling.md`
   of een bestand met vergelijkbare inhoud. Bestaat het al: stop, toon de inhoud,
   vraag hoe verder (nooit overschrijven).

2. **Inspecteer het project** op daadwerkelijke poorten en componenten: scripts
   in `package.json`, poorten in `launchSettings.json`/`.env`/`docker-compose.yml`
   /`wrangler.jsonc`/`vite.config`, welke services gedeeld zijn (database,
   mailserver, en dergelijke) en dus NIET per worktree moeten starten. Vraag
   hierbij expliciet uit (zie Contract): draait dit project überhaupt met
   gescheiden, gelijktijdig actieve lokale processen die elk een poort nodig
   hebben, of is dat concept hier niet van toepassing (bijv. geen dev-server) of
   gecombineerd in één proces (bijv. `@cloudflare/vite-plugin`)? Vind je een
   tegenstrijdigheid tussen twee bronnen (bijv. een CLI-vlag dat een andere poort
   afdwingt dan de configfile zegt), verzin dan niet welke "juist" is: noem beide
   bronnen expliciet in het addendum als open punt. Ga ook na welke bestanden de
   draaiende applicatie zelf schrijft en of die in git staan: dat is runtime-data,
   die in een worktree verandert en niet ongemerkt mee mag naar de hoofdbranch
   (zie Contract).

3. **Vraag de vuistregel** (vanaf hoeveel uur werk, of welk ander criterium,
   verdient een taak een eigen worktree) als dat niet al ergens in het project
   staat. Vind je een regel die hierop lijkt, controleer eerst of die
   daadwerkelijk over worktree/branch-keuze gaat (zie Contract) vóór je 'm
   hergebruikt in plaats van opnieuw te vragen.

4. **Vul `assets/addendum-parallel-ontwikkeling.md.template` in** met de
   afgeleide poortformules per component en de vuistregel.

5. **Toon het voorstel** en vraag bevestiging vóór wegschrijven.

6. **Schrijf het addendum** naar `docs/addendum-parallel-ontwikkeling.md` (of de
   locatie die de gebruiker aangeeft, als `docs/` niet de conventie is in dit
   project).

7. **Vraag apart** of er ook een poort-registry-bestand moet komen (bijv.
   `.claude/worktrees/ports.json`), leeg of met de huidige situatie erin. Maak
   dit alleen aan na bevestiging, in de hoofdcheckout, en met een `.gitignore`-regel
   erbij (zie Contract).

8. **Sluit af met een korte samenvatting**: welk bestand is aangemaakt, welke
   poortformule geldt per component, en of er een registry-bestand is
   meegemaakt.

## Materiaal
- `assets/addendum-parallel-ontwikkeling.md.template`, identiek aan
  `11. Skill templates/addendum-parallel-ontwikkeling.md.template` in de hoofdrepo.
