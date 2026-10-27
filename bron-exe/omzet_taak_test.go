package main

// Tests voor de omzettaak (plan omzetten-in-exe, F2).

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// scanIn kopieert de testwolk (3 mln punten, ± 2,5 s omzetten) naar dir.
func scanIn(t *testing.T, dir string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("..", "testdata", "groot", "dijk_begroeid.las"))
	if err != nil {
		t.Skip("testwolk ontbreekt:", err)
	}
	pad := filepath.Join(dir, "dijk.las")
	if err := os.WriteFile(pad, b, 0o644); err != nil {
		t.Fatal(err)
	}
	return pad
}

func (p *proef) omzetStart(bron, doel string, aan func(*http.Request)) *http.Response {
	b, _ := json.Marshal(map[string]string{"bron": bron, "doel": doel, "modus": "boven"})
	return p.vraag("POST", "omzet/start", "", b, aan)
}

func (p *proef) omzetStand(id string) omzetStand {
	p.t.Helper()
	r, _ := http.NewRequest("GET", p.srv.URL+"/__pv/omzet/stand?id="+id, nil)
	r.Header.Set(sleutelHeader, p.sleutel)
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	var s omzetStand
	json.NewDecoder(resp.Body).Decode(&s)
	return s
}

func geenTijdelijkeMappen(t *testing.T, dir string) {
	t.Helper()
	items, _ := os.ReadDir(dir)
	for _, it := range items {
		if strings.HasSuffix(it.Name(), tijdelijkAchter) {
			t.Fatalf("tijdelijke map blijft staan: %s", it.Name())
		}
	}
}

func TestOmzetAfscherming(t *testing.T) {
	p := nieuweProef(t)
	bron := scanIn(t, p.map_)
	buitenBron := scanIn(t, p.buiten)
	doel := filepath.Join(p.map_, "puntenwolk", "A - dijk")
	p.verwacht(p.omzetStart(bron, doel, func(r *http.Request) { r.Header.Del(sleutelHeader) }), 403)
	p.verwacht(p.omzetStart(buitenBron, doel, nil), 403)
	p.verwacht(p.omzetStart(bron, filepath.Join(p.buiten, "A"), nil), 403)
	p.verwacht(p.omzetStart(bron, p.map_, nil), 403) // de gekozen map zelf niet vervangen
	p.verwacht(p.vraag("POST", "omzet/start", "", []byte(`{"bron":"x","doel":"y","modus":"schuin"}`), nil), 400)
	if _, err := os.Stat(doel); !os.IsNotExist(err) {
		t.Fatal("doel aangemaakt bij een geweigerde opdracht")
	}
}

func TestOmzetAfbrekenLaatNietsAchter(t *testing.T) {
	p := nieuweProef(t)
	bron := scanIn(t, p.map_)
	pw := filepath.Join(p.map_, "puntenwolk")
	doel := filepath.Join(pw, "A - dijk")
	var id struct{ ID string }
	json.Unmarshal(p.verwacht(p.omzetStart(bron, doel, nil), 200), &id)
	// een tweede omzetting tegelijk: geweigerd
	p.verwacht(p.omzetStart(bron, filepath.Join(pw, "B - dijk"), nil), 409)
	time.Sleep(300 * time.Millisecond)
	if s := p.omzetStand(id.ID); s.Fase != "lezen" {
		t.Fatalf("fase %q, verwacht lezen", s.Fase)
	}
	r, _ := http.NewRequest("POST", p.srv.URL+"/__pv/omzet/afbreken?id="+id.ID, nil)
	r.Header.Set(sleutelHeader, p.sleutel)
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	if s := p.omzetStand(id.ID); s.Fase != "afgebroken" {
		t.Fatalf("fase %q na afbreken", s.Fase)
	}
	if _, err := os.Stat(doel); !os.IsNotExist(err) {
		t.Fatal("na afbreken staat er een doelmap")
	}
	geenTijdelijkeMappen(t, pw)
	// daarna kan een nieuwe omzetting wel
	p.verwacht(p.omzetStart(bron, doel, nil), 200)
	p.api.stopOmzetten()
	geenTijdelijkeMappen(t, pw)
}

func TestOmzetVervangtOudDoel(t *testing.T) {
	p := nieuweProef(t)
	bron := scanIn(t, p.map_)
	pw := filepath.Join(p.map_, "puntenwolk")
	doel := filepath.Join(pw, "A - dijk")
	os.MkdirAll(filepath.Join(doel, "tegels"), 0o755)
	os.WriteFile(filepath.Join(doel, "tegels", "9_9.pvt"), []byte("oud"), 0o644)
	var id struct{ ID string }
	json.Unmarshal(p.verwacht(p.omzetStart(bron, doel, nil), 200), &id)
	var s omzetStand
	for i := 0; i < 600; i++ {
		if s = p.omzetStand(id.ID); s.Fase == "klaar" || s.Fase == "fout" {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if s.Fase != "klaar" || s.Info == nil || s.Info.Aantal != 3000000 || s.Gelezen != 3000000 {
		t.Fatalf("stand %+v", s)
	}
	if _, err := os.Stat(filepath.Join(doel, "tegels", "9_9.pvt")); !os.IsNotExist(err) {
		t.Fatal("oud vak staat er nog")
	}
	for _, n := range []string{"info.json", "overzicht.pvt", "overzicht_maaiveld.pvt", filepath.Join("tegels", "1640_7780.pvt")} {
		if _, err := os.Stat(filepath.Join(doel, n)); err != nil {
			t.Errorf("%s ontbreekt", n)
		}
	}
	geenTijdelijkeMappen(t, pw)
	// een kapotte scan: fout, niets achtergelaten
	kapot := filepath.Join(p.map_, "kapot.las")
	os.WriteFile(kapot, []byte("LASF niet echt"), 0o644)
	json.Unmarshal(p.verwacht(p.omzetStart(kapot, filepath.Join(pw, "A - kapot"), nil), 200), &id)
	for i := 0; i < 100; i++ {
		if s = p.omzetStand(id.ID); s.Fase != "lezen" && s.Fase != "afronden" {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if s.Fase != "fout" || s.Fout == "" {
		t.Fatalf("kapotte scan: stand %+v", s)
	}
	if _, err := os.Stat(filepath.Join(pw, "A - kapot")); !os.IsNotExist(err) {
		t.Fatal("bij een fout staat er een doelmap")
	}
	geenTijdelijkeMappen(t, pw)
}
