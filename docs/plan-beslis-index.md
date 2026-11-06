# Index van plannen en beslisdocumenten

> Wordt door de skill gegenereerd uit de kopgegevens van elk plan en beslisdocument, nooit met de hand bijgehouden.
> Zoekvolgorde voor Claude: eerst deze index, dan het (korte) beslisdocument, en pas als er techniek nodig is het plan.
> Legenda: ✅ gebouwd · 🔨 lopend · ▶ vrijgegeven · ⏳ wacht op besluit · ⚠ vrijgave vervallen · ○ nog niet vrijgegeven

| Naam | Titel | Status | Voortgang per fase | Wacht op jou | Beslisser | Laatst vrijgegeven | Samenvatting | Trefwoorden |
|---|---|---|---|---|---|---|---|---|
| eigen-bestandstoegang | Eigen bestandstoegang, geen toestemmingsvragen meer (versie 2.10.2) | gebouwd | F0 ✅ · F1 ✅ · F2 ✅ · F3 ✅ · F4 ✅ | - | Marco van Steenbrugge, eigenaar van de Profielviewer | F0 t/m F4, 2026-10-27 | De exe leest en schrijft de bestanden van de viewer zelf, zodat er geen toestemmingsvragen meer zijn en de exe later (fase E) zelf met paden kan werken; fase C van PLAN-2.10. | bestandstoegang, projectmap, toestemming, exe, go, webview2, token, 2.10.2, recente projecten, pvproj |
| installatie | Installer voor de Profielviewer (Inno Setup, per gebruiker) | gebouwd | F0 ✅ · F1 ✅ · F2 ✅ | - | Marco van Steenbrugge, eigenaar van de Profielviewer | F0 t/m F2, 2026-10-30 | Een setup.exe (Inno Setup) die de Profielviewer per gebruiker installeert zonder beheerdersrechten, met startmenu, verwijderen via Windows en .pvproj dubbelklikken; fase B van PLAN-2.10. | installer, installatie, inno setup, setup, startmenu, verwijderen, bestandskoppeling, pvproj, 2.11.4, fase B |
| klassen-kiezen | Kiezen welke classificaties worden ingelezen | in-uitvoering | F0 ✅ · F1 ▶ · F2 ▶ | - | Marco van Steenbrugge, eigenaar van de Profielviewer | F0 t/m F2, 2026-11-06 | Bij het openen van een LAS/LAZ kiest de gebruiker welke classificaties (maaiveld, weg, gebouw, …) worden ingelezen; de rest komt niet in de vakken, zodat zeer dichte wolken (zoals LoZ.laz, 441 mln punten) werkbaar worden. | classificatie, klassen, filter, las, laz, omzetten, vakken, tegels, metashape, geheugen, loon op zand |
| omzetten-in-exe | Grote scans omzetten in het programma zelf (versie 2.11) | gebouwd | F0 ✅ · F1 ✅ · F2 ✅ · F3 ✅ · F4 ✅ · F5 ✅ · F6 ✅ | - | Marco van Steenbrugge, eigenaar van de Profielviewer | F0 t/m F6, 2026-10-28 | De exe zet LAS, PTS en daarna LAZ zelf om naar vakken (pv-tegels-1), op alle processorkernen en buiten het geheugen van het venster; fase E van PLAN-2.10. | omzetten, vakken, tegels, las, laz, pts, go, wazero, laz-perf, 2.11, geheugen, kernen, wallach |
| punten-in-profiel | Alle punten in het dwarsprofiel (bomen, en de weg eronder) | in-uitvoering | F0 ✅ · F1 ✅ · F2 ✅ · F3 ▶ | - | Marco van Steenbrugge, eigenaar van de Profielviewer | F0 t/m F3, 2026-11-06 | Het dwarsprofiel toont naast de lijn alle punten in een instelbare strook (standaard ±0,5 m), zodat bomen, stammen en de weg onder de kroon zichtbaar zijn, ook in de PDF en de DXF. | dwarsprofiel, punten, puntenwolk, bomen, kroon, maaiveld, strook, pdf, dxf, 2.12.0 |
| webview2-venster | Eigen programmavenster met WebView2 (versie 2.10.0) | gebouwd | F0 ✅ · F1 ✅ · F2 ✅ · F3 ✅ | - | Marco van Steenbrugge, eigenaar van de Profielviewer | F0 t/m F3, 2026-10-27 | De exe opent de viewer in een eigen WebView2-venster in plaats van een Chrome/Edge-app-venster; fase A van PLAN-2.10. | webview2, exe, go, venster, windows, 2.10.0, terugvaloptie, instellingen |

**Statussen** (berekend, nooit met de hand gezet): concept · ter-akkoord · deels-vrijgegeven · vrijgegeven · in-uitvoering · gebouwd · afgerond · geparkeerd · vervallen.
Een plan is **deels-vrijgegeven** zodra minstens één fase mag starten terwijl andere fasen nog op een besluit wachten. Dat is een normale toestand, geen tussenstop: de vrijgegeven fasen kunnen al gebouwd worden.

**Naamgeving:** `docs/<naam>.plan.md` en `docs/<naam>.beslis.md` (sorteren samen), index: `docs/plan-beslis-index.md`.

*Powered by BRBNT · AI als Engineeringsdiscipline (Lutrea Group B.V.) · brbnt-plan v1.2*
