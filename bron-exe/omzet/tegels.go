package omzet

// De tegelschrijver: maakTegelSchrijver en het afronden van importeerNaarTegels uit
// viewer.js. Formaat pv-tegels-1, 16 bytes per punt (little-endian):
//   int32 x, int32 y  (mm t.o.v. de oorsprong in info.json)
//   int32 z           (mm NAP)
//   uint8 klasse, uint8 r, g, b

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"sync"
)

const (
	TegelM        = 50
	TegelRec      = 16
	TegelFormaat  = "pv-tegels-1"
	OverzichtDoel = 2000000
	// de viewer bepaalt de kleurdiepte (8 of 16 bits) na zoveel punten
	voorraadPunten = 200000
	// een vak gaat naar schijf als zijn buffer zo groot is, of als alles samen te groot wordt
	vakBuffer    = 256 << 10
	totaalBuffer = 256 << 20
)

type vak struct {
	tx, ty     int
	n          int64
	minZ, maxZ float64
	buf        []byte
}

type punt struct {
	x, y, z  float64
	r, g, b  float64
	metKleur bool
	k        uint8
}

// Schrijver ontvangt punten in de volgorde van het bestand en schrijft de vakken.
type Schrijver struct {
	tegelMap string
	onder    bool

	ox, oy     float64
	oorsprong  bool
	vakken     map[int64]*vak
	volgorde   []*vak
	gezien     int64
	kleurMax   float64
	metKleur   bool
	deler      float64 // 0 = nog niet bepaald
	voorraad   []punt
	minX, maxX float64
	minY, maxY float64
	minZ, maxZ float64
	klassen    [256]float64
	ovAlle     *Uitdunner
	ovGrond    *Uitdunner
	rijAlle    *ovRij
	rijGrond   *ovRij
	gebufferd  int
	fout       error
}

// NieuweSchrijver schrijft de vakken in tegelMap (de map "tegels", die al moet bestaan).
func NieuweSchrijver(tegelMap string, onder bool) *Schrijver {
	s := &Schrijver{
		tegelMap: tegelMap, onder: onder, vakken: map[int64]*vak{},
		minX: math.Inf(1), maxX: math.Inf(-1), minY: math.Inf(1), maxY: math.Inf(-1), minZ: math.Inf(1), maxZ: math.Inf(-1),
		ovAlle: NieuweUitdunner(OverzichtDoel*2, onder), ovGrond: NieuweUitdunner(OverzichtDoel*2, onder),
	}
	s.rijAlle, s.rijGrond = nieuweOvRij(s.ovAlle), nieuweOvRij(s.ovGrond)
	return s
}

// Gezien: aantal ontvangen punten.
func (s *Schrijver) Gezien() int64 { return s.gezien }

func (s *Schrijver) schrijf(p punt) {
	tx, ty := int(math.Floor(p.x/TegelM)), int(math.Floor(p.y/TegelM))
	sl := int64(tx)*1048576 + int64(ty)
	t := s.vakken[sl]
	if t == nil {
		t = &vak{tx: tx, ty: ty, minZ: math.Inf(1), maxZ: math.Inf(-1)}
		s.vakken[sl] = t
		s.volgorde = append(s.volgorde, t)
	}
	var rec [TegelRec]byte
	binary.LittleEndian.PutUint32(rec[0:], uint32(naarInt32(rond(float64((p.x-s.ox)*1000)))))
	binary.LittleEndian.PutUint32(rec[4:], uint32(naarInt32(rond(float64((p.y-s.oy)*1000)))))
	binary.LittleEndian.PutUint32(rec[8:], uint32(naarInt32(rond(float64(p.z*1000)))))
	rec[12] = p.k
	var r8, g8, b8 float64
	if p.metKleur {
		r8, g8, b8 = math.Min(255, math.Floor(p.r/s.deler)), math.Min(255, math.Floor(p.g/s.deler)), math.Min(255, math.Floor(p.b/s.deler))
	}
	rec[13], rec[14], rec[15] = naarUint8(r8), naarUint8(g8), naarUint8(b8)
	if p.z < t.minZ {
		t.minZ = p.z
	}
	if p.z > t.maxZ {
		t.maxZ = p.z
	}
	t.n++
	if t.buf == nil {
		t.buf = make([]byte, 0, vakBuffer) // vaste grootte: geen verdubbeling bij append
	}
	t.buf = append(t.buf, rec[:]...)
	s.gebufferd += TegelRec
	if len(t.buf) >= vakBuffer {
		s.leeg(t)
	}
	o := ovPunt{p.x, p.y, p.z, 0, 0, 0, p.metKleur}
	if p.metKleur {
		o.r, o.g, o.b = r8, g8, b8
	}
	s.rijAlle.voegToe(o)
	if p.k == 2 {
		s.rijGrond.voegToe(o)
	}
}

// De twee overzichten (uitdunners) kosten het meeste rekenwerk; elk draait op een eigen kern.
// De schrijver geeft ze de punten in pakketjes, in dezelfde volgorde, dus de uitkomst is gelijk.
type ovPunt struct {
	x, y, z, r, g, b float64
	metKleur         bool
}

type ovRij struct {
	u      *Uitdunner
	pak    []ovPunt
	kanaal chan []ovPunt
	klaar  chan struct{}
	dicht  sync.Once
}

const ovPak = 8192

func nieuweOvRij(u *Uitdunner) *ovRij {
	r := &ovRij{u: u, pak: make([]ovPunt, 0, ovPak), kanaal: make(chan []ovPunt, 4), klaar: make(chan struct{})}
	go func() {
		defer close(r.klaar)
		for pak := range r.kanaal {
			for _, p := range pak {
				u.VoegToe(p.x, p.y, p.z, p.r, p.g, p.b, p.metKleur)
			}
		}
	}()
	return r
}

func (r *ovRij) voegToe(p ovPunt) {
	r.pak = append(r.pak, p)
	if len(r.pak) == ovPak {
		r.kanaal <- r.pak
		r.pak = make([]ovPunt, 0, ovPak)
	}
}

// sluit geeft de rest door en wacht tot de uitdunner klaar is. Mag vaker.
func (r *ovRij) sluit() {
	r.dicht.Do(func() {
		if len(r.pak) > 0 {
			r.kanaal <- r.pak
		}
		r.pak = nil
		close(r.kanaal)
	})
	<-r.klaar
}

// Stop: de overzichten stoppen (ook na een fout of afbreken, anders blijven ze in het geheugen).
func (s *Schrijver) Stop() {
	s.rijAlle.sluit()
	s.rijGrond.sluit()
}

func (s *Schrijver) bepaalDeler() {
	s.deler = 1
	if s.kleurMax > 255 { // LAS: meestal 16-bits kleur
		s.deler = 256
	}
	v := s.voorraad
	s.voorraad = nil
	for _, p := range v {
		s.schrijf(p)
	}
}

// VoegToe is voegToe(x, y, z, r, g, b, k); metKleur = false is "r is undefined". De kleur is een
// getal zoals in JavaScript (LAS: 0 tot 65535; PTS: wat er in het bestand staat).
func (s *Schrijver) VoegToe(x, y, z float64, r, g, b float64, metKleur bool, k uint8) {
	s.gezien++
	if !s.oorsprong {
		s.ox, s.oy, s.oorsprong = math.Floor(x/1000)*1000, math.Floor(y/1000)*1000, true
	}
	if x < s.minX {
		s.minX = x
	}
	if x > s.maxX {
		s.maxX = x
	}
	if y < s.minY {
		s.minY = y
	}
	if y > s.maxY {
		s.maxY = y
	}
	if z < s.minZ {
		s.minZ = z
	}
	if z > s.maxZ {
		s.maxZ = z
	}
	s.klassen[k]++
	if metKleur {
		s.metKleur = true
		if r > s.kleurMax {
			s.kleurMax = r
		}
		if g > s.kleurMax {
			s.kleurMax = g
		}
		if b > s.kleurMax {
			s.kleurMax = b
		}
	}
	p := punt{x, y, z, r, g, b, metKleur, k}
	if s.deler == 0 {
		s.voorraad = append(s.voorraad, p)
		if len(s.voorraad) >= voorraadPunten {
			s.bepaalDeler()
		}
		return
	}
	s.schrijf(p)
}

// NaBlok: na elk gelezen blok; schrijft weg als er te veel in het geheugen staat.
func (s *Schrijver) NaBlok() error {
	if s.gebufferd > totaalBuffer {
		for _, t := range s.volgorde {
			s.leeg(t)
		}
	}
	return s.fout
}

// leeg schrijft de buffer van een vak achter zijn bestand.
func (s *Schrijver) leeg(t *vak) {
	if len(t.buf) == 0 || s.fout != nil {
		return
	}
	f, err := os.OpenFile(filepath.Join(s.tegelMap, TegelNaam(t.tx, t.ty)), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err == nil {
		_, err = f.Write(t.buf)
		if e := f.Close(); err == nil {
			err = e
		}
	}
	if err != nil {
		s.fout = fmt.Errorf("vak %d_%d wegschrijven: %w", t.tx, t.ty, err)
		return
	}
	s.gebufferd -= len(t.buf)
	t.buf = t.buf[:0]
}

// TegelNaam is tegelNaam(tx, ty): "<tx>_<ty>.pvt".
func TegelNaam(tx, ty int) string { return strconv.Itoa(tx) + "_" + strconv.Itoa(ty) + ".pvt" }

// Info is info.json. De velden en hun volgorde zijn die van de viewer.
type Info struct {
	Formaat   string             `json:"formaat"`
	TegelM    int                `json:"tegelM"`
	Rec       int                `json:"rec"`
	Oorsprong [2]float64         `json:"oorsprong"`
	Aantal    int64              `json:"aantal"`
	Kleur     bool               `json:"kleur"`
	Bbox      [6]float64         `json:"bbox"`
	Klassen   map[string]float64 `json:"klassen"`
	Tegels    [][5]float64       `json:"tegels"`
	Overzicht InfoOverzicht      `json:"overzicht"`
	Gemaakt   string             `json:"gemaakt"`
	Viewer    string             `json:"viewer"`
	Bron      InfoBron           `json:"bron"`
	DuurImp   int64              `json:"duurImport"`
}

type InfoOverzicht struct {
	Modus    string `json:"modus"`
	Doel     int    `json:"doel"`
	Alle     int    `json:"alle"`
	Maaiveld *int   `json:"maaiveld,omitempty"`
}

type InfoBron struct {
	Naam      string `json:"naam"`
	Grootte   int64  `json:"grootte"`
	Gewijzigd int64  `json:"gewijzigd"`
}

// Afronden schrijft alles weg en geeft info en het overzicht van alle punten. Het
// maaiveldoverzicht volgt daarna met Grond(), zodat de twee niet tegelijk in het geheugen staan.
func (s *Schrijver) Afronden() (*Info, Punten, error) {
	if s.deler == 0 {
		s.bepaalDeler()
	}
	for _, t := range s.volgorde {
		s.leeg(t)
	}
	if s.fout != nil {
		return nil, Punten{}, s.fout
	}
	modus := "boven"
	if s.onder {
		modus = "onder"
	}
	info := &Info{
		Formaat: TegelFormaat, TegelM: TegelM, Rec: TegelRec, Oorsprong: [2]float64{s.ox, s.oy},
		Aantal: s.gezien, Kleur: s.metKleur && s.kleurMax > 0,
		Bbox:      [6]float64{s.minX, s.minY, s.minZ, s.maxX, s.maxY, s.maxZ},
		Klassen:   map[string]float64{},
		Overzicht: InfoOverzicht{Modus: modus, Doel: OverzichtDoel},
	}
	for i, n := range s.klassen {
		if n > 0 {
			info.Klassen[strconv.Itoa(i)] = n
		}
	}
	for _, t := range s.volgorde {
		info.Tegels = append(info.Tegels, [5]float64{float64(t.tx), float64(t.ty), float64(t.n), rond(float64(t.minZ*1000)) / 1000, rond(float64(t.maxZ*1000)) / 1000})
	}
	s.Stop() // de overzichten hebben alle punten gehad
	if !s.metGrond() {
		s.ovGrond = nil // niet nodig: geheugen vrij
	}
	alle := s.overzicht(s.ovAlle)
	s.ovAlle = nil
	return info, alle, nil
}

// metGrond: genoeg maaiveldpunten (klasse 2) voor een eigen overzicht?
func (s *Schrijver) metGrond() bool {
	return s.klassen[2] >= math.Max(50, float64(float64(s.gezien)*0.01))
}

func (s *Schrijver) overzicht(u *Uitdunner) Punten {
	r := u.Resultaat()
	if len(r.Xs) > OverzichtDoel {
		return DunUit(r, OverzichtDoel, s.onder)
	}
	return r
}

// Grond: het maaiveldoverzicht (na Afronden), of nil als er te weinig maaiveldpunten zijn.
func (s *Schrijver) Grond() *Punten {
	if s.ovGrond == nil {
		return nil
	}
	g := s.overzicht(s.ovGrond)
	s.ovGrond = nil
	return &g
}

// TegelBytes is puntenNaarTegelBytes(p, ox, oy): het overzicht in het tegelformaat (klasse 0).
func TegelBytes(p Punten, ox, oy float64) []byte {
	buf := make([]byte, len(p.Xs)*TegelRec)
	for i := range p.Xs {
		o := i * TegelRec
		binary.LittleEndian.PutUint32(buf[o:], uint32(naarInt32(rond(float64((p.Xs[i]-ox)*1000)))))
		binary.LittleEndian.PutUint32(buf[o+4:], uint32(naarInt32(rond(float64((p.Ys[i]-oy)*1000)))))
		binary.LittleEndian.PutUint32(buf[o+8:], uint32(naarInt32(rond(float64(p.Zs[i]*1000)))))
		var c uint32
		if p.Cs != nil {
			c = p.Cs[i]
		}
		buf[o+12], buf[o+13], buf[o+14], buf[o+15] = 0, byte(c>>16), byte(c>>8), byte(c)
	}
	return buf
}

// SchrijfInfo schrijft info.json zoals JSON.stringify(info, null, 1).
func SchrijfInfo(pad string, info *Info) error {
	b, err := json.MarshalIndent(info, "", " ")
	if err != nil {
		return err
	}
	return os.WriteFile(pad, b, 0o644)
}
