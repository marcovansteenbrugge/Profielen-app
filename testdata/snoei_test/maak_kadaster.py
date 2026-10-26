"""Fictieve kadastrale percelen (zelfde opbouw als de PDOK BRK kadastrale kaart) voor de testset bospad."""
import numpy as np, json
X0, Y0, HOEK = 162400.0, 394300.0, np.radians(20)
def naar_rd(u, v): return X0 + u*np.cos(HOEK) + v*np.sin(HOEK), Y0 + u*np.sin(HOEK) - v*np.cos(HOEK)
def pad_v(u): return 1.2*np.sin(u/38.0)
def vlak(u0, u1, w0, w1):
    """perceel tussen station u0..u1 en dwarsafstand w0..w1 t.o.v. het hart van het pad (volgt de bocht)"""
    us = list(np.arange(u0, u1, 2.5)) + [u1]
    rand1 = [(u, pad_v(u) + w0) for u in us]; rand2 = [(u, pad_v(u) + w1) for u in reversed(us)]
    ring = rand1 + rand2 + [rand1[0]]
    return [[round(float(x), 3), round(float(y), 3)] for x, y in (naar_rd(u, v) for u, v in ring)]
F = []
def perceel(nr, ring, grootte):
    F.append({"type": "Feature", "geometry": {"type": "MultiPolygon", "coordinates": [[ring]]},
              "properties": {"akr_kadastrale_gemeente_code_waarde": "TST00", "kadastrale_gemeente_waarde": "Testgemeente", "sectie": "K",
                             "perceelnummer": nr, "kadastrale_grootte_waarde": grootte, "status_historie_waarde": "Geldig"}})
perceel(1000, vlak(-8, 158, -1.6, 1.6), 530)                       # het pad zelf
for nr, (a, b) in zip(range(101, 107), [(-8, 20), (20, 45), (45, 70), (70, 100), (100, 130), (130, 158)]):
    perceel(nr, vlak(a, b, -12, -1.6), int((b - a) * 10.4))         # links: tuinen/bosperceel met de bomenrij
for nr, (a, b) in zip(range(201, 204), [(-8, 50), (50, 105), (105, 158)]):
    perceel(nr, vlak(a, b, 1.6, 12), int((b - a) * 10.4))          # rechts
json.dump({"type": "FeatureCollection", "numberReturned": len(F), "features": F, "links": []}, open('/home/claude/pv/snoei_test/kadaster_percelen.geojson', 'w'))
print(len(F), 'percelen')
