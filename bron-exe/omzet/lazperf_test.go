package omzet

// Proef LAZ (plan omzetten-in-exe, F4): laz-perf in wazero decodeert dijk_begroeid.laz
// (gemaakt met testdata/groot/maak_laz.py) tot precies dezelfde records als dijk_begroeid.las.

import (
	"bytes"
	"context"
	"encoding/binary"
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
