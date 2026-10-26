import numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Rectangle, PathPatch
from matplotlib.path import Path
plt.rcParams['font.family'] = 'DejaVu Sans'
X0, Y0, Hk = 151200.0, 411650.0, np.radians(30)
def lees(f):
    a = np.loadtxt(f, skiprows=1, usecols=(0,1,2)); dx, dy = a[:,0]-X0, a[:,1]-Y0
    return dx*np.cos(Hk)+dy*np.sin(Hk), -dx*np.sin(Hk)+dy*np.cos(Hk), a[:,2]
b, o, t = lees('bodem_multibeam.pts'), lees('brug_onderzijde.pts'), lees('brug_bovenzijde.pts')
P, H, B, D, PD = 1.10, 4.5, 20.0, 3.0, 0.40
INK, GRIJS, ROOD, WATER = '#1B2A38', '#6B7A8C', '#C6472B', '#2F7FB5'
def maat_h(ax, x0, x1, y, tekst, kl=INK, boven=True):   # horizontale maatlijn met schuine streepjes (CAD)
    ax.plot([x0, x1], [y, y], color=kl, lw=0.7)
    for x in (x0, x1):
        ax.plot([x-0.25, x+0.25], [y-0.25, y+0.25], color=kl, lw=1.1); ax.plot([x, x], [y-0.35, y+0.35], color=kl, lw=0.5)
    ax.text((x0+x1)/2, y+(0.15 if boven else -0.25), tekst, ha='center', va='bottom' if boven else 'top', fontsize=7.5, color=kl)
def maat_v(ax, x, y0, y1, tekst, kl=INK, links=False):
    ax.plot([x, x], [y0, y1], color=kl, lw=0.7)
    for y in (y0, y1):
        ax.plot([x-0.25, x+0.25], [y-0.25, y+0.25], color=kl, lw=1.1); ax.plot([x-0.35, x+0.35], [y, y], color=kl, lw=0.5)
    ax.text(x+(-0.35 if links else 0.35), (y0+y1)/2, tekst, rotation=90, ha='right' if links else 'left', va='center', fontsize=7.5, color=kl)
def peil(ax, x, y, tekst, kl):
    ax.plot([x-0.45, x+0.45, x, x-0.45], [y+0.55, y+0.55, y, y+0.55], color=kl, lw=0.8)
    ax.text(x+0.7, y+0.12, tekst, fontsize=7.5, color=kl, va='bottom')
def arcering(ax, poly, kl, dicht=0.45):
    ax.add_patch(Polygon(poly, closed=True, fc='none', ec=kl, lw=0, hatch='////', alpha=.7))

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(15, 12), dpi=110, gridspec_kw={'height_ratios': [1, 1]})
# ───────── DWARSPROFIEL (maatgevend) ─────────
ax = ax1
m = np.abs(b[0]) < 6.5
vv, zz = b[1][m], b[2][m]
bins = np.round(vv*4)/4; ub = np.unique(bins); bod = np.array([zz[bins == u].max() for u in ub])
ax.fill_between(ub, -4.2, bod, color='#E6E2DA', lw=0); ax.plot(ub, bod, color=INK, lw=1.3)
mo = (np.abs(o[0]) <= 6)
ov, oz = o[1][mo], o[2][mo]; ob = np.round(ov*4)/4; uo = np.unique(ob); onder = np.array([oz[ob == u].min() for u in uo])
deck = np.array([t[2][(np.abs(t[0])<=6) & (np.round(t[1]*4)/4 == u)].max() if np.any((np.abs(t[0])<=6) & (np.round(t[1]*4)/4 == u)) else np.nan for u in uo])
ax.fill_between(uo, onder, deck, color='#D5DADF', lw=0); ax.plot(uo, onder, color=INK, lw=1.2); ax.plot(uo, deck, color=INK, lw=1.0)
wm = (bod < PD); ax.fill_between(ub, bod, PD, where=bod < PD, color='#DCEBF5', lw=0)
ax.plot([-27, 27], [PD, PD], color=WATER, lw=0.8); ax.plot([-27, 27], [P, P], color=WATER, lw=0.8, ls=(0, (6, 3)))
peil(ax, -24, P, 'MHW (toetswaterstand) +1,10', WATER); peil(ax, -24, PD, 'streefpeil +0,40', WATER)
# doorvaartprofiel
ax.add_patch(Rectangle((-B/2, P), B, H, fill=False, ec=INK, lw=1.0, ls=(0, (8, 3, 2, 3))))
ax.add_patch(Rectangle((-B/2, PD-D), B, D, fill=False, ec=INK, lw=0.8, ls=(0, (3, 3))))
# schip: lijnwerk, vooraanzicht (motorvrachtschip), 11,40 m breed
bs, kiel, dek = 11.4/2, PD-D, P+0.85
romp = [(-bs, dek), (-bs, kiel+0.6), (-bs+0.15, kiel+0.2), (-bs+0.6, kiel), (bs-0.6, kiel), (bs-0.15, kiel+0.2), (bs, kiel+0.6), (bs, dek)]
ax.add_patch(Polygon(romp, closed=False, fill=False, ec=GRIJS, lw=1.1))
ax.plot([-bs-0.15, bs+0.15], [dek, dek], color=GRIJS, lw=1.1)
ax.add_patch(Rectangle((-bs+0.5, dek), 2*bs-1.0, 0.9, fill=False, ec=GRIJS, lw=0.9))     # luikhoofden
ax.add_patch(Rectangle((-2.6, dek+0.9), 5.2, 2.2, fill=False, ec=GRIJS, lw=0.9))        # stuurhuis
for xx in (-1.8, -0.6, 0.6, 1.8): ax.add_patch(Rectangle((xx-0.4, dek+2.3), 0.8, 0.5, fill=False, ec=GRIJS, lw=0.6))
ax.plot([0, 0], [dek+3.1, P+H-0.05], color=GRIJS, lw=0.9); ax.plot([-0.8, 0.8], [P+H-0.6, P+H-0.6], color=GRIJS, lw=0.9)
# maatvoering
maat_h(ax, -B/2, B/2, P+H+1.6, 'doorvaartbreedte 20,00')
maat_v(ax, B/2+1.2, P, P+H, 'doorvaarthoogte 4,50')
maat_v(ax, B/2+1.2, PD-D, PD, 'diepgang 3,00')
maat_h(ax, -bs, bs, kiel-0.7, 'scheepsbreedte 11,40', kl=GRIJS, boven=False)
# conflicten
ax.add_patch(Rectangle((8.0, 4.90), 2.0, P+H-4.90, fill=False, ec=ROOD, lw=1.4))
ax.add_patch(Rectangle((8.0, 4.90), 2.0, P+H-4.90, fill=False, ec=ROOD, lw=0, hatch='xxxx'))
ax.annotate('leiding +4,90: tekort 0,70 m', (9, 4.9), (13.5, 3.1), fontsize=8, color=ROOD, arrowprops=dict(arrowstyle='-', color=ROOD, lw=0.8))
ax.set_xlim(-28, 28); ax.set_ylim(-4.2, 9.3); ax.set_aspect('equal')
ax.set_title('Dwarsprofiel doorvaart (maatgevend over st. 34–66)  ·  1:300', loc='left', fontsize=10, color=INK, fontweight='bold')
for s in ('top', 'right'): ax.spines[s].set_visible(False)
ax.tick_params(labelsize=8, colors=GRIJS); ax.set_ylabel('m NAP', fontsize=8, color=GRIJS)
ax.grid(color='#EEF1F4', lw=0.6)
# ───────── LENGTEPROFIEL (zijaanzicht) ─────────
ax = ax2
m = np.abs(b[1]) < 0.26; uu, zz = b[0][m], b[2][m]; idx = np.argsort(uu)
ax.fill_between(uu[idx], -4.2, zz[idx], color='#E6E2DA', lw=0); ax.plot(uu[idx], zz[idx], color=INK, lw=1.3)
mo = np.abs(o[1]) < 0.06; idx = np.argsort(o[0][mo]); ax.plot(o[0][mo][idx], o[2][mo][idx], color=INK, lw=1.0)
mt = np.abs(t[1]) < 0.13; idx = np.argsort(t[0][mt]); ax.plot(t[0][mt][idx], t[2][mt][idx], color=INK, lw=0.9)
ax.fill_between([-6, 6], 5.65, 7.25, color='#D5DADF', lw=0)
ax.fill_between([-30, 30], -3.25, PD, color='#DCEBF5', lw=0)
ax.plot([-30, 30], [PD, PD], color=WATER, lw=0.8); ax.plot([-30, 30], [P, P], color=WATER, lw=0.8, ls=(0, (6, 3)))
peil(ax, -28, P, 'MHW +1,10', WATER); peil(ax, -28, PD, 'streefpeil +0,40', WATER)
ax.add_patch(Rectangle((-16, P), 32, H, fill=False, ec=INK, lw=1.0, ls=(0, (8, 3, 2, 3))))
# schip zijaanzicht, 30 m (deel van een 110 m schip zou buiten beeld vallen; hier compact)
L0, L1, kiel, dek = -15.0, 15.0, PD-D, P+0.85
romp = [(L0, dek+0.25), (L0, kiel+0.9), (L0+1.2, kiel), (L1-3.5, kiel), (L1-0.8, kiel+1.2), (L1+0.4, dek+0.55)]
ax.add_patch(Polygon(romp, closed=False, fill=False, ec=GRIJS, lw=1.1))
ax.plot([L0, L1+0.4], [dek+0.25, dek+0.55], color=GRIJS, lw=1.1)
ax.add_patch(Rectangle((L0+6, dek+0.3), 19, 0.9, fill=False, ec=GRIJS, lw=0.9))          # luikhoofd
ax.add_patch(Rectangle((L0+0.8, dek+0.3), 4.2, 2.6, fill=False, ec=GRIJS, lw=0.9))       # stuurhuis
for xx in (L0+1.3, L0+2.5, L0+3.7): ax.add_patch(Rectangle((xx, dek+2.1), 0.9, 0.5, fill=False, ec=GRIJS, lw=0.6))
ax.plot([L0+2.9, L0+2.9], [dek+2.9, P+H-0.05], color=GRIJS, lw=0.9)
ax.plot([L0+2.3, L0+3.5], [P+H-0.5, P+H-0.5], color=GRIJS, lw=0.9)
ax.plot([L1-1.0, L1-1.0], [dek+0.55, dek+1.9], color=GRIJS, lw=0.8)                      # voormast
maat_v(ax, 17.2, P, P+H, 'doorvaarthoogte 4,50'); maat_v(ax, 17.2, PD-D, PD, 'diepgang 3,00')
maat_h(ax, -6, 6, 8.3, 'brug st. 44–56')
maat_v(ax, L0+2.9-0.9, P, 4.04+1.0, 'vrij 3,80 (kritiek)', kl=ROOD, links=True)
ax.set_xlim(-30, 30); ax.set_ylim(-4.2, 9.3); ax.set_aspect(2.0)
ax.set_title('Lengteprofiel doorvaart (over de as)  ·  hor. 1:300, vert. 2×', loc='left', fontsize=10, color=INK, fontweight='bold')
for s in ('top', 'right'): ax.spines[s].set_visible(False)
ax.tick_params(labelsize=8, colors=GRIJS); ax.set_ylabel('m NAP', fontsize=8, color=GRIJS); ax.grid(color='#EEF1F4', lw=0.6)
fig.tight_layout(); fig.savefig('/home/claude/pv/schets_doorvaart_professioneel.png')
