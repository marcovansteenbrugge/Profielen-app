# Vereisten voor een gestandaardiseerd CLAUDE.md

Dit bestand is de lijst waartegen route C van `brbnt-project-setup` een al ingericht
project controleert. Elke rij is één vereiste. Een nieuwe vereiste toevoegen betekent
één rij toevoegen; route C pakt hem dan vanzelf mee bij een volgende controle, en
projecten die eerder zijn ingericht worden zo bijgewerkt zonder dat er een aparte
reparatie nodig is.

**Hoe te beoordelen.** Per vereiste kies je: *aanwezig*, *gedeeltelijk*, *ontbreekt* of
*strijdig*, op betekenis en niet op letterlijke tekst. Een regel in eigen woorden telt
als aanwezig. Twijfel je tussen "gedeeltelijk" en "ontbreekt", kies dan "gedeeltelijk"
en leg uit wat er mist. Een strijdige regel wordt benoemd en aan de gebruiker
voorgelegd; hij wordt nooit stilzwijgend vervangen. Raakt één regel meerdere vereisten, of
staan er meerdere regels bij één vereiste, dan geldt het zwaarste oordeel (strijdig,
gedeeltelijk, ontbreekt, aanwezig) en noem je alle betrokken regels.

**Sjabloonversie.** De sectie "Plan en besluit" bevat een markering
`<!-- brbnt-plan-regel: vN -->`. Ontbreekt de markering, beoordeel dan op inhoud.
Staat er een lagere versie dan hieronder, stel dan de bijgewerkte tekst voor. Bij een
inhoudelijke wijziging van de sectie in het sjabloon wordt N met één verhoogd.
Huidige versie: **v1**.

## In het CLAUDE.md-bestand

| Id | Vereiste | Herken je aan | Ontbreekt: voorstel | Strijdig als |
|---|---|---|---|---|
| V1 | Plan-plicht | Het bestand zegt wanneer een plan verplicht is (nieuwe functie, meer dan één fase, schema- of architectuurwijziging, op verzoek) en verwijst naar de skill `brbnt-plan`, ook in plan mode | Eerste regel van de sectie "Plan en besluit" uit het sjabloon | Er staat dat plannen overbodig zijn, of dat direct begonnen moet worden zonder plan |
| V2 | Bouwen na akkoord | Er staat dat pas gebouwd wordt na akkoord van de beslisser voor die fase, en dat een ontbrekend of onduidelijk akkoord eerst wordt opgehaald | Tweede regel van de sectie | Er staat dat de assistent mag bouwen zonder akkoord, of geen bevestiging hoeft te vragen voor bouwwerk |
| V3 | Plaats en zoekvolgorde | Plannen en beslisdocumenten staan op één genoemde plek als `<naam>.plan.md` en `<naam>.beslis.md`, met de zoekvolgorde index, beslisdocument, plan | Derde regel van de sectie, met de docs-locatie van dit project | Er staat een andere bestandsnaamconventie voor plannen |
| V4 | Fase-prefix in commits | Commit-berichten voor planwerk beginnen met de fase uit het plan | Vierde regel van de sectie | Er staat een commitformaat dat dit uitsluit |
| V5 | Structuurregel | De Repository Structure noemt de docs-locatie als plek voor plannen en beslisdocumenten | Pas de bestaande docs-regel aan | De docs-locatie noemt een andere plek dan waar plannen en beslisdocumenten staan. Een map die het bestand noemt maar die nog niet bestaat is geen strijdigheid: dat is V6 |

## Buiten het CLAUDE.md-bestand

| Id | Vereiste | Controle | Ontbreekt: voorstel |
|---|---|---|---|
| V6 | De docs-map bestaat | De map uit V5 (of `docs/`, `app/docs/`) bestaat | De map aanmaken |
| V7 | `memory/` met `MEMORY.md` bestaat | Alleen of de map en het bestand bestaan, niet de inhoud | Aanmaken volgens route B stap 6 |
| V8 | De skill `brbnt-plan` is beschikbaar | Aanwezig onder `~/.claude/skills/` of `.claude/skills/` | Alleen adviseren om hem te installeren; niet zelf installeren |
| V9 | De BRBNT-scan is geïnstalleerd en actueel | `brbnt-scan installeer --droog` meldt alles "ongewijzigd": `.brbnt/scan/` met de versie van de skill, `.github/workflows/brbnt-scan.yml` met de markering `brbnt-scan: v1`, en de README-sectie tussen de markeringen | De lijst van `installeer --droog` voorleggen; na akkoord laat `brbnt-scan` hem installeren. Ontbreekt de skill `brbnt-scan`: adviseren om hem te installeren; niet zelf installeren |

## Uitgangspunt
Deze lijst gaat alleen over dit project en zijn eigen bestanden. Er staat niets in dat
naar een andere organisatie, andere projecten of externe standaarden verwijst.
