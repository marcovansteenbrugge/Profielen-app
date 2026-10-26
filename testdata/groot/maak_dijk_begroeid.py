import numpy as np, laspy, json
rng=np.random.default_rng(3)
N=3_000_000; Lng=300.0; B=50.0
s=rng.uniform(0,Lng,N); o=rng.uniform(-B/2,B/2,N)
z=np.interp(o,[-25,-14,-11,-2.5,2.5,11,14,25],[0.3,0.4,1.4,4.2,4.2,1.4,0.9,0.5])
k=np.abs(o)<3.4; z=np.where(k,4.45-o**2/(2*6.0),z)+rng.normal(0,0.01,N)
kl=np.full(N,2,np.uint8)
# begroeiing: riet/struiken op het buitentalud (o -12..-6) en gras op de kruin
veg=((o>-12)&(o<-6)&(rng.random(N)<0.55)); z[veg]+=rng.uniform(0.2,1.6,veg.sum()); kl[veg]=4
gras=((np.abs(o)<3)&(rng.random(N)<0.35)); z[gras]+=rng.uniform(0.05,0.25,gras.sum()); kl[gras]=3
a=np.radians(30); x0,y0=82000.0,389000.0; ux,uy=np.cos(a),np.sin(a); nx,ny=-uy,ux
h=laspy.LasHeader(point_format=2,version='1.2'); h.offsets=[x0,y0,0]; h.scales=[0.001]*3
las=laspy.LasData(h); las.x=x0+s*ux+o*nx; las.y=y0+s*uy+o*ny; las.z=z; las.classification=kl
g=np.where(kl==2,120,90).astype(np.uint16); las.red=g*200; las.green=np.where(kl==2,140,170).astype(np.uint16)*256; las.blue=g*120
las.write('dijk_begroeid.las')
json.dump({"type":"FeatureCollection","features":[{"type":"Feature","properties":{"naam":"As"},"geometry":{"type":"LineString","coordinates":[[x0+10*ux,y0+10*uy],[x0+290*ux,y0+290*uy]]}}]},open('as_begroeid.geojson','w'))
print('ok', veg.sum(), gras.sum())
