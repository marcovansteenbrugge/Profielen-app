# Inschatting per fase: omzetten in de exe (versie 2.11)

Opgesteld op 27 oktober 2026 door Claude Code, op verzoek van Marco van Steenbrugge. Hoort bij
`omzetten-in-exe.plan.md` (planversie 1).

**Dit is een schatting, geen meting.** Het plan zelf bevat alleen gemeten waarden (punt 11). Na
elke fase wordt de werkelijke meting uit het plan hier in de laatste kolommen overgenomen, zodat
zichtbaar wordt hoe goed de schatting was.

## Basis: gemeten bij eerdere fasen (27-10-2026)

| Fase (plan) | Omvang | Uitvoer-tokens | Werktijd Claude |
|---|---|---|---|
| eigen-bestandstoegang F0 (bestands-API) | M | 29.953 | ± 7 min |
| eigen-bestandstoegang F1 (Windows-kiezer) | M | 23.760 | ± 5 min, daarna wachten op Marco |
| eigen-bestandstoegang F2 (adapter in de viewer) | L | 49.679 | ± 1 uur (met snelheidsonderzoek) |
| eigen-bestandstoegang F3 (recent, pad, slepen) | M | 41.751 | ± 40 min |
| eigen-bestandstoegang F4 (oplevering 2.10.2) | S | 13.161 | ± 10 min |
| webview2-venster F3 (oplevering 2.10.0) | S | 13.767 | ± 10 min |

Ruwweg: S ≈ 15.000, M ≈ 25.000–40.000, L ≈ 50.000 uitvoer-tokens. Wachten op een controle van
Marco komt daar los bij.

## Schatting per fase

| Fase | Omvang | Uitvoer-tokens (schatting) | Werktijd Claude (schatting) | Nodig van Marco | Onzekerheid | Gemeten tokens | Gemeten tijd |
|---|---|---|---|---|---|---|---|
| F0 LAS en vakken in Go | L | 60.000–90.000 | 1–2 uur | niets | middel | 50.765 | 16:49–17:05 (16 min) |
| F1 PTS | M | 25.000–35.000 | 20–40 min | niets | laag | 22.639 | 17:06–17:16 (10 min) |
| F2 viewer laat de exe omzetten | L | 50.000–80.000 | 1–2 uur | B3, B4; test met een grote LAS | middel | 71.666 | 17:18–17:49 bouwen (31 min); controle tot 20:54 |
| F3 oplevering 2.11.0 | S | ± 15.000 | ± 15 min | handmatige lijst | laag | 32 / 12.705 | 20:55–21:02 (7 min) |
| F4 LAZ-proef | M | 30.000–70.000 | 30 min – 2 uur | niets | hoog | - | - |
| F5 LAZ in de exe | L | 50.000–90.000 | 1–2 uur | B5; een echte LAZ en een test | hoog | - | - |
| F6 oplevering 2.11.2 | S | ± 15.000 | ± 15 min | handmatige lijst | laag | - | - |

Totaal ruwweg 250.000–400.000 uitvoer-tokens. 2.11.0 (F0 tot en met F3) is ongeveer een halve tot
hele werkdag, plus de controles van Marco; groter dan fase C (eigen bestandstoegang).

## Waarom deze marges
- **F0 is groter dan een gewone L:** de uitdunners moeten exact worden nagebouwd en de vakken
  moeten byte voor byte gelijk zijn. Elk klein verschil (zoals de afronding van halve millimeters)
  moet eerst gevonden worden.
- **F4 is een proef.** Werkt laz-perf meteen in wazero, dan is het klein. Heeft de module de
  JavaScript-lijm van Emscripten nodig, dan moet die in Go worden nagebouwd (mogelijk het dubbele).
  Lukt het niet, dan stopt F4 met een rapport en wordt F5 anders (besluit B5).
- **F5 hangt van F4 af**, en is daarom ook hoog onzeker.
