// pvomzet: zet een scan om naar een puntenwolkmap met dezelfde code als de exe
// (package omzet). Voor de tests (tests/hulp.js, tests/omzetten_exe.test.js) en om te
// meten; de gebruiker gebruikt het niet.
//
//	pvomzet -bron <scan.las> -doel <map> [-modus boven|onder]
//
// Schrijft aan het eind één regel JSON: {"aantal":…, "vakken":…, "seconden":…}.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"ptsviewer/omzet"
)

func main() {
	bron := flag.String("bron", "", "pad van de scan")
	doel := flag.String("doel", "", "puntenwolkmap (tegels komt daarin)")
	modus := flag.String("modus", "boven", "oppervlak: boven of onder")
	viewer := flag.String("viewer", "pvomzet", "tekst voor het veld viewer in info.json")
	flag.Parse()
	if *bron == "" || *doel == "" || (*modus != "boven" && *modus != "onder") {
		flag.Usage()
		os.Exit(2)
	}
	t0 := time.Now()
	info, err := omzet.Omzet(context.Background(), omzet.Opdracht{Bron: *bron, Doel: *doel, Onder: *modus == "onder", Viewer: *viewer}, nil)
	if err != nil {
		fmt.Fprintln(os.Stderr, "pvomzet:", err)
		os.Exit(1)
	}
	json.NewEncoder(os.Stdout).Encode(map[string]any{"aantal": info.Aantal, "vakken": len(info.Tegels), "seconden": time.Since(t0).Seconds()})
}
