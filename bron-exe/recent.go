package main

// Recente projecten en een project openen vanaf een pad (plan eigen-bestandstoegang, F3).
//
// Besluit B1: de exe houdt zelf de lijst bij, als paden in
// %LOCALAPPDATA%\Lutrea\Profielviewer\recent.json (de laatste 8). De mappen in de
// lijst zijn toegestane plekken (B2), zodat ze na een herstart zonder vragen open gaan.
//
//   GET  /__pv/recent        [{naam, pad, tijd, bestaat}], nieuwste eerst
//   POST /__pv/recent        {pad}: bovenaan zetten (alleen een toegestane map)
//   POST /__pv/recent/weg    {pad}: uit de lijst halen

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxRecent = 8

type recentProject struct {
	Naam    string `json:"naam"`
	Pad     string `json:"pad"`
	Tijd    int64  `json:"tijd"` // ms sinds 1970
	Bestaat bool   `json:"bestaat"`
}

func recentBestand() string {
	return filepath.Join(lokaleAppData(), "Lutrea", "Profielviewer", "recent.json")
}

// laadRecent leest de lijst en zet de mappen die nog bestaan open (B2).
func (a *bestandsAPI) laadRecent(bestand string) {
	a.mu.Lock()
	a.recentPad = bestand
	a.mu.Unlock()
	for _, r := range a.leesRecent() {
		if st, err := os.Stat(r.Pad); err == nil && st.IsDir() {
			a.staToe(r.Pad)
		}
	}
}

func (a *bestandsAPI) leesRecent() []recentProject {
	a.mu.Lock()
	bestand := a.recentPad
	a.mu.Unlock()
	var lijst []recentProject
	if bestand == "" {
		return lijst
	}
	if b, err := os.ReadFile(bestand); err == nil {
		if err := json.Unmarshal(b, &lijst); err != nil {
			log.Println("recent.json onleesbaar, begint leeg:", err)
			lijst = nil
		}
	}
	return lijst
}

func (a *bestandsAPI) bewaarRecent(lijst []recentProject) error {
	a.mu.Lock()
	bestand := a.recentPad
	a.mu.Unlock()
	if bestand == "" {
		return errors.New("geen plek voor recent.json")
	}
	os.MkdirAll(filepath.Dir(bestand), 0o755)
	for i := range lijst {
		lijst[i].Bestaat = false // wordt bij het lezen bepaald
	}
	b, _ := json.MarshalIndent(lijst, "", " ")
	tijdelijk := bestand + ".nieuw"
	if err := os.WriteFile(tijdelijk, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tijdelijk, bestand)
}

func (a *bestandsAPI) recent(w http.ResponseWriter, r *http.Request, route string) {
	if route == "recent" && r.Method == http.MethodGet {
		lijst := a.leesRecent()
		for i := range lijst {
			st, err := os.Stat(lijst[i].Pad)
			lijst[i].Bestaat = err == nil && st.IsDir()
		}
		if lijst == nil {
			lijst = []recentProject{}
		}
		stuurJSON(w, lijst)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "alleen GET of POST", http.StatusMethodNotAllowed)
		return
	}
	var v struct {
		Pad string `json:"pad"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&v); err != nil || v.Pad == "" {
		http.Error(w, "ongeldige opdracht", http.StatusBadRequest)
		return
	}
	lijst := a.leesRecent()
	nieuw := make([]recentProject, 0, len(lijst)+1)
	switch route {
	case "recent":
		pad, ok := a.binnen(v.Pad)
		if !ok {
			http.Error(w, "pad buiten toegestane mappen", http.StatusForbidden)
			return
		}
		if st, err := os.Stat(pad); err != nil || !st.IsDir() {
			http.Error(w, "geen map", http.StatusBadRequest)
			return
		}
		nieuw = append(nieuw, recentProject{Naam: filepath.Base(pad), Pad: pad, Tijd: time.Now().UnixMilli()})
		for _, r := range lijst {
			if !strings.EqualFold(r.Pad, pad) && len(nieuw) < maxRecent {
				nieuw = append(nieuw, r)
			}
		}
	case "recent/weg":
		for _, r := range lijst {
			if !strings.EqualFold(r.Pad, v.Pad) {
				nieuw = append(nieuw, r)
			}
		}
	default:
		http.NotFound(w, r)
		return
	}
	if err := a.bewaarRecent(nieuw); err != nil {
		bestandsFout(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// projectPad maakt van een startparameter (een .pvproj of een projectmap) de map die
// geopend moet worden. "" = geen bruikbaar pad.
func projectPad(arg string) string {
	if arg == "" || strings.HasPrefix(arg, "-") {
		return ""
	}
	pad, err := filepath.Abs(arg)
	if err != nil {
		return ""
	}
	st, err := os.Stat(pad)
	switch {
	case err != nil:
		return ""
	case st.IsDir():
		return pad
	case strings.EqualFold(filepath.Ext(pad), ".pvproj"):
		return filepath.Dir(pad)
	}
	return ""
}

// startProject: het eerste argument dat een .pvproj of projectmap is.
func startProject() string {
	for _, a := range os.Args[1:] {
		if p := projectPad(a); p != "" {
			return p
		}
	}
	return ""
}
