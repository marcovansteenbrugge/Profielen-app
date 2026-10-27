/* ══════════════════════════════════════════════════════════════════════
   Lutrea Profielviewer (voorheen PTS-viewer)

   Bootst het Civil3D-deel na dat de profielentool vandaag nodig heeft:
   een puntenwolk inlezen (.pts of .las), er een surface (TIN) van bouwen,
   een as erlangs tekenen, en daar een lengteprofiel + dwarsprofielen uit
   afleiden. Alles client-side, geen server, geen Civil3D — puur om te
   testen of dat voor een "kleine" dataset praktisch haalbaar is.

   Geen enkele link met de bestaande Lutrea Toolbar-webviewer: dit is
   bewust een losse, minimale proef, niet een vervanging.
   ══════════════════════════════════════════════════════════════════════ */

(() => {
  "use strict";

  // ── stand ──────────────────────────────────────────────────────────
  let xs = null, ys = null, zs = null;      // de ingelezen punten
  let cs = null;            // RGB per punt (0xRRGGBB) als het bestand kleuren heeft, anders null
  let kleurModus = 'hoogte';          // 'hoogte' of 'rgb'
  let kleurVoorkeur = null;  // laatste keuze van de gebruiker ('hoogte'/'rgb'), null = nog niet gekozen
  let delaunay = null;                       // d3.Delaunay over (xs,ys)
  let incident = null;                       // puntindex → lijst driehoeken
  let zMin = 0, zMax = 1;

  // Tweede puntenwolk om mee te vergelijken (bv. AHN tegen drone, of twee
  // meetmomenten): {naam, xs, ys, zs, delaunay, incident, maxZijde, notitie}
  let wolkB = null;
  let toonWolkA = true, toonWolkB = true;
  const fmtH = (h) => (Math.abs(h) < 0.005 ? 0 : h).toFixed(2);   // nooit "-0.00"

  let asPunten = [];        // [{x,y}, …] — de actieve (zelf getekende) as
  // Meerdere losse assen: elke as heeft een naam en eigen punten. `asPunten`
  // is altijd dezelfde array als assen[actieveAs].punten.
  let assen = [{ naam: 'As 1', punten: asPunten }];
  let actieveAs = 0;
  let tekenModus = false;
  let asSleepPunt = -1, asHoverPunt = -1, asSleepBewogen = false, negeerVolgendeKlik = false;
  let bronBestandsnaam = null;  // naam van het ingelezen .pts/.las/.laz-bestand, voor "project opslaan"
  let wachtendProject = null;   // project-data die wacht op het (opnieuw) inlezen van de puntenwolk

  let langsprofiel = [];     // [{station, hoogte}, …] of hoogte:null buiten het net
  let dwarsStations = [];    // stations waarop een dwarsprofiel bekeken kan worden
  let huidigeStationIndex = 0;
  let stationLabelVakken = [];   // schermvakjes van de stationsnummers in het bovenaanzicht (laatste tekening)
  // Stationering: 'm' (meters vanaf het begin van de as), 'palen' (dijkpalen uit een bestand) of 'hm' (berekende hectometrering)
  const PAAL_STANDAARD = { modus: 'm', lijst: [], bron: '', voorvoegsel: 'DP', maxAfstand: 50, hmStart: '', hmRichting: 1, hmVoorvoegsel: 'hm', profielenOpPalen: false, tonen: true, versie: 0 };
  let palen = { ...PAAL_STANDAARD, lijst: [] };
  let paalCache = { sleutel: '', lijst: [] };

  // Echte dronedata-PTS'en gaan al snel in de miljoenen punten (honderden MB).
  // Boven dit aantal dunnen we ruimtelijk uit vóór de triangulatie, anders
  // wordt zowel het inlezen als elke pan/zoom-herteken onwerkbaar traag.
  const MAX_PUNTEN = 300000;   // standaard aantal punten voor de surface
  /** Gekozen aantal punten voor de surface (instelling "punten" in de bovenbalk). */
  function doelPunten() {
    return Number(document.getElementById('puntDichtheid')?.value) || MAX_PUNTEN;
  }
  /** Welk punt per vakje bij het uitdunnen: 'boven' (hoogste = bovenkant, zoals op
   *  de foto: wegdek op een brug, daken, kruinen) of 'onder' (laagste: maaiveld onder
   *  bomen, bodem onder een brug). Voorheen werd het eerste punt uit het bestand
   *  genomen — bij data met meerdere lagen (brug + bodempeiling) gaf dat pieken. */
  function oppervlakModus() {
    return document.getElementById('oppervlakModus')?.value === 'onder' ? 'onder' : 'boven';
  }
  const beter = (modus, zNieuw, zOud) => modus === 'onder' ? zNieuw < zOud : zNieuw > zOud;
  /** Waterpeil (m NAP) voor het dwarsprofiel, of null als het veld leeg is. */
  function waterpeil() {
    const v = document.getElementById('waterpeil')?.value;
    if (v == null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  /** Aan welke kant van de as het water ligt: 'beide', 'links' of 'rechts'. */
  function waterKant() { return document.getElementById('waterKant')?.value || 'beide'; }
  const randenStrakAan = () => oppervlakModus() === 'boven' && document.getElementById('randenStrak')?.checked !== false;

  /** Hekwerk en randen strak: een open hek (spijlen) of een smalle muur wordt
   *  door een drone maar op losse plekken geraakt; tussen die treffers zakt het
   *  oppervlak terug naar het voetpad -> een kam van pieken. Hier worden zulke
   *  gaten gedicht: ligt een punt minstens DREMPEL lager dan wat er in dezelfde
   *  richting aan BEIDE kanten binnen STRAAL ligt, dan wordt het opgetrokken tot
   *  de laagste van die twee (en krijgt het de kleur van dat punt). Dwars op het
   *  hek ligt aan één kant het voetpad, dus het hek wordt niet breder; een goot
   *  of andere ondiepe dip (< DREMPEL) blijft ongemoeid. (Grijswaarde-"closing"
   *  met lijnvormige elementen in 4 richtingen.)  Past xs/ys/zs/cs ter plekke aan;
   *  geeft het aantal opgetrokken punten terug. */
  function sluitRanden(pxs, pys, pzs, pcs) {
    const STRAAL = 0.5, DREMPEL = 0.25;
    const n = pxs.length;
    if (n < 10) return 0;
    const [x0, x1] = bereikVan(pxs), [y0, y1] = bereikVan(pys);
    const cel = Math.min(1, Math.max(0.03, 0.5 * Math.sqrt(Math.max(1e-6, (x1 - x0) * (y1 - y0)) / n)));
    const nx = Math.floor((x1 - x0) / cel) + 1, ny = Math.floor((y1 - y0) / cel) + 1;
    if (nx * ny > 40e6) return 0;   // extreem groot gebied: overslaan
    const gz = new Float32Array(nx * ny).fill(NaN), gi = new Int32Array(nx * ny).fill(-1);
    const celVan = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const c = Math.floor((pys[i] - y0) / cel) * nx + Math.floor((pxs[i] - x0) / cel);
      celVan[i] = c;
      if (!(gz[c] >= pzs[i])) { gz[c] = pzs[i]; gi[c] = i; }
    }
    const stappen = Math.max(1, Math.ceil(STRAAL / cel));
    const richtingen = [[1, 0], [0, 1], [1, 1], [1, -1]];
    const vul = new Float32Array(nx * ny).fill(NaN), vulI = new Int32Array(nx * ny).fill(-1);
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
      const c = cy * nx + cx;
      if (gi[c] < 0) continue;
      const eigen = gz[c];
      let best = -Infinity, bestI = -1;
      for (const [dx, dy] of richtingen) {
        const lang = (dx && dy) ? Math.max(1, Math.round(stappen / Math.SQRT2)) : stappen;
        let mp = -Infinity, ip = -1, mn = -Infinity, iN = -1;
        for (let k = 1; k <= lang; k++) {
          const ax = cx + dx * k, ay = cy + dy * k;
          if (ax >= 0 && ay >= 0 && ax < nx && ay < ny) { const a = ay * nx + ax; if (gz[a] > mp) { mp = gz[a]; ip = gi[a]; } }
          const bx = cx - dx * k, by = cy - dy * k;
          if (bx >= 0 && by >= 0 && bx < nx && by < ny) { const b2 = by * nx + bx; if (gz[b2] > mn) { mn = gz[b2]; iN = gi[b2]; } }
        }
        if (ip < 0 || iN < 0) continue;
        const kand = Math.min(mp, mn);
        if (kand > best) { best = kand; bestI = mp <= mn ? ip : iN; }
      }
      if (best - eigen >= DREMPEL) { vul[c] = best; vulI[c] = bestI; }
    }
    let opgetrokken = 0;
    for (let i = 0; i < n; i++) {
      const c = celVan[i];
      if (vulI[c] < 0 || !(vul[c] - pzs[i] >= DREMPEL)) continue;
      pzs[i] = vul[c];
      if (pcs) pcs[i] = pcs[vulI[c]];
      opgetrokken++;
    }
    return opgetrokken;
  }
  let gemPuntAfstand = 0.5;     // gemiddelde puntafstand (m) van de huidige surface
  let laatsteBestand = null;    // laatst ingelezen bestand, om bij een andere puntdichtheid opnieuw te lezen

  let luchtfotoAan = false;
  let bgtLagen = [];  // [{ringen:[[{x,y},…]], stijl, lijnAlleen}] — terrein (vlakken/lijnen)
  let boomLagen = []; // zelfde vorm, maar dan puntAlleen — losstaand van bgtLagen

  /* PDOK-luchtfoto (WMTS, RD-tegelraster) — publieke, open dienst, geen sleutel
     nodig. Origin/schaal komen 1-op-1 uit de GetCapabilities van
     https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0 voor TileMatrixSet
     EPSG:28992, dat toevallig exact ons RD-assenstelsel is — geen herprojectie
     nodig. */
  const LUCHTFOTO_ORIGIN_X = -285401.92, LUCHTFOTO_ORIGIN_Y = 903401.92;
  const LUCHTFOTO_MATRICES = [
    12288000, 6144000, 3072000, 1536000, 768000, 384000, 192000, 96000,
    48000, 24000, 12000, 6000, 3000, 1500, 750,
  ].map((schaalTeller, level) => ({
    level,
    matW: 2 ** level,
    resolutie: schaalTeller * 0.00028,          // m per tegelpixel (OGC-standaard 0.28mm)
    tileWereld: schaalTeller * 0.00028 * 256,    // m per tegel (256px)
  }));
  const luchtfotoCache = new Map(); // 'level/col/row' -> {status, img}

  /** Kiest het grofste WMTS-niveau dat nog fijn genoeg is voor de huidige zoom. */
  function kiesLuchtfotoNiveau() {
    const doelResolutie = 1 / schaal; // m per schermpixel
    for (const m of LUCHTFOTO_MATRICES) if (m.resolutie <= doelResolutie) return m.level;
    return LUCHTFOTO_MATRICES[LUCHTFOTO_MATRICES.length - 1].level;
  }

  function haalLuchtfotoTegel(level, col, row) {
    const key = `${level}/${col}/${row}`;
    let entry = luchtfotoCache.get(key);
    // mislukte tegel na 8 s opnieuw proberen (bv. een tijdelijke haper bij PDOK)
    if (entry && !(entry.status === 'fout' && performance.now() - entry.t > 8000)) return entry;
    entry = { status: 'laden', img: null, t: performance.now() };
    luchtfotoCache.set(key, entry);
    const img = new Image();
    img.onload = () => { entry.status = 'klaar'; entry.img = img; if (luchtfotoAan) tekenVlak(); };
    img.onerror = () => { entry.status = 'fout'; entry.t = performance.now(); };
    img.src = `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:28992/${String(level).padStart(2, '0')}/${col}/${row}.jpeg`;
    return entry;
  }

  /** Tekent de luchtfoto-tegels die het zichtbare deel van het bovenaanzicht dekken.
   *  Stapt automatisch naar een grover niveau af als dat anders te veel tegels
   *  in één keer zou opvragen (bv. net ingezoomd en dan ver uitgezoomd). */
  function tekenLuchtfoto() {
    const linksBoven = schermNaarWereld(0, 0);
    const rechtsOnder = schermNaarWereld(canvasVlak.clientWidth, canvasVlak.clientHeight);
    const minX = Math.min(linksBoven.x, rechtsOnder.x), maxX = Math.max(linksBoven.x, rechtsOnder.x);
    const minY = Math.min(linksBoven.y, rechtsOnder.y), maxY = Math.max(linksBoven.y, rechtsOnder.y);

    let niveau, colMin, colMax, rowMin, rowMax, aantalTegels = Infinity;
    for (let idx = kiesLuchtfotoNiveau(); idx >= 0; idx--) {
      niveau = LUCHTFOTO_MATRICES[idx];
      const tw = niveau.tileWereld;
      colMin = Math.max(0, Math.floor((minX - LUCHTFOTO_ORIGIN_X) / tw));
      colMax = Math.min(niveau.matW - 1, Math.floor((maxX - LUCHTFOTO_ORIGIN_X) / tw));
      rowMin = Math.max(0, Math.floor((LUCHTFOTO_ORIGIN_Y - maxY) / tw));
      rowMax = Math.min(niveau.matW - 1, Math.floor((LUCHTFOTO_ORIGIN_Y - minY) / tw));
      aantalTegels = (colMax - colMin + 1) * (rowMax - rowMin + 1);
      if (aantalTegels <= 120) break;
    }
    if (!(aantalTegels <= 120)) return;

    // Eerst een grover niveau als ondergrond: zolang (of als) een fijne tegel
    // niet binnen is, zie je dan een wat vagere foto in plaats van een gat.
    const grof = LUCHTFOTO_MATRICES[Math.max(0, niveau.level - 3)];
    if (grof !== niveau) {
      const gtw = grof.tileWereld;
      const gc0 = Math.max(0, Math.floor((minX - LUCHTFOTO_ORIGIN_X) / gtw)), gc1 = Math.min(grof.matW - 1, Math.floor((maxX - LUCHTFOTO_ORIGIN_X) / gtw));
      const gr0 = Math.max(0, Math.floor((LUCHTFOTO_ORIGIN_Y - maxY) / gtw)), gr1 = Math.min(grof.matW - 1, Math.floor((LUCHTFOTO_ORIGIN_Y - minY) / gtw));
      if ((gc1 - gc0 + 1) * (gr1 - gr0 + 1) <= 16) {
        for (let col = gc0; col <= gc1; col++) for (let row = gr0; row <= gr1; row++) {
          const e = haalLuchtfotoTegel(grof.level, col, row);
          if (e.status !== 'klaar') continue;
          const [qx0, qy0] = wereldNaarScherm(LUCHTFOTO_ORIGIN_X + col * gtw, LUCHTFOTO_ORIGIN_Y - row * gtw);
          const [qx1, qy1] = wereldNaarScherm(LUCHTFOTO_ORIGIN_X + (col + 1) * gtw, LUCHTFOTO_ORIGIN_Y - (row + 1) * gtw);
          ctxVlak.drawImage(e.img, qx0, qy0, qx1 - qx0, qy1 - qy0);
        }
      }
    }
    const tw = niveau.tileWereld;
    for (let col = colMin; col <= colMax; col++) {
      for (let row = rowMin; row <= rowMax; row++) {
        const entry = haalLuchtfotoTegel(niveau.level, col, row);
        if (entry.status !== 'klaar') continue;
        const tegelMinX = LUCHTFOTO_ORIGIN_X + col * tw;
        const tegelMaxY = LUCHTFOTO_ORIGIN_Y - row * tw;
        const [px0, py0] = wereldNaarScherm(tegelMinX, tegelMaxY);
        const [px1, py1] = wereldNaarScherm(tegelMinX + tw, tegelMaxY - tw);
        ctxVlak.drawImage(entry.img, px0, py0, px1 - px0, py1 - py0);
      }
    }
  }

  /* ────────────────────────────────────────────────────────────────
     BGT: platte GeoJSON-lagen (zoals PDOK's BGT-download per laag,
     bv. pand.json/wegdeel.json/waterdeel.json) als referentie erbij
     laden — al in RD (EPSG:28992), net als onze PTS, dus geen
     herprojectie nodig.
     ──────────────────────────────────────────────────────────────── */

  const BGT_KLEUREN = [
    { test: /kruinlijn/i, vul: 'rgba(139,90,43,0.25)', lijn: '#8B5A2B', streep: [6, 4], naam: 'Kruinlijn (talud)' },
    { test: /scheiding|kunstwerkdeel_lijn|inrichtingselement_lijn/i, vul: 'rgba(66,80,100,0.25)', lijn: '#425064', naam: 'Scheiding / kunstwerk' },
    { test: /\bboom\b/i, vul: 'rgba(26,92,42,0.55)', lijn: '#1A5C2A', naam: 'Boom' },
    { test: /water/i, vul: 'rgba(30,127,166,0.35)', lijn: '#1E7FA6', naam: 'Water' },
    { test: /pand|gebouw/i, vul: 'rgba(27,42,56,0.35)', lijn: '#1B2A38', naam: 'Pand / gebouw' },
    { test: /groen|begroei|natuur|onbegroeidterreindeel/i, vul: 'rgba(70,140,70,0.30)', lijn: '#3F7A3F', naam: 'Terrein (begroeid/onbegroeid)' },
    { test: /weg|verhard|rijbaan|voetpad|fietspad|parkeer|ondersteunend/i, vul: 'rgba(107,122,140,0.35)', lijn: '#6B7A8C', naam: 'Weg / verharding' },
    { test: /spoor/i, vul: 'rgba(169,120,31,0.35)', lijn: '#A9781F', naam: 'Spoor' },
  ];
  const BGT_STANDAARD = { vul: 'rgba(198,71,43,0.22)', lijn: '#C6472B', naam: 'Overig BGT' };

  // Weergave: 'lijnen' (standaard) tekent BGT-vlakken alleen als omtrek, zonder
  // vulling, en haalt ook de echte BGT-lijnobjecten op (kruinlijnen, scheidingen…).
  // 'vlakken' is de oude weergave met gevulde vlakken.
  let bgtWeergave = 'lijnen';

  function bgtStijl(properties, laagNaam) {
    const waarden = [laagNaam || '', ...Object.values(properties || {}).filter(v => typeof v === 'string')].join(' ');
    for (const k of BGT_KLEUREN) if (k.test.test(waarden)) return k;
    return BGT_STANDAARD;
  }

  /** Leidt een korte laagnaam af uit veelvoorkomende BGT-eigenschapsnamen,
   *  voor het geval de laag niet al bekend is (bv. bij een handmatig
   *  bestand in plaats van de PDOK-bevraging, waar we 'm al weten). */
  function afgeleidBgtLabel(properties) {
    if (!properties) return null;
    return properties.bgtlaag || properties.laagnaam || properties['bgt-laagnaam']
      || properties.functie || properties.fysiek_voorkomen || properties['bgt-fysiekvoorkomen']
      || properties.class || properties.type || null;
  }

  /** Zet een GeoJSON FeatureCollection (of los Feature) om naar tekenbare
   *  lagen. Ondersteunt Polygon/MultiPolygon (gevuld), LineString/
   *  MultiLineString (alleen lijn) en Point/MultiPoint (bv. losse bomen uit
   *  vegetatieobject_punt) — de geometrietypen die in BGT voorkomen.
   *  `laagNaam` is de PDOK-collectienaam als die al bekend is (auto-ophalen);
   *  anders wordt een label uit de feature-eigenschappen geraden. */
  function laadBgtGeoJSON(geojson, laagNaam) {
    const features = geojson.type === 'FeatureCollection' ? geojson.features
      : geojson.type === 'Feature' ? [geojson] : [];
    const lagen = [];
    for (const f of features) {
      const geom = f.geometry;
      if (!geom) continue;
      const stijl = bgtStijl(f.properties, laagNaam);
      // bij een punt (bv. een boom) is de laagnaam van de PDOK-collectie
      // ("vegetatieobject_punt") minder nuttig dan het eigen type/plus_type
      const label = geom.type === 'Point' || geom.type === 'MultiPoint'
        ? (f.properties?.plus_type || f.properties?.type || laagNaam || afgeleidBgtLabel(f.properties))
        : (laagNaam || afgeleidBgtLabel(f.properties));
      const naarPunten = (ring) => ring.map(([x, y]) => ({ x, y }));
      if (geom.type === 'Polygon') {
        lagen.push({ ringen: geom.coordinates.map(naarPunten), stijl, lijnAlleen: false, label });
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) lagen.push({ ringen: poly.map(naarPunten), stijl, lijnAlleen: false, label });
      } else if (geom.type === 'LineString') {
        lagen.push({ ringen: [naarPunten(geom.coordinates)], stijl, lijnAlleen: true, label });
      } else if (geom.type === 'MultiLineString') {
        for (const lijn of geom.coordinates) lagen.push({ ringen: [naarPunten(lijn)], stijl, lijnAlleen: true, label });
      } else if (geom.type === 'Point') {
        const [x, y] = geom.coordinates;
        lagen.push({ ringen: [[{ x, y }]], stijl, puntAlleen: true, label });
      } else if (geom.type === 'MultiPoint') {
        for (const [x, y] of geom.coordinates) lagen.push({ ringen: [[{ x, y }]], stijl, puntAlleen: true, label });
      }
    }
    return lagen;
  }

  /* ────────────────────────────────────────────────────────────────
     BGT (of andere lijnen/vlakken) uit een DXF — bv. een BGT-tekening
     die als DWG binnenkwam en in Civil 3D als DXF is opgeslagen.
     Gesloten polylijnen → vlakken (voor de balk en de grenzen in het
     dwarsprofiel), open lijnen → lijnen. De laagnaam wordt de naam.
     Coördinaten moeten in RD staan (zoals bij een BGT-tekening normaal).
     ──────────────────────────────────────────────────────────────── */
  const ACI_BASIS = { 1: '#E02020', 2: '#D8C400', 3: '#1FA83A', 4: '#00A8B8', 5: '#2040D0', 6: '#C020C0', 7: '#333333', 8: '#808080', 9: '#B0B0B0' };
  function aciKleur(aci) {
    aci = Math.abs(aci | 0);
    if (ACI_BASIS[aci]) return ACI_BASIS[aci];
    const hex = (h, sat, l) => {           // hsl → #rrggbb (de PDF wil hex)
      const a = sat * Math.min(l, 1 - l);
      const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
      return `#${f(0)}${f(8)}${f(4)}`;
    };
    if (aci >= 10 && aci <= 249) {
      const tint = Math.floor((aci - 10) / 10) * 15, stap = (aci - 10) % 10;
      const licht = [45, 70, 35, 60, 28, 50, 22, 40, 16, 30][stap];
      return hex(tint, 0.7, licht / 100);
    }
    if (aci >= 250 && aci <= 255) return hex(0, 0, (20 + (aci - 250) * 14) / 100);
    return '#C6472B';
  }

  /** Laagnaam uit een BGT-tekening opschonen: "Kant verharding_GG_LIJN_KTVH" → "Kant verharding". */
  const dxfNaam = (l) => String(l || '').replace(/^\(.*?\)\s*/, '').split(/_G[BG]_/)[0].trim() || String(l || '');
  /** Ligt de laag niet op maaiveld (plus/min-niveau, dakrand, overbouw…)? Dan standaard uit. */
  const dxfStandaardUit = /klic|maatvoering|tekst|text|symb|plus ?1|_p[1-9]\b|min ?1|_m[1-9]\b|dakrand|overbouw|onderbouw|luifel|overkapping|verbouw|beheer|raster|huisnummer|straatnaam|hoogte/i;

  /** Leest een ASCII-DXF. Per laag: lijnen, gesloten vlakken, teksten (vlak-
   *  namen in een BGT-tekening: de "centroïden") en blokken (bv. bomen). */
  function leesDxf(tekst, kader) {
    const regels = tekst.split(/\r?\n/);
    const lagen = new Map();
    const laagKleur = new Map();
    const laag = (naam) => {
      if (!lagen.has(naam)) lagen.set(naam, { naam, kleur: null, vlakken: [], lijnen: [], teksten: [], blokken: [] });
      return lagen.get(naam);
    };
    let sectie = null, i = 0, buiten = 0;
    const inKader = (x, y) => !kader || (x >= kader.minX && x <= kader.maxX && y >= kader.minY && y <= kader.maxY);
    const voeg = (naam, pts, dicht, kleur) => {
      if (pts.length < 2) return;
      if (kader && !pts.some(p => inKader(p.x, p.y))) { buiten++; return; }
      const l = laag(naam);
      if (kleur != null && l.kleur == null) l.kleur = kleur;
      if (dicht && pts.length >= 3) {
        const r = pts.slice();
        if (r[0].x !== r[r.length - 1].x || r[0].y !== r[r.length - 1].y) r.push({ ...r[0] });
        l.vlakken.push(r);
      } else l.lijnen.push(pts);
    };
    const boog = (cx, cy, r, a0, a1) => {           // graden, tegen de klok in
      let d = a1 - a0; while (d <= 0) d += 360;
      const n = Math.max(4, Math.ceil(d / 10));
      const pts = [];
      for (let k = 0; k <= n; k++) { const a = (a0 + d * k / n) * Math.PI / 180; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
      return pts;
    };
    // boog in een polylijn (bulge) → tussenpunten
    const metBulge = (p, q, b, uit) => {
      if (!b) return;
      const hoek = 4 * Math.atan(b), dx = q.x - p.x, dy = q.y - p.y, koorde = Math.hypot(dx, dy);
      if (koorde < 1e-9) return;
      const r = koorde / (2 * Math.sin(hoek / 2));                 // met teken
      const h = r * Math.cos(hoek / 2);
      const cx = (p.x + q.x) / 2 - h * dy / koorde, cy = (p.y + q.y) / 2 + h * dx / koorde;
      const a0 = Math.atan2(p.y - cy, p.x - cx), straal = Math.abs(r);
      const n = Math.max(2, Math.ceil(Math.abs(hoek) / (Math.PI / 18)));
      for (let k = 1; k < n; k++) { const a = a0 + hoek * k / n; uit.push({ x: cx + straal * Math.cos(a), y: cy + straal * Math.sin(a) }); }
    };
    const leesGroepen = () => {
      const g = [];
      while (i + 1 < regels.length) {
        const code = parseInt(regels[i], 10);
        if (code === 0) break;
        g.push([code, regels[i + 1].trim()]); i += 2;
      }
      return g;
    };
    let polyline = null;   // oude POLYLINE + VERTEX…SEQEND
    while (i + 1 < regels.length) {
      const code = parseInt(regels[i], 10), waarde = regels[i + 1].trim();
      i += 2;
      if (code !== 0) continue;
      if (waarde === 'SECTION') { const g = leesGroepen(); sectie = (g.find(x => x[0] === 2) || [])[1]; continue; }
      if (waarde === 'ENDSEC') { sectie = null; continue; }
      if (waarde === 'EOF') break;
      if (sectie === 'TABLES' && waarde === 'LAYER') {
        const g = leesGroepen();
        const naam = (g.find(x => x[0] === 2) || [])[1];
        const kl = g.find(x => x[0] === 62);
        if (naam && kl) laagKleur.set(naam, aciKleur(+kl[1]));
        continue;
      }
      if (sectie !== 'ENTITIES') continue;
      const g = leesGroepen();
      const laagNaam = (g.find(x => x[0] === 8) || [, '0'])[1];
      const eigenKleur = g.find(x => x[0] === 62);
      const kleur = eigenKleur && +eigenKleur[1] !== 256 && +eigenKleur[1] !== 0 ? aciKleur(+eigenKleur[1]) : null;
      const getal = (c) => { const v = g.find(x => x[0] === c); return v ? parseFloat(v[1]) : 0; };
      if (waarde === 'LINE') {
        voeg(laagNaam, [{ x: getal(10), y: getal(20) }, { x: getal(11), y: getal(21) }], false, kleur);
      } else if (waarde === 'LWPOLYLINE') {
        const dicht = !!((getal(70) | 0) & 1);
        const pts = [], bulges = [];
        for (const [c, v] of g) {
          if (c === 10) { pts.push({ x: parseFloat(v), y: 0 }); bulges.push(0); }
          else if (c === 20 && pts.length) pts[pts.length - 1].y = parseFloat(v);
          else if (c === 42 && pts.length) bulges[pts.length - 1] = parseFloat(v);
        }
        const uit = [];
        for (let k = 0; k < pts.length; k++) {
          uit.push(pts[k]);
          const volgende = k + 1 < pts.length ? pts[k + 1] : (dicht ? pts[0] : null);
          if (volgende) metBulge(pts[k], volgende, bulges[k], uit);
        }
        voeg(laagNaam, uit, dicht, kleur);
      } else if (waarde === 'POLYLINE') {
        const vlag = getal(70) | 0;
        polyline = { laag: laagNaam, dicht: !!(vlag & 1), pts: [], kleur, overslaan: !!(vlag & (16 | 64)) };
      } else if (waarde === 'VERTEX' && polyline) {
        polyline.pts.push({ x: getal(10), y: getal(20) });
      } else if (waarde === 'SEQEND' && polyline) {
        if (!polyline.overslaan) voeg(polyline.laag, polyline.pts, polyline.dicht, polyline.kleur);
        polyline = null;
      } else if (waarde === 'ARC') {
        voeg(laagNaam, boog(getal(10), getal(20), getal(40), getal(50), getal(51)), false, kleur);
      } else if (waarde === 'CIRCLE') {
        voeg(laagNaam, boog(getal(10), getal(20), getal(40), 0, 360), true, kleur);
      } else if (waarde === 'SPLINE') {
        const fitX = g.filter(x => x[0] === 11).map(x => +x[1]), fitY = g.filter(x => x[0] === 21).map(x => +x[1]);
        const cX = g.filter(x => x[0] === 10).map(x => +x[1]), cY = g.filter(x => x[0] === 20).map(x => +x[1]);
        const [ax, ay] = fitX.length >= 2 ? [fitX, fitY] : [cX, cY];
        voeg(laagNaam, ax.map((x, k) => ({ x, y: ay[k] })), !!((getal(70) | 0) & 1), kleur);
      } else if (waarde === 'TEXT' || waarde === 'MTEXT') {
        const x = getal(10), y = getal(20);
        if (inKader(x, y)) laag(laagNaam).teksten.push({ x, y, tekst: (g.find(v => v[0] === 1) || [, ''])[1] });
      } else if (waarde === 'INSERT') {
        const x = getal(10), y = getal(20);
        if (inKader(x, y)) laag(laagNaam).blokken.push({ x, y });
      }
    }
    for (const [naam, l] of lagen) if (!l.kleur) l.kleur = laagKleur.get(naam) || '#C6472B';
    return { lagen, buiten };
  }

  /** Soort laag voor de import: 'lijnen' (grenzen), 'namen' (vlaknamen/centroïden), 'bomen', of null. */
  function dxfSoort(l) {
    if (/boom/i.test(l.naam) && !/slagboom/i.test(l.naam) && l.blokken.length) return 'bomen';
    if (/_CENT_/i.test(l.naam) && l.teksten.length) return 'namen';
    if (l.lijnen.length || l.vlakken.length) return 'lijnen';
    return null;
  }

  /** Venster: welke lagen uit de DXF meenemen? Geeft een Set met laagnamen, of null bij annuleren. */
  function kiesDxfLagen(lagen, bestandsnaam) {
    return new Promise((klaar) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'dxfDialoog';
      const groepen = [['lijnen', 'Lijnen en grenzen'], ['namen', 'Vlaknamen (teksten in de vlakken)'], ['bomen', 'Bomen']];
      const lijst = [...lagen.values()].filter(l => dxfSoort(l)).sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
      const esc = (t) => String(t).replace(/[<>&"]/g, '');
      const aantal = (l) => {
        const d = [];
        if (dxfSoort(l) === 'namen') d.push(`${l.teksten.length} vlak${l.teksten.length > 1 ? 'ken' : ''}`);
        else if (dxfSoort(l) === 'bomen') d.push(`${l.blokken.length} bo${l.blokken.length > 1 ? 'men' : 'om'}`);
        else {
          if (l.vlakken.length) d.push(`${l.vlakken.length} gesloten`);
          if (l.lijnen.length) d.push(`${l.lijnen.length} lijn${l.lijnen.length > 1 ? 'en' : ''}`);
        }
        return d.join(', ');
      };
      let html = '';
      for (const [soort, kop] of groepen) {
        const deel = lijst.filter(l => dxfSoort(l) === soort);
        if (!deel.length) continue;
        html += `<div class="dxfGroep">${kop}</div>` + deel.map(l => `<label><input type="checkbox" data-naam="${esc(l.naam)}" ${(soort !== 'bomen' && dxfStandaardUit.test(l.naam)) ? '' : 'checked'}>
          <span class="dxfKleur" style="background:${l.kleur}"></span><span class="dxfNaam" title="${esc(l.naam)}">${esc(dxfNaam(l.naam))}</span>
          <span class="zacht">${aantal(l)}</span></label>`).join('');
      }
      dlg.innerHTML = `<form method="dialog"><h3>Lagen uit ${esc(bestandsnaam)}</h3>
        <p class="hint">Lijnen worden de grenzen in het dwarsprofiel; de vlaknamen (teksten in de vlakken, zoals in een BGT-tekening) bepalen wat er tussen twee grenzen ligt. Lagen boven of onder maaiveld (plus 1, min 1, dakranden) en KLIC staan standaard uit.</p>
        <div class="dxfLijst">${html}</div>
        <div class="knoppen"><button type="button" data-actie="alles">alles</button><button type="button" data-actie="niets">niets</button>
          <span class="rek"></span><button value="annuleer">Annuleren</button><button value="ok" class="primair">Laden</button></div></form>`;
      document.body.append(dlg);
      dlg.querySelector('[data-actie=alles]').onclick = () => dlg.querySelectorAll('.dxfLijst input').forEach(c => { c.checked = true; });
      dlg.querySelector('[data-actie=niets]').onclick = () => dlg.querySelectorAll('.dxfLijst input').forEach(c => { c.checked = false; });
      dlg.addEventListener('close', () => {
        const ok = dlg.returnValue === 'ok';
        const gekozen = new Set([...dlg.querySelectorAll('.dxfLijst input')].filter(c => c.checked).map(c => c.dataset.naam));
        dlg.remove();
        klaar(ok ? gekozen : null);
      });
      dlg.showModal();
    });
  }

  async function laadBgtDxf(bestand) {
    statusEl.textContent = `${bestand.name} lezen…`;
    await new Promise(r => setTimeout(r, 10));
    let res;
    try {
      const tekst = await bestand.text();
      if (!/SECTION/.test(tekst.slice(0, 4000)))
        throw new Error('geen tekst-DXF (een binaire DXF of een DWG kan niet; sla op als ASCII-DXF)');
      let kader = null;
      if (xs) {
        const [x0, x1] = bereikVan(xs), [y0, y1] = bereikVan(ys);
        kader = { minX: x0 - 50, maxX: x1 + 50, minY: y0 - 50, maxY: y1 + 50 };
      }
      res = leesDxf(tekst, kader);
    } catch (err) {
      toonFout(`kon ${bestand.name} niet als DXF lezen: ${err.message}`);
      return;
    }
    const bruikbaar = [...res.lagen.values()].filter(l => dxfSoort(l));
    if (!bruikbaar.length) {
      statusEl.textContent = res.buiten
        ? `DXF: ${res.buiten.toLocaleString('nl-NL')} objecten gevonden, maar geen enkele in het gebied van de puntenwolk — staat de tekening in RD-coördinaten?`
        : 'DXF: geen lijnen, vlakken of vlaknamen gevonden';
      return;
    }
    const gekozen = await kiesDxfLagen(res.lagen, bestand.name);
    if (!gekozen) { statusEl.textContent = 'DXF laden geannuleerd'; return; }
    const nieuw = [], bomen = [];
    let nL = 0, nV = 0, nN = 0;
    for (const l of bruikbaar) {
      if (!gekozen.has(l.naam)) continue;
      const naam = dxfNaam(l.naam);
      const herkend = bgtStijl({}, naam);
      const stijl = herkend === BGT_STANDAARD ? { vul: 'rgba(120,120,120,0.18)', lijn: l.kleur, naam } : herkend;
      const soort = dxfSoort(l);
      if (soort === 'bomen') {
        const st = bgtStijl({}, 'boom');
        for (const b of l.blokken) bomen.push({ ringen: [[{ x: b.x, y: b.y }]], stijl: st, puntAlleen: true, label: 'boom' });
      } else if (soort === 'namen') {
        for (const t of l.teksten) { nieuw.push({ ringen: [[{ x: t.x, y: t.y }]], stijl, puntAlleen: true, centroide: true, label: naam }); nN++; }
      } else {
        for (const r of l.vlakken) { nieuw.push({ ringen: [r], stijl, lijnAlleen: false, label: naam, bron: 'dxf' }); nV++; }
        for (const r of l.lijnen) { nieuw.push({ ringen: [r], stijl, lijnAlleen: true, label: naam, bron: 'dxf' }); nL++; }
      }
    }
    bgtLagen = bgtLagen.concat(nieuw);
    if (bomen.length) { boomLagen = boomLagen.concat(bomen); wisBomenKnop.disabled = false; }
    wisBgtKnop.disabled = bgtLagen.length === 0;
    statusEl.textContent = `DXF: ${nL.toLocaleString('nl-NL')} lijnen, ${nV.toLocaleString('nl-NL')} gesloten vlakken, ${nN.toLocaleString('nl-NL')} vlaknamen`
      + (bomen.length ? `, ${bomen.length.toLocaleString('nl-NL')} bomen` : '') + ` (${bestand.name})`
      + (res.buiten ? ` · ${res.buiten.toLocaleString('nl-NL')} objecten buiten het gebied overgeslagen` : '');
    tekenVlak();
    tekenDwarsVoorHuidigeStation();
  }

  /* Vlaknaam op (x,y) uit losse vlaknamen (centroïden) — voor een BGT-tekening
     zonder gesloten vlakken (zoals een IMGeo-DWG: grenslijnen + een tekst in
     elk vlak). Werkwijze: de grenslijnen worden op een fijn raster gezet, en
     vanuit elke vlaknaam wordt het raster "volgelopen" tot aan de grenzen
     (alle namen tegelijk, dus bij een kier in een grens wint de dichtstbijzijnde
     naam). Lijnen die bínnen een vlak liggen (talud, hek, haag…) tellen niet als grens. */
  const DXF_GEEN_GRENS = /talud|kruin|hek|haag|schutting|duiker|molgoot|steiger|geleidewerk|remmingswerk|vuilvang|afscheiding/i;
  let bgtVlakRaster = null;
  function maakBgtVlakRaster() {
    const namen = bgtLagen.filter(l => l.centroide).map(l => ({ x: l.ringen[0][0].x, y: l.ringen[0][0].y, label: l.label }));
    if (!namen.length) return null;
    let minX, maxX, minY, maxY;
    if (xs) { [minX, maxX] = bereikVan(xs); [minY, maxY] = bereikVan(ys); minX -= 60; maxX += 60; minY -= 60; maxY += 60; }
    else { [minX, maxX] = bereikVan(namen.map(n => n.x)); [minY, maxY] = bereikVan(namen.map(n => n.y)); minX -= 100; maxX += 100; minY -= 100; maxY += 100; }
    const cel = Math.max(0.25, Math.sqrt((maxX - minX) * (maxY - minY) / 6e6));
    const nx = Math.ceil((maxX - minX) / cel) + 1, ny = Math.ceil((maxY - minY) / cel) + 1;
    const vak = new Int32Array(nx * ny).fill(-1);          // -1 leeg, -2 grens, ≥0 index in namen
    const zet = (x, y) => {
      const i = Math.floor((x - minX) / cel), j = Math.floor((y - minY) / cel);
      if (i >= 0 && j >= 0 && i < nx && j < ny) vak[j * nx + i] = -2;
    };
    for (const laag of bgtLagen) {
      if (laag.puntAlleen) continue;
      if (laag.lijnAlleen && DXF_GEEN_GRENS.test(laag.label || '')) continue;
      for (const ring of laag.ringen) for (let k = 1; k < ring.length; k++) {
        const a = ring[k - 1], b = ring[k];
        const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cel * 0.5)) + 1;
        if (n > 200000) continue;
        for (let t = 0; t <= n; t++) zet(a.x + (b.x - a.x) * t / n, a.y + (b.y - a.y) * t / n);
      }
    }
    // alle namen tegelijk laten "vollopen" (breadth-first)
    const rij = new Int32Array(nx * ny);
    let kop = 0, staart = 0;
    namen.forEach((n, k) => {
      const i = Math.floor((n.x - minX) / cel), j = Math.floor((n.y - minY) / cel);
      if (i < 0 || j < 0 || i >= nx || j >= ny) return;
      const c = j * nx + i;
      if (vak[c] === -1) { vak[c] = k; rij[staart++] = c; }
    });
    while (kop < staart) {
      const c = rij[kop++], k = vak[c], i = c % nx;
      if (i > 0 && vak[c - 1] === -1) { vak[c - 1] = k; rij[staart++] = c - 1; }
      if (i < nx - 1 && vak[c + 1] === -1) { vak[c + 1] = k; rij[staart++] = c + 1; }
      if (c >= nx && vak[c - nx] === -1) { vak[c - nx] = k; rij[staart++] = c - nx; }
      if (c < nx * (ny - 1) && vak[c + nx] === -1) { vak[c + nx] = k; rij[staart++] = c + nx; }
    }
    return { minX, minY, cel, nx, ny, vak, namen };
  }
  function centroideLabelOp(x, y) {
    if (!bgtLagen.some(l => l.centroide)) return null;
    if (!bgtVlakRaster || bgtVlakRaster.bron !== bgtLagen || bgtVlakRaster.n !== bgtLagen.length || bgtVlakRaster.xs !== xs) {
      bgtVlakRaster = maakBgtVlakRaster() || {};
      bgtVlakRaster.bron = bgtLagen; bgtVlakRaster.n = bgtLagen.length; bgtVlakRaster.xs = xs;
    }
    const R = bgtVlakRaster;
    if (!R.vak) return null;
    const i = Math.floor((x - R.minX) / R.cel), j = Math.floor((y - R.minY) / R.cel);
    for (let r = 0; r <= 2; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= R.nx || jj >= R.ny) continue;
      const k = R.vak[jj * R.nx + ii];
      if (k >= 0) return R.namen[k].label;
    }
    return null;
  }

  /* Automatisch BGT ophalen bij PDOK — de "BGT Features (OGC API)", een
     publieke, dagelijks bijgewerkte dienst, direct GeoJSON, bevraagbaar op
     bbox in RD. Zo hoeft niemand zelf een BGT-extract te downloaden.
     Terrein (vlakken/lijnen) en bomen (losse punten) zijn bewust twee
     aparte ophaal-acties — net als in de Civil3D-plugin (laadOmgeving()
     en laadBomen() in kaart.js zijn daar ook twee losse dingen), zodat je
     ze onafhankelijk van elkaar aan/uit kunt zetten of vervangen. */
  const BGT_API = 'https://api.pdok.nl/kadaster/bgt/ogc/v1';
  const BGT_LAGEN_OPHALEN = [
    'pand', 'wegdeel', 'ondersteunendwegdeel', 'waterdeel', 'ondersteunendwaterdeel',
    'begroeidterreindeel', 'onbegroeidterreindeel', 'overigbouwwerk', 'kunstwerkdeel_vlak',
  ];
  // Echte lijnobjecten in de BGT — alleen opgehaald in de weergave "alleen lijnen".
  // Kruinlijnen zijn voor dijk- en taludwerk vaak de interessantste.
  const BGT_LIJNLAGEN_OPHALEN = [
    'begroeidterreindeel_kruinlijn', 'onbegroeidterreindeel_kruinlijn', 'ondersteunendwegdeel_kruinlijn',
    'wegdeel_kruinlijn', 'scheiding_lijn', 'spoor', 'kunstwerkdeel_lijn',
    'waterinrichtingselement_lijn', 'weginrichtingselement_lijn',
  ];
  const BGT_MAX_PAGINAS = 25; // × 1000 objecten per laag

  /** Haalt de gekozen BGT-terreinlagen op voor een RD-bbox. De dienst geeft
   *  bij een simpele bbox-bevraging ook beëindigde (historische) objecten
   *  terug, dus filteren we met een peildatum=nu op alleen de actuele
   *  situatie. */
  async function haalBgtOp(bbox, onVoortgang, metLijnlagen = true) {
    const [minX, minY, maxX, maxY] = bbox;
    const crs = 'http://www.opengis.net/def/crs/EPSG/0/28992';
    const peildatum = new Date().toISOString();
    const lagen = [];
    const collecties = metLijnlagen ? BGT_LAGEN_OPHALEN.concat(BGT_LIJNLAGEN_OPHALEN) : BGT_LAGEN_OPHALEN;
    for (const laag of collecties) {
      onVoortgang?.(laag);
      // PDOK geeft maximaal 1000 objecten per antwoord; via de "next"-link
      // bladeren we door, anders vallen bij een groot gebied objecten weg.
      let url = `${BGT_API}/collections/${laag}/items`
        + `?bbox=${minX},${minY},${maxX},${maxY}&bbox-crs=${encodeURIComponent(crs)}`
        + `&crs=${encodeURIComponent(crs)}&datetime=${encodeURIComponent(peildatum)}&limit=1000&f=json`;
      for (let pagina = 0; url && pagina < BGT_MAX_PAGINAS; pagina++) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) break;
          const geojson = await resp.json();
          lagen.push(...laadBgtGeoJSON(geojson, laag));
          const volgende = (geojson.links || []).find(l => l.rel === 'next');
          url = volgende && (geojson.features || []).length ? volgende.href : null;
          if (url) onVoortgang?.(`${laag}, blad ${pagina + 2}`);
        } catch {
          break; // deze laag overslaan (bv. tijdelijk niet bereikbaar) — de rest gaat door
        }
      }
    }
    return lagen;
  }

  /** Haalt losse boompunten op (BGT vegetatieobject_punt, gefilterd op
   *  plus_type "boom" — PDOK ondersteunt geen server-side filter hierop,
   *  dus lokaal na ontvangst). Los van haalBgtOp: eigen knop, eigen
   *  "wissen", eigen bestand-upload. */
  async function haalBomenOp(bbox) {
    const [minX, minY, maxX, maxY] = bbox;
    const crs = 'http://www.opengis.net/def/crs/EPSG/0/28992';
    const peildatum = new Date().toISOString();
    const url = `${BGT_API}/collections/vegetatieobject_punt/items`
      + `?bbox=${minX},${minY},${maxX},${maxY}&bbox-crs=${encodeURIComponent(crs)}`
      + `&crs=${encodeURIComponent(crs)}&datetime=${encodeURIComponent(peildatum)}&limit=1000&f=json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PDOK gaf ${resp.status}`);
    const geojson = await resp.json();
    if (geojson.features) geojson.features = geojson.features.filter(f => f.properties?.plus_type === 'boom');
    return laadBgtGeoJSON(geojson, 'vegetatieobject_punt');
  }

  function tekenBgt() {
    for (const laag of bgtLagen) {
      if (laag.centroide) {
        if (schaal < 3) continue;
        const [px, py] = wereldNaarScherm(laag.ringen[0][0].x, laag.ringen[0][0].y);
        ctxVlak.font = '500 10px "Segoe UI", system-ui, sans-serif';
        ctxVlak.textAlign = 'center';
        ctxVlak.lineWidth = 3; ctxVlak.strokeStyle = 'rgba(255,255,255,0.8)'; ctxVlak.strokeText(bgtKort(laag.label), px, py);
        ctxVlak.fillStyle = '#5A6878'; ctxVlak.fillText(bgtKort(laag.label), px, py);
        ctxVlak.textAlign = 'start';
        continue;
      }
      if (laag.puntAlleen) {
        const [px, py] = wereldNaarScherm(laag.ringen[0][0].x, laag.ringen[0][0].y);
        // Overige losse puntfeatures (niet-boom, die zit in boomLagen):
        // gewoon een kroon + stam-stipje in de eigen laagkleur — geen
        // aanname over wat het is.
        ctxVlak.beginPath();
        ctxVlak.arc(px, py, 6, 0, Math.PI * 2);
        ctxVlak.fillStyle = laag.stijl.vul;
        ctxVlak.fill();
        ctxVlak.strokeStyle = laag.stijl.lijn;
        ctxVlak.lineWidth = 1.2;
        ctxVlak.stroke();
        ctxVlak.beginPath();
        ctxVlak.arc(px, py, 1.5, 0, Math.PI * 2);
        ctxVlak.fillStyle = laag.stijl.lijn;
        ctxVlak.fill();
        continue;
      }
      for (const ring of laag.ringen) {
        if (ring.length < 2) continue;
        ctxVlak.beginPath();
        ring.forEach((p, i) => {
          const [px, py] = wereldNaarScherm(p.x, p.y);
          if (i === 0) ctxVlak.moveTo(px, py); else ctxVlak.lineTo(px, py);
        });
        if (!laag.lijnAlleen) {
          ctxVlak.closePath();
          if (bgtWeergave === 'vlakken') {
            ctxVlak.fillStyle = laag.stijl.vul;
            ctxVlak.fill();
          }
        }
        ctxVlak.strokeStyle = laag.stijl.lijn;
        ctxVlak.lineWidth = laag.lijnAlleen ? 1.6 : 1.2;
        ctxVlak.setLineDash(laag.stijl.streep || []);
        ctxVlak.stroke();
        ctxVlak.setLineDash([]);
      }
    }
  }

  function tekenBomen() {
    for (const laag of boomLagen) {
      if (!laag.puntAlleen) continue;
      const [px, py] = wereldNaarScherm(laag.ringen[0][0].x, laag.ringen[0][0].y);
      // Zelfde "paaltje met rondje erop" als de bomen op de kaart in de
      // Civil3D-plugin (zie boomIcoon() in kaart.js) — een stam-lijntje
      // dat omhoog "groeit" vanaf het werkelijke punt, met de kroon
      // erboven. Vaste schermgrootte (geen wereldschaal): we kennen de
      // werkelijke kroondiameter hier niet, in tegenstelling tot de
      // plugin die 'm uit het AHN-hoogteverschil afleidt.
      const straal = 6, paal = straal * 1.3;
      ctxVlak.beginPath();
      ctxVlak.moveTo(px, py);
      ctxVlak.lineTo(px, py - paal);
      ctxVlak.strokeStyle = '#2E7D32';
      ctxVlak.lineWidth = 1.6;
      ctxVlak.stroke();

      ctxVlak.beginPath();
      ctxVlak.arc(px, py - paal, straal, 0, Math.PI * 2);
      ctxVlak.fillStyle = 'rgba(60,140,60,.55)';
      ctxVlak.fill();
      ctxVlak.strokeStyle = '#2E7D32';
      ctxVlak.lineWidth = 1.2;
      ctxVlak.stroke();
    }
  }

  /** Punt-in-polygon (ray casting) op de buitenring — gaten in een BGT-vlak
   *  negeren we hier, niet relevant voor waar een dwarsprofiel doorheen valt. */
  function puntInRing(x, y, ring) {
    let binnen = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i].x, yi = ring[i].y, xj = ring[j].x, yj = ring[j].y;
      const kruist = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (kruist) binnen = !binnen;
    }
    return binnen;
  }

  /** In welk BGT-vlak valt (x,y)? Gebruikt voor de BGT-strip onder het
   *  dwarsprofiel — welke laag raakt de doorsnede op elk punt. */
  function bgtLabelOp(x, y) {
    for (const laag of bgtLagen) {
      if (laag.lijnAlleen || laag.puntAlleen || !laag.label) continue;
      if (puntInRing(x, y, laag.ringen[0])) return laag.label;
    }
    return null;
  }

  // Kaart-transform (wereld ↔ scherm) voor het bovenaanzicht.
  let schaal = 1, panX = 0, panY = 0;
  let slepen = null;

  // Zoom/pan voor het dwarsprofiel (schaal 1 + geen pan = de standaard-fit).
  let dwarsZoom = { schaal: 1, panX: 0, panY: 0 };
  let dwarsSlepen = null;

  // Zelfde zoom/pan-principe voor het lengteprofiel.
  let langsZoom = { schaal: 1, panX: 0, panY: 0 };
  let langsSlepen = null;

  // 3D-weergave (draadframe van de surface) — lazy opgezet bij de eerste
  // keer aanzetten, daarna hergebruikt.
  let drieD = null; // { renderer, scene, camera, controls, terrein, bomen }
  let drieDActief = false;
  let drieDAnimatieId = null;
  let drieDModus = 'draad'; // 'draad' (lijnen, standaard) of 'vlak' (gevuld, belicht)

  // ── DOM ────────────────────────────────────────────────────────────
  const canvasVlak   = document.getElementById('canvasVlak');
  const ctxVlak      = canvasVlak.getContext('2d');
  const vlakLeeg      = document.getElementById('vlakLeeg');
  const svgLangs      = document.getElementById('svgLangs');
  const langsLeeg     = document.getElementById('langsLeeg');
  const svgDwars      = document.getElementById('svgDwars');
  const dwarsLeeg      = document.getElementById('dwarsLeeg');
  const statusEl      = document.getElementById('status');

  /* Fouten zichtbaar maken in de statusbalk i.p.v. alleen in de console —
     anders lijkt het alsof er "gewoon niets gebeurt". */
  // Knoppen "Openen…" / "Bestand…" voor de (verborgen) bestandsvelden: klik opent het
  // veld, en de knop volgt het veld als het aan/uit gezet wordt.
  for (const knop of document.querySelectorAll('button.bestandOpen[data-voor]')) {
    const veld = document.getElementById(knop.dataset.voor);
    if (!veld) continue;
    knop.addEventListener('click', () => {
      if (veld.disabled) return;
      // eigen venster: de puntenwolk met de Windows-kiezer, zodat het programma kan omzetten
      if (veld.id === 'ptsBestand' && window.__pvNatief) { kiesPuntenwolkA(); return; }
      veld.click();
    });
    knop.disabled = veld.disabled;
    new MutationObserver(() => { knop.disabled = veld.disabled; }).observe(veld, { attributes: true, attributeFilter: ['disabled'] });
  }
  // lint: groepen in- en uitklappen door op de kop te klikken (onthouden per gebruiker)
  {
    let dicht = [];
    try { dicht = JSON.parse(localStorage.getItem('pv.lintIngeklapt') || '[]'); } catch { /* geen opslag */ }
    for (const groep of document.querySelectorAll('#lint .groep')) {
      const kop = groep.querySelector('h2'), naam = groep.getAttribute('aria-label') || kop?.textContent;
      if (!kop) continue;
      kop.title = 'Klik om deze groep in of uit te klappen';
      kop.setAttribute('role', 'button'); kop.tabIndex = 0;
      const zet = (in_) => { groep.classList.toggle('ingeklapt', in_); kop.setAttribute('aria-expanded', String(!in_)); };
      zet(dicht.includes(naam));
      const wissel = () => {
        const nu = !groep.classList.contains('ingeklapt');
        zet(nu);
        dicht = dicht.filter(n => n !== naam); if (nu) dicht.push(naam);
        try { localStorage.setItem('pv.lintIngeklapt', JSON.stringify(dicht)); } catch { /* geen opslag */ }
        window.dispatchEvent(new Event('resize'));   // panelen eronder krijgen meer/minder ruimte
      };
      kop.addEventListener('click', wissel);
      kop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wissel(); } });
    }
  }
  // gekozen projectbestand tonen (vangen vóórdat het veld weer leeggemaakt wordt)
  document.addEventListener('change', (e) => {
    if (e.target?.id === 'projectLadenVeld' && e.target.files?.[0]) {
      const pn = document.getElementById('projectBestandNaam');
      if (pn) { pn.textContent = e.target.files[0].name; pn.title = `Geopend project: ${e.target.files[0].name}`; }
    }
  }, true);

  function toonFout(tekst) {
    statusEl.textContent = '⚠ ' + tekst;
    statusEl.style.color = '#C6472B';
    statusEl.style.whiteSpace = 'normal';
  }
  window.addEventListener('error', (e) => toonFout(`fout: ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => toonFout(`fout: ${e.reason?.message || e.reason}`));

  // Controle bij het opstarten: zijn de bibliotheken in de map vendor/ gevonden?
  const ontbrekend = [];
  if (!window.d3?.Delaunay) ontbrekend.push('vendor/d3-delaunay (nodig voor de surface)');
  if (!window.THREE) ontbrekend.push('vendor/three (3D)');
  if (!window.jspdf) ontbrekend.push('vendor/jspdf (PDF)');
  if (ontbrekend.length) {
    toonFout(`Bibliotheken niet gevonden: ${ontbrekend.join(', ')}. ` +
      'Staat de map "vendor" naast index.html? Pak de update uit in de bestaande map van de viewer.');
  }
  const stationLabel  = document.getElementById('stationLabel');

  const tekenAsKnop      = document.getElementById('tekenAsKnop');
  const wisAsKnop        = document.getElementById('wisAsKnop');
  const vorigeStationKnop = document.getElementById('vorigeStation');
  const volgendeStationKnop = document.getElementById('volgendeStation');
  const stapLangsVeld    = document.getElementById('stapLangs');
  const dwarsBreedteVeld = document.getElementById('dwarsBreedte');
  /* Profielbreedte links en rechts van de as los (2.9.5). Het verborgen veld "dwarsBreedte"
     blijft de totale breedte (L + R), voor oudere projecten en instellingen: zet iets anders
     dat veld, dan wordt het gelijk over links en rechts verdeeld. */
  const dwarsLinksVeld = document.getElementById('dwarsLinks'), dwarsRechtsVeld = document.getElementById('dwarsRechts');
  const profielL = () => { const v = Number(dwarsLinksVeld?.value); return Number.isFinite(v) && v >= 0 ? v : 10; };
  const profielR = () => { const v = Number(dwarsRechtsVeld?.value); return Number.isFinite(v) && v >= 0 ? v : 10; };
  const profielBreedte = () => Math.max(1, profielL() + profielR());
  const profielHalfMax = () => Math.max(profielL(), profielR(), 0.5);
  const kortGetal = (v) => String(+Number(v).toFixed(2)).replace('.', ',');
  dwarsBreedteVeld?.addEventListener('change', () => {
    const b = Math.max(1, Number(dwarsBreedteVeld.value) || 20);
    if (Math.abs(b - (profielL() + profielR())) > 1e-6) { dwarsLinksVeld.value = String(b / 2); dwarsRechtsVeld.value = String(b / 2); }
  });
  for (const v of [dwarsLinksVeld, dwarsRechtsVeld]) v?.addEventListener('change', () => {
    if (profielL() + profielR() < 1) v.value = String(Math.max(Number(v.value) || 0, 1 - (v === dwarsLinksVeld ? profielR() : profielL())));
    dwarsBreedteVeld.value = String(profielL() + profielR());
    dwarsBreedteVeld.dispatchEvent(new Event('change'));
  });
  const dwarsIntervalVeld = document.getElementById('dwarsInterval');
  const luchtfotoKnop    = document.getElementById('luchtfotoKnop');
  const bgtOphalenKnop   = document.getElementById('bgtOphalenKnop');
  const bgtBestandVeld   = document.getElementById('bgtBestand');
  const wisBgtKnop       = document.getElementById('wisBgtKnop');
  const bomenOphalenKnop = document.getElementById('bomenOphalenKnop');
  const boomBestandVeld  = document.getElementById('boomBestand');
  const wisBomenKnop     = document.getElementById('wisBomenKnop');
  const maatLangsVeld    = document.getElementById('maatLangs');
  const maatDwarsVeld    = document.getElementById('maatDwars');
  const kolomSplitter    = document.getElementById('kolomSplitter');
  const rijSplitter      = document.getElementById('rijSplitter');
  const langsPaneel      = document.getElementById('langsPaneel');
  const dwarsPaneel      = document.getElementById('dwarsPaneel');
  const toonLangsprofielVeld = document.getElementById('toonLangsprofiel');
  const dwarsOverdrijvingVeld = document.getElementById('dwarsOverdrijving');
  const dwarsZoomResetKnop = document.getElementById('dwarsZoomReset');
  const dwarsZoomInKnop = document.getElementById('dwarsZoomIn');
  const dwarsZoomUitKnop = document.getElementById('dwarsZoomUit');
  const langsOverdrijvingVeld = document.getElementById('langsOverdrijving');
  const langsZoomResetKnop = document.getElementById('langsZoomReset');
  const langsZoomInKnop = document.getElementById('langsZoomIn');
  const langsZoomUitKnop = document.getElementById('langsZoomUit');
  const drieDKnop = document.getElementById('drieDKnop');
  const canvas3D = document.getElementById('canvas3D');
  const drieDKnoppen = document.getElementById('drieDKnoppen');
  const drieDBovenKnop = document.getElementById('drieDBoven');
  const drieDIsoKnop = document.getElementById('drieDIso');
  const drieDDraaiKnop = document.getElementById('drieDDraai');
  const drieDVlakKnop = document.getElementById('drieDVlakKnop');
  const drieDFullscreenKnop = document.getElementById('drieDFullscreenKnop');
  const vlakPaneel = document.getElementById('vlak');
  const printKnop = document.getElementById('printKnop');
  const printOverdrijvingVeld = document.getElementById('printOverdrijving');
  const projectOpslaanKnop = document.getElementById('projectOpslaanKnop');
  const projectLadenVeld = document.getElementById('projectLadenVeld');
  const projectOpslaanAlsKnop = document.getElementById('projectOpslaanAlsKnop');

  /* ────────────────────────────────────────────────────────────────
     PTS inlezen
     ──────────────────────────────────────────────────────────────── */

  /* Vastlopers onthouden: tijdens zwaar werk (inlezen, opslaan) staat er een
     briefje in de browseropslag. Crasht de pagina (bv. "Out of Memory"), dan
     blijft dat briefje staan en meldt de viewer bij de volgende start wat er
     misging — en zet hij het aantal punten lager. */
  const BEZIG_OPSLAG = 'pv.bezig';
  let bezigDiepte = 0;
  function markeerBezig(wat, bestand) {
    bezigDiepte++;
    if (bezigDiepte > 1) return;
    try { localStorage.setItem(BEZIG_OPSLAG, JSON.stringify({ wat, bestand, punten: doelPunten(), sinds: Date.now() })); } catch { /* */ }
  }
  function markeerKlaar() {
    bezigDiepte = Math.max(0, bezigDiepte - 1);
    if (!bezigDiepte) { try { localStorage.removeItem(BEZIG_OPSLAG); } catch { /* */ } }
  }
  function controleerVorigeCrash() {
    let b = null;
    try { b = JSON.parse(localStorage.getItem(BEZIG_OPSLAG) || 'null'); localStorage.removeItem(BEZIG_OPSLAG); } catch { /* */ }
    if (!b || !b.wat) return;
    const veld = document.getElementById('puntDichtheid');
    let verlaagd = '';
    if (veld && b.punten > 2000000) {
      veld.value = '2000000';
      try { localStorage.setItem('ptsviewer-puntdichtheid', '2000000'); } catch { /* */ }
      verlaagd = ' Het aantal punten is teruggezet naar 2 miljoen.';
    }
    toonFout(`De viewer is de vorige keer vastgelopen tijdens "${b.wat}"${b.bestand ? ` (${b.bestand})` : ''} bij ${Number(b.punten || 0).toLocaleString('nl-NL')} punten — waarschijnlijk te weinig geheugen.${verlaagd}${b.wat === 'project opslaan' ? ' Het projectbestand van toen kan onvolledig zijn; open zo nodig een eerdere versie.' : ''}`);
  }

  /**
   * Uitdunnen tijdens het inlezen. Houdt per rastercel alleen het eerste punt
   * vast; groeit het aantal cellen boven `limiet`, dan wordt de cel twee keer
   * zo groot en wordt opnieuw samengevoegd. Zo blijft het geheugen begrensd
   * (± limiet punten) ongeacht hoe groot het bestand is — eerder werden álle
   * punten eerst in het geheugen gezet en pas daarna uitgedund, en daar liep
   * een PTS van enkele GB's (tientallen miljoenen punten) op vast.
   * Het resultaat gaat daarna nog door dunUit() voor het exacte doelaantal.
   */
  function maakUitdunner(limiet) {
    // Snelle versie (2.8.2): punten in typed arrays en een eigen hashtabel op
    // (celX, celY) i.p.v. een Map met getal-sleutels — ± 10× sneller en kan ook
    // ruim boven de 16,7 miljoen cellen van een Map.
    const onder = oppervlakModus() === 'onder';
    let cel = 0.01, inv = 100;      // start fijn: kleine bestanden blijven volledig
    let ox = null, oy = null;
    let cap = 1 << 16, n = 0, gezien = 0;
    let kx = new Float64Array(cap), ky = new Float64Array(cap), kz = new Float64Array(cap);
    let kr = new Uint16Array(cap), kg = new Uint16Array(cap), kb = new Uint16Array(cap), kk = new Uint8Array(cap);
    let ci = new Int32Array(cap), cj = new Int32Array(cap);
    let metKleur = false, kleurMax = 0;   // kleurMax > 255 → 16-bits kleuren (LAS)
    let tgrootte = 1 << 17, masker = tgrootte - 1, tab = new Int32Array(tgrootte).fill(-1);
    const hash = (i, j) => { let h = Math.imul(i ^ Math.imul(j, 0x85EBCA77), 0x9E3779B1); h ^= h >>> 15; return h & masker; };
    function groei() {
      cap *= 2;
      const g = (a, T) => { const b = new T(cap); b.set(a); return b; };
      kx = g(kx, Float64Array); ky = g(ky, Float64Array); kz = g(kz, Float64Array);
      kr = g(kr, Uint16Array); kg = g(kg, Uint16Array); kb = g(kb, Uint16Array); kk = g(kk, Uint8Array);
      ci = g(ci, Int32Array); cj = g(cj, Int32Array);
    }
    function bouwTabel(grootte) {
      tgrootte = grootte; masker = grootte - 1; tab = new Int32Array(grootte).fill(-1);
      for (let p = 0; p < n; p++) { let h = hash(ci[p], cj[p]); while (tab[h] >= 0) h = (h + 1) & masker; tab[h] = p; }
    }
    function vergroof() {
      do {
        cel *= Math.SQRT2; inv = 1 / cel;   // halveert ongeveer het aantal cellen per stap
        tab.fill(-1);
        let m = 0;
        for (let p = 0; p < n; p++) {
          const i = Math.floor((kx[p] - ox) * inv), j = Math.floor((ky[p] - oy) * inv);
          let h = hash(i, j), q;
          while ((q = tab[h]) >= 0 && !(ci[q] === i && cj[q] === j)) h = (h + 1) & masker;
          if (q < 0) {
            kx[m] = kx[p]; ky[m] = ky[p]; kz[m] = kz[p]; kr[m] = kr[p]; kg[m] = kg[p]; kb[m] = kb[p]; kk[m] = kk[p];
            ci[m] = i; cj[m] = j; tab[h] = m; m++;
          } else if (onder ? kz[p] < kz[q] : kz[p] > kz[q]) {
            kx[q] = kx[p]; ky[q] = ky[p]; kz[q] = kz[p]; kr[q] = kr[p]; kg[q] = kg[p]; kb[q] = kb[p]; kk[q] = kk[p];
          }
        }
        n = m;
      } while (n > limiet * 0.7);
    }
    return {
      /** r, g, b optioneel (8- of 16-bits). */
      voegToe(x, y, z, r, g, b) {
        gezien++;
        if (ox === null) { ox = x; oy = y; }
        const i = Math.floor((x - ox) * inv), j = Math.floor((y - oy) * inv);
        let h = hash(i, j), p;
        while ((p = tab[h]) >= 0 && !(ci[p] === i && cj[p] === j)) h = (h + 1) & masker;
        if (p >= 0) {
          // vakje al bezet: alleen vervangen als dit punt hoger (bovenkant) of lager (onderkant) ligt
          if (!(onder ? z < kz[p] : z > kz[p])) return;
          kx[p] = x; ky[p] = y; kz[p] = z;
          if (r !== undefined) {
            if (r > kleurMax) kleurMax = r; if (g > kleurMax) kleurMax = g; if (b > kleurMax) kleurMax = b;
            kr[p] = r; kg[p] = g; kb[p] = b; kk[p] = 1;
          }
          return;
        }
        if (n === cap) groei();
        kx[n] = x; ky[n] = y; kz[n] = z; ci[n] = i; cj[n] = j;
        if (r !== undefined) {
          metKleur = true;
          if (r > kleurMax) kleurMax = r; if (g > kleurMax) kleurMax = g; if (b > kleurMax) kleurMax = b;
          kr[n] = r; kg[n] = g; kb[n] = b; kk[n] = 1;
        } else kk[n] = 0;
        tab[h] = n; n++;
        if (n > tgrootte * 0.5) bouwTabel(tgrootte * 2);
        if (n > limiet) vergroof();
      },
      get aantalGezien() { return gezien; },
      resultaat() {
        let cs = null;
        if (metKleur && kleurMax > 0) {   // alle kleurvelden 0 = LAS-formaat met lege kleur → geen kleur
          const deler = kleurMax > 255 ? 256 : 1;
          cs = new Array(n);
          for (let p = 0; p < n; p++) {
            if (!kk[p]) { cs[p] = 0x808080; continue; }
            const r = Math.min(255, Math.floor(kr[p] / deler)), g = Math.min(255, Math.floor(kg[p] / deler)), b = Math.min(255, Math.floor(kb[p] / deler));
            cs[p] = (r << 16) | (g << 8) | b;
          }
        }
        return { xs: Array.from(kx.subarray(0, n)), ys: Array.from(ky.subarray(0, n)), zs: Array.from(kz.subarray(0, n)), cs };
      },
    };
  }
  // Tijdens het inlezen blijven er ruim meer punten over dan uiteindelijk nodig.
  // (bij 5 en 10 miljoen iets minder ruim, anders wordt het geheugen te groot)
  const uitdunLimiet = () => doelPunten() <= 2000000 ? Math.max(MAX_PUNTEN * 4, doelPunten() * 3) : doelPunten() * 1.5;
  // B (vergelijkingswolk) hooguit 3 miljoen punten: A en B samen mogen het geheugen niet opmaken
  const doelB = () => Math.min(doelPunten(), 3000000);
  const limietB = () => doelB() <= 2000000 ? Math.max(MAX_PUNTEN * 4, doelB() * 3) : doelB() * 1.5;

  /**
   * PTS is platte tekst: eerste regel het aantal punten, daarna per regel
   * "X Y Z" (soms met extra kolommen — intensiteit, RGB, normalen — die we
   * negeren). Geen header met kolomnamen, dus puur op positie lezen.
   *
   * Leest met File.slice() in blokken van de schijf, in plaats van eerst
   * het hele bestand met bestand.text() in één JS-string te proppen — bij
   * een PTS van 1+ GB loopt dat tegen zowel het geheugen als (bij ruim
   * 500 MB–1 GB tekst) de maximale JS-stringlengte aan, en faalt dan
   * zonder duidelijke foutmelding. Blokken van 32 MB, met een onvolledige
   * laatste regel die meegenomen wordt naar het volgende blok.
   */
  async function leesPts(bestand, onVoortgang, sink = null) {
    const BLOK_BYTES = 32 * 1024 * 1024;
    const totaalBytes = bestand.size;

    const dunner = sink || maakUitdunner(uitdunLimiet());
    let rest = '';
    let aantal = null;
    let aantalBepaald = false;
    let klaar = false;
    // Kleurkolommen, bepaald op de eerste puntregel aan de hand van het aantal kolommen:
    //    6: x y z r g b                 7: x y z i r g b            (Leica/Cyclone)
    //    9: x y z r g b nx ny nz (ReCap) 10: x y z i r g b nx ny nz  (Cyclone met normalen)
    // rgbKolom = index van r (3 of 4); -1 = geen kleur.
    let rgbKolom = null;
    const isKleur = (v) => Number.isInteger(v) && v >= 0 && v <= 255;

    for (let bytePos = 0; bytePos < totaalBytes && !klaar; bytePos += BLOK_BYTES) {
      const eind = Math.min(totaalBytes, bytePos + BLOK_BYTES);
      const isLaatsteBlok = eind >= totaalBytes;
      const tekstBlok = await bestand.slice(bytePos, eind).text();

      const volledig = rest + tekstBlok;
      const regels = volledig.split(/\r\n|\r|\n/);
      // de laatste regel kan halverwege afgekapt zijn door de bloksgrens —
      // die bewaren we en plakken 'm vooraan het volgende blok
      rest = isLaatsteBlok ? '' : regels.pop();

      for (const regelRuw of regels) {
        const regel = regelRuw.trim();
        if (!aantalBepaald) {
          if (!regel) continue; // lege regels vóór de aantal-regel overslaan
          aantalBepaald = true;
          const eersteGetal = Number(regel);
          if (Number.isFinite(eersteGetal) && Number.isInteger(eersteGetal)) {
            aantal = eersteGetal;
            continue; // dit was de aantal-regel, geen punt
          }
          // geen geldig aantal: deze regel is meteen al een puntregel, val door
        }
        if (!regel) continue;
        const delen = regel.split(/[\s,]+/);
        const x = Number(delen[0]), y = Number(delen[1]), z = Number(delen[2]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          if (rgbKolom === null) {
            const n = delen.map(Number);
            const kleurOp = (k) => delen.length >= k + 3 && isKleur(n[k]) && isKleur(n[k + 1]) && isKleur(n[k + 2]);
            const voorkeur = { 6: [3], 7: [4, 3], 9: [3, 4], 10: [4, 3] }[delen.length] || (delen.length > 6 ? [4, 3] : []);
            rgbKolom = voorkeur.find(kleurOp) ?? -1;
          }
          if (rgbKolom > 0) {
            dunner.voegToe(x, y, z, +delen[rgbKolom] || 0, +delen[rgbKolom + 1] || 0, +delen[rgbKolom + 2] || 0);
          } else {
            dunner.voegToe(x, y, z);
          }
          if (aantal && dunner.aantalGezien >= aantal) { klaar = true; break; }
        }
      }

      onVoortgang?.(dunner.aantalGezien, aantal, eind / totaalBytes);
      if (dunner.naBlok) await dunner.naBlok();
      await new Promise(r => setTimeout(r, 0));
    }
    return { ...dunner.resultaat(), aantalGelezen: dunner.aantalGezien };
  }

  /**
   * Leest alleen de LAS-header (eerste 400 bytes volstaan ruim voor 1.2
   * t/m 1.4) via File.slice() — dus zónder de rest van het bestand aan te
   * raken. Bij een LAS van een paar GB is dat het verschil tussen "meteen
   * klaar" en "probeer het hele bestand in het geheugen te laden en crash".
   */
  async function leesLasHeader(bestand) {
    const buf = await bestand.slice(0, 400).arrayBuffer();
    const dv = new DataView(buf);
    const signature = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (signature !== 'LASF') throw new Error('geen geldig LAS-bestand (LASF-signature ontbreekt)');

    const versieMajor = dv.getUint8(24), versieMinor = dv.getUint8(25);
    const headerSize = dv.getUint16(94, true);
    const puntDataOffset = dv.getUint32(96, true);
    const numVLR = dv.getUint32(100, true);
    const puntFormatRuw = dv.getUint8(104);
    const puntRecordLengte = dv.getUint16(105, true);
    const isCompressed = !!(puntFormatRuw & 0x80);
    const puntFormat = puntFormatRuw & 0x3f;

    let aantalPunten = dv.getUint32(107, true);
    if (versieMajor === 1 && versieMinor >= 4 && headerSize >= 375) {
      const uitgebreidAantal = Number(dv.getBigUint64(247, true));
      if (uitgebreidAantal > 0) aantalPunten = uitgebreidAantal;
    }

    return {
      aantalPunten, puntDataOffset, puntRecordLengte, headerSize, numVLR, isCompressed, puntFormat,
      xSchaal: dv.getFloat64(131, true), ySchaal: dv.getFloat64(139, true), zSchaal: dv.getFloat64(147, true),
      xOffset: dv.getFloat64(155, true), yOffset: dv.getFloat64(163, true), zOffset: dv.getFloat64(171, true),
    };
  }

  /** Zoekt de laszip-VLR (user_id "laszip encoded", record_id 22204) tussen
   *  de header en de puntdata, en geeft de vaste chunk-grootte terug. */
  async function vindLaszipVlr(bestand, header) {
    const buf = new Uint8Array(await bestand.slice(header.headerSize, header.puntDataOffset).arrayBuffer());
    const dv = new DataView(buf.buffer);
    let offset = 0;
    for (let i = 0; i < header.numVLR; i++) {
      const userIdBytes = buf.subarray(offset + 2, offset + 18);
      let userId = '';
      for (const b of userIdBytes) { if (b === 0) break; userId += String.fromCharCode(b); }
      const recordId = dv.getUint16(offset + 18, true);
      const recLen = dv.getUint16(offset + 20, true);
      if (userId === 'laszip encoded' && recordId === 22204) {
        const chunkSize = dv.getInt32(offset + 54 + 12, true);
        return { chunkSize };
      }
      offset += 54 + recLen;
    }
    throw new Error('laszip-VLR niet gevonden in dit LAZ-bestand');
  }

  /** Leest en decodeert de LASzip chunk-tabel (aan het eind van het bestand,
   *  waar de 8-byte pointer bij de puntdata-start naar verwijst). */
  async function leesChunkTafel(bestand, header) {
    const kopBuf = new Uint8Array(await bestand.slice(header.puntDataOffset, header.puntDataOffset + 8).arrayBuffer());
    const laag = (kopBuf[0] | (kopBuf[1] << 8) | (kopBuf[2] << 16) | (kopBuf[3] << 24)) >>> 0;
    const hoog = (kopBuf[4] | (kopBuf[5] << 8) | (kopBuf[6] << 16) | (kopBuf[7] << 24)) >>> 0;
    if (laag === 0xffffffff && hoog === 0xffffffff)
      throw new Error('chunk-tabel-offset = -1 (aan het eind geschreven na een gecrashte writer) wordt niet ondersteund');
    const chunkTableOffset = hoog * 4294967296 + laag;

    const tabelBuf = new Uint8Array(await bestand.slice(chunkTableOffset, bestand.size).arrayBuffer());
    const firstChunkOffset = header.puntDataOffset + 8;
    return LazChunkTable.decodeChunkTable(tabelBuf, firstChunkOffset);
  }

  let lazPerfModulePromise = null;
  function laadLazPerf() {
    if (!lazPerfModulePromise) lazPerfModulePromise = createLazPerf();
    return lazPerfModulePromise;
  }

  /** Leest X/Y/Z uit een gecomprimeerd (.laz) bestand. Bij een klein bestand
   *  worden alle chunks gelezen; boven LAS_SEQUENTIEEL_GRENS punten wordt
   *  een steekproef van chunks genomen, verspreid over het hele bestand —
   *  zodat ook een LAZ van honderden miljoenen punten interactief blijft.
   *  Bit-exact geverifieerd tegen een echt LAZ-bestand van 627 miljoen
   *  punten (9 GB) — zie vendor/laz-perf/chunktable.js. */
  async function leesLazPunten(bestand, header, onVoortgang, volledigInlezen = false, sink = null) {
    const { puntRecordLengte, puntFormat, xSchaal, ySchaal, zSchaal, xOffset, yOffset, zOffset, aantalPunten } = header;
    const { chunkSize } = await vindLaszipVlr(bestand, header);
    if (!chunkSize || chunkSize < 0)
      throw new Error('variabele chunk-grootte in deze LAZ wordt nog niet ondersteund');

    const chunkOffsets = await leesChunkTafel(bestand, header);
    const totaalChunks = chunkOffsets.length - 1;
    const isSteekproef = !volledigInlezen && aantalPunten > lasGrens();
    const teLezenChunks = isSteekproef ? Math.max(1, Math.ceil(lasSteekproefDoel() / chunkSize)) : totaalChunks;

    const Module = await laadLazPerf();
    const dunner = sink || maakUitdunner(uitdunLimiet());

    // Steekproef: de chunks gelijkmatig over het HELE bestand verdelen. (Voorheen
    // werd met een afgeronde stap gelopen, waardoor bij bv. 18 van 27 chunks
    // alleen de eerste 18 gelezen werden en een deel van het gebied ontbrak.)
    for (let c = 0; c < Math.min(teLezenChunks, totaalChunks); c++) {
      const chunkIdx = isSteekproef ? Math.floor(c * totaalChunks / Math.min(teLezenChunks, totaalChunks)) : c;
      const byteStart = chunkOffsets[chunkIdx], byteEind = chunkOffsets[chunkIdx + 1];
      const buf = new Uint8Array(await bestand.slice(byteStart, byteEind).arrayBuffer());

      const ptr = Module._malloc(buf.length);
      Module.HEAPU8.set(buf, ptr);
      const decoder = new Module.ChunkDecoder();
      decoder.open(puntFormat, puntRecordLengte, ptr);

      const puntPtr = Module._malloc(puntRecordLengte);
      const puntenInChunk = Math.min(chunkSize, aantalPunten - chunkIdx * chunkSize);
      const rgbOff = LAS_RGB_OFFSET[puntFormat];
      const nieuwFormaat = puntFormat >= 6;
      for (let i = 0; i < puntenInChunk; i++) {
        decoder.getPoint(puntPtr);
        const x = Module.HEAP32[puntPtr >> 2] * xSchaal + xOffset;
        const y = Module.HEAP32[(puntPtr + 4) >> 2] * ySchaal + yOffset;
        const z = Module.HEAP32[(puntPtr + 8) >> 2] * zSchaal + zOffset;
        // classificatie (2 = maaiveld) — alleen gebruikt bij een vergelijkingswolk
        const klasse = nieuwFormaat ? Module.HEAPU8[puntPtr + 16] : (Module.HEAPU8[puntPtr + 15] & 31);
        if (rgbOff !== undefined) {
          const q = (puntPtr + rgbOff) >> 1;   // uint16-index (rgbOff is even, puntPtr ook)
          dunner.voegToe(x, y, z, Module.HEAPU16[q], Module.HEAPU16[q + 1], Module.HEAPU16[q + 2], klasse);
        } else {
          dunner.voegToe(x, y, z, undefined, undefined, undefined, klasse);
        }
      }
      Module._free(puntPtr);
      decoder.delete();
      Module._free(ptr);

      onVoortgang?.(dunner.aantalGezien, isSteekproef ? teLezenChunks * chunkSize : aantalPunten, isSteekproef);
      if (dunner.naBlok) await dunner.naBlok();
      await new Promise(r => setTimeout(r, 0));
    }
    return { ...dunner.resultaat(), aantalGelezen: dunner.aantalGezien, isSteekproef, aantalInBestand: aantalPunten };
  }

  // Boven dit aantal ruwe LAS-punten lezen we niet meer alles: bij een LAS
  // van een paar GB (tientallen tot honderden miljoenen punten) zou zelfs
  // alléén al het van-schijf-lezen minutenlang duren, voor data die toch
  // meteen weer wordt uitgedund naar MAX_PUNTEN. In plaats daarvan lezen we
  // met File.slice() een stuk of wat kleine blokjes, verspreid over het
  // hele bestand — dat haalt maar een fractie van de bytes op, ongeacht of
  // het bestand 100 MB of 9 GB is.
  // Byte-positie van rood/groen/blauw (3× uint16) per LAS-puntformaat; null = geen kleur.
  const LAS_RGB_OFFSET = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 };

  const lasGrens = () => Math.max(MAX_PUNTEN * 3, doelPunten() * 3);
  const lasSteekproefDoel = () => Math.max(MAX_PUNTEN * 3, doelPunten() * 3);
  const LAS_BLOK_PUNTEN = 4000;

  /** Leest X/Y/Z uit `bestand` op basis van een al-gelezen `header`.
   *  `onVoortgang(gelezenPunten, doelPunten, isSteekproef)`. */
  async function leesLasPunten(bestand, header, onVoortgang, volledigInlezen = false, sink = null) {
    const { aantalPunten, puntDataOffset, puntRecordLengte, xSchaal, ySchaal, zSchaal, xOffset, yOffset, zOffset, puntFormat } = header;
    const dunner = sink || maakUitdunner(uitdunLimiet());
    const rgbOff = LAS_RGB_OFFSET[puntFormat];
    const isSteekproef = !volledigInlezen && aantalPunten > lasGrens();

    const nieuwFormaat = puntFormat >= 6;
    const verwerkBlok = (buf, aantalInBlok) => {
      const dv = new DataView(buf);
      for (let i = 0; i < aantalInBlok; i++) {
        const p = i * puntRecordLengte;
        const x = dv.getInt32(p, true) * xSchaal + xOffset;
        const y = dv.getInt32(p + 4, true) * ySchaal + yOffset;
        const z = dv.getInt32(p + 8, true) * zSchaal + zOffset;
        const klasse = nieuwFormaat ? dv.getUint8(p + 16) : (dv.getUint8(p + 15) & 31);
        if (rgbOff !== undefined) {
          dunner.voegToe(x, y, z, dv.getUint16(p + rgbOff, true), dv.getUint16(p + rgbOff + 2, true), dv.getUint16(p + rgbOff + 4, true), klasse);
        } else {
          dunner.voegToe(x, y, z, undefined, undefined, undefined, klasse);
        }
      }
    };
    const leesBlok = async (startPunt, eindPunt) => {
      const buf = await bestand.slice(
        puntDataOffset + startPunt * puntRecordLengte,
        puntDataOffset + eindPunt * puntRecordLengte,
      ).arrayBuffer();
      verwerkBlok(buf, eindPunt - startPunt);
    };

    if (!isSteekproef) {
      // grotere blokken bij volledig inlezen: minder losse leesacties op schijf
      const blokPunten = LAS_BLOK_PUNTEN * 25;
      for (let start = 0; start < aantalPunten; start += blokPunten) {
        const eind = Math.min(aantalPunten, start + blokPunten);
        await leesBlok(start, eind);
        onVoortgang?.(dunner.aantalGezien, aantalPunten, false);
        if (dunner.naBlok) await dunner.naBlok();
        await new Promise(r => setTimeout(r, 0));
      }
    } else {
      const aantalBlokken = Math.ceil(lasSteekproefDoel() / LAS_BLOK_PUNTEN);
      // blokjes gelijkmatig over het hele bestand, eerste en laatste inbegrepen
      const laatsteStart = Math.max(0, aantalPunten - LAS_BLOK_PUNTEN);
      for (let blok = 0; blok < aantalBlokken; blok++) {
        const start = Math.floor(blok * laatsteStart / Math.max(1, aantalBlokken - 1));
        const eind = Math.min(aantalPunten, start + LAS_BLOK_PUNTEN);
        await leesBlok(start, eind);
        onVoortgang?.(dunner.aantalGezien, lasSteekproefDoel(), true);
        await new Promise(r => setTimeout(r, 0));
      }
    }
    return { ...dunner.resultaat(), aantalGelezen: dunner.aantalGezien, isSteekproef, aantalInBestand: aantalPunten };
  }

  /**
   * Dunt een puntenwolk ruimtelijk uit tot ~max punten: de bounding box
   * wordt verdeeld in een raster met evenveel cellen als het doelaantal,
   * en per cel blijft het eerste punt staan. Dat behoudt de vlakdekking
   * (belangrijk voor een bruikbare surface) — "elke Ne punt overslaan" zou
   * bij op-scanlijn gesorteerde dronedata juist strepen opleveren.
   */
  function dunUit(xs, ys, zs, max, cs = null) {
    if (xs.length <= max) return { xs, ys, zs, cs };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i];
      if (ys[i] < minY) minY = ys[i]; if (ys[i] > maxY) maxY = ys[i];
    }
    const oppervlak = Math.max(1e-6, (maxX - minX) * (maxY - minY));
    let celGrootte = Math.sqrt(oppervlak / max) || 1;
    // De begrenzende rechthoek is bij een scheve of grillige wolk groter dan
    // het echte gebied, waardoor er te weinig punten overblijven. Daarom de
    // cel een paar keer bijstellen tot het aantal dicht bij het doel ligt.
    let cellen = null, laatste = null;
    const onder = oppervlakModus() === 'onder';
    // per poging: beste punt per cel via een eigen hashtabel (sneller en zuiniger dan een Map bij miljoenen punten)
    const n = xs.length;
    let grootte = 1; while (grootte < n * 2) grootte *= 2;
    const masker = grootte - 1, tab = new Int32Array(grootte), ti = new Int32Array(grootte), tj = new Int32Array(grootte);
    const kies = (cel) => {
      tab.fill(-1);
      let aantal = 0;
      const inv = 1 / cel;
      for (let k = 0; k < n; k++) {
        const i = Math.floor((xs[k] - minX) * inv), j = Math.floor((ys[k] - minY) * inv);
        let h = Math.imul(i ^ Math.imul(j, 0x85EBCA77), 0x9E3779B1); h = (h ^ (h >>> 15)) & masker;
        let q;
        while ((q = tab[h]) >= 0 && !(ti[h] === i && tj[h] === j)) h = (h + 1) & masker;
        if (q < 0) { tab[h] = k; ti[h] = i; tj[h] = j; aantal++; }
        else if (onder ? zs[k] < zs[q] : zs[k] > zs[q]) tab[h] = k;
      }
      const sel = new Int32Array(aantal);
      let m = 0;
      for (let h = 0; h < grootte; h++) if (tab[h] >= 0) sel[m++] = tab[h];
      sel.sort();   // in de oorspronkelijke volgorde houden
      return sel;
    };
    for (let poging = 0; poging < 5; poging++) {
      const kandidaat = kies(celGrootte);
      laatste = kandidaat;
      if (kandidaat.length <= max * 1.02 && (!cellen || kandidaat.length > cellen.length)) cellen = kandidaat;
      if (kandidaat.length > max * 1.02) { celGrootte *= Math.sqrt(kandidaat.length / max) * 1.01; continue; }
      if (kandidaat.length >= max * 0.93) break;
      celGrootte *= Math.sqrt(kandidaat.length / max) * 0.995;
    }
    if (!cellen) cellen = laatste;
    const m = cellen.length, nxs = new Array(m), nys = new Array(m), nzs = new Array(m), ncs = cs ? new Array(m) : null;
    for (let k = 0; k < m; k++) { const i = cellen[k]; nxs[k] = xs[i]; nys[k] = ys[i]; nzs[k] = zs[i]; if (cs) ncs[k] = cs[i]; }
    return { xs: nxs, ys: nys, zs: nzs, cs: ncs };
  }

  /** Min/max van een array zonder spread — bij honderdduizenden punten
   *  loopt Math.min(...zs) tegen de argumentenlimiet van de JS-engine aan. */
  function bereikVan(arr) {
    let min = Infinity, max = -Infinity;
    for (const v of arr) { if (v < min) min = v; if (v > max) max = v; }
    return [min, max];
  }

  document.getElementById('ptsBestand').addEventListener('change', async (e) => {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    await openPuntenwolkA(bestand);
  });

  /* ────────────────────────────────────────────────────────────────
     Eigen bestandstoegang (exe, 2.10.2): in het eigen venster leest en schrijft de
     exe de bestanden zelf (/__pv/fs/…, met de sessiesleutel uit window.__pvNatief),
     zonder toestemmingsvragen van de browser. natieveMap/natiefBestand gedragen zich
     als FileSystemDirectoryHandle/FileSystemFileHandle, zodat de rest van de viewer
     niet verandert; extra veld pvPad = het echte pad. Zonder window.__pvNatief (oude
     venster, dev-server, tests) blijft alles via de browser gaan.
     ──────────────────────────────────────────────────────────────── */
  const natief = window.__pvNatief || null;
  function natiefFout(status, tekst, pad) {
    const soort = status === 404 ? 'NotFoundError' : status === 403 ? 'NotAllowedError' : status === 409 ? 'InvalidModificationError' : 'UnknownError';
    return new DOMException(`${tekst || `fout ${status}`} (${pad})`, soort);
  }
  async function natiefVraag(route, pad, { methode = 'GET', body, kop, extra = '' } = {}) {
    const r = await fetch(`/__pv/${route}${pad != null ? `?pad=${encodeURIComponent(pad)}` : ''}${extra}`,
      { method: methode, body, headers: { 'X-PV-Sleutel': natief.sleutel, ...kop }, cache: 'no-store' });
    if (!r.ok) throw natiefFout(r.status, (await r.text().catch(() => '')).trim(), pad ?? route);
    return r;
  }
  const natiefInfo = async (pad) => (await natiefVraag('fs/info', pad)).json();
  const padDeel = (map, naam) => {
    naam = String(naam);
    if (!naam || naam === '.' || naam === '..' || /[\\/]/.test(naam)) throw new TypeError(`ongeldige naam: ${naam}`);
    return map.replace(/[\\/]+$/, '') + '\\' + naam;
  };
  const naamVan = (pad) => pad.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
  const mapVan = (pad) => pad.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '');
  const zelfdeEntry = (pad) => async (ander) => !!ander?.pvPad && ander.pvPad.toLowerCase() === pad.toLowerCase();
  /** Bytes die over alle schrijfstromen samen nog verstuurd moeten worden; boven de grens wacht write(). */
  const natiefOnderweg = { bytes: 0 }, NATIEF_MAX_ONDERWEG = 64 << 20;
  function natiefBestand(pad) {
    return {
      kind: 'file', name: naamVan(pad), pvPad: pad,
      async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
      isSameEntry: zelfdeEntry(pad),
      async getFile() {
        const r = await natiefVraag('fs/lees', pad);
        const gewijzigd = Date.parse(r.headers.get('Last-Modified') || '') || Date.now();
        return new File([await r.arrayBuffer()], naamVan(pad), { lastModified: gewijzigd });
      },
      /** Schrijft naar een tijdelijk bestand; pas na close() staat het er (atomair). write() wacht niet op
       *  het versturen; een fout komt bij de volgende write() of bij close(). */
      async createWritable() {
        const { id } = await (await natiefVraag('fs/schrijf/start', pad, { methode: 'POST' })).json();
        let rij = Promise.resolve(), positie = 0, fout = null;
        const stroom = (route, body, extra = '') => natiefVraag(route, null, { methode: 'POST', body, extra: `?id=${id}${extra}` });
        /** Groot deel in stukken van 8 MB, vier tegelijk, elk op zijn plek: ± 5× zo snel als in één keer. */
        const schrijfDeel = async (blob, vanaf) => {
          const STUK = 8 << 20, plekken = [];
          for (let o = 0; o < blob.size; o += STUK) plekken.push(o);
          let i = 0;
          await Promise.all(Array.from({ length: Math.min(4, plekken.length) }, async () => {
            while (i < plekken.length) { const o = plekken[i++]; await stroom('fs/schrijf/deel', blob.slice(o, o + STUK), `&positie=${vanaf + o}`); }
          }));
        };
        return {
          write(data) {
            if (data && typeof data === 'object' && 'type' in data && !(data instanceof Blob)) {
              if (data.type !== 'write' || data.position != null) throw new TypeError('alleen schrijven achter elkaar wordt ondersteund');
              data = data.data;
            }
            if (fout) throw fout;
            // als Blob (een kopie, dus de aanroeper mag zijn buffer meteen hergebruiken): Edge/WebView2
            // verstuurt een Blob ± 3× zo snel als een ArrayBuffer
            const body = data instanceof Blob ? data : new Blob([data]);
            const vanaf = positie; positie += body.size;
            natiefOnderweg.bytes += body.size;
            rij = rij.then(() => schrijfDeel(body, vanaf))
              .catch((err) => { fout = fout || err; })
              .finally(() => { natiefOnderweg.bytes -= body.size; });
            // niet op het versturen wachten, zodat de viewer doorrekent; wel als er te veel onderweg is
            return natiefOnderweg.bytes > NATIEF_MAX_ONDERWEG ? rij.then(() => { if (fout) throw fout; }) : Promise.resolve();
          },
          async close() { await rij; if (fout) { await stroom('fs/schrijf/afbreken').catch(() => {}); throw fout; } await stroom('fs/schrijf/klaar'); },
          async abort() { await rij; await stroom('fs/schrijf/afbreken'); },
        };
      },
    };
  }
  function natieveMap(pad) {
    const map = {
      kind: 'directory', name: naamVan(pad), pvPad: pad,
      async queryPermission() { return 'granted'; }, async requestPermission() { return 'granted'; },
      isSameEntry: zelfdeEntry(pad),
      async getDirectoryHandle(naam, { create = false } = {}) {
        const p = padDeel(pad, naam), i = await natiefInfo(p);
        if (!i.bestaat) {
          if (!create) throw new DOMException(`${naam} bestaat niet`, 'NotFoundError');
          await natiefVraag('fs/map', p, { methode: 'POST' });
        } else if (i.soort !== 'map') throw new DOMException(`${naam} is geen map`, 'TypeMismatchError');
        return natieveMap(p);
      },
      async getFileHandle(naam, { create = false } = {}) {
        const p = padDeel(pad, naam), i = await natiefInfo(p);
        if (!i.bestaat) {
          if (!create) throw new DOMException(`${naam} bestaat niet`, 'NotFoundError');
          const w = await natiefBestand(p).createWritable(); await w.close();   // leeg bestand, zoals de browser
        } else if (i.soort !== 'bestand') throw new DOMException(`${naam} is geen bestand`, 'TypeMismatchError');
        return natiefBestand(p);
      },
      async removeEntry(naam, { recursive = false } = {}) {
        const p = padDeel(pad, naam);
        if (!(await natiefInfo(p)).bestaat) throw new DOMException(`${naam} bestaat niet`, 'NotFoundError');
        await natiefVraag('fs/weg', p, { methode: 'POST', extra: recursive ? '&recursief=1' : '' });
      },
      async *entries() {
        for (const it of await (await natiefVraag('fs/lijst', pad)).json()) {
          const p = padDeel(pad, it.naam);
          yield [it.naam, it.soort === 'map' ? natieveMap(p) : natiefBestand(p)];
        }
      },
      async *keys() { for await (const [n] of map.entries()) yield n; },
      async *values() { for await (const [, h] of map.entries()) yield h; },
      [Symbol.asyncIterator]() { return map.entries(); },
    };
    return map;
  }
  /** Een scan die met de Windows-kiezer is gekozen (2.11.0): gedraagt zich voor de lezers als een
   *  File (name, size, lastModified, slice(a, b).arrayBuffer()/text()), maar leest alleen de
   *  gevraagde stukken (Range), ook bij een scan van vele GB. pvPad = het pad, voor het omzetten
   *  door het programma. */
  async function natieveScan(pad) {
    const i = await natiefInfo(pad);
    if (!i.bestaat || i.soort !== 'bestand') throw new DOMException(`${pad} bestaat niet`, 'NotFoundError');
    const stuk = (van, tot) => {
      van = Math.max(0, Math.min(i.grootte, van)); tot = Math.max(van, Math.min(i.grootte, tot));
      const lees = async () => {
        if (tot <= van) return new ArrayBuffer(0);
        return (await natiefVraag('fs/lees', pad, { kop: { Range: `bytes=${van}-${tot - 1}` } })).arrayBuffer();
      };
      return { size: tot - van, arrayBuffer: lees, text: async () => new TextDecoder().decode(await lees()),
        slice: (a = 0, b = tot - van) => stuk(van + a, van + Math.min(b, tot - van)) };
    };
    const geheel = stuk(0, i.grootte);
    return { name: i.naam, size: i.grootte, lastModified: i.gewijzigd, pvPad: pad, type: '',
      slice: (a = 0, b = i.grootte) => stuk(a, b), arrayBuffer: geheel.arrayBuffer, text: geheel.text };
  }
  /** Puntenwolk A kiezen met de Windows-kiezer (eigen venster, besluit B3), zodat het pad bekend is. */
  async function kiesPuntenwolkA() {
    let pad;
    try {
      ({ pad } = await (await natiefVraag('kies', null, { methode: 'POST', kop: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soort: 'open', titel: 'Puntenwolk openen', filter: [
          { naam: 'Puntenwolk (*.las, *.laz, *.pts, *.txt)', patroon: '*.las;*.laz;*.pts;*.txt' }, { naam: 'Alle bestanden', patroon: '*.*' }] }) })).json());
    } catch (err) { toonFout(`Bestand kiezen lukte niet: ${err.message}`); return; }
    if (!pad) return;
    try { await openPuntenwolkA(await natieveScan(pad)); }
    catch (err) { console.error(err); toonFout(`${naamVan(pad)} openen lukte niet: ${err.message || err}`); }
  }

  /** Kan er een map gekozen worden (exe-kiezer of die van de browser)? */
  const kanMapKiezen = () => !!natief || !!window.showDirectoryPicker;
  /** Map kiezen: in het eigen venster de Windows-kiezer van de exe, anders die van de browser.
   *  Annuleren geeft een AbortError, net als showDirectoryPicker. */
  async function kiesMap(opties = {}) {
    const { titel, ...browserOpties } = opties;
    if (!natief) return window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents', ...browserOpties });
    const r = await natiefVraag('kies', null, { methode: 'POST', kop: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soort: 'map', titel: titel || 'Map kiezen' }) });
    const { pad } = await r.json();
    if (!pad) throw new DOMException('Kiezen geannuleerd', 'AbortError');
    return natieveMap(pad);
  }

  /* ────────────────────────────────────────────────────────────────
     Projectmap (2.9.0): alles van één project in één map.
       <naam>.pvproj   puntenwolk\   ondergrond\   uitvoer\   backup\
     ──────────────────────────────────────────────────────────────── */
  let projectMap = null;          // FileSystemDirectoryHandle van de projectmap
  const PROJECT_SUBMAPPEN = ['puntenwolk', 'ondergrond', 'uitvoer', 'backup'];
  /** Naam die Windows (en de browser) als map- of bestandsnaam accepteert: geen \\ / : * ? " < > |,
   *  geen stuurtekens, niet eindigen op een punt of spatie (bv. "DIJK Halsteren..las" → "DIJK Halsteren"),
   *  geen gereserveerde namen (CON, PRN, AUX, NUL, COM1…, LPT1…). */
  function veiligeNaam(naam, reserve = 'naamloos') {
    let n = String(naam || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').replace(/^[. ]+/, '');
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) n = '_' + n;
    if (n.length > 120) n = n.slice(0, 120).replace(/[. ]+$/, '');
    return n || reserve;
  }
  /** Bestandsnaam veilig maken met behoud van de extensie. */
  function veiligeBestandsnaam(naam) {
    const m = /^(.*?)(\.[a-z0-9]{1,6})$/i.exec(String(naam || ''));
    return m ? veiligeNaam(m[1], 'bestand') + m[2].toLowerCase() : veiligeNaam(naam, 'bestand');
  }
  async function maakSubmappen(map) { for (const n of PROJECT_SUBMAPPEN) await map.getDirectoryHandle(n, { create: true }); }
  async function magSchrijvenMap(map) {
    try {
      if (!map.queryPermission) return true;
      if (await map.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
      return await map.requestPermission({ mode: 'readwrite' }) === 'granted';
    } catch { return false; }
  }
  /** Laat de gebruiker een projectmap kiezen (eigen venster, zodat de klik de bestandskiezer mag openen).
   *  → map, of null (= zonder projectmap verder) of false (= geannuleerd). */
  function vraagProjectMap(opties = {}) {
    const dlg = document.getElementById('projectMapDialoog');
    if (!dlg || !kanMapKiezen()) return Promise.resolve(null);
    document.getElementById('pmOndertitel').textContent = opties.ondertitel || 'waar komt dit project?';
    document.getElementById('pmInfo').textContent = opties.info || '';
    const zk = document.getElementById('pmZonder');
    zk.hidden = opties.zonderMag === false;
    zk.textContent = opties.zonderTekst || 'Zonder projectmap';
    zk.title = opties.zonderTitel || 'Zoals vroeger: de puntenwolk direct inlezen en uitdunnen, zonder vakken en zonder projectmap';
    return new Promise((klaar) => {
      const kies = document.getElementById('pmKies'), zonder = document.getElementById('pmZonder');
      const ruim = (w) => { kies.onclick = zonder.onclick = null; dlg.onclose = null; if (dlg.open) dlg.close(); klaar(w); };
      kies.onclick = async () => {
        try {
          const map = await kiesMap({ id: 'pv-projectmap', titel: 'Projectmap kiezen' });
          await maakSubmappen(map);
          ruim(map);
        } catch (err) {
          if (err.name === 'AbortError') return;   // venster blijft open
          document.getElementById('pmInfo').textContent = `Map kiezen lukte niet: ${err.message}`;
        }
      };
      zonder.onclick = () => ruim(null);
      dlg.onclose = () => ruim(false);
      dlg.showModal();
    });
  }
  async function zetProjectMap(map) {
    projectMap = map;
    toonProjectBestand(map ? `${map.name}\\${map.name}.pvproj` : '');
  }

  /** Een puntenwolk als A openen: met projectmap omzetten naar vakken, anders zoals vroeger. */
  async function openPuntenwolkA(bestand) {
    if (!projectMap) {
      const map = await vraagProjectMap({ info: `${bestand.name} (${(bestand.size / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} MB)` });
      if (map === false) { statusEl.textContent = 'Openen geannuleerd'; return; }
      if (map) await zetProjectMap(map);
    }
    if (!projectMap) { await laadBestand(bestand, false); return; }
    let bron = null;
    try { bron = await tegelbronVoor(bestand, 'A'); }
    catch (err) { console.error(err); toonFout(`${bestand.name} omzetten naar vakken lukte niet: ${err.message || err}`); return; }
    if (bron) {
      await laadBestand(bron, false);
      // de omzettijd blijft zichtbaar (anders overschrijft het laden hem)
      if (bron.pvOmzetTekst && !/omgezet in/.test(statusEl.textContent)) statusEl.textContent += ` · ${bron.pvOmzetTekst}`;
    }
  }
  /** Vakken voor `bestand` in puntenwolk\<letter> - <naam>: hergebruiken als ze er al zijn, anders omzetten. */
  /** Omzetten door het programma (2.11.0, /__pv/omzet/…): voortgang in de statusregel en een knop
   *  Afbreken. → info (zoals info.json), null = afgebroken; gooit een fout als het niet lukt. */
  async function omzettenDoorProgramma(bestand, wolkMap) {
    const json = { 'Content-Type': 'application/json' };
    const { id } = await (await natiefVraag('omzet/start', null, { methode: 'POST', kop: json,
      body: JSON.stringify({ bron: bestand.pvPad, doel: wolkMap.pvPad, modus: oppervlakModus() }) })).json();
    let knop = document.getElementById('omzetAfbreken');
    if (!knop) {
      knop = document.createElement('button');
      knop.id = 'omzetAfbreken'; knop.type = 'button'; knop.textContent = 'Afbreken';
      knop.title = 'Het omzetten naar vakken stoppen; er blijft niets van achter';
      statusEl.after(knop);
    }
    let afbreken = false;
    knop.onclick = () => { afbreken = true; knop.disabled = true; knop.textContent = 'Afbreken…'; natiefVraag('omzet/afbreken', null, { methode: 'POST', extra: `?id=${id}` }).catch(() => {}); };
    knop.hidden = false; knop.disabled = false; knop.textContent = 'Afbreken';
    const t0 = performance.now();
    try {
      for (;;) {
        await new Promise(r => setTimeout(r, 250));
        const s = await (await natiefVraag('omzet/stand', null, { extra: `?id=${id}` })).json();
        const tijd = `${Math.round((performance.now() - t0) / 1000)} s`;
        statusEl.style.color = '';
        if (s.fase === 'lezen') statusEl.textContent = `${bestand.name} omzetten naar vakken (programma)… ${Math.round(100 * s.gelezen / Math.max(1, s.totaal))}% · ${tijd}`;
        else if (s.fase === 'afronden') statusEl.textContent = `${bestand.name}: vakken afsluiten en overzicht maken (programma)… ${tijd}`;
        else if (s.fase === 'klaar') return s.info;
        else if (s.fase === 'afgebroken') return null;
        else throw new Error(s.fout || `onbekende stand ${s.fase}`);
      }
    } finally { knop.hidden = true; }
  }

  async function tegelbronVoor(bestand, letter) {
    if (!(await magSchrijvenMap(projectMap))) { toonFout('Geen toestemming om in de projectmap te schrijven.'); return null; }
    const pw = await projectMap.getDirectoryHandle('puntenwolk', { create: true });
    const naam = `${letter} - ${veiligeNaam(bestand.name.replace(/\.[^.]+$/, ''), 'scan')}`;
    const wolkMap = await pw.getDirectoryHandle(naam, { create: true });
    try {
      const info = JSON.parse(await (await leesBestandUitMap(wolkMap, 'info.json')).text());
      if (info.formaat === TEGEL_FORMAAT && info.bron?.grootte === bestand.size && info.bron?.gewijzigd === bestand.lastModified) {
        statusEl.textContent = `${bestand.name}: al omgezet (${info.aantal.toLocaleString('nl-NL')} punten in ${info.tegels.length} vakken) — vakken worden hergebruikt`;
        return maakTegelbron(wolkMap, info);
      }
    } catch { /* nog niet omgezet */ }
    // eigen venster, scan met pad: het programma zet om (op alle kernen, buiten het venster); lukt dat
    // niet, dan hieronder zoals voorheen (besluit B4)
    if (natief && bestand.pvPad && wolkMap.pvPad && /\.(las|pts|txt)$/i.test(bestand.name)) {
      markeerBezig('omzetten naar vakken', bestand.name);
      try {
        const info = await omzettenDoorProgramma(bestand, wolkMap);
        if (info === null) { statusEl.style.color = ''; statusEl.textContent = `${bestand.name}: omzetten afgebroken`; return null; }
        statusEl.textContent = `${bestand.name}: ${info.aantal.toLocaleString('nl-NL')} punten omgezet naar ${info.tegels.length} vakken in ${info.duurImport} s (door het programma)`;
        return Object.assign(maakTegelbron(wolkMap, info), { pvOmzetTekst: `omgezet in ${info.duurImport} s door het programma` });
      } catch (err) {
        console.warn('omzetten door het programma mislukt, de viewer zet om:', err);
        statusEl.style.color = ''; statusEl.textContent = `${bestand.name}: het programma kon niet omzetten (${err.message || err}); de viewer zet om…`;
      } finally { markeerKlaar(); }
    }
    for (const oud of ['tegels', 'info.json', 'overzicht.pvt', 'overzicht_maaiveld.pvt']) { try { await wolkMap.removeEntry(oud, { recursive: true }); } catch { /* */ } }
    markeerBezig('omzetten naar vakken', bestand.name);
    try {
      const bron = await importeerNaarTegels(bestand, wolkMap, (t) => { statusEl.style.color = ''; statusEl.textContent = t; });
      statusEl.textContent = `${bestand.name}: ${bron.info.aantal.toLocaleString('nl-NL')} punten omgezet naar ${bron.info.tegels.length} vakken in ${bron.info.duurImport} s`;
      bron.pvOmzetTekst = `omgezet in ${bron.info.duurImport} s`;
      return bron;
    } catch (err) {
      console.error(err);
      toonFout(`Omzetten naar vakken mislukt: ${err.message || err}`);
      return null;
    } finally { markeerKlaar(); }
  }

  /** Leest een .pts/.las/.laz in en bouwt de surface. behoud = as, BGT en
   *  beeld laten staan (bij het wijzigen van de puntdichtheid). */
  async function laadBestand(bestand, behoud, strook = null) {
    markeerBezig('inlezen', bestand.name);
    try { return await laadBestandBinnen(bestand, behoud, strook); } finally { markeerKlaar(); }
  }
  async function laadBestandBinnen(bestand, behoud, strook = null) {
    if (!behoud) volleHandmatigUit = false;
    laatsteBestand = bestand;
    if (!behoud) { volleProfielen = null; volleCache.clear(); }
    detailStrook = strook;
    werkDetailKnopBij();
    tekenAsKnop.disabled = true;
    wisAsKnop.disabled = true;

    statusEl.textContent = `${bestand.name} inlezen…`;
    await new Promise(r => setTimeout(r, 10));

    const t0 = performance.now();
    let gelezen;
    try {
      if (bestand.tegelbron) {
        // uit de vakken in de projectmap: werkwolk uit het overzicht (snel), detailstrook uit de volle vakken
        const sink = strook ? maakStrookFilter(strook, alleenGrondVan(maakUitdunner(uitdunLimiet())))
          : maakMaaiveldKeuze(() => maakUitdunner(uitdunLimiet()), maaiveldAGevraagd());
        const ov = strook ? null : overzichtGeschikt(bestand);
        const voortgang = (n, totaal) => { statusEl.textContent = `${bestand.name}: vakken lezen… ${Math.round(100 * n / Math.max(1, totaal))}% · ${n.toLocaleString('nl-NL')} / ${totaal.toLocaleString('nl-NL')} punten`; };
        gelezen = ov ? await leesOverzicht(bestand, sink, ov.grond)
          : await leesTegels(bestand, voortgang, sink, strook ? strookKader(strook.halveBreedte) : null, strook ? tegelsLangsAs(strook.halveBreedte, 'alle') : null);
        if (!strook && (ov || gelezen.maaiveld)) { gelezen.aantalAlle = bestand.info.aantal; gelezen.aantalGrond = bestand.info.klassen?.[2] || 0; }
      } else if (/\.la[sz]$/i.test(bestand.name)) {
        const header = await leesLasHeader(bestand);
        const volledigInlezen = document.getElementById('volledigInlezen').checked;
        const voortgang = (n, totaal, steekproef) => {
          statusEl.textContent = steekproef
            ? `${bestand.name}: ${header.aantalPunten.toLocaleString('nl-NL')} punten in bestand — te veel om allemaal te lezen, neem een verspreide steekproef… ${n.toLocaleString('nl-NL')} / ${totaal.toLocaleString('nl-NL')}`
            : `${bestand.name} inlezen… ${n.toLocaleString('nl-NL')} / ${totaal.toLocaleString('nl-NL')} punten`;
        };
        const sink = strook ? maakStrookFilter(strook, alleenGrondVan(maakUitdunner(uitdunLimiet()))) : maakMaaiveldKeuze(() => maakUitdunner(uitdunLimiet()), maaiveldAGevraagd());
        gelezen = header.isCompressed
          ? await leesLazPunten(bestand, header, voortgang, volledigInlezen || !!strook, sink)
          : await leesLasPunten(bestand, header, voortgang, volledigInlezen || !!strook, sink);
      } else {
        const sinkPts = strook ? maakStrookFilter(strook, maakUitdunner(uitdunLimiet())) : null;
        gelezen = await leesPts(bestand, (n, totaal, fractie) => {
          const mb = (bestand.size / 1048576).toLocaleString('nl-NL', { maximumFractionDigits: 0 });
          statusEl.textContent = totaal
            ? `${bestand.name} inlezen… ${n.toLocaleString('nl-NL')} / ${totaal.toLocaleString('nl-NL')} punten`
            : `${bestand.name} (${mb} MB) inlezen… ${Math.round(fractie * 100)}% · ${n.toLocaleString('nl-NL')} punten`;
        }, sinkPts);
      }
    } catch (err) {
      statusEl.textContent = `kon ${bestand.name} niet lezen: ${err.message}`;
      tekenAsKnop.disabled = true;
      wisAsKnop.disabled = true;
      return;
    }

    if (gelezen.xs.length < 3) {
      statusEl.textContent = 'geen (geldige) punten gevonden in dit bestand';
      return;
    }

    const totaalGelezen = gelezen.aantalGelezen ?? gelezen.xs.length;
    let { xs: gxs, ys: gys, zs: gzs, cs: gcs } = gelezen;
    const doel = doelPunten();
    if (gxs.length > doel) {
      statusEl.textContent =
        `${totaalGelezen.toLocaleString('nl-NL')} punten gelezen — uitdunnen naar ${doel.toLocaleString('nl-NL')}…`;
      await new Promise(r => setTimeout(r, 10));
      ({ xs: gxs, ys: gys, zs: gzs, cs: gcs } = dunUit(gxs, gys, gzs, doel, gcs));
    }

    let maaiveldTekst = '';
    if (!strook && (bestand.tegelbron ? (bestand.info.klassen?.[2] || 0) > 0 : /\.la[sz]$/i.test(bestand.name))) {
      maaiveldAActief = !!gelezen.maaiveld;
      const heeftGrond = (gelezen.aantalGrond || 0) >= Math.max(50, (gelezen.aantalAlle || 0) * 0.01);
      if (maaiveldAActief) maaiveldTekst = ` · alleen maaiveld (klasse 2): ${gelezen.aantalGrond.toLocaleString('nl-NL')} van ${gelezen.aantalAlle.toLocaleString('nl-NL')} punten`;
      else if (maaiveldAGevraagd()) maaiveldTekst = ' · geen maaiveldklasse in dit bestand: alle punten gebruikt';
      else if (heeftGrond && gelezen.aantalGrond < gelezen.aantalAlle * 0.98) maaiveldTekst = ' · dit bestand heeft maaiveldklasse 2: vink "maaiveld" aan om begroeiing en objecten weg te laten';
    } else if (!strook) maaiveldAActief = false;

    let randenTekst = '';
    if (randenStrakAan()) {
      gzs = Array.from(gzs); if (gcs) gcs = Array.from(gcs);
      const n = sluitRanden(gxs, gys, gzs, gcs);
      if (n) randenTekst = ` · ${n.toLocaleString('nl-NL')} punten in hekwerk/randen strakgetrokken`;
    }
    let uitgedundTekst = totaalGelezen > gxs.length
      ? ` (uitgedund van ${totaalGelezen.toLocaleString('nl-NL')})`
      : '';
    const steekproefTekst = gelezen.isSteekproef
      ? ` — steekproef uit ${gelezen.aantalInBestand.toLocaleString('nl-NL')} punten in het LAS-bestand`
      : '';
    if (!strook) {
      origineelAantal = gelezen.aantalInBestand || totaalGelezen;
      origineelOppervlak = null;    // wordt na de surface bepaald
    }
    if (strook) uitgedundTekst = '';
    const strookTekst = strook ? ` — detailstrook langs de as (±${strook.halveBreedte.toFixed(0)} m, uit ${totaalGelezen.toLocaleString('nl-NL')} punten)` : '';
    await activeerPuntenwolk(gxs, gys, gzs, bestand.name, uitgedundTekst + steekproefTekst + strookTekst + maaiveldTekst + randenTekst, t0, gcs, behoud);
  }



  /* ────────────────────────────────────────────────────────────────
     Tegelwolk (2.9.0): de puntenwolk één keer omzetten naar vakken
     van 50 × 50 m in de projectmap, met álle punten (hoogte, klasse,
     kleur). Daarna leest de viewer alleen nog de vakken die hij nodig
     heeft: voor een profiel de paar vakken waar de lijn doorheen loopt,
     voor het bovenaanzicht een grof overzicht, en bij inzoomen de
     volle vakken van wat in beeld is.
     Formaat per punt (16 bytes, little-endian):
       int32 x, int32 y  (mm t.o.v. de oorsprong in info.json)
       int32 z           (mm NAP)
       uint8 klasse, uint8 r, g, b
     ──────────────────────────────────────────────────────────────── */
  const TEGEL_M = 50, TEGEL_REC = 16, TEGEL_FORMAAT = 'pv-tegels-1', OVERZICHT_DOEL = 2000000;
  const tegelNaam = (tx, ty) => `${tx}_${ty}.pvt`;

  function maakTegelSchrijver(tegelMap) {
    let ox = null, oy = null;
    const tegels = new Map(), CAP = 8192;
    let gezien = 0, kleurMax = 0, metKleur = false, deler = null;
    let voorraad = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const klassen = new Float64Array(256);
    // twee grove overzichten tegelijk: alle punten en alleen maaiveld (klasse 2)
    const ovAlle = maakUitdunner(OVERZICHT_DOEL * 2), ovGrond = maakUitdunner(OVERZICHT_DOEL * 2);
    const nieuweBuf = () => { const b = new ArrayBuffer(CAP * TEGEL_REC); return { b, dv: new DataView(b), i: 0 }; };
    function schrijf(x, y, z, r, g, b, k) {
      const tx = Math.floor(x / TEGEL_M), ty = Math.floor(y / TEGEL_M), sl = tx * 1048576 + ty;
      let t = tegels.get(sl);
      if (!t) { t = { tx, ty, n: 0, buf: nieuweBuf(), delen: [], stroom: null, minZ: Infinity, maxZ: -Infinity }; tegels.set(sl, t); }
      const bf = t.buf, o = bf.i * TEGEL_REC, dv = bf.dv;
      dv.setInt32(o, Math.round((x - ox) * 1000), true);
      dv.setInt32(o + 4, Math.round((y - oy) * 1000), true);
      dv.setInt32(o + 8, Math.round(z * 1000), true);
      dv.setUint8(o + 12, k ?? 0);
      let r8 = 0, g8 = 0, b8 = 0;
      if (r !== undefined) { r8 = Math.min(255, Math.floor(r / deler)); g8 = Math.min(255, Math.floor(g / deler)); b8 = Math.min(255, Math.floor(b / deler)); }
      dv.setUint8(o + 13, r8); dv.setUint8(o + 14, g8); dv.setUint8(o + 15, b8);
      if (z < t.minZ) t.minZ = z; if (z > t.maxZ) t.maxZ = z;
      t.n++;
      if (++bf.i === CAP) { t.delen.push(bf.b); t.buf = nieuweBuf(); }
      if (r !== undefined) { ovAlle.voegToe(x, y, z, r8, g8, b8); if (k === 2) ovGrond.voegToe(x, y, z, r8, g8, b8); }
      else { ovAlle.voegToe(x, y, z); if (k === 2) ovGrond.voegToe(x, y, z); }
    }
    function bepaalDeler() {
      deler = kleurMax > 255 ? 256 : 1;   // LAS: meestal 16-bits kleur
      const v = voorraad; voorraad = null;
      for (let i = 0; i < v.length; i += 7) schrijf(v[i], v[i + 1], v[i + 2], v[i + 3], v[i + 4], v[i + 5], v[i + 6]);
    }
    async function wegschrijven() {
      for (const t of tegels.values()) {
        if (!t.delen.length) continue;
        if (!t.stroom) t.stroom = await (await tegelMap.getFileHandle(tegelNaam(t.tx, t.ty), { create: true })).createWritable();
        for (const d of t.delen) await t.stroom.write(d);
        t.delen = [];
      }
    }
    return {
      voegToe(x, y, z, r, g, b, k) {
        gezien++;
        if (ox === null) { ox = Math.floor(x / 1000) * 1000; oy = Math.floor(y / 1000) * 1000; }
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        klassen[k ?? 0]++;
        if (r !== undefined) { metKleur = true; if (r > kleurMax) kleurMax = r; if (g > kleurMax) kleurMax = g; if (b > kleurMax) kleurMax = b; }
        if (deler === null) {
          voorraad.push(x, y, z, r, g, b, k);
          if (voorraad.length >= 7 * 200000) bepaalDeler();
          return;
        }
        schrijf(x, y, z, r, g, b, k);
      },
      async naBlok() { if (deler !== null) await wegschrijven(); },
      get aantalGezien() { return gezien; },
      resultaat() { return { xs: [], ys: [], zs: [], cs: null }; },
      /** Alles wegschrijven en afsluiten → info (voor info.json) + de overzichten. */
      async afronden(onVoortgang) {
        if (deler === null) bepaalDeler();
        for (const t of tegels.values()) if (t.buf.i) { t.delen.push(t.buf.b.slice(0, t.buf.i * TEGEL_REC)); t.buf = nieuweBuf(); }
        await wegschrijven();
        let k = 0;
        for (const t of tegels.values()) {
          if (t.stroom) await t.stroom.close();
          t.stroom = null;
          if (++k % 50 === 0) onVoortgang?.(`vakken afsluiten… ${k} / ${tegels.size}`);
        }
        const grondTotaal = klassen[2];
        const ov = (u) => { const r = u.resultaat(); return r.xs.length > OVERZICHT_DOEL ? dunUit(r.xs, r.ys, r.zs, OVERZICHT_DOEL, r.cs) : r; };
        const info = {
          formaat: TEGEL_FORMAAT, tegelM: TEGEL_M, rec: TEGEL_REC, oorsprong: [ox, oy], aantal: gezien, kleur: metKleur && kleurMax > 0,
          bbox: [minX, minY, minZ, maxX, maxY, maxZ],
          klassen: Object.fromEntries([...klassen].map((n, i) => [i, n]).filter(([, n]) => n > 0)),
          tegels: [...tegels.values()].map(t => [t.tx, t.ty, t.n, Math.round(t.minZ * 1000) / 1000, Math.round(t.maxZ * 1000) / 1000]),
          overzicht: { modus: oppervlakModus(), doel: OVERZICHT_DOEL },
          gemaakt: new Date().toISOString(), viewer: document.getElementById('appVersie')?.textContent || '',
        };
        return { info, alle: ov(ovAlle), grond: grondTotaal >= Math.max(50, gezien * 0.01) ? ov(ovGrond) : null };
      },
    };
  }

  /** Punten {xs,ys,zs,cs} → bytes in het tegelformaat (voor het overzicht). */
  function puntenNaarTegelBytes(p, ox, oy) {
    const n = p.xs.length, buf = new ArrayBuffer(n * TEGEL_REC), dv = new DataView(buf);
    for (let i = 0; i < n; i++) {
      const o = i * TEGEL_REC;
      dv.setInt32(o, Math.round((p.xs[i] - ox) * 1000), true);
      dv.setInt32(o + 4, Math.round((p.ys[i] - oy) * 1000), true);
      dv.setInt32(o + 8, Math.round(p.zs[i] * 1000), true);
      const c = p.cs ? p.cs[i] : 0;
      dv.setUint8(o + 12, 0); dv.setUint8(o + 13, (c >> 16) & 255); dv.setUint8(o + 14, (c >> 8) & 255); dv.setUint8(o + 15, c & 255);
    }
    return buf;
  }
  async function schrijfBestandInMap(map, naam, inhoud) {
    const w = await (await map.getFileHandle(naam, { create: true })).createWritable();
    await w.write(inhoud); await w.close();
  }
  async function leesBestandUitMap(map, naam) {
    return (await (await map.getFileHandle(naam)).getFile());
  }

  /** Bron die uit een tegelmap leest: gedraagt zich voor de rest van de viewer als een bestand. */
  function maakTegelbron(map, info) {
    return { tegelbron: true, map, info, name: info.bron?.naam || map.name, size: info.bron?.grootte || 0, tegelMapP: null,
      async tegelMap() { return this.tegelMapP || (this.tegelMapP = map.getDirectoryHandle('tegels')); } };
  }

  /** Bestand → tegels in `wolkMap`. Leest het hele bestand één keer helemaal door. */
  async function importeerNaarTegels(bestand, wolkMap, onVoortgang) {
    const tegelMap = await wolkMap.getDirectoryHandle('tegels', { create: true });
    const schrijver = maakTegelSchrijver(tegelMap);
    const t0 = performance.now();
    const tijd = () => `${Math.round((performance.now() - t0) / 1000)} s`;
    if (/\.la[sz]$/i.test(bestand.name)) {
      const header = await leesLasHeader(bestand);
      const v = (n, totaal) => onVoortgang?.(`${bestand.name} omzetten naar vakken… ${Math.round(100 * n / Math.max(1, totaal))}% · ${n.toLocaleString('nl-NL')} / ${totaal.toLocaleString('nl-NL')} punten · ${tijd()}`);
      if (header.isCompressed) await leesLazPunten(bestand, header, v, true, schrijver);
      else await leesLasPunten(bestand, header, v, true, schrijver);
    } else {
      await leesPts(bestand, (n, totaal, fractie) => onVoortgang?.(`${bestand.name} omzetten naar vakken… ${Math.round(fractie * 100)}% · ${n.toLocaleString('nl-NL')} punten · ${tijd()}`), schrijver);
    }
    onVoortgang?.(`${bestand.name}: vakken afsluiten en overzicht maken…`);
    const { info, alle, grond } = await schrijver.afronden(onVoortgang);
    info.bron = { naam: bestand.name, grootte: bestand.size, gewijzigd: bestand.lastModified };
    await schrijfBestandInMap(wolkMap, 'overzicht.pvt', puntenNaarTegelBytes(alle, info.oorsprong[0], info.oorsprong[1]));
    info.overzicht.alle = alle.xs.length;
    if (grond) { await schrijfBestandInMap(wolkMap, 'overzicht_maaiveld.pvt', puntenNaarTegelBytes(grond, info.oorsprong[0], info.oorsprong[1])); info.overzicht.maaiveld = grond.xs.length; }
    info.duurImport = Math.round((performance.now() - t0) / 1000);
    await schrijfBestandInMap(wolkMap, 'info.json', JSON.stringify(info, null, 1));
    return maakTegelbron(wolkMap, info);
  }

  /** Records uit een tegelbestand naar een sink (zelfde voegToe als de lezers). */
  function voerTegelRecords(buf, info, sink, kader) {
    const dv = new DataView(buf), n = Math.floor(buf.byteLength / TEGEL_REC), [ox, oy] = info.oorsprong, kl = info.kleur;
    for (let i = 0; i < n; i++) {
      const o = i * TEGEL_REC;
      const x = ox + dv.getInt32(o, true) / 1000, y = oy + dv.getInt32(o + 4, true) / 1000;
      if (kader && (x < kader.minX || x > kader.maxX || y < kader.minY || y > kader.maxY)) continue;
      const z = dv.getInt32(o + 8, true) / 1000, k = dv.getUint8(o + 12);
      if (kl) sink.voegToe(x, y, z, dv.getUint8(o + 13), dv.getUint8(o + 14), dv.getUint8(o + 15), k);
      else sink.voegToe(x, y, z, undefined, undefined, undefined, k);
    }
  }
  /** Tegels (binnen `kader`, of allemaal) door een sink halen. */
  async function leesTegels(bron, onVoortgang, sink, kader = null, tegelFilter = null) {
    const T = bron.info.tegelM;
    const lijst = bron.info.tegels.filter(([tx, ty]) => (!kader || !(tx * T > kader.maxX || (tx + 1) * T < kader.minX || ty * T > kader.maxY || (ty + 1) * T < kader.minY))
      && (!tegelFilter || tegelFilter(tx, ty, T)));
    const totaal = lijst.reduce((a, t) => a + t[2], 0);
    const tm = await bron.tegelMap();
    let gedaan = 0;
    for (const [tx, ty, n] of lijst) {
      const buf = await (await (await tm.getFileHandle(tegelNaam(tx, ty))).getFile()).arrayBuffer();
      voerTegelRecords(buf, bron.info, sink, kader);
      gedaan += n;
      onVoortgang?.(gedaan, totaal);
      await new Promise(r => setTimeout(r, 0));
    }
    return { ...sink.resultaat(), aantalGelezen: sink.aantalGezien, aantalInBestand: bron.info.aantal, aantalInVakken: totaal, vakken: lijst.length };
  }
  /** Overzicht (al uitgedund bij het omzetten) door een sink halen. */
  async function leesOverzicht(bron, sink, maaiveld) {
    const buf = await (await leesBestandUitMap(bron.map, maaiveld ? 'overzicht_maaiveld.pvt' : 'overzicht.pvt')).arrayBuffer();
    const info = bron.info;
    // klasse staat in het overzicht niet per punt: bij het maaiveld-overzicht is alles klasse 2
    const s = maaiveld ? { voegToe: (x, y, z, r, g, b) => sink.voegToe(x, y, z, r, g, b, 2), get aantalGezien() { return sink.aantalGezien; }, resultaat: () => sink.resultaat() } : sink;
    voerTegelRecords(buf, info, s, null);
    return { ...sink.resultaat(), aantalGelezen: info.aantal, aantalInBestand: info.aantal, uitOverzicht: true };
  }
  /** Kan het overzicht gebruikt worden voor de huidige instellingen? */
  function overzichtGeschikt(bron) {
    const ov = bron.info.overzicht || {};
    if (ov.modus !== oppervlakModus()) return null;
    const grond = maaiveldAGevraagd() && ov.maaiveld;
    const n = grond ? ov.maaiveld : ov.alle;
    if (!n || doelPunten() > n * 1.05 && bron.info.aantal > n * 1.05) return null;
    return { grond: !!grond };
  }
  /** Filter: alleen vakken die binnen `half` m van een as liggen (bij een schuine dijk scheelt dat veel vakken). */
  function tegelsLangsAs(half, alleen = 'actief') {
    const stukken = alleen === 'alle' ? alleAsStukken() : asStukken();
    return (tx, ty, T) => {
      const cx = (tx + 0.5) * T, cy = (ty + 0.5) * T, grens = half + T * 0.7072;
      for (const st of stukken) if (projecteer(st, cx, cy).d <= grens) return true;
      return false;
    };
  }
  /** Kader om alle dwarsprofiellijnen en de as (± tol). */
  function profielKader(breedte, tol) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const neem = (p) => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; };
    for (const st of dwarsStations) { neem(puntOpStationOffset(st, -profielL())); neem(puntOpStationOffset(st, profielR())); }
    for (const p of asPunten) neem(p);
    const m = tol + 0.5;
    return { minX: minX - m, maxX: maxX + m, minY: minY - m, maxY: maxY + m };
  }
  /** Kader om een strook langs de (alle) assen. */
  function strookKader(halveBreedte) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const st of alleAsStukken()) { minX = Math.min(minX, st.ax, st.bx); maxX = Math.max(maxX, st.ax, st.bx); minY = Math.min(minY, st.ay, st.by); maxY = Math.max(maxY, st.ay, st.by); }
    return { minX: minX - halveBreedte, maxX: maxX + halveBreedte, minY: minY - halveBreedte, maxY: maxY + halveBreedte };
  }

  /* ────────────────────────────────────────────────────────────────
     Vergelijkingswolk (B): een tweede puntenwolk — bv. AHN naast een
     dronemeting, of twee meetmomenten — die in de profielen als tweede
     lijn in een eigen kleur verschijnt. Alleen het gebied van wolk A
     (+ marge) wordt bewaard, zodat een grote AHN-tegel op het detail van
     het projectgebied blijft. Uit LAS/LAZ met classificatie worden
     standaard alleen maaiveldpunten (klasse 2) gebruikt.
     ──────────────────────────────────────────────────────────────── */
  function maakVergelijkFilter(kader, alleenMaaiveld) {
    const alles = maakUitdunner(limietB());
    const maaiveld = alleenMaaiveld ? maakUitdunner(limietB()) : null;
    let gezien = 0, binnen = 0, binnenMaaiveld = 0;
    return {
      voegToe(x, y, z, r, g, b, klasse) {
        gezien++;
        if (x < kader.minX || x > kader.maxX || y < kader.minY || y > kader.maxY) return;
        binnen++;
        alles.voegToe(x, y, z, r, g, b);
        if (maaiveld && klasse === 2) { binnenMaaiveld++; maaiveld.voegToe(x, y, z, r, g, b); }
      },
      get aantalGezien() { return gezien; },
      get binnen() { return binnen; },
      resultaat() {
        // genoeg maaiveldpunten (≥ 20% van wat er in het gebied ligt)? dan die,
        // anders is het bestand niet (zo) geclassificeerd: alle punten
        const gebruikMaaiveld = maaiveld && binnenMaaiveld >= Math.max(100, binnen * 0.2);
        const r = (gebruikMaaiveld ? maaiveld : alles).resultaat();
        r.alleenMaaiveld = !!gebruikMaaiveld;
        r.aantalBinnen = gebruikMaaiveld ? binnenMaaiveld : binnen;
        return r;
      },
    };
  }

  async function laadVergelijkBestand(bestand) {
    markeerBezig('inlezen B', bestand.name);
    try { return await laadVergelijkBestandBinnen(bestand); } finally { markeerKlaar(); }
  }
  async function laadVergelijkBestandBinnen(bestand) {
    if (!xs) { statusEl.textContent = 'Open eerst puntenwolk A; daarna kun je er een tweede bij laden om te vergelijken.'; return; }
    const [minX, maxX] = bereikVan(xs), [minY, maxY] = bereikVan(ys);
    const marge = 10;
    const kader = { minX: minX - marge, maxX: maxX + marge, minY: minY - marge, maxY: maxY + marge };
    const alleenMaaiveld = document.getElementById('vergelijkMaaiveld')?.checked !== false;
    const t0 = performance.now();
    statusEl.textContent = `B: ${bestand.name} inlezen…`;
    await new Promise(r => setTimeout(r, 10));
    let gelezen, filter, aantalInBestand = null;
    try {
      if (/\.la[sz]$/i.test(bestand.name)) {
        const header = await leesLasHeader(bestand);
        aantalInBestand = header.aantalPunten;
        filter = maakVergelijkFilter(kader, alleenMaaiveld);
        const voortgang = (n, totaal) => {
          statusEl.textContent = `B: ${bestand.name} doorzoeken op het gebied van A… ${Math.round(100 * n / Math.max(1, totaal))}% · ${filter.binnen.toLocaleString('nl-NL')} punten in het gebied`;
        };
        gelezen = header.isCompressed
          ? await leesLazPunten(bestand, header, voortgang, true, filter)
          : await leesLasPunten(bestand, header, voortgang, true, filter);
      } else {
        filter = maakVergelijkFilter(kader, false);
        gelezen = await leesPts(bestand, (n, totaal, fractie) => {
          statusEl.textContent = `B: ${bestand.name} inlezen… ${Math.round((fractie ?? (n / Math.max(1, totaal))) * 100)}%`;
        }, filter);
      }
    } catch (err) {
      toonFout(`kon ${bestand.name} niet lezen: ${err.message}`);
      return;
    }
    const r = filter.resultaat();
    if (r.xs.length < 3) {
      statusEl.textContent = `B: ${bestand.name} heeft geen punten in het gebied van puntenwolk A — liggen beide in RD (EPSG:28992)?`;
      return;
    }
    let { xs: bx, ys: by, zs: bz } = r;
    if (bx.length > doelB()) ({ xs: bx, ys: by, zs: bz } = dunUit(bx, by, bz, doelB()));
    statusEl.textContent = `B: ${bx.length.toLocaleString('nl-NL')} punten — surface bouwen…`;
    await new Promise(res => setTimeout(res, 10));
    wolkB = maakWolkB(bestand.name, bx, by, bz, r.alleenMaaiveld);
    const afstand = wolkB.puntAfstand;
    toonWolkB = true;
    werkWolkKeuzeBij();
    const duur = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
    statusEl.textContent = `B: ${wolkB.naam} — ${bx.length.toLocaleString('nl-NL')} punten in het gebied van A`
      + (r.alleenMaaiveld ? ' (alleen maaiveld, klasse 2)' : '')
      + (aantalInBestand ? ` uit ${aantalInBestand.toLocaleString('nl-NL')} in het bestand` : '')
      + ` · gem. puntafstand ±${afstand < 1 ? Math.round(afstand * 100) + ' cm' : afstand.toFixed(1).replace('.', ',') + ' m'} · ${duur} s`;
    bijwerkenProfielen();
  }

  /** Surface van wolk B bouwen. */
  function maakWolkB(naam, bx, by, bz, alleenMaaiveld) {
    const dl = lichtNet(new d3.Delaunay(platteCoords(bx, by)));
    const inc = bouwIncidentie(dl, bx.length);
    let opp = 0;
    const T = dl.triangles;
    for (let i = 0; i < T.length; i += 3) {
      const a = T[i], b2 = T[i + 1], c = T[i + 2];
      opp += Math.abs((bx[b2] - bx[a]) * (by[c] - by[a]) - (bx[c] - bx[a]) * (by[b2] - by[a])) / 2;
    }
    const afstand = Math.sqrt(opp / Math.max(1, bx.length)) || 0.5;
    return { naam, xs: bx, ys: by, zs: bz, delaunay: dl, incident: inc, maxZijde: Math.max(3, afstand * 8),
      alleenMaaiveld: !!alleenMaaiveld, puntAfstand: afstand };
  }

  function werkWolkKeuzeBij() {
    const groep = document.getElementById('wolkKeuze');
    if (!groep) return;
    groep.hidden = !wolkB;
    const a = document.getElementById('toonWolkA'), b = document.getElementById('toonWolkB');
    if (a) a.checked = toonWolkA;
    if (b) b.checked = toonWolkB;
    const na = document.getElementById('wolkANaam'), nb = document.getElementById('wolkBNaam');
    if (na) { na.textContent = 'A'; na.parentElement.title = `A: ${bronBestandsnaam || 'puntenwolk A'} — tonen in de profielen`; }
    if (nb && wolkB) { nb.textContent = 'B'; nb.parentElement.title = `B: ${wolkB.naam}${wolkB.alleenMaaiveld ? ' (maaiveld)' : ''} — tonen in de profielen`; }
    const vb = document.getElementById('vergelijkBestand');
    if (vb) vb.disabled = !xs;
  }

  document.getElementById('vergelijkBestand')?.addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await laadVergelijkBestand(f);
  });
  document.getElementById('toonWolkA')?.addEventListener('change', (e) => { toonWolkA = e.target.checked; bijwerkenProfielen(); });
  document.getElementById('toonWolkB')?.addEventListener('change', (e) => { toonWolkB = e.target.checked; bijwerkenProfielen(); });
  document.getElementById('wisWolkB')?.addEventListener('click', () => {
    wolkB = null; toonWolkA = true;
    werkWolkKeuzeBij();
    statusEl.textContent = 'Vergelijkingswolk B weggehaald';
    bijwerkenProfielen();
  });

  /* ────────────────────────────────────────────────────────────────
     Volle dichtheid
     Bij heel grote bestanden (100+ miljoen punten) gaat er door het
     uitdunnen detail verloren. Twee manieren om dat te voorkomen:
     1. Detailstrook: het bestand opnieuw lezen en alleen punten in een
        strook rond de as bewaren — op de volle dichtheid die past.
     2. Profielen uit alle punten: het bestand één keer helemaal doorlopen
        en per dwarsprofiel (en langs de as) de echte meetpunten verzamelen
        die vlak naast de profiellijn liggen. Geen uitdunnen, geen
        driehoeksnet ertussen.
     Beide gebruiken een rasterindex, zodat een punt dat nergens in de buurt
     ligt met één opzoeking wordt overgeslagen.
     ──────────────────────────────────────────────────────────────── */
  let detailStrook = null;        // {halveBreedte, ...} als de detailstrook actief is
  let origineelAantal = 0;        // aantal punten in het oorspronkelijke bestand
  let origineelOppervlak = null;
  let origPuntAfstand = null;     // gemiddelde puntafstand van het oorspronkelijke bestand (m)
  let volleProfielen = null;      // resultaat van "profielen uit alle punten"
  let volleBezig = false, volleStop = false;

  /** Rasterindex van lijnstukken: per cel welke stukken er (met buffer) doorheen lopen. */
  function maakLijnIndex(stukken, buffer, cel) {
    let minX = Infinity, minY = Infinity;
    for (const st of stukken) { minX = Math.min(minX, st.ax, st.bx); minY = Math.min(minY, st.ay, st.by); }
    minX -= buffer + cel; minY -= buffer + cel;
    const index = new Map();
    const voeg = (ix, iy, id) => {
      const k = ix * 1048576 + iy;
      let lijst = index.get(k);
      if (!lijst) index.set(k, lijst = []);
      if (lijst[lijst.length - 1] !== id) lijst.push(id);
    };
    const r = Math.ceil(buffer / cel);
    stukken.forEach((st, id) => {
      const len = Math.hypot(st.bx - st.ax, st.by - st.ay);
      const n = Math.max(1, Math.ceil(len / (cel / 2)));
      const gezien = new Set();
      for (let i = 0; i <= n; i++) {
        const x = st.ax + (st.bx - st.ax) * i / n, y = st.ay + (st.by - st.ay) * i / n;
        const cx = Math.floor((x - minX) / cel), cy = Math.floor((y - minY) / cel);
        for (let dx = -r - 1; dx <= r + 1; dx++) for (let dy = -r - 1; dy <= r + 1; dy++) {
          const k = (cx + dx) * 1048576 + (cy + dy);
          if (gezien.has(k)) continue;
          gezien.add(k); voeg(cx + dx, cy + dy, id);
        }
      }
    });
    return {
      zoek(x, y) {
        const ix = Math.floor((x - minX) / cel), iy = Math.floor((y - minY) / cel);
        if (ix < 0 || iy < 0) return null;
        return index.get(ix * 1048576 + iy) || null;
      },
    };
  }

  /** Afstand van (x,y) tot lijnstuk st: {t: positie langs het stuk (m), d: loodrechte afstand (m)} */
  function projecteer(st, x, y) {
    const dx = st.bx - st.ax, dy = st.by - st.ay, len2 = dx * dx + dy * dy || 1e-12;
    let t = ((x - st.ax) * dx + (y - st.ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = st.ax + dx * t, py = st.ay + dy * t;
    return { t: t * Math.sqrt(len2), d: Math.hypot(x - px, y - py) };
  }

  function asStukken() {
    const s = stationsLangsAs(), uit = [];
    for (let i = 1; i < asPunten.length; i++) {
      uit.push({ ax: asPunten[i - 1].x, ay: asPunten[i - 1].y, bx: asPunten[i].x, by: asPunten[i].y, s0: s[i - 1] });
    }
    return uit;
  }

  /** Filter voor de detailstrook: alleen punten binnen halveBreedte van de as door naar `doel`. */
  /* Maaiveld van A (klasse 2). Of het bestand geclassificeerd is, weten we pas
     tijdens het lezen: de eerste miljoen punten gaan naar beide uitdunners, daarna
     valt de keus (genoeg klasse 2 → alleen grond) en blijft er één over. */
  const maaiveldAGevraagd = () => document.getElementById('wolkAMaaiveld')?.checked === true;
  let maaiveldAActief = false;    // A is ingelezen met alleen klasse 2
  function maakMaaiveldKeuze(maakDoel, toestaan) {
    let alles = maakDoel(), grond = toestaan ? maakDoel() : null, n = 0, n2 = 0, keuze = toestaan ? null : 'alles';
    const beslis = () => {
      keuze = toestaan && n2 >= Math.max(50, n * 0.01) ? 'grond' : 'alles';
      if (keuze === 'grond') alles = null; else grond = null;
    };
    return {
      voegToe(x, y, z, r, g, b, k) {
        n++; if (k === 2) n2++;
        if (keuze === null) {
          alles.voegToe(x, y, z, r, g, b, k); if (k === 2) grond.voegToe(x, y, z, r, g, b, k);
          if (n >= 1e6) beslis();
        } else if (keuze === 'grond') { if (k === 2) grond.voegToe(x, y, z, r, g, b, k); }
        else alles.voegToe(x, y, z, r, g, b, k);
      },
      get aantalGezien() { return n; },
      resultaat() {
        if (keuze === null) beslis();
        const r = (keuze === 'grond' ? grond : alles).resultaat();
        r.maaiveld = keuze === 'grond'; r.aantalGrond = n2; r.aantalAlle = n;
        return r;
      },
    };
  }
  /** Laat alleen klasse 2 door naar `doel` (als A met maaiveld is ingelezen). */
  function alleenGrondVan(doel) {
    if (!maaiveldAActief) return doel;
    let n = 0;
    return {
      voegToe(x, y, z, r, g, b, k) { n++; if (k === 2) doel.voegToe(x, y, z, r, g, b, k); },
      get aantalGezien() { return n; },
      resultaat() { return doel.resultaat(); },
    };
  }

  function maakStrookFilter(strook, doel) {
    const stukken = alleAsStukken();
    const cel = Math.max(1, strook.halveBreedte / 4);
    const idx = maakLijnIndex(stukken, strook.halveBreedte, cel);
    let gezien = 0;
    return {
      voegToe(x, y, z, r, g, b, k) {
        gezien++;
        const lijst = idx.zoek(x, y);
        if (!lijst) return;
        for (let i = 0; i < lijst.length; i++) {
          if (projecteer(stukken[lijst[i]], x, y).d <= strook.halveBreedte) {
            doel.voegToe(x, y, z, r, g, b, k);
            return;
          }
        }
      },
      get aantalGezien() { return gezien; },
      resultaat() { return doel.resultaat(); },
    };
  }

  /** Sleutel van de huidige as/profielinstellingen — volle profielen gelden alleen zolang die gelijk blijven. */
  function profielSleutel() {
    return JSON.stringify([asPunten.map(p => [+p.x.toFixed(3), +p.y.toFixed(3)]),
      profielL(), profielR(), Number(dwarsIntervalVeld.value), Number(stapLangsVeld.value),
      palen.profielenOpPalen && palen.modus !== 'm' ? `${palen.modus}|${palen.versie}|${palen.hmStart}|${palen.hmRichting}|${palen.maxAfstand}` : '']);
  }
  const volleCache = new Map();   // sleutel → volle profielen (per as bewaard)
  function volleProfielenGeldig() {
    const sleutel = profielSleutel();
    if (volleProfielen && volleProfielen.sleutel === sleutel) return true;
    if (volleCache.has(sleutel) && volleCache.get(sleutel).bestand === laatsteBestand?.name) { volleProfielen = volleCache.get(sleutel); return true; }
    return false;
  }

  /** Verzamelt alle meetpunten binnen ±tol van elke dwarsprofiellijn en van de as. */
  function maakProfielVerzamelaar(stations, pL, pR, tol) {
    const breedte = pL + pR;
    const asSt = asStukken();
    const dwarsSt = stations.map((st, i) => {
      const l = puntOpStationOffset(st, -pL), r = puntOpStationOffset(st, pR);
      return { ax: l.x, ay: l.y, bx: r.x, by: r.y, i };
    });
    const alle = dwarsSt.map(d => ({ ...d, soort: 'dwars' })).concat(asSt.map(a => ({ ...a, soort: 'as' })));
    const cel = Math.max(0.5, Math.min(5, breedte / 8));
    const idx = maakLijnIndex(alle, tol, cel);
    const dwars = stations.map(() => ({ o: [], z: [] }));
    const langs = { s: [], z: [] };
    let gezien = 0;
    return {
      voegToe(x, y, z) {
        gezien++;
        const lijst = idx.zoek(x, y);
        if (!lijst) return;
        for (let i = 0; i < lijst.length; i++) {
          const st = alle[lijst[i]];
          const pr = projecteer(st, x, y);
          if (pr.d > tol) continue;
          if (st.soort === 'dwars') {
            const d = dwars[st.i]; d.o.push(pr.t - pL); d.z.push(z);
          } else {
            langs.s.push(st.s0 + pr.t); langs.z.push(z);
          }
        }
      },
      get aantalGezien() { return gezien; },
      resultaat() { return { dwars, langs }; },
    };
  }

  /** Hoogte van één vakje uit gesorteerde hoogtes `v`. Liggen er meerdere lagen
   *  boven elkaar (wegdek op een brug + bodem eronder), dan de bovenste (of bij
   *  'onderkant' de onderste) laag: mediaan van de punten binnen 15 cm van het
   *  90%- (of 10%-)punt. Eén enkele uitschieter (vogel, kraan) telt zo niet mee. */
  function laagHoogte(v) {
    const n = v.length;
    if (n <= 2) return n === 1 ? v[0] : (oppervlakModus() === 'onder' ? v[0] : v[1]);
    const onder = oppervlakModus() === 'onder';
    const ref = v[Math.min(n - 1, Math.max(0, Math.round((onder ? 0.1 : 0.9) * (n - 1))))];
    const laag = v.filter(h => Math.abs(h - ref) <= 0.15);
    const m = laag.length;
    return m % 2 ? laag[(m - 1) / 2] : (laag[m / 2 - 1] + laag[m / 2]) / 2;
  }

  /** Ruwe (positie, hoogte)-punten → profielreeks: per vak van `bin` m de bovenste (of onderste) laag.
   *  Lege stukken tot `maxGat` m worden overbrugd, langere worden een onderbreking. */
  function maakReeks(posities, hoogtes, van, tot, bin, maxGat, veld, metBgt) {
    const n = Math.max(1, Math.round((tot - van) / bin));
    const vakken = Array.from({ length: n + 1 }, () => []);
    for (let i = 0; i < posities.length; i++) {
      const k = Math.round((posities[i] - van) / bin);
      if (k >= 0 && k <= n) vakken[k].push(hoogtes[i]);
    }
    const uit = [];
    let laatstePos = null;
    for (let k = 0; k <= n; k++) {
      const v = vakken[k];
      if (!v.length) continue;
      v.sort((a, b) => a - b);
      const med = laagHoogte(v);
      const pos = van + k * bin;
      if (laatstePos !== null && pos - laatstePos > maxGat) uit.push({ [veld]: (pos + laatstePos) / 2, hoogte: null, bgtLabel: null });
      uit.push({ [veld]: pos, hoogte: med, aantal: v.length, bgtLabel: metBgt ? metBgt(pos) : null });
      laatstePos = pos;
    }
    return uit;
  }

  /** Profielen uit alle punten: hele bestand één keer doorlopen. */
  async function maakVolleProfielen() {
    markeerBezig('alle punten', laatsteBestand?.name || "");
    try { return await maakVolleProfielenBinnen(); } finally { markeerKlaar(); }
  }
  async function maakVolleProfielenBinnen() {
    if (!laatsteBestand || asPunten.length < 2 || !dwarsStations.length) return;
    const bestand = laatsteBestand;
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const pa = origPuntAfstand || gemPuntAfstand || 0.1;
    const tol = Math.max(0.03, Math.min(0.5, pa * 0.75));
    const verzamelaar = alleenGrondVan(maakProfielVerzamelaar(dwarsStations, pL, pR, tol));
    const knop = document.getElementById('volleDichtheidKnop');
    volleBezig = true; volleStop = false;
    if (knop) { knop.disabled = false; knop.textContent = '■ Stop'; knop.title = 'Het doorlopen van alle punten stoppen'; }
    const t0 = performance.now();
    try {
      const voortgang = (n, totaal) => {
        if (volleStop) throw new Error('gestopt');
        const tijd = (performance.now() - t0) / 1000;
        statusEl.textContent = `Profielen uit alle punten: ${n.toLocaleString('nl-NL')}${totaal ? ' / ' + totaal.toLocaleString('nl-NL') : ''} punten doorlopen · ${Math.round(tijd)} s`;
      };
      if (bestand.tegelbron) {
        // alleen de vakken waar de profielen en de as doorheen lopen
        await leesTegels(bestand, voortgang, verzamelaar, profielKader(breedte, tol), tegelsLangsAs(Math.max(pL, pR) + tol));
      } else if (/\.la[sz]$/i.test(bestand.name)) {
        const header = await leesLasHeader(bestand);
        if (header.isCompressed) await leesLazPunten(bestand, header, voortgang, true, verzamelaar);
        else await leesLasPunten(bestand, header, voortgang, true, verzamelaar);
      } else {
        await leesPts(bestand, (n, totaal, fractie) => {
          if (volleStop) throw new Error('gestopt');
          statusEl.textContent = `Profielen uit alle punten: ${Math.round(fractie * 100)}% · ${n.toLocaleString('nl-NL')} punten doorlopen · ${Math.round((performance.now() - t0) / 1000)} s`;
        }, verzamelaar);
      }
      const r = verzamelaar.resultaat();
      const bin = Math.max(0.02, Math.min(0.1, pa));
      const dwars = new Map();
      let totaalDwars = 0;
      dwarsStations.forEach((st, i) => {
        const d = r.dwars[i];
        totaalDwars += d.o.length;
        dwars.set(st, maakReeks(d.o, d.z, -pL, pR, bin, 1.0, 'offset', null));
      });
      const s = stationsLangsAs(); const totaal = s[s.length - 1];
      const binL = Math.max(bin, Math.min(Number(stapLangsVeld.value) || 1, 0.25));
      const langs = maakReeks(r.langs.s, r.langs.z, 0, totaal, binL, 2.0, 'station', null);
      volleProfielen = { sleutel: profielSleutel(), dwars, langs, tol, bin, totaalDwars, aantalPunten: verzamelaar.aantalGezien, bestand: bestand.name };
      volleCache.set(volleProfielen.sleutel, volleProfielen);
      const duur = Math.round((performance.now() - t0) / 1000);
      statusEl.textContent = `Profielen uit alle ${verzamelaar.aantalGezien.toLocaleString('nl-NL')} punten · ${totaalDwars.toLocaleString('nl-NL')} meetpunten binnen ±${Math.round(tol * 100)} cm van de dwarsprofielen · vakjes van ${Math.round(bin * 100)} cm · ${duur} s`;
      bijwerkenProfielen();
    } catch (err) {
      if (err.message === 'gestopt') statusEl.textContent = 'Profielen uit alle punten: gestopt — de profielen komen weer uit de surface';
      else { console.error(err); toonFout(`profielen uit alle punten mislukt: ${err.message}`); }
    } finally {
      volleBezig = false; volleStop = false;
      werkDetailKnopBij();
    }
  }

  function werkDetailKnopBij() {
    const vk = document.getElementById('volleDichtheidKnop');
    if (vk && !volleBezig) {
      const geldig = volleProfielenGeldig();
      vk.disabled = !laatsteBestand || asPunten.length < 2;
      vk.classList.toggle('aan', !!geldig);
      vk.textContent = geldig ? '✓ Alle punten' : 'Alle punten';
      vk.title = geldig
        ? `Profielen komen uit alle ${volleProfielen.aantalPunten.toLocaleString('nl-NL')} punten van het bestand (meetpunten binnen ±${Math.round(volleProfielen.tol * 100)} cm van de profiellijn). Klik om terug te gaan naar de surface.`
        : 'Profielen berekenen uit ALLE punten van het bestand, zonder uitdunnen (leest het bestand één keer helemaal door; bij heel grote bestanden enkele minuten)';
    }
    const dk = document.getElementById('detailStrookKnop');
    if (dk) {
      dk.disabled = !laatsteBestand || asPunten.length < 2;
      dk.classList.toggle('aan', !!detailStrook);
      dk.textContent = detailStrook ? '✓ Detailstrook' : 'Detailstrook';
      dk.title = detailStrook
        ? 'Alleen een strook rond de as is geladen, op hoge dichtheid. Klik om weer het hele bestand te laden.'
        : 'Het bestand opnieuw lezen en alleen een strook rond de as bewaren (profielbreedte + 2 m) — zo blijft er veel meer detail over bij heel grote bestanden';
    }
  }

  /** Zet een (al uitgedunde) puntenwolk actief: surface bouwen, knoppen aan,
   *  wachtend project toepassen. Gebruikt bij het inlezen van een bestand én
   *  bij het openen van een project waarin de puntenwolk is meebewaard. */
  async function activeerPuntenwolk(gxs, gys, gzs, naam, notitie, t0, gcs = null, behoud = false) {
    xs = gxs; ys = gys; zs = gzs;
    [zMin, zMax] = bereikVan(zs);
    zetKleuren(gcs);

    statusEl.textContent = `${xs.length.toLocaleString('nl-NL')} punten — surface bouwen…`;
    // Aan de volgende tik geven zodat de statustekst al zichtbaar is
    // vóórdat de (voor duizenden punten merkbare) triangulatie start.
    await new Promise(r => setTimeout(r, 10));

    try {
      if (!window.d3?.Delaunay) throw new Error('d3-delaunay is niet geladen — staat de map "vendor" naast index.html?');
      delaunay = lichtNet(new d3.Delaunay(platteCoords(xs, ys)));
      incident = bouwIncidentie(delaunay, xs.length);
    } catch (err) {
      console.error(err);
      toonFout(`surface bouwen mislukt: ${err.message}`);
      return false;
    }
    statusEl.style.color = '';
    const duur = Math.round(performance.now() - t0);

    // gemiddelde puntafstand = wortel(oppervlak van de surface / aantal punten)
    {
      const t = delaunay.triangles;
      let opp = 0;
      for (let i = 0; i < t.length; i += 3) {
        const a = t[i], b2 = t[i + 1], c = t[i + 2];
        opp += Math.abs((xs[b2] - xs[a]) * (ys[c] - ys[a]) - (xs[c] - xs[a]) * (ys[b2] - ys[a])) / 2;
      }
      gemPuntAfstand = Math.sqrt(opp / Math.max(1, xs.length)) || 0.5;
      if (!detailStrook && origineelAantal) origPuntAfstand = Math.sqrt(opp / Math.max(1, origineelAantal));
    }
    const afstandTekst = gemPuntAfstand < 1
      ? `${Math.round(gemPuntAfstand * 100)} cm` : `${gemPuntAfstand.toFixed(1).replace('.', ',')} m`;

    statusEl.textContent =
      `${xs.length.toLocaleString('nl-NL')} punten${notitie} · gem. puntafstand ±${afstandTekst} · ${(delaunay.triangles.length / 3).toLocaleString('nl-NL')} driehoeken · ${duur} ms`;

    if (!behoud) {
      if (wolkB) { wolkB = null; toonWolkA = true; }
      resetAssen(null);
      dwarsZoom = { schaal: 1, panX: 0, panY: 0 };
      langsZoom = { schaal: 1, panX: 0, panY: 0 };
    }
    vlakLeeg.hidden = true;
    tekenAsKnop.disabled = false;
    { const k = document.getElementById('stationeringKnop'); if (k) k.disabled = false; }
    wisAsKnop.disabled = false;
    vulAsKeuze();
    luchtfotoKnop.disabled = false;
    bgtOphalenKnop.disabled = false;
    bgtBestandVeld.disabled = false;
    bomenOphalenKnop.disabled = false;
    boomBestandVeld.disabled = false;
    drieDKnop.disabled = false;
    printKnop.disabled = false;
    for (const id of ['nwbKnop', 'dxfKnop', 'gpkgKnop', 'ifcKnop', 'asInlezenKnop', 'omdraaiAsKnop', 'doorvaartKnop', 'snoeiKnop', 'kadasterOphalenKnop', 'kadasterBestand']) { const k = document.getElementById(id); if (k) k.disabled = false; }
    projectOpslaanKnop.disabled = false; projectOpslaanAlsKnop.disabled = false;
    bronBestandsnaam = naam;
    { const wn = document.getElementById('wolkBestandNaam'); if (wn) { wn.textContent = naam; wn.title = `Ingelezen puntenwolk: ${naam}`; } }
    werkWolkKeuzeBij();

    // Was er een project ingeladen vóórdat (of terwijl) deze puntenwolk werd
    // gekozen? Dan nu alsnog de bewaarde as/BGT/instellingen toepassen —
    // dat kon niet eerder, want daarvoor is een surface (hoogteOp) nodig.
    if (wachtendProject) {
      pasProjectToe(wachtendProject);
      wachtendProject = null;
    }

    if (!behoud) passVlakAan();
    tekenVlak();
    bijwerkenProfielen();
    if (drieDActief) bouwDrieDGeometrie(!behoud); // nieuw bestand terwijl 3D al openstond
    return true;
  }

  /* ────────────────────────────────────────────────────────────────
     Surface: driehoeken-incidentie + hoogte-bevraging
     ──────────────────────────────────────────────────────────────── */

  /** Voor elk punt: in welke driehoeken (index in delaunay.triangles/3) zit het. */
  /*  Compact (twee Int32Arrays): bij 10 miljoen punten scheelt een lijstje per punt
      zo'n gigabyte geheugen. Driehoeken van punt i: lijst[start[i] … start[i+1]). */
  function bouwIncidentie(delaunay, aantalPunten) {
    const tri = delaunay.triangles, nT = tri.length / 3;
    const start = new Int32Array(aantalPunten + 1);
    for (let j = 0; j < tri.length; j++) start[tri[j] + 1]++;
    for (let i = 0; i < aantalPunten; i++) start[i + 1] += start[i];
    const vul = start.slice(0, aantalPunten), lijst = new Int32Array(tri.length);
    for (let t = 0; t < nT; t++) { lijst[vul[tri[t * 3]]++] = t; lijst[vul[tri[t * 3 + 1]]++] = t; lijst[vul[tri[t * 3 + 2]]++] = t; }
    return { start, lijst };
  }
  /** Hulptabellen die d3-delaunay alleen tijdens het bouwen nodig heeft loslaten
   *  (± 24 bytes per punt; bij 10 miljoen punten ± 240 MB). */
  function lichtNet(dl) {
    const d = dl._delaunator;
    if (d) { d._hullPrev = d._hullNext = d._hullTri = d._hullHash = d._ids = d._dists = null; }
    return dl;
  }
  /** x,y-arrays → één Float64Array [x0,y0,x1,y1,…] voor d3.Delaunay (geen miljoenen losse [x,y]-paartjes). */
  function platteCoords(px, py) {
    const n = px.length, c = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) { c[i * 2] = px[i]; c[i * 2 + 1] = py[i]; }
    return c;
  }

  /** Barycentrische hoogte-interpolatie in driehoek (i0,i1,i2), of null als (x,y) erbuiten valt. */
  function baryHoogte(x, y, i0, i1, i2) {
    const x0 = xs[i0], y0 = ys[i0], x1 = xs[i1], y1 = ys[i1], x2 = xs[i2], y2 = ys[i2];
    const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(det) < 1e-9) return null;
    const w0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / det;
    const w1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / det;
    const w2 = 1 - w0 - w1;
    const marge = -1e-6;
    if (w0 < marge || w1 < marge || w2 < marge) return null;
    return w0 * zs[i0] + w1 * zs[i1] + w2 * zs[i2];
  }

  /**
   * Hoogte op (x,y) — net als TinSurface.FindElevationAtXY in Civil3D: zoek
   * het dichtstbijzijnde punt (d3-delaunay's find, gebruikt de Voronoi-
   * structuur), en probeer de paar driehoeken die daar al aan grenzen —
   * meestal 3-8 stuks, dus goedkoop, ook bij duizenden bevragingen.
   */
  /** Driehoek van het net waar (x,y) in ligt: eerst de driehoeken aan het dichtstbijzijnde
   *  punt i0, en anders die aan de buren van i0. (Het dichtstbijzijnde punt is niet altijd
   *  een hoekpunt van de driehoek eromheen — bij ± 2% van de bevragingen. Toen gaf de viewer
   *  daar géén hoogte: een gaatje in het profiel en een piek in de as in 3D.)
   *  → [t, w0, w1, w2] of null (buiten het net). */
  const zoekBuf = [0, 0, 0, 0];
  function zoekDriehoek(dl, inc, X, Y, i0, x, y) {
    const T = dl.triangles;
    const probeer = (i) => {
      for (let q = inc.start[i], qe = inc.start[i + 1]; q < qe; q++) {
        const t = inc.lijst[q];
        const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
        const x0 = X[a], y0 = Y[a], x1 = X[b], y1 = Y[b], x2 = X[c], y2 = Y[c];
        const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
        if (Math.abs(det) < 1e-12) continue;
        const w0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / det;
        const w1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / det;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        zoekBuf[0] = t; zoekBuf[1] = w0; zoekBuf[2] = w1; zoekBuf[3] = w2;
        return true;
      }
      return false;
    };
    if (probeer(i0)) return zoekBuf;
    for (const j of dl.neighbors(i0)) if (probeer(j)) return zoekBuf;
    return null;
  }

  /** Hoogte op (x,y) in een andere wolk {xs,ys,zs,delaunay,incident}. */
  function hoogteOpWolk(w, x, y) {
    if (!w || !w.delaunay) return null;
    // zoeken vanaf het vorige gevonden punt: opvolgende vragen liggen vlak bij elkaar (zonder hint loopt find elke keer vanaf punt 0 door het hele net)
    const i0 = w.delaunay.find(x, y, w.delaunay._hint || 0); w.delaunay._hint = i0;
    const r = zoekDriehoek(w.delaunay, w.incident, w.xs, w.ys, i0, x, y);
    if (!r) return null;
    const T = w.delaunay.triangles, t = r[0], a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    // niet over een groot gat heen interpoleren (bv. AHN zonder punten op water)
    if (w.maxZijde) {
      const l = Math.max(Math.hypot(w.xs[b] - w.xs[a], w.ys[b] - w.ys[a]), Math.hypot(w.xs[c] - w.xs[b], w.ys[c] - w.ys[b]), Math.hypot(w.xs[a] - w.xs[c], w.ys[a] - w.ys[c]));
      if (l > w.maxZijde) return null;
    }
    return r[1] * w.zs[a] + r[2] * w.zs[b] + r[3] * w.zs[c];
  }
  const hoogteOpB = (x, y) => hoogteOpWolk(wolkB, x, y);
  // alleen voor de automatische tests
  window.__pvTest = { naarScherm: (x, y) => wereldNaarScherm(x, y), dwars: () => { const r = berekenDwarsprofiel(dwarsStations[huidigeStationIndex]); return [r[0]?.offset, r[r.length - 1]?.offset, r.length, volleProfielenGeldig()]; }, detailVakken: () => detailCache.size, percelen: () => percelen.length, bgt: () => bgtLagen.length, hoogteOp: (x, y) => hoogteOp(x, y), puntOpStationOffset: (s, o) => puntOpStationOffset(s, o), lengte: () => { const s = stationsLangsAs(); return s[s.length - 1]; } };

  function hoogteOp(x, y) {
    if (!delaunay) return null;
    const i0 = delaunay.find(x, y, delaunay._hint || 0); delaunay._hint = i0;
    const r = zoekDriehoek(delaunay, incident, xs, ys, i0, x, y);
    if (!r) return null; // buiten het net (bv. net over de rand van de puntenwolk)
    const T = delaunay.triangles, t = r[0];
    return r[1] * zs[T[t * 3]] + r[2] * zs[T[t * 3 + 1]] + r[3] * zs[T[t * 3 + 2]];
  }

  /* ────────────────────────────────────────────────────────────────
     De as: stationing, punt-op-station, punt-op-station+offset
     ──────────────────────────────────────────────────────────────── */

  function stationsLangsAs() {
    const s = [0];
    for (let i = 1; i < asPunten.length; i++) {
      const dx = asPunten[i].x - asPunten[i - 1].x, dy = asPunten[i].y - asPunten[i - 1].y;
      s.push(s[i - 1] + Math.hypot(dx, dy));
    }
    return s;
  }

  /** {x,y,richting} op een gegeven station (afstand vanaf het begin van de as). */
  function puntOpStation(station) {
    const s = stationsLangsAs();
    const totaal = s[s.length - 1];
    const st = Math.min(Math.max(station, 0), totaal);

    for (let i = 1; i < asPunten.length; i++) {
      if (st <= s[i] + 1e-9) {
        const segLen = s[i] - s[i - 1];
        const t = segLen > 1e-9 ? (st - s[i - 1]) / segLen : 0;
        const dx = asPunten[i].x - asPunten[i - 1].x, dy = asPunten[i].y - asPunten[i - 1].y;
        let richting = Math.atan2(dy, dx);
        // precies op een knikpunt van de as: de bissectrice van beide delen, zodat
        // het profiel daar niet scheef op één van de twee rechte stukken staat
        if (i < asPunten.length - 1 && Math.abs(st - s[i]) < 1e-6) {
          const r2 = Math.atan2(asPunten[i + 1].y - asPunten[i].y, asPunten[i + 1].x - asPunten[i].x);
          richting = Math.atan2(Math.sin(richting) + Math.sin(r2), Math.cos(richting) + Math.cos(r2));
        }
        return {
          x: asPunten[i - 1].x + dx * t,
          y: asPunten[i - 1].y + dy * t,
          richting,
        };
      }
    }
    const laatste = asPunten[asPunten.length - 1];
    return { x: laatste.x, y: laatste.y, richting: 0 };
  }

  /** Punt op (station, offset) — offset positief = rechts van de looprichting. */
  function puntOpStationOffset(station, offset) {
    const p = puntOpStation(station);
    const nx = Math.sin(p.richting), ny = -Math.cos(p.richting); // rechts-loodrecht
    return { x: p.x + nx * offset, y: p.y + ny * offset };
  }

  /** Omgekeerde van puntOpStationOffset: projecteert een willekeurig
   *  wereldpunt (bv. een boom) op de as en geeft het dichtstbijzijnde
   *  station + het ondertekende loodrechte offset (rechts = positief,
   *  dezelfde conventie als de kijkrichting op de as). */
  function stationOffsetVanPunt(x, y) {
    if (asPunten.length < 2) return null;
    const s = stationsLangsAs();
    let beste = null;
    for (let i = 1; i < asPunten.length; i++) {
      const p0 = asPunten[i - 1], p1 = asPunten[i];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((x - p0.x) * dx + (y - p0.y) * dy) / (segLen * segLen)));
      const projX = p0.x + dx * t, projY = p0.y + dy * t;
      const afstand = Math.hypot(x - projX, y - projY);
      if (!beste || afstand < beste.afstand) {
        const richting = Math.atan2(dy, dx);
        const nx = Math.sin(richting), ny = -Math.cos(richting);
        beste = {
          station: s[i - 1] + t * segLen,
          offset: (x - projX) * nx + (y - projY) * ny,
          afstand,
        };
      }
    }
    return beste;
  }

  /* ────────────────────────────────────────────────────────────────
     Lengte- en dwarsprofiel afleiden
     ──────────────────────────────────────────────────────────────── */

  /* ── meerdere assen ── */
  function bewaarActieveAs() { if (assen[actieveAs]) assen[actieveAs].punten = asPunten; }
  function nieuweAsNaam() {
    let n = assen.length + 1;
    while (assen.some(a => a.naam === `As ${n}`)) n++;
    return `As ${n}`;
  }
  function vulAsKeuze() {
    const sel = document.getElementById('asKeuze');
    if (!sel) return;
    sel.innerHTML = '';
    assen.forEach((a, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = a.punten.length >= 2 ? a.naam : `${a.naam} (leeg)`;
      sel.append(o);
    });
    sel.value = String(actieveAs);
    sel.disabled = !xs;
    const nk = document.getElementById('nieuweAsKnop'); if (nk) nk.disabled = !xs;
    const hk = document.getElementById('hernoemAsKnop'); if (hk) hk.disabled = !xs;
    wisAsKnop.textContent = assen.length > 1 ? 'Verwijder as' : 'Wis as';
  }
  /** Maakt as `i` de actieve as. `stil` = zonder zoom te resetten (voor de PDF). */
  function zetActieveAs(i, stil = false) {
    bewaarActieveAs();
    actieveAs = Math.max(0, Math.min(assen.length - 1, i));
    asPunten = assen[actieveAs].punten;
    huidigeStationIndex = 0;
    if (!stil) {
      dwarsZoom = { schaal: 1, panX: 0, panY: 0 };
      langsZoom = { schaal: 1, panX: 0, panY: 0 };
    }
    bijwerkenProfielen();
    if (!stil) { tekenVlak(); vulAsKeuze(); }
  }
  function zetTekenModus(aan) {
    tekenModus = aan;
    tekenAsKnop.classList.toggle('aan', aan);
    tekenAsKnop.textContent = aan ? 'Klaar met tekenen' : 'Teken as';
    canvasVlak.classList.toggle('pannen', false);
    canvasVlak.classList.remove('puntGrijp');
    asSleepPunt = -1; asHoverPunt = -1;
    if (aan) statusEl.textContent = 'As tekenen: klik = punt toevoegen · sleep een punt (ook begin of eind) om het te verplaatsen · rechtermuisknop op een punt = verwijderen · Backspace = laatste punt weg · daarna "Klaar met tekenen".';
    if (typeof tekenVlak === 'function' && xs) tekenVlak();
  }
  /** Index van het as-punt onder de muis (binnen 10 px), of -1. */
  function asPuntBijScherm(sx, sy) {
    let beste = -1, besteD = 10;
    asPunten.forEach((p, i) => {
      const [px, py] = wereldNaarScherm(p.x, p.y);
      const d = Math.hypot(px - sx, py - sy);
      if (d <= besteD) { besteD = d; beste = i; }
    });
    return beste;
  }
  function resetAssen(lijst, actief = 0) {
    assen = lijst && lijst.length ? lijst : [{ naam: 'As 1', punten: [] }];
    actieveAs = Math.max(0, Math.min(assen.length - 1, actief));
    asPunten = assen[actieveAs].punten;
    vulAsKeuze();
  }
  /** Lijnstukken van álle assen (voor de detailstrook). */
  function alleAsStukken() {
    const uit = [];
    for (const a of assen) for (let i = 1; i < a.punten.length; i++) {
      uit.push({ ax: a.punten[i - 1].x, ay: a.punten[i - 1].y, bx: a.punten[i].x, by: a.punten[i].y, s0: 0 });
    }
    return uit;
  }

  function bijwerkenProfielen() {
    bijwerkenProfielenBinnen();
    planVolleProfielen();
  }
  /* Met een puntenwolk in vakken komen de profielen vanzelf uit álle punten: na elke
     wijziging van de as of de profielinstellingen (even wachten tot je klaar bent met
     slepen) worden alleen de vakken langs de as opnieuw gelezen — een paar seconden. */
  let volleTimer = null, volleHandmatigUit = false;
  function planVolleProfielen() {
    clearTimeout(volleTimer);
    if (!laatsteBestand?.tegelbron || volleHandmatigUit || asPunten.length < 2 || !dwarsStations.length) return;
    if (volleProfielenGeldig()) return;
    volleTimer = setTimeout(async () => {
      if (tekenModus || volleBezig || volleProfielenGeldig()) { if (!volleProfielenGeldig()) planVolleProfielen(); return; }
      await maakVolleProfielen();
    }, 900);
  }
  function bijwerkenProfielenBinnen() {
    if (asPunten.length < 2) {
      langsprofiel = [];
      dwarsStations = [];
      tekenLangs();
      tekenDwars();
      return;
    }

    const stapLangs = Math.max(0.1, Number(stapLangsVeld.value) || 1);
    const s = stationsLangsAs();
    const totaal = s[s.length - 1];

    langsprofiel = [];
    if (volleProfielenGeldig() && volleProfielen.langs.length >= 2) {
      langsprofiel = volleProfielen.langs;
    } else for (let st = 0; st <= totaal + 1e-9; st += stapLangs) {
      const p = puntOpStation(st);
      langsprofiel.push({ station: st, hoogte: profielHoogte(p.x, p.y) });
    }
    if (!volleProfielenGeldig() && langsprofiel[langsprofiel.length - 1]?.station < totaal - 1e-6) {
      const p = puntOpStation(totaal);
      langsprofiel.push({ station: totaal, hoogte: profielHoogte(p.x, p.y) });
    }

    if (wolkB) {
      // lengteprofiel van wolk B op dezelfde stations (bij "alle punten" ook op die stations)
      for (const p of langsprofiel) { const q = puntOpStation(p.station); p.hoogteB = hoogteOpB(q.x, q.y); }
    }
    vulBrugHoogtes(langsprofiel, (p) => puntOpStation(p.station));
    const interval = Math.max(0.5, Number(dwarsIntervalVeld.value) || 5);
    dwarsStations = berekenDwarsStations(totaal, interval);
    huidigeStationIndex = Math.min(huidigeStationIndex, dwarsStations.length - 1);

    langsLeeg.hidden = true;
    dwarsLeeg.hidden = dwarsStations.length === 0;
    vorigeStationKnop.disabled = dwarsStations.length < 2;
    volgendeStationKnop.disabled = dwarsStations.length < 2;

    werkDetailKnopBij();
    werkPaalPaneelBij();
    tekenLangs();
    tekenDwarsVoorHuidigeStation();
  }

  /** Korte, leesbare namen voor BGT-lagen in de profielen. */
  const BGT_KORT = {
    onbegroeidterreindeel: 'onbegroeid terrein', begroeidterreindeel: 'begroeid terrein',
    ondersteunendwegdeel: 'berm', ondersteunendwaterdeel: 'oever',
    wegdeel: 'weg', waterdeel: 'water', pand: 'pand', overigbouwwerk: 'bouwwerk', kunstwerkdeel_vlak: 'kunstwerk',
  };
  const BGT_TREFWOORDEN = ['onbegroeidterreindeel', 'begroeidterreindeel', 'ondersteunendwegdeel', 'ondersteunendwaterdeel', 'overigbouwwerk', 'wegdeel', 'waterdeel', 'pand'];
  const bgtKort = (l) => {
    if (BGT_KORT[l]) return BGT_KORT[l];
    const s = String(l || '');
    if (/kruinlijn/i.test(s)) return 'kruinlijn';
    const klein = s.toLowerCase().replace(/[^a-z]/g, '');
    for (const w of BGT_TREFWOORDEN) if (klein.includes(w)) return BGT_KORT[w];
    return s.replace(/_lijn$/, '').replace(/_/g, ' ').toLowerCase();
  };

  /** Waar snijdt de dwarsprofiellijn de BGT? Exact: snijpunten van de
   *  profiellijn met de randen van alle BGT-vlakken en BGT-lijnen.
   *  → { grenzen: [{offset, soort: 'vlak'|'lijn', naam}], stroken: [{van, tot, label}] } */
  function bgtDoorsnede(station, pL, pR) {
    const breedte = pL + pR;
    if (!bgtLagen.length) return null;
    const L = puntOpStationOffset(station, -pL), R = puntOpStationOffset(station, pR);
    const dx = R.x - L.x, dy = R.y - L.y;
    const minX = Math.min(L.x, R.x), maxX = Math.max(L.x, R.x), minY = Math.min(L.y, R.y), maxY = Math.max(L.y, R.y);
    const grenzen = [];
    for (const laag of bgtLagen) {
      if (laag.puntAlleen) continue;
      for (const ring of laag.ringen) {
        for (let i = 1; i < ring.length; i++) {
          const a = ring[i - 1], b = ring[i];
          if (Math.max(a.x, b.x) < minX || Math.min(a.x, b.x) > maxX || Math.max(a.y, b.y) < minY || Math.min(a.y, b.y) > maxY) continue;
          const ex = b.x - a.x, ey = b.y - a.y;
          const noemer = dx * ey - dy * ex;
          if (Math.abs(noemer) < 1e-12) continue;
          const t = ((a.x - L.x) * ey - (a.y - L.y) * ex) / noemer;   // langs de profiellijn
          const u = ((a.x - L.x) * dy - (a.y - L.y) * dx) / noemer;   // langs de BGT-rand
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          grenzen.push({ offset: -pL + t * breedte, soort: laag.lijnAlleen ? 'lijn' : 'vlak', naam: laag.label || laag.stijl?.naam, bron: laag.bron });
        }
      }
    }
    grenzen.sort((p, q) => p.offset - q.offset);
    // dubbele randen (twee aangrenzende vlakken delen dezelfde rand) samenvoegen
    const uniek = [];
    for (const g of grenzen) {
      const vorige = uniek[uniek.length - 1];
      if (vorige && Math.abs(vorige.offset - g.offset) < 0.02 && vorige.soort === g.soort) continue;
      uniek.push(g);
    }
    // stroken: tussen twee opeenvolgende vlakgrenzen het vlak in het midden
    const metNamen = bgtLagen.some(l => l.centroide);
    const randen = [-pL, ...uniek.filter(g => g.soort === 'vlak' || metNamen).map(g => g.offset), pR];
    const stroken = [];
    for (let i = 1; i < randen.length; i++) {
      const van = randen[i - 1], tot = randen[i];
      if (tot - van < 0.01) continue;
      const m = puntOpStationOffset(station, (van + tot) / 2);
      const label = bgtLabelOp(m.x, m.y) || (metNamen ? centroideLabelOp(m.x, m.y) : null);
      const vorige = stroken[stroken.length - 1];
      if (vorige && vorige.label === label) vorige.tot = tot; else stroken.push({ van, tot, label });
    }
    return { grenzen: uniek, stroken: stroken.filter(s => s.label) };
  }

  function berekenDwarsprofiel(station) {
    const reeks = berekenDwarsprofielReeks(station);
    if (wolkB) for (const p of reeks) { const q = puntOpStationOffset(station, p.offset); p.hoogteB = hoogteOpB(q.x, q.y); }
    vulBrugHoogtes(reeks, (p) => puntOpStationOffset(station, p.offset));
    reeks.bgt = bgtDoorsnede(station, profielL(), profielR());
    reeks.station = station;
    return reeks;
  }

  function berekenDwarsprofielReeks(station) {
    if (volleProfielenGeldig() && volleProfielen.dwars.has(station)) return volleProfielen.dwars.get(station).slice();
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const stap = 0.25;
    const uit = [];
    for (let o = -pL; o <= pR + 1e-9; o += stap) {
      const p = puntOpStationOffset(station, o);
      uit.push({ offset: o, hoogte: profielHoogte(p.x, p.y, o), bgtLabel: null });
    }
    return uit;
  }

  /* ────────────────────────────────────────────────────────────────
     Bovenaanzicht: puntenwolk + as tekenen, zoomen/pannen
     ──────────────────────────────────────────────────────────────── */

  function grenzen() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < xs.length; i++) {
      if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i];
      if (ys[i] < minY) minY = ys[i]; if (ys[i] > maxY) maxY = ys[i];
    }
    return { minX, maxX, minY, maxY };
  }

  /** Grenzen zonder losse uitschieters: van een steekproef het 0,2%- en
   *  99,8%-punt in x en y. Een paar foute punten kilometers verderop maken
   *  het beeld anders zo groot dat het eigenlijke model een stipje wordt. */
  function robuusteGrenzen() {
    const n = xs.length, stap = Math.max(1, Math.floor(n / 50000));
    const sx = [], sy = [];
    for (let i = 0; i < n; i += stap) { sx.push(xs[i]); sy.push(ys[i]); }
    sx.sort((a, b) => a - b); sy.sort((a, b) => a - b);
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
    const r = { minX: q(sx, 0.002), maxX: q(sx, 0.998), minY: q(sy, 0.002), maxY: q(sy, 0.998) };
    const vol = grenzen();
    // weinig uitschieters? dan gewoon de volle grenzen (niets afsnijden)
    const breedR = (r.maxX - r.minX) * (r.maxY - r.minY), breedV = (vol.maxX - vol.minX) * (vol.maxY - vol.minY);
    if (!(breedR > 0) || breedR > breedV * 0.6) return vol;
    const mx = (r.maxX - r.minX) * 0.03, my = (r.maxY - r.minY) * 0.03;
    return { minX: r.minX - mx, maxX: r.maxX + mx, minY: r.minY - my, maxY: r.maxY + my };
  }

  /** Zet de zoom zo dat de hele puntenwolk past (zonder losse uitschieters). */
  function passVlakAan() {
    const b = robuusteGrenzen();
    const breed = canvasVlak.clientWidth || 600, hoog = canvasVlak.clientHeight || 400;
    const marge = 0.92;
    const sx = (breed * marge) / Math.max(1e-6, b.maxX - b.minX);
    const sy = (hoog * marge) / Math.max(1e-6, b.maxY - b.minY);
    schaal = Math.min(sx, sy);
    const midX = (b.minX + b.maxX) / 2, midY = (b.minY + b.maxY) / 2;
    panX = breed / 2 - midX * schaal;
    panY = hoog / 2 + midY * schaal; // y-as van scherm loopt andersom dan wereld-y
  }

  function wereldNaarScherm(x, y) {
    return [x * schaal + panX, -y * schaal + panY];
  }
  function schermNaarWereld(px, py) {
    return { x: (px - panX) / schaal, y: -(py - panY) / schaal };
  }

  /** Kleuren van de puntenwolk instellen (null = bestand heeft geen RGB). */
  function zetKleuren(nieuweCs) {
    cs = nieuweCs && nieuweCs.length === xs.length ? nieuweCs : null;
    // echte kleur standaard als die er is, tenzij de gebruiker eerder 'hoogte' koos
    kleurModus = cs ? (kleurVoorkeur || 'rgb') : 'hoogte';
    werkKleurKeuzeBij();
  }
  function werkKleurKeuzeBij() {
    const veld = document.getElementById('kleurModus');
    if (!veld) return;
    veld.disabled = !xs;
    veld.querySelector('option[value="rgb"]').disabled = !cs;
    veld.value = kleurModus;
    veld.title = cs ? 'Kleur van de puntenwolk: hoogte (blauw = laag, goud = hoog) of de echte RGB-kleur uit de inmeting'
                    : 'Dit bestand bevat geen RGB-kleuren; de punten worden op hoogte gekleurd';
  }
  /** Css-kleur van punt i in de gekozen kleurmodus. */
  function kleurVoorPunt(i) {
    return kleurModus === 'rgb' && cs ? '#' + cs[i].toString(16).padStart(6, '0') : kleurVoorHoogte(zs[i]);
  }
  /* Snel tekenen van de puntenwolk: elk punt als blokje rechtstreeks in een
     pixelbuffer (ImageData) in plaats van een fillRect per punt. Bij miljoenen
     punten scheelt dat seconden per keer tekenen. De kleuren worden één keer
     als 32-bits getal klaargezet. */
  let puntKleurCache = null;
  function puntKleurenU32() {
    const sleutel = [xs, cs, kleurModus, zMin, zMax];
    if (puntKleurCache && puntKleurCache.sleutel.every((v, i) => v === sleutel[i])) return puntKleurCache.u;
    const n = xs.length, u = new Uint32Array(n);
    if (kleurModus === 'rgb' && cs) {
      for (let i = 0; i < n; i++) { const c = cs[i]; u[i] = 0xFF000000 | ((c & 255) << 16) | (c & 0xFF00) | ((c >> 16) & 255); }
    } else {
      const laag = [30, 127, 166], hoog = [169, 120, 31], bereik = Math.max(1e-6, zMax - zMin);
      for (let i = 0; i < n; i++) {
        const t = Math.max(0, Math.min(1, (zs[i] - zMin) / bereik));
        const r = Math.round(laag[0] + (hoog[0] - laag[0]) * t), g = Math.round(laag[1] + (hoog[1] - laag[1]) * t), b = Math.round(laag[2] + (hoog[2] - laag[2]) * t);
        u[i] = 0xFF000000 | (b << 16) | (g << 8) | r;
      }
    }
    puntKleurCache = { sleutel, u };
    return u;
  }
  /** Puntenwolk als beeld van w×h pixels; pixel = (x·sx + ox, y·sy + oy), blokje van `stip` px. */
  function rasterPunten(w, h, sx, ox, sy, oy, stip, extra = null) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const beeld = g.createImageData(w, h), pix = new Uint32Array(beeld.data.buffer);
    blokjesInPix(pix, w, h, xs, ys, puntKleurenU32(), xs.length, sx, ox, sy, oy, stip);
    if (extra) extra(pix, w, h);
    g.putImageData(beeld, 0, 0);
    return c;
  }
  function blokjesInPix(pix, w, h, X, Y, kleur, n, sx, ox, sy, oy, stip) {
    const d = Math.max(1, Math.round(stip)), half = Math.floor(d / 2);
    for (let i = 0; i < n; i++) {
      const px = Math.round(X[i] * sx + ox) - half, py = Math.round(Y[i] * sy + oy) - half;
      if (px + d <= 0 || py + d <= 0 || px >= w || py >= h) continue;
      const k = kleur[i];
      if (d === 1) { pix[py * w + px] = k; continue; }
      const x0 = px < 0 ? 0 : px, x1 = px + d > w ? w : px + d, y0 = py < 0 ? 0 : py, y1 = py + d > h ? h : py + d;
      for (let yy = y0; yy < y1; yy++) { const rij = yy * w; for (let xx = x0; xx < x1; xx++) pix[rij + xx] = k; }
    }
  }

  /* Bij inzoomen: de volle vakken (alle punten) van wat in beeld is over de
     werkwolk heen tekenen. Ingelezen vakken blijven in een cache (± 8 miljoen
     punten); ver uitgezoomd (meer dan 16 vakken in beeld) blijft het bij de werkwolk. */
  const detailCache = new Map();    // 'tx_ty' → { X, Y, Z, C, K, n, gebruikt }
  let detailSleutel = '', detailVersie = 0, detailBezig = false;
  // Volle vakken pas tonen als er niet te veel punten in beeld zijn (anders blijft het bij het
  // overzicht). Het geheugen houdt ruim meer vast dan er in beeld kan, en wat in beeld is wordt
  // nooit weggegooid — anders gaan vakken om en om laden en weer weg (knipperen).
  const DETAIL_MAX_VAKKEN = 64, DETAIL_MAX_PUNTEN = 10000000, DETAIL_BUDGET = 16000000;
  let detailTeVeel = 0;   // aantal punten in beeld als dat te veel is voor de volle vakken
  function zichtbareVakken() {
    const bron = laatsteBestand;
    if (!bron?.tegelbron) return null;
    const sl = `${bron.map?.name}|${bron.info.gemaakt}|${maaiveldAActief}`;
    if (sl !== detailSleutel) { detailCache.clear(); detailSleutel = sl; detailVersie++; }
    const T = bron.info.tegelM;
    const a = schermNaarWereld(0, 0), b = schermNaarWereld(canvasVlak.clientWidth, canvasVlak.clientHeight);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const lijst = bron.info.tegels.filter(([tx, ty]) => !(tx * T > x1 || (tx + 1) * T < x0 || ty * T > y1 || (ty + 1) * T < y0));
    const punten = lijst.reduce((a, t) => a + t[2], 0);
    detailTeVeel = lijst.length && (lijst.length > DETAIL_MAX_VAKKEN || punten > DETAIL_MAX_PUNTEN) ? punten : 0;
    return lijst.length && !detailTeVeel ? lijst : null;
  }
  async function laadDetailVakken(lijst) {
    if (detailBezig) return;
    detailBezig = true;
    const bron = laatsteBestand, sl = detailSleutel;
    try {
      const tm = await bron.tegelMap();
      for (const [tx, ty, n] of lijst) {
        const k = `${tx}_${ty}`;
        if (detailCache.has(k)) continue;
        const buf = await (await (await tm.getFileHandle(tegelNaam(tx, ty))).getFile()).arrayBuffer();
        if (sl !== detailSleutel) return;
        const dv = new DataView(buf), m = Math.floor(buf.byteLength / TEGEL_REC), [ox, oy] = bron.info.oorsprong;
        const X = new Float64Array(m), Y = new Float64Array(m), Z = new Float32Array(m), C = new Uint32Array(m);
        const T = bron.info.tegelM, bezet = new Uint8Array(T * T);   // welke m² van het vak bevatten punten (voor de dichtheid)
        let j = 0;
        for (let i = 0; i < m; i++) {
          const o = i * TEGEL_REC;
          if (maaiveldAActief && dv.getUint8(o + 12) !== 2) continue;
          X[j] = ox + dv.getInt32(o, true) / 1000; Y[j] = oy + dv.getInt32(o + 4, true) / 1000; Z[j] = dv.getInt32(o + 8, true) / 1000;
          C[j] = (dv.getUint8(o + 13) << 16) | (dv.getUint8(o + 14) << 8) | dv.getUint8(o + 15);
          const bi = Math.min(T - 1, Math.max(0, Math.floor(X[j] - tx * T))), bj = Math.min(T - 1, Math.max(0, Math.floor(Y[j] - ty * T)));
          bezet[bi * T + bj] = 1;
          j++;
        }
        let opp = 0; for (let q = 0; q < bezet.length; q++) opp += bezet[q];
        detailCache.set(k, { X, Y, Z, C, n: j, gebruikt: performance.now(), afstand: Math.sqrt(Math.max(1, opp) / Math.max(1, j)), opp });
        // budget: de langst niet gebruikte vakken eruit
        let totaal = 0; for (const v of detailCache.values()) totaal += v.n;
        if (totaal > DETAIL_BUDGET) {
          const inBeeld = new Set((zichtbareVakken() || []).map(([a, b]) => `${a}_${b}`));
          const oud = [...detailCache.entries()].filter(([sl]) => !inBeeld.has(sl)).sort((p, q) => p[1].gebruikt - q[1].gebruikt);
          while (totaal > DETAIL_BUDGET && oud.length) { const [ok, ov] = oud.shift(); totaal -= ov.n; detailCache.delete(ok); }
        }
        detailVersie++;
        tekenVlak();
        await new Promise(r => setTimeout(r, 0));
      }
    } catch (err) { console.warn('vakken voor het bovenaanzicht laden mislukt:', err); }
    finally { detailBezig = false; }
    const nu = zichtbareVakken();
    if (nu && nu.some(([tx, ty]) => !detailCache.has(`${tx}_${ty}`))) laadDetailVakken(nu);
  }
  function detailKleuren(v) {
    if (v.kleur && v.kleur.modus === kleurModus && v.kleur.zMin === zMin && v.kleur.zMax === zMax) return v.kleur.u;
    const u = new Uint32Array(v.n);
    if (kleurModus === 'rgb' && laatsteBestand.info.kleur) {
      for (let i = 0; i < v.n; i++) { const c = v.C[i]; u[i] = 0xFF000000 | ((c & 255) << 16) | (c & 0xFF00) | ((c >> 16) & 255); }
    } else {
      const laag = [30, 127, 166], hoog = [169, 120, 31], bereik = Math.max(1e-6, zMax - zMin);
      for (let i = 0; i < v.n; i++) {
        const t = Math.max(0, Math.min(1, (v.Z[i] - zMin) / bereik));
        u[i] = 0xFF000000 | (Math.round(laag[2] + (hoog[2] - laag[2]) * t) << 16) | (Math.round(laag[1] + (hoog[1] - laag[1]) * t) << 8) | Math.round(laag[0] + (hoog[0] - laag[0]) * t);
      }
    }
    v.kleur = { modus: kleurModus, zMin, zMax, u };
    return u;
  }
  // de puntenlaag van het bovenaanzicht bewaren zolang beeld en wolk gelijk blijven (bv. tijdens het tekenen van een as)
  let vlakPuntenLaag = null;
  /** Kleuren van alle punten als Float32Array (r,g,b per punt, 0–1), voor 3D. */
  function puntKleurenF32() {
    const n = xs.length, uit = new Float32Array(n * 3);
    if (kleurModus === 'rgb' && cs) {
      for (let i = 0; i < n; i++) {
        const c = cs[i];
        uit[i * 3] = ((c >> 16) & 255) / 255; uit[i * 3 + 1] = ((c >> 8) & 255) / 255; uit[i * 3 + 2] = (c & 255) / 255;
      }
    } else {
      const laag = [30, 127, 166], hoog = [169, 120, 31], bereik = Math.max(1e-6, zMax - zMin);
      for (let i = 0; i < n; i++) {
        const t = Math.max(0, Math.min(1, (zs[i] - zMin) / bereik));
        for (let k = 0; k < 3; k++) uit[i * 3 + k] = Math.round(laag[k] + (hoog[k] - laag[k]) * t) / 255;
      }
    }
    return uit;
  }

  function kleurVoorHoogte(h) {
    const t = Math.max(0, Math.min(1, (h - zMin) / Math.max(1e-6, zMax - zMin)));
    // laag = teal, hoog = goud — dezelfde geest als de rest van de Lutrea-tools
    const laag = [30, 127, 166], hoog = [169, 120, 31];
    const r = Math.round(laag[0] + (hoog[0] - laag[0]) * t);
    const g = Math.round(laag[1] + (hoog[1] - laag[1]) * t);
    const b = Math.round(laag[2] + (hoog[2] - laag[2]) * t);
    return `rgb(${r},${g},${b})`;
  }

  function pasCanvasGrootteAan(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    return dpr;
  }

  function tekenVlak() {
    if (!xs) return;
    const dpr = pasCanvasGrootteAan(canvasVlak);
    ctxVlak.save();
    ctxVlak.scale(dpr, dpr);
    ctxVlak.clearRect(0, 0, canvasVlak.clientWidth, canvasVlak.clientHeight);
    ctxVlak.fillStyle = '#F3F5F6';
    ctxVlak.fillRect(0, 0, canvasVlak.clientWidth, canvasVlak.clientHeight);

    if (luchtfotoAan) tekenLuchtfoto();

    // puntenwolk — met luchtfoto eronder maken we 'm halfdoorzichtig zodat de foto blijft doorschemeren
    ctxVlak.globalAlpha = luchtfotoAan ? 0.55 : 1;
    // stipgrootte groeit mee met het zoomniveau, zodat de wolk bij inzoomen
    // een gesloten vlak blijft in plaats van losse puntjes
    const stip = Math.max(2, Math.min(16, gemPuntAfstand * schaal * 1.08));
    {
      const w = canvasVlak.width, h = canvasVlak.height;
      const vakken = zichtbareVakken();
      const geladen = vakken ? vakken.map(([tx, ty]) => detailCache.get(`${tx}_${ty}`)).filter(Boolean) : [];
      if (vakken && geladen.length < vakken.length) laadDetailVakken(vakken);
      vlakDetailStand = { vakken: vakken ? vakken.length : 0, geladen: geladen.length, punten: geladen.reduce((a, v) => a + v.n, 0),
        afstand: geladen.length ? Math.sqrt(geladen.reduce((a, v) => a + (v.opp || 0), 0) / Math.max(1, geladen.reduce((a, v) => a + v.n, 0))) : 0 };
      const sleutel = [xs, cs, kleurModus, zMin, zMax, schaal, panX, panY, w, h, dpr, stip, geladen.length ? detailVersie : 0];
      if (!vlakPuntenLaag || !vlakPuntenLaag.sleutel.every((v, i) => v === sleutel[i])) {
        const extra = geladen.length ? (pix, pw, ph) => {
          for (const v of geladen) {
            v.gebruikt = performance.now();
            const d = Math.max(1, Math.min(16, v.afstand * schaal * 1.08)) * dpr;
            blokjesInPix(pix, pw, ph, v.X, v.Y, detailKleuren(v), v.n, schaal * dpr, panX * dpr, -schaal * dpr, panY * dpr, d);
          }
        } : null;
        vlakPuntenLaag = { sleutel, beeld: rasterPunten(w, h, schaal * dpr, panX * dpr, -schaal * dpr, panY * dpr, stip * dpr, extra) };
      }
      ctxVlak.drawImage(vlakPuntenLaag.beeld, 0, 0, canvasVlak.clientWidth, canvasVlak.clientHeight);
      tekenVakkenRaster(vakken);
    }
    ctxVlak.globalAlpha = 1;

    // BGT / bomen / kadaster: los aan en uit te zetten (alleen de weergave; de gegevens blijven)
    const toon = (id, heeft) => { const v = document.getElementById(id); if (v) { if (heeft && v.disabled) v.checked = true; v.disabled = !heeft; } return heeft && (!v || v.checked); };   // net geladen → aan
    if (toon('toonBgt', bgtLagen.length > 0)) tekenBgt();
    if (toon('toonBomen', boomLagen.length > 0)) tekenBomen();
    if (brugOnder || brugBoven || dvResultaat) tekenDoorvaartOpVlak();
    if (toon('toonKadaster', percelen.length > 0)) tekenPercelenOpCanvas(ctxVlak, wereldNaarScherm, { w: canvasVlak.clientWidth, h: canvasVlak.clientHeight });
    if (snResultaat && snoei.tonen) tekenSnoeiOpCanvas(ctxVlak, wereldNaarScherm, { w: canvasVlak.clientWidth, h: canvasVlak.clientHeight, pxPerM: schaal });
    tekenPalenOpCanvas(ctxVlak, wereldNaarScherm, { w: canvasVlak.clientWidth, h: canvasVlak.clientHeight });

    // overige assen: grijs, met naam bij het beginpunt (klik erop om te kiezen)
    assen.forEach((a, ai) => {
      if (ai === actieveAs || a.punten.length < 1) return;
      ctxVlak.beginPath();
      a.punten.forEach((p, i) => {
        const [px, py] = wereldNaarScherm(p.x, p.y);
        if (i === 0) ctxVlak.moveTo(px, py); else ctxVlak.lineTo(px, py);
      });
      ctxVlak.lineJoin = 'round';
      ctxVlak.strokeStyle = 'rgba(255,255,255,0.8)'; ctxVlak.lineWidth = 4; ctxVlak.stroke();
      ctxVlak.strokeStyle = '#7A8896'; ctxVlak.lineWidth = 2; ctxVlak.setLineDash([7, 4]); ctxVlak.stroke(); ctxVlak.setLineDash([]);
      const [lx, ly] = wereldNaarScherm(a.punten[0].x, a.punten[0].y);
      ctxVlak.font = '600 12px "Segoe UI", system-ui, sans-serif';
      ctxVlak.lineWidth = 3; ctxVlak.strokeStyle = 'rgba(255,255,255,0.9)'; ctxVlak.strokeText(a.naam, lx + 6, ly - 6);
      ctxVlak.fillStyle = '#4A5866'; ctxVlak.fillText(a.naam, lx + 6, ly - 6);
    });

    // as
    if (asPunten.length > 0) {
      ctxVlak.beginPath();
      asPunten.forEach((p, i) => {
        const [px, py] = wereldNaarScherm(p.x, p.y);
        if (i === 0) ctxVlak.moveTo(px, py); else ctxVlak.lineTo(px, py);
      });
      // witte rand eronder: goed zichtbaar op zowel hoogtekleuren als echte (RGB) kleuren
      ctxVlak.lineJoin = 'round';
      ctxVlak.strokeStyle = 'rgba(255,255,255,0.9)';
      ctxVlak.lineWidth = 5;
      ctxVlak.stroke();
      ctxVlak.strokeStyle = '#1B2A38';
      ctxVlak.lineWidth = 2;
      ctxVlak.stroke();

      const tekenAsHandgrepen = () => {
      asPunten.forEach((p, i) => {
        const [px, py] = wereldNaarScherm(p.x, p.y);
        const isBegin = i === 0, isEind = i === asPunten.length - 1 && asPunten.length > 1;
        const groot = tekenModus;   // tijdens tekenen: grotere handgrepen om te verslepen
        const actief = asSleepPunt === i || asHoverPunt === i;
        ctxVlak.beginPath();
        ctxVlak.arc(px, py, groot ? (actief ? 7.5 : 6) : 3.5, 0, Math.PI * 2);
        ctxVlak.fillStyle = groot && isBegin ? '#2E7D32' : groot && isEind ? '#C6472B' : '#1B2A38';
        ctxVlak.fill();
        ctxVlak.strokeStyle = '#fff';
        ctxVlak.lineWidth = groot ? 2 : 1.5;
        ctxVlak.stroke();
        if (groot && (isBegin || isEind)) {
          ctxVlak.font = '700 11px "Segoe UI", system-ui, sans-serif';
          const t = isBegin ? 'begin' : 'eind';
          ctxVlak.lineWidth = 3; ctxVlak.strokeStyle = 'rgba(255,255,255,0.95)'; ctxVlak.strokeText(t, px + 9, py + 14);
          ctxVlak.fillStyle = isBegin ? '#2E7D32' : '#C6472B'; ctxVlak.fillText(t, px + 9, py + 14);
        }
      });
      };
      if (!tekenModus) tekenAsHandgrepen();

      if (assen.length > 1) {
        const [lx, ly] = wereldNaarScherm(asPunten[0].x, asPunten[0].y);
        ctxVlak.font = '700 12px "Segoe UI", system-ui, sans-serif';
        ctxVlak.lineWidth = 3; ctxVlak.strokeStyle = 'rgba(255,255,255,0.9)'; ctxVlak.strokeText(assen[actieveAs].naam, lx + 6, ly - 6);
        ctxVlak.fillStyle = '#1B2A38'; ctxVlak.fillText(assen[actieveAs].naam, lx + 6, ly - 6);
      }

      // alle dwarsprofiellijntjes (zoals ze in de PDF komen), met stationsnummer
      if (dwarsStations.length && document.getElementById('toonDwarslijnen')?.checked !== false) {
        const breedte = profielBreedte(), pL = profielL(), pR = profielR();
        const lijnen = dwarsStations.map(st => {
          const l = puntOpStationOffset(st, -pL), r = puntOpStationOffset(st, pR);
          return { st, l: wereldNaarScherm(l.x, l.y), r: wereldNaarScherm(r.x, r.y) };
        });
        ctxVlak.lineCap = 'round';
        for (const ln of lijnen) {
          ctxVlak.beginPath(); ctxVlak.moveTo(ln.l[0], ln.l[1]); ctxVlak.lineTo(ln.r[0], ln.r[1]);
          ctxVlak.strokeStyle = 'rgba(255,255,255,0.7)'; ctxVlak.lineWidth = 3; ctxVlak.stroke();
          ctxVlak.strokeStyle = 'rgba(198,71,43,0.75)'; ctxVlak.lineWidth = 1.2; ctxVlak.stroke();
        }
        // stationsnummers: wit vakje met rode rand voorbij het linker eind; overslaan als ze elkaar zouden raken
        ctxVlak.font = '700 11px "Segoe UI", system-ui, sans-serif';
        ctxVlak.textAlign = 'center'; ctxVlak.textBaseline = 'middle';
        const geplaatst = [];
        stationLabelVakken = [];
        for (const ln of lijnen) {
          const tekst = ln.st.toFixed(ln.st % 1 ? 1 : 0);
          const w = ctxVlak.measureText(tekst).width + 8, h = 15;
          const dx = ln.l[0] - ln.r[0], dy = ln.l[1] - ln.r[1], d = Math.hypot(dx, dy) || 1;
          const ux = dx / d, uy = dy / d;
          const af = Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2 + 3;
          const cx = ln.l[0] + ux * af, cy = ln.l[1] + uy * af;
          if (geplaatst.some(([px, py]) => Math.abs(px - cx) < w + 2 && Math.abs(py - cy) < h + 2)) continue;
          geplaatst.push([cx, cy]);
          stationLabelVakken.push({ st: ln.st, x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 });
          ctxVlak.beginPath();
          if (ctxVlak.roundRect) ctxVlak.roundRect(cx - w / 2, cy - h / 2, w, h, 3); else ctxVlak.rect(cx - w / 2, cy - h / 2, w, h);
          ctxVlak.fillStyle = 'rgba(255,255,255,0.92)'; ctxVlak.fill();
          ctxVlak.strokeStyle = '#C6472B'; ctxVlak.lineWidth = 1; ctxVlak.stroke();
          ctxVlak.fillStyle = '#C6472B'; ctxVlak.fillText(tekst, cx, cy + 0.5);
        }
        ctxVlak.textAlign = 'start'; ctxVlak.textBaseline = 'alphabetic'; ctxVlak.lineCap = 'butt';
        // samenvatting linksonder
        const interval = Math.max(0.5, Number(dwarsIntervalVeld.value) || 5);
        const fmt = (v) => String(+v.toFixed(2)).replace('.', ',');
        const info = `${dwarsStations.length} dwarsprofiel${dwarsStations.length === 1 ? '' : 'en'} · elke ${fmt(interval)} m · ${pL === pR ? `${fmt(breedte)} m breed` : `links ${fmt(pL)} m · rechts ${fmt(pR)} m`}`;
        ctxVlak.font = '600 12px "Segoe UI", system-ui, sans-serif';
        const iw = ctxVlak.measureText(info).width + 14, ih = 22;
        const ix = 10, iy = canvasVlak.clientHeight - ih - 10;
        ctxVlak.beginPath();
        if (ctxVlak.roundRect) ctxVlak.roundRect(ix, iy, iw, ih, 5); else ctxVlak.rect(ix, iy, iw, ih);
        ctxVlak.fillStyle = 'rgba(255,255,255,0.92)'; ctxVlak.fill();
        ctxVlak.strokeStyle = 'rgba(198,71,43,0.6)'; ctxVlak.lineWidth = 1; ctxVlak.stroke();
        ctxVlak.fillStyle = '#1B2A38'; ctxVlak.textBaseline = 'middle'; ctxVlak.fillText(info, ix + 7, iy + ih / 2 + 0.5);
        ctxVlak.textBaseline = 'alphabetic';
      }

      // dwarsprofiel-lijntje + kijkrichting op de as, voor het station dat nu bekeken wordt
      if (dwarsStations.length) {
        const st = dwarsStations[huidigeStationIndex];
        const midden = puntOpStation(st);
        const breedte = profielBreedte(), pL = profielL(), pR = profielR();
        const links = puntOpStationOffset(st, -pL);
        const rechts = puntOpStationOffset(st, pR);
        const [pxM, pyM] = wereldNaarScherm(midden.x, midden.y);
        const [pxL, pyL] = wereldNaarScherm(links.x, links.y);
        const [pxR, pyR] = wereldNaarScherm(rechts.x, rechts.y);

        ctxVlak.beginPath();
        ctxVlak.moveTo(pxL, pyL);
        ctxVlak.lineTo(pxR, pyR);
        ctxVlak.strokeStyle = 'rgba(255,255,255,0.9)';
        ctxVlak.lineWidth = 5;
        ctxVlak.stroke();
        ctxVlak.strokeStyle = '#C6472B';
        ctxVlak.lineWidth = 2;
        ctxVlak.stroke();

        // pijl: kijkrichting = richting van oplopend station. Groot en met een witte
        // rand, zodat hij op elke ondergrond (luchtfoto, hoogtekleuren, aslijn) opvalt.
        const pijlLengte = 38, kop = 15, kopBreed = 0.42;
        const dxS = Math.cos(midden.richting), dyS = -Math.sin(midden.richting);
        const puntX = pxM + dxS * pijlLengte, puntY = pyM + dyS * pijlLengte;
        const hoek = Math.atan2(dyS, dxS);
        const basisX = puntX - dxS * kop * 0.8, basisY = puntY - dyS * kop * 0.8;
        const pijlPad = () => {
          ctxVlak.beginPath();
          ctxVlak.moveTo(puntX, puntY);
          ctxVlak.lineTo(puntX - kop * Math.cos(hoek - kopBreed), puntY - kop * Math.sin(hoek - kopBreed));
          ctxVlak.lineTo(puntX - kop * Math.cos(hoek + kopBreed), puntY - kop * Math.sin(hoek + kopBreed));
          ctxVlak.closePath();
        };
        ctxVlak.lineCap = 'round'; ctxVlak.lineJoin = 'round';
        // witte rand
        ctxVlak.beginPath(); ctxVlak.moveTo(pxM, pyM); ctxVlak.lineTo(basisX, basisY);
        ctxVlak.strokeStyle = 'rgba(255,255,255,0.95)'; ctxVlak.lineWidth = 8; ctxVlak.stroke();
        pijlPad(); ctxVlak.lineWidth = 5; ctxVlak.stroke();
        // rode pijl
        ctxVlak.beginPath(); ctxVlak.moveTo(pxM, pyM); ctxVlak.lineTo(basisX, basisY);
        ctxVlak.strokeStyle = '#C6472B'; ctxVlak.lineWidth = 3.5; ctxVlak.stroke();
        pijlPad(); ctxVlak.fillStyle = '#C6472B'; ctxVlak.fill();
        // middenpunt groter, met witte rand
        ctxVlak.beginPath(); ctxVlak.arc(pxM, pyM, 5, 0, Math.PI * 2);
        ctxVlak.fillStyle = '#C6472B'; ctxVlak.fill();
        ctxVlak.strokeStyle = '#fff'; ctxVlak.lineWidth = 2; ctxVlak.stroke();
        ctxVlak.lineCap = 'butt'; ctxVlak.lineJoin = 'miter';
        // L en R aan de uiteinden van dit profiel (zoals in het dwarsprofiel)
        // net binnen de uiteinden en een stukje "achter" de lijn (tegen de kijkrichting
        // in), zodat ze niet over het stationslabel aan het eind vallen
        ctxVlak.font = '700 13px "Segoe UI",system-ui,sans-serif';
        ctxVlak.textAlign = 'center'; ctxVlak.textBaseline = 'middle';
        const opLijn = (qx, qy) => [pxM + (qx - pxM) * 0.86 - dxS * 11, pyM + (qy - pyM) * 0.86 - dyS * 11];
        for (const [tx, ty, letter] of [[...opLijn(pxL, pyL), 'L'], [...opLijn(pxR, pyR), 'R']]) {
          ctxVlak.lineWidth = 4; ctxVlak.strokeStyle = 'rgba(255,255,255,0.95)'; ctxVlak.strokeText(letter, tx, ty);
          ctxVlak.fillStyle = '#C6472B'; ctxVlak.fillText(letter, tx, ty);
        }
        ctxVlak.textAlign = 'start'; ctxVlak.textBaseline = 'alphabetic';
      }
      if (tekenModus) tekenAsHandgrepen();   // tijdens tekenen: handgrepen bovenop alles
    }
    tekenNwbOpVlak();
    tekenSchaalEnDetail();
    ctxVlak.restore();
  }

  /* Vakkenraster: licht raster van de vakken (vinkje "vakken"), en altijd een oranje
     stippelrand om vakken in beeld die nog geladen worden. */
  function tekenVakkenRaster(inBeeldDetail) {
    const bron = laatsteBestand;
    const vak = document.getElementById('toonVakkenVak');
    if (vak) vak.hidden = !bron?.tegelbron;
    if (!bron?.tegelbron) return;
    const T = bron.info.tegelM, W = canvasVlak.clientWidth, H = canvasVlak.clientHeight;
    const a = schermNaarWereld(0, 0), b = schermNaarWereld(W, H);
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const aan = document.getElementById('toonVakken')?.checked;
    const px = T * schaal;   // vakgrootte in schermpixels
    ctxVlak.save();
    ctxVlak.globalAlpha = 1;
    if (aan && px >= 6) {
      ctxVlak.strokeStyle = 'rgba(27,42,56,0.28)'; ctxVlak.lineWidth = 1;
      ctxVlak.font = '600 10.5px "Segoe UI", system-ui, sans-serif'; ctxVlak.textAlign = 'center'; ctxVlak.textBaseline = 'middle';
      const label = px >= 70;
      for (const [tx, ty, n] of bron.info.tegels) {
        if (tx * T > x1 || (tx + 1) * T < x0 || ty * T > y1 || (ty + 1) * T < y0) continue;
        const [sx, sy] = wereldNaarScherm(tx * T, (ty + 1) * T);
        ctxVlak.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(px), Math.round(px));
        if (label) {
          const t = n >= 1e6 ? `${(n / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
          const cx = sx + px / 2, cy = sy + px / 2;
          ctxVlak.lineWidth = 3; ctxVlak.strokeStyle = 'rgba(255,255,255,0.8)'; ctxVlak.strokeText(t, cx, cy);
          ctxVlak.fillStyle = 'rgba(27,42,56,0.7)'; ctxVlak.fillText(t, cx, cy);
          ctxVlak.lineWidth = 1; ctxVlak.strokeStyle = 'rgba(27,42,56,0.28)';
        }
      }
    }
    // nog te laden vakken: oranje stippelrand
    if (inBeeldDetail) {
      ctxVlak.setLineDash([5, 4]); ctxVlak.strokeStyle = 'rgba(214,120,30,0.95)'; ctxVlak.lineWidth = 1.5;
      for (const [tx, ty] of inBeeldDetail) {
        if (detailCache.has(`${tx}_${ty}`)) continue;
        const [sx, sy] = wereldNaarScherm(tx * T, (ty + 1) * T);
        ctxVlak.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(px), Math.round(px));
      }
      ctxVlak.setLineDash([]);
    }
    ctxVlak.restore();
  }

  /* Rechtsonder: schaalbalk (± 1:N op het scherm) en wat je nu ziet:
     het overzicht (uitgedund) of de volle vakken met alle punten. */
  let vlakDetailStand = { vakken: 0, geladen: 0, punten: 0 };
  function tekenSchaalEnDetail() {
    const W = canvasVlak.clientWidth, H = canvasVlak.clientHeight;
    if (!(schaal > 0) || W < 200) return;
    // schaalbalk: 1, 2 of 5 × 10^n m, ± 70–150 px lang
    const doelM = 110 / schaal, macht = Math.pow(10, Math.floor(Math.log10(doelM)));
    const lengteM = [1, 2, 5, 10].map(f => f * macht).find(v => v * schaal >= 70) || 10 * macht;
    const lpx = lengteM * schaal;
    const mm = lengteM >= 1000 ? `${String(+(lengteM / 1000).toFixed(3)).replace('.', ',')} km` : `${String(+lengteM.toFixed(3)).replace('.', ',')} m`;
    const schaalN = Math.round(1 / (schaal * 0.0254 / 96));   // 96 px per inch
    const rond = (n) => { const m = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1)); return Math.round(n / m) * m; };
    // regel 2: wat zie je
    const bron = laatsteBestand;
    let regel = '', kleur = '#5B6B78';
    const st = vlakDetailStand;
    // dichtheid: gemiddelde afstand tussen de punten en punten per m²
    const dicht = (afstand) => {
      if (!(afstand > 0)) return '';
      const cm = afstand * 100, pm2 = 1 / (afstand * afstand);
      return `± ${cm < 10 ? String(+cm.toFixed(1)).replace('.', ',') : Math.round(cm)} cm tussen punten (${pm2 >= 10 ? Math.round(pm2).toLocaleString('nl-NL') : String(+pm2.toFixed(1)).replace('.', ',')} p/m²)`;
    };
    if (bron?.tegelbron) {
      if (st.vakken && st.geladen === st.vakken) { regel = `alle punten · ${dicht(st.afstand)} · ${st.vakken} ${st.vakken === 1 ? 'vak' : 'vakken'}`; kleur = '#16803D'; }
      else if (st.vakken) { regel = `alle punten laden… ${st.geladen} / ${st.vakken} vakken`; kleur = '#B7791F'; }
      else regel = `overzicht · ${dicht(gemPuntAfstand)} · ${detailTeVeel ? `${(detailTeVeel / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln punten in beeld: zoom verder in` : 'zoom in voor alle punten'}`;
    } else if (xs) regel = `uitgedund · ${dicht(gemPuntAfstand)} · ${xs.length.toLocaleString('nl-NL')} punten`;
    ctxVlak.save();
    ctxVlak.font = '600 11.5px "Segoe UI", system-ui, sans-serif';
    const t1 = `${mm} · ± 1:${rond(schaalN).toLocaleString('nl-NL')}`;
    const bw = Math.max(lpx + 16, ctxVlak.measureText(t1).width + 16, regel ? ctxVlak.measureText(regel).width + 26 : 0);
    const bh = regel ? 44 : 30, bx = W - bw - 10, by = H - bh - 10;
    ctxVlak.beginPath();
    if (ctxVlak.roundRect) ctxVlak.roundRect(bx, by, bw, bh, 5); else ctxVlak.rect(bx, by, bw, bh);
    ctxVlak.fillStyle = 'rgba(255,255,255,0.92)'; ctxVlak.fill();
    ctxVlak.strokeStyle = 'rgba(27,42,56,0.25)'; ctxVlak.lineWidth = 1; ctxVlak.stroke();
    // balk: zwart-wit in twee helften
    const x0 = bx + bw - 8 - lpx, y0 = by + 8;
    ctxVlak.fillStyle = '#1B2A38'; ctxVlak.fillRect(x0, y0, lpx / 2, 4);
    ctxVlak.fillStyle = '#FFFFFF'; ctxVlak.fillRect(x0 + lpx / 2, y0, lpx / 2, 4);
    ctxVlak.strokeStyle = '#1B2A38'; ctxVlak.strokeRect(x0 + 0.5, y0 + 0.5, lpx - 1, 3);
    ctxVlak.fillStyle = '#1B2A38'; ctxVlak.textBaseline = 'middle'; ctxVlak.textAlign = 'right';
    ctxVlak.fillText(t1, bx + bw - 8, y0 + 14);
    if (regel) {
      ctxVlak.font = '600 11px "Segoe UI", system-ui, sans-serif';
      ctxVlak.fillStyle = kleur;
      ctxVlak.beginPath(); ctxVlak.arc(bx + bw - 8 - ctxVlak.measureText(regel).width - 8, by + bh - 10, 3.5, 0, Math.PI * 2); ctxVlak.fill();
      ctxVlak.fillText(regel, bx + bw - 8, by + bh - 10);
    }
    ctxVlak.restore();
  }

  let vlakNeer = null;
  canvasVlak.addEventListener('pointerdown', (e) => { vlakNeer = { x: e.clientX, y: e.clientY }; }, true);
  /** Index in dwarsStations van het dwarsprofiellijntje (of stationsnummer) onder het schermpunt, of -1. */
  function dwarsBijScherm(sx, sy) {
    if (!dwarsStations.length || asPunten.length < 2) return -1;
    for (const v of stationLabelVakken) {
      if (sx >= v.x0 - 2 && sx <= v.x1 + 2 && sy >= v.y0 - 2 && sy <= v.y1 + 2) return dwarsStations.indexOf(v.st);
    }
    const lijnenZichtbaar = document.getElementById('toonDwarslijnen')?.checked !== false;
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    let beste = -1, besteD = 7;
    dwarsStations.forEach((st, i) => {
      if (!lijnenZichtbaar && i !== huidigeStationIndex) return;
      const l = puntOpStationOffset(st, -pL), r = puntOpStationOffset(st, pR);
      const [x0, y0] = wereldNaarScherm(l.x, l.y), [x1, y1] = wereldNaarScherm(r.x, r.y);
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((sx - x0) * dx + (sy - y0) * dy) / l2));
      const d = Math.hypot(sx - (x0 + t * dx), sy - (y0 + t * dy));
      if (d < besteD) { besteD = d; beste = i; }
    });
    return beste;
  }
  // muis boven een dwarsprofiellijn: handje + station als tooltip
  canvasVlak.addEventListener('pointermove', (e) => {
    if (!xs || tekenModus || e.buttons) return;
    const rect = canvasVlak.getBoundingClientRect();
    const i = dwarsBijScherm(e.clientX - rect.left, e.clientY - rect.top);
    canvasVlak.classList.toggle('klikbaar', i >= 0);
    canvasVlak.title = i >= 0 ? `Dwarsprofiel station ${dwarsStations[i].toFixed(1)} m${paalAchter(dwarsStations[i])} — klik om te openen` : '';
  });
  /** Index van de (niet-actieve) as die binnen 8 px van het schermpunt ligt, of -1. */
  function asBijScherm(sx, sy) {
    let beste = -1, besteD = 8;
    assen.forEach((a, ai) => {
      if (ai === actieveAs) return;
      for (let i = 1; i < a.punten.length; i++) {
        const [x0, y0] = wereldNaarScherm(a.punten[i - 1].x, a.punten[i - 1].y), [x1, y1] = wereldNaarScherm(a.punten[i].x, a.punten[i].y);
        const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((sx - x0) * dx + (sy - y0) * dy) / l2));
        const d = Math.hypot(sx - (x0 + t * dx), sy - (y0 + t * dy));
        if (d < besteD) { besteD = d; beste = ai; }
      }
    });
    return beste;
  }
  canvasVlak.addEventListener('click', (e) => {
    if (!xs) return;
    if (!tekenModus) {
      if (vlakNeer && Math.hypot(e.clientX - vlakNeer.x, e.clientY - vlakNeer.y) > 4) return;   // was slepen
      const rect = canvasVlak.getBoundingClientRect();
      if (nwbKlik(e.clientX - rect.left, e.clientY - rect.top)) return;
      const di = dwarsBijScherm(e.clientX - rect.left, e.clientY - rect.top);
      if (di >= 0) {   // klik op een dwarsprofiellijn of stationsnummer: dat profiel openen
        huidigeStationIndex = di;
        tekenDwarsVoorHuidigeStation();
        return;
      }
      const ai = asBijScherm(e.clientX - rect.left, e.clientY - rect.top);
      if (ai >= 0) zetActieveAs(ai);
      return;
    }
    if (negeerVolgendeKlik) { negeerVolgendeKlik = false; return; }   // was een punt verslepen
    const rect = canvasVlak.getBoundingClientRect();
    const wereld = schermNaarWereld(e.clientX - rect.left, e.clientY - rect.top);
    asPunten.push(wereld);
    tekenVlak();
    bijwerkenProfielen();
    if (asPunten.length === 2) vulAsKeuze();
  });

  canvasVlak.addEventListener('wheel', (e) => {
    if (!xs) return;
    e.preventDefault();
    const rect = canvasVlak.getBoundingClientRect();
    const muisX = e.clientX - rect.left, muisY = e.clientY - rect.top;
    const wereldVoor = schermNaarWereld(muisX, muisY);
    const factor = Math.max(0.5, Math.min(2, Math.pow(1.003, -e.deltaY)));   // ±35% per wielklik
    schaal *= factor;
    const na = wereldNaarScherm(wereldVoor.x, wereldVoor.y);
    panX += muisX - na[0];
    panY += muisY - na[1];
    tekenVlak();
  }, { passive: false });

  // ── as-punten verslepen / verwijderen tijdens het tekenen ──
  canvasVlak.addEventListener('pointerdown', (e) => {
    if (!tekenModus || !xs) return;
    const rect = canvasVlak.getBoundingClientRect();
    const i = asPuntBijScherm(e.clientX - rect.left, e.clientY - rect.top);
    if (i < 0) return;
    if (e.button === 2) {           // rechtermuisknop: punt verwijderen
      asPunten.splice(i, 1);
      asHoverPunt = -1;
      negeerVolgendeKlik = false;
      tekenVlak(); bijwerkenProfielen(); vulAsKeuze();
      return;
    }
    if (e.button !== 0) return;
    asSleepPunt = i; asSleepBewogen = false;
    canvasVlak.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  canvasVlak.addEventListener('pointermove', (e) => {
    if (!tekenModus || !xs) return;
    const rect = canvasVlak.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    if (asSleepPunt >= 0) {
      asPunten[asSleepPunt] = schermNaarWereld(sx, sy);
      asSleepBewogen = true;
      tekenVlak();
      return;
    }
    const h = asPuntBijScherm(sx, sy);
    if (h !== asHoverPunt) { asHoverPunt = h; canvasVlak.classList.toggle('puntGrijp', h >= 0); tekenVlak(); }
  });
  const stopPuntSlepen = () => {
    if (asSleepPunt < 0) return;
    asSleepPunt = -1;
    negeerVolgendeKlik = true;   // de klik die op het loslaten volgt geen nieuw punt laten worden
    setTimeout(() => { negeerVolgendeKlik = false; }, 0);
    if (asSleepBewogen) bijwerkenProfielen();
    tekenVlak();
  };
  canvasVlak.addEventListener('pointerup', stopPuntSlepen);
  canvasVlak.addEventListener('pointercancel', stopPuntSlepen);
  document.addEventListener('keydown', (e) => {
    if (!tekenModus || e.key !== 'Backspace') return;
    const doel = e.target;
    if (doel && (doel.tagName === 'INPUT' || doel.tagName === 'TEXTAREA' || doel.tagName === 'SELECT' || doel.isContentEditable)) return;
    if (!asPunten.length) return;
    e.preventDefault();
    asPunten.pop();
    tekenVlak(); bijwerkenProfielen(); vulAsKeuze();
  });

  canvasVlak.addEventListener('pointerdown', (e) => {
    if (tekenModus || !xs) return;
    slepen = { x: e.clientX, y: e.clientY, panX, panY };
    canvasVlak.setPointerCapture(e.pointerId);
    canvasVlak.classList.add('pannen');
  });
  canvasVlak.addEventListener('pointermove', (e) => {
    if (!slepen) return;
    panX = slepen.panX + (e.clientX - slepen.x);
    panY = slepen.panY + (e.clientY - slepen.y);
    tekenVlak();
  });
  const stopSlepen = () => { slepen = null; canvasVlak.classList.remove('pannen'); };
  canvasVlak.addEventListener('pointerup', stopSlepen);
  canvasVlak.addEventListener('pointercancel', stopSlepen);
  canvasVlak.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('resize', () => { if (xs) tekenVlak(); });

  /* ────────────────────────────────────────────────────────────────
     3D-weergave: draadframe van de getrianguleerde surface (Three.js) —
     bewust alléén lijnen, geen dichte vlakken, net zoals Civil3D een
     TIN-surface standaard toont. Vrij ronddraaien kan (OrbitControls:
     slepen = draaien, wiel = zoomen, rechts-slepen = pannen), plus een
     paar vaste-hoek-knoppen voor een snel, voorspelbaar aanzicht.
     ──────────────────────────────────────────────────────────────── */

  function initDrieD() {
    if (drieD) return;
    const renderer = new THREE.WebGLRenderer({ canvas: canvas3D, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xF3F5F6); // --paper
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1e6);
    const controls = new THREE.OrbitControls(camera, canvas3D);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // licht — alleen nodig voor de belichte 'vlak'-weergave (het draadframe
    // is onbelicht en dus altijd even goed leesbaar, met of zonder licht)
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const zon = new THREE.DirectionalLight(0xffffff, 0.65);
    zon.position.set(1, 1.6, 0.8);
    scene.add(zon);
    drieD = { renderer, scene, camera, controls, terrein: null, bomen: null };
  }

  // Eén gedeelde geometrie voor alle boom-kronen en één voor alle stammen —
  // elke boom is alleen een eigen Mesh met een eigen positie die dezelfde
  // geometrie hergebruikt, dus dit blijft goedkoop ook bij honderden bomen.
  // Lazy aangemaakt (pas als THREE echt geladen is) en daarna hergebruikt.
  let drieDKroonGeom = null, drieDStamGeom = null, drieDKroonMat = null, drieDStamMat = null;

  /** Draadframe: elke driehoeksrand als eigen lijnstuk, gekleurd op hoogte.
   *  Onbelicht (LineBasicMaterial reageert niet op licht) — dat is prima,
   *  lijnen blijven zo altijd goed leesbaar. */
  function bouwDrieDDraadframe(midX, midY, midZ) {
    const tri = delaunay.triangles;
    const aantalDriehoeken = tri.length / 3;
    const posities = new Float32Array(aantalDriehoeken * 6 * 3); // 3 randen × 2 punten × (x,y,z)
    const kleuren = new Float32Array(aantalDriehoeken * 6 * 3);
    const pk = puntKleurenF32();

    let p = 0, k = 0;
    const zetPunt = (i) => {
      posities[p++] = xs[i] - midX;
      posities[p++] = zs[i] - midZ;       // hoogte wordt de 'omhoog'-as in 3D
      posities[p++] = -(ys[i] - midY);
      kleuren[k++] = pk[i * 3]; kleuren[k++] = pk[i * 3 + 1]; kleuren[k++] = pk[i * 3 + 2];
    };
    for (let t = 0; t < aantalDriehoeken; t++) {
      const a = tri[t * 3], b2 = tri[t * 3 + 1], c2 = tri[t * 3 + 2];
      zetPunt(a); zetPunt(b2);
      zetPunt(b2); zetPunt(c2);
      zetPunt(c2); zetPunt(a);
    }

    const geometrie = new THREE.BufferGeometry();
    geometrie.setAttribute('position', new THREE.BufferAttribute(posities, 3));
    geometrie.setAttribute('color', new THREE.BufferAttribute(kleuren, 3));
    return new THREE.LineSegments(geometrie, new THREE.LineBasicMaterial({ vertexColors: true }));
  }

  /** Gevuld vlak: dezelfde triangulatie, nu als echte driehoeksvlakken
   *  (geïndexeerd — één positie per punt in plaats van per driehoeksrand,
   *  dus goedkoper dan het draadframe) met normalen voor belichting, zodat
   *  je de vorm van het terrein ook zonder kleurverloop kan aflezen. */
  /* Bij heel veel punten (5 of 10 miljoen) is het 3D-vlak van alle punten te zwaar
     voor een laptop-grafische kaart: dan een eigen, lichter net van ± 3 miljoen
     punten voor 3D. De profielen en het bovenaanzicht gebruiken wel alle punten. */
  const DRIED_MAX_PUNTEN = 3000000;
  let drieDNet = null;
  function drieDPunten() {
    if (xs.length <= DRIED_MAX_PUNTEN * 1.1) return { xs, ys, zs, tri: delaunay.triangles, index: null };
    if (drieDNet && drieDNet.bron === xs) return drieDNet;
    const n = xs.length, idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    const d = dunUit(xs, ys, idx, DRIED_MAX_PUNTEN);   // z = index: uitdunnen op positie, daarna de echte hoogtes
    const index = Int32Array.from(d.zs);
    const pz = Array.from(index, i => zs[i]);
    const tri = new d3.Delaunay(platteCoords(d.xs, d.ys)).triangles;
    drieDNet = { bron: xs, xs: d.xs, ys: d.ys, zs: pz, tri, index };
    return drieDNet;
  }
  function bouwDrieDVlak(midX, midY, midZ) {
    const net = drieDPunten();
    const n = net.xs.length;
    const posities = new Float32Array(n * 3);
    let kleuren = puntKleurenF32();
    if (net.index) { const k = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const j = net.index[i] * 3; k[i * 3] = kleuren[j]; k[i * 3 + 1] = kleuren[j + 1]; k[i * 3 + 2] = kleuren[j + 2]; } kleuren = k; }
    for (let i = 0; i < n; i++) {
      posities[i * 3] = net.xs[i] - midX;
      posities[i * 3 + 1] = net.zs[i] - midZ;
      posities[i * 3 + 2] = -(net.ys[i] - midY);
    }
    const geometrie = new THREE.BufferGeometry();
    geometrie.setAttribute('position', new THREE.BufferAttribute(posities, 3));
    geometrie.setAttribute('color', new THREE.BufferAttribute(kleuren, 3));
    geometrie.setIndex(new THREE.BufferAttribute(net.tri, 1));
    geometrie.computeVertexNormals();
    const materiaal = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometrie, materiaal);
    mesh.userData.punten = net;
    return mesh;
  }

  /** Bouwt (of herbouwt) de 3D-scene uit de huidige xs/ys/zs/delaunay —
   *  hergebruikt de al berekende triangulatie, geen nieuw werk. */
  function bouwDrieDGeometrie(resetCamera = true) {
    if (!drieD || !xs || !delaunay) return;
    if (drieD.terrein) {
      drieD.scene.remove(drieD.terrein);
      drieD.terrein.geometry.dispose();
      drieD.terrein.material.dispose();
    }
    if (drieD.bomen) {
      // geometrie/materiaal van de bomen zijn gedeelde, hergebruikte
      // instanties (zie drieDKroonGeom e.a.) — niet disposen, alleen de
      // groep zelf weghalen, anders is er bij de volgende opbouw niets meer over
      drieD.scene.remove(drieD.bomen);
      drieD.bomen = null;
    }

    const b = grenzen();
    const midX = (b.minX + b.maxX) / 2, midY = (b.minY + b.maxY) / 2, midZ = (zMin + zMax) / 2;

    if (drieDModus !== 'vlak' && delaunay.triangles.length / 3 > 1500000) {
      // draadmodel van miljoenen driehoeken is te zwaar voor de browser
      drieDModus = 'vlak';
      drieDVlakKnop.classList.add('aan');
    }
    drieD.terrein = drieDModus === 'vlak'
      ? bouwDrieDVlak(midX, midY, midZ)
      : bouwDrieDDraadframe(midX, midY, midZ);
    drieD.scene.add(drieD.terrein);

    // bomen (uit BGT) erbovenop, op de surface-hoogte op hun eigen locatie —
    // zelfde "paaltje met rondje" als de 2D-weergaven: een dunne paal met
    // een bol erboven op, in plaats van de vorige boomvormige kegel.
    if (!drieDKroonGeom) drieDKroonGeom = new THREE.SphereGeometry(1.3, 12, 10);
    if (!drieDStamGeom) drieDStamGeom = new THREE.CylinderGeometry(0.15, 0.2, 1.4, 6);
    if (!drieDKroonMat) drieDKroonMat = new THREE.MeshBasicMaterial({ color: 0x3c8c3c });
    if (!drieDStamMat) drieDStamMat = new THREE.MeshBasicMaterial({ color: 0x6b4423 });
    const bomenGroep = new THREE.Group();
    for (const laag of boomLagen) {
      if (!laag.puntAlleen) continue;
      const wp = laag.ringen[0][0];
      const h = hoogteOp(wp.x, wp.y);
      if (h == null) continue;
      const px3 = wp.x - midX, py3 = h - midZ, pz3 = -(wp.y - midY);

      const stam = new THREE.Mesh(drieDStamGeom, drieDStamMat);
      stam.position.set(px3, py3 + 0.7, pz3);
      bomenGroep.add(stam);

      const kroon = new THREE.Mesh(drieDKroonGeom, drieDKroonMat);
      kroon.position.set(px3, py3 + 1.4 + 1.3, pz3); // bovenop de paal, niet erin verzonken
      bomenGroep.add(kroon);
    }
    drieD.bomen = bomenGroep;
    drieD.scene.add(bomenGroep);

    drieD.mid = { midX, midY, midZ };
    werkDrieDDoorvaartBij(true);
    pasDrieDLagenToe();
    if (resetCamera) zetDrieDSchuin();
  }

  function pasDrieDGrootteAan() {
    if (!drieD) return;
    const rect = canvas3D.getBoundingClientRect();
    const breed = Math.max(1, rect.width), hoog = Math.max(1, rect.height);
    drieD.camera.aspect = breed / hoog;
    drieD.camera.updateProjectionMatrix();
    drieD.renderer.setSize(breed, hoog, false);
  }

  /** Straal voor de camera-afstand, gebaseerd op de omvang van de puntenwolk. */
  function drieDAfstand() {
    if (!xs) return 100;
    const b = grenzen();
    return Math.max(10, b.maxX - b.minX, b.maxY - b.minY) * 0.9;
  }

  function zetDrieDAanzicht(hoek) {
    if (!drieD) return;
    const d = drieDAfstand();
    if (hoek === 'boven') {
      // net niet loodrecht van boven, anders raken OrbitControls in de war
      drieD.camera.position.set(0.0001, d, 0);
    } else {
      const rad = (drieDAzimuth * Math.PI) / 180;
      const elevatieRad = (32 * Math.PI) / 180; // "iets schuin", geen extreme hoek
      drieD.camera.position.set(
        d * Math.cos(rad) * Math.cos(elevatieRad),
        d * Math.sin(elevatieRad),
        d * Math.sin(rad) * Math.cos(elevatieRad),
      );
    }
    drieD.controls.target.set(0, 0, 0);
    drieD.controls.update();
  }

  // 225° = camera ten noordwesten van het model (kijkend naar het
  // zuidoosten) — three.x>0 is oost, three.z>0 is zuid in onze mapping.
  let drieDAzimuth = 225;
  function zetDrieDSchuin() { drieDAzimuth = 225; zetDrieDAanzicht('schuin'); }
  function draaiDrieD90() { drieDAzimuth = (drieDAzimuth + 90) % 360; zetDrieDAanzicht('schuin'); }

  let drieDTik = 0;
  function drieDLus() {
    if (!drieDActief) return;
    if (++drieDTik % 12 === 0) werkDrieDDoorvaartBij();   // brug/box/waterpeil gewijzigd? dan opnieuw opbouwen
    drieD.controls.update();
    drieD.renderer.render(drieD.scene, drieD.camera);
    drieDAnimatieId = requestAnimationFrame(drieDLus);
  }

  drieDKnop.addEventListener('click', () => {
    if (!xs) return;
    drieDActief = !drieDActief;
    drieDKnop.classList.toggle('aan', drieDActief);
    canvasVlak.hidden = drieDActief;
    canvas3D.hidden = !drieDActief;
    drieDKnoppen.hidden = !drieDActief;
    if (drieDLagenPaneel) drieDLagenPaneel.hidden = !drieDActief;
    if (drieDActief) {
      initDrieD();
      pasDrieDGrootteAan();
      bouwDrieDGeometrie();
      drieDLus();
    } else if (drieDAnimatieId) {
      cancelAnimationFrame(drieDAnimatieId);
      drieDAnimatieId = null;
    }
  });

  drieDBovenKnop.addEventListener('click', () => zetDrieDAanzicht('boven'));
  drieDIsoKnop.addEventListener('click', () => zetDrieDSchuin());
  drieDDraaiKnop.addEventListener('click', () => draaiDrieD90());
  drieDVlakKnop.addEventListener('click', () => {
    drieDModus = drieDModus === 'vlak' ? 'draad' : 'vlak';
    drieDVlakKnop.classList.toggle('aan', drieDModus === 'vlak');
    bouwDrieDGeometrie(false); // camerastandpunt laten staan, alleen de weergave wisselt
  });

  drieDFullscreenKnop.addEventListener('click', () => {
    if (!document.fullscreenElement) vlakPaneel.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    drieDFullscreenKnop.textContent = document.fullscreenElement ? '⛶ sluiten' : '⛶';
    // de paneelafmetingen zijn net veranderd — een tik wachten tot de
    // layout dat heeft verwerkt voordat de renderer/camera worden bijgewerkt
    if (drieDActief) requestAnimationFrame(() => requestAnimationFrame(pasDrieDGrootteAan));
  });

  window.addEventListener('resize', () => { if (drieDActief) pasDrieDGrootteAan(); });

  /* ────────────────────────────────────────────────────────────────
     3D: de doorvaartsituatie — brug (onder- en bovenzijde als
     puntenwolk), water, doorvaartbox (+ diepgang), conflictpunten,
     de as en het maatgevende schip als lijnwerk. Elke laag los aan/uit
     (paneeltje linksboven) en een knop "Naar brug" voor het standpunt.
     Ook gebruikt voor het 3D-beeld in de PDF.
     ──────────────────────────────────────────────────────────────── */
  const DRIED_LAGEN = { bodem: true, onder: true, boven: true, water: true, box: true, conflict: true, schip: true, maaiveld: true, begroeiing: true, snoei: true, as: true };
  const drieDLagen = { ...DRIED_LAGEN };
  try { Object.assign(drieDLagen, JSON.parse(localStorage.getItem('pv.drieDLagen') || '{}')); } catch { /* geen opslag */ }
  const drieDBrugCache = new WeakMap();   // brugwolk → { sleutel, punten } (puntenwolk niet steeds opnieuw opbouwen)
  let drieDDvSleutel = '';

  /** Tekstlabel dat altijd even groot op het scherm staat en nooit wordt afgedekt. */
  function drieDLabel(tekst, kleur = '#1B2A38', grootte = 0.032) {
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const f = 2, font = `700 ${21 * f}px "Segoe UI", system-ui, sans-serif`;
    x.font = font;
    const w = Math.ceil(x.measureText(tekst).width) + 22 * f, h = 34 * f;
    c.width = w; c.height = h;
    x.font = font; x.textBaseline = 'middle';
    const r = 6 * f;
    x.beginPath();
    x.moveTo(r, f); x.lineTo(w - r, f); x.quadraticCurveTo(w - f, f, w - f, r); x.lineTo(w - f, h - r); x.quadraticCurveTo(w - f, h - f, w - r, h - f);
    x.lineTo(r, h - f); x.quadraticCurveTo(f, h - f, f, h - r); x.lineTo(f, r); x.quadraticCurveTo(f, f, r, f); x.closePath();
    x.fillStyle = 'rgba(255,255,255,0.92)'; x.fill();
    x.lineWidth = 2 * f; x.strokeStyle = kleur; x.stroke();
    x.fillStyle = kleur; x.fillText(tekst, 11 * f, h / 2 + f);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.scale.set(grootte * w / h, grootte, 1);
    s.center.set(0, 0);
    s.renderOrder = 20;
    return s;
  }

  /** Brugwolk als punten, grijs verloop op hoogte (donker = laag). */
  function drieDBrugPunten(w, mid, laag, hoog, cache = true, maxN = 1500000) {
    const sleutel = `${mid.midX},${mid.midY},${mid.midZ},${laag},${hoog}`;
    const c = cache ? drieDBrugCache.get(w) : null;
    if (c && c.sleutel === sleutel) return c.punten;
    const stap = Math.max(1, Math.ceil(w.xs.length / maxN));
    const n = Math.ceil(w.xs.length / stap);
    const pos = new Float32Array(n * 3), kl = new Float32Array(n * 3);
    // hoogtebereik zonder uitschieters (2–98 %)
    const monster = [];
    for (let i = 0; i < w.zs.length; i += Math.max(1, Math.floor(w.zs.length / 20000))) monster.push(w.zs[i]);
    monster.sort((a, b) => a - b);
    const z0 = monster[Math.floor(monster.length * 0.02)] ?? 0, z1 = monster[Math.floor(monster.length * 0.98)] ?? 1;
    const ca = new THREE.Color(laag), cb = new THREE.Color(hoog);
    let k = 0;
    for (let i = 0; i < w.xs.length; i += stap, k++) {
      pos[k * 3] = w.xs[i] - mid.midX; pos[k * 3 + 1] = w.zs[i] - mid.midZ; pos[k * 3 + 2] = -(w.ys[i] - mid.midY);
      const t = Math.max(0, Math.min(1, (w.zs[i] - z0) / Math.max(0.01, z1 - z0)));
      kl[k * 3] = ca.r + (cb.r - ca.r) * t; kl[k * 3 + 1] = ca.g + (cb.g - ca.g) * t; kl[k * 3 + 2] = ca.b + (cb.b - ca.b) * t;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(kl, 3));
    const grootte = Math.max(0.04, Math.min(0.18, w.idx.afstand * 0.9 * Math.cbrt(stap)));
    const punten = new THREE.Points(geo, new THREE.PointsMaterial({ size: grootte, vertexColors: true, sizeAttenuation: true }));
    if (!cache) return punten;
    punten.userData.cache = true;
    if (c) { c.punten.geometry.dispose(); c.punten.material.dispose(); }
    drieDBrugCache.set(w, { sleutel, punten });
    return punten;
  }

  /** Stations om een buis langs de as op te bouwen: gelijkmatig + de knikpunten van de as. */
  function drieDStations(s0, s1, maxStap = 1) {
    const n = Math.max(2, Math.min(240, Math.ceil((s1 - s0) / maxStap)));
    const st = [];
    for (let i = 0; i <= n; i++) st.push(s0 + (s1 - s0) * i / n);
    for (const s of stationsLangsAs()) if (s > s0 + 1e-6 && s < s1 - 1e-6) st.push(s);
    return st.sort((a, b) => a - b).filter((s, i, a) => i === 0 || s - a[i - 1] > 1e-6);
  }

  /** Doorzichtig blok langs de as (van s0 tot s1, offset c ± B/2, hoogte z0..z1)
   *  met streeplijnen op de ribben. kleurOnder: andere kleur voor de onderste ribben. */
  function drieDBlok(k, z0, z1, kleur, opacity, mid, opties = {}) {
    const g = new THREE.Group();
    const st = drieDStations(k.s0, k.s1);
    const v3 = (p, z) => [p.x - mid.midX, z - mid.midZ, -(p.y - mid.midY)];
    const pos = [], idx = [];
    const zf0 = typeof z0 === 'function' ? z0 : () => z0, zf1 = typeof z1 === 'function' ? z1 : () => z1;
    for (const s of st) {
      const L = puntOpStationOffset(s, k.c - k.B / 2), R = puntOpStationOffset(s, k.c + k.B / 2), a = zf0(s), b = zf1(s);
      pos.push(...v3(L, a), ...v3(R, a), ...v3(R, b), ...v3(L, b));
    }
    const n = st.length;
    for (let i = 0; i < n - 1; i++) {
      const a = i * 4, b = (i + 1) * 4;
      for (const [p, q] of [[0, 1], [1, 2], [2, 3], [3, 0]]) idx.push(a + p, a + q, b + q, a + p, b + q, b + p);
    }
    for (const a of [0, (n - 1) * 4]) idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const vlak = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    vlak.renderOrder = 5;
    g.add(vlak);
    const ribbe = (hoek, kl, streep = true) => {
      const pts = [];
      for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(pos[(i * 4 + hoek) * 3], pos[(i * 4 + hoek) * 3 + 1], pos[(i * 4 + hoek) * 3 + 2]));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        streep ? new THREE.LineDashedMaterial({ color: kl, dashSize: opties.streep ?? 1.6, gapSize: (opties.streep ?? 1.6) * 0.45 }) : new THREE.LineBasicMaterial({ color: kl }));
      if (streep) l.computeLineDistances();
      g.add(l);
    };
    ribbe(0, opties.kleurOnder ?? kleur); ribbe(1, opties.kleurOnder ?? kleur); ribbe(2, kleur); ribbe(3, kleur);
    const kader = (i, kl, ondoorzichtig = 1) => {
      const pts = [0, 1, 2, 3, 0].map(h => new THREE.Vector3(pos[(i * 4 + h) * 3], pos[(i * 4 + h) * 3 + 1], pos[(i * 4 + h) * 3 + 2]));
      const mat = ondoorzichtig < 1 ? new THREE.LineBasicMaterial({ color: kl, transparent: true, opacity: ondoorzichtig }) : new THREE.LineDashedMaterial({ color: kl, dashSize: opties.streep ?? 1.6, gapSize: (opties.streep ?? 1.6) * 0.45 });
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
      if (ondoorzichtig >= 1) l.computeLineDistances();
      g.add(l);
    };
    kader(0, kleur); kader(n - 1, kleur);
    // dunne tussenkaders (± elke 5 m) — geven het blok volume
    let vorige = st[0];
    for (let i = 1; i < n - 1; i++) if (st[i] - vorige >= 5) { kader(i, kleur, 0.3); vorige = st[i]; }
    return g;
  }

  /** Maatgevend schip als lijnwerk, midden onder de brug, langs de as. */
  function drieDSchip(k, mid) {
    const top = k.P + k.H;
    const wl = k.D ? k.PD : k.P;
    const kiel = k.D ? k.PD - k.D : wl - Math.min(2.5, 0.45 * k.H);
    const dek = Math.min(k.P + 0.85, top - 0.4);
    const hutH = Math.min(2.6, Math.max(0.6, 0.62 * (top - dek)));
    const sb = Math.min(dvGetal(doorvaart.scheepsbreedte) ?? 11.4, k.B), h = sb / 2;
    const L = Math.max(10, dvGetal(doorvaart.scheepslengte) ?? 85);
    const m = (k.s0 + k.s1) / 2, p = puntOpStation(m), r = p.richting;
    const cx = p.x + Math.sin(r) * k.c, cy = p.y - Math.cos(r) * k.c;
    const W = (u, v, z) => new THREE.Vector3(cx + u * Math.cos(r) + v * Math.sin(r) - mid.midX, z - mid.midZ, -(cy + u * Math.sin(r) - v * Math.cos(r) - mid.midY));
    const a = -0.0925 * L, b = a + L, kim = Math.min(0.6, (dek - kiel) * 0.2);
    const uK0 = a + 0.04 * L, uB = b - 0.11 * L;
    const lijnen = [], dun = [];
    const pad = (pts, doel = lijnen, dicht = false) => {
      for (let i = 0; i < pts.length - 1; i++) doel.push(W(...pts[i]), W(...pts[i + 1]));
      if (dicht) doel.push(W(...pts[pts.length - 1]), W(...pts[0]));
    };
    // dek (met stompe boeg) en kiel
    pad([[a, -h, dek], [uB, -h, dek], [b - 0.02 * L, -0.55 * h, dek], [b + 0.012 * L, 0, dek + 0.3], [b - 0.02 * L, 0.55 * h, dek], [uB, h, dek], [a, h, dek]], lijnen, true);
    pad([[uK0, -(h - kim), kiel], [uB, -(h - kim), kiel], [uB, h - kim, kiel], [uK0, h - kim, kiel]], lijnen, true);
    for (const z of [-1, 1]) {
      pad([[a, z * h, dek], [a, z * h, kiel + 0.9], [uK0, z * (h - kim), kiel]]);           // spiegel
      pad([[uB, z * h, dek], [uB, z * h, kiel + kim], [uB, z * (h - kim), kiel]]);          // begin boeg
      pad([[uK0, z * h, kiel + kim], [uB, z * h, kiel + kim]], dun);                        // kim
      pad([[uB, z * h, kiel + kim], [b - 0.02 * L, z * 0.55 * h, dek]], dun);
    }
    pad([[uB, 0, kiel], [b - 0.025 * L, 0, kiel + 1.2], [b + 0.012 * L, 0, dek + 0.3]]);    // voorsteven
    for (let i = 1; i < 8; i++) {                                                            // spanten
      const u = uK0 + (uB - uK0) * i / 8;
      pad([[u, -h, dek], [u, -h, kiel + kim], [u, -(h - kim), kiel], [u, h - kim, kiel], [u, h, kiel + kim], [u, h, dek]], dun);
    }
    const blok = (u0, u1, v0, v1, z0, z1, doel = lijnen) => {
      pad([[u0, v0, z0], [u1, v0, z0], [u1, v1, z0], [u0, v1, z0]], doel, true);
      pad([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], doel, true);
      for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) pad([[u, v, z0], [u, v, z1]], doel);
    };
    const luikH = Math.min(0.9, hutH * 0.35);
    blok(a + 0.2 * L, b - 0.12 * L, -(h - 0.5), h - 0.5, dek, dek + luikH);                // luikhoofden
    const h0 = a + 0.025 * L, h1 = a + 0.16 * L, hb = Math.min(2.6, sb * 0.23);
    blok(h0, h1, -hb, hb, dek, dek + hutH);                                                  // stuurhuis
    for (let i = 0; i < 4; i++) {                                                            // ramen (voorzijde)
      const v = -hb + (i + 0.5) * (2 * hb / 4), bw = hb / 6;
      pad([[h1, v - bw, dek + hutH - 0.75], [h1, v + bw, dek + hutH - 0.75], [h1, v + bw, dek + hutH - 0.25], [h1, v - bw, dek + hutH - 0.25]], dun, true);
    }
    const mx = (h0 + h1) / 2;
    pad([[mx, 0, dek + hutH], [mx, 0, top - 0.03]]);                                        // mast tot de doorvaarthoogte
    pad([[mx, -0.8, top - 0.55], [mx, 0.8, top - 0.55]]);
    pad([[b - 0.03 * L, 0, dek + 0.3], [b - 0.03 * L, 0, dek + 1.9]]);                       // voormast
    const g = new THREE.Group();
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lijnen), new THREE.LineBasicMaterial({ color: 0x4E5B6B })));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dun), new THREE.LineBasicMaterial({ color: 0x6B7A8C, transparent: true, opacity: 0.55 })));
    // heel licht gevulde romp (zijkanten en dek), zodat het als één vorm leest
    const romp = [];
    const vlak4 = (A, B, C, D) => romp.push(A, B, C, A, C, D);
    for (const z of [-1, 1]) vlak4(W(a, z * h, dek), W(uB, z * h, dek), W(uB, z * h, kiel + kim), W(a, z * h, kiel + 0.9));
    vlak4(W(a, -h, dek), W(uB, -h, dek), W(uB, h, dek), W(a, h, dek));
    const rompGeo = new THREE.BufferGeometry().setFromPoints(romp);
    const rompVlak = new THREE.Mesh(rompGeo, new THREE.MeshBasicMaterial({ color: 0x8995A3, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    rompVlak.renderOrder = 4;
    g.add(rompVlak);
    return g;
  }

  /** Alle doorvaartlagen als één groep (met subgroepen per laag). */
  function bouwDrieDDoorvaartGroep(mid, opties = {}) {
    const groep = new THREE.Group();
    const lagen = {};
    const laag = (naam) => { const g = new THREE.Group(); g.name = naam; groep.add(g); lagen[naam] = g; return g; };
    const v3 = (x, y, z) => new THREE.Vector3(x - mid.midX, z - mid.midZ, -(y - mid.midY));
    const metLabels = opties.labels !== false;
    const pxSchaal = opties.pxSchaal ?? 1;
    const wp = waterpeil();
    // brug
    const cache = opties.cache !== false;
    if (brugOnder) laag('onder').add(drieDBrugPunten(brugOnder, mid, 0x2E3846, 0x7C8794, cache));
    if (brugBoven) laag('boven').add(drieDBrugPunten(brugBoven, mid, 0x8E959E, 0xC9CCD0, cache));
    // water: vlak binnen de omtrek van de bodem, op het waterpeil
    if (wp != null && opties.water !== false && delaunay?.hull?.length >= 3) {
      let omtrek = Array.from(delaunay.hull, i => [xs[i], ys[i]]);
      const lijnKant = waterKantLijn();
      if (lijnKant) omtrek = knipHalfvlak(omtrek, lijnKant);
      if (omtrek.length >= 3) {
        const vorm = new THREE.Shape();
        omtrek.forEach(([x, y], i) => { const px = x - mid.midX, py = y - mid.midY; if (i) vorm.lineTo(px, py); else vorm.moveTo(px, py); });
        const vlak = new THREE.Mesh(new THREE.ShapeGeometry(vorm), new THREE.MeshBasicMaterial({ color: 0x3E8FD6, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }));
        vlak.rotation.x = -Math.PI / 2; vlak.position.set(0, wp - mid.midZ, 0);
        vlak.renderOrder = 3;
        laag('water').add(vlak);
      }
    }
    // as: op het waterpeil (of op het terrein als er geen waterpeil is)
    if (asPunten.length >= 2) {
      const s = stationsLangsAs(), lengte = s[s.length - 1];
      const pts = [];
      for (const st of drieDStations(0, lengte, Math.max(0.5, lengte / 400))) {
        const q = puntOpStation(st);
        const h = wp ?? profielHoogte(q.x, q.y);
        if (h == null) continue;   // geen hoogte (buiten de wolk): overslaan i.p.v. een piek naar het midden
        const z = wp ?? h + 0.15;
        pts.push(v3(q.x, q.y, z + 0.02));
      }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x1B2A38, dashSize: 4, gapSize: 1.2 }));
      l.computeLineDistances();
      laag('as').add(l);
    }
    const k = dvKader();
    if (k && doorvaart.tonen !== false) {
      const r = dvResultaat;
      const kleur = !r ? 0x1E7FA6 : r.ok ? 0x16803D : 0xC6472B;
      const kleurCss = !r ? '#1E7FA6' : r.ok ? '#16803D' : '#C6472B';
      const box = laag('box');
      box.add(drieDBlok(k, k.P, k.P + k.H, kleur, 0.085, mid, { kleurOnder: 0x7A3E9D }));
      if (k.D) box.add(drieDBlok(k, k.PD - k.D, k.PD, kleur, 0.04, mid, { streep: 0.7 }));
      if (metLabels) {
        const p0 = puntOpStationOffset(k.s0, k.c + k.B / 2);
        const lb = drieDLabel(`doorvaartprofiel ${komma(k.B, 2)} × ${komma(k.H, 2)} m${r ? (r.ok ? ' · voldoet' : ' · voldoet niet') : ''}`, kleurCss);
        lb.position.copy(v3(p0.x, p0.y, k.P + k.H + 0.3));
        box.add(lb);
        const p1 = puntOpStationOffset(k.s0, k.c - k.B / 2);
        if (opties.toetsLabel !== false) {
        const lt = drieDLabel(`toetswaterstand ${k.P >= 0 ? '+' : '-'}${komma(Math.abs(k.P), 2)}`, '#7A3E9D', 0.026);
        lt.position.copy(v3(p1.x, p1.y, k.P + 0.1));
        box.add(lt);
        }
      }
      // conflicten en de kritieke plekken
      if (r) {
        const cf = laag('conflict');
        const alle = [...(r.conflictenH || []), ...(r.conflictenD || [])];
        if (alle.length) {
          const stap = Math.max(1, Math.floor(alle.length / 60000));
          const pts = [];
          for (let i = 0; i < alle.length; i += stap) pts.push(v3(alle[i].x, alle[i].y, alle[i].z));
          cf.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xD8452A, size: 5 * pxSchaal, sizeAttenuation: false })));
        }
        const markeer = (kp, van, goed, tekst) => {
          if (!kp) return;
          const kl = goed ? 0x16803D : 0xC6472B, klCss = goed ? '#16803D' : '#C6472B';
          const lijn = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(kp.x, kp.y, van), v3(kp.x, kp.y, kp.z)]), new THREE.LineBasicMaterial({ color: kl, depthTest: false }));
          lijn.renderOrder = 15;
          cf.add(lijn);
          const bol = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: kl, depthTest: false }));
          bol.position.copy(v3(kp.x, kp.y, kp.z)); bol.renderOrder = 15;
          cf.add(bol);
          if (metLabels) {
            const lb = drieDLabel(tekst, klCss, 0.028);
            lb.position.copy(v3(kp.x, kp.y, (van + kp.z) / 2));
            cf.add(lb);
          }
        };
        if (r.kritiek) markeer(r.kritiek, k.P, r.okH, `vrij ${komma(r.vrij, 2)} m${r.okH ? '' : ` · tekort ${komma(r.tekortH, 2)}`}`);
        if (r.D && r.kritiekD) markeer(r.kritiekD, r.PD, r.okD, `diepte ${komma(r.diepteMin, 2)} m${r.okD ? '' : ` · tekort ${komma(r.tekortD, 2)}`}`);
      }
      if (doorvaart.weergave === 'schip') laag('schip').add(drieDSchip(k, mid));
    }
    // snoeicheck: begroeiing (groen/oranje/rood) en het doorloopprofiel als tunnel over het pad
    const rs = snoei.tonen !== false ? snGeldig() : null;
    if (rs && begroeiing) {
      const w = begroeiing, lijst = [];
      for (let i = 0; i < w.xs.length; i++) if (rs.cls[i] >= 1 && rs.cls[i] <= 3) lijst.push(i);
      const stap = Math.max(1, Math.ceil(lijst.length / 1500000)), n = Math.ceil(lijst.length / stap);
      const pos = new Float32Array(n * 3), kl = new Float32Array(n * 3);
      for (let j = 0, k = 0; j < lijst.length; j += stap, k++) {
        const i = lijst[j];
        pos[k * 3] = w.xs[i] - mid.midX; pos[k * 3 + 1] = w.zs[i] - mid.midZ; pos[k * 3 + 2] = -(w.ys[i] - mid.midY);
        let c;
        if (rs.cls[i] === 3) c = [0.80, 0.26, 0.16];
        else if (rs.cls[i] === 2) c = [0.90, 0.55, 0.10];
        else { const t = Math.max(0, Math.min(1, rs.HL[i] / 12)); c = [0.30 + 0.22 * t, 0.46 + 0.24 * t, 0.24 + 0.16 * t]; }
        kl[k * 3] = c[0]; kl[k * 3 + 1] = c[1]; kl[k * 3 + 2] = c[2];
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(kl, 3));
      laag('begroeiing').add(new THREE.Points(geo, new THREE.PointsMaterial({ size: Math.max(0.05, Math.min(0.2, (w.idx?.afstand || 0.15) * 1.2)), vertexColors: true, sizeAttenuation: true })));
      // maaiveld van de strook (eigen grondraster): het pad licht, de rest bruin
      {
        const half = Math.max(2, (w.half || 8) - 0.5), ns = Math.max(2, Math.min(1500, Math.ceil(rs.L))), no = Math.max(4, Math.min(64, Math.ceil(2 * half / 0.5)));
        const pos2 = new Float32Array((ns + 1) * (no + 1) * 3), kl2 = new Float32Array((ns + 1) * (no + 1) * 3), idx = [];
        let k = 0;
        for (let a = 0; a <= ns; a++) for (let b = 0; b <= no; b++, k++) {
          const st = rs.L * a / ns, o = -half + 2 * half * b / no, q = puntOpStationOffset(st, o);
          const z = w.grond.op(q.x, q.y) ?? rs.zcOp(st);
          pos2[k * 3] = q.x - mid.midX; pos2[k * 3 + 1] = z - mid.midZ; pos2[k * 3 + 2] = -(q.y - mid.midY);
          const pad = Math.abs(o - rs.c) <= rs.B / 2;
          kl2[k * 3] = pad ? 0.78 : 0.47; kl2[k * 3 + 1] = pad ? 0.72 : 0.43; kl2[k * 3 + 2] = pad ? 0.58 : 0.31;
        }
        for (let a = 0; a < ns; a++) for (let b = 0; b < no; b++) { const i0 = a * (no + 1) + b, i1 = i0 + no + 1; idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1); }
        const geo2 = new THREE.BufferGeometry();
        geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
        geo2.setAttribute('color', new THREE.BufferAttribute(kl2, 3));
        geo2.setIndex(idx); geo2.computeVertexNormals();
        laag('maaiveld').add(new THREE.Mesh(geo2, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
      }
      const sl = laag('snoei'), kader = { s0: rs.s0, s1: rs.s1, c: rs.c, B: rs.B };
      sl.add(drieDBlok(kader, (s) => rs.zcOp(s), (s) => rs.zcOp(s) + rs.H, rs.ok ? 0x16803D : 0xC6472B, 0.08, mid, { streep: 1.2 }));
      if (rs.M) sl.add(drieDBlok({ ...kader, B: rs.B + 2 * rs.M }, (s) => rs.zcOp(s), (s) => rs.zcOp(s) + rs.H + rs.M, 0xE08A1E, 0.0, mid, { streep: 0.8 }));
      if (metLabels) for (const p of rs.snoeipunten) {
        const lb = drieDLabel(String(p.nr), p.ernst === 'rood' ? '#C6472B' : '#E08A1E', 0.026);
        lb.position.copy(v3(p.x, p.y, Math.min(p.z, rs.zcOp(p.sMid) + rs.H + rs.M) + 0.25));
        sl.add(lb);
      }
    }
    for (const naam of Object.keys(DRIED_LAGEN)) if (lagen[naam]) lagen[naam].visible = drieDLagen[naam] !== false;
    if (opties.labelSchaal && opties.labelSchaal !== 1) groep.traverse((o) => { if (o.isSprite) o.scale.multiplyScalar(opties.labelSchaal); });
    return { groep, lagen };
  }

  /** Geometrie, materialen en labeltexturen opruimen (de gecachte brugpunten niet). */
  function ruimDrieDOp(obj) {
    obj.traverse((o) => {
      if (o.userData?.cache) return;
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { m.map?.dispose?.(); m.dispose?.(); }
    });
  }

  const drieDLagenPaneel = document.getElementById('drieDLagen');
  const drieDBrugKnop = document.getElementById('drieDBrugKnop');

  function werkDrieDDoorvaartBij(forceer = false) {
    if (!drieD || !drieD.mid) return;
    const sleutel = JSON.stringify([drieD.mid, asPunten, brugOnder ? [brugOnder.naam, brugOnder.xs.length] : 0, brugBoven ? [brugBoven.naam, brugBoven.xs.length] : 0,
      doorvaart, dvResultaat ? dvResultaat.tijd?.getTime?.() ?? 1 : 0, waterpeil(), waterKant(), xs ? xs.length : 0,
      snoei, snResultaat ? snResultaat.tijd?.getTime?.() ?? 1 : 0, begroeiing ? begroeiing.xs.length : 0]);
    if (!forceer && sleutel === drieDDvSleutel) return;
    drieDDvSleutel = sleutel;
    if (drieD.dv) { drieD.scene.remove(drieD.dv.groep); ruimDrieDOp(drieD.dv.groep); }
    drieD.dv = bouwDrieDDoorvaartGroep(drieD.mid);
    drieD.scene.add(drieD.dv.groep);
    pasDrieDLagenToe();
  }

  function pasDrieDLagenToe() {
    if (drieD) {
      if (drieD.terrein) drieD.terrein.visible = drieDLagen.bodem !== false;
      if (drieD.bomen) drieD.bomen.visible = drieDLagen.bodem !== false;
      if (drieD.dv) for (const [naam, g] of Object.entries(drieD.dv.lagen)) g.visible = drieDLagen[naam] !== false;
    }
    if (drieDLagenPaneel) {
      const heeft = drieD?.dv?.lagen || {};
      for (const lbl of drieDLagenPaneel.querySelectorAll('label[data-laag]')) {
        const naam = lbl.dataset.laag;
        lbl.hidden = naam !== 'bodem' && !heeft[naam];
        const cb = lbl.querySelector('input'); if (cb) cb.checked = drieDLagen[naam] !== false;
      }
    }
    if (drieDBrugKnop) {
      const brug = !!(dvKader() || brugOnder || brugBoven), sn = !!(snResultaat && snResultaat.snoeipunten.length);
      drieDBrugKnop.disabled = !(brug || sn);
      drieDBrugKnop.textContent = brug ? 'Naar brug' : 'Naar snoeipunt';
      drieDBrugKnop.title = brug ? 'Camera naar de doorvaart onder de brug' : 'Camera naar het volgende snoeipunt (klik nog eens voor het volgende)';
    }
  }

  drieDLagenPaneel?.addEventListener('change', (e) => {
    const lbl = e.target.closest('label[data-laag]');
    if (!lbl) return;
    drieDLagen[lbl.dataset.laag] = e.target.checked;
    try { localStorage.setItem('pv.drieDLagen', JSON.stringify(drieDLagen)); } catch { /* geen opslag */ }
    pasDrieDLagenToe();
  });

  let drieDSnoeiNr = -1;
  /** Camera naar een snoeipunt: over het pad aan komen lopen, iets van boven. */
  function zetDrieDOpSnoeipunt() {
    const r = snGeldig(); if (!r || !r.snoeipunten.length) return;
    drieDSnoeiNr = (drieDSnoeiNr + 1) % r.snoeipunten.length;
    const p = r.snoeipunten[drieDSnoeiNr], mid = drieD.mid, q = puntOpStationOffset(p.sMid, r.c), rr = puntOpStation(p.sMid).richting;
    const doel = new THREE.Vector3(q.x - mid.midX, r.zcOp(p.sMid) + r.H * 0.6 - mid.midZ, -(q.y - mid.midY));
    const d = 16, opzij = 28 * Math.PI / 180, el = 22 * Math.PI / 180, rx = Math.cos(rr), ry = Math.sin(rr);
    const hx = -rx * Math.cos(opzij) + ry * Math.sin(opzij), hy = -ry * Math.cos(opzij) - rx * Math.sin(opzij);
    drieD.camera.position.set(doel.x + d * hx * Math.cos(el), doel.y + d * Math.sin(el), doel.z - d * hy * Math.cos(el));
    drieD.controls.target.copy(doel); drieD.controls.update();
    statusEl.style.color = '';
    statusEl.textContent = `3D: snoeipunt ${p.nr} van ${r.snoeipunten.length} — ${snPlek(p)} m, ${p.soort}`;
  }
  /** Camera naar de doorvaart: vanaf de vaarweg, iets schuin en van boven. */
  function zetDrieDOpBrug() {
    if (!drieD || !drieD.mid) return;
    if (!(dvKader() || brugOnder || brugBoven)) { zetDrieDOpSnoeipunt(); return; }
    const mid = drieD.mid;
    const k = dvKader();
    let doel, rx, ry, d;
    if (k) {
      const m = k.brugVan != null ? (k.brugVan + k.brugTot) / 2 : (k.s0 + k.s1) / 2;
      const p = puntOpStationOffset(m, k.c), r = puntOpStation(m).richting;
      doel = new THREE.Vector3(p.x - mid.midX, k.P + k.H * 0.45 - mid.midZ, -(p.y - mid.midY));
      rx = Math.cos(r); ry = Math.sin(r);
      d = Math.max(45, k.B * 2.8, (k.s1 - k.s0) * 1.7);
    } else {
      const w = brugOnder || brugBoven;
      if (!w) return;
      const I = w.idx, cx = (I.x0 + I.x1) / 2, cy = (I.y0 + I.y1) / 2;
      let zs2 = 0; for (let i = 0; i < w.zs.length; i += Math.max(1, Math.floor(w.zs.length / 2000))) zs2 = Math.max(zs2, w.zs[i]);
      doel = new THREE.Vector3(cx - mid.midX, zs2 - 3 - mid.midZ, -(cy - mid.midY));
      rx = 1; ry = 0; d = Math.max(30, Math.hypot(I.x1 - I.x0, I.y1 - I.y0) * 0.9);
    }
    // camera stroomopwaarts op de vaarweg (tegen de looprichting in), 38° opzij, 21° omhoog
    const opzij = 38 * Math.PI / 180, el = 21 * Math.PI / 180;
    const hx = -rx * Math.cos(opzij) + ry * Math.sin(opzij), hy = -ry * Math.cos(opzij) - rx * Math.sin(opzij);
    drieD.camera.position.set(doel.x + d * hx * Math.cos(el), doel.y + d * Math.sin(el), doel.z - d * hy * Math.cos(el));
    drieD.controls.target.copy(doel);
    drieD.controls.update();
  }
  drieDBrugKnop?.addEventListener('click', zetDrieDOpBrug);

  /* ────────────────────────────────────────────────────────────────
     Vensterverhouding aanpassen: sleepbalken tussen bovenaanzicht en
     profielen (kolom), en tussen langs- en dwarsprofiel (rij).
     ──────────────────────────────────────────────────────────────── */
  const mainEl = document.querySelector('main');

  function sleepSplitter(splitter, as) {
    splitter.addEventListener('pointerdown', (e) => {
      splitter.setPointerCapture(e.pointerId);
      splitter.classList.add('actief');
      const rect = mainEl.getBoundingClientRect();

      const verplaats = (ev) => {
        if (as === 'kolom') {
          const frac = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width));
          mainEl.style.setProperty('--kolom1', `${frac}fr`);
          mainEl.style.setProperty('--kolom2', `${1 - frac}fr`);
          if (xs) tekenVlak();
          tekenLangs();
          tekenDwarsVoorHuidigeStation();
        } else {
          const frac = Math.min(0.8, Math.max(0.2, (ev.clientY - rect.top) / rect.height));
          mainEl.style.setProperty('--rij1', `${frac}fr`);
          mainEl.style.setProperty('--rij2', `${1 - frac}fr`);
          tekenLangs();
          tekenDwarsVoorHuidigeStation();
        }
      };
      const stop = () => {
        window.removeEventListener('pointermove', verplaats);
        window.removeEventListener('pointerup', stop);
        splitter.classList.remove('actief');
      };
      window.addEventListener('pointermove', verplaats);
      window.addEventListener('pointerup', stop);
    });
  }
  sleepSplitter(kolomSplitter, 'kolom');
  sleepSplitter(rijSplitter, 'rij');

  /* Lengteprofiel is niet altijd nodig — uitzetten geeft het dwarsprofiel
     de volle hoogte van de kolom. */
  toonLangsprofielVeld.addEventListener('change', () => {
    const tonen = toonLangsprofielVeld.checked;
    langsPaneel.style.display = tonen ? '' : 'none';
    rijSplitter.style.display = tonen ? '' : 'none';
    dwarsPaneel.style.gridRow = tonen ? '' : '1 / 4';
    tekenDwarsVoorHuidigeStation();
  });

  tekenAsKnop.addEventListener('click', () => {
    // Bestaande as en dan "Teken as": tekent een nieuwe as erbij, zodat de
    // vorige bewaard blijft (vroeger ging je verder op dezelfde as).
    zetTekenModus(!tekenModus);
  });

  document.getElementById('asKeuze')?.addEventListener('change', (e) => {
    zetTekenModus(false);
    zetActieveAs(Number(e.target.value));
  });
  document.getElementById('nieuweAsKnop')?.addEventListener('click', () => {
    if (!xs) return;
    bewaarActieveAs();
    // een lege as hergebruiken in plaats van er nóg een te maken
    const leeg = asPunten.length === 0 ? actieveAs : -1;
    if (leeg < 0) assen.push({ naam: nieuweAsNaam(), punten: [] });
    zetActieveAs(leeg >= 0 ? leeg : assen.length - 1);
    zetTekenModus(true);
    statusEl.textContent = `${assen[actieveAs].naam}: klik punten in het bovenaanzicht, daarna "Klaar met tekenen". De andere assen blijven bewaard (grijs; klik erop om te wisselen).`;
  });
  document.getElementById('hernoemAsKnop')?.addEventListener('click', () => {
    const naam = prompt('Naam van deze as:', assen[actieveAs].naam);
    if (!naam || !naam.trim()) return;
    assen[actieveAs].naam = naam.trim().slice(0, 40);
    vulAsKeuze(); tekenVlak();
  });

  wisAsKnop.addEventListener('click', () => {
    if (assen.length > 1) {
      if (asPunten.length >= 2 && !confirm(`"${assen[actieveAs].naam}" verwijderen?`)) return;
      assen.splice(actieveAs, 1);
      actieveAs = Math.min(actieveAs, assen.length - 1);
      asPunten = assen[actieveAs].punten;
    } else {
      asPunten.length = 0;
    }
    zetTekenModus(false);
    vulAsKeuze();
    huidigeStationIndex = 0;
    vorigeStationKnop.disabled = true;
    volgendeStationKnop.disabled = true;
    tekenVlak();
    bijwerkenProfielen();
  });

  /* Afsluiten: vraagt het achtergrondprogramma (Lutrea-Profielviewer.exe of
     dev-server.py) om te stoppen en sluit daarna het venster. */
  document.getElementById('afsluitKnop')?.addEventListener('click', async () => {
    if (xs && !confirm('Profielviewer afsluiten?\n\nNiet-opgeslagen werk (as, BGT, instellingen) gaat verloren — gebruik eerst "Project opslaan" als je het wilt bewaren.')) return;
    try { await fetch('/__ptsviewer/stop', { method: 'POST', cache: 'no-store' }); } catch { /* server is al weg */ }
    window.close();
    // Lukt sluiten niet (gewoon browsertabblad): netjes melden.
    setTimeout(() => {
      const scherm = document.createElement('div');
      scherm.className = 'afgesloten';
      scherm.innerHTML = '<img src="merk-lutrea.png" alt=""><div>De Profielviewer is afgesloten. Je kunt dit venster nu sluiten.</div>';
      document.body.appendChild(scherm);
    }, 400);
  });

  /* Instellingen exporteren/importeren: alle localStorage-sleutels ptsviewer-* en pv.*
     (PDF-stempel en titelblok, logo's, weergave) in één JSON-bestand. Bedoeld om ze
     over te zetten van het oude Chrome/Edge-venster naar het eigen programmavenster
     (dat een eigen gegevensmap heeft). Recente projectmappen (IndexedDB, mapverwijzingen)
     gaan niet mee: die zijn aan het browserprofiel gebonden. */
  const INSTELLINGEN_SOORT = 'profielviewer-instellingen';
  const isInstelling = (k) => (k.startsWith('ptsviewer-') || k.startsWith('pv.')) && k !== BEZIG_OPSLAG;
  document.getElementById('instellingenExportKnop')?.addEventListener('click', async () => {
    const sleutels = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isInstelling(k)) sleutels[k] = localStorage.getItem(k);
    }
    const inhoud = {
      soort: INSTELLINGEN_SOORT, versie: 1, gemaakt: new Date().toISOString(),
      viewer: document.getElementById('appVersie')?.textContent?.trim() || '', sleutels,
    };
    const naam = `profielviewer-instellingen_${new Date().toISOString().slice(0, 10)}.json`;
    const h = await kiesOpslag(naam, 'instellingen');
    if (h === false) return;
    const blob = new Blob([JSON.stringify(inhoud, null, 1)], { type: 'application/json' });
    const opgeslagen = await schrijfBestand(h, blob, naam);
    statusEl.textContent = `${Object.keys(sleutels).length} instellingen geëxporteerd: ${opgeslagen}`;
  });
  const instellingenLadenVeld = document.getElementById('instellingenLadenVeld');
  document.getElementById('instellingenImportKnop')?.addEventListener('click', () => instellingenLadenVeld.click());
  instellingenLadenVeld?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    let inhoud;
    try { inhoud = JSON.parse(await f.text()); } catch { inhoud = null; }
    if (inhoud?.soort !== INSTELLINGEN_SOORT || !inhoud.sleutels || typeof inhoud.sleutels !== 'object') {
      toonFout(`${f.name} is geen instellingenbestand van de Profielviewer (maak er een met Project → instellingen → Exporteren…).`);
      return;
    }
    const over = Object.entries(inhoud.sleutels).filter(([k, v]) => isInstelling(k) && typeof v === 'string');
    if (!over.length) { toonFout(`${f.name} bevat geen instellingen.`); return; }
    if (!confirm(`${over.length} instellingen overnemen uit ${f.name}${inhoud.viewer ? ` (Profielviewer ${inhoud.viewer})` : ''}?\n\n` +
      'Dezelfde instellingen in dit venster worden overschreven. De viewer start daarna opnieuw' +
      (xs ? ' — niet-opgeslagen werk gaat verloren, sla je project eerst op.' : '.'))) return;
    for (const [k, v] of over) localStorage.setItem(k, v);
    location.reload();
  });

  document.getElementById('zoomAllesKnop')?.addEventListener('click', () => {
    if (!xs) return;
    if (drieDActief) { document.getElementById('drieDBoven')?.click(); return; }
    bewaarZoom(true); passVlakAan(); tekenVlak();
  });
  // dubbelklik op een lege plek in het bovenaanzicht = alles in beeld (niet tijdens as tekenen)
  canvasVlak.addEventListener('dblclick', (e) => {
    if (!xs || tekenModus || vensterActief) return;
    // dubbelklik op een dwarsprofiellijn: dat profiel schermvullend openen
    const rect = canvasVlak.getBoundingClientRect();
    const di = dwarsBijScherm(e.clientX - rect.left, e.clientY - rect.top);
    if (di >= 0) {
      huidigeStationIndex = di;
      tekenDwarsVoorHuidigeStation();
      dwarsVolScherm(true);
      return;
    }
    bewaarZoom(true); passVlakAan(); tekenVlak();
  });
  /** Dwarsprofielpaneel schermvullend aan/uit (aan = true, uit = false, wissel = undefined). */
  function dwarsVolScherm(aan) {
    const paneel = document.getElementById('dwarsPaneel');
    if (!paneel) return;
    const isVol = document.fullscreenElement === paneel;
    if (aan === undefined) aan = !isVol;
    if (aan && !isVol) {
      const ga = () => paneel.requestFullscreen?.().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().then(ga).catch(ga); else ga();
    } else if (!aan && isVol) document.exitFullscreen?.().catch(() => {});
  }
  document.getElementById('dwarsVolScherm')?.addEventListener('click', () => { if (dwarsStations.length) dwarsVolScherm(); });
  svgDwars.addEventListener('dblclick', () => { if (dwarsStations.length) dwarsVolScherm(); });
  document.addEventListener('fullscreenchange', () => {
    // het profiel opnieuw tekenen op de nieuwe paneelgrootte (na de layout)
    const knop = document.getElementById('dwarsVolScherm');
    const isVol = document.fullscreenElement === document.getElementById('dwarsPaneel');
    if (knop) knop.textContent = isVol ? '⛶ sluiten' : '⛶';
    requestAnimationFrame(() => requestAnimationFrame(() => { if (dwarsStations.length) tekenDwarsVoorHuidigeStation(); }));
  });

  /* ── Zoomen zoals in CAD: venster, alles, vorige, in/uit ─────────────── */
  const zoomHistorie = [];
  let laatsteBewaard = 0;
  /** Huidige zoom op de stapel voor "Zoom vorige" (bij wieldraaien hooguit eens per 0,7 s). */
  function bewaarZoom(altijd = false) {
    const nu = performance.now();
    if (!altijd && nu - laatsteBewaard < 700) return;
    laatsteBewaard = nu;
    const vorige = zoomHistorie[zoomHistorie.length - 1];
    if (vorige && vorige.schaal === schaal && vorige.panX === panX && vorige.panY === panY) return;
    zoomHistorie.push({ schaal, panX, panY });
    if (zoomHistorie.length > 30) zoomHistorie.shift();
    werkZoomKnoppenBij();
  }
  function werkZoomKnoppenBij() {
    const v = document.getElementById('zoomVorigeKnop');
    if (v) v.disabled = !xs || zoomHistorie.length === 0;
  }
  canvasVlak.addEventListener('wheel', () => { if (xs) bewaarZoom(false); }, { capture: true, passive: true });
  canvasVlak.addEventListener('pointerdown', () => { if (xs && !tekenModus && !vensterActief) bewaarZoom(true); }, { capture: true });

  document.getElementById('zoomVorigeKnop')?.addEventListener('click', () => {
    const z = zoomHistorie.pop();
    if (!z) return;
    schaal = z.schaal; panX = z.panX; panY = z.panY;
    tekenVlak(); werkZoomKnoppenBij();
  });
  const zoomStap = (factor) => {
    if (!xs) return;
    bewaarZoom(true);
    const w = canvasVlak.clientWidth, h = canvasVlak.clientHeight;
    const midden = schermNaarWereld(w / 2, h / 2);
    schaal *= factor;
    panX = w / 2 - midden.x * schaal;
    panY = h / 2 + midden.y * schaal;
    tekenVlak();
  };
  document.getElementById('zoomInVlakKnop')?.addEventListener('click', () => zoomStap(1.5));
  document.getElementById('zoomUitVlakKnop')?.addEventListener('click', () => zoomStap(1 / 1.5));

  /** Zoom venster: rechthoek trekken met de muis; werkt op het bovenaanzicht
   *  en op beide profielen. Eén keer per klik op de knop (zoals in CAD);
   *  Esc of rechtermuisknop = annuleren. */
  let vensterActief = null;   // {el, knop, start, kader, klaar}
  function startVenster(el, knop, klaar) {
    if (vensterActief) stopVenster();
    const houder = el.parentElement;
    const kader = document.createElement('div');
    kader.className = 'zoomkader';
    kader.hidden = true;
    houder.append(kader);
    vensterActief = { el, knop, kader, klaar, start: null };
    knop?.classList.add('aan');
    el.classList.add('venster');
    statusEl.dataset.vorige = statusEl.textContent;
    statusEl.textContent = 'Zoom venster: sleep een rechthoek om het gebied waarop je wilt inzoomen (Esc = annuleren)';
  }
  function stopVenster() {
    if (!vensterActief) return;
    vensterActief.kader.remove();
    vensterActief.knop?.classList.remove('aan');
    vensterActief.el.classList.remove('venster');
    if (statusEl.dataset.vorige) statusEl.textContent = statusEl.dataset.vorige;
    vensterActief = null;
  }
  function koppelVenster(el, knopId, klaar) {
    const knop = document.getElementById(knopId);
    knop?.addEventListener('click', () => {
      if (vensterActief && vensterActief.el === el) { stopVenster(); return; }
      startVenster(el, knop, klaar);
    });
    el.addEventListener('pointerdown', (e) => {
      if (!vensterActief || vensterActief.el !== el) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.button === 2) { stopVenster(); return; }
      const r = el.getBoundingClientRect();
      vensterActief.start = { x: e.clientX - r.left, y: e.clientY - r.top };
      el.setPointerCapture(e.pointerId);
    }, { capture: true });
    el.addEventListener('pointermove', (e) => {
      const v = vensterActief;
      if (!v || v.el !== el || !v.start) return;
      e.stopImmediatePropagation();
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      Object.assign(v.kader.style, {
        left: (el.offsetLeft + Math.min(x, v.start.x)) + 'px', top: (el.offsetTop + Math.min(y, v.start.y)) + 'px',
        width: Math.abs(x - v.start.x) + 'px', height: Math.abs(y - v.start.y) + 'px',
      });
      v.kader.hidden = false;
    }, { capture: true });
    el.addEventListener('pointerup', (e) => {
      const v = vensterActief;
      if (!v || v.el !== el || !v.start) return;
      e.stopImmediatePropagation();
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const rect = { x0: Math.min(x, v.start.x), y0: Math.min(y, v.start.y), x1: Math.max(x, v.start.x), y1: Math.max(y, v.start.y) };
      stopVenster();
      if (rect.x1 - rect.x0 < 6 || rect.y1 - rect.y0 < 6) return;   // per ongeluk geklikt
      klaar(rect, r.width, r.height);
    }, { capture: true });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') stopVenster(); });

  // bovenaanzicht
  koppelVenster(canvasVlak, 'zoomVensterVlakKnop', (rect, w, h) => {
    if (!xs) return;
    bewaarZoom(true);
    const a = schermNaarWereld(rect.x0, rect.y0), b = schermNaarWereld(rect.x1, rect.y1);
    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    schaal = Math.min(w / Math.abs(b.x - a.x), h / Math.abs(b.y - a.y));
    panX = w / 2 - midX * schaal;
    panY = h / 2 + midY * schaal;
    tekenVlak();
  });
  // profielen: zelfde rekensom op de zoomtoestand van de grafiek
  const profielVenster = (zoom, teken) => (rect, w, h) => {
    const s0 = zoom().schaal, px0 = zoom().panX, py0 = zoom().panY;
    const cx = ((rect.x0 + rect.x1) / 2 - px0) / s0, cy = ((rect.y0 + rect.y1) / 2 - py0) / s0;
    const s1 = Math.max(0.1, Math.min(200, s0 * Math.min(w / (rect.x1 - rect.x0), h / (rect.y1 - rect.y0))));
    const z = zoom(); z.schaal = s1; z.panX = w / 2 - cx * s1; z.panY = h / 2 - cy * s1;
    teken();
  };
  koppelVenster(svgDwars, 'dwarsZoomVenster', profielVenster(() => dwarsZoom, () => tekenDwarsVoorHuidigeStation()));
  koppelVenster(svgLangs, 'langsZoomVenster', profielVenster(() => langsZoom, () => tekenLangs()));

  {
    const bgtProfielVeld = document.getElementById('bgtInProfiel');
    try { const b = localStorage.getItem('ptsviewer-bgt-in-profiel'); if (b && bgtProfielVeld) bgtProfielVeld.value = b; } catch { /* */ }
    bgtProfielVeld?.addEventListener('change', () => {
      try { localStorage.setItem('ptsviewer-bgt-in-profiel', bgtProfielVeld.value); } catch { /* */ }
      tekenDwarsVoorHuidigeStation();
    });
    // kadastrale perceelgrenzen in het dwarsprofiel aan/uit (ook PDF en DXF), net als de BGT
    const kadProfielVeld = document.getElementById('kadasterInProfiel');
    try { const k = localStorage.getItem('ptsviewer-kadaster-in-profiel'); if (k && kadProfielVeld) kadProfielVeld.checked = k !== 'uit'; } catch { /* */ }
    kadProfielVeld?.addEventListener('change', () => {
      try { localStorage.setItem('ptsviewer-kadaster-in-profiel', kadProfielVeld.checked ? 'aan' : 'uit'); } catch { /* */ }
      tekenDwarsVoorHuidigeStation();
    });
  }

  document.getElementById('volleDichtheidKnop')?.addEventListener('click', async () => {
    if (volleBezig) { volleStop = true; return; }
    if (volleProfielenGeldig()) { volleCache.delete(volleProfielen.sleutel); volleProfielen = null; volleHandmatigUit = true; bijwerkenProfielen(); statusEl.textContent = 'Profielen weer uit de surface'; return; }
    volleHandmatigUit = false;
    await maakVolleProfielen();
  });
  document.getElementById('detailStrookKnop')?.addEventListener('click', async () => {
    if (!laatsteBestand || !assen.some(a => a.punten.length >= 2)) return;
    if (detailStrook) { await laadBestand(laatsteBestand, true, null); return; }
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    await laadBestand(laatsteBestand, true, { halveBreedte: Math.max(pL, pR) + 2 });
  });

  document.getElementById('puntDichtheid')?.addEventListener('change', async () => {
    try { localStorage.setItem('ptsviewer-puntdichtheid', String(doelPunten())); } catch { /* geen opslag */ }
    if (!xs) return;
    if (laatsteBestand) {
      await laadBestand(laatsteBestand, true, detailStrook);   // opnieuw inlezen met de nieuwe dichtheid; as/BGT blijven
    } else if (doelPunten() < xs.length) {
      const d = dunUit(xs, ys, zs, doelPunten(), cs);   // puntenwolk uit een project: alleen minder kan
      await activeerPuntenwolk(d.xs, d.ys, d.zs, bronBestandsnaam, ' (uitgedund)', performance.now(), d.cs, true);
    } else {
      statusEl.textContent = 'Meer punten kan alleen door het oorspronkelijke .pts/.las/.laz-bestand opnieuw in te lezen.';
    }
  });
  {
    const mv = document.getElementById('wolkAMaaiveld');
    try { mv.checked = localStorage.getItem('ptsviewer-a-maaiveld') === '1'; } catch { /* */ }
    mv?.addEventListener('change', async () => {
      try { localStorage.setItem('ptsviewer-a-maaiveld', mv.checked ? '1' : '0'); } catch { /* */ }
      volleProfielen = null; volleCache.clear();
      if (!xs) return;
      if (laatsteBestand && (laatsteBestand.tegelbron ? (laatsteBestand.info.klassen?.[2] || 0) > 0 : /\.la[sz]$/i.test(laatsteBestand.name))) await laadBestand(laatsteBestand, true, null);
      else if (laatsteBestand) statusEl.textContent = 'Een .pts heeft geen classificatie: maaiveld werkt alleen bij LAS/LAZ. Kies anders "onderkant" om begroeiing grotendeels weg te laten.';
      else statusEl.textContent = 'Maaiveld werkt pas na opnieuw inlezen van het oorspronkelijke .las/.laz-bestand (een project bevat alleen de al gekozen punten).';
    });
  }
  document.getElementById('waterpeil')?.addEventListener('input', () => tekenDwarsVoorHuidigeStation());
  document.getElementById('waterKant')?.addEventListener('change', () => tekenDwarsVoorHuidigeStation());
  const werkRandenKnopBij = () => { const r = document.getElementById('randenStrak'); if (r) r.disabled = oppervlakModus() !== 'boven'; };
  document.getElementById('randenStrak')?.addEventListener('change', async (e) => {
    try { localStorage.setItem('ptsviewer-randenstrak', e.target.checked ? '1' : '0'); } catch { /* geen opslag */ }
    if (xs && laatsteBestand) await laadBestand(laatsteBestand, true, detailStrook);
  });
  document.getElementById('oppervlakModus')?.addEventListener('change', async () => {
    werkRandenKnopBij();
    try { localStorage.setItem('ptsviewer-oppervlak', oppervlakModus()); } catch { /* geen opslag */ }
    volleProfielen = null; volleCache.clear();
    if (!xs) return;
    if (laatsteBestand) {
      await laadBestand(laatsteBestand, true, detailStrook);   // opnieuw inlezen met de andere keuze; as/BGT blijven
    } else {
      statusEl.textContent = 'Bovenkant/onderkant werkt pas na opnieuw inlezen van het oorspronkelijke .pts/.las/.laz-bestand (een project bevat alleen de al gekozen punten).';
    }
  });
  try {
    const o = localStorage.getItem('ptsviewer-oppervlak');
    const veld = document.getElementById('oppervlakModus');
    if (veld && (o === 'boven' || o === 'onder')) veld.value = o;
    const rs = localStorage.getItem('ptsviewer-randenstrak');
    const rv = document.getElementById('randenStrak');
    if (rv && (rs === '0' || rs === '1')) rv.checked = rs === '1';
  } catch { /* negeren */ }
  werkRandenKnopBij();
  try {
    const bewaard = localStorage.getItem('ptsviewer-puntdichtheid');
    const veld = document.getElementById('puntDichtheid');
    if (bewaard && veld && [...veld.options].some(o => o.value === bewaard)) veld.value = bewaard;
  } catch { /* negeren */ }
  controleerVorigeCrash();

  document.getElementById('kleurModus')?.addEventListener('change', (e) => {
    kleurModus = e.target.value === 'rgb' && cs ? 'rgb' : 'hoogte';
    kleurVoorkeur = kleurModus;
    tekenVlak();
    if (drieDActief) bouwDrieDGeometrie();
  });

  for (const id of ['toonBgt', 'toonBomen', 'toonKadaster', 'toonVakken']) document.getElementById(id)?.addEventListener('change', () => tekenVlak());
  const bgtWeergaveVeld = document.getElementById('bgtWeergave');
  bgtWeergaveVeld?.addEventListener('change', () => {
    bgtWeergave = bgtWeergaveVeld.value;
    tekenVlak();
  });

  luchtfotoKnop.addEventListener('click', () => {
    luchtfotoAan = !luchtfotoAan;
    luchtfotoKnop.classList.toggle('aan', luchtfotoAan);
    tekenVlak();
  });

  bgtOphalenKnop.addEventListener('click', async () => {
    if (!xs) return;
    bgtOphalenKnop.disabled = true;
    const b = grenzen();
    const marge = 5; // meter — iets ruimer dan de puntenwolk, voor context
    const bbox = [b.minX - marge, b.minY - marge, b.maxX + marge, b.maxY + marge];
    try {
      const nieuweLagen = await haalBgtOp(bbox, (laag) => {
        statusEl.textContent = `BGT ophalen bij PDOK… (${laag})`;
      }, bgtWeergave === 'lijnen');
      bgtLagen = bgtLagen.concat(nieuweLagen);
      wisBgtKnop.disabled = bgtLagen.length === 0;
      statusEl.textContent = nieuweLagen.length
        ? `BGT: ${nieuweLagen.length.toLocaleString('nl-NL')} vlak(ken)/lijn(en) opgehaald bij PDOK`
        : 'BGT: niets gevonden binnen dit gebied bij PDOK';
      tekenVlak();
      tekenDwarsVoorHuidigeStation(); // BGT-strip in het dwarsprofiel ook bijwerken
    } catch (err) {
      statusEl.textContent = `BGT ophalen mislukt: ${err.message}`;
    }
    bgtOphalenKnop.disabled = false;
  });

  bgtBestandVeld.addEventListener('change', async (e) => {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    if (/\.dxf$/i.test(bestand.name)) {
      e.target.value = '';
      await laadBgtDxf(bestand);
      return;
    }
    try {
      const geojson = JSON.parse(await bestand.text());
      bgtLagen = bgtLagen.concat(laadBgtGeoJSON(geojson));
      wisBgtKnop.disabled = false;
      statusEl.textContent = `BGT: ${bgtLagen.length.toLocaleString('nl-NL')} vlak(ken)/lijn(en) geladen (${bestand.name})`;
      tekenVlak();
      tekenDwarsVoorHuidigeStation(); // BGT-strip in het dwarsprofiel ook bijwerken
    } catch (err) {
      statusEl.textContent = `kon ${bestand.name} niet als GeoJSON lezen: ${err.message}`;
    }
    e.target.value = ''; // zelfde of volgende BGT-laag opnieuw kunnen kiezen
  });

  bomenOphalenKnop.addEventListener('click', async () => {
    if (!xs) return;
    bomenOphalenKnop.disabled = true;
    const b = grenzen();
    const marge = 5; // meter — iets ruimer dan de puntenwolk, voor context
    const bbox = [b.minX - marge, b.minY - marge, b.maxX + marge, b.maxY + marge];
    try {
      const nieuweLagen = await haalBomenOp(bbox);
      boomLagen = boomLagen.concat(nieuweLagen);
      wisBomenKnop.disabled = boomLagen.length === 0;
      statusEl.textContent = nieuweLagen.length
        ? `Bomen: ${nieuweLagen.length.toLocaleString('nl-NL')} opgehaald bij PDOK`
        : 'Bomen: niets gevonden binnen dit gebied bij PDOK';
      tekenVlak();
      tekenDwarsVoorHuidigeStation(); // bomen-kruisingen in het dwarsprofiel ook bijwerken
      if (drieDActief) bouwDrieDGeometrie(); // bomen in de 3D-weergave ook bijwerken
    } catch (err) {
      statusEl.textContent = `Bomen ophalen mislukt: ${err.message}`;
    }
    bomenOphalenKnop.disabled = false;
  });

  boomBestandVeld.addEventListener('change', async (e) => {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    try {
      const geojson = JSON.parse(await bestand.text());
      boomLagen = boomLagen.concat(laadBgtGeoJSON(geojson));
      wisBomenKnop.disabled = false;
      statusEl.textContent = `Bomen: ${boomLagen.length.toLocaleString('nl-NL')} geladen (${bestand.name})`;
      tekenVlak();
      tekenDwarsVoorHuidigeStation(); // bomen-kruisingen in het dwarsprofiel ook bijwerken
      if (drieDActief) bouwDrieDGeometrie(); // bomen in de 3D-weergave ook bijwerken
    } catch (err) {
      statusEl.textContent = `kon ${bestand.name} niet als GeoJSON lezen: ${err.message}`;
    }
    e.target.value = ''; // zelfde of volgende bomen-laag opnieuw kunnen kiezen
  });

  /* ────────────────────────────────────────────────────────────────
     Project opslaan/laden: de puntenwolk zelf wordt niet bewaard (die
     laadt de gebruiker gewoon opnieuw in vanaf het oorspronkelijke
     .pts/.las/.laz-bestand) — alleen de as, BGT/bomen-laag en de
     instellingen, in een klein JSON-bestandje.
     ──────────────────────────────────────────────────────────────── */
  function pasProjectToe(project) {
    wolkB = null; toonWolkA = true; toonWolkB = true;
    if (project.vergelijkWolk?.wolk) {
      const wb = decodeerPuntenwolk(project.vergelijkWolk.wolk);
      if (wb && wb.xs.length >= 3) {
        wolkB = maakWolkB(project.vergelijkWolk.naam || 'B', wb.xs, wb.ys, wb.zs, project.vergelijkWolk.alleenMaaiveld);
        toonWolkA = project.vergelijkWolk.toonA !== false; toonWolkB = project.vergelijkWolk.toonB !== false;
      }
    }
    werkWolkKeuzeBij();
    brugOnder = null; brugBoven = null; dvResultaat = null; dvAutoCache.sleutel = '';
    for (const rol of ['onder', 'boven']) {
      const b = project.brug?.[rol];
      if (!b?.wolk) continue;
      const w = decodeerPuntenwolk(b.wolk);
      if (w && w.xs.length >= 10) { const bw = maakBrugWolk(b.naam || rol, w.xs, w.ys, w.zs); if (rol === 'onder') brugOnder = bw; else brugBoven = bw; }
    }
    percelen = (project.percelen?.lijst || []).map(pc => maakPerceel({ kadastrale_gemeente_waarde: pc.gemeente, akr_kadastrale_gemeente_code_waarde: pc.code, sectie: pc.sectie, perceelnummer: pc.nummer, kadastrale_grootte_waarde: pc.grootte }, pc.ringen.map(r => r.map(([x, y]) => ({ x, y })))));
    perceelBron = percelen.length ? (project.percelen.bron || 'project') : '';
    palen = { ...PAAL_STANDAARD, ...(project.stationering || {}), lijst: (project.stationering?.lijst || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)) };
    palen.versie = (palen.versie || 0) + 1; paalCache.sleutel = '';
    zetPaalVelden(); werkPaalPaneelBij();
    werkKadasterKnoppenBij();
    begroeiing = null; snResultaat = null;
    if (project.begroeiing?.wolk) {
      const w = decodeerPuntenwolk(project.begroeiing.wolk);
      if (w && w.xs.length >= 50) { zetBegroeiing(project.begroeiing.naam || 'begroeiing', w.xs, w.ys, w.zs, null, project.begroeiing.half || 8); begroeiing.asSleutel = project.begroeiing.asSleutel || begroeiing.asSleutel; }
    }
    if (Array.isArray(project.assen) && project.assen.length) {
      resetAssen(project.assen.map((a, i) => ({ naam: String(a.naam || `As ${i + 1}`), punten: (a.punten || []).map(p => ({ x: p.x, y: p.y })) })), project.actieveAs || 0);
    } else {
      resetAssen([{ naam: 'As 1', punten: (project.asPunten || []).map(p => ({ x: p.x, y: p.y })) }]);
    }
    bgtLagen = project.bgtLagen || [];
    wisBgtKnop.disabled = bgtLagen.length === 0;
    boomLagen = project.boomLagen || [];
    wisBomenKnop.disabled = boomLagen.length === 0;
    huidigeStationIndex = 0;
    tekenModus = false;
    tekenAsKnop.classList.remove('aan');
    tekenAsKnop.textContent = 'Teken as';
    wisDwarsZoom();

    const inst = project.instellingen || {};
    if (inst.dwarsLinks != null && inst.dwarsRechts != null) { dwarsLinksVeld.value = inst.dwarsLinks; dwarsRechtsVeld.value = inst.dwarsRechts; dwarsBreedteVeld.value = String(profielL() + profielR()); }
    else if (inst.dwarsBreedte != null) { dwarsBreedteVeld.value = inst.dwarsBreedte; dwarsLinksVeld.value = String(inst.dwarsBreedte / 2); dwarsRechtsVeld.value = String(inst.dwarsBreedte / 2); }
    if (inst.dwarsInterval != null) dwarsIntervalVeld.value = inst.dwarsInterval;
    if (inst.maatDwars != null) maatDwarsVeld.value = inst.maatDwars;
    if (inst.dwarsOverdrijving != null) dwarsOverdrijvingVeld.value = inst.dwarsOverdrijving;
    if (inst.langsOverdrijving != null) langsOverdrijvingVeld.value = inst.langsOverdrijving;
    if (inst.printOverdrijving != null) printOverdrijvingVeld.value = inst.printOverdrijving;
    if (inst.maatLangs != null) maatLangsVeld.value = inst.maatLangs;
    if (inst.stapLangs != null) stapLangsVeld.value = inst.stapLangs;
    if (inst.bgtWeergave) { bgtWeergave = inst.bgtWeergave; if (bgtWeergaveVeld) bgtWeergaveVeld.value = bgtWeergave; }
    if (inst.kleurModus) { kleurVoorkeur = inst.kleurModus; kleurModus = inst.kleurModus === 'rgb' && cs ? 'rgb' : 'hoogte'; werkKleurKeuzeBij(); }
    { const wv = document.getElementById('waterpeil'); if (wv) wv.value = inst.waterpeil != null ? String(inst.waterpeil) : ''; }
    { const wk = document.getElementById('waterKant'); if (wk) wk.value = inst.waterKant || 'beide'; }
    if (inst.pdf) zetPdfInstellingen?.(inst.pdf);
    doorvaart = { ...DV_STANDAARD, ...(inst.doorvaart || {}) };
    delete doorvaart.gecontroleerd;
    snoei = { ...SN_STANDAARD, ...(inst.snoei || {}) };
    delete snoei.gecontroleerd;
    if (inst.toonLangsprofiel != null) {
      toonLangsprofielVeld.checked = inst.toonLangsprofiel;
      toonLangsprofielVeld.dispatchEvent(new Event('change'));
    }

    if (inst.doorvaart?.gecontroleerd) { try { voerDoorvaartUit(); } catch { dvResultaat = null; } }
    werkDoorvaartPaneelBij();
    if (inst.snoei?.gecontroleerd && begroeiing) { try { voerSnoeiUit(); } catch { snResultaat = null; } }
    werkSnoeiPaneelBij();
    tekenVlak();
    bijwerkenProfielen();
    if (drieDActief) bouwDrieDGeometrie();
  }

  /** Puntenwolk compact coderen: Float32 t.o.v. een oorsprong (± 0,1 mm
   *  nauwkeurig binnen een paar km), als base64. */
  function codeerPuntenwolk() { return codeerWolk(xs, ys, zs, cs); }
  /** Puntenwolk compact coderen (float32 + base64); parameters overschaduwen bewust de globale namen. */
  /* Puntenwolk in het project: float32 + base64, net als voorheen (zelfde bestandsformaat).
     Maar de base64-tekst wordt niet meer in één keer als reuzen-string gemaakt: codeerWolk
     zet de bytes klaar en maakProjectBlob schrijft ze in stukjes van ± 4 MB rechtstreeks in
     het bestand. Bij 10 miljoen punten scheelt dat honderden MB geheugen (en een crash). */
  let projectBinair = null;   // [Uint8Array, …] tijdens het opslaan
  const binairToken = (i) => `@@PV-BINAIR-${i}@@`;
  function binairDeel(bytes) {
    if (!projectBinair) projectBinair = [];
    projectBinair.push(bytes);
    return binairToken(projectBinair.length - 1);
  }
  function codeerWolk(xs, ys, zs, cs) {
    if (!xs || !xs.length) return null;
    const ox = Math.floor(xs[0]), oy = Math.floor(ys[0]);
    const data = new Float32Array(xs.length * 3);
    for (let i = 0; i < xs.length; i++) {
      data[i * 3] = xs[i] - ox; data[i * 3 + 1] = ys[i] - oy; data[i * 3 + 2] = zs[i];
    }
    let rgb = null;
    if (cs) {
      const kb = new Uint8Array(cs.length * 3);
      for (let i = 0; i < cs.length; i++) { kb[i * 3] = (cs[i] >> 16) & 255; kb[i * 3 + 1] = (cs[i] >> 8) & 255; kb[i * 3 + 2] = cs[i] & 255; }
      rgb = binairDeel(kb);
    }
    return { formaat: 'f32-xyz-base64', aantal: xs.length, oorsprong: [ox, oy], data: binairDeel(new Uint8Array(data.buffer)), rgb };
  }
  /** Bytes → base64 in stukjes (veelvoud van 3 bytes, dan plakken de stukjes foutloos aan elkaar). */
  function base64Stukken(bytes) {
    const uit = [], STUK = 3 * 1024 * 1024;
    for (let i = 0; i < bytes.length; i += STUK) {
      const deel = bytes.subarray(i, Math.min(bytes.length, i + STUK));
      let bin = '';
      for (let j = 0; j < deel.length; j += 0x8000) bin += String.fromCharCode.apply(null, deel.subarray(j, j + 0x8000));
      uit.push(btoa(bin));
    }
    return uit;
  }
  /** Projecttekst → object. De grote base64-velden (puntenwolken) gaan niet door JSON.parse
   *  (dat zou er nog eens een kopie van honderden MB van maken): eerst vervangen door een
   *  verwijzing, en pas bij het decoderen rechtstreeks uit de tekst gelezen. */
  function leesProjectTekst(tekst) {
    const groot = [], delen = [];
    // zelf zoeken met indexOf: een regex met {100000,} loopt op honderden MB tekst vast (stack)
    const plekken = [];
    for (const sleutel of ['"data":"', '"rgb":"']) {
      for (let i = tekst.indexOf(sleutel); i >= 0; i = tekst.indexOf(sleutel, i + 1)) {
        const begin = i + sleutel.length, eind = tekst.indexOf('"', begin);
        if (eind < 0) break;
        if (eind - begin >= 100000) plekken.push([i, sleutel, begin, eind]);
      }
    }
    plekken.sort((p, q) => p[0] - q[0]);
    let vanaf = 0;
    for (const [i, sleutel, begin, eind] of plekken) {
      if (i < vanaf) continue;
      delen.push(tekst.slice(vanaf, i), `${sleutel}@@PV-LEES-${groot.length}@@"`);
      groot.push([begin, eind]);   // begin/eind van de base64 in de tekst
      vanaf = eind + 1;
    }
    if (!groot.length) return JSON.parse(tekst);
    delen.push(tekst.slice(vanaf));
    return JSON.parse(delen.join(''), (k, v) => {
      const m = typeof v === 'string' && /^@@PV-LEES-(\d+)@@$/.exec(v);
      return m ? { base64Tekst: tekst, van: groot[Number(m[1])][0], tot: groot[Number(m[1])][1] } : v;
    });
  }
  /** Base64 → bytes, ook in stukjes (geen reuzen-string uit atob). */
  function base64NaarBytes(t) {
    // t = gewone base64-tekst, of {base64Tekst, van, tot}: een stuk uit de projecttekst
    const T = typeof t === 'string' ? t : t.base64Tekst, van = typeof t === 'string' ? 0 : t.van, tot = typeof t === 'string' ? t.length : t.tot;
    const lengte = tot - van, slot = T.slice(Math.max(van, tot - 2), tot);
    const n = Math.floor(lengte / 4) * 3 - (slot === '==' ? 2 : slot.endsWith('=') ? 1 : 0);
    const uit = new Uint8Array(n);
    const STUK = 4 * 1024 * 1024;   // veelvoud van 4 tekens
    let p = 0;
    for (let i = van; i < tot; i += STUK) {
      const bin = atob(T.slice(i, Math.min(tot, i + STUK)));
      for (let j = 0; j < bin.length; j++) uit[p++] = bin.charCodeAt(j);
    }
    return uit;
  }
  function decodeerPuntenwolk(pw) {
    if (!pw || pw.formaat !== 'f32-xyz-base64') return null;
    const bytes = base64NaarBytes(pw.data);
    const data = new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
    const [ox, oy] = pw.oorsprong;
    const n = Math.floor(data.length / 3);
    const px = new Array(n), py = new Array(n), pz = new Array(n);
    for (let i = 0; i < n; i++) { px[i] = data[i * 3] + ox; py[i] = data[i * 3 + 1] + oy; pz[i] = data[i * 3 + 2]; }
    let kleuren = null;
    if (pw.rgb) {
      const kb = base64NaarBytes(pw.rgb);
      if (kb.length === n * 3) {
        kleuren = new Array(n);
        for (let i = 0; i < n; i++) kleuren[i] = (kb[i * 3] << 16) | (kb[i * 3 + 1] << 8) | kb[i * 3 + 2];
      }
    }
    // verwijzingen naar de (grote) projecttekst loslaten, dan kan die uit het geheugen
    if (typeof pw.data === 'object') pw.data = null;
    if (pw.rgb && typeof pw.rgb === 'object') pw.rgb = null;
    return { xs: px, ys: py, zs: pz, cs: kleuren };
  }

  /**
   * Opslaan met een "Opslaan als"-venster, zodat je zelf map en naam kiest
   * (Chrome/Edge). De browser onthoudt per soort (pdf/project) de laatst
   * gekozen map. Het venster mag alleen direct na een klik open, dus eerst
   * kiezen (kiesOpslag) en pas daarna het bestand maken en schrijven.
   * Uitgezet, of niet ondersteund: zoals vroeger naar de map Downloads.
   */
  function opslaanVragen() {
    try { return localStorage.getItem('ptsviewer-opslaan-vragen') !== 'nee'; } catch { return true; }
  }
  /** → FileSystemFileHandle, null (= naar Downloads) of false (= geannuleerd). */
  async function kiesOpslag(naam, soort) {
    // met een projectmap: uitvoer gaat zonder vragen naar uitvoer\ (bestaat de naam al, dan _2, _3, …)
    if (projectMap && soort !== 'project' && soort !== 'instellingen') {
      try {
        const uit = await projectMap.getDirectoryHandle('uitvoer', { create: true });
        const h = await uit.getFileHandle(await vrijeNaam(uit, naam), { create: true });
        h.pvInUitvoer = true;
        return h;
      } catch (err) { console.warn('uitvoer-map niet bruikbaar, val terug op het opslaan-venster:', err); }
    }
    if (!opslaanVragen() || !window.showSaveFilePicker) return null;
    const types = soort === 'pdf'
      ? [{ description: 'PDF-tekening', accept: { 'application/pdf': ['.pdf'] } }]
      : soort === 'dxf'
        ? [{ description: 'DXF-tekening (AutoCAD / Civil 3D)', accept: { 'application/dxf': ['.dxf'] } }]
        : soort === 'gpkg'
          ? [{ description: 'GeoPackage (QGIS, ArcGIS)', accept: { 'application/geopackage+sqlite3': ['.gpkg'] } }]
        : soort === 'csv'
          ? [{ description: 'Snoeilijst (CSV, opent in Excel)', accept: { 'text/csv': ['.csv'] } }]
        : soort === 'ifc'
          ? [{ description: 'IFC 4.3 (openBIM)', accept: { 'application/x-step': ['.ifc'] } }]
        : soort === 'instellingen'
          ? [{ description: 'Profielviewer-instellingen', accept: { 'application/json': ['.json'] } }]
        : [{ description: 'Profielviewer-project', accept: { 'application/json': ['.json'] } }];
    try {
      return await window.showSaveFilePicker({ suggestedName: naam, types, id: `ptsviewer-${soort}`, startIn: 'documents' });
    } catch (err) {
      if (err.name === 'AbortError') return false;
      console.warn('Opslaan-als niet mogelijk, val terug op Downloads:', err);
      return null;
    }
  }
  async function vrijeNaam(map, naam) {
    naam = veiligeBestandsnaam(naam);
    const punt = naam.lastIndexOf('.'), stam = punt > 0 ? naam.slice(0, punt) : naam, ext = punt > 0 ? naam.slice(punt) : '';
    for (let i = 1; i < 1000; i++) {
      const n = i === 1 ? naam : `${stam}_${i}${ext}`;
      try { await map.getFileHandle(n); } catch { return n; }
    }
    return `${stam}_${Date.now()}${ext}`;
  }
  async function schrijfBestand(handle, blob, naam) {
    if (handle) {
      try {
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        // controleren of het er ook echt (helemaal) staat
        const f = await handle.getFile?.();
        if (f && f.size !== blob.size) throw new Error(`bestand is ${f.size} bytes i.p.v. ${blob.size}`);
        statusEl.textContent = `Opgeslagen: ${handle.pvInUitvoer ? `${projectMap?.name || ''}\\uitvoer\\` : ''}${handle.name} (${(blob.size / 1e6).toFixed(1)} MB)`;
        return handle.name;
      } catch (err) {
        console.warn('Schrijven mislukt, val terug op Downloads:', err);
        toonFout(`Opslaan in ${handle.name} is mislukt (${err.message || err}) — het bestand gaat nu naar Downloads.`);
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = naam; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    statusEl.textContent = `Opgeslagen in Downloads: ${naam}`;
    return naam;
  }

  /* ────────────────────────────────────────────────────────────────
     DOORVAART: controle van de doorvaarthoogte (en -diepte) onder een brug.
     - Puntenwolk A = de bodem (peiling/multibeam, eventueel met oevers).
     - Brugwolken: onderzijde (rekent mee) en bovenzijde (alleen beeld).
       Ruwe punten met een rasterindex; geen driehoeksnet, zodat liggers en
       leidingen niet worden "weggeïnterpoleerd".
     - Doorvaartbox in de dwarsdoorsnede van de vaarweg: breedte B, hoogte H
       boven de toetswaterstand, optioneel een vereiste diepte D onder een
       (lage) waterstand; ligging t.o.v. de as (verschuiving), lengte = de
       stations waar de brug ligt + een marge (of zelf op te geven).
     - Toets op de ruwe punten: losse punten (vogels, spatwater) tellen niet
       mee — een punt telt als er binnen 0,5 m genoeg andere punten liggen.
     ──────────────────────────────────────────────────────────────── */
  let brugOnder = null, brugBoven = null;   // { naam, xs, ys, zs, idx, r }
  const DV_STANDAARD = { toetspeil: '', hoogte: 5, breedte: 20, verschuiving: 0, dieptePeil: '', diepte: '', stVan: '', stTot: '', marge: 10, minPunten: 5, tonen: true, weergave: 'schip', klasse: 'Va', scheepslengte: 110, scheepsbreedte: 11.4 };
  const CEMT = { I: [38.5, 5.05], II: [55, 6.6], III: [80, 8.2], IV: [85, 9.5], Va: [110, 11.4] };
  let doorvaart = { ...DV_STANDAARD };
  let dvResultaat = null;

  function maakRasterIndex(xs, ys, cel = 0.5) {
    const n = xs.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { if (xs[i] < x0) x0 = xs[i]; if (xs[i] > x1) x1 = xs[i]; if (ys[i] < y0) y0 = ys[i]; if (ys[i] > y1) y1 = ys[i]; }
    let nx, ny;
    for (;;) { nx = Math.max(1, Math.floor((x1 - x0) / cel) + 1); ny = Math.max(1, Math.floor((y1 - y0) / cel) + 1); if (nx * ny <= 2e7) break; cel *= 2; }
    const start = new Int32Array(nx * ny + 1), celVan = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const c = Math.floor((xs[i] - x0) / cel) + Math.floor((ys[i] - y0) / cel) * nx;
      celVan[i] = c; start[c + 1]++;
    }
    for (let c = 0; c < nx * ny; c++) start[c + 1] += start[c];
    const vul = start.slice(0, nx * ny), volgorde = new Int32Array(n);
    for (let i = 0; i < n; i++) volgorde[vul[celVan[i]]++] = i;
    const opp = Math.max(1, (x1 - x0) * (y1 - y0));
    return { cel, x0, y0, x1, y1, nx, ny, start, volgorde, afstand: Math.sqrt(opp / Math.max(1, n)) };
  }
  function rondom(w, x, y, r, cb) {
    const I = w.idx;
    const ix0 = Math.max(0, Math.floor((x - r - I.x0) / I.cel)), ix1 = Math.min(I.nx - 1, Math.floor((x + r - I.x0) / I.cel));
    const iy0 = Math.max(0, Math.floor((y - r - I.y0) / I.cel)), iy1 = Math.min(I.ny - 1, Math.floor((y + r - I.y0) / I.cel));
    const r2 = r * r;
    for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
      const c = ix + iy * I.nx;
      for (let k = I.start[c]; k < I.start[c + 1]; k++) {
        const i = I.volgorde[k], dx = w.xs[i] - x, dy = w.ys[i] - y;
        if (dx * dx + dy * dy <= r2) cb(i);
      }
    }
  }
  /** Hoogte van de brug op (x, y): onderzijde = op één na laagste punt in de
   *  buurt (één los punt telt niet), bovenzijde = op één na hoogste. */
  function brugHoogteOp(w, x, y, soort) {
    if (!w) return null;
    const z = [];
    rondom(w, x, y, w.r, (i) => z.push(w.zs[i]));
    if (z.length < 2) return null;
    z.sort((a, b) => a - b);
    return soort === 'onder' ? z[1] : z[z.length - 2];
  }
  function maakBrugWolk(naam, bx, by, bz) {
    const xs2 = Float64Array.from(bx), ys2 = Float64Array.from(by), zs2 = Float64Array.from(bz);
    const idx = maakRasterIndex(xs2, ys2, 0.5);
    return { naam, xs: xs2, ys: ys2, zs: zs2, idx, r: Math.max(0.2, Math.min(1.0, idx.afstand * 1.8)) };
  }
  /** Vult de brughoogtes in een reeks (dwars- of lengteprofiel). puntVan(p) → {x, y} */
  function vulBrugHoogtes(reeks, puntVan) {
    if (!brugOnder && !brugBoven) return;
    for (const p of reeks) {
      const q = puntVan(p);
      if (brugOnder) p.hoogteO = brugHoogteOp(brugOnder, q.x, q.y, 'onder');
      if (brugBoven) p.hoogteD = brugHoogteOp(brugBoven, q.x, q.y, 'boven');
    }
  }

  const dvGetal = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  function dvPdfMogelijk() { return !!(xs && asPunten.length >= 2 && (brugOnder || (dvGetal(doorvaart.diepte) > 0)) && dvKader()); }
  function dvToetspeil() { return dvGetal(doorvaart.toetspeil) ?? waterpeil(); }
  let dvAutoCache = { sleutel: '', bereik: null };
  /** Stations waar de brug boven de vaarweg ligt (+ marge), of de zelf opgegeven grenzen. */
  function dvBereik() {
    if (asPunten.length < 2) return null;
    const s = stationsLangsAs(), L = s[s.length - 1];
    const van = dvGetal(doorvaart.stVan), tot = dvGetal(doorvaart.stTot);
    if (van != null && tot != null && tot > van) return { s0: Math.max(0, van), s1: Math.min(L, tot), auto: false };
    const marge = Math.max(0, dvGetal(doorvaart.marge) ?? 10);
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const sleutel = `${asPunten.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(';')}|${brugOnder ? brugOnder.xs.length : 0}|${brugBoven ? brugBoven.xs.length : 0}|${breedte}`;
    if (dvAutoCache.sleutel !== sleutel) {
      let lo = Infinity, hi = -Infinity;
      const w = brugOnder || brugBoven;
      if (w) {
        const stap = Math.max(1, Math.floor(w.xs.length / 40000));
        for (let i = 0; i < w.xs.length; i += stap) {
          const so = stationOffsetVanPunt(w.xs[i], w.ys[i]);
          if (!so || so.offset < -pL || so.offset > pR || so.station <= 1e-6 || so.station >= L - 1e-6) continue;
          if (so.station < lo) lo = so.station; if (so.station > hi) hi = so.station;
        }
      }
      dvAutoCache = { sleutel, bereik: isFinite(lo) ? { lo, hi } : null };
    }
    const b = dvAutoCache.bereik;
    if (!b) return { s0: 0, s1: L, auto: true, zonderBrug: true };
    return { s0: Math.max(0, b.lo - marge), s1: Math.min(L, b.hi + marge), auto: true, brugVan: b.lo, brugTot: b.hi };
  }
  /** Afmetingen van de box, of null als er (nog) niets te tonen is. */
  function dvKader() {
    const P = dvToetspeil();
    const B = dvGetal(doorvaart.breedte), H = dvGetal(doorvaart.hoogte);
    if (P == null || !(B > 0) || !(H > 0) || asPunten.length < 2) return null;
    const bereik = dvBereik();
    if (!bereik) return null;
    const D = dvGetal(doorvaart.diepte);
    const PD = D > 0 ? (dvGetal(doorvaart.dieptePeil) ?? waterpeil() ?? P) : null;
    return { P, B, H, c: dvGetal(doorvaart.verschuiving) ?? 0, D: D > 0 ? D : null, PD, ...bereik };
  }

  /* ────────────────────────────────────────────────────────────────
     Dekkingskaart: waar is er binnen de toets wél en níet gemeten?
     Een toets op een puntenwolk zegt alleen iets over de plekken waar
     punten liggen. Onder een brug valt de onderzijde vaak deels weg
     (schaduw achter een ligger, een gemiste baan); de bodem van een
     multibeam heeft gaten; in een bos kan een baan ontbreken. Daar
     "voldoet" de toets alleen omdat er niets gemeten is.
     Raster van vakjes (station × offset) over het toetsgebied:
     - gemeten   = er ligt minstens één (gefilterd) punt in het vakje
     - te toetsen = het vakje hoort gemeten te zijn: bij de brug het
       dek (bovenzijde, of ingesloten tussen gemeten vakjes), bij bodem
       en snoeicheck het hele toetsgebied
     - gat       = te toetsen maar niet gemeten
     Gaten worden samengevoegd tot plekken (8-buren); kleine plekjes
     (< minOpp m²) tellen wel mee in het percentage, niet in de lijst.
     ──────────────────────────────────────────────────────────────── */
  function maakDekking(opt) {
    let cel = Math.max(0.1, opt.cel || 0.5);
    let ns, no;
    for (;;) { ns = Math.max(1, Math.ceil((opt.s1 - opt.s0) / cel)); no = Math.max(1, Math.ceil((opt.o1 - opt.o0) / cel)); if (ns * no <= 3e6) break; cel *= 1.5; }
    const N = ns * no, s0 = opt.s0, o0 = opt.o0;
    const plek = (s, o) => { const i = Math.floor((s - s0) / cel), j = Math.floor((o - o0) / cel); return i < 0 || j < 0 || i >= ns || j >= no ? -1 : i * no + j; };
    const gem = new Uint8Array(N);
    const zx = opt.z ? new Float32Array(N).fill(NaN) : null, isMin = opt.z === 'min';
    opt.gemeten((s, o, z) => {
      const k = plek(s, o); if (k < 0) return;
      gem[k] = 1;
      if (zx && z != null && (Number.isNaN(zx[k]) || (isMin ? z < zx[k] : z > zx[k]))) zx[k] = z;
    });
    const voet = new Uint8Array(N);
    if (opt.alles) voet.fill(1);
    else {
      for (let k = 0; k < N; k++) if (gem[k]) voet[k] = 1;
      if (opt.dak) {
        const dak = new Uint8Array(N);
        opt.dak((s, o) => { const k = plek(s, o); if (k >= 0) dak[k] = 1; });
        // kleine gaatjes in de bovenzijde zelf dichten (vakje met ≥ 5 van de 8 buren onder het dek)
        const dicht = Uint8Array.from(dak);
        for (let i = 1; i < ns - 1; i++) for (let j = 1; j < no - 1; j++) {
          const k = i * no + j; if (dak[k]) continue;
          let n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += dak[k + a * no + b];
          if (n >= 5) dicht[k] = 1;
        }
        // de rand van het dek telt alleen als de buren ook onder het dek liggen: anders geeft één vakje
        // verschil tussen boven- en onderzijde een vals "gat" langs de hele rand
        for (let i = 0; i < ns; i++) for (let j = 0; j < no; j++) {
          const k = i * no + j;
          if (!dicht[k] || gem[k]) continue;
          const ok = (ii, jj) => ii >= 0 && jj >= 0 && ii < ns && jj < no && (dicht[ii * no + jj] || gem[ii * no + jj]);
          if (ok(i - 1, j) && ok(i + 1, j) && ok(i, j - 1) && ok(i, j + 1)) voet[k] = 1;
        }
      } else {
        // zonder bovenzijde: een niet-gemeten vakje dat in de lengte óf de breedte ingesloten ligt tussen gemeten vakjes
        const maxRun = Math.max(2, Math.round((opt.maxGat || 20) / cel));
        const vul = (lengte, stap, index) => {
          for (let a = 0; a < index.n; a++) {
            let vorige = -1;
            for (let b = 0; b < lengte; b++) {
              const k = index.k(a, b);
              if (!gem[k]) continue;
              if (vorige >= 0 && b - vorige > 1 && b - vorige - 1 <= maxRun) for (let c = vorige + 1; c < b; c++) voet[index.k(a, c)] = 1;
              vorige = b;
            }
          }
          void stap;
        };
        vul(ns, 1, { n: no, k: (j, i) => i * no + j });   // per offset-kolom langs het station
        vul(no, 1, { n: ns, k: (i, j) => i * no + j });   // per station dwars
      }
    }
    // alleen tellen binnen het toetsgebied (bv. de box), op het midden van het vakje
    const binnen = new Uint8Array(N);
    let nGem = 0, nGat = 0;
    for (let i = 0; i < ns; i++) for (let j = 0; j < no; j++) {
      const k = i * no + j, s = s0 + (i + 0.5) * cel, o = o0 + (j + 0.5) * cel;
      if (opt.binnen && !opt.binnen(s, o)) continue;
      if (!voet[k]) continue;
      binnen[k] = 1;
      if (gem[k]) nGem++; else nGat++;
    }
    // gaten samenvoegen tot plekken
    const gezien = new Uint8Array(N), gaten = [];
    const minOpp = opt.minOpp ?? 1;
    for (let k0 = 0; k0 < N; k0++) {
      if (!binnen[k0] || gem[k0] || gezien[k0]) continue;
      const stapel = [k0], cellen = []; gezien[k0] = 1;
      let iMin = Infinity, iMax = -Infinity, jMin = Infinity, jMax = -Infinity;
      while (stapel.length) {
        const k = stapel.pop(); cellen.push(k);
        const i = Math.floor(k / no), j = k - i * no;
        if (i < iMin) iMin = i; if (i > iMax) iMax = i; if (j < jMin) jMin = j; if (j > jMax) jMax = j;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const ii = i + a, jj = j + b;
          if (ii < 0 || jj < 0 || ii >= ns || jj >= no) continue;
          const kk = ii * no + jj;
          if (binnen[kk] && !gem[kk] && !gezien[kk]) { gezien[kk] = 1; stapel.push(kk); }
        }
      }
      const opp = cellen.length * cel * cel;
      if (opp + 1e-9 < minOpp) continue;
      // de laagste (onderzijde) of hoogste (bodem) gemeten hoogte rondom de plek
      let rand = null;
      if (zx) for (const k of cellen) {
        const i = Math.floor(k / no), j = k - i * no;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= ns || jj >= no) continue;
          const z = zx[ii * no + jj]; if (Number.isNaN(z)) continue;
          if (rand == null || (isMin ? z < rand : z > rand)) rand = z;
        }
      }
      const g = { s0: s0 + iMin * cel, s1: s0 + (iMax + 1) * cel, o0: o0 + jMin * cel, o1: o0 + (jMax + 1) * cel, opp, cellen, rand };
      g.sMid = (g.s0 + g.s1) / 2; g.oMid = (g.o0 + g.o1) / 2;
      gaten.push(g);
    }
    gaten.sort((a, b) => b.opp - a.opp);
    const tot = nGem + nGat;
    return {
      cel, ns, no, s0, o0, gem, binnen, gaten, nGem, nGat,
      pct: tot ? 100 * nGem / tot : 100,
      oppTotaal: tot * cel * cel, oppGat: nGat * cel * cel, oppGatLijst: gaten.reduce((a, g) => a + g.opp, 0),
      // het midden van een vakje, voor tekenen en de randhoogte
      vak: (k) => { const i = Math.floor(k / no), j = k - i * no; return { s: s0 + (i + 0.5) * cel, o: o0 + (j + 0.5) * cel }; },
    };
  }
  /** Schatting van de puntafstand (m) uit het aantal punten per bezet vakje van 0,5 m. */
  function lokalePuntafstand(lus) {
    const tel = new Map();
    lus((s, o) => { const k = Math.floor(s * 2) * 1e6 + Math.floor(o * 2); tel.set(k, (tel.get(k) || 0) + 1); });
    if (!tel.size) return 0.5;
    const v = [...tel.values()].sort((a, b) => a - b), med = v[Math.floor(v.length / 2)];
    return Math.sqrt(0.25 / Math.max(1, med));
  }
  const dekkingCel = (afstand) => Math.max(0.5, Math.min(2, Math.round(afstand * 2.5 * 4) / 4));
  /** Korte beschrijving van een gat: "st. 12,0 – 16,5 m, 3,0 – 6,5 m L, 14 m²". */
  function gatTekst(g) {
    const kant = (a, b) => {
      if (a >= -0.05) return `${komma(a, 1)} – ${komma(b, 1)} m R`;
      if (b <= 0.05) return `${komma(-b, 1)} – ${komma(-a, 1)} m L`;
      return `${komma(-a, 1)} m L – ${komma(b, 1)} m R`;
    };
    return `st. ${komma(g.s0, 1)} – ${komma(g.s1, 1)} m${paalAchter(g.s0, ' (') ? paalAchter(g.s0, ' (') + ')' : ''}, ${kant(g.o0, g.o1)}, ${komma(g.opp, g.opp < 10 ? 1 : 0)} m²`;
  }

  /** Dekkingskaart van de doorvaarttoets als beeld (PNG): station horizontaal, L boven, R onder.
   *  Grijs = onderzijde gemeten, donker gearceerd = onderzijde niet gemeten, blauw gearceerd = bodem niet gemeten. */
  /** jsPDF (standaardfont) kent geen ²: m² → m2. */
  const pdfTekst = (t) => String(t).replace(/²/g, '2');
  const DEKKING_MARGE = { l: 12, r: 3, t: 3, b: 9, leg: 12 };   // mm rond de dekkingskaart (as-labels, legenda)
  function dekkingsKaartBeeld(r, wPx, hPx, pxPerMm, opname = null) {
    const dH = r.dekkingH, dD = r.dekkingD;
    if (!dH && !dD) return null;
    const c = opname ? opname.canvas : document.createElement('canvas'); c.width = Math.round(wPx); c.height = Math.round(hPx);
    const g = opname || c.getContext('2d'), mm = pxPerMm;
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    const M = DEKKING_MARGE, legH = M.leg * mm, kopL = M.l * mm, kopB = M.b * mm, kopT = M.t * mm, kopR = M.r * mm;
    const s0 = r.s0, s1 = r.s1, oLo = r.c - r.B / 2 - 2, oHi = r.c + r.B / 2 + 2;
    const sc = Math.min((c.width - kopL - kopR) / (s1 - s0), (c.height - legH - kopB - kopT) / (oHi - oLo));
    const x0 = kopL + ((c.width - kopL - kopR) - (s1 - s0) * sc) / 2, y0 = kopT;
    const X = (s) => x0 + (s - s0) * sc, Y = (o) => y0 + (o - oLo) * sc;   // L (negatief) boven
    const arceer = (kleur) => {
      const p = document.createElement('canvas'), m = Math.max(5, Math.round(1.6 * mm)); p.width = p.height = m;
      const q = p.getContext('2d'); q.fillStyle = 'rgba(255,255,255,1)'; q.fillRect(0, 0, m, m);
      q.strokeStyle = kleur; q.lineWidth = Math.max(1, 0.25 * mm); q.beginPath(); q.moveTo(0, m); q.lineTo(m, 0); q.moveTo(-m / 2, m / 2); q.lineTo(m / 2, -m / 2); q.moveTo(m / 2, m * 1.5); q.lineTo(m * 1.5, m / 2); q.stroke();
      return g.createPattern(p, 'repeat');
    };
    const vakjes = (d, filter, stijl) => {
      if (!d) return;
      g.fillStyle = stijl; g.beginPath();
      for (let k = 0; k < d.binnen.length; k++) {
        if (!filter(d, k)) continue;
        const { s, o } = d.vak(k), h = d.cel / 2;
        if (o + h < oLo || o - h > oHi) continue;
        g.rect(X(s - h), Y(o - h), d.cel * sc + 0.5, d.cel * sc + 0.5);
      }
      g.fill();
    };
    vakjes(dH, (d, k) => d.binnen[k] && d.gem[k], '#D5DBE2');
    vakjes(dD, (d, k) => d.binnen[k] && !d.gem[k], arceer('#1E6FA6'));
    vakjes(dH, (d, k) => d.binnen[k] && !d.gem[k], arceer('#2C3444'));
    // omtrek van de plekken
    g.setLineDash([1.2 * mm, 0.8 * mm]); g.lineWidth = Math.max(1, 0.3 * mm);
    for (const [d, kl] of [[dD, '#1E6FA6'], [dH, '#2C3444']]) for (const gt of d?.gaten || []) { g.strokeStyle = kl; g.strokeRect(X(gt.s0), Y(gt.o0), (gt.s1 - gt.s0) * sc, (gt.o1 - gt.o0) * sc); }
    g.setLineDash([]);
    // conflicten
    g.fillStyle = '#C6472B';
    const alle = [...(r.conflictenH || []), ...(r.conflictenD || [])];
    const stap = Math.max(1, Math.floor(alle.length / 4000));
    for (let i = 0; i < alle.length; i += stap) { const p = alle[i]; if (p.offset < oLo || p.offset > oHi) continue; g.fillRect(X(p.station) - 0.35 * mm, Y(p.offset) - 0.35 * mm, 0.7 * mm, 0.7 * mm); }
    // box en as
    g.strokeStyle = r.ok ? '#16803D' : '#C6472B'; g.lineWidth = 0.45 * mm; g.setLineDash([2 * mm, 1 * mm]);
    g.strokeRect(X(s0), Y(r.c - r.B / 2), (s1 - s0) * sc, r.B * sc);
    g.strokeStyle = '#1B2A38'; g.lineWidth = 0.3 * mm; g.setLineDash([3 * mm, 0.8 * mm, 0.6 * mm, 0.8 * mm]);
    g.beginPath(); g.moveTo(X(s0), Y(0)); g.lineTo(X(s1), Y(0)); g.stroke(); g.setLineDash([]);
    // nummers van de plekken (zelfde volgorde als de tabel: eerst onderzijde, dan bodem)
    [...(dH?.gaten || []).map(gt => [gt, '#2C3444']), ...(dD?.gaten || []).map(gt => [gt, '#1E6FA6'])].forEach(([gt, kl], i) => {
      const cx = X(gt.sMid), cy = Y(Math.max(oLo + 1, Math.min(oHi - 1, gt.oMid)));
      g.beginPath(); g.arc(cx, cy, 2.3 * mm, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 0.35 * mm; g.strokeStyle = kl; g.stroke();
      g.fillStyle = kl; g.font = `bold ${2.6 * mm}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), cx, cy + 0.1 * mm);
    });
    // assen: station onder, L/R links
    g.fillStyle = '#42505F'; g.font = `${2.6 * mm}px Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'top';
    const stapS = [1, 2, 5, 10, 20, 25, 50, 100].find(v => (v * sc) >= 11 * mm) || 100;
    g.strokeStyle = '#9AA6B2'; g.lineWidth = Math.max(1, 0.15 * mm);
    for (let s = Math.ceil(s0 / stapS) * stapS; s <= s1 + 1e-6; s += stapS) { g.beginPath(); g.moveTo(X(s), Y(oHi)); g.lineTo(X(s), Y(oHi) + 1 * mm); g.stroke(); g.fillText(String(s), X(s), Y(oHi) + 1.4 * mm); }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText('L', X(s0) - 2 * mm, Y(oLo + 1)); g.fillText('R', X(s0) - 2 * mm, Y(oHi - 1)); g.fillText('as', X(s0) - 2 * mm, Y(0));
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('station (m)', X(s1) - 16 * mm, Y(oHi) + 4.6 * mm);
    // legenda
    const ly = c.height - legH + 4 * mm;
    let lx = kopL;
    const item = (teken, tekst) => { teken(lx, ly); g.fillStyle = '#42505F'; g.textBaseline = 'middle'; g.fillText(tekst, lx + 6 * mm, ly + 1.5 * mm); lx += 6 * mm + g.measureText(tekst).width + 5 * mm; };
    g.font = `${2.4 * mm}px Helvetica, Arial, sans-serif`;
    if (dH) item((x, y) => { g.fillStyle = '#D5DBE2'; g.fillRect(x, y, 4.5 * mm, 3 * mm); }, `onderzijde gemeten (${komma(Math.min(dH.pct, dH.pct >= 99.95 ? 100 : 99.9), 1)} %)`);
    if (dH) item((x, y) => { g.fillStyle = arceer('#2C3444'); g.fillRect(x, y, 4.5 * mm, 3 * mm); g.strokeStyle = '#2C3444'; g.strokeRect(x, y, 4.5 * mm, 3 * mm); }, 'onderzijde niet gemeten');
    if (dD) item((x, y) => { g.fillStyle = arceer('#1E6FA6'); g.fillRect(x, y, 4.5 * mm, 3 * mm); g.strokeStyle = '#1E6FA6'; g.strokeRect(x, y, 4.5 * mm, 3 * mm); }, `bodem niet gemeten (${komma(Math.min(dD.pct, dD.pct >= 99.95 ? 100 : 99.9), 1)} % gemeten)`);
    if (alle.length) item((x, y) => { g.fillStyle = '#C6472B'; for (const [a, b] of [[1, 1], [2.5, 2], [3.5, 0.6]]) g.fillRect(x + a * mm, y + b * mm, 0.8 * mm, 0.8 * mm); }, 'conflict');
    return opname ? null : c.toDataURL('image/png');
  }

  let arceerPatroon = null;
  /** Niet-gemeten vakjes in het bovenaanzicht: grijs gearceerd, met een rand om de grote plekken. */
  function tekenDekkingOpCanvas(ctx, naarPx, dek, opt = {}) {
    if (!dek || !dek.nGat) return;
    const pt = opt.pt || 1, W = opt.w ?? Infinity, H = opt.h ?? Infinity;
    if (!arceerPatroon || arceerPatroon.pt !== pt) {
      const c = document.createElement('canvas'), m = Math.max(6, Math.round(7 * pt));
      c.width = c.height = m;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(255,255,255,0.62)'; g.fillRect(0, 0, m, m);
      g.strokeStyle = 'rgba(40,48,62,0.9)'; g.lineWidth = Math.max(1.1, 1.2 * pt);
      g.beginPath(); g.moveTo(0, m); g.lineTo(m, 0); g.moveTo(-m / 2, m / 2); g.lineTo(m / 2, -m / 2); g.moveTo(m / 2, m * 1.5); g.lineTo(m * 1.5, m / 2); g.stroke();
      arceerPatroon = { pt, p: ctx.createPattern(c, 'repeat') };
    }
    ctx.save();
    ctx.fillStyle = arceerPatroon.p;
    const h = dek.cel / 2;
    ctx.beginPath();
    let n = 0;
    if (!opt.alleenLabels) for (let k = 0; k < dek.binnen.length; k++) {
      if (!dek.binnen[k] || dek.gem[k]) continue;
      if (++n > 60000) break;
      const { s, o } = dek.vak(k);
      const hoeken = [[s - h, o - h], [s + h, o - h], [s + h, o + h], [s - h, o + h]].map(([a, b]) => { const q = puntOpStationOffset(a, b); return naarPx(q.x, q.y); });
      if (hoeken.every(([x]) => x < -5) || hoeken.every(([x]) => x > W + 5) || hoeken.every(([, y]) => y < -5) || hoeken.every(([, y]) => y > H + 5)) continue;
      ctx.moveTo(hoeken[0][0], hoeken[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(hoeken[i][0], hoeken[i][1]); ctx.closePath();
    }
    ctx.fill();
    // omtrek (gestreept) om elke plek die in de lijst staat
    ctx.setLineDash([4 * pt, 3 * pt]); ctx.lineWidth = 1.2 * pt; ctx.strokeStyle = '#2C3444';
    if (!opt.alleenLabels) for (const g of dek.gaten) {
      ctx.beginPath();
      const n = 6, rand = [];
      for (let i = 0; i <= n; i++) rand.push([g.s0 + (g.s1 - g.s0) * i / n, g.o0]);
      for (let i = 0; i <= n; i++) rand.push([g.s1 - (g.s1 - g.s0) * i / n, g.o1]);
      rand.forEach(([a, b], i) => { const q = puntOpStationOffset(a, b), [x, y] = naarPx(q.x, q.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath(); ctx.stroke();
    }
    ctx.setLineDash([]);
    // de grootste plekken een label geven
    ctx.font = `700 ${10.5 * pt}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const g of dek.gaten.slice(0, opt.labels ?? 4)) {
      if (g.opp < 2 || opt.labels === 0) continue;
      const t = `${opt.naam ? opt.naam + ' ' : ''}niet gemeten · ${komma(g.opp, g.opp < 10 ? 1 : 0)} m²`;
      const w = ctx.measureText(t).width + 8 * pt, hh = 15 * pt;
      let x, y;
      if (opt.labelNaast) {
        // naast de strook, zodat het label niet over de as en het pad valt; uit de buurt van de snoeipunt-nummers
        const voorkeur = opt.kant?.(g) ?? (g.oMid >= (opt.midden ?? 0) ? 1 : -1);
        const vermijd = opt.vermijd || [], vr = opt.vermijdStraal || 0;
        let eerste = null;
        zoek: for (const extra of [0, 1, 2, 3]) for (const zijde of [voorkeur, -voorkeur]) {
          const oRand = (opt.midden ?? 0) + opt.labelNaast * zijde;
          const a = puntOpStationOffset(g.sMid, oRand), b = puntOpStationOffset(g.sMid, oRand + zijde);
          const [ax, ay] = naarPx(a.x, a.y), [bx, by] = naarPx(b.x, b.y);
          const d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d;
          const af = Math.abs(ux) * w / 2 + Math.abs(uy) * hh / 2 + 4 * pt + extra * 2.4 * vr;
          const cx = ax + ux * af, cy = ay + uy * af;
          if (!eerste) eerste = [cx, cy];
          const raakt = vermijd.some(([px, py]) => Math.abs(px - cx) < w / 2 + vr && Math.abs(py - cy) < hh / 2 + vr);
          if (!raakt) { x = cx; y = cy; break zoek; }
        }
        if (x == null) [x, y] = eerste;
      } else { const q = puntOpStationOffset(g.sMid, g.oMid); [x, y] = naarPx(q.x, q.y); }
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.strokeStyle = '#3C465A'; ctx.lineWidth = 1 * pt;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - hh / 2, w, hh, 3 * pt); else ctx.rect(x - w / 2, y - hh / 2, w, hh);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3C465A'; ctx.fillText(t, x, y + 0.5 * pt);
    }
    ctx.restore();
  }

  /** De toets zelf. */
  function voerDoorvaartUit() {
    const k = dvKader();
    if (!k) throw new Error(dvToetspeil() == null ? 'vul een waterstand in (toetspeil of het waterpeil bij het dwarsprofiel)' : 'teken of lees eerst een as in en vul breedte en hoogte in');
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const halfB = k.B / 2, top = k.P + k.H;
    const venster = Math.max(pL, pR, Math.abs(k.c) + halfB + 1);
    const minPunten = Math.max(1, Math.round(dvGetal(doorvaart.minPunten) ?? 5));
    const res = { ...k, minPunten, venster, okH: true, okD: true };
    // ── hoogte: onderzijde van de brug ──
    if (brugOnder) {
      const w = brugOnder, pts = [];
      const CEL = 0.5, tel = new Map();
      // ruisfilter in 3D (station, offset én hoogte): een vogel onder de brug
      // staat in bovenaanzicht wel tussen de punten van het dek, maar niet in 3D
      const sleutel = (s, o, z) => `${Math.floor(s / CEL)},${Math.floor(o / CEL)},${Math.floor(z / CEL)}`;
      for (let i = 0; i < w.xs.length; i++) {
        const so = stationOffsetVanPunt(w.xs[i], w.ys[i]);
        if (!so || so.station < k.s0 || so.station > k.s1 || Math.abs(so.offset) > venster) continue;
        pts.push({ i, s: so.station, o: so.offset, z: w.zs[i] });
        const key = sleutel(so.station, so.offset, w.zs[i]); tel.set(key, (tel.get(key) || 0) + 1);
      }
      const steun = (p) => {
        const cs = Math.floor(p.s / CEL), co = Math.floor(p.o / CEL), cz = Math.floor(p.z / CEL);
        let n = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) n += tel.get(`${cs + a},${co + b},${cz + c}`) || 0;
        return n - 1;   // zonder het punt zelf
      };
      let vrijMin = Infinity, kritiek = null, ruis = 0, inBox = 0;
      const conflicten = [];
      const BIN = 0.25, nb = Math.ceil(2 * venster / BIN) + 1;
      const omhulO = new Array(nb).fill(Infinity);
      for (const p of pts) {
        if (steun(p) < minPunten) { if (Math.abs(p.o - k.c) <= halfB) ruis++; continue; }
        p.goed = true;
        const b = Math.round((p.o + venster) / BIN);
        if (b >= 0 && b < nb && p.z < omhulO[b]) omhulO[b] = p.z;
        if (Math.abs(p.o - k.c) > halfB) continue;
        inBox++;
        const vrij = p.z - k.P;
        if (vrij < vrijMin) { vrijMin = vrij; kritiek = { station: p.s, offset: p.o, z: p.z, x: w.xs[p.i], y: w.ys[p.i] }; }
        if (p.z < top) conflicten.push({ x: w.xs[p.i], y: w.ys[p.i], z: p.z, station: p.s, offset: p.o, tekort: top - p.z });
      }
      res.punten = pts.length; res.ruis = ruis; res.inBox = inBox;
      res.vrij = isFinite(vrijMin) ? vrijMin : null;
      res.kritiek = kritiek;
      res.tekortH = res.vrij == null ? 0 : Math.max(0, k.H - res.vrij);
      res.okH = res.vrij == null || res.vrij >= k.H - 1e-9;
      res.conflictenH = conflicten;
      // beschikbare breedte bij hoogte H: aaneengesloten vrij rond de box (geen punten = vrij)
      const vrijBin = (b) => omhulO[b] === Infinity || omhulO[b] >= top - 1e-9;
      const bc = Math.round((k.c + venster) / BIN);
      let a = bc, z = bc;
      if (bc >= 0 && bc < nb && vrijBin(bc)) {
        while (a - 1 >= 0 && vrijBin(a - 1)) a--;
        while (z + 1 < nb && vrijBin(z + 1)) z++;
        res.beschikbaar = { breedte: (z - a) * BIN, van: a * BIN - venster, tot: z * BIN - venster, totRand: a === 0 || z === nb - 1 };
      } else res.beschikbaar = { breedte: 0, van: k.c, tot: k.c };
      res.omhulO = omhulO.map((v, i) => ({ offset: i * BIN - venster, z: v === Infinity ? null : v }));
      // dekking: is de onderzijde boven de box overal gemeten?
      const lus = (cb) => { for (const p of pts) if (p.goed) cb(p.s, p.o, p.z); };
      let dak = null;
      if (brugBoven) {
        const projB = maakSnProjectie(venster + 1), wb = brugBoven;
        const bs = [], bo = [];
        for (let i = 0; i < wb.xs.length; i++) { const so = projB(wb.xs[i], wb.ys[i]); if (so && so.s >= k.s0 && so.s <= k.s1 && Math.abs(so.o) <= venster) { bs.push(so.s); bo.push(so.o); } }
        dak = (cb) => { for (let i = 0; i < bs.length; i++) cb(bs[i], bo[i]); };
      }
      res.dekkingH = maakDekking({
        s0: k.s0, s1: k.s1, o0: -venster, o1: venster, cel: dekkingCel(lokalePuntafstand(lus)),
        gemeten: lus, dak, binnen: (s, o) => Math.abs(o - k.c) <= halfB, minOpp: 1, maxGat: 20, z: 'min',
      });
    } else {
      res.vrij = null; res.okH = true; res.conflictenH = []; res.geenOnderzijde = true;
    }
    // ── diepte: bodem (puntenwolk A) binnen de box ──
    {
      const BIN = 0.25, nb = Math.ceil(2 * venster / BIN) + 1;
      const omhulB = new Array(nb).fill(-Infinity);
      const stS = Math.max(0.25, Math.min(1, (k.s1 - k.s0) / 200));
      let maxB = -Infinity, kritiekD = null;
      const conflictenD = [];
      const ondergrens = k.D ? k.PD - k.D : null;
      for (let s = k.s0; s <= k.s1 + 1e-9; s += stS) {
        for (let b = 0; b < nb; b++) {
          const o = b * BIN - venster;
          const q = puntOpStationOffset(s, o);
          const z = hoogteOp(q.x, q.y);
          if (z == null) continue;
          if (z > omhulB[b]) omhulB[b] = z;
          if (Math.abs(o - k.c) > halfB) continue;
          if (z > maxB) { maxB = z; kritiekD = { station: s, offset: o, z, x: q.x, y: q.y }; }
          if (ondergrens != null && z > ondergrens && (b % 2 === 0)) conflictenD.push({ x: q.x, y: q.y, z, station: s, offset: o, tekort: z - ondergrens });
        }
      }
      res.omhulB = omhulB.map((v, i) => ({ offset: i * BIN - venster, z: v === -Infinity ? null : v }));
      if (k.D && xs) {
        // dekking van de bodem binnen de box: de meetpunten van A zelf, niet het terreinmodel (dat trekt over gaten heen)
        const projA = maakSnProjectie(Math.abs(k.c) + halfB + 2);
        const as_ = [], ao = [], az = [];
        for (let i = 0; i < xs.length; i++) {
          const so = projA(xs[i], ys[i]);
          if (!so || so.s < k.s0 - 1 || so.s > k.s1 + 1 || Math.abs(so.o - k.c) > halfB + 1) continue;
          as_.push(so.s); ao.push(so.o); az.push(zs[i]);
        }
        const lusA = (cb) => { for (let i = 0; i < as_.length; i++) cb(as_[i], ao[i], az[i]); };
        res.dekkingD = maakDekking({
          s0: k.s0, s1: k.s1, o0: k.c - halfB, o1: k.c + halfB, cel: Math.max(1, dekkingCel(lokalePuntafstand(lusA))),
          gemeten: lusA, alles: true, minOpp: 2, z: 'max',
        });
      }
      if (k.D) {
        res.diepteMin = isFinite(maxB) ? k.PD - maxB : null;
        res.kritiekD = kritiekD;
        res.tekortD = res.diepteMin == null ? 0 : Math.max(0, k.D - res.diepteMin);
        res.okD = res.diepteMin == null || res.diepteMin >= k.D - 1e-9;
        res.conflictenD = conflictenD;
      }
    }
    res.ok = res.okH && res.okD;
    res.tijd = new Date();
    dvResultaat = res;
    return res;
  }
  /** Alleen het deel van een dwarsprofiel rond het doorvaartprofiel (voor een grotere schaal). */
  function dvUitsnede(reeks, k) {
    const extra = Math.max(6, 0.35 * k.B), lo = k.c - k.B / 2 - extra, hi = k.c + k.B / 2 + extra;
    const uit = reeks.filter(p => p.offset >= lo - 1e-9 && p.offset <= hi + 1e-9);
    for (const sl of ['station', 'bgt', 'maatgevend']) if (reeks[sl] !== undefined) uit[sl] = reeks[sl];
    uit.halfVenster = Math.max(Math.abs(lo), Math.abs(hi));
    return uit;
  }
  /** Maatgevende doorsnede over de lengte van de box: per offset de hoogste bodem en de laagste onderzijde. */
  function dvMaatgevendeReeks(res) {
    if (!res?.omhulB) return null;
    const uit = res.omhulB.map((p, i) => ({ offset: p.offset, hoogte: p.z, hoogteO: res.omhulO ? res.omhulO[i]?.z ?? null : null }));
    uit.station = null;
    uit.maatgevend = true;
    return uit;
  }

  /* ── tekenen ── */
  /** Box voor een grafiek (dwars- of lengteprofiel), of null. */
  function dvVoorGrafiek(reeks, isDwars, xVeld) {
    if (!doorvaart.tonen) return null;
    const k = dvKader();
    if (!k) return null;
    if (reeks.maatgevend) return { ...k, x0: k.c - k.B / 2, x1: k.c + k.B / 2 };
    if (isDwars) {
      if (reeks.station == null || reeks.station < k.s0 - 1e-6 || reeks.station > k.s1 + 1e-6) return null;
      return { ...k, x0: k.c - k.B / 2, x1: k.c + k.B / 2 };
    }
    if (xVeld === 'station') return { ...k, x0: k.s0, x1: k.s1 };
    return null;
  }

  function tekenDoorvaartOpVlak() {
    const w = brugBoven || brugOnder;
    if (w) {   // footprint van de brug, licht
      ctxVlak.fillStyle = 'rgba(90,100,115,0.42)';
      const stap = Math.max(1, Math.floor(w.xs.length / 25000));
      const st = Math.max(1.5, Math.min(5, w.idx.afstand * stap * schaal));
      for (let i = 0; i < w.xs.length; i += stap) {
        const [px, py] = wereldNaarScherm(w.xs[i], w.ys[i]);
        if (px < -4 || py < -4 || px > canvasVlak.clientWidth + 4 || py > canvasVlak.clientHeight + 4) continue;
        ctxVlak.fillRect(px - st / 2, py - st / 2, st, st);
      }
    }
    if (!doorvaart.tonen || asPunten.length < 2) return;
    const k = dvKader();
    if (!k) return;
    const r = dvResultaat;
    const kleur = !r ? '#1E7FA6' : r.ok ? '#16803D' : '#C6472B';
    const n = 24, links = [], rechts = [];
    for (let i = 0; i <= n; i++) {
      const s = k.s0 + (k.s1 - k.s0) * i / n;
      links.push(puntOpStationOffset(s, k.c - k.B / 2)); rechts.push(puntOpStationOffset(s, k.c + k.B / 2));
    }
    ctxVlak.beginPath();
    [...links, ...rechts.reverse()].forEach((p, i) => { const [px, py] = wereldNaarScherm(p.x, p.y); if (i) ctxVlak.lineTo(px, py); else ctxVlak.moveTo(px, py); });
    ctxVlak.closePath();
    ctxVlak.fillStyle = !r ? 'rgba(30,127,166,0.10)' : r.ok ? 'rgba(22,128,61,0.12)' : 'rgba(198,71,43,0.12)';
    ctxVlak.fill();
    ctxVlak.setLineDash([8, 4]); ctxVlak.lineWidth = 2; ctxVlak.strokeStyle = kleur; ctxVlak.stroke(); ctxVlak.setLineDash([]);
    if (r) {
      const opt = { w: canvasVlak.clientWidth, h: canvasVlak.clientHeight };
      tekenDekkingOpCanvas(ctxVlak, wereldNaarScherm, r.dekkingD, { ...opt, labels: 0 });
      tekenDekkingOpCanvas(ctxVlak, wereldNaarScherm, r.dekkingH, { ...opt, labels: 0 });
    }
    if (r) {
      const alle = [...(r.conflictenH || []), ...(r.conflictenD || [])];
      const stap = Math.max(1, Math.floor(alle.length / 4000));
      ctxVlak.fillStyle = '#C6472B';
      for (let i = 0; i < alle.length; i += stap) { const [px, py] = wereldNaarScherm(alle[i].x, alle[i].y); ctxVlak.fillRect(px - 2, py - 2, 4, 4); }
      for (const kp of [r.kritiek, r.kritiekD]) {
        if (!kp) continue;
        const [px, py] = wereldNaarScherm(kp.x, kp.y);
        ctxVlak.beginPath(); ctxVlak.arc(px, py, 7, 0, Math.PI * 2);
        ctxVlak.lineWidth = 2.5; ctxVlak.strokeStyle = '#fff'; ctxVlak.stroke();
        ctxVlak.lineWidth = 1.6; ctxVlak.strokeStyle = kp === r.kritiek ? (r.okH ? '#16803D' : '#C6472B') : (r.okD ? '#16803D' : '#C6472B'); ctxVlak.stroke();
      }
    }
    if (r) {
      const opt = { w: canvasVlak.clientWidth, h: canvasVlak.clientHeight, alleenLabels: true };
      tekenDekkingOpCanvas(ctxVlak, wereldNaarScherm, r.dekkingD, { ...opt, labels: 2, naam: 'bodem' });
      tekenDekkingOpCanvas(ctxVlak, wereldNaarScherm, r.dekkingH, { ...opt, naam: 'onderzijde' });
    }
    // label bij het begin van de box
    const p0 = puntOpStationOffset(k.s0, k.c + k.B / 2);
    const [lx, ly] = wereldNaarScherm(p0.x, p0.y);
    const tekst = `doorvaartprofiel ${komma(k.B, 2)} × ${komma(k.H, 2)} m${r ? (r.ok ? (dvGaten(r) ? ' · voldoet, deels niet gemeten' : ' · voldoet') : ' · voldoet niet') : ''}`;
    ctxVlak.font = '700 12px "Segoe UI", system-ui, sans-serif';
    ctxVlak.lineWidth = 3; ctxVlak.strokeStyle = 'rgba(255,255,255,0.95)'; ctxVlak.strokeText(tekst, lx + 6, ly + 14);
    ctxVlak.fillStyle = kleur; ctxVlak.fillText(tekst, lx + 6, ly + 14);
  }

  /* ── brugwolken inlezen ── */
  /** Leest punten in 3D (niet per vak in bovenaanzicht uitgedund zoals de
   *  bodem: dan zouden wanden, pijlers en liggers onder het dek wegvallen).
   *  Pas boven `limiet` punten wordt er in 3D-vakjes uitgedund. */
  function maakBrugSink(kader, limiet = 3000000) {
    let X = [], Y = [], Z = [];
    let gezien = 0, binnen = 0, cel = 0;
    const dun = () => {
      cel = cel ? cel * 1.4 : 0.02;
      const x0 = kader.minX, y0 = kader.minY, z0 = Math.min(...Z.slice(0, 1000)) - 500;
      const ruim = 131072;
      const gezienSet = new Set(), nx = [], ny = [], nz = [];
      for (let i = 0; i < X.length; i++) {
        const a = Math.floor((X[i] - x0) / cel), b = Math.floor((Y[i] - y0) / cel), c = Math.floor((Z[i] - z0) / cel);
        if (a < 0 || b < 0 || c < 0 || a >= ruim || b >= ruim || c >= ruim) continue;
        const k = (a * ruim + b) * ruim + c;
        if (gezienSet.has(k)) continue;
        gezienSet.add(k); nx.push(X[i]); ny.push(Y[i]); nz.push(Z[i]);
      }
      X = nx; Y = ny; Z = nz;
    };
    return {
      voegToe(x, y, z) {
        gezien++;
        if (x < kader.minX || x > kader.maxX || y < kader.minY || y > kader.maxY) return;
        binnen++;
        X.push(x); Y.push(y); Z.push(z);
        if (X.length > limiet) { do dun(); while (X.length > limiet * 0.7); }
      },
      get aantalGezien() { return gezien; },
      get binnen() { return binnen; },
      resultaat() { return { xs: X, ys: Y, zs: Z, uitgedund: cel > 0, cel }; },
    };
  }
  async function laadBrugBestand(bestand, rol) {
    if (!xs) { toonFout('Open eerst de bodem (puntenwolk A); daarna de brug.'); return; }
    const [minX, maxX] = bereikVan(xs), [minY, maxY] = bereikVan(ys);
    const kader = { minX: minX - 25, maxX: maxX + 25, minY: minY - 25, maxY: maxY + 25 };
    const naamRol = rol === 'onder' ? 'onderzijde brug' : 'bovenzijde brug';
    statusEl.style.color = ''; statusEl.textContent = `${naamRol}: ${bestand.name} inlezen…`;
    await new Promise(r => setTimeout(r, 10));
    const filter = maakBrugSink(kader);
    try {
      if (/\.la[sz]$/i.test(bestand.name)) {
        const header = await leesLasHeader(bestand);
        const voortgang = (n, t) => { statusEl.textContent = `${naamRol}: ${bestand.name}… ${Math.round(100 * n / Math.max(1, t))}%`; };
        if (header.isCompressed) await leesLazPunten(bestand, header, voortgang, true, filter);
        else await leesLasPunten(bestand, header, voortgang, true, filter);
      } else {
        await leesPts(bestand, (n, t, f) => { statusEl.textContent = `${naamRol}: ${bestand.name} inlezen… ${Math.round((f ?? (n / Math.max(1, t))) * 100)}%`; }, filter);
      }
    } catch (err) { toonFout(`kon ${bestand.name} niet lezen: ${err.message}`); return; }
    const r = filter.resultaat();
    if (r.xs.length < 10) { toonFout(`${bestand.name}: geen punten bij de bodem (puntenwolk A) gevonden — liggen beide in RD (EPSG:28992)?`); return; }
    const w = maakBrugWolk(bestand.name, r.xs, r.ys, r.zs);
    if (rol === 'onder') brugOnder = w; else brugBoven = w;
    dvResultaat = null; dvAutoCache.sleutel = '';
    statusEl.textContent = `${naamRol}: ${bestand.name} — ${w.xs.length.toLocaleString('nl-NL')} punten${r.uitgedund ? ` (uitgedund in 3D, vakjes van ${Math.round(r.cel * 100)} cm)` : ''} · gem. puntafstand ±${Math.round(w.idx.afstand * 100)} cm`;
    werkDoorvaartPaneelBij();
    bijwerkenProfielen(); tekenVlak();
  }

  /* ── dialoog ── */
  const dvDialoog = document.getElementById('dvDialoog');
  const DV_VELDEN = { dvWeergave: 'weergave', dvKlasse: 'klasse', dvScheepslengte: 'scheepslengte', dvScheepsbreedte: 'scheepsbreedte', dvToetspeil: 'toetspeil', dvHoogte: 'hoogte', dvBreedte: 'breedte', dvVerschuiving: 'verschuiving', dvDieptePeil: 'dieptePeil', dvDiepte: 'diepte', dvVan: 'stVan', dvTot: 'stTot', dvMarge: 'marge', dvMinPunten: 'minPunten' };
  function zetDoorvaartVelden() {
    for (const [id, sleutel] of Object.entries(DV_VELDEN)) { const e = document.getElementById(id); if (e) e.value = doorvaart[sleutel] ?? ''; }
    const t = document.getElementById('dvTonen'); if (t) t.checked = doorvaart.tonen !== false;
  }
  function leesDoorvaartVelden() {
    for (const [id, sleutel] of Object.entries(DV_VELDEN)) { const e = document.getElementById(id); if (e) doorvaart[sleutel] = e.value; }
    const t = document.getElementById('dvTonen'); if (t) doorvaart.tonen = t.checked;
  }
  const m2 = (v) => (v == null ? '—' : komma(v, 2));
  const nap = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '-'}${komma(Math.abs(v), 2)} m NAP`);
  const plek = (p) => (p ? `${stationVol(p.station)}, ${Math.abs(p.offset) < 0.05 ? 'op de as' : `${komma(Math.abs(p.offset), 1)} m ${p.offset < 0 ? 'L' : 'R'}`}` : '');
  /** Regels voor het resultaat (dialoog en PDF): [label, waarde, status 'ok'|'nok'|null] */
  function dvRegels(r) {
    const regels = [];
    regels.push(['Toetswaterstand (hoogte)', nap(r.P), null]);
    regels.push(['Doorvaartbox', `${komma(r.B, 1)} m breed × ${komma(r.H, 2)} m hoog`, null]);
    regels.push(['Ligging box', Math.abs(r.c) < 1e-9 ? 'midden op de as' : `${komma(Math.abs(r.c), 2)} m ${r.c < 0 ? 'links' : 'rechts'} van de as`, null]);
    regels.push(['Lengte box', `st. ${komma(r.s0, 1)} – ${komma(r.s1, 1)} m${r.auto ? (r.zonderBrug ? ' (hele as)' : ` (brug ${komma(r.brugVan, 1)} – ${komma(r.brugTot, 1)} + marge)`) : ''}`, null]);
    if (r.D) regels.push(['Vereiste diepte', `${komma(r.D, 2)} m onder ${nap(r.PD)}`, null]);
    if (r.geenOnderzijde) regels.push(['Onderzijde brug', 'niet ingelezen — geen hoogtetoets', null]);
    else {
      regels.push(['Kleinste vrije hoogte', r.vrij == null ? 'geen onderzijde gemeten binnen de box' : `${m2(r.vrij)} m boven toetswaterstand`, r.vrij == null ? null : r.okH ? 'ok' : 'nok']);
      if (r.kritiek) regels.push(['  waar', `${plek(r.kritiek)}, onderzijde ${nap(r.kritiek.z)}`, null]);
      if (!r.okH) regels.push(['Tekort hoogte', `${m2(r.tekortH)} m (${r.conflictenH.length.toLocaleString('nl-NL')} punten in de box)`, 'nok']);
      if (r.beschikbaar) regels.push([`Vrije breedte bij ${komma(r.H, 2)} m`, `${r.beschikbaar.totRand ? '≥ ' : ''}${komma(r.beschikbaar.breedte, 2)} m (offset ${komma(r.beschikbaar.van, 1)} tot ${komma(r.beschikbaar.tot, 1)})`, r.beschikbaar.breedte >= r.B - 1e-9 ? 'ok' : 'nok']);
      if (r.ruis) regels.push(['Losse punten genegeerd', `${r.ruis} (minder dan ${r.minPunten} andere punten binnen ± 0,5 m)`, null]);
      if (r.dekkingH) dekkingRegels(regels, r.dekkingH, 'Onderzijde gemeten', 'van het dek boven de box', (g) => g.rand == null ? '' : ` · rand ${nap(g.rand)} (${m2(Math.abs(g.rand - (r.P + r.H)))} m ${g.rand >= r.P + r.H ? 'boven' : 'in'} de box)`);
    }
    if (r.D) {
      regels.push(['Kleinste waterdiepte', r.diepteMin == null ? 'geen bodem binnen de box' : `${m2(r.diepteMin)} m onder ${nap(r.PD)}`, r.diepteMin == null ? null : r.okD ? 'ok' : 'nok']);
      if (r.kritiekD) regels.push(['  waar', `${plek(r.kritiekD)}, bodem ${nap(r.kritiekD.z)}`, null]);
      if (!r.okD) regels.push(['Tekort diepte', `${m2(r.tekortD)} m`, 'nok']);
      if (r.dekkingD) dekkingRegels(regels, r.dekkingD, 'Bodem gemeten', 'van de bodem in de box', (g) => g.rand == null || r.PD == null ? '' : ` · rand ${nap(g.rand)}`);
    }
    const gaten = dvGaten(r);
    regels.push(['Oordeel', r.ok ? (gaten ? `VOLDOET — ${komma(gaten, gaten < 10 ? 1 : 0)} m² niet gemeten` : 'VOLDOET') : 'VOLDOET NIET', r.ok ? (gaten ? 'let' : 'ok') : 'nok']);
    return regels;
  }
  /** Regels over de dekking (dialoog en PDF). */
  function dekkingRegels(regels, d, label, waarvan, extra = () => '') {
    const pct = d.pct >= 99.95 ? '100 %' : `${komma(Math.min(d.pct, 99.9), 1)} %`;
    regels.push([label, `${pct} ${waarvan}${d.gaten.length ? ` — ${d.gaten.length} ${d.gaten.length === 1 ? 'plek' : 'plekken'} niet gemeten, samen ${komma(d.oppGatLijst, d.oppGatLijst < 10 ? 1 : 0)} m²` : ''}`, d.gaten.length ? 'let' : 'ok']);
    for (const g of d.gaten.slice(0, 3)) regels.push(['  niet gemeten', gatTekst(g) + extra(g), 'let']);
    if (d.gaten.length > 3) regels.push(['  ', `en nog ${d.gaten.length - 3} kleinere ${d.gaten.length - 3 === 1 ? 'plek' : 'plekken'} (zie bovenaanzicht)`, null]);
  }
  /** Oppervlak (m²) dat in de box niet gemeten is (alleen plekken ≥ minOpp), of 0. */
  const dvGaten = (r) => (r?.dekkingH?.oppGatLijst || 0) + (r?.dekkingD?.oppGatLijst || 0);
  function toonDoorvaartResultaat() {
    const vak = document.getElementById('dvResultaat'), svg = document.getElementById('dvSvg');
    const chip = document.getElementById('dvChip');
    const r = dvResultaat;
    if (chip) {
      chip.textContent = !r ? (brugOnder ? 'nog niet gecontroleerd' : 'geen brug ingelezen') : r.ok ? (dvGaten(r) ? '✓ voldoet · deels niet gemeten' : '✓ voldoet') : '✗ voldoet niet';
      chip.className = 'dvChip ' + (!r ? '' : r.ok ? (dvGaten(r) ? 'let' : 'ok') : 'nok');
    }
    if (!vak) return;
    if (!r) { vak.innerHTML = '<p class="hint">Vul de maten in en klik op <b>Controleren</b>.</p>'; if (svg) svg.innerHTML = ''; return; }
    vak.innerHTML = '<table class="dvTabel">' + dvRegels(r).map(([l, w, s]) =>
      `<tr class="${s || ''}${l === 'Oordeel' ? ' oordeel' : ''}"><th>${l.replace(/^  /, '&nbsp;&nbsp;')}</th><td>${w}</td></tr>`).join('') + '</table>';
    if (svg) {
      const reeks = dvUitsnede(dvMaatgevendeReeks(r), r);
      if (reeks && reeks.some(p => p.hoogte != null)) tekenGrafiek(svg, reeks, 'offset', 'offset (m)', 0, 0, 1, null, null, waterpeil(), { legenda: false });
    }
  }
  function werkDoorvaartPaneelBij() {
    const zet = (id, w, leeg) => { const e = document.getElementById(id); if (e) { e.textContent = w ? `${w.naam} · ${w.xs.length.toLocaleString('nl-NL')} p.` : leeg; e.title = w ? w.naam : ''; } };
    zet('dvOnderNaam', brugOnder, 'niet ingelezen');
    zet('dvBovenNaam', brugBoven, 'niet ingelezen (optioneel)');
    const wo = document.getElementById('dvWisOnder'); if (wo) wo.hidden = !brugOnder;
    const wb = document.getElementById('dvWisBoven'); if (wb) wb.hidden = !brugBoven;
    const P = document.getElementById('dvToetspeil'); if (P) P.placeholder = waterpeil() != null ? `waterpeil ${komma(waterpeil(), 2)}` : 'bv. 1,10';
    const PD = document.getElementById('dvDieptePeil'); if (PD) PD.placeholder = waterpeil() != null ? `waterpeil ${komma(waterpeil(), 2)}` : 'leeg = toetswaterstand';
    const b = dvBereik();
    const auto = document.getElementById('dvAutoTekst');
    if (auto) auto.textContent = b ? (b.auto ? (b.zonderBrug ? 'auto: hele as (geen brug ingelezen)' : `auto: st. ${komma(b.s0, 1)} – ${komma(b.s1, 1)} m`) : `st. ${komma(b.s0, 1)} – ${komma(b.s1, 1)} m`) : '';
    const knop = document.getElementById('doorvaartKnop'); if (knop) knop.disabled = !xs;
    toonDoorvaartResultaat();
  }
  let dvTimer = null;
  function dvGewijzigd() {
    leesDoorvaartVelden();
    if (dvResultaat) { try { voerDoorvaartUit(); } catch { dvResultaat = null; } }
    werkDoorvaartPaneelBij();
    clearTimeout(dvTimer);
    dvTimer = setTimeout(() => { tekenVlak(); tekenDwarsVoorHuidigeStation(); tekenLangs(); }, 120);
  }
  if (dvDialoog) {
    for (const id of [...Object.keys(DV_VELDEN), 'dvTonen']) document.getElementById(id)?.addEventListener('input', dvGewijzigd);
    document.getElementById('dvTonen')?.addEventListener('change', dvGewijzigd);
    document.getElementById('doorvaartKnop')?.addEventListener('click', () => { zetDoorvaartVelden(); werkDoorvaartPaneelBij(); dvDialoog.showModal(); });
    document.getElementById('dvSluit')?.addEventListener('click', () => dvDialoog.close());
    document.getElementById('dvKlasse')?.addEventListener('change', (e) => {
      const m = CEMT[e.target.value];
      if (m) { document.getElementById('dvScheepslengte').value = m[0]; document.getElementById('dvScheepsbreedte').value = m[1]; }
      dvGewijzigd();
    });
    for (const id of ['dvScheepslengte', 'dvScheepsbreedte']) document.getElementById(id)?.addEventListener('input', () => { const k = document.getElementById('dvKlasse'); const m = CEMT[k?.value]; if (k && m && (Number(document.getElementById('dvScheepslengte').value) !== m[0] || Number(document.getElementById('dvScheepsbreedte').value) !== m[1])) k.value = ''; });
    document.getElementById('dvAuto')?.addEventListener('click', () => { doorvaart.stVan = ''; doorvaart.stTot = ''; zetDoorvaartVelden(); dvGewijzigd(); });
    document.getElementById('dvControleer')?.addEventListener('click', () => {
      leesDoorvaartVelden();
      try {
        const r = voerDoorvaartUit();
        statusEl.style.color = '';
        statusEl.textContent = `Doorvaart: ${r.ok ? 'voldoet' : 'voldoet niet'}${r.vrij != null ? ` · kleinste vrije hoogte ${m2(r.vrij)} m` : ''}${r.D && r.diepteMin != null ? ` · kleinste diepte ${m2(r.diepteMin)} m` : ''}`;
        // naar het dwarsprofiel van het kritieke punt
        const kp = !r.okH ? r.kritiek : !r.okD ? r.kritiekD : r.kritiek || r.kritiekD;
        if (kp && dwarsStations.length) {
          let beste = 0; dwarsStations.forEach((s, i) => { if (Math.abs(s - kp.station) < Math.abs(dwarsStations[beste] - kp.station)) beste = i; });
          huidigeStationIndex = beste;
        }
      } catch (err) { dvResultaat = null; toonFout('Doorvaart: ' + err.message); }
      werkDoorvaartPaneelBij();
      tekenVlak(); tekenDwarsVoorHuidigeStation(); tekenLangs();
    });
    for (const [rol, id] of [['onder', 'dvOnderBestand'], ['boven', 'dvBovenBestand']]) {
      const veld = document.getElementById(id);
      veld?.addEventListener('change', async () => {
        const f = veld.files?.[0]; veld.value = '';
        if (f) await laadBrugBestand(f, rol);
      });
    }
    document.getElementById('dvWisOnder')?.addEventListener('click', () => { brugOnder = null; dvResultaat = null; dvAutoCache.sleutel = ''; werkDoorvaartPaneelBij(); bijwerkenProfielen(); tekenVlak(); });
    document.getElementById('dvWisBoven')?.addEventListener('click', () => { brugBoven = null; dvAutoCache.sleutel = ''; werkDoorvaartPaneelBij(); bijwerkenProfielen(); tekenVlak(); });
  }



  /* ────────────────────────────────────────────────────────────────
     Stationering: dijkpalen of hectometrering in plaats van "meters vanaf
     het begin van de as".
     - Palen uit een bestand (GeoPackage, GeoJSON, CSV of DXF-teksten):
       elke paal wordt loodrecht op de actieve as gelegd; een plek op de as
       heet dan "DP 12 +40" = 40 m voorbij paal 12, gemeten langs de as.
     - Hectometrering berekend: waarde (km) bij station 0, oplopend of
       aflopend → "hm 12.3 +40".
     - Optioneel de dwarsprofielen uitlijnen: een profiel op elke paal en
       daartussen om de ingestelde interval.
     De meters langs de as blijven de basis (rekenen, DXF-coördinaten); de
     stationering is een extra label in scherm, PDF, lijsten en exports.
     ──────────────────────────────────────────────────────────────── */
  const paalVolgnummer = (naam) => { const m = String(naam).match(/(\d+(?:[.,]\d+)?)/); return m ? Number(m[1].replace(',', '.')) : null; };
  function paalNaam(naam) {
    const n = String(naam ?? '').trim();
    const vv = String(palen.voorvoegsel || '').trim();
    return vv && /^\d+([.,]\d+)?\s*[a-z]?$/i.test(n) ? `${vv} ${n}` : n;
  }
  /** De palen op de actieve as: [{naam, st, offset, afstand, x, y}], gesorteerd op station. */
  function paalStations() {
    if (palen.modus !== 'palen' || !palen.lijst.length || asPunten.length < 2) return [];
    const sleutel = asPunten.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(';') + `|${palen.versie}|${palen.maxAfstand}|${palen.voorvoegsel}`;
    if (paalCache.sleutel === sleutel) return paalCache.lijst;
    const s = stationsLangsAs(), L = s[s.length - 1];
    const max = Math.max(0.5, Number(palen.maxAfstand) || 50);
    const uit = [];
    for (const p of palen.lijst) {
      const so = stationOffsetVanPunt(p.x, p.y);
      if (!so || so.afstand > max) continue;
      // voorbij het begin of eind van de as (loodrecht kan niet): alleen als hij er vlak bij staat
      if ((so.station < 1e-6 || so.station > L - 1e-6) && so.afstand > 3) continue;
      uit.push({ naam: paalNaam(p.naam), ruw: p.naam, st: so.station, offset: so.offset, afstand: so.afstand, x: p.x, y: p.y });
    }
    uit.sort((a, b) => a.st - b.st);
    // twee palen (bijna) op dezelfde plek: de dichtste bij de as houden
    const schoon = [];
    for (const p of uit) {
      const v = schoon[schoon.length - 1];
      if (v && p.st - v.st < 0.5) { if (p.afstand < v.afstand) schoon[schoon.length - 1] = p; continue; }
      schoon.push(p);
    }
    paalCache = { sleutel, lijst: schoon };
    return schoon;
  }
  const plusTekst = (d) => {
    const r = Math.round(d * 10) / 10;
    const t = Math.abs(r - Math.round(r)) < 0.05 ? String(Math.round(Math.abs(r))) : Math.abs(r).toFixed(1).replace('.', ',');
    return `${r < 0 ? '-' : '+'}${t}`;
  };
  /** Stationering van een station langs de as als tekst ("DP 12 +40", "hm 12.3 +40"), of '' zonder stationering. */
  function paalTekst(st) {
    if (st == null || !Number.isFinite(st)) return '';
    if (palen.modus === 'hm') {
      const km = Number(String(palen.hmStart ?? '').replace(',', '.')) || 0;
      const m = km * 1000 + (Number(palen.hmRichting) < 0 ? -1 : 1) * st;
      const hm = Math.floor(m / 100 + 1e-7), rest = m - hm * 100;
      const vv = String(palen.hmVoorvoegsel ?? 'hm').trim();
      return `${vv ? vv + ' ' : ''}${(hm / 10).toFixed(1)} ${plusTekst(rest)}`;
    }
    const ps = paalStations();
    if (!ps.length) return '';
    let i = -1;
    for (let k = 0; k < ps.length; k++) { if (ps[k].st <= st + 1e-6) i = k; else break; }
    const p = ps[Math.max(0, i)];
    return `${p.naam} ${plusTekst(st - p.st)}`;
  }
  const stationeringAan = () => (palen.modus === 'hm' || (palen.modus === 'palen' && paalStations().length > 0)) && asPunten.length >= 2;
  /** "st. 15,0 m" of "st. 15,0 m (DP 12 +40)". */
  function stationVol(st, d = 1) {
    const pt = stationeringAan() ? paalTekst(st) : '';
    return `st. ${komma(st, d)} m${pt ? ` (${pt})` : ''}`;
  }
  /** Stationering tussen haakjes achter een bestaande tekst, of ''. */
  const paalAchter = (st, voor = ' · ') => { const t = stationeringAan() ? paalTekst(st) : ''; return t ? voor + t : ''; };

  /** Plekken (station) van de palen/hectometers om in kaart en lengteprofiel te tonen. */
  function paalMarkeringen() {
    if (!palen.tonen || asPunten.length < 2) return [];
    if (palen.modus === 'palen') return paalStations().map(p => ({ st: p.st, label: p.naam, x: p.x, y: p.y, echt: true }));
    if (palen.modus !== 'hm') return [];
    const s = stationsLangsAs(), L = s[s.length - 1];
    const km = Number(String(palen.hmStart ?? '').replace(',', '.')) || 0, r = Number(palen.hmRichting) < 0 ? -1 : 1;
    const m0 = km * 1000, uit = [];
    const vv = String(palen.hmVoorvoegsel ?? 'hm').trim();
    // eerste hele hectometer op de as
    let k = r > 0 ? Math.ceil(m0 / 100 - 1e-7) : Math.floor(m0 / 100 + 1e-7);
    for (let n = 0; n < 5000; n++, k += r) {
      const st = (k * 100 - m0) * r;
      if (st > L + 1e-6) break;
      if (st < -1e-6) continue;
      const q = puntOpStation(st);
      uit.push({ st, label: `${vv ? vv + ' ' : ''}${(k / 10).toFixed(1)}`, x: q.x, y: q.y, echt: false });
    }
    return uit;
  }
  /** Stations voor de dwarsprofielen: om de interval vanaf 0, of uitgelijnd op de palen/hectometers. */
  function berekenDwarsStations(totaal, interval) {
    const uit = [];
    const markeringen = palen.profielenOpPalen && stationeringAan()
      ? (palen.modus === 'palen' ? paalStations().map(p => p.st) : (() => { const t = palen.tonen; palen.tonen = true; const m = paalMarkeringen().map(p => p.st); palen.tonen = t; return m; })())
      : null;
    if (markeringen && markeringen.length) {
      const vast = [0, ...markeringen.filter(s => s > 1e-6 && s < totaal - 1e-6), totaal];
      for (let i = 0; i < vast.length - 1; i++) {
        const a = vast[i], b = vast[i + 1];
        // het stuk vóór de eerste paal: terugrekenen vanaf die paal, zodat de profielen op "hele" plussen staan
        if (i === 0 && a === 0 && markeringen[0] > 1e-6) {
          uit.push(0);
          for (let st = b - Math.floor((b - 1e-6) / interval) * interval; st < b - 0.25; st += interval) if (st > 0.25) uit.push(st);
          continue;
        }
        uit.push(a);
        for (let st = a + interval; st < b - Math.min(0.5, interval / 4); st += interval) uit.push(st);
      }
      uit.push(totaal);
      return uit.filter((v, i, arr) => !i || v - arr[i - 1] > 1e-6);
    }
    for (let st = 0; st <= totaal + 1e-9; st += interval) uit.push(st);
    if (uit[uit.length - 1] < totaal - 1e-6) uit.push(totaal);
    return uit;
  }

  /** Palen in het bovenaanzicht (scherm en PDF): ruitje op de paal, naam ernaast. */
  function tekenPalenOpCanvas(ctx, naarPx, opt = {}) {
    const lijst = paalMarkeringen();
    if (!lijst.length) return;
    const pt = opt.pt || 1, W = opt.w ?? Infinity, H = opt.h ?? Infinity;
    ctx.save();
    ctx.font = `700 ${11 * pt}px "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const geplaatst = [];
    for (const p of lijst) {
      const [x, y] = naarPx(p.x, p.y);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      const r = (p.echt ? 4.5 : 3.5) * pt;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 1.6 * pt; ctx.strokeStyle = '#1F4E79'; ctx.stroke();
      if (p.echt) { ctx.beginPath(); ctx.arc(x, y, 1.3 * pt, 0, Math.PI * 2); ctx.fillStyle = '#1F4E79'; ctx.fill(); }
      const w = ctx.measureText(p.label).width;
      const lx = x + r + 4 * pt, ly = y - r - 5 * pt;
      if (geplaatst.some(([a, b, c]) => Math.abs(a - lx) < (c + w) / 2 + 4 * pt + Math.abs(c - w) / 2 && Math.abs(b - ly) < 13 * pt)) continue;
      geplaatst.push([lx, ly, w]);
      ctx.lineJoin = 'round'; ctx.lineWidth = 3 * pt; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.strokeText(p.label, lx, ly);
      ctx.fillStyle = '#1F4E79'; ctx.fillText(p.label, lx, ly);
    }
    ctx.restore();
  }
  /** Palen voor het lengteprofiel: [{st, label}] binnen het bereik van de reeks. */
  function paalVoorGrafiek(reeks, isDwars, xVeld) {
    if (isDwars || xVeld !== 'station' || !reeks.length) return null;
    const a = reeks[0].station, b = reeks[reeks.length - 1].station;
    const l = paalMarkeringen().filter(p => p.st >= a - 1e-6 && p.st <= b + 1e-6);
    return l.length ? l : null;
  }

  /* ── palen inlezen ── */
  const PAAL_VELD = /^(naam|name|dijkpaal|dp|dp_?nr|paal|paalnr|paalnummer|hectometer|hm|hmp|label|tekst|text|nummer|nr|code|id|omschrijving)$/i;
  function kiesPaalNaam(eig, standaard) {
    if (!eig) return standaard;
    const sleutels = Object.keys(eig);
    // voorkeur in de volgorde van PAAL_VELD (naam/dijkpaal eerder dan id)
    const volgorde = ['naam', 'name', 'dijkpaal', 'dp', 'dp_nr', 'dpnr', 'paal', 'paalnr', 'paalnummer', 'hectometer', 'hm', 'hmp', 'label', 'tekst', 'text', 'nummer', 'nr', 'code', 'omschrijving', 'id'];
    for (const v of volgorde) {
      const k = sleutels.find(s => s.toLowerCase() === v);
      if (k && eig[k] != null && String(eig[k]).trim() !== '') return String(eig[k]).trim().slice(0, 30);
    }
    for (const k of sleutels) if (PAAL_VELD.test(k) && eig[k] != null && String(eig[k]).trim() !== '') return String(eig[k]).trim().slice(0, 30);
    return standaard;
  }
  function palenUitGeojson(gj) {
    const uit = [];
    const wgs = /4326|CRS84/i.test(JSON.stringify(gj.crs || '')) || null;
    const doe = (geom, eig) => {
      if (!geom) return;
      if (geom.type === 'Point') uit.push({ naam: kiesPaalNaam(eig, `paal ${uit.length + 1}`), x: geom.coordinates[0], y: geom.coordinates[1] });
      else if (geom.type === 'MultiPoint') for (const c of geom.coordinates) uit.push({ naam: kiesPaalNaam(eig, `paal ${uit.length + 1}`), x: c[0], y: c[1] });
      else if (geom.type === 'GeometryCollection') for (const g of geom.geometries || []) doe(g, eig);
    };
    for (const f of gj.type === 'FeatureCollection' ? gj.features || [] : [gj]) doe(f.geometry || f, f.properties);
    const alleWgs = wgs ?? (uit.length && uit.every(p => Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90));
    return alleWgs ? uit.map(p => ({ ...p, ...wgs84NaarRd(p.x, p.y) })) : uit;
  }
  async function palenUitGpkg(bestand) {
    const SQL = await laadSqlJs();
    const db = new SQL.Database(new Uint8Array(await bestand.arrayBuffer()));
    const uit = [];
    try {
      const kol = db.exec("SELECT table_name, column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns")[0]?.values || [];
      const punten = kol.filter(([, , t]) => /POINT|GEOMETRY/i.test(t));
      // voorkeur: een laag met "paal", "dijkpaal" of "hm" in de naam
      const voorkeur = punten.filter(([t]) => /paal|dp|hecto|hm/i.test(t));
      for (const [tabel, kolom, , srs] of (voorkeur.length ? voorkeur : punten)) {
        const res = db.exec(`SELECT * FROM "${String(tabel).replace(/"/g, '""')}"`)[0];
        if (!res) continue;
        const ki = res.columns.indexOf(kolom);
        for (const rij of res.values) {
          let l; try { l = gpkgBlobLijnen(rij[ki]); } catch { continue; }
          const ps = l.punten || [];
          if (!ps.length) continue;
          const eig = {}; res.columns.forEach((c, i) => { if (i !== ki && !(rij[i] instanceof Uint8Array)) eig[c] = rij[i]; });
          for (const p of ps) {
            const q = Number(srs) === 4326 ? wgs84NaarRd(p.x, p.y) : p;
            uit.push({ naam: kiesPaalNaam(eig, `paal ${uit.length + 1}`), x: q.x, y: q.y });
          }
        }
      }
    } finally { db.close(); }
    return uit;
  }
  /** CSV / TXT: x;y;naam (kolomnamen worden herkend; zonder kop: de twee RD-getallen + de rest als naam). */
  function palenUitCsv(tekst) {
    const regels = tekst.replace(/^﻿/, '').split(/\r?\n/).map(r => r.trim()).filter(r => r && !r.startsWith('#'));
    if (!regels.length) return [];
    const scheiding = regels[0].includes(';') ? ';' : regels[0].includes('\t') ? '\t' : regels[0].includes(',') ? ',' : /\s+/;
    const splits = (r) => r.split(scheiding).map(v => v.trim().replace(/^"|"$/g, ''));
    const getal = (v) => { const n = Number(String(v).replace(scheiding === ';' || scheiding === '\t' ? ',' : '§', '.')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
    let kop = splits(regels[0]), start = 1;
    const isKop = kop.some(v => getal(v) == null && /[a-z]/i.test(v)) && kop.filter(v => getal(v) != null).length < 2;
    let ix = -1, iy = -1, inaam = -1;
    if (isKop) {
      const k = kop.map(v => v.toLowerCase());
      ix = k.findIndex(v => /^(x|x_?rd|rd_?x|oost|easting|e|xcoord|x_coord)$/.test(v));
      iy = k.findIndex(v => /^(y|y_?rd|rd_?y|noord|northing|n|ycoord|y_coord)$/.test(v));
      inaam = k.findIndex(v => PAAL_VELD.test(v));
    } else start = 0;
    const uit = [];
    for (let r = start; r < regels.length; r++) {
      const v = splits(regels[r]);
      let x, y, naam;
      if (ix >= 0 && iy >= 0) { x = getal(v[ix]); y = getal(v[iy]); naam = inaam >= 0 ? v[inaam] : v.filter((_, i) => i !== ix && i !== iy).find(t => t) || ''; }
      else {
        // zonder kop: het eerste paar getallen dat op RD lijkt
        const g = v.map(getal);
        let a = -1;
        for (let i = 0; i < g.length - 1; i++) if (g[i] != null && g[i + 1] != null && g[i] > -7000 && g[i] < 300000 && g[i + 1] > 289000 && g[i + 1] < 629000) { a = i; break; }
        if (a < 0) continue;
        x = g[a]; y = g[a + 1];
        naam = v.filter((_, i) => i !== a && i !== a + 1 && !(i === a + 2 && g[i] != null && Math.abs(g[i]) < 500 && v.length > 3)).find(t => t) || '';
      }
      if (x == null || y == null) continue;
      uit.push({ naam: String(naam || `paal ${uit.length + 1}`).slice(0, 30), x, y });
    }
    return uit;
  }
  /** DXF: teksten die op een paalnummer lijken (bij voorkeur op een laag met "paal", "dp" of "hm" in de naam). */
  function palenUitDxf(tekst) {
    const { lagen } = leesDxf(tekst, null);
    const schoon = (t) => String(t).replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').replace(/\\P/g, ' ').trim();
    const lijkt = (t) => /^(dp|dijkpaal|hm|hmp|km|paal)?\s*\d{1,5}([.,]\d{1,3})?\s*[a-z]?$/i.test(t);
    const alle = [...lagen.values()];
    const voorkeur = alle.filter(l => /paal|dp|hecto|hm|stationering/i.test(l.naam) && l.teksten.length);
    const uit = [];
    for (const l of voorkeur.length ? voorkeur : alle) for (const t of l.teksten) {
      const s = schoon(t.tekst);
      if (s && (voorkeur.length || lijkt(s))) uit.push({ naam: s.slice(0, 30), x: t.x, y: t.y });
    }
    return uit;
  }
  async function palenUitBestand(bestand) {
    const e = (bestand.name.split('.').pop() || '').toLowerCase();
    try {
      let lijst;
      if (e === 'gpkg') lijst = await palenUitGpkg(bestand);
      else if (e === 'geojson' || e === 'json') lijst = palenUitGeojson(JSON.parse(await bestand.text()));
      else if (e === 'dxf') lijst = palenUitDxf(await bestand.text());
      else lijst = palenUitCsv(await bestand.text());
      lijst = lijst.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (!lijst.length) throw new Error('geen punten met een naam of nummer gevonden');
      zetPalen(lijst, bestand.name);
      const n = paalStations().length;
      statusEl.style.color = '';
      statusEl.textContent = `Stationering: ${lijst.length} palen uit ${bestand.name}${asPunten.length >= 2 ? ` · ${n} op ${assen[actieveAs]?.naam || 'de as'}` : ''}`;
    } catch (err) { toonFout(`Palen lezen mislukt: ${err.message || err}`); }
  }
  function zetPalen(lijst, bron) {
    palen.lijst = lijst; palen.bron = lijst.length ? bron : ''; palen.versie = (palen.versie || 0) + 1;
    if (lijst.length && palen.modus === 'm') palen.modus = 'palen';
    if (!lijst.length && palen.modus === 'palen') palen.modus = 'm';
    stationeringGewijzigd();
  }
  function stationeringGewijzigd() {
    paalCache.sleutel = '';
    zetPaalVelden();
    werkPaalPaneelBij();
    if (xs) { bijwerkenProfielen(); tekenVlak(); }
    if (typeof werkSnoeiPaneelBij === 'function') werkSnoeiPaneelBij();
    if (typeof werkDoorvaartPaneelBij === 'function') werkDoorvaartPaneelBij();
  }

  /* ── dialoog ── */
  const paalDialoog = document.getElementById('paalDialoog');
  function zetPaalVelden() {
    for (const r of document.querySelectorAll('input[name="paalModus"]')) r.checked = r.value === palen.modus;
    const zet = (id, v) => { const e = document.getElementById(id); if (e && document.activeElement !== e) e.value = v ?? ''; };
    zet('paalVoorvoegsel', palen.voorvoegsel); zet('paalMaxAfstand', palen.maxAfstand);
    zet('paalHmStart', palen.hmStart); zet('paalHmRichting', String(palen.hmRichting)); zet('paalHmVoorvoegsel', palen.hmVoorvoegsel);
    const pp = document.getElementById('paalProfielen'); if (pp) pp.checked = !!palen.profielenOpPalen;
    const pt = document.getElementById('paalTonen'); if (pt) pt.checked = palen.tonen !== false;
  }
  function leesPaalVelden() {
    const m = document.querySelector('input[name="paalModus"]:checked'); if (m) palen.modus = m.value;
    const lees = (id) => document.getElementById(id)?.value ?? '';
    palen.voorvoegsel = lees('paalVoorvoegsel'); palen.maxAfstand = Number(lees('paalMaxAfstand')) || 50;
    palen.hmStart = lees('paalHmStart'); palen.hmRichting = Number(lees('paalHmRichting')) || 1; palen.hmVoorvoegsel = lees('paalHmVoorvoegsel');
    palen.profielenOpPalen = !!document.getElementById('paalProfielen')?.checked;
    palen.tonen = document.getElementById('paalTonen')?.checked !== false;
  }
  function werkPaalPaneelBij() {
    const naam = document.getElementById('paalNaam');
    if (naam) naam.textContent = palen.lijst.length ? `${palen.lijst.length} palen · ${palen.bron}` : 'niet ingelezen';
    const wis = document.getElementById('paalWis'); if (wis) wis.hidden = !palen.lijst.length;
    const bv = document.getElementById('paalBestandVak'); if (bv) bv.classList.toggle('uit', palen.modus !== 'palen');
    const hv = document.getElementById('paalHmVak'); if (hv) hv.classList.toggle('uit', palen.modus !== 'hm');
    const knop = document.getElementById('stationeringKnop');
    if (knop) { knop.disabled = !xs; knop.classList.toggle('aan', stationeringAan()); knop.textContent = stationeringAan() ? (palen.modus === 'hm' ? 'Stationering: hm' : 'Stationering: DP') : 'Stationering…'; }
    const vak = document.getElementById('paalResultaat');
    if (!vak || !document.getElementById('paalDialoog')?.open) return;
    if (asPunten.length < 2) { vak.innerHTML = '<p class="hint">Teken of lees eerst een as in.</p>'; return; }
    const s = stationsLangsAs(), L = s[s.length - 1];
    if (palen.modus === 'm') { vak.innerHTML = `<p class="hint">Stations in meters vanaf het begin van ${assen[actieveAs]?.naam || 'de as'} (0 – ${komma(L, 1)} m).</p>`; return; }
    if (palen.modus === 'hm') {
      vak.innerHTML = `<table class="dvTabel"><tr><th>Begin van de as</th><td>${paalTekst(0)}</td></tr><tr><th>Eind van de as</th><td>${paalTekst(L)}</td></tr>` +
        `<tr><th>Hectometers op de as</th><td>${paalMarkeringen().length || (palen.tonen ? 0 : '—')}</td></tr></table>`;
      return;
    }
    const ps = paalStations();
    if (!palen.lijst.length) { vak.innerHTML = '<p class="hint">Lees een bestand met dijkpalen in.</p>'; return; }
    if (!ps.length) { vak.innerHTML = `<p class="hint waarschuw">Geen van de ${palen.lijst.length} palen ligt binnen ${komma(Number(palen.maxAfstand) || 50, 0)} m van ${assen[actieveAs]?.naam || 'de as'}. Vergroot de afstand of kies een andere as.</p>`; return; }
    // nummers in de goede richting?
    const nrs = ps.map(p => paalVolgnummer(p.ruw)).filter(v => v != null);
    let op = 0, af = 0; for (let i = 1; i < nrs.length; i++) { if (nrs[i] > nrs[i - 1]) op++; else if (nrs[i] < nrs[i - 1]) af++; }
    const tussen = []; for (let i = 1; i < ps.length; i++) tussen.push(ps[i].st - ps[i - 1].st);
    const med = tussen.length ? [...tussen].sort((a, b) => a - b)[Math.floor(tussen.length / 2)] : null;
    const waarsch = [];
    if (af > op) waarsch.push('De paalnummers lopen <b>af</b> in de richting van de as. Met <b>⇄ Omdraaien</b> (lint, groep As) lopen station en paalnummers dezelfde kant op.');
    else if (af && op) waarsch.push(`${af} keer staat een paal met een lager nummer verder langs de as — controleer de palen of de as.`);
    const ver = ps.filter(p => p.afstand > 25).length;
    if (ver) waarsch.push(`${ver} ${ver === 1 ? 'paal staat' : 'palen staan'} meer dan 25 m van de as.`);
    vak.innerHTML = waarsch.map(w => `<p class="hint waarschuw">${w}</p>`).join('') +
      `<table class="dvTabel"><tr><th>Palen op de as</th><td>${ps.length} van ${palen.lijst.length} (${ps[0].naam} – ${ps[ps.length - 1].naam})</td></tr>` +
      `<tr><th>Gem. afstand tussen palen</th><td>${med != null ? `± ${komma(med, 0)} m` : '—'}</td></tr>` +
      `<tr><th>Begin van de as</th><td>${paalTekst(0)}</td></tr><tr><th>Eind van de as</th><td>${paalTekst(L)}</td></tr></table>` +
      '<div class="snLijstVak" style="max-height:220px;margin-top:8px"><table class="snTabel"><thead><tr><th>paal</th><th>station</th><th>tot de as</th></tr></thead><tbody>' +
      ps.map(p => `<tr data-st="${p.st}"><td><b>${p.naam}</b></td><td>${komma(p.st, 1)} m</td><td>${komma(p.afstand, 1)} m ${p.offset < 0 ? 'L' : 'R'}</td></tr>`).join('') + '</tbody></table></div>';
    for (const tr of vak.querySelectorAll('tr[data-st]')) tr.addEventListener('click', () => naarStation(Number(tr.dataset.st)));
  }
  /** Het dwarsprofiel dat het dichtst bij een station ligt openen. */
  function naarStation(st) {
    if (!dwarsStations.length) return;
    let beste = 0; dwarsStations.forEach((s, i) => { if (Math.abs(s - st) < Math.abs(dwarsStations[beste] - st)) beste = i; });
    huidigeStationIndex = beste;
    tekenVlak(); tekenDwarsVoorHuidigeStation(); tekenLangs();
  }
  /** "DP 12 +40", "12+40", "hm 12.3 +40" of een getal (meters) → station langs de as, of null. */
  function stationUitTekst(t) {
    const s = String(t || '').trim();
    if (!s) return null;
    const m = s.match(/^(.*?)\s*([+-])\s*(\d+(?:[.,]\d+)?)\s*m?$/);
    const kaal = Number(s.replace(',', '.').replace(/\s*m$/, ''));
    if (!m && Number.isFinite(kaal)) return kaal;
    const deel = m ? m[1].trim() : s, plus = m ? (m[2] === '-' ? -1 : 1) * Number(m[3].replace(',', '.')) : 0;
    if (palen.modus === 'hm') {
      const n = Number(deel.replace(/^[a-z]+\s*/i, '').replace(',', '.'));
      if (!Number.isFinite(n)) return null;
      const km = Number(String(palen.hmStart ?? '').replace(',', '.')) || 0;
      return ((n * 1000 + plus) - km * 1000) * (Number(palen.hmRichting) < 0 ? -1 : 1);
    }
    const ps = paalStations();
    const zoek = deel.toLowerCase().replace(/\s+/g, '');
    const nr = paalVolgnummer(deel);
    const p = ps.find(q => q.naam.toLowerCase().replace(/\s+/g, '') === zoek || String(q.ruw).toLowerCase().replace(/\s+/g, '') === zoek)
      || (nr != null ? ps.find(q => paalVolgnummer(q.ruw) === nr) : null);
    return p ? p.st + plus : null;
  }
  if (paalDialoog) {
    document.getElementById('stationeringKnop')?.addEventListener('click', () => { zetPaalVelden(); werkPaalPaneelBij(); paalDialoog.showModal(); });
    for (const id of ['paalVoorvoegsel', 'paalMaxAfstand', 'paalHmStart', 'paalHmRichting', 'paalHmVoorvoegsel', 'paalProfielen', 'paalTonen'])
      document.getElementById(id)?.addEventListener(/Profielen|Tonen|Richting/.test(id) ? 'change' : 'input', () => { leesPaalVelden(); stationeringGewijzigd(); });
    for (const r of document.querySelectorAll('input[name="paalModus"]')) r.addEventListener('change', () => { leesPaalVelden(); stationeringGewijzigd(); });
    const v = document.getElementById('paalBestand');
    v?.addEventListener('change', async () => { const f = v.files?.[0]; v.value = ''; if (f) await palenUitBestand(f); });
    document.getElementById('paalWis')?.addEventListener('click', () => { zetPalen([], ''); statusEl.textContent = 'Dijkpalen weggehaald'; });
    document.getElementById('paalSluit')?.addEventListener('click', () => paalDialoog.close());
    document.getElementById('paalGaNaar')?.addEventListener('change', (e) => {
      const st = stationUitTekst(e.target.value);
      if (st == null) { toonFout(`"${e.target.value}" niet gevonden op deze as`); return; }
      naarStation(st);
      statusEl.style.color = ''; statusEl.textContent = `Naar ${stationVol(st)}`;
    });
  }

  /* ────────────────────────────────────────────────────────────────
     Kadastrale percelen (BRK kadastrale kaart, PDOK of eigen bestand):
     perceelgrenzen in het bovenaanzicht en het dwarsprofiel, en bij de
     snoeicheck: op welk perceel de boom van elk snoeipunt staat.
     Alleen de kaart (gemeente, sectie, perceelnummer, grootte) — geen
     eigenaren; die vraag je zelf op bij het Kadaster.
     ──────────────────────────────────────────────────────────────── */
  const BRK_API = 'https://api.pdok.nl/kadaster/brk-kadastrale-kaart/ogc/v1';
  let percelen = [];       // { gemeente, code, sectie, nummer, grootte, ringen: [[{x,y}]], x0, y0, x1, y1, lx, ly }
  let perceelBron = '';
  const perceelNaam = (p) => p ? `${p.gemeente || p.code || ''} ${p.sectie || ''} ${p.nummer ?? ''}`.replace(/\s+/g, ' ').trim() : '';
  const perceelKort = (p) => p ? `${p.sectie || ''} ${p.nummer ?? ''}`.trim() : '';

  function maakPerceel(eig, ringen) {
    const e = eig || {};
    const zoek = (re) => { for (const k of Object.keys(e)) if (re.test(k) && e[k] != null && String(e[k]).trim() !== '') return e[k]; return null; };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of ringen) for (const p of r) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    // labelpunt: zwaartepunt van de grootste ring (valt dat erbuiten, dan het midden van de box)
    let beste = null, besteA = 0;
    for (const r of ringen) {
      let a = 0, cx = 0, cy = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j].x * r[i].y - r[i].x * r[j].y; a += f; cx += (r[j].x + r[i].x) * f; cy += (r[j].y + r[i].y) * f; }
      if (Math.abs(a) > besteA) { besteA = Math.abs(a); beste = { x: cx / (3 * a), y: cy / (3 * a) }; }
    }
    const p = {
      gemeente: zoek(/^kadastrale_gemeente_waarde$|^kadastrale_?gemeente(naam)?$|^gemeente$/i) ?? '',
      code: zoek(/^akr_kadastrale_gemeente_code_waarde$|^akr|gemeentecode/i) ?? '',
      sectie: zoek(/^sectie$/i) ?? '',
      nummer: zoek(/^perceelnummer$|^perceel_?nr$|^nummer$/i) ?? '',
      grootte: Number(zoek(/^kadastrale_grootte_waarde$|grootte|oppervlakte/i)) || null,
      ringen, x0, y0, x1, y1,
    };
    const binnen = beste && perceelBevat(p, beste.x, beste.y);
    p.lx = binnen ? beste.x : (x0 + x1) / 2; p.ly = binnen ? beste.y : (y0 + y1) / 2;
    return p;
  }
  function perceelBevat(p, x, y) {
    if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) return false;
    let binnen = false;
    for (const r of p.ringen) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) binnen = !binnen;
    }
    return binnen;
  }
  function perceelOp(x, y) { for (const p of percelen) if (perceelBevat(p, x, y)) return p; return null; }
  function percelenUitGeoJSON(gj) {
    const uit = [];
    for (const f of gj?.features || []) {
      const g = f.geometry; if (!g) continue;
      const vlakken = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      const ringen = [];
      for (const v of vlakken) for (const r of v) ringen.push(r.map(([x, y]) => ({ x, y })));
      if (ringen.length) uit.push(maakPerceel(f.properties, ringen));
    }
    return uit;
  }
  /** Percelen in een RD-bbox van PDOK (BRK kadastrale kaart, OGC API Features), met doorbladeren. */
  async function haalPercelenOp(bbox, onVoortgang) {
    const [minX, minY, maxX, maxY] = bbox;
    const crs = 'http://www.opengis.net/def/crs/EPSG/0/28992';
    let url = `${BRK_API}/collections/perceel/items?bbox=${minX},${minY},${maxX},${maxY}&bbox-crs=${encodeURIComponent(crs)}&crs=${encodeURIComponent(crs)}&limit=1000&f=json`;
    const uit = [];
    for (let blad = 0; url && blad < 30; blad++) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`PDOK gaf ${resp.status}`);
      const gj = await resp.json();
      uit.push(...percelenUitGeoJSON(gj));
      onVoortgang?.(uit.length);
      const volgende = (gj.links || []).find(l => l.rel === 'next');
      url = volgende && (gj.features || []).length ? volgende.href : null;
    }
    // dubbele (randen van bladen) eruit
    const gezien = new Set();
    return uit.filter(p => { const k = `${p.code}|${p.gemeente}|${p.sectie}|${p.nummer}`; if (gezien.has(k)) return false; gezien.add(k); return true; });
  }
  /** Gebied om op te halen: de strook van de snoeicheck, anders de puntenwolk. */
  function kadasterGebied() {
    const w = begroeiing;
    if (w) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i < w.xs.length; i += 7) { a = Math.min(a, w.xs[i]); b = Math.min(b, w.ys[i]); c = Math.max(c, w.xs[i]); d = Math.max(d, w.ys[i]); } return [a - 10, b - 10, c + 10, d + 10]; }
    if (!xs) return null;
    const g = grenzen();
    return [g.minX - 5, g.minY - 5, g.maxX + 5, g.maxY + 5];
  }
  async function kadasterOphalen() {
    const bbox = kadasterGebied();
    if (!bbox) { toonFout('Open eerst een puntenwolk.'); return; }
    const opp = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
    if (opp > 25e6) { toonFout('Het gebied is te groot om de kadastrale kaart op te halen (meer dan 25 km²). Gebruik de snoeicheck-strook of een eigen bestand.'); return; }
    statusEl.style.color = ''; statusEl.textContent = 'Kadastrale percelen ophalen bij PDOK…';
    try {
      const nieuw = await haalPercelenOp(bbox, (n) => { statusEl.textContent = `Kadastrale percelen ophalen bij PDOK… ${n.toLocaleString('nl-NL')}`; });
      zetPercelen(nieuw, 'PDOK BRK kadastrale kaart');
      statusEl.textContent = nieuw.length ? `Kadaster: ${nieuw.length.toLocaleString('nl-NL')} percelen opgehaald bij PDOK` : 'Kadaster: geen percelen gevonden in dit gebied';
    } catch (err) {
      toonFout(`Kadastrale percelen ophalen mislukt: ${err.message || err}. Lukt het niet via internet, download de percelen dan zelf (bv. als GeoJSON of GeoPackage) en kies "Bestand…".`);
    }
  }
  async function kadasterUitBestand(bestand) {
    try {
      let nieuw = [];
      if (/\.gpkg$/i.test(bestand.name)) {
        const SQL = await laadSqlJs();
        const db = new SQL.Database(new Uint8Array(await bestand.arrayBuffer()));
        try {
          const tabellen = db.exec("SELECT table_name, column_name FROM gpkg_geometry_columns")[0]?.values || [];
          const tab = tabellen.find(([t]) => /perce/i.test(t)) || tabellen[0];
          if (!tab) throw new Error('geen geometrietabel in de GeoPackage');
          const res = db.exec(`SELECT * FROM "${tab[0]}"`)[0];
          if (res) {
            const gi = res.columns.indexOf(tab[1]);
            for (const rij of res.values) {
              const ringen = gpkgBlobLijnen(rij[gi]);
              if (!ringen.length) continue;
              const eig = {}; res.columns.forEach((c, i) => { if (i !== gi) eig[c] = rij[i]; });
              nieuw.push(maakPerceel(eig, ringen));
            }
          }
        } finally { db.close(); }
      } else {
        nieuw = percelenUitGeoJSON(JSON.parse(await bestand.text()));
      }
      if (!nieuw.length) throw new Error('geen vlakken gevonden (verwacht: percelen als Polygon/MultiPolygon in RD)');
      zetPercelen(nieuw, bestand.name);
      statusEl.style.color = ''; statusEl.textContent = `Kadaster: ${nieuw.length.toLocaleString('nl-NL')} percelen uit ${bestand.name}`;
    } catch (err) { toonFout(`Kadastrale percelen lezen mislukt: ${err.message || err}`); }
  }
  function zetPercelen(lijst, bron) {
    percelen = lijst; perceelBron = lijst.length ? bron : '';
    if (snResultaat) snKoppelPercelen(snResultaat);
    werkKadasterKnoppenBij();
    if (typeof werkSnoeiPaneelBij === 'function') werkSnoeiPaneelBij();
    tekenVlak(); tekenDwarsVoorHuidigeStation();
  }
  function werkKadasterKnoppenBij() {
    const wis = document.getElementById('wisKadasterKnop'); if (wis) wis.disabled = !percelen.length;
    const naam = document.getElementById('snKadNaam');
    if (naam) naam.textContent = percelen.length ? `${percelen.length.toLocaleString('nl-NL')} percelen · ${perceelBron}` : 'niet geladen';
    const snWis = document.getElementById('snKadWis'); if (snWis) snWis.hidden = !percelen.length;
  }

  for (const id of ['kadasterOphalenKnop', 'snKadOphalen']) document.getElementById(id)?.addEventListener('click', async (e) => { e.target.disabled = true; await kadasterOphalen(); e.target.disabled = false; });
  for (const id of ['kadasterBestand', 'snKadBestand']) { const v = document.getElementById(id); v?.addEventListener('change', async () => { const f = v.files?.[0]; v.value = ''; if (f) await kadasterUitBestand(f); }); }
  for (const id of ['wisKadasterKnop', 'snKadWis']) document.getElementById(id)?.addEventListener('click', () => { zetPercelen([], ''); statusEl.textContent = 'Kadastrale percelen weggehaald'; });

  /** Perceelgrenzen met sectie + nummer (scherm en PDF). */
  function tekenPercelenOpCanvas(ctx, naarPx, opt = {}) {
    if (!percelen.length) return;
    const pt = opt.pt || 1, W = opt.w ?? Infinity, H = opt.h ?? Infinity;
    ctx.save();
    ctx.strokeStyle = 'rgba(122,62,157,0.9)'; ctx.lineWidth = 1.1 * pt; ctx.setLineDash([7 * pt, 3 * pt]);
    const labels = [];
    for (const p of percelen) {
      const [ax, ay] = naarPx(p.x0, p.y1), [bx, by] = naarPx(p.x1, p.y0);
      if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > W || Math.max(ay, by) < 0 || Math.min(ay, by) > H) continue;
      ctx.beginPath();
      for (const r of p.ringen) r.forEach((q, i) => { const [x, y] = naarPx(q.x, q.y); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
      if (Math.min(Math.abs(bx - ax), Math.abs(by - ay)) > 34 * pt) labels.push(p);
    }
    ctx.setLineDash([]);
    ctx.font = `600 ${Math.round(11 * pt)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const p of labels) {
      const [x, y] = naarPx(p.lx, p.ly), t = perceelKort(p);
      if (x < -40 || y < -20 || x > W + 40 || y > H + 20) continue;
      ctx.lineWidth = 3.2 * pt; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.strokeText(t, x, y);
      ctx.fillStyle = '#6B2F8A'; ctx.fillText(t, x, y);
    }
    ctx.restore();
  }

  /** Kadastrale grenzen in een dwarsprofiel: offsets waar de profiellijn een perceelgrens snijdt + het perceel per vak. */
  function kadVoorGrafiek(reeks, isDwars) {
    if (document.getElementById('kadasterInProfiel')?.checked === false) return null;   // uitgezet bij het dwarsprofiel
    if (!percelen.length || !isDwars || reeks.station == null || reeks.maatgevend || asPunten.length < 2 || !reeks.length) return null;
    const o0 = reeks[0].offset, o1 = reeks[reeks.length - 1].offset;
    const a = puntOpStationOffset(reeks.station, o0), b = puntOpStationOffset(reeks.station, o1);
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const t = [];
    for (const p of percelen) {
      if (Math.max(a.x, b.x) < p.x0 || Math.min(a.x, b.x) > p.x1 || Math.max(a.y, b.y) < p.y0 || Math.min(a.y, b.y) > p.y1) continue;
      for (const r of p.ringen) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const ex = r[i].x - r[j].x, ey = r[i].y - r[j].y, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const u = ((r[j].x - a.x) * ey - (r[j].y - a.y) * ex) / den, v = ((r[j].x - a.x) * dy - (r[j].y - a.y) * dx) / den;
        if (u > 1e-6 && u < 1 - 1e-6 && v >= 0 && v <= 1) t.push(o0 + u * (o1 - o0));
      }
    }
    t.sort((p, q) => p - q);
    const grenzen = t.filter((v, i) => i === 0 || v - t[i - 1] > 0.05);
    const randen = [o0, ...grenzen, o1], vakken = [];
    for (let i = 0; i < randen.length - 1; i++) {
      const m = (randen[i] + randen[i + 1]) / 2, q = puntOpStationOffset(reeks.station, m), p = perceelOp(q.x, q.y);
      if (p) vakken.push({ van: randen[i], tot: randen[i + 1], label: perceelKort(p) });
    }
    void L;
    return { grenzen, vakken };
  }

  /* ────────────────────────────────────────────────────────────────
     Snoeicheck: doorloopprofiel over een pad (schouwpad, wandelpad).
     - Begroeiing: de ruwe punten van een puntenwolk (meestal dezelfde als
       A) in een strook langs de as, in 3D bewaard (takken vallen niet weg).
     - Maaiveld: eigen grondraster uit diezelfde punten (laagste punten per
       vak; bij een LAS met klasse 2 alleen de grondpunten), zodat het niet
       uitmaakt of A op hoogste of laagste punten is ingelezen.
     - Profiel: breedte B (midden op de as + verschuiving), vrije hoogte H
       boven het pad; het volgt het maaiveld van het pad. Daaromheen een
       snoeimarge (ruimer snoeien i.v.m. aangroei).
     - Toets: alles hoger dan "negeer onder" boven het eigen maaiveld dat in
       het profiel steekt = snoeien (rood), in de marge = meenemen (oranje).
       Losse punten (vogel, vlieg) tellen niet mee.
     - Snoeipunten: aaneengesloten stukken, per kant van het pad, maximaal
       een paar meter lang, genummerd langs de as.
     ──────────────────────────────────────────────────────────────── */
  let begroeiing = null;   // { naam, xs, ys, zs, ks, idx, r, half, asSleutel, grond }
  const SN_STANDAARD = { breedte: 2.0, hoogte: 2.5, marge: 0.5, verschuiving: 0, minHoogte: 0.3, stVan: '', stTot: '', minPunten: 3, maxLengte: 5, tonen: true, maaiveld: true };
  let snoei = { ...SN_STANDAARD };
  let snResultaat = null;
  const SN_KLEUR = { rood: '#C6472B', oranje: '#E08A1E', groen: '#6F9A5B', profiel: '#1B2A38' };
  const asSleutelNu = () => asPunten.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(';');

  /** Maaiveld voor de profiellijnen: binnen de strook van de snoeicheck het eigen grondraster
   *  (laagste punten, dus niet door de kronen heen), daarbuiten het terreinmodel van A. */
  function profielHoogte(x, y, o = 0) {
    const g = (begroeiing?.grond && snoei.maaiveld !== false && Math.abs(o) <= begroeiing.half - 0.5 && begroeiing.asSleutel === asSleutelNu()) ? begroeiing.grond.op(x, y) : null;
    return g ?? hoogteOp(x, y);
  }
  /** Halve breedte van de strook die van de begroeiingswolk bewaard wordt. */
  function snStrookHalf() {
    const B = dvGetal(snoei.breedte) ?? 2, M = Math.max(0, dvGetal(snoei.marge) ?? 0.5), c = Math.abs(dvGetal(snoei.verschuiving) ?? 0);
    return Math.max(8, c + B / 2 + M + 4);
  }

  /** Sink voor de lezers: alleen punten binnen `half` van de actieve as, met klasse (LAS); boven `limiet` uitdunnen in 3D. */
  function maakBegroeiingSink(half, limiet = 4000000) {
    const stukken = asStukken();
    const idx = maakLijnIndex(stukken, half, Math.max(1, half / 4));
    let bx0 = Infinity, by0 = Infinity;
    for (const st of stukken) { bx0 = Math.min(bx0, st.ax, st.bx); by0 = Math.min(by0, st.ay, st.by); }
    bx0 -= half + 2; by0 -= half + 2;
    let X = [], Y = [], Z = [], K = [], gezien = 0, metKlasse = false, cel = 0;
    const dun = () => {
      cel = cel ? cel * 1.4 : 0.03;
      let z0 = Infinity; for (let i = 0; i < Z.length; i += 97) if (Z[i] < z0) z0 = Z[i];
      z0 -= 200;
      const ruim = 131072, set = new Set(), nx = [], ny = [], nz = [], nk = [];
      for (let i = 0; i < X.length; i++) {
        const a = Math.floor((X[i] - bx0) / cel), b = Math.floor((Y[i] - by0) / cel), c = Math.floor((Z[i] - z0) / cel);
        if (a < 0 || b < 0 || c < 0 || a >= ruim || b >= ruim || c >= ruim) continue;
        const k = (a * ruim + b) * ruim + c;
        if (set.has(k)) continue;
        set.add(k); nx.push(X[i]); ny.push(Y[i]); nz.push(Z[i]); nk.push(K[i]);
      }
      X = nx; Y = ny; Z = nz; K = nk;
    };
    return {
      voegToe(x, y, z, r, g, b, klasse) {
        gezien++;
        const lijst = idx.zoek(x, y);
        if (!lijst) return;
        let binnen = false;
        for (let i = 0; i < lijst.length; i++) if (projecteer(stukken[lijst[i]], x, y).d <= half) { binnen = true; break; }
        if (!binnen) return;
        X.push(x); Y.push(y); Z.push(z); K.push(klasse ?? 0);
        if (klasse != null) metKlasse = true;
        if (X.length > limiet) { do dun(); while (X.length > limiet * 0.7); }
      },
      get aantalGezien() { return gezien; },
      get binnen() { return X.length; },
      resultaat() { return { xs: X, ys: Y, zs: Z, ks: metKlasse ? Uint8Array.from(K) : null, uitgedund: cel > 0, cel }; },
    };
  }

  /** Grondraster uit de begroeiingswolk: per vak het (op één na) laagste punt;
   *  vakken met alleen begroeiing (veel hoger dan de buren) → mediaan van de buren; gaten vullen. */
  function maakGrondRaster(w) {
    const n = w.xs.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) { const x = w.xs[i], y = w.ys[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    let heeftGrondKlasse = false;
    if (w.ks) for (let i = 0; i < n; i++) if (w.ks[i] === 2) { heeftGrondKlasse = true; break; }
    let cel = Math.max(0.5, Math.min(1.0, (w.idx?.afstand || 0.2) * 4)), nx, ny;
    for (;;) { nx = Math.floor((x1 - x0) / cel) + 1; ny = Math.floor((y1 - y0) / cel) + 1; if (nx * ny <= 1.5e7) break; cel *= 1.5; }
    const N = nx * ny, l1 = new Float32Array(N).fill(Infinity), l2 = new Float32Array(N).fill(Infinity), tel = new Uint16Array(N);
    for (let i = 0; i < n; i++) {
      if (heeftGrondKlasse && w.ks[i] !== 2) continue;
      const c = Math.floor((w.xs[i] - x0) / cel) + Math.floor((w.ys[i] - y0) / cel) * nx, z = w.zs[i];
      if (z < l1[c]) { l2[c] = l1[c]; l1[c] = z; } else if (z < l2[c]) l2[c] = z;
      if (tel[c] < 65535) tel[c]++;
    }
    let g = new Float32Array(N).fill(NaN);
    for (let c = 0; c < N; c++) if (tel[c]) g[c] = tel[c] >= 3 ? l2[c] : l1[c];
    // vakken die duidelijk boven hun omgeving liggen (geen grondpunt, alleen blad) → mediaan van de buren
    const g2 = g.slice(), buur = [];
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const c = ix + iy * nx;
      if (Number.isNaN(g[c])) continue;
      buur.length = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const v = g[jx + jy * nx]; if (!Number.isNaN(v)) buur.push(v);
      }
      if (buur.length < 4) continue;
      buur.sort((a, b) => a - b);
      const med = buur[buur.length >> 1];
      if (g[c] > med + 0.35) g2[c] = med;
    }
    g = g2;
    // gaten vullen (gemiddelde van de buren), een paar rondes
    for (let ronde = 0; ronde < 12; ronde++) {
      let gevuld = 0; const nieuw = g.slice();
      for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
        const c = ix + iy * nx;
        if (!Number.isNaN(g[c])) continue;
        let s = 0, m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const jx = ix + dx, jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const v = g[jx + jy * nx]; if (!Number.isNaN(v)) { s += v; m++; }
        }
        if (m) { nieuw[c] = s / m; gevuld++; }
      }
      g = nieuw;
      if (!gevuld) break;
    }
    return {
      cel, heeftGrondKlasse,
      op(x, y) {
        const fx = (x - x0) / cel - 0.5, fy = (y - y0) / cel - 0.5;
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        let s = 0, m = 0;
        for (const [dx, dy, wt] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
          const jx = Math.min(nx - 1, Math.max(0, ix + dx)), jy = Math.min(ny - 1, Math.max(0, iy + dy));
          const v = g[jx + jy * nx];
          if (!Number.isNaN(v)) { s += v * wt; m += wt; }
        }
        return m > 1e-9 ? s / m : null;
      },
    };
  }

  /** Snelle station/offset-projectie op de actieve as voor veel punten (lijnindex). */
  function maakSnProjectie(half) {
    const stukken = asStukken();
    const idx = maakLijnIndex(stukken, half, Math.max(1, half / 4));
    const r = stukken.map(st => { const len = Math.hypot(st.bx - st.ax, st.by - st.ay) || 1e-9; return { len, ux: (st.bx - st.ax) / len, uy: (st.by - st.ay) / len }; });
    return (x, y) => {
      const lijst = idx.zoek(x, y);
      if (!lijst) return null;
      let beste = null;
      for (let i = 0; i < lijst.length; i++) {
        const j = lijst[i], st = stukken[j], q = r[j];
        let t = (x - st.ax) * q.ux + (y - st.ay) * q.uy;
        t = Math.max(0, Math.min(q.len, t));
        const px = st.ax + q.ux * t, py = st.ay + q.uy * t, d = Math.hypot(x - px, y - py);
        if (!beste || d < beste.d) beste = { d, s: st.s0 + t, o: (x - px) * q.uy - (y - py) * q.ux };
      }
      return beste;
    };
  }

  function snKader() {
    if (asPunten.length < 2) return null;
    const st = stationsLangsAs(), L = st[st.length - 1];
    const B = dvGetal(snoei.breedte), H = dvGetal(snoei.hoogte);
    if (!(B > 0) || !(H > 0)) return null;
    const M = Math.max(0, dvGetal(snoei.marge) ?? 0);
    const van = dvGetal(snoei.stVan), tot = dvGetal(snoei.stTot);
    const s0 = van != null ? Math.max(0, van) : 0, s1 = tot != null ? Math.min(L, tot) : L;
    if (!(s1 > s0)) return null;
    return { B, H, M, c: dvGetal(snoei.verschuiving) ?? 0, minH: Math.max(0, dvGetal(snoei.minHoogte) ?? 0.3), s0, s1, L, heel: van == null && tot == null };
  }

  /** De toets zelf. */
  function voerSnoeiUit() {
    const k = snKader();
    if (!k) throw new Error(asPunten.length < 2 ? 'teken of lees eerst de as van het pad in' : 'vul de breedte en hoogte van het profiel in');
    const w = begroeiing;
    if (!w) throw new Error('lees eerst de puntenwolk met de begroeiing in (knop "uit puntenwolk A" of "ander bestand")');
    if (!w.grond) w.grond = maakGrondRaster(w);
    const proj = maakSnProjectie(w.half + 0.5);
    // hoogte van het pad langs de as (elke 0,5 m, midden van het profiel)
    const STAP = 0.5, nzc = Math.max(2, Math.ceil(k.L / STAP) + 1), zc = new Float32Array(nzc).fill(NaN);
    for (let i = 0; i < nzc; i++) { const q = puntOpStationOffset(Math.min(k.L, i * STAP), k.c); const z = w.grond.op(q.x, q.y); if (z != null) zc[i] = z; }
    for (let i = 1; i < nzc; i++) if (Number.isNaN(zc[i])) zc[i] = zc[i - 1];
    for (let i = nzc - 2; i >= 0; i--) if (Number.isNaN(zc[i])) zc[i] = zc[i + 1];
    const zcOp = (s) => { const f = Math.max(0, Math.min(nzc - 1, s / STAP)), i = Math.min(nzc - 2, Math.floor(f)), t = f - i; return zc[i] * (1 - t) + zc[i + 1] * t; };
    const n = w.xs.length;
    const S = new Float32Array(n), O = new Float32Array(n), HP = new Float32Array(n), HL = new Float32Array(n), cls = new Uint8Array(n);
    const half = k.B / 2, halfM = half + k.M, ks = w.ks, grondK = w.grond.heeftGrondKlasse;
    for (let i = 0; i < n; i++) {
      const so = proj(w.xs[i], w.ys[i]);
      if (!so || so.d > w.half + 0.5) { S[i] = NaN; continue; }
      S[i] = so.s; O[i] = so.o;
      const z = w.zs[i], zp = zcOp(so.s), g = w.grond.op(w.xs[i], w.ys[i]);
      HP[i] = z - zp; HL[i] = g == null ? HP[i] : z - g;
      if ((grondK && ks[i] === 2) || (ks && ks[i] === 7) || HL[i] < k.minH) continue;   // grond, gras, ruis-klasse
      if (so.s < k.s0 || so.s > k.s1) { cls[i] = 1; continue; }
      const ad = Math.abs(so.o - k.c);
      if (HP[i] > 0 && ad <= half && HP[i] <= k.H) cls[i] = 3;
      else if (HP[i] > 0 && ad <= halfM && HP[i] <= k.H + k.M) cls[i] = 2;
      else cls[i] = 1;
    }
    // ruisfilter in 3D (station, offset, hoogte), vakken van 0,5 m over alle begroeiing rond het profiel
    const CEL = 0.5, tel = new Map();
    const sleutel = (s, o, z) => (Math.floor(s / CEL) * 512 + (Math.floor(o / CEL) + 256)) * 8192 + (Math.floor(z / CEL) + 4096);
    for (let i = 0; i < n; i++) {
      if (!cls[i] || Math.abs(O[i] - k.c) > halfM + 1.5) continue;
      const key = sleutel(S[i], O[i], w.zs[i]); tel.set(key, (tel.get(key) || 0) + 1);
    }
    const minP = Math.max(1, Math.round(dvGetal(snoei.minPunten) ?? 3));
    let ruis = 0;
    for (let i = 0; i < n; i++) {
      if (cls[i] < 2) continue;
      const cs = Math.floor(S[i] / CEL), co = Math.floor(O[i] / CEL), cz = Math.floor(w.zs[i] / CEL);
      let m = -1;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) m += tel.get(((cs + a) * 512 + (co + b + 256)) * 8192 + (cz + c + 4096)) || 0;
      if (m < minP) { cls[i] = 4; ruis++; }
    }
    // snoeipunten: aaneengesloten vakken (0,5 m, tot 1,5 m tussenruimte) per kant van het pad
    const CL = 0.5, cellen = new Map();
    for (let i = 0; i < n; i++) {
      if (cls[i] !== 2 && cls[i] !== 3) continue;
      const kant = 0;   // geen splitsing per kant: een kroon die over het hele pad hangt is één snoeipunt
      const key = (Math.floor(S[i] / CL) * 1024 + (Math.floor((O[i] - k.c) / CL) + 512)) * 2 + kant;
      let l = cellen.get(key); if (!l) cellen.set(key, l = []); l.push(i);
    }
    const gezien = new Set(), groepen = [];
    for (const start of cellen.keys()) {
      if (gezien.has(start)) continue;
      const kant = start % 2, wachtrij = [start], groep = [];
      gezien.add(start);
      while (wachtrij.length) {
        const key = wachtrij.pop();
        groep.push(...cellen.get(key));
        const rest = (key - kant) / 2, cs = Math.floor(rest / 1024), co = rest - cs * 1024;
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
          const nk = ((cs + a) * 1024 + (co + b)) * 2 + kant;
          if (!gezien.has(nk) && cellen.has(nk)) { gezien.add(nk); wachtrij.push(nk); }
        }
      }
      groepen.push({ kant, punten: groep });
    }
    // lange stukken opknippen (max. lengte per snoeipunt)
    const maxL = Math.max(1, dvGetal(snoei.maxLengte) ?? 5);
    const delen = [];
    for (const gr of groepen) {
      let lo = Infinity, hi = -Infinity;
      for (const i of gr.punten) { if (S[i] < lo) lo = S[i]; if (S[i] > hi) hi = S[i]; }
      const stukken = Math.max(1, Math.ceil((hi - lo) / maxL - 1e-9));
      if (stukken === 1) { delen.push(gr); continue; }
      const bak = Array.from({ length: stukken }, () => []);
      for (const i of gr.punten) bak[Math.min(stukken - 1, Math.floor((S[i] - lo) / ((hi - lo) / stukken)))].push(i);
      for (const b of bak) if (b.length) delen.push({ kant: gr.kant, punten: b });
    }
    const snoeipunten = [];
    for (const d of delen) {
      const m = d.punten.length;
      let s0 = Infinity, s1 = -Infinity, oDicht = Infinity, hVan = Infinity, hTot = -Infinity, nRood = 0, nOranje = 0, minHL = Infinity, diepte = 0, vanOpzij = 0, vanBoven = 0;
      let sx = 0, sy = 0, sz = -Infinity, nL = 0, nR = 0;
      for (const i of d.punten) {
        const ad = Math.abs(O[i] - k.c);
        if (O[i] < k.c) nL++; else nR++;
        if (S[i] < s0) s0 = S[i]; if (S[i] > s1) s1 = S[i];
        if (ad < oDicht) oDicht = ad;
        if (HP[i] < hVan) hVan = HP[i]; if (HP[i] > hTot) hTot = HP[i];
        if (HL[i] < minHL) minHL = HL[i];
        if (cls[i] === 3) nRood++; else nOranje++;
        const zij = halfM - ad, boven = k.H + k.M - HP[i];
        const dp = Math.min(zij, boven);   // zoveel moet er af om buiten profiel + marge te komen
        if (dp > diepte) diepte = dp;
        if (zij < boven) vanOpzij++; else vanBoven++;
        sx += w.xs[i]; sy += w.ys[i]; if (w.zs[i] > sz) sz = w.zs[i];
      }
      const vanafGrond = minHL < 0.6 && hVan < 0.8;
      snoeipunten.push({
        kant: Math.min(nL, nR) >= 0.2 * m ? 'L+R' : nL > nR ? 'L' : 'R', zijde: nL >= nR ? 'L' : 'R', s0, s1, lengte: Math.max(0.1, s1 - s0), sMid: (s0 + s1) / 2,
        oDicht, hVan: Math.max(0, hVan), hTot: Math.min(hTot, k.H + k.M), diepte,
        ernst: nRood ? 'rood' : 'oranje', nRood, nOranje,
        soort: vanafGrond ? 'struik/stam vanaf de grond' : vanOpzij >= vanBoven ? 'tak (van opzij)' : 'kroon (van boven)',
        x: sx / m, y: sy / m, z: sz, punten: d.punten,
      });
    }
    snoeipunten.sort((a, b) => a.s0 - b.s0 || a.kant.localeCompare(b.kant));
    snoeipunten.forEach((p, i) => { p.nr = i + 1; });
    // stammen: kolommen begroeiing tussen 0,5 en 2,0 m boven het maaiveld (vakken van 0,5 m);
    // bij elk snoeipunt de dichtstbijzijnde stam (liefst aan dezelfde kant) = de boom die gesnoeid moet worden
    {
      const SC = 0.5, kolom = new Map();
      for (let i = 0; i < n; i++) {
        if (!cls[i] || cls[i] === 4 || HL[i] < 0.5 || HL[i] > 2.0) continue;
        const ix = Math.floor(w.xs[i] / SC), iy = Math.floor(w.ys[i] / SC), key = ix * 4e6 + iy;
        let c = kolom.get(key); if (!c) kolom.set(key, c = { n: 0, sx: 0, sy: 0, ix, iy, band: 0 });
        c.n++; c.sx += w.xs[i]; c.sy += w.ys[i];
        c.band |= 1 << Math.min(3, Math.floor((HL[i] - 0.5) / 0.375));   // 4 hoogtebanden tussen 0,5 en 2,0 m
      }
      // een stam (of struik) loopt door van laag naar hoog; een blad- of takkenbos dat alleen hoog hangt niet
      for (const c of kolom.values()) if (!((c.band & 1) && (c.band & 8)) || ((c.band & 6) === 0)) c.n = 0;
      const DREMPEL = 10, stammen = [], bezocht = new Set();
      for (const [key, c0] of kolom) {
        if (c0.n < DREMPEL || bezocht.has(key)) continue;
        const stapel = [key]; bezocht.add(key);
        let nn = 0, sx = 0, sy = 0;
        while (stapel.length) {
          const cc = kolom.get(stapel.pop()); nn += cc.n; sx += cc.sx; sy += cc.sy;
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
            const nk = (cc.ix + a) * 4e6 + (cc.iy + b), nc = kolom.get(nk);
            if (nc && nc.n >= DREMPEL && !bezocht.has(nk)) { bezocht.add(nk); stapel.push(nk); }
          }
        }
        stammen.push({ x: sx / nn, y: sy / nn, n: nn });
      }
      for (const p of snoeipunten) {
        if (p.soort.startsWith('struik')) {
          let sx = 0, sy = 0, m = 0;
          for (const i of p.punten) if (HL[i] < 1.2) { sx += w.xs[i]; sy += w.ys[i]; m++; }
          p.stam = m ? { x: sx / m, y: sy / m } : null;
          continue;
        }
        let beste = null, bd = Infinity;
        for (const st of stammen) {
          const d = Math.hypot(st.x - p.x, st.y - p.y);
          if (d > 12) continue;
          const so = proj(st.x, st.y), zijde = so ? (so.o < k.c ? 'L' : 'R') : null;
          const dd = d + (zijde && zijde !== p.zijde ? 3 : 0);
          if (dd < bd) { bd = dd; beste = st; }
        }
        p.stam = beste ? { x: beste.x, y: beste.y } : null;
      }
    }
    // begroeiing per meter station (voor het dwarsprofiel en het lengteprofiel)
    const nb = Math.max(1, Math.ceil(k.L) + 2), start = new Uint32Array(nb + 1);
    let nv = 0;
    for (let i = 0; i < n; i++) if (cls[i] && cls[i] !== 4) { start[Math.min(nb - 1, Math.max(0, Math.floor(S[i]))) + 1]++; nv++; }
    for (let b = 0; b < nb; b++) start[b + 1] += start[b];
    const vul = start.slice(0, nb), volgorde = new Uint32Array(nv);
    for (let i = 0; i < n; i++) if (cls[i] && cls[i] !== 4) volgorde[vul[Math.min(nb - 1, Math.max(0, Math.floor(S[i])))]++] = i;
    const res = {
      ...k, S, O, HP, HL, cls, zcOp, start, volgorde, nb, snoeipunten, ruis, minPunten: minP,
      nRood: snoeipunten.filter(p => p.ernst === 'rood').length, nOranje: snoeipunten.filter(p => p.ernst === 'oranje').length,
      lengteRood: snoeipunten.filter(p => p.ernst === 'rood').reduce((a, p) => a + p.lengte, 0),
      punten: n, grondKlasse: grondK, asVerouderd: w.asSleutel !== asSleutelNu(), asSl: asSleutelNu(), tijd: new Date(),
    };
    res.ok = res.nRood === 0;
    // dekking: binnen profiel + marge moet overal iets gemeten zijn (grond, gras of begroeiing),
    // anders kan er ook niets gevonden worden
    {
      const lus = (cb) => { for (let i = 0; i < n; i++) if (!Number.isNaN(S[i]) && S[i] >= k.s0 && S[i] <= k.s1 && Math.abs(O[i] - k.c) <= halfM) cb(S[i], O[i]); };
      res.dekking = maakDekking({ s0: k.s0, s1: k.s1, o0: k.c - halfM, o1: k.c + halfM, cel: dekkingCel(lokalePuntafstand(lus)), gemeten: lus, alles: true, minOpp: 1 });
    }
    snKoppelPercelen(res);
    snResultaat = res;
    return res;
  }
  /** Per snoeipunt: op welk perceel de boom staat, en boven welk perceel het snoeiwerk is. */
  function snKoppelPercelen(r) {
    for (const p of r.snoeipunten) {
      p.perceel = p.stam && percelen.length ? perceelOp(p.stam.x, p.stam.y) : null;
      p.perceelPlek = percelen.length ? perceelOp(p.x, p.y) : null;
    }
  }
  /** Snoeipunten per perceel (van de boom): [{ perceel, punten: [...] }], zonder perceel achteraan. */
  function snPerPerceel(r) {
    const m = new Map();
    for (const p of r.snoeipunten) {
      const k = p.perceel ? perceelNaam(p.perceel) : '';
      if (!m.has(k)) m.set(k, { perceel: p.perceel, punten: [] });
      m.get(k).punten.push(p);
    }
    return [...m.entries()].sort((a, b) => (a[0] === '') - (b[0] === '') || a[1].punten[0].nr - b[1].punten[0].nr).map(e => e[1]);
  }
  /** Het resultaat, opnieuw berekend als de as intussen is gewijzigd. */
  function snGeldig() {
    if (!snResultaat || !begroeiing) return null;
    if (snResultaat.asSl !== asSleutelNu()) { try { voerSnoeiUit(); } catch { snResultaat = null; } }
    return snResultaat;
  }
  /** Begroeiingspunten tussen station s0 en s1 (index in de wolk). */
  function snVenster(r, s0, s1, cb) {
    const b0 = Math.max(0, Math.floor(s0)), b1 = Math.min(r.nb - 1, Math.floor(s1));
    for (let b = b0; b <= b1; b++) for (let k = r.start[b]; k < r.start[b + 1]; k++) { const i = r.volgorde[k]; if (r.S[i] >= s0 && r.S[i] <= s1) cb(i); }
  }

  /** Gegevens voor een grafiek: dwars- of lengteprofiel. */
  function snVoorGrafiek(reeks, isDwars, xVeld) {
    if (!snoei.tonen || reeks.maatgevend) return null;
    const r = snGeldig();
    if (!r) return null;
    const halfM = r.B / 2 + r.M, w = begroeiing, uit = { r, punten: [], badges: [], hoogtes: [] };
    if (isDwars && reeks.station != null) {
      const st = reeks.station, int = Math.max(0.5, Number(dwarsIntervalVeld.value) || 5);
      const v = Math.max(0.25, Math.min(1.0, int / 2));
      uit.soort = 'dwars'; uit.st = st;
      uit.inBereik = st >= r.s0 - 1e-6 && st <= r.s1 + 1e-6;
      uit.zc = r.zcOp(st);
      const xMin = reeks[0].offset, xMax = reeks[reeks.length - 1].offset, plafond = uit.zc + r.H + r.M + 2.2;
      const lijst = [];
      snVenster(r, st - v, st + v, (i) => { if (r.O[i] >= xMin && r.O[i] <= xMax && w.zs[i] <= plafond) lijst.push(i); });
      const stap = Math.max(1, Math.floor(lijst.length / 15000));
      for (let j = 0; j < lijst.length; j += stap) { const i = lijst[j]; uit.punten.push([r.O[i], w.zs[i], r.cls[i]]); }
      if (uit.inBereik) uit.hoogtes.push(uit.zc, uit.zc + r.H + r.M);
      for (const p of r.snoeipunten) if (st >= p.s0 - v && st <= p.s1 + v) {
        let oS = 0, m = 0, zT = -Infinity;
        for (const i of p.punten) if (Math.abs(r.S[i] - st) <= v + 0.5) { oS += r.O[i]; m++; if (w.zs[i] > zT) zT = w.zs[i]; }
        if (m) uit.badges.push({ nr: p.nr, ernst: p.ernst, x: oS / m, z: zT });
      }
    } else if (xVeld === 'station') {
      uit.soort = 'langs';
      const lijst = [];
      snVenster(r, r.s0, r.s1, (i) => { if (Math.abs(r.O[i] - r.c) <= halfM + 0.25 && r.HP[i] <= r.H + r.M + 2.2) lijst.push(i); });
      const stap = Math.max(1, Math.floor(lijst.length / 30000));
      for (let j = 0; j < lijst.length; j += stap) { const i = lijst[j]; uit.punten.push([r.S[i], w.zs[i], r.cls[i]]); }
      uit.lijn = [];
      const n = Math.max(2, Math.min(1500, Math.ceil((r.s1 - r.s0) / 0.5)));
      for (let i = 0; i <= n; i++) { const s = r.s0 + (r.s1 - r.s0) * i / n; uit.lijn.push([s, r.zcOp(s)]); }
      for (const [, z] of uit.lijn) uit.hoogtes.push(z + r.H + r.M);
      for (const p of r.snoeipunten) uit.badges.push({ nr: p.nr, ernst: p.ernst, x: p.sMid, z: p.hTot + r.zcOp(p.sMid) });
    } else return null;
    for (const p of uit.punten) uit.hoogtes.push(p[1]);
    return uit;
  }

  /** Snoeiprofiel en -punten in een 2D-kaart (scherm en PDF). naarPx(x, y) → [px, py]. */
  function tekenSnoeiOpCanvas(ctx, naarPx, opt = {}) {
    if (!snoei.tonen || asPunten.length < 2) return;
    const r = snGeldig(), w = begroeiing;
    if (!r || !w) return;
    const pt = opt.pt || 1, W = opt.w ?? Infinity, Hc = opt.h ?? Infinity;
    const binnenBeeld = (px, py, rand = 6) => px > -rand && py > -rand && px < W + rand && py < Hc + rand;
    // begroeiing (licht), dan marge (oranje) en profiel (rood)
    const stip = Math.max(1.5 * pt, Math.min(5 * pt, (w.idx?.afstand || 0.2) * (opt.pxPerM || 4) * 1.6));
    const teken = (filter, kleur, max) => {
      const lijst = [];
      snVenster(r, 0, r.L + 1, (i) => { if (filter(i)) lijst.push(i); });
      const stap = Math.max(1, Math.floor(lijst.length / max));
      ctx.fillStyle = kleur;
      for (let j = 0; j < lijst.length; j += stap) { const i = lijst[j]; const [px, py] = naarPx(w.xs[i], w.ys[i]); if (binnenBeeld(px, py)) ctx.fillRect(px - stip / 2, py - stip / 2, stip, stip); }
    };
    teken((i) => r.cls[i] === 1, 'rgba(111,154,91,0.35)', opt.maxPunten || 40000);
    teken((i) => r.cls[i] === 2, 'rgba(224,138,30,0.85)', opt.maxGekleurd || 60000);
    teken((i) => r.cls[i] === 3, 'rgba(198,71,43,0.9)', opt.maxGekleurd || 60000);
    // niet gemeten binnen profiel + marge (dekkingskaart)
    tekenDekkingOpCanvas(ctx, naarPx, r.dekking, { pt, w: W, h: Hc, labels: 0 });
    // randen van het profiel en de marge
    const n = Math.max(2, Math.min(2000, Math.ceil((r.s1 - r.s0) / 1)));
    const rand = (o, kleur, dash, dik) => {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const q = puntOpStationOffset(r.s0 + (r.s1 - r.s0) * i / n, o); const [px, py] = naarPx(q.x, q.y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.setLineDash(dash.map(v => v * pt)); ctx.lineWidth = dik * pt; ctx.strokeStyle = kleur; ctx.stroke(); ctx.setLineDash([]);
    };
    for (const o of [r.c - r.B / 2 - r.M, r.c + r.B / 2 + r.M]) rand(o, 'rgba(224,138,30,0.9)', [5, 4], 1.2);
    for (const o of [r.c - r.B / 2, r.c + r.B / 2]) rand(o, SN_KLEUR.profiel, [10, 4, 2, 4], 1.4);
    // genummerde snoeipunten: rondje naast het pad met een lijntje naar de plek
    const straal = (opt.badge || 9) * pt;
    ctx.font = `700 ${Math.round(straal * 1.15)}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const geplaatst = [];
    for (const p of r.snoeipunten) {
      const [cx, cy] = naarPx(p.x, p.y);
      const uitO = (p.zijde === 'L' ? -1 : 1) * (r.B / 2 + r.M + Math.max(1.2, 22 * pt / Math.max(1e-6, opt.pxPerM || 4)));
      const q = puntOpStationOffset(p.sMid, r.c + uitO);
      let [bx, by] = naarPx(q.x, q.y);
      for (let poging = 0; poging < 6 && geplaatst.some(([gx, gy]) => Math.hypot(gx - bx, gy - by) < straal * 2.1); poging++) {
        const q2 = puntOpStationOffset(p.sMid, r.c + uitO * (1 + 0.6 * (poging + 1)));
        [bx, by] = naarPx(q2.x, q2.y);
      }
      if (!binnenBeeld(bx, by, 20) && !binnenBeeld(cx, cy, 20)) continue;
      geplaatst.push([bx, by]);
      const kleur = p.ernst === 'rood' ? SN_KLEUR.rood : SN_KLEUR.oranje;
      if (p.stam) {   // de boom die erbij hoort: stippellijn naar de stam
        const [tx, ty] = naarPx(p.stam.x, p.stam.y);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.setLineDash([3 * pt, 3 * pt]); ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 1.2 * pt; ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(tx, ty, 4.2 * pt, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.8 * pt; ctx.strokeStyle = '#2E7D32'; ctx.stroke();
        ctx.beginPath(); ctx.arc(tx, ty, 1.6 * pt, 0, Math.PI * 2); ctx.fillStyle = '#2E7D32'; ctx.fill();
      }
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.strokeStyle = kleur; ctx.lineWidth = 1.2 * pt; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 2.2 * pt, 0, Math.PI * 2); ctx.fillStyle = kleur; ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by, straal, 0, Math.PI * 2); ctx.fillStyle = kleur; ctx.fill();
      ctx.lineWidth = 1.6 * pt; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(String(p.nr), bx, by + 0.5 * pt);
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    // labels van de niet-gemeten plekken als laatste, aan de kant waar geen snoeipunt-nummer staat
    tekenDekkingOpCanvas(ctx, naarPx, r.dekking, { pt, w: W, h: Hc, labels: 3, alleenLabels: true, labelNaast: r.B / 2 + r.M + 0.3, midden: r.c, vermijd: geplaatst, vermijdStraal: straal,
      kant: (g) => { const bij = r.snoeipunten.filter(p => p.s1 > g.s0 - 6 && p.s0 < g.s1 + 6); const l = bij.filter(p => p.zijde === 'L').length, rr = bij.length - l; return l === rr ? null : (l < rr ? -1 : 1); } });
  }

  /* ── begroeiing inlezen ── */
  async function laadBegroeiing(bestand) {
    if (!xs) { toonFout('Open eerst de puntenwolk (A).'); return; }
    if (asPunten.length < 2) { toonFout('Teken of lees eerst de as van het pad in: de begroeiing wordt in een strook langs de as gelezen.'); return; }
    const half = snStrookHalf();
    statusEl.style.color = ''; statusEl.textContent = `Begroeiing: ${bestand.name} inlezen (strook ± ${komma(half, 1)} m langs de as)…`;
    await new Promise(r => setTimeout(r, 10));
    const sink = maakBegroeiingSink(half);
    try {
      if (bestand.tegelbron) {
        const voortgang = (n, t) => { statusEl.textContent = `Begroeiing: ${bestand.name}… ${Math.round(100 * n / Math.max(1, t))}% · ${sink.binnen.toLocaleString('nl-NL')} punten in de strook`; };
        await leesTegels(bestand, voortgang, sink, strookKader(half), tegelsLangsAs(half));
      } else if (/\.la[sz]$/i.test(bestand.name)) {
        const header = await leesLasHeader(bestand);
        const voortgang = (n, t) => { statusEl.textContent = `Begroeiing: ${bestand.name}… ${Math.round(100 * n / Math.max(1, t))}% · ${sink.binnen.toLocaleString('nl-NL')} punten in de strook`; };
        if (header.isCompressed) await leesLazPunten(bestand, header, voortgang, true, sink);
        else await leesLasPunten(bestand, header, voortgang, true, sink);
      } else {
        await leesPts(bestand, (n, t, f) => { statusEl.textContent = `Begroeiing: ${bestand.name}… ${Math.round((f ?? (n / Math.max(1, t))) * 100)}% · ${sink.binnen.toLocaleString('nl-NL')} punten in de strook`; }, sink);
      }
    } catch (err) { toonFout(`kon ${bestand.name} niet lezen: ${err.message}`); return; }
    const r = sink.resultaat();
    if (r.xs.length < 50) { toonFout(`${bestand.name}: (bijna) geen punten langs de as gevonden — ligt de as op het pad en is alles in RD (EPSG:28992)?`); return; }
    zetBegroeiing(bestand.name, r.xs, r.ys, r.zs, r.ks, half);
    statusEl.textContent = `Begroeiing: ${bestand.name} — ${begroeiing.xs.length.toLocaleString('nl-NL')} punten in de strook${r.uitgedund ? ` (uitgedund in 3D, vakjes van ${Math.round(r.cel * 100)} cm)` : ''}${begroeiing.grond.heeftGrondKlasse ? ' · maaiveld uit grondklasse 2' : ''}`;
    try { voerSnoeiUit(); } catch { snResultaat = null; }
    // terreinmodel van A door de kronen heen: in 3D (en het 3D-blad) dan het maaiveld van de strook tonen
    if (aDoorKronen() && drieDLagen.bodem !== false) { drieDLagen.bodem = false; pasDrieDLagenToe(); statusEl.textContent += ' · 3D: laag "Bodem" (A, door de kronen) uitgezet, "Maaiveld (strook)" aan'; }
    werkSnoeiPaneelBij();
    bijwerkenProfielen(); tekenVlak();
  }
  /** Loopt het terreinmodel van A langs de as door de kronen (niet op laagste punten uitgedund)? */
  function aDoorKronen() {
    const r = snResultaat; if (!r || !xs) return false;
    let n = 0, hoog = 0;
    for (let st = r.s0; st <= r.s1; st += Math.max(1, (r.s1 - r.s0) / 120)) {
      const q = puntOpStationOffset(st, r.c), h = hoogteOp(q.x, q.y);
      if (h == null) continue;
      n++; if (h - r.zcOp(st) > 0.8) hoog++;
    }
    return n > 10 && hoog / n > 0.08;
  }
  function zetBegroeiing(naam, bx, by, bz, ks, half) {
    const w = maakBrugWolk(naam, bx, by, bz);
    w.ks = ks || null; w.half = half; w.asSleutel = asSleutelNu();
    w.grond = maakGrondRaster(w);
    begroeiing = w; snResultaat = null;
  }

  /* ── dialoog ── */
  const snDialoog = document.getElementById('snDialoog');
  const SN_VELDEN = { snBreedte: 'breedte', snHoogte: 'hoogte', snMarge: 'marge', snVerschuiving: 'verschuiving', snMinHoogte: 'minHoogte', snVan: 'stVan', snTot: 'stTot', snMinPunten: 'minPunten', snMaxLengte: 'maxLengte' };
  function zetSnoeiVelden() {
    for (const [id, sl] of Object.entries(SN_VELDEN)) { const e = document.getElementById(id); if (e) e.value = snoei[sl] ?? ''; }
    const t = document.getElementById('snTonen'); if (t) t.checked = snoei.tonen !== false;
    const mv = document.getElementById('snMaaiveld'); if (mv) mv.checked = snoei.maaiveld !== false;
  }
  function leesSnoeiVelden() {
    for (const [id, sl] of Object.entries(SN_VELDEN)) { const e = document.getElementById(id); if (e) snoei[sl] = e.value; }
    const t = document.getElementById('snTonen'); if (t) snoei.tonen = t.checked;
    const mv = document.getElementById('snMaaiveld'); if (mv) snoei.maaiveld = mv.checked;
  }
  const snPlek = (p) => `st. ${komma(p.s0, 1)} – ${komma(p.s1, 1)}`;
  /** Samenvatting [label, waarde, status]. */
  function snRegels(r) {
    const regels = [];
    regels.push(['Doorloopprofiel', `${komma(r.B, 2)} m breed × ${komma(r.H, 2)} m hoog boven het pad`, null]);
    regels.push(['Snoeimarge', r.M ? `${komma(r.M, 2)} m rondom (oranje)` : 'geen', null]);
    regels.push(['Ligging', Math.abs(r.c) < 1e-9 ? 'midden op de as' : `${komma(Math.abs(r.c), 2)} m ${r.c < 0 ? 'links' : 'rechts'} van de as`, null]);
    regels.push(['Gecontroleerd', `st. ${komma(r.s0, 1)} – ${komma(r.s1, 1)} m (${komma(r.s1 - r.s0, 1)} m)`, null]);
    regels.push(['Niet meegeteld', `begroeiing lager dan ${komma(r.minH, 2)} m boven maaiveld${r.ruis ? ` · ${r.ruis} losse punten` : ''}`, null]);
    regels.push(['Snoeipunten in het profiel', r.nRood ? `${r.nRood} (samen ${komma(r.lengteRood, 1)} m)` : 'geen', r.nRood ? 'nok' : 'ok']);
    regels.push(['Alleen in de snoeimarge', r.nOranje ? String(r.nOranje) : 'geen', null]);
    if (r.dekking) dekkingRegels(regels, r.dekking, 'Gemeten in het profiel', 'van profiel + marge', () => ' · niet te beoordelen');
    const gat = r.dekking?.oppGatLijst || 0;
    regels.push(['Oordeel', r.ok ? `${r.nOranje ? 'VRIJ (marge meenemen)' : 'VRIJ'}${gat ? ` — ${komma(gat, gat < 10 ? 1 : 0)} m² niet gemeten` : ''}` : `SNOEIEN${gat ? ` — ${komma(gat, gat < 10 ? 1 : 0)} m² niet gemeten` : ''}`, r.ok ? (gat ? 'let' : 'ok') : 'nok']);
    return regels;
  }
  function toonSnoeiResultaat() {
    const vak = document.getElementById('snResultaat'), lijst = document.getElementById('snLijst');
    const chip = document.getElementById('snChip'), r = snResultaat;
    if (chip) {
      const gat = r?.dekking?.gaten.length ? ' · deels niet gemeten' : '';
      chip.textContent = !r ? (begroeiing ? 'nog niet gecontroleerd' : 'geen begroeiing') : r.ok ? (r.nOranje ? `✓ vrij · ${r.nOranje} in marge${gat}` : `✓ vrij${gat}`) : `✗ ${r.nRood} snoeipunt${r.nRood === 1 ? '' : 'en'}${gat}`;
      chip.className = 'dvChip ' + (!r ? '' : r.ok ? (gat ? 'let' : 'ok') : 'nok');
    }
    const csv = document.getElementById('snCsv'); if (csv) csv.disabled = !r || !r.snoeipunten.length;
    if (!vak) return;
    if (!r) { vak.innerHTML = `<p class="hint">${begroeiing ? 'Vul de maten in en klik op <b>Controleren</b>.' : 'Lees eerst de begroeiing in.'}</p>`; if (lijst) lijst.innerHTML = ''; return; }
    vak.innerHTML = (r.asVerouderd ? '<p class="hint waarschuw">De as is gewijzigd sinds de begroeiing is ingelezen — lees de begroeiing opnieuw in voor de hele strook.</p>' : '') +
      '<table class="dvTabel">' + snRegels(r).map(([l, w, s]) => `<tr class="${s || ''}${l === 'Oordeel' ? ' oordeel' : ''}"><th>${l}</th><td>${w}</td></tr>`).join('') + '</table>';
    if (lijst) {
      if (!r.snoeipunten.length) { lijst.innerHTML = '<p class="hint">Geen begroeiing in het profiel of de marge.</p>'; return; }
      const metKad = percelen.length > 0;
      lijst.innerHTML = '<table class="snTabel"><thead><tr><th>nr</th><th>station</th><th>kant</th>' + (metKad ? '<th>perceel boom</th>' : '') + '<th>boven pad</th><th>tot hart</th><th>terug&shy;snoeien</th><th>soort</th></tr></thead><tbody>' +
        r.snoeipunten.map(p => `<tr data-nr="${p.nr}" class="${p.ernst}"><td><span class="snNr ${p.ernst}">${p.nr}</span></td><td>${snPlek(p)}${stationeringAan() ? `<br><span class="snPaal">${paalTekst(p.s0)}</span>` : ''}</td><td>${p.kant}</td>` +
          (metKad ? `<td class="snPerc" title="${p.perceel ? perceelNaam(p.perceel) : ''}">${p.perceel ? perceelKort(p.perceel) : (p.stam ? 'buiten kaart' : '—')}</td>` : '') +
          `<td>${komma(p.hVan, 2)} – ${komma(p.hTot, 2)} m</td><td>${komma(p.oDicht, 2)} m</td><td>${komma(p.diepte, 2)} m</td><td>${p.soort}</td></tr>`).join('') + '</tbody></table>' +
        (metKad ? '<div class="snPerPerceel"><b>Per perceel (waar de boom staat)</b>' + snPerPerceel(r).map(g => `<div><span>${g.perceel ? perceelNaam(g.perceel) : 'onbekend perceel'}</span><span>${g.punten.map(p => `<span class="snNr ${p.ernst}">${p.nr}</span>`).join(' ')}</span></div>`).join('') + '</div>' : '');
    }
  }
  function werkSnoeiPaneelBij() {
    const naam = document.getElementById('snNaam');
    if (naam) { naam.textContent = begroeiing ? `${begroeiing.naam} · ${begroeiing.xs.length.toLocaleString('nl-NL')} p.` : 'niet ingelezen'; naam.title = begroeiing?.naam || ''; }
    const wis = document.getElementById('snWis'); if (wis) wis.hidden = !begroeiing;
    const uitA = document.getElementById('snUitA'); if (uitA) { uitA.disabled = !laatsteBestand || asPunten.length < 2; uitA.title = laatsteBestand ? `De begroeiing uit ${laatsteBestand.name} lezen (alle punten in een strook langs de as)` : 'Puntenwolk A is uit een project geladen — kies het bestand met "Ander bestand…"'; }
    const ander = document.getElementById('snAnderKnop'); if (ander) ander.disabled = asPunten.length < 2;
    const ogHint = document.getElementById('snOndergrondHint'); if (ogHint) ogHint.hidden = oppervlakModus() === 'onder';
    const knop = document.getElementById('snoeiKnop'); if (knop) knop.disabled = !xs;
    const auto = document.getElementById('snAutoTekst'); const k = snKader();
    if (auto) auto.textContent = k ? (k.heel ? `hele as: ${komma(k.L, 1)} m` : `${komma(k.s1 - k.s0, 1)} m`) : '';
    toonSnoeiResultaat();
  }
  let snTimer = null;
  function snGewijzigd() {
    leesSnoeiVelden();
    clearTimeout(snTimer);
    // bij een grote wolk duurt de toets even: pas rekenen als er even niet getypt wordt
    snTimer = setTimeout(() => {
      if (snResultaat) { try { voerSnoeiUit(); } catch { snResultaat = null; } }
      werkSnoeiPaneelBij();
      tekenVlak(); tekenDwarsVoorHuidigeStation(); tekenLangs();
    }, 250);
  }
  function naarSnoeipunt(p) {
    if (!p || !dwarsStations.length) return;
    let beste = 0; dwarsStations.forEach((s, i) => { if (Math.abs(s - p.sMid) < Math.abs(dwarsStations[beste] - p.sMid)) beste = i; });
    huidigeStationIndex = beste;
    tekenVlak(); tekenDwarsVoorHuidigeStation(); tekenLangs();
    statusEl.style.color = '';
    statusEl.textContent = `Snoeipunt ${p.nr}: ${snPlek(p)} m${paalAchter(p.s0, ' (') ? paalAchter(p.s0, ' (') + ')' : ''}, ${p.kant.length > 1 ? 'over het pad' : p.kant === 'L' ? 'links' : 'rechts'}, ${komma(p.hVan, 2)} – ${komma(p.hTot, 2)} m boven het pad · ${p.soort} · terugsnoeien ± ${komma(p.diepte, 2)} m`;
  }
  /** Snoeilijst als CSV (puntkomma, decimale komma: opent zo in Excel). */
  function maakSnoeiCsv(r) {
    const c = (v, d = 2) => v == null ? '' : komma(v, d);
    const kop = ['nr', 'prioriteit', 'soort', 'kant', 'station_van', 'station_tot', 'lengte_m', 'hoogte_boven_pad_van_m', 'hoogte_boven_pad_tot_m', 'afstand_tot_hart_m', 'terugsnoeien_m', 'x_rd', 'y_rd', 'punten',
      'stam_x_rd', 'stam_y_rd', 'perceel_boom', 'kad_gemeente', 'sectie', 'perceelnummer', 'perceel_snoeiplek', ...(stationeringAan() ? ['stationering_van', 'stationering_tot'] : [])];
    const rijen = r.snoeipunten.map(p => [p.nr, p.ernst === 'rood' ? 'snoeien (in profiel)' : 'meenemen (in marge)', p.soort, p.kant, c(p.s0, 1), c(p.s1, 1), c(p.lengte, 1), c(p.hVan), c(p.hTot), c(p.oDicht), c(p.diepte), c(p.x, 2), c(p.y, 2), p.punten.length,
      p.stam ? c(p.stam.x, 2) : '', p.stam ? c(p.stam.y, 2) : '', perceelNaam(p.perceel), p.perceel?.gemeente || p.perceel?.code || '', p.perceel?.sectie || '', p.perceel?.nummer ?? '', perceelNaam(p.perceelPlek), ...(stationeringAan() ? [paalTekst(p.s0), paalTekst(p.s1)] : [])]);
    const regels = [
      `# Snoeilijst doorloopprofiel ${komma(r.B, 2)} x ${komma(r.H, 2)} m, snoeimarge ${komma(r.M, 2)} m — ${assen[actieveAs]?.naam || 'as'} — ${bronBestandsnaam || ''}`,
      kop.join(';'), ...rijen.map(v => v.map(x => String(x).replace(/;/g, ',')).join(';')),
    ];
    return new Blob(['﻿' + regels.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  }
  if (snDialoog) {
    for (const id of [...Object.keys(SN_VELDEN), 'snTonen']) document.getElementById(id)?.addEventListener('input', snGewijzigd);
    document.getElementById('snTonen')?.addEventListener('change', snGewijzigd);
    document.getElementById('snMaaiveld')?.addEventListener('change', () => { leesSnoeiVelden(); bijwerkenProfielen(); });
    document.getElementById('snoeiKnop')?.addEventListener('click', () => { zetSnoeiVelden(); werkSnoeiPaneelBij(); snDialoog.showModal(); });
    document.getElementById('snSluit')?.addEventListener('click', () => snDialoog.close());
    document.getElementById('snAuto')?.addEventListener('click', () => { snoei.stVan = ''; snoei.stTot = ''; zetSnoeiVelden(); snGewijzigd(); });
    document.getElementById('snUitA')?.addEventListener('click', async () => { if (laatsteBestand) await laadBegroeiing(laatsteBestand); });
    const veld = document.getElementById('snBestand');
    veld?.addEventListener('change', async () => { const f = veld.files?.[0]; veld.value = ''; if (f) await laadBegroeiing(f); });
    document.getElementById('snWis')?.addEventListener('click', () => { begroeiing = null; snResultaat = null; werkSnoeiPaneelBij(); bijwerkenProfielen(); tekenVlak(); });
    document.getElementById('snControleer')?.addEventListener('click', () => {
      leesSnoeiVelden();
      try {
        const r = voerSnoeiUit();
        statusEl.style.color = '';
        statusEl.textContent = `Snoeicheck: ${r.ok ? 'pad vrij' : `${r.nRood} snoeipunt${r.nRood === 1 ? '' : 'en'} in het profiel`}${r.nOranje ? ` · ${r.nOranje} in de snoeimarge` : ''}`;
        const eerste = r.snoeipunten.find(p => p.ernst === 'rood') || r.snoeipunten[0];
        if (eerste) naarSnoeipunt(eerste);
      } catch (err) { snResultaat = null; toonFout('Snoeicheck: ' + err.message); }
      werkSnoeiPaneelBij();
      tekenVlak(); tekenDwarsVoorHuidigeStation(); tekenLangs();
    });
    document.getElementById('snLijst')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-nr]'); if (!tr || !snResultaat) return;
      naarSnoeipunt(snResultaat.snoeipunten.find(p => p.nr === Number(tr.dataset.nr)));
      for (const t of document.querySelectorAll('#snLijst tr.gekozen')) t.classList.remove('gekozen');
      tr.classList.add('gekozen');
    });
    document.getElementById('snCsv')?.addEventListener('click', async () => {
      const r = snResultaat; if (!r) return;
      const naam = `${(bronBestandsnaam || 'snoeilijst').replace(/\.[^.]+$/, '')}-snoeilijst.csv`;
      const handle = await kiesOpslag(naam, 'csv');
      if (handle === false) return;
      await schrijfBestand(handle, maakSnoeiCsv(r), naam);
    });
    document.getElementById('snOndergrondKnop')?.addEventListener('click', () => {
      const v = document.getElementById('oppervlakModus');
      if (v && v.value !== 'onder') { v.value = 'onder'; v.dispatchEvent(new Event('change')); }
    });
  }

  /* ────────────────────────────────────────────────────────────────
     GIS: GeoPackage-export (QGIS, ArcGIS, FME) en as inlezen uit
     GeoPackage / GeoJSON / shapefile / DXF.
     De GeoPackage (.gpkg) is een SQLite-bestand; sql.js (vendor/sql-js)
     wordt pas geladen als je hem nodig hebt. Alles in RD New (EPSG:28992),
     hoogtes in m NAP. De lagen krijgen een QGIS-opmaak mee (layer_styles).
     ──────────────────────────────────────────────────────────────── */
  let sqlJsBelofte = null;
  function laadSqlJs() {
    if (sqlJsBelofte) return sqlJsBelofte;
    sqlJsBelofte = new Promise((ok, fout) => {
      const klaar = () => window.initSqlJs({ locateFile: (f) => `vendor/sql-js/${f}` }).then(ok, fout);
      if (window.initSqlJs) { klaar(); return; }
      const s = document.createElement('script');
      s.src = 'vendor/sql-js/sql-wasm.js';
      s.onload = klaar;
      s.onerror = () => fout(new Error('vendor/sql-js/sql-wasm.js niet gevonden'));
      document.head.append(s);
    }).catch((err) => { sqlJsBelofte = null; throw err; });
    return sqlJsBelofte;
  }

  const RD_WKT = 'PROJCS["Amersfoort / RD New",GEOGCS["Amersfoort",DATUM["Amersfoort",SPHEROID["Bessel 1841",6377397.155,299.1528128,AUTHORITY["EPSG","7004"]],AUTHORITY["EPSG","6289"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4289"]],PROJECTION["Oblique_Stereographic"],PARAMETER["latitude_of_origin",52.1561605555556],PARAMETER["central_meridian",5.38763888888889],PARAMETER["scale_factor",0.9999079],PARAMETER["false_easting",155000],PARAMETER["false_northing",463000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","28992"]]';
  const WGS84_WKT = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AXIS["Latitude",NORTH],AXIS["Longitude",EAST],AUTHORITY["EPSG","4326"]]';

  /** WKB (little endian, ISO-types) + GeoPackage-kop. pts = [[x,y,z],…] */
  function gpkgGeometrie(soort, pts, drieD) {
    const nd = drieD ? 3 : 2;
    const isPunt = soort === 'punt';
    const wkbLen = isPunt ? 5 + 8 * nd : 9 + pts.length * 8 * nd;
    const envLen = isPunt ? 0 : 32;
    const buf = new ArrayBuffer(8 + envLen + wkbLen), dv = new DataView(buf);
    dv.setUint8(0, 0x47); dv.setUint8(1, 0x50); dv.setUint8(2, 0);
    dv.setUint8(3, ((isPunt ? 0 : 1) << 1) | 1);   // envelope: geen (punt) of xy; little endian
    dv.setInt32(4, 28992, true);
    let o = 8;
    if (!isPunt) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      for (const v of [x0, x1, y0, y1]) { dv.setFloat64(o, v, true); o += 8; }
    }
    dv.setUint8(o, 1); o += 1;
    dv.setUint32(o, (isPunt ? 1 : 2) + (drieD ? 1000 : 0), true); o += 4;
    if (!isPunt) { dv.setUint32(o, pts.length, true); o += 4; }
    for (const p of pts) for (let k = 0; k < nd; k++) { dv.setFloat64(o, p[k] ?? 0, true); o += 8; }
    return new Uint8Array(buf);
  }

  /** QGIS-opmaak (QML) voor één laag. */
  function qgisStijl({ soort, kleur, dikte = 0.5, grootte = 1.4, label = null, labelKleur = '27,42,56', labelGrootte = 8, plaatsing = 0, drieD = null, laag = '' }) {
    // 3D-weergave (QGIS 3D-kaartvenster): hoogte uit de Z-waarden (absoluut, per hoekpunt).
    // Lijnen als "simple lines" (dikte in pixels): die volgen de Z van elk punt; een gebufferde
    // lijn zou plat worden. Punten als bolletjes (straal in m).
    const mat = (k) => `<material diffuse="${k},255" ambient="${k},255" specular="255,255,255,255" shininess="0" opacity="1"/>`;
    const r3d = !drieD ? '' : soort === 'punt'
      ? `<renderer-3d layer="${laag}" type="vector"><vector-layer-3d-tiling zoom-levels-count="3" show-bounding-boxes="0"/>
<symbol type="point" material_type="phong" shape="sphere"><data alt-clamping="absolute"/>${mat(kleur)}
<shape-properties><Option type="Map"><Option type="double" name="radius" value="${drieD.straal ?? 0.1}"/></Option></shape-properties>
<transform matrix="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/></symbol></renderer-3d>`
      : `<renderer-3d layer="${laag}" type="vector"><vector-layer-3d-tiling zoom-levels-count="3" show-bounding-boxes="0"/>
<symbol type="line" material_type="phong"><data alt-clamping="absolute" alt-binding="vertex" width="${drieD.breedte ?? 2}" height="0" extrusion-height="0" simple-lines="1"/>${mat(kleur)}</symbol></renderer-3d>`;
    const symbool = soort === 'punt'
      ? `<symbol type="marker" name="0" alpha="1" clip_to_extent="1" force_rhr="0"><layer class="SimpleMarker" enabled="1" locked="0" pass="0"><Option type="Map">
<Option type="QString" name="name" value="circle"/><Option type="QString" name="color" value="${kleur},255"/><Option type="QString" name="outline_style" value="no"/>
<Option type="QString" name="size" value="${grootte}"/><Option type="QString" name="size_unit" value="MM"/></Option></layer></symbol>`
      : `<symbol type="line" name="0" alpha="1" clip_to_extent="1" force_rhr="0"><layer class="SimpleLine" enabled="1" locked="0" pass="0"><Option type="Map">
<Option type="QString" name="line_color" value="${kleur},255"/><Option type="QString" name="line_width" value="${dikte}"/><Option type="QString" name="line_width_unit" value="MM"/>
<Option type="QString" name="line_style" value="solid"/><Option type="QString" name="capstyle" value="round"/><Option type="QString" name="joinstyle" value="round"/></Option></layer></symbol>`;
    const etiket = label ? `<labeling type="simple"><settings calloutType="simple">
<text-style fieldName="${label}" isExpression="0" fontFamily="Arial" fontSize="${labelGrootte}" fontSizeUnit="Point" fontWeight="75" textColor="${labelKleur},255" textOpacity="1" multilineHeight="1">
<text-buffer bufferDraw="1" bufferSize="0.8" bufferSizeUnits="MM" bufferColor="255,255,255,255" bufferOpacity="1" bufferJoinStyle="128"/></text-style>
<placement placement="${plaatsing}" dist="1" distUnits="MM" placementFlags="10" repeatDistance="0"/>
<rendering scaleVisibility="0" obstacle="1" upsidedownLabels="0" drawLabels="1" fontLimitPixelSize="0" mergeLines="0"/>
</settings></labeling>` : '';
    return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.34.0" styleCategories="Symbology|Symbology3D|Labeling" labelsEnabled="${label ? 1 : 0}">
<renderer-v2 type="singleSymbol" symbollevels="0" enableorderby="0" forceraster="0" referencescale="-1"><symbols>${symbool}</symbols><rotation/><sizescale/></renderer-v2>
${etiket}
${r3d}
<layerGeometryType>${soort === 'punt' ? 0 : 1}</layerGeometryType>
</qgis>`;
  }

  /** Bouwt de GeoPackage voor de actieve as. Geeft {blob, lagen} terug. */
  async function maakGeoPackage() {
    if (!xs || asPunten.length < 2) throw new Error('teken eerst een as');
    const SQL = await laadSqlJs();
    const db = new SQL.Database();
    const asNaam = assen[actieveAs]?.naam || 'As';
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const nu = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
    db.run('PRAGMA application_id = 1196444487; PRAGMA user_version = 10300;');
    db.run(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
      CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
      CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name), CONSTRAINT uk_gc_table_name UNIQUE (table_name), CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name), CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id));
      CREATE TABLE layer_styles (id INTEGER PRIMARY KEY AUTOINCREMENT, f_table_catalog TEXT(256), f_table_schema TEXT(256), f_table_name TEXT(256), f_geometry_column TEXT(256), styleName TEXT(30), styleQML TEXT, styleSLD TEXT, useAsDefault BOOLEAN, description TEXT, owner TEXT(30), ui TEXT(30), update_time DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`);
    const srs = db.prepare('INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?)');
    srs.run(['Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system']);
    srs.run(['Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system']);
    srs.run(['WGS 84 geodetic', 4326, 'EPSG', 4326, WGS84_WKT, 'longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid']);
    srs.run(['Amersfoort / RD New', 28992, 'EPSG', 28992, RD_WKT, 'RD New; hoogtes (Z) in m NAP']);
    srs.free();

    const lagen = [];
    /** Maakt een laag aan en vult hem. velden = [[naam, type]], rijen = [{geom, waarden:[...]}] */
    const laag = (naam, omschrijving, soort, drieD, velden, rijen, stijl) => {
      if (!rijen.length) return;
      const gtype = soort === 'punt' ? 'POINT' : 'LINESTRING';
      db.run(`CREATE TABLE "${naam}" (fid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, geom ${gtype}${velden.map(([n, t]) => `, "${n}" ${t}`).join('')})`);
      const ins = db.prepare(`INSERT INTO "${naam}" (geom${velden.map(([n]) => `, "${n}"`).join('')}) VALUES (?${velden.map(() => ',?').join('')})`);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const r of rijen) {
        for (const p of r.geom) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
        ins.run([gpkgGeometrie(soort, r.geom, drieD), ...r.waarden]);
      }
      ins.free();
      db.run('INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [naam, 'features', naam, omschrijving, nu, x0, y0, x1, y1, 28992]);
      db.run('INSERT INTO gpkg_geometry_columns VALUES (?,?,?,?,?,?)', [naam, 'geom', gtype, 28992, drieD ? 1 : 0, 0]);
      if (stijl) db.run('INSERT INTO layer_styles (f_table_catalog, f_table_schema, f_table_name, f_geometry_column, styleName, styleQML, styleSLD, useAsDefault, description, owner, ui) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        ['', '', naam, 'geom', 'Lutrea Profielviewer', qgisStijl({ ...stijl, laag: naam }), '', 1, 'opmaak uit de Lutrea Profielviewer', '', null]);
      lagen.push(`${naam} (${rijen.length})`);
    };

    // as (3D: over het maaiveld)
    const s = stationsLangsAs(), lengte = s[s.length - 1];
    const asLijn = asPunten.map((p) => [p.x, p.y, r3(hoogteOp(p.x, p.y)) ?? 0]);
    laag('as_lijn', 'Getekende as (Z = maaiveld in m NAP)', 'lijn', true, [['naam', 'TEXT'], ['lengte_m', 'REAL'], ['punten', 'INTEGER']],
      [{ geom: asLijn, waarden: [asNaam, r3(lengte), asPunten.length] }],
      { soort: 'lijn', kleur: '27,42,56', dikte: 0.9, label: 'naam', labelGrootte: 9, plaatsing: 2, drieD: { breedte: 4 } });

    // dwarsprofiellijnen (2D) + de profielen zelf (3D) + profielpunten + BGT-grenzen
    const lijnen = [], profielen3D = [], punten = [], bgtPunten = [];
    for (const st of dwarsStations) {
      const L = puntOpStationOffset(st, -pL), R = puntOpStationOffset(st, pR);
      lijnen.push({ geom: [[L.x, L.y], [R.x, R.y]], waarden: [asNaam, r3(st), breedte, `${st.toFixed(st % 1 ? 1 : 0)}`, ...(stationeringAan() ? [paalTekst(st)] : [])] });
      const reeks = berekenDwarsprofiel(st);
      let stuk = [], deel = 1;
      const sluit = () => { if (stuk.length >= 2) profielen3D.push({ geom: stuk, waarden: [asNaam, r3(st), deel++] }); stuk = []; };
      for (const p of reeks) {
        const q = puntOpStationOffset(st, p.offset);
        if (p.hoogte == null) { sluit(); } else stuk.push([q.x, q.y, r3(p.hoogte)]);
        if (p.hoogte == null && p.hoogteB == null) continue;
        const verschil = p.hoogte != null && p.hoogteB != null ? p.hoogteB - p.hoogte : null;
        punten.push({ geom: [[q.x, q.y, r3(p.hoogte ?? p.hoogteB)]], waarden: [asNaam, r3(st), r3(p.offset), Math.abs(p.offset) < 1e-6 ? 'as' : p.offset < 0 ? 'L' : 'R', r3(p.hoogte), r3(p.hoogteB), r3(verschil)] });
      }
      sluit();
      for (const g of reeks.bgt?.grenzen || []) {
        const q = puntOpStationOffset(st, g.offset);
        bgtPunten.push({ geom: [[q.x, q.y, r3(hoogteOp(q.x, q.y)) ?? 0]], waarden: [asNaam, r3(st), r3(g.offset), g.naam || '', g.soort || '', r3(hoogteOp(q.x, q.y))] });
      }
    }
    laag('dwarsprofiel_lijnen', 'Ligging van de dwarsprofielen (kijkrichting = oplopend station; L = negatieve offset)', 'lijn', false,
      [['as_naam', 'TEXT'], ['station', 'REAL'], ['breedte_m', 'REAL'], ['label', 'TEXT'], ...(stationeringAan() ? [['stationering', 'TEXT']] : [])], lijnen,
      { soort: 'lijn', kleur: '198,71,43', dikte: 0.35, label: 'label', labelKleur: '198,71,43', plaatsing: 2 });
    laag('dwarsprofiel_3d', 'Dwarsprofielen als 3D-lijn (Z in m NAP), onderbroken waar geen hoogte is', 'lijn', true,
      [['as_naam', 'TEXT'], ['station', 'REAL'], ['deel', 'INTEGER']], profielen3D,
      { soort: 'lijn', kleur: '46,125,50', dikte: 0.3, drieD: { breedte: 3 } });
    laag('profielpunten', `Profielpunten (hoogte A${wolkB ? ', hoogte B en verschil B − A' : ''}) in m NAP`, 'punt', true,
      [['as_naam', 'TEXT'], ['station', 'REAL'], ['offset_m', 'REAL'], ['kant', 'TEXT'], ['hoogte_nap', 'REAL'], ['hoogte_b_nap', 'REAL'], ['verschil_m', 'REAL']], punten,
      { soort: 'punt', kleur: '30,127,166', grootte: 0.9, drieD: { straal: 0.06 } });
    laag('bgt_grenzen', 'Snijpunten van de dwarsprofielen met de BGT', 'punt', true,
      [['as_naam', 'TEXT'], ['station', 'REAL'], ['offset_m', 'REAL'], ['naam', 'TEXT'], ['soort', 'TEXT'], ['hoogte_nap', 'REAL']], bgtPunten,
      { soort: 'punt', kleur: '198,71,43', grootte: 1.6, drieD: { straal: 0.25 } });

    // doorvaartbox (ribben als 3D-lijnen) en de punten die erin steken
    {
      const k = dvKader();
      if (k && (brugOnder || k.D)) {
        let r = dvResultaat; try { r = voerDoorvaartUit(); } catch { r = null; }
        const zTop = k.P + k.H, zOnder = k.D ? k.PD - k.D : k.P;
        const langs = (o, z) => { const uit = []; const n = 24; for (let i = 0; i <= n; i++) { const st = k.s0 + (k.s1 - k.s0) * i / n; const q = puntOpStationOffset(st, o); uit.push([q.x, q.y, z]); } return uit; };
        const kader = (st) => [[k.c - k.B / 2, zOnder], [k.c - k.B / 2, zTop], [k.c + k.B / 2, zTop], [k.c + k.B / 2, zOnder], [k.c - k.B / 2, zOnder]].map(([o, z]) => { const q = puntOpStationOffset(st, o); return [q.x, q.y, z]; });
        const L = k.c - k.B / 2, R = k.c + k.B / 2;
        const ribben = [
          ['boven links', langs(L, zTop)], ['boven rechts', langs(R, zTop)], ['onder links', langs(L, zOnder)], ['onder rechts', langs(R, zOnder)],
          [`kader st. ${k.s0.toFixed(1)}`, kader(k.s0)], [`kader st. ${k.s1.toFixed(1)}`, kader(k.s1)],
          ['toetswaterstand links', langs(L, k.P)], ['toetswaterstand rechts', langs(R, k.P)],
        ];
        laag('doorvaart_box', `Doorvaartbox ${k.B} × ${k.H} m boven ${k.P} m NAP${k.D ? `, diepte ${k.D} m onder ${k.PD} m NAP` : ''}${r ? (r.ok ? ' — voldoet' : ' — voldoet niet') : ''}`, 'lijn', true,
          [['deel', 'TEXT'], ['breedte_m', 'REAL'], ['hoogte_m', 'REAL'], ['toetspeil_nap', 'REAL'], ['oordeel', 'TEXT']],
          ribben.map(([deel, geom]) => ({ geom, waarden: [deel, k.B, k.H, k.P, r ? (r.ok ? 'voldoet' : 'voldoet niet') : ''] })),
          { soort: 'lijn', kleur: r && !r.ok ? '198,71,43' : '22,128,61', dikte: 0.6, drieD: { breedte: 3 } });
        if (r) {
          const conf = [...(r.conflictenH || []).map(c => ({ ...c, soort: 'hoogte' })), ...(r.conflictenD || []).map(c => ({ ...c, soort: 'diepte' }))];
          laag('doorvaart_conflicten', 'Punten die in de doorvaartbox steken (onderzijde brug te laag of bodem te hoog)', 'punt', true,
            [['soort', 'TEXT'], ['station', 'REAL'], ['offset_m', 'REAL'], ['hoogte_nap', 'REAL'], ['tekort_m', 'REAL']],
            conf.map(c => ({ geom: [[c.x, c.y, r3(c.z)]], waarden: [c.soort, r3(c.station), r3(c.offset), r3(c.z), r3(c.tekort)] })),
            { soort: 'punt', kleur: '198,71,43', grootte: 1.2, drieD: { straal: 0.08 } });
        }
      }
    }

    // snoeicheck: genummerde snoeipunten, de randen van het doorloopprofiel en de begroeiing erin
    if (begroeiing && snKader()) {
      let r = snResultaat; try { r = voerSnoeiUit(); } catch { r = null; }
      if (r) {
        laag('snoeipunten', `Snoeipunten — doorloopprofiel ${r.B} × ${r.H} m, snoeimarge ${r.M} m`, 'punt', true,
          [['nr', 'INTEGER'], ['prioriteit', 'TEXT'], ['soort', 'TEXT'], ['kant', 'TEXT'], ['station_van', 'REAL'], ['station_tot', 'REAL'], ['lengte_m', 'REAL'],
            ['hoogte_boven_pad_van_m', 'REAL'], ['hoogte_boven_pad_tot_m', 'REAL'], ['afstand_tot_hart_m', 'REAL'], ['terugsnoeien_m', 'REAL'], ['punten', 'INTEGER'],
            ['stam_x', 'REAL'], ['stam_y', 'REAL'], ['perceel_boom', 'TEXT'], ['perceel_snoeiplek', 'TEXT'], ...(stationeringAan() ? [['stationering', 'TEXT']] : [])],
          r.snoeipunten.map(p => ({ geom: [[p.x, p.y, r3(Math.min(p.z, r.zcOp(p.sMid) + r.H + r.M))]], waarden: [p.nr, p.ernst === 'rood' ? 'snoeien' : 'meenemen (marge)', p.soort, p.kant, r3(p.s0), r3(p.s1), r3(p.lengte), r3(p.hVan), r3(p.hTot), r3(p.oDicht), r3(p.diepte), p.punten.length,
            p.stam ? r3(p.stam.x) : null, p.stam ? r3(p.stam.y) : null, perceelNaam(p.perceel) || null, perceelNaam(p.perceelPlek) || null, ...(stationeringAan() ? [paalTekst(p.s0)] : [])] })),
          { soort: 'punt', kleur: '198,71,43', grootte: 3.2, label: 'nr', labelKleur: '255,255,255', labelGrootte: 7, drieD: { straal: 0.25 } });
        const randen = [];
        const n = Math.max(2, Math.min(2000, Math.ceil(r.s1 - r.s0)));
        for (const [deel, o, dz] of [['profiel links', r.c - r.B / 2, r.H], ['profiel rechts', r.c + r.B / 2, r.H], ['marge links', r.c - r.B / 2 - r.M, r.H + r.M], ['marge rechts', r.c + r.B / 2 + r.M, r.H + r.M]]) {
          if (deel.startsWith('marge') && !r.M) continue;
          const geom = [];
          for (let i = 0; i <= n; i++) { const st = r.s0 + (r.s1 - r.s0) * i / n, q = puntOpStationOffset(st, o); geom.push([q.x, q.y, r3(r.zcOp(st) + dz)]); }
          randen.push({ geom, waarden: [deel, r.B, r.H, r.M] });
        }
        laag('snoeiprofiel', 'Randen van het doorloopprofiel en de snoeimarge (op de bovenkant: pad + H)', 'lijn', true,
          [['deel', 'TEXT'], ['breedte_m', 'REAL'], ['hoogte_m', 'REAL'], ['marge_m', 'REAL']], randen,
          { soort: 'lijn', kleur: '27,42,56', dikte: 0.5, drieD: { breedte: 2 } });
        const veg = [];
        for (let i = 0; i < r.cls.length; i++) if (r.cls[i] === 2 || r.cls[i] === 3) veg.push(i);
        const stap = Math.max(1, Math.ceil(veg.length / 60000));
        const rijenV = [];
        for (let j = 0; j < veg.length; j += stap) { const i = veg[j]; rijenV.push({ geom: [[begroeiing.xs[i], begroeiing.ys[i], r3(begroeiing.zs[i])]], waarden: [r.cls[i] === 3 ? 'in profiel' : 'in marge', r3(r.S[i]), r3(r.O[i]), r3(r.HP[i])] }); }
        laag('begroeiing_in_profiel', 'Begroeiingspunten in het doorloopprofiel (rood) of de snoeimarge', 'punt', true,
          [['zone', 'TEXT'], ['station', 'REAL'], ['offset_m', 'REAL'], ['hoogte_boven_pad_m', 'REAL']], rijenV,
          { soort: 'punt', kleur: '224,138,30', grootte: 0.8, drieD: { straal: 0.05 } });
      }
    }

    // kadastrale percelen (grenzen als lijnen, met de perceelaanduiding)
    if (percelen.length) {
      const rijenK = [];
      for (const pc of percelen) for (const ring of pc.ringen) rijenK.push({ geom: ring.map(q => [q.x, q.y]), waarden: [perceelNaam(pc), pc.gemeente || '', pc.code || '', pc.sectie || '', String(pc.nummer ?? ''), pc.grootte] });
      laag('kadastrale_percelen', `Kadastrale perceelgrenzen (${perceelBron})`, 'lijn', false,
        [['perceel', 'TEXT'], ['kadastrale_gemeente', 'TEXT'], ['gemeentecode', 'TEXT'], ['sectie', 'TEXT'], ['perceelnummer', 'TEXT'], ['grootte_m2', 'REAL']], rijenK,
        { soort: 'lijn', kleur: '122,62,157', dikte: 0.35 });
    }

    // dekkingskaart: plekken die binnen een toets niet gemeten zijn (omtrek in station × offset)
    {
      const rijenG = [];
      const omtrek = (g) => { const h = []; const n = 8; for (let i = 0; i <= n; i++) h.push([g.s0 + (g.s1 - g.s0) * i / n, g.o0]); for (let i = 0; i <= n; i++) h.push([g.s1 - (g.s1 - g.s0) * i / n, g.o1]); h.push([g.s0, g.o0]); return h.map(([st, o]) => { const q = puntOpStationOffset(st, o); return [q.x, q.y]; }); };
      const voeg = (toets, d) => { for (const g of d?.gaten || []) rijenG.push({ geom: omtrek(g), waarden: [toets, r3(g.s0), r3(g.s1), r3(g.o0), r3(g.o1), r3(g.opp), g.rand == null ? null : r3(g.rand), stationeringAan() ? paalTekst(g.s0) : null] }); };
      if (dvResultaat) { voeg('doorvaart: onderzijde brug', dvResultaat.dekkingH); voeg('doorvaart: bodem', dvResultaat.dekkingD); }
      if (snResultaat) voeg('snoeicheck: profiel + marge', snResultaat.dekking);
      laag('niet_gemeten', 'Dekkingskaart: plekken binnen de toets zonder meetpunten (omtrek; de toets zegt daar niets)', 'lijn', false,
        [['toets', 'TEXT'], ['station_van', 'REAL'], ['station_tot', 'REAL'], ['offset_van_m', 'REAL'], ['offset_tot_m', 'REAL'], ['oppervlak_m2', 'REAL'], ['rand_hoogte_nap', 'REAL'], ['stationering', 'TEXT']], rijenG,
        { soort: 'lijn', kleur: '60,70,90', dikte: 0.5 });
    }
    // dijkpalen / hectometers op de as
    if (stationeringAan() && paalMarkeringen().length) {
      laag('stationering', palen.modus === 'hm' ? `Hectometrering langs ${asNaam}` : `Dijkpalen (${palen.bron}) gelegd op ${asNaam}`, 'punt', false,
        [['naam', 'TEXT'], ['as_naam', 'TEXT'], ['station', 'REAL'], ['afstand_tot_as_m', 'REAL']],
        paalMarkeringen().map(p => { const so = stationOffsetVanPunt(p.x, p.y); return { geom: [[p.x, p.y]], waarden: [p.label, asNaam, r3(p.st), r3(so ? so.afstand : 0)] }; }),
        { soort: 'punt', kleur: '31,78,121', grootte: 2.2, label: 'naam', labelKleur: '31,78,121', labelGrootte: 8 });
    }
    // lengteprofiel als punten op de as
    laag('lengteprofiel', 'Lengteprofiel: hoogte op de as per station (m NAP)', 'punt', true,
      [['as_naam', 'TEXT'], ['station', 'REAL'], ['hoogte_nap', 'REAL'], ['hoogte_b_nap', 'REAL'], ['verschil_m', 'REAL']],
      langsprofiel.filter((p) => p.hoogte != null || p.hoogteB != null).map((p) => {
        const q = puntOpStation(p.station);
        const v = p.hoogte != null && p.hoogteB != null ? p.hoogteB - p.hoogte : null;
        return { geom: [[q.x, q.y, r3(p.hoogte ?? p.hoogteB)]], waarden: [asNaam, r3(p.station), r3(p.hoogte), r3(p.hoogteB), r3(v)] };
      }),
      { soort: 'punt', kleur: '27,42,56', grootte: 0.7, drieD: { straal: 0.08 } });

    // projectgegevens (tabel zonder geometrie)
    db.run('CREATE TABLE project (fid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, sleutel TEXT, waarde TEXT)');
    const wp = waterpeil();
    const info = [
      ['puntenwolk', bronBestandsnaam || ''], ['puntenwolk_b', wolkB?.naam || ''], ['as', asNaam], ['lengte_as_m', String(r3(lengte))],
      ['dwarsprofiel_breedte_m', String(breedte)], ['dwarsprofiel_links_m', String(pL)], ['dwarsprofiel_rechts_m', String(pR)], ['dwarsprofiel_interval_m', String(Number(dwarsIntervalVeld.value) || '')], ['aantal_dwarsprofielen', String(dwarsStations.length)],
      ['waterpeil_m_nap', wp == null ? '' : String(wp)], ['waterkant', waterKant()],
      ['coordinaatstelsel', 'RD New (EPSG:28992), hoogtes in m NAP'], ['kijkrichting', 'L/R gezien in de richting van oplopend station'],
      ['gemaakt', nu], ['gemaakt_met', `Lutrea Profielviewer ${document.getElementById('appVersie')?.textContent?.trim() || ''}`.trim()],
    ];
    const pi = db.prepare('INSERT INTO project (sleutel, waarde) VALUES (?,?)');
    for (const r of info) pi.run(r);
    pi.free();
    db.run('INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change) VALUES (?,?,?,?,?)', ['project', 'attributes', 'project', 'Gegevens van de export', nu]);
    db.run('INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change) VALUES (?,?,?,?,?)', ['layer_styles', 'attributes', 'layer_styles', 'QGIS-opmaak', nu]);

    const data = db.export();
    db.close();
    return { blob: new Blob([data], { type: 'application/geopackage+sqlite3' }), lagen };
  }

  document.getElementById('gpkgKnop')?.addEventListener('click', async () => {
    try {
      if (asPunten.length < 2) { toonFout('Teken of lees eerst een as in: de GeoPackage bevat de as en de profielen.'); return; }
      const naam = `${(bronBestandsnaam || 'profielen').replace(/\.[^.]+$/, '')}-${(assen[actieveAs]?.naam || 'as').replace(/[^a-zA-Z0-9_-]+/g, '_')}.gpkg`;
      const handle = await kiesOpslag(naam, 'gpkg');
      if (handle === false) { statusEl.textContent = 'GeoPackage opslaan geannuleerd'; return; }
      statusEl.textContent = 'GeoPackage maken…';
      await new Promise((r) => setTimeout(r, 20));
      const { blob, lagen } = await maakGeoPackage();
      await schrijfBestand(handle, blob, naam);
      statusEl.textContent += ` · lagen: ${lagen.join(', ')}`;
    } catch (err) {
      console.error(err);
      toonFout('GeoPackage maken mislukt: ' + (err.message || err));
    }
  });

  /* ────────────────────────────────────────────────────────────────
     IFC 4.3 (IFC4X3_ADD2) — openBIM-export voor Civil 3D, Solibri,
     Navisworks, BIMcollab, Revit, BlenderBIM e.d.
     - Georeferentie: RD New (EPSG:28992) + NAP via IfcMapConversion; de
       coördinaten in het bestand zijn lokaal t.o.v. een basispunt (grote
       RD-getallen geven in veel viewers afrondingsfouten).
     - IfcAlignment van de actieve as: horizontaal (rechte stukken), verticaal
       uit het lengteprofiel (vereenvoudigd, constante hellingen) en de
       geometrie (IfcCompositeCurve + IfcGradientCurve).
     - Stationering: IfcReferent bij station 0 (Pset_Stationing) en per
       dijkpaal / hectometer.
     - Maaiveld: IfcGeographicElement TERRAIN (driehoeksnet, strook langs de as).
     - Dwarsprofielen: IfcAnnotation SURVEY (3D-lijnen op de echte plek).
     - Doorvaartbox, doorloopprofiel en snoeimarge: IfcSpatialZone RESERVATION
       (vrije ruimte: andere modellen kunnen er tegen botsen).
     - Bevindingen: snoeipunten als IfcGeographicElement VEGETATION (blok om
       de takken), conflicten en niet-gemeten plekken als IfcAnnotation.
     Alle uitkomsten staan als eigenschappen (Lutrea_…) aan de objecten.
     ──────────────────────────────────────────────────────────────── */
  class IfcSchrijver {
    constructor() { this.regels = []; this.n = 0; }
    static guid() {
      const tekens = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
      const b = new Uint8Array(16); crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;   // UUID v4
      let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x);
      let s = '';
      for (let i = 0; i < 22; i++) { s = tekens[Number(n & 63n)] + s; n >>= 6n; }
      return s;
    }
    static tekst(t) {
      // STEP-tekst: ' en \ verdubbelen; alles buiten ASCII als \X2\HHHH\X0\
      let s = '';
      for (const ch of String(t)) {
        const c = ch.codePointAt(0);
        if (ch === "'") s += "''"; else if (ch === '\\') s += '\\\\';
        else if (c >= 32 && c < 127) s += ch;
        else if (c < 0x10000) s += '\\X2\\' + c.toString(16).toUpperCase().padStart(4, '0') + '\\X0\\';
        else s += '\\X4\\' + c.toString(16).toUpperCase().padStart(8, '0') + '\\X0\\';
      }
      return `'${s}'`;
    }
    static getal(x) {
      if (!Number.isFinite(x)) x = 0;
      const r = Math.abs(x) < 1e-12 ? 0 : x;
      let s = String(+r.toPrecision(15));
      if (/e/i.test(s)) { const [m, e] = s.split(/e/i); s = (m.includes('.') ? m : m + '.') + 'E' + e; }
      else if (!s.includes('.')) s += '.';
      return s;
    }
    static w(v) {
      if (v === null || v === undefined) return '$';
      if (v === '*') return '*';
      if (typeof v === 'number') return IfcSchrijver.getal(v);
      if (typeof v === 'boolean') return v ? '.T.' : '.F.';
      if (typeof v === 'string') return IfcSchrijver.tekst(v);
      if (Array.isArray(v)) return `(${v.map(IfcSchrijver.w).join(',')})`;
      if (v.ref) return `#${v.ref}`;
      if (v.e) return `.${v.e}.`;
      if (v.i !== undefined) return String(Math.round(v.i));
      if (v.t) return `${v.t}(${IfcSchrijver.w(v.v)})`;
      if (v.ruw !== undefined) return v.ruw;
      throw new Error('onbekende IFC-waarde');
    }
    e(type, ...args) { const id = ++this.n; this.regels.push(`#${id}=${type}(${args.map(IfcSchrijver.w).join(',')});`); return { ref: id }; }
    /** Snelle lijst van punten/indices: als ruwe tekst, zonder per waarde een object. */
    static puntLijst(pts, d = 3) {
      const g = (x) => { const s = (Math.abs(x) < 5e-5 ? 0 : x).toFixed(d); return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '.') : s + '.'; };
      return { ruw: '(' + pts.map(p => `(${g(p[0])},${g(p[1])},${g(p[2])})`).join(',') + ')' };
    }
    static indexLijst(tri) { return { ruw: '(' + tri.map(t => `(${t[0]},${t[1]},${t[2]})`).join(',') + ')' }; }
    bestand(naam, beschrijving) {
      const nu = new Date().toISOString().replace(/\.\d+Z$/, '');
      const versie = `Lutrea Profielviewer ${document.getElementById('appVersie')?.textContent?.trim() || ''}`.trim();
      const kop = ['ISO-10303-21;', 'HEADER;',
        `FILE_DESCRIPTION(('ViewDefinition [Alignment-basedReferenceView]',${IfcSchrijver.tekst(beschrijving)}),'2;1');`,
        `FILE_NAME(${IfcSchrijver.tekst(naam)},'${nu}',('Lutrea Profielviewer'),('Lutrea Group B.V.'),${IfcSchrijver.tekst(versie)},${IfcSchrijver.tekst(versie)},'');`,
        "FILE_SCHEMA(('IFC4X3_ADD2'));", 'ENDSEC;', 'DATA;'];
      return [...kop, ...this.regels, 'ENDSEC;', 'END-ISO-10303-21;', ''].join('\n');
    }
  }

  /** Vereenvoudig een lijn (Douglas-Peucker) in (s, h). */
  function vereenvoudigLijn(p, tol) {
    if (p.length < 3) return p.slice();
    const houd = new Uint8Array(p.length); houd[0] = houd[p.length - 1] = 1;
    const stapel = [[0, p.length - 1]];
    while (stapel.length) {
      const [a, b] = stapel.pop();
      let max = -1, mi = -1;
      const [sa, ha] = p[a], [sb, hb] = p[b];
      for (let i = a + 1; i < b; i++) {
        const h = ha + (hb - ha) * (p[i][0] - sa) / ((sb - sa) || 1e-9);
        const d = Math.abs(p[i][1] - h);
        if (d > max) { max = d; mi = i; }
      }
      if (max > tol) { houd[mi] = 1; stapel.push([a, mi], [mi, b]); }
    }
    return p.filter((_, i) => houd[i]);
  }

  function maakIfc(opt = {}) {
    if (asPunten.length < 2) throw new Error('teken of lees eerst een as in');
    const W = new IfcSchrijver();
    const asNaam = assen[actieveAs]?.naam || 'As';
    const s = stationsLangsAs(), L = s[s.length - 1];
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const telling = {};
    const tel = (k, n = 1) => { telling[k] = (telling[k] || 0) + n; };
    // basispunt (lokale oorsprong): afgerond op 100 m, bij het begin van de as
    const X0 = Math.round(asPunten[0].x / 100) * 100, Y0 = Math.round(asPunten[0].y / 100) * 100;
    const lok = (x, y, z = 0) => [x - X0, y - Y0, z];

    // ── project, eenheden, contexten, georeferentie ──
    const dimLengte = null;
    void dimLengte;
    const uLengte = W.e('IFCSIUNIT', '*', { e: 'LENGTHUNIT' }, null, { e: 'METRE' });
    const uOpp = W.e('IFCSIUNIT', '*', { e: 'AREAUNIT' }, null, { e: 'SQUARE_METRE' });
    const uVol = W.e('IFCSIUNIT', '*', { e: 'VOLUMEUNIT' }, null, { e: 'CUBIC_METRE' });
    const uHoek = W.e('IFCSIUNIT', '*', { e: 'PLANEANGLEUNIT' }, null, { e: 'RADIAN' });
    const eenheden = W.e('IFCUNITASSIGNMENT', [uLengte, uOpp, uVol, uHoek]);
    const oorsprong3 = W.e('IFCCARTESIANPOINT', [0, 0, 0]);
    const zAs = W.e('IFCDIRECTION', [0, 0, 1]), xAs = W.e('IFCDIRECTION', [1, 0, 0]);
    const wereld = W.e('IFCAXIS2PLACEMENT3D', oorsprong3, zAs, xAs);
    const noord = W.e('IFCDIRECTION', [0, 1]);
    const ctx = W.e('IFCGEOMETRICREPRESENTATIONCONTEXT', null, 'Model', { i: 3 }, 1e-5, wereld, noord);
    const sub = (id) => W.e('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', id, 'Model', '*', '*', '*', '*', ctx, null, { e: 'MODEL_VIEW' }, null);
    const ctxBody = sub('Body'), ctxAxis = sub('Axis'), ctxFoot = sub('FootPrint'), ctxAnn = sub('Annotation');
    const projectNaam = opt.projectnaam || (bronBestandsnaam || 'Profielviewer').replace(/\.[^.]+$/, '');
    const project = W.e('IFCPROJECT', IfcSchrijver.guid(), null, projectNaam, `Export uit de Lutrea Profielviewer — ${asNaam}`, null, null, null, [ctx], eenheden);
    const crs = W.e('IFCPROJECTEDCRS', 'EPSG:28992', 'Amersfoort / RD New, hoogte NAP', 'EPSG:4289', 'EPSG:5709', 'Oblique Stereographic', null, uLengte);
    W.e('IFCMAPCONVERSION', ctx, crs, X0, Y0, 0, 1, 0, 1);
    const plaatsWereld = () => W.e('IFCLOCALPLACEMENT', null, W.e('IFCAXIS2PLACEMENT3D', oorsprong3, null, null));
    const site = W.e('IFCSITE', IfcSchrijver.guid(), null, 'Terrein', `RD-basispunt ${X0} / ${Y0}`, null, plaatsWereld(), null, null, { e: 'ELEMENT' }, null, null, null, null, null);
    const isDoorvaart = !!(dvResultaat || (brugOnder && dvKader()));
    const facility = isDoorvaart
      ? W.e('IFCMARINEFACILITY', IfcSchrijver.guid(), null, asNaam, 'Vaarweg / doorvaart', null, plaatsWereld(), null, null, { e: 'ELEMENT' }, { e: 'WATERWAY' })
      : W.e('IFCFACILITY', IfcSchrijver.guid(), null, asNaam, 'Inmeting langs de as', 'Profielviewer-inmeting', plaatsWereld(), null, null, { e: 'ELEMENT' });
    const inFacility = [], inSite = [], verwezen = [];
    const psetId = (obj, naam, props) => {
      const lijst = [];
      for (const [k, [v, type]] of Object.entries(props)) {
        if (v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
        const waarde = type === 'IFCINTEGER' ? { t: type, v: { i: v } } : type === 'IFCBOOLEAN' ? { t: type, v: !!v } : { t: type, v };
        lijst.push(W.e('IFCPROPERTYSINGLEVALUE', k, null, waarde, null));
      }
      if (!lijst.length) return;
      const ps = W.e('IFCPROPERTYSET', IfcSchrijver.guid(), null, naam, null, lijst);
      W.e('IFCRELDEFINESBYPROPERTIES', IfcSchrijver.guid(), null, null, null, Array.isArray(obj) ? obj : [obj], ps);
    };
    const L_ = 'IFCLENGTHMEASURE', LBL = 'IFCLABEL', TXT = 'IFCTEXT', R_ = 'IFCREAL', INT = 'IFCINTEGER', OPP = 'IFCAREAMEASURE', BOOL = 'IFCBOOLEAN', VOL = 'IFCVOLUMEMEASURE';
    void VOL;
    psetId(project, 'Lutrea_Export', {
      Bron: [bronBestandsnaam || '', LBL], As: [asNaam, LBL], Lengte: [L, L_], Coordinatenstelsel: ['RD New (EPSG:28992), NAP (EPSG:5709)', LBL],
      Basispunt_X: [X0, L_], Basispunt_Y: [Y0, L_], Kijkrichting: ['L/R gezien in de richting van oplopend station', TXT],
      Gemaakt: [new Date().toISOString().slice(0, 16).replace('T', ' '), LBL], Versie: [document.getElementById('appVersie')?.textContent?.trim() || '', LBL],
    });
    // stijlen (kleur, doorzichtigheid)
    const stijlCache = new Map();
    const vlakStijl = (naam, rgb, tr = 0) => {
      const k = naam;
      if (!stijlCache.has(k)) stijlCache.set(k, W.e('IFCSURFACESTYLE', naam, { e: 'BOTH' }, [W.e('IFCSURFACESTYLESHADING', W.e('IFCCOLOURRGB', null, rgb[0], rgb[1], rgb[2]), tr)]));
      return stijlCache.get(k);
    };
    const lijnStijl = (naam, rgb) => {
      const k = 'l:' + naam;
      if (!stijlCache.has(k)) stijlCache.set(k, W.e('IFCCURVESTYLE', naam, null, null, W.e('IFCCOLOURRGB', null, rgb[0], rgb[1], rgb[2]), true));
      return stijlCache.get(k);
    };
    const kleur = (item, stijl) => W.e('IFCSTYLEDITEM', item, [stijl], null);
    const vorm = (reps) => W.e('IFCPRODUCTDEFINITIONSHAPE', null, null, reps);
    const facetten = (pts, tri, gesloten) => W.e('IFCTRIANGULATEDFACESET', W.e('IFCCARTESIANPOINTLIST3D', IfcSchrijver.puntLijst(pts), null), null, gesloten, IfcSchrijver.indexLijst(tri), null);
    const lijn3D = (pts) => W.e('IFCINDEXEDPOLYCURVE', W.e('IFCCARTESIANPOINTLIST3D', IfcSchrijver.puntLijst(pts), null), null, false);
    /** Gesloten "buis" langs de as: doorsnede = rechthoek (o0..o1, z0..z1) per station. */
    const buis = (sVan, sTot, oL, oR, zOnder, zBoven) => {
      const st = [];
      const n = Math.max(2, Math.ceil((sTot - sVan) / 1));
      for (let i = 0; i <= n; i++) st.push(sVan + (sTot - sVan) * i / n);
      for (const sk of s) if (sk > sVan + 0.05 && sk < sTot - 0.05) st.push(sk);   // knikpunten van de as erbij
      st.sort((a, b) => a - b);
      const pts = [], tri = [];
      for (const si of st) {
        const zo = typeof zOnder === 'function' ? zOnder(si) : zOnder, zb = typeof zBoven === 'function' ? zBoven(si) : zBoven;
        const a = puntOpStationOffset(si, oL), b = puntOpStationOffset(si, oR);
        pts.push(lok(a.x, a.y, zo), lok(b.x, b.y, zo), lok(b.x, b.y, zb), lok(a.x, a.y, zb));
      }
      const m = st.length;
      for (let i = 0; i < m - 1; i++) for (let k = 0; k < 4; k++) {
        const a = i * 4 + k + 1, b = i * 4 + ((k + 1) % 4) + 1, c = (i + 1) * 4 + ((k + 1) % 4) + 1, d = (i + 1) * 4 + k + 1;
        tri.push([a, b, c], [a, c, d]);
      }
      tri.push([1, 3, 2], [1, 4, 3]);                                   // begin
      const e0 = (m - 1) * 4;
      tri.push([e0 + 1, e0 + 2, e0 + 3], [e0 + 1, e0 + 3, e0 + 4]);     // eind
      return facetten(pts, tri, true);
    };
    /** Achtvlakjes (straal r) om een reeks punten, samen één driehoeksnet. */
    const markers = (pts, r) => {
      const p = [], t = [];
      for (const [x, y, z] of pts) {
        const b = p.length + 1;
        p.push([x + r, y, z], [x - r, y, z], [x, y + r, z], [x, y - r, z], [x, y, z + r], [x, y, z - r]);
        for (const [a, c, d] of [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]]) t.push([b + a, b + c, b + d]);
      }
      return facetten(p, t, true);
    };
    /** Blok langs de as (s0..s1 × o0..o1 × z0..z1), 8 hoeken. */
    const blok = (s0b, s1b, o0, o1, z0, z1) => {
      const p = [];
      for (const [sv, ov] of [[s0b, o0], [s1b, o0], [s1b, o1], [s0b, o1]]) { const q = puntOpStationOffset(sv, ov); p.push(lok(q.x, q.y, z0)); }
      for (let i = 0; i < 4; i++) p.push([p[i][0], p[i][1], z1]);
      const tri = [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]];
      return facetten(p, tri, true);
    };

    // ── alignment ──
    const lijnBasis = W.e('IFCLINE', W.e('IFCCARTESIANPOINT', [0, 0]), W.e('IFCVECTOR', W.e('IFCDIRECTION', [1, 0]), 1));
    const hSegs = [], hCurve = [];
    for (let i = 1; i < asPunten.length; i++) {
      const [x0, y0] = lok(asPunten[i - 1].x, asPunten[i - 1].y), [x1, y1] = lok(asPunten[i].x, asPunten[i].y);
      const len = Math.hypot(x1 - x0, y1 - y0); if (len < 1e-6) continue;
      const hoek = Math.atan2(y1 - y0, x1 - x0);
      const sp = W.e('IFCCARTESIANPOINT', [x0, y0]);
      hSegs.push(W.e('IFCALIGNMENTSEGMENT', IfcSchrijver.guid(), null, null, null, null, null, null, W.e('IFCALIGNMENTHORIZONTALSEGMENT', null, null, sp, hoek, 0, 0, len, null, { e: 'LINE' })));
      hCurve.push({ sp, hoek, len });
    }
    const laatsteH = hCurve[hCurve.length - 1];
    const eindP = lok(asPunten[asPunten.length - 1].x, asPunten[asPunten.length - 1].y);
    const eindPt = W.e('IFCCARTESIANPOINT', [eindP[0], eindP[1]]);
    hSegs.push(W.e('IFCALIGNMENTSEGMENT', IfcSchrijver.guid(), null, null, null, null, null, null, W.e('IFCALIGNMENTHORIZONTALSEGMENT', null, null, eindPt, laatsteH.hoek, 0, 0, 0, null, { e: 'LINE' })));
    const cSegs = hCurve.map((c, i) => W.e('IFCCURVESEGMENT', { e: i === hCurve.length - 1 ? 'CONTSAMEGRADIENTSAMECURVATURE' : 'CONTINUOUS' },
      W.e('IFCAXIS2PLACEMENT2D', c.sp, W.e('IFCDIRECTION', [Math.cos(c.hoek), Math.sin(c.hoek)])), { t: L_, v: 0 }, { t: L_, v: c.len }, lijnBasis));
    cSegs.push(W.e('IFCCURVESEGMENT', { e: 'DISCONTINUOUS' }, W.e('IFCAXIS2PLACEMENT2D', eindPt, W.e('IFCDIRECTION', [Math.cos(laatsteH.hoek), Math.sin(laatsteH.hoek)])), { t: L_, v: 0 }, { t: L_, v: 0 }, lijnBasis));
    const basisCurve = W.e('IFCCOMPOSITECURVE', cSegs, false);
    // verticaal uit het lengteprofiel (gaten opgevuld, vereenvoudigd tot 5 cm)
    let vPts = langsprofiel.filter(p => p.hoogte != null).map(p => [p.station, p.hoogte]);
    let vSegs = null, gradCurve = null;
    if (vPts.length >= 2) {
      if (vPts[0][0] > 1e-6) vPts.unshift([0, vPts[0][1]]);
      if (vPts[vPts.length - 1][0] < L - 1e-6) vPts.push([L, vPts[vPts.length - 1][1]]);
      vPts = vereenvoudigLijn(vPts, opt.verticaalTol ?? 0.05);
      vSegs = []; const gSegs = [];
      for (let i = 1; i < vPts.length; i++) {
        const [sa, ha] = vPts[i - 1], [sb, hb] = vPts[i], hl = sb - sa; if (hl < 1e-6) continue;
        const g = (hb - ha) / hl;
        vSegs.push(W.e('IFCALIGNMENTSEGMENT', IfcSchrijver.guid(), null, null, null, null, null, null, W.e('IFCALIGNMENTVERTICALSEGMENT', null, null, sa, hl, ha, g, g, null, { e: 'CONSTANTGRADIENT' })));
        const nrm = Math.hypot(1, g);
        gSegs.push({ sa, ha, g, len: Math.hypot(hl, hb - ha), dir: [1 / nrm, g / nrm] });
      }
      const [se, he] = vPts[vPts.length - 1], gl = gSegs[gSegs.length - 1].g;
      vSegs.push(W.e('IFCALIGNMENTSEGMENT', IfcSchrijver.guid(), null, null, null, null, null, null, W.e('IFCALIGNMENTVERTICALSEGMENT', null, null, se, 0, he, gl, gl, null, { e: 'CONSTANTGRADIENT' })));
      const gc = gSegs.map((c, i) => W.e('IFCCURVESEGMENT', { e: i === gSegs.length - 1 ? 'CONTSAMEGRADIENTSAMECURVATURE' : 'CONTINUOUS' },
        W.e('IFCAXIS2PLACEMENT2D', W.e('IFCCARTESIANPOINT', [c.sa, c.ha]), W.e('IFCDIRECTION', c.dir)), { t: L_, v: 0 }, { t: L_, v: c.len }, lijnBasis));
      const ld = gSegs[gSegs.length - 1].dir;
      gc.push(W.e('IFCCURVESEGMENT', { e: 'DISCONTINUOUS' }, W.e('IFCAXIS2PLACEMENT2D', W.e('IFCCARTESIANPOINT', [se, he]), W.e('IFCDIRECTION', ld)), { t: L_, v: 0 }, { t: L_, v: 0 }, lijnBasis));
      gradCurve = W.e('IFCGRADIENTCURVE', gc, false, basisCurve, null);
      tel('verticale stukken', gSegs.length);
    }
    const asReps = [W.e('IFCSHAPEREPRESENTATION', ctxFoot, 'FootPrint', 'Curve2D', [basisCurve])];
    if (gradCurve) asReps.push(W.e('IFCSHAPEREPRESENTATION', ctxAxis, 'Axis', 'Curve3D', [gradCurve]));
    kleur(basisCurve, lijnStijl('As', [0.11, 0.16, 0.22]));
    if (gradCurve) kleur(gradCurve, lijnStijl('As', [0.11, 0.16, 0.22]));
    const alignment = W.e('IFCALIGNMENT', IfcSchrijver.guid(), null, asNaam, `Lengte ${komma(L, 2)} m`, null, plaatsWereld(), vorm(asReps), null);
    const hor = W.e('IFCALIGNMENTHORIZONTAL', IfcSchrijver.guid(), null, null, null, null, null, null);
    const lagen = [hor];
    W.e('IFCRELNESTS', IfcSchrijver.guid(), null, null, null, hor, hSegs);
    if (vSegs) { const ver = W.e('IFCALIGNMENTVERTICAL', IfcSchrijver.guid(), null, null, null, null, null, null); lagen.push(ver); W.e('IFCRELNESTS', IfcSchrijver.guid(), null, null, null, ver, vSegs); }
    W.e('IFCRELNESTS', IfcSchrijver.guid(), null, null, null, alignment, lagen);
    tel('as');
    // stationering: referent bij de start + palen / hectometers
    const hm = palen.modus === 'hm', km0 = Number(String(palen.hmStart ?? '').replace(',', '.')) || 0, richting = Number(palen.hmRichting) < 0 ? -1 : 1;
    const stationWaarde = (st) => hm ? km0 * 1000 + richting * st : st;
    const referent = (naam, st, type, extra = {}, lateraal = 0, z = null) => {
      const q = puntOpStation(Math.min(L, Math.max(0, st))), pq = puntOpStationOffset(Math.min(L, Math.max(0, st)), lateraal);
      const zz = z ?? hoogteOp(pq.x, pq.y) ?? 0;
      const lp = W.e('IFCLINEARPLACEMENT', null,
        W.e('IFCAXIS2PLACEMENTLINEAR', W.e('IFCPOINTBYDISTANCEEXPRESSION', { t: L_, v: st }, lateraal ? -lateraal : null, null, null, basisCurve), null, null),
        W.e('IFCAXIS2PLACEMENT3D', W.e('IFCCARTESIANPOINT', lok(pq.x, pq.y, zz)), zAs, W.e('IFCDIRECTION', [Math.cos(q.richting), Math.sin(q.richting), 0])));
      // zichtbaar in viewers: een paaltje van 1,5 m
      const paal = lijn3D([lok(pq.x, pq.y, zz), lok(pq.x, pq.y, zz + 1.5)]);
      kleur(paal, lijnStijl('Dijkpaal', [0.12, 0.31, 0.47]));
      const r = W.e('IFCREFERENT', IfcSchrijver.guid(), null, naam, extra.omschrijving || null, null, lp, vorm([W.e('IFCSHAPEREPRESENTATION', ctxAnn, 'Annotation', 'Curve3D', [paal])]), { e: type });
      const ps = { Station: [stationWaarde(st), L_] };
      if (extra.start && hm && richting < 0) ps.HasIncreasingStation = [false, BOOL];
      psetId(r, 'Pset_Stationing', ps);
      if (extra.pset) psetId(r, 'Lutrea_Stationering', extra.pset);
      return r;
    };
    const refs = [referent(`${asNaam} ${hm ? `km ${komma(km0, 3)}` : '0+000'}`, 0, 'STATION', { start: true, omschrijving: 'Begin van de stationering' })];
    if (stationeringAan()) {
      for (const p of paalMarkeringen()) {
        const so = p.echt ? stationOffsetVanPunt(p.x, p.y) : null;
        refs.push(referent(p.label, p.st, p.echt ? 'REFERENCEMARKER' : 'KILOPOINT', {
          omschrijving: p.echt ? `Dijkpaal (${palen.bron})` : 'Hectometer (berekend)',
          pset: { Paal: [p.label, LBL], AfstandLangsAs: [p.st, L_], AfstandTotAs: [so ? so.afstand : 0, L_], Kant: [so ? (so.offset < 0 ? 'L' : 'R') : '', LBL] },
        }, so ? so.offset : 0));
        tel(p.echt ? 'dijkpalen' : 'hectometers');
      }
    }
    W.e('IFCRELNESTS', IfcSchrijver.guid(), null, null, null, alignment, refs);
    verwezen.push(alignment);

    // ── maaiveld (driehoeksnet in een strook langs de as) ──
    if (opt.maaiveld !== false && delaunay && xs) {
      const half = opt.strook ?? (Math.max(pL, pR) + 2);
      const proj = maakSnProjectie(half);
      // punten in de strook; boven MAXP uitdunnen (per vakje het punt dichtst bij het midden) en opnieuw trianguleren,
      // zodat het net licht blijft voor viewers en botsingscontroles
      const MAXP = opt.maxPunten ?? 60000;
      let sel = [];
      for (let i = 0; i < xs.length; i++) { const so = proj(xs[i], ys[i]); if (so && so.d <= half && so.s > -0.5 && so.s < L + 0.5) sel.push(i); }
      // per vakje één punt: bij "onderkant" het laagste (maaiveld onder begroeiing), bij "bovenkant" het hoogste;
      // vakje zo groot dat er hooguit MAXP punten overblijven
      const onder = oppervlakModus() === 'onder';
      let cel = Math.max(0.5, (gemPuntAfstand || 0.5) * 1.2);
      if (sel.length / 1 > MAXP) cel = Math.max(cel, Math.sqrt(sel.length * (gemPuntAfstand || 0.5) ** 2 / MAXP));
      let gefilterd = 0;
      {
        const vak = new Map();
        for (const i of sel) {
          const k = Math.floor(xs[i] / cel) * 1e7 + Math.floor(ys[i] / cel);
          const v = vak.get(k); if (v === undefined || (onder ? zs[i] < zs[v] : zs[i] > zs[v])) vak.set(k, i);
        }
        // pieken eruit (kronen boven een gat in de grondpunten): hoger dan 0,5 m boven de mediaan van de buren
        if (onder) for (let ronde = 0; ronde < 2; ronde++) {
          const weg = [];
          for (const [k, i] of vak) {
            const gx = Math.floor(k / 1e7), gy = k - gx * 1e7, buren = [];
            for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { if (!a && !b) continue; const j = vak.get((gx + a) * 1e7 + gy + b); if (j !== undefined) buren.push(zs[j]); }
            if (buren.length < 4) continue;
            buren.sort((p, q) => p - q);
            if (zs[i] - buren[buren.length >> 1] > 0.5) weg.push(k);
          }
          for (const k of weg) vak.delete(k);
          gefilterd += weg.length;
          if (!weg.length) break;
        }
        sel = [...vak.values()];
      }
      const pts = sel.map(i => lok(xs[i], ys[i], zs[i])), tri = [];
      if (sel.length >= 3) {
        const dl = d3.Delaunay.from(sel.map(i => [xs[i], ys[i]]));
        const T = dl.triangles, maxRand = Math.max(4, 8 * cel), max2 = maxRand * maxRand;
        const d2 = (i, j) => (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
        for (let t = 0; t < T.length; t += 3) {
          const a = T[t], b = T[t + 1], c = T[t + 2];
          if (d2(a, b) > max2 || d2(b, c) > max2 || d2(c, a) > max2) continue;
          tri.push([a + 1, b + 1, c + 1]);
        }
      }
      if (tri.length) {
        const fs = facetten(pts, tri, false);
        kleur(fs, vlakStijl('Maaiveld', [0.62, 0.6, 0.5]));
        const terrein = W.e('IFCGEOGRAPHICELEMENT', IfcSchrijver.guid(), null, 'Maaiveld', `Driehoeksnet uit ${bronBestandsnaam || 'puntenwolk A'}, strook ± ${komma(half, 1)} m langs ${asNaam}`, null, plaatsWereld(),
          vorm([W.e('IFCSHAPEREPRESENTATION', ctxBody, 'Body', 'Tessellation', [fs])]), null, { e: 'TERRAIN' });
        psetId(terrein, 'Lutrea_Maaiveld', { Bron: [bronBestandsnaam || '', LBL], Punten: [pts.length, INT], Driehoeken: [tri.length, INT], StrookHalveBreedte: [half, L_], Vakje: [cel, L_], Keuze: [onder ? 'laagste punt per vakje (maaiveld)' : 'hoogste punt per vakje', LBL], PiekenVerwijderd: [gefilterd, INT] });
        inSite.push(terrein); tel('maaiveld-driehoeken', tri.length);
      }
    }

    // ── dwarsprofielen als 3D-lijnen ──
    if (opt.dwarsprofielen !== false) for (const st of dwarsStations) {
      const reeks = berekenDwarsprofiel(st);
      const stukken = []; let stuk = [];
      for (const p of reeks) {
        if (p.hoogte == null) { if (stuk.length >= 2) stukken.push(stuk); stuk = []; continue; }
        const q = puntOpStationOffset(st, p.offset); stuk.push(lok(q.x, q.y, p.hoogte));
      }
      if (stuk.length >= 2) stukken.push(stuk);
      if (!stukken.length) continue;
      const items = stukken.map(lijn3D);
      for (const it of items) kleur(it, lijnStijl('Dwarsprofiel', [0.78, 0.28, 0.17]));
      const pt = stationeringAan() ? paalTekst(st) : '';
      const a = W.e('IFCANNOTATION', IfcSchrijver.guid(), null, `Dwarsprofiel st. ${komma(st, 1)} m${pt ? ` (${pt})` : ''}`, `${asNaam}, breedte ${komma(breedte, 1)} m, kijkrichting oplopend station`, 'Dwarsprofiel', plaatsWereld(),
        vorm([W.e('IFCSHAPEREPRESENTATION', ctxAnn, 'Annotation', 'Curve3D', items)]), { e: 'SURVEY' });
      psetId(a, 'Lutrea_Dwarsprofiel', { Station: [st, L_], Stationering: [pt, LBL], Breedte: [breedte, L_], BreedteLinks: [pL, L_], BreedteRechts: [pR, L_], As: [asNaam, LBL] });
      inFacility.push(a); tel('dwarsprofielen');
    }

    // ── doorvaart: box als vrije ruimte, conflicten, niet gemeten ──
    const dvK = doorvaart.tonen !== false ? dvKader() : null;
    if (dvK) {
      let r = dvResultaat; try { r = voerDoorvaartUit(); } catch { r = null; }
      const zOnder = dvK.D ? dvK.PD - dvK.D : dvK.P;
      const zone = buis(dvK.s0, dvK.s1, dvK.c - dvK.B / 2, dvK.c + dvK.B / 2, zOnder, dvK.P + dvK.H);
      kleur(zone, vlakStijl('Doorvaartprofiel', r ? (r.ok ? [0.09, 0.5, 0.24] : [0.78, 0.28, 0.17]) : [0.12, 0.5, 0.65], 0.7));
      const z = W.e('IFCSPATIALZONE', IfcSchrijver.guid(), null, `Doorvaartprofiel ${komma(dvK.B, 2)} × ${komma(dvK.H, 2)} m`, 'Vrij te houden ruimte voor de scheepvaart (doorvaartbox)', 'Doorvaartprofiel', plaatsWereld(),
        vorm([W.e('IFCSHAPEREPRESENTATION', ctxBody, 'Body', 'Tessellation', [zone])]), 'Doorvaartbox', { e: 'RESERVATION' });
      psetId(z, 'Lutrea_Doorvaart', {
        Toetswaterstand: [dvK.P, L_], VrijeHoogte: [dvK.H, L_], Breedte: [dvK.B, L_], Verschuiving: [dvK.c, L_], StationVan: [dvK.s0, L_], StationTot: [dvK.s1, L_],
        StationeringVan: [stationeringAan() ? paalTekst(dvK.s0) : '', LBL], VereisteDiepte: [dvK.D, L_], WaterstandDiepte: [dvK.PD, L_],
        KleinsteVrijeHoogte: [r?.vrij, L_], TekortHoogte: [r && !r.okH ? r.tekortH : null, L_], KleinsteWaterdiepte: [r?.diepteMin, L_], TekortDiepte: [r && !r.okD ? r.tekortD : null, L_],
        OnderzijdeGemetenProcent: [r?.dekkingH?.pct, R_], BodemGemetenProcent: [r?.dekkingD?.pct, R_], NietGemetenOppervlak: [r ? dvGaten(r) : null, OPP],
        Oordeel: [r ? (r.ok ? (dvGaten(r) ? 'voldoet, deels niet gemeten' : 'voldoet') : 'voldoet niet') : 'niet gecontroleerd', LBL],
      });
      verwezen.push(z); tel('doorvaartbox');
      if (r) {
        const conflicten = [...(r.conflictenH || []), ...(r.conflictenD || [])];
        if (conflicten.length) {
          // elk conflictpunt als klein ruitje (achtvlak): zichtbaar in elke viewer en te gebruiken bij botsingscontroles
          const stap = Math.max(1, Math.ceil(conflicten.length / 3000));
          const mk = markers(conflicten.filter((_, i) => i % stap === 0).map(c => lok(c.x, c.y, c.z)), 0.12);
          kleur(mk, vlakStijl('Conflict', [0.78, 0.28, 0.17]));
          const a = W.e('IFCANNOTATION', IfcSchrijver.guid(), null, `Conflicten doorvaartprofiel (${conflicten.length})`, `Meetpunten die in de doorvaartbox steken${stap > 1 ? ` (1 op ${stap} getekend)` : ''}`, 'Conflict', plaatsWereld(),
            vorm([W.e('IFCSHAPEREPRESENTATION', ctxBody, 'Body', 'Tessellation', [mk])]), { e: 'SURVEY' });
          psetId(a, 'Lutrea_Conflict', { Aantal: [conflicten.length, INT], TekortHoogte: [r.okH ? null : r.tekortH, L_], TekortDiepte: [r.okD ? null : r.tekortD, L_] });
          inFacility.push(a); tel('conflictpunten', conflicten.length);
        }
        for (const [kp, wat] of [[r.kritiek, 'onderzijde'], [r.kritiekD, 'bodem']]) {
          if (!kp) continue;
          const mk = markers([lok(kp.x, kp.y, kp.z)], 0.35);
          kleur(mk, vlakStijl('Kritiek punt', [0.78, 0.28, 0.17]));
          const a = W.e('IFCANNOTATION', IfcSchrijver.guid(), null, `Kritiek punt ${wat}`, wat === 'onderzijde' ? 'Laagste punt van de onderzijde binnen de box' : 'Hoogste bodem binnen de box', 'Kritiek punt', plaatsWereld(),
            vorm([W.e('IFCSHAPEREPRESENTATION', ctxBody, 'Body', 'Tessellation', [mk])]), { e: 'SURVEY' });
          psetId(a, 'Lutrea_KritiekPunt', { Station: [kp.station, L_], Offset: [kp.offset, L_], Hoogte: [kp.z, L_] });
          inFacility.push(a);
        }
        gatenNaarIfc(r.dekkingH, 'onderzijde brug', (g) => g.rand ?? dvK.P + dvK.H);
        gatenNaarIfc(r.dekkingD, 'bodem', (g) => g.rand ?? zOnder);
      }
    }
    // ── snoeicheck: doorloopprofiel, marge, snoeipunten ──
    if (begroeiing && snKader() && snoei.tonen !== false) {
      let r = snResultaat; try { r = voerSnoeiUit(); } catch { r = null; }
      if (r) {
        const zp = (si) => r.zcOp(si);
        const prof = buis(r.s0, r.s1, r.c - r.B / 2, r.c + r.B / 2, zp, (si) => zp(si) + r.H);
        kleur(prof, vlakStijl('Doorloopprofiel', [0.11, 0.16, 0.22], 0.75));
        const z1 = W.e('IFCSPATIALZONE', IfcSchrijver.guid(), null, `Doorloopprofiel ${komma(r.B, 2)} × ${komma(r.H, 2)} m`, 'Vrij te houden ruimte boven het pad', 'Doorloopprofiel', plaatsWereld(),
          vorm([W.e('IFCSHAPEREPRESENTATION', ctxBody, 'Body', 'Tessellation', [prof])]), 'Doorloopprofiel', { e: 'RESERVATION' });
        psetId(z1, 'Lutrea_Snoeicheck', {
          Breedte: [r.B, L_], VrijeHoogte: [r.H, L_], Snoeimarge: [r.M, L_], Verschuiving: [r.c, L_], StationVan: [r.s0, L_], StationTot: [r.s1, L_],
          SnoeipuntenInProfiel: [r.nRood, INT], AlleenInMarge: [r.nOranje, INT], LengteSnoeien: [r.lengteRood, L_],
          GemetenProcent: [r.dekking?.pct, R_], NietGemetenOppervlak: [r.dekking?.oppGatLijst, OPP], Oordeel: [r.ok ? 'vrij' : 'snoeien', LBL],
        });
        verwezen.push(z1); tel('doorloopprofiel');
        if (r.M > 0) {
          const marge = buis(r.s0, r.s1, r.c - r.B / 2 - r.M, r.c + r.B / 2 + r.M, zp, (si) => zp(si) + r.H + r.M);
          kleur(marge, vlakStijl('Snoeimarge', [0.88, 0.54, 0.12], 0.88));
          const z2 = W.e('IFCSPATIALZONE', IfcSchrijver.guid(), null, `Snoeimarge ${komma(r.M, 2)} m`, 'Ruimer snoeien i.v.m. aangroei', 'Snoeimarge', plaatsWereld(),
            vorm([W.e('IFCSHAPEREPRESENTATION', ctxBody, 'Body', 'Tessellation', [marge])]), 'Snoeimarge', { e: 'RESERVATION' });
          psetId(z2, 'Lutrea_Snoeicheck', { Snoeimarge: [r.M, L_], Breedte: [r.B + 2 * r.M, L_], VrijeHoogte: [r.H + r.M, L_] });
          verwezen.push(z2);
        }
        const w = begroeiing;
        for (const p of r.snoeipunten) {
          let o0 = Infinity, o1 = -Infinity, za = Infinity, zb = -Infinity;
          for (const i of p.punten) { if (r.O[i] < o0) o0 = r.O[i]; if (r.O[i] > o1) o1 = r.O[i]; if (w.zs[i] < za) za = w.zs[i]; if (w.zs[i] > zb) zb = w.zs[i]; }
          if (!Number.isFinite(o0)) continue;
          const b = blok(p.s0, Math.max(p.s1, p.s0 + 0.2), o0 - 0.05, Math.max(o1, o0 + 0.1) + 0.05, za, Math.max(zb, za + 0.1));
          kleur(b, vlakStijl(p.ernst === 'rood' ? 'Snoeien' : 'Meenemen', p.ernst === 'rood' ? [0.78, 0.28, 0.17] : [0.88, 0.54, 0.12], 0.25));
          const pt = stationeringAan() ? paalTekst(p.s0) : '';
          const g = W.e('IFCGEOGRAPHICELEMENT', IfcSchrijver.guid(), null, `Snoeipunt ${p.nr}`, `${p.ernst === 'rood' ? 'Snoeien: steekt in het doorloopprofiel' : 'Meenemen: alleen in de snoeimarge'} — ${p.soort}`, 'Snoeipunt', plaatsWereld(),
            vorm([W.e('IFCSHAPEREPRESENTATION', ctxBody, 'Body', 'Tessellation', [b])]), String(p.nr), { e: 'VEGETATION' });
          psetId(g, 'Lutrea_Snoeipunt', {
            Nummer: [p.nr, INT], Prioriteit: [p.ernst === 'rood' ? 'snoeien' : 'meenemen (marge)', LBL], Soort: [p.soort, LBL], Kant: [p.kant, LBL],
            StationVan: [p.s0, L_], StationTot: [p.s1, L_], Stationering: [pt, LBL], Lengte: [p.lengte, L_], HoogteBovenPadVan: [p.hVan, L_], HoogteBovenPadTot: [p.hTot, L_],
            AfstandTotHart: [p.oDicht, L_], Terugsnoeien: [p.diepte, L_], Punten: [p.punten.length, INT],
            StamX: [p.stam?.x, L_], StamY: [p.stam?.y, L_], PerceelBoom: [perceelNaam(p.perceel), LBL], PerceelSnoeiplek: [perceelNaam(p.perceelPlek), LBL],
          });
          inFacility.push(g); tel('snoeipunten');
        }
        gatenNaarIfc(r.dekking, 'profiel + marge', (gt) => r.zcOp(gt.sMid));
      }
    }
    function gatenNaarIfc(d, wat, hoogte) {
      for (const g of d?.gaten || []) {
        const z = hoogte(g), rand = [];
        const n = 6;
        for (let i = 0; i <= n; i++) rand.push([g.s0 + (g.s1 - g.s0) * i / n, g.o0]);
        for (let i = 0; i <= n; i++) rand.push([g.s1 - (g.s1 - g.s0) * i / n, g.o1]);
        rand.push([g.s0, g.o0]);
        const item = lijn3D(rand.map(([si, oi]) => { const q = puntOpStationOffset(si, oi); return lok(q.x, q.y, z); }));
        kleur(item, lijnStijl('Niet gemeten', [0.24, 0.27, 0.35]));
        const pt = stationeringAan() ? paalTekst(g.s0) : '';
        const a = W.e('IFCANNOTATION', IfcSchrijver.guid(), null, `Niet gemeten: ${wat} (${komma(g.opp, g.opp < 10 ? 1 : 0)} m²)`, 'Dekkingskaart: binnen de toets geen meetpunten — de toets zegt hier niets', 'Niet gemeten', plaatsWereld(),
          vorm([W.e('IFCSHAPEREPRESENTATION', ctxAnn, 'Annotation', 'Curve3D', [item])]), { e: 'SURVEY' });
        psetId(a, 'Lutrea_NietGemeten', { Toets: [wat, LBL], StationVan: [g.s0, L_], StationTot: [g.s1, L_], Stationering: [pt, LBL], OffsetVan: [g.o0, L_], OffsetTot: [g.o1, L_], Oppervlak: [g.opp, OPP], RandHoogte: [g.rand, L_] });
        inFacility.push(a); tel('niet gemeten');
      }
    }

    // ── ruimtelijke structuur ──
    W.e('IFCRELAGGREGATES', IfcSchrijver.guid(), null, null, null, project, [site, alignment]);
    W.e('IFCRELAGGREGATES', IfcSchrijver.guid(), null, null, null, site, [facility]);
    if (inSite.length) W.e('IFCRELCONTAINEDINSPATIALSTRUCTURE', IfcSchrijver.guid(), null, null, null, inSite, site);
    if (inFacility.length) W.e('IFCRELCONTAINEDINSPATIALSTRUCTURE', IfcSchrijver.guid(), null, null, null, inFacility, facility);
    if (verwezen.length) W.e('IFCRELREFERENCEDINSPATIALSTRUCTURE', IfcSchrijver.guid(), null, null, null, verwezen, facility);
    const naam = opt.bestandsnaam || 'export.ifc';
    return { tekst: W.bestand(naam, `${asNaam} — ${bronBestandsnaam || ''}`), telling, basis: [X0, Y0] };
  }

  document.getElementById('ifcKnop')?.addEventListener('click', async () => {
    try {
      if (asPunten.length < 2) { toonFout('Teken of lees eerst een as in: de IFC bevat de as (alignment), het maaiveld langs de as en de profielen.'); return; }
      const naam = `${(bronBestandsnaam || 'profielen').replace(/\.[^.]+$/, '')}-${(assen[actieveAs]?.naam || 'as').replace(/[^a-zA-Z0-9_-]+/g, '_')}.ifc`;
      const handle = await kiesOpslag(naam, 'ifc');
      if (handle === false) { statusEl.textContent = 'IFC opslaan geannuleerd'; return; }
      statusEl.style.color = ''; statusEl.textContent = 'IFC 4.3 maken…';
      await new Promise((r) => setTimeout(r, 20));
      const { tekst, telling, basis } = maakIfc({ bestandsnaam: naam, maaiveld: document.getElementById('ifcMaaiveld')?.checked !== false });
      await schrijfBestand(handle, new Blob([tekst], { type: 'application/x-step' }), naam);
      const delen = Object.entries(telling).map(([k, v]) => `${k} ${v.toLocaleString('nl-NL')}`);
      statusEl.textContent += ` · IFC 4.3 (${(tekst.length / 1e6).toFixed(1)} MB): ${delen.join(', ')} · basispunt RD ${basis[0]} / ${basis[1]}`;
    } catch (err) {
      console.error(err);
      toonFout('IFC maken mislukt: ' + (err.message || err));
    }
  });

  /* ── as inlezen ── */
  /** WGS84 (graden) → RD (m), benadering van Schreutelkamp & Strang van Hees (± 0,25 m binnen NL). */
  function wgs84NaarRd(lon, lat) {
    const dF = 0.36 * (lat - 52.15517440), dL = 0.36 * (lon - 5.38720621);
    const R = [[0, 1, 190094.945], [1, 1, -11832.228], [2, 1, -114.221], [0, 3, -32.391], [1, 0, -0.705], [3, 1, -2.340], [1, 3, -0.608], [0, 2, -0.008], [2, 3, 0.148]];
    const S = [[1, 0, 309056.544], [0, 2, 3638.893], [2, 0, 73.077], [1, 2, -157.984], [3, 0, 59.788], [0, 1, 0.433], [2, 2, -6.439], [1, 1, -0.032], [0, 4, 0.092], [1, 4, -0.054]];
    let x = 155000, y = 463000;
    for (const [p, q, c] of R) x += c * dF ** p * dL ** q;
    for (const [p, q, c] of S) y += c * dF ** p * dL ** q;
    return { x, y };
  }
  /** WKB lezen (ISO en EWKB, little/big endian): geeft een lijst lijnen [[{x,y}…]…]. */
  function leesWkbLijnen(bytes, start = 0) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = start;
    const uit = [];
    const geom = () => {
      const le = dv.getUint8(o) === 1; o += 1;
      let t = dv.getUint32(o, le); o += 4;
      let z = false, m = false;
      if (t & 0x80000000) z = true;
      if (t & 0x40000000) m = true;
      if (t & 0x20000000) { o += 4; }   // EWKB met SRID
      t &= 0x0fffffff;
      if (t >= 3000) { z = true; m = true; t -= 3000; } else if (t >= 2000) { m = true; t -= 2000; } else if (t >= 1000) { z = true; t -= 1000; }
      const nd = 2 + (z ? 1 : 0) + (m ? 1 : 0);
      const punten = () => {
        const n = dv.getUint32(o, le); o += 4;
        const ps = [];
        for (let i = 0; i < n; i++) { ps.push({ x: dv.getFloat64(o, le), y: dv.getFloat64(o + 8, le) }); o += 8 * nd; }
        return ps;
      };
      if (t === 1) { (uit.punten ||= []).push({ x: dv.getFloat64(o, le), y: dv.getFloat64(o + 8, le) }); o += 8 * nd; return; }
      if (t === 2) { uit.push(punten()); return; }
      if (t === 3) { const nr = dv.getUint32(o, le); o += 4; for (let i = 0; i < nr; i++) uit.push(punten()); return; }   // vlak: de ringen als lijn
      if (t >= 4 && t <= 7) { const n = dv.getUint32(o, le); o += 4; for (let i = 0; i < n; i++) geom(); return; }
      throw new Error(`geometrietype ${t} wordt niet ondersteund`);
    };
    geom();
    return uit;
  }
  function gpkgBlobLijnen(blob) {
    if (!blob || blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) return leesWkbLijnen(blob);
    const env = (blob[3] >> 1) & 7;
    const envLen = [0, 32, 48, 48, 64][env] ?? 0;
    return leesWkbLijnen(blob, 8 + envLen);
  }
  const NAAM_VELDEN = /^(naam|name|as_?naam|asnaam|omschrijving|omschr|label|code|id|dijkpaal|dp)$/i;
  function kiesNaam(eig, standaard) {
    if (!eig) return standaard;
    for (const k of Object.keys(eig)) if (NAAM_VELDEN.test(k) && eig[k] != null && String(eig[k]).trim() !== '') return String(eig[k]).trim().slice(0, 40);
    return standaard;
  }

  async function leesAssenUitGpkg(bestand) {
    const SQL = await laadSqlJs();
    const db = new SQL.Database(new Uint8Array(await bestand.arrayBuffer()));
    const uit = [];
    try {
      const kolommen = db.exec("SELECT table_name, column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns");
      if (!kolommen.length) throw new Error('geen lagen met geometrie gevonden (is het een GeoPackage?)');
      // een eigen export van de Profielviewer: alleen de laag met de as
      const eigen = kolommen[0].values.some((r) => r[0] === 'as_lijn');
      for (const [tabel, kolom, type, srsId] of kolommen[0].values) {
        if (!/LINE|CURVE|GEOMETRY|POLYGON/i.test(type)) continue;
        if (eigen && tabel !== 'as_lijn') continue;
        const res = db.exec(`SELECT * FROM "${String(tabel).replace(/"/g, '""')}"`);
        if (!res.length) continue;
        const ki = res[0].columns.indexOf(kolom);
        for (const rij of res[0].values) {
          const eig = {}; res[0].columns.forEach((c, i) => { if (i !== ki && !(rij[i] instanceof Uint8Array)) eig[c] = rij[i]; });
          let lijnen; try { lijnen = gpkgBlobLijnen(rij[ki]); } catch { continue; }
          for (const l of lijnen) uit.push({ naam: kiesNaam(eig, String(tabel)), punten: l, wgs: Number(srsId) === 4326 });
        }
      }
    } finally { db.close(); }
    return uit;
  }
  function leesAssenUitGeojson(tekst) {
    const gj = JSON.parse(tekst);
    const crsNaam = JSON.stringify(gj.crs || '');
    const uit = [];
    const doe = (geom, eig) => {
      if (!geom) return;
      const lijn = (c) => uit.push({ naam: kiesNaam(eig, 'As'), punten: c.map((p) => ({ x: p[0], y: p[1] })) });
      if (geom.type === 'LineString') lijn(geom.coordinates);
      else if (geom.type === 'MultiLineString') geom.coordinates.forEach(lijn);
      else if (geom.type === 'Polygon') geom.coordinates.forEach(lijn);
      else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((pg) => pg.forEach(lijn));
      else if (geom.type === 'GeometryCollection') geom.geometries.forEach((g) => doe(g, eig));
    };
    if (gj.type === 'FeatureCollection') gj.features.forEach((f) => doe(f.geometry, f.properties));
    else if (gj.type === 'Feature') doe(gj.geometry, gj.properties);
    else doe(gj, null);
    const rd = /28992|RD/i.test(crsNaam);
    for (const a of uit) a.wgs = !rd && a.punten.every((p) => Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90);
    return uit;
  }
  /** Shapefile (.shp, eventueel met .dbf voor de namen). */
  function leesAssenUitShp(shpBuf, dbfBuf) {
    const dv = new DataView(shpBuf);
    const type = dv.getInt32(32, true);
    if (![3, 13, 23, 5, 15, 25].includes(type)) throw new Error('de shapefile bevat geen lijnen (alleen lijnen en vlakken worden gelezen)');
    // namen uit de .dbf
    let namen = [];
    if (dbfBuf) {
      try {
        const d = new DataView(dbfBuf), n = d.getUint32(4, true), kopLen = d.getUint16(8, true), rijLen = d.getUint16(10, true);
        const velden = []; let o = 32, pos = 1;
        while (o < kopLen - 1 && d.getUint8(o) !== 0x0D) {
          let naam = ''; for (let i = 0; i < 11; i++) { const c = d.getUint8(o + i); if (!c) break; naam += String.fromCharCode(c); }
          const len = d.getUint8(o + 16);
          velden.push({ naam, pos, len }); pos += len; o += 32;
        }
        const dec = new TextDecoder('latin1');
        for (let r = 0; r < n; r++) {
          const basis = kopLen + r * rijLen, eig = {};
          for (const v of velden) eig[v.naam] = dec.decode(new Uint8Array(dbfBuf, basis + v.pos, v.len)).trim();
          namen.push(eig);
        }
      } catch { namen = []; }
    }
    const uit = [];
    let o = 100, nr = 0;
    while (o + 8 <= shpBuf.byteLength) {
      const lenWoorden = dv.getInt32(o + 4, false);
      const c = o + 8;
      o = c + lenWoorden * 2;
      const st = dv.getInt32(c, true);
      if (st === 0) { nr++; continue; }
      const nDelen = dv.getInt32(c + 36, true), nPunten = dv.getInt32(c + 40, true);
      const delen = []; for (let i = 0; i < nDelen; i++) delen.push(dv.getInt32(c + 44 + i * 4, true));
      const p0 = c + 44 + nDelen * 4;
      for (let i = 0; i < nDelen; i++) {
        const a = delen[i], b = i + 1 < nDelen ? delen[i + 1] : nPunten, ps = [];
        for (let k = a; k < b; k++) ps.push({ x: dv.getFloat64(p0 + k * 16, true), y: dv.getFloat64(p0 + k * 16 + 8, true) });
        uit.push({ naam: kiesNaam(namen[nr], `lijn ${nr + 1}`), punten: ps });
      }
      nr++;
    }
    for (const a of uit) a.wgs = a.punten.every((p) => Math.abs(p.x) <= 180 && Math.abs(p.y) <= 90);
    return uit;
  }
  /** DXF: LWPOLYLINE, POLYLINE/VERTEX en LINE; naam = de laagnaam. */
  function leesAssenUitDxf(tekst) {
    const r = tekst.split(/\r?\n/);
    const paren = []; for (let i = 0; i + 1 < r.length; i += 2) paren.push([r[i].trim(), r[i + 1]]);
    const uit = [];
    let i = 0, inEnt = false;
    while (i < paren.length) {
      const [c, v] = paren[i];
      if (c === '2' && v.trim() === 'ENTITIES') inEnt = true;
      if (c === '0' && v.trim() === 'ENDSEC') inEnt = false;
      if (!inEnt || c !== '0') { i++; continue; }
      const type = v.trim();
      if (type === 'LWPOLYLINE' || type === 'LINE') {
        let laag = '0', ps = [], x = null, x2 = null, y2 = null; i++;
        while (i < paren.length && paren[i][0] !== '0') {
          const [cc, vv] = paren[i];
          if (cc === '8') laag = vv.trim();
          else if (cc === '10') x = Number(vv);
          else if (cc === '20' && x != null) { ps.push({ x, y: Number(vv) }); x = null; }
          else if (cc === '11') x2 = Number(vv);
          else if (cc === '21') y2 = Number(vv);
          i++;
        }
        if (type === 'LINE' && x2 != null && y2 != null) ps.push({ x: x2, y: y2 });
        uit.push({ naam: laag, punten: ps });
        continue;
      }
      if (type === 'POLYLINE') {
        let laag = '0', ps = [], kop = true; i++;
        while (i < paren.length) {
          const [cc, vv] = paren[i];
          if (cc === '0' && vv.trim() === 'SEQEND') { i++; break; }
          if (cc === '0' && vv.trim() === 'VERTEX') kop = false;
          if (cc === '8' && kop) laag = vv.trim();
          if (!kop && cc === '10') ps.push({ x: Number(vv), y: NaN });
          if (!kop && cc === '20' && ps.length) ps[ps.length - 1].y = Number(vv);
          i++;
        }
        uit.push({ naam: laag, punten: ps.filter((p) => Number.isFinite(p.y)) });
        continue;
      }
      i++;
    }
    // een eigen DXF-export van de Profielviewer: alleen de as (laag PV_AS)
    if (uit.some((a) => a.naam === 'PV_AS')) return uit.filter((a) => a.naam === 'PV_AS').map((a) => ({ ...a, naam: 'As uit DXF' }));
    return uit;
  }

  /** Knipt een lijn op het rechthoekige gebied; geeft de stukken binnen het gebied terug. */
  function knipLijnOpKader(ps, k) {
    const binnen = (p) => p.x >= k.minX && p.x <= k.maxX && p.y >= k.minY && p.y <= k.maxY;
    const stukken = []; let huidig = [];
    const knipSeg = (a, b) => {   // Liang–Barsky
      let t0 = 0, t1 = 1; const dx = b.x - a.x, dy = b.y - a.y;
      for (const [p, q] of [[-dx, a.x - k.minX], [dx, k.maxX - a.x], [-dy, a.y - k.minY], [dy, k.maxY - a.y]]) {
        if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
        const t = q / p;
        if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
      }
      return [{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }];
    };
    for (let i = 1; i < ps.length; i++) {
      const s = knipSeg(ps[i - 1], ps[i]);
      if (!s) { if (huidig.length >= 2) stukken.push(huidig); huidig = []; continue; }
      if (!huidig.length) huidig.push(s[0]);
      else if (Math.hypot(huidig[huidig.length - 1].x - s[0].x, huidig[huidig.length - 1].y - s[0].y) > 1e-6) { if (huidig.length >= 2) stukken.push(huidig); huidig = [s[0]]; }
      huidig.push(s[1]);
      if (!binnen(ps[i])) { if (huidig.length >= 2) stukken.push(huidig); huidig = []; }
    }
    if (huidig.length >= 2) stukken.push(huidig);
    return stukken;
  }
  const lijnLengte = (ps) => ps.reduce((a, p, i) => (i ? a + Math.hypot(p.x - ps[i - 1].x, p.y - ps[i - 1].y) : 0), 0);

  async function leesAsBestanden(bestanden) {
    if (!xs) { toonFout('Lees eerst een puntenwolk in; daarna kun je een as inlezen.'); return; }
    const lijst = [...bestanden];
    const ext = (f) => (f.name.split('.').pop() || '').toLowerCase();
    let ruw = [];
    const shp = lijst.find((f) => ext(f) === 'shp');
    for (const f of lijst) {
      const e = ext(f);
      if (e === 'gpkg') ruw.push(...await leesAssenUitGpkg(f));
      else if (e === 'geojson' || e === 'json') ruw.push(...leesAssenUitGeojson(await f.text()));
      else if (e === 'dxf') ruw.push(...leesAssenUitDxf(await f.text()));
    }
    if (shp) {
      const dbf = lijst.find((f) => ext(f) === 'dbf');
      ruw.push(...leesAssenUitShp(await shp.arrayBuffer(), dbf ? await dbf.arrayBuffer() : null));
    } else if (lijst.some((f) => ext(f) === 'dbf') && !lijst.some((f) => ['gpkg', 'geojson', 'json', 'dxf'].includes(ext(f)))) {
      throw new Error('kies het .shp-bestand (eventueel samen met de .dbf voor de namen)');
    }
    // WGS84 → RD, dubbele punten eruit
    let omgerekend = false;
    for (const a of ruw) {
      if (a.wgs) { a.punten = a.punten.map((p) => wgs84NaarRd(p.x, p.y)); omgerekend = true; }
      a.punten = a.punten.filter((p, i, arr) => Number.isFinite(p.x) && Number.isFinite(p.y) && (!i || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 1e-4));
    }
    voegAssenToe(ruw, omgerekend);
  }
  /** Lijnen {naam, punten} als assen toevoegen: alleen het deel bij de puntenwolk, de langste eerst. */
  function voegAssenToe(ruw, omgerekend = false, bron = '') {
    ruw = ruw.filter((a) => a.punten.length >= 2);
    if (!ruw.length) throw new Error('geen lijnen gevonden in het bestand');
    // alleen het deel binnen de puntenwolk (plus 10 m)
    const g = grenzen(), m = 10;
    const kader = { minX: g.minX - m, maxX: g.maxX + m, minY: g.minY - m, maxY: g.maxY + m };
    let geknipt = false;
    const stukken = [];
    for (const a of ruw) {
      const delen = knipLijnOpKader(a.punten, kader);
      if (delen.length !== 1 || delen[0].length !== a.punten.length) geknipt = true;
      delen.forEach((d, i) => { if (lijnLengte(d) >= 1) stukken.push({ naam: delen.length > 1 ? `${a.naam} (${i + 1})` : a.naam, punten: d }); });
    }
    if (!stukken.length) {
      const p = ruw[0].punten[0];
      throw new Error(`de lijnen liggen niet bij de puntenwolk (eerste punt x ${p.x.toFixed(0)}, y ${p.y.toFixed(0)}; de puntenwolk ligt rond x ${((g.minX + g.maxX) / 2).toFixed(0)}, y ${((g.minY + g.maxY) / 2).toFixed(0)}). Staan beide in RD (EPSG:28992)?`);
    }
    stukken.sort((a, b) => lijnLengte(b.punten) - lijnLengte(a.punten));
    const MAX = 20;
    const teVeel = stukken.length > MAX;
    const nieuw = stukken.slice(0, MAX);
    // toevoegen als assen; een lege actieve as eerst hergebruiken
    bewaarActieveAs();
    const uniek = (n) => { let naam = n || 'As', k = 2; while (assen.some((a) => a.naam === naam)) naam = `${n} (${k++})`; return naam; };
    let eerste = -1;
    for (const a of nieuw) {
      const as = { naam: uniek(a.naam), punten: a.punten.map((p) => ({ x: p.x, y: p.y })) };
      if (asPunten.length === 0 && eerste < 0) { assen[actieveAs] = as; asPunten = as.punten; eerste = actieveAs; }
      else { assen.push(as); if (eerste < 0) eerste = assen.length - 1; }
    }
    zetTekenModus(false);
    zetActieveAs(eerste);
    vulAsKeuze();
    const delen = [`${nieuw.length} ${nieuw.length === 1 ? 'as' : 'assen'} ${bron ? `uit ${bron}` : 'ingelezen'} (${nieuw.map((a) => `${a.naam} ${lijnLengte(a.punten).toFixed(0)} m`).join(', ')})`];
    if (omgerekend) delen.push('omgerekend van WGS84 naar RD');
    if (geknipt) delen.push('alleen het deel bij de puntenwolk');
    if (teVeel) delen.push(`de ${MAX} langste van ${stukken.length} lijnen`);
    statusEl.style.color = ''; statusEl.textContent = delen.join(' · ');
  }
  {
    const veld = document.getElementById('asBestand');
    document.getElementById('asInlezenKnop')?.addEventListener('click', () => veld?.click());
    veld?.addEventListener('change', async () => {
      const f = veld.files ? [...veld.files] : [];
      veld.value = '';
      if (!f.length) return;
      try { await leesAsBestanden(f); } catch (err) { console.error(err); toonFout('As inlezen mislukt: ' + (err.message || err)); }
    });
  }
  /* ────────────────────────────────────────────────────────────────
     As uit het Nationaal Wegenbestand (NWB, PDOK): de hartlijnen van
     wegen (incl. gemeentelijke straten en fietspaden) en vaarwegen.
     Ophalen in het gebied van de puntenwolk, een straat (of vaarweg)
     kiezen in de lijst of door erop te klikken, en de aansluitende
     wegvakken worden aan elkaar geregen tot één as.
     ──────────────────────────────────────────────────────────────── */
  const NWB_API = {
    wegen: { url: 'https://api.pdok.nl/rws/nationaal-wegenbestand-wegen/ogc/v1/collections/wegvakken/items', beg: 'jte_id_beg', eind: 'jte_id_end', id: 'wvk_id' },
    vaarwegen: { url: 'https://api.pdok.nl/rws/nationaal-wegenbestand-vaarwegen/ogc/v1/collections/vaarwegvakken/items', beg: 'vwj_id_beg', eind: 'vwj_id_end', id: 'vwk_id' },
  };
  let nwb = null;   // { soort, vakken: [{id, a, b, punten, lengte, naam, info}], groepen: [{naam, vakken, lengte}], gekozen }
  const nwbBeheerder = { G: 'gemeente', P: 'provincie', R: 'Rijk', W: 'waterschap', T: 'overig' };
  function nwbNaam(e, soort) {
    if (soort === 'vaarwegen') return e.vwg_naam || e.vrt_naam || `vaarweg ${e.vwg_nr ?? ''}`.trim();
    const nr = e.wegnummer ? `${/^\d+$/.test(e.wegnummer) ? (e.wegbehsrt === 'R' ? 'A' : 'N') : ''}${e.wegnummer}` : '';
    return e.stt_naam || nr || (e.bst_code === 'FP' ? 'fietspad (zonder naam)' : 'weg zonder naam');
  }
  async function haalNwbOp(soort, onVoortgang) {
    const g = grenzen(), m = 25;
    const crs = 'http://www.opengis.net/def/crs/EPSG/0/28992', cfg = NWB_API[soort];
    let url = `${cfg.url}?bbox=${g.minX - m},${g.minY - m},${g.maxX + m},${g.maxY + m}&bbox-crs=${encodeURIComponent(crs)}&crs=${encodeURIComponent(crs)}&limit=1000&f=json`;
    const vakken = [];
    for (let blad = 0; url && blad < 40; blad++) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`PDOK gaf ${resp.status}`);
      const gj = await resp.json();
      for (const f of gj.features || []) {
        const geo = f.geometry; if (!geo) continue;
        const lijnen = geo.type === 'LineString' ? [geo.coordinates] : geo.type === 'MultiLineString' ? geo.coordinates : [];
        const punten = [];
        for (const l of lijnen) for (const [x, y] of l) if (!punten.length || Math.hypot(x - punten[punten.length - 1].x, y - punten[punten.length - 1].y) > 1e-4) punten.push({ x, y });
        if (punten.length < 2) continue;
        const e = f.properties || {};
        vakken.push({ id: e[cfg.id] ?? f.id, a: e[cfg.beg], b: e[cfg.eind], punten, lengte: lijnLengte(punten), naam: nwbNaam(e, soort), e });
      }
      onVoortgang?.(`${vakken.length} ${soort === 'wegen' ? 'wegvakken' : 'vaarwegvakken'}…`);
      const volgende = (gj.links || []).find(l => l.rel === 'next');
      url = volgende && (gj.features || []).length ? volgende.href : null;
    }
    return vakken;
  }
  /** Vakken per naam, en per naam per samenhangend stuk (via de knooppunten). */
  function nwbGroepen(vakken) {
    const perNaam = new Map();
    for (const v of vakken) { if (!perNaam.has(v.naam)) perNaam.set(v.naam, []); perNaam.get(v.naam).push(v); }
    const groepen = [];
    for (const [naam, lijst] of perNaam) {
      const ouder = new Map();
      const zoek = (k) => { while (ouder.get(k) !== k) { ouder.set(k, ouder.get(ouder.get(k))); k = ouder.get(k); } return k; };
      for (const v of lijst) for (const k of [v.a, v.b]) if (!ouder.has(k)) ouder.set(k, k);
      for (const v of lijst) { const ra = zoek(v.a), rb = zoek(v.b); if (ra !== rb) ouder.set(ra, rb); }
      const comp = new Map();
      for (const v of lijst) { const r = zoek(v.a); if (!comp.has(r)) comp.set(r, []); comp.get(r).push(v); }
      const delen = [...comp.values()].map(vs => ({ naam, vakken: vs, lengte: vs.reduce((a, v) => a + v.lengte, 0) })).sort((p, q) => q.lengte - p.lengte);
      delen.forEach((d, i) => { if (delen.length > 1) d.naam = `${naam} (${i + 1})`; d.basis = naam; d.info = lijst[0].e; groepen.push(d); });
    }
    return groepen.sort((p, q) => q.lengte - p.lengte);
  }
  /** Langste doorgaande route door de vakken van één groep (rotondes en splitsingen: de langste tak). */
  function nwbRoute(groep) {
    const buren = new Map();
    for (const v of groep.vakken) for (const [k, ander] of [[v.a, v.b], [v.b, v.a]]) { if (!buren.has(k)) buren.set(k, []); buren.get(k).push({ v, naar: ander }); }
    const knopen = [...buren.keys()];
    const starts = knopen.filter(k => buren.get(k).length === 1);
    let beste = { lengte: -1, pad: [] }, stappen = 0;
    const gebruikt = new Set();
    const dfs = (k, lengte, pad) => {
      if (++stappen > 200000) return;
      if (lengte > beste.lengte) beste = { lengte, pad: pad.slice() };
      for (const { v, naar } of buren.get(k)) {
        if (gebruikt.has(v)) continue;
        gebruikt.add(v); pad.push({ v, van: k });
        dfs(naar, lengte + v.lengte, pad);
        pad.pop(); gebruikt.delete(v);
      }
    };
    for (const s of (starts.length ? starts : knopen.slice(0, 1))) dfs(s, 0, []);
    const punten = [];
    for (const { v, van } of beste.pad) {
      const ps = v.a === van ? v.punten : v.punten.slice().reverse();
      for (const p of ps) if (!punten.length || Math.hypot(p.x - punten[punten.length - 1].x, p.y - punten[punten.length - 1].y) > 1e-3) punten.push({ x: p.x, y: p.y });
    }
    return punten;
  }
  function tekenNwbOpVlak() {
    if (!nwb || !document.getElementById('nwbDialoog')?.open) return;
    ctxVlak.save();
    ctxVlak.lineCap = 'round'; ctxVlak.lineJoin = 'round';
    const lijn = (ps) => { ctxVlak.beginPath(); ps.forEach((p, i) => { const [x, y] = wereldNaarScherm(p.x, p.y); if (i) ctxVlak.lineTo(x, y); else ctxVlak.moveTo(x, y); }); ctxVlak.stroke(); };
    ctxVlak.strokeStyle = 'rgba(30,127,166,0.55)'; ctxVlak.lineWidth = 2;
    for (const v of nwb.vakken) lijn(v.punten);
    if (nwb.gekozen) {
      ctxVlak.strokeStyle = 'rgba(255,255,255,0.9)'; ctxVlak.lineWidth = 7; for (const v of nwb.gekozen.vakken) lijn(v.punten);
      ctxVlak.strokeStyle = '#1E7FA6'; ctxVlak.lineWidth = 4; for (const v of nwb.gekozen.vakken) lijn(v.punten);
    }
    ctxVlak.restore();
  }
  function nwbKiesGroep(g) {
    if (!nwb) return;
    nwb.gekozen = g;
    for (const k of document.querySelectorAll('#nwbLijst button')) k.classList.toggle('aan', k.dataset.naam === g?.naam);
    const info = document.getElementById('nwbInfo'), maak = document.getElementById('nwbMaak');
    maak.disabled = !g;
    if (g) {
      const e = g.info || {};
      const extra = nwb.soort === 'wegen' ? [e.wegbehnaam ? `beheer: ${e.wegbehnaam}${nwbBeheerder[e.wegbehsrt] ? ` (${nwbBeheerder[e.wegbehsrt]})` : ''}` : '', e.gme_naam || ''].filter(Boolean).join(' · ') : (e.vrt_naam || '');
      info.textContent = `${g.naam}: ${g.vakken.length} vak${g.vakken.length === 1 ? '' : 'ken'}, ${Math.round(g.lengte)} m${extra ? ' · ' + extra : ''}`;
      const sel = document.querySelector(`#nwbLijst button[data-naam="${CSS.escape(g.naam)}"]`); sel?.scrollIntoView({ block: 'nearest' });
    }
    tekenVlak();
  }
  /** Klik in het bovenaanzicht terwijl het NWB-venster open is: het dichtstbijzijnde vak kiezen. */
  function nwbKlik(sx, sy) {
    if (!nwb || !document.getElementById('nwbDialoog')?.open) return false;
    let beste = null, besteD = 12;
    for (const v of nwb.vakken) {
      for (let i = 1; i < v.punten.length; i++) {
        const [x0, y0] = wereldNaarScherm(v.punten[i - 1].x, v.punten[i - 1].y), [x1, y1] = wereldNaarScherm(v.punten[i].x, v.punten[i].y);
        const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((sx - x0) * dx + (sy - y0) * dy) / l2));
        const d = Math.hypot(sx - (x0 + t * dx), sy - (y0 + t * dy));
        if (d < besteD) { besteD = d; beste = v; }
      }
    }
    if (!beste) return true;
    nwbKiesGroep(nwb.groepen.find(g => g.vakken.includes(beste)));
    return true;
  }
  async function nwbOphalen() {
    const soort = document.querySelector('input[name="nwbSoort"]:checked')?.value || 'wegen';
    const lijst = document.getElementById('nwbLijst'), info = document.getElementById('nwbInfo');
    lijst.innerHTML = ''; document.getElementById('nwbMaak').disabled = true;
    info.textContent = `${soort === 'wegen' ? 'Wegen' : 'Vaarwegen'} ophalen bij PDOK…`;
    try {
      const vakken = await haalNwbOp(soort, (t) => { info.textContent = `${t}`; });
      nwb = { soort, vakken, groepen: nwbGroepen(vakken), gekozen: null };
      if (!vakken.length) { info.textContent = `Geen ${soort} gevonden in het gebied van de puntenwolk.`; tekenVlak(); return; }
      for (const g of nwb.groepen) {
        const k = document.createElement('button');
        k.type = 'button'; k.className = 'breed'; k.dataset.naam = g.naam; k.style.textAlign = 'left';
        k.innerHTML = '<b></b> <span class="zacht"></span>';
        k.querySelector('b').textContent = g.naam;
        k.querySelector('span').textContent = `· ${Math.round(g.lengte)} m${g.vakken.length > 1 ? ` · ${g.vakken.length} vakken` : ''}`;
        k.onclick = () => nwbKiesGroep(g);
        lijst.appendChild(k);
      }
      info.textContent = `${nwb.groepen.length} ${soort === 'wegen' ? 'wegen' : 'vaarwegen'} gevonden. Kies er één in de lijst, of klik op een lijn in het bovenaanzicht.`;
      tekenVlak();
    } catch (err) {
      console.error(err);
      info.textContent = `Ophalen mislukt (${err.message || err}). Is er internet? PDOK moet bereikbaar zijn.`;
    }
  }
  document.getElementById('nwbKnop')?.addEventListener('click', () => {
    if (!xs) { toonFout('Lees eerst een puntenwolk in: de wegen worden opgehaald in het gebied van de puntenwolk.'); return; }
    const dlg = document.getElementById('nwbDialoog');
    dlg.show();
    if (!nwb) nwbOphalen(); else tekenVlak();
  });
  for (const r of document.querySelectorAll('input[name="nwbSoort"]')) r.addEventListener('change', () => nwbOphalen());
  document.getElementById('nwbSluit')?.addEventListener('click', () => { document.getElementById('nwbDialoog').close(); tekenVlak(); });
  document.getElementById('nwbMaak')?.addEventListener('click', () => {
    if (!nwb?.gekozen) return;
    const g = nwb.gekozen, punten = nwbRoute(g);
    try {
      voegAssenToe([{ naam: g.naam, punten }], false, `NWB (${nwb.soort === 'wegen' ? 'Nationaal Wegenbestand' : 'vaarwegen'})`);
      document.getElementById('nwbDialoog').close();
      statusEl.textContent += ' · NWB-hartlijn: stel daarna links en rechts in bij Profiel';
      tekenVlak();
    } catch (err) { document.getElementById('nwbInfo').textContent = `As maken lukte niet: ${err.message || err}`; }
  });

  document.getElementById('omdraaiAsKnop')?.addEventListener('click', () => {
    if (asPunten.length < 2) return;
    asPunten.reverse();
    bewaarActieveAs();
    huidigeStationIndex = 0;
    bijwerkenProfielen();
    tekenVlak();
    statusEl.style.color = ''; statusEl.textContent = `${assen[actieveAs].naam}: richting omgedraaid; station 0 ligt nu aan de andere kant (L en R wisselen mee).`;
  });

  /* ────────────────────────────────────────────────────────────────
     DXF-export voor AutoCAD / Civil 3D (R12-formaat, opent overal):
     1. situatie in RD/NAP: as (3D-polylijn), dwarsprofiellijnen + station,
        elk dwarsprofiel als 3D-polylijn op de echte plek (breaklines);
     2. lengteprofiel en dwarsprofielen als 2D-tekening op ware grootte
        (1 eenheid = 1 m) rechts naast de situatie, met raster, hoogtes,
        NAP, as, waterpeil en BGT-grenzen.
     Elk onderdeel op een eigen laag (PV_…), zodat het in Civil 3D snel naar
     de eigen (NLCS-)lagen om te zetten is.
     ──────────────────────────────────────────────────────────────── */
  // DXF-sjabloon (AutoCAD 2010-formaat, AC1024): eenheden meter ($INSUNITS 6, $MEASUREMENT 1),
  // de PV_-lagen en een geolocatie (GEODATA) met het RD-stelsel (Amersfoort / RD New, EPSG 28992).
  // Gemaakt met ezdxf (dxfsjabloon/maak.py); modelruimte = blokrecord 17.
  const DXF_KOP = "  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1024\n  9\n$ACADMAINTVER\n 70\n6\n  9\n$DWGCODEPAGE\n  3\nANSI_1252\n  9\n$LASTSAVEDBY\n  1\nezdxf\n  9\n$INSBASE\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$EXTMIN\n 10\n{XMIN}\n 20\n{YMIN}\n 30\n{ZMIN}\n  9\n$EXTMAX\n 10\n{XMAX}\n 20\n{YMAX}\n 30\n{ZMAX}\n  9\n$LIMMIN\n 10\n0.0\n 20\n0.0\n  9\n$LIMMAX\n 10\n420.0\n 20\n297.0\n  9\n$ORTHOMODE\n 70\n0\n  9\n$REGENMODE\n 70\n1\n  9\n$FILLMODE\n 70\n1\n  9\n$QTEXTMODE\n 70\n0\n  9\n$MIRRTEXT\n 70\n1\n  9\n$LTSCALE\n 40\n1.0\n  9\n$ATTMODE\n 70\n1\n  9\n$TEXTSIZE\n 40\n2.5\n  9\n$TRACEWID\n 40\n1.0\n  9\n$TEXTSTYLE\n  7\nStandard\n  9\n$CLAYER\n  8\n0\n  9\n$CELTYPE\n  6\nByLayer\n  9\n$CECOLOR\n 62\n256\n  9\n$CELTSCALE\n 40\n1.0\n  9\n$DISPSILH\n 70\n0\n  9\n$DIMSCALE\n 40\n1.0\n  9\n$DIMASZ\n 40\n2.5\n  9\n$DIMEXO\n 40\n0.625\n  9\n$DIMDLI\n 40\n3.75\n  9\n$DIMRND\n 40\n0.0\n  9\n$DIMDLE\n 40\n0.0\n  9\n$DIMEXE\n 40\n1.25\n  9\n$DIMTP\n 40\n0.0\n  9\n$DIMTM\n 40\n0.0\n  9\n$DIMTXT\n 40\n2.5\n  9\n$DIMCEN\n 40\n2.5\n  9\n$DIMTSZ\n 40\n0.0\n  9\n$DIMTOL\n 70\n0\n  9\n$DIMLIM\n 70\n0\n  9\n$DIMTIH\n 70\n0\n  9\n$DIMTOH\n 70\n0\n  9\n$DIMSE1\n 70\n0\n  9\n$DIMSE2\n 70\n0\n  9\n$DIMTAD\n 70\n1\n  9\n$DIMZIN\n 70\n8\n  9\n$DIMBLK\n  1\n\n  9\n$DIMASO\n 70\n1\n  9\n$DIMSHO\n 70\n1\n  9\n$DIMPOST\n  1\n\n  9\n$DIMAPOST\n  1\n\n  9\n$DIMALT\n 70\n0\n  9\n$DIMALTD\n 70\n3\n  9\n$DIMALTF\n 40\n0.03937007874\n  9\n$DIMLFAC\n 40\n1.0\n  9\n$DIMTOFL\n 70\n1\n  9\n$DIMTVP\n 40\n0.0\n  9\n$DIMTIX\n 70\n0\n  9\n$DIMSOXD\n 70\n0\n  9\n$DIMSAH\n 70\n0\n  9\n$DIMBLK1\n  1\n\n  9\n$DIMBLK2\n  1\n\n  9\n$DIMSTYLE\n  2\nISO-25\n  9\n$DIMCLRD\n 70\n0\n  9\n$DIMCLRE\n 70\n0\n  9\n$DIMCLRT\n 70\n0\n  9\n$DIMTFAC\n 40\n1.0\n  9\n$DIMGAP\n 40\n0.625\n  9\n$DIMJUST\n 70\n0\n  9\n$DIMSD1\n 70\n0\n  9\n$DIMSD2\n 70\n0\n  9\n$DIMTOLJ\n 70\n0\n  9\n$DIMTZIN\n 70\n8\n  9\n$DIMALTZ\n 70\n0\n  9\n$DIMALTTZ\n 70\n0\n  9\n$DIMUPT\n 70\n0\n  9\n$DIMDEC\n 70\n2\n  9\n$DIMTDEC\n 70\n2\n  9\n$DIMALTU\n 70\n2\n  9\n$DIMALTTD\n 70\n3\n  9\n$DIMTXSTY\n  7\nStandard\n  9\n$DIMAUNIT\n 70\n0\n  9\n$DIMADEC\n 70\n0\n  9\n$DIMALTRND\n 40\n0.0\n  9\n$DIMAZIN\n 70\n0\n  9\n$DIMDSEP\n 70\n44\n  9\n$DIMATFIT\n 70\n3\n  9\n$DIMFRAC\n 70\n0\n  9\n$DIMLDRBLK\n  1\n\n  9\n$DIMLUNIT\n 70\n2\n  9\n$DIMLWD\n 70\n-2\n  9\n$DIMLWE\n 70\n-2\n  9\n$DIMTMOVE\n 70\n0\n  9\n$DIMFXL\n 40\n1.0\n  9\n$DIMFXLON\n 70\n0\n  9\n$DIMJOGANG\n 40\n0.785398163397\n  9\n$DIMTFILL\n 70\n0\n  9\n$DIMTFILLCLR\n 70\n0\n  9\n$DIMARCSYM\n 70\n0\n  9\n$DIMLTYPE\n  6\n\n  9\n$DIMLTEX1\n  6\n\n  9\n$DIMLTEX2\n  6\n\n  9\n$DIMTXTDIRECTION\n 70\n0\n  9\n$LUNITS\n 70\n2\n  9\n$LUPREC\n 70\n3\n  9\n$SKETCHINC\n 40\n1.0\n  9\n$FILLETRAD\n 40\n10.0\n  9\n$AUNITS\n 70\n0\n  9\n$AUPREC\n 70\n4\n  9\n$MENU\n  1\n.\n  9\n$ELEVATION\n 40\n0.0\n  9\n$PELEVATION\n 40\n0.0\n  9\n$THICKNESS\n 40\n0.0\n  9\n$LIMCHECK\n 70\n0\n  9\n$CHAMFERA\n 40\n0.0\n  9\n$CHAMFERB\n 40\n0.0\n  9\n$CHAMFERC\n 40\n0.0\n  9\n$CHAMFERD\n 40\n0.0\n  9\n$SKPOLY\n 70\n0\n  9\n$TDCREATE\n 40\n2461337.471747685\n  9\n$TDUCREATE\n 40\n2458532.153996898\n  9\n$TDUPDATE\n 40\n2461337.471747685\n  9\n$TDUUPDATE\n 40\n2458532.1544311\n  9\n$TDINDWG\n 40\n0.0\n  9\n$TDUSRTIMER\n 40\n0.0\n  9\n$USRTIMER\n 70\n1\n  9\n$ANGBASE\n 50\n0.0\n  9\n$ANGDIR\n 70\n0\n  9\n$PDMODE\n 70\n0\n  9\n$PDSIZE\n 40\n0.0\n  9\n$PLINEWID\n 40\n0.0\n  9\n$SPLFRAME\n 70\n0\n  9\n$SPLINETYPE\n 70\n6\n  9\n$SPLINESEGS\n 70\n8\n  9\n$HANDSEED\n  5\n{HANDSEED}\n  9\n$SURFTAB1\n 70\n6\n  9\n$SURFTAB2\n 70\n6\n  9\n$SURFTYPE\n 70\n6\n  9\n$SURFU\n 70\n6\n  9\n$SURFV\n 70\n6\n  9\n$UCSBASE\n  2\n\n  9\n$UCSNAME\n  2\n\n  9\n$UCSORG\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSXDIR\n 10\n1.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSYDIR\n 10\n0.0\n 20\n1.0\n 30\n0.0\n  9\n$UCSORTHOREF\n  2\n\n  9\n$UCSORTHOVIEW\n 70\n0\n  9\n$UCSORGTOP\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSORGBOTTOM\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSORGLEFT\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSORGRIGHT\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSORGFRONT\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSORGBACK\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSBASE\n  2\n\n  9\n$PUCSNAME\n  2\n\n  9\n$PUCSORG\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSXDIR\n 10\n1.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSYDIR\n 10\n0.0\n 20\n1.0\n 30\n0.0\n  9\n$PUCSORTHOREF\n  2\n\n  9\n$PUCSORTHOVIEW\n 70\n0\n  9\n$PUCSORGTOP\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSORGBOTTOM\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSORGLEFT\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSORGRIGHT\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSORGFRONT\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSORGBACK\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$USERI1\n 70\n0\n  9\n$USERI2\n 70\n0\n  9\n$USERI3\n 70\n0\n  9\n$USERI4\n 70\n0\n  9\n$USERI5\n 70\n0\n  9\n$USERR1\n 40\n0.0\n  9\n$USERR2\n 40\n0.0\n  9\n$USERR3\n 40\n0.0\n  9\n$USERR4\n 40\n0.0\n  9\n$USERR5\n 40\n0.0\n  9\n$WORLDVIEW\n 70\n1\n  9\n$SHADEDGE\n 70\n3\n  9\n$SHADEDIF\n 70\n70\n  9\n$TILEMODE\n 70\n1\n  9\n$MAXACTVP\n 70\n64\n  9\n$PINSBASE\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PLIMCHECK\n 70\n0\n  9\n$PEXTMIN\n 10\n1e+20\n 20\n1e+20\n 30\n1e+20\n  9\n$PEXTMAX\n 10\n-1e+20\n 20\n-1e+20\n 30\n-1e+20\n  9\n$PLIMMIN\n 10\n0.0\n 20\n0.0\n  9\n$PLIMMAX\n 10\n420.0\n 20\n297.0\n  9\n$UNITMODE\n 70\n0\n  9\n$VISRETAIN\n 70\n1\n  9\n$PLINEGEN\n 70\n0\n  9\n$PSLTSCALE\n 70\n1\n  9\n$TREEDEPTH\n 70\n3020\n  9\n$CMLSTYLE\n  2\nStandard\n  9\n$CMLJUST\n 70\n0\n  9\n$CMLSCALE\n 40\n20.0\n  9\n$PROXYGRAPHICS\n 70\n1\n  9\n$MEASUREMENT\n 70\n1\n  9\n$CELWEIGHT\n370\n-1\n  9\n$ENDCAPS\n280\n0\n  9\n$JOINSTYLE\n280\n0\n  9\n$LWDISPLAY\n290\n0\n  9\n$INSUNITS\n 70\n6\n  9\n$HYPERLINKBASE\n  1\n\n  9\n$STYLESHEET\n  1\n\n  9\n$XEDIT\n290\n1\n  9\n$CEPSNTYPE\n380\n0\n  9\n$PSTYLEMODE\n290\n1\n  9\n$FINGERPRINTGUID\n  2\n{B559EF38-FA3B-42F9-BE28-0F075DA9EFAC}\n  9\n$VERSIONGUID\n  2\n{6F1E3389-DCB1-4716-BF87-71278FAB9154}\n  9\n$EXTNAMES\n290\n1\n  9\n$PSVPSCALE\n 40\n0.0\n  9\n$OLESTARTUP\n290\n0\n  9\n$SORTENTS\n280\n127\n  9\n$INDEXCTL\n280\n0\n  9\n$HIDETEXT\n280\n1\n  9\n$XCLIPFRAME\n280\n1\n  9\n$HALOGAP\n280\n0\n  9\n$OBSCOLOR\n 70\n257\n  9\n$OBSLTYPE\n280\n0\n  9\n$INTERSECTIONDISPLAY\n280\n0\n  9\n$INTERSECTIONCOLOR\n 70\n257\n  9\n$DIMASSOC\n280\n2\n  9\n$PROJECTNAME\n  1\n\n  9\n$CAMERADISPLAY\n290\n0\n  9\n$LENSLENGTH\n 40\n50.0\n  9\n$CAMERAHEIGHT\n 40\n0.0\n  9\n$STEPSPERSEC\n 40\n24.0\n  9\n$STEPSIZE\n 40\n100.0\n  9\n$3DDWFPREC\n 40\n2.0\n  9\n$PSOLWIDTH\n 40\n0.005\n  9\n$PSOLHEIGHT\n 40\n0.08\n  9\n$LOFTANG1\n 40\n1.570796326795\n  9\n$LOFTANG2\n 40\n1.570796326795\n  9\n$LOFTMAG1\n 40\n0.0\n  9\n$LOFTMAG2\n 40\n0.0\n  9\n$LOFTPARAM\n 70\n7\n  9\n$LOFTNORMALS\n280\n1\n  9\n$LATITUDE\n 40\n37.795\n  9\n$LONGITUDE\n 40\n-122.394\n  9\n$NORTHDIRECTION\n 40\n0.0\n  9\n$TIMEZONE\n 70\n-8000\n  9\n$LIGHTGLYPHDISPLAY\n280\n1\n  9\n$TILEMODELIGHTSYNCH\n280\n1\n  9\n$CMATERIAL\n347\n20\n  9\n$SOLIDHIST\n280\n0\n  9\n$SHOWHIST\n280\n1\n  9\n$DWFFRAME\n280\n2\n  9\n$DGNFRAME\n280\n2\n  9\n$REALWORLDSCALE\n290\n1\n  9\n$INTERFERECOLOR\n 62\n256\n  9\n$CSHADOW\n280\n0\n  9\n$SHADOWPLANELOCATION\n 40\n0.0\n  0\nENDSEC\n  0\nSECTION\n  2\nCLASSES\n  0\nCLASS\n  1\nACDBDICTIONARYWDFLT\n  2\nAcDbDictionaryWithDefault\n  3\nObjectDBX Classes\n 90\n0\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nSUN\n  2\nAcDbSun\n  3\nSCENEOE\n 90\n1153\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nVISUALSTYLE\n  2\nAcDbVisualStyle\n  3\nObjectDBX Classes\n 90\n4095\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nMATERIAL\n  2\nAcDbMaterial\n  3\nObjectDBX Classes\n 90\n1153\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nSCALE\n  2\nAcDbScale\n  3\nObjectDBX Classes\n 90\n1153\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nTABLESTYLE\n  2\nAcDbTableStyle\n  3\nObjectDBX Classes\n 90\n4095\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nMLEADERSTYLE\n  2\nAcDbMLeaderStyle\n  3\nACDB_MLEADERSTYLE_CLASS\n 90\n4095\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nDICTIONARYVAR\n  2\nAcDbDictionaryVar\n  3\nObjectDBX Classes\n 90\n0\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nCELLSTYLEMAP\n  2\nAcDbCellStyleMap\n  3\nObjectDBX Classes\n 90\n1152\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nMENTALRAYRENDERSETTINGS\n  2\nAcDbMentalRayRenderSettings\n  3\nSCENEOE\n 90\n1024\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nACDBDETAILVIEWSTYLE\n  2\nAcDbDetailViewStyle\n  3\nObjectDBX Classes\n 90\n1025\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nACDBSECTIONVIEWSTYLE\n  2\nAcDbSectionViewStyle\n  3\nObjectDBX Classes\n 90\n1025\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nRASTERVARIABLES\n  2\nAcDbRasterVariables\n  3\nISM\n 90\n0\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nLAYOUT\n  2\nAcDbLayout\n  3\nObjectDBX Classes\n 90\n0\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nGEODATA\n  2\nAcDbGeoData\n  3\nObjectDBX Classes\n 90\n4095\n 91\n0\n280\n0\n281\n0\n  0\nCLASS\n  1\nACDBPLACEHOLDER\n  2\nAcDbPlaceHolder\n  3\nObjectDBX Classes\n 90\n0\n 91\n0\n280\n0\n281\n0\n  0\nENDSEC\n  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nVPORT\n  5\n8\n330\n0\n100\nAcDbSymbolTable\n 70\n1\n  0\nVPORT\n  5\n23\n330\n8\n100\nAcDbSymbolTableRecord\n100\nAcDbViewportTableRecord\n  2\n*Active\n 70\n0\n 10\n0.0\n 20\n0.0\n 11\n1.0\n 21\n1.0\n 12\n0.0\n 22\n0.0\n 13\n0.0\n 23\n0.0\n 14\n0.5\n 24\n0.5\n 15\n0.5\n 25\n0.5\n 16\n0.0\n 26\n0.0\n 36\n1.0\n 17\n0.0\n 27\n0.0\n 37\n0.0\n 40\n1000.0\n 41\n1.34\n 42\n50.0\n 43\n0.0\n 44\n0.0\n 50\n0.0\n 51\n0.0\n 71\n0\n 72\n1000\n 73\n1\n 74\n3\n 75\n0\n 76\n0\n 77\n0\n 78\n0\n281\n0\n 65\n0\n146\n0.0\n  0\nENDTAB\n  0\nTABLE\n  2\nLTYPE\n  5\n2\n330\n0\n100\nAcDbSymbolTable\n 70\n3\n  0\nLTYPE\n  5\n24\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n  2\nByBlock\n 70\n0\n  3\n\n 72\n65\n 73\n0\n 40\n0.0\n  0\nLTYPE\n  5\n25\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n  2\nByLayer\n 70\n0\n  3\n\n 72\n65\n 73\n0\n 40\n0.0\n  0\nLTYPE\n  5\n26\n330\n2\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n  2\nContinuous\n 70\n0\n  3\n\n 72\n65\n 73\n0\n 40\n0.0\n  0\nENDTAB\n  0\nTABLE\n  2\nLAYER\n  5\n1\n330\n0\n100\nAcDbSymbolTable\n 70\n17\n  0\nLAYER\n  5\n27\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\n0\n 70\n0\n 62\n7\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n28\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nDefpoints\n 70\n0\n 62\n7\n  6\nContinuous\n290\n0\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n2F\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_AS\n 70\n0\n 62\n1\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n30\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_DWARSLIJN\n 70\n0\n 62\n30\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n31\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_STATION_TEKST\n 70\n0\n 62\n30\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n32\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_DWARS_3D\n 70\n0\n 62\n3\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n33\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_MAAIVELD\n 70\n0\n 62\n4\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n34\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_MAAIVELD_B\n 70\n0\n 62\n6\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n35\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_RASTER\n 70\n0\n 62\n8\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n36\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_KADER\n 70\n0\n 62\n7\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n37\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_TEKST\n 70\n0\n 62\n7\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n38\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_HOOGTE\n 70\n0\n 62\n7\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n39\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_AS\n 70\n0\n 62\n1\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n3A\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_NAP\n 70\n0\n 62\n7\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n3B\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_WATER\n 70\n0\n 62\n5\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n3C\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_BGT\n 70\n0\n 62\n1\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nLAYER\n  5\n3D\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n  2\nPV_PROF_BGT_TEKST\n 70\n0\n 62\n1\n  6\nContinuous\n370\n-3\n390\n13\n347\n21\n  0\nENDTAB\n  0\nTABLE\n  2\nSTYLE\n  5\n5\n330\n0\n100\nAcDbSymbolTable\n 70\n1\n  0\nSTYLE\n  5\n29\n330\n5\n100\nAcDbSymbolTableRecord\n100\nAcDbTextStyleTableRecord\n  2\nStandard\n 70\n0\n 40\n0.0\n 41\n1.0\n 50\n0.0\n 71\n0\n 42\n2.5\n  3\narial.ttf\n  4\n\n  0\nENDTAB\n  0\nTABLE\n  2\nVIEW\n  5\n7\n330\n0\n100\nAcDbSymbolTable\n 70\n0\n  0\nENDTAB\n  0\nTABLE\n  2\nUCS\n  5\n6\n330\n0\n100\nAcDbSymbolTable\n 70\n0\n  0\nENDTAB\n  0\nTABLE\n  2\nAPPID\n  5\n3\n330\n0\n100\nAcDbSymbolTable\n 70\n3\n  0\nAPPID\n  5\n2A\n330\n3\n100\nAcDbSymbolTableRecord\n100\nAcDbRegAppTableRecord\n  2\nACAD\n 70\n0\n  0\nAPPID\n  5\n40\n330\n3\n100\nAcDbSymbolTableRecord\n100\nAcDbRegAppTableRecord\n  2\nHATCHBACKGROUNDCOLOR\n 70\n0\n  0\nAPPID\n  5\n41\n330\n3\n100\nAcDbSymbolTableRecord\n100\nAcDbRegAppTableRecord\n  2\nEZDXF\n 70\n0\n  0\nENDTAB\n  0\nTABLE\n  2\nDIMSTYLE\n  5\n4\n330\n0\n100\nAcDbSymbolTable\n 70\n1\n100\nAcDbDimStyleTable\n  0\nDIMSTYLE\n105\n2B\n330\n4\n100\nAcDbSymbolTableRecord\n100\nAcDbDimStyleTableRecord\n  2\nStandard\n 70\n0\n 40\n1.0\n 41\n2.5\n 42\n0.625\n 43\n3.75\n 44\n1.25\n 45\n0.0\n 46\n0.0\n 47\n0.0\n 48\n0.0\n 49\n2.5\n140\n2.5\n141\n2.5\n142\n0.0\n143\n0.03937007874\n144\n1.0\n145\n0.0\n146\n1.0\n147\n0.625\n148\n0.0\n 69\n0\n 70\n0\n 71\n0\n 72\n0\n 73\n0\n 74\n0\n 75\n0\n 76\n0\n 77\n1\n 78\n8\n 79\n3\n170\n0\n171\n3\n172\n1\n173\n0\n174\n0\n175\n0\n176\n0\n177\n0\n178\n0\n179\n2\n271\n2\n272\n2\n273\n2\n274\n3\n275\n0\n276\n0\n277\n2\n278\n44\n279\n0\n280\n0\n281\n0\n282\n0\n283\n0\n284\n8\n285\n0\n286\n0\n288\n0\n289\n3\n290\n0\n371\n-2\n372\n-2\n  0\nENDTAB\n  0\nTABLE\n  2\nBLOCK_RECORD\n  5\n9\n330\n0\n100\nAcDbSymbolTable\n 70\n2\n  0\nBLOCK_RECORD\n  5\n17\n102\n{ACAD_XDICTIONARY\n360\n3E\n102\n}\n330\n9\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n  2\n*Model_Space\n340\n1A\n 70\n0\n280\n1\n281\n0\n  0\nBLOCK_RECORD\n  5\n1B\n330\n9\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n  2\n*Paper_Space\n340\n1E\n 70\n0\n280\n1\n281\n0\n  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nBLOCKS\n  0\nBLOCK\n  5\n18\n330\n17\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockBegin\n  2\n*Model_Space\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\n*Model_Space\n  1\n\n  0\nENDBLK\n  5\n19\n330\n17\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockEnd\n  0\nBLOCK\n  5\n1C\n330\n1B\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockBegin\n  2\n*Paper_Space\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\n*Paper_Space\n  1\n\n  0\nENDBLK\n  5\n1D\n330\n1B\n100\nAcDbEntity\n  8\n0\n100\nAcDbBlockEnd\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n";
  const DXF_STAART = "  0\nENDSEC\n  0\nSECTION\n  2\nOBJECTS\n  0\nDICTIONARY\n  5\nA\n330\n0\n100\nAcDbDictionary\n281\n1\n  3\nACAD_COLOR\n350\nB\n  3\nACAD_GROUP\n350\nC\n  3\nACAD_LAYOUT\n350\nD\n  3\nACAD_MATERIAL\n350\nE\n  3\nACAD_MLEADERSTYLE\n350\nF\n  3\nACAD_MLINESTYLE\n350\n10\n  3\nACAD_PLOTSETTINGS\n350\n11\n  3\nACAD_PLOTSTYLENAME\n350\n12\n  3\nACAD_SCALELIST\n350\n14\n  3\nACAD_TABLESTYLE\n350\n15\n  3\nACAD_VISUALSTYLE\n350\n16\n  3\nEZDXF_META\n350\n2D\n  0\nDICTIONARY\n  5\nB\n330\nA\n100\nAcDbDictionary\n281\n1\n  0\nDICTIONARY\n  5\nC\n330\nA\n100\nAcDbDictionary\n281\n1\n  0\nDICTIONARY\n  5\nD\n330\nA\n100\nAcDbDictionary\n281\n1\n  3\nModel\n350\n1A\n  3\nLayout1\n350\n1E\n  0\nDICTIONARY\n  5\nE\n330\nA\n100\nAcDbDictionary\n281\n1\n  3\nByBlock\n350\n1F\n  3\nByLayer\n350\n20\n  3\nGlobal\n350\n21\n  0\nDICTIONARY\n  5\nF\n330\nA\n100\nAcDbDictionary\n281\n1\n  3\nStandard\n350\n2C\n  0\nDICTIONARY\n  5\n10\n330\nA\n100\nAcDbDictionary\n281\n1\n  3\nStandard\n350\n22\n  0\nDICTIONARY\n  5\n11\n330\nA\n100\nAcDbDictionary\n281\n1\n  0\nACDBDICTIONARYWDFLT\n  5\n12\n330\nA\n100\nAcDbDictionary\n281\n1\n  3\nNormal\n350\n13\n100\nAcDbDictionaryWithDefault\n340\n13\n  0\nACDBPLACEHOLDER\n  5\n13\n330\n12\n  0\nDICTIONARY\n  5\n14\n330\nA\n100\nAcDbDictionary\n281\n1\n  0\nDICTIONARY\n  5\n15\n330\nA\n100\nAcDbDictionary\n281\n1\n  0\nDICTIONARY\n  5\n16\n330\nA\n100\nAcDbDictionary\n281\n1\n  0\nLAYOUT\n  5\n1A\n330\nD\n100\nAcDbPlotSettings\n  1\n\n  4\nA3\n  6\n\n 40\n7.5\n 41\n20.0\n 42\n7.5\n 43\n20.0\n 44\n420.0\n 45\n297.0\n 46\n0.0\n 47\n0.0\n 48\n0.0\n 49\n0.0\n140\n0.0\n141\n0.0\n142\n1.0\n143\n1.0\n 70\n1024\n 72\n1\n 73\n0\n 74\n5\n  7\n\n 75\n16\n 76\n0\n 77\n2\n 78\n300\n147\n1.0\n148\n0.0\n149\n0.0\n100\nAcDbLayout\n  1\nModel\n 70\n1\n 71\n0\n 10\n0.0\n 20\n0.0\n 11\n420.0\n 21\n297.0\n 12\n0.0\n 22\n0.0\n 32\n0.0\n 14\n1e+20\n 24\n1e+20\n 34\n1e+20\n 15\n-1e+20\n 25\n-1e+20\n 35\n-1e+20\n146\n0.0\n 13\n0.0\n 23\n0.0\n 33\n0.0\n 16\n1.0\n 26\n0.0\n 36\n0.0\n 17\n0.0\n 27\n1.0\n 37\n0.0\n 76\n1\n330\n17\n  0\nLAYOUT\n  5\n1E\n330\nD\n100\nAcDbPlotSettings\n  1\n\n  4\nA3\n  6\n\n 40\n7.5\n 41\n20.0\n 42\n7.5\n 43\n20.0\n 44\n420.0\n 45\n297.0\n 46\n0.0\n 47\n0.0\n 48\n0.0\n 49\n0.0\n140\n0.0\n141\n0.0\n142\n1.0\n143\n1.0\n 70\n0\n 72\n1\n 73\n0\n 74\n5\n  7\n\n 75\n16\n 76\n0\n 77\n2\n 78\n300\n147\n1.0\n148\n0.0\n149\n0.0\n100\nAcDbLayout\n  1\nLayout1\n 70\n1\n 71\n1\n 10\n0.0\n 20\n0.0\n 11\n420.0\n 21\n297.0\n 12\n0.0\n 22\n0.0\n 32\n0.0\n 14\n1e+20\n 24\n1e+20\n 34\n1e+20\n 15\n-1e+20\n 25\n-1e+20\n 35\n-1e+20\n146\n0.0\n 13\n0.0\n 23\n0.0\n 33\n0.0\n 16\n1.0\n 26\n0.0\n 36\n0.0\n 17\n0.0\n 27\n1.0\n 37\n0.0\n 76\n1\n330\n1B\n  0\nMATERIAL\n  5\n1F\n102\n{ACAD_REACTORS\n330\nE\n102\n}\n330\nE\n100\nAcDbMaterial\n  1\nByBlock\n  2\n\n 70\n0\n 40\n1.0\n 71\n1\n 41\n1.0\n 91\n-1023410177\n 42\n1.0\n 72\n1\n  3\n\n 73\n1\n 74\n1\n 75\n1\n 44\n0.5\n 73\n0\n 45\n1.0\n 46\n1.0\n 77\n1\n  4\n\n 78\n1\n 79\n1\n170\n1\n 48\n1.0\n171\n1\n  6\n\n172\n1\n173\n1\n174\n1\n140\n1.0\n141\n1.0\n175\n1\n  7\n\n176\n1\n177\n1\n178\n1\n143\n1.0\n179\n1\n  8\n\n270\n1\n271\n1\n272\n1\n145\n1.0\n146\n1.0\n273\n1\n  9\n\n274\n1\n275\n1\n276\n1\n 42\n1.0\n 72\n1\n  3\n\n 73\n1\n 74\n1\n 75\n1\n 94\n63\n  0\nMATERIAL\n  5\n20\n102\n{ACAD_REACTORS\n330\nE\n102\n}\n330\nE\n100\nAcDbMaterial\n  1\nByLayer\n  2\n\n 70\n0\n 40\n1.0\n 71\n1\n 41\n1.0\n 91\n-1023410177\n 42\n1.0\n 72\n1\n  3\n\n 73\n1\n 74\n1\n 75\n1\n 44\n0.5\n 73\n0\n 45\n1.0\n 46\n1.0\n 77\n1\n  4\n\n 78\n1\n 79\n1\n170\n1\n 48\n1.0\n171\n1\n  6\n\n172\n1\n173\n1\n174\n1\n140\n1.0\n141\n1.0\n175\n1\n  7\n\n176\n1\n177\n1\n178\n1\n143\n1.0\n179\n1\n  8\n\n270\n1\n271\n1\n272\n1\n145\n1.0\n146\n1.0\n273\n1\n  9\n\n274\n1\n275\n1\n276\n1\n 42\n1.0\n 72\n1\n  3\n\n 73\n1\n 74\n1\n 75\n1\n 94\n63\n  0\nMATERIAL\n  5\n21\n102\n{ACAD_REACTORS\n330\nE\n102\n}\n330\nE\n100\nAcDbMaterial\n  1\nGlobal\n  2\n\n 70\n0\n 40\n1.0\n 71\n1\n 41\n1.0\n 91\n-1023410177\n 42\n1.0\n 72\n1\n  3\n\n 73\n1\n 74\n1\n 75\n1\n 44\n0.5\n 73\n0\n 45\n1.0\n 46\n1.0\n 77\n1\n  4\n\n 78\n1\n 79\n1\n170\n1\n 48\n1.0\n171\n1\n  6\n\n172\n1\n173\n1\n174\n1\n140\n1.0\n141\n1.0\n175\n1\n  7\n\n176\n1\n177\n1\n178\n1\n143\n1.0\n179\n1\n  8\n\n270\n1\n271\n1\n272\n1\n145\n1.0\n146\n1.0\n273\n1\n  9\n\n274\n1\n275\n1\n276\n1\n 42\n1.0\n 72\n1\n  3\n\n 73\n1\n 74\n1\n 75\n1\n 94\n63\n  0\nMLINESTYLE\n  5\n22\n102\n{ACAD_REACTORS\n330\n10\n102\n}\n330\n10\n100\nAcDbMlineStyle\n  2\nStandard\n 70\n0\n  3\n\n 62\n256\n 51\n90.0\n 52\n90.0\n 71\n2\n 49\n0.5\n 62\n256\n  6\nBYLAYER\n 49\n-0.5\n 62\n256\n  6\nBYLAYER\n  0\nMLEADERSTYLE\n  5\n2C\n102\n{ACAD_REACTORS\n330\nF\n102\n}\n330\nF\n100\nAcDbMLeaderStyle\n179\n2\n170\n2\n171\n1\n172\n0\n 90\n2\n 40\n0.0\n 41\n0.0\n173\n1\n 91\n-1056964608\n 92\n-2\n290\n1\n 42\n2.0\n291\n1\n 43\n8.0\n  3\nStandard\n 44\n4.0\n300\n\n342\n29\n174\n1\n175\n1\n176\n0\n178\n1\n 93\n-1056964608\n 45\n4.0\n292\n0\n297\n0\n 46\n4.0\n 94\n-1056964608\n 47\n1.0\n 49\n1.0\n140\n1.0\n294\n1\n141\n0.0\n177\n0\n142\n1.0\n295\n0\n296\n0\n143\n3.75\n271\n0\n272\n9\n273\n9\n  0\nDICTIONARY\n  5\n2D\n330\nA\n100\nAcDbDictionary\n280\n1\n281\n1\n  3\nCREATED_BY_EZDXF\n350\n2E\n  3\nWRITTEN_BY_EZDXF\n350\n42\n  0\nDICTIONARYVAR\n  5\n2E\n330\n2D\n100\nDictionaryVariables\n280\n0\n  1\n1.4.5 @ 2026-10-23T09:19:19.318389+00:00\n  0\nDICTIONARY\n  5\n3E\n330\n17\n100\nAcDbDictionary\n280\n1\n281\n1\n  3\nACAD_GEOGRAPHICDATA\n350\n3F\n  0\nGEODATA\n  5\n3F\n102\n{ACAD_REACTORS\n330\n3E\n102\n}\n330\n3E\n100\nAcDbGeoData\n 90\n2\n330\n17\n 70\n2\n 10\n155000.0\n 20\n463000.0\n 30\n0.0\n 11\n155000.0\n 21\n463000.0\n 31\n0.0\n 40\n1.0\n 91\n6\n 41\n1.0\n 92\n6\n210\n0.0\n220\n0.0\n230\n1.0\n 12\n0.0\n 22\n1.0\n 95\n1\n141\n1.0\n294\n0\n142\n0.0\n143\n0.0\n303\n<?xml version=\"1.0\" encoding=\"UTF-16\" standalone=\"no\" ?>^J<Dictionary version=\"1.0\" xmlns=\"http://www.osgeo.org/mapguide/coordinatesystem\">^J^J<ProjectedCoordinateSystem id=\"Netherlands-RDNew\">^J<Name>Netherlands-RDNew</Name>^J<AdditionalInformation>^J<Pa\n303\nrameterItem type=\"CsMap\">^J<Key>CSQuadrantSimplified</Key>^J<IntegerValue>1</IntegerValue>^J</ParameterItem>^J</AdditionalInformation>^J<DomainOfValidity>^J<Extent>^J<GeographicElement>^J<GeographicBoundingBox>^J<WestBoundLongitude>3.2</WestBoundLongitude\n303\n>^J<EastBoundLongitude>7.22</EastBoundLongitude>^J<SouthBoundLatitude>50.75</SouthBoundLatitude>^J<NorthBoundLatitude>53.7</NorthBoundLatitude>^J</GeographicBoundingBox>^J</GeographicElement>^J</Extent>^J</DomainOfValidity>^J<DatumId>Amersfoort</DatumId>\n303\n^J<Axis uom=\"Meter\">^J<CoordinateSystemAxis>^J<AxisOrder>1</AxisOrder>^J<AxisName>Easting</AxisName>^J<AxisAbbreviation>E</AxisAbbreviation>^J<AxisDirection>East</AxisDirection>^J</CoordinateSystemAxis>^J<CoordinateSystemAxis>^J<AxisOrder>2</AxisOrder>^J<\n303\nAxisName>Northing</AxisName>^J<AxisAbbreviation>N</AxisAbbreviation>^J<AxisDirection>North</AxisDirection>^J</CoordinateSystemAxis>^J</Axis>^J<Conversion>^J<Projection>^J<OperationMethodId>Oblique Stereographic</OperationMethodId>^J<ParameterValue><Operat\n303\nionParameterId>Latitude of natural origin</OperationParameterId><Value uom=\"degree\">52.1561605555556</Value></ParameterValue>^J<ParameterValue><OperationParameterId>Longitude of natural origin</OperationParameterId><Value uom=\"degree\">5.38763888888889</Va\n303\nlue></ParameterValue>^J<ParameterValue><OperationParameterId>Scale factor at natural origin</OperationParameterId><Value uom=\"unity\">0.9999079</Value></ParameterValue>^J<ParameterValue><OperationParameterId>False easting</OperationParameterId><Value uom=\"\n303\nMeter\">155000</Value></ParameterValue>^J<ParameterValue><OperationParameterId>False northing</OperationParameterId><Value uom=\"Meter\">463000</Value></ParameterValue>^J</Projection>^J</Conversion>^J</ProjectedCoordinateSystem>^J<Alias id=\"28992\" type=\"Coor\n303\ndinateSystem\">^J<ObjectId>Netherlands-RDNew</ObjectId>^J<Namespace>EPSG Code</Namespace>^J</Alias>^J^J<GeodeticDatum id=\"Amersfoort\">^J<Name>Amersfoort</Name>^J<PrimeMeridianId>Greenwich</PrimeMeridianId>^J<EllipsoidId>BESSEL</EllipsoidId>^J</GeodeticDatu\n303\nm>^J<Alias id=\"6289\" type=\"Datum\">^J<ObjectId>Amersfoort</ObjectId>^J<Namespace>EPSG Code</Namespace>^J</Alias>^J^J<Ellipsoid id=\"BESSEL\">^J<Name>BESSEL</Name>^J<SemiMajorAxis uom=\"meter\">6377397.155</SemiMajorAxis>^J<SecondDefiningParameter>^J<SemiMinorA\n301\nxis uom=\"meter\">6356078.96281819</SemiMinorAxis>^J</SecondDefiningParameter>^J</Ellipsoid>^J<Alias id=\"7004\" type=\"Ellipsoid\">^J<ObjectId>BESSEL</ObjectId>^J<Namespace>EPSG Code</Namespace>^J</Alias>^J^J^J</Dictionary>^J\n 93\n0\n 96\n0\n  0\nDICTIONARYVAR\n  5\n42\n330\n2D\n100\nDictionaryVariables\n280\n0\n  1\n1.4.5 @ 2026-10-23T09:19:19.320462+00:00\n  0\nENDSEC\n  0\nEOF\n";
  class DxfSchrijver {
    constructor() {
      this.e = []; this.h = 0x200;   // handles boven die van het sjabloon
      this.min = [Infinity, Infinity, Infinity]; this.max = [-Infinity, -Infinity, -Infinity];
      this.doel = { buf: this.e, eigenaar: '17', papier: false };
      this.layouts = [];            // { naam, W, H, buf, br, lay, vp }
      this.extraLagen = new Map();  // naam → { kleur (ACI), plot }
      this.lijnTypen = new Map();   // patroon → naam
      this.vpId = 2;
    }
    static g(c, v) {
      const code = String(c).padStart(3, ' ');
      if (typeof v !== 'number') return `${code}\n${v}\n`;
      const geheel = (c >= 60 && c < 100) || (c >= 280 && c < 290) || (c >= 370 && c < 390) || (c >= 420 && c < 460) || (c >= 90 && c < 100);
      return `${code}\n${geheel ? Math.round(v) : (Number.isFinite(v) ? +v.toFixed(5) : 0)}\n`;
    }
    static tekst(t) { return String(t).replace(/[\x00-\x1F]/g, ' '); }   // 2010-DXF = UTF-8
    handle() { return (this.h++).toString(16).toUpperCase(); }
    kop(type, laag, eigenaar = this.doel.eigenaar) {
      const g = DxfSchrijver.g, h = this.handle();
      return { h, s: g(0, type) + g(5, h) + g(330, eigenaar) + g(100, 'AcDbEntity') + (this.doel.papier ? g(67, 1) : '') + g(8, laag) };
    }
    /** Kleur (true color), lijndikte en doorzichtigheid achter de laag. */
    static stijl(st) {
      if (!st) return '';
      const g = DxfSchrijver.g;
      let s = '';
      if (st.lt) s += g(6, st.lt);
      if (st.lw != null) s += g(370, st.lw);
      if (st.rgb) s += g(420, (st.rgb[0] << 16) + (st.rgb[1] << 8) + st.rgb[2]);
      if (st.alpha != null && st.alpha < 0.999) s += g(440, 0x02000000 + Math.max(0, Math.min(255, Math.round(st.alpha * 255))));
      return s;
    }
    static lijndikte(mm) {
      const w = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
      const d = mm * 100;
      let beste = w[0]; for (const v of w) if (Math.abs(v - d) < Math.abs(beste - d)) beste = v;
      return beste;
    }
    /** Lijntype voor een streeppatroon (lengtes in tekeningeenheden: streep, gat, streep, …). */
    lijnType(patroon) {
      const p = patroon.map(v => Math.max(1e-4, +v.toFixed(4)));
      if (p.length % 2) p.push(...p);   // oneven patroon: herhalen (zoals SVG/canvas)
      const k = p.join(',');
      if (!this.lijnTypen.has(k)) this.lijnTypen.set(k, `PV_STREEP_${this.lijnTypen.size + 1}`);
      return this.lijnTypen.get(k);
    }
    laag(naam, kleur = 7, plot = true) { if (!this.extraLagen.has(naam)) this.extraLagen.set(naam, { kleur, plot }); return naam; }
    groei(x, y, z = 0) {
      if (this.doel.papier) return;
      if (x < this.min[0]) this.min[0] = x; if (y < this.min[1]) this.min[1] = y; if (z < this.min[2]) this.min[2] = z;
      if (x > this.max[0]) this.max[0] = x; if (y > this.max[1]) this.max[1] = y; if (z > this.max[2]) this.max[2] = z;
    }
    lijn(laag, x1, y1, x2, y2, z1 = 0, z2 = 0, st = null) {
      const g = DxfSchrijver.g, k = this.kop('LINE', laag);
      this.groei(x1, y1, z1); this.groei(x2, y2, z2);
      this.doel.buf.push(k.s + DxfSchrijver.stijl(st) + g(100, 'AcDbLine') + g(10, x1) + g(20, y1) + g(30, z1) + g(11, x2) + g(21, y2) + g(31, z2));
    }
    polylijn(laag, punten, drieD = false, gesloten = false, st = null) {
      if (punten.length < 2) return;
      const g = DxfSchrijver.g;
      if (!drieD) {   // 2D: LWPOLYLINE
        const k = this.kop('LWPOLYLINE', laag);
        let s = k.s + DxfSchrijver.stijl(st) + g(100, 'AcDbPolyline') + g(90, punten.length) + g(70, (gesloten ? 1 : 0) + (st?.lt ? 128 : 0));
        for (const p of punten) { s += g(10, p[0]) + g(20, p[1]); this.groei(p[0], p[1]); }
        this.doel.buf.push(s);
        return;
      }
      const k = this.kop('POLYLINE', laag);   // 3D-polylijn
      let s = k.s + DxfSchrijver.stijl(st) + g(100, 'AcDb3dPolyline') + g(66, 1) + g(10, 0) + g(20, 0) + g(30, 0) + g(70, 8 + (gesloten ? 1 : 0));
      for (const p of punten) {
        const v = this.kop('VERTEX', laag, k.h);
        s += v.s + g(100, 'AcDbVertex') + g(100, 'AcDb3dPolylineVertex') + g(10, p[0]) + g(20, p[1]) + g(30, p[2] ?? 0) + g(70, 32);
        this.groei(p[0], p[1], p[2] ?? 0);
      }
      s += this.kop('SEQEND', laag, k.h).s;
      this.doel.buf.push(s);
    }
    tekst(laag, x, y, hoogte, t, { draai = 0, h = 0, v = 0, st = null, stijl = null } = {}) {   // h: 0 links 1 midden 2 rechts; v: 0 basislijn 1 onder 2 midden 3 boven
      const g = DxfSchrijver.g, k = this.kop('TEXT', laag);
      this.groei(x, y);
      let s = k.s + DxfSchrijver.stijl(st) + g(100, 'AcDbText') + g(10, x) + g(20, y) + g(30, 0) + g(40, hoogte) + g(1, DxfSchrijver.tekst(t)) + g(50, draai);
      if (stijl) s += g(7, stijl);
      if (h || v) s += g(72, h) + g(11, x) + g(21, y) + g(31, 0);
      s += g(100, 'AcDbText');
      if (v) s += g(73, v);
      this.doel.buf.push(s);
    }
    /** Gevuld vlak (HATCH, effen of arcering ANSI31). */
    vlak(laag, punten, st = null, patroon = null) {
      // één omtrek ([[x,y],…]) of meerdere ([[[x,y],…], …]) in één arcering
      const lussen = (Array.isArray(punten[0]?.[0]) ? punten : [punten]).filter(l => l.length >= 3);
      if (!lussen.length) return;
      const g = DxfSchrijver.g, k = this.kop('HATCH', laag);
      let s = k.s + DxfSchrijver.stijl(st) + g(100, 'AcDbHatch') + g(10, 0) + g(20, 0) + g(30, 0) + g(210, 0) + g(220, 0) + g(230, 1)
        + g(2, patroon ? 'ANSI31' : 'SOLID') + g(70, patroon ? 0 : 1) + g(71, 0) + g(91, lussen.length);
      for (const l of lussen) {
        s += g(92, 3) + g(72, 0) + g(73, 1) + g(93, l.length);
        for (const p of l) { s += g(10, p[0]) + g(20, p[1]); this.groei(p[0], p[1]); }
        s += g(97, 0);
      }
      s += g(75, 1) + g(76, 1);
      if (patroon) {
        const sc = patroon.schaal || 1, d = 3.175 * sc;
        s += g(52, 0) + g(41, sc) + g(77, 0) + g(78, 1) + g(53, 45) + g(43, 0) + g(44, 0) + g(45, -d * Math.SQRT1_2) + g(46, d * Math.SQRT1_2) + g(79, 0);
      }
      s += g(98, 0);
      this.doel.buf.push(s);
    }
    cirkel(laag, x, y, r, st = null) {
      const g = DxfSchrijver.g, k = this.kop('CIRCLE', laag);
      this.groei(x - r, y - r); this.groei(x + r, y + r);
      this.doel.buf.push(k.s + DxfSchrijver.stijl(st) + g(100, 'AcDbCircle') + g(10, x) + g(20, y) + g(30, 0) + g(40, r));
    }
    /** Nieuwe layout (blad) op W × H mm; volgende entiteiten gaan naar dit blad. */
    nieuweLayout(naam, W, H) {
      const eerste = !this.layouts.length;
      const lay = { naam, W, H, buf: [], br: eerste ? '1B' : this.handle(), lh: eerste ? '1E' : this.handle(), eerste };
      this.layouts.push(lay);
      this.naarLayout(lay);
      // hoofdviewport (verplicht in elke layout)
      lay.vp = this.viewport(W / 2, H / 2, W * 1.1, H * 1.1, W / 2, H / 2, H * 1.1, { hoofd: true });
      return lay;
    }
    naarLayout(lay) { this.doel = { buf: lay.buf, eigenaar: lay.br, papier: true }; }
    naarModel() { this.doel = { buf: this.e, eigenaar: '17', papier: false }; }
    /** Viewport in de huidige layout: (cx, cy, b, h) op papier (mm), kijkend naar model (mx, my) met kijkhoogte vh. */
    viewport(cx, cy, b, h, mx, my, vh, { hoofd = false, draai = 0 } = {}) {
      const g = DxfSchrijver.g, k = this.kop('VIEWPORT', hoofd ? '0' : this.laag('PV_BLAD_VIEWPORT', 8, false));
      const id = hoofd ? 1 : this.vpId++;
      this.doel.buf.push(k.s + g(100, 'AcDbViewport') + g(10, cx) + g(20, cy) + g(30, 0) + g(40, b) + g(41, h) + g(68, hoofd ? 1 : 2) + g(69, id)
        + g(12, mx) + g(22, my) + g(13, 0) + g(23, 0) + g(14, 10) + g(24, 10) + g(15, 10) + g(25, 10) + g(16, 0) + g(26, 0) + g(36, 1) + g(17, 0) + g(27, 0) + g(37, 0)
        + g(42, 50) + g(43, 0) + g(44, 0) + g(45, vh) + g(50, 0) + g(51, draai) + g(72, 100) + g(90, hoofd ? 557088 : 16384) + g(1, '') + g(281, 0) + g(71, 0) + g(74, 0)
        + g(110, 0) + g(120, 0) + g(130, 0) + g(111, 1) + g(121, 0) + g(131, 0) + g(112, 0) + g(122, 1) + g(132, 0) + g(79, 0) + g(146, 0) + g(282, 0));
      return k.h;
    }
    static mediaNaam(W, H) {
      const iso = { '1189x841': 'A0', '841x1189': 'A0', '841x594': 'A1', '594x841': 'A1', '594x420': 'A2', '420x594': 'A2', '420x297': 'A3', '297x420': 'A3', '297x210': 'A4', '210x297': 'A4' }[`${Math.round(W)}x${Math.round(H)}`];
      return `ISO_full_bleed_${iso || 'A3'}_(${W.toFixed(2)}_x_${H.toFixed(2)}_MM)`;
    }
    layoutObject(lay, volgorde) {
      const g = DxfSchrijver.g;
      return g(0, 'LAYOUT') + g(5, lay.lh) + g(330, 'D') + g(100, 'AcDbPlotSettings') + g(1, '') + g(2, 'DWG To PDF.pc3') + g(4, DxfSchrijver.mediaNaam(lay.W, lay.H)) + g(6, '')
        + g(40, 0) + g(41, 0) + g(42, 0) + g(43, 0) + g(44, lay.W) + g(45, lay.H) + g(46, 0) + g(47, 0) + g(48, 0) + g(49, 0) + g(140, 0) + g(141, 0) + g(142, 1) + g(143, 1)
        + g(70, 672) + g(72, 1) + g(73, 0) + g(74, 5) + g(7, '') + g(75, 16) + g(76, 0) + g(77, 2) + g(78, 300) + g(147, 1) + g(148, 0) + g(149, 0)
        + g(100, 'AcDbLayout') + g(1, lay.naam) + g(70, 1) + g(71, volgorde) + g(10, 0) + g(20, 0) + g(11, lay.W) + g(21, lay.H) + g(12, 0) + g(22, 0) + g(32, 0)
        + g(14, 1e20) + g(24, 1e20) + g(34, 1e20) + g(15, -1e20) + g(25, -1e20) + g(35, -1e20) + g(146, 0) + g(13, 0) + g(23, 0) + g(33, 0)
        + g(16, 1) + g(26, 0) + g(36, 0) + g(17, 0) + g(27, 1) + g(37, 0) + g(76, 1) + g(330, lay.br) + g(331, lay.vp);
    }
    bestand() {
      const f = (v) => (Number.isFinite(v) ? +v.toFixed(4) : 0);
      const g = DxfSchrijver.g;
      let kop = DXF_KOP;
      // extra lagen
      if (this.extraLagen.size) {
        let rec = '';
        for (const [naam, l] of this.extraLagen) {
          rec += g(0, 'LAYER') + g(5, this.handle()) + g(330, '1') + g(100, 'AcDbSymbolTableRecord') + g(100, 'AcDbLayerTableRecord') + g(2, naam) + g(70, 0) + g(62, l.kleur) + g(6, 'Continuous')
            + (l.plot ? '' : g(290, 0)) + g(370, -3) + g(390, '13') + g(347, '21');
        }
        kop = kop.replace('LAYER\n  5\n1\n330\n0\n100\nAcDbSymbolTable\n 70\n17\n', `LAYER\n  5\n1\n330\n0\n100\nAcDbSymbolTable\n 70\n${17 + this.extraLagen.size}\n`)
          .replace('  0\nENDTAB\n  0\nTABLE\n  2\nSTYLE', rec + '  0\nENDTAB\n  0\nTABLE\n  2\nSTYLE');
      }
      // lijntypen voor streeplijnen
      if (this.lijnTypen.size) {
        let rec = '';
        for (const [k, naam] of this.lijnTypen) {
          const p = k.split(',').map(Number), tot = p.reduce((a, b) => a + b, 0);
          rec += g(0, 'LTYPE') + g(5, this.handle()) + g(330, '2') + g(100, 'AcDbSymbolTableRecord') + g(100, 'AcDbLinetypeTableRecord') + g(2, naam) + g(70, 0) + g(3, 'Profielviewer streep') + g(72, 65) + g(73, p.length) + g(40, tot)
            + p.map((v, i) => g(49, i % 2 ? -v : v) + g(74, 0)).join('');
        }
        kop = kop.replace('LTYPE\n  5\n2\n330\n0\n100\nAcDbSymbolTable\n 70\n3\n', `LTYPE\n  5\n2\n330\n0\n100\nAcDbSymbolTable\n 70\n${3 + this.lijnTypen.size}\n`)
          .replace('  0\nENDTAB\n  0\nTABLE\n  2\nLAYER', rec + '  0\nENDTAB\n  0\nTABLE\n  2\nLAYER');
      }
      // streeplijnen in model space op tekeningeenheden (niet geschaald per viewport)
      kop = kop.replace('$PSLTSCALE\n 70\n1\n', '$PSLTSCALE\n 70\n0\n');
      // tekststijl voor vet
      kop = kop.replace('STYLE\n  5\n5\n330\n0\n100\nAcDbSymbolTable\n 70\n1\n', 'STYLE\n  5\n5\n330\n0\n100\nAcDbSymbolTable\n 70\n2\n')
        .replace('  0\nENDTAB\n  0\nTABLE\n  2\nVIEW', g(0, 'STYLE') + g(5, this.handle()) + g(330, '5') + g(100, 'AcDbSymbolTableRecord') + g(100, 'AcDbTextStyleTableRecord')
          + g(2, 'PV_Vet') + g(70, 0) + g(40, 0) + g(41, 1) + g(50, 0) + g(71, 0) + g(42, 2.5) + g(3, 'arialbd.ttf') + g(4, '') + '  0\nENDTAB\n  0\nTABLE\n  2\nVIEW');
      // layouts: blokdefinities en -records voor de bladen na de eerste
      const overig = this.layouts.filter(l => !l.eerste);
      if (overig.length) {
        let br = '', bl = '';
        overig.forEach((l, i) => {
          const naam = `*Paper_Space${i}`;
          br += g(0, 'BLOCK_RECORD') + g(5, l.br) + g(330, '9') + g(100, 'AcDbSymbolTableRecord') + g(100, 'AcDbBlockTableRecord') + g(2, naam) + g(340, l.lh) + g(70, 0) + g(280, 1) + g(281, 0);
          bl += g(0, 'BLOCK') + g(5, this.handle()) + g(330, l.br) + g(100, 'AcDbEntity') + g(8, '0') + g(100, 'AcDbBlockBegin') + g(2, naam) + g(70, 0) + g(10, 0) + g(20, 0) + g(30, 0) + g(3, naam) + g(1, '')
            + l.buf.join('')
            + g(0, 'ENDBLK') + g(5, this.handle()) + g(330, l.br) + g(100, 'AcDbEntity') + g(8, '0') + g(100, 'AcDbBlockEnd');
        });
        kop = kop.replace('BLOCK_RECORD\n  5\n9\n330\n0\n100\nAcDbSymbolTable\n 70\n2\n', `BLOCK_RECORD\n  5\n9\n330\n0\n100\nAcDbSymbolTable\n 70\n${2 + overig.length}\n`)
          .replace('  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nBLOCKS', br + '  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nBLOCKS')
          .replace('  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n', bl + '  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n');
      }
      let staart = DXF_STAART;
      if (this.layouts.length) {
        const entries = this.layouts.map(l => g(3, l.naam) + g(350, l.lh)).join('');
        staart = staart.replace('  3\nLayout1\n350\n1E\n', entries);
        const a = staart.indexOf('  0\nLAYOUT\n  5\n1E\n'), b = staart.indexOf('  0\nMATERIAL\n  5\n1F\n');
        staart = staart.slice(0, a) + this.layouts.map((l, i) => this.layoutObject(l, i + 1)).join('') + staart.slice(b);
      }
      kop = kop
        .replace('{XMIN}', f(this.min[0])).replace('{YMIN}', f(this.min[1])).replace('{ZMIN}', f(this.min[2]))
        .replace('{XMAX}', f(this.max[0])).replace('{YMAX}', f(this.max[1])).replace('{ZMAX}', f(this.max[2]))
        .replace('{HANDSEED}', this.h.toString(16).toUpperCase());
      const eerste = this.layouts.find(l => l.eerste);
      return new Blob([new TextEncoder().encode(kop + this.e.join('') + (eerste ? eerste.buf.join('') : '') + staart)], { type: 'application/dxf' });
    }
  }

  /** Bouwt de DXF voor de actieve as. Geeft {blob, aantal} terug. */
  /* ────────────────────────────────────────────────────────────────
     DXF met dezelfde bladen als de PDF.
     De PDF-routine tekent elk blad via een "document" (jsPDF-achtig). In
     DXF-stand krijgt hij een opnemend document (DxfBladDoc): alle lijnen,
     vlakken en teksten van kader, stempel, legenda, tabellen en kopjes
     worden lijnwerk in een layout (paper space, mm). Waar de PDF een beeld
     plakt (grafiek, bovenaanzicht, dekkingskaart) wordt het beeld in
     vectorvorm vastgelegd:
     - grafieken (SVG) en dekkingskaart (canvas) → lijnwerk in model space op
       ware grootte (1 eenheid = 1 m, hoogte × overdrijving), met in het blad
       een viewport op de schaal van de PDF;
     - bovenaanzicht (canvas) → lijnwerk op RD-coördinaten in model space,
       viewport op de kaartschaal. Puntenwolk en luchtfoto blijven weg (die
       hangt Civil 3D er zelf achter).
     ──────────────────────────────────────────────────────────────── */
  const DXF_KLEUR = (() => {
    let c = null;
    return (css) => {
      if (css == null) return null;
      if (typeof css === 'object') return css.dxfPatroon || (typeof CanvasPattern !== 'undefined' && css instanceof CanvasPattern) ? { patroon: true, rgb: [60, 70, 90], a: 1 } : null;
      const s = String(css).trim();
      if (!s || s === 'none' || s === 'transparent') return null;
      if (/^url\(/.test(s)) return { patroon: true, rgb: [198, 71, 43], a: 1 };
      if (!c) c = document.createElement('canvas').getContext('2d');
      c.fillStyle = '#010203'; c.fillStyle = s;
      const v = c.fillStyle;
      let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
      if (m) return { rgb: [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)], a: 1 };
      m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\)/i.exec(v);
      if (m) { const a = m[4] === undefined ? 1 : +m[4]; return a <= 0.001 ? null : { rgb: [+m[1], +m[2], +m[3]].map(Math.round), a }; }
      return null;
    };
  })();
  const isWit = (k) => k && k.rgb && k.rgb[0] > 243 && k.rgb[1] > 243 && k.rgb[2] > 243;
  /** Boog als punten (canvas-hoeken: y omlaag, met de klok mee positief). */
  function boogPunten(cx, cy, rx, ry, a0, a1, tegen = false, rot = 0) {
    let d = a1 - a0;
    if (!tegen && d < 0) d += Math.PI * 2 * Math.ceil(-d / (Math.PI * 2));
    if (tegen && d > 0) d -= Math.PI * 2 * Math.ceil(d / (Math.PI * 2));
    if (Math.abs(d) > Math.PI * 2) d = Math.sign(d) * Math.PI * 2;
    const n = Math.max(4, Math.ceil(Math.abs(d) / (Math.PI / 16)));
    const cr = Math.cos(rot), sr = Math.sin(rot), uit = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + d * i / n, x = rx * Math.cos(a), y = ry * Math.sin(a);
      uit.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
    }
    return uit;
  }

  /** Opnemende canvas-context: tekenen gaat naar een lijst met paden en teksten (in canvaspixels). */
  class OpnameCtx {
    constructor(w = 1000, h = 1000) {
      this.ops = []; this.m = [1, 0, 0, 1, 0, 0]; this.stapel = []; this.paden = []; this.huidig = null;
      this.canvas = { width: w, height: h };
      this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.font = '10px sans-serif';
      this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.globalAlpha = 1; this.lineCap = 'butt'; this.lineJoin = 'miter';
      this.streep = []; this.dxfLaag = null;
      this.meet = document.createElement('canvas').getContext('2d');
    }
    // transformaties
    pt(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
    schaal() { return Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2])) || 1; }
    save() { this.stapel.push({ m: [...this.m], st: { fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, globalAlpha: this.globalAlpha, streep: [...this.streep], dxfLaag: this.dxfLaag } }); }
    restore() { const s = this.stapel.pop(); if (s) { this.m = s.m; Object.assign(this, s.st); } }
    setTransform(a, b, c, d, e, f) { if (typeof a === 'object' && a) this.m = [a.a, a.b, a.c, a.d, a.e, a.f]; else if (a === undefined) this.m = [1, 0, 0, 1, 0, 0]; else this.m = [a, b, c, d, e, f]; }
    resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; }
    getTransform() { const [a, b, c, d, e, f] = this.m; return { a, b, c, d, e, f }; }
    transform(a, b, c, d, e, f) { const m = this.m; this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
    translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
    scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); this.transform(c, s, -s, c, 0, 0); }
    setLineDash(d) { this.streep = Array.isArray(d) ? [...d] : []; }
    getLineDash() { return [...this.streep]; }
    // paden
    beginPath() { this.paden = []; this.huidig = null; }
    moveTo(x, y) { this.huidig = { p: [this.pt(x, y)], dicht: false }; this.paden.push(this.huidig); }
    lineTo(x, y) { if (!this.huidig) this.moveTo(x, y); else this.huidig.p.push(this.pt(x, y)); }
    closePath() { if (this.huidig) { this.huidig.dicht = true; const s = this.huidig.p[0]; this.huidig = { p: [s], dicht: false }; this.paden.push(this.huidig); } }
    rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
    roundRect(x, y, w, h, r = 0) {
      const rr = Math.max(0, Math.min(Array.isArray(r) ? (r[0] ?? 0) : (typeof r === 'object' ? r.x || 0 : r), Math.abs(w) / 2, Math.abs(h) / 2));
      if (!rr) { this.rect(x, y, w, h); return; }
      const p = [...boogPunten(x + w - rr, y + rr, rr, rr, -Math.PI / 2, 0), ...boogPunten(x + w - rr, y + h - rr, rr, rr, 0, Math.PI / 2),
        ...boogPunten(x + rr, y + h - rr, rr, rr, Math.PI / 2, Math.PI), ...boogPunten(x + rr, y + rr, rr, rr, Math.PI, Math.PI * 1.5)];
      this.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) this.lineTo(q[0], q[1]); this.closePath();
    }
    arc(x, y, r, a0, a1, tegen = false) { const p = boogPunten(x, y, r, r, a0, a1, tegen); if (this.huidig && this.huidig.p.length) this.lineTo(p[0][0], p[0][1]); else this.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) this.lineTo(q[0], q[1]); }
    ellipse(x, y, rx, ry, rot, a0, a1, tegen = false) { const p = boogPunten(x, y, rx, ry, a0, a1, tegen, rot); if (this.huidig && this.huidig.p.length) this.lineTo(p[0][0], p[0][1]); else this.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) this.lineTo(q[0], q[1]); }
    arcTo(x1, y1, x2, y2) { this.lineTo(x1, y1); this.lineTo(x2, y2); }
    quadraticCurveTo(cx, cy, x, y) { this.bezier([cx, cy], [cx, cy], [x, y], true); }
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { this.bezier([c1x, c1y], [c2x, c2y], [x, y], false); }
    bezier(c1, c2, e, kwadr) {
      if (!this.huidig) this.moveTo(c1[0], c1[1]);
      // terug naar gebruikerscoördinaten is niet nodig: we interpoleren de getransformeerde punten (affien = exact)
      const p0 = this.huidig.p[this.huidig.p.length - 1], a = this.pt(...c1), b = this.pt(...c2), z = this.pt(...e);
      for (let i = 1; i <= 8; i++) {
        const t = i / 8, u = 1 - t;
        const q = kwadr ? [u * u * p0[0] + 2 * u * t * a[0] + t * t * z[0], u * u * p0[1] + 2 * u * t * a[1] + t * t * z[1]]
          : [u * u * u * p0[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * z[0], u * u * u * p0[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * z[1]];
        this.huidig.p.push(q);
      }
    }
    kopiePaden() { return this.paden.filter(p => p.p.length >= 2 || p.dicht).map(p => ({ p: p.p.map(q => [...q]), dicht: p.dicht })); }
    kleur(css) { const k = DXF_KLEUR(css); if (k && !k.patroon) k.a *= this.globalAlpha; return k; }
    fill() { const k = this.kleur(this.fillStyle); if (k) this.ops.push({ t: 'pad', paden: this.kopiePaden(), vul: k, laag: this.dxfLaag }); }
    stroke() {
      const k = this.kleur(this.strokeStyle); if (!k || k.patroon) return;
      const s = this.schaal();
      this.ops.push({ t: 'pad', paden: this.kopiePaden(), lijn: { ...k, w: this.lineWidth * s }, streep: this.streep.length ? this.streep.map(v => v * s) : null, laag: this.dxfLaag });
    }
    clip() {}
    fillRect(x, y, w, h) { const bewaar = [this.paden, this.huidig]; this.beginPath(); this.rect(x, y, w, h); this.fill(); [this.paden, this.huidig] = bewaar; }
    strokeRect(x, y, w, h) { const bewaar = [this.paden, this.huidig]; this.beginPath(); this.rect(x, y, w, h); this.stroke(); [this.paden, this.huidig] = bewaar; }
    clearRect() {}
    fontInfo() {
      const m = /(?:(\d{3}|bold|normal)\s+)?(?:italic\s+)?([\d.]+)px/.exec(this.font) || [];
      const gewicht = m[1] === 'bold' ? 700 : Number(m[1]) || 400;
      return { px: Number(m[2]) || 10, vet: gewicht >= 600 };
    }
    fillText(t, x, y) {
      const k = this.kleur(this.fillStyle); if (!k || t == null || String(t) === '') return;
      const f = this.fontInfo(), p = this.pt(x, y), q = this.pt(x + 1, y);
      const ah = { center: 1, right: 2, end: 2 }[this.textAlign] ?? 0;
      const av = { middle: 2, top: 3, hanging: 3, bottom: 1, ideographic: 1 }[this.textBaseline] ?? 0;
      this.ops.push({ t: 'tekst', x: p[0], y: p[1], dx: q[0] - p[0], dy: q[1] - p[1], tekst: String(t), h: f.px * this.schaal(), vet: f.vet, rgb: k.rgb, a: k.a, ah, av, laag: this.dxfLaag });
    }
    strokeText() {}   // witte randjes om tekst (halo): niet nodig in CAD
    measureText(t) { this.meet.font = this.font; return this.meet.measureText(t); }
    createPattern() { return { dxfPatroon: true }; }
    createLinearGradient() { return { addColorStop() {} }; }
    createRadialGradient() { return { addColorStop() {} }; }
    drawImage() {}
    putImageData() {}
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h }; }
    isPointInPath() { return false; }
  }

  /** SVG-pad (d) naar polylijnen in eigen coördinaten. */
  function svgPadPunten(d) {
    const tok = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
    const uit = []; let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cur = null, lc = null;
    const getal = () => Number(tok[i++]);
    const nieuw = () => { cur = { p: [[x, y]], dicht: false }; uit.push(cur); };
    const naar = (nx, ny) => { if (!cur) nieuw(); cur.p.push([nx, ny]); x = nx; y = ny; };
    while (i < tok.length) {
      if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      if (C === 'Z') { if (cur) { cur.dicht = true; x = sx; y = sy; cur = null; } lc = null; continue; }
      if (i >= tok.length || /[a-zA-Z]/.test(tok[i])) { if (C !== 'Z') i++; continue; }
      if (C === 'M') { const nx = getal() + (rel ? x : 0), ny = getal() + (rel ? y : 0); x = nx; y = ny; sx = x; sy = y; nieuw(); cmd = rel ? 'l' : 'L'; lc = null; }
      else if (C === 'L') { naar(getal() + (rel ? x : 0), getal() + (rel ? y : 0)); lc = null; }
      else if (C === 'H') { naar(getal() + (rel ? x : 0), y); lc = null; }
      else if (C === 'V') { naar(x, getal() + (rel ? y : 0)); lc = null; }
      else if (C === 'C' || C === 'S' || C === 'Q' || C === 'T') {
        let c1, c2, e;
        if (C === 'C') { c1 = [getal() + (rel ? x : 0), getal() + (rel ? y : 0)]; c2 = [getal() + (rel ? x : 0), getal() + (rel ? y : 0)]; e = [getal() + (rel ? x : 0), getal() + (rel ? y : 0)]; }
        else if (C === 'S') { c1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; c2 = [getal() + (rel ? x : 0), getal() + (rel ? y : 0)]; e = [getal() + (rel ? x : 0), getal() + (rel ? y : 0)]; }
        else if (C === 'Q') { c1 = [getal() + (rel ? x : 0), getal() + (rel ? y : 0)]; c2 = c1; e = [getal() + (rel ? x : 0), getal() + (rel ? y : 0)]; }
        else { c1 = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; c2 = c1; e = [getal() + (rel ? x : 0), getal() + (rel ? y : 0)]; }
        const x0 = x, y0 = y, kw = C === 'Q' || C === 'T';
        for (let k = 1; k <= 8; k++) {
          const t = k / 8, u = 1 - t;
          if (kw) naar(u * u * x0 + 2 * u * t * c1[0] + t * t * e[0], u * u * y0 + 2 * u * t * c1[1] + t * t * e[1]);
          else naar(u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0], u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]);
        }
        lc = c2;
      } else if (C === 'A') {
        let rx = Math.abs(getal()), ry = Math.abs(getal()); const rot = getal() * Math.PI / 180, groot = getal(), zwaai = getal();
        const ex = getal() + (rel ? x : 0), ey = getal() + (rel ? y : 0);
        if (!rx || !ry) { naar(ex, ey); continue; }
        // endpoint → center (SVG-specificatie F.6.5)
        const cr = Math.cos(rot), sr = Math.sin(rot), dx = (x - ex) / 2, dy = (y - ey) / 2;
        const x1 = cr * dx + sr * dy, y1 = -sr * dx + cr * dy;
        const l = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry); if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }
        const tel = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, noem = rx * rx * y1 * y1 + ry * ry * x1 * x1;
        let f = Math.sqrt(Math.max(0, tel / (noem || 1))); if (groot === zwaai) f = -f;
        const cxp = f * rx * y1 / ry, cyp = -f * ry * x1 / rx;
        const cx = cr * cxp - sr * cyp + (x + ex) / 2, cy = sr * cxp + cr * cyp + (y + ey) / 2;
        const hoek = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
        const a0 = hoek(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
        let da = hoek((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
        if (!zwaai && da > 0) da -= Math.PI * 2; else if (zwaai && da < 0) da += Math.PI * 2;
        const p = boogPunten(cx, cy, rx, ry, a0, a0 + da, da < 0, rot);
        for (const q of p.slice(1)) naar(q[0], q[1]);
        x = ex; y = ey; lc = null;
      } else i++;
    }
    return uit.filter(p => p.p.length >= 2);
  }

  /** Laag voor een SVG-element uit de profielgrafiek (op klasse). */
  function laagVoorSvg(el) {
    const k = (el.getAttribute('class') || '') + ' ' + (el.parentNode?.getAttribute?.('class') || '');
    const r = [[/\blijn-b\b|maat-b\b|maat-stip-b/, 'PV_PROF_MAAIVELD_B'], [/lijn-onder|lijn-dek|dv-brug/, 'PV_PROF_BRUG'], [/\bdv-|dv_/, 'PV_PROF_DOORVAART'],
      [/\bsn|snoei/, 'PV_PROF_SNOEI'], [/kad-/, 'PV_PROF_KADASTER'], [/paal-/, 'PV_PROF_PAAL'], [/water/, 'PV_PROF_WATER'], [/nap-/, 'PV_PROF_NAP'],
      [/bgt/, 'PV_PROF_BGT'], [/maatketting/, 'PV_PROF_MAATKETTING'], [/legenda/, 'PV_PROF_LEGENDA'], [/as-naam|huidig-station|afstand-as/, 'PV_PROF_AS'],
      [/\bmaatlijn/, 'PV_PROF_RASTER'], [/\bmaat\b|maat-stip/, 'PV_PROF_HOOGTE'], [/\blijn\b/, 'PV_PROF_MAAIVELD'], [/\btekst\b|tekst-/, 'PV_PROF_TEKST']];
    for (const [re, laag] of r) if (re.test(k)) return laag;
    return null;
  }
  /** Leg een SVG (profielgrafiek) vast als paden en teksten in viewport-pixels. */
  function vangSvg(svgEl) {
    const stijl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    stijl.textContent = SVG_EXPORT_STIJL;
    svgEl.insertBefore(stijl, svgEl.firstChild);
    const rect = svgEl.getBoundingClientRect();
    const ops = [];
    const getal = (v) => parseFloat(v) || 0;
    const loop = (el, laagErf) => {
      for (const c of el.children) {
        const tag = c.tagName.toLowerCase();
        if (['defs', 'style', 'pattern', 'clippath', 'marker', 'title', 'desc', 'lineargradient', 'radialgradient', 'mask', 'symbol'].includes(tag)) continue;
        const cs = getComputedStyle(c);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const laag = laagVoorSvg(c) || laagErf;
        if (tag === 'g' || tag === 'svg' || tag === 'a') { loop(c, laag); continue; }
        const m = c.getCTM(); if (!m) continue;
        const T = ([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
        const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
        const op = Number(cs.opacity) || 1;
        if (tag === 'text') {
          const k = DXF_KLEUR(cs.fill); if (!k || k.patroon) continue;
          const vet = (parseInt(cs.fontWeight) || 400) >= 600;
          const px = getal(cs.fontSize) * sc;
          const ah = { middle: 1, end: 2 }[cs.textAnchor] ?? 0;
          const db = cs.dominantBaseline || '';
          const av = /middle|central/.test(db) ? 2 : /hanging|text-before-edge|text-top/.test(db) ? 3 : /text-after-edge|ideographic/.test(db) ? 1 : 0;
          const stukken = c.querySelectorAll('tspan').length ? [...c.querySelectorAll('tspan')] : [c];
          let bx = getal(c.getAttribute('x')), by = getal(c.getAttribute('y'));
          for (const t of stukken) {
            const tekst = t === c ? c.textContent : t.textContent;
            if (!tekst || !tekst.trim()) continue;
            if (t !== c) { if (t.hasAttribute('x')) bx = getal(t.getAttribute('x')); if (t.hasAttribute('y')) by = getal(t.getAttribute('y')); by += getal(t.getAttribute('dy')); bx += getal(t.getAttribute('dx')); }
            const tah = t !== c && t.style?.textAnchor ? ({ middle: 1, end: 2 }[t.style.textAnchor] ?? ah) : ah;
            const p = T([bx, by]), q = T([bx + 1, by]);
            ops.push({ t: 'tekst', x: p[0], y: p[1], dx: q[0] - p[0], dy: q[1] - p[1], tekst: tekst.trim(), h: px, vet, rgb: k.rgb, a: k.a * op, ah: tah, av, laag: laag || 'PV_PROF_TEKST' });
          }
          continue;
        }
        let paden = [];
        if (tag === 'line') paden = [{ p: [[getal(c.getAttribute('x1')), getal(c.getAttribute('y1'))], [getal(c.getAttribute('x2')), getal(c.getAttribute('y2'))]], dicht: false }];
        else if (tag === 'rect') { const x = getal(c.getAttribute('x')), y = getal(c.getAttribute('y')), w = getal(c.getAttribute('width')), h = getal(c.getAttribute('height')); if (w <= 0 || h <= 0) continue; paden = [{ p: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], dicht: true }]; }
        else if (tag === 'circle') { const r = getal(c.getAttribute('r')); if (r <= 0) continue; paden = [{ p: boogPunten(getal(c.getAttribute('cx')), getal(c.getAttribute('cy')), r, r, 0, Math.PI * 2), dicht: true }]; }
        else if (tag === 'ellipse') paden = [{ p: boogPunten(getal(c.getAttribute('cx')), getal(c.getAttribute('cy')), getal(c.getAttribute('rx')), getal(c.getAttribute('ry')), 0, Math.PI * 2), dicht: true }];
        else if (tag === 'polyline' || tag === 'polygon') { const n = (c.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); const p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); paden = [{ p, dicht: tag === 'polygon' }]; }
        else if (tag === 'path') paden = svgPadPunten(c.getAttribute('d') || '');
        else continue;
        paden = paden.map(pd => ({ p: pd.p.map(T), dicht: pd.dicht }));
        const vul = DXF_KLEUR(cs.fill);
        if (vul && !vul.patroon) vul.a *= (Number(cs.fillOpacity) || (cs.fillOpacity === '0' ? 0 : 1)) * op;
        if (vul && (vul.patroon || vul.a > 0.01) && paden.some(p => p.p.length >= 3)) ops.push({ t: 'pad', paden: paden.filter(p => p.p.length >= 3).map(p => ({ ...p, dicht: true })), vul, laag: laag || 'PV_PROF_OVERIG' });
        const lijn = DXF_KLEUR(cs.stroke);
        if (lijn && !lijn.patroon) {
          lijn.a *= (Number(cs.strokeOpacity) || 1) * op;
          const vaste = cs.vectorEffect === 'non-scaling-stroke';
          const w = getal(cs.strokeWidth) * (vaste ? 1 : sc);
          const st = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray.split(/[\s,]+/).map(getal).map(v => v * (vaste ? 1 : sc)).filter(v => v > 0) : null;
          if (w > 0) ops.push({ t: 'pad', paden, lijn: { ...lijn, w }, streep: st && st.length ? st : null, laag: laag || 'PV_PROF_OVERIG' });
        }
      }
    };
    try { loop(svgEl, null); } finally { stijl.remove(); }
    return { W: rect.width || 1, H: rect.height || 1, ops };
  }

  /** Streeplijn uitschrijven in stukjes (patroon in bron-eenheden). */
  function streepStukken(p, dicht, patroon) {
    const pts = dicht ? [...p, p[0]] : p, uit = [];
    const som = patroon.reduce((a, b) => a + b, 0); if (!(som > 0)) return [pts];
    let fase = 0, aan = true, idx = 0, rest = patroon[0], huidig = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      let [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
      let len = Math.hypot(x1 - x0, y1 - y0);
      while (len > 1e-9) {
        const stap = Math.min(rest, len), t = stap / len;
        const xm = x0 + (x1 - x0) * t, ym = y0 + (y1 - y0) * t;
        if (aan) huidig.push([xm, ym]);
        x0 = xm; y0 = ym; len -= stap; rest -= stap;
        if (rest <= 1e-9) {
          if (aan && huidig.length >= 2) uit.push(huidig);
          aan = !aan; idx = (idx + 1) % patroon.length; rest = patroon[idx]; huidig = [[x0, y0]];
          if (uit.length > 20000) return uit;
        }
      }
    }
    if (aan && huidig.length >= 2) uit.push(huidig);
    void fase;
    return uit;
  }
  /**
   * Schrijf opgenomen paden/teksten naar de DXF.
   * map(x, y) → [X, Y] (doelcoördinaten); mmPerBron = mm op papier per bron-eenheid (lijndikte);
   * eenheidPerBron = doel-eenheden per bron-eenheid (teksthoogte); laagStd = laag als het element er geen heeft.
   */
  function schrijfOpnames(d, ops, map, mmPerBron, eenheidPerBron, laagStd, opt = {}) {
    let n = 0;
    // opeenvolgende vlakken met dezelfde kleur en laag samenvoegen tot één arcering (bv. duizenden vakjes of puntjes)
    const samen = [];
    const zelfde = (a, b) => a && b && a.t === 'pad' && b.t === 'pad' && a.vul && b.vul && !a.lijn && !b.lijn && a.laag === b.laag && !!a.vul.patroon === !!b.vul.patroon
      && a.vul.rgb.join() === b.vul.rgb.join() && Math.abs(a.vul.a - b.vul.a) < 0.01;
    for (const o of ops) {
      const v = samen[samen.length - 1];
      if (zelfde(v, o) && v.paden.length < 2000) v.paden = v.paden.concat(o.paden);
      else samen.push(o.t === 'pad' && o.vul && !o.lijn ? { ...o, paden: [...o.paden] } : o);
    }
    ops = samen;
    for (const o of ops) {
      const laag = d.laag(o.laag || laagStd, 7);
      if (o.t === 'tekst') {
        const p = map(o.x, o.y), q = map(o.x + o.dx, o.y + o.dy);
        const hoek = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
        const hoogte = o.h * 0.716 * eenheidPerBron;
        if (!(hoogte > 0)) continue;
        d.tekst(laag, p[0], p[1], hoogte, o.tekst, { draai: Math.abs(hoek) < 1e-6 ? 0 : hoek, h: o.ah, v: o.av, st: { rgb: o.rgb, alpha: o.a }, stijl: o.vet ? 'PV_Vet' : null });
        n++; continue;
      }
      if (o.vul) {
        if (isWit(o.vul) && !opt.witToestaan) continue;
        const lussen = o.paden.filter(pd => pd.p.length >= 3).map(pd => pd.p.map(([x, y]) => map(x, y)));
        if (lussen.length) {
          if (o.vul.patroon) d.vlak(laag, lussen, { rgb: o.vul.rgb }, { schaal: (opt.arceerMm || 1.6) * (opt.mmNaarDoel || 1) / 3.175 });
          else d.vlak(laag, lussen, { rgb: o.vul.rgb, alpha: o.vul.a });
          n++;
        }
      }
      if (o.lijn) {
        if (isWit(o.lijn) && !opt.witToestaan) continue;
        const st = { rgb: o.lijn.rgb, lw: DxfSchrijver.lijndikte(Math.max(0, o.lijn.w * mmPerBron)), alpha: o.lijn.a };
        for (const pd of o.paden) {
          if (pd.p.length < 2) continue;
          if (o.streep && o.streep.length) {
            // als lijntype (blijft één lijn in CAD); patroon omrekenen naar tekeningeenheden
            const lt = d.lijnType(o.streep.map(v => v * eenheidPerBron));
            d.polylijn(laag, pd.p.map(([x, y]) => map(x, y)), false, pd.dicht, { ...st, lt }); n++;
          } else { d.polylijn(laag, pd.p.map(([x, y]) => map(x, y)), false, pd.dicht, st); n++; }
        }
      }
    }
    return n;
  }

  /** Opnemend PDF-document voor de DXF: gedraagt zich als het voorbeelddocument, plus "vangsten" voor de beelden. */
  // (de klasse wordt pas gemaakt bij gebruik: VoorbeeldDoc staat verderop in het bestand)
  let DxfBladDocKlasse = null;
  function maakDxfBladDoc(W, H) {
    if (!DxfBladDocKlasse) DxfBladDocKlasse = class extends VoorbeeldDoc {
      constructor(w, h) { super(w, h); this.isDxf = true; this.vangsten = new Map(); this.nr = 0; this.logoData = null; }
      vang(obj) { const id = `dxf-vangst:${++this.nr}`; this.vangsten.set(id, obj); return id; }
    };
    return new DxfBladDocKlasse(W, H);
  }
  /** Paginabeschrijving (ops van het opnemende document) → lijnwerk in de layout (mm, y omhoog). */
  function vanDocOps(ops, H) {
    const uit = [];
    const kleur = (css) => DXF_KLEUR(css);
    for (const o of ops) {
      const st = o.st;
      const vulOf = /F/.test(o.stijl || ''), lijnOf = !o.stijl || /D|S/.test(o.stijl);
      const streep = st.streep && st.streep.length ? st.streep : null;
      const voeg = (paden, dicht) => {
        if (vulOf) { const k = kleur(st.vul); if (k) uit.push({ t: 'pad', paden: paden.map(p => ({ p: p, dicht: true })), vul: k, laag: 'PV_BLAD_VULLING' }); }
        if (lijnOf) { const k = kleur(st.lijn); if (k) uit.push({ t: 'pad', paden: paden.map(p => ({ p, dicht })), lijn: { ...k, w: st.dik }, streep, laag: 'PV_BLAD_LIJN' }); }
      };
      if (o.t === 'rect') voeg([[[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]], true);
      else if (o.t === 'line') { const k = kleur(st.lijn); if (k) uit.push({ t: 'pad', paden: [{ p: [[o.x1, o.y1], [o.x2, o.y2]], dicht: false }], lijn: { ...k, w: st.dik }, streep, laag: 'PV_BLAD_LIJN' }); }
      else if (o.t === 'tri') voeg([[[o.pts[0], o.pts[1]], [o.pts[2], o.pts[3]], [o.pts[4], o.pts[5]]]], true);
      else if (o.t === 'circle') voeg([boogPunten(o.x, o.y, o.r, o.r, 0, Math.PI * 2)], true);
      else if (o.t === 'ellipse') voeg([boogPunten(o.x, o.y, o.rx, o.ry, 0, Math.PI * 2)], true);
      else if (o.t === 'lines') {
        let cx = o.x, cy = o.y; const p = [[cx, cy]]; const [sx, sy] = o.sc || [1, 1];
        for (const g of o.l) {
          if (g.length === 6) {
            const x0 = cx, y0 = cy, c1 = [cx + g[0] * sx, cy + g[1] * sy], c2 = [cx + g[2] * sx, cy + g[3] * sy], e = [cx + g[4] * sx, cy + g[5] * sy];
            for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; p.push([u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * e[0], u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * e[1]]); }
            cx = e[0]; cy = e[1];
          } else { cx += g[0] * sx; cy += g[1] * sy; p.push([cx, cy]); }
        }
        voeg([p], !!o.closed);
      } else if (o.t === 'text') {
        const k = kleur(st.tekst); if (!k) continue;
        const regels = Array.isArray(o.tekst) ? o.tekst : String(o.tekst).split('\n');
        const hoek = (o.o?.angle || 0) * Math.PI / 180;
        const lh = st.pt * 0.3528 * (o.o?.lineHeightFactor || 1.15);
        regels.forEach((r, i) => {
          if (!String(r).trim()) return;
          // jsPDF: hoek tegen de klok in (op het blad y omlaag)
          const x = o.x + Math.sin(hoek) * lh * i, y = o.y + Math.cos(hoek) * lh * i;
          const ah = { center: 1, right: 2 }[o.o?.align] ?? 0;
          const av = { middle: 2, top: 3, hanging: 3, bottom: 1 }[o.o?.baseline] ?? 0;
          uit.push({ t: 'tekst', x, y, dx: Math.cos(hoek), dy: -Math.sin(hoek), tekst: String(r), h: st.pt * 0.3528, vet: st.stijl === 'bold', rgb: k.rgb, a: k.a, ah, av, laag: 'PV_BLAD_TEKST' });
        });
      } else if (o.t === 'img') uit.push({ t: 'beeld', data: o.data, x: o.x, y: o.y, w: o.w, h: o.h });
    }
    void H;
    return uit;
  }

  /** De DXF met bladen (layouts) zoals de PDF. */
  async function maakDxfMetBladen(inst, onVoortgang) {
    const r = await maakPdf(inst, onVoortgang, null, false, true);
    const { doc, paginas, W, H, meldingen } = r;
    const d = new DxfSchrijver();
    // model space: de situatie in RD/NAP (as en profielen in 3D) — zonder het 2D-lijnwerk dat nu op de kaart en de bladen staat
    const heeftKaart = [...doc.vangsten.values()].some(v => v.soort === 'kaart');
    const situatie = dxfSituatie(d, { zonderKaartLijnen: heeftKaart });
    // plek in model space voor de grafieken: rechts van de situatie
    const sx1 = Number.isFinite(d.max[0]) ? d.max[0] : 0, sy1 = Number.isFinite(d.max[1]) ? d.max[1] : 0;
    let modelY = sy1;
    const modelX = sx1 + 200;
    let nGrafiek = 0, nKaart = 0;
    for (let i = 0; i < paginas.length; i++) {
      onVoortgang?.(`DXF: blad ${i + 1} van ${paginas.length}…`);
      const naam = `${String(i + 1).padStart(2, '0')} ${paginas[i].onderwerp}`.replace(/\s*\([^)]*\)\s*$/, '').replace(/station /, 'st. ').replace(/,/g, '.').replace(/[—–]/g, '-')
        .replace(/[<>/\\":;?*|=`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      const ops = vanDocOps(doc.bladen[i] || [], H);
      const lay = d.nieuweLayout(naam, W, H);
      // eerst de viewports (onder), dan het lijnwerk van het blad erover
      const beelden = ops.filter(o => o.t === 'beeld');
      // model-gebied voor dit blad
      let regioN = null, regioY = modelY;
      for (const b of beelden) {
        const v = doc.vangsten.get(b.data);
        const papierX = b.x + b.w / 2, papierY = H - (b.y + b.h / 2);
        if (v && v.soort === 'kaart') {
          // bovenaanzicht: viewport op RD, schaal 1:N
          d.naarLayout(lay);
          d.viewport(papierX, papierY, b.w, b.h, v.cx, v.cy, b.h * v.N / 1000);
          d.naarModel();
          const map = (x, y) => [(x - v.pw / 2) / v.pxPerM + v.cx, -(y - v.ph / 2) / v.pxPerM + v.cy];
          schrijfOpnames(d, v.ops, map, 25.4 / v.dpi, 1 / v.pxPerM, 'PV_KAART', { mmNaarDoel: v.N / 1000 });
          nKaart++;
        } else if (v && (v.soort === 'grafiek' || v.soort === 'dekking')) {
          const N = v.N || 100;
          if (regioN == null) regioN = N;
          const s = N / 1000;                     // m per mm papier
          const x0 = modelX + b.x * regioN / 1000, y0 = regioY - b.y * regioN / 1000;
          let opsG, mmPerBron;
          if (v.soort === 'grafiek') { opsG = v.ops; mmPerBron = b.w / v.W; }
          else {
            const rec = new OpnameCtx(v.wPx, v.hPx);
            dekkingsKaartBeeld(v.r, v.wPx, v.hPx, v.pxPerMm, rec);
            opsG = rec.ops; mmPerBron = 1 / v.pxPerMm;
          }
          const map = (x, y) => [x0 + x * mmPerBron * s, y0 - y * mmPerBron * s];
          d.naarModel();
          schrijfOpnames(d, opsG, map, mmPerBron, mmPerBron * s, v.soort === 'dekking' ? 'PV_DEKKING' : 'PV_PROF_OVERIG', { mmNaarDoel: s });
          d.naarLayout(lay);
          d.viewport(papierX, papierY, b.w, b.h, x0 + b.w / 2 * s, y0 - b.h / 2 * s, b.h * s);
          d.naarModel();
          nGrafiek++;
        }
      }
      if (regioN != null) modelY = regioY - H * regioN / 1000 - 20;
      d.naarLayout(lay);
      // lijnwerk van het blad (kader, stempel, legenda, tabellen, kopjes)
      const lijnwerk = ops.filter(o => o.t !== 'beeld');
      schrijfOpnames(d, lijnwerk, (x, y) => [x, H - y], 1, 1, 'PV_BLAD_LIJN', { witToestaan: true, mmNaarDoel: 1 });
      // logo: als tekst (de beelden zelf kunnen niet in een DXF zonder losse bestanden)
      for (const b of beelden) {
        if (doc.vangsten.has(b.data)) continue;
        if (b.data === doc.logoData && b.w > b.h) d.tekst(d.laag('PV_BLAD_TEKST', 7), b.x + b.w / 2, H - (b.y + b.h / 2), Math.min(b.h * 0.55, b.w / 4.2), 'Lutrea', { h: 1, v: 2, st: { rgb: [41, 35, 92] }, stijl: 'PV_Vet' });
      }
      d.naarModel();
    }
    return { blob: d.bestand(), bladen: paginas.length, grafieken: nGrafiek, kaarten: nKaart, situatie, meldingen };
  }

  /** Situatie in RD/NAP in model space: de as en de dwarsprofielen in 3D (breaklines), met profiellijnen, stations en palen in 2D. */
  function dxfSituatie(d, { zonderKaartLijnen = false } = {}) {
    const TH = 0.25;
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const asNaam = assen[actieveAs]?.naam || 'As';
    const s = stationsLangsAs(), lengte = s[s.length - 1];
    const asLijn = [];
    for (let st = 0; st <= lengte + 1e-9; st += Math.max(0.5, Math.min(2, lengte / 500))) {
      const p = puntOpStation(st); asLijn.push([p.x, p.y, hoogteOp(p.x, p.y) ?? 0]);
    }
    { const p = puntOpStation(lengte); asLijn.push([p.x, p.y, hoogteOp(p.x, p.y) ?? 0]); }
    d.polylijn('PV_AS', asLijn, true);
    if (!zonderKaartLijnen) d.tekst('PV_AS', asPunten[0].x, asPunten[0].y, TH * 2, asNaam, { h: 0, v: 0 });
    for (const st of dwarsStations) {
      const L = puntOpStationOffset(st, -pL), R = puntOpStationOffset(st, pR);
      if (!zonderKaartLijnen) {
        d.lijn('PV_DWARSLIJN', L.x, L.y, R.x, R.y);
        const hoek = Math.atan2(R.y - L.y, R.x - L.x) * 180 / Math.PI;
        d.tekst('PV_STATION_TEKST', L.x, L.y, TH * 2, st.toFixed(st % 1 ? 1 : 0), { draai: hoek + 180, h: 0, v: 2 });
      }
      // het profiel als 3D-polylijn op de echte plek (stukken zonder hoogte = onderbroken)
      const reeks = berekenDwarsprofielReeks(st);
      let stuk = [];
      for (const p of reeks) {
        if (p.hoogte === null) { d.polylijn('PV_DWARS_3D', stuk, true); stuk = []; continue; }
        const q = puntOpStationOffset(st, p.offset); stuk.push([q.x, q.y, p.hoogte]);
      }
      d.polylijn('PV_DWARS_3D', stuk, true);
    }
    // dijkpalen / hectometers in de situatie
    if (!zonderKaartLijnen) for (const p of paalMarkeringen()) {
      const q = puntOpStationOffset(p.st, 0);
      d.lijn('PV_STATION_TEKST', p.x - TH * 0.6, p.y, p.x + TH * 0.6, p.y); d.lijn('PV_STATION_TEKST', p.x, p.y - TH * 0.6, p.x, p.y + TH * 0.6);
      if (Math.hypot(q.x - p.x, q.y - p.y) > 0.2) d.lijn('PV_STATION_TEKST', p.x, p.y, q.x, q.y);
      d.tekst('PV_STATION_TEKST', p.x + TH, p.y + TH, TH * 1.6, p.label, { h: 0, v: 0 });
    }
    return { lengte, profielen: dwarsStations.length };
  }

  /** Bouwt de DXF voor de actieve as (situatie + profielen als losse 2D-tekening). Geeft {blob, aantal} terug. */
  function maakDxf() {
    if (!xs || asPunten.length < 2) throw new Error('teken eerst een as');
    const d = new DxfSchrijver();
    const TH = 0.25;   // teksthoogte in m (= 2,5 mm op 1:100)
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const fmt = (h) => (Math.abs(h) < 0.005 ? 0 : h).toFixed(2);
    const asNaam = assen[actieveAs]?.naam || 'As';
    const wp = waterpeil(), kantW = waterKant();
    dxfSituatie(d);

    // ── 2. profielen als 2D-tekening, rechts naast de situatie ──
    const g0 = grenzen();
    const ox0 = Math.ceil((g0.maxX + 50) / 10) * 10, oy0 = Math.ceil(g0.maxY / 10) * 10;
    // raster + kader + assen van één profielvak; geeft de omrekening terug
    const tekenVak = (x0, yTop, uMin, uMax, hMin, hMax, verh, titel, uLabel) => {
      const stapH = mooieStap((hMax - hMin) / 6), stapU = mooieStap((uMax - uMin) / 10);
      const h0 = Math.floor(hMin / stapH) * stapH, h1 = Math.ceil(hMax / stapH) * stapH;
      const kantL = 6, kantO = 3;   // ruimte voor hoogtegetallen en afstandsgetallen (m)
      const X = (u) => x0 + kantL + (u - uMin), Y = (h) => yTop - 2 - (h1 - h) * verh;
      const yOnder = Y(h0);
      d.tekst('PV_PROF_TEKST', x0, yTop, TH * 1.6, titel, { v: 0 });
      d.polylijn('PV_PROF_KADER', [[X(uMin), Y(h1)], [X(uMax), Y(h1)], [X(uMax), yOnder], [X(uMin), yOnder]], false, true);
      for (let h = h0; h <= h1 + 1e-9; h += stapH) {
        d.lijn('PV_PROF_RASTER', X(uMin), Y(h), X(uMax), Y(h));
        d.tekst('PV_PROF_TEKST', X(uMin) - 0.4, Y(h), TH, fmt(h), { h: 2, v: 2 });
      }
      for (let u = Math.ceil(uMin / stapU) * stapU; u <= uMax + 1e-9; u += stapU) {
        d.lijn('PV_PROF_RASTER', X(u), Y(h1), X(u), yOnder);
        d.tekst('PV_PROF_TEKST', X(u), yOnder - 0.5, TH, String(+u.toFixed(2)), { h: 1, v: 3 });
      }
      d.tekst('PV_PROF_TEKST', X(uMax), yOnder - 0.5 - TH * 2.2, TH, uLabel, { h: 2, v: 3 });
      if (0 >= h0 && 0 <= h1) { d.lijn('PV_PROF_NAP', X(uMin), Y(0), X(uMax), Y(0)); d.tekst('PV_PROF_NAP', X(uMax) - 0.3, Y(0) + 0.15, TH, 'NAP 0,00', { h: 2 }); }
      return { X, Y, breedteVak: kantL + (uMax - uMin) + 2, hoogteVak: (yTop - yOnder) + kantO + 2 };
    };
    const lijnStukken = (laag, reeks, veld, X, Y, hVeld = 'hoogte') => {
      let stuk = [];
      for (const p of reeks) {
        if (p[hVeld] == null) { d.polylijn(laag, stuk); stuk = []; continue; }
        stuk.push([X(p[veld]), Y(p[hVeld])]);
      }
      d.polylijn(laag, stuk);
    };
    const bereik = (reeks, metPeil = true) => {
      let lo = Infinity, hi = -Infinity;
      for (const p of reeks) for (const v of [p.hoogte, p.hoogteB]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (!isFinite(lo)) return null;
      if (metPeil && wp != null) { lo = Math.min(lo, wp); hi = Math.max(hi, wp); }
      if (!isFinite(lo)) return null;
      if (hi - lo < 1) { const m = (lo + hi) / 2; lo = m - 0.5; hi = m + 0.5; }
      return [lo - 0.5, hi + 0.5];
    };
    let yCursor = oy0;

    // lengteprofiel
    if (langsprofiel.length >= 2) {
      const verhL = Math.max(0.25, Number(langsOverdrijvingVeld.value) || 1);
      const br = bereik(langsprofiel, false) || [0, 1];
      const v = tekenVak(ox0, yCursor, langsprofiel[0].station, langsprofiel[langsprofiel.length - 1].station, br[0], br[1], verhL,
        `Lengteprofiel ${asNaam}${verhL !== 1 ? ` - hoogte ${verhL}x overdreven` : ''}`, 'station (m)');
      lijnStukken('PV_PROF_MAAIVELD', langsprofiel, 'station', v.X, v.Y);
      if (wolkB) lijnStukken('PV_PROF_MAAIVELD_B', langsprofiel, 'station', v.X, v.Y, 'hoogteB');
      const iv = Math.max(1, matenWaarde(maatLangsVeld, 10) || 10);
      let volgende = langsprofiel[0].station;
      for (const p of langsprofiel) {
        if (p.hoogte == null || p.station < volgende - 1e-9) continue;
        d.tekst('PV_PROF_HOOGTE', v.X(p.station), v.Y(p.hoogte) + 0.3, TH * 0.8, fmt(p.hoogte), { draai: 90, v: 2 });
        volgende = p.station + iv;
      }
      yCursor -= v.hoogteVak + 8;
    }

    // dwarsprofielen: kolommen van vakken onder elkaar
    const verhD = Math.max(0.25, Number(dwarsOverdrijvingVeld.value) || 1);
    const iv = matenWaarde(maatDwarsVeld, 5);
    const kolommen = 4;
    let kol = 0, rijTop = yCursor, rijHoogte = 0;
    for (const st of dwarsStations) {
      const reeks = berekenDwarsprofiel(st);
      const br = bereik(reeks); if (!br) continue;
      const x0 = ox0 + kol * (breedte + 16);
      const v = tekenVak(x0, rijTop, -pL, pR, br[0], br[1], verhD,
        `Dwarsprofiel ${asNaam} station ${st.toFixed(1).replace(".", ",")} m${paalAchter(st, ' - ')}${verhD !== 1 ? ` - hoogte ${verhD}x` : ''}`, 'offset (m)');
      lijnStukken('PV_PROF_MAAIVELD', reeks, 'offset', v.X, v.Y);
      if (wolkB) lijnStukken('PV_PROF_MAAIVELD_B', reeks, 'offset', v.X, v.Y, 'hoogteB');
      // as
      d.lijn('PV_PROF_AS', v.X(0), v.Y(br[1]), v.X(0), v.Y(br[0]));
      d.tekst('PV_PROF_AS', v.X(0) - 0.2, v.Y(br[1]) - 0.2, TH, asNaam, { draai: 90, h: 2, v: 0 });
      d.tekst('PV_PROF_TEKST', v.X(-pL) + 0.3, v.Y(br[1]) - 0.3, TH, 'L', { v: 3 });
      d.tekst('PV_PROF_TEKST', v.X(pR) - 0.3, v.Y(br[1]) - 0.3, TH, 'R', { h: 2, v: 3 });
      // hoogtes elke "maten elke" m
      if (iv !== 0) {
        const stap = Math.max(0.5, iv || 5);
        let volgende = -pL;
        for (const p of reeks) {
          if (p.hoogte == null || p.offset < volgende - 1e-9) continue;
          d.tekst('PV_PROF_HOOGTE', v.X(p.offset), v.Y(p.hoogte) - 0.3, TH * 0.8, fmt(p.hoogte), { draai: 90, h: 2, v: 2 });
          volgende = p.offset + stap;
        }
      }
      // waterpeil (alleen de stukken onder het peil, aan de gekozen kant)
      if (wp != null) {
        let start = null;
        const sluit = (x) => {
          if (start === null) return;
          const m = (start + x) / 2;
          if (kantW === 'beide' || (kantW === 'links' ? m < 0 : m > 0)) d.lijn('PV_PROF_WATER', v.X(start), v.Y(wp), v.X(x), v.Y(wp));
          start = null;
        };
        for (let i = 0; i < reeks.length; i++) {
          const p = reeks[i];
          if (p.hoogte == null) { sluit(reeks[i - 1]?.offset ?? p.offset); continue; }
          if (p.hoogte < wp && start === null) start = p.offset;
          if (p.hoogte >= wp) sluit(p.offset);
        }
        sluit(reeks[reeks.length - 1].offset);
        d.tekst('PV_PROF_WATER', v.X(kantW === 'rechts' ? pR / 2 : -pL / 2), v.Y(wp) + 0.2, TH, `waterpeil ${wp >= 0 ? '+' : ''}${wp.toFixed(2).replace('.', ',')} m NAP`, { h: 1 });
      }
      // BGT-grenzen: verticale lijn, rode hoogte en naam
      if (reeks.bgt && reeks.bgt.grenzen) {
        const gezien = [];
        for (const gr of reeks.bgt.grenzen) {
          if (gezien.some(o => Math.abs(o - gr.offset) < 0.05)) continue;
          gezien.push(gr.offset);
          let h = null, vorige = null;
          for (const p of reeks) { if (p.hoogte == null) { vorige = null; continue; } if (p.offset >= gr.offset) { h = vorige ? vorige.hoogte + (gr.offset - vorige.offset) / Math.max(1e-9, p.offset - vorige.offset) * (p.hoogte - vorige.hoogte) : p.hoogte; break; } vorige = p; }
          d.lijn('PV_PROF_BGT', v.X(gr.offset), v.Y(br[0]), v.X(gr.offset), v.Y(br[1]));
          if (h != null) d.tekst('PV_PROF_BGT_TEKST', v.X(gr.offset), v.Y(h) + 0.3, TH * 0.9, fmt(h), { draai: 90, v: 2 });
          if (gr.naam) d.tekst('PV_PROF_BGT_TEKST', v.X(gr.offset) - 0.15, v.Y(br[1]) - 0.3, TH * 0.8, bgtKort(gr.naam), { draai: 90, h: 2, v: 0 });
        }
      }
      rijHoogte = Math.max(rijHoogte, v.hoogteVak);
      if (++kol >= kolommen) { kol = 0; rijTop -= rijHoogte + 6; rijHoogte = 0; }
    }
    return { blob: d.bestand(), aantal: dwarsStations.length };
  }

  async function dxfMetBladenOpslaan() {
    try {
      if (asPunten.length < 2) { toonFout('Teken eerst een as: de DXF bevat de as en de profielen.'); return; }
      const naam = `${(bronBestandsnaam || 'profielen').replace(/\.[^.]+$/, '')}-${(assen[actieveAs]?.naam || 'as').replace(/[^a-zA-Z0-9_-]+/g, '_')}.dxf`;
      const handle = await kiesOpslag(naam, 'dxf');
      if (handle === false) { statusEl.textContent = 'DXF opslaan geannuleerd'; return; }
      statusEl.style.color = ''; statusEl.textContent = 'DXF maken (zelfde bladen als de PDF)…';
      await new Promise(r => setTimeout(r, 20));
      const inst = leesPdfInstellingen();
      const { blob, bladen, grafieken, meldingen } = await maakDxfMetBladen(inst, (t) => { statusEl.textContent = t; });
      await schrijfBestand(handle, blob, naam);
      statusEl.textContent += ` · ${bladen} ${bladen === 1 ? 'blad' : 'bladen'} (layouts, ${inst.formaat}) met ${grafieken} profielen op ware grootte in model space${meldingen.length ? ' · ' + meldingen[0] : ''}`;
    } catch (err) {
      console.error(err);
      toonFout('DXF maken mislukt: ' + (err.message || err));
    }
  }
  document.getElementById('dxfKnop')?.addEventListener('click', dxfMetBladenOpslaan);
  // ook vanuit het PDF-venster: zelfde instellingen, zelfde bladen
  document.getElementById('pdfDxf')?.addEventListener('click', async (e) => {
    const k = e.currentTarget, ps = document.getElementById('pdfStatus');
    k.disabled = true; if (ps) ps.textContent = ' · DXF maken…';
    try { await dxfMetBladenOpslaan(); if (ps) ps.textContent = ' · ' + statusEl.textContent; } finally { k.disabled = false; }
  });

  /* Project: Nieuw / Openen / Opslaan / Opslaan als
     - Openen onthoudt het bestand (via de bestandskiezer van Windows), zodat
       Opslaan daarna gewoon dat bestand overschrijft.
     - Opslaan als vraagt altijd om een (nieuw) bestand; daarna is dat het
       projectbestand waar Opslaan in schrijft.
     - Overschrijven gaat via een tijdelijk bestand: pas als alles geschreven
       is, vervangt het het oude project (mislukt het, dan blijft het oude staan). */
  let projectHandle = null;
  function toonProjectBestand(naam) {
    const pn = document.getElementById('projectBestandNaam');
    if (pn) { pn.textContent = naam || ''; pn.title = naam ? `Projectbestand: ${naam} — Opslaan schrijft hierin` : ''; }
    projectOpslaanKnop.title = naam
      ? `Opslaan in ${naam} (overschrijft het projectbestand) (Ctrl+S)`
      : 'Opslaan: nog geen projectbestand, je kiest een nieuw bestand (Ctrl+S)';
  }
  function projectNaamVoorstel() {
    return projectHandle?.name || `${(bronBestandsnaam || 'project').replace(/\.[^.]+$/, '')}-project.json`;
  }
  function maakProjectBlob(opties = {}) {
    projectBinair = [];
    try { return maakProjectBlobBinnen(opties); } finally { projectBinair = null; }
  }
  function maakProjectBlobBinnen(opties = {}) {
    const metWolk = document.getElementById('projectMetPuntenwolk')?.checked !== false;
    const project = {
      bronBestand: bronBestandsnaam,
      puntenwolk: metWolk ? codeerPuntenwolk() : null,
      opgeslagenOp: new Date().toISOString(),
      vergelijkWolk: wolkB ? { naam: wolkB.naam, alleenMaaiveld: wolkB.alleenMaaiveld, toonA: toonWolkA, toonB: toonWolkB,
        wolk: metWolk ? codeerWolk(wolkB.xs, wolkB.ys, wolkB.zs, null) : null } : null,
      brug: (brugOnder || brugBoven) ? {
        onder: brugOnder ? { naam: brugOnder.naam, wolk: metWolk ? codeerWolk(brugOnder.xs, brugOnder.ys, brugOnder.zs, null) : null } : null,
        boven: brugBoven ? { naam: brugBoven.naam, wolk: metWolk ? codeerWolk(brugBoven.xs, brugBoven.ys, brugBoven.zs, null) : null } : null,
      } : null,
      begroeiing: begroeiing ? { naam: begroeiing.naam, half: begroeiing.half, asSleutel: begroeiing.asSleutel,
        wolk: metWolk ? codeerWolk(begroeiing.xs, begroeiing.ys, begroeiing.zs, null) : null } : null,
      percelen: percelen.length ? { bron: perceelBron, lijst: percelen.map(pc => ({ gemeente: pc.gemeente, code: pc.code, sectie: pc.sectie, nummer: pc.nummer, grootte: pc.grootte, ringen: pc.ringen.map(r => r.map(q => [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000])) })) } : null,
      stationering: { ...palen, lijst: palen.lijst.map(p => ({ naam: p.naam, x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })) },
      asPunten,          // actieve as (voor oudere versies van de viewer)
      assen: (bewaarActieveAs(), assen.map(a => ({ naam: a.naam, punten: a.punten }))),
      actieveAs,
      bgtLagen,
      boomLagen,
      instellingen: {
        dwarsBreedte: profielBreedte(), dwarsLinks: profielL(), dwarsRechts: profielR(),
        dwarsInterval: Number(dwarsIntervalVeld.value),
        maatDwars: Number(maatDwarsVeld.value),
        dwarsOverdrijving: Number(dwarsOverdrijvingVeld.value),
        langsOverdrijving: Number(langsOverdrijvingVeld.value),
        printOverdrijving: Number(printOverdrijvingVeld.value),
        maatLangs: Number(maatLangsVeld.value),
        stapLangs: Number(stapLangsVeld.value),
        toonLangsprofiel: toonLangsprofielVeld.checked,
        bgtWeergave,
        kleurModus,
        waterpeil: waterpeil(),
        waterKant: waterKant(),
        doorvaart: { ...doorvaart, gecontroleerd: !!dvResultaat },
        snoei: { ...snoei, gecontroleerd: !!snResultaat },
        pdf: leesPdfInstellingen?.() ?? null,
      },
    };
    if (opties.inMap) {
      // projectmap: puntenwolk A staat als vakken in puntenwolk\, de ondergrond in eigen bestanden
      project.formaat = 'pvproj-1';
      if (laatsteBestand?.tegelbron) {
        project.puntenwolk = null;
        project.puntenwolkMap = `puntenwolk/${laatsteBestand.map.name}`;
        project.puntenwolkInstellingen = { maaiveld: maaiveldAGevraagd(), punten: doelPunten(), oppervlak: oppervlakModus(), detailStrook: detailStrook?.halveBreedte || null };
      }
      opties.ondergrondUit = { bgt: bgtLagen.length ? bgtLagen : null, bomen: boomLagen.length ? boomLagen : null, kadaster: project.percelen };
      project.ondergrond = {};
      for (const [k, v] of Object.entries(opties.ondergrondUit)) if (v) project.ondergrond[k] = `ondergrond/${k}.json`;
      delete project.bgtLagen; delete project.boomLagen; delete project.percelen;
    }
    // zonder inspringing: scheelt veel ruimte nu de puntenwolk erin kan zitten.
    // De puntenwolken staan er als @@PV-BINAIR-n@@ in en gaan als losse base64-stukken het bestand in.
    const tekst = JSON.stringify(project);
    const delen = [];
    let vanaf = 0;
    const re = /@@PV-BINAIR-(\d+)@@/g;
    for (let m; (m = re.exec(tekst));) {
      delen.push(tekst.slice(vanaf, m.index));
      for (const stuk of base64Stukken(projectBinair[Number(m[1])])) delen.push(stuk);
      vanaf = m.index + m[0].length;
    }
    delen.push(tekst.slice(vanaf));
    return new Blob(delen, { type: 'application/json' });
  }
  async function magSchrijven(handle) {
    try {
      if (!handle?.createWritable) return false;
      if (!handle.queryPermission) return true;
      if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
      return await handle.requestPermission({ mode: 'readwrite' }) === 'granted';
    } catch { return false; }
  }
  /** als = true: altijd om een nieuw bestand vragen (Opslaan als). */
  async function projectOpslaan(als) {
    markeerBezig('project opslaan', projectNaamVoorstel());
    try { return await projectOpslaanBinnen(als); } finally { markeerKlaar(); }
  }
  async function projectOpslaanBinnen(als) {
    if (!xs || projectOpslaanKnop.disabled) return;
    // los projectbestand (oude manier) open en gewoon Opslaan: daarin blijven schrijven
    if (!als && !projectMap && projectHandle) return opslaanLosBestand(false);
    let map = projectMap;
    if (als || !map) {
      const keuze = await vraagProjectMap({ ondertitel: als ? 'opslaan als: kies een (nieuwe, lege) projectmap' : 'waar komt dit project?',
        zonderTekst: 'Als los bestand (.json)…', zonderTitel: 'Zoals vroeger: alles in één .json-bestand (met de uitgedunde puntenwolk)' });
      if (keuze === false) { statusEl.textContent = 'Opslaan geannuleerd'; return; }
      if (keuze === null) return opslaanLosBestand(als);
      map = keuze;
    }
    statusEl.style.color = ''; statusEl.textContent = `Project opslaan in ${map.name}…`;
    await new Promise(r => setTimeout(r, 20));
    try {
      const r = await projectOpslaanInMap(map, (t) => { statusEl.textContent = t; });
      projectMap = map; projectHandle = null;
      toonProjectBestand(`${map.name}\\${r.naam}`);
      bewaarRecentProject(map);
      statusEl.textContent = `Opgeslagen: ${map.name}\\${r.naam} (${r.grootte < 1e6 ? `${Math.max(1, Math.round(r.grootte / 1e3))} kB` : `${(r.grootte / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} MB`})${r.backup ? ` · vorige versie in backup\\${r.backup}` : ''}`;
    } catch (err) {
      console.error(err);
      toonFout(`Project opslaan mislukt: ${err.message || err}. Het vorige projectbestand is niet aangeraakt.`);
    }
  }
  const tijdStempel = () => { const d = new Date(), t = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${t(d.getMonth() + 1)}-${t(d.getDate())}_${t(d.getHours())}${t(d.getMinutes())}${t(d.getSeconds())}`; };
  async function kopieerMap(van, naar, onVoortgang, teller = { n: 0 }) {
    for await (const [naam, h] of van.entries()) {
      if (h.kind === 'directory') await kopieerMap(h, await naar.getDirectoryHandle(naam, { create: true }), onVoortgang, teller);
      else { await schrijfBestandInMap(naar, naam, await h.getFile()); if (++teller.n % 10 === 0) onVoortgang?.(`puntenwolk meekopiëren… ${teller.n} bestanden`); }
    }
  }
  /** Project in `map` opslaan: ondergrond\, de vorige versie naar backup\ (laatste 10), dan <map>.pvproj. */
  async function projectOpslaanInMap(map, onVoortgang) {
    if (!(await magSchrijvenMap(map))) throw new Error('geen toestemming om in de projectmap te schrijven');
    await maakSubmappen(map);
    // Opslaan als naar een andere map: de vakken van A gaan mee
    if (laatsteBestand?.tegelbron) {
      const pw = await map.getDirectoryHandle('puntenwolk', { create: true });
      const naam = laatsteBestand.map.name;
      let zelfde = false;
      try { zelfde = await (await pw.getDirectoryHandle(naam)).isSameEntry(laatsteBestand.map); } catch { /* bestaat nog niet */ }
      if (!zelfde) {
        const doel = await pw.getDirectoryHandle(naam, { create: true });
        await kopieerMap(laatsteBestand.map, doel, onVoortgang);
        laatsteBestand = maakTegelbron(doel, laatsteBestand.info);
      }
    }
    onVoortgang?.(`Project opslaan in ${map.name}…`);
    const opt = { inMap: true };
    const blob = maakProjectBlob(opt);
    const og = await map.getDirectoryHandle('ondergrond', { create: true });
    for (const [k, v] of Object.entries(opt.ondergrondUit)) {
      if (v) await schrijfBestandInMap(og, `${k}.json`, JSON.stringify(v));
      else { try { await og.removeEntry(`${k}.json`); } catch { /* */ } }
    }
    const naam = `${map.name}.pvproj`;
    let backup = null;
    try {
      const oud = await leesBestandUitMap(map, naam);
      if (oud.size > 0) {
        const bk = await map.getDirectoryHandle('backup', { create: true });
        backup = `${map.name}_${tijdStempel()}.pvproj`;
        await schrijfBestandInMap(bk, backup, oud);
        const lijst = [];
        for await (const [n, h] of bk.entries()) if (h.kind === 'file' && n.endsWith('.pvproj')) lijst.push(n);
        lijst.sort();
        while (lijst.length > 10) { try { await bk.removeEntry(lijst.shift()); } catch { /* */ } }
      }
    } catch { /* nog geen vorige versie */ }
    await schrijfBestandInMap(map, naam, blob);
    const f = await leesBestandUitMap(map, naam);
    if (f.size !== blob.size) throw new Error(`het projectbestand is ${f.size} bytes i.p.v. ${blob.size}`);
    return { naam, grootte: blob.size, backup };
  }
  async function opslaanLosBestand(als) {
    let handle = null, nieuwGekozen = false;
    if (!als && projectHandle && await magSchrijven(projectHandle)) handle = projectHandle;
    else {
      handle = await kiesOpslag(projectNaamVoorstel(), 'project');
      if (handle === false) { statusEl.textContent = 'Opslaan geannuleerd'; return; }
      nieuwGekozen = !!handle;
    }
    const naam = handle?.name || projectNaamVoorstel();
    statusEl.style.color = ''; statusEl.textContent = 'Project opslaan…';
    await new Promise(r => setTimeout(r, 20));
    let blob;
    try {
      blob = maakProjectBlob();
    } catch (err) {
      // bv. te weinig geheugen bij een heel grote puntenwolk: niet stil een leeg bestand laten staan
      console.error(err);
      if (nieuwGekozen) { try { if ((await handle.getFile()).size === 0) await handle.remove?.(); } catch { /* */ } }   // alleen een leeg, net aangemaakt bestand opruimen
      toonFout(`Project opslaan mislukt: ${err.message || err}. Probeer het zonder puntenwolk of met minder punten.`);
      return;
    }
    const opgeslagen = await schrijfBestand(handle, blob, naam);
    if (handle && opgeslagen === handle.name && /^Opgeslagen:/.test(statusEl.textContent)) {
      projectHandle = handle;
      toonProjectBestand(handle.name);
      statusEl.textContent = `${nieuwGekozen ? 'Opgeslagen als' : 'Opgeslagen (overschreven)'}: ${handle.name} (${(blob.size / 1e6).toFixed(1)} MB)`;
    }
  }
  projectOpslaanKnop.addEventListener('click', () => projectOpslaan(false));
  projectOpslaanAlsKnop.addEventListener('click', () => projectOpslaan(true));

  document.getElementById('projectOpenKnop')?.addEventListener('click', () => toonProjectOpenen());
  async function openLosProjectbestand() {
    if (natief) {   // eigen venster: Windows-kiezer van de exe
      let pad;
      try {
        ({ pad } = await (await natiefVraag('kies', null, { methode: 'POST', kop: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ soort: 'open', titel: 'Project openen', filter: [{ naam: 'Profielviewer-project (*.pvproj, *.json)', patroon: '*.pvproj;*.json' }, { naam: 'Alle bestanden', patroon: '*.*' }] }) })).json());
      } catch (err) { toonFout(`Bestand kiezen lukte niet: ${err.message}`); return; }
      if (!pad) return;
      // een .pvproj hoort bij een projectmap: die openen (met vakken, ondergrond en uitvoer)
      if (/\.pvproj$/i.test(pad)) { await openProjectMap(natieveMap(mapVan(pad)), naamVan(pad)); return; }
      const h = natiefBestand(pad), bestand = await h.getFile();
      projectMap = null;
      toonProjectBestand(bestand.name);
      if (await laadProjectBestand(bestand)) projectHandle = h;
      return;
    }
    if (!window.showOpenFilePicker) { projectLadenVeld.click(); return; }
    let h;
    try {
      [h] = await window.showOpenFilePicker({ id: 'ptsviewer-project', startIn: 'documents', multiple: false,
        types: [{ description: 'Profielviewer-project', accept: { 'application/json': ['.json'] } }] });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Bestandskiezer niet beschikbaar, val terug op het gewone venster:', err);
      projectLadenVeld.click(); return;
    }
    const bestand = await h.getFile();
    projectMap = null;
    toonProjectBestand(bestand.name);
    if (await laadProjectBestand(bestand)) projectHandle = h;
  }

  /* Recente projectmappen (in de browser bewaard, zodat je ze met één klik terug opent). */
  function recentDb() {
    return new Promise((ok, fout) => {
      const r = indexedDB.open('profielviewer', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('recent', { keyPath: 'naam' });
      r.onsuccess = () => ok(r.result); r.onerror = () => fout(r.error);
    });
  }
  async function bewaarRecentProject(map) {
    // eigen venster: de exe houdt de lijst bij (paden, werkt ook na een herstart)
    if (map?.pvPad) {
      try { await natiefVraag('recent', null, { methode: 'POST', kop: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pad: map.pvPad }) }); }
      catch (err) { console.warn('recente projecten bewaren mislukt:', err); }
      return;
    }
    try {
      const db = await recentDb();
      const lijst = await leesRecent(db);
      for (const r of lijst) if (r.naam !== map.name && await r.handle.isSameEntry(map).catch(() => false)) await new Promise(ok => { const tx = db.transaction('recent', 'readwrite'); tx.objectStore('recent').delete(r.naam); tx.oncomplete = ok; });
      await new Promise((ok, fout) => { const tx = db.transaction('recent', 'readwrite'); tx.objectStore('recent').put({ naam: map.name, handle: map, tijd: Date.now() }); tx.oncomplete = ok; tx.onerror = () => fout(tx.error); });
      const alle = (await leesRecent(db)).sort((a, b) => b.tijd - a.tijd);
      for (const r of alle.slice(8)) await new Promise(ok => { const tx = db.transaction('recent', 'readwrite'); tx.objectStore('recent').delete(r.naam); tx.oncomplete = ok; });
    } catch (err) { console.warn('recente projecten bewaren mislukt:', err); }
  }
  function leesRecent(db) {
    return new Promise((ok) => { const tx = db.transaction('recent', 'readonly'); const r = tx.objectStore('recent').getAll(); r.onsuccess = () => ok(r.result || []); r.onerror = () => ok([]); });
  }
  async function toonProjectOpenen() {
    const dlg = document.getElementById('projectOpenDialoog');
    if (!dlg || !kanMapKiezen()) { openLosProjectbestand(); return; }
    const vak = document.getElementById('poRecent'), info = document.getElementById('poInfo');
    vak.innerHTML = ''; info.textContent = '';
    let lijst = [];
    if (natief) {
      try { lijst = await (await natiefVraag('recent', null)).json(); } catch (err) { console.warn('recente projecten lezen mislukt:', err); }
    } else {
      try { lijst = (await leesRecent(await recentDb())).sort((a, b) => b.tijd - a.tijd); } catch { /* */ }
    }
    document.getElementById('poGeenRecent').hidden = lijst.length > 0;
    for (const r of lijst) {
      const k = document.createElement('button');
      k.type = 'button'; k.className = 'breed'; k.style.textAlign = 'left';
      k.innerHTML = `<b></b> <span class="zacht"></span>`;
      k.querySelector('b').textContent = r.naam;
      k.querySelector('span').textContent = '· ' + new Date(r.tijd).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
      if (r.pad) k.title = r.pad;
      k.onclick = async () => {
        if (r.pad) {   // eigen venster: geen toestemming nodig
          if (!r.bestaat) {
            info.textContent = `${r.pad} is niet gevonden (verplaatst of verwijderd?). Hij is uit de lijst gehaald; kies de map opnieuw met "Projectmap kiezen".`;
            k.remove();
            natiefVraag('recent/weg', null, { methode: 'POST', kop: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pad: r.pad }) }).catch(() => {});
            return;
          }
          dlg.close(); await openProjectMap(natieveMap(r.pad)); return;
        }
        try {
          if (await r.handle.requestPermission({ mode: 'readwrite' }) !== 'granted') { info.textContent = 'Geen toestemming voor deze map.'; return; }
          dlg.close(); await openProjectMap(r.handle);
        } catch (err) { info.textContent = `Openen lukte niet (map verplaatst of verwijderd?): ${err.message}`; }
      };
      vak.appendChild(k);
    }
    document.getElementById('poAnnuleer').onclick = () => dlg.close();
    document.getElementById('poLos').onclick = () => { dlg.close(); openLosProjectbestand(); };
    document.getElementById('poMap').onclick = async () => {
      try {
        const map = await kiesMap({ id: 'pv-projectmap', titel: 'Projectmap openen' });
        dlg.close(); await openProjectMap(map);
      } catch (err) { if (err.name !== 'AbortError') info.textContent = `Map kiezen lukte niet: ${err.message}`; }
    };
    dlg.showModal();
  }
  /** Een projectmap openen: het .pvproj-bestand, de ondergrond en de vakken van de puntenwolk. */
  /** voorkeur: naam van het .pvproj dat geopend moet worden (bv. gekozen of gesleept), anders <map>.pvproj of het nieuwste. */
  async function openProjectMap(map, voorkeur) {
    markeerBezig('project openen', map.name);
    try {
      let bestand = null;
      if (voorkeur) { try { bestand = await leesBestandUitMap(map, voorkeur); } catch { /* weg? */ } }
      if (!bestand) { try { bestand = await leesBestandUitMap(map, `${map.name}.pvproj`); } catch { /* andere naam? */ } }
      if (!bestand) {
        for await (const [n, h] of map.entries()) if (h.kind === 'file' && n.toLowerCase().endsWith('.pvproj')) { const f = await h.getFile(); if (!bestand || f.lastModified > bestand.lastModified) bestand = f; }
      }
      if (!bestand) { toonFout(`In ${map.name} staat geen projectbestand (.pvproj). Kies de map waarin het project is opgeslagen.`); return false; }
      statusEl.style.color = ''; statusEl.textContent = `${map.name}\\${bestand.name} openen…`;
      let project;
      try { project = leesProjectTekst(await bestand.text()); }
      catch (e) { toonFout(`${bestand.name} is onvolledig of beschadigd (${e.message}). In ${map.name}\\backup\\ staan de vorige versies: kopieer de nieuwste terug naast de projectmap en geef hem de naam ${map.name}.pvproj.`); return false; }
      // ondergrond terug in het project
      const og = await map.getDirectoryHandle('ondergrond', { create: true });
      const leesOg = async (k) => { try { return JSON.parse(await (await leesBestandUitMap(og, `${k}.json`)).text()); } catch { return null; } };
      if (project.ondergrond?.bgt) project.bgtLagen = await leesOg('bgt') || [];
      if (project.ondergrond?.bomen) project.boomLagen = await leesOg('bomen') || [];
      if (project.ondergrond?.kadaster) project.percelen = await leesOg('kadaster');
      projectMap = map; projectHandle = null;
      toonProjectBestand(`${map.name}\\${bestand.name}`);
      bewaarRecentProject(map);
      if (project.puntenwolkMap) {
        let wm = map;
        for (const deel of project.puntenwolkMap.split('/')) wm = await wm.getDirectoryHandle(deel);
        const info = JSON.parse(await (await leesBestandUitMap(wm, 'info.json')).text());
        const pi = project.puntenwolkInstellingen || {};
        const zet = (id, v) => { const e = document.getElementById(id); if (e && v != null) { if (typeof v === 'boolean') e.checked = v; else e.value = String(v); } };
        zet('wolkAMaaiveld', !!pi.maaiveld); zet('oppervlakModus', pi.oppervlak);
        if (pi.punten && [...document.getElementById('puntDichtheid').options].some(o => o.value === String(pi.punten))) zet('puntDichtheid', pi.punten);
        detailStrook = null; volleProfielen = null; volleCache.clear();
        wachtendProject = project;
        await laadBestand(maakTegelbron(wm, info), false);
        if (wachtendProject === project) wachtendProject = null;
        return true;
      }
      return await verwerkProjectObject(project, bestand.name);
    } catch (err) {
      console.error(err);
      toonFout(`Project openen mislukt: ${err.message || err}`);
      return false;
    } finally { markeerKlaar(); }
  }

  document.getElementById('projectNieuwKnop')?.addEventListener('click', () => {
    if ((xs || asPunten.length >= 2) && !confirm('Nieuw project beginnen?\n\nHet huidige project wordt gesloten. Niet-opgeslagen werk gaat verloren — kies eerst Opslaan als je het wilt bewaren.')) return;
    // projectgegevens van de stempel horen bij het oude project; je eigen naam, status, schalen en logo's blijven staan
    try {
      const inst = JSON.parse(localStorage.getItem(PDF_OPSLAG) || 'null');
      if (inst) {
        for (const k of ['projectnaam', 'projectnummer', 'tekeningnummer', 'opdrachtgever', 'omschrijving', 'revisie']) delete inst[k];
        localStorage.setItem(PDF_OPSLAG, JSON.stringify(inst));
      }
    } catch { /* geen opslag */ }
    statusEl.textContent = 'Nieuw project…';
    location.reload();
  });

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); projectOpslaan(e.shiftKey); }
    else if (k === 'o' && !e.shiftKey) { e.preventDefault(); document.getElementById('projectOpenKnop')?.click(); }
    else if (k === 'n' && !e.shiftKey) { e.preventDefault(); document.getElementById('projectNieuwKnop')?.click(); }
  });

  projectLadenVeld.addEventListener('change', async (e) => {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    projectHandle = null;   // gewoon venster: geen bestand om in terug te schrijven, Opslaan vraagt dan om een bestand
    toonProjectBestand(bestand.name);
    await laadProjectBestand(bestand);
    e.target.value = '';
  });
  async function laadProjectBestand(bestand) {
    markeerBezig('project openen', bestand.name);
    try { return await laadProjectBestandBinnen(bestand); } finally { markeerKlaar(); }
  }
  async function laadProjectBestandBinnen(bestand) {
    try {
      statusEl.textContent = `${bestand.name} openen…`;
      let project;
      try { project = leesProjectTekst(await bestand.text()); }
      catch (e) {
        const mb = (bestand.size / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 });
        toonFout(bestand.size === 0
          ? `${bestand.name} is leeg (0 bytes): het opslaan is waarschijnlijk niet afgemaakt (bv. vastgelopen op geheugen). Open een eerdere versie van het project, of lees de puntenwolk opnieuw in.`
          : `${bestand.name} (${mb} MB) is onvolledig of beschadigd: het opslaan is waarschijnlijk halverwege gestopt (bv. vastgelopen op geheugen). Open een eerdere versie van het project, of lees de puntenwolk opnieuw in. (${e.message})`);
        return false;
      }
      return await verwerkProjectObject(project, bestand.name);
    } catch (err) {
      statusEl.textContent = `kon ${bestand.name} niet als project lezen: ${err.message}`;
      return false;
    }
  }
  async function verwerkProjectObject(project, bestandNaam) {
    const bestand = { name: bestandNaam };
    try {
   // puntenwolk komt nu uit het project, niet uit een los bestand
      const wolk = decodeerPuntenwolk(project.puntenwolk);
      if (wolk && wolk.xs.length >= 3) {
        // puntenwolk zit in het project: geen los .pts/.las/.laz nodig
        laatsteBestand = null; detailStrook = null; volleProfielen = null; volleCache.clear();
        wachtendProject = project;
        const ok = await activeerPuntenwolk(wolk.xs, wolk.ys, wolk.zs, project.bronBestand || bestand.name,
          ` — uit project ${bestand.name}`, performance.now(), wolk.cs);
        if (!ok) wachtendProject = null;
      } else if (xs) {
        // puntenwolk is al geladen (evt. van een vorige sessie in dit
        // tabblad) — meteen toepassen
        pasProjectToe(project);
        statusEl.textContent = `Project geladen (${bestand.name})`;
      } else {
        // nog geen puntenwolk: bewaren tot de gebruiker het bijbehorende
        // bestand kiest, dan pas kan de as/hoogte-informatie kloppen
        wachtendProject = project;
        const naamHint = project.bronBestand ? ` — laad nu "${project.bronBestand}" hierboven om verder te gaan` : '';
        statusEl.textContent = `Project geladen (${bestand.name})${naamHint}`;
      }
    } catch (err) {
      statusEl.textContent = `kon ${bestand.name} niet als project lezen: ${err.message}`;
      return false;
    }
    return true;
  }

  wisBgtKnop.addEventListener('click', () => {
    bgtLagen = [];
    wisBgtKnop.disabled = true;
    tekenVlak();
    tekenDwarsVoorHuidigeStation();
  });

  wisBomenKnop.addEventListener('click', () => {
    boomLagen = [];
    wisBomenKnop.disabled = true;
    tekenVlak();
    tekenDwarsVoorHuidigeStation();
    if (drieDActief) bouwDrieDGeometrie();
  });

  /* ────────────────────────────────────────────────────────────────
     SVG-lijngrafieken (lengteprofiel / dwarsprofiel) — bewust eenvoudig,
     geen zoom/pan zoals in de echte tool: dit is een proef, geen product.
     ──────────────────────────────────────────────────────────────── */

  /** "maten elke": 0 = geen maten; leeg/ongeldig = standaard. */
  function matenWaarde(veld, standaard) {
    const v = Number(veld.value);
    if (veld.value !== '' && v === 0) return 0;
    return v > 0 ? v : standaard;
  }

  // Marges van de grafiek (schermpixels). De PDF-uitvoer rekent met dezelfde
  // waarden om de schaal (1:50 enz.) exact te laten kloppen.
  const GRAFIEK_MARGE_L = 60, GRAFIEK_MARGE_R = 14, GRAFIEK_MARGE_T = 24, GRAFIEK_LEGENDA_W = 196;
  const grafiekMargeR = (legenda) => legenda ? GRAFIEK_LEGENDA_W + GRAFIEK_MARGE_R : GRAFIEK_MARGE_R;
  const komma = (v, d = 2) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d).replace('.', ',');

  function tekenGrafiek(svgEl, reeks, xVeld, xLabel, midden, matenInterval, overdrijving, zoomState, bomen, peil = null, opties = {}) {
    svgEl.innerHTML = '';
    // Twee puntenwolken: A = de gewone (hoogte), B = vergelijkingswolk (hoogteB).
    // Elk aan/uit te zetten. Staat alleen B aan, dan wordt B de "hoofdlijn"
    // (met de maten en de BGT-hoogtes), in de kleur van B.
    const metB = !!wolkB && reeks.some(p => p.hoogteB != null);
    const tA = !metB || toonWolkA, tB = metB && toonWolkB;
    const hoofdIsB = metB && !tA && tB;
    const extraB = metB && tA && tB;
    if (metB && !tA && !tB) return;
    if (hoofdIsB) {
      const bgt = reeks.bgt;
      reeks = reeks.map(p => ({ ...p, hoogte: p.hoogteB ?? null, hoogteB: null }));
      reeks.bgt = bgt;
    }
    const geldig = reeks.filter(p => p.hoogte !== null);
    if (geldig.length < 2) return;

    const bgtModus = document.getElementById('bgtInProfiel')?.value || 'hoogtes';
    // BGT in de doorsnede: snijpunten (grenzen) en/of de gekleurde band (stroken).
    // Een DXF met alleen losse lijnen (zonder vlakken of vlaknamen) heeft wel
    // grenzen maar geen stroken — die moet ook getoond worden.
    const heeftBgt = !!(reeks.bgt && (reeks.bgt.stroken.length || reeks.bgt.grenzen.length)) && bgtModus !== 'uit';
    const heeftBgtStrip = heeftBgt && reeks.bgt.stroken.length > 0;
    const breed = svgEl.clientWidth || 400, hoog = svgEl.clientHeight || 240;
    // legenda rechts (alleen dwarsprofiel): op het scherm als er ruimte is, in de PDF op verzoek
    const isDwars = midden != null && xVeld === 'offset';
    const legendaAan = isDwars && (opties.legenda ?? breed >= 640);
    // BGT met alleen lijnen (geen vlakken, dus geen gekleurde band): dan een
    // maatketting met de afstanden tussen de lijnen op de plek van de band
    const heeftKetting = isDwars && heeftBgt && !heeftBgtStrip && reeks.bgt.grenzen.length > 0;
    const margeL = GRAFIEK_MARGE_L, margeR = grafiekMargeR(legendaAan), margeB = (heeftBgtStrip || heeftKetting) ? 58 : 32, margeT = GRAFIEK_MARGE_T;
    const plotR = breed - margeR;   // rechterrand van het tekenvlak
    const xMin = reeks[0][xVeld], xMax = reeks[reeks.length - 1][xVeld];
    const hoogtes = geldig.map(p => p.hoogte);
    if (extraB) for (const p of reeks) if (p.hoogteB != null) hoogtes.push(p.hoogteB);
    for (const p of reeks) { if (p.hoogteO != null) hoogtes.push(p.hoogteO); if (p.hoogteD != null) hoogtes.push(p.hoogteD); }
    const dv = opties.doorvaart !== undefined ? opties.doorvaart : dvVoorGrafiek(reeks, midden != null && xVeld === 'offset', xVeld);
    if (dv) { hoogtes.push(dv.P + dv.H, dv.P); if (dv.D) hoogtes.push(dv.PD - dv.D); }
    const sn = opties.snoei !== undefined ? opties.snoei : snVoorGrafiek(reeks, isDwars, xVeld);
    if (sn && sn.hoogtes.length) { let a = Infinity, b = -Infinity; for (const h of sn.hoogtes) { if (h < a) a = h; if (h > b) b = h; } hoogtes.push(a, b); }
    if (peil != null) hoogtes.push(peil);   // waterlijn altijd binnen beeld
    let hMin = Math.min(...hoogtes), hMax = Math.max(...hoogtes);
    if (hMax - hMin < 0.2) { const m = (hMax + hMin) / 2; hMin = m - 0.1; hMax = m + 0.1; }
    const marge = (hMax - hMin) * 0.1;
    hMin -= marge; hMax += marge;

    const xSchaal = (breed - margeL - margeR) / Math.max(1e-9, xMax - xMin);
    const px = (v) => margeL + (v - xMin) * xSchaal;
    let py;
    if (overdrijving) {
      // vaste verhouding: hoogteverschillen worden `overdrijving` keer zo
      // groot getekend als horizontale afstanden, ongeacht de paneelhoogte —
      // gecentreerd op het midden van de data, met zoom/pan (zie hieronder)
      // om te navigeren als dat niet in één keer past.
      const vSchaal = xSchaal * overdrijving;
      let hMid = (hMin + hMax) / 2;
      // Past het hoogteverschil niet in het paneel (bv. een brug met water ernaast
      // bij 1:1), dan centreren op het profiel rond de as / het midden — daar kijk
      // je naar — in plaats van op het midden van alle hoogtes, waardoor juist dat
      // stuk buiten beeld viel. Binnen de data geklemd.
      const zichtbaarM = (hoog - margeB - margeT) / vSchaal;
      if (hMax - hMin > zichtbaarM) {
        const xm = midden != null ? midden : (xMin + xMax) / 2, kwart = (xMax - xMin) / 4;
        const kern = geldig.filter(p => Math.abs(p[xVeld] - xm) <= kwart).map(p => p.hoogte).sort((a, b) => a - b);
        if (kern.length) hMid = kern[Math.floor(kern.length / 2)];
        hMid = Math.min(Math.max(hMid, hMin + zichtbaarM / 2), hMax - zichtbaarM / 2);
      }
      const middenY = margeT + (hoog - margeB - margeT) / 2;
      py = (v) => middenY - (v - hMid) * vSchaal;
      var pyInvers = (y) => hMid - (y - middenY) / vSchaal;
    } else {
      const hSchaal = (hoog - margeB - margeT) / Math.max(1e-9, hMax - hMin);
      py = (v) => hoog - margeB - (v - hMin) * hSchaal;
      var pyInvers = (y) => hMin + (hoog - margeB - y) / hSchaal;
    }
    // zoom/pan: van grafiek-coördinaten naar scherm en terug
    const zS = zoomState?.schaal || 1, zX = zoomState?.panX || 0, zY = zoomState?.panY || 0;
    const naarSchermY = (y) => zY + zS * y;
    const vanSchermY = (sy) => (sy - zY) / zS;

    svgEl.setAttribute('viewBox', `0 0 ${breed} ${hoog}`);
    const ns = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(ns, 'g');
    if (zoomState) {
      g.setAttribute('transform', `translate(${zoomState.panX} ${zoomState.panY}) scale(${zoomState.schaal})`);
    }

    // Tekst remt af tegen het zoomniveau (vierkantswortel) zodat labels niet
    // 1-op-1 meegroeien met de grafiek — anders wordt tekst bij ver inzoomen
    // onhandig groot. Schaalt in-place om het eigen ankerpunt, dus de tekst
    // blijft precies bij het punt staan waar hij bij hoort.
    const tekstTegenSchaal = zoomState ? 1 / Math.sqrt(zoomState.schaal) : 1;
    function zetTekstTransform(el, x, y, extra) {
      const deel = tekstTegenSchaal !== 1 ? `translate(${x} ${y}) scale(${tekstTegenSchaal}) translate(${-x} ${-y})` : '';
      const geheel = [deel, extra].filter(Boolean).join(' ');
      if (geheel) el.setAttribute('transform', geheel);
    }

    // Hoogteschaal (raster + getallen) staat NIET in de zoomgroep maar ligt
    // vast in beeld: bij in-/uitzoomen en verschuiven past de verdeling zich
    // aan aan wat er op dat moment zichtbaar is, en blijven de getallen links
    // staan. Het raster komt achter de grafiek, de getallen ervoor.
    const rasterLaag = document.createElementNS(ns, 'g');
    const asLaag = document.createElementNS(ns, 'g');
    const bezet = [];   // tekstkaders (schermpixels) — zie kaderVrij() verderop
    let napZichtbaar = false;
    {
      const boven = pyInvers(vanSchermY(margeT)), onder = pyInvers(vanSchermY(hoog - margeB));
      const hLaag = Math.min(boven, onder), hHoog = Math.max(boven, onder);
      const plotHoogte = hoog - margeB - margeT;
      const stapH = mooieStap((hHoog - hLaag) / Math.max(2, Math.round(plotHoogte / 45)));
      const decimalen = stapH >= 1 ? 2 : stapH >= 0.1 ? 2 : 3;
      const achtergrond = document.createElementNS(ns, 'rect');
      achtergrond.setAttribute('x', 0); achtergrond.setAttribute('y', 0);
      achtergrond.setAttribute('width', margeL - 1); achtergrond.setAttribute('height', hoog);
      achtergrond.setAttribute('fill', '#ffffff'); achtergrond.setAttribute('fill-opacity', '0.92');
      asLaag.append(achtergrond);
      const asLijn = document.createElementNS(ns, 'line');
      asLijn.setAttribute('x1', margeL - 1); asLijn.setAttribute('x2', margeL - 1);
      asLijn.setAttribute('y1', margeT); asLijn.setAttribute('y2', hoog - margeB);
      asLijn.setAttribute('class', 'maatlijn');
      asLaag.append(asLijn);
      for (let h = Math.ceil(hLaag / stapH) * stapH; h <= hHoog + 1e-9; h += stapH) {
        const y = naarSchermY(py(h));
        if (y < margeT - 0.5 || y > hoog - margeB + 0.5) continue;
        const lijn = document.createElementNS(ns, 'line');
        lijn.setAttribute('x1', margeL); lijn.setAttribute('x2', breed - margeR);
        lijn.setAttribute('y1', y); lijn.setAttribute('y2', y);
        lijn.setAttribute('class', 'maatlijn');
        rasterLaag.append(lijn);
        const isNul = Math.abs(h) < 1e-9;
        const tekst = document.createElementNS(ns, 'text');
        tekst.setAttribute('x', margeL - 6); tekst.setAttribute('y', y + 3);
        tekst.setAttribute('text-anchor', 'end'); tekst.setAttribute('class', isNul ? 'tekst tekst-nap' : 'tekst');
        tekst.textContent = (isNul ? 0 : h).toFixed(decimalen);
        asLaag.append(tekst);
      }
      // NAP-lijn (0,00): altijd, ook als 0 niet op een rasterstap valt, als hij in beeld is
      const y0 = naarSchermY(py(0));
      if (y0 >= margeT - 0.5 && y0 <= hoog - margeB + 0.5) {
        napZichtbaar = true;
        const nap = document.createElementNS(ns, 'line');
        nap.setAttribute('x1', margeL); nap.setAttribute('x2', plotR);
        nap.setAttribute('y1', y0); nap.setAttribute('y2', y0);
        nap.setAttribute('class', 'nap-lijn');
        rasterLaag.append(nap);
        const napT = document.createElementNS(ns, 'text');
        napT.setAttribute('x', plotR - 4); napT.setAttribute('y', y0 - 4);
        napT.setAttribute('text-anchor', 'end'); napT.setAttribute('class', 'nap-tekst');
        napT.textContent = 'NAP 0,00';
        asLaag.append(napT);
        bezet.push({ x0: plotR - 62, x1: plotR, y0: y0 - 16, y1: y0 + 1 });
      }
      // eenheid boven de hoogte-as
      const eenheid = document.createElementNS(ns, 'text');
      eenheid.setAttribute('x', 4); eenheid.setAttribute('y', 14);
      eenheid.setAttribute('class', 'tekst tekst-eenheid');
      eenheid.textContent = 'm NAP';
      asLaag.append(eenheid);

      // Afstandsschaal langs de onderkant (offset of station): een mooie stap
      // (1, 2, 5, 10 … m) passend bij wat er zichtbaar is, met verticale
      // rasterlijnen — zo zie je meteen hoe breed alles is. Vast in beeld,
      // past zich aan bij in-/uitzoomen.
      const vanSchermX = (sx) => (sx - zX) / zS;
      const xInvers = (gx) => xMin + (gx - margeL) / xSchaal;
      const links = xInvers(vanSchermX(margeL)), rechts = xInvers(vanSchermX(plotR));
      const plotB = plotR - margeL;
      const stapX = mooieStap((rechts - links) / Math.max(2, Math.round(plotB / 75)));
      const yAs = hoog - 20;
      const onderBand = document.createElementNS(ns, 'rect');
      onderBand.setAttribute('x', margeL); onderBand.setAttribute('y', yAs);
      onderBand.setAttribute('width', Math.max(0, plotB)); onderBand.setAttribute('height', 20);
      onderBand.setAttribute('fill', '#ffffff'); onderBand.setAttribute('fill-opacity', '0.92');
      asLaag.append(onderBand);
      const xAs = document.createElementNS(ns, 'line');
      xAs.setAttribute('x1', margeL); xAs.setAttribute('x2', plotR);
      xAs.setAttribute('y1', yAs); xAs.setAttribute('y2', yAs);
      xAs.setAttribute('class', 'afstand-as');
      asLaag.append(xAs);
      // asnaam "offset (m)": in de legendakolom, of rechts onderaan (getallen die
      // daar overheen zouden vallen, worden overgeslagen)
      const labelBreedte = xLabel.length * 13.8 * 0.56 + 6;
      const labelVrijVanaf = legendaAan ? Infinity : plotR - labelBreedte;
      const xDec = stapX >= 1 ? 0 : stapX >= 0.1 ? 1 : 2;
      for (let v = Math.ceil(links / stapX - 1e-9) * stapX; v <= rechts + 1e-9; v += stapX) {
        const sx = zX + zS * px(v);
        if (sx < margeL - 0.5 || sx > plotR + 0.5) continue;
        const isAs = isDwars && Math.abs(v) < 1e-9;
        const rl = document.createElementNS(ns, 'line');
        rl.setAttribute('x1', sx); rl.setAttribute('x2', sx);
        rl.setAttribute('y1', margeT); rl.setAttribute('y2', hoog - margeB);
        rl.setAttribute('class', 'maatlijn-v');
        rasterLaag.append(rl);
        const tik = document.createElementNS(ns, 'line');
        tik.setAttribute('x1', sx); tik.setAttribute('x2', sx);
        tik.setAttribute('y1', yAs); tik.setAttribute('y2', yAs + 4);
        tik.setAttribute('class', 'afstand-as');
        asLaag.append(tik);
        const tekst = (Math.abs(v) < 1e-9 ? 0 : v).toFixed(xDec).replace('-', '\u2212');
        const halve = tekst.length * 13.8 * 0.3 + 2;
        if (sx + halve > labelVrijVanaf || sx - halve < margeL - 2 || sx + halve > plotR + 8) continue;
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', sx); t.setAttribute('y', hoog - 4);
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', isAs ? 'tekst tekst-nap' : 'tekst');
        t.textContent = tekst;
        asLaag.append(t);
      }
      var xLabelPlek = legendaAan ? { x: plotR + 12, anker: 'start' } : { x: plotR, anker: 'end' };
    }

    // 0-offset / middenlijn (voor het dwarsprofiel de as, voor het lengteprofiel niet relevant)
    if (midden != null) {
      const x0 = px(midden);
      const lijn = document.createElementNS(ns, 'line');
      lijn.setAttribute('x1', x0); lijn.setAttribute('x2', x0);
      lijn.setAttribute('y1', margeT); lijn.setAttribute('y2', hoog - margeB);
      lijn.setAttribute('class', 'huidig-station');
      lijn.setAttribute('vector-effect', 'non-scaling-stroke');
      g.append(lijn);

      // L/R — komt overeen met de kijkrichting-pijl op de as in het bovenaanzicht
      // (vast in beeld, net als de hoogteschaal)
      const linksLabel = document.createElementNS(ns, 'text');
      linksLabel.setAttribute('x', margeL + 4); linksLabel.setAttribute('y', margeT + 12);
      linksLabel.setAttribute('class', 'tekst'); linksLabel.textContent = 'L';
      asLaag.append(linksLabel);
      const rechtsLabel = document.createElementNS(ns, 'text');
      rechtsLabel.setAttribute('x', plotR - 4); rechtsLabel.setAttribute('y', margeT + 12);
      rechtsLabel.setAttribute('text-anchor', 'end'); rechtsLabel.setAttribute('class', 'tekst');
      rechtsLabel.textContent = 'R';
      asLaag.append(rechtsLabel);
    }

    // waterpeil: lichtblauw vlak waar het profiel onder het peil ligt, een blauwe
    // waterlijn over die stukken, een dunne stippellijn over de hele breedte en
    // het waterpeilteken (▽) met de hoogte
    let waterInfo = null;
    if (peil != null) {
      const yP = py(peil);
      const runs = [];
      let huidig = null;
      for (let i = 0; i < reeks.length; i++) {
        const p = reeks[i], q = reeks[i - 1];
        if (p.hoogte === null) {
          // gat in het profiel: het waterstuk recht omhoog naar het peil afsluiten
          if (huidig) { huidig.push({ x: huidig[huidig.length - 1].x, h: peil }); runs.push(huidig); huidig = null; }
          continue;
        }
        const onder = p.hoogte < peil;
        if (q && q.hoogte !== null && (q.hoogte < peil) !== onder) {
          // kruising met het peil tussen q en p: lineair interpoleren
          const t = (peil - q.hoogte) / (p.hoogte - q.hoogte);
          const xk = q[xVeld] + t * (p[xVeld] - q[xVeld]);
          if (onder) huidig = [{ x: xk, h: peil }];
          else if (huidig) { huidig.push({ x: xk, h: peil }); runs.push(huidig); huidig = null; }
        } else if (onder && !huidig) {
          huidig = [{ x: p[xVeld], h: peil }];   // begint onder water (rand van het profiel)
        }
        if (onder && huidig) huidig.push({ x: p[xVeld], h: p.hoogte });
      }
      if (huidig) { huidig.push({ x: huidig[huidig.length - 1].x, h: peil }); runs.push(huidig); }
      // water alleen links of rechts van de as (bv. rechts een lage weg, geen water):
      // een waterstuk telt mee als zijn midden aan die kant ligt
      const kantW = isDwars ? waterKant() : 'beide';
      const as0 = midden ?? 0;
      if (kantW !== 'beide') {
        for (let i = runs.length - 1; i >= 0; i--) {
          const m = (runs[i][0].x + runs[i][runs[i].length - 1].x) / 2;
          if (kantW === 'links' ? m > as0 : m < as0) runs.splice(i, 1);
        }
      }
      for (const r of runs) {
        const vlak = document.createElementNS(ns, 'path');
        vlak.setAttribute('d', 'M' + r.map(v => `${px(v.x).toFixed(1)},${py(v.h).toFixed(1)}`).join(' L') + ' Z');
        vlak.setAttribute('class', 'water-vlak');
        g.append(vlak);
        const wl = document.createElementNS(ns, 'line');
        wl.setAttribute('x1', px(r[0].x)); wl.setAttribute('x2', px(r[r.length - 1].x));
        wl.setAttribute('y1', yP); wl.setAttribute('y2', yP);
        wl.setAttribute('class', 'waterlijn');
        wl.setAttribute('vector-effect', 'non-scaling-stroke');
        g.append(wl);
      }
      const hulp = document.createElementNS(ns, 'line');
      hulp.setAttribute('x1', px(kantW === 'rechts' ? as0 : xMin)); hulp.setAttribute('x2', px(kantW === 'links' ? as0 : xMax));
      hulp.setAttribute('y1', yP); hulp.setAttribute('y2', yP);
      hulp.setAttribute('class', 'waterlijn-hulp');
      hulp.setAttribute('vector-effect', 'non-scaling-stroke');
      g.append(hulp);
      // waterpeilteken ▽ met drie streepjes eronder, op het breedste waterstuk (anders links)
      let xs0 = kantW === 'rechts' ? xMax - (xMax - xMin) * 0.06 : xMin + (xMax - xMin) * 0.06;
      if (runs.length) {
        const r = runs.reduce((a, b) => (b[b.length - 1].x - b[0].x) > (a[a.length - 1].x - a[0].x) ? b : a);
        xs0 = (r[0].x + r[r.length - 1].x) / 2;
        // breedte van het water op peilhoogte (breedste stuk); loopt het tot de
        // rand van het profiel, dan is het water minstens zo breed
        const rand = (xMax - xMin) * 0.002;
        waterInfo = { breedte: r[r.length - 1].x - r[0].x, totRand: r[0].x <= xMin + rand || r[r.length - 1].x >= xMax - rand };
      }
      const sx = px(xs0), sz = 7 * (zoomState ? 1 / Math.sqrt(zoomState.schaal || 1) : 1);
      const teken = document.createElementNS(ns, 'path');
      teken.setAttribute('d', `M${sx - sz},${yP - sz * 1.5} L${sx + sz},${yP - sz * 1.5} L${sx},${yP} Z ` +
        `M${sx - sz * 0.9},${yP + sz * 0.45} L${sx + sz * 0.9},${yP + sz * 0.45} M${sx - sz * 0.6},${yP + sz * 0.9} L${sx + sz * 0.6},${yP + sz * 0.9} M${sx - sz * 0.3},${yP + sz * 1.35} L${sx + sz * 0.3},${yP + sz * 1.35}`);
      teken.setAttribute('class', 'waterpeil-teken');
      teken.setAttribute('vector-effect', 'non-scaling-stroke');
      g.append(teken);
      const wt = document.createElementNS(ns, 'text');
      const wTekst = `waterpeil ${peil >= 0 ? '+' : ''}${peil.toFixed(2).replace('.', ',')} m NAP`;
      // past de tekst rechts van het teken niet meer in het paneel (op het scherm,
      // dus rekening houdend met zoom), dan links ervan
      const tekstW = wTekst.length * 15 * 0.58 * (zoomState ? 1 / Math.sqrt(zoomState.schaal || 1) : 1) / (zoomState?.schaal || 1);
      const zsW = zoomState?.schaal || 1, zxW = zoomState?.panX || 0;
      const rechtsPast = zxW + zsW * (sx + sz * 1.6 + tekstW) <= plotR;
      const tx = rechtsPast ? sx + sz * 1.6 : sx - sz * 1.6, ty = yP - sz * 0.6;
      wt.setAttribute('x', tx); wt.setAttribute('y', ty);
      wt.setAttribute('text-anchor', rechtsPast ? 'start' : 'end');
      wt.setAttribute('class', 'waterpeil-tekst');
      wt.textContent = wTekst;
      zetTekstTransform(wt, tx, ty);
      g.append(wt);
    }

    // doorvaartbox (achter de lijnen): boven de toetswaterstand de doorvaarthoogte,
    // eronder (gestippeld) de vereiste diepte; rood als er iets in steekt
    let dvInfo = null;
    // maatvoering in CAD-stijl (vaste grootte op het scherm): lijn, schuine maatstreepjes, tekst
    const tegen = 1 / Math.sqrt(zS);
    const dvEl = (naam, attrs, ouder = g) => { const e = document.createElementNS(ns, naam); for (const k in attrs) e.setAttribute(k, attrs[k]); ouder.append(e); return e; };
    const dvTekst = (x, y, tekst, klasse, anker = 'middle', draai = 0) => {
      const t = dvEl('text', { x, y, class: klasse, 'text-anchor': anker });
      t.textContent = tekst;
      const k = tegen;
      t.setAttribute('transform', `translate(${x} ${y}) scale(${k}) translate(${-x} ${-y})${draai ? ` rotate(${draai} ${x} ${y})` : ''}`);
      return t;
    };
    const maatH = (x0, x1, y, tekst, klasse = 'dv-maatlijn', onder = false) => {
      const t = 5 * tegen;
      // tekst niet midden op de as (daar staat de asnaam)
      let tx = (x0 + x1) / 2;
      if (midden != null && Math.abs(tx - px(midden)) * zS < 30) tx = x0 + (x1 - x0) * 0.27;
      dvEl('path', { d: `M${x0},${y} L${x1},${y} M${x0 - t},${y + t} L${x0 + t},${y - t} M${x1 - t},${y + t} L${x1 + t},${y - t} M${x0},${y - t * 1.4} L${x0},${y + t * 1.4} M${x1},${y - t * 1.4} L${x1},${y + t * 1.4}`, class: klasse, 'vector-effect': 'non-scaling-stroke' });
      if (Math.abs(x1 - x0) * zS >= tekst.length * 7.4 + 6) dvTekst(tx, onder ? y + 15 * tegen : y - 5 * tegen, tekst, klasse.replace('dv-maatlijn', 'dv-maatlijn-tekst'));
    };
    const maatV = (x, y0, y1, tekst, klasse = 'dv-maatlijn', links = false) => {
      const t = 5 * tegen;
      dvEl('path', { d: `M${x},${y0} L${x},${y1} M${x - t},${y0 + t} L${x + t},${y0 - t} M${x - t},${y1 + t} L${x + t},${y1 - t} M${x - t * 1.4},${y0} L${x + t * 1.4},${y0} M${x - t * 1.4},${y1} L${x + t * 1.4},${y1}`, class: klasse, 'vector-effect': 'non-scaling-stroke' });
      if (Math.abs(y1 - y0) * zS >= tekst.length * 7.4 + 6) dvTekst(links ? x - 5 * tegen : x + 13 * tegen, (y0 + y1) / 2, tekst, klasse.replace('dv-maatlijn', 'dv-maatlijn-tekst'), 'middle', -90);
    };
    if (dv) {
      const top = dv.P + dv.H, onder = dv.D ? dv.PD - dv.D : null;
      const binnen = (p) => p[xVeld] >= dv.x0 - 1e-9 && p[xVeld] <= dv.x1 + 1e-9;
      let minO = null, xMinO = null, raaktH = false, raaktD = false;
      for (const p of reeks) {
        if (!binnen(p)) continue;
        if (p.hoogteO != null) { if (minO == null || p.hoogteO < minO) { minO = p.hoogteO; xMinO = p[xVeld]; } if (p.hoogteO < top) raaktH = true; }
        if (onder != null && p.hoogte != null && p.hoogte > onder) raaktD = true;
      }
      dvInfo = { top, onder, minO, xMinO, raaktH, raaktD };
      // arcering voor conflicten (één patroon per grafiek)
      const defs = dvEl('defs', {});
      const pat = dvEl('pattern', { id: 'dvArcering', patternUnits: 'userSpaceOnUse', width: 7, height: 7, patternTransform: 'rotate(45)' }, defs);
      dvEl('rect', { x: 0, y: 0, width: 7, height: 7, fill: '#F6D9D1' }, pat);
      dvEl('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#C6472B', 'stroke-width': 1.6 }, pat);
      // brug als doorsnede (grijs tussen onderzijde en bovenzijde)
      let pad = '', bezig = false, stuk = [];
      const sluitBrug = () => { if (stuk.length >= 2) pad += 'M' + stuk.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L') + ' L' + stuk.slice().reverse().map(q => `${q[0].toFixed(1)},${q[2].toFixed(1)}`).join(' L') + ' Z '; stuk = []; };
      for (const p of reeks) {
        if (p.hoogteO == null || p.hoogteD == null || p.hoogteD <= p.hoogteO) { sluitBrug(); continue; }
        stuk.push([px(p[xVeld]), py(p.hoogteO), py(p.hoogteD)]);
      }
      sluitBrug();
      if (pad) dvEl('path', { d: pad, class: 'dv-brugvlak' });
      // doorvaartprofiel: streep-stippellijn boven de toetswaterstand, gestippeld voor de diepgang
      const rechthoek = (y0, y1, klasse) => dvEl('rect', { x: px(dv.x0), width: Math.max(0, px(dv.x1) - px(dv.x0)), y: Math.min(py(y0), py(y1)), height: Math.abs(py(y1) - py(y0)), class: klasse, 'vector-effect': 'non-scaling-stroke' });
      rechthoek(dv.P, top, 'dv-profiel');
      if (onder != null) rechthoek(onder, dv.PD, 'dv-profiel diep');
      // conflictvlakken: tussen de onderzijde en de bovenkant van het profiel / tussen de box en de bodem
      const conflictVlak = (veld, test, grens) => {
        let st = [];
        const sluit = () => {
          if (st.length >= 1) {
            const x0 = st[0][0], x1 = st[st.length - 1][0], w = Math.max(x1 - x0, 2);
            const pts = st.length === 1 ? [[x0 - 1, st[0][1]], [x0 + 1, st[0][1]]] : st;
            const d = 'M' + pts.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L') + ` L${(pts[pts.length - 1][0]).toFixed(1)},${py(grens).toFixed(1)} L${pts[0][0].toFixed(1)},${py(grens).toFixed(1)} Z`;
            dvEl('path', { d, class: 'dv-conflictvlak', fill: 'url(#dvArcering)', 'vector-effect': 'non-scaling-stroke' });
            void w;
          }
          st = [];
        };
        for (const p of reeks) {
          if (!binnen(p) || p[veld] == null || !test(p[veld])) { sluit(); continue; }
          st.push([px(p[xVeld]), py(p[veld])]);
        }
        sluit();
      };
      if (raaktH) conflictVlak('hoogteO', (z) => z < top, top);
      if (raaktD) conflictVlak('hoogte', (z) => z > onder, onder);
      // maatgevend schip als lijnwerk
      if (doorvaart.weergave === 'schip') {
        const wl = dv.D ? dv.PD : dv.P;
        const kiel = onder ?? (wl - Math.min(2.5, 0.45 * dv.H));
        const dek = Math.min(dv.P + 0.85, top - 0.4);
        const hutH = Math.min(2.6, Math.max(0.6, 0.62 * (top - dek)));
        const lijn = (pts, klasse = 'dv-schip', dicht = false) => dvEl('path', { d: 'M' + pts.map(([x, z]) => `${px(x).toFixed(1)},${py(z).toFixed(1)}`).join(' L') + (dicht ? ' Z' : ''), class: klasse, 'vector-effect': 'non-scaling-stroke' });
        const rh = (x0, x1, z0, z1, klasse = 'dv-schip') => lijn([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], klasse, true);
        const sb = Math.min(dvGetal(doorvaart.scheepsbreedte) ?? 11.4, dv.B);
        if (isDwars || reeks.maatgevend) {
          const m = dv.c, a = m - sb / 2, b = m + sb / 2, kim = Math.min(0.6, (dek - kiel) * 0.2);
          lijn([[a, dek], [a, kiel + kim], [a + 0.15, kiel + kim * 0.3], [a + 0.6, kiel], [b - 0.6, kiel], [b - 0.15, kiel + kim * 0.3], [b, kiel + kim], [b, dek]]);
          lijn([[a - 0.15, dek], [b + 0.15, dek]]);
          rh(a + 0.5, b - 0.5, dek, dek + Math.min(0.9, hutH * 0.35));                 // luikhoofden
          const hb = Math.min(2.6, sb * 0.23);
          rh(m - hb, m + hb, dek + Math.min(0.9, hutH * 0.35), dek + hutH);              // stuurhuis
          const rz0 = dek + hutH - 0.75, rz1 = dek + hutH - 0.25;
          for (let k = 0; k < 4; k++) { const rx = m - hb + (k + 0.5) * (2 * hb / 4); rh(rx - hb / 6, rx + hb / 6, rz0, rz1, 'dv-schip dun'); }
          lijn([[m, dek + hutH], [m, top - 0.03]]);                                      // mast tot de doorvaarthoogte
          lijn([[m - 0.8, top - 0.55], [m + 0.8, top - 0.55]]);
          maatH(px(a), px(b), py(kiel) + 12 * tegen, komma(sb, 2), 'dv-maatlijn grijs', true);
        } else {
          const lengte = Math.max(10, dvGetal(doorvaart.scheepslengte) ?? 85);
          // stuurhuis en mast (het hoogste punt) recht onder het midden van de brug
          const mid = (dv.s0 + dv.s1) / 2, a = mid - 0.0925 * lengte, b = a + lengte;
          lijn([[a, dek + 0.25], [a, kiel + 0.9], [a + 0.04 * lengte, kiel], [b - 0.11 * lengte, kiel], [b - 0.025 * lengte, kiel + 1.2], [b + 0.012 * lengte, dek + 0.55]]);
          lijn([[a, dek + 0.25], [b + 0.012 * lengte, dek + 0.55]]);
          rh(a + 0.2 * lengte, b - 0.12 * lengte, dek + 0.3, dek + 0.3 + Math.min(0.9, hutH * 0.35));   // luikhoofd
          const h0 = a + 0.025 * lengte, h1 = a + 0.16 * lengte;
          rh(h0, h1, dek + 0.3, dek + hutH);                                              // stuurhuis achter
          for (let k = 0; k < 3; k++) { const rx = h0 + (k + 0.5) * (h1 - h0) / 3; rh(rx - (h1 - h0) / 9, rx + (h1 - h0) / 9, dek + hutH - 0.75, dek + hutH - 0.25, 'dv-schip dun'); }
          const mx = (h0 + h1) / 2;
          lijn([[mx, dek + hutH], [mx, top - 0.03]]);
          lijn([[mx - 0.012 * lengte, top - 0.5], [mx + 0.012 * lengte, top - 0.5]]);
          lijn([[b - 0.03 * lengte, dek + 0.55], [b - 0.03 * lengte, dek + 1.9]]);       // voormast
        }
      }
      // maatvoering van het profiel
      const rechts = px(dv.x1) + 22 * tegen;
      maatV(rechts, py(dv.P), py(top), komma(dv.H, 2));
      if (onder != null) maatV(rechts, py(onder), py(dv.PD), komma(dv.D, 2));
      if (isDwars || reeks.maatgevend) maatH(px(dv.x0), px(dv.x1), py(top) - 12 * tegen, komma(dv.B, 2));
      // toetswaterstand met peilteken (als die afwijkt van het getekende waterpeil)
      if (peil == null || Math.abs(peil - dv.P) > 0.005) {
        dvEl('line', { x1: px(xMin), x2: px(xMax), y1: py(dv.P), y2: py(dv.P), class: 'dv-toetspeil', 'vector-effect': 'non-scaling-stroke' });
        const sx = px(xMin) + 26 * tegen, y = py(dv.P), z = 6 * tegen;
        dvEl('path', { d: `M${sx - z},${y - z * 1.5} L${sx + z},${y - z * 1.5} L${sx},${y} Z`, class: 'dv-peilteken', 'vector-effect': 'non-scaling-stroke' });
        dvTekst(sx + z * 1.6, y - z * 0.5, `toetswaterstand ${dv.P >= 0 ? '+' : '-'}${komma(Math.abs(dv.P), 2)}`, 'dv-peiltekst', 'start');
      }
    }

    // snoeicheck: begroeiing als punten, het doorloopprofiel (volgt het pad) en de snoeimarge
    let snBadges = null;
    if (sn) {
      const r = sn.r;
      const zijde = 2.4 / Math.sqrt(zS);
      const groepen = { 1: '', 2: '', 3: '' };
      for (const [x, z, c] of sn.punten) {
        if (!groepen[c] && groepen[c] !== '') continue;
        groepen[c] += `M${(px(x) - zijde / 2).toFixed(1)},${(py(z) - zijde / 2).toFixed(1)}h${zijde.toFixed(2)}v${zijde.toFixed(2)}h${(-zijde).toFixed(2)}z`;
      }
      const lijnStijl = { profiel: { fill: 'none', stroke: SN_KLEUR.profiel, 'stroke-width': 1.4, 'stroke-dasharray': '10 4 2 4', 'vector-effect': 'non-scaling-stroke' },
        marge: { fill: 'none', stroke: SN_KLEUR.oranje, 'stroke-width': 1.2, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke' } };
      if (sn.soort === 'dwars' && sn.inBereik) {
        const L = r.c - r.B / 2, R = r.c + r.B / 2, z0 = sn.zc;
        dvEl('rect', { x: px(L - r.M), width: Math.max(0, px(R + r.M) - px(L - r.M)), y: py(z0 + r.H + r.M), height: Math.max(0, py(z0) - py(z0 + r.H + r.M)), fill: '#E08A1E', 'fill-opacity': 0.06, ...lijnStijl.marge });
        dvEl('rect', { x: px(L), width: Math.max(0, px(R) - px(L)), y: py(z0 + r.H), height: Math.max(0, py(z0) - py(z0 + r.H)), fill: r.ok ? '#16803D' : '#C6472B', 'fill-opacity': 0.05, ...lijnStijl.profiel });
      }
      if (sn.soort === 'langs' && sn.lijn.length > 1) {
        const pad = (dz) => 'M' + sn.lijn.map(([s2, z]) => `${px(s2).toFixed(1)},${py(z + dz).toFixed(1)}`).join(' L');
        dvEl('path', { d: pad(r.H + r.M), ...lijnStijl.marge });
        dvEl('path', { d: pad(r.H), ...lijnStijl.profiel });
      }
      if (groepen[1]) dvEl('path', { d: groepen[1], fill: SN_KLEUR.groen, 'fill-opacity': 0.55 });
      if (groepen[2]) dvEl('path', { d: groepen[2], fill: SN_KLEUR.oranje });
      if (groepen[3]) dvEl('path', { d: groepen[3], fill: SN_KLEUR.rood });
      if (sn.soort === 'dwars' && sn.inBereik) {
        const top = sn.zc + r.H, rechts = px(r.c + r.B / 2 + r.M) + 16 * tegen;
        maatV(rechts, py(sn.zc), py(top), komma(r.H, 2));
        maatH(px(r.c - r.B / 2), px(r.c + r.B / 2), py(top + r.M) - 12 * tegen, komma(r.B, 2));
      }
      snBadges = sn.badges;
    }
    // kadastrale perceelgrenzen (dwarsprofiel): verticale streeplijnen, sectie + nummer bovenaan per vak
    const kad = opties.kadaster !== undefined ? opties.kadaster : kadVoorGrafiek(reeks, isDwars);
    if (kad) {
      for (const o of kad.grenzen) dvEl('line', { x1: px(o), x2: px(o), y1: margeT, y2: hoog - margeB, stroke: '#7A3E9D', 'stroke-width': 1.1, 'stroke-dasharray': '7 3', 'vector-effect': 'non-scaling-stroke' });
      for (const v of kad.vakken) {
        if ((px(v.tot) - px(v.van)) * zS < v.label.length * 7 + 10) continue;
        const t = dvTekst((px(v.van) + px(v.tot)) / 2, margeT + 30 * tegen, v.label, 'kad-tekst');
        t.setAttribute('fill', '#6B2F8A'); t.setAttribute('stroke', '#fff'); t.setAttribute('stroke-width', '3'); t.setAttribute('paint-order', 'stroke');
        t.setAttribute('style', 'font:600 11.5px "Segoe UI",system-ui,sans-serif');
      }
    }
    // dijkpalen / hectometers (lengteprofiel): dunne verticale lijn, naam staand bovenin
    const pl = opties.palen !== undefined ? opties.palen : paalVoorGrafiek(reeks, isDwars, xVeld);
    if (pl) {
      let vorige = -Infinity;
      for (const p of pl) {
        const x = px(p.st);
        dvEl('line', { x1: x, x2: x, y1: margeT, y2: hoog - margeB, stroke: '#1F4E79', 'stroke-width': p.echt ? 0.9 : 0.7, 'stroke-opacity': 0.55, 'stroke-dasharray': '2 3', 'vector-effect': 'non-scaling-stroke' });
        if ((x - vorige) * zS < 15) continue;
        vorige = x;
        const t = dvTekst(x + 4 * tegen, margeT + 6 * tegen, p.label, 'paal-tekst', 'end', -90);
        t.setAttribute('fill', '#1F4E79'); t.setAttribute('stroke', '#fff'); t.setAttribute('stroke-width', '3'); t.setAttribute('paint-order', 'stroke');
        t.setAttribute('style', 'font:700 11px "Segoe UI",system-ui,sans-serif');
      }
    }

    // de lijn zelf — knip bij een gat (buiten het net) in plaats van erover heen te trekken
    let d = '';
    let bezig = false;
    for (const p of reeks) {
      if (p.hoogte === null) { bezig = false; continue; }
      const cmd = bezig ? 'L' : 'M';
      d += `${cmd}${px(p[xVeld]).toFixed(1)},${py(p.hoogte).toFixed(1)} `;
      bezig = true;
    }
    const pad = document.createElementNS(ns, 'path');
    pad.setAttribute('d', d.trim());
    pad.setAttribute('class', hoofdIsB ? 'lijn lijn-b' : 'lijn');
    pad.setAttribute('vector-effect', 'non-scaling-stroke');   // lijndikte gelijk bij inzoomen
    g.append(pad);
    if (extraB) {
      let dB = '', bezigB = false;
      for (const p of reeks) {
        if (p.hoogteB == null) { bezigB = false; continue; }
        dB += `${bezigB ? 'L' : 'M'}${px(p[xVeld]).toFixed(1)},${py(p.hoogteB).toFixed(1)} `;
        bezigB = true;
      }
      const padB = document.createElementNS(ns, 'path');
      padB.setAttribute('d', dB.trim());
      padB.setAttribute('class', 'lijn lijn-b');
      padB.setAttribute('vector-effect', 'non-scaling-stroke');
      g.append(padB);
    }
    // brug: onderzijde en bovenzijde (uit de ruwe punten van de brugscans)
    const heeftO = reeks.some(p => p.hoogteO != null), heeftD = reeks.some(p => p.hoogteD != null);
    for (const [veld, klasse, aan] of [['hoogteD', 'lijn lijn-dek', heeftD], ['hoogteO', 'lijn lijn-onder', heeftO]]) {
      if (!aan) continue;
      let dd = '', bz = false;
      for (const p of reeks) {
        if (p[veld] == null) { bz = false; continue; }
        dd += `${bz ? 'L' : 'M'}${px(p[xVeld]).toFixed(1)},${py(p[veld]).toFixed(1)} `; bz = true;
      }
      const pd = document.createElementNS(ns, 'path');
      pd.setAttribute('d', dd.trim()); pd.setAttribute('class', klasse); pd.setAttribute('vector-effect', 'non-scaling-stroke');
      g.append(pd);
    }
    if (snBadges && snBadges.length) {
      const rr = 8.5 * tegen, gezet = [];
      for (const b of snBadges) {
        const bx = px(b.x), by = py(b.z) - rr * 1.6;
        if (gezet.some(([x, y]) => Math.abs(x - bx) * zS < rr * 2.1 * zS && Math.abs(y - by) * zS < rr * 2.1 * zS)) continue;
        gezet.push([bx, by]);
        const kl = b.ernst === 'rood' ? SN_KLEUR.rood : SN_KLEUR.oranje;
        dvEl('circle', { cx: bx, cy: by, r: rr, fill: kl, stroke: '#fff', 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' });
        const t = dvTekst(bx, by + 3.6 * tegen, String(b.nr), 'sn-nr');
        t.setAttribute('fill', '#fff'); t.setAttribute('style', 'font:700 11px "Segoe UI",system-ui,sans-serif');
      }
    }
    if (dvInfo) {
      // vrije hoogte boven de toetswaterstand op het laagste punt van de onderzijde in het profiel
      if (dvInfo.minO != null) {
        const x = px(dvInfo.xMinO);
        const kl = dvInfo.raaktH ? 'dv-maatlijn rood' : 'dv-maatlijn groen';
        maatV(x, py(dv.P), py(dvInfo.minO), `vrij ${komma(dvInfo.minO - dv.P, 2)}`, kl, x > px(dv.x0) + 40);
      }
    }

    // hoogtemaatjes: op een vaste afstand langs de lijn een punt gelabeld
    // met zijn exacte hoogte, zoals op een echte profieltekening — los van
    // de assen-schaalverdeling hierboven. Het stipje staat er altijd, maar
    // het tekstlabel slaan we over als het te dicht op het vorige zou komen
    // (bv. een smal browservenster met "maten elke 10 m" ingesteld) — anders
    // wordt het bij een smal paneel een onleesbare kluwen overlappende
    // getallen. Bij inzoomen (dwarsprofiel) komt er vanzelf weer ruimte vrij.
    // ── tekstplaatsing zonder overlap ──
    // Elke tekst krijgt (in schermpixels) een kader; een tekst die over een
    // al geplaatste tekst zou vallen, wordt overgeslagen. Volgorde = voorrang:
    // eerst de rode BGT-grenshoogtes, dan de zwarte hoogtematen, dan namen.
    // legenda: welke kleur is welke wolk (vast in beeld, linksboven) — staat de
    // legendakolom rechts aan, dan staan ze daar
    if (metB && !legendaAan) {
      const regels = [];
      if (tA) regels.push(['lijn', 'A', bronBestandsnaam || 'puntenwolk A']);
      if (tB) regels.push(['lijn lijn-b', 'B', wolkB.naam]);
      let ly = margeT + 30;
      for (const [klasse, letter, naam] of regels) {
        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', margeL + 8); l.setAttribute('x2', margeL + 28);
        l.setAttribute('y1', ly - 4); l.setAttribute('y2', ly - 4);
        l.setAttribute('class', klasse);
        asLaag.append(l);
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', margeL + 33); t.setAttribute('y', ly);
        t.setAttribute('class', 'legenda-tekst');
        t.textContent = `${letter}: ${naam.length > 42 ? naam.slice(0, 40) + '…' : naam}`;
        asLaag.append(t);
        bezet.push({ x0: margeL, x1: margeL + 40 + naam.length * 7.5, y0: ly - 14, y1: ly + 3 });
        ly += 17;
      }
    }
    const tekstSchaal = Math.sqrt(zS);
    function kaderVrij(cx, cy, tekst, fontPx, anker = 'middle', verticaal = false, extra = 2, vast = false) {
      const sx = zX + zS * cx, sy = zY + zS * cy;
      const sch = vast ? 1 : tekstSchaal;
      const lengte = tekst.length * fontPx * 0.58 * sch, hoogteT = fontPx * sch;
      let k;
      if (verticaal === 'omlaag') k = { x0: sx - hoogteT / 2 - 1, x1: sx + hoogteT / 2 + 1, y0: sy, y1: sy + lengte };
      else if (verticaal) k = { x0: sx - hoogteT, x1: sx + 2, y0: sy - lengte, y1: sy };
      else {
        const x0 = anker === 'middle' ? sx - lengte / 2 : anker === 'end' ? sx - lengte : sx;
        k = { x0, x1: x0 + lengte, y0: sy - hoogteT, y1: sy + 2 };
      }
      k.x0 -= extra; k.x1 += extra; k.y0 -= extra; k.y1 += extra;
      if (k.x0 < margeL || k.x1 > (legendaAan ? plotR : breed)) return false;   // niet over de hoogte-as / legenda heen
      for (const b of bezet) if (k.x0 < b.x1 && k.x1 > b.x0 && k.y0 < b.y1 && k.y1 > b.y0) return false;
      bezet.push(k);
      return true;
    }
    // hoogte op een willekeurige positie langs de reeks (lineair tussen punten)
    function hoogteBij(pos) {
      let vorige = null;
      for (const p of reeks) {
        if (p.hoogte === null) { vorige = null; continue; }
        if (p[xVeld] >= pos) {
          if (!vorige) return Math.abs(p[xVeld] - pos) < 0.5 ? p.hoogte : null;
          const f = (pos - vorige[xVeld]) / Math.max(1e-9, p[xVeld] - vorige[xVeld]);
          return vorige.hoogte + f * (p.hoogte - vorige.hoogte);
        }
        vorige = p;
      }
      return null;
    }

    // rode BGT-grenshoogtes eerst (die hebben voorrang)
    // naam van de actieve as bovenaan de aslijn (dwarsprofiel), zodat je
    // altijd ziet bij welke as dit profiel hoort
    const bovenY = vanSchermY(margeT + 3);
    // Namen bovenaan een verticale lijn: altijd even groot op het scherm
    // (schalen niet mee met zoomen), -90° gedraaid, lopend van boven naar beneden.
    const verticaleNaam = (x, tekst, klasse) => {
      if (!kaderVrij(x, bovenY, tekst, klasse === 'as-naam' ? 17 : 12.5, 'middle', 'omlaag', 2, true)) return false;
      const t = document.createElementNS(ns, 'text');
      // as-naam net links naast de stippellijn (niet erdoorheen), andere namen zoals voorheen
      t.setAttribute('x', x); t.setAttribute('y', bovenY + (klasse === 'as-naam' ? -4 : 3.5));
      t.setAttribute('text-anchor', 'end'); t.setAttribute('class', klasse);
      t.textContent = tekst;
      const k = 1 / zS;
      t.setAttribute('transform', `translate(${x} ${bovenY}) scale(${k}) translate(${-x} ${-bovenY}) rotate(-90 ${x} ${bovenY})`);
      g.append(t);
      return true;
    };
    const asNaam = (midden != null && typeof assen !== 'undefined' && assen[actieveAs]) ? assen[actieveAs].naam : null;
    if (asNaam) verticaleNaam(px(midden), asNaam, 'as-naam');

    // BGT-grenzen: grenzen tussen twee vlakken met dezelfde laag (bv. twee
    // stukken begroeid terrein) zeggen niets en laten we weg
    const stroken = heeftBgtStrip ? reeks.bgt.stroken : [];
    const dxfMetVlaknamen = bgtLagen.some(l => l.centroide);
    const laagBij = (o) => { const st = stroken.find(s => o >= s.van && o < s.tot); return st ? st.label : null; };
    const bgtGrensPunten = [];
    if (heeftBgt && bgtModus !== 'balk') {
      for (const gr of reeks.bgt.grenzen) {
        const links = laagBij(gr.offset - 0.05), rechts = laagBij(gr.offset + 0.05);
        const kort = (l) => bgtKort(l).replace(/ terrein$/, '').replace(/ terreindeel$/, '');
        const overgang = [links, rechts].filter(Boolean).map(kort).join(' | ');
        // lijnen met een eigen betekenis (talud, insteek, kant water…) houden hun naam;
        // een gewone grenslijn krijgt de overgang tussen de vlakken, en valt weg als
        // aan beide kanten hetzelfde ligt
        const eigenNaam = gr.soort === 'lijn' && /talud|kruin|insteek|kant water|damwand|kademuur|beschoeiing|hek|haag|muur|schutting|steiger|duiker|sloot/i.test(gr.naam || '');
        // Weglaten als aan beide kanten hetzelfde (bekende) vlak ligt. Is er aan
        // geen van beide kanten een vlak bekend (losse DXF-lijnen), dan de lijn
        // tonen met de naam van zijn eigen laag.
        // Losse lijnen uit een eigen DXF (insteek, teen, kant verharding…) altijd
        // tonen met hun laagnaam — behalve bij een IMGeo-DXF met vlaknamen, waar
        // de lijnen gewoon vlakgrenzen zijn.
        const dxfLijn = gr.soort === 'lijn' && gr.bron === 'dxf' && !dxfMetVlaknamen;
        if (!eigenNaam && !dxfLijn && links === rechts && links !== null) continue;
        gr.naamTekst = eigenNaam ? bgtKort(gr.naam).toLowerCase()
          : dxfLijn ? bgtKort(gr.naam)
          : (links !== rechts ? overgang : bgtKort(gr.naam));
        const h = hoogteBij(gr.offset);
        bgtGrensPunten.push({ x: px(gr.offset), y: h === null ? null : py(h), h, gr });
      }
    }
    // stand "+ namen": doorlopende stippellijn op elke grens met de naam bovenaan
    if (bgtModus === 'namen') {
      const yBoven = vanSchermY(margeT), yOnder = vanSchermY(hoog - margeB);
      for (const bp of bgtGrensPunten) {
        const lijn = document.createElementNS(ns, 'line');
        lijn.setAttribute('x1', bp.x); lijn.setAttribute('x2', bp.x);
        lijn.setAttribute('y1', yBoven); lijn.setAttribute('y2', yOnder);
        lijn.setAttribute('class', 'bgt-grenslijn');
        lijn.setAttribute('vector-effect', 'non-scaling-stroke');
        g.append(lijn);
      }
    }
    for (const bp of bgtGrensPunten) {
      if (bp.h === null) continue;
      const stip = document.createElementNS(ns, 'circle');
      stip.setAttribute('cx', bp.x); stip.setAttribute('cy', bp.y); stip.setAttribute('r', 3 / Math.sqrt(zS));
      stip.setAttribute('class', 'maat-bgt-stip');
      g.append(stip);
      const hoogteY = zS === 1 ? Math.max(margeT + 12, bp.y - 9) : bp.y - 8 * tekstTegenSchaal;
      if (!kaderVrij(bp.x, hoogteY, (Math.abs(bp.h) < 0.005 ? 0 : bp.h).toFixed(2), 17)) continue;
      const hoogteTekst = document.createElementNS(ns, 'text');
      hoogteTekst.setAttribute('x', bp.x); hoogteTekst.setAttribute('y', hoogteY);
      hoogteTekst.setAttribute('text-anchor', 'middle'); hoogteTekst.setAttribute('class', 'maat-bgt');
      hoogteTekst.textContent = (Math.abs(bp.h) < 0.005 ? 0 : bp.h).toFixed(2);
      zetTekstTransform(hoogteTekst, bp.x, hoogteY);
      g.append(hoogteTekst);
      bp.geplaatst = hoogteY;
    }
    // stand "+ namen": de naam rechtop vlak boven het profiel (boven de rode
    // hoogte), zwart; loopt omhoog langs de stippellijn. Vaste grootte op het scherm.
    if (bgtModus === 'namen') for (const bp of bgtGrensPunten) {
      if (!bp.gr.naamTekst) continue;
      const fontPx = 17;
      const lengte = bp.gr.naamTekst.length * fontPx * 0.58;
      // onderkant van de tekst (schermpixels): boven de rode hoogte, of bovenin als er geen hoogte is
      let onderScherm = bp.y === null ? margeT + 6 + lengte : zY + zS * bp.y - 30;
      onderScherm = Math.max(onderScherm, margeT + 4 + lengte);   // niet boven het paneel uit
      const yOnder = vanSchermY(onderScherm);
      if (!kaderVrij(bp.x, yOnder, bp.gr.naamTekst, fontPx, 'start', true, 2, true)) continue;
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', bp.x); t.setAttribute('y', yOnder);
      t.setAttribute('dy', '0.35em');
      t.setAttribute('text-anchor', 'start'); t.setAttribute('class', 'bgt-naam');
      t.textContent = bp.gr.naamTekst;
      t.setAttribute('transform', `translate(${bp.x} ${yOnder}) scale(${1 / zS}) translate(${-bp.x} ${-yOnder}) rotate(-90 ${bp.x} ${yOnder})`);
      g.append(t);
    }

    const MIN_LABEL_AFSTAND_PX = 42;
    const declutterAfstand = MIN_LABEL_AFSTAND_PX / (zoomState?.schaal || 1);
    let laatsteTekstX = -Infinity;
    // Bij inzoomen het interval halveren zolang de getallen op het scherm
    // ruim genoeg uit elkaar blijven — zo staan er altijd hoogtes in beeld,
    // ook als je tussen twee "maten elke"-punten inzoomt.
    let effInterval = Math.max(0.5, matenInterval || 10);   // 0 = uit (zie hieronder)
    {
      const puntAfstand = geldig.length > 1 ? Math.abs(geldig[1][xVeld] - geldig[0][xVeld]) || 0.1 : 0.1;
      const pxPerM = xSchaal * zS;
      while (effInterval / 2 >= puntAfstand && (effInterval / 2) * pxPerM >= 55) effInterval /= 2;
    }
    // "maten elke 0" = geen hoogtematen van de surface (alleen de BGT-hoogtes)
    for (const i of (matenInterval === 0 ? [] : kiesMaatIndexen(geldig, xVeld, midden, effInterval))) {
      const p = geldig[i];
      const cx = px(p[xVeld]), cy = py(p.hoogte);

      const stip = document.createElementNS(ns, 'circle');
      stip.setAttribute('cx', cx); stip.setAttribute('cy', cy); stip.setAttribute('r', 2.6 / Math.sqrt(zS));
      stip.setAttribute('class', hoofdIsB ? 'maat-stip maat-stip-b' : 'maat-stip');
      g.append(stip);

      if (Math.abs(cx - laatsteTekstX) < declutterAfstand) continue;
      const tekstY = zS === 1 ? Math.min(hoog - margeB - 4, cy + 17) : cy + 17 * tekstTegenSchaal;
      if (!kaderVrij(cx, tekstY, fmtH(p.hoogte), 14.5)) continue;
      laatsteTekstX = cx;

      const tekst = document.createElementNS(ns, 'text');
      tekst.setAttribute('x', cx); tekst.setAttribute('y', tekstY);
      tekst.setAttribute('text-anchor', 'middle'); tekst.setAttribute('class', hoofdIsB ? 'maat maat-b' : 'maat');
      tekst.textContent = fmtH(p.hoogte);
      zetTekstTransform(tekst, cx, tekstY);
      g.append(tekst);
    }
    // maten van wolk B (in de kleur van B), boven de lijn
    if (extraB && matenInterval !== 0) {
      const geldigB = reeks.filter(p => p.hoogteB != null).map(p => ({ [xVeld]: p[xVeld], hoogte: p.hoogteB }));
      let laatsteB = -Infinity;
      if (geldigB.length >= 2) for (const i of kiesMaatIndexen(geldigB, xVeld, midden, effInterval)) {
        const p = geldigB[i];
        const cx = px(p[xVeld]), cy = py(p.hoogte);
        const stip = document.createElementNS(ns, 'circle');
        stip.setAttribute('cx', cx); stip.setAttribute('cy', cy); stip.setAttribute('r', 2.6 / Math.sqrt(zS));
        stip.setAttribute('class', 'maat-stip maat-stip-b');
        g.append(stip);
        if (Math.abs(cx - laatsteB) < declutterAfstand) continue;
        const tekstY = cy - 9 * tekstTegenSchaal;
        if (!kaderVrij(cx, tekstY, fmtH(p.hoogte), 14.5)) continue;
        laatsteB = cx;
        const tekst = document.createElementNS(ns, 'text');
        tekst.setAttribute('x', cx); tekst.setAttribute('y', tekstY);
        tekst.setAttribute('text-anchor', 'middle'); tekst.setAttribute('class', 'maat maat-b');
        tekst.textContent = fmtH(p.hoogte);
        zetTekstTransform(tekst, cx, tekstY);
        g.append(tekst);
      }
    }

    // BGT-strip: welk BGT-vlak elk punt van de doorsnede raakt, als een
    // gekleurde band vlak boven de x-as — alleen relevant voor het
    // dwarsprofiel (de langsprofiel-reeks heeft geen bgtLabel). Op elke
    // overgang (waar een BGT-grens de surface snijdt) komt een hoogtemaatje
    // in het rood, los van de gewone (donkere) hoogtemaatjes op vaste afstand.
    if (heeftBgtStrip) {
      // band vlak onder het laagste punt van het profiel (niet helemaal onderaan
      // het paneel, waar hij bij een vlak profiel ver van de lijn af staat)
      let laagsteY = -Infinity;
      for (const p of geldig) { const y = py(p.hoogte); if (y > laagsteY) laagsteY = y; }
      const stripY = Math.min(hoog - margeB + 30, laagsteY + 48);
      const stripBezet = [];   // eigen rij: namen onder de band mogen elkaar niet raken
      for (const st of reeks.bgt.stroken) {
        const x0 = px(st.van), x1 = px(st.tot);
        const kleur = bgtStijl({ _: st.label }).lijn;
        const balk = document.createElementNS(ns, 'line');
        balk.setAttribute('x1', x0 + 0.6 / zS); balk.setAttribute('x2', x1 - 0.6 / zS);
        balk.setAttribute('y1', stripY); balk.setAttribute('y2', stripY);
        balk.setAttribute('stroke', kleur); balk.setAttribute('stroke-width', '4');
        balk.setAttribute('vector-effect', 'non-scaling-stroke');
        g.append(balk);
        // naam + breedte van de strook (maatketting), anders alleen de breedte,
        // alleen als het binnen de eigen strook past en niets raakt
        const breedteScherm = (x1 - x0) * zS;
        const bM = (st.tot - st.van).toFixed(2);
        let naam = null;
        for (const kand of [`${bgtKort(st.label)} ${bM}`, bM]) {
          if (kand.length * 13.8 * 0.56 * tekstSchaal + 6 <= breedteScherm) { naam = kand; break; }
        }
        if (!naam) continue;
        const tekstBreedte = naam.length * 13.8 * 0.56 * tekstSchaal;
        const sx0 = zX + zS * (x0 + x1) / 2 - tekstBreedte / 2, sx1 = sx0 + tekstBreedte;
        if (stripBezet.some(([a0, a1]) => sx0 < a1 + 4 && sx1 > a0 - 4)) continue;
        stripBezet.push([sx0, sx1]);
        const tekst = document.createElementNS(ns, 'text');
        const stripTekstX = (x0 + x1) / 2;
        tekst.setAttribute('x', stripTekstX); tekst.setAttribute('y', stripY - 7);
        tekst.setAttribute('text-anchor', 'middle'); tekst.setAttribute('class', 'tekst');
        tekst.textContent = naam;
        zetTekstTransform(tekst, stripTekstX, stripY - 7);
        g.append(tekst);
      }
    } else if (heeftKetting) {
      let laagsteY = -Infinity;
      for (const p of geldig) { const y = py(p.hoogte); if (y > laagsteY) laagsteY = y; }
      const kY = Math.min(hoog - margeB + 30, laagsteY + 48);
      // maatpunten: de getoonde BGT-lijnen (bij "balk" alle) plus de randen van het profiel
      const bron = bgtGrensPunten.length ? bgtGrensPunten.map(bp => bp.gr.offset) : reeks.bgt.grenzen.map(gr => gr.offset);
      const punten = [xMin, xMax, ...bron.filter(o => o > xMin && o < xMax)].sort((a, b) => a - b)
        .filter((o, i, a) => i === 0 || o - a[i - 1] > 0.05);
      const keten = document.createElementNS(ns, 'line');
      keten.setAttribute('x1', px(punten[0])); keten.setAttribute('x2', px(punten[punten.length - 1]));
      keten.setAttribute('y1', kY); keten.setAttribute('y2', kY);
      keten.setAttribute('class', 'maatketting');
      keten.setAttribute('vector-effect', 'non-scaling-stroke');
      g.append(keten);
      const t = 4 / zS;   // schuine maatstreepjes, vaste grootte op het scherm
      for (const o of punten) {
        const x = px(o);
        const streep = document.createElementNS(ns, 'path');
        streep.setAttribute('d', `M${x - t},${kY + t} L${x + t},${kY - t} M${x},${kY - 2 * t} L${x},${kY + 2 * t}`);
        streep.setAttribute('class', 'maatketting');
        streep.setAttribute('vector-effect', 'non-scaling-stroke');
        g.append(streep);
      }
      for (let i = 1; i < punten.length; i++) {
        const a = punten[i - 1], b = punten[i];
        const tekstMaat = (b - a).toFixed(2);
        const breedteScherm = (b - a) * xSchaal * zS;
        if (tekstMaat.length * 13.8 * 0.56 * tekstSchaal + 6 > breedteScherm) continue;
        const tx = (px(a) + px(b)) / 2, ty = kY - 7;
        const tekst = document.createElementNS(ns, 'text');
        tekst.setAttribute('x', tx); tekst.setAttribute('y', ty);
        tekst.setAttribute('text-anchor', 'middle'); tekst.setAttribute('class', 'maatketting-tekst');
        tekst.textContent = tekstMaat;
        zetTekstTransform(tekst, tx, ty);
        g.append(tekst);
      }
    }

    // bomen die deze doorsnede raken: een klein boomsymbool op hun eigen
    // grondhoogte (ligt zelden precies op de lijn, dus dit is een projectie
    // — zie boomVindenBijStation voor de tolerantie rond dit station)
    if (bomen && bomen.length) {
      // Vast, klein icoon — bewust NIET op enige wereldschaal (xSchaal noch
      // vSchaal): bij een brede rij is xSchaal zelf ook groot (een paar meter
      // "boomhoogte" wordt dan een lantaarnpaal), en vSchaal wordt door
      // "verh. 1:X" nog eens extra opgeblazen. Gewoon een vaste, met de
      // beschikbare grafiekhoogte meeschalende symboolgrootte. Zelfde
      // "paaltje met rondje erop" als de bomen op de kaart in de
      // Civil3D-plugin (boomIcoon() in kaart.js) en het bovenaanzicht hier.
      const straalBasis = Math.max(4, Math.min(10, (hoog - margeT - margeB) * 0.12));
      const straal = straalBasis * 1.5;
      const paal = straalBasis * 1.3 * 4;
      for (const boom of bomen) {
        const cx = px(boom.offset);
        const grondY = py(boom.hoogte);
        const kroonY = grondY - paal;

        const stam = document.createElementNS(ns, 'line');
        stam.setAttribute('x1', cx); stam.setAttribute('x2', cx);
        stam.setAttribute('y1', grondY); stam.setAttribute('y2', kroonY);
        stam.setAttribute('stroke', '#2E7D32'); stam.setAttribute('stroke-width', '1.6');
        g.append(stam);

        const kroon = document.createElementNS(ns, 'circle');
        kroon.setAttribute('cx', cx); kroon.setAttribute('cy', kroonY); kroon.setAttribute('r', straal);
        kroon.setAttribute('fill', 'rgba(60,140,60,.55)');
        kroon.setAttribute('stroke', '#2E7D32'); kroon.setAttribute('stroke-width', '1.2');
        g.append(kroon);
      }
    }

    // x-as label (naast de afstandsgetallen)
    const xLabelEl = document.createElementNS(ns, 'text');
    xLabelEl.setAttribute('x', xLabelPlek.x); xLabelEl.setAttribute('y', hoog - 4);
    xLabelEl.setAttribute('text-anchor', xLabelPlek.anker); xLabelEl.setAttribute('class', 'tekst');
    xLabelEl.textContent = xLabel;
    asLaag.append(xLabelEl);

    // ── legenda rechts ──
    // Alleen wat er in dit profiel ook echt getekend is. Vast in beeld (zoomt
    // niet mee); een witte kolom dekt wat er bij in-/uitzoomen onder zou schuiven.
    // opties.legendaUit (PDF met kolom rechts): de legenda-items worden ook
    // teruggegeven, zodat één legenda per blad in de kolom kan komen.
    const legendaUit = Array.isArray(opties.legendaUit) ? opties.legendaUit : null;
    const legendaLijst = () => {
      const items = [], bgtSoorten = [];   // items: [symbool, tekst, klasse]
      if (metB) {
        if (tA) items.push(['lijn', 'A: ' + (bronBestandsnaam || 'puntenwolk A'), 'lijn']);
        if (tB) items.push(['lijn', 'B: ' + wolkB.naam, 'lijn lijn-b']);
      } else items.push(['lijn', reeks.maatgevend ? 'bodem: hoogste over de boxlengte' : 'gemeten profiel', 'lijn']);
      if (heeftO) items.push(['lijn', reeks.maatgevend ? 'onderzijde brug: laagste over de boxlengte' : 'onderzijde brug', 'lijn lijn-onder']);
      if (heeftD) items.push(['lijn', 'bovenzijde brug', 'lijn lijn-dek']);
      if (dv) items.push(['dvprofiel', `doorvaartprofiel B ${komma(dv.B, 2)} × H ${komma(dv.H, 2)} m${dv.D ? `, diepgang ${komma(dv.D, 2)}` : ''}`, 'dv-profiel']);
      if (dv && doorvaart.weergave === 'schip') items.push(['lijn', 'maatgevend schip (indicatief)', 'dv-schip']);
      if (dvInfo && (dvInfo.raaktH || dvInfo.raaktD)) items.push(['arcering', 'conflict met het doorvaartprofiel', 'dv-conflictvlak']);
      if (dv && (peil == null || Math.abs(peil - dv.P) > 0.005)) items.push(['hlijn', `toetswaterstand ${dv.P >= 0 ? '+' : ''}${komma(dv.P)} m`, 'dv-toetspeil']);
      if (sn) {
        if (sn.soort === 'langs' || sn.inBereik) items.push(['snprofiel', `doorloopprofiel ${komma(sn.r.B, 2)} × ${komma(sn.r.H, 2)} m (vrije ruimte)`]);
        if (sn.r.M && (sn.soort === 'langs' || sn.inBereik)) items.push(['snmarge', `snoeimarge ${komma(sn.r.M, 2)} m`]);
        if (sn.punten.some(p => p[2] === 3)) items.push(['blokje', 'begroeiing in het profiel (snoeien)', SN_KLEUR.rood]);
        if (sn.punten.some(p => p[2] === 2)) items.push(['blokje', 'begroeiing in de snoeimarge', SN_KLEUR.oranje]);
        if (sn.punten.some(p => p[2] === 1)) items.push(['blokje', 'overige begroeiing', SN_KLEUR.groen]);
        if (sn.badges.length) items.push(['snnr', 'snoeipunt (nr. in de snoeilijst)']);
      }
      if (kad && kad.grenzen.length) items.push(['kadgrens', 'kadastrale perceelgrens (sectie + nr.)']);
      if (pl) items.push(['paal', palen.modus === 'hm' ? 'hectometer' : 'dijkpaal']);
      if (matenInterval !== 0) items.push(['stip', 'hoogte (m NAP)', hoofdIsB ? 'maat-stip maat-stip-b' : 'maat-stip']);
      if (bgtGrensPunten.some(bp => bp.h !== null)) items.push(['stip', 'hoogte op BGT-grens', 'maat-bgt-stip']);
      if (bgtModus === 'namen' && bgtGrensPunten.length) items.push(['vlijn', 'BGT-grens', 'bgt-grenslijn']);
      if (heeftKetting) items.push(['keten', 'maatketting BGT (m)']);
      if (midden != null) items.push(['vlijn', asNaam ? `as (${asNaam})` : 'as', 'huidig-station']);
      if (napZichtbaar) items.push(['hlijn', 'NAP 0,00', 'nap-lijn']);
      if (peil != null) items.push(['peil', `waterpeil ${peil >= 0 ? '+' : ''}${komma(peil)} m`]);
      if (waterInfo) items.push(['water', `water ${waterInfo.totRand ? '≥ ' : ''}${komma(waterInfo.breedte)} m breed`]);
      if (bomen && bomen.length) items.push(['boom', 'boom']);
      if (heeftBgtStrip) for (const st of reeks.bgt.stroken) if (!bgtSoorten.includes(st.label)) bgtSoorten.push(st.label);
      return { items, bgtSoorten };
    };
    if (legendaUit) {
      const { items, bgtSoorten } = legendaLijst();
      for (const [symbool, tekst, klasse] of items) {
        // per blad samenvoegen: wisselende getallen (waterbreedte) eruit
        const t = symbool === 'water' ? 'water (onder waterpeil)' : tekst;
        legendaUit.push({ symbool, tekst: t, klasse, sleutel: symbool + '|' + (klasse || '') + '|' + t });
      }
      for (const l of bgtSoorten) legendaUit.push({ symbool: 'bgt', tekst: bgtKort(l), kleur: bgtStijl({ _: l }).lijn, sleutel: 'bgt|' + l });
    }
    if (legendaAan) {
      const { items, bgtSoorten } = legendaLijst();
      const lx = plotR + 8, lw = breed - lx - 4;
      const kolom = document.createElementNS(ns, 'rect');
      kolom.setAttribute('x', plotR + 1); kolom.setAttribute('y', 0);
      kolom.setAttribute('width', breed - plotR - 1); kolom.setAttribute('height', hoog);
      kolom.setAttribute('fill', '#ffffff');
      asLaag.insertBefore(kolom, xLabelEl);
      const naamKort = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;

      const rij = 17, maxTekens = Math.floor((lw - 30) / (13 * 0.52));
      const onderGrens = hoog - 26 - (overdrijving && overdrijving !== 1 ? 2 * rij : rij);   // ruimte voor de voetregels
      let y = margeT + 8;
      const kop = (tekst) => {
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', lx); t.setAttribute('y', y + 4); t.setAttribute('class', 'legenda-kop');
        t.textContent = tekst; asLaag.append(t); y += rij + 1;
      };
      const regel = (symbool, tekst, klasse, kleur) => {
        const sx = lx, sm = y;   // sm = midden van het symbool
        const el = (naam, attrs) => { const e = document.createElementNS(ns, naam); for (const k in attrs) e.setAttribute(k, attrs[k]); asLaag.append(e); return e; };
        if (symbool === 'lijn') el('line', { x1: sx, x2: sx + 22, y1: sm, y2: sm, class: klasse });
        else if (symbool === 'stip') el('circle', { cx: sx + 11, cy: sm, r: 2.8, class: klasse });
        else if (symbool === 'vlijn') el('line', { x1: sx + 11, x2: sx + 11, y1: sm - 6, y2: sm + 6, class: klasse, style: 'opacity:1;stroke-width:1.4' });
        else if (symbool === 'keten') {
          el('line', { x1: sx, x2: sx + 22, y1: sm, y2: sm, class: 'maatketting' });
          for (const kx of [sx + 2, sx + 20]) el('path', { d: `M${kx - 3},${sm + 3} L${kx + 3},${sm - 3} M${kx},${sm - 5} L${kx},${sm + 5}`, class: 'maatketting' });
        }
        else if (symbool === 'hlijn') el('line', { x1: sx, x2: sx + 22, y1: sm, y2: sm, class: klasse });
        else if (symbool === 'box') el('rect', { x: sx + 1, y: sm - 6, width: 20, height: 12, class: klasse });
        else if (symbool === 'dvprofiel') el('rect', { x: sx + 1, y: sm - 6, width: 20, height: 12, class: 'dv-profiel' });
        else if (symbool === 'arcering') el('rect', { x: sx + 1, y: sm - 6, width: 20, height: 12, fill: '#F6D9D1', stroke: '#C6472B', 'stroke-width': 1 });
        else if (symbool === 'snprofiel') el('rect', { x: sx + 1, y: sm - 6, width: 20, height: 12, fill: 'none', stroke: SN_KLEUR.profiel, 'stroke-width': 1.3, 'stroke-dasharray': '6 3 1.5 3' });
        else if (symbool === 'paal') el('line', { x1: sx + 11, x2: sx + 11, y1: sm - 7, y2: sm + 7, stroke: '#1F4E79', 'stroke-width': 1, 'stroke-dasharray': '2 2' });
        else if (symbool === 'kadgrens') el('line', { x1: sx + 11, x2: sx + 11, y1: sm - 7, y2: sm + 7, stroke: '#7A3E9D', 'stroke-width': 1.3, 'stroke-dasharray': '4 2' });
        else if (symbool === 'snmarge') el('rect', { x: sx + 1, y: sm - 6, width: 20, height: 12, fill: 'none', stroke: SN_KLEUR.oranje, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' });
        else if (symbool === 'blokje') { for (const [dx, dy] of [[4, -3], [9, 1], [14, -2], [17, 3], [7, 4]]) el('rect', { x: sx + dx, y: sm + dy - 1.5, width: 3, height: 3, fill: klasse }); }
        else if (symbool === 'snnr') { el('circle', { cx: sx + 11, cy: sm, r: 6.5, fill: SN_KLEUR.rood }); const tn = el('text', { x: sx + 11, y: sm + 3.5, 'text-anchor': 'middle', fill: '#fff', style: 'font:700 9px "Segoe UI",sans-serif' }); tn.textContent = '1'; }
        else if (symbool === 'peil') {
          const c = sx + 11, z = 5;
          el('line', { x1: sx, x2: sx + 22, y1: sm + 3, y2: sm + 3, class: 'waterlijn' });
          el('path', { d: `M${c - z},${sm + 3 - z * 1.5} L${c + z},${sm + 3 - z * 1.5} L${c},${sm + 3} Z`, class: 'waterpeil-teken' });
        } else if (symbool === 'water') {
          el('rect', { x: sx, y: sm - 5, width: 22, height: 10, class: 'water-vlak' });
          el('line', { x1: sx, x2: sx + 22, y1: sm - 5, y2: sm - 5, class: 'waterlijn' });
        } else if (symbool === 'boom') {
          el('line', { x1: sx + 11, x2: sx + 11, y1: sm + 6, y2: sm - 1, stroke: '#2E7D32', 'stroke-width': 1.4 });
          el('circle', { cx: sx + 11, cy: sm - 3, r: 4, fill: 'rgba(60,140,60,.55)', stroke: '#2E7D32', 'stroke-width': 1 });
        } else if (symbool === 'bgt') el('line', { x1: sx, x2: sx + 22, y1: sm, y2: sm, stroke: kleur, 'stroke-width': 4 });
        const t = el('text', { x: sx + 28, y: sm + 4, class: 'legenda-item' });
        t.textContent = naamKort(tekst, maxTekens);
        y += rij;
      };
      kop('Legenda');
      for (const [symbool, tekst, klasse] of items) {
        if (y > onderGrens) break;
        regel(symbool, tekst, klasse);
      }
      if (bgtSoorten.length && y + rij * 2 <= onderGrens) {
        y += 4; kop('BGT in doorsnede');
        for (let i = 0; i < bgtSoorten.length; i++) {
          if (y > onderGrens || (y + rij > onderGrens && i < bgtSoorten.length - 1)) {
            regel('', `+ ${bgtSoorten.length - i} meer`); break;
          }
          regel('bgt', bgtKort(bgtSoorten[i]), null, bgtStijl({ _: bgtSoorten[i] }).lijn);
        }
      }
      // voetregels: totale breedte en (bij overdrijving) de verhouding
      let vy = hoog - 26;
      const voet = (tekst) => {
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', lx); t.setAttribute('y', vy); t.setAttribute('class', 'legenda-voet');
        t.textContent = tekst; asLaag.append(t); vy -= rij;
      };
      if (overdrijving && overdrijving !== 1) voet(`hoogte ${String(overdrijving).replace('.', ',')}× overdreven`);
      voet(`profielbreedte ${komma(xMax - xMin, xMax - xMin >= 100 ? 0 : 1)} m`);
    }

    svgEl.append(rasterLaag, g, asLaag);
  }

  /** Kiest indexen uit `geldig` om van een hoogtemaatje te voorzien: op elke
   *  veelvoud van `interval` langs xVeld het dichtstbijzijnde punt, plus
   *  altijd begin en eind van de lijn en (bij een dwarsprofiel) het punt op
   *  de as zelf (offset 0). */
  function kiesMaatIndexen(geldig, xVeld, midden, interval) {
    const indexen = new Set([0, geldig.length - 1]);
    const dichtstbijIndex = (doel) => {
      let besteI = 0, besteAfstand = Infinity;
      geldig.forEach((p, i) => {
        const d = Math.abs(p[xVeld] - doel);
        if (d < besteAfstand) { besteAfstand = d; besteI = i; }
      });
      return besteI;
    };
    const xMin = geldig[0][xVeld], xMax = geldig[geldig.length - 1][xVeld];
    const stap = Math.max(0.01, interval || 10);
    for (let doel = Math.ceil(xMin / stap) * stap; doel <= xMax + 1e-9; doel += stap) {
      indexen.add(dichtstbijIndex(doel));
    }
    if (midden != null) indexen.add(dichtstbijIndex(midden));
    return [...indexen].sort((a, b) => a - b);
  }

  function mooieStap(ruw) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, ruw))));
    const genormaliseerd = ruw / magnitude;
    const stap = genormaliseerd < 1.5 ? 1 : genormaliseerd < 3.5 ? 2 : genormaliseerd < 7.5 ? 5 : 10;
    return stap * magnitude;
  }

  function tekenLangs() {
    if (langsprofiel.length < 2) { svgLangs.innerHTML = ''; langsLeeg.hidden = false; return; }
    langsLeeg.hidden = true;
    const overdrijving = Math.max(0.25, Number(langsOverdrijvingVeld.value) || 20);
    tekenGrafiek(svgLangs, langsprofiel, 'station', 'station (m)', null, matenWaarde(maatLangsVeld, 10), overdrijving, langsZoom);
  }

  function tekenDwarsVoorHuidigeStation() {
    if (!dwarsStations.length) { svgDwars.innerHTML = ''; dwarsLeeg.hidden = false; stationLabel.textContent = ''; return; }
    dwarsLeeg.hidden = true;
    const station = dwarsStations[huidigeStationIndex];
    const reeks = berekenDwarsprofiel(station);
    const bron = volleProfielenGeldig()
      ? ` · uit alle punten (${reeks.reduce((n, p) => n + (p.aantal || 0), 0).toLocaleString('nl-NL')} meetpunten)` : '';
    stationLabel.textContent = `· station ${station.toFixed(1)} m${paalAchter(station, ' · ')} (${huidigeStationIndex + 1}/${dwarsStations.length})${bron}`;
    const overdrijving = Math.max(0.25, Number(dwarsOverdrijvingVeld.value) || 1);
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    const bomen = boomVindenBijStation(station, breedte);
    tekenGrafiek(svgDwars, reeks, 'offset', 'offset (m)', 0, matenWaarde(maatDwarsVeld, 5), overdrijving, dwarsZoom, bomen, waterpeil());
    tekenVlak(); // stationsmarkering in het bovenaanzicht bijwerken
  }

  /** Bomen (uit BGT) die dicht genoeg bij dit station en binnen de
   *  dwarsprofiel-breedte liggen — geprojecteerd op station+offset via
   *  stationOffsetVanPunt. De hoogte wordt bewust NIET op de werkelijke
   *  boom-locatie bevraagd (die ligt zelden exact op de doorsnede-lijn,
   *  wat een klein maar zichtbaar "los van de grond zwevend" boompje
   *  gaf), maar op hetzelfde geprojecteerde punt dat berekenDwarsprofiel
   *  ook gebruikt — zo staat de boom altijd precies op de getekende lijn. */
  function boomVindenBijStation(station, breedte, pL = profielL(), pR = profielR()) {
    if (!boomLagen.length || asPunten.length < 2) return [];
    const interval = Math.max(0.5, Number(dwarsIntervalVeld.value) || 5);
    const tolerantie = interval / 2;
    const resultaat = [];
    for (const laag of boomLagen) {
      if (!laag.puntAlleen) continue;
      const wp = laag.ringen[0][0];
      const so = stationOffsetVanPunt(wp.x, wp.y);
      if (!so || Math.abs(so.station - station) > tolerantie || so.offset < -pL || so.offset > pR) continue;
      const projPunt = puntOpStationOffset(station, so.offset);
      const hoogte = hoogteOp(projPunt.x, projPunt.y);
      if (hoogte == null) continue;
      resultaat.push({ offset: so.offset, hoogte });
    }
    return resultaat;
  }
  function tekenDwars() { tekenDwarsVoorHuidigeStation(); }

  vorigeStationKnop.addEventListener('click', () => {
    huidigeStationIndex = Math.max(0, huidigeStationIndex - 1);
    tekenDwarsVoorHuidigeStation();
  });
  volgendeStationKnop.addEventListener('click', () => {
    huidigeStationIndex = Math.min(dwarsStations.length - 1, huidigeStationIndex + 1);
    tekenDwarsVoorHuidigeStation();
  });

  stapLangsVeld.addEventListener('change', bijwerkenProfielen);
  dwarsBreedteVeld.addEventListener('change', () => { wisDwarsZoom(); tekenDwarsVoorHuidigeStation(); planVolleProfielen(); });
  dwarsIntervalVeld.addEventListener('change', bijwerkenProfielen);
  {
    const v = document.getElementById('toonDwarslijnen');
    if (v) {
      try { const b = localStorage.getItem('ptsviewer-dwarslijnen'); if (b === '0' || b === '1') v.checked = b === '1'; } catch { /* */ }
      v.addEventListener('change', () => { try { localStorage.setItem('ptsviewer-dwarslijnen', v.checked ? '1' : '0'); } catch { /* */ } if (xs) tekenVlak(); });
    }
  }
  maatLangsVeld.addEventListener('change', () => tekenLangs());
  maatDwarsVeld.addEventListener('change', () => tekenDwarsVoorHuidigeStation());
  dwarsOverdrijvingVeld.addEventListener('change', () => { wisDwarsZoom(); tekenDwarsVoorHuidigeStation(); });

  /* ────────────────────────────────────────────────────────────────
     PDF-export: één A1-liggend document met bovenaanzicht + alle
     dwarsprofielen (geen lengteprofiel), rechtstreeks gedownload —
     geen printer of browser-printdialoog nodig. Elk dwarsprofiel wordt
     via de bestaande tekenGrafiek() in een verse, losse svg getekend en
     daarna naar een raster-afbeelding omgezet (jsPDF kan geen svg
     rechtstreeks plaatsen), zo breed als de pagina toelaat.
     ──────────────────────────────────────────────────────────────── */

  // tekenGrafiek() geeft elementen alleen een class (maatlijn, tekst, lijn,
  // maat, enz.) — de bijbehorende stroke/fill/font staan in het <style>-blok
  // van index.html. Een losstaande, geserialiseerde svg (buiten de pagina)
  // heeft daar geen toegang toe, dus zonder dit blok blijven lijnen/tekst
  // ongestyled (SVG-default: fill zwart, stroke geen) — vandaar de onleesbare
  // eerdere export. Kleuren hier hardcoded overgenomen uit :root in index.html.
  const SVG_EXPORT_STIJL = `
    .lijn.lijn-onder{stroke:#1B2A38;stroke-width:1.6}
    .lijn.lijn-dek{stroke:#1B2A38;stroke-width:1.1}
    .dv-brugvlak{fill:#D5DADF;stroke:none}
    .dv-profiel{fill:none;stroke:#1B2A38;stroke-width:1.3;stroke-dasharray:10 4 2 4}
    .dv-profiel.diep{stroke-dasharray:4 4;stroke-width:1.1}
    .dv-conflictvlak{stroke:#C6472B;stroke-width:1.4}
    .dv-schip{fill:none;stroke:#6B7A8C;stroke-width:1.3;stroke-linejoin:round}
    .dv-schip.dun{stroke-width:0.8}
    .dv-maatlijn{stroke:#1B2A38;stroke-width:0.9;fill:none}
    .dv-maatlijn.grijs{stroke:#6B7A8C}
    .dv-maatlijn.rood{stroke:#C6472B;stroke-width:1.2}
    .dv-maatlijn.groen{stroke:#16803D;stroke-width:1.2}
    .dv-maatlijn-tekst{fill:#1B2A38;font:600 12.5px "Segoe UI",system-ui,sans-serif;stroke:#fff;stroke-width:3px;paint-order:stroke}
    .dv-maatlijn-tekst.grijs{fill:#6B7A8C}
    .dv-maatlijn-tekst.rood{fill:#C6472B}
    .dv-maatlijn-tekst.groen{fill:#16803D}
    .dv-peilteken{fill:none;stroke:#2F7FB5;stroke-width:1.2}
    .dv-peiltekst{fill:#2F7FB5;font:600 12.5px "Segoe UI",system-ui,sans-serif;stroke:#fff;stroke-width:3px;paint-order:stroke}
    .dv-box{fill:#16803D;fill-opacity:.09;stroke:#16803D;stroke-width:1.8}
    .dv-box.nok{fill:#C6472B;fill-opacity:.10;stroke:#C6472B}
    .dv-box.diep{fill-opacity:.05}
    .dv-omtrek{fill:none;stroke:#16803D;stroke-width:1.2;stroke-dasharray:6 4}
    .dv-romp{fill:#29235C;fill-opacity:.82;stroke:#29235C;stroke-width:1.2}
    .dv-romp.nok{fill:#C6472B;stroke:#C6472B}
    .dv-hut{fill:#E9EEF3;stroke:#29235C;stroke-width:1.4}
    .dv-hut.nok{fill:#F8DED6;stroke:#C6472B}
    .dv-dak{fill:#29235C;stroke:none}
    .dv-mast{fill:#29235C;stroke:#29235C;stroke-width:1}
    .dv-mast.nok{fill:#C6472B;stroke:#C6472B}
    .dv-toetspeil{stroke:#7A3FAE;stroke-width:1.2;stroke-dasharray:5 3}
    .dv-conflict{stroke:#C6472B;stroke-width:4.5;fill:none;stroke-linecap:round}
    .dv-maat{stroke:#16803D;stroke-width:1.4;fill:none}
    .dv-maat.nok{stroke:#C6472B}
    .dv-maat-tekst{fill:#16803D;font:700 14px "Segoe UI",system-ui,sans-serif;stroke:#fff;stroke-width:3px;paint-order:stroke}
    .dv-maat-tekst.nok{fill:#C6472B}
    .maatlijn{stroke:#DCE3E8;stroke-width:1}
    .tekst{fill:#6B7A8C;font:13.8px "Segoe UI",system-ui,sans-serif}
    .lijn{stroke:#1E7FA6;stroke-width:1.8;fill:none}
    .huidig-station{stroke:#C6472B;stroke-width:1.2;stroke-dasharray:4 3}
    .maat{fill:#1B2A38;font:600 14.5px "Segoe UI",system-ui,sans-serif}
    .maat-stip{fill:#1B2A38}
    .maat-bgt{fill:#C6472B;font:700 17px "Segoe UI",system-ui,sans-serif}
    .maat-bgt-stip{fill:#C6472B}
    .maat-bgt-naam{fill:#C6472B;font:600 15px "Segoe UI",system-ui,sans-serif}
    .bgt-grenslijn{stroke:#C6472B;stroke-width:0.8;stroke-dasharray:2 3;opacity:.6}
    .as-naam{fill:#1B2A38;font:700 17px "Segoe UI",system-ui,sans-serif;stroke:#fff;stroke-width:3px;paint-order:stroke;stroke-linejoin:round}
    .bgt-naam{fill:#1B2A38;font:600 17px "Segoe UI",system-ui,sans-serif}
    .lijn-b{stroke:#8E3FAE}
    .maat-b{fill:#8E3FAE}
    .maat-stip-b{fill:#8E3FAE}
    .legenda-tekst{fill:#425064;font:600 14.5px "Segoe UI",system-ui,sans-serif}
    .water-vlak{fill:#5AA9E6;fill-opacity:.28;stroke:none}
    .waterlijn{stroke:#1F6FB5;stroke-width:1.6}
    .waterlijn-hulp{stroke:#1F6FB5;stroke-width:0.8;stroke-dasharray:3 3;opacity:.55}
    .waterpeil-teken{fill:none;stroke:#1F6FB5;stroke-width:1.2}
    .waterpeil-tekst{fill:#1F6FB5;font:700 15px "Segoe UI",system-ui,sans-serif}
    .maatlijn-v{stroke:#E8EDF1;stroke-width:1}
    .maatketting{stroke:#425064;stroke-width:1;fill:none}
    .maatketting-tekst{fill:#425064;font:600 13.8px "Segoe UI",system-ui,sans-serif}
    .afstand-as{stroke:#6B7A8C;stroke-width:1}
    .tekst-nap{fill:#1B2A38;font-weight:700}
    .tekst-eenheid{font-weight:600}
    .nap-lijn{stroke:#1B2A38;stroke-width:1.3;stroke-dasharray:10 3 2 3}
    .nap-tekst{fill:#1B2A38;font:700 13px "Segoe UI",system-ui,sans-serif;stroke:#fff;stroke-width:3px;paint-order:stroke;stroke-linejoin:round}
    .legenda-kop{fill:#1B2A38;font:700 14.5px "Segoe UI",system-ui,sans-serif}
    .legenda-item{fill:#1B2A38;font:13px "Segoe UI",system-ui,sans-serif}
    .legenda-voet{fill:#425064;font:600 13px "Segoe UI",system-ui,sans-serif}
  `;

  /**
   * Zet een svg om naar een JPEG-dataURL van precies breedtePx×hoogtePx.
   * JPEG i.p.v. PNG omdat jsPDF PNG-afbeeldingen kennelijk ongecomprimeerd
   * opslaat (geen FlateDecode) — bij tientallen dwarsprofielen liep de PDF
   * daardoor op tot tientallen MB's. JPEG is al gecomprimeerd, dus jsPDF
   * hoeft er niets meer mee te doen.
   */
  async function svgNaarJpegDataUrl(svgEl, breedtePx, hoogtePx) {
    const stijl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    stijl.textContent = SVG_EXPORT_STIJL;
    svgEl.insertBefore(stijl, svgEl.firstChild);
    svgEl.setAttribute('width', breedtePx);
    svgEl.setAttribute('height', hoogtePx);
    const svgTekst = new XMLSerializer().serializeToString(svgEl);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgTekst);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('svg kon niet worden gerasterd'));
      img.src = svgDataUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = breedtePx; canvas.height = hoogtePx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, breedtePx, hoogtePx);
    ctx.drawImage(img, 0, 0, breedtePx, hoogtePx);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  /* ────────────────────────────────────────────────────────────────
     PDF-export met instellingen. Opent een venster waarin je kiest:
     papierformaat en oriëntatie, wat er in de PDF komt (bovenaanzicht,
     lengteprofiel, dwarsprofielen), welke stations, hoeveel profielen
     per pagina, de PDF-overdrijving, wat er op het bovenaanzicht staat,
     en de gegevens voor het titelblok. Elke pagina krijgt een titelblok
     met het Lutrea-logo en bladnummering.

     Het bovenaanzicht is geen schermafdruk meer: het wordt opnieuw
     getekend op printresolutie, op een vaste schaal (1:N), met legenda,
     noordpijl, schaalstok en stationslabels bij de dwarsprofielen.
     ──────────────────────────────────────────────────────────────── */

  const PDF_OPSLAG = 'ptsviewer-pdf-v1';
  const PAPIER_MM = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
  const STANDAARD_SCHALEN = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000, 25000, 50000];
  const PDF_MAX_PIXELS = 40e6;

  const pdfDialoog = document.getElementById('pdfDialoog');
  const pdfStatus = document.getElementById('pdfStatus');
  const pdfMaakKnop = document.getElementById('pdfMaak');

  function leesPdfInstellingen() {
    const v = (id) => document.getElementById(id);
    if (!v('pdfFormaat')) return null;
    return {
      formaat: v('pdfFormaat').value,
      orientatie: v('pdfOrientatie').value,
      bovenaanzicht: v('pdfBovenaanzicht').checked,
      lengteprofiel: v('pdfLengteprofiel').checked,
      dwarsprofielen: v('pdfDwarsprofielen').checked,
      alleAssen: v('pdfAssen')?.value === 'alle',
      stationVan: v('pdfStationVan').value,
      stationTot: v('pdfStationTot').value,
      perPagina: v('pdfPerPagina').value,
      dwarsSchaal: v('pdfDwarsSchaal').value,
      overdrijving: Number(printOverdrijvingVeld.value) || 1,
      puntenwolk: v('pdfPuntenwolk').checked,
      bgt: v('pdfBgt').checked,
      bomen: v('pdfBomen').checked,
      luchtfoto: v('pdfLuchtfoto').checked,
      stationLabels: v('pdfStationLabels').checked,
      dpi: Number(v('pdfDpi').value) || 150,
      projectnaam: v('pdfProjectnaam').value.trim(),
      projectnummer: v('pdfProjectnummer').value.trim(),
      tekeningnummer: (v('pdfTekeningnummer')?.value || '').trim(),
      opmerkingen: (v('pdfOpmerkingen')?.value || '').trim(),
      bladindeling: v('pdfBladindeling')?.value || 'kolom',
      teksthoogte: v('pdfTeksthoogte')?.value || 'auto',
      beeld3D: v('pdf3D') ? v('pdf3D').checked : false,
      blad3D: v('pdf3DBlad') ? v('pdf3DBlad').checked : true,
      doorvaart: v('pdfDoorvaart') ? v('pdfDoorvaart').checked : true,
      snoei: v('pdfSnoei') ? v('pdfSnoei').checked : true,
      opdrachtgever: v('pdfOpdrachtgever').value.trim(),
      omschrijving: v('pdfOmschrijving').value.trim(),
      getekend: v('pdfGetekend').value.trim(),
      gecontroleerd: v('pdfGecontroleerd').value.trim(),
      status: v('pdfStatusVeld').value,
      revisie: v('pdfRevisie').value.trim(),
      datum: v('pdfDatum').value,
      bladen: (v('pdfBladen')?.value || '').trim(),
      losseBladen: !!v('pdfLosseBladen')?.checked,
    };
  }
  /** "4" / "2-5, 8" / "" → Set met bladnummers (1-based), of null = alle bladen. */
  function leesBladSelectie(tekst) {
    const t = String(tekst || '').trim().toLowerCase();
    if (!t || t === 'alle' || t === 'alles') return null;
    const set = new Set();
    for (const deel of t.split(/[,; ]+/).filter(Boolean)) {
      const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(deel);
      if (m) { let a = +m[1], b = +m[2]; if (a > b) [a, b] = [b, a]; for (let i = a; i <= Math.min(b, a + 999); i++) set.add(i); }
      else if (/^\d+$/.test(deel)) set.add(+deel);
      else throw new Error(`"${deel}" is geen bladnummer (gebruik bv. 4 of 2-5, 8)`);
    }
    return set.size ? set : null;
  }

  function zetPdfInstellingen(inst) {
    if (!inst) return;
    const zet = (id, w) => { const el = document.getElementById(id); if (el && w !== undefined && w !== null) el.value = w; };
    const vink = (id, w) => { const el = document.getElementById(id); if (el && typeof w === 'boolean') el.checked = w; };
    zet('pdfFormaat', inst.formaat); zet('pdfOrientatie', inst.orientatie);
    if (inst.alleAssen !== undefined) zet('pdfAssen', inst.alleAssen ? 'alle' : 'actief');
    vink('pdfBovenaanzicht', inst.bovenaanzicht); vink('pdfLengteprofiel', inst.lengteprofiel); vink('pdfDwarsprofielen', inst.dwarsprofielen);
    zet('pdfPerPagina', inst.perPagina); zet('pdfDwarsSchaal', inst.dwarsSchaal);
    if (inst.overdrijving) printOverdrijvingVeld.value = inst.overdrijving;
    vink('pdfPuntenwolk', inst.puntenwolk); vink('pdfBgt', inst.bgt); vink('pdfBomen', inst.bomen);
    vink('pdfLuchtfoto', inst.luchtfoto); vink('pdfStationLabels', inst.stationLabels);
    zet('pdfDpi', inst.dpi);
    vink('pdfLosseBladen', inst.losseBladen);
    zet('pdfProjectnaam', inst.projectnaam); zet('pdfProjectnummer', inst.projectnummer);
    zet('pdfTekeningnummer', inst.tekeningnummer); zet('pdfOpmerkingen', inst.opmerkingen); zet('pdfBladindeling', inst.bladindeling); zet('pdfTeksthoogte', inst.teksthoogte); vink('pdf3D', inst.beeld3D); vink('pdf3DBlad', inst.blad3D); if (inst.doorvaart != null) vink('pdfDoorvaart', inst.doorvaart); if (inst.snoei != null) vink('pdfSnoei', inst.snoei);
    zet('pdfOpdrachtgever', inst.opdrachtgever); zet('pdfOmschrijving', inst.omschrijving);
    zet('pdfGetekend', inst.getekend); zet('pdfGecontroleerd', inst.gecontroleerd);
    zet('pdfStatusVeld', inst.status); zet('pdfRevisie', inst.revisie);
  }

  function bewaarPdfInstellingen() {
    const inst = leesPdfInstellingen();
    if (!inst) return;
    const bewaar = { ...inst };
    delete bewaar.datum; delete bewaar.stationVan; delete bewaar.stationTot; delete bewaar.bladen;
    try { localStorage.setItem(PDF_OPSLAG, JSON.stringify(bewaar)); } catch (e) { /* geen opslag beschikbaar */ }
  }

  try { zetPdfInstellingen(JSON.parse(localStorage.getItem(PDF_OPSLAG) || 'null')); } catch (e) { /* negeren */ }

  function geselecteerdeStations(inst) {
    const van = inst.stationVan === '' ? -Infinity : Number(inst.stationVan);
    const tot = inst.stationTot === '' ? Infinity : Number(inst.stationTot);
    return dwarsStations.filter(st => st >= van - 1e-6 && st <= tot + 1e-6);
  }

  function werkPdfSamenvattingBij() {
    const inst = leesPdfInstellingen();
    if (!inst) return;
    const n = geselecteerdeStations(inst).length;
    const delen = [];
    if (inst.bovenaanzicht) delen.push('bovenaanzicht');
    if (inst.blad3D) delen.push('3D-beeld');
    if (inst.doorvaart && dvPdfMogelijk()) delen.push('doorvaartcontrole');
    if (inst.snoei && begroeiing && snKader()) delen.push('snoeilijst');
    if (inst.lengteprofiel) delen.push('lengteprofiel');
    if (inst.dwarsprofielen) delen.push(`${n} dwarsprofiel${n === 1 ? '' : 'en'}`);
    let bladTekst = '';
    try {
      const sel = leesBladSelectie(inst.bladen);
      if (sel) bladTekst = ` · alleen blad ${inst.bladen}`;
    } catch (err) { bladTekst = ` · ⚠ ${err.message}`; }
    if (inst.losseBladen) bladTekst += ' · elk blad een los bestand';
    document.getElementById('pdfSamenvatting').textContent =
      delen.length ? `In de PDF: ${delen.join(', ')} · ${inst.formaat} ${inst.orientatie}${bladTekst}` : 'Kies minstens één onderdeel.';
    pdfMaakKnop.disabled = !delen.length;
  }

  printKnop.addEventListener('click', () => {
    if (!xs) return;
    if (!pdfDialoog) { toonFout('index.html is nog de oude versie — vervang ook index.html uit de update.'); return; }
    const s = asPunten.length >= 2 ? stationsLangsAs() : [0];
    const lengte = s[s.length - 1];
    document.getElementById('pdfStationVan').placeholder = '0';
    document.getElementById('pdfStationTot').placeholder = lengte.toFixed(1);
    document.getElementById('pdfDatum').value = new Date().toISOString().slice(0, 10);
    const projectVeld = document.getElementById('pdfProjectnaam');
    if (!projectVeld.value && bronBestandsnaam) projectVeld.value = bronBestandsnaam.replace(/\.[^.]+$/, '');
    const heeftAs = dwarsStations.length > 0;
    document.getElementById('pdfLengteprofiel').disabled = !heeftAs;
    document.getElementById('pdfDwarsprofielen').disabled = !heeftAs;
    document.getElementById('pdfGeenAs').hidden = heeftAs;
    pdfStatus.textContent = '';
    werkPdfSamenvattingBij();
    pdfDialoog.showModal();
    voorbeeld.blad = 0;
    planVoorbeeld(50);
  });

  {
    const vraag = document.getElementById('opslaanVragen');
    if (vraag) {
      vraag.checked = opslaanVragen();
      vraag.addEventListener('change', () => { try { localStorage.setItem('ptsviewer-opslaan-vragen', vraag.checked ? 'ja' : 'nee'); } catch { /* */ } });
    }
  }
  pdfDialoog?.addEventListener('input', werkPdfSamenvattingBij);
  pdfDialoog?.addEventListener('change', werkPdfSamenvattingBij);

  // ── voorbeeld van de print (rechtsonder in het PDF-venster) ──
  let voorbeeld = { doc: null, paginas: [], blad: 0, teller: 0, bezig: false, opnieuw: false, timer: null };
  let pdfBezig = false;
  const vbCanvas = document.getElementById('pdfVoorbeeld');
  const vbInfo = document.getElementById('pdfVoorbeeldInfo');
  const vbStatus = document.getElementById('pdfVoorbeeldStatus');
  async function toonVoorbeeldBlad() {
    if (!voorbeeld.doc || !vbCanvas) return;
    voorbeeld.blad = Math.max(0, Math.min(voorbeeld.paginas.length - 1, voorbeeld.blad));
    await tekenVoorbeeldBlad(voorbeeld.doc, voorbeeld.blad, vbCanvas);
    const pg = voorbeeld.paginas[voorbeeld.blad];
    let sel = null, selFout = false;
    try { sel = leesBladSelectie(document.getElementById('pdfBladen')?.value); } catch { selFout = true; }
    const erin = !sel || sel.has(voorbeeld.blad + 1);
    if (vbInfo) vbInfo.textContent = `blad ${voorbeeld.blad + 1} van ${voorbeeld.paginas.length}${pg ? ' · ' + pg.onderwerp : ''}${selFout ? '' : erin ? '' : ' · niet in de PDF'}`;
    vbCanvas.style.opacity = erin ? '1' : '0.4';
    document.getElementById('pdfVoorbeeldVorige').disabled = voorbeeld.blad <= 0;
    document.getElementById('pdfVoorbeeldVolgende').disabled = voorbeeld.blad >= voorbeeld.paginas.length - 1;
  }
  async function maakVoorbeeld() {
    if (!vbCanvas || !pdfDialoog?.open || pdfBezig) return;
    if (voorbeeld.bezig) { voorbeeld.opnieuw = true; return; }
    const inst = leesPdfInstellingen();
    if (!inst) return;
    if (!dwarsStations.length) { inst.lengteprofiel = false; inst.dwarsprofielen = false; }
    if (!inst.bovenaanzicht && !inst.lengteprofiel && !inst.dwarsprofielen) {
      vbStatus.textContent = 'Kies minstens één onderdeel.'; return;
    }
    voorbeeld.bezig = true; voorbeeld.opnieuw = false;
    vbStatus.textContent = 'voorbeeld bijwerken…';
    const eigen = ++voorbeeld.teller;
    try {
      const r = await maakPdf(inst, null, null, true);
      if (eigen !== voorbeeld.teller) return;
      const vorigeAantal = voorbeeld.paginas.length;
      voorbeeld.doc = r.doc; voorbeeld.paginas = r.paginas;
      if (voorbeeld.paginas.length !== vorigeAantal) voorbeeld.blad = Math.min(voorbeeld.blad, voorbeeld.paginas.length - 1);
      await toonVoorbeeldBlad();
      const lf = document.getElementById('pdfLuchtfoto')?.checked && inst.bovenaanzicht;
      vbStatus.textContent = (r.meldingen.length ? '⚠ ' + r.meldingen.join(' ') + ' ' : '') + (lf ? 'Luchtfoto staat niet in het voorbeeld, wel in de PDF.' : '');
    } catch (err) {
      vbStatus.textContent = `geen voorbeeld: ${err.message}`;
    } finally {
      voorbeeld.bezig = false;
      if (voorbeeld.opnieuw) planVoorbeeld(50);
    }
  }
  function planVoorbeeld(ms = 500) {
    clearTimeout(voorbeeld.timer);
    voorbeeld.timer = setTimeout(maakVoorbeeld, ms);
  }
  pdfDialoog?.addEventListener('input', () => planVoorbeeld());
  pdfDialoog?.addEventListener('change', () => planVoorbeeld());
  document.getElementById('pdfVoorbeeldVorige')?.addEventListener('click', () => { voorbeeld.blad--; toonVoorbeeldBlad(); });
  document.getElementById('pdfAlleenDitBlad')?.addEventListener('click', () => {
    const veld = document.getElementById('pdfBladen');
    if (!veld || !voorbeeld.paginas.length) return;
    veld.value = String(voorbeeld.blad + 1);
    werkPdfSamenvattingBij(); toonVoorbeeldBlad();
  });
  document.getElementById('pdfBladen')?.addEventListener('input', () => {
    if (/bladnummer|bestaat niet/.test(pdfStatus.textContent)) pdfStatus.textContent = '';
    if (voorbeeld.doc) toonVoorbeeldBlad();
  });
  document.getElementById('pdfVoorbeeldVolgende')?.addEventListener('click', () => { voorbeeld.blad++; toonVoorbeeldBlad(); });
  window.addEventListener('resize', () => { if (pdfDialoog?.open && voorbeeld.doc) toonVoorbeeldBlad(); });
  document.getElementById('pdfAnnuleer')?.addEventListener('click', () => { try { bewaarPdfInstellingen(); } catch { /* */ } pdfDialoog.close(); });
  pdfMaakKnop?.addEventListener('click', async () => {
    const inst = leesPdfInstellingen();
    if (!dwarsStations.length) { inst.lengteprofiel = false; inst.dwarsprofielen = false; }
    bewaarPdfInstellingen();
    try { leesBladSelectie(inst.bladen); } catch (err) { pdfStatus.textContent = err.message; return; }
    // eerst vragen waar de PDF moet komen (mag alleen direct na de klik):
    // losse bladen → een map, anders → één bestand
    let handle = null;
    if (inst.losseBladen && projectMap) {
      try { handle = await projectMap.getDirectoryHandle('uitvoer', { create: true }); } catch { handle = null; }
    } else if (inst.losseBladen) {
      if (opslaanVragen() && kanMapKiezen()) {
        try { handle = await kiesMap({ id: 'ptsviewer-pdf-map', titel: 'Map voor de PDF-bladen' }); }
        catch (err) { if (err.name === 'AbortError') { pdfStatus.textContent = 'Opslaan geannuleerd.'; return; } handle = null; }
      }
    } else {
      let sel = null; try { sel = leesBladSelectie(inst.bladen); } catch { /* al gemeld */ }
      const voorstel = sel && sel.size === 1 ? pdfBestandsnaam(inst).replace(/\.pdf$/i, `_blad${String([...sel][0]).padStart(2, '0')}.pdf`)
        : sel ? pdfBestandsnaam(inst).replace(/\.pdf$/i, '_bladen.pdf') : pdfBestandsnaam(inst);
      handle = await kiesOpslag(voorstel, 'pdf');
      if (handle === false) { pdfStatus.textContent = 'Opslaan geannuleerd.'; return; }
    }
    pdfMaakKnop.disabled = true;
    pdfBezig = true;
    const eerdereTekst = printKnop.textContent;
    printKnop.disabled = true;
    printKnop.textContent = 'PDF maken…';
    try {
      const melding = await maakPdf(inst, (tekst) => { pdfStatus.textContent = tekst; }, handle);
      pdfStatus.textContent = melding || 'PDF klaar.';
      // klaar: venster dicht; het resultaat staat in de statusbalk, een eventuele waarschuwing als melding
      pdfDialoog.close();
      if (melding) toonFout(melding);
    } catch (err) {
      console.error(err);
      pdfStatus.textContent = `PDF maken mislukt: ${err.message}`;
    } finally {
      pdfBezig = false;
      pdfMaakKnop.disabled = false;
      printKnop.disabled = false;
      printKnop.textContent = eerdereTekst;
    }
  });

  // ── hulpfuncties voor de PDF ─────────────────────────────────────────
  function hexNaarRgb(kleur) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(kleur || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [80, 80, 80];
  }
  function mooiGetal(waarde) {
    const macht = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, waarde))));
    const f = waarde / macht;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * macht;
  }
  function kortTekst(doc, tekst, maxW) {
    tekst = String(tekst ?? '');
    if (doc.getTextWidth(tekst) <= maxW) return tekst;
    while (tekst.length > 1 && doc.getTextWidth(tekst + '…') > maxW) tekst = tekst.slice(0, -1);
    return tekst + '…';
  }
  function schaalTekst(n) { return '1:' + Math.round(n).toLocaleString('nl-NL'); }

  async function logoAlsPng() {
    const img = document.querySelector('header .merk img');
    if (!img || !img.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    try { return { data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }; } catch { return null; }
  }

  /** Luchtfotodelen voor de PDF ophalen. Met crossOrigin, zodat het canvas
   *  exporteerbaar blijft als PDOK dat toestaat; zo niet, dan zonder foto. */
  async function laadLuchtfotoVoorPdf(minX, minY, maxX, maxY, meterPerPixel) {
    let niveau = LUCHTFOTO_MATRICES[LUCHTFOTO_MATRICES.length - 1];
    for (const m of LUCHTFOTO_MATRICES) if (m.resolutie <= meterPerPixel) { niveau = m; break; }
    let idx = niveau.level, tegels;
    for (; idx >= 0; idx--) {
      const m = LUCHTFOTO_MATRICES[idx], tw = m.tileWereld;
      const c0 = Math.floor((minX - LUCHTFOTO_ORIGIN_X) / tw), c1 = Math.floor((maxX - LUCHTFOTO_ORIGIN_X) / tw);
      const r0 = Math.floor((LUCHTFOTO_ORIGIN_Y - maxY) / tw), r1 = Math.floor((LUCHTFOTO_ORIGIN_Y - minY) / tw);
      if ((c1 - c0 + 1) * (r1 - r0 + 1) <= 400) {
        tegels = [];
        for (let col = c0; col <= c1; col++) for (let row = r0; row <= r1; row++) tegels.push({ m, col, row });
        break;
      }
    }
    if (!tegels) return [];
    const geladen = await Promise.all(tegels.map(t => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const klok = setTimeout(() => resolve(null), 20000);
      img.onload = () => { clearTimeout(klok); resolve({ ...t, img }); };
      img.onerror = () => { clearTimeout(klok); resolve(null); };
      img.src = `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:28992/${String(t.m.level).padStart(2, '0')}/${t.col}/${t.row}.jpeg`;
    })));
    return geladen.filter(Boolean);
  }

  /** Tekent het bovenaanzicht op een los canvas, op schaal. */
  async function tekenBovenaanzichtVoorPdf(inst, breedteMm, hoogteMm, stations, onVoortgang, dxfDoc = null) {
    // gebied: rond de as (+ halve profielbreedte), anders de hele puntenwolk
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();
    let minX, minY, maxX, maxY;
    if (asPunten.length >= 2) {
      // kaartuitsnede om de as heen — bij "alle assen" om alle assen heen
      const kaartPunten = inst.alleAssen ? assen.flatMap(a => a.punten.length >= 2 ? a.punten : []) : asPunten;
      const hm = Math.max(pL, pR);
      minX = Math.min(...kaartPunten.map(p => p.x)) - hm - 5; maxX = Math.max(...kaartPunten.map(p => p.x)) + hm + 5;
      minY = Math.min(...kaartPunten.map(p => p.y)) - hm - 5; maxY = Math.max(...kaartPunten.map(p => p.y)) + hm + 5;
    } else {
      ({ minX, maxX, minY, maxY } = grenzen());
    }
    const mmPerMNodig = Math.min(breedteMm / Math.max(1e-6, maxX - minX), hoogteMm / Math.max(1e-6, maxY - minY));
    const nNodig = 1000 / mmPerMNodig;
    const N = STANDAARD_SCHALEN.find(s => s >= nNodig) || Math.ceil(nNodig / 1000) * 1000;

    let dpi = inst.dpi;
    let pw = Math.round(breedteMm / 25.4 * dpi), ph = Math.round(hoogteMm / 25.4 * dpi);
    if (pw * ph > PDF_MAX_PIXELS) {
      dpi = Math.floor(dpi * Math.sqrt(PDF_MAX_PIXELS / (pw * ph)));
      pw = Math.round(breedteMm / 25.4 * dpi); ph = Math.round(hoogteMm / 25.4 * dpi);
    }
    const pxPerM = (1000 / N) / 25.4 * dpi;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const naarPx = (x, y) => [(x - cx) * pxPerM + pw / 2, -(y - cy) * pxPerM + ph / 2];
    const naarWereld = (px, py) => [(px - pw / 2) / pxPerM + cx, -(py - ph / 2) / pxPerM + cy];
    const pt = dpi / 96; // schermpixel → printpixel

    const canvas = document.createElement('canvas');
    if (!dxfDoc) { canvas.width = pw; canvas.height = ph; }
    let ctx = dxfDoc ? new OpnameCtx(pw, ph) : canvas.getContext('2d');
    let notitie = '';
    const laagDxf = (n) => { if (dxfDoc) ctx.dxfLaag = n; };

    const tekenInhoud = (fotoTegels) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pw, ph);
      if (fotoTegels && fotoTegels.length) {
        for (const t of fotoTegels) {
          const tw = t.m.tileWereld;
          const [x0, y0] = naarPx(LUCHTFOTO_ORIGIN_X + t.col * tw, LUCHTFOTO_ORIGIN_Y - t.row * tw);
          const [x1, y1] = naarPx(LUCHTFOTO_ORIGIN_X + (t.col + 1) * tw, LUCHTFOTO_ORIGIN_Y - (t.row + 1) * tw);
          ctx.drawImage(t.img, x0, y0, x1 - x0, y1 - y0);
        }
      }
      if (inst.puntenwolk) {
        ctx.globalAlpha = fotoTegels && fotoTegels.length ? 0.55 : 1;
        // stipgrootte afgestemd op de puntdichtheid, zodat de wolk als vlak oogt
        const b = grenzen();
        const tussenafstand = Math.sqrt(Math.max(1e-6, (b.maxX - b.minX) * (b.maxY - b.minY)) / Math.max(1, xs.length));
        const s = Math.max(1.5, Math.min(30 * pt, tussenafstand * pxPerM * 1.15));
        if (typeof CanvasRenderingContext2D !== 'undefined' && ctx instanceof CanvasRenderingContext2D) {
          ctx.drawImage(rasterPunten(Math.round(pw), Math.round(ph), pxPerM, pw / 2 - cx * pxPerM, -pxPerM, ph / 2 + cy * pxPerM, s), 0, 0);
        } else {
          for (let i = 0; i < xs.length; i++) {
            const [px, py] = naarPx(xs[i], ys[i]);
            if (px < -s || py < -s || px > pw + s || py > ph + s) continue;
            ctx.fillStyle = kleurVoorPunt(i);
            ctx.fillRect(px - s / 2, py - s / 2, s, s);
          }
        }
        ctx.globalAlpha = 1;
      }
      laagDxf('PV_KAART_BGT');
      if (inst.bgt) {
        for (const laag of bgtLagen) {
          if (laag.puntAlleen) continue;
          for (const ring of laag.ringen) {
            if (ring.length < 2) continue;
            ctx.beginPath();
            ring.forEach((p, i) => { const [px, py] = naarPx(p.x, p.y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
            if (!laag.lijnAlleen) {
              ctx.closePath();
              if (bgtWeergave === 'vlakken') { ctx.fillStyle = laag.stijl.vul; ctx.fill(); }
            }
            ctx.strokeStyle = laag.stijl.lijn;
            ctx.lineWidth = (laag.lijnAlleen ? 1.6 : 1.2) * pt;
            ctx.setLineDash((laag.stijl.streep || []).map(v => v * pt));
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      laagDxf('PV_KAART_BOMEN');
      if (inst.bomen) {
        for (const laag of boomLagen) {
          if (!laag.puntAlleen) continue;
          const [px, py] = naarPx(laag.ringen[0][0].x, laag.ringen[0][0].y);
          const straal = 6 * pt, paal = straal * 1.3;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - paal);
          ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 1.6 * pt; ctx.stroke();
          ctx.beginPath(); ctx.arc(px, py - paal, straal, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(60,140,60,.55)'; ctx.fill();
          ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 1.2 * pt; ctx.stroke();
        }
      }
      // brug (footprint) en doorvaartbox
      {
        const w = brugBoven || brugOnder;
        laagDxf('PV_KAART_BRUG');
        if (w) {
          ctx.fillStyle = 'rgba(90,100,115,0.45)';
          const stap = Math.max(1, Math.floor(w.xs.length / (dxfDoc ? 2500 : 60000)));
          const st = Math.max(1, w.idx.afstand * stap * pxPerM * 1.2);
          for (let i = 0; i < w.xs.length; i += stap) { const [px, py] = naarPx(w.xs[i], w.ys[i]); if (px > -st && py > -st && px < pw + st && py < ph + st) ctx.fillRect(px - st / 2, py - st / 2, st, st); }
        }
        const k = doorvaart.tonen ? dvKader() : null;
        laagDxf('PV_KAART_DOORVAART');
        if (k) {
          const r = dvResultaat;
          const kleur = !r ? '#1E7FA6' : r.ok ? '#16803D' : '#C6472B';
          const n = 24, links = [], rechts = [];
          for (let i = 0; i <= n; i++) { const st2 = k.s0 + (k.s1 - k.s0) * i / n; links.push(puntOpStationOffset(st2, k.c - k.B / 2)); rechts.push(puntOpStationOffset(st2, k.c + k.B / 2)); }
          ctx.beginPath();
          [...links, ...rechts.reverse()].forEach((q, i) => { const [px, py] = naarPx(q.x, q.y); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
          ctx.closePath();
          ctx.fillStyle = !r ? 'rgba(30,127,166,0.10)' : r.ok ? 'rgba(22,128,61,0.12)' : 'rgba(198,71,43,0.12)'; ctx.fill();
          ctx.setLineDash([8 * pt, 4 * pt]); ctx.lineWidth = 2 * pt; ctx.strokeStyle = kleur; ctx.stroke(); ctx.setLineDash([]);
          if (r) {
            tekenDekkingOpCanvas(ctx, naarPx, r.dekkingD, { pt, w: pw, h: ph, labels: 0 });
            tekenDekkingOpCanvas(ctx, naarPx, r.dekkingH, { pt, w: pw, h: ph, labels: 0 });
            ctx.fillStyle = '#C6472B';
            const alle = [...(r.conflictenH || []), ...(r.conflictenD || [])];
            const stap = Math.max(1, Math.floor(alle.length / (dxfDoc ? 2500 : 6000)));
            for (let i = 0; i < alle.length; i += stap) { const [px, py] = naarPx(alle[i].x, alle[i].y); ctx.fillRect(px - 2 * pt, py - 2 * pt, 4 * pt, 4 * pt); }
            tekenDekkingOpCanvas(ctx, naarPx, r.dekkingD, { pt, w: pw, h: ph, labels: 2, naam: 'bodem', alleenLabels: true });
            tekenDekkingOpCanvas(ctx, naarPx, r.dekkingH, { pt, w: pw, h: ph, naam: 'onderzijde', alleenLabels: true });
          }
          const p0 = puntOpStationOffset(k.s0, k.c + k.B / 2);
          const [lx, ly] = naarPx(p0.x, p0.y);
          ctx.font = `700 ${15 * pt}px "Segoe UI", Arial, sans-serif`;
          const tekst = `doorvaartprofiel ${komma(k.B, 2)} × ${komma(k.H, 2)} m${r ? (r.ok ? (dvGaten(r) ? ' · voldoet, deels niet gemeten' : ' · voldoet') : ' · voldoet niet') : ''}`;
          ctx.lineWidth = 4 * pt; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.strokeText(tekst, lx + 8 * pt, ly + 18 * pt);
          ctx.fillStyle = kleur; ctx.fillText(tekst, lx + 8 * pt, ly + 18 * pt);
        }
      }
      // snoeicheck: profiel, marge, begroeiing en genummerde snoeipunten
      laagDxf('PV_KAART_KADASTER');
      if (percelen.length) tekenPercelenOpCanvas(ctx, naarPx, { pt, w: pw, h: ph });
      laagDxf('PV_KAART_SNOEI');
      if (snResultaat && snoei.tonen) tekenSnoeiOpCanvas(ctx, naarPx, { pt, w: pw, h: ph, pxPerM, badge: 10, maxPunten: dxfDoc ? 1500 : 80000, maxGekleurd: dxfDoc ? 3000 : 60000 });
      laagDxf('PV_KAART_STATIONERING');
      tekenPalenOpCanvas(ctx, naarPx, { pt: pt * 1.15, w: pw, h: ph });
      laagDxf('PV_KAART_PROFIELLIJNEN');
      // dwarsprofiel-lijnen met stationslabel
      const tekenStationsVanAs = (stations) => {
        if (!(stations.length && asPunten.length >= 2)) return;
        const fontPx = 18 * pt;
        ctx.font = `700 ${fontPx}px "Segoe UI", Arial, sans-serif`;
        ctx.lineJoin = 'round';
        const minAfstand = fontPx * 2.2;
        let laatste = null;
        const labels = [];
        for (const st of stations) {
          const l = puntOpStationOffset(st, -pL), r = puntOpStationOffset(st, pR);
          const [lx, ly] = naarPx(l.x, l.y), [rx, ry] = naarPx(r.x, r.y);
          ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(rx, ry);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.4 * pt; ctx.stroke();
          ctx.strokeStyle = '#C6472B'; ctx.lineWidth = 1.4 * pt; ctx.stroke();
          if (!inst.stationLabels) continue;
          if (laatste && Math.hypot(lx - laatste[0], ly - laatste[1]) < minAfstand) continue;
          laatste = [lx, ly];
          labels.push({ tekst: `${st.toFixed(st % 1 ? 1 : 0)}`, lx, ly, rx, ry });
        }
        // labels pas na alle lijnen, zodat geen lijn over een label heen loopt:
        // wit vakje met rode rand, net voorbij het linker eind van het profiellijntje
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const lb of labels) {
          const w = ctx.measureText(lb.tekst).width + fontPx * 0.7, h = fontPx * 1.35;
          const dx = lb.lx - lb.rx, dy = lb.ly - lb.ry, d = Math.hypot(dx, dy) || 1;
          const ux = dx / d, uy = dy / d;
          // afstand vanaf het lijneinde zodat het vakje er net los van staat (ook bij schuine lijnen)
          const af = Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2 + 3 * pt;
          const cx = lb.lx + ux * af, cy = lb.ly + uy * af;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 3 * pt); else ctx.rect(cx - w / 2, cy - h / 2, w, h);
          ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
          ctx.strokeStyle = '#C6472B'; ctx.lineWidth = 1.4 * pt; ctx.stroke();
          ctx.fillStyle = '#C6472B';
          ctx.fillText(lb.tekst, cx, cy + fontPx * 0.04);
        }
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      };
      if (inst.alleAssen && assen.filter(a => a.punten.length >= 2).length > 1 && inst.dwarsprofielen) {
        // stations van elke as (tijdelijk die as actief maken)
        const start = actieveAs;
        for (let ai = 0; ai < assen.length; ai++) {
          if (assen[ai].punten.length < 2) continue;
          if (ai !== actieveAs) zetActieveAs(ai, true);
          tekenStationsVanAs(geselecteerdeStations(inst));
        }
        if (actieveAs !== start) zetActieveAs(start, true);
      } else tekenStationsVanAs(stations);
      laagDxf('PV_KAART_AS');
      // overige assen (grijs gestreept, met naam)
      const metAlleAssen = inst.alleAssen && assen.filter(a => a.punten.length >= 2).length > 1;
      assen.forEach((a, ai) => {
        if (ai === actieveAs || a.punten.length < 2) return;
        ctx.beginPath();
        a.punten.forEach((p, i) => { const [px, py] = naarPx(p.x, p.y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4 * pt; ctx.stroke();
        ctx.strokeStyle = metAlleAssen ? '#1B2A38' : '#7A8896'; ctx.lineWidth = 1.8 * pt;
        if (!metAlleAssen) ctx.setLineDash([7 * pt, 4 * pt]);
        ctx.stroke(); ctx.setLineDash([]);
      });
      if (assen.filter(a => a.punten.length >= 2).length > 1) {
        ctx.font = `600 ${11 * pt}px Helvetica, Arial, sans-serif`;
        for (const a of assen) {
          if (a.punten.length < 2) continue;
          const [lx, ly] = naarPx(a.punten[0].x, a.punten[0].y);
          ctx.lineWidth = 3 * pt; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.strokeText(a.naam, lx + 6 * pt, ly - 6 * pt);
          ctx.fillStyle = '#1B2A38'; ctx.fillText(a.naam, lx + 6 * pt, ly - 6 * pt);
        }
      }
      // as
      if (asPunten.length > 0) {
        ctx.beginPath();
        asPunten.forEach((p, i) => { const [px, py] = naarPx(p.x, p.y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5 * pt; ctx.stroke();
        ctx.strokeStyle = '#1B2A38'; ctx.lineWidth = 2.2 * pt; ctx.stroke();
        for (const p of asPunten) {
          const [px, py] = naarPx(p.x, p.y);
          ctx.beginPath(); ctx.arc(px, py, 3.2 * pt, 0, Math.PI * 2); ctx.fillStyle = '#1B2A38'; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 * pt; ctx.stroke();
        }
      }
    };

    let fotoTegels = null;
    if (inst.luchtfoto) {
      onVoortgang?.('Luchtfoto ophalen bij PDOK…');
      const [wx0, wy1] = naarWereld(0, 0), [wx1, wy0] = naarWereld(pw, ph);
      fotoTegels = await laadLuchtfotoVoorPdf(wx0, wy0, wx1, wy1, 1 / pxPerM);
      if (!fotoTegels.length) notitie = 'Luchtfoto kon niet worden opgehaald; bovenaanzicht zonder foto.';
    }
    onVoortgang?.('Bovenaanzicht tekenen…');
    await new Promise(r => setTimeout(r, 0));
    tekenInhoud(fotoTegels);
    if (dxfDoc) return { data: dxfDoc.vang({ soort: 'kaart', ops: ctx.ops, pw, ph, pxPerM, cx, cy, dpi, N }), N, dpi, notitie };
    let data;
    try {
      data = canvas.toDataURL('image/jpeg', 0.9);
    } catch (e) {
      // PDOK stond export van de fototegels niet toe → opnieuw zonder foto
      ctx = canvas.getContext('2d');
      const schoon = document.createElement('canvas');
      schoon.width = pw; schoon.height = ph;
      ctx = schoon.getContext('2d');
      tekenInhoud(null);
      data = schoon.toDataURL('image/jpeg', 0.9);
      notitie = 'Luchtfoto mocht niet in de PDF (PDOK staat export niet toe); bovenaanzicht zonder foto.';
    }
    return { data, N, dpi, notitie };
  }

  function tekenNoordpijl(doc, cx, cy) {
    doc.setFillColor(255, 255, 255); doc.setDrawColor(120, 130, 140); doc.setLineWidth(0.2);
    doc.circle(cx, cy, 7, 'FD');
    doc.setFillColor(27, 42, 56); doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.25);
    doc.triangle(cx, cy - 4.2, cx - 2.6, cy + 4.6, cx, cy + 2.6, 'F');
    doc.triangle(cx, cy - 4.2, cx + 2.6, cy + 4.6, cx, cy + 2.6, 'S');
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
    doc.text('N', cx, cy - 4.8, { align: 'center' });
  }

  function tekenSchaalstok(doc, kader, N) {
    const lengteM = mooiGetal(Math.min(60, kader.w * 0.3) * N / 1000);
    const lengteMm = lengteM * 1000 / N;
    const x0 = kader.x + 4, y0 = kader.y + kader.h - 13;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(200, 205, 210); doc.setLineWidth(0.15);
    doc.rect(x0, y0, lengteMm + 14, 10, 'FD');
    const bx = x0 + 4, by = y0 + 5, seg = lengteMm / 4;
    doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.2);
    for (let i = 0; i < 4; i++) {
      if (i % 2 === 0) doc.setFillColor(27, 42, 56); else doc.setFillColor(255, 255, 255);
      doc.rect(bx + i * seg, by, seg, 1.5, 'FD');
    }
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(27, 42, 56);
    doc.text('0', bx, by - 0.8, { align: 'center' });
    doc.text(String(lengteM / 2).replace('.', ','), bx + lengteMm / 2, by - 0.8, { align: 'center' });
    doc.text(`${String(lengteM).replace('.', ',')} m`, bx + lengteMm, by - 0.8, { align: 'center' });
    doc.text(schaalTekst(N), bx, by + 4.2);
  }

  function tekenLegendaBovenaanzicht(doc, kol, inst, metBron = true) {
    let y = kol.y + 4;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
    doc.text('LEGENDA', kol.x, y); y += 2;
    doc.setDrawColor(220, 227, 232); doc.setLineWidth(0.2); doc.line(kol.x, y, kol.x + kol.w, y); y += 5;
    const item = (tekst, teken) => {
      teken(kol.x, y);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(66, 80, 100);
      doc.text(kortTekst(doc, tekst, kol.w - 12), kol.x + 11, y);
      y += 5.2;
    };
    const lijn = (rgb, dik = 0.6, streep = null) => (x, yy) => {
      doc.setDrawColor(...rgb); doc.setLineWidth(dik);
      if (streep) doc.setLineDashPattern(streep, 0);
      doc.line(x, yy - 1, x + 8, yy - 1);
      doc.setLineDashPattern([], 0);
    };
    if (inst.puntenwolk && kleurModus === 'rgb' && cs) {
      item('Puntenwolk — RGB-kleur uit de inmeting', (x, yy) => {
        [[120, 140, 90], [150, 130, 110], [90, 110, 120]].forEach((k, j) => { doc.setFillColor(...k); doc.rect(x + j * 2.7, yy - 2.6, 2.6, 3.2, 'F'); });
      });
    } else if (inst.puntenwolk) {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(66, 80, 100);
      doc.text('Puntenwolk — hoogte', kol.x, y); y += 3;
      const stappen = 12, bw = (kol.w - 2) / stappen;
      for (let i = 0; i < stappen; i++) {
        const h = zMin + (zMax - zMin) * (i + 0.5) / stappen;
        const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(kleurVoorHoogte(h));
        doc.setFillColor(+m[1], +m[2], +m[3]);
        doc.rect(kol.x + i * bw, y, bw + 0.05, 3, 'F');
      }
      y += 6;
      doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
      doc.text(zMin.toFixed(2), kol.x, y);
      doc.text(zMax.toFixed(2), kol.x + kol.w - 2, y, { align: 'right' });
      y += 6;
    }
    if (asPunten.length) item('As (getekend)', lijn([27, 42, 56], 0.8));
    if (dwarsStations.length) item('Dwarsprofiel (station)', lijn([198, 71, 43], 0.5));
    if (percelen.length) item(`Kadastrale perceelgrens met sectie en nummer (${perceelBron})`, lijn([122, 62, 157], 0.35, [1.4, 0.6]));
    if ((dvResultaat && doorvaart.tonen && dvGaten(dvResultaat)) || (snResultaat && snoei.tonen && snResultaat.dekking?.nGat)) item('Niet gemeten binnen de toets (dekkingskaart)', (x, yy) => {
      doc.setFillColor(214, 217, 222); doc.rect(x, yy - 2.8, 8, 3.4, 'F');
      doc.setDrawColor(60, 70, 90); doc.setLineWidth(0.2);
      for (let i = 0; i < 4; i++) doc.line(x + i * 1.55, yy + 0.6, x + i * 1.55 + 3.4, yy - 2.8);
    });
    if (stationeringAan() && paalMarkeringen().length) item(palen.modus === 'hm' ? 'Hectometer (berekend langs de as)' : `Dijkpaal (${palen.bron})`, (x, yy) => {
      doc.setDrawColor(31, 78, 121); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.35);
      doc.lines([[1.4, 1.4], [-1.4, 1.4], [-1.4, -1.4], [1.4, -1.4]], x + 4, yy - 2.4, [1, 1], 'FD', true);
    });
    if (snResultaat && snoei.tonen) {
      const r = snResultaat;
      item(`Doorloopprofiel ${komma(r.B, 2)} × ${komma(r.H, 2)} m (vrije ruimte)`, lijn([27, 42, 56], 0.45, [1.6, 0.6, 0.4, 0.6]));
      if (r.M) item(`Snoeimarge ${komma(r.M, 2)} m`, lijn([224, 138, 30], 0.4, [1, 0.7]));
      const blok = (rgb) => (x, yy) => { doc.setFillColor(...rgb); for (const [dx, dy] of [[1, -2], [2.6, -0.6], [4.2, -1.7], [5.6, -0.1], [2, 0.2]]) doc.rect(x + dx, yy + dy - 0.5, 1, 1, 'F'); };
      item('Begroeiing in het profiel (snoeien)', blok([198, 71, 43]));
      if (r.M) item('Begroeiing in de snoeimarge (meenemen)', blok([224, 138, 30]));
      item('Overige begroeiing langs het pad', blok([111, 154, 91]));
      if (r.snoeipunten.some(p => p.stam)) item('Stam van de boom bij het snoeipunt (geschat)', (x, yy) => { doc.setDrawColor(46, 125, 50); doc.setLineWidth(0.35); doc.setFillColor(255, 255, 255); doc.circle(x + 4, yy - 1, 1.2, 'FD'); doc.setFillColor(46, 125, 50); doc.circle(x + 4, yy - 1, 0.45, 'F'); });
      item('Snoeipunt — nummer, zie de snoeilijst', (x, yy) => { doc.setFillColor(198, 71, 43); doc.circle(x + 4, yy - 1, 1.8, 'F'); doc.setFontSize(5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255); doc.text('1', x + 4, yy - 0.3, { align: 'center' }); });
    }
    if (waterpeil() != null && inst.dwarsprofielen) {
      const wp = waterpeil();
      item(`Waterpeil ${wp >= 0 ? '+' : ''}${wp.toFixed(2).replace('.', ',')} m NAP (dwarsprofielen)`, (x, yy) => {
        doc.setFillColor(205, 228, 247); doc.rect(x, yy - 2.6, 8, 2.2, 'F');
        doc.setDrawColor(31, 111, 181); doc.setLineWidth(0.5); doc.line(x, yy - 2.6, x + 8, yy - 2.6);
      });
    }
    if (inst.bgt && bgtLagen.length) {
      const gezien = new Map();
      for (const l of bgtLagen) if (!l.puntAlleen) gezien.set(l.stijl.naam || l.label || 'BGT', l.stijl);
      y += 1;
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(66, 80, 100);
      doc.text(`BGT${bgtWeergave === 'lijnen' ? ' (lijnen)' : ''}`, kol.x, y); y += 4.5;
      let nItems = 0;
      for (const [naam, stijl] of gezien) {
        if (++nItems > 14) { item(`… en nog ${gezien.size - 14} lagen`, () => {}); break; }
        item(naam, lijn(hexNaarRgb(stijl.lijn), 0.45, stijl.streep ? [1.4, 0.9] : null));
      }
    }
    if (inst.bomen && boomLagen.length) {
      item('Boom (BGT)', (x, yy) => {
        doc.setDrawColor(46, 125, 50); doc.setLineWidth(0.3); doc.line(x + 4, yy + 0.6, x + 4, yy - 1.2);
        doc.setFillColor(150, 196, 150); doc.circle(x + 4, yy - 2.2, 1.4, 'FD');
      });
    }
    if (inst.luchtfoto) item('Luchtfoto PDOK (actueel)', (x, yy) => { doc.setFillColor(205, 210, 200); doc.rect(x, yy - 2.6, 8, 3.2, 'F'); });
    if (!metBron) return y;   // kolom rechts: bron/RD staan onder "Opmerkingen"
    y += 3;
    doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
    const regels = [
      `Bron: ${bronBestandsnaam || 'puntenwolk'}`,
      `${xs.length.toLocaleString('nl-NL')} punten (na uitdunnen)`,
      'Coördinaten RD New (EPSG:28992)',
    ];
    for (const r of regels) { doc.text(kortTekst(doc, r, kol.w), kol.x, y); y += 3.4; }
    return y;
  }

  // ── logo van de opdrachtgever (links in de stempel) ──
  // Wordt in de browser onthouden (localStorage), net als de andere stempelvelden.
  const KLANTLOGO_OPSLAG = 'ptsviewer-klantlogo';
  let klantLogo = null;   // { data: dataURL (PNG), w, h }
  function toonKlantLogo() {
    const img = document.getElementById('pdfKlantLogoVoorbeeld'), wis = document.getElementById('pdfKlantLogoWis');
    const kies = document.getElementById('pdfKlantLogoKies');
    if (!img) return;
    img.hidden = !klantLogo; if (wis) wis.hidden = !klantLogo;
    if (klantLogo) img.src = klantLogo.data; else img.removeAttribute('src');
    if (kies) kies.textContent = klantLogo ? 'Ander logo…' : 'Kies logo…';
  }
  async function leesKlantLogo(bestand) {
    const url = URL.createObjectURL(bestand);
    try {
      const img = await new Promise((ok, fout) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fout(new Error('afbeelding niet te lezen')); i.src = url; });
      let w = img.naturalWidth || 600, h = img.naturalHeight || 200;
      // verkleinen tot max. 1200 px breed / 400 px hoog: scherp genoeg voor de stempel, klein in opslag
      const f = Math.min(1, 1200 / w, 400 / h);
      w = Math.max(1, Math.round(w * f)); h = Math.max(1, Math.round(h * f));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      // witte/transparante rand eromheen wegsnijden, dan staat het logo zo groot mogelijk in zijn vak
      const ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] > 20 && (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      let uit = c;
      if (x1 >= x0 && y1 >= y0 && (x1 - x0 + 1 < w || y1 - y0 + 1 < h)) {
        uit = document.createElement('canvas'); uit.width = x1 - x0 + 1; uit.height = y1 - y0 + 1;
        uit.getContext('2d').drawImage(c, x0, y0, uit.width, uit.height, 0, 0, uit.width, uit.height);
      }
      return { data: uit.toDataURL('image/png'), w: uit.width, h: uit.height };
    } finally { URL.revokeObjectURL(url); }
  }
  try { const b = JSON.parse(localStorage.getItem(KLANTLOGO_OPSLAG) || 'null'); if (b && b.data) klantLogo = b; } catch { /* geen opslag */ }
  {
    const veld = document.getElementById('pdfKlantLogoBestand');
    document.getElementById('pdfKlantLogoKies')?.addEventListener('click', () => veld?.click());
    veld?.addEventListener('change', async () => {
      const f = veld.files && veld.files[0];
      veld.value = '';
      if (!f) return;
      try {
        klantLogo = await leesKlantLogo(f);
        try { localStorage.setItem(KLANTLOGO_OPSLAG, JSON.stringify(klantLogo)); } catch { /* te groot of geen opslag: alleen deze sessie */ }
      } catch (err) { toonFout('Logo: ' + err.message); }
      toonKlantLogo(); planVoorbeeld(100);
    });
    document.getElementById('pdfKlantLogoWis')?.addEventListener('click', () => {
      klantLogo = null;
      try { localStorage.removeItem(KLANTLOGO_OPSLAG); } catch { /* */ }
      toonKlantLogo(); planVoorbeeld(100);
    });
    toonKlantLogo();
  }

  // ── logo "opgesteld door" (maker): standaard het Lutrea-logo, of een eigen bestand ──
  const MAKERLOGO_OPSLAG = 'ptsviewer-makerlogo';
  let makerLogo = null;   // null = standaard (Lutrea-logo uit de app)
  function toonMakerLogo() {
    const img = document.getElementById('pdfMakerLogoVoorbeeld'), wis = document.getElementById('pdfMakerLogoWis');
    if (!img) return;
    img.src = makerLogo ? makerLogo.data : 'merk-lutrea.png';
    img.title = makerLogo ? 'Eigen logo' : 'Standaard: Lutrea-logo';
    if (wis) wis.hidden = !makerLogo;
  }
  try { const b = JSON.parse(localStorage.getItem(MAKERLOGO_OPSLAG) || 'null'); if (b && b.data) makerLogo = b; } catch { /* geen opslag */ }
  {
    const veld = document.getElementById('pdfMakerLogoBestand');
    document.getElementById('pdfMakerLogoKies')?.addEventListener('click', () => veld?.click());
    veld?.addEventListener('change', async () => {
      const f = veld.files && veld.files[0];
      veld.value = '';
      if (!f) return;
      try {
        makerLogo = await leesKlantLogo(f);
        try { localStorage.setItem(MAKERLOGO_OPSLAG, JSON.stringify(makerLogo)); } catch { /* te groot of geen opslag: alleen deze sessie */ }
      } catch (err) { toonFout('Logo: ' + err.message); }
      toonMakerLogo(); planVoorbeeld(100);
    });
    document.getElementById('pdfMakerLogoWis')?.addEventListener('click', () => {
      makerLogo = null;
      try { localStorage.removeItem(MAKERLOGO_OPSLAG); } catch { /* */ }
      toonMakerLogo(); planVoorbeeld(100);
    });
    toonMakerLogo();
  }

  function tekenTitelblok(doc, W, H, marge, titelH, inst, logo, info, blad, totaal) {
    const x = marge, y = H - marge - titelH, w = W - 2 * marge;
    // Stijl eerst even op een andere waarde zetten: na setPage() naar een eerder
    // blad schrijft jsPDF een kleur die het al "kent" anders niet opnieuw weg,
    // waardoor de rand van de stempel de kleur van het laatst getekende kreeg.
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.1); doc.setFillColor(255, 255, 255); doc.setTextColor(0, 0, 0);
    doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.35);
    doc.rect(x, y, w, titelH);
    const compact = w < 300;
    const logoW = compact ? 26 : 38;
    const bladW = compact ? 18 : 24;
    const celW = compact ? 0 : 30;
    const kolommen = compact ? [] : [
      ['Projectnr.', inst.projectnummer, 'Opdrachtgever', inst.opdrachtgever],
      ['Schaal', info.schaal || '—', 'Status', inst.status],
      ['Datum', inst.datum ? new Date(inst.datum).toLocaleDateString('nl-NL') : '—', 'Revisie', inst.revisie],
      ['Getekend', inst.getekend, 'Gecontroleerd', inst.gecontroleerd],
    ];
    const onderwerpW = compact ? 0 : Math.min(80, w * 0.18);
    // logo opdrachtgever helemaal links: vak zo breed als het logo bij de stempelhoogte nodig heeft
    const kl = klantLogo;
    const klantW = kl ? Math.min(compact ? 36 : 64, Math.max(compact ? 18 : 26, (titelH - 5) * kl.w / kl.h + 5)) : 0;
    const projectW = w - klantW - logoW - bladW - onderwerpW - kolommen.length * celW;
    const plaatsLogo = (lg, vx, vw, ruimte) => {
      const maxH = titelH - ruimte, maxW = vw - ruimte;
      let lh = maxH, lw = lh * lg.w / lg.h;
      if (lw > maxW) { lw = maxW; lh = lw * lg.h / lg.w; }
      doc.addImage(lg.data, 'PNG', vx + (vw - lw) / 2, y + (titelH - lh) / 2, lw, lh);
    };
    let cx = x;
    if (kl) {
      plaatsLogo(kl, cx, klantW, 5);
      cx += klantW;
      doc.setDrawColor(200, 207, 214); doc.setLineWidth(0.2);
      doc.line(cx, y, cx, y + titelH);
    }

    const label = (tekst, lx, ly) => { doc.setFontSize(5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140); doc.text(tekst.toUpperCase(), lx, ly); };
    const waarde = (tekst, lx, ly, maxW, grootte = 7.5, vet = true) => {
      doc.setFontSize(grootte); doc.setFont('helvetica', vet ? 'bold' : 'normal'); doc.setTextColor(27, 42, 56);
      doc.text(kortTekst(doc, tekst || '—', maxW), lx, ly);
    };

    // project
    label('Project', cx + 2.5, y + 3.6);
    waarde(inst.projectnaam || bronBestandsnaam || 'Profielviewer', cx + 2.5, y + 9, projectW - 5, compact ? 9 : 11);
    if (inst.omschrijving) waarde(inst.omschrijving, cx + 2.5, y + 13.6, projectW - 5, 7, false);
    if (compact) {
      waarde(`${info.onderwerp}${info.schaal ? ' · ' + info.schaal : ''}`, cx + 2.5, y + titelH - 3, projectW - 5, 6.5, false);
    }
    cx += projectW;

    // onderwerp
    if (!compact) {
      doc.line(cx, y, cx, y + titelH);
      label('Onderwerp', cx + 2.5, y + 3.6);
      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
      const regels = doc.splitTextToSize(info.onderwerp, onderwerpW - 5).slice(0, 3);
      regels.forEach((r, i) => doc.text(r, cx + 2.5, y + 9 + i * 3.8));
      cx += onderwerpW;
    }

    // kleine cellen (2 rijen per kolom)
    for (const [l1, w1, l2, w2] of kolommen) {
      doc.line(cx, y, cx, y + titelH);
      doc.line(cx, y + titelH / 2, cx + celW, y + titelH / 2);
      label(l1, cx + 2, y + 3.4);
      waarde(w1, cx + 2, y + titelH / 2 - 2, celW - 4, 7);
      label(l2, cx + 2, y + titelH / 2 + 3.4);
      if (l2 === 'Status') {
        const kleuren = { 'Concept': [217, 119, 6], 'Ter informatie': [30, 127, 166], 'Ter goedkeuring': [124, 58, 237], 'Definitief': [22, 128, 61] };
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(kleuren[w2] || [27, 42, 56]));
        doc.text(kortTekst(doc, w2 || '—', celW - 4), cx + 2, y + titelH - 2);
      } else {
        waarde(w2, cx + 2, y + titelH - 2, celW - 4, 7);
      }
      cx += celW;
    }

    // maker: Lutrea-logo rechts, met "opgesteld door" (los van het logo van de opdrachtgever)
    doc.setDrawColor(200, 207, 214); doc.setLineWidth(0.2);
    doc.line(cx, y, cx, y + titelH);
    label('Opgesteld door', cx + 2, y + 3.6);
    if (logo) {
      const maxH = titelH - 8, maxW = logoW - 6;
      let lh = maxH, lw = lh * logo.w / logo.h;
      if (lw > maxW) { lw = maxW; lh = lw * logo.h / logo.w; }
      doc.addImage(logo.data, 'PNG', cx + (logoW - lw) / 2, y + 5 + (titelH - 6 - lh) / 2, lw, lh);
    }
    cx += logoW;

    // blad
    doc.line(cx, y, cx, y + titelH);
    label('Blad', cx + 2, y + 3.6);
    doc.setFontSize(compact ? 9 : 12); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
    doc.text(`${blad}/${totaal}`, cx + bladW / 2, y + titelH / 2 + 3, { align: 'center' });
    doc.setFontSize(4.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 160, 170);
    doc.text(inst.formaat, cx + bladW / 2, y + titelH - 2, { align: 'center' });
  }

  // ── bladindeling "kolom rechts" (zoals bestektekeningen) ──
  // Kader met vakverdeling (1, 2, 3 … / A, B, C …), rechts een kolom over de
  // hele hoogte met legenda, opmerkingen en onderin de stempel.
  const STEMPEL_KOLOM_H = 105;   // mm

  // Contactgegevens van Lutrea in het vak "Opgesteld door" + QR-code (https://www.lutrea.nl)
  const LUTREA_CONTACT = {
    kop: 'Bezoekadres:', regels: ['Ceresstraat 13', '4811 CA Breda'],
    telefoon: '06 14 15 57 26', mail: 'info@lutrea.nl', web: 'www.lutrea.nl',
  };
  const LUTREA_QR = ["1111111001110011001111111", "1000001011101101101000001", "1011101000010000001011101", "1011101000000001001011101", "1011101011000111001011101", "1000001001011011001000001", "1111111010101010101111111", "0000000001110100000000000", "1010101000101100000010010", "1001110110001000101000001", "0000001001111100111100111", "1011000000111101101000010", "0110111110100100011101011", "0100000100110000101001001", "1000001000000000011100111", "0101100110010101101010010", "1001101000101010111111000", "0000000011111100100011011", "1111111001011011101011011", "1000001000101100100011000", "1011101011010010111111011", "1011101001110001010111100", "1011101011000101000010001", "1000001000110001101011010", "1111111010101001100100011"];
  const LUTREA_ORANJE = [226, 87, 48], LUTREA_DONKER = [29, 39, 61];

  /** QR-code als vectorvlakjes (scherp op elk formaat). */
  function tekenQr(doc, x, y, maat) {
    const n = LUTREA_QR.length, m = maat / n;
    doc.setFillColor(...LUTREA_DONKER);
    for (let r = 0; r < n; r++) {
      const rij = LUTREA_QR[r];
      for (let c = 0; c < n; c++) {
        if (rij[c] !== '1') continue;
        let e = c; while (e + 1 < n && rij[e + 1] === '1') e++;   // aaneengesloten blokjes in één rechthoek
        doc.rect(x + c * m, y + r * m, (e - c + 1) * m + 0.01, m + 0.01, 'F');
        c = e;
      }
    }
  }

  /** Kleine oranje pictogrammen (± 3 mm): telefoon, envelop, wereldbol. (x, y) = basislijn links. */
  function tekenContactIcoon(doc, soort, x, y) {
    doc.setDrawColor(...LUTREA_ORANJE); doc.setFillColor(...LUTREA_ORANJE);
    const m = y - 1.05;
    if (soort === 'mail') {
      doc.setLineWidth(0.22);
      doc.rect(x, m - 1.05, 3, 2.1, 'S');
      doc.line(x, m - 1.05, x + 1.5, m + 0.15); doc.line(x + 1.5, m + 0.15, x + 3, m - 1.05);
    } else if (soort === 'web') {
      doc.setLineWidth(0.2);
      doc.circle(x + 1.5, m, 1.3, 'S');
      doc.ellipse(x + 1.5, m, 0.55, 1.3, 'S');
      doc.line(x + 0.2, m, x + 2.8, m);
      doc.line(x + 0.4, m - 0.65, x + 2.6, m - 0.65); doc.line(x + 0.4, m + 0.65, x + 2.6, m + 0.65);
    } else {   // telefoon: hoorn als dikke boog met twee verdikte uiteinden
      doc.setLineWidth(0.32); doc.setLineCap('round');
      doc.lines([[-0.85, 0.55, -0.35, 1.95, 0.8, 2.7]], x + 0.95, m - 1.25, [1, 1], 'S', false);
      doc.setLineWidth(0.55);
      doc.line(x + 0.7, m - 1.35, x + 1.2, m - 0.85);
      doc.line(x + 1.85, m + 0.75, x + 2.35, m + 1.25);
      doc.setLineCap('butt');
    }
  }

  /** Tekeningnummer per blad: eindigt het op cijfers, dan telt het door (…0001, …0002). */
  function tekeningnummerVoorBlad(nr, blad) {
    const m = /^(.*?)(\d+)$/.exec(String(nr || '').trim());
    if (!m) return nr || '';
    return m[1] + String(Number(m[2]) + blad - 1).padStart(m[2].length, '0');
  }

  function tekenBladKader(doc, W, H, marge, zone, s = 1) {
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.1);
    doc.setDrawColor(27, 42, 56);
    doc.setLineWidth(0.25); doc.rect(marge, marge, W - 2 * marge, H - 2 * marge);
    doc.setLineWidth(0.5); doc.rect(marge + zone, marge + zone, W - 2 * (marge + zone), H - 2 * (marge + zone));
    const bw = W - 2 * (marge + zone), bh = H - 2 * (marge + zone);
    const nx = Math.max(4, Math.round(bw / 60)), ny = Math.max(3, Math.round(bh / 60));
    doc.setLineWidth(0.2); doc.setFontSize(Math.min(9, 6 * s)); doc.setFont('helvetica', 'normal'); doc.setTextColor(66, 80, 100);
    for (let i = 0; i < nx; i++) {
      const x0 = marge + zone + i * bw / nx, xm = x0 + bw / nx / 2;
      if (i) { doc.line(x0, marge, x0, marge + zone); doc.line(x0, H - marge - zone, x0, H - marge); }
      doc.text(String(i + 1), xm, marge + zone - 1.4, { align: 'center' });
      doc.text(String(i + 1), xm, H - marge - 1.4, { align: 'center' });
    }
    for (let j = 0; j < ny; j++) {
      const y0 = marge + zone + j * bh / ny, ym = y0 + bh / ny / 2 + 1;
      if (j) { doc.line(marge, y0, marge + zone, y0); doc.line(W - marge - zone, y0, W - marge, y0); }
      const letter = String.fromCharCode(65 + (j % 26));
      doc.text(letter, marge + zone / 2, ym, { align: 'center' });
      doc.text(letter, W - marge - zone / 2, ym, { align: 'center' });
    }
  }

  /** Kopje in de kolom: vette tekst met een lijn eronder. Geeft de nieuwe y terug. */
  function kolomKop(doc, tekst, x, y, w) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
    doc.text(tekst.toUpperCase(), x, y);
    doc.setDrawColor(30, 127, 166); doc.setLineWidth(0.4);
    doc.line(x, y + 1.4, x + w, y + 1.4);
    return y + 6;
  }

  /** Legenda van de profielen op dit blad (samengevoegd uit alle profielen). */
  function tekenProfielLegendaPdf(doc, kol, items) {
    const uniek = [];
    const gezien = new Set();
    for (const it of items || []) if (!gezien.has(it.sleutel)) { gezien.add(it.sleutel); uniek.push(it); }
    let y = kolomKop(doc, 'Legenda', kol.x, kol.y + 4, kol.w);
    const onder = kol.y + kol.h;
    const kleurVan = (klasse) => /lijn-onder|lijn-dek/.test(klasse || '') ? [27, 42, 56] : /dv-schip/.test(klasse || '') ? [107, 122, 140]
      : /lijn-b|maat-stip-b/.test(klasse || '') ? [142, 63, 174]
      : /bgt|huidig-station/.test(klasse || '') ? [198, 71, 43] : /^lijn/.test(klasse || '') ? [30, 127, 166] : [27, 42, 56];
    const symbool = (it, x, yy) => {
      const c = kleurVan(it.klasse), m = yy - 1.1;
      doc.setLineDashPattern([], 0);
      switch (it.symbool) {
        case 'lijn': doc.setDrawColor(...c); doc.setLineWidth(0.5); doc.line(x, m, x + 8, m); break;
        case 'stip': doc.setFillColor(...c); doc.circle(x + 4, m, 0.7, 'F'); break;
        case 'vlijn': doc.setDrawColor(...c); doc.setLineWidth(0.3); doc.setLineDashPattern([0.8, 0.6], 0); doc.line(x + 4, m - 1.8, x + 4, m + 1.8); break;
        case 'hlijn':
          if (/dv-toetspeil/.test(it.klasse || '')) { doc.setDrawColor(122, 63, 174); doc.setLineWidth(0.35); doc.setLineDashPattern([1.6, 0.8], 0); }
          else { doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.35); doc.setLineDashPattern([2.2, 0.7, 0.5, 0.7], 0); }
          doc.line(x, m, x + 8, m); break;
        case 'dvprofiel': doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.3); doc.setLineDashPattern([1.6, 0.6, 0.4, 0.6], 0); doc.rect(x + 0.5, m - 1.6, 7, 3.2, 'S'); break;
        case 'arcering': doc.setFillColor(246, 217, 209); doc.setDrawColor(198, 71, 43); doc.setLineWidth(0.3); doc.rect(x + 0.5, m - 1.6, 7, 3.2, 'FD');
          for (let k = 0; k < 4; k++) doc.line(x + 0.5 + k * 1.8, m + 1.6, x + 0.5 + Math.min(7, k * 1.8 + 3.2), m + 1.6 - Math.min(3.2, 7 - k * 1.8)); break;
        case 'box': {
          const nok = /nok/.test(it.klasse || '');
          doc.setFillColor(...(nok ? [248, 222, 214] : [214, 238, 221])); doc.setDrawColor(...(nok ? [198, 71, 43] : [22, 128, 61])); doc.setLineWidth(0.4);
          doc.rect(x + 0.5, m - 1.6, 7, 3.2, 'FD'); break;
        }
        case 'peil':
          doc.setDrawColor(31, 111, 181); doc.setLineWidth(0.35); doc.line(x, m + 0.8, x + 8, m + 0.8);
          doc.triangle(x + 2.6, m - 1.2, x + 5.4, m - 1.2, x + 4, m + 0.8, 'S'); break;
        case 'water':
          doc.setFillColor(205, 228, 247); doc.rect(x, m - 1.2, 8, 2.6, 'F');
          doc.setDrawColor(31, 111, 181); doc.setLineWidth(0.35); doc.line(x, m - 1.2, x + 8, m - 1.2); break;
        case 'keten':
          doc.setDrawColor(66, 80, 100); doc.setLineWidth(0.25); doc.line(x, m, x + 8, m);
          for (const kx of [x + 0.6, x + 7.4]) { doc.line(kx - 0.8, m + 0.8, kx + 0.8, m - 0.8); doc.line(kx, m - 1.4, kx, m + 1.4); } break;
        case 'boom':
          doc.setDrawColor(46, 125, 50); doc.setLineWidth(0.3); doc.line(x + 4, m + 1.6, x + 4, m - 0.4);
          doc.setFillColor(150, 196, 150); doc.circle(x + 4, m - 1, 1.2, 'FD'); break;
        case 'bgt': doc.setDrawColor(...hexNaarRgb(it.kleur || '#C6472B')); doc.setLineWidth(1.1); doc.line(x, m, x + 8, m); break;
        case 'aslijn': doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.7); doc.line(x, m, x + 8, m); break;
        case 'snprofiel': doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.3); doc.setLineDashPattern([1.6, 0.6, 0.4, 0.6], 0); doc.rect(x + 0.5, m - 1.6, 7, 3.2, 'S'); break;
        case 'paal': doc.setDrawColor(31, 78, 121); doc.setLineWidth(0.25); doc.setLineDashPattern([0.5, 0.5], 0); doc.line(x + 4, m - 1.8, x + 4, m + 1.8); break;
        case 'kadgrens': doc.setDrawColor(122, 62, 157); doc.setLineWidth(0.3); doc.setLineDashPattern([1, 0.5], 0); doc.line(x + 4, m - 1.8, x + 4, m + 1.8); break;
        case 'snmarge': doc.setDrawColor(224, 138, 30); doc.setLineWidth(0.3); doc.setLineDashPattern([1, 0.7], 0); doc.rect(x + 0.5, m - 1.6, 7, 3.2, 'S'); break;
        case 'blokje': doc.setFillColor(...hexNaarRgb(it.klasse || '#C6472B')); for (const [dx, dy] of [[1, -1], [2.6, 0.4], [4.2, -0.7], [5.6, 0.9], [2, 1.2]]) doc.rect(x + dx, m + dy - 0.5, 1, 1, 'F'); break;
        case 'snnr': doc.setFillColor(198, 71, 43); doc.circle(x + 4, m, 1.7, 'F'); doc.setFontSize(5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255); doc.text('1', x + 4, m + 0.7, { align: 'center' }); break;
        case 'kleuren':   // reeks kleurvakjes (RGB-terrein, hoogteverloop, diepte)
          (it.kleuren || []).forEach((k, j, a) => { doc.setFillColor(...k); doc.rect(x + j * 8 / a.length, m - 1.4, 8 / a.length + 0.05, 2.8, 'F'); }); break;
      }
      doc.setLineDashPattern([], 0);
    };
    const regel = (it) => {
      if (y > onder - 2) return false;
      symbool(it, kol.x, y);
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(66, 80, 100);
      doc.text(kortTekst(doc, it.tekst, kol.w - 12), kol.x + 11, y);
      y += 4.6;
      return true;
    };
    const gewoon = uniek.filter(it => it.symbool !== 'bgt'), bgt = uniek.filter(it => it.symbool === 'bgt');
    for (const it of gewoon) if (!regel(it)) return y;
    if (bgt.length && y < onder - 8) {
      y += 1.5;
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(66, 80, 100);
      doc.text('BGT in doorsnede', kol.x, y); y += 4.4;
      for (const it of bgt) if (!regel(it)) return y;
    }
    return y;
  }

  /** Vaste opmerkingen + eigen opmerkingen. Geeft de benodigde hoogte terug (meten = true: niets tekenen). */
  function tekenOpmerkingenPdf(doc, kol, inst, meten = false) {
    const regels = [
      'Maatvoering in meters, tenzij anders aangegeven.',
      'Hoogtematen in meters t.o.v. NAP.',
      'Coördinaten in meters t.o.v. RD New (EPSG:28992).',
      `Hoogtes afgeleid uit puntenwolk ${bronBestandsnaam || ''} (${xs ? xs.length.toLocaleString('nl-NL') : 0} punten na uitdunnen).`,
    ];
    const wp = waterpeil();
    if (wp != null && inst.dwarsprofielen) regels.push(`Waterpeil in de dwarsprofielen: ${wp >= 0 ? '+' : ''}${wp.toFixed(2).replace('.', ',')} m NAP${waterKant() === 'beide' ? '' : waterKant() === 'links' ? ' (alleen links van de as)' : ' (alleen rechts van de as)'}.`);
    if (bgtLagen.length) regels.push('BGT- en DXF-gegevens zijn indicatief.');
    if (inst.luchtfoto && inst.bovenaanzicht) regels.push('Ondergrond bovenaanzicht: luchtfoto PDOK (actueel).');
    for (const r of String(inst.opmerkingen || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean)) regels.push(r);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    const gesplitst = regels.map(r => doc.splitTextToSize(r, kol.w - 4));
    const hoogte = 6 + gesplitst.reduce((a, g) => a + g.length * 2.9 + 0.7, 0) + 2;
    if (meten) return hoogte;
    let y = kolomKop(doc, 'Opmerkingen', kol.x, kol.y + 4, kol.w);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(66, 80, 100);
    for (const g of gesplitst) {
      doc.text('–', kol.x, y);
      g.forEach((t, i) => doc.text(t, kol.x + 3, y + i * 2.9));
      y += g.length * 2.9 + 0.7;
    }
    return hoogte;
  }

  /** Stempel onderin de kolom: versies, opdrachtgever, opgesteld door, project, onderdeel, gegevens. */
  function tekenStempelKolom(doc, st, inst, logo, info, blad, totaal) {
    const { x, w } = st;
    let y = st.y;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.1); doc.setFillColor(255, 255, 255); doc.setTextColor(0, 0, 0);
    doc.setFillColor(255, 255, 255); doc.rect(x, y, w, st.h, 'F');
    const label = (t, lx, ly) => { doc.setFontSize(5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140); doc.text(t.toUpperCase(), lx, ly); };
    const waarde = (t, lx, ly, maxW, pt = 7, vet = false, kleur = [27, 42, 56]) => {
      doc.setFontSize(pt); doc.setFont('helvetica', vet ? 'bold' : 'normal'); doc.setTextColor(...kleur);
      doc.text(kortTekst(doc, t || '—', maxW), lx, ly);
    };
    const dun = () => { doc.setDrawColor(150, 160, 170); doc.setLineWidth(0.15); };
    const dik = () => { doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.45); };
    const datum = inst.datum ? new Date(inst.datum).toLocaleDateString('nl-NL') : '—';

    // 1. versietabel (koppen onderaan, nieuwste versie er direct boven)
    const vk = [['Versie', 11], ['Omschrijving', 0], ['Datum', 17], ['Opsteller', 15], ['Reviewer', 15], ['Vrijgave', 15]];
    const vast = vk.reduce((a, [, b]) => a + b, 0);
    vk[1][1] = w - vast;
    const rh = 4.2, vH = rh * 4;
    dun();
    for (let r = 1; r < 4; r++) doc.line(x, y + r * rh, x + w, y + r * rh);
    let kx = x;
    const rij1 = [inst.revisie || '—', inst.status || '', datum, inst.getekend || '', inst.gecontroleerd || '', ''];
    vk.forEach(([kop, kw], i) => {
      if (i) doc.line(kx, y, kx, y + vH);
      doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
      doc.text(kop, kx + 1.2, y + 4 * rh - 1.2);
      waarde(rij1[i], kx + 1.2, y + 3 * rh - 1.2, kw - 2.4, 6);
      kx += kw;
    });
    y += vH; dik(); doc.line(x, y, x + w, y);

    // 2. opdrachtgever: logo groot
    const oH = 22;
    label('Opdrachtgever', x + 2, y + 3.2);
    if (klantLogo) {
      const maxH = oH - 7, maxW = w * 0.62;
      let lh = maxH, lw = lh * klantLogo.w / klantLogo.h;
      if (lw > maxW) { lw = maxW; lh = lw * klantLogo.h / klantLogo.w; }
      doc.addImage(klantLogo.data, 'PNG', x + 3, y + 4.5 + (oH - 6 - lh) / 2, lw, lh);
      if (inst.opdrachtgever) {
        doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
        const r = doc.splitTextToSize(inst.opdrachtgever, w - lw - 10).slice(0, 3);
        r.forEach((t, i) => doc.text(t, x + w - 3, y + oH / 2 - (r.length - 1) * 1.6 + i * 3.2 + 1, { align: 'right' }));
      }
    } else {
      waarde(inst.opdrachtgever, x + 3, y + oH / 2 + 3, w - 6, 13, true);
    }
    y += oH; dun(); doc.line(x, y, x + w, y);

    // 3. opgesteld door: Lutrea-logo, bezoekadres/contact en QR-code naar de website
    const mH = 24;
    label('Opgesteld door', x + 2, y + 3.2);
    const qrMaat = mH - 6, qrX = x + w - 3 - qrMaat, qrY = y + 3;
    const logoVakW = w * 0.34;
    if (logo) {
      const maxH = mH - 10, maxW = logoVakW - 4;
      let lh = maxH, lw = lh * logo.w / logo.h;
      if (lw > maxW) { lw = maxW; lh = lw * logo.h / logo.w; }
      doc.addImage(logo.data, 'PNG', x + 3, y + 4.2 + (mH - 9.5 - lh) / 2, lw, lh);   // links uitgelijnd, net als het logo van de opdrachtgever
    }
    const versie = document.getElementById('appVersie')?.textContent?.trim();
    doc.setFontSize(4.8); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
    doc.text(`gemaakt met Lutrea Profielviewer${versie ? ' ' + versie : ''}`, x + 3, y + mH - 1.8);
    {
      const cx = x + logoVakW + 2, cw = qrX - cx - 2, rg = 2.95;
      let cy = y + 5.2;
      doc.setFontSize(6.6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...LUTREA_ORANJE);
      doc.text(LUTREA_CONTACT.kop, cx, cy); cy += rg;
      doc.setTextColor(...LUTREA_DONKER);
      for (const r of LUTREA_CONTACT.regels) { doc.text(kortTekst(doc, r, cw), cx, cy); cy += rg; }
      cy += 0.35;
      for (const [soort, t] of [['tel', LUTREA_CONTACT.telefoon], ['mail', LUTREA_CONTACT.mail], ['web', LUTREA_CONTACT.web]]) {
        tekenContactIcoon(doc, soort, cx, cy);
        doc.setFontSize(6.6); doc.setFont('helvetica', 'normal'); doc.setTextColor(...LUTREA_DONKER);
        doc.text(kortTekst(doc, t, cw - 4.6), cx + 4.6, cy);
        cy += rg + 0.25;
      }
    }
    tekenQr(doc, qrX, qrY, qrMaat);
    y += mH; dik(); doc.line(x, y, x + w, y);

    // 4. project
    const pH = 14;
    label('Project', x + 2, y + 3.2);
    waarde(inst.projectnaam || bronBestandsnaam || 'Profielviewer', x + 3, y + 9, w - 6, 12, true);
    if (inst.omschrijving) waarde(inst.omschrijving, x + 3, y + 12.6, w - 6, 7);
    y += pH; dun(); doc.line(x, y, x + w, y);

    // 5. onderdeel (wat staat er op dit blad)
    const dH = 12;
    label('Onderdeel', x + 2, y + 3.2);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
    doc.splitTextToSize(info.onderwerp || '', w - 6).slice(0, 2).forEach((t, i) => doc.text(t, x + 3, y + 7.4 + i * 3.6));
    y += dH; dik(); doc.line(x, y, x + w, y);

    // 6. gegevens in twee rijen
    const cH = 8;
    const statusKleur = { 'Concept': [217, 119, 6], 'Ter informatie': [30, 127, 166], 'Ter goedkeuring': [124, 58, 237], 'Definitief': [22, 128, 61] };
    const rijen = [
      [['Projectnummer', inst.projectnummer, 26], ['Tekeningnummer', tekeningnummerVoorBlad(inst.tekeningnummer, blad), 0], ['Blad', String(blad), 11], ['Aantal', String(totaal), 11], ['Versie', inst.revisie, 11]],
      [['Datum', datum, 19], ['Getekend', inst.getekend, 19], ['Gecontroleerd', inst.gecontroleerd, 21], ['Schaal', info.schaal, 0], ['Formaat', inst.formaat, 12], ['Status', inst.status, 21]],
    ];
    for (const rij of rijen) {
      const vastW = rij.reduce((a, c) => a + c[2], 0);
      let cx = x;
      rij.forEach(([l, v, cw], i) => {
        const bw = cw || (w - vastW);
        dun(); if (i) doc.line(cx, y, cx, y + cH);
        label(l, cx + 1.5, y + 2.9);
        const groot = l === 'Tekeningnummer' || l === 'Blad';
        waarde(v, cx + 1.5, y + cH - 1.6, bw - 3, groot ? 8 : 7, groot || l === 'Status', l === 'Status' ? (statusKleur[v] || [27, 42, 56]) : [27, 42, 56]);
        cx += bw;
      });
      y += cH;
      dun(); doc.line(x, y, x + w, y);
    }
    // omlijning
    dik(); doc.rect(x, st.y, w, st.h);
  }

  /** Een "jsPDF" die alles rond (ox, oy) met factor s vergroot: maten, lijndiktes
   *  en lettergroottes. Zo tekenen stempel, legenda en opmerkingen in hun eigen
   *  maten (mm bij teksthoogte ± 1,8 mm) en worden ze op A1/A0 evenredig groter. */
  function schaalDoc(doc, ox, oy, s) {
    if (Math.abs(s - 1) < 1e-6) return doc;
    const X = (x) => ox + (x - ox) * s, Y = (y) => oy + (y - oy) * s;
    return {
      setFontSize: (pt) => doc.setFontSize(pt * s), setFont: (...a) => doc.setFont(...a),
      setTextColor: (...a) => doc.setTextColor(...a), setDrawColor: (...a) => doc.setDrawColor(...a),
      setFillColor: (...a) => doc.setFillColor(...a), setLineWidth: (w) => doc.setLineWidth(w * s),
      setLineDashPattern: (d, f) => doc.setLineDashPattern((d || []).map(v => v * s), f),
      rect: (x, y, w, h, st) => doc.rect(X(x), Y(y), w * s, h * s, st),
      line: (a, b, c, d) => doc.line(X(a), Y(b), X(c), Y(d)),
      triangle: (a, b, c, d, e, f, st) => doc.triangle(X(a), Y(b), X(c), Y(d), X(e), Y(f), st),
      circle: (x, y, r, st) => doc.circle(X(x), Y(y), r * s, st),
      ellipse: (x, y, rx, ry, st) => doc.ellipse(X(x), Y(y), rx * s, ry * s, st),
      lines: (l, x, y, sc = [1, 1], st, closed) => doc.lines(l, X(x), Y(y), [sc[0] * s, sc[1] * s], st, closed),
      setLineCap: (c) => doc.setLineCap(c),
      text: (t, x, y, o) => doc.text(t, X(x), Y(y), o),
      addImage: (d, f, x, y, w, h, ...r) => doc.addImage(d, f, X(x), Y(y), w * s, h * s, ...r),
      getTextWidth: (t) => doc.getTextWidth(t) / s,
      splitTextToSize: (t, w) => doc.splitTextToSize(t, w * s),
    };
  }

  /** 3D-beeld van de situatie voor de PDF: belicht terreinvlak in de kleuren van
   *  de puntenwolk, met de as, de dwarsprofiellijnen en het waterpeil. Gebruikt
   *  het standpunt van de 3D-weergave als die open is geweest, anders schuin van
   *  boven op het gebied rond de as. Eén keer per PDF; daarna uit de cache. */
  let beeld3DCache = null;
  /** Rechte lijn door begin en eind van de as + gekozen waterkant: {px,py,nx,ny,teken} of null.
   *  (n = rechts van de looprichting; teken +1 = water rechts, -1 = water links) */
  function waterKantLijn() {
    const k = waterKant();
    if (k === 'beide' || asPunten.length < 2) return null;
    const a = asPunten[0], b = asPunten[asPunten.length - 1];
    const th = Math.atan2(b.y - a.y, b.x - a.x);
    return { px: a.x, py: a.y, nx: Math.sin(th), ny: -Math.cos(th), teken: k === 'rechts' ? 1 : -1 };
  }
  function waterKantFilter() {
    const l = waterKantLijn();
    if (!l) return null;
    return (x, y) => ((x - l.px) * l.nx + (y - l.py) * l.ny) * l.teken > 0;
  }
  /** Veelhoek afknippen op de waterkant van de lijn (Sutherland–Hodgman, één halfvlak). */
  function knipHalfvlak(punten, l) {
    const d = ([x, y]) => ((x - l.px) * l.nx + (y - l.py) * l.ny) * l.teken;
    const uit = [];
    for (let i = 0; i < punten.length; i++) {
      const p = punten[i], q = punten[(i + 1) % punten.length], dp = d(p), dq = d(q);
      if (dp >= 0) uit.push(p);
      if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); uit.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
    return uit.length >= 3 ? uit : punten.slice(0, 0);
  }
  function maak3DBeeldVoorPdf(inst, stations, pxW, pxH, ruimte = 1.2) {
    if (!window.THREE || !xs || !delaunay) return null;
    const wp = waterpeil();
    const cam = drieD ? [drieD.camera.position.toArray(), drieD.controls.target.toArray()] : null;
    const sleutel = JSON.stringify([xs.length, zMin, zMax, kleurModus, asPunten, stations, wp, cam, pxW, pxH, dwarsBreedteVeld.value, ruimte, waterKant(),
      doorvaart, dvResultaat?.tijd?.getTime?.() ?? 0, brugOnder?.xs.length ?? 0, brugBoven?.xs.length ?? 0, drieDLagen, snoei, snResultaat?.tijd?.getTime?.() ?? 0]);
    if (beeld3DCache && beeld3DCache.sleutel === sleutel) return beeld3DCache.beeld;
    let renderer = null;
    const weg = [];
    try {
      const canvas = document.createElement('canvas');
      canvas.width = pxW; canvas.height = pxH;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1); renderer.setSize(pxW, pxH, false);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      scene.add(new THREE.AmbientLight(0xffffff, 0.72));
      const zon = new THREE.DirectionalLight(0xffffff, 0.6); zon.position.set(1, 1.6, 0.8); scene.add(zon);
      const b = grenzen();
      const midX = (b.minX + b.maxX) / 2, midY = (b.minY + b.maxY) / 2, midZ = (zMin + zMax) / 2;
      const naar3 = (x, y, z) => new THREE.Vector3(x - midX, z - midZ, -(y - midY));
      const terrein = bouwDrieDVlak(midX, midY, midZ);
      if (wp != null) {
        // onder het waterpeil: kleur naar diepte (licht → donkerblauw over 0–4 m),
        // zoals een peilingkaart — dan lees je het als water, ook door het watervlak heen
        const kl = terrein.geometry.getAttribute('color');
        const licht = [0.62, 0.80, 0.94], donker = [0.09, 0.29, 0.58];
        const kantFilter = waterKantFilter();
        const tp = terrein.userData.punten || { xs, ys, zs };
        for (let i = 0; i < tp.xs.length; i++) {
          const diepte = wp - tp.zs[i];
          if (diepte <= 0) continue;
          if (kantFilter && !kantFilter(tp.xs[i], tp.ys[i])) continue;
          const t = Math.min(1, diepte / 4), m = Math.min(1, diepte / 0.3);   // dun randje laten mengen
          for (let k = 0; k < 3; k++) {
            const doelK = licht[k] + (donker[k] - licht[k]) * t;
            kl.array[i * 3 + k] = kl.array[i * 3 + k] * (1 - m) + doelK * m;
          }
        }
        kl.needsUpdate = true;
      }
      if (snResultaat && begroeiing && drieDLagen.bodem === false) terrein.visible = false;   // A loopt door de kronen: het maaiveld van de snoeicheck komt erin
      scene.add(terrein); weg.push(terrein.geometry, terrein.material);
      const omvang = Math.max(10, b.maxX - b.minX, b.maxY - b.minY);
      // lijn over het terrein (iets erboven) als dunne buis, zodat hij op elke grootte zichtbaar is
      const buis = (punten, kleur, dikte) => {
        const v = [];
        for (const p of punten) { const h = profielHoogte(p.x, p.y); if (h !== null) v.push(naar3(p.x, p.y, h + dikte * 2)); }
        if (v.length < 2) return;
        const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v, false, 'catmullrom', 0), Math.min(2000, v.length * 2), dikte, 6, false);
        const mat = new THREE.MeshBasicMaterial({ color: kleur });
        scene.add(new THREE.Mesh(geo, mat)); weg.push(geo, mat);
      };
      const asMidden = { x: midX, y: midY, h: midZ };
      let gebied = omvang;
      if (asPunten.length >= 2) {
        const s = stationsLangsAs(), lengte = s[s.length - 1];
        const asLijn = [];
        for (let st = 0; st <= lengte + 1e-9; st += Math.max(0.25, lengte / 600)) asLijn.push(puntOpStation(st));
        asLijn.push(puntOpStation(lengte));
        const breedteNu = profielBreedte(), pL = profielL(), pR = profielR();
        const xsA0 = asLijn.map(p => p.x), ysA0 = asLijn.map(p => p.y);
        const zicht = Math.min(omvang, Math.max(Math.max(...xsA0) - Math.min(...xsA0), Math.max(...ysA0) - Math.min(...ysA0)) + breedteNu * 1.6);
        const perPx = zicht / pxW;   // meters per pixel (ongeveer) — lijnen ± 3 en 2 px dik
        buis(asLijn, 0x1B2A38, snResultaat && cam ? Math.min(perPx * 1.4, 0.05) : perPx * 1.4);
        const breedte = breedteNu;
        // Aan welke kant van de as ligt het water? Daar komt de camera, kijkend
        // naar de kant (met waterpeil: waar het terrein onder het peil ligt,
        // anders de laagste kant).
        let links = 0, rechts = 0, nL = 0, nR = 0;
        for (let st = 0; st <= lengte + 1e-9; st += Math.max(1, lengte / 20)) {
          for (const f of [0.35, 0.6, 0.85, 1.2, 1.6]) {
            for (const kant of [-1, 1]) {
              const q = puntOpStationOffset(st, kant * f * (kant < 0 ? pL : pR)), h = hoogteOp(q.x, q.y);
              if (h === null) continue;
              const w = wp != null ? (h < wp ? 1 : 0) : -h;
              if (kant < 0) { links += w; nL++; } else { rechts += w; nR++; }
            }
          }
        }
        const scoreL = nL ? links / nL : 0, scoreR = nR ? rechts / nR : 0;
        const p0 = asLijn[0], p1 = asLijn[asLijn.length - 1];
        const th = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const kant = waterKant() === 'links' ? -1 : waterKant() === 'rechts' ? 1 : (scoreR >= scoreL ? 1 : -1);   // +1 = rechts van de looprichting
        asMidden.kijk = { x: kant * Math.sin(th), y: kant * -Math.cos(th), langs: { x: Math.cos(th), y: Math.sin(th) } };
        const xsA = asLijn.map(p => p.x), ysA = asLijn.map(p => p.y);
        asMidden.x = (Math.min(...xsA) + Math.max(...xsA)) / 2; asMidden.y = (Math.min(...ysA) + Math.max(...ysA)) / 2;
        const hA = asLijn.map(p => hoogteOp(p.x, p.y)).filter(h => h !== null);
        if (hA.length) asMidden.h = hA.reduce((a, c) => a + c, 0) / hA.length;
        gebied = Math.max(Math.max(...xsA) - Math.min(...xsA), Math.max(...ysA) - Math.min(...ysA)) + breedte * 1.6;
      }
      if (wp != null && delaunay.hull && delaunay.hull.length >= 3) {
        // waterpeil als vlak binnen de omtrek van de puntenwolk (niet de hele rechthoek)
        const vorm = new THREE.Shape();
        let omtrek = Array.from(delaunay.hull, i => [xs[i], ys[i]]);
        const lijnKant = waterKantLijn();
        if (lijnKant) omtrek = knipHalfvlak(omtrek, lijnKant);
        omtrek.forEach(([x, y], k) => { const px = x - midX, py = y - midY; if (k) vorm.lineTo(px, py); else vorm.moveTo(px, py); });
        if (omtrek.length >= 3) {
        const geo = new THREE.ShapeGeometry(vorm);
        const mat = new THREE.MeshBasicMaterial({ color: 0x5AA9E6, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
        const vlak = new THREE.Mesh(geo, mat);
        vlak.rotation.x = -Math.PI / 2; vlak.position.set(0, wp - midZ, 0);   // shape-y (noord) → -z
        scene.add(vlak); weg.push(geo, mat);
        }
      }
      // doorvaart: brug, box, conflicten en schip (water en as staan er al)
      if (brugOnder || brugBoven || dvKader() || snResultaat) {
        const dv3 = bouwDrieDDoorvaartGroep({ midX, midY, midZ }, { water: false, cache: false, pxSchaal: Math.max(1, pxW / 1100), labelSchaal: 0.45, toetsLabel: false });
        if (dv3.lagen.as) dv3.lagen.as.visible = false;
        scene.add(dv3.groep); weg.push({ dispose: () => ruimDrieDOp(dv3.groep) });
      }
      const camera = new THREE.PerspectiveCamera(40, pxW / pxH, 0.1, 1e6);
      if (cam) {
        camera.position.fromArray(cam[0]); camera.lookAt(new THREE.Vector3().fromArray(cam[1]));
      } else {
        // eigen 3D-blad (ruimte > 1.2): de hele puntenwolk in beeld, anders het gebied rond de as
        const heel = ruimte > 1.2;   // (zie aanroep 3D-blad)
        const doel = heel ? naar3(midX, midY, asMidden.h) : naar3(asMidden.x, asMidden.y, asMidden.h);
        const d = (heel ? omvang : Math.min(omvang, gebied)) * ruimte / (2 * Math.tan(20 * Math.PI / 180));
        const el = 32 * Math.PI / 180;
        let hx, hz;   // horizontale richting doel → camera, in three-coördinaten (x = oost, z = zuid)
        if (asMidden.kijk) {
          // vanaf de waterkant, iets schuin langs de as voor diepte
          const k = asMidden.kijk, a = 0.35;
          const wx = k.x * Math.cos(a) + k.langs.x * Math.sin(a), wy = k.y * Math.cos(a) + k.langs.y * Math.sin(a);
          const n = Math.hypot(wx, wy) || 1;
          hx = wx / n; hz = -wy / n;
        } else { const az = 225 * Math.PI / 180; hx = Math.cos(az); hz = Math.sin(az); }
        camera.position.set(doel.x + d * hx * Math.cos(el), doel.y + d * Math.sin(el), doel.z + d * hz * Math.cos(el));
        camera.lookAt(doel);
      }
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      // wit eromheen wegsnijden (met een kleine rand), zodat het beeld het vak vult
      const c2 = document.createElement('canvas'); c2.width = pxW; c2.height = pxH;
      const x2 = c2.getContext('2d'); x2.drawImage(canvas, 0, 0);
      const pix = x2.getImageData(0, 0, pxW, pxH).data;
      let x0 = pxW, y0 = pxH, x1 = -1, y1 = -1;
      for (let yy = 0; yy < pxH; yy += 2) for (let xx = 0; xx < pxW; xx += 2) {
        const i = (yy * pxW + xx) * 4;
        if (pix[i] < 245 || pix[i + 1] < 245 || pix[i + 2] < 245) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      }
      let uit = canvas, uw = pxW, uh = pxH;
      if (x1 > x0 && y1 > y0) {
        const rand = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
        x0 = Math.max(0, x0 - rand); y0 = Math.max(0, y0 - rand); x1 = Math.min(pxW - 1, x1 + rand); y1 = Math.min(pxH - 1, y1 + rand);
        uw = x1 - x0 + 1; uh = y1 - y0 + 1;
        uit = document.createElement('canvas'); uit.width = uw; uit.height = uh;
        const xu = uit.getContext('2d'); xu.fillStyle = '#fff'; xu.fillRect(0, 0, uw, uh);
        xu.drawImage(canvas, x0, y0, uw, uh, 0, 0, uw, uh);
      }
      const beeld = { data: uit.toDataURL('image/jpeg', 0.9), w: uw, h: uh };
      beeld3DCache = { sleutel, beeld };
      return beeld;
    } catch (err) {
      console.warn('3D-beeld voor de PDF mislukt:', err);
      return null;
    } finally {
      for (const o of weg) o.dispose?.();
      if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); }
    }
  }

  function tekenKolomBlad(doc, l, inst, logo, info, blad, totaal) {
    const { W, H, marge, zone, kolom } = l;
    const s = l.s || 1;
    tekenBladKader(doc, W, H, marge, zone, s);
    doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.5);
    doc.line(kolom.x, kolom.y, kolom.x, kolom.y + kolom.h);
    const binnenX = kolom.x + 4 * s, binnenW = kolom.w - 8 * s;
    const stH = STEMPEL_KOLOM_H * s;
    const st = { x: kolom.x, y: kolom.y + kolom.h - stH, w: kolom.w, h: stH };
    const opH = tekenOpmerkingenPdf(schaalDoc(doc, binnenX, 0, s), { x: binnenX, y: 0, w: binnenW / s, h: 0 }, inst, true) * s;
    const opY = st.y - opH - 2 * s;
    const leg = { x: binnenX, y: kolom.y + 2 * s, w: binnenW, h: opY - kolom.y - 6 * s };
    const legDoc = schaalDoc(doc, leg.x, leg.y, s), legLokaal = { x: leg.x, y: leg.y, w: leg.w / s, h: leg.h / s };
    const legEindLokaal = info.bovenLegenda ? tekenLegendaBovenaanzicht(legDoc, { ...legLokaal, y: legLokaal.y + 0.5 }, inst, false)
      : tekenProfielLegendaPdf(legDoc, legLokaal, info.legenda);
    // 3D-beeld in de vrije ruimte tussen legenda en opmerkingen
    const b3 = info.bovenLegenda ? l.beeld3D : null;   // alleen op het bovenaanzicht (overzicht)
    if (b3 && Number.isFinite(legEindLokaal)) {
      const legEind = leg.y + (legEindLokaal - legLokaal.y) * s;
      const boven = legEind + 5 * s, beschikbaar = opY - 4 * s - boven;
      const kopH = 6 * s;
      const bh = Math.min(beschikbaar - kopH, binnenW * b3.h / b3.w);
      if (bh >= 30) {
        const kd = schaalDoc(doc, binnenX, boven, s);
        kolomKop(kd, '3D-beeld (indicatief)', binnenX, boven + 4, binnenW / s);
        const by = boven + kopH;
        const bw = bh * b3.w / b3.h;
        doc.addImage(b3.data, 'JPEG', binnenX + (binnenW - bw) / 2, by, bw, bh);
        doc.setDrawColor(200, 207, 214); doc.setLineWidth(0.2);
        doc.rect(binnenX + (binnenW - bw) / 2, by, bw, bh);
      }
    }
    tekenOpmerkingenPdf(schaalDoc(doc, binnenX, opY, s), { x: binnenX, y: opY, w: binnenW / s, h: opH / s }, inst);
    tekenStempelKolom(schaalDoc(doc, st.x, st.y, s), { x: st.x, y: st.y, w: st.w / s, h: STEMPEL_KOLOM_H }, inst, logo, info, blad, totaal);
  }

  function pdfBestandsnaam(inst) {
    const naam = (inst.projectnaam || (bronBestandsnaam || 'lutrea').replace(/\.[^.]+$/, ''))
      .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'lutrea';
    return `${naam}-${inst.formaat}-${new Date().toISOString().slice(0, 10)}.pdf`;
  }

  /* Voorbeeld van de print: een nep-"jsPDF" die alle tekenopdrachten per blad
     opneemt, zodat maakPdf() precies dezelfde bladen opbouwt als bij de echte
     PDF (zelfde indeling, zelfde aantal bladen) — alleen met een lage resolutie
     voor de afbeeldingen. tekenVoorbeeldBlad() tekent een blad op een canvas.
     Eenheden: mm (zoals de echte PDF), tekstgrootte in pt. */
  class VoorbeeldDoc {
    constructor(W, H) {
      this.W = W; this.H = H; this.bladen = [[]]; this.p = 0;
      this.st = { font: 'helvetica', stijl: 'normal', pt: 16, tekst: '#000', lijn: '#000', vul: '#000', dik: 0.2, streep: [] };
      this.meet = document.createElement('canvas').getContext('2d');
    }
    static kleur(a) {
      if (a.length === 1 && typeof a[0] === 'string') return a[0].startsWith('#') ? a[0] : '#' + a[0];
      if (a.length === 1) return `rgb(${a[0]},${a[0]},${a[0]})`;
      return `rgb(${a[0]},${a[1]},${a[2]})`;
    }
    static fontCss(st) { return `${st.stijl === 'bold' ? 700 : 400} ${st.pt * 0.3528}px Helvetica, Arial, sans-serif`; }
    op(o) { this.bladen[this.p].push(Object.assign(o, { st: { ...this.st, streep: [...this.st.streep] } })); return this; }
    addPage() { this.bladen.push([]); this.p = this.bladen.length - 1; return this; }
    setPage(n) { this.p = Math.max(0, Math.min(this.bladen.length - 1, n - 1)); return this; }
    setFontSize(pt) { this.st.pt = pt; return this; }
    setFont(f, stijl) { this.st.font = f || this.st.font; if (stijl) this.st.stijl = stijl; return this; }
    setTextColor(...a) { this.st.tekst = VoorbeeldDoc.kleur(a); return this; }
    setDrawColor(...a) { this.st.lijn = VoorbeeldDoc.kleur(a); return this; }
    setFillColor(...a) { this.st.vul = VoorbeeldDoc.kleur(a); return this; }
    setLineWidth(w) { this.st.dik = w; return this; }
    setLineDashPattern(d) { this.st.streep = Array.isArray(d) ? d : []; return this; }
    rect(x, y, w, h, stijl) { return this.op({ t: 'rect', x, y, w, h, stijl }); }
    line(x1, y1, x2, y2) { return this.op({ t: 'line', x1, y1, x2, y2 }); }
    triangle(x1, y1, x2, y2, x3, y3, stijl) { return this.op({ t: 'tri', pts: [x1, y1, x2, y2, x3, y3], stijl }); }
    circle(x, y, r, stijl) { return this.op({ t: 'circle', x, y, r, stijl }); }
    ellipse(x, y, rx, ry, stijl) { return this.op({ t: 'ellipse', x, y, rx, ry, stijl }); }
    lines(l, x, y, sc = [1, 1], stijl, closed) { return this.op({ t: 'lines', l, x, y, sc, stijl, closed }); }
    setLineCap(c) { this.st.cap = c === 'round' ? 'round' : 'butt'; return this; }
    text(tekst, x, y, o = {}) { return this.op({ t: 'text', tekst, x, y, o }); }
    addImage(data, _f, x, y, w, h) { return this.op({ t: 'img', data, x, y, w, h }); }
    getTextWidth(tekst) { this.meet.font = VoorbeeldDoc.fontCss(this.st); return this.meet.measureText(String(tekst)).width; }
    splitTextToSize(tekst, maxW) {
      const uit = [];
      for (const alinea of String(tekst).split('\n')) {
        let regel = '';
        for (const woord of alinea.split(/\s+/)) {
          const probeer = regel ? regel + ' ' + woord : woord;
          if (regel && this.getTextWidth(probeer) > maxW) { uit.push(regel); regel = woord; } else regel = probeer;
        }
        uit.push(regel);
      }
      return uit;
    }
  }
  const voorbeeldBeelden = new Map();
  function laadBeeld(data) {
    if (voorbeeldBeelden.has(data)) return voorbeeldBeelden.get(data);
    const p = new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = data; });
    voorbeeldBeelden.set(data, p);
    if (voorbeeldBeelden.size > 400) voorbeeldBeelden.delete(voorbeeldBeelden.keys().next().value);
    return p;
  }
  async function tekenVoorbeeldBlad(doc, nr, canvas) {
    const ops = doc.bladen[nr] || [];
    const beelden = await Promise.all(ops.map(o => o.t === 'img' ? laadBeeld(o.data) : null));
    const dpr = window.devicePixelRatio || 1;
    // het hele blad in beeld: zo breed als het vak, maar niet hoger dan het
    // titelblok-paneel ernaast (anders moet je scrollen om het blad te zien)
    const vak = canvas.parentElement;
    const maxB = Math.max(200, (vak?.clientWidth || 600) - 28);
    const buur = vak?.previousElementSibling;
    // ook binnen het zichtbare deel van het venster blijven (lager scherm, of een hogere bovenste rij)
    const lijf = canvas.closest('.pdf-lijf');
    const zichtbaar = lijf ? lijf.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top - 34 : Infinity;
    const maxH = Math.max(200, Math.min(window.innerHeight * 0.62, (buur?.clientHeight || 480) - 70, zichtbaar));
    const s = Math.min(maxB / doc.W, maxH / doc.H);
    const breedPx = Math.round(doc.W * s), hoogPx = Math.round(doc.H * s);
    canvas.style.width = `${breedPx}px`; canvas.style.height = `${hoogPx}px`;
    canvas.width = Math.round(breedPx * dpr); canvas.height = Math.round(hoogPx * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, doc.W, doc.H);
    const vulOf = (o) => /F/.test(o.stijl || ''), lijnOf = (o) => !o.stijl || /D|S/.test(o.stijl);
    ops.forEach((o, i) => {
      const st = o.st;
      ctx.strokeStyle = st.lijn; ctx.fillStyle = st.vul; ctx.lineWidth = Math.max(st.dik, 0.12);
      ctx.setLineDash(st.streep || []);
      if (o.t === 'img') { if (beelden[i]) ctx.drawImage(beelden[i], o.x, o.y, o.w, o.h); }
      else if (o.t === 'rect') { if (vulOf(o)) ctx.fillRect(o.x, o.y, o.w, o.h); if (lijnOf(o)) ctx.strokeRect(o.x, o.y, o.w, o.h); }
      else if (o.t === 'line') { ctx.lineCap = st.cap || 'butt'; ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke(); }
      else if (o.t === 'ellipse') { ctx.beginPath(); ctx.ellipse(o.x, o.y, o.rx, o.ry, 0, 0, Math.PI * 2); if (vulOf(o)) ctx.fill(); if (lijnOf(o)) ctx.stroke(); }
      else if (o.t === 'lines') {
        ctx.lineCap = st.cap || 'butt';
        ctx.beginPath(); let cx = o.x, cy = o.y; ctx.moveTo(cx, cy);
        for (const g of o.l) {
          const [sx, sy] = o.sc;
          if (g.length === 6) { ctx.bezierCurveTo(cx + g[0] * sx, cy + g[1] * sy, cx + g[2] * sx, cy + g[3] * sy, cx + g[4] * sx, cy + g[5] * sy); cx += g[4] * sx; cy += g[5] * sy; }
          else { cx += g[0] * sx; cy += g[1] * sy; ctx.lineTo(cx, cy); }
        }
        if (o.closed) ctx.closePath();
        if (vulOf(o)) ctx.fill(); if (lijnOf(o)) ctx.stroke();
        ctx.lineCap = 'butt';
      }
      else if (o.t === 'tri' || o.t === 'circle') {
        ctx.beginPath();
        if (o.t === 'tri') { const q = o.pts; ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.closePath(); }
        else ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        if (vulOf(o)) ctx.fill(); if (lijnOf(o)) ctx.stroke();
      } else if (o.t === 'text') {
        ctx.setLineDash([]);
        ctx.font = VoorbeeldDoc.fontCss(st); ctx.fillStyle = st.tekst;
        ctx.textAlign = o.o.align === 'right' ? 'right' : o.o.align === 'center' ? 'center' : 'left';
        ctx.textBaseline = 'alphabetic';
        const regels = Array.isArray(o.tekst) ? o.tekst : [String(o.tekst)];
        const lh = st.pt * 0.3528 * 1.15;
        regels.forEach((r, k) => ctx.fillText(r, o.x, o.y + k * lh));
      }
    });
    ctx.setLineDash([]);
  }

  /* Uitvoer naar jsPDF met bladselectie en (optioneel) losse bestanden. Werkt
     als een jsPDF-document voor maakPdf(): tekenopdrachten op een niet-gekozen
     blad worden genegeerd; bij "losse bladen" krijgt elk gekozen blad een eigen
     document. Bladnummers zijn de "logische" nummers van de hele reeks. */
  class PdfUitvoer {
    constructor(maakDoc, selectie, los) {
      this.maakDoc = maakDoc; this.selectie = selectie; this.los = los;
      this.huidig = 1; this.docs = new Map(); this.paginaVan = new Map();
      this.hoofd = null; this.hoofdGebruikt = 0;
      this.stijl = new Map();     // laatst gezette stijl (font, kleuren, lijn) — overnemen in elk nieuw los document
      this.kladDoc = maakDoc();   // voor tekstmetingen
    }
    gekozen(n) { return !this.selectie || this.selectie.has(n); }
    doel() {
      const n = this.huidig;
      if (!this.gekozen(n)) return null;
      if (this.los) {
        if (!this.docs.has(n)) {
          const d = this.maakDoc();
          for (const [m, a] of this.stijl) d[m](...a);
          this.docs.set(n, d);
        }
        return this.docs.get(n);
      }
      if (!this.paginaVan.has(n)) {
        if (!this.hoofd) this.hoofd = this.kladDoc;   // eerste gekozen blad = de eerste pagina van het document
        else this.hoofd.addPage();
        this.paginaVan.set(n, ++this.hoofdGebruikt);
      }
      this.hoofd.setPage(this.paginaVan.get(n));
      return this.hoofd;
    }
    addPage() { this.huidig++; return this; }
    setPage(n) { this.huidig = n; return this; }
    getTextWidth(t) { return (this.doel() || this.kladDoc).getTextWidth(t); }
    splitTextToSize(t, w) { return (this.doel() || this.kladDoc).splitTextToSize(t, w); }
    bestanden() {
      if (this.los) return [...this.docs.entries()].sort((a, b) => a[0] - b[0]).map(([n, d]) => ({ blad: n, blob: d.output('blob') }));
      return this.hoofd ? [{ blad: null, blob: this.hoofd.output('blob') }] : [];
    }
  }
  for (const m of ['setFontSize', 'setFont', 'setTextColor', 'setDrawColor', 'setFillColor', 'setLineWidth', 'setLineDashPattern',
    'setLineCap', 'rect', 'line', 'triangle', 'circle', 'ellipse', 'lines', 'text', 'addImage']) {
    PdfUitvoer.prototype[m] = function (...a) {
      // stijl (kleur, lijndikte, font) altijd ook op het meetdocument, zodat metingen kloppen
      if (/^set/.test(m)) { this.kladDoc[m](...a); this.stijl.set(m, a); }
      const d = this.doel();
      if (d && d !== this.kladDoc) d[m](...a);
      else if (d === this.kladDoc && !/^set/.test(m)) d[m](...a);
      return this;
    };
  }

  async function maakPdf(inst, onVoortgang, handle = null, voorbeeld = false, dxf = false) {
    if (!window.jspdf && !voorbeeld && !dxf) throw new Error('PDF-bibliotheek kon niet worden geladen');
    let [W, H] = PAPIER_MM[inst.formaat] || PAPIER_MM.A1;
    if (inst.orientatie === 'staand') [W, H] = [H, W];
    // voorbeeld: afbeeldingen op een lage resolutie (blad ± 900 px breed), geen luchtfoto
    const voorbeeldDpi = Math.max(12, Math.min(80, 900 / W * 25.4));
    if (voorbeeld) inst = { ...inst, dpi: voorbeeldDpi, luchtfoto: false };
    // DXF: zelfde bladen, maar zonder beelden (puntenwolk, luchtfoto, 3D) en alle bladen
    if (dxf) inst = { ...inst, luchtfoto: false, puntenwolk: false, beeld3D: false, blad3D: false, losseBladen: false, bladen: '' };
    const selectie = voorbeeld || dxf ? null : leesBladSelectie(inst.bladen);
    const doc = dxf ? maakDxfBladDoc(W, H) : voorbeeld ? new VoorbeeldDoc(W, H)
      : new PdfUitvoer(() => new window.jspdf.jsPDF({ orientation: W > H ? 'landscape' : 'portrait', unit: 'mm', format: inst.formaat.toLowerCase(), compress: true }),
          selectie, !!inst.losseBladen);
    // Is het blad dat nu aangemaakt wordt gekozen? Zo niet: zware onderdelen
    // (kaartbeeld, profielplaatjes) overslaan — de indeling blijft gelijk.
    const volgendBladNodig = () => !selectie || selectie.has(paginas.length + 1);
    const marge = 10;
    const titelH = W >= 590 ? 26 : 22;
    // Bladindeling "kolom rechts": kader met vakverdeling, rechts een kolom met
    // legenda, opmerkingen en stempel; de tekening krijgt de rest van het blad.
    // Op A4 en A3 staand is daar geen ruimte voor: dan de compacte balk onderaan.
    const kolomModus = inst.bladindeling !== 'balk' && W >= 400;
    // Teksthoogte (hoogte van een hoofdletter, zoals in CAD): de hoogtematen in
    // de profielen krijgen precies deze hoogte; stempel, legenda en opmerkingen
    // schalen mee (stempelwaarden ± 0,7 × deze hoogte). Automatisch: 2,5 mm
    // t/m A2, 3,5 mm op A1 en A0.
    const tekstH = Number(inst.teksthoogte) > 0 ? Number(inst.teksthoogte) : (Math.max(W, H) >= 841 ? 3.5 : 2.5);
    const TS = 0.405 * tekstH;   // schaal voor stempel/legenda/kopjes (1 ≈ waarden van 1,8 mm)
    const ZONE = 5;
    const binnen = { x: marge + ZONE, y: marge + ZONE, w: W - 2 * (marge + ZONE), h: H - 2 * (marge + ZONE) };
    const kolomW = Math.round(Math.max(128 * TS, Math.min(W * 0.2, 150 * TS)));
    const kolom = kolomModus ? { x: binnen.x + binnen.w - kolomW, y: binnen.y, w: kolomW, h: binnen.h } : null;
    const vak = kolomModus
      ? { x: binnen.x + 5, y: binnen.y + 5, w: binnen.w - kolomW - 10, h: binnen.h - 10 }
      : { x: marge, y: marge, w: W - 2 * marge, h: H - 2 * marge - titelH - 4 };
    const paginas = [];
    const nieuwePagina = (onderwerp, schaal) => {
      if (paginas.length) doc.addPage();
      paginas.push({ onderwerp, schaal, legenda: [] });
    };
    const meldingen = [];
    if (inst.bladindeling !== 'balk' && !kolomModus) meldingen.push('Op dit formaat past geen kolom rechts; de stempel staat als balk onderaan.');
    const stations = inst.dwarsprofielen || inst.bovenaanzicht ? geselecteerdeStations(inst) : [];
    const breedte = profielBreedte(), pL = profielL(), pR = profielR();

    // ── bovenaanzicht ──
    if (inst.bovenaanzicht) {
      const legendaW = W >= 590 ? 70 : W >= 400 ? 58 : 48;
      const kaart = kolomModus ? { ...vak } : { x: vak.x, y: vak.y, w: vak.w - legendaW - 6, h: vak.h };
      const nodig = volgendBladNodig();
      const r = nodig ? await tekenBovenaanzichtVoorPdf(inst, kaart.w, kaart.h, inst.dwarsprofielen ? stations : dwarsStations, onVoortgang, dxf ? doc : null) : { N: 0 };
      if (r.notitie) meldingen.push(r.notitie);
      nieuwePagina('Bovenaanzicht', `${schaalTekst(r.N)}`);
      paginas[paginas.length - 1].bovenLegenda = kolomModus;
      if (nodig) {
      doc.addImage(r.data, 'JPEG', kaart.x, kaart.y, kaart.w, kaart.h, undefined, 'FAST');
      tekenNoordpijl(doc, kaart.x + kaart.w - 11, kaart.y + 11);
      tekenSchaalstok(doc, kaart, r.N);
      doc.setDrawColor(27, 42, 56); doc.setLineWidth(0.3);
      doc.rect(kaart.x, kaart.y, kaart.w, kaart.h);
      if (!kolomModus) tekenLegendaBovenaanzicht(doc, { x: kaart.x + kaart.w + 6, y: kaart.y, w: legendaW, h: kaart.h }, inst);
      }
    }

    // ── 3D-beeld op een eigen blad (direct na het bovenaanzicht) ──
    if (inst.blad3D) {
      const nodig = volgendBladNodig();
      nieuwePagina('3D-beeld van de situatie', 'geen schaal');
      const pg = paginas[paginas.length - 1];
      // legenda voor dit blad (in de kolom rechts)
      const wp3 = waterpeil();
      pg.legenda = [
        kleurModus === 'rgb' && cs
          ? { symbool: 'kleuren', tekst: 'terrein: kleur uit de inmeting', kleuren: [[120, 140, 90], [150, 130, 110], [90, 110, 120]], sleutel: 't' }
          : { symbool: 'kleuren', tekst: 'terrein: kleur op hoogte', kleuren: [[30, 127, 166], [100, 124, 98], [169, 120, 31]], sleutel: 't' },
      ];
      if (wp3 != null) {
        pg.legenda.push({ symbool: 'kleuren', tekst: 'onder waterpeil: diepte 0 \u2013 4 m', kleuren: [[158, 204, 240], [92, 150, 199], [23, 74, 148]], sleutel: 'd' });
        pg.legenda.push({ symbool: 'water', tekst: `waterpeil ${wp3 >= 0 ? '+' : ''}${wp3.toFixed(2).replace('.', ',')} m NAP`, sleutel: 'w' });
      }
      if (asPunten.length >= 2) pg.legenda.push({ symbool: 'aslijn', tekst: `as (${assen[actieveAs]?.naam || 'as'})`, sleutel: 'a' });
      if (brugOnder || brugBoven) pg.legenda.push({ symbool: 'kleuren', tekst: `brug (scan${brugOnder && brugBoven ? ' onder- en bovenzijde' : brugOnder ? ' onderzijde' : ' bovenzijde'})`, kleuren: [[46, 56, 70], [124, 135, 148], [201, 204, 208]], sleutel: 'br' });
      if (snResultaat && snoei.tonen !== false) {
        pg.legenda.push({ symbool: 'snprofiel', tekst: `doorloopprofiel ${komma(snResultaat.B, 2)} × ${komma(snResultaat.H, 2)} m (vrije ruimte)`, sleutel: 'snp' });
        pg.legenda.push({ symbool: 'blokje', klasse: SN_KLEUR.rood, tekst: 'begroeiing in het profiel (snoeien)', sleutel: 'snr' });
        if (snResultaat.M) pg.legenda.push({ symbool: 'blokje', klasse: SN_KLEUR.oranje, tekst: 'begroeiing in de snoeimarge', sleutel: 'sno' });
        pg.legenda.push({ symbool: 'blokje', klasse: SN_KLEUR.groen, tekst: 'overige begroeiing', sleutel: 'sng' });
      }
      const k3 = doorvaart.tonen !== false ? dvKader() : null;
      if (k3) {
        const r3 = dvResultaat;
        pg.legenda.push({ symbool: 'box', klasse: r3 && !r3.ok ? 'nok' : 'ok', tekst: `doorvaartprofiel ${komma(k3.B, 2)} × ${komma(k3.H, 2)} m${k3.D ? `, diepgang ${komma(k3.D, 2)}` : ''}${r3 ? (r3.ok ? ' (voldoet)' : ' (voldoet niet)') : ''}`, sleutel: 'dvb' });
        if (r3 && !r3.ok) pg.legenda.push({ symbool: 'stip', klasse: 'bgt', tekst: 'punt in het doorvaartprofiel (conflict)', sleutel: 'dvc' });
        if (doorvaart.weergave === 'schip') pg.legenda.push({ symbool: 'lijn', klasse: 'dv-schip', tekst: 'maatgevend schip (indicatief)', sleutel: 'dvs' });
      }
      if (nodig) {
        onVoortgang?.('3D-beeld maken…');
        const kopMm = 8 * TS;
        const vw = vak.w, vh = vak.h - kopMm;
        const dpi3 = voorbeeld ? 40 : 150;
        let pw = vw / 25.4 * dpi3, ph = vh / 25.4 * dpi3;
        const f = Math.min(1, 3600 / Math.max(pw, ph));   // WebGL-grens en geheugen
        pw = Math.max(200, Math.round(pw * f)); ph = Math.max(150, Math.round(ph * f));
        const b3 = maak3DBeeldVoorPdf(inst, inst.dwarsprofielen ? stations : dwarsStations, pw, ph, 1.21);   // heel: de hele situatie in beeld
        doc.setFontSize(12 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
        doc.text('3D-beeld van de situatie', vak.x, vak.y + 5 * TS);
        doc.setFontSize(8 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
        doc.text('indicatief \u00b7 geen schaal \u00b7 hoogte niet overdreven', vak.x + vak.w, vak.y + 5 * TS, { align: 'right' });
        if (b3) {
          const sch = Math.min(vw / b3.w, vh / b3.h), bw = b3.w * sch, bh = b3.h * sch;
          const bx = vak.x + (vw - bw) / 2, by = vak.y + kopMm + (vh - bh) / 2;
          doc.addImage(b3.data, 'JPEG', bx, by, bw, bh);
        } else {
          doc.setFontSize(10 * TS); doc.text('3D-beeld kon niet worden gemaakt (WebGL niet beschikbaar).', vak.x, vak.y + kopMm + 10 * TS);
          meldingen.push('3D-beeld kon niet worden gemaakt (WebGL niet beschikbaar op deze pc).');
        }
      }
    }

    // tekenGrafiek tekent in schermpixels; we geven hem een onzichtbaar vak met
    // een vaste verhouding "virtuele pixels per mm papier", zodat tekst en
    // lijnen op elk papierformaat even groot uitkomen (± 8 pt).
    // hoogtematen: 14,5 px Segoe UI, hoofdletter ± 0,70 em → precies tekstH mm op papier
    const VIRT_PER_MM = 14.5 * 0.70 / tekstH;
    const MARGE_L = GRAFIEK_MARGE_L, MARGE_R = GRAFIEK_MARGE_R, MARGE_T = GRAFIEK_MARGE_T;
    const printHost = document.createElement('div');
    document.body.appendChild(printHost);
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    printHost.appendChild(svgEl);
    // DXF: de grafiek als vector vastleggen in plaats van rasteren
    const beeldVanSvg = (svg, a, b, N) => dxf ? Promise.resolve(doc.vang({ soort: 'grafiek', ...vangSvg(svg), N })) : svgNaarJpegDataUrl(svg, a, b);
    const zetHost = (bMm, hMm) => {
      printHost.style.cssText = `position:fixed; left:-99999px; top:0; width:${Math.round(bMm * VIRT_PER_MM)}px; height:${Math.round(hMm * VIRT_PER_MM)}px;`;
    };
    const naarPx = (mm) => Math.max(1, Math.round(mm / 25.4 * (voorbeeld ? voorbeeldDpi : 150))); // 150 dpi (voorbeeld: laag)
    const vulHoogtebereik = (reeks, metPeil = false) => {
      let hMin = Infinity, hMax = -Infinity;
      const velden = [];
      if (!wolkB || toonWolkA) velden.push('hoogte');
      if (wolkB && toonWolkB) velden.push('hoogteB');
      velden.push('hoogteO', 'hoogteD');
      for (const p of reeks) for (const v of velden) { const h = p[v]; if (h != null) { if (h < hMin) hMin = h; if (h > hMax) hMax = h; } }
      if (!isFinite(hMin)) return null;
      const dvK = dvVoorGrafiek(reeks, reeks.station != null, reeks.station != null ? 'offset' : 'station');
      if (dvK) { hMax = Math.max(hMax, dvK.P + dvK.H); hMin = Math.min(hMin, dvK.D ? dvK.PD - dvK.D : dvK.P); }
      const snK = snVoorGrafiek(reeks, reeks.station != null, reeks.station != null ? 'offset' : 'station');
      if (snK) for (const h of snK.hoogtes) { if (h < hMin) hMin = h; if (h > hMax) hMax = h; }
      const wp = metPeil ? waterpeil() : null;
      if (wp != null) { hMin = Math.min(hMin, wp); hMax = Math.max(hMax, wp); }
      if (hMax - hMin < 0.2) { const m = (hMax + hMin) / 2; hMin = m - 0.1; hMax = m + 0.1; }
      return (hMax - hMin) * 1.2;
    };
    const plotMarges = (MARGE_L + MARGE_R) / VIRT_PER_MM; // mm aan assen/labels

    // ── doorvaartcontrole op een eigen blad ──
    if (inst.doorvaart && dvPdfMogelijk()) {
      let r = null;
      try { r = voerDoorvaartUit(); } catch (err) { meldingen.push('Doorvaartcontrole: ' + err.message); }
      if (r) {
        const nodig = volgendBladNodig();
        const reeks = dvUitsnede(dvMaatgevendeReeks(r), r);
        const halfV = Math.max(...reeks.map(p => Math.abs(p.offset)));
        // schaal: de uitsnede op ware hoogte, max. ± 60 % van de bladhoogte
        let lo = Infinity, hi = -Infinity;
        for (const p of reeks) for (const v of [p.hoogte, p.hoogteO]) if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; }
        lo = Math.min(lo, r.P, r.D ? r.PD - r.D : r.P); hi = Math.max(hi, r.P + r.H);
        const bereik = Math.max(1, (hi - lo) * 1.25);
        const kopMm = 8 * TS;
        const grafMaxH = vak.h * 0.6;
        const breedteM = reeks[reeks.length - 1].offset - reeks[0].offset;
        const mmPerMMax = Math.min((vak.w - plotMarges) / breedteM, (grafMaxH - (MARGE_T + 34) / VIRT_PER_MM) / bereik);
        const N = [...STANDAARD_SCHALEN, 175, 225, 350, 450, 600].sort((a, b) => a - b).find(n => 1000 / n <= mmPerMMax) || 50000;
        const mmPerM = 1000 / N;
        const grafW = breedteM * mmPerM + plotMarges;
        void halfV;
        const grafH = Math.min(grafMaxH, bereik * mmPerM + (MARGE_T + 34) / VIRT_PER_MM);
        nieuwePagina(`Doorvaartcontrole — ${r.ok ? 'voldoet' : 'voldoet niet'}`, `${schaalTekst(N)} (hoogte niet overdreven)`);
        const pg = paginas[paginas.length - 1];
        if (nodig) {
          onVoortgang?.('Doorvaartcontrole tekenen…');
          doc.setFontSize(12 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
          doc.text(`Doorvaartcontrole — ${r.ok ? 'voldoet' : 'voldoet niet'}`, vak.x, vak.y + 5 * TS);
          doc.setFontSize(8 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
          doc.text(`maatgevende doorsnede: hoogste bodem en laagste onderzijde over st. ${komma(r.s0, 1)} – ${komma(r.s1, 1)} m · ${schaalTekst(N)}`, vak.x + vak.w, vak.y + 5 * TS, { align: 'right' });
          zetHost(grafW, grafH);
          svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
          tekenGrafiek(svgEl, reeks, 'offset', 'offset (m)', 0, matenWaarde(maatDwarsVeld, 5), 1, null, null, waterpeil(), { legenda: !kolomModus, legendaUit: pg.legenda });
          const data = await beeldVanSvg(svgEl, naarPx(grafW), naarPx(grafH), N);
          svgEl.innerHTML = '';
          const gx = vak.x + Math.max(0, (vak.w - grafW) / 2);
          doc.addImage(data, 'JPEG', gx, vak.y + kopMm, grafW, grafH);
          doc.setDrawColor(220, 227, 232); doc.setLineWidth(0.2);
          doc.rect(gx, vak.y + kopMm, grafW, grafH);
          // tabel met uitgangspunten en uitkomst
          let ty = vak.y + kopMm + grafH + 10 * TS;
          const regels = dvRegels(r);
          const rh = 5.6 * TS, labelW = 62 * TS, tabW = Math.min(vak.w, 230 * TS);
          doc.setFontSize(10 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
          doc.text('Uitgangspunten en resultaat', vak.x, ty); ty += 3 * TS;
          doc.setDrawColor(30, 127, 166); doc.setLineWidth(0.4); doc.line(vak.x, ty, vak.x + tabW, ty); ty += rh;
          const kleur = (st) => st === 'ok' ? [22, 128, 61] : st === 'nok' ? [198, 71, 43] : st === 'let' ? [178, 106, 0] : [27, 42, 56];
          for (const [label, waarde, st] of regels) {
            if (ty > vak.y + vak.h - 2) { meldingen.push('Doorvaartcontrole: niet alle regels passen op het blad.'); break; }
            const oordeel = label === 'Oordeel';
            if (oordeel) { ty += 1.5 * TS; doc.setDrawColor(200, 207, 214); doc.setLineWidth(0.2); doc.line(vak.x, ty - rh + 1.2 * TS, vak.x + tabW, ty - rh + 1.2 * TS); ty += 1.5 * TS; }
            doc.setFontSize((oordeel ? 11 : 8.5) * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
            doc.text(label.trim(), vak.x + (label.startsWith('  ') ? 4 * TS : 0), ty);
            doc.setFont('helvetica', st || oordeel ? 'bold' : 'normal'); doc.setTextColor(...kleur(st));
            doc.text(kortTekst(doc, pdfTekst(waarde), tabW - labelW), vak.x + labelW, ty);
            ty += rh;
          }
          doc.setFontSize(6.5 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
          doc.text(`Toets op de ruwe meetpunten van de onderzijde (${(r.punten ?? 0).toLocaleString('nl-NL')} punten in het gebied); bodem uit het terreinmodel van ${bronBestandsnaam || 'puntenwolk A'}.`, vak.x, Math.min(vak.y + vak.h - 1, ty + 2 * TS));
          // dwarsprofiel op de plek van het kritieke punt, zelfde schaal
          const kp = (!r.okH ? r.kritiek : !r.okD ? r.kritiekD : null) || r.kritiek || r.kritiekD;
          const kopK = 8 * TS, yK = ty + 9 * TS;
          if (kp && yK + kopK + grafH <= vak.y + vak.h) {
            const reeksK = dvUitsnede(berekenDwarsprofiel(kp.station), r);
            doc.setFontSize(10 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
            doc.text(`Dwarsprofiel bij het kritieke punt — station ${komma(kp.station, 1)} m`, vak.x, yK + 4 * TS);
            zetHost(grafW, grafH);
            svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
            tekenGrafiek(svgEl, reeksK, 'offset', 'offset (m)', 0, matenWaarde(maatDwarsVeld, 5), 1, null, boomVindenBijStation(kp.station, breedte), waterpeil(), { legenda: !kolomModus, legendaUit: pg.legenda });
            const dataK = await beeldVanSvg(svgEl, naarPx(grafW), naarPx(grafH), N);
            svgEl.innerHTML = '';
            doc.addImage(dataK, 'JPEG', gx, yK + kopK, grafW, grafH);
            doc.setDrawColor(220, 227, 232); doc.setLineWidth(0.2);
            doc.rect(gx, yK + kopK, grafW, grafH);
          }
        }
        // ── dekkingskaart op een eigen blad: waar is er gemeten, waar niet ──
        if (r.dekkingH || r.dekkingD) {
          const nodigD = volgendBladNodig();
          const gat = dvGaten(r);
          const titel = `Dekkingskaart doorvaart — ${gat ? `${komma(gat, gat < 10 ? 1 : 0)} m2 niet gemeten` : 'volledig gemeten'}`;
          // schaal: station × offset op ware grootte, max. 62 % van de bladhoogte
          const oLo = r.c - r.B / 2 - 2, oHi = r.c + r.B / 2 + 2, M = DEKKING_MARGE;
          const mmPerMMax = Math.min((vak.w - M.l - M.r) / (r.s1 - r.s0), (vak.h * 0.62 - M.t - M.b - M.leg) / (oHi - oLo));
          const N = [...STANDAARD_SCHALEN, 175, 225, 350, 450, 600].sort((a, b) => a - b).find(n => 1000 / n <= mmPerMMax) || 50000;
          const mmPerM = 1000 / N;
          const kw = (r.s1 - r.s0) * mmPerM + M.l + M.r, kh = (oHi - oLo) * mmPerM + M.t + M.b + M.leg;
          nieuwePagina(titel, schaalTekst(N));
          const pgD = paginas[paginas.length - 1];
          pgD.legenda = [{ symbool: 'blokje', klasse: '#C6472B', tekst: 'conflict met het doorvaartprofiel', sleutel: 'dkc' }];
          if (nodigD) {
            onVoortgang?.('Dekkingskaart…');
            doc.setFontSize(12 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
            doc.text(titel, vak.x, vak.y + 5 * TS);
            doc.setFontSize(8 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
            doc.text(`bovenaanzicht langs de as (station horizontaal, L boven) · ${schaalTekst(N)} · vakjes van ${komma(r.dekkingH?.cel ?? r.dekkingD.cel, 2)} m`, vak.x + vak.w, vak.y + 5 * TS, { align: 'right' });
            const kx = vak.x + Math.max(0, (vak.w - kw) / 2), ky = vak.y + 9 * TS;
            const beeld = dxf ? doc.vang({ soort: 'dekking', r, N, wPx: naarPx(kw), hPx: naarPx(kh), pxPerMm: naarPx(1000) / 1000 }) : dekkingsKaartBeeld(r, naarPx(kw), naarPx(kh), naarPx(1000) / 1000);
            if (beeld) doc.addImage(beeld, 'PNG', kx, ky, kw, kh);
            doc.setDrawColor(220, 227, 232); doc.setLineWidth(0.2); doc.rect(kx, ky, kw, kh);
            // tabel met alle niet-gemeten plekken
            let ty = ky + kh + 10 * TS;
            const rh = 5.4 * TS;
            doc.setFontSize(10 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
            doc.text('Niet gemeten binnen de doorvaartbox', vak.x, ty); ty += 3 * TS;
            doc.setDrawColor(30, 127, 166); doc.setLineWidth(0.4); doc.line(vak.x, ty, vak.x + vak.w, ty); ty += rh;
            const kol = [['', 8], ['wat', 34], ['station', 32], ...(stationeringAan() ? [['stationering', 32]] : []), ['offset', 40], ['oppervlak', 22], ['rand (m NAP)', 26], ['t.o.v. de toets', 70]];
            const kx0 = []; let xx = vak.x; for (const k of kol) { kx0.push(xx); xx += k[1] * TS; }
            doc.setFontSize(7.5 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
            kol.forEach((k, j) => doc.text(k[0], kx0[j] + 1, ty));
            ty += rh;
            const rijen = [...(r.dekkingH?.gaten || []).map(g => ['onderzijde', g]), ...(r.dekkingD?.gaten || []).map(g => ['bodem', g])];
            doc.setFont('helvetica', 'normal');
            if (!rijen.length) { doc.setTextColor(22, 128, 61); doc.text('Geen: onderzijde' + (r.dekkingD ? ' en bodem' : '') + ' zijn binnen de box overal gemeten.', vak.x + 1, ty); ty += rh; }
            const top = r.P + r.H, onder = r.D ? r.PD - r.D : null;
            rijen.forEach(([wat, g], i) => {
              if (ty > vak.y + vak.h - 8 * TS) { if (i === rijen.length - 1 || ty > vak.y + vak.h - 3) return; }
              const kant = (a, b2) => a >= -0.05 ? `${komma(a, 1)} – ${komma(b2, 1)} m R` : b2 <= 0.05 ? `${komma(-b2, 1)} – ${komma(-a, 1)} m L` : `${komma(-a, 1)} m L – ${komma(b2, 1)} m R`;
              let oordeel = '';
              if (g.rand != null) {
                if (wat === 'onderzijde') { const d = g.rand - top; oordeel = d >= 0.5 ? `rand ${komma(d, 2)} m boven de box` : d >= 0 ? `rand maar ${komma(d, 2)} m boven de box — nameten` : `rand ${komma(-d, 2)} m in de box — nameten`; }
                else if (onder != null) { const d = onder - g.rand; oordeel = d >= 0.5 ? `rand ${komma(d, 2)} m onder de vereiste diepte` : d >= 0 ? `rand maar ${komma(d, 2)} m onder de vereiste diepte — nameten` : `rand ${komma(-d, 2)} m te hoog — nameten`; }
              }
              let j = 0;
              doc.setTextColor(...(wat === 'onderzijde' ? [44, 52, 68] : [30, 111, 166])); doc.setFont('helvetica', 'bold'); doc.text(String(i + 1), kx0[j++] + 1, ty);
              doc.setFont('helvetica', 'normal'); doc.setTextColor(27, 42, 56);
              doc.text(wat === 'onderzijde' ? 'onderzijde brug' : 'bodem', kx0[j++] + 1, ty);
              doc.text(`${komma(g.s0, 1)} – ${komma(g.s1, 1)} m`, kx0[j++] + 1, ty);
              if (stationeringAan()) doc.text(paalTekst(g.s0), kx0[j++] + 1, ty);
              doc.text(kant(g.o0, g.o1), kx0[j++] + 1, ty);
              doc.text(`${komma(g.opp, g.opp < 10 ? 1 : 0)} m²`.replace('m²', 'm2'), kx0[j++] + 1, ty);
              doc.text(g.rand == null ? '—' : komma(g.rand, 2), kx0[j++] + 1, ty);
              doc.setTextColor(...(/nameten/.test(oordeel) ? [198, 71, 43] : [107, 122, 140]));
              doc.text(kortTekst(doc, oordeel, kol[j][1] * TS + 30 * TS), kx0[j] + 1, ty);
              doc.setDrawColor(232, 237, 241); doc.setLineWidth(0.15); doc.line(vak.x, ty + 1.6 * TS, xx, ty + 1.6 * TS);
              ty += rh;
            });
            doc.setFontSize(6.5 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
            const voet = 'Een vakje telt als gemeten als er minstens één (ruisvrij) meetpunt in ligt. Onderzijde: alleen het deel van de box dat onder het brugdek ligt ' +
              `(${brugBoven ? 'dek = bovenzijde brug' : 'dek = ingesloten tussen gemeten vakjes; lees de bovenzijde in voor een betere begrenzing'}). Bodem: de meetpunten van ${bronBestandsnaam || 'puntenwolk A'}, niet het terreinmodel. ` +
              'Waar niet gemeten is zegt de toets niets: daar kan iets lager hangen of hoger liggen. Rand = laagste onderzijde (hoogste bodem) direct rondom de plek.';
            doc.splitTextToSize(voet, vak.w).slice(0, 3).forEach((regel, j) => doc.text(regel, vak.x, Math.min(vak.y + vak.h - 1, ty + 3 * TS + j * 3.2 * TS)));
          }
        }
      }
    }

    // ── snoeilijst op eigen blad(en) ──
    if (inst.snoei && begroeiing && snKader()) {
      let r = null;
      try { r = voerSnoeiUit(); } catch (err) { meldingen.push('Snoeicheck: ' + err.message); }
      if (r) {
        const metKad = percelen.length > 0, metPaal = stationeringAan();
        const kolommen = [['nr', 9, 'c'], ['prioriteit', 24], ['station', 26], ...(metPaal ? [[palen.modus === 'hm' ? 'hectometrering' : 'dijkpaal', 26]] : []), ['kant', 10, 'c'], ['lengte', 15, 'r'], ['boven pad', 24], ['tot hart', 16, 'r'], ['terugsnoeien', 25, 'r'], ['soort', metKad ? 36 : 42],
          ...(metKad ? [['boom op perceel', 38]] : []), ['RD x', 21, 'r'], ['RD y', 21, 'r']];
        const somW = kolommen.reduce((a, k) => a + k[1], 0);
        const f = Math.min(vak.w / somW, 1.45 * TS);
        const rh = 5.6 * TS, kopMm = 8 * TS;
        const regels = snRegels(r);
        const samenvattingH = regels.length * 5.4 * TS + 16 * TS;
        const rijen = r.snoeipunten;
        let i = 0, blad = 0;
        do {
          const ruimte = vak.h - kopMm - 16 * TS - (blad === 0 ? samenvattingH : 0);
          const perBlad = Math.max(1, Math.floor(ruimte / rh) - 1);
          const nodig = volgendBladNodig();
          const titel = `Snoeilijst${blad ? ' (vervolg)' : ''} — ${r.ok ? 'pad vrij' : `${r.nRood} snoeipunt${r.nRood === 1 ? '' : 'en'} in het profiel`}`;
          nieuwePagina(titel, 'geen schaal');
          const pg = paginas[paginas.length - 1];
          pg.legenda = [{ symbool: 'snnr', tekst: 'snoeipunt (nummer ook op het bovenaanzicht)', sleutel: 'snn' },
            { symbool: 'blokje', klasse: SN_KLEUR.rood, tekst: 'snoeien: steekt in het doorloopprofiel', sleutel: 'snr' },
            { symbool: 'blokje', klasse: SN_KLEUR.oranje, tekst: 'meenemen: alleen in de snoeimarge', sleutel: 'sno' }];
          if (nodig) {
            onVoortgang?.('Snoeilijst…');
            doc.setFontSize(12 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
            doc.text(titel, vak.x, vak.y + 5 * TS);
            doc.setFontSize(8 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
            doc.text(`${assen[actieveAs]?.naam || 'as'} · doorloopprofiel ${komma(r.B, 2)} × ${komma(r.H, 2)} m · snoeimarge ${komma(r.M, 2)} m · maten in m`, vak.x + vak.w, vak.y + 5 * TS, { align: 'right' });
            let ty = vak.y + kopMm + 6 * TS;
            if (blad === 0) {
              const labelW = 58 * TS, tabW = Math.min(vak.w, 200 * TS), rs = 5.4 * TS;
              doc.setFontSize(10 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
              doc.text('Uitgangspunten en resultaat', vak.x, ty); ty += 3 * TS;
              doc.setDrawColor(30, 127, 166); doc.setLineWidth(0.4); doc.line(vak.x, ty, vak.x + tabW, ty); ty += rs;
              for (const [label, waarde, st] of regels) {
                const oordeel = label === 'Oordeel';
                doc.setFontSize((oordeel ? 10.5 : 8.5) * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
                doc.text(label, vak.x, ty);
                doc.setFont('helvetica', st || oordeel ? 'bold' : 'normal');
                doc.setTextColor(...(st === 'ok' ? [22, 128, 61] : st === 'nok' ? [198, 71, 43] : st === 'let' ? [178, 106, 0] : [27, 42, 56]));
                doc.text(kortTekst(doc, pdfTekst(waarde), tabW - labelW), vak.x + labelW, ty);
                ty += rs;
              }
              ty += 6 * TS;
            }
            // tabel
            const kolX = []; let xx = vak.x;
            for (const k of kolommen) { kolX.push(xx); xx += k[1] * f; }
            const cel = (j, tekst, y) => {
              const [, bw, uitl] = kolommen[j];
              const x = uitl === 'r' ? kolX[j] + bw * f - 1.2 * TS : uitl === 'c' ? kolX[j] + bw * f / 2 : kolX[j] + 1.2 * TS;
              doc.text(kortTekst(doc, String(tekst), bw * f - 2.4 * TS), x, y, { align: uitl === 'r' ? 'right' : uitl === 'c' ? 'center' : 'left' });
            };
            doc.setFillColor(240, 244, 247); doc.rect(vak.x, ty - rh + 1.4 * TS, xx - vak.x, rh, 'F');
            doc.setFontSize(7.5 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
            kolommen.forEach((k, j) => cel(j, k[0], ty));
            doc.setDrawColor(30, 127, 166); doc.setLineWidth(0.35); doc.line(vak.x, ty + 1.6 * TS, xx, ty + 1.6 * TS);
            ty += rh;
            if (!rijen.length) {
              doc.setFont('helvetica', 'normal'); doc.setTextColor(22, 128, 61); doc.setFontSize(8.5 * TS);
              doc.text('Geen begroeiing in het doorloopprofiel of de snoeimarge.', vak.x + 2 * TS, ty);
            }
            for (let j = i; j < Math.min(rijen.length, i + perBlad); j++) {
              const p = rijen[j];
              const kleur = p.ernst === 'rood' ? [198, 71, 43] : [224, 138, 30];
              doc.setFillColor(...kleur); doc.circle(kolX[0] + kolommen[0][1] * f / 2, ty - 1.2 * TS, 2.1 * TS, 'F');
              doc.setFontSize(6.5 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
              doc.text(String(p.nr), kolX[0] + kolommen[0][1] * f / 2, ty - 0.4 * TS, { align: 'center' });
              doc.setFontSize(7.5 * TS); doc.setFont('helvetica', p.ernst === 'rood' ? 'bold' : 'normal'); doc.setTextColor(...kleur);
              cel(1, p.ernst === 'rood' ? 'snoeien' : 'meenemen (marge)', ty);
              doc.setFont('helvetica', 'normal'); doc.setTextColor(27, 42, 56);
              let kj = 2;
              cel(kj++, `${komma(p.s0, 1)} – ${komma(p.s1, 1)}`, ty);
              if (metPaal) { doc.setFont('helvetica', 'bold'); doc.setTextColor(31, 78, 121); cel(kj++, paalTekst(p.s0), ty); doc.setFont('helvetica', 'normal'); doc.setTextColor(27, 42, 56); }
              cel(kj++, p.kant, ty); cel(kj++, komma(p.lengte, 1), ty);
              cel(kj++, `${komma(p.hVan, 2)} – ${komma(p.hTot, 2)}`, ty); cel(kj++, komma(p.oDicht, 2), ty); cel(kj++, komma(p.diepte, 2), ty);
              cel(kj++, p.soort, ty);
              if (metKad) { doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 47, 138); cel(kj++, p.perceel ? perceelNaam(p.perceel) : '—', ty); doc.setFont('helvetica', 'normal'); doc.setTextColor(27, 42, 56); }
              cel(kj++, komma(p.x, 1), ty); cel(kj, komma(p.y, 1), ty);
              doc.setDrawColor(232, 237, 241); doc.setLineWidth(0.15); doc.line(vak.x, ty + 1.6 * TS, xx, ty + 1.6 * TS);
              ty += rh;
            }
            doc.setFontSize(6.5 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
            const voet = `Kant L/R gezien in de richting van oplopend station.${metPaal ? (palen.modus === 'hm' ? ' Hectometrering = begin van het snoeipunt.' : ' Dijkpaal = begin van het snoeipunt: paal + afstand langs de as.') : ''} Hoogtes t.o.v. het pad (maaiveld uit ${begroeiing.naam}${r.grondKlasse ? ', grondklasse 2' : ''}). ` +
              `Terugsnoeien = hoeveel er (horizontaal of verticaal) af moet om buiten profiel + marge te komen — indicatief.` +
              (metKad ? ` Perceel = waar de stam van de boom staat (stam geschat uit de puntenwolk; kadastrale kaart: ${perceelBron}; eigenaren niet opgenomen).` : '');
            doc.splitTextToSize(voet, xx - vak.x).slice(0, 3).forEach((regel, j) => doc.text(regel, vak.x, Math.min(vak.y + vak.h - 1, ty + 3 * TS + j * 3.2 * TS)));
          }
          i += perBlad; blad++;
        } while (i < rijen.length);
        // ── per perceel: welke snoeipunten horen bij welk perceel (voor de brief aan de eigenaar) ──
        if (metKad && rijen.length) {
          const groepen = snPerPerceel(r);
          const rh2 = 6 * TS;
          let g = 0, b2 = 0;
          do {
            const perBlad = Math.max(1, Math.floor((vak.h - kopMm - 22 * TS) / rh2) - 1);
            const nodig = volgendBladNodig();
            const titel = `Snoeilijst per perceel${b2 ? ' (vervolg)' : ''} — ${groepen.filter(x => x.perceel).length} percelen`;
            nieuwePagina(titel, 'geen schaal');
            paginas[paginas.length - 1].legenda = [{ symbool: 'kadgrens', tekst: `kadastrale kaart: ${perceelBron}`, sleutel: 'kg' }, { symbool: 'snnr', tekst: 'snoeipunt (nummer op het bovenaanzicht)', sleutel: 'snn' }];
            if (nodig) {
              doc.setFontSize(12 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
              doc.text(titel, vak.x, vak.y + 5 * TS);
              doc.setFontSize(8 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
              doc.text('perceel waar de stam van de boom staat · eigenaar op te vragen bij het Kadaster', vak.x + vak.w, vak.y + 5 * TS, { align: 'right' });
              const kx = [vak.x, vak.x + 62 * TS, vak.x + 86 * TS, vak.x + 104 * TS, vak.x + 126 * TS], eind = Math.min(vak.x + vak.w, vak.x + 260 * TS);
              let ty = vak.y + kopMm + 8 * TS;
              doc.setFillColor(240, 244, 247); doc.rect(vak.x, ty - rh2 + 1.6 * TS, eind - vak.x, rh2, 'F');
              doc.setFontSize(7.5 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
              ['perceel', 'grootte (m2)', 'snoeipunten', 'te snoeien (m)', 'nummers'].forEach((t, j) => doc.text(t, kx[j] + 1.2 * TS, ty));
              doc.setDrawColor(30, 127, 166); doc.setLineWidth(0.35); doc.line(vak.x, ty + 1.8 * TS, eind, ty + 1.8 * TS);
              ty += rh2;
              for (let j = g; j < Math.min(groepen.length, g + perBlad); j++) {
                const gr = groepen[j];
                doc.setFontSize(8 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(...(gr.perceel ? [107, 47, 138] : [107, 122, 140]));
                doc.text(kortTekst(doc, gr.perceel ? perceelNaam(gr.perceel) : 'onbekend (geen stam of buiten de kaart)', 60 * TS), kx[0] + 1.2 * TS, ty);
                doc.setFont('helvetica', 'normal'); doc.setTextColor(27, 42, 56);
                doc.text(gr.perceel?.grootte ? gr.perceel.grootte.toLocaleString('nl-NL') : '', kx[1] + 1.2 * TS, ty);
                doc.text(String(gr.punten.length), kx[2] + 1.2 * TS, ty);
                doc.text(komma(gr.punten.reduce((a, p) => a + p.lengte, 0), 1), kx[3] + 1.2 * TS, ty);
                let nx = kx[4] + 3 * TS;
                for (const p of gr.punten) {
                  if (nx > eind - 3 * TS) { doc.text('…', nx, ty); break; }
                  doc.setFillColor(...(p.ernst === 'rood' ? [198, 71, 43] : [224, 138, 30])); doc.circle(nx, ty - 1.2 * TS, 2.1 * TS, 'F');
                  doc.setFontSize(6.5 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
                  doc.text(String(p.nr), nx, ty - 0.4 * TS, { align: 'center' });
                  nx += 5.4 * TS;
                }
                doc.setFontSize(8 * TS); doc.setFont('helvetica', 'normal');
                doc.setDrawColor(232, 237, 241); doc.setLineWidth(0.15); doc.line(vak.x, ty + 1.8 * TS, eind, ty + 1.8 * TS);
                ty += rh2;
              }
            }
            g += perBlad; b2++;
          } while (g < groepen.length);
        }
      }
    }

    const startAs = actieveAs;
    bewaarActieveAs();
    const asLijst = inst.alleAssen ? assen.map((a, i) => i).filter(i => assen[i].punten.length >= 2) : [actieveAs];
    if (!asLijst.length) asLijst.push(actieveAs);
    try {
     for (const asIdx of asLijst) {
      if (asIdx !== actieveAs) zetActieveAs(asIdx, true);
      const stations = inst.dwarsprofielen ? geselecteerdeStations(inst) : [];
      const asVoor = asLijst.length > 1 ? `${assen[asIdx].naam} — ` : '';
      // ── lengteprofiel ──
      if (inst.lengteprofiel && langsprofiel.length >= 2) {
        onVoortgang?.('Lengteprofiel tekenen…');
        const kopMm = 8 * TS;
        const overdrijvingLangs = Math.max(0.25, Number(langsOverdrijvingVeld.value) || 5);
        const lengte = langsprofiel[langsprofiel.length - 1].station - langsprofiel[0].station;
        const plotWMm = vak.w - plotMarges;
        const mmPerM = plotWMm / Math.max(1e-6, lengte);
        const bereik = vulHoogtebereik(langsprofiel) || 1;
        const nodigMm = (MARGE_T + 40) / VIRT_PER_MM + bereik * mmPerM * overdrijvingLangs;
        const grafHMm = Math.max(60, Math.min(vak.h - kopMm, nodigMm));
        const horN = 1000 / mmPerM;
        const langsNodig = volgendBladNodig();
        nieuwePagina(`${asVoor}Lengteprofiel over de as`, `hor. ${schaalTekst(horN)} · verh. ×${overdrijvingLangs}`);
        if (langsNodig) {
        zetHost(vak.w, grafHMm);
        tekenGrafiek(svgEl, langsprofiel, 'station', 'station (m)', null, matenWaarde(maatLangsVeld, 10), overdrijvingLangs, null, null, null, { legendaUit: paginas[paginas.length - 1].legenda });
        doc.setFontSize(12 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
        doc.text(`${asVoor}Lengteprofiel — station 0 tot ${lengte.toFixed(1)} m${stationeringAan() ? ` (${paalTekst(0)} – ${paalTekst(lengte)})` : ''}`, vak.x, vak.y + 5 * TS);
        doc.setFontSize(8 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
        doc.text(`hor. ${schaalTekst(horN)} · hoogteverschillen ${overdrijvingLangs}× overdreven`, vak.x + vak.w, vak.y + 5 * TS, { align: 'right' });
        const data = await beeldVanSvg(svgEl, naarPx(vak.w), naarPx(grafHMm), horN);
        svgEl.innerHTML = ''; svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
        doc.addImage(data, 'JPEG', vak.x, vak.y + kopMm, vak.w, grafHMm);
        doc.setDrawColor(220, 227, 232); doc.setLineWidth(0.2);
        doc.rect(vak.x, vak.y + kopMm, vak.w, grafHMm);
        }
      }

      // ── dwarsprofielen (raster van kolommen × rijen) ──
      if (inst.dwarsprofielen && stations.length) {
        const overdrijving = Math.max(0.25, inst.overdrijving);
        const matenInterval = matenWaarde(maatDwarsVeld, 5);
        const tussenMm = 6 * TS, kopMm = 6 * TS;

        // horizontale schaal → breedte van één profielvak
        // Elk vak krijgt rechts een legenda, tenzij die er niet meer bij past
        // (dan liever zonder legenda dan een kleinere schaal) of het profiel
        // zelf erg smal is (kleine schaal, veel profielen naast elkaar).
        let N = inst.dwarsSchaal === 'blad' ? null : Number(inst.dwarsSchaal) || null;
        const margesMet = (MARGE_L + grafiekMargeR(true)) / VIRT_PER_MM;
        const past = (n, m) => breedte * 1000 / n <= vak.w - m;
        let metLegenda = !kolomModus && vak.w - margesMet >= 80;   // kolom rechts: één legenda per blad in de kolom
        if (N && !past(N, metLegenda ? margesMet : plotMarges)) {
          if (metLegenda && past(N, plotMarges)) metLegenda = false;
          else {
            const oud = N;
            N = STANDAARD_SCHALEN.find(s => past(s, metLegenda ? margesMet : plotMarges)) || null;
            meldingen.push(`Dwarsprofielen passen niet op ${schaalTekst(oud)}; gebruikt: ${N ? schaalTekst(N) : 'bladbreed'}.`);
          }
        }
        if (N && metLegenda && breedte * 1000 / N < 80) metLegenda = false;
        const celMarges = metLegenda ? margesMet : plotMarges;
        const plotWMm = N ? breedte * 1000 / N : vak.w - celMarges;
        const celW = plotWMm + celMarges;
        const kolommen = Math.max(1, Math.floor((vak.w + tussenMm) / (celW + tussenMm)));
        const mmPerM = plotWMm / breedte;
        const horN = 1000 / mmPerM;

        const reeksPerStation = new Map();
        let nodigGrafMm = 30;
        for (const station of stations) {
          const reeks = berekenDwarsprofiel(station);
          reeksPerStation.set(station, reeks);
          const bereik = vulHoogtebereik(reeks, true);
          if (bereik === null) continue;
          const margeB = reeks.bgt && (reeks.bgt.stroken.length || reeks.bgt.grenzen.length) ? 58 : 32;
          const mm = (MARGE_T + margeB) / VIRT_PER_MM + bereik * mmPerM * overdrijving;
          if (mm > nodigGrafMm) nodigGrafMm = mm;
        }
        let celH, rijen;
        if (inst.perPagina === 'auto') {
          celH = Math.min(nodigGrafMm + kopMm, vak.h);
          rijen = Math.max(1, Math.floor((vak.h + tussenMm) / (celH + tussenMm)));
        } else {
          const perBlad = Math.max(1, Number(inst.perPagina) || 4);
          rijen = Math.max(1, Math.ceil(perBlad / kolommen));
          celH = (vak.h - (rijen - 1) * tussenMm) / rijen;
          if (celH - kopMm < nodigGrafMm - 0.5) {
            meldingen.push(`Bij ${perBlad} per blad past niet elk profiel in zijn vak; kies "automatisch", een kleinere schaal of een lagere overdrijving.`);
          }
        }
        const perBlad = inst.perPagina === 'auto' ? kolommen * rijen : Math.min(kolommen * rijen, Math.max(1, Number(inst.perPagina) || 4));
        const grafHMm = celH - kopMm;
        // vakken over de breedte gelijkmatig verdelen
        const stapX = kolommen > 1 ? (vak.w - celW) / (kolommen - 1) : 0;
        zetHost(celW, grafHMm);

        let teller = 0;
        for (let i = 0; i < stations.length; i += perBlad) {
          const groep = stations.slice(i, i + perBlad);
          const a = groep[0], b = groep[groep.length - 1];
          const dwarsNodig = volgendBladNodig();
          if (!dwarsNodig) teller += groep.length;
          nieuwePagina(`${asVoor}Dwarsprofielen station ${a.toFixed(1)}${groep.length > 1 ? ' – ' + b.toFixed(1) : ''} m${stationeringAan() ? ` (${paalTekst(a)}${groep.length > 1 ? ' – ' + paalTekst(b) : ''})` : ''}`,
            `hor. ${schaalTekst(horN)} · verh. ×${overdrijving}`);
          for (let k = 0; k < (dwarsNodig ? groep.length : 0); k++) {
            const station = groep[k];
            onVoortgang?.(`Dwarsprofiel ${++teller} van ${stations.length}…`);
            // kolomsgewijs vullen (van boven naar beneden, dan volgende kolom)
            const kol = Math.floor(k / rijen), rij = k % rijen;
            const x = vak.x + kol * stapX, y = vak.y + rij * (celH + tussenMm);
            doc.setFontSize(9 * TS); doc.setFont('helvetica', 'bold'); doc.setTextColor(27, 42, 56);
            doc.text(`${asVoor}Station ${station.toFixed(1)} m${paalAchter(station, '  ·  ')}`, x, y + kopMm - 1.6 * TS);
            if (celW > 150 * TS) {
              doc.setFontSize(6.5 * TS); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 122, 140);
              doc.text(`breedte ${breedte} m${pL !== pR ? ` (links ${kortGetal(pL)} · rechts ${kortGetal(pR)})` : ''} · hor. ${schaalTekst(horN)} · verh. ×${overdrijving}${volleProfielenGeldig() ? ' · uit alle punten' : ''} · kijkrichting oplopend station`, x + celW, y + kopMm - 1.6 * TS, { align: 'right' });
            }
            const bomen = boomVindenBijStation(station, breedte);
            svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
            tekenGrafiek(svgEl, reeksPerStation.get(station), 'offset', 'offset (m)', 0, matenInterval, overdrijving, null, bomen, waterpeil(), { legenda: metLegenda, legendaUit: paginas[paginas.length - 1].legenda });
            const data = await beeldVanSvg(svgEl, naarPx(celW), naarPx(grafHMm), horN);
            doc.addImage(data, 'JPEG', x, y + kopMm, celW, grafHMm);
            doc.setDrawColor(220, 227, 232); doc.setLineWidth(0.2);
            doc.rect(x, y + kopMm, celW, grafHMm);
          }
        }
      }
     }
    } finally {
      printHost.remove();
      if (actieveAs !== startAs) { zetActieveAs(startAs, true); tekenVlak(); }
    }

    if (!paginas.length) throw new Error('niets om te exporteren (teken eerst een as voor profielen)');

    // titelblok op elke pagina, met bladnummering
    onVoortgang?.('Titelblokken plaatsen…');
    const logo = makerLogo || await logoAlsPng();
    if (dxf) doc.logoData = logo?.data || null;
    let beeld3D = null;
    if (kolomModus && inst.beeld3D && !inst.blad3D && inst.bovenaanzicht) {
      onVoortgang?.('3D-beeld maken…');
      const bw = kolomW - 8 * TS;
      const px = Math.round(Math.min(2400, bw / 25.4 * (voorbeeld ? 60 : 200)));
      beeld3D = maak3DBeeldVoorPdf(inst, inst.dwarsprofielen ? stations : dwarsStations, px, Math.round(px * 0.72));
    }
    for (let i = 0; i < paginas.length; i++) {
      doc.setPage(i + 1);
      if (kolomModus) tekenKolomBlad(doc, { W, H, marge, zone: ZONE, kolom, s: TS, beeld3D }, inst, logo, paginas[i], i + 1, paginas.length);
      else tekenTitelblok(doc, W, H, marge, titelH, inst, logo, paginas[i], i + 1, paginas.length);
    }

    if (dxf) return { doc, paginas, meldingen, W, H };
    if (voorbeeld) return { doc, paginas, meldingen };
    if (selectie) {
      const buiten = [...selectie].filter(n => n < 1 || n > paginas.length);
      if (buiten.length) meldingen.push(`Blad ${buiten.join(', ')} bestaat niet (er zijn ${paginas.length} bladen).`);
    }
    const uit = doc.bestanden();
    if (!uit.length) throw new Error(`geen van de gekozen bladen bestaat (er zijn ${paginas.length} bladen)`);
    onVoortgang?.('Opslaan…');
    const basis = pdfBestandsnaam(inst).replace(/\.pdf$/i, '');
    const cijfers = String(paginas.length).length;
    const bladNaam = (n) => `${basis}_blad${String(n).padStart(Math.max(2, cijfers), '0')}.pdf`;
    if (inst.losseBladen) {
      // handle is hier een map (gekozen bij het starten) of null (Downloads)
      for (const f of uit) {
        const naam = bladNaam(f.blad);
        if (handle && handle.kind === 'directory') {
          try { const fh = await handle.getFileHandle(veiligeBestandsnaam(naam), { create: true }); await schrijfBestand(fh, f.blob, naam); continue; }
          catch (err) { console.warn('Schrijven in map mislukt, val terug op Downloads:', err); }
        }
        await schrijfBestand(null, f.blob, naam);
        await new Promise(r => setTimeout(r, 350));   // browsers laten meerdere downloads achter elkaar beter toe met een pauze
      }
      statusEl.textContent = `${uit.length} losse PDF-bladen opgeslagen${handle && handle.kind === 'directory' ? ` in ${handle.name}` : ' in Downloads'}.`;
    } else {
      const naam = selectie ? (uit.length === 1 && selectie.size === 1 ? bladNaam([...selectie][0]) : `${basis}_bladen.pdf`) : pdfBestandsnaam(inst);
      await schrijfBestand(handle, uit[0].blob, naam);
    }
    const aantalUit = inst.losseBladen ? uit.length : (selectie ? [...selectie].filter(n => n >= 1 && n <= paginas.length).length : paginas.length);
    return meldingen.length ? `PDF gemaakt (${aantalUit} van ${paginas.length} bladen). Let op: ${meldingen.join(' ')}` : '';
  }

  /* ────────────────────────────────────────────────────────────────
     Zoom/pan op het dwarsprofiel — zelfde muiswiel+sleep-principe als
     op het bovenaanzicht, maar dan op de SVG-transform van de grafiek.
     ──────────────────────────────────────────────────────────────── */
  function wisDwarsZoom() { dwarsZoom = { schaal: 1, panX: 0, panY: 0 }; }

  function dwarsZoomBij(factor, x0, y0) {
    const lokaalX = (x0 - dwarsZoom.panX) / dwarsZoom.schaal;
    const lokaalY = (y0 - dwarsZoom.panY) / dwarsZoom.schaal;
    dwarsZoom.schaal = Math.max(0.1, Math.min(50, dwarsZoom.schaal * factor));
    dwarsZoom.panX = x0 - lokaalX * dwarsZoom.schaal;
    dwarsZoom.panY = y0 - lokaalY * dwarsZoom.schaal;
    tekenDwarsVoorHuidigeStation();
  }

  dwarsZoomResetKnop.addEventListener('click', () => { wisDwarsZoom(); tekenDwarsVoorHuidigeStation(); });
  dwarsZoomInKnop.addEventListener('click', () => {
    const rect = svgDwars.getBoundingClientRect();
    dwarsZoomBij(1.3, rect.width / 2, rect.height / 2);
  });
  dwarsZoomUitKnop.addEventListener('click', () => {
    const rect = svgDwars.getBoundingClientRect();
    dwarsZoomBij(1 / 1.3, rect.width / 2, rect.height / 2);
  });

  svgDwars.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = svgDwars.getBoundingClientRect();
    const x0 = e.clientX - rect.left, y0 = e.clientY - rect.top;
    if (!e.ctrlKey && Math.abs(e.deltaX) > 0.5) {
      // twee-vinger scrollen op een trackpad (heeft een horizontale
      // component, in tegenstelling tot een gewoon verticaal muiswiel) — pannen
      dwarsZoom.panX -= e.deltaX;
      dwarsZoom.panY -= e.deltaY;
      tekenDwarsVoorHuidigeStation();
      return;
    }
    // muiswiel, of pincet-zoomen op een trackpad (stuurt automatisch ctrlKey mee)
    const factor = Math.max(0.5, Math.min(2, Math.pow(1.003, -e.deltaY)));
    dwarsZoomBij(factor, x0, y0);
  }, { passive: false });

  svgDwars.addEventListener('pointerdown', (e) => {
    e.preventDefault(); // anders selecteert de browser de svg-tekstlabels tijdens het slepen
    dwarsSlepen = { x: e.clientX, y: e.clientY, panX: dwarsZoom.panX, panY: dwarsZoom.panY };
    svgDwars.setPointerCapture(e.pointerId);
    svgDwars.classList.add('slepen');
  });
  svgDwars.addEventListener('pointermove', (e) => {
    if (!dwarsSlepen) return;
    dwarsZoom.panX = dwarsSlepen.panX + (e.clientX - dwarsSlepen.x);
    dwarsZoom.panY = dwarsSlepen.panY + (e.clientY - dwarsSlepen.y);
    tekenDwarsVoorHuidigeStation();
  });
  const stopDwarsSlepen = () => { dwarsSlepen = null; svgDwars.classList.remove('slepen'); };
  svgDwars.addEventListener('pointerup', stopDwarsSlepen);
  svgDwars.addEventListener('pointercancel', stopDwarsSlepen);

  /* ────────────────────────────────────────────────────────────────
     Zoom/pan op het lengteprofiel — zelfde principe als het dwarsprofiel
     hierboven, één-op-één overgenomen.
     ──────────────────────────────────────────────────────────────── */
  function wisLangsZoom() { langsZoom = { schaal: 1, panX: 0, panY: 0 }; }

  function langsZoomBij(factor, x0, y0) {
    const lokaalX = (x0 - langsZoom.panX) / langsZoom.schaal;
    const lokaalY = (y0 - langsZoom.panY) / langsZoom.schaal;
    langsZoom.schaal = Math.max(0.1, Math.min(50, langsZoom.schaal * factor));
    langsZoom.panX = x0 - lokaalX * langsZoom.schaal;
    langsZoom.panY = y0 - lokaalY * langsZoom.schaal;
    tekenLangs();
  }

  langsOverdrijvingVeld.addEventListener('change', () => { wisLangsZoom(); tekenLangs(); });
  langsZoomResetKnop.addEventListener('click', () => { wisLangsZoom(); tekenLangs(); });
  langsZoomInKnop.addEventListener('click', () => {
    const rect = svgLangs.getBoundingClientRect();
    langsZoomBij(1.3, rect.width / 2, rect.height / 2);
  });
  langsZoomUitKnop.addEventListener('click', () => {
    const rect = svgLangs.getBoundingClientRect();
    langsZoomBij(1 / 1.3, rect.width / 2, rect.height / 2);
  });

  svgLangs.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = svgLangs.getBoundingClientRect();
    const x0 = e.clientX - rect.left, y0 = e.clientY - rect.top;
    if (!e.ctrlKey && Math.abs(e.deltaX) > 0.5) {
      langsZoom.panX -= e.deltaX;
      langsZoom.panY -= e.deltaY;
      tekenLangs();
      return;
    }
    const factor = Math.max(0.5, Math.min(2, Math.pow(1.003, -e.deltaY)));
    langsZoomBij(factor, x0, y0);
  }, { passive: false });

  svgLangs.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    langsSlepen = { x: e.clientX, y: e.clientY, panX: langsZoom.panX, panY: langsZoom.panY };
    svgLangs.setPointerCapture(e.pointerId);
    svgLangs.classList.add('slepen');
  });
  svgLangs.addEventListener('pointermove', (e) => {
    if (!langsSlepen) return;
    langsZoom.panX = langsSlepen.panX + (e.clientX - langsSlepen.x);
    langsZoom.panY = langsSlepen.panY + (e.clientY - langsSlepen.y);
    tekenLangs();
  });
  const stopLangsSlepen = () => { langsSlepen = null; svgLangs.classList.remove('slepen'); };
  svgLangs.addEventListener('pointerup', stopLangsSlepen);
  svgLangs.addEventListener('pointercancel', stopLangsSlepen);

  window.addEventListener('resize', () => { tekenLangs(); tekenDwarsVoorHuidigeStation(); });

  /* Slepen op het venster (2.10.2): een puntenwolk opent als A, net als de knop; een .pvproj opent het
     project. Gesleepte bestanden hebben geen pad, dus een .pvproj wordt in de recente projecten gezocht
     (zelfde naam en grootte); anders opent hij als los project, zonder vakken. Slepen op een
     bestandsveld blijft zoals het was. */
  const isBestandsveld = (e) => e.target instanceof HTMLInputElement && e.target.type === 'file';
  window.addEventListener('dragover', (e) => {
    if (isBestandsveld(e) || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', async (e) => {
    if (isBestandsveld(e) || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    const bestand = e.dataTransfer.files[0], naam = bestand.name.toLowerCase();
    if (/\.(las|laz|pts)$/.test(naam)) { await openPuntenwolkA(bestand); return; }
    if (naam.endsWith('.pvproj') && natief) {
      try {
        for (const r of await (await natiefVraag('recent', null)).json()) {
          if (!r.bestaat) continue;
          const i = await natiefInfo(padDeel(r.pad, bestand.name));
          if (i.bestaat && i.grootte === bestand.size) { await openProjectMap(natieveMap(r.pad), bestand.name); return; }
        }
      } catch (err) { console.warn('gesleept project zoeken in recent mislukt:', err); }
    }
    if (/\.(pvproj|json)$/.test(naam)) {
      projectMap = null; projectHandle = null;
      toonProjectBestand(bestand.name);
      if (await laadProjectBestand(bestand) && naam.endsWith('.pvproj'))
        statusEl.textContent += ' · los geopend: open de projectmap met Project openen voor de vakken van de puntenwolk';
      return;
    }
    statusEl.style.color = ''; statusEl.textContent = `${bestand.name}: sleep een puntenwolk (.las, .laz, .pts) of een project (.pvproj)`;
  });

  // eigen venster: project dat bij de start is meegegeven, en de tweede start met een project (exe roept dit aan)
  if (natief) {
    window.__pvOpenPad = (pad) => openProjectMap(natieveMap(pad));
    if (natief.openen) setTimeout(() => openProjectMap(natieveMap(natief.openen)), 0);
  }
  // klaar met opstarten: opstartscherm weg
  document.getElementById('opstartScherm')?.remove();
})();
