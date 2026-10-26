---
plan: wachtwoord-vergeten
titel: Wachtwoord vergeten
versie: 2
status: in-uitvoering        # berekend uit de status per fase, nooit met de hand gezet
voortgang: F0 ✅ · F1 ✅ · F2 🔨 · F3 ⏳      # berekend
opgesteld: 2026-09-19
opgesteld_door: Claude Code (claude-sonnet-5), in opdracht van Marieke Visser
beslisser: Marieke Visser (opdrachtgever)
beslisdocument: wachtwoord-vergeten.beslis.md
basis_commit: 3f9c2ab        # de stand van de code waartegen dit plan is getoetst
vervangt: -
samenvatting: Gebruikers stellen zelf een nieuw wachtwoord in via een link die 15 minuten geldig is en één keer werkt.
trefwoorden: [authenticatie, wachtwoord, reset-token, e-mail, auditlog, privacy, sessies]
---

> VOORBEELD met fictieve namen, tijden en aantallen, ter illustratie van de vaste structuur.
> Alle 14 kopjes blijven altijd staan; is iets niet van toepassing, schrijf dan "n.v.t." en de reden.

# Plan: Wachtwoord vergeten

## 1. In het kort
1. Een gebruiker die zijn wachtwoord kwijt is, vraagt via het inlogscherm een resetlink aan.
2. De link is 15 minuten geldig en werkt één keer.
3. De mail wordt in deze versie niet echt verstuurd, maar als bestand in een map gezet. Er is geen mailserver nodig.
4. Elke aanvraag en elke reset komt in het auditlog, nooit met het token zelf.
5. We bouwen in vier fasen die elk los te testen en los te accepteren zijn.

## 2. Aanleiding en doel
Nu kan een gebruiker inloggen maar zijn wachtwoord niet herstellen. De beheerder past dan met de hand `data/users.json` aan. Dat kost tijd en is foutgevoelig.

Doel: een gebruiker herstelt zelf de toegang, zonder beheerder. Geslaagd is het plan als een gebruiker zonder hulp een nieuw wachtwoord instelt en de oude link daarna niet meer werkt.

## 3. Onderzoek en bevindingen
Getoetst tegen `basis_commit` 3f9c2ab:
- `src/reset-token.js` kan tokens maken, controleren en verbruiken, maar is nergens aangesloten (geen scherm, geen mail, geen link) en heeft geen tests.
- Tokens worden alleen als SHA-256-hash opgeslagen in `data/reset-tokens.json`; het token zelf staat nergens op schijf. Een nieuw token voor hetzelfde adres maakt het oude ongeldig.
- De vervaltijd staat op 24 uur (`TOKEN_GELDIGHEID_MS`). Afgesproken is 15 minuten.
- `src/audit.js` is append-only (één JSON-regel per gebeurtenis) en heeft de functie `logAudit(actie, actor, details)`.
- Sessies leven in het procesgeheugen met 8 uur geldigheid (`src/auth.js`). Na een herstart van de server zijn alle sessies weg.
- De poort komt uit `PORT` (standaard 3000), de datamap uit `URENPORTAAL_DATA_DIR`. Tests draaien op een tijdelijke map.

## 4. Niet in scope
- Echte mailverzending (mailserver of provider). Dit is een vervolgplan.
- Identiteitscontrole tussen twee mensen ("is dit echt Anna?"): dit plan kan dat niet afdwingen.
- Twee-factor-authenticatie en wachtwoordbeleid (minimale lengte en dergelijke).

## 5. Uitgangspunten
| Uitgangspunt | Herkomst |
|---|---|
| Nul dependencies, alleen ingebouwde Node-modules | Architectuurkeuze van het project |
| Opslag in JSON-bestanden in `data/` | Architectuurkeuze van het project |
| Wachtwoorden worden gehasht met scrypt (`src/users.js`) | Architectuurkeuze van het project |
| Een reset-token is 15 minuten geldig | Afspraak opdrachtgever, besluit B1 |

## 6. Ontwerp en besluiten (technisch)
**Stroom.** Bezoeker vult e-mailadres in, `POST /wachtwoord-vergeten`. Bestaat het adres, dan maakt `maakResetToken(email)` een token en komt er een mailbestand in `data/outbox/`. Altijd volgt dezelfde melding. De link (`/wachtwoord-resetten?token=...`) opent een formulier voor het nieuwe wachtwoord; `POST` verbruikt het token, slaat het nieuwe scrypt-hash op en beëindigt, als B4 dat zo besluit, andere sessies van die gebruiker.

**Verdieping per besluit** (de leesbare versie staat in het beslisdocument):

- **B1 Geldigheid van de link** (nodig vóór F1). `TOKEN_GELDIGHEID_MS` gaat van 24 uur naar 15 minuten. De grens is strikt groter dan: op 15:00 minuten nog geldig, op 15:01 niet. Gekozen boven 60 minuten omdat een uitgelekte link dan korter bruikbaar is; nadeel is dat een trage mailbezorging de link kan laten verlopen (bij bestandsmail speelt dat niet).
- **B2 Zelfde melding voor bekend en onbekend adres** (nodig vóór F0). Voorkomt dat iemand kan raden welke adressen een account hebben. Geen verschil in antwoordtekst of statuscode; het verschil in verwerkingstijd is verwaarloosbaar bij JSON-opslag. In het auditlog staat wel of het adres bestond (`reset-aangevraagd`, veld `bekend: true|false`), want dat is intern.
- **B3 Mail als bestand in `data/outbox/`** (nodig vóór F2). Eén tekstbestand per mail, naam `<tijdstempel>-<hash-van-adres>.txt`, inhoud: ontvanger, onderwerp, link. Past bij nul dependencies. In productie ontvangt niemand deze mail; de vervolgstap is een provider achter dezelfde functie `verstuurMail(ontvanger, onderwerp, tekst)`.
- **B4 Andere sessies beëindigen na een reset** (nodig vóór F3, **nog open**). Onderzoek tijdens F0 liet zien dat er twee routes zijn: (a) de sessielijst in het procesgeheugen (`src/auth.js`) per gebruiker doorzoeken en die sessies verwijderen, of (b) elke sessie koppelen aan een "wachtwoordversie" die bij een reset oploopt, zodat oude sessies vanzelf ongeldig worden. Route (b) is robuuster (werkt ook als sessies later naar schijf gaan) maar raakt ook het inlogscherm. Voorstel: (a) nu, (b) bij het verplaatsen van sessies naar schijf. Wordt vóór de start van F3 voorgelegd; F0 tot en met F2 hebben er geen last van.
- **B5 Maximaal 5 aanvragen per uur per e-mailadres** (nodig vóór F0). Teller op basis van het auditlog (`reset-aangevraagd`, laatste 60 minuten), geen aparte opslag. Een zesde aanvraag krijgt dezelfde neutrale melding, maar er wordt geen token gemaakt en er komt geen mail. Het oorspronkelijke voorstel was 3; de opdrachtgever koos 5.

## 7. Fasering
Een fase mag starten als de vrijgave voor die fase er is én alle besluiten waar de fase op leunt zijn genomen. Een planwijziging raakt alleen de fasen en besluiten die in het wijzigingslog staan; de vrijgave van de overige fasen blijft geldig.

| Fase | Status | Scope | Acceptatie (toetsbaar) | Hangt af van | Omvang | Gepland model en effort | Commit-prefix |
|---|---|---|---|---|---|---|---|
| F0 | ✅ gebouwd | E-mailinvoer en validatie: formulier en `POST /wachtwoord-vergeten`, neutrale melding, limiet per uur | Test: bekend en onbekend adres geven identiek antwoord. Test: zesde aanvraag binnen een uur maakt geen token. Auditregel `reset-aangevraagd` zonder token | B2, B5 | S | claude-sonnet-5, medium | `F0:` |
| F1 | ✅ gebouwd | Tokengeneratie en opslag: `reset-token.js` aansluiten, vervaltijd 15 minuten | Test: token op 14 minuten geldig, op 16 minuten niet. Opslag bevat alleen de hash | B1 | S | claude-sonnet-5, medium | `F1:` |
| F2 | 🔨 lopend | Verzendmail: mailbestand in `data/outbox/` | Mailbestand bevat de link met token. Token komt niet voor in het auditlog of in logregels | F0, F1, B3 | S | claude-sonnet-5, medium | `F2:` |
| F3 | ⏳ wacht op B4 | Resetformulier: nieuw wachtwoord, token verbruiken, andere sessies beëindigen | Test: tweede gebruik van dezelfde link faalt. Oud wachtwoord werkt niet meer. Sessies elders ongeldig. Auditregel `wachtwoord-gereset` | F2, B4 | M | claude-sonnet-5, high | `F3:` |

Werkafspraak: één fase per keer, groene tests vóór de volgende fase, commit-berichten beginnen met de fase-prefix.

## 8. Gevolgen en bronnen voor afgeleide documenten
**Gegevens en privacy.** Verwerkt worden: e-mailadres (bij aanvraag), reset-token (alleen SHA-256-hash), tijdstip van aanvraag en reset. Doel: herstel van toegang. Bewaartermijn: token tot gebruik of verlopen (15 minuten); auditregels blijven bestaan, zonder token. Externe verwerkers: geen in deze versie; bij echte mailverzending komt een e-mailprovider als verwerker bij.
**Beveiliging.** Token van 32 willekeurige bytes, alleen hash opgeslagen, eenmalig, 15 minuten, neutrale melding, limiet 5 per uur per adres, en (na besluit B4) vervallen andere sessies na een reset.
**Gebruikers en handleiding.** Op het inlogscherm komt de link "Wachtwoord vergeten?". Na aanvraag ziet de gebruiker altijd dezelfde melding. Na een reset logt de gebruiker in met het nieuwe wachtwoord.
**Beheer en configuratie.** Nieuwe map `data/outbox/`. Geldigheid en limiet zijn constanten in de code, geen omgevingsvariabelen.
**Releasenotes (kernpunten).** Nieuw: zelf een wachtwoord herstellen. Gewijzigd: resetlinks zijn 15 minuten geldig (voorheen 24 uur in de interne module).

## 9. Risico's en terugweg
- Sessies beëindigen hangt af van hoe sessies worden bewaard (zie B4).
- De limiet leunt op het auditlog: groeit dat bestand sterk, dan wordt tellen trager. Voor deze omvang niet relevant.
- Terugweg: elke fase is een aparte commit-reeks met prefix en terug te draaien met `git revert`. `data/reset-tokens.json` en `data/outbox/` zijn wegwerpdata.

## 10. Open vragen
| Vraag | Default als er geen antwoord komt |
|---|---|
| Wanneer pakken we echte mailverzending op? | Aparte plan, niet in dit plan |

## 11. Uitvoering
Alleen aanvullen, nooit herschrijven. Alle meetgegevens per fase; het beslisdocument toont alleen dát een fase is uitgevoerd.

| Fase | Start | Einde | Opdracht van | Uitgevoerd door | Effort | Tokens invoer / uitvoer | Commits | Bron |
|---|---|---|---|---|---|---|---|---|
| F1 | 2026-09-19 10:42 | 10:58 | Marieke Visser | Claude Code · claude-sonnet-5 · sessie 6565f5ed | medium | 214.300 / 18.900 | a41d7e2 | transcript |
| F0 | 2026-09-19 11:05 | 11:40 | Marieke Visser | Claude Code · claude-sonnet-5 · sessie 6565f5ed | medium | 402.100 / 35.600 | c92b8f0, 6e10d3a | transcript |
| F2 | 2026-09-19 11:46 | lopend | Marieke Visser | Claude Code · claude-sonnet-5 · sessie 6565f5ed | onbekend | lopend | lopend | transcript |

Tokens zijn invoer en uitvoer zonder cache. Is een waarde niet te meten, dan staat er "onbekend"; nooit een schatting.

### Toetsing per fase
Vóórdat een fase als gebouwd wordt gemarkeerd, is elk acceptatiecriterium uit punt 7 afzonderlijk getoetst met bewijs: een uitgevoerd commando met zijn uitvoer, of een aanwijsbare plek in een bestand. Alleen aanvullen: een nieuwe toetsing voegt rijen met een nieuw tijdstip toe, en alleen de laatste toetsing van een fase telt. Oordeel: gehaald, niet gehaald of niet toetsbaar.

| Fase | Tijdstip | Criterium | Controle en uitkomst | Oordeel |
|---|---|---|---|---|
| F1 | 2026-09-19 10:56 | Token op 14 minuten geldig, op 16 minuten niet | `npm test`: test "token 14 en 16 minuten" groen (uitvoer: 31 geslaagd) | gehaald |
| F1 | 2026-09-19 10:56 | Opslag bevat alleen de hash | `data/reset-tokens.json` na een aanvraag geopend: alleen het veld `hash`, geen `token` | gehaald |
| F0 | 2026-09-19 11:38 | Bekend en onbekend adres geven identiek antwoord | `npm test`: test "identiek antwoord" groen | gehaald |
| F0 | 2026-09-19 11:38 | Zesde aanvraag binnen een uur maakt geen token | `npm test`: test "limiet per uur" groen | gehaald |
| F0 | 2026-09-19 11:38 | Auditregel `reset-aangevraagd` zonder token | Auditlog na een aanvraag: regel aanwezig, geen tokenwaarde (`data/audit.log`, regel 4) | gehaald |

## 12. Afwijkingen
Ook een afwijkend model of afwijkende effort ten opzichte van "Gepland model en effort" (punt 7) staat hier, met de reden of "reden onbekend".

| Fase | Wat week af van het plan | Waarom |
|---|---|---|
| F1 | Extra test op de vervaltijd, die er nog niet was | Het acceptatiecriterium vroeg erom |

## 13. Wijzigingslog
| Versie | Datum | Wat | Geraakt | Gevolg voor vrijgave |
|---|---|---|---|---|
| 1 | 2026-09-19 09:10 | Eerste versie, besluit B5 verwerkt vóór de vrijgave | - | Vrijgave F0, F1, F2 gegeven op versie 1 |
| 2 | 2026-09-19 11:20 | B4 en F3 aangescherpt na onderzoek tijdens F0 | B4, F3 | Vrijgave F0, F1, F2 blijft geldig; F3 wacht op B4 |

## 14. Bronnen
- `src/reset-token.js`, `src/auth.js`, `src/audit.js`, `src/config.js` (stand 3f9c2ab)
- Handleiding Sandbox demo (rode draad: wachtwoord vergeten)
