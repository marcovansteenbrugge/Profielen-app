package omzet

// Tests voor het omzetten in de exe (plan omzetten-in-exe, F0). De vergelijking met de
// viewer zelf staat in tests/omzetten_exe.test.js.

import (
	"context"
	"encoding/binary"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// Math.round van JavaScript, met de waarden die JavaScript geeft.
func TestRondZoalsJavaScript(t *testing.T) {
	gevallen := map[float64]float64{
		2.5: 3, -2.5: -2, 1.5: 2, -1.5: -1, -0.5: 0, 0.5: 1,
		0.49999999999999994: 0, -0.49999999999999994: 0,
		2.4999999999999996: 2, -2.5000000000000004: -3,
		1234.5: 1235, -1234.5: -1234, 7: 7, -7: -7,
	}
	for v, wil := range gevallen {
		if kreeg := rond(v); kreeg != wil {
			t.Errorf("rond(%v) = %v, wil %v", v, kreeg, wil)
		}
	}
}

func TestNaarInt32ZoalsJavaScript(t *testing.T) {
	gevallen := map[float64]int32{
		0: 0, -1.7: -1, 1.7: 1, 2147483647: 2147483647, 2147483648: -2147483648,
		4294967297: 1, -2147483649: 2147483647, math.NaN(): 0, math.Inf(1): 0,
	}
	for v, wil := range gevallen {
		if kreeg := naarInt32(v); kreeg != wil {
			t.Errorf("naarInt32(%v) = %d, wil %d", v, kreeg, wil)
		}
	}
}

// leesVak geeft de records van een vakbestand.
func leesVak(t *testing.T, pad string) [][TegelRec]byte {
	t.Helper()
	b, err := os.ReadFile(pad)
	if err != nil {
		t.Fatal(err)
	}
	uit := make([][TegelRec]byte, len(b)/TegelRec)
	for i := range uit {
		copy(uit[i][:], b[i*TegelRec:])
	}
	return uit
}

// Halve millimeters (ook negatief) worden afgerond zoals in de viewer: naar boven.
func TestSchrijverHalveMillimeter(t *testing.T) {
	d := t.TempDir()
	s := NieuweSchrijver(d, false)
	// oorsprong (82000, 389000); x - ox = 12,0005 m → 12000,5 mm; z = -0,0005 m → -0,5 mm
	s.VoegToe(82012.0005, 389010, -0.0005, 0, 0, 0, false, 2)
	s.VoegToe(82012.0015, 389010, -1.0025, 0, 0, 0, false, 2)
	if _, _, _, err := s.Afronden(); err != nil {
		t.Fatal(err)
	}
	r := leesVak(t, filepath.Join(d, TegelNaam(1640, 7780)))
	// verwachting als gewone doubles (geen constanten: Go rekent constanten exact uit,
	// JavaScript en de schrijver niet)
	x0, x1, z1, ox := 82012.0005, 82012.0015, -1.0025, 82000.0
	for i, wil := range [][2]int32{{naarInt32(rond(float64((x0 - ox) * 1000))), 0}, {naarInt32(rond(float64((x1 - ox) * 1000))), naarInt32(rond(float64(z1 * 1000)))}} {
		x, z := int32(binary.LittleEndian.Uint32(r[i][0:])), int32(binary.LittleEndian.Uint32(r[i][8:]))
		if x != wil[0] || z != wil[1] {
			t.Errorf("punt %d: x %d z %d, wil x %d z %d", i, x, z, wil[0], wil[1])
		}
	}
	if z := int32(binary.LittleEndian.Uint32(r[0][8:])); z != 0 {
		t.Errorf("z = -0,5 mm moet 0 worden (Math.round), kreeg %d", z)
	}
	if z := int32(binary.LittleEndian.Uint32(r[1][8:])); z != -1002 {
		t.Errorf("z = -1002,5 mm moet -1002 worden (Math.round), kreeg %d", z)
	}
}

// 8- en 16-bits kleur: de kleurdiepte wordt bepaald op de eerste 200.000 punten, net als in
// de viewer; een hogere waarde daarna wordt afgekapt op 255.
func TestSchrijverKleurdiepte(t *testing.T) {
	for _, geval := range []struct {
		naam      string
		r         uint16
		later     uint16
		wilR      byte
		wilLater  byte
		kleurInfo bool
	}{
		{"8-bits", 200, 40000, 200, 255, true},
		{"16-bits", 51200, 40000, 200, 156, true},
		{"geen kleur (allemaal 0)", 0, 0, 0, 0, false},
	} {
		t.Run(geval.naam, func(t *testing.T) {
			d := t.TempDir()
			s := NieuweSchrijver(d, false)
			for i := 0; i < voorraadPunten; i++ {
				s.VoegToe(82010+float64(i%1000)*0.01, 389010+float64(i/1000)*0.01, 1, float64(geval.r), float64(geval.r), float64(geval.r), true, 1)
			}
			s.VoegToe(82020, 389020, 1, float64(geval.later), float64(geval.later), float64(geval.later), true, 1)
			info, _, _, err := s.Afronden()
			if err != nil {
				t.Fatal(err)
			}
			r := leesVak(t, filepath.Join(d, TegelNaam(1640, 7780)))
			if r[0][13] != geval.wilR || r[len(r)-1][13] != geval.wilLater {
				t.Errorf("rood eerste %d laatste %d, wil %d en %d", r[0][13], r[len(r)-1][13], geval.wilR, geval.wilLater)
			}
			if info.Kleur != geval.kleurInfo && geval.r != 0 {
				t.Errorf("info.kleur = %v", info.Kleur)
			}
		})
	}
}

// dunUitZoalsViewer: de letterlijke werkwijze van de viewer (hashtabel, daarna sorteren),
// om het snelle raster van DunUit tegen te toetsen.
func dunUitZoalsViewer(in Punten, max int, onder bool) []int {
	minX, maxX, minY, maxY := math.Inf(1), math.Inf(-1), math.Inf(1), math.Inf(-1)
	for i := range in.Xs {
		minX, maxX = math.Min(minX, in.Xs[i]), math.Max(maxX, in.Xs[i])
		minY, maxY = math.Min(minY, in.Ys[i]), math.Max(maxY, in.Ys[i])
	}
	fmax := float64(max)
	cel := math.Sqrt(math.Max(1e-6, float64((maxX-minX)*(maxY-minY))) / fmax)
	kies := func(cel float64) []int {
		inv := 1 / cel
		beste := map[[2]int32]int{}
		for k := range in.Xs {
			c := [2]int32{naarInt32(math.Floor(float64((in.Xs[k] - minX) * inv))), naarInt32(math.Floor(float64((in.Ys[k] - minY) * inv)))}
			q, ok := beste[c]
			if !ok || (onder && in.Zs[k] < in.Zs[q]) || (!onder && in.Zs[k] > in.Zs[q]) {
				beste[c] = k
			}
		}
		sel := make([]int, 0, len(beste))
		for _, k := range beste {
			sel = append(sel, k)
		}
		slices.Sort(sel)
		return sel
	}
	var cellen, laatste []int
	for poging := 0; poging < 5; poging++ {
		k := kies(cel)
		laatste = k
		lk := float64(len(k))
		if lk <= fmax*1.02 && (cellen == nil || len(k) > len(cellen)) {
			cellen = k
		}
		if lk > fmax*1.02 {
			cel *= float64(math.Sqrt(lk/fmax) * 1.01)
			continue
		}
		if lk >= fmax*0.93 {
			break
		}
		cel *= float64(math.Sqrt(lk/fmax) * 0.995)
	}
	if cellen == nil {
		cellen = laatste
	}
	return cellen
}

func TestDunUitZelfdeAlsViewer(t *testing.T) {
	rnd := rand.New(rand.NewSource(7))
	for _, onder := range []bool{false, true} {
		n := 1200000
		in := Punten{Xs: make([]float64, n), Ys: make([]float64, n), Zs: make([]float64, n), Cs: make([]uint32, n)}
		for i := 0; i < n; i++ {
			// een schuine strook (zoals een dijk) met veel gelijke hoogtes
			s := rnd.Float64() * 500
			in.Xs[i] = 82000 + s + rnd.Float64()*20
			in.Ys[i] = 389000 + s*0.6 + rnd.Float64()*20
			in.Zs[i] = math.Round(rnd.Float64()*30) / 10
			in.Cs[i] = uint32(i)
		}
		uit := DunUit(in, 300000, onder)
		wil := dunUitZoalsViewer(in, 300000, onder)
		if len(uit.Xs) != len(wil) {
			t.Fatalf("onder=%v: %d punten, de viewer kiest er %d", onder, len(uit.Xs), len(wil))
		}
		for k, i := range wil {
			if uit.Cs[k] != uint32(i) {
				t.Fatalf("onder=%v: punt %d is %d, de viewer kiest %d", onder, k, uit.Cs[k], i)
			}
		}
	}
}

// maakLas maakt een klein LAS 1.2-bestand (puntformaat 2: met kleur).
func maakLas(t *testing.T, pad string, punten [][7]float64) {
	t.Helper()
	const kop, rl = 227, 26
	b := make([]byte, kop+rl*len(punten))
	copy(b, "LASF")
	b[24], b[25] = 1, 2
	le := binary.LittleEndian
	le.PutUint16(b[94:], kop)
	le.PutUint32(b[96:], kop)
	b[104] = 2
	le.PutUint16(b[105:], rl)
	le.PutUint32(b[107:], uint32(len(punten)))
	for i, v := range []float64{0.001, 0.001, 0.001, 82000, 389000, 0} {
		le.PutUint64(b[131+8*i:], math.Float64bits(v))
	}
	for i, p := range punten {
		o := kop + rl*i
		le.PutUint32(b[o:], uint32(int32(math.Round((p[0]-82000)/0.001))))
		le.PutUint32(b[o+4:], uint32(int32(math.Round((p[1]-389000)/0.001))))
		le.PutUint32(b[o+8:], uint32(int32(math.Round(p[2]/0.001))))
		b[o+15] = byte(p[3])
		le.PutUint16(b[o+20:], uint16(p[4]))
		le.PutUint16(b[o+22:], uint16(p[5]))
		le.PutUint16(b[o+24:], uint16(p[6]))
	}
	if err := os.WriteFile(pad, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestOmzetKleineLas(t *testing.T) {
	d := t.TempDir()
	scan := filepath.Join(d, "klein.las")
	maakLas(t, scan, [][7]float64{
		{82010.123, 389010.456, 1.5, 2, 65535, 0, 32768},
		{82060.001, 389010.002, 2.25, 6, 256, 512, 768},
		{82010.5, 389011.5, -0.75, 2, 0, 0, 0},
	})
	info, err := Omzet(context.Background(), Opdracht{Bron: scan, Doel: filepath.Join(d, "A")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if info.Aantal != 3 || len(info.Tegels) != 2 || info.Klassen["2"] != 2 || info.Klassen["6"] != 1 || !info.Kleur {
		t.Fatalf("info klopt niet: %+v", info)
	}
	r := leesVak(t, filepath.Join(d, "A", "tegels", TegelNaam(1640, 7780)))
	if len(r) != 2 || int32(binary.LittleEndian.Uint32(r[0][0:])) != 10123 || r[0][12] != 2 || r[0][13] != 255 || r[0][15] != 128 {
		t.Fatalf("eerste punt klopt niet: %v", r)
	}
	for _, n := range []string{"info.json", "overzicht.pvt"} {
		if _, err := os.Stat(filepath.Join(d, "A", n)); err != nil {
			t.Errorf("%s ontbreekt", n)
		}
	}
	// nog een keer naar dezelfde map: weigeren (anders komen er punten bij in de oude vakken)
	if _, err := Omzet(context.Background(), Opdracht{Bron: scan, Doel: filepath.Join(d, "A")}, nil); err == nil {
		t.Fatal("omzetten naar een gevulde map moet een fout geven")
	}
	// een te kort bestand: een fout, geen crash
	b, _ := os.ReadFile(scan)
	os.WriteFile(scan, b[:len(b)-10], 0o644)
	if _, err := Omzet(context.Background(), Opdracht{Bron: scan, Doel: filepath.Join(d, "B")}, nil); err == nil {
		t.Fatal("een afgekapt LAS-bestand moet een fout geven")
	}
}

func TestOmzetAfbreken(t *testing.T) {
	d := t.TempDir()
	scan := filepath.Join(d, "groot.las")
	p := make([][7]float64, 300000)
	for i := range p {
		p[i] = [7]float64{82000 + float64(i%500), 389000 + float64(i/500)*0.1, 1, 2, 0, 0, 0}
	}
	maakLas(t, scan, p)
	ctx, stop := context.WithCancel(context.Background())
	stop()
	if _, err := Omzet(ctx, Opdracht{Bron: scan, Doel: filepath.Join(d, "A")}, nil); err == nil {
		t.Fatal("afgebroken omzetting moet een fout geven")
	}
}
