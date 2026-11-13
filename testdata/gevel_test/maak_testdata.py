"""Synthetische testset 'straat met voorgevels' (RD/NAP) voor snoeien langs gevels.

Een straat met aan beide kanten woningen, voortuinen en bomen op verschillende afstanden van de
voorgevel. Geen classificatie (gewone .pts): de gevelmodus moet het zonder kunnen.
Lokaal: u = langs de straat, v = dwars (+ = noordkant). Gedraaid onder HOEK en verschoven naar RD.

Uitvoer (in deze map):
  straat_gevels.pts        puntenwolk, x y z i r g b
  bgt_panden.geojson       de panden als BGT-vlakken (laag 'pand')
  ruwe_lijn.geojson        een ruw getrokken lijn over het midden van de straat
  verwacht.csv             per boom: kant, afstand kroon tot voorgevel, snoeipunt rood/oranje/nee bij D = 2 m, marge 0,5 m

Gebruik: python maak_testdata.py   (Python + numpy)
"""
import json
import os
import numpy as np

rng = np.random.default_rng(11)
HIER = os.path.dirname(os.path.abspath(__file__))
X0, Y0, HOEK = 150820.0, 411760.0, np.radians(14)
MV = 3.20          # maaiveld m NAP
D = 2.0            # vrije ruimte voor de gevel waarvoor verwacht.csv is gemaakt
MARGE = 0.5        # snoeimarge (standaard in de viewer): begroeiing tussen D en D + MARGE wordt oranje


def naar_rd(u, v):
    return X0 + u * np.cos(HOEK) - v * np.sin(HOEK), Y0 + u * np.sin(HOEK) + v * np.cos(HOEK)


def maaiveld(u, v):
    z = MV + 0.004 * u + 0.03 * np.sin(u / 7)
    z = z + np.where(np.abs(v) < 3.0, -0.12 + 0.02 * (1 - (v / 3.0) ** 2), 0.0)   # rijbaan iets lager, bolling
    return z


P = []   # (u, v, z, r, g, b)


def voeg(u, v, z, kleur, ruis=8):
    u = np.atleast_1d(np.asarray(u, float)); n = u.size
    k = np.tile(np.array(kleur, float), (n, 1)) + rng.normal(0, ruis, (n, 3))
    P.append(np.c_[u, np.broadcast_to(v, n), np.broadcast_to(z, n), np.clip(k, 0, 255)])


# panden: (u0, u1, voorgevel |v|, kant) — kant +1 noord, -1 zuid; diepte 10 m
PANDEN = [
    (5, 17, 8.0, +1), (17, 29, 9.0, +1), (33, 47, 8.0, +1), (47, 59, 8.5, +1), (64, 80, 8.0, +1),
    (8, 22, 8.0, -1), (22, 36, 8.0, -1), (42, 58, 8.5, -1), (58, 76, 8.0, -1),
]
DIEPTE, GOOT, NOK = 10.0, 6.0, 9.5


def in_pand(u, v):
    m = np.zeros(np.shape(u), bool)
    for u0, u1, voor, kant in PANDEN:
        vv = v * kant
        m |= (u > u0) & (u < u1) & (vv > voor) & (vv < voor + DIEPTE)
    return m


# maaiveld: rijbaan, stoep, voortuin (niet binnen de panden)
u = np.arange(-6, 88, 0.25); v = np.arange(-20, 20.01, 0.25)
U, V = np.meshgrid(u, v); U = U.ravel() + rng.uniform(-0.05, 0.05, U.size); V = V.ravel() + rng.uniform(-0.05, 0.05, V.size)
U, V = U[~in_pand(U, V)], V[~in_pand(U, V)]
Z = maaiveld(U, V) + rng.normal(0, 0.012, U.size)
rij = np.abs(V) < 3.0; stoep = (np.abs(V) >= 3.0) & (np.abs(V) < 5.0); tuin = ~rij & ~stoep
voeg(U[rij], V[rij], Z[rij], (78, 80, 84))
voeg(U[stoep], V[stoep], Z[stoep] + 0.12, (168, 160, 150))
voeg(U[tuin], V[tuin], Z[tuin] + 0.05, (98, 142, 70))
# belijning: kantstreep op 2,8 m
for vk in (-2.8, 2.8):
    m = np.abs(V - vk) < 0.06
    voeg(U[m], V[m], Z[m] + 0.005, (235, 235, 230), 4)

# panden: gevels (voor, zij, achter) en een zadeldak; de punten liggen net binnen het BGT-vlak
for u0, u1, voor, kant in PANDEN:
    zb = maaiveld(np.array([u0]), np.array([voor * kant]))[0]
    hs = np.arange(0.0, GOOT, 0.2)
    steen = (150, 72, 52) if (u0 // 10) % 2 else (176, 140, 110)
    uu = np.arange(u0 + 0.05, u1 - 0.05, 0.2)
    UU, HH = np.meshgrid(uu, hs)
    for vg in (voor + 0.03, voor + DIEPTE - 0.03):                    # voor- en achtergevel
        voeg(UU.ravel(), vg * kant, zb + HH.ravel(), steen)
    # ramen en deur in de voorgevel iets donkerder (alleen kleur)
    vv = np.arange(voor + 0.05, voor + DIEPTE - 0.05, 0.2)
    VV, HH2 = np.meshgrid(vv, hs)
    for ug in (u0 + 0.03, u1 - 0.03):                                    # zijgevels
        voeg(np.full(VV.size, ug), VV.ravel() * kant, zb + HH2.ravel(), steen)
    DU, DV = np.meshgrid(uu, vv)                                         # dak, nok halverwege de diepte
    t = np.abs(DV - (voor + DIEPTE / 2)) / (DIEPTE / 2)
    voeg(DU.ravel(), DV.ravel() * kant, zb + NOK - (NOK - GOOT) * t.ravel(), (64, 58, 60))

# bomen: (u, kant, afstand kroonrand tot voorgevel e). Kroon: bol r = 1,5 m, midden 4,5 m boven maaiveld
R, KM = 1.5, 4.5
BOMEN = [
    ('N1', 11, +1, 0.8), ('N2', 23, +1, 1.5), ('N3', 31, +1, 1.0), ('N4', 40, +1, 2.6), ('N5', 53, +1, 1.8), ('N6', 72, +1, 3.5),
    ('Z1', 15, -1, 1.2), ('Z2', 29, -1, 2.4), ('Z3', 39, -1, 0.7), ('Z4', 50, -1, 0.5), ('Z5', 68, -1, 3.0),
]


def voorgevel_bij(ub, kant):
    for u0, u1, voor, k in PANDEN:
        if k == kant and u0 < ub < u1:
            return voor
    return None


rijen = []
for naam, ub, kant, e in BOMEN:
    voor = voorgevel_bij(ub, kant)
    ref = voor if voor is not None else 8.0            # in een gat: afstand t.o.v. de rooilijn 8 m
    vb = (ref - e - R) * kant
    zg = maaiveld(np.array([ub]), np.array([vb]))[0]
    zz = np.arange(zg, zg + KM - 0.6, 0.06); a = rng.uniform(0, 2 * np.pi, zz.size * 6)
    voeg(ub + 0.18 * np.cos(a), vb + 0.18 * np.sin(a), np.repeat(zz, 6), (92, 70, 52))
    n = 3000; q = rng.normal(0, 1, (n, 3)); q /= np.linalg.norm(q, axis=1)[:, None]
    q *= R * rng.uniform(0.75, 1.0, n)[:, None] ** (1 / 3)
    voeg(ub + q[:, 0], vb + q[:, 1], zg + KM + q[:, 2], (58, 118, 46), 14)
    in_gat = voor is None
    snoei = 'nee' if in_gat or e >= D + MARGE else ('rood' if e < D else 'oranje')
    bx, by = naar_rd(ub, vb)
    rijen.append((naam, 'noord' if kant > 0 else 'zuid', f'{bx:.2f}', f'{by:.2f}', 'gat tussen twee panden' if in_gat else f'voorgevel op {voor:g} m'.replace('.', ','), e,
                  snoei))

# lantaarnpalen op de stoep (4 m van de as, dus ver buiten 2 m van de gevel)
for ul, kant in ((20, +1), (55, +1), (35, -1), (70, -1)):
    zz = np.arange(0, 6.0, 0.05); a = rng.uniform(0, 2 * np.pi, zz.size * 4)
    voeg(ul + 0.07 * np.cos(a), 4.2 * kant + 0.07 * np.sin(a), maaiveld(np.array([ul]), np.array([4.2 * kant]))[0] + np.repeat(zz, 4), (120, 124, 128), 4)

A = np.vstack(P)
x, y = naar_rd(A[:, 0], A[:, 1])
inten = np.zeros(len(A), int)
with open(os.path.join(HIER, 'straat_gevels.pts'), 'w', newline='\n') as f:
    f.write(f'{len(A)}\n')
    np.savetxt(f, np.c_[x, y, A[:, 2], inten, A[:, 3:6].round()], fmt=['%.3f', '%.3f', '%.3f', '%d', '%d', '%d', '%d'])


def ring(u0, u1, v0, v1):
    pts = [(u0, v0), (u1, v0), (u1, v1), (u0, v1), (u0, v0)]
    return [[round(c, 3) for c in naar_rd(pu, pv)] for pu, pv in pts]


bgt = {'type': 'FeatureCollection', 'features': [
    {'type': 'Feature', 'properties': {'bgtlaag': 'pand', 'naam': f'pand {i + 1}'},
     'geometry': {'type': 'Polygon', 'coordinates': [ring(u0, u1, voor * kant, (voor + DIEPTE) * kant)]}}
    for i, (u0, u1, voor, kant) in enumerate(PANDEN)]}
json.dump(bgt, open(os.path.join(HIER, 'bgt_panden.geojson'), 'w'), indent=1)

lijn = [naar_rd(uu, 0.4 * np.sin(uu / 25)) for uu in (-2, 20, 42, 64, 84)]
json.dump({'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'naam': 'Gevelstraat'},
           'geometry': {'type': 'LineString', 'coordinates': [[round(px, 3), round(py, 3)] for px, py in lijn]}}]},
          open(os.path.join(HIER, 'ruwe_lijn.geojson'), 'w'), indent=1)

with open(os.path.join(HIER, 'verwacht.csv'), 'w', newline='\n', encoding='utf-8') as f:
    f.write('boom;kant;x stam (RD);y stam (RD);waar;kroonrand tot voorgevel (m);snoeipunt bij D = 2 m en marge 0,5 m (rood, oranje of nee)\n')
    for r in rijen:
        f.write(';'.join(str(c).replace('.', ',') if isinstance(c, float) else str(c) for c in r) + '\n')

print(f'{len(A):,} punten'.replace(',', '.'), '| bomen:', ', '.join(f"{r[0]} {r[6]}" for r in rijen))
