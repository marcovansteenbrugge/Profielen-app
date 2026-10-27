// Package omzet zet een puntenwolk om naar vakken (formaat pv-tegels-1), precies zoals
// de viewer dat doet (viewer.js: maakTegelSchrijver, maakUitdunner, dunUit). Plan
// omzetten-in-exe, besluit B2: de uitkomst is byte voor byte gelijk aan die van de viewer.
//
// Daarom zijn de rekenstappen hier een letterlijke vertaling van de JavaScript:
//   - afronden zoals Math.round (halve waarden naar boven, ook bij negatieve getallen);
//   - geen samengevoegde vermenigvuldig-en-optel (FMA): elke tussenuitkomst wordt
//     afgerond zoals in JavaScript (float64(a*b) + c);
//   - dezelfde hashfunctie (Math.imul) en dezelfde volgorde.
package omzet

import (
	"math"
	"runtime"
	"sync"
)

// rond is Math.round van JavaScript: dichtstbijzijnde gehele getal, een halve waarde naar
// boven (-2,5 → -2). Niet math.Round (van nul af) en ook niet math.Floor(v+0.5) (wijkt af
// bij 0,49999999999999994).
func rond(v float64) float64 {
	r := math.Floor(v)
	if v-r >= 0.5 {
		r++
	}
	return r
}

// naarInt32 is de ToInt32 van JavaScript (zoals DataView.setInt32 doet): afkappen en
// rondlopen binnen 32 bits.
func naarInt32(v float64) int32 {
	if v >= math.MinInt32 && v <= math.MaxInt32 { // het gewone geval: geen rondlopen nodig
		return int32(v)
	}
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return int32(uint32(int64(math.Trunc(math.Mod(v, 4294967296)))))
}

// celHash: hash van een cel (i, j) voor de hashtabellen hieronder. De viewer gebruikt
// Math.imul(i ^ Math.imul(j, 0x85EBCA77), 0x9E3779B1); welk punt per cel overblijft en in
// welke volgorde hangt daar niet van af (alleen van de cel en de punten), dus hier een
// hash die beter verspreidt (splitmix64): bij de hash van de viewer geeft een raster lange
// ketens van botsingen, en dat was driekwart van de rekentijd.
func celHash(i, j int32) uint32 {
	h := uint64(uint32(i))<<32 | uint64(uint32(j))
	h ^= h >> 30
	h *= 0xbf58476d1ce4e5b9
	h ^= h >> 27
	h *= 0x94d049bb133111eb
	h ^= h >> 31
	return uint32(h)
}

// Punten is het resultaat van een uitdunner of van DunUit (zoals {xs, ys, zs, cs}).
type Punten struct {
	Xs, Ys, Zs []float64
	Cs         []uint32 // nil = geen kleur; anders 0xRRGGBB
}

// Uitdunner is maakUitdunner(limiet): per vakje het hoogste (boven) of laagste (onder)
// punt, met een raster dat grover wordt zodra er meer dan limiet punten zijn.
type Uitdunner struct {
	onder      bool
	limiet     float64
	cel, inv   float64
	ox, oy     float64
	oorsprong  bool
	n, gezien  int
	kx, ky, kz []float64
	kr, kg, kb []uint16
	kk         []uint8
	ci, cj     []int32
	metKleur   bool
	kleurMax   uint16
	tgrootte   int
	masker     uint32
	tab        []int32
}

func NieuweUitdunner(limiet int, onder bool) *Uitdunner {
	u := &Uitdunner{onder: onder, limiet: float64(limiet), cel: 0.01, inv: 100, tgrootte: 1 << 17}
	u.masker = uint32(u.tgrootte - 1)
	u.tab = vulMin1(make([]int32, u.tgrootte))
	return u
}

func vulMin1(t []int32) []int32 {
	for i := range t {
		t[i] = -1
	}
	return t
}

func (u *Uitdunner) beter(z, oud float64) bool {
	if u.onder {
		return z < oud
	}
	return z > oud
}

func (u *Uitdunner) bouwTabel(grootte int) {
	u.tgrootte = grootte
	u.masker = uint32(grootte - 1)
	u.tab = vulMin1(make([]int32, grootte))
	for p := 0; p < u.n; p++ {
		h := celHash(u.ci[p], u.cj[p]) & u.masker
		for u.tab[h] >= 0 {
			h = (h + 1) & u.masker
		}
		u.tab[h] = int32(p)
	}
}

func (u *Uitdunner) vergroof() {
	for {
		u.cel *= math.Sqrt2
		u.inv = 1 / u.cel
		vulMin1(u.tab)
		m := 0
		for p := 0; p < u.n; p++ {
			i := naarInt32(math.Floor(float64((u.kx[p] - u.ox) * u.inv)))
			j := naarInt32(math.Floor(float64((u.ky[p] - u.oy) * u.inv)))
			h := celHash(i, j) & u.masker
			var q int32
			for q = u.tab[h]; q >= 0 && !(u.ci[q] == i && u.cj[q] == j); q = u.tab[h] {
				h = (h + 1) & u.masker
			}
			if q < 0 {
				u.kx[m], u.ky[m], u.kz[m] = u.kx[p], u.ky[p], u.kz[p]
				u.kr[m], u.kg[m], u.kb[m], u.kk[m] = u.kr[p], u.kg[p], u.kb[p], u.kk[p]
				u.ci[m], u.cj[m] = i, j
				u.tab[h] = int32(m)
				m++
			} else if u.beter(u.kz[p], u.kz[q]) {
				u.kx[q], u.ky[q], u.kz[q] = u.kx[p], u.ky[p], u.kz[p]
				u.kr[q], u.kg[q], u.kb[q], u.kk[q] = u.kr[p], u.kg[p], u.kb[p], u.kk[p]
			}
		}
		u.n = m
		if !(float64(u.n) > u.limiet*0.7) {
			return
		}
	}
}

// VoegToe is voegToe(x, y, z, r, g, b); metKleur = false is "r is undefined".
func (u *Uitdunner) VoegToe(x, y, z float64, r, g, b uint16, metKleur bool) {
	u.gezien++
	if !u.oorsprong {
		u.ox, u.oy, u.oorsprong = x, y, true
	}
	i := naarInt32(math.Floor(float64((x - u.ox) * u.inv)))
	j := naarInt32(math.Floor(float64((y - u.oy) * u.inv)))
	h := celHash(i, j) & u.masker
	p := u.tab[h]
	for p >= 0 && !(u.ci[p] == i && u.cj[p] == j) {
		h = (h + 1) & u.masker
		p = u.tab[h]
	}
	if p >= 0 {
		// vakje al bezet: alleen vervangen als dit punt hoger (boven) of lager (onder) ligt
		if !u.beter(z, u.kz[p]) {
			return
		}
		u.kx[p], u.ky[p], u.kz[p] = x, y, z
		if metKleur {
			u.houdKleurMax(r, g, b)
			u.kr[p], u.kg[p], u.kb[p], u.kk[p] = r, g, b, 1
		}
		return
	}
	u.kx = append(u.kx, x)
	u.ky = append(u.ky, y)
	u.kz = append(u.kz, z)
	u.ci = append(u.ci, i)
	u.cj = append(u.cj, j)
	if metKleur {
		u.metKleur = true
		u.houdKleurMax(r, g, b)
		u.kr, u.kg, u.kb, u.kk = append(u.kr, r), append(u.kg, g), append(u.kb, b), append(u.kk, 1)
	} else {
		u.kr, u.kg, u.kb, u.kk = append(u.kr, 0), append(u.kg, 0), append(u.kb, 0), append(u.kk, 0)
	}
	u.tab[h] = int32(u.n)
	u.n++
	if float64(u.n) > float64(u.tgrootte)*0.5 {
		u.bouwTabel(u.tgrootte * 2)
	}
	if float64(u.n) > u.limiet {
		u.vergroof()
		u.kort()
	}
}

// kort maakt de lijsten even lang als n (na vergroof); append gaat dan verder vanaf n.
func (u *Uitdunner) kort() {
	u.kx, u.ky, u.kz = u.kx[:u.n], u.ky[:u.n], u.kz[:u.n]
	u.kr, u.kg, u.kb, u.kk = u.kr[:u.n], u.kg[:u.n], u.kb[:u.n], u.kk[:u.n]
	u.ci, u.cj = u.ci[:u.n], u.cj[:u.n]
}

func (u *Uitdunner) houdKleurMax(r, g, b uint16) {
	if r > u.kleurMax {
		u.kleurMax = r
	}
	if g > u.kleurMax {
		u.kleurMax = g
	}
	if b > u.kleurMax {
		u.kleurMax = b
	}
}

// Gezien: aantal punten dat aan VoegToe is gegeven.
func (u *Uitdunner) Gezien() int { return u.gezien }

// Resultaat is resultaat(): de overgebleven punten, met kleur als er kleur was.
func (u *Uitdunner) Resultaat() Punten {
	p := Punten{
		Xs: append([]float64(nil), u.kx[:u.n]...),
		Ys: append([]float64(nil), u.ky[:u.n]...),
		Zs: append([]float64(nil), u.kz[:u.n]...),
	}
	if u.metKleur && u.kleurMax > 0 { // alle kleurvelden 0 = geen kleur
		deler := uint16(1)
		if u.kleurMax > 255 {
			deler = 256
		}
		p.Cs = make([]uint32, u.n)
		for i := 0; i < u.n; i++ {
			if u.kk[i] == 0 {
				p.Cs[i] = 0x808080
				continue
			}
			r, g, b := min(255, u.kr[i]/deler), min(255, u.kg[i]/deler), min(255, u.kb[i]/deler)
			p.Cs[i] = uint32(r)<<16 | uint32(g)<<8 | uint32(b)
		}
	}
	return p
}

// DunUit is dunUit(xs, ys, zs, max, cs): ruimtelijk uitdunnen tot ± max punten, per cel
// het hoogste (boven) of laagste (onder) punt, in de oorspronkelijke volgorde.
func DunUit(in Punten, max int, onder bool) Punten {
	n := len(in.Xs)
	if n <= max {
		return in
	}
	minX, maxX, minY, maxY := math.Inf(1), math.Inf(-1), math.Inf(1), math.Inf(-1)
	for i := 0; i < n; i++ {
		if in.Xs[i] < minX {
			minX = in.Xs[i]
		}
		if in.Xs[i] > maxX {
			maxX = in.Xs[i]
		}
		if in.Ys[i] < minY {
			minY = in.Ys[i]
		}
		if in.Ys[i] > maxY {
			maxY = in.Ys[i]
		}
	}
	fmax := float64(max)
	oppervlak := math.Max(1e-6, float64((maxX-minX)*(maxY-minY)))
	celGrootte := math.Sqrt(oppervlak / fmax)
	if celGrootte == 0 || math.IsNaN(celGrootte) {
		celGrootte = 1
	}
	grootte := 1
	for grootte < n*2 {
		grootte *= 2
	}
	masker := uint32(grootte - 1)
	tab, ti, tj := make([]int32, grootte), make([]int32, grootte), make([]int32, grootte)
	beter := func(z, oud float64) bool {
		if onder {
			return z < oud
		}
		return z > oud
	}
	var raster []int32
	kies := func(cel float64) []int32 {
		inv := 1 / cel
		// Vast raster over het kader: dezelfde cellen als de hashtabel van de viewer (dus
		// dezelfde uitkomst), maar buren liggen naast elkaar in het geheugen. Alleen als
		// het raster niet te groot wordt; anders de hashtabel.
		nx := int64(naarInt32(math.Floor(float64((maxX-minX)*inv)))) + 1
		ny := int64(naarInt32(math.Floor(float64((maxY-minY)*inv)))) + 1
		if nx > 0 && ny > 0 && nx*ny <= 64<<20 {
			if int64(cap(raster)) < nx*ny {
				raster = make([]int32, nx*ny)
			}
			raster = raster[:nx*ny]
			gekozen := kiesRaster(in, minX, minY, inv, ny, raster, onder)
			sel := make([]int32, 0, len(in.Xs)/2)
			for k, ja := range gekozen {
				if ja {
					sel = append(sel, int32(k))
				}
			}
			return sel
		}
		vulMin1(tab)
		aantal := 0
		for k := 0; k < n; k++ {
			i := naarInt32(math.Floor(float64((in.Xs[k] - minX) * inv)))
			j := naarInt32(math.Floor(float64((in.Ys[k] - minY) * inv)))
			h := celHash(i, j) & masker
			q := tab[h]
			for q >= 0 && !(ti[h] == i && tj[h] == j) {
				h = (h + 1) & masker
				q = tab[h]
			}
			if q < 0 {
				tab[h], ti[h], tj[h] = int32(k), i, j
				aantal++
			} else if beter(in.Zs[k], in.Zs[q]) {
				tab[h] = int32(k)
			}
		}
		// in de oorspronkelijke volgorde (zoals sel.sort() in de viewer), zonder te sorteren
		gekozen := make([]bool, n)
		for h := 0; h < grootte; h++ {
			if tab[h] >= 0 {
				gekozen[tab[h]] = true
			}
		}
		sel := make([]int32, 0, aantal)
		for k, ja := range gekozen {
			if ja {
				sel = append(sel, int32(k))
			}
		}
		return sel
	}
	var cellen, laatste []int32
	for poging := 0; poging < 5; poging++ {
		kandidaat := kies(celGrootte)
		laatste = kandidaat
		lk := float64(len(kandidaat))
		if lk <= fmax*1.02 && (cellen == nil || len(kandidaat) > len(cellen)) {
			cellen = kandidaat
		}
		if lk > fmax*1.02 {
			celGrootte *= float64(math.Sqrt(lk/fmax) * 1.01)
			continue
		}
		if lk >= fmax*0.93 {
			break
		}
		celGrootte *= float64(math.Sqrt(lk/fmax) * 0.995)
	}
	if cellen == nil {
		cellen = laatste
	}
	m := len(cellen)
	uit := Punten{Xs: make([]float64, m), Ys: make([]float64, m), Zs: make([]float64, m)}
	if in.Cs != nil {
		uit.Cs = make([]uint32, m)
	}
	for k, i := range cellen {
		uit.Xs[k], uit.Ys[k], uit.Zs[k] = in.Xs[i], in.Ys[i], in.Zs[i]
		if in.Cs != nil {
			uit.Cs[k] = in.Cs[i]
		}
	}
	return uit
}

// kiesRaster is de kern van dunUit met een vast raster: per cel het beste punt (hoogste of
// laagste z; bij gelijke hoogte het eerste). Verdeeld over de processorkernen: elke kern
// neemt een aaneengesloten stuk punten met een eigen raster, daarna per cel de beste,
// en bij gelijke hoogte die van het eerdere stuk. Dat is precies wat de viewer kiest.
func kiesRaster(in Punten, minX, minY, inv float64, ny int64, raster []int32, onder bool) []bool {
	n := len(in.Xs)
	// niet te veel stukken: elk stuk heeft een eigen raster dat gevuld en samengevoegd moet worden
	delen := min(runtime.NumCPU(), 8, max(1, n/500000))
	rasters := make([][]int32, delen)
	rasters[0] = raster
	var wg sync.WaitGroup
	for d := 0; d < delen; d++ {
		if d > 0 {
			rasters[d] = make([]int32, len(raster))
		}
		wg.Add(1)
		go func(d int) {
			defer wg.Done()
			r := rasters[d]
			vulMin1(r)
			van, tot := d*n/delen, (d+1)*n/delen
			for k := van; k < tot; k++ {
				i := int64(naarInt32(math.Floor(float64((in.Xs[k] - minX) * inv))))
				j := int64(naarInt32(math.Floor(float64((in.Ys[k] - minY) * inv))))
				c := i*ny + j
				if q := r[c]; q < 0 || (onder && in.Zs[k] < in.Zs[q]) || (!onder && in.Zs[k] > in.Zs[q]) {
					r[c] = int32(k)
				}
			}
		}(d)
	}
	wg.Wait()
	gekozen := make([]bool, n)
	cellen := len(raster)
	var mg sync.WaitGroup
	stuk := (cellen + runtime.NumCPU() - 1) / runtime.NumCPU()
	for van := 0; van < cellen; van += stuk {
		mg.Add(1)
		go func(van, tot int) {
			defer mg.Done()
			for c := van; c < tot; c++ {
				best := int32(-1)
				for d := 0; d < delen; d++ {
					q := rasters[d][c]
					if q < 0 {
						continue
					}
					// strikt beter: bij gelijke hoogte blijft het eerdere stuk
					if best < 0 || (onder && in.Zs[q] < in.Zs[best]) || (!onder && in.Zs[q] > in.Zs[best]) {
						best = q
					}
				}
				if best >= 0 {
					gekozen[best] = true
				}
			}
		}(van, min(cellen, van+stuk))
	}
	mg.Wait()
	return gekozen
}
