# Maakt per tool een A3-verkoopplaat (staand, in de stijl van de Lijnentool-plaat): HTML -> PDF en PNG via Edge.
# Gebruik: python maak_verkoop.py   (in deze map). Beelden staan in beelden/.
import html, subprocess, pathlib

HIER = pathlib.Path(__file__).resolve().parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
STAND = 'november 2026'
CONTACT = 'Lutrea Group B.V. · Ceresstraat 13, 4811 CA Breda · 06 14 15 57 26 · info@lutrea.nl · www.lutrea.nl'

TOOLS = [
  dict(code='profielen', naam='Profielen Tool', kleur='#C2650A', licht='#FDF1E4', donker='#7A3E05',
    sub='Van puntenwolk naar lengte- en dwarsprofielen op schaal',
    belofte='Open de puntenwolk, leg de as en je hebt in een paar minuten een <b>lengteprofiel en dwarsprofielen op schaal</b>, '
            'met je eigen stempel. <b>Alles draait op je eigen pc</b>; alleen de ondergrond komt van PDOK. '
            'De uitvoer gaat zo naar AutoCAD, Civil 3D, QGIS en openBIM.',
    stappen=[('Inlezen', 'LAS, LAZ of PTS in RD/NAP. Grote scans worden één keer omgezet naar vakken van 50 × 50 m; je kiest welke klassen meedoen.'),
             ('As leggen', 'Tekenen, inlezen (GeoPackage, GeoJSON, shapefile, DXF) of uit het NWB halen. Dijkpalen of hectometrering erbij.'),
             ('Profielen', 'Interval, breedte en verhouding zelf kiezen. Maaiveld uit de wolk, alle punten in een strook, BGT en kadaster in de doorsnede.'),
             ('Opleveren', 'PDF A4 t/m A0 op schaal, DXF met dezelfde bladen als layouts, IFC 4.3, GeoPackage en CSV.')],
    groot=('profielpunten_f1_bospad.png', 'Bospad: profielen uit alle 167.078 punten. Bomen en stammen staan in het dwarsprofiel, het maaiveld loopt eronder door.'),
    klein=[('blad_dwars.png', 'PDF-blad dwarsprofielen op schaal 1:100, met stempel.'),
           ('blad_lengteprofiel.png', 'PDF-blad lengteprofiel met dijkpalen langs de as.')],
    cijfers=[('A4 – A0', 'PDF op schaal, één bestand of losse bladen, met stempel, logo\'s en QR-code'),
             ('5 formaten', 'PDF, DXF (AutoCAD / Civil 3D), IFC 4.3, GeoPackage (QGIS) en CSV'),
             ('441 mln', 'punten in één project getest, dankzij de vakken van 50 × 50 m'),
             ('DP 12 +40', 'stationering op dijkpalen of hectometrering in plaats van alleen meters')],
    krijgt=['Een as met stations, ook links en rechts los in te stellen',
            'Lengteprofiel en dwarsprofielen op elke gewenste afstand',
            'Alle punten in het dwarsprofiel: bomen, stammen, de weg onder de kroon',
            'BGT, bomen, luchtfoto en kadaster van PDOK als ondergrond',
            'Een tweede meting (B) ernaast, bijvoorbeeld een oudere scan',
            'Projectmap: alles bewaard, morgen verder waar je was'],
    waarom=['Gemaakt door een CAD/BIM-specialist voor het dagelijkse werk in Civil 3D en QGIS',
            'Coördinaten altijd in RD, hoogtes in m NAP: geen omrekenen',
            'Je puntenwolk blijft op je eigen pc; er gaat niets naar de cloud',
            'Windows-programma met een setup, zonder beheerdersrechten',
            'DXF met dezelfde bladen als de PDF: wat je ziet is wat je levert']),

  dict(code='doorvaart', naam='Doorvaarthoogte', kleur='#185FA5', licht='#E6F1FB', donker='#0C447C',
    sub='Past het schip onder de brug, in hoogte én diepte?',
    belofte='De tool zet een <b>doorvaartprofiel</b> in het water en toetst het tegen de <b>echte onderzijde van de brug</b> '
            'en de echte bodem, allebei uit metingen. Je krijgt een helder oordeel, met de plek en de maat van elk tekort, '
            'en een kaart van wat niet gemeten is.',
    stappen=[('Inlezen', 'Bodempeiling of multibeam als puntenwolk, met de as van de vaarweg in de vaarrichting.'),
             ('Brug erbij', 'De scan van de onderzijde van de brug; de bovenzijde mag erbij voor beeld en tekening.'),
             ('Toetsen', 'Toetswaterstand, hoogte H, breedte B, verschuiving en vereiste diepte D. Maatgevend schip CEMT I t/m Va.'),
             ('Opleveren', 'PDF-blad Doorvaartcontrole met de maatgevende doorsnede, de dekkingskaart en GeoPackage.')],
    groot=('dv_scherm.png', 'Doorvaartbox onder de brug in bovenaanzicht, lengte- en dwarsprofiel; de conflicten in rood (testgegevens).'),
    klein=[('blad_doorvaart.png', 'PDF-blad Doorvaartcontrole met doorsnede en oordeel.'),
           ('dv_dialoog.png', 'Het venster Doorvaart met profiel en uitkomst.')],
    cijfers=[('Ruwe punten', 'getoetst op de meetpunten van de onderzijde, niet op een gemiddeld vlak'),
             ('Hoogte + diepte', 'vrije hoogte boven de toetswaterstand én waterdiepte in het profiel'),
             ('CEMT I – Va', 'maatgevend schip in de tekening, of eigen maten'),
             ('Dekkingskaart', 'laat zien waar niet gemeten is, met station, oppervlak en advies')],
    krijgt=['Oordeel voldoet / voldoet niet, met de kleinste vrije hoogte en waar',
            'Het tekort, de vrije breedte op hoogte H en de kleinste waterdiepte',
            'Profielen met het doorvaartprofiel, de brug in doorsnede en de conflicten gearceerd',
            '3D: brug, water en profiel in groen of rood; met één klik naar de brug',
            'PDF-bladen Doorvaartcontrole en Dekkingskaart',
            'GeoPackage met de box en de conflicten'],
    waarom=['Liggers, leidingen en uitsteeksels blijven zichtbaar: geen driehoeksnet dat ze wegpoetst',
            'Vogels en spatwater tellen niet mee dankzij het ruisfilter',
            'Maten achteraf aanpassen: het oordeel rekent direct opnieuw',
            'De dekkingskaart voorkomt een "voldoet" op een plek die niet gemeten is',
            'Alles in RD en m NAP, klaar voor de vaarwegbeheerder']),

  dict(code='doorrij', naam='Doorrijhoogte', kleur='#A32D2D', licht='#FCEBEB', donker='#791F1F',
    sub='Vrije hoogte onder viaduct, dak of kunstwerk, ook als RWS-doorrijprofiel',
    belofte='Kan het verkeer hier onderdoor? De tool zet een <b>box op het wegdek</b> en meet de ruimte tot het dak, '
            '<b>weg en dak uit één puntenwolk</b>. Hij vindt zelf de kunstwerken langs de weg en maakt de '
            '<b>opleverset in de opzet van de RWS-productspecificatie</b> Doorrijprofielen.',
    stappen=[('Inlezen', 'Eén scan met weg en dak; niets splitsen. Vegetatie laat je bij een LAS/LAZ gewoon weg.'),
             ('As over de weg', 'Onder het kunstwerk door. Kant verharding komt uit de BGT en loopt onder het dak door.'),
             ('Toetsen', 'Tot vier boxen per rijbaan of fietspad. Per kunstwerk een doorsnede voor en achter, ook als het schuin over de weg ligt.'),
             ('Opleveren', 'Overzichtsblad, lengteprofiel en een blad per doorsnede, met de doorrijhoogtes in drie decimalen.')],
    groot=('doorrijprofiel_rws_LoZ.png', 'Echte scan, Loon op Zand: weg onder het dak, met het doorrijprofiel in het dwarsprofiel en de vrije hoogte in het lengteprofiel.'),
    klein=[('rws_opleverset_blad2.png', 'Overzichtsblad: wat is getest, welke profielen, resultaat en de maten per doorsnede (testgegevens).'),
           ('kunstwerken_blad_1.png', 'Blad per doorsnede: kant links, as en kant rechts, met punten en spreiding (testgegevens).')],
    cijfers=[('1 puntenwolk', 'weg en dak samen; waar onder het dak geen weg gemeten is, wordt die overbrugd en gemeld'),
             ('2 per kunstwerk', 'doorsnedes aan voor- en achterkant, vanzelf gevonden en te verschuiven'),
             ('3 decimalen', 'doorrijhoogtes uit de ruwe punten binnen 10 cm, met aantal punten en spreiding'),
             ('4 boxen', 'tegelijk toetsen, bv. rijbaan en fietspad, met voorwaarden van 2,30 tot 4,50 m')],
    krijgt=['De kleinste vrije hoogte per rijbaan, ook buiten de profielen',
            'Doorrijbreedte op 0,5 – 1,0 m boven de weg, en de kleinste over 30 m vóór en na',
            'Dakmodel: ook bij een dunne scan overal een dak, met "gemeten" of "ingevuld" per meetpunt',
            'Kunstwerken met naam (KW1, KW2) in het lengteprofiel',
            'Invulvelden voor weg, object, meetdatum, meetbedrijf en controle',
            'De toets blijft bewaard in het project: na openen dezelfde uitkomst'],
    waarom=['Gemeten op de ruwe punten: of de 1 cm van RWS gehaald wordt, zie je aan de spreiding',
            'De dekkingskaart laat zien waar onder het dak niet gemeten is',
            'Vangrails en auto\'s onder het dak tellen niet als dak',
            'Zelfde maten in dwarsprofiel, lengteprofiel en PDF-blad',
            'Voor gemeente én Rijkswaterstaat: het blad of de hele opleverset']),

  dict(code='snoei', naam='Snoeien', kleur='#3B6D11', licht='#EAF3DE', donker='#27500A',
    sub='Takken in de vrije ruimte boven pad of weg, of langs de gevel',
    belofte='De tool legt een <b>doorloopprofiel</b> over het pad en vindt <b>elke tak die erin steekt</b>: '
            'waar, hoe hoog, hoeveel er terug moet en <b>op welk perceel de boom staat</b>. '
            'Een genummerde snoeikaart en snoeilijst, klaar voor de ploeg en de brief aan de eigenaar.',
    stappen=[('Inlezen', 'De scan van het pad of de straat. Takken blijven staan: de begroeiing wordt in 3D gelezen.'),
             ('As leggen', 'Langs het pad tekenen of inlezen, of langs de straat uit de voorgevels van de BGT-panden.'),
             ('Controleren', 'Standaard 2,00 × 2,50 m met 0,50 m marge, of van de gevel tot een vaste afstand. Gras en ruis tellen niet mee.'),
             ('Opleveren', 'Snoeikaart, snoeilijst en snoeilijst per perceel als PDF, CSV voor Excel en GeoPackage.')],
    groot=('paal_snoei_kaart.png', 'Snoeikaart: genummerde snoeipunten langs het schouwpad. Rood steekt in het profiel, oranje alleen in de marge (testgegevens).'),
    klein=[('gevel_dataset_1.png', 'Langs de gevels: as uit de BGT-voorgevels, de vrije ruimte aan de straatkant (testgegevens).'),
           ('blad_snoeilijst.png', 'PDF-blad Snoeilijst met dijkpalen.')],
    cijfers=[('2,00 × 2,50 m', 'standaard doorloopprofiel met 0,50 m snoeimarge; alles instelbaar'),
             ('Rood / oranje', 'snoeien (in het profiel) of meenemen (alleen in de marge)'),
             ('Per perceel', 'stam en kadastraal perceel bij elk snoeipunt, voor de brief aan de eigenaar'),
             ('Langs gevels', 'as uit de BGT-voorgevels, de gevel zelf telt niet mee')],
    krijgt=['Snoeipunten genummerd langs de as, met station of dijkpaal',
            'Per punt: kant, hoogte boven het pad, afstand tot het hart en hoeveel terug',
            'De soort: tak van opzij, kroon van boven, of struik/stam vanaf de grond',
            'Kadastrale percelen van PDOK met sectie en nummer',
            '3D: het profiel als tunnel over het pad; punt voor punt aflopen',
            'Dekkingskaart: waar profiel of marge niet gemeten is'],
    waarom=['Een haag of bomenrij wordt in hanteerbare stukken genummerd (max. 5 m)',
            'Het profiel volgt het pad, ook op een helling',
            'Het maaiveld komt uit de scan zelf, niet uit een model dat door de kronen loopt',
            '"Niets gevonden" betekent ook echt niets: de dekkingskaart laat de gaten zien',
            'Eén lijst voor de snoeiploeg, één per perceel voor de eigenaar']),
]

CSS = '''
@page { size: A3 portrait; margin: 0; }
* { box-sizing: border-box; }
:root { --navy:#2a2a5e; --grijs:#5b6070; --lijn:#d5dbe6; }
html, body { margin:0; }
body { font-family:"Segoe UI", Arial, sans-serif; color:#1d2033; background:#fff;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.vel { width:297mm; height:420mm; padding:14mm 16mm 11mm; display:flex; flex-direction:column; gap:6mm; overflow:hidden; }
header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2mm solid var(--t); padding-bottom:5mm; }
.titel .boven { font-size:10pt; letter-spacing:.12em; text-transform:uppercase; color:var(--grijs); font-weight:600; }
.titel h1 { margin:1mm 0 0; font-size:36pt; color:var(--t-d); letter-spacing:-0.5pt; line-height:1.05; }
.titel p { margin:2mm 0 0; font-size:16pt; color:var(--t); font-weight:600; }
.merk { display:grid; justify-items:end; gap:3mm; }
.merk img { height:24mm; }
.chips { display:flex; gap:1.5mm; }
.chip { font-size:7.6pt; font-weight:600; padding:.8mm 2.4mm; border:.6pt solid var(--c); color:var(--c); white-space:nowrap; border-radius:5mm; }
.chip.nu { background:var(--c); color:#fff; }
.belofte { background:var(--t-d); color:#fff; border-radius:4mm; padding:6mm 8mm; font-size:15pt; line-height:1.38; }
.belofte b { color:#fff; background:rgba(255,255,255,.14); padding:0 1mm; border-radius:1mm; }
.stappen { display:grid; grid-template-columns:repeat(4,1fr); gap:4mm; }
.stap { background:var(--t-l); border-radius:3mm; padding:4.5mm 5mm; border-top:1.5mm solid var(--t); }
.stap .nr { font-size:20pt; font-weight:700; color:var(--t); line-height:1; }
.stap h3 { margin:1.5mm 0 1.5mm; font-size:13pt; color:var(--t-d); }
.stap p { margin:0; font-size:10pt; color:var(--grijs); line-height:1.35; }
.beeld { display:grid; grid-template-columns:2fr 1fr; gap:5mm; }
.beeld .links, .beeld .rechts { display:grid; gap:4mm; align-content:start; }
.beeld .cijfers { grid-template-columns:1fr 1fr; gap:3mm; }
.beeld .links img { aspect-ratio:1600/950; object-fit:cover; object-position:center bottom; }
.beeld figure { margin:0; }
.beeld img { width:100%; border-radius:2mm; border:.4mm solid var(--lijn); display:block; }
.beeld figcaption { font-size:9pt; color:var(--grijs); margin-top:1.2mm; line-height:1.3; }
.cijfers { display:grid; grid-template-columns:repeat(4,1fr); gap:4mm; }
.cijfer { border:.5mm solid var(--lijn); border-left:1.5mm solid var(--t); border-radius:3mm; padding:3.5mm 4.5mm; }
.cijfer .getal { font-size:19pt; font-weight:700; color:var(--t-d); white-space:nowrap; }
.cijfer .wat { font-size:9.5pt; color:var(--grijs); line-height:1.3; margin-top:.5mm; }
.kolommen { display:grid; grid-template-columns:1fr 1fr; gap:8mm; }
.kolommen h2 { font-size:15pt; color:var(--t-d); margin:0 0 2mm; padding-bottom:1.2mm; border-bottom:.8pt solid var(--t); }
.kolommen ul { margin:0; padding-left:5mm; font-size:10.8pt; line-height:1.48; }
.kolommen li::marker { color:var(--t); }
footer { margin-top:auto; display:grid; grid-template-columns:1fr auto; gap:6mm; align-items:end; border-top:.5mm solid var(--lijn); padding-top:4mm; }
footer .contact { font-size:13pt; color:var(--t-d); font-weight:700; }
footer .adres { font-size:10pt; color:var(--navy); margin-top:1mm; }
footer .ook { font-size:9.5pt; color:var(--grijs); margin-top:2mm; }
.klein { font-size:8pt; color:#8a8fa0; text-align:right; line-height:1.35; max-width:95mm; }
'''

def e(t): return html.escape(t, quote=False)

def plaat(t, nr):
    chips = ''.join(f'<span class="chip{" nu" if x["code"] == t["code"] else ""}" style="--c:{x["kleur"]}">{e(x["naam"])}</span>' for x in TOOLS)
    stappen = ''.join(f'<div class="stap"><div class="nr">{i}</div><h3>{e(a)}</h3><p>{e(b)}</p></div>' for i, (a, b) in enumerate(t['stappen'], 1))
    groot = f'<figure><img src="beelden/{t["groot"][0]}" alt=""><figcaption>{e(t["groot"][1])}</figcaption></figure>'
    klein = ''.join(f'<figure><img src="beelden/{f}" alt=""><figcaption>{e(o)}</figcaption></figure>' for f, o in t['klein'])
    cijfers = ''.join(f'<div class="cijfer"><div class="getal">{e(a)}</div><div class="wat">{e(b)}</div></div>' for a, b in t['cijfers'])
    krijgt = ''.join(f'<li>{e(x)}</li>' for x in t['krijgt'])
    waarom = ''.join(f'<li>{e(x)}</li>' for x in t['waarom'])
    andere = ', '.join(x['naam'] for x in TOOLS if x['code'] != t['code'])
    noot = 'Beelden: testgegevens van Lutrea, tenzij anders vermeld.'
    if t['code'] == 'doorrij':
        noot += ' De opleverset volgt de opzet van de Productspecificaties Doorrijprofielen (RWS, 1 juli 2022), maar is geen officieel RWS-product.'
    if t['code'] == 'doorvaart':
        noot += ' Het oordeel is een toets op de meetgegevens en hoort te worden beoordeeld door een specialist.'
    return f'''<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>{e(t["naam"])} · Lutrea Profielviewer</title>
<style>:root{{--t:{t["kleur"]};--t-l:{t["licht"]};--t-d:{t["donker"]};}}{CSS}</style></head>
<body><div class="vel">
<header>
  <div class="titel"><div class="boven">Lutrea Profielviewer · tool {nr} van 4</div><h1>{e(t["naam"])}</h1><p>{e(t["sub"])}</p></div>
  <div class="merk"><img src="beelden/merk-lutrea.png" alt="Lutrea"><div class="chips">{chips}</div></div>
</header>
<div class="belofte">{t["belofte"]}</div>
<div class="stappen">{stappen}</div>
<div class="beeld"><div class="links">{groot}<div class="cijfers">{cijfers}</div></div><div class="rechts">{klein}</div></div>
<div class="kolommen">
  <div><h2>Wat je krijgt</h2><ul>{krijgt}</ul></div>
  <div><h2>Waarom het werkt</h2><ul>{waarom}</ul></div>
</div>
<footer>
  <div><div class="contact">Meer weten of een proef op je eigen project?</div><div class="adres">{e(CONTACT)}</div>
  <div class="ook">Zelfde programma, ook in de andere tools: {e(andere)}.</div></div>
  <div class="klein">{e(noot)}<br>Stand {STAND}.</div>
</footer>
</div></body></html>'''

# ── Exportplaat: de boom met uitvoerproducten ──
EXPORT = [
  dict(code='PDF', naam='PDF', sub='De tekening op schaal', voor='Opdrachtgever, archief, printen', open='Elke PDF-lezer',
    items=['Bovenaanzicht en een groot 3D-blad', 'Lengteprofiel en dwarsprofielen 1:50 – 1:500', 'Doorvaartcontrole en dekkingskaart',
           'Snoeilijst, ook per perceel', 'Doorrijhoogte, RWS-bladen en de RWS-opleverset', 'A4 – A0, stempel, logo\'s en QR-code'],
    tools='pvds'),
  dict(code='DXF', naam='DXF', sub='Dezelfde bladen, maar bewerkbaar', voor='Tekenaar, ontwerper', open='AutoCAD, Civil 3D',
    items=['Elk PDF-blad als layout, met kader en stempel', 'Viewports op schaal, vergrendeld', 'Model space: de situatie in 3D op RD/NAP',
           'Model space: profielen op ware grootte', 'Eigen lagen PV_PROF, PV_KAART, PV_BLAD', 'Zonder luchtfoto en 3D-beeld (dat zijn beelden)'],
    tools='pvds'),
  dict(code='IFC', naam='IFC 4.3', sub='openBIM, voor ontwerp en botsingscontrole', voor='BIM-coördinator, ontwerper', open='Civil 3D, Solibri, Navisworks, Revit',
    items=['De as als IfcAlignment', 'Station 0, dijkpalen, hectometers (IfcReferent)', 'Maaiveld als licht driehoeksnet',
           'Dwarsprofielen als 3D-lijnen', 'Vrije ruimtes als IfcSpatialZone', 'Bevindingen met eigenschappen Lutrea_…'],
    tools='pvs'),
  dict(code='GPKG', naam='GeoPackage', sub='Losse GIS-lagen met opmaak, ook in 3D', voor='GIS-specialist, beheerder', open='QGIS, ArcGIS, FME',
    items=['as_lijn, lengteprofiel, stationering', 'dwarsprofiel_lijnen en dwarsprofiel_3d', 'profielpunten, met verschil A/B',
           'bgt_grenzen', 'doorvaart_box, doorvaart_conflicten', 'snoeipunten, snoeiprofiel, kadastrale_percelen, niet_gemeten'],
    tools='pvs'),
  dict(code='CSV', naam='CSV', sub='De snoeilijst als tabel', voor='Snoeiploeg, aannemer, eigenaar', open='Excel',
    items=['Eén regel per snoeipunt', 'Station, dijkpaal en kant (L, R, L+R)', 'Hoogte boven het pad, afstand tot het hart',
           'Hoeveel terug en de soort', 'RD-coördinaat, perceel en stam', 'Puntkomma en decimale komma: opent direct goed'],
    tools='s'),
  dict(code='MAP', naam='Projectmap', sub='Geen uitvoer, wel al je werk', voor='Jij, morgen of op een andere pc', open='De Profielviewer',
    items=['<map>.pvproj: as, instellingen, stempel, logo\'s', 'puntenwolk\\ : alle punten in vakken van 50 × 50 m', 'ondergrond\\ : BGT, bomen, kadaster, ook offline',
           'uitvoer\\ : alle bestanden hiernaast', 'backup\\ : de laatste 10 versies', 'Toetsen bewaard: na openen dezelfde uitkomst'],
    tools='pvds'),
]
TOOLKLEUR = dict(p=('#C2650A', 'Profielen'), v=('#185FA5', 'Doorvaart'), d=('#A32D2D', 'Doorrij'), s=('#3B6D11', 'Snoeien'))

CSS_EXPORT = '''
.vel { --t:#2a2a5e; --t-d:#2a2a5e; --t-l:#eef1f8; }
.wortel { align-self:center; background:var(--navy); color:#fff; border-radius:4mm; padding:4mm 12mm; text-align:center; }
.wortel b { font-size:18pt; display:block; } .wortel span { font-size:10.5pt; opacity:.85; }
.stam { align-self:center; width:0; height:7mm; border-left:.8mm solid var(--navy); margin:-6mm 0; }
.takken { display:grid; grid-template-columns:repeat(3,1fr); gap:9mm 5mm; border-top:.8mm solid var(--navy); padding-top:7mm; position:relative; }
.prod { border:.5mm solid var(--lijn); border-radius:3mm; padding:4mm 4.5mm; position:relative; display:flex; flex-direction:column; gap:2mm; }
.prod:before { content:""; position:absolute; top:-7.6mm; left:50%; height:7.2mm; border-left:.8mm solid var(--navy); }
.prod:nth-child(n+4):before { display:none; }
.prod .kop { display:flex; align-items:center; gap:3mm; }
.prod .tag { background:var(--navy); color:#fff; font-weight:700; font-size:10pt; border-radius:1.5mm; padding:1.2mm 2.4mm; letter-spacing:.04em; }
.prod.map .tag { background:#fff; color:var(--navy); border:.5mm dashed var(--navy); }
.prod h3 { margin:0; font-size:15pt; color:var(--navy); }
.prod .sub { font-size:10pt; color:var(--grijs); margin-top:-1mm; }
.prod dl { margin:0; display:grid; grid-template-columns:auto 1fr; gap:.6mm 2.5mm; font-size:9pt; background:#f4f6fa; border-radius:2mm; padding:2mm 3mm; }
.prod dt { color:var(--grijs); } .prod dd { margin:0; color:#1d2033; font-weight:600; }
.prod ul { margin:0; padding-left:4.5mm; font-size:9.8pt; line-height:1.42; }
.prod li::marker { color:var(--navy); }
.prod .tools { margin-top:auto; display:flex; gap:1.5mm; flex-wrap:wrap; }
.tl { font-size:7.6pt; font-weight:600; padding:.5mm 2mm; border-radius:5mm; border:.5pt solid var(--c); color:var(--c); }
.tl.aan { background:var(--c); color:#fff; } .tl.uit { border-style:dashed; color:#a2a7b4; border-color:#c4c9d4; }
table.mx { width:100%; border-collapse:collapse; font-size:10pt; }
.mx th, .mx td { padding:2mm 3mm; border-bottom:.4mm solid var(--lijn); text-align:center; }
.mx th { color:var(--navy); font-size:10pt; } .mx td:first-child, .mx th:first-child { text-align:left; }
.mx .ja { font-weight:700; } .mx .nee { color:#b3b8c4; }
.mx td:first-child { font-weight:600; color:var(--c); }
.mx td:first-child i { display:inline-block; width:3mm; height:3mm; border-radius:50%; background:var(--c); margin-right:2mm; }
h2.kl { font-size:14pt; color:var(--navy); margin:0 0 2mm; padding-bottom:1.2mm; border-bottom:.8pt solid var(--navy); }
'''

MATRIX = [  # tool, PDF, DXF, IFC, GPKG, CSV
  ('p', 'profielen op schaal', 'bewerkbare bladen', 'as, maaiveld, profielen', 'as, profielen, punten', None),
  ('v', 'blad + dekkingskaart', 'zelfde bladen', 'box + conflicten', 'box + conflicten', None),
  ('d', 'blad, RWS-bladen, opleverset', 'zelfde bladen', None, None, None),
  ('s', 'snoeikaart + lijsten', 'zelfde bladen', 'profiel + snoeipunten', 'snoeipunten + percelen', 'snoeilijst'),
]

def exportplaat():
    takken = ''
    for p in EXPORT:
        tl = ''.join(f'<span class="tl {"aan" if k in p["tools"] else "uit"}" style="--c:{c}">{n}</span>' for k, (c, n) in TOOLKLEUR.items())
        items = ''.join(f'<li>{e(x)}</li>' for x in p['items'])
        takken += (f'<div class="prod{" map" if p["code"] == "MAP" else ""}"><div class="kop"><span class="tag">{e(p["code"])}</span><h3>{e(p["naam"])}</h3></div>'
                   f'<div class="sub">{e(p["sub"])}</div><dl><dt>Voor</dt><dd>{e(p["voor"])}</dd><dt>Openen in</dt><dd>{e(p["open"])}</dd></dl>'
                   f'<ul>{items}</ul><div class="tools">{tl}</div></div>')
    rijen = ''
    for k, *cellen in MATRIX:
        c, n = TOOLKLEUR[k]
        rijen += f'<tr style="--c:{c}"><td><i></i>{n}</td>' + ''.join(
            f'<td class="ja">{e(x)}</td>' if x else '<td class="nee">nog niet</td>' for x in cellen) + '</tr>'
    return f'''<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>Exportproducten · Lutrea Profielviewer</title>
<style>{CSS}{CSS_EXPORT}</style></head>
<body><div class="vel">
<header>
  <div class="titel"><div class="boven">Lutrea Profielviewer · uitvoer</div><h1>Wat je eruit krijgt</h1><p>Eén project, zes takken: van PDF op schaal tot BIM en GIS</p></div>
  <div class="merk"><img src="beelden/merk-lutrea.png" alt="Lutrea"></div>
</header>
<div class="belofte">Alles komt uit <b>hetzelfde project</b> en ligt in <b>RD New met hoogtes in m NAP</b>: niets omrekenen. Met een projectmap gaat elk bestand vanzelf naar <b>uitvoer\\</b>, zonder vragen.</div>
<div class="wortel"><b>Lutrea Profielviewer</b><span>puntenwolk · as · profielen · toetsen</span></div>
<div class="stam"></div>
<div class="takken">{takken}</div>
<div><h2 class="kl">Wat er per tool in welk bestand komt</h2>
<table class="mx"><tr><th>Tool</th><th>PDF</th><th>DXF</th><th>IFC 4.3</th><th>GeoPackage</th><th>CSV</th></tr>{rijen}</table></div>
<footer>
  <div><div class="contact" style="color:var(--navy)">Meer weten of een proef op je eigen project?</div><div class="adres">{e(CONTACT)}</div></div>
  <div class="klein">DXF gecontroleerd met ezdxf, IFC met IfcOpenShell en web-ifc.<br>Stand {STAND}.</div>
</footer>
</div></body></html>'''

def naar_pdf(h, pdf, png):
    url = h.as_uri()
    subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', f'--print-to-pdf={pdf}', url], capture_output=True)
    # 297 x 420 mm bij 96 dpi = 1123 x 1588 px
    subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1123,1588', f'--screenshot={png}', url], capture_output=True)

if __name__ == '__main__':
    pdfs = []
    for i, t in enumerate(TOOLS, 1):
        h = HIER / f'verkoop-{i}-{t["code"]}.html'
        h.write_text(plaat(t, i), encoding='utf-8')
        pdf = HIER / f'Verkoop-{i}-{t["naam"].replace(" ", "-")}-A3.pdf'
        naar_pdf(h, pdf, HIER / f'voorbeeld-{i}-{t["code"]}.png')
        pdfs.append(pdf); print('gemaakt:', pdf.name)
    h = HIER / 'verkoop-5-export.html'
    h.write_text(exportplaat(), encoding='utf-8')
    exp = HIER / 'Verkoop-5-Exportproducten-A3.pdf'
    naar_pdf(h, exp, HIER / 'voorbeeld-5-export.png'); print('gemaakt:', exp.name)
    import time
    for _ in range(100):   # Edge schrijft de PDF soms pas na het afsluiten weg
        if all(p.exists() and p.stat().st_size > 0 for p in pdfs): break
        time.sleep(0.2)
    try:
        import pymupdf
        samen = pymupdf.open()
        for p in pdfs: samen.insert_pdf(pymupdf.open(p))
        samen.save(HIER / 'Verkoop-Lutrea-Profielviewer-4-tools-A3.pdf'); print('gebundeld:', samen.page_count, 'bladen')
    except ImportError:
        print('pymupdf ontbreekt: geen gebundelde PDF')
