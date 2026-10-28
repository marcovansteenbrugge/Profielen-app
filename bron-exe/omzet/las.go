package omzet

// LAS lezen (leesLasHeader en leesLasPunten uit viewer.js), versie 1.2 tot en met 1.4,
// puntformaten 0 tot en met 10. Blokken worden parallel gelezen en ontleed; de punten
// gaan in de volgorde van het bestand naar de schrijver, zodat de vakken gelijk blijven.

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"runtime"
)

// LasKop: de velden uit de LAS-header die nodig zijn.
type LasKop struct {
	VersieMajor, VersieMinor  uint8
	KopGrootte                uint16
	PuntDataOffset            uint32
	AantalVLR                 uint32
	PuntFormaat               uint8
	PuntRecordLengte          uint16
	Gecomprimeerd             bool
	AantalPunten              int64
	XSchaal, YSchaal, ZSchaal float64
	XOffset, YOffset, ZOffset float64
}

// lasRGBOffset: bytepositie van rood/groen/blauw per puntformaat (LAS_RGB_OFFSET).
var lasRGBOffset = map[uint8]int{2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30}

// LeesLasKop leest de header (de eerste 400 bytes volstaan voor 1.2 tot en met 1.4).
func LeesLasKop(f io.ReaderAt) (*LasKop, error) {
	buf := make([]byte, 400)
	n, err := f.ReadAt(buf, 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	if n < 227 || string(buf[0:4]) != "LASF" {
		return nil, errors.New("geen geldig LAS-bestand (LASF-signature ontbreekt)")
	}
	le := binary.LittleEndian
	k := &LasKop{
		VersieMajor: buf[24], VersieMinor: buf[25],
		KopGrootte: le.Uint16(buf[94:]), PuntDataOffset: le.Uint32(buf[96:]), AantalVLR: le.Uint32(buf[100:]),
		PuntRecordLengte: le.Uint16(buf[105:]),
		AantalPunten:     int64(le.Uint32(buf[107:])),
		XSchaal:          math.Float64frombits(le.Uint64(buf[131:])), YSchaal: math.Float64frombits(le.Uint64(buf[139:])), ZSchaal: math.Float64frombits(le.Uint64(buf[147:])),
		XOffset: math.Float64frombits(le.Uint64(buf[155:])), YOffset: math.Float64frombits(le.Uint64(buf[163:])), ZOffset: math.Float64frombits(le.Uint64(buf[171:])),
	}
	ruw := buf[104]
	k.Gecomprimeerd = ruw&0x80 != 0
	k.PuntFormaat = ruw & 0x3f
	if k.VersieMajor == 1 && k.VersieMinor >= 4 && k.KopGrootte >= 375 && n >= 255 {
		if u := le.Uint64(buf[247:]); u > 0 {
			k.AantalPunten = int64(u)
		}
	}
	if k.PuntFormaat > 10 {
		return nil, fmt.Errorf("LAS-puntformaat %d wordt niet ondersteund", k.PuntFormaat)
	}
	minLengte := 20
	if k.PuntFormaat >= 6 {
		minLengte = 30
	}
	if off, ok := lasRGBOffset[k.PuntFormaat]; ok && off+6 > minLengte {
		minLengte = off + 6
	}
	if int(k.PuntRecordLengte) < minLengte {
		return nil, fmt.Errorf("LAS-recordlengte %d is te kort voor puntformaat %d", k.PuntRecordLengte, k.PuntFormaat)
	}
	return k, nil
}

// lasBlok: de ontlede punten van één blok, in volgorde.
type lasBlok struct {
	x, y, z []float64
	r, g, b []uint16
	k       []uint8
	err     error
}

// Voortgang krijgt het aantal gelezen punten en het totaal.
type Voortgang func(gelezen, totaal int64)

// LeesLas leest alle punten en geeft ze in volgorde aan s. Stopt bij ctx.Done().
func LeesLas(ctx context.Context, f *os.File, kop *LasKop, s *Schrijver, voortgang Voortgang) error {
	if kop.Gecomprimeerd {
		return errors.New("dit is een gecomprimeerd LAS-bestand (LAZ)")
	}
	st, err := f.Stat()
	if err != nil {
		return err
	}
	rl := int64(kop.PuntRecordLengte)
	if eind := int64(kop.PuntDataOffset) + kop.AantalPunten*rl; eind > st.Size() {
		return fmt.Errorf("LAS-bestand is korter dan de header zegt (%d punten, %d bytes nodig, %d aanwezig)", kop.AantalPunten, eind, st.Size())
	}
	// zelfde blokgrootte als de viewer bij volledig inlezen (LAS_BLOK_PUNTEN * 25)
	const blokPunten = 100000
	rgbOff, metKleur := lasRGBOffset[kop.PuntFormaat]
	nieuwFormaat := kop.PuntFormaat >= 6
	aantal := int((kop.AantalPunten + blokPunten - 1) / blokPunten)
	werker := func() (func(i int) *lasBlok, func(), error) {
		return func(i int) *lasBlok {
			start := int64(i) * blokPunten
			return leesLasBlok(f, kop, start, min(kop.AantalPunten, start+blokPunten), rgbOff, metKleur, nieuwFormaat)
		}, func() {}, nil
	}
	return leesGeordend(ctx, aantal, max(1, runtime.NumCPU()-1), werker, metKleur, kop.AantalPunten, s, voortgang)
}

// leesGeordend laat werkers de blokken 0..aantal-1 parallel lezen en geeft de punten in de
// volgorde van het bestand aan s. maakWerker maakt per werker een leesfunctie (en wat er na
// afloop op te ruimen is).
func leesGeordend(ctx context.Context, aantal, werkers int, maakWerker func() (func(i int) *lasBlok, func(), error), metKleur bool, totaal int64, s *Schrijver, voortgang Voortgang) error {
	werkers = max(1, min(werkers, aantal))
	type taak struct {
		i   int
		uit chan *lasBlok
	}
	ctx, stop := context.WithCancel(ctx)
	defer stop()
	// niet te veel blokken vooruit lezen: elk blok kost geheugen tot de schrijver het heeft gehad
	volgorde := make(chan chan *lasBlok, werkers+2)
	taken := make(chan taak)
	go func() {
		defer close(volgorde)
		defer close(taken)
		for i := 0; i < aantal; i++ {
			t := taak{i, make(chan *lasBlok, 1)}
			select {
			case volgorde <- t.uit:
			case <-ctx.Done():
				return
			}
			select {
			case taken <- t:
			case <-ctx.Done():
				return
			}
		}
	}()
	for w := 0; w < werkers; w++ {
		go func() {
			lees, klaar, err := maakWerker()
			if err != nil {
				for t := range taken {
					t.uit <- &lasBlok{err: err}
				}
				return
			}
			defer klaar()
			for t := range taken {
				t.uit <- lees(t.i)
			}
		}()
	}
	var gelezen int64
	for uit := range volgorde {
		var b *lasBlok
		select {
		case b = <-uit:
		case <-ctx.Done():
			return ctx.Err()
		}
		if b.err != nil {
			return b.err
		}
		for i := range b.x {
			if metKleur {
				s.VoegToe(b.x[i], b.y[i], b.z[i], float64(b.r[i]), float64(b.g[i]), float64(b.b[i]), true, b.k[i])
			} else {
				s.VoegToe(b.x[i], b.y[i], b.z[i], 0, 0, 0, false, b.k[i])
			}
		}
		gelezen += int64(len(b.x))
		if err := s.NaBlok(); err != nil {
			return err
		}
		if voortgang != nil {
			voortgang(gelezen, totaal)
		}
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	return ctx.Err()
}

func leesLasBlok(f io.ReaderAt, kop *LasKop, start, eind int64, rgbOff int, metKleur, nieuwFormaat bool) *lasBlok {
	rl := int64(kop.PuntRecordLengte)
	n := int(eind - start)
	buf := make([]byte, int64(n)*rl)
	if _, err := f.ReadAt(buf, int64(kop.PuntDataOffset)+start*rl); err != nil {
		return &lasBlok{err: fmt.Errorf("LAS lezen bij punt %d: %w", start, err)}
	}
	return ontleedLasRecords(buf, n, kop, rgbOff, metKleur, nieuwFormaat)
}

// ontleedLasRecords zet n LAS-records om naar punten (zoals leesLasPunten/leesLazPunten).
func ontleedLasRecords(buf []byte, n int, kop *LasKop, rgbOff int, metKleur, nieuwFormaat bool) *lasBlok {
	rl := int64(kop.PuntRecordLengte)
	b := &lasBlok{x: make([]float64, n), y: make([]float64, n), z: make([]float64, n), k: make([]uint8, n)}
	if metKleur {
		b.r, b.g, b.b = make([]uint16, n), make([]uint16, n), make([]uint16, n)
	}
	le := binary.LittleEndian
	for i := 0; i < n; i++ {
		p := buf[int64(i)*rl:]
		// float64(a*b) + c: geen samengevoegde bewerking, net als JavaScript
		b.x[i] = float64(float64(int32(le.Uint32(p[0:])))*kop.XSchaal) + kop.XOffset
		b.y[i] = float64(float64(int32(le.Uint32(p[4:])))*kop.YSchaal) + kop.YOffset
		b.z[i] = float64(float64(int32(le.Uint32(p[8:])))*kop.ZSchaal) + kop.ZOffset
		if nieuwFormaat {
			b.k[i] = p[16]
		} else {
			b.k[i] = p[15] & 31
		}
		if metKleur {
			b.r[i], b.g[i], b.b[i] = le.Uint16(p[rgbOff:]), le.Uint16(p[rgbOff+2:]), le.Uint16(p[rgbOff+4:])
		}
	}
	return b
}
