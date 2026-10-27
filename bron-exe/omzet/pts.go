package omzet

// PTS lezen (leesPts uit viewer.js). Platte tekst: eerste regel het aantal punten, daarna
// per regel "x y z" met eventueel extra kolommen (intensiteit, kleur, normalen). De regels
// worden ontleed met dezelfde regels als de viewer (Number(), trim(), split(/[\s,]+/)),
// parallel in stukken op een regelgrens, en in de volgorde van het bestand doorgegeven.

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"runtime"
	"strconv"
	"strings"
	"unicode/utf8"
)

// jsSpatie: de tekens die trim() en \s in JavaScript als witruimte zien.
func jsSpatie(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

// jsNummer is Number(tekst) van JavaScript: NaN als het geen getal is, 0 voor lege tekst.
func jsNummer(s string) float64 {
	s = strings.TrimFunc(s, jsSpatie)
	if s == "" {
		return 0
	}
	if len(s) > 2 && s[0] == '0' {
		basis := 0
		switch s[1] {
		case 'x', 'X':
			basis = 16
		case 'o', 'O':
			basis = 8
		case 'b', 'B':
			basis = 2
		}
		if basis > 0 {
			v := 0.0
			for _, c := range s[2:] {
				d := strings.IndexRune("0123456789abcdef", c|0x20)
				if c < '0' || d < 0 || d >= basis {
					return math.NaN()
				}
				v = v*float64(basis) + float64(d)
			}
			return v
		}
	}
	t := s
	if t[0] == '+' || t[0] == '-' {
		t = t[1:]
	}
	if t == "Infinity" {
		if s[0] == '-' {
			return math.Inf(-1)
		}
		return math.Inf(1)
	}
	// alleen cijfers, één punt en een exponent: wat strconv meer accepteert (inf, nan, 0x1p3,
	// 1_000) is in JavaScript geen getal
	cijfers, punt, i := 0, false, 0
	for ; i < len(t); i++ {
		c := t[i]
		if c >= '0' && c <= '9' {
			cijfers++
		} else if c == '.' && !punt {
			punt = true
		} else {
			break
		}
	}
	if cijfers == 0 {
		return math.NaN()
	}
	if i < len(t) {
		if t[i] != 'e' && t[i] != 'E' {
			return math.NaN()
		}
		i++
		if i < len(t) && (t[i] == '+' || t[i] == '-') {
			i++
		}
		if i == len(t) {
			return math.NaN()
		}
		for ; i < len(t); i++ {
			if t[i] < '0' || t[i] > '9' {
				return math.NaN()
			}
		}
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil && !errors.Is(err, strconv.ErrRange) {
		return math.NaN()
	}
	return v
}

// jsDelen is regel.split(/[\s,]+/): reeksen van witruimte en komma's scheiden; een
// scheiding aan het begin of eind geeft een leeg deel.
func jsDelen(s string) []string {
	var delen []string
	begin, inScheiding := 0, false
	for i, r := range s {
		sch := r == ',' || jsSpatie(r)
		if sch && !inScheiding {
			delen = append(delen, s[begin:i])
			inScheiding = true
		} else if !sch && inScheiding {
			begin = i
			inScheiding = false
		}
	}
	if inScheiding {
		delen = append(delen, "")
	} else {
		delen = append(delen, s[begin:])
	}
	return delen
}

func isKleur(v float64) bool { return !math.IsInf(v, 0) && v == math.Trunc(v) && v >= 0 && v <= 255 }

// rgbKolomVoor bepaalt op de eerste puntregel waar de kleur staat (zoals de viewer):
//
//	6: x y z r g b    7: x y z i r g b    9: x y z r g b nx ny nz    10: x y z i r g b nx ny nz
//
// -1 = geen kleur.
func rgbKolomVoor(delen []string) int {
	n := make([]float64, len(delen))
	for i, d := range delen {
		n[i] = jsNummer(d)
	}
	kleurOp := func(k int) bool { return len(delen) >= k+3 && isKleur(n[k]) && isKleur(n[k+1]) && isKleur(n[k+2]) }
	var voorkeur []int
	switch len(delen) {
	case 6:
		voorkeur = []int{3}
	case 7:
		voorkeur = []int{4, 3}
	case 9:
		voorkeur = []int{3, 4}
	case 10:
		voorkeur = []int{4, 3}
	default:
		if len(delen) > 6 {
			voorkeur = []int{4, 3}
		}
	}
	for _, k := range voorkeur {
		if kleurOp(k) {
			return k
		}
	}
	return -1
}

// regels roept f aan voor elke regel in b (gescheiden door \r, \n of \r\n), met de positie
// na de regel. Stopt als f false geeft.
func regels(b []byte, f func(regel []byte, begin, na int) bool) {
	begin := 0
	for i := 0; i < len(b); i++ {
		if b[i] == '\n' || b[i] == '\r' {
			if !f(b[begin:i], begin, i+1) {
				return
			}
			begin = i + 1
		}
	}
	if begin < len(b) {
		f(b[begin:], begin, len(b))
	}
}

func trimRegel(regel []byte) string {
	s := string(regel)
	if !utf8.ValidString(s) {
		s = strings.ToValidUTF8(s, "�") // zoals de tekstdecoder van de browser
	}
	return strings.TrimFunc(s, jsSpatie)
}

type ptsBlok struct {
	x, y, z, r, g, b []float64
	bytes            int64
}

// LeesPts leest alle punten en geeft ze in volgorde aan s. Stopt bij ctx.Done().
func LeesPts(ctx context.Context, f *os.File, s *Schrijver, voortgang Voortgang) error {
	st, err := f.Stat()
	if err != nil {
		return err
	}
	grootte := st.Size()
	// 1. het begin, regel voor regel: de aantal-regel en de kleurkolom (eerste puntregel)
	const kopBytes = 4 << 20
	kop := make([]byte, min(grootte, kopBytes))
	if _, err := f.ReadAt(kop, 0); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	var aantal float64 // 0 = onbekend (de viewer leest dan alles)
	start, rgbKolom, bepaald, gevonden := int64(0), -1, false, false
	regels(kop, func(regel []byte, begin, na int) bool {
		t := trimRegel(regel)
		if t == "" {
			return true
		}
		if !bepaald {
			bepaald = true
			if v := jsNummer(t); !math.IsInf(v, 0) && !math.IsNaN(v) && v == math.Trunc(v) {
				aantal, start = v, int64(na)
				return true // de aantal-regel, geen punt
			}
			start = int64(begin) // dit is al een puntregel
		}
		d := jsDelen(t)
		if eindig3(d) {
			rgbKolom, gevonden = rgbKolomVoor(d), true
			return false
		}
		return true
	})
	if !gevonden && grootte > kopBytes {
		return errors.New("PTS: in de eerste 4 MB staat geen geldige puntregel")
	}
	// 2. de rest parallel, in stukken die op een regelgrens beginnen
	const stukBytes = 4 << 20
	werkers := max(1, runtime.NumCPU()-1)
	type taak struct {
		van, tot int64
		uit      chan *ptsBlok
	}
	ctx, stop := context.WithCancel(ctx)
	defer stop()
	volgorde := make(chan chan *ptsBlok, 2*werkers)
	taken := make(chan taak)
	fouten := make(chan error, 1)
	go func() {
		defer close(volgorde)
		defer close(taken)
		van := start
		for van < grootte {
			tot := min(grootte, van+stukBytes)
			if tot < grootte {
				// tot net na het eerstvolgende regeleinde
				buf := make([]byte, 64<<10)
				for {
					n, err := f.ReadAt(buf, tot)
					i := strings.IndexAny(string(buf[:n]), "\r\n")
					if i >= 0 {
						tot += int64(i + 1)
						break
					}
					tot += int64(n)
					if err != nil || tot >= grootte {
						tot = min(tot, grootte)
						break
					}
				}
			}
			t := taak{van, tot, make(chan *ptsBlok, 1)}
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
			van = tot
		}
	}()
	for w := 0; w < werkers; w++ {
		go func() {
			for t := range taken {
				b, err := leesPtsStuk(f, t.van, t.tot, rgbKolom)
				if err != nil {
					select {
					case fouten <- err:
					default:
					}
					b = &ptsBlok{}
				}
				t.uit <- b
			}
		}()
	}
	gelezen := start
	for uit := range volgorde {
		var b *ptsBlok
		select {
		case b = <-uit:
		case <-ctx.Done():
			return ctx.Err()
		}
		select {
		case err := <-fouten:
			return err
		default:
		}
		for i := range b.x {
			if rgbKolom > 0 {
				s.VoegToe(b.x[i], b.y[i], b.z[i], b.r[i], b.g[i], b.b[i], true, 0)
			} else {
				s.VoegToe(b.x[i], b.y[i], b.z[i], 0, 0, 0, false, 0)
			}
			if aantal != 0 && float64(s.Gezien()) >= aantal {
				return s.NaBlok()
			}
		}
		gelezen += b.bytes
		if err := s.NaBlok(); err != nil {
			return err
		}
		if voortgang != nil {
			voortgang(gelezen, grootte)
		}
		if err := ctx.Err(); err != nil {
			return err
		}
	}
	return ctx.Err()
}

// eindig3: zijn de eerste drie delen eindige getallen (x, y, z)?
func eindig3(d []string) bool {
	for i := 0; i < 3; i++ {
		v := math.NaN()
		if i < len(d) {
			v = jsNummer(d[i])
		}
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return true
}

func leesPtsStuk(f io.ReaderAt, van, tot int64, rgbKolom int) (*ptsBlok, error) {
	buf := make([]byte, tot-van)
	if _, err := f.ReadAt(buf, van); err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("PTS lezen bij byte %d: %w", van, err)
	}
	b := &ptsBlok{bytes: tot - van}
	kleur := func(d []string, k int) float64 {
		if k >= len(d) {
			return 0 // +undefined is NaN, en NaN || 0 is 0
		}
		v := jsNummer(d[k])
		if math.IsNaN(v) {
			return 0
		}
		return v
	}
	regels(buf, func(regel []byte, _, _ int) bool {
		t := trimRegel(regel)
		if t == "" {
			return true
		}
		d := jsDelen(t)
		if len(d) < 3 {
			return true
		}
		x, y, z := jsNummer(d[0]), jsNummer(d[1]), jsNummer(d[2])
		if math.IsNaN(x) || math.IsInf(x, 0) || math.IsNaN(y) || math.IsInf(y, 0) || math.IsNaN(z) || math.IsInf(z, 0) {
			return true
		}
		b.x, b.y, b.z = append(b.x, x), append(b.y, y), append(b.z, z)
		if rgbKolom > 0 {
			b.r, b.g, b.b = append(b.r, kleur(d, rgbKolom)), append(b.g, kleur(d, rgbKolom+1)), append(b.b, kleur(d, rgbKolom+2))
		}
		return true
	})
	return b, nil
}
