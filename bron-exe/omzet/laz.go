package omzet

// LAZ lezen (leesLazPunten uit viewer.js, plan omzetten-in-exe F5, besluit B5): dezelfde
// laz-perf als de viewer, in wazero, met per werker een eigen instantie. Elke chunk is een
// blok; de punten gaan in de volgorde van het bestand naar de schrijver.

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"runtime"
)

// LeesLaz leest alle punten van een LAZ en geeft ze in volgorde aan s. wasm = laz-perf.wasm.
func LeesLaz(ctx context.Context, f *os.File, kop *LasKop, wasm []byte, s *Schrijver, voortgang Voortgang) error {
	if len(wasm) == 0 {
		return errors.New("laz-perf ontbreekt in het programma")
	}
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if int64(kop.PuntDataOffset)+8 > st.Size() {
		return errors.New("LAZ-bestand is korter dan de header zegt")
	}
	kopb := make([]byte, kop.PuntDataOffset)
	if _, err := f.ReadAt(kopb, 0); err != nil {
		return err
	}
	chunk, err := LazVlr(kopb, kop.AantalVLR, kop.KopGrootte)
	if err != nil {
		return err
	}
	if chunk <= 0 {
		return errors.New("variabele chunk-grootte in deze LAZ wordt nog niet ondersteund")
	}
	var p [8]byte
	if _, err := f.ReadAt(p[:], int64(kop.PuntDataOffset)); err != nil {
		return err
	}
	if binary.LittleEndian.Uint64(p[:]) == 0xFFFFFFFFFFFFFFFF {
		return errors.New("chunk-tabel-offset = -1 (aan het eind geschreven na een gecrashte writer) wordt niet ondersteund")
	}
	tabelOffset := int64(binary.LittleEndian.Uint64(p[:]))
	if tabelOffset < int64(kop.PuntDataOffset)+8 || tabelOffset > st.Size() {
		return fmt.Errorf("chunk-tabel-offset %d ligt buiten het bestand", tabelOffset)
	}
	tabel := make([]byte, st.Size()-tabelOffset)
	if _, err := f.ReadAt(tabel, tabelOffset); err != nil {
		return err
	}
	offsets, err := ChunkTabel(tabel, int64(kop.PuntDataOffset)+8, false)
	if err != nil {
		return err
	}
	aantal := len(offsets) - 1
	if int64(aantal)*int64(chunk) < kop.AantalPunten {
		return fmt.Errorf("de chunk-tabel noemt %d chunks van %d punten, de header %d punten", aantal, chunk, kop.AantalPunten)
	}
	for c := 0; c < aantal; c++ {
		if offsets[c+1] < offsets[c] || offsets[c+1] > tabelOffset {
			return fmt.Errorf("chunk %d ligt buiten de puntdata", c)
		}
	}
	rgbOff, metKleur := lasRGBOffset[kop.PuntFormaat]
	nieuwFormaat := kop.PuntFormaat >= 6
	werker := func() (func(i int) *lasBlok, func(), error) {
		d, err := NieuweLazDecoder(ctx, wasm)
		if err != nil {
			return nil, nil, err
		}
		lees := func(c int) *lasBlok {
			n := int(max(0, min(int64(chunk), kop.AantalPunten-int64(c)*int64(chunk))))
			if n == 0 {
				return &lasBlok{}
			}
			data := make([]byte, offsets[c+1]-offsets[c])
			if _, err := f.ReadAt(data, offsets[c]); err != nil {
				return &lasBlok{err: fmt.Errorf("LAZ lezen bij chunk %d: %w", c, err)}
			}
			rec, err := d.Chunk(ctx, data, kop.PuntFormaat, kop.PuntRecordLengte, n)
			if err != nil {
				return &lasBlok{err: fmt.Errorf("LAZ-chunk %d: %w", c, err)}
			}
			return ontleedLasRecords(rec, n, kop, rgbOff, metKleur, nieuwFormaat)
		}
		return lees, func() { d.Sluit(context.Background()) }, nil
	}
	return leesGeordend(ctx, aantal, max(1, runtime.NumCPU()-1), werker, metKleur, kop.AantalPunten, s, voortgang)
}
