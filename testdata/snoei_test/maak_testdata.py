"""Synthetische testset 'bospad met bomenrij' (RD/NAP) voor de snoeicheck.
Pad loopt langs de lokale u-as (licht gebogen), v = dwars (+ = rechts van de looprichting).
Bomenrij links van het pad; een paar extra situaties: lage tak, struik op de padrand,
boom in de snoeimarge, stuk helling, sloot rechts, wat losse punten (ruis)."""
import numpy as np, json
rng = np.random.default_rng(7)
X0, Y0, HOEK = 162400.0, 394300.0, np.radians(20)
def naar_rd(u, v):   # v positief = rechts van de looprichting (u oplopend)
    return X0 + u*np.cos(HOEK) + v*np.sin(HOEK), Y0 + u*np.sin(HOEK) - v*np.cos(HOEK)
def pad_v(u):        # hart van het pad (lichte bocht)
    return 1.2*np.sin(u/38.0)
def maaiveld(u, v):
    z = 3.00 + 0.006*u + 0.08*np.sin(u/9) + 0.05*np.cos(v/3)
    z += 1.40/(1+np.exp(-(u-100)/6))                     # helling tussen st. 85 en 115
    w = v - pad_v(u)
    z += np.where(np.abs(w) < 0.95, 0.06, 0)             # halfverharding iets hoger
    z -= 0.65*np.exp(-((w-4.6)/0.55)**2)                 # sloot rechts
    return z
P = []   # (u, v, z, r, g, b)
def voeg(u, v, z, kleur):
    u = np.atleast_1d(u); n = u.size
    k = np.tile(np.array(kleur, float), (n, 1)) + rng.normal(0, 8, (n, 3))
    P.append(np.c_[u, np.broadcast_to(v, n), np.broadcast_to(z, n), np.clip(k, 0, 255)])
# maaiveld + pad
u = np.arange(-5, 155, 0.2); v = np.arange(-9, 9.01, 0.2)
U, V = np.meshgrid(u, v); U = U.ravel(); V = V.ravel()
U = U + rng.uniform(-0.08, 0.08, U.size); V = V + rng.uniform(-0.08, 0.08, V.size)
Z = maaiveld(U, V) + rng.normal(0, 0.015, U.size)
op = np.abs(V - pad_v(U)) < 0.95
voeg(U[op], V[op], Z[op], (188, 172, 140)); voeg(U[~op], V[~op], Z[~op], (112, 98, 70))
# gras / strooisel naast het pad (laag, moet genegeerd worden)
n = 14000; gu = rng.uniform(-5, 155, n); gv = rng.uniform(-9, 9, n)
naast = np.abs(gv - pad_v(gu)) > 1.1
gu, gv = gu[naast], gv[naast]
voeg(gu, gv, maaiveld(gu, gv) + rng.uniform(0.02, 0.22, gu.size), (96, 140, 64))

def boom(ut, vt, kroonbasis, kroonH, schuif, ru, rv, stam_r=0.25, n=3200, hoek_l=0.0):
    zg = maaiveld(np.array([ut]), np.array([vt]))[0]
    # stam
    zz = np.arange(zg, zg + kroonbasis + 0.6, 0.06); a = rng.uniform(0, 2*np.pi, zz.size*6)
    zs = np.repeat(zz, 6)
    voeg(ut + stam_r*np.cos(a), vt + stam_r*np.sin(a), zs, (88, 64, 44))
    # kroon: ellipsoïde (verschoven richting het pad), meer punten aan de buitenkant
    cu, cv, cz = ut, vt + schuif, zg + kroonbasis + kroonH/2
    m = rng.normal(size=(n, 3)); m /= np.linalg.norm(m, axis=1)[:, None]
    r = rng.uniform(0.55, 1.0, n)**0.5
    ku = cu + m[:, 0]*ru*r; kv = cv + m[:, 1]*rv*r; kz = cz + m[:, 2]*(kroonH/2)*r
    voeg(ku, kv, kz, (70, 120, 52))
    return zg
# bomenrij links (stam op v ≈ -3,3); kroonbasis wisselt: lage kronen hangen in het profiel
bomen = [  # u, kroonbasis, kroonhoogte, schuif naar het pad, ru, rv
    (4, 3.6, 5.0, 1.2, 3.0, 2.8), (13, 2.1, 5.5, 2.0, 3.2, 3.2), (22, 3.4, 5.0, 1.0, 3.0, 2.6),
    (31, 3.8, 5.0, 0.8, 3.0, 2.6), (40, 2.0, 5.2, 2.2, 3.3, 3.3), (49, 3.9, 4.6, 0.6, 2.8, 2.5),
    (58, 3.5, 5.0, 1.0, 2.9, 2.6), (67, 1.9, 5.8, 2.4, 3.4, 3.4), (76, 3.7, 4.8, 0.9, 2.9, 2.6),
    (85, 3.2, 5.0, 1.4, 3.0, 2.8), (94, 2.3, 5.4, 2.1, 3.1, 3.1), (103, 3.8, 4.6, 0.7, 2.8, 2.5),
    (112, 3.6, 5.0, 1.1, 2.9, 2.7), (121, 2.2, 5.6, 2.3, 3.2, 3.3), (130, 3.9, 4.6, 0.6, 2.8, 2.4),
    (139, 3.4, 5.0, 1.2, 3.0, 2.7), (148, 2.4, 5.2, 2.0, 3.1, 3.0),
]
for ut, kb, kh, sch, ru, rv in bomen:
    vt = pad_v(ut) - 3.3 + rng.uniform(-0.25, 0.25)
    boom(ut, vt, kb, kh, sch, ru, rv)
# bomen verder weg rechts (achter de sloot): geen conflict
for ut in (10, 35, 63, 88, 140):
    boom(ut, pad_v(ut) + 7.2, 3.0, 5.5, -0.5, 2.6, 2.4)
# lage tak bij st. ≈ 27: van de stam links schuin omlaag tot over het pad
ut0 = 27.0; t = np.linspace(0, 1, 260)
tu = ut0 + 0.6*t + rng.normal(0, 0.04, t.size); tv = pad_v(ut0) - 3.3 + 3.9*t + rng.normal(0, 0.04, t.size)
tz = maaiveld(np.array([ut0]), np.array([pad_v(ut0)]))[0] + 2.9 - 1.05*t + rng.normal(0, 0.04, t.size)
voeg(tu, tv, tz, (92, 70, 48))
# blad aan het eind van de tak
n = 500; m = rng.normal(size=(n, 3)) * [0.5, 0.45, 0.3]
voeg(ut0 + 0.6 + m[:, 0], pad_v(ut0) + 0.5 + m[:, 1], tz[-1] + m[:, 2], (74, 124, 56))
# struik op de rechter padrand bij st. ≈ 58 (vanaf de grond)
n = 1500; m = rng.normal(size=(n, 3)); m /= np.linalg.norm(m, axis=1)[:, None]; r = rng.uniform(0.4, 1, n)**0.5
su, sv = 58.0, pad_v(58.0) + 1.65
sz = maaiveld(np.array([su]), np.array([sv]))[0]
voeg(su + m[:, 0]*1.1*r, sv + m[:, 1]*0.9*r, sz + 0.85 + m[:, 2]*0.75*r, (82, 132, 60))
# jonge boom rechts in de snoeimarge bij st. ≈ 118 (stam op 1,3 m van het hart)
boom(118.0, pad_v(118.0) + 1.30, 2.9, 3.2, 0.3, 1.3, 1.1, stam_r=0.09, n=900)
# ruis: een paar losse punten (vogel, vlieg) in het profiel — moeten genegeerd worden
for uu in (45.0, 82.0, 133.0):
    voeg(np.array([uu]), np.array([pad_v(uu) + 0.2]), maaiveld(np.array([uu]), np.array([pad_v(uu)])) + 1.7, (40, 40, 40))

A = np.vstack(P)
x, y = naar_rd(A[:, 0], A[:, 1])
with open('/home/claude/pv/snoei_test/bospad_scan.pts', 'w') as f:
    f.write(f'{len(A)}\n')
    for xi, yi, zi, r, g, b in zip(x, y, A[:, 2], A[:, 3], A[:, 4], A[:, 5]):
        f.write(f'{xi:.3f} {yi:.3f} {zi:.3f} 0 {int(r)} {int(g)} {int(b)}\n')
# as van het pad (zoals je hem zou tekenen: elke 5 m een punt)
uu = np.arange(0, 150.01, 5.0); ax, ay = naar_rd(uu, pad_v(uu))
gj = {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:EPSG::28992"}},
      "features": [{"type": "Feature", "properties": {"naam": "As schouwpad"}, "geometry": {"type": "LineString", "coordinates": [[round(a, 3), round(b, 3)] for a, b in zip(ax, ay)]}}]}
json.dump(gj, open('/home/claude/pv/snoei_test/as_schouwpad.geojson', 'w'))
print(len(A), 'punten')
