# Maakt dijk_begroeid.laz uit dijk_begroeid.las (zelfde punten, LAZ met vaste chunk-grootte),
# voor de LAZ-proef en -tests (plan omzetten-in-exe, F4/F5). Python + laspy + lazrs; in deze map draaien.
# Optioneel: python maak_laz.py <bron.las> <doel.laz>
import sys, laspy
bron = sys.argv[1] if len(sys.argv) > 1 else 'dijk_begroeid.las'
doel = sys.argv[2] if len(sys.argv) > 2 else 'dijk_begroeid.laz'
las = laspy.read(bron)
las.write(doel, do_compress=True, laz_backend=laspy.LazBackend.LazrsParallel)
k = laspy.read(doel)
print(doel, 'punten', len(k.points), 'formaat', k.header.point_format.id, 'versie', k.header.version, 'gelijk', bool((k.X == las.X).all() and (k.Y == las.Y).all() and (k.Z == las.Z).all()))
