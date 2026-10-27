//go:build windows

package main

// Eigen programmavenster met WebView2 (de Edge-webweergave die in Windows 10/11
// zit). Het venster laadt dezelfde lokale server als het oude Chrome/Edge-venster,
// dus localStorage/IndexedDB/service worker werken zoals voorheen. Venster dicht =
// programma stopt. Ontbreekt de WebView2-runtime, dan valt main() terug op het
// oude Chrome/Edge-app-venster (zie openVenster).

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/webviewloader"
)

// WebView2 en de berichtenlus moeten op de hoofdthread van het proces draaien.
func init() { runtime.LockOSThread() }

const (
	vensterKlasse = "webview" // klassenaam die go-webview2 gebruikt
	swShowNormal  = 1
	swMinimize    = 2
	swMaximize    = 3
	swRestore     = 9
	wmClose       = 0x0010
	wmSetIcon     = 0x0080
	imageIcon     = 1
	lrDefaultSize = 0x0040
	lrShared      = 0x8000
	// WPF_RESTORETOMAXIMIZED: geminimaliseerd vanuit gemaximaliseerd
	wpfHerstelMax = 0x0002
	asfwAny       = 0xFFFFFFFF // ASFW_ANY = (DWORD)-1
)

// GWLP_WNDPROC = -4
var gwlpWndProc = ^uintptr(3)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	procShowWindow   = user32.NewProc("ShowWindow")
	procLoadImageW   = user32.NewProc("LoadImageW")
	procSendMessageW = user32.NewProc("SendMessageW")
	procFindWindowW  = user32.NewProc("FindWindowW")
	procDestroyWin   = user32.NewProc("DestroyWindow")
	procGetPlaatsing = user32.NewProc("GetWindowPlacement")
	procSetPlaatsing = user32.NewProc("SetWindowPlacement")
	procMonitorRect  = user32.NewProc("MonitorFromRect")
	procSetWinLong   = user32.NewProc("SetWindowLongPtrW")
	procCallWinProc  = user32.NewProc("CallWindowProcW")
	procIsIconic     = user32.NewProc("IsIconic")
	procVoorgrond    = user32.NewProc("SetForegroundWindow")
	procStaVoorgrond = user32.NewProc("AllowSetForegroundWindow")
	procModuleHandle = kernel32.NewProc("GetModuleHandleW")
)

// Win32 WINDOWPLACEMENT met POINT en RECT
type punt struct{ X, Y int32 }
type rechthoek struct{ Links, Boven, Rechts, Onder int32 }
type plaatsing struct {
	Lengte, Vlaggen, ToonCmd uint32
	MinPos, MaxPos           punt
	Normaal                  rechthoek
}

// vensterStand: wat er in venster.json staat
type vensterStand struct {
	X, Y, Breedte, Hoogte int32
	Gemaximaliseerd       bool
}

// openWebView2 opent de viewer in een eigen WebView2-venster en blokkeert tot het
// venster dicht is. false = WebView2 kon niet starten (terugvallen op het oude venster).
func openWebView2(url string) bool {
	versie, err := webviewloader.GetInstalledVersion()
	if err != nil || versie == "" {
		log.Println("WebView2-runtime niet gevonden:", err)
		return false
	}
	log.Println("WebView2-runtime", versie)

	data := filepath.Join(lokaleAppData(), "Lutrea", "Profielviewer", "WebView2")
	os.MkdirAll(data, 0o755)
	titel := "Lutrea Profielviewer " + appVersie
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		// DevTools (F12) en het standaard-rechtsklikmenu alleen met PV_DEVTOOLS=1
		Debug:     os.Getenv("PV_DEVTOOLS") == "1",
		DataPath:  data,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  titel,
			Width:  1280,
			Height: 800,
			Center: true,
		},
	})
	if w == nil {
		log.Println("WebView2-venster maken mislukt")
		// het lege venster is al getoond: weghalen vóór het oude venster opent
		k, _ := syscall.UTF16PtrFromString(vensterKlasse)
		t, _ := syscall.UTF16PtrFromString(titel)
		if h, _, _ := procFindWindowW.Call(uintptr(unsafe.Pointer(k)), uintptr(unsafe.Pointer(t))); h != 0 {
			procDestroyWin.Call(h)
		}
		return false
	}
	hwnd := uintptr(w.Window())
	zetIcoon(hwnd)
	herstelStand(hwnd)
	vangSluiten(hwnd)
	log.Println("WebView2-venster geopend, gegevensmap", data)

	// tweede start (POST /__ptsviewer/voorgrond): dit venster naar voren
	voor := func() { w.Dispatch(func() { haalNaarVoren(hwnd) }) }
	naarVoren.Store(&voor)
	defer naarVoren.Store(nil)

	// Afsluiten-knop in de viewer (POST /__ptsviewer/stop): venster sluiten
	go func() {
		<-stopVerzocht
		log.Println("afsluiten via de knop")
		w.Destroy()
	}()

	// sessiesleutel voor de eigen bestandstoegang: staat in de pagina vóór de eigen
	// scripts; een gewone browser op deze pc heeft hem niet
	if bestandsapi != nil {
		if sl := bestandsapi.geefSleutel(); sl != "" {
			natief, _ := json.Marshal(map[string]string{"sleutel": sl, "versie": appVersie})
			w.Init("window.__pvNatief = Object.freeze(" + string(natief) + ");")
		}
	}
	// Windows-kiezer (/__pv/kies): op de thread van het venster, met het venster als
	// eigenaar, dus modaal
	if bestandsapi != nil {
		bestandsapi.kiezer = func(o kiesOpdracht) (string, error) {
			type uitkomst struct {
				pad string
				err error
			}
			klaar := make(chan uitkomst, 1)
			w.Dispatch(func() {
				pad, err := toonKiezer(hwnd, o)
				klaar <- uitkomst{pad, err}
			})
			u := <-klaar
			return u.pad, u.err
		}
		defer func() { bestandsapi.kiezer = nil }()
		if kiezertestGevraagd() {
			go kiezertest()
		}
	}

	w.Navigate(url)
	w.Run()
	return true
}

func standBestand() string {
	return filepath.Join(lokaleAppData(), "Lutrea", "Profielviewer", "venster.json")
}

// herstelStand zet het venster op de plek en grootte van de vorige keer. Geen
// venster.json, of valt die plek buiten alle schermen: gemaximaliseerd.
func herstelStand(hwnd uintptr) {
	var s vensterStand
	b, err := os.ReadFile(standBestand())
	if err == nil {
		err = json.Unmarshal(b, &s)
	}
	if err != nil || s.Breedte < 200 || s.Hoogte < 150 {
		procShowWindow.Call(hwnd, swMaximize)
		return
	}
	r := rechthoek{s.X, s.Y, s.X + s.Breedte, s.Y + s.Hoogte}
	if m, _, _ := procMonitorRect.Call(uintptr(unsafe.Pointer(&r)), 0); m == 0 { // MONITOR_DEFAULTTONULL
		log.Println("onthouden vensterplek valt buiten beeld: gemaximaliseerd")
		procShowWindow.Call(hwnd, swMaximize)
		return
	}
	p := plaatsing{Normaal: r, ToonCmd: swShowNormal}
	p.Lengte = uint32(unsafe.Sizeof(p))
	if s.Gemaximaliseerd {
		p.ToonCmd = swMaximize
	}
	procSetPlaatsing.Call(hwnd, uintptr(unsafe.Pointer(&p)))
}

// bewaarStand schrijft plek, grootte en gemaximaliseerd naar venster.json.
func bewaarStand(hwnd uintptr) {
	var p plaatsing
	p.Lengte = uint32(unsafe.Sizeof(p))
	if ok, _, _ := procGetPlaatsing.Call(hwnd, uintptr(unsafe.Pointer(&p))); ok == 0 {
		return
	}
	n := p.Normaal
	s := vensterStand{
		X: n.Links, Y: n.Boven, Breedte: n.Rechts - n.Links, Hoogte: n.Onder - n.Boven,
		Gemaximaliseerd: p.ToonCmd == swMaximize || (p.ToonCmd == swMinimize && p.Vlaggen&wpfHerstelMax != 0),
	}
	b, _ := json.Marshal(s)
	if err := os.WriteFile(standBestand(), b, 0o644); err != nil {
		log.Println("vensterstand bewaren mislukt:", err)
	}
}

// vangSluiten haakt in op WM_CLOSE (kruisje én Afsluiten-knop) om de vensterstand
// te bewaren voordat go-webview2 het venster weghaalt.
var oudeWndProc uintptr

func vangSluiten(hwnd uintptr) {
	nieuw := syscall.NewCallback(func(h, msg, wp, lp uintptr) uintptr {
		if msg == wmClose {
			bewaarStand(h)
		}
		r, _, _ := procCallWinProc.Call(oudeWndProc, h, msg, wp, lp)
		return r
	})
	oudeWndProc, _, _ = procSetWinLong.Call(hwnd, gwlpWndProc, nieuw)
}

// haalNaarVoren: geminimaliseerd terugzetten en naar de voorgrond. Houdt Windows
// dat tegen (focus-bescherming), dan knippert het taakbalkicoon.
func haalNaarVoren(hwnd uintptr) {
	if min, _, _ := procIsIconic.Call(hwnd); min != 0 {
		procShowWindow.Call(hwnd, swRestore)
	}
	procVoorgrond.Call(hwnd)
}

// staVoorgrondToe laat het draaiende viewerproces zijn venster naar voren halen.
func staVoorgrondToe() { procStaVoorgrond.Call(asfwAny) }

// zetIcoon geeft het venster het icoon uit de exe (go-winres: groepsicoon "APP").
func zetIcoon(hwnd uintptr) {
	inst, _, _ := procModuleHandle.Call(0)
	naam, _ := syscall.UTF16PtrFromString("APP")
	for _, grootte := range []uintptr{0, 1} { // ICON_SMALL, ICON_BIG
		ico, _, _ := procLoadImageW.Call(inst, uintptr(unsafe.Pointer(naam)), imageIcon, 0, 0, lrDefaultSize|lrShared)
		if ico == 0 {
			log.Println("icoon niet gevonden in de exe")
			return
		}
		procSendMessageW.Call(hwnd, wmSetIcon, grootte, ico)
	}
}

// melding toont een informatievenster zonder het programma op te houden.
func melding(tekst string) {
	go func() {
		mb := user32.NewProc("MessageBoxW")
		t, _ := syscall.UTF16PtrFromString(tekst)
		k, _ := syscall.UTF16PtrFromString("Lutrea Profielviewer")
		mb.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(k)), 0x40)
	}()
}
