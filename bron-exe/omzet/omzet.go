package omzet

// Omzet: een scan in zijn geheel omzetten naar een puntenwolkmap (importeerNaarTegels
// uit viewer.js): <doel>\tegels\<tx>_<ty>.pvt, overzicht.pvt, overzicht_maaiveld.pvt en
// info.json.

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"
)

// gcProcent: GOGC tijdens het omzetten (standaard 100 = de heap mag verdubbelen voor hij opruimt).
var gcProcent = 50

// Opdracht: wat er omgezet moet worden.
type Opdracht struct {
	Bron   string // pad van de scan
	Doel   string // de puntenwolkmap, bv. <projectmap>\puntenwolk\A - <naam>
	Onder  bool   // oppervlak onderkant (anders bovenkant)
	Viewer string // komt in info.json als "viewer"
	// LazWasm: laz-perf.wasm (dezelfde als in de viewer); alleen nodig voor LAZ
	LazWasm []byte
	// Fase krijgt "afronden" als alle punten gelezen zijn (overzichten en info.json); mag nil zijn
	Fase func(fase string)
}

// Omzet zet de scan om. De map tegels in Doel moet leeg zijn of nog niet bestaan.
func Omzet(ctx context.Context, o Opdracht, voortgang Voortgang) (*Info, error) {
	t0 := time.Now()
	// zuiniger opruimen tijdens het omzetten: minder piekgeheugen, iets meer rekentijd
	defer debug.SetGCPercent(debug.SetGCPercent(gcProcent))
	tegelMap := filepath.Join(o.Doel, "tegels")
	if items, err := os.ReadDir(tegelMap); err == nil && len(items) > 0 {
		return nil, fmt.Errorf("de map %s is niet leeg", tegelMap)
	}
	if err := os.MkdirAll(tegelMap, 0o755); err != nil {
		return nil, err
	}
	f, err := os.Open(o.Bron)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	s := NieuweSchrijver(tegelMap, o.Onder)
	defer s.Stop()
	switch strings.ToLower(filepath.Ext(o.Bron)) {
	case ".las", ".laz":
		// zoals de viewer: de header zegt of het gecomprimeerd is, niet de extensie
		kop, err := LeesLasKop(f)
		if err != nil {
			return nil, err
		}
		if kop.Gecomprimeerd {
			err = LeesLaz(ctx, f, kop, o.LazWasm, s, voortgang)
		} else {
			err = LeesLas(ctx, f, kop, s, voortgang)
		}
		if err != nil {
			return nil, err
		}
	case ".pts", ".txt":
		if err := LeesPts(ctx, f, s, voortgang); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("%s: dit formaat zet het programma (nog) niet om", filepath.Base(o.Bron))
	}
	if o.Fase != nil {
		o.Fase("afronden")
	}
	info, alle, err := s.Afronden()
	if err != nil {
		return nil, err
	}
	info.Bron = InfoBron{Naam: filepath.Base(o.Bron), Grootte: st.Size(), Gewijzigd: st.ModTime().UnixMilli()}
	info.Gemaakt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	info.Viewer = o.Viewer
	if err := os.WriteFile(filepath.Join(o.Doel, "overzicht.pvt"), TegelBytes(alle, info.Oorsprong[0], info.Oorsprong[1]), 0o644); err != nil {
		return nil, err
	}
	info.Overzicht.Alle = len(alle.Xs)
	alle = Punten{} // geheugen vrij vóór het maaiveldoverzicht
	if grond := s.Grond(); grond != nil {
		if err := os.WriteFile(filepath.Join(o.Doel, "overzicht_maaiveld.pvt"), TegelBytes(*grond, info.Oorsprong[0], info.Oorsprong[1]), 0o644); err != nil {
			return nil, err
		}
		m := len(grond.Xs)
		info.Overzicht.Maaiveld = &m
	}
	info.DuurImp = int64(rond(time.Since(t0).Seconds()))
	if err := SchrijfInfo(filepath.Join(o.Doel, "info.json"), info); err != nil {
		return nil, err
	}
	return info, nil
}
