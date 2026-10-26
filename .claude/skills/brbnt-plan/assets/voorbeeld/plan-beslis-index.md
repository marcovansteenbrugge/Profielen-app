# Index van plannen en beslisdocumenten

> VOORBEELD: de rij van wachtwoord-vergeten is door het script gegenereerd uit de voorbeeldbestanden; de twee andere rijen zijn fictief.

> Wordt door de skill gegenereerd uit de kopgegevens van elk plan en beslisdocument, nooit met de hand bijgehouden.
> Zoekvolgorde voor Claude: eerst deze index, dan het (korte) beslisdocument, en pas als er techniek nodig is het plan.
> Legenda: ✅ gebouwd · 🔨 lopend · ▶ vrijgegeven · ⏳ wacht op besluit · ⚠ vrijgave vervallen · ○ nog niet vrijgegeven

| Naam | Titel | Status | Voortgang per fase | Wacht op jou | Beslisser | Laatst vrijgegeven | Samenvatting | Trefwoorden |
|---|---|---|---|---|---|---|---|---|
| rapportage-pdf | Rapportage als PDF | ter-akkoord | F0 ○ · F1 ○ | B1, B2 (vóór F0) | Marieke Visser | - | Maandrapportage als PDF, gemaild aan de beheerder. | rapportage, pdf, e-mail |
| uren-exporteren | Uren exporteren | afgerond | F0 ✅ · F1 ✅ · F2 ✅ | - | Marieke Visser | F0 t/m F2, 2026-09-12 | Uren per maand downloaden als CSV. | export, csv, uren |
| wachtwoord-vergeten | Wachtwoord vergeten | in-uitvoering | F0 ✅ · F1 ✅ · F2 🔨 · F3 ⏳ | B4 (vóór F3) | Marieke Visser | F0 t/m F2, 2026-09-19 | Gebruikers stellen zelf een nieuw wachtwoord in via een link die 15 minuten geldig is en één keer werkt. | authenticatie, wachtwoord, reset-token, e-mail, auditlog, privacy, sessies |

**Statussen** (berekend, nooit met de hand gezet): concept · ter-akkoord · deels-vrijgegeven · vrijgegeven · in-uitvoering · gebouwd · afgerond · geparkeerd · vervallen.
Een plan is **deels-vrijgegeven** zodra minstens één fase mag starten terwijl andere fasen nog op een besluit wachten. Dat is een normale toestand, geen tussenstop: de vrijgegeven fasen kunnen al gebouwd worden.

**Naamgeving:** `docs/<naam>.plan.md` en `docs/<naam>.beslis.md` (sorteren samen), index: `docs/plan-beslis-index.md`.
