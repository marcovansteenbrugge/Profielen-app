package omzet

// LAZ (plan omzetten-in-exe, F4 en F5): laz-perf in wazero decodeert dijk_begroeid.laz
// (gemaakt met testdata/groot/maak_laz.py) tot precies dezelfde records als dijk_begroeid.las,
// en Omzet maakt uit de LAZ dezelfde vakken en overzichten als uit de LAS.

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"testing"
	"time"
)

func lazTestbestanden(t *testing.T) (laz, las, wasm string) {
	t.Helper()
	g := filepath.Join("..", "..", "testdata", "groot")
	laz, las = filepath.Join(g, "dijk_begroeid.laz"), filepath.Join(g, "dijk_begroeid.las")
	wasm = filepath.Join("..", "..", "vendor", "laz-perf", "laz-perf.wasm")
	if _, err := os.Stat(laz); err != nil {
		t.Skip("dijk_begroeid.laz ontbreekt: draai testdata/groot/maak_laz.py")
	}
	return
}

// lazOpzet leest kop, chunk-grootte en chunk-tabel.
func lazOpzet(t *testing.T, f *os.File) (*LasKop, int32, []int64) {
	t.Helper()
	kop, err := LeesLasKop(f)
	if err != nil {
		t.Fatal(err)
	}
	if !kop.Gecomprimeerd {
		t.Fatal("geen LAZ")
	}
	kopb := make([]byte, kop.PuntDataOffset)
	f.ReadAt(kopb, 0)
	chunk, err := LazVlr(kopb, kop.AantalVLR, kop.KopGrootte)
	if err != nil {
		t.Fatal(err)
	}
	var p [8]byte
	f.ReadAt(p[:], int64(kop.PuntDataOffset))
	tabelOffset := int64(binary.LittleEndian.Uint64(p[:]))
	st, _ := f.Stat()
	buf := make([]byte, st.Size()-tabelOffset)
	f.ReadAt(buf, tabelOffset)
	offsets, err := ChunkTabel(buf, int64(kop.PuntDataOffset)+8, false)
	if err != nil {
		t.Fatal(err)
	}
	if offsets[len(offsets)-1] != tabelOffset {
		t.Fatalf("chunk-tabel klopt niet: laatste offset %d, tabel begint op %d", offsets[len(offsets)-1], tabelOffset)
	}
	return kop, chunk, offsets
}

func TestLazPerfInWazero(t *testing.T) {
	lazPad, lasPad, wasmPad := lazTestbestanden(t)
	wasm, err := os.ReadFile(wasmPad)
	if err != nil {
		t.Fatal(err)
	}
	f, _ := os.Open(lazPad)
	defer f.Close()
	kop, chunk, offsets := lazOpzet(t, f)
	t.Logf("LAZ: %d punten, formaat %d, record %d bytes, chunks van %d, %d chunks", kop.AantalPunten, kop.PuntFormaat, kop.PuntRecordLengte, chunk, len(offsets)-1)

	// de LAS-records om mee te vergelijken
	g, _ := os.Open(lasPad)
	defer g.Close()
	lk, _ := LeesLasKop(g)
	if lk.PuntRecordLengte != kop.PuntRecordLengte || lk.AantalPunten != kop.AantalPunten {
		t.Fatalf("LAS en LAZ verschillen in opzet: %d/%d bytes, %d/%d punten", lk.PuntRecordLengte, kop.PuntRecordLengte, lk.AantalPunten, kop.AantalPunten)
	}
	rl := int(kop.PuntRecordLengte)
	lasRecords := make([]byte, int(lk.AantalPunten)*rl)
	g.ReadAt(lasRecords, int64(lk.PuntDataOffset))

	ctx := context.Background()
	decodeer := func(d *LazDecoder, c int) []byte {
		data := make([]byte, offsets[c+1]-offsets[c])
		f.ReadAt(data, offsets[c])
		n := int(min(int64(chunk), kop.AantalPunten-int64(c)*int64(chunk)))
		p, err := d.Chunk(ctx, data, kop.PuntFormaat, kop.PuntRecordLengte, n)
		if err != nil {
			t.Fatalf("chunk %d: %v", c, err)
		}
		return p
	}

	// 1. één kern: alles decoderen en byte voor byte vergelijken
	t0 := time.Now()
	d, err := NieuweLazDecoder(ctx, wasm)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("laz-perf gestart in %v", time.Since(t0))
	t1 := time.Now()
	var alle []byte
	for c := 0; c < len(offsets)-1; c++ {
		alle = append(alle, decodeer(d, c)...)
	}
	een := time.Since(t1)
	d.Sluit(ctx)
	if !bytes.Equal(alle, lasRecords) {
		for i := 0; i < len(alle)/rl; i++ {
			if !bytes.Equal(alle[i*rl:(i+1)*rl], lasRecords[i*rl:(i+1)*rl]) {
				t.Fatalf("punt %d verschilt:\nLAZ %x\nLAS %x", i, alle[i*rl:(i+1)*rl], lasRecords[i*rl:(i+1)*rl])
			}
		}
		t.Fatalf("lengte verschilt: %d tegen %d bytes", len(alle), len(lasRecords))
	}
	t.Logf("één kern: %d punten in %v (%.1f mln punten/s), byte voor byte gelijk aan de LAS", kop.AantalPunten, een.Round(time.Millisecond), float64(kop.AantalPunten)/een.Seconds()/1e6)

	// 2. alle kernen: per werker een eigen instantie
	werkers := max(1, runtime.NumCPU()-1)
	t2 := time.Now()
	uit := make([][]byte, len(offsets)-1)
	var wg sync.WaitGroup
	taken := make(chan int)
	for w := 0; w < werkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			dw, err := NieuweLazDecoder(ctx, wasm)
			if err != nil {
				t.Error(err)
				for range taken {
				}
				return
			}
			defer dw.Sluit(ctx)
			for c := range taken {
				uit[c] = decodeer(dw, c)
			}
		}()
	}
	for c := range uit {
		taken <- c
	}
	close(taken)
	wg.Wait()
	alleKernen := time.Since(t2)
	if !bytes.Equal(bytes.Join(uit, nil), lasRecords) {
		t.Fatal("parallel gedecodeerd verschilt van de LAS")
	}
	t.Logf("%d werkers: %v (%.1f mln punten/s), byte voor byte gelijk", werkers, alleKernen.Round(time.Millisecond), float64(kop.AantalPunten)/alleKernen.Seconds()/1e6)
}

func TestLazChunkTabelKapot(t *testing.T) {
	if _, err := ChunkTabel([]byte{0, 0, 0, 0, 5, 0, 0, 0, 1, 2}, 100, false); err == nil {
		t.Fatal("afgekapte chunk-tabel moet een fout geven")
	}
	if _, err := ChunkTabel([]byte{1, 0, 0, 0, 0, 0, 0, 0}, 100, false); err == nil {
		t.Fatal("onbekende versie moet een fout geven")
	}
}

// TestOmzetLazGelijkAanLas: Omzet van de LAZ en van de LAS geeft byte voor byte dezelfde vakken
// en overzichten (info.json verschilt alleen in de bron en de tijden).
func TestOmzetLazGelijkAanLas(t *testing.T) {
	lazPad, lasPad, wasmPad := lazTestbestanden(t)
	wasm, err := os.ReadFile(wasmPad)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	tmp := t.TempDir()
	t0 := time.Now()
	iLaz, err := Omzet(ctx, Opdracht{Bron: lazPad, Doel: filepath.Join(tmp, "laz"), LazWasm: wasm}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("LAZ omgezet: %d punten, %d vakken in %v", iLaz.Aantal, len(iLaz.Tegels), time.Since(t0).Round(time.Millisecond))
	t1 := time.Now()
	iLas, err := Omzet(ctx, Opdracht{Bron: lasPad, Doel: filepath.Join(tmp, "las")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("LAS omgezet in %v", time.Since(t1).Round(time.Millisecond))
	if iLaz.Aantal != iLas.Aantal || len(iLaz.Tegels) != len(iLas.Tegels) {
		t.Fatalf("LAZ %d punten in %d vakken, LAS %d in %d", iLaz.Aantal, len(iLaz.Tegels), iLas.Aantal, len(iLas.Tegels))
	}
	vergelijk := func(rel string) {
		a, e1 := os.ReadFile(filepath.Join(tmp, "laz", rel))
		b, e2 := os.ReadFile(filepath.Join(tmp, "las", rel))
		if e1 != nil || e2 != nil || !bytes.Equal(a, b) {
			t.Errorf("%s verschilt (%v, %v)", rel, e1, e2)
		}
	}
	vergelijk("overzicht.pvt")
	vergelijk("overzicht_maaiveld.pvt")
	items, _ := os.ReadDir(filepath.Join(tmp, "las", "tegels"))
	for _, it := range items {
		vergelijk(filepath.Join("tegels", it.Name()))
	}
	// zonder laz-perf: een nette fout, geen crash
	if _, err := Omzet(ctx, Opdracht{Bron: lazPad, Doel: filepath.Join(tmp, "zonder")}, nil); err == nil {
		t.Error("LAZ zonder laz-perf moet een fout geven")
	}
	// afbreken midden in een LAZ
	ctx2, stop := context.WithCancel(ctx)
	_, err = Omzet(ctx2, Opdracht{Bron: lazPad, Doel: filepath.Join(tmp, "af"), LazWasm: wasm}, func(g, _ int64) {
		if g > 500000 {
			stop()
		}
	})
	if !errors.Is(err, context.Canceled) {
		t.Errorf("afbreken: %v", err)
	}
}

// TestLazKapot: een afgekapte of beschadigde LAZ geeft een fout, geen crash.
func TestLazKapot(t *testing.T) {
	lazPad, _, wasmPad := lazTestbestanden(t)
	wasm, _ := os.ReadFile(wasmPad)
	heel, err := os.ReadFile(lazPad)
	if err != nil {
		t.Fatal(err)
	}
	tmp := t.TempDir()
	kapot := map[string][]byte{
		"afgekapt": heel[:len(heel)/2],
		"geknoeid": func() []byte {
			b := bytes.Clone(heel)
			kop, _ := LeesLasKop(bytes.NewReader(b))
			for i := int(kop.PuntDataOffset) + 1000; i < int(kop.PuntDataOffset)+1100; i++ { // in de eerste chunk
				b[i] ^= 0x5a
			}
			return b
		}(),
	}
	for naam, b := range kapot {
		pad := filepath.Join(tmp, naam+".laz")
		os.WriteFile(pad, b, 0o644)
		t0 := time.Now()
		info, err := Omzet(context.Background(), Opdracht{Bron: pad, Doel: filepath.Join(tmp, naam), LazWasm: wasm}, nil)
		if info != nil {
			t.Logf("%s: %d punten, %d vakken, %v", naam, info.Aantal, len(info.Tegels), time.Since(t0))
		}
		t.Logf("%s: %v", naam, err)
		if naam == "afgekapt" && err == nil {
			t.Error("afgekapte LAZ moet een fout geven")
		}
	}
}
