package main

// Eigen bestandstoegang (plan eigen-bestandstoegang, F0): de exe leest en schrijft
// de bestanden van de viewer zelf, zodat het eigen venster geen toestemmingsvragen
// van de browser meer krijgt.
//
// Afscherming, want de server op 127.0.0.1 is ook bereikbaar vanuit een gewone
// browser op deze pc:
//   - elk verzoek naar /__pv/ moet de sessiesleutel meesturen (header X-PV-Sleutel);
//     die krijgt alleen het eigen WebView2-venster (window.__pvNatief, via Init);
//     zonder eigen venster wordt geen sleutel uitgegeven en is /__pv/ dicht;
//   - Host moet 127.0.0.1:<poort> zijn (tegen DNS-rebinding) en een Origin, als die
//     er is, http://127.0.0.1:<poort>;
//   - alleen paden binnen een toegestane map (besluit B2: mappen en bestanden die de
//     gebruiker zelf koos of die in de recente lijst staan). Daarbuiten 403.
//
// Routes (alle paden absoluut, als ?pad=):
//   GET  /__pv/fs/info      bestaat, soort, grootte, gewijzigd (ms), naam
//   GET  /__pv/fs/lijst     namen met soort
//   GET  /__pv/fs/lees      de bytes; Range: bytes=a-b werkt
//   POST /__pv/fs/schrijf/start → {id}; …/deel?id= (body erachter, of met &positie=
//        op die plek, zodat stukken tegelijk kunnen); …/klaar?id=
//        (tijdelijk bestand wordt het doel); …/afbreken?id= (doel blijft ongemoeid)
//   POST /__pv/fs/map       map maken, met tussenmappen
//   POST /__pv/fs/weg       verwijderen (&recursief=1 voor een map met inhoud)
//   POST /__pv/kies         Windows-kiezer (F1), body {soort: "map"|"open"|"opslaan",
//        titel, filter: [{naam, patroon}], naam, extensie} → {pad} ("" = geannuleerd);
//        het gekozen pad wordt een toegestane plek

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

const (
	pvPrefix      = "/__pv/"
	sleutelHeader = "X-PV-Sleutel"
	// tijdelijke bestanden van open schrijfstromen; lijst laat ze niet zien
	tijdelijkAchter = ".pvtmp"
	maxStromen      = 8192
	maxPositie      = 1 << 40 // 1 TB
)

type schrijfStroom struct {
	doel, tijdelijk string
	f               *os.File
	// delen met een positie mogen tegelijk binnenkomen (RLock); erachter schrijven en
	// afsluiten gaan alleen (Lock)
	mu sync.RWMutex
}

// kiesOpdracht: wat de viewer aan de Windows-kiezer vraagt
type kiesOpdracht struct {
	Soort  string `json:"soort"` // "map", "open" of "opslaan"
	Titel  string `json:"titel"`
	Filter []struct {
		Naam    string `json:"naam"`    // bv. "Projectbestand"
		Patroon string `json:"patroon"` // bv. "*.pvproj"
	} `json:"filter"`
	Naam     string `json:"naam"`     // voorgestelde bestandsnaam bij opslaan
	Extensie string `json:"extensie"` // standaardextensie bij opslaan, zonder punt
}

type bestandsAPI struct {
	poort int
	// kiezer opent de Windows-kiezer modaal voor het venster; nil = geen eigen venster
	kiezer    func(kiesOpdracht) (string, error)
	kiesBezig sync.Mutex

	mu         sync.Mutex
	sleutel    string // "" = nog niet uitgegeven: alles dicht
	toegestaan []string
	stromen    map[string]*schrijfStroom
}

func nieuweBestandsAPI(poort int) *bestandsAPI {
	return &bestandsAPI{poort: poort, stromen: map[string]*schrijfStroom{}}
}

// geefSleutel maakt de sessiesleutel (eenmalig) en zet daarmee /__pv/ open. Alleen
// aanroepen voor het eigen venster.
func (a *bestandsAPI) geefSleutel() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.sleutel == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			log.Println("sessiesleutel maken mislukt:", err)
			return ""
		}
		a.sleutel = hex.EncodeToString(b)
	}
	return a.sleutel
}

// staToe voegt een map of bestand toe aan de toegestane plekken (B2). Wordt
// aangeroepen door de kiezer, de startparameter en de recente lijst.
func (a *bestandsAPI) staToe(pad string) error {
	if !filepath.IsAbs(pad) {
		return fmt.Errorf("geen absoluut pad: %s", pad)
	}
	echt, err := echtPad(pad)
	if err != nil {
		return err
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, t := range a.toegestaan {
		if strings.EqualFold(t, echt) {
			return nil
		}
	}
	a.toegestaan = append(a.toegestaan, echt)
	log.Println("bestandstoegang toegestaan voor", echt)
	return nil
}

// echtPad: schoon absoluut pad met snelkoppelingen (junctions, symlinks) opgelost,
// ook als het laatste deel nog niet bestaat. Zo kan een koppeling binnen een
// toegestane map niet naar een plek daarbuiten leiden.
func echtPad(pad string) (string, error) {
	pad = filepath.Clean(pad)
	rest := ""
	p := pad
	for {
		if e, err := vastPad(p); err == nil {
			if rest != "" {
				e = filepath.Join(e, rest)
			}
			return e, nil
		}
		ouder := filepath.Dir(p)
		if ouder == p {
			return pad, nil
		}
		if rest == "" {
			rest = filepath.Base(p)
		} else {
			rest = filepath.Join(filepath.Base(p), rest)
		}
		p = ouder
	}
}

// binnen: ligt pad in (of is het) een toegestane plek? Geeft het echte pad terug.
func (a *bestandsAPI) binnen(pad string) (string, bool) {
	if pad == "" || !filepath.IsAbs(pad) {
		return "", false
	}
	echt, err := echtPad(pad)
	if err != nil {
		return "", false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, t := range a.toegestaan {
		if strings.EqualFold(echt, t) {
			return echt, true
		}
		// hoofdletters maken op Windows niet uit
		basis := strings.TrimRight(t, `\/`) + string(filepath.Separator)
		if len(echt) > len(basis) && strings.EqualFold(echt[:len(basis)], basis) {
			return echt, true
		}
	}
	return "", false
}

func (a *bestandsAPI) isWortel(echt string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, t := range a.toegestaan {
		if strings.EqualFold(echt, t) {
			return true
		}
	}
	return false
}

// toegang controleert sleutel, Host en Origin.
func (a *bestandsAPI) toegang(r *http.Request) error {
	a.mu.Lock()
	sleutel := a.sleutel
	a.mu.Unlock()
	if sleutel == "" {
		return errors.New("geen eigen venster: bestandstoegang staat uit")
	}
	if subtle.ConstantTimeCompare([]byte(r.Header.Get(sleutelHeader)), []byte(sleutel)) != 1 {
		return errors.New("verkeerde of ontbrekende sessiesleutel")
	}
	host := fmt.Sprintf("127.0.0.1:%d", a.poort)
	if r.Host != host {
		return fmt.Errorf("verkeerde Host %q", r.Host)
	}
	if o := r.Header.Get("Origin"); o != "" && o != "http://"+host {
		return fmt.Errorf("verkeerde Origin %q", o)
	}
	return nil
}

func (a *bestandsAPI) registreer(mux *http.ServeMux) { mux.Handle(pvPrefix, a) }

func (a *bestandsAPI) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if err := a.toegang(r); err != nil {
		log.Printf("bestandstoegang geweigerd (%s %s): %v", r.Method, r.URL.Path, err)
		http.Error(w, "geen toegang", http.StatusForbidden)
		return
	}
	route := strings.TrimPrefix(r.URL.Path, pvPrefix)
	if route == "kies" {
		if r.Method != http.MethodPost {
			http.Error(w, "alleen POST", http.StatusMethodNotAllowed)
			return
		}
		a.kies(w, r)
		return
	}
	lezen := route == "fs/info" || route == "fs/lijst" || route == "fs/lees"
	if lezen && r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "alleen GET", http.StatusMethodNotAllowed)
		return
	}
	if !lezen && r.Method != http.MethodPost {
		http.Error(w, "alleen POST", http.StatusMethodNotAllowed)
		return
	}
	switch route {
	case "fs/schrijf/deel":
		a.schrijfDeel(w, r)
		return
	case "fs/schrijf/klaar":
		a.schrijfKlaar(w, r)
		return
	case "fs/schrijf/afbreken":
		a.schrijfAfbreken(w, r)
		return
	}
	pad, ok := a.binnen(r.URL.Query().Get("pad"))
	if !ok {
		log.Printf("bestandstoegang geweigerd (%s %s): pad %q buiten toegestane mappen", r.Method, route, r.URL.Query().Get("pad"))
		http.Error(w, "pad buiten toegestane mappen", http.StatusForbidden)
		return
	}
	switch route {
	case "fs/info":
		a.info(w, pad)
	case "fs/lijst":
		a.lijst(w, pad)
	case "fs/lees":
		a.lees(w, r, pad)
	case "fs/schrijf/start":
		a.schrijfStart(w, pad)
	case "fs/map":
		if err := os.MkdirAll(pad, 0o755); err != nil {
			bestandsFout(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case "fs/weg":
		a.weg(w, r, pad)
	default:
		http.NotFound(w, r)
	}
}

func bestandsFout(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, os.ErrNotExist):
		http.Error(w, "bestaat niet", http.StatusNotFound)
	case errors.Is(err, os.ErrExist):
		// ook "map is niet leeg" (verwijderen zonder recursief)
		http.Error(w, "bestaat al of map is niet leeg", http.StatusConflict)
	default:
		log.Println("bestandsfout:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func stuurJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(v)
}

func (a *bestandsAPI) info(w http.ResponseWriter, pad string) {
	st, err := os.Stat(pad)
	if errors.Is(err, os.ErrNotExist) {
		// geen 404: de viewer kijkt vaak of iets al bestaat, en de browser meldt elke
		// 404 als fout in de console
		stuurJSON(w, map[string]any{"bestaat": false})
		return
	}
	if err != nil {
		bestandsFout(w, err)
		return
	}
	soort := "bestand"
	if st.IsDir() {
		soort = "map"
	}
	stuurJSON(w, map[string]any{
		"bestaat": true, "soort": soort, "naam": st.Name(), "grootte": st.Size(),
		"gewijzigd": st.ModTime().UnixMilli(),
	})
}

func (a *bestandsAPI) lijst(w http.ResponseWriter, pad string) {
	items, err := os.ReadDir(pad)
	if err != nil {
		bestandsFout(w, err)
		return
	}
	type item struct {
		Naam  string `json:"naam"`
		Soort string `json:"soort"`
	}
	uit := []item{}
	for _, it := range items {
		if strings.HasSuffix(it.Name(), tijdelijkAchter) {
			continue
		}
		soort := "bestand"
		if it.IsDir() {
			soort = "map"
		}
		uit = append(uit, item{it.Name(), soort})
	}
	stuurJSON(w, uit)
}

func (a *bestandsAPI) lees(w http.ResponseWriter, r *http.Request, pad string) {
	f, err := os.Open(pad)
	if err != nil {
		bestandsFout(w, err)
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		bestandsFout(w, err)
		return
	}
	if st.IsDir() {
		http.Error(w, "is een map", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	// ServeContent regelt Range (206) en de lengte
	http.ServeContent(w, r, "", st.ModTime(), f)
}

func (a *bestandsAPI) schrijfStart(w http.ResponseWriter, pad string) {
	if st, err := os.Stat(pad); err == nil && st.IsDir() {
		http.Error(w, "is een map", http.StatusBadRequest)
		return
	}
	b := make([]byte, 12)
	rand.Read(b)
	id := hex.EncodeToString(b)
	tijdelijk := filepath.Join(filepath.Dir(pad), "."+filepath.Base(pad)+"."+id+tijdelijkAchter)
	f, err := os.OpenFile(tijdelijk, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		bestandsFout(w, err)
		return
	}
	a.mu.Lock()
	if len(a.stromen) >= maxStromen {
		a.mu.Unlock()
		f.Close()
		os.Remove(tijdelijk)
		http.Error(w, "te veel open schrijfstromen", http.StatusServiceUnavailable)
		return
	}
	a.stromen[id] = &schrijfStroom{doel: pad, tijdelijk: tijdelijk, f: f}
	a.mu.Unlock()
	stuurJSON(w, map[string]string{"id": id})
}

func (a *bestandsAPI) stroom(id string) *schrijfStroom {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.stromen[id]
}

func (a *bestandsAPI) neemStroom(id string) *schrijfStroom {
	a.mu.Lock()
	defer a.mu.Unlock()
	s := a.stromen[id]
	delete(a.stromen, id)
	return s
}

func (a *bestandsAPI) schrijfDeel(w http.ResponseWriter, r *http.Request) {
	s := a.stroom(r.URL.Query().Get("id"))
	if s == nil {
		http.Error(w, "onbekende schrijfstroom", http.StatusNotFound)
		return
	}
	var err error
	if p := r.URL.Query().Get("positie"); p != "" {
		// op een vaste plek: grote bestanden komen in stukken tegelijk binnen (sneller)
		positie, e := strconv.ParseInt(p, 10, 64)
		if e != nil || positie < 0 || positie > maxPositie {
			http.Error(w, "ongeldige positie", http.StatusBadRequest)
			return
		}
		s.mu.RLock()
		_, err = io.Copy(io.NewOffsetWriter(s.f, positie), r.Body)
		s.mu.RUnlock()
	} else {
		s.mu.Lock()
		_, err = io.Copy(s.f, r.Body)
		s.mu.Unlock()
	}
	if err != nil {
		bestandsFout(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *bestandsAPI) schrijfKlaar(w http.ResponseWriter, r *http.Request) {
	s := a.neemStroom(r.URL.Query().Get("id"))
	if s == nil {
		http.Error(w, "onbekende schrijfstroom", http.StatusNotFound)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	err := s.f.Close()
	if err == nil {
		// os.Rename vervangt op Windows een bestaand doel (MOVEFILE_REPLACE_EXISTING)
		err = os.Rename(s.tijdelijk, s.doel)
	}
	if err != nil {
		os.Remove(s.tijdelijk)
		bestandsFout(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *bestandsAPI) schrijfAfbreken(w http.ResponseWriter, r *http.Request) {
	if s := a.neemStroom(r.URL.Query().Get("id")); s != nil {
		s.mu.Lock()
		s.f.Close()
		os.Remove(s.tijdelijk)
		s.mu.Unlock()
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *bestandsAPI) weg(w http.ResponseWriter, r *http.Request, pad string) {
	if a.isWortel(pad) {
		http.Error(w, "een gekozen map zelf wordt niet verwijderd", http.StatusForbidden)
		return
	}
	var err error
	if r.URL.Query().Get("recursief") == "1" {
		if _, err = os.Lstat(pad); err == nil {
			err = os.RemoveAll(pad)
		}
	} else {
		err = os.Remove(pad)
	}
	if err != nil {
		bestandsFout(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// kies opent de Windows-kiezer en zet het gekozen pad open (B2: de gebruiker koos het zelf).
func (a *bestandsAPI) kies(w http.ResponseWriter, r *http.Request) {
	var o kiesOpdracht
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&o); err != nil {
		http.Error(w, "ongeldige opdracht", http.StatusBadRequest)
		return
	}
	if o.Soort != "map" && o.Soort != "open" && o.Soort != "opslaan" {
		http.Error(w, "soort moet map, open of opslaan zijn", http.StatusBadRequest)
		return
	}
	if a.kiezer == nil {
		http.Error(w, "geen eigen venster", http.StatusServiceUnavailable)
		return
	}
	// één kiezer tegelijk
	if !a.kiesBezig.TryLock() {
		http.Error(w, "er staat al een kiezer open", http.StatusConflict)
		return
	}
	defer a.kiesBezig.Unlock()
	pad, err := a.kiezer(o)
	if err != nil {
		log.Println("kiezer:", err)
		http.Error(w, "kiezer mislukt: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if pad == "" {
		log.Printf("kiezer (%s): geannuleerd", o.Soort)
	} else {
		log.Printf("kiezer (%s): gekozen %s", o.Soort, pad)
		if err := a.staToe(pad); err != nil {
			bestandsFout(w, err)
			return
		}
	}
	stuurJSON(w, map[string]string{"pad": pad})
}

// ruimOp sluit open schrijfstromen en haalt hun tijdelijke bestanden weg; bij het
// stoppen van de exe.
func (a *bestandsAPI) ruimOp() {
	a.mu.Lock()
	stromen := a.stromen
	a.stromen = map[string]*schrijfStroom{}
	a.mu.Unlock()
	for _, s := range stromen {
		s.mu.Lock()
		s.f.Close()
		os.Remove(s.tijdelijk)
		s.mu.Unlock()
	}
	if len(stromen) > 0 {
		log.Println("bij stoppen", len(stromen), "open schrijfstromen opgeruimd")
	}
}
