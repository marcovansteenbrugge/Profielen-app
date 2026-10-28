// pvomzet: zet een scan om naar een puntenwolkmap met dezelfde code als de exe
// (package omzet). Voor de tests (tests/hulp.js, tests/omzetten_parity.test.js) en om te
// meten; de gebruiker gebruikt het niet.
//
//	pvomzet -bron <scan.las> -doel <map> [-modus boven|onder] [-wasm <laz-perf.wasm>]
//
// Zonder -wasm zoekt hij vendor/laz-perf/laz-perf.wasm boven de map van pvomzet en de werkmap.
//
// Schrijft aan het eind één regel JSON: {"aantal":…, "vakken":…, "seconden":…}.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"ptsviewer/omzet"
)

func main() {
	bron := flag.String("bron", "", "pad van de scan")
	doel := flag.String("doel", "", "puntenwolkmap (tegels komt daarin)")
	modus := flag.String("modus", "boven", "oppervlak: boven of onder")
	viewer := flag.String("viewer", "pvomzet", "tekst voor het veld viewer in info.json")
	wasm := flag.String("wasm", "", "laz-perf.wasm (voor LAZ)")
	metVoortgang := flag.Bool("voortgang", false, "voortgang op stderr: \"voortgang <gelezen> <totaal>\" en \"fase <naam>\"")
	flag.Parse()
	if *bron == "" || *doel == "" || (*modus != "boven" && *modus != "onder") {
		flag.Usage()
		os.Exit(2)
	}
	t0 := time.Now()
	o := omzet.Opdracht{Bron: *bron, Doel: *doel, Onder: *modus == "onder", Viewer: *viewer, LazWasm: leesWasm(*wasm)}
	var voortgang omzet.Voortgang
	if *metVoortgang {
		o.Fase = func(f string) { fmt.Fprintln(os.Stderr, "fase", f) }
		voortgang = func(gelezen, totaal int64) { fmt.Fprintln(os.Stderr, "voortgang", gelezen, totaal) }
	}
	info, err := omzet.Omzet(context.Background(), o, voortgang)
	if err != nil {
		fmt.Fprintln(os.Stderr, "pvomzet:", err)
		os.Exit(1)
	}
	json.NewEncoder(os.Stdout).Encode(map[string]any{"aantal": info.Aantal, "vakken": len(info.Tegels), "seconden": time.Since(t0).Seconds()})
}

// leesWasm: het opgegeven bestand, anders vendor/laz-perf/laz-perf.wasm boven de map van
// pvomzet of de werkmap; nil als hij er niet is (dan lukt alleen LAZ niet).
func leesWasm(pad string) []byte {
	if pad != "" {
		b, err := os.ReadFile(pad)
		if err != nil {
			fmt.Fprintln(os.Stderr, "pvomzet:", err)
			os.Exit(2)
		}
		return b
	}
	var starts []string
	if exe, err := os.Executable(); err == nil {
		starts = append(starts, filepath.Dir(exe))
	}
	if wd, err := os.Getwd(); err == nil {
		starts = append(starts, wd)
	}
	for _, m := range starts {
		for {
			if b, err := os.ReadFile(filepath.Join(m, "vendor", "laz-perf", "laz-perf.wasm")); err == nil {
				return b
			}
			boven := filepath.Dir(m)
			if boven == m {
				break
			}
			m = boven
		}
	}
	return nil
}
