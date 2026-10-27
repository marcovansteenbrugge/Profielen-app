package main

// Omzettaak (plan omzetten-in-exe, F2): de viewer laat de exe een scan omzetten naar vakken
// (package omzet), met voortgang en afbreken. Eén taak tegelijk. Zelfde afscherming als de
// bestands-API: sessiesleutel, Host/Origin en alleen toegestane plekken (bron en doel).
//
//   POST /__pv/omzet/start      {bron, doel, modus} → {id}
//   GET  /__pv/omzet/stand?id=  {fase, gelezen, totaal, info, fout}
//                               fase: lezen, afronden, klaar, fout of afgebroken
//   POST /__pv/omzet/afbreken?id=
//
// De vakken komen eerst in een tijdelijke map naast het doel (<doel>.<id>.pvtmp) en gaan
// pas na afloop op hun plek; een afgebroken of mislukte omzetting laat niets achter.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"ptsviewer/omzet"
)

type omzetTaak struct {
	id, bron, doel, tijdelijk string
	stop                      context.CancelFunc
	klaarKanaal               chan struct{}

	mu              sync.Mutex
	fase            string
	gelezen, totaal int64
	info            *omzet.Info
	fout            string
}

type omzetStand struct {
	Fase    string      `json:"fase"`
	Gelezen int64       `json:"gelezen"`
	Totaal  int64       `json:"totaal"`
	Info    *omzet.Info `json:"info,omitempty"`
	Fout    string      `json:"fout,omitempty"`
}

func (t *omzetTaak) stand() omzetStand {
	t.mu.Lock()
	defer t.mu.Unlock()
	return omzetStand{t.fase, t.gelezen, t.totaal, t.info, t.fout}
}

func (t *omzetTaak) zet(f func()) {
	t.mu.Lock()
	f()
	t.mu.Unlock()
}

type omzetter struct {
	mu    sync.Mutex
	taak  *omzetTaak // de lopende of laatste taak
	taken map[string]*omzetTaak
}

func (a *bestandsAPI) omzet(w http.ResponseWriter, r *http.Request, route string) {
	switch route {
	case "omzet/start":
		if r.Method != http.MethodPost {
			http.Error(w, "alleen POST", http.StatusMethodNotAllowed)
			return
		}
		a.omzetStart(w, r)
	case "omzet/stand":
		if r.Method != http.MethodGet {
			http.Error(w, "alleen GET", http.StatusMethodNotAllowed)
			return
		}
		t := a.omzetTaakVan(r.URL.Query().Get("id"))
		if t == nil {
			http.Error(w, "onbekende omzetting", http.StatusNotFound)
			return
		}
		stuurJSON(w, t.stand())
	case "omzet/afbreken":
		if r.Method != http.MethodPost {
			http.Error(w, "alleen POST", http.StatusMethodNotAllowed)
			return
		}
		if t := a.omzetTaakVan(r.URL.Query().Get("id")); t != nil {
			t.stop()
			<-t.klaarKanaal // pas antwoorden als de tijdelijke map weg is
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.NotFound(w, r)
	}
}

func (a *bestandsAPI) omzetTaakVan(id string) *omzetTaak {
	a.omzetten.mu.Lock()
	defer a.omzetten.mu.Unlock()
	return a.omzetten.taken[id]
}

func (a *bestandsAPI) omzetStart(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Bron  string `json:"bron"`
		Doel  string `json:"doel"`
		Modus string `json:"modus"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&v); err != nil || v.Bron == "" || v.Doel == "" || (v.Modus != "boven" && v.Modus != "onder") {
		http.Error(w, "ongeldige opdracht", http.StatusBadRequest)
		return
	}
	bron, ok1 := a.binnen(v.Bron)
	doel, ok2 := a.binnen(v.Doel)
	if !ok1 || !ok2 {
		log.Printf("omzetten geweigerd: bron %q of doel %q buiten toegestane plekken", v.Bron, v.Doel)
		http.Error(w, "bron of doel buiten toegestane plekken", http.StatusForbidden)
		return
	}
	if a.isWortel(doel) {
		http.Error(w, "het doel mag geen gekozen map zelf zijn", http.StatusForbidden)
		return
	}
	if st, err := os.Stat(bron); err != nil || st.IsDir() {
		http.Error(w, "bron is geen bestand", http.StatusBadRequest)
		return
	}
	a.omzetten.mu.Lock()
	if a.omzetten.taak != nil {
		select {
		case <-a.omzetten.taak.klaarKanaal:
		default:
			a.omzetten.mu.Unlock()
			http.Error(w, "er loopt al een omzetting", http.StatusConflict)
			return
		}
	}
	b := make([]byte, 12)
	rand.Read(b)
	id := hex.EncodeToString(b)
	ctx, stop := context.WithCancel(context.Background())
	t := &omzetTaak{id: id, bron: bron, doel: doel, tijdelijk: doel + "." + id + tijdelijkAchter, stop: stop, klaarKanaal: make(chan struct{}), fase: "lezen"}
	if a.omzetten.taken == nil {
		a.omzetten.taken = map[string]*omzetTaak{}
	}
	a.omzetten.taken[id] = t
	a.omzetten.taak = t
	a.omzetten.mu.Unlock()
	log.Printf("omzetten gestart: %s → %s (%s)", bron, doel, v.Modus)
	go t.draai(ctx, v.Modus == "onder")
	stuurJSON(w, map[string]string{"id": id})
}

func (t *omzetTaak) draai(ctx context.Context, onder bool) {
	defer close(t.klaarKanaal)
	t0 := time.Now()
	info, err := omzet.Omzet(ctx, omzet.Opdracht{
		Bron: t.bron, Doel: t.tijdelijk, Onder: onder, Viewer: "Lutrea Profielviewer " + appVersie + " (exe)",
		Fase: func(f string) { t.zet(func() { t.fase = f }) },
	}, func(gelezen, totaal int64) { t.zet(func() { t.gelezen, t.totaal = gelezen, totaal }) })
	if err == nil {
		// klaar: het oude doel weg, de tijdelijke map op zijn plek
		if err = os.RemoveAll(t.doel); err == nil {
			err = os.Rename(t.tijdelijk, t.doel)
		}
	}
	if err != nil {
		os.RemoveAll(t.tijdelijk)
		afgebroken := errors.Is(err, context.Canceled)
		t.zet(func() {
			if afgebroken {
				t.fase = "afgebroken"
			} else {
				t.fase, t.fout = "fout", err.Error()
			}
		})
		log.Printf("omzetten %s na %.1f s: %v", map[bool]string{true: "afgebroken", false: "mislukt"}[afgebroken], time.Since(t0).Seconds(), err)
		return
	}
	t.zet(func() { t.fase, t.info = "klaar", info })
	log.Printf("omzetten klaar: %d punten in %d vakken, %.1f s", info.Aantal, len(info.Tegels), time.Since(t0).Seconds())
}

// stopOmzetten breekt een lopende omzetting af en wacht tot de tijdelijke map weg is
// (bij het stoppen van de exe).
func (a *bestandsAPI) stopOmzetten() {
	a.omzetten.mu.Lock()
	t := a.omzetten.taak
	a.omzetten.mu.Unlock()
	if t != nil {
		t.stop()
		<-t.klaarKanaal
	}
}

// isOmzetRoute: hoort deze route bij de omzettaak?
func isOmzetRoute(route string) bool { return strings.HasPrefix(route, "omzet/") }
