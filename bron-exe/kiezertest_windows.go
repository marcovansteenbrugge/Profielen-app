//go:build windows

package main

// --kiezertest: controle van de Windows-kiezer (plan eigen-bestandstoegang, F1)
// zolang de viewer hem nog niet zelf gebruikt. Na het laden van de viewer opent de
// exe via /__pv/kies (met de sessiesleutel, net als de viewer straks) achter
// elkaar de mapkiezer, de kiezer om een bestand te openen en die om op te slaan,
// en toont daarna wat er terugkwam. Alles staat ook in het log.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

func kiezertestGevraagd() bool {
	for _, a := range os.Args[1:] {
		if a == "--kiezertest" || a == "-kiezertest" {
			return true
		}
	}
	return false
}

func kiezertest() {
	// wachten tot de pagina geladen is
	for i := 0; i < 120; i++ {
		if _, ok := eersteVerzoeken.Load("hartslag"); ok {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	log.Println("kiezertest: start")
	stappen := []struct {
		wat      string
		opdracht string
	}{
		{"Map kiezen", `{"soort":"map","titel":"Kiezertest 1 van 3: kies een projectmap"}`},
		{"Bestand openen", `{"soort":"open","titel":"Kiezertest 2 van 3: kies een projectbestand (of annuleer)","filter":[{"naam":"Projectbestand","patroon":"*.pvproj"},{"naam":"Alle bestanden","patroon":"*.*"}]}`},
		{"Opslaan als", `{"soort":"opslaan","titel":"Kiezertest 3 van 3: opslaan als (er wordt niets geschreven)","naam":"proef.pdf","extensie":"pdf","filter":[{"naam":"PDF","patroon":"*.pdf"}]}`},
	}
	var uitslag []string
	for _, st := range stappen {
		r, _ := http.NewRequest("POST", fmt.Sprintf("http://127.0.0.1:%d/__pv/kies", bestandsapi.poort), bytes.NewReader([]byte(st.opdracht)))
		r.Header.Set(sleutelHeader, bestandsapi.geefSleutel())
		r.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(r)
		if err != nil {
			uitslag = append(uitslag, st.wat+": fout "+err.Error())
			continue
		}
		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		var u struct{ Pad string }
		json.Unmarshal(b, &u)
		switch {
		case resp.StatusCode != 200:
			uitslag = append(uitslag, fmt.Sprintf("%s: fout %d %s", st.wat, resp.StatusCode, strings.TrimSpace(string(b))))
		case u.Pad == "":
			uitslag = append(uitslag, st.wat+": geannuleerd (niets teruggegeven)")
		default:
			uitslag = append(uitslag, st.wat+": "+u.Pad)
		}
	}
	tekst := strings.Join(uitslag, "\n")
	log.Println("kiezertest: klaar\n" + tekst)
	melding("Kiezertest klaar. Teruggekregen:\n\n" + tekst + "\n\nDe viewer loopt gewoon door.")
}
