package main

// Tests voor recente projecten en de startparameter (plan eigen-bestandstoegang, F3).

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecent(t *testing.T) {
	p := nieuweProef(t)
	bestand := filepath.Join(t.TempDir(), "recent.json")
	p.api.laadRecent(bestand)
	var lijst []recentProject
	json.Unmarshal(p.verwacht(p.vraag("GET", "recent", "", nil, nil), 200), &lijst)
	if len(lijst) != 0 {
		t.Fatalf("nieuwe lijst niet leeg: %+v", lijst)
	}
	zet := func(pad string) *http.Response {
		b, _ := json.Marshal(map[string]string{"pad": pad})
		return p.vraag("POST", "recent", "", b, nil)
	}
	// alleen een toegestane map
	p.verwacht(zet(p.buiten), 403)
	p.verwacht(zet(p.map_), 204)
	// 9 mappen erbij: maximaal 8, nieuwste eerst, geen dubbele
	for i := 0; i < 9; i++ {
		m := filepath.Join(p.map_, "proj"+string(rune('a'+i)))
		os.MkdirAll(m, 0o755)
		p.verwacht(zet(m), 204)
	}
	p.verwacht(zet(strings.ToUpper(filepath.Join(p.map_, "proji"))), 204)
	json.Unmarshal(p.verwacht(p.vraag("GET", "recent", "", nil, nil), 200), &lijst)
	if len(lijst) != maxRecent || !strings.EqualFold(lijst[0].Pad, echt(filepath.Join(p.map_, "proji"))) || !lijst[0].Bestaat {
		t.Fatalf("lijst klopt niet: %d, eerste %+v", len(lijst), lijst[0])
	}
	// verplaatste map: bestaat=false
	os.Rename(filepath.Join(p.map_, "projh"), filepath.Join(p.map_, "verplaatst"))
	json.Unmarshal(p.verwacht(p.vraag("GET", "recent", "", nil, nil), 200), &lijst)
	if lijst[1].Bestaat {
		t.Fatalf("verplaatste map meldt bestaat: %+v", lijst[1])
	}
	b, _ := json.Marshal(map[string]string{"pad": lijst[1].Pad})
	p.verwacht(p.vraag("POST", "recent/weg", "", b, nil), 204)
	json.Unmarshal(p.verwacht(p.vraag("GET", "recent", "", nil, nil), 200), &lijst)
	if len(lijst) != maxRecent-1 {
		t.Fatalf("na weg: %d", len(lijst))
	}
	// zonder sleutel geen lijst
	p.verwacht(p.vraag("GET", "recent", "", nil, func(r *http.Request) { r.Header.Del(sleutelHeader) }), 403)

	// na een herstart: de mappen uit de lijst zijn weer toegestaan (B2), andere niet
	api := nieuweBestandsAPI(0)
	api.laadRecent(bestand)
	if _, ok := api.binnen(filepath.Join(p.map_, "proji", "x.pvproj")); !ok {
		t.Fatal("recente map na herstart niet toegestaan")
	}
	if _, ok := api.binnen(filepath.Join(p.map_, "proja")); ok {
		t.Fatal("uit de lijst gevallen map na herstart toegestaan")
	}
	if _, ok := api.binnen(p.buiten); ok {
		t.Fatal("andere map na herstart toegestaan")
	}
}

// echt: het pad zoals de exe het opslaat (lange namen, snelkoppelingen opgelost)
func echt(pad string) string { e, _ := echtPad(pad); return e }

func TestProjectPad(t *testing.T) {
	d := t.TempDir()
	proj := filepath.Join(d, "dijk")
	os.MkdirAll(proj, 0o755)
	os.WriteFile(filepath.Join(proj, "dijk.pvproj"), []byte("{}"), 0o644)
	os.WriteFile(filepath.Join(proj, "wolk.las"), []byte("x"), 0o644)
	gevallen := map[string]string{
		filepath.Join(proj, "dijk.pvproj"):         proj,
		filepath.Join(proj, "DIJK.PVPROJ"):         proj,
		proj:                                       proj,
		filepath.Join(proj, "wolk.las"):            "",
		filepath.Join(proj, "bestaat-niet.pvproj"): "",
		"--browservenster":                         "",
		"":                                         "",
	}
	for arg, wil := range gevallen {
		if kreeg := projectPad(arg); !strings.EqualFold(kreeg, wil) {
			t.Errorf("projectPad(%q) = %q, wil %q", arg, kreeg, wil)
		}
	}
}

func TestKiesProjectbestandZetMapOpen(t *testing.T) {
	p := nieuweProef(t)
	proj := filepath.Join(p.buiten, "proj")
	os.MkdirAll(filepath.Join(proj, "puntenwolk"), 0o755)
	os.WriteFile(filepath.Join(proj, "proj.pvproj"), []byte("{}"), 0o644)
	p.api.kiezer = func(o kiesOpdracht) (string, error) { return filepath.Join(proj, "proj.pvproj"), nil }
	p.verwacht(p.vraag("POST", "kies", "", []byte(`{"soort":"open"}`), nil), 200)
	p.verwacht(p.vraag("GET", "fs/lijst", filepath.Join(proj, "puntenwolk"), nil, nil), 200)
	// een ander soort bestand: alleen dat bestand
	los := filepath.Join(p.buiten, "los.json")
	os.WriteFile(los, []byte("{}"), 0o644)
	p.api.kiezer = func(o kiesOpdracht) (string, error) { return los, nil }
	p.verwacht(p.vraag("POST", "kies", "", []byte(`{"soort":"open"}`), nil), 200)
	p.verwacht(p.vraag("GET", "fs/lees", los, nil, nil), 200)
	p.verwacht(p.vraag("GET", "fs/lees", filepath.Join(p.buiten, "wachtwoorden.txt"), nil, nil), 403)
}
