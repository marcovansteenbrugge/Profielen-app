# Verkoopplaten Lutrea Profielviewer

Vijf A3-platen (staand) voor klanten, in de opzet van de verkoopplaat van de Lijnentool. Elke tool heeft de kleur uit de viewer.

| Plaat | PDF | HTML |
|---|---|---|
| 1. Profielen Tool | [PDF](Verkoop-1-Profielen-Tool-A3.pdf) | [HTML](verkoop-1-profielen.html) |
| 2. Doorvaarthoogte | [PDF](Verkoop-2-Doorvaarthoogte-A3.pdf) | [HTML](verkoop-2-doorvaart.html) |
| 3. Doorrijhoogte | [PDF](Verkoop-3-Doorrijhoogte-A3.pdf) | [HTML](verkoop-3-doorrij.html) |
| 4. Snoeien | [PDF](Verkoop-4-Snoeien-A3.pdf) | [HTML](verkoop-4-snoei.html) |
| 5. Exportproducten (de boom met PDF, DXF, IFC, GeoPackage, CSV en projectmap) | [PDF](Verkoop-5-Exportproducten-A3.pdf) | [HTML](verkoop-5-export.html) |

## Opnieuw maken

```
python maak_verkoop.py
```

Het script schrijft de HTML, maakt via Edge (headless) de PDF's en een voorbeeld-PNG per plaat, en bundelt de vier toolplaten tot
`Verkoop-Lutrea-Profielviewer-4-tools-A3.pdf`. De bundel en de voorbeelden staan niet in git.

- Teksten aanpassen: in `maak_verkoop.py` (bovenin `TOOLS`, `EXPORT` en `MATRIX`), niet in de HTML; die wordt overschreven.
- Beelden staan in `beelden/` en komen uit `tests/uit` en het voorstel van 8 november (`dist/voorstel`).

## Om op te letten

- Stand november 2026. Kunstwerken met doorsnedes, dakmodel, RWS-opleverset en snoeien langs gevels zitten nog niet in een
  uitgeleverde versie (verwacht 2.16.0).
- Beelden zijn testgegevens, behalve Loon op Zand (echte scan). Dat staat klein onder elke plaat.
- De doorrijplaat zegt dat de opleverset de opzet van de RWS-specificatie volgt, maar geen officieel RWS-product is.
- Doorrijhoogte gaat nog niet naar IFC en GeoPackage; CSV is alleen de snoeilijst. Bijwerken als dat verandert.
