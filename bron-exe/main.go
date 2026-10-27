// Lutrea-Profielviewer.exe (voorheen PTS-viewer.exe) — Lutrea
//
// Eén los programma: bevat de complete viewer (html, js, bibliotheken) en
// start een klein webservertje op deze computer (alleen 127.0.0.1, niet
// bereikbaar vanaf het netwerk). Daarna opent de viewer in een eigen
// WebView2-venster (venster_windows.go). Lukt dat niet, of start je met
// --browservenster (of PV_VENSTER=browser), dan in een app-venster van
// Chrome of Edge. Sluit je het venster, dan stopt het programma vanzelf.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed all:app
var appBestanden embed.FS

const (
	vastePoort   = 8017
	pingPad      = "/__ptsviewer/ping"
	hartslagPad  = "/__ptsviewer/hartslag"
	stopPad      = "/__ptsviewer/stop"
	dichtPad     = "/__ptsviewer/dicht"
	voorgrondPad = "/__ptsviewer/voorgrond"
	pingAntwoord = "pts-viewer-lutrea"
	appVersie    = "2.10.1"
	stilteGrens  = 3 * time.Minute
	// valt de pagina weg zonder "dicht" (crash, bv. te weinig geheugen), dan nog zo lang
	// blijven draaien dat Vernieuwen in het venster werkt
	crashGrens = 10 * time.Minute
)

var (
	laatsteHartslag atomic.Int64
	laatsteDicht    atomic.Int64 // tijdstip van het laatste "dicht" van de pagina (0 = niet)
	browserProces   atomic.Pointer[os.Process]
	stopVerzocht    = make(chan struct{}, 1)
	// naarVoren haalt het eigen WebView2-venster naar voren (nil = geen eigen venster,
	// bv. bij de terugvaloptie)
	naarVoren atomic.Pointer[func()]
)

// Logbestand in %LOCALAPPDATA%\Lutrea\PTS-viewer\log.txt — handig als het
// opstarten ergens blijft hangen. Elke start schrijft erachter (een tweede start
// mag het log van een draaiende viewer niet overschrijven), met het procesnummer
// voor elke regel. Boven 1 MB gaat het oude log naar log.vorige.txt; lukt dat
// niet omdat een draaiende viewer het open heeft, dan gewoon erachter.
func startLog() {
	map_ := filepath.Join(lokaleAppData(), "Lutrea", "PTS-viewer")
	os.MkdirAll(map_, 0o755)
	pad := filepath.Join(map_, "log.txt")
	if st, err := os.Stat(pad); err == nil && st.Size() > 1<<20 {
		os.Rename(pad, filepath.Join(map_, "log.vorige.txt"))
	}
	f, err := os.OpenFile(pad, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		log.SetOutput(os.Stderr)
		return
	}
	fmt.Fprintf(f, "\n=== %s ===\n", time.Now().Format("2006-01-02 15:04:05"))
	log.SetOutput(f)
	log.SetPrefix(fmt.Sprintf("[%d] ", os.Getpid()))
	log.SetFlags(log.Ltime | log.Lmicroseconds)
}

var eersteVerzoeken sync.Map

func main() {
	startLog()
	log.Println("Lutrea Profielviewer gestart, versie " + appVersie)
	mime.AddExtensionType(".wasm", "application/wasm")
	mime.AddExtensionType(".webmanifest", "application/manifest+json")
	mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	mime.AddExtensionType(".pts", "text/plain")

	inhoud, err := fs.Sub(appBestanden, "app")
	if err != nil {
		fout("Interne fout: bestanden niet gevonden.\n\n" + err.Error())
		return
	}

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", vastePoort))
	if err != nil {
		// Poort bezet. Draait de viewer al?
		status, versie := draaitAl(vastePoort)
		if status != "" && versie != appVersie {
			// Er draait nog een ANDERE (oudere) versie op de achtergrond. Zonder
			// dit zou alleen een venster naar die oude server geopend worden en
			// zie je de oude viewer, ook al heb je de nieuwe exe gestart.
			log.Printf("oude versie (%q) draait nog - die wordt afgesloten", versie)
			c := http.Client{Timeout: 2 * time.Second}
			if resp, e := c.Post(fmt.Sprintf("http://127.0.0.1:%d%s", vastePoort, stopPad), "text/plain", nil); e == nil {
				resp.Body.Close()
			}
			for i := 0; i < 40 && err != nil; i++ { // max. ~10 s wachten tot de poort vrij is
				time.Sleep(250 * time.Millisecond)
				ln, err = net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", vastePoort))
			}
			status = ""
		}
		if err == nil {
			log.Println("poort overgenomen van de oude versie")
		}
		switch status {
		case "start":
			// nogmaals op het icoon geklikt terwijl het eerste venster nog
			// opstart: geen tweede venster openen, het eerste komt eraan
			return
		case "klaar":
			// eigen venster open: dat naar voren halen in plaats van een tweede venster
			if vraagVoorgrond(vastePoort) {
				log.Println("viewer draait al: bestaande venster naar voren gehaald")
				return
			}
			openVenster(fmt.Sprintf("http://127.0.0.1:%d/index.html", vastePoort), nil)
			return
		}
		// Anders: vrije poort laten kiezen.
		if err != nil {
			ln, err = net.Listen("tcp", "127.0.0.1:0")
			if err != nil {
				fout("Kan geen lokale server starten.\n\n" + err.Error())
				return
			}
		}
	}
	poort := ln.Addr().(*net.TCPAddr).Port
	url := fmt.Sprintf("http://127.0.0.1:%d/index.html", poort)
	log.Println("server luistert op", url)

	mux := http.NewServeMux()
	mux.HandleFunc(pingPad, func(w http.ResponseWriter, r *http.Request) {
		status := "start"
		if _, ok := eersteVerzoeken.Load("hartslag"); ok {
			status = "klaar"
		}
		w.Write([]byte(pingAntwoord + ":" + status + ":" + appVersie))
	})
	mux.HandleFunc(hartslagPad, func(w http.ResponseWriter, r *http.Request) {
		laatsteHartslag.Store(time.Now().UnixNano())
		if _, al := eersteVerzoeken.LoadOrStore("hartslag", true); !al {
			log.Println("eerste hartslag van de pagina: viewer is volledig geladen")
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc(dichtPad, func(w http.ResponseWriter, r *http.Request) {
		laatsteDicht.Store(time.Now().UnixNano())
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc(stopPad, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
		select {
		case stopVerzocht <- struct{}{}:
		default:
		}
	})
	mux.HandleFunc(voorgrondPad, func(w http.ResponseWriter, r *http.Request) {
		// alleen "venster naar voren", zonder gegevens
		f := naarVoren.Load()
		if r.Method != http.MethodPost || f == nil {
			http.Error(w, "geen eigen venster", http.StatusConflict)
			return
		}
		(*f)()
		w.WriteHeader(http.StatusNoContent)
	})
	bestanden := http.FileServer(http.FS(inhoud))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, must-revalidate")
		if _, al := eersteVerzoeken.LoadOrStore(r.URL.Path, true); !al {
			log.Println("eerste keer opgevraagd:", r.URL.Path)
		}
		bestanden.ServeHTTP(w, r)
	})
	go http.Serve(ln, mux)

	if browservensterGevraagd() {
		log.Println("oude venster gevraagd (--browservenster of PV_VENSTER=browser)")
	} else if openWebView2(url) {
		log.Println("venster gesloten, programma stopt")
		return
	} else {
		melding("Het eigen programmavenster (WebView2) kon niet starten.\n\n" +
			"De viewer opent nu in een venster van Chrome of Edge.")
	}

	// Terugvaloptie: Chrome/Edge-app-venster, stoppen via de hartslag van de pagina.
	laatsteHartslag.Store(time.Now().UnixNano())
	var browserKlaar atomic.Bool
	openVenster(url, func() { browserKlaar.Store(true) })

	// Bewaking van de eerste start: blijft het venster leeg (de pagina meldt
	// zich niet binnen 25 s), dan het browservenster sluiten en één keer
	// opnieuw openen. Een nieuw browserprofiel blijft de eerste keer soms
	// hangen op een welkomst- of keuzescherm; de tweede start gaat dan goed.
	go func() {
		time.Sleep(30 * time.Second)
		if _, ok := eersteVerzoeken.Load("hartslag"); ok {
			return
		}
		// Heeft de browser de pagina wel opgevraagd, dan is hij gewoon traag
		// (bv. virusscanner bij de eerste start): niet ingrijpen, anders
		// krijg je een tweede venster.
		if _, ok := eersteVerzoeken.Load("/index.html"); ok {
			log.Println("na 30 s nog geen hartslag, maar de pagina is wel opgevraagd: wachten")
			return
		}
		p := browserProces.Load()
		if p == nil || browserKlaar.Load() {
			log.Println("na 30 s geen pagina-verzoek en geen browserproces meer: niet opnieuw starten")
			return
		}
		log.Println("na 30 s heeft de browser de pagina nog niet opgevraagd: browservenster opnieuw starten")
		p.Kill()
		time.Sleep(1500 * time.Millisecond)
		browserKlaar.Store(false)
		laatsteHartslag.Store(time.Now().UnixNano())
		openVenster(url, func() { browserKlaar.Store(true) })
	}()

	// Stoppen zodra het venster dicht is: de browser is gestopt én de
	// pagina stuurt al een tijdje geen hartslag meer.
	for {
		select {
		case <-stopVerzocht:
			log.Println("afsluiten via de knop")
			// Afsluitknop: venster krijgt even de tijd om zelf te sluiten,
			// daarna het browserproces (eigen profiel) alsnog beëindigen.
			time.Sleep(1500 * time.Millisecond)
			if p := browserProces.Load(); p != nil && !browserKlaar.Load() {
				p.Kill()
			}
			return
		case <-time.After(5 * time.Second):
		}
		hs := laatsteHartslag.Load()
		stil := time.Since(time.Unix(0, hs))
		// "dicht" ontvangen en daarna geen nieuwe hartslag (bij verversen komt die meteen weer)
		dicht := laatsteDicht.Load() > hs && time.Since(time.Unix(0, laatsteDicht.Load())) > 15*time.Second
		if browserKlaar.Load() && dicht {
			log.Println("venster gesloten, programma stopt")
			return
		}
		if browserKlaar.Load() && stil > crashGrens {
			log.Println("al", crashGrens, "geen hartslag (pagina vastgelopen?), programma stopt")
			return
		}
		if !browserKlaar.Load() && stil > 45*time.Second && stil < 50*time.Second {
			log.Println("45 s geen hartslag terwijl het venster nog open is: pagina vastgelopen of druk bezig, server blijft draaien")
		}
	}
}

// browservensterGevraagd: het oude Chrome/Edge-venster in plaats van WebView2.
func browservensterGevraagd() bool {
	for _, a := range os.Args[1:] {
		if a == "--browservenster" || a == "-browservenster" {
			return true
		}
	}
	return strings.EqualFold(os.Getenv("PV_VENSTER"), "browser")
}

// vraagVoorgrond vraagt de draaiende viewer zijn eigen venster naar voren te halen.
// false = die viewer heeft geen eigen venster (terugvaloptie) of antwoordt niet.
func vraagVoorgrond(poort int) bool {
	// dit proces is net door de gebruiker gestart en mag de voorgrond doorgeven;
	// zonder dit houdt Windows het venster soms tegen (dan knippert de taakbalk)
	staVoorgrondToe()
	c := http.Client{Timeout: 2 * time.Second}
	resp, err := c.Post(fmt.Sprintf("http://127.0.0.1:%d%s", poort, voorgrondPad), "text/plain", nil)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusNoContent
}

// draaitAl geeft "" (draait niet), "start" (eerste venster is nog aan het
// opstarten) of "klaar" (viewer staat open).
// draaitAl geeft de status ("start"/"klaar", of "" als er geen viewer draait)
// en de versie van de viewer die al op de poort draait ("" = ouder dan 1.9.1).
func draaitAl(poort int) (string, string) {
	c := http.Client{Timeout: 2 * time.Second}
	resp, err := c.Get(fmt.Sprintf("http://127.0.0.1:%d%s", poort, pingPad))
	if err != nil {
		return "", ""
	}
	defer resp.Body.Close()
	buf := make([]byte, 128)
	n, _ := resp.Body.Read(buf)
	delen := strings.Split(strings.TrimSpace(string(buf[:n])), ":")
	if len(delen) < 2 || delen[0] != pingAntwoord {
		return "", ""
	}
	versie := ""
	if len(delen) >= 3 {
		versie = delen[2]
	}
	if delen[1] == "klaar" {
		return "klaar", versie
	}
	return "start", versie
}

// openVenster start Chrome of Edge in app-modus met een eigen profiel, zodat
// het proces blijft bestaan zolang het venster open is. klaar() wordt
// aangeroepen als dat proces stopt.
func openVenster(url string, klaar func()) {
	browser := zoekBrowser()
	log.Println("browser:", browser)
	if browser == "" {
		openStandaardBrowser(url)
		if klaar != nil {
			// Geen controle over het venster: alleen op de hartslag stoppen.
			klaar()
		}
		return
	}
	profiel := filepath.Join(lokaleAppData(), "Lutrea", "PTS-viewer", "browserprofiel")
	os.MkdirAll(profiel, 0o755)
	// "First Run" in de profielmap = Chrome/Edge slaan alle eerste-keer-
	// schermen over (welkom, zoekmachinekeuze, aanmelden). Zonder dit bleef
	// het app-venster bij de allereerste start soms leeg/donker.
	eersteKeer := filepath.Join(profiel, "First Run")
	if _, err := os.Stat(eersteKeer); err != nil {
		os.WriteFile(eersteKeer, nil, 0o644)
		log.Println("nieuw browserprofiel: 'First Run' aangemaakt")
	}
	extra := []string{}
	if a := os.Getenv("PTS_BROWSER_ARGS"); a != "" {
		extra = append(extra, strings.Fields(a)...)
	}
	cmd := exec.Command(browser, append([]string{
		"--app=" + url,
		"--user-data-dir=" + profiel,
		"--no-first-run",
		"--no-default-browser-check",
		// venster gemaximaliseerd openen (F11 = echt volledig scherm)
		"--start-maximized",
		// eerste start met een nieuw profiel snel houden: geen achtergrond-
		// downloads, updates, sync of welkomstschermen (die op een
		// bedrijfsnetwerk met proxy lang kunnen blijven hangen)
		"--disable-background-networking",
		"--disable-component-update",
		"--disable-sync",
		"--disable-default-apps",
		"--disable-extensions",
		"--no-pings",
		"--disable-features=Translate,OptimizationHints,MediaRouter,EdgeCollections,msEdgeShopping",
		// EU-keuzescherm voor de zoekmachine en welkomstschermen bij een nieuw
		// profiel: die blokkeren anders het (lege, donkere) app-venster
		"--disable-search-engine-choice-screen",
		"--disable-fre",
		"--no-service-autorun",
		"--disable-session-crashed-bubble",
		"--hide-crash-restore-bubble",
	}, extra...)...)
	verbergConsole(cmd)
	if err := cmd.Start(); err != nil {
		log.Println("browser starten mislukt:", err)
		openStandaardBrowser(url)
		if klaar != nil {
			klaar()
		}
		return
	}
	if klaar != nil {
		browserProces.Store(cmd.Process)
	}
	log.Println("browservenster gestart (pid", cmd.Process.Pid, ")")
	go func() {
		cmd.Wait()
		log.Println("browserproces beëindigd")
		if klaar != nil {
			klaar()
		}
	}()
}

func lokaleAppData() string {
	if d := os.Getenv("LOCALAPPDATA"); d != "" {
		return d
	}
	d, _ := os.UserCacheDir()
	return d
}

func zoekBrowser() string {
	if b := os.Getenv("PTS_BROWSER"); b != "" {
		return b
	}
	kandidaten := []string{
		filepath.Join(os.Getenv("ProgramFiles"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("LOCALAPPDATA"), `Google\Chrome\Application\chrome.exe`),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(os.Getenv("ProgramFiles"), `Microsoft\Edge\Application\msedge.exe`),
	}
	for _, k := range kandidaten {
		if st, err := os.Stat(k); err == nil && !st.IsDir() {
			return k
		}
	}
	return ""
}
