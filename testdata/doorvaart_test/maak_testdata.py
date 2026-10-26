"""Synthetische testset 'doorvaart onder een brug' (RD/NAP).
Vaarweg loopt langs de lokale u-as (stroomrichting), brug kruist haaks (v-as).
Alles wordt 30 graden gedraaid en op RD-coördinaten gezet."""
import numpy as np, json
rng = np.random.default_rng(42)
X0, Y0, HOEK = 151200.0, 411650.0, np.radians(30)   # oorsprong (midden vaarweg onder de brug) en draaiing
def naar_rd(u, v):
    return X0 + u*np.cos(HOEK) - v*np.sin(HOEK), Y0 + u*np.sin(HOEK) + v*np.cos(HOEK)

PEIL = 0.40          # waterstand bij de peiling (m NAP)
# ── vaarweg: bodem (multibeam) ──
# dwarsprofiel (v): bodem -3,20 in het midden (breedte 26 m), taluds 1:3 naar de oever op +1,00; kade/oever daarbuiten op +1,20
def bodem(v):
    a = np.abs(v)
    z = np.where(a <= 13, -3.20 + 0.0015*a**2, -3.20 + 0.0015*13**2 + (a-13)/3)
    z = np.minimum(z, 1.00)
    return np.where(a > 26.6, 1.20, z)
u = np.arange(-60, 60, 0.5); v = np.arange(-30, 30, 0.5)
U, V = np.meshgrid(u, v); U = U.ravel(); V = V.ravel()
Z = bodem(V) + 0.05*np.sin(U/7) + rng.normal(0, 0.04, U.size)
# een zandrug/ondiepte in de vaarweg net na de brug (geeft een diepte-conflict)
Z += 0.9*np.exp(-(((U-14)/4)**2 + ((V+6)/3)**2))
nat = np.abs(V) <= 26.6
x, y = naar_rd(U, V)
kleur = np.where(nat, 0, 1)
bodem_pts = np.c_[x, y, Z]

# ── brug: 12 m breed (langs u, van u=-6 tot +6), overspanning over de hele breedte; landhoofden bij |v|>24 ──
# onderkant: licht opgebogen (zeeg): +5,40 bij de landhoofden, +6,10 midden; 5 liggers (balken) 0,45 m lager
def onderkant(uu, vv):
    z = 6.10 - 0.70*(vv/24)**2
    for vl in (-18, -9, 0, 9, 18):          # liggers in de lengte van de brug? nee: dwarsdragers onder het dek langs v
        pass
    ligger = np.zeros_like(uu)
    for ul in (-5.0, -2.5, 0.0, 2.5, 5.0):   # langsliggers evenwijdig aan de brug (langs v), 0,40 m breed
        ligger = np.maximum(ligger, np.where(np.abs(uu-ul) < 0.20, 0.45, 0))
    z = z - ligger
    # obstakel: kabelgoot / leiding onder de brug op v = +8..+10, 0,6 m lager (geeft een hoogte-conflict)
    z = z - np.where((vv > 8) & (vv < 10) & (np.abs(uu) < 6), 0.60, 0)
    return z
uu = np.arange(-6, 6.0001, 0.10); vv = np.arange(-24, 24.0001, 0.10)
UU, VV = np.meshgrid(uu, vv); UU = UU.ravel(); VV = VV.ravel()
ZO = onderkant(UU, VV) + rng.normal(0, 0.01, UU.size)
# landhoofden (verticale wanden bij v = ±24) ook meegescand
lh = []
for s in (-1, 1):
    for z in np.arange(1.2, 5.4, 0.1):
        for uq in np.arange(-6, 6.0001, 0.2): lh.append((uq, s*24.0, z))
lh = np.array(lh)
# ruis: een paar vogels/spatten onder de brug (losse punten) — de controle moet daar niet op vallen
ruis = np.c_[rng.uniform(-5, 5, 6), rng.uniform(-15, 15, 6), rng.uniform(3.0, 4.5, 6)]
O = np.r_[np.c_[UU, VV, ZO], lh, ruis]
ox, oy = naar_rd(O[:, 0], O[:, 1]); onder_pts = np.c_[ox, oy, O[:, 2]]

# ── bovenkant brug (drone/laser): dek 1,15 m boven de onderkant, wegdek met tonrond, leuning 1,1 m hoog op de randen ──
uu = np.arange(-6, 6.0001, 0.25); vv = np.arange(-34, 34.0001, 0.25)   # loopt door over de oevers
UU, VV = np.meshgrid(uu, vv); UU = UU.ravel(); VV = VV.ravel()
dek = 6.10 - 0.70*(np.clip(VV, -24, 24)/24)**2 + 1.15 + 0.06*(1-(UU/6)**2)
ZB = dek + rng.normal(0, 0.015, UU.size)
leuning = np.abs(np.abs(UU) - 5.9) < 0.13
ZB = np.where(leuning, ZB + 1.10, ZB)
bx, by = naar_rd(UU, VV); boven_pts = np.c_[bx, by, ZB]

def schrijf(naam, p, rgb):
    with open(naam, 'w') as f:
        f.write(f"{len(p)}\n")
        for (a, b, c), (r, g, bl) in zip(p, rgb):
            f.write(f"{a:.3f} {b:.3f} {c:.3f} 0 {r} {g} {bl}\n")
def kleuren(n, basis): return np.tile(basis, (n, 1))
rgbb = np.where(nat[:, None], [[70, 110, 160]], [[120, 150, 90]])
schrijf('bodem_multibeam.pts', bodem_pts, rgbb)
schrijf('brug_onderzijde.pts', onder_pts, kleuren(len(onder_pts), [170, 160, 150]))
schrijf('brug_bovenzijde.pts', boven_pts, kleuren(len(boven_pts), [110, 110, 115]))
# vaarweg-as (midden vaarweg, langs u) als GeoJSON, voor "As inlezen"
a0 = naar_rd(np.array([-50.0]), np.array([0.0])); a1 = naar_rd(np.array([50.0]), np.array([0.0]))
json.dump({"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::28992"}},
           "features": [{"type": "Feature", "properties": {"naam": "As vaarweg"},
                         "geometry": {"type": "LineString", "coordinates": [[float(a0[0][0]), float(a0[1][0])], [float(a1[0][0]), float(a1[1][0])]]}}]},
          open('as_vaarweg.geojson', 'w'))
json.dump({"waterstand_bij_peiling_m_nap": PEIL, "maatgevend_hoogwater_m_nap": 1.10, "streefpeil_m_nap": 0.40,
           "toelichting": "Testwaarden. Doorvaarthoogte wordt meestal getoetst ten opzichte van een maatgevende (hoge) waterstand."},
          open('waterstanden.json', 'w'), indent=2)
print(len(bodem_pts), len(onder_pts), len(boven_pts))
