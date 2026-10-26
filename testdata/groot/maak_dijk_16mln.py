import numpy as np, laspy, json
rng=np.random.default_rng(7)
N=16_000_000; Lng=1500.0; B=70.0
s=rng.uniform(0,Lng,N); o=rng.uniform(-B/2,B/2,N)
def doorsnede(o, s):
    # ronde kruin: straal 6 m tussen -2.5 en 2.5, taluds 1:3, berm, sloot en greppel
    z=np.interp(o,[-35,-24,-22.6,-21.4,-20,-14,-11,-2.5,2.5,11,16,22,35],[0.1,0.1,-1.0,-1.0,0.15,0.4,1.4,4.2,4.2,1.4,0.9,0.5,0.5])
    k=np.abs(o)<3.4; z=np.where(k, 4.45-o**2/(2*6.0)+0*s, z)          # ronde kruin (straal 6 m)
    z=z-np.where((o>13.0)&(o<13.4),0.15*np.sin(np.pi*(o-13.0)/0.4),0)  # greppel 40 cm
    z=z+0.05*np.sin(s/37.0)                                          # langzame golving langs de dijk
    return z
z=doorsnede(o,s)+rng.normal(0,0.01,N)
a=np.radians(30); x0,y0=81000.0,389500.0
ux,uy=np.cos(a),np.sin(a); nx,ny=-uy,ux
x=x0+s*ux+o*nx; y=y0+s*uy+o*ny
h=laspy.LasHeader(point_format=2, version='1.2'); h.offsets=[x0,y0,0]; h.scales=[0.001,0.001,0.001]
las=laspy.LasData(h); las.x=x; las.y=y; las.z=z
g=np.clip(110+40*(z/4.5)+rng.normal(0,12,N),0,255).astype(np.uint16)
las.red=(g*0.55).astype(np.uint16)*256; las.green=g*256; las.blue=(g*0.35).astype(np.uint16)*256
las.classification=np.full(N,2,np.uint8)
las.write('dijk_16mln.las')
json.dump({"type":"FeatureCollection","features":[{"type":"Feature","properties":{"naam":"As dijk"},"geometry":{"type":"LineString","coordinates":[[x0+20*ux,y0+20*uy],[x0+1480*ux,y0+1480*uy]]}}]},open('as_dijk.geojson','w'))
print('ok')
