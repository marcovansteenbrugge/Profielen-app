package main

// Tests voor de eigen bestandstoegang (plan eigen-bestandstoegang, F0).

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

type proef struct {
	t       *testing.T
	api     *bestandsAPI
	srv     *httptest.Server
	sleutel string
	map_    string // toegestane map
	buiten  string // map die niet is toegestaan
}

func nieuweProef(t *testing.T) *proef {
	t.Helper()
	basis := t.TempDir()
	map_ := filepath.Join(basis, "project")
	buiten := filepath.Join(basis, "geheim")
	os.MkdirAll(map_, 0o755)
	os.MkdirAll(buiten, 0o755)
	os.WriteFile(filepath.Join(buiten, "wachtwoorden.txt"), []byte("niet voor jou"), 0o644)

	api := nieuweBestandsAPI(0)
	mux := http.NewServeMux()
	api.registreer(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	api.poort = srv.Listener.Addr().(*net.TCPAddr).Port
	if err := api.staToe(map_); err != nil {
		t.Fatal(err)
	}
	return &proef{t: t, api: api, srv: srv, sleutel: api.geefSleutel(), map_: map_, buiten: buiten}
}

// vraag doet een verzoek met de juiste sleutel; pas het verzoek aan met aan.
func (p *proef) vraag(methode, route, pad string, body []byte, aan func(*http.Request)) *http.Response {
	p.t.Helper()
	u := p.srv.URL + pvPrefix + route
	extra := ""
	if strings.HasSuffix(pad, "&recursief=1") {
		pad, extra = strings.TrimSuffix(pad, "&recursief=1"), "&recursief=1"
	}
	if pad != "" {
		u += "?pad=" + url.QueryEscape(pad) + extra
	}
	r, err := http.NewRequest(methode, u, bytes.NewReader(body))
	if err != nil {
		p.t.Fatal(err)
	}
	r.Header.Set(sleutelHeader, p.sleutel)
	if aan != nil {
		aan(r)
	}
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		p.t.Fatal(err)
	}
	p.t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func (p *proef) verwacht(resp *http.Response, code int) []byte {
	p.t.Helper()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != code {
		p.t.Fatalf("%s %s: status %d, verwacht %d (%s)", resp.Request.Method, resp.Request.URL, resp.StatusCode, code, b)
	}
	return b
}

func (p *proef) schrijfStart(pad string) string {
	p.t.Helper()
	b := p.verwacht(p.vraag("POST", "fs/schrijf/start", pad, nil, nil), 200)
	var uit struct{ ID string }
	json.Unmarshal(b, &uit)
	if uit.ID == "" {
		p.t.Fatalf("geen stroom-id: %s", b)
	}
	return uit.ID
}

func (p *proef) stroomVraag(route, id string, body []byte) *http.Response {
	p.t.Helper()
	r, _ := http.NewRequest("POST", p.srv.URL+pvPrefix+route+"?id="+id, bytes.NewReader(body))
	r.Header.Set(sleutelHeader, p.sleutel)
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		p.t.Fatal(err)
	}
	p.t.Cleanup(func() { resp.Body.Close() })
	return resp
}

func TestZonderSleutel403(t *testing.T) {
	p := nieuweProef(t)
	os.WriteFile(filepath.Join(p.map_, "a.txt"), []byte("x"), 0o644)
	p.verwacht(p.vraag("GET", "fs/info", filepath.Join(p.map_, "a.txt"), nil, func(r *http.Request) { r.Header.Del(sleutelHeader) }), 403)
	p.verwacht(p.vraag("GET", "fs/info", filepath.Join(p.map_, "a.txt"), nil, func(r *http.Request) { r.Header.Set(sleutelHeader, "fout") }), 403)
	// met sleutel wel
	p.verwacht(p.vraag("GET", "fs/info", filepath.Join(p.map_, "a.txt"), nil, nil), 200)
}

func TestZonderEigenVensterDicht(t *testing.T) {
	api := nieuweBestandsAPI(0)
	mux := http.NewServeMux()
	api.registreer(mux)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	api.poort = srv.Listener.Addr().(*net.TCPAddr).Port
	// geen geefSleutel: ook een lege sleutel mag niet werken
	r, _ := http.NewRequest("GET", srv.URL+"/__pv/fs/info?pad="+url.QueryEscape(t.TempDir()), nil)
	r.Header.Set(sleutelHeader, "")
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 403 {
		t.Fatalf("status %d, verwacht 403", resp.StatusCode)
	}
}

func TestVerkeerdeHostEnOrigin403(t *testing.T) {
	p := nieuweProef(t)
	p.verwacht(p.vraag("GET", "fs/lijst", p.map_, nil, func(r *http.Request) { r.Host = "kwaad.voorbeeld:80" }), 403)
	p.verwacht(p.vraag("GET", "fs/lijst", p.map_, nil, func(r *http.Request) { r.Host = "localhost:" + strings.Split(p.srv.URL, ":")[2] }), 403)
	p.verwacht(p.vraag("GET", "fs/lijst", p.map_, nil, func(r *http.Request) { r.Header.Set("Origin", "https://kwaad.voorbeeld") }), 403)
	p.verwacht(p.vraag("GET", "fs/lijst", p.map_, nil, func(r *http.Request) { r.Header.Set("Origin", p.srv.URL) }), 200)
}

func TestPadBuitenToegestaneMap403(t *testing.T) {
	p := nieuweProef(t)
	geheim := filepath.Join(p.buiten, "wachtwoorden.txt")
	p.verwacht(p.vraag("GET", "fs/lees", geheim, nil, nil), 403)
	// via ..
	p.verwacht(p.vraag("GET", "fs/lees", p.map_+`\..\geheim\wachtwoorden.txt`, nil, nil), 403)
	p.verwacht(p.vraag("GET", "fs/lees", p.map_+`/../geheim/wachtwoorden.txt`, nil, nil), 403)
	// een map met dezelfde naam als begin ("project" en "project2") telt niet
	os.MkdirAll(p.map_+"2", 0o755)
	p.verwacht(p.vraag("GET", "fs/lijst", p.map_+"2", nil, nil), 403)
	// relatief pad en leeg pad
	p.verwacht(p.vraag("GET", "fs/lijst", `geheim`, nil, nil), 403)
	p.verwacht(p.vraag("GET", "fs/lijst", "", nil, nil), 403)
	// schrijven en verwijderen buiten de map
	p.verwacht(p.vraag("POST", "fs/schrijf/start", filepath.Join(p.buiten, "nieuw.txt"), nil, nil), 403)
	p.verwacht(p.vraag("POST", "fs/weg", geheim, nil, nil), 403)
	p.verwacht(p.vraag("POST", "fs/map", filepath.Join(p.buiten, "x"), nil, nil), 403)
	// de gekozen map zelf wordt niet verwijderd
	p.verwacht(p.vraag("POST", "fs/weg", p.map_+"&recursief=1", nil, nil), 403)
	if _, err := os.Stat(geheim); err != nil {
		t.Fatal("geheim bestand is weg:", err)
	}
	// hoofdletters maken niet uit
	p.verwacht(p.vraag("GET", "fs/lijst", strings.ToUpper(p.map_), nil, nil), 200)
}

func TestKoppelingNaarBuiten403(t *testing.T) {
	p := nieuweProef(t)
	koppeling := filepath.Join(p.map_, "koppeling")
	if err := os.Symlink(p.buiten, koppeling); err != nil {
		// symlinks vragen op Windows beheerdersrechten; een junction niet
		if uit, err := exec.Command("cmd", "/c", "mklink", "/J", koppeling, p.buiten).CombinedOutput(); err != nil {
			t.Skip("geen symlink of junction te maken:", err, string(uit))
		}
	}
	if _, err := os.Stat(filepath.Join(koppeling, "wachtwoorden.txt")); err != nil {
		t.Fatal("koppeling werkt niet:", err)
	}
	p.verwacht(p.vraag("GET", "fs/lees", filepath.Join(koppeling, "wachtwoorden.txt"), nil, nil), 403)
}

func TestInfoLijstMapWeg(t *testing.T) {
	p := nieuweProef(t)
	sub := filepath.Join(p.map_, "vakken", "0_0")
	p.verwacht(p.vraag("POST", "fs/map", sub, nil, nil), 204)
	os.WriteFile(filepath.Join(sub, "a.bin"), []byte("12345"), 0o644)
	var info struct {
		Soort, Naam string
		Grootte     int64
		Gewijzigd   int64
	}
	json.Unmarshal(p.verwacht(p.vraag("GET", "fs/info", filepath.Join(sub, "a.bin"), nil, nil), 200), &info)
	if info.Soort != "bestand" || info.Grootte != 5 || info.Naam != "a.bin" || info.Gewijzigd == 0 {
		t.Fatalf("info klopt niet: %+v", info)
	}
	p.verwacht(p.vraag("GET", "fs/info", filepath.Join(sub, "bestaat-niet"), nil, nil), 404)
	var lijst []struct{ Naam, Soort string }
	json.Unmarshal(p.verwacht(p.vraag("GET", "fs/lijst", filepath.Join(p.map_, "vakken"), nil, nil), 200), &lijst)
	if len(lijst) != 1 || lijst[0].Naam != "0_0" || lijst[0].Soort != "map" {
		t.Fatalf("lijst klopt niet: %+v", lijst)
	}
	// map met inhoud: alleen met recursief
	p.verwacht(p.vraag("POST", "fs/weg", filepath.Join(p.map_, "vakken"), nil, nil), 409)
	p.verwacht(p.vraag("POST", "fs/weg", filepath.Join(p.map_, "vakken")+"&recursief=1", nil, nil), 204)
	if _, err := os.Stat(filepath.Join(p.map_, "vakken")); !os.IsNotExist(err) {
		t.Fatal("map is niet verwijderd")
	}
	// verkeerde methode
	p.verwacht(p.vraag("POST", "fs/lees", sub, nil, nil), 405)
	p.verwacht(p.vraag("GET", "fs/weg", sub, nil, nil), 405)
}

func TestLezenMetRange(t *testing.T) {
	p := nieuweProef(t)
	pad := filepath.Join(p.map_, "wolk.bin")
	inhoud := make([]byte, 1000)
	for i := range inhoud {
		inhoud[i] = byte(i % 251)
	}
	os.WriteFile(pad, inhoud, 0o644)
	b := p.verwacht(p.vraag("GET", "fs/lees", pad, nil, func(r *http.Request) { r.Header.Set("Range", "bytes=100-199") }), 206)
	if !bytes.Equal(b, inhoud[100:200]) {
		t.Fatalf("bereik klopt niet: %d bytes", len(b))
	}
	b = p.verwacht(p.vraag("GET", "fs/lees", pad, nil, func(r *http.Request) { r.Header.Set("Range", "bytes=990-") }), 206)
	if !bytes.Equal(b, inhoud[990:]) {
		t.Fatalf("staartbereik klopt niet: %d bytes", len(b))
	}
	b = p.verwacht(p.vraag("GET", "fs/lees", pad, nil, nil), 200)
	if !bytes.Equal(b, inhoud) {
		t.Fatal("heel bestand klopt niet")
	}
}

func TestSchrijvenInDelenPasNaKlaarZichtbaar(t *testing.T) {
	p := nieuweProef(t)
	pad := filepath.Join(p.map_, "project.pvproj")
	os.WriteFile(pad, []byte("oud"), 0o644)
	id := p.schrijfStart(pad)
	p.verwacht(p.stroomVraag("fs/schrijf/deel", id, []byte("nieuw-")), 204)
	p.verwacht(p.stroomVraag("fs/schrijf/deel", id, []byte("deel2")), 204)
	// nog niet klaar: doel ongewijzigd en tijdelijk bestand niet in de lijst
	if b, _ := os.ReadFile(pad); string(b) != "oud" {
		t.Fatalf("doel veranderde vóór klaar: %q", b)
	}
	var lijst []struct{ Naam string }
	json.Unmarshal(p.verwacht(p.vraag("GET", "fs/lijst", p.map_, nil, nil), 200), &lijst)
	if len(lijst) != 1 || lijst[0].Naam != "project.pvproj" {
		t.Fatalf("lijst toont tijdelijk bestand: %+v", lijst)
	}
	p.verwacht(p.stroomVraag("fs/schrijf/klaar", id, nil), 204)
	if b, _ := os.ReadFile(pad); string(b) != "nieuw-deel2" {
		t.Fatalf("doel na klaar: %q", b)
	}
	// na klaar is de stroom weg
	p.verwacht(p.stroomVraag("fs/schrijf/deel", id, []byte("x")), 404)
	// veel stromen tegelijk (tegelschrijver)
	ids := map[string]string{}
	for i := 0; i < 200; i++ {
		v := filepath.Join(p.map_, "vak"+strings.Repeat("x", i%3)+string(rune('a'+i%26))+".bin")
		if _, al := ids[v]; al {
			continue
		}
		ids[v] = p.schrijfStart(v)
	}
	for v, id := range ids {
		p.verwacht(p.stroomVraag("fs/schrijf/deel", id, []byte(filepath.Base(v))), 204)
	}
	for v, id := range ids {
		p.verwacht(p.stroomVraag("fs/schrijf/klaar", id, nil), 204)
		if b, _ := os.ReadFile(v); string(b) != filepath.Base(v) {
			t.Fatalf("%s: %q", v, b)
		}
	}
	assertGeenTijdelijk(t, p.map_)
}

func TestAfbrekenLaatDoelOngemoeid(t *testing.T) {
	p := nieuweProef(t)
	pad := filepath.Join(p.map_, "project.pvproj")
	os.WriteFile(pad, []byte("oud"), 0o644)
	id := p.schrijfStart(pad)
	p.verwacht(p.stroomVraag("fs/schrijf/deel", id, []byte("half geschreven")), 204)
	p.verwacht(p.stroomVraag("fs/schrijf/afbreken", id, nil), 204)
	if b, _ := os.ReadFile(pad); string(b) != "oud" {
		t.Fatalf("doel veranderd na afbreken: %q", b)
	}
	// nieuw bestand afbreken: er komt niets
	nieuw := filepath.Join(p.map_, "nieuw.bin")
	id = p.schrijfStart(nieuw)
	p.verwacht(p.stroomVraag("fs/schrijf/deel", id, []byte("x")), 204)
	p.verwacht(p.stroomVraag("fs/schrijf/afbreken", id, nil), 204)
	if _, err := os.Stat(nieuw); !os.IsNotExist(err) {
		t.Fatal("afgebroken nieuw bestand bestaat toch")
	}
	p.verwacht(p.stroomVraag("fs/schrijf/klaar", id, nil), 404)
	assertGeenTijdelijk(t, p.map_)
}

func TestOpruimenBijStoppen(t *testing.T) {
	p := nieuweProef(t)
	pad := filepath.Join(p.map_, "vak.bin")
	id := p.schrijfStart(pad)
	p.verwacht(p.stroomVraag("fs/schrijf/deel", id, []byte("x")), 204)
	p.api.ruimOp()
	assertGeenTijdelijk(t, p.map_)
	if _, err := os.Stat(pad); !os.IsNotExist(err) {
		t.Fatal("doel bestaat na opruimen")
	}
}

func assertGeenTijdelijk(t *testing.T, map_ string) {
	t.Helper()
	items, _ := os.ReadDir(map_)
	for _, it := range items {
		if strings.HasSuffix(it.Name(), tijdelijkAchter) {
			t.Fatalf("tijdelijk bestand achtergebleven: %s", it.Name())
		}
	}
}

func TestKiesRoute(t *testing.T) {
	p := nieuweProef(t)
	kies := func(body string, aan func(*http.Request)) *http.Response {
		return p.vraag("POST", "kies", "", []byte(body), aan)
	}
	// zonder eigen venster (geen kiezer): 503
	p.verwacht(kies(`{"soort":"map"}`, nil), 503)
	// zonder sleutel: 403, en de kiezer wordt niet aangeroepen
	aangeroepen := 0
	gekozen := p.buiten
	p.api.kiezer = func(o kiesOpdracht) (string, error) { aangeroepen++; return gekozen, nil }
	p.verwacht(kies(`{"soort":"map"}`, func(r *http.Request) { r.Header.Del(sleutelHeader) }), 403)
	if aangeroepen != 0 {
		t.Fatal("kiezer geopend zonder sleutel")
	}
	// onbekende soort en kapotte opdracht: 400
	p.verwacht(kies(`{"soort":"alles"}`, nil), 400)
	p.verwacht(kies(`{kapot`, nil), 400)
	p.verwacht(p.vraag("GET", "kies", "", nil, nil), 405)
	// vóór de keuze is de map dicht, daarna open (B2)
	p.verwacht(p.vraag("GET", "fs/lijst", p.buiten, nil, nil), 403)
	var u struct{ Pad string }
	json.Unmarshal(p.verwacht(kies(`{"soort":"map","titel":"Kies"}`, nil), 200), &u)
	if u.Pad != p.buiten || aangeroepen != 1 {
		t.Fatalf("pad %q, %d keer aangeroepen", u.Pad, aangeroepen)
	}
	p.verwacht(p.vraag("GET", "fs/lijst", p.buiten, nil, nil), 200)
	// annuleren: leeg pad, niets extra toegestaan
	gekozen = ""
	json.Unmarshal(p.verwacht(kies(`{"soort":"open"}`, nil), 200), &u)
	if u.Pad != "" {
		t.Fatalf("annuleren gaf %q", u.Pad)
	}
	// één kiezer tegelijk
	vrij := make(chan struct{})
	bezig := make(chan struct{})
	p.api.kiezer = func(o kiesOpdracht) (string, error) { close(bezig); <-vrij; return "", nil }
	klaar := make(chan int)
	go func() {
		r, _ := http.NewRequest("POST", p.srv.URL+"/__pv/kies", strings.NewReader(`{"soort":"map"}`))
		r.Header.Set(sleutelHeader, p.sleutel)
		resp, err := http.DefaultClient.Do(r)
		if err != nil {
			klaar <- 0
			return
		}
		resp.Body.Close()
		klaar <- resp.StatusCode
	}()
	<-bezig
	p.verwacht(kies(`{"soort":"map"}`, nil), 409)
	close(vrij)
	if c := <-klaar; c != 200 {
		t.Fatalf("eerste kiezer gaf %d", c)
	}
}
