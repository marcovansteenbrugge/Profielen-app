//go:build windows

package main

// Eigen programmavenster met WebView2 (de Edge-webweergave die in Windows 10/11
// zit). Het venster laadt dezelfde lokale server als het oude Chrome/Edge-venster,
// dus localStorage/IndexedDB/service worker werken zoals voorheen. Venster dicht =
// programma stopt. Ontbreekt de WebView2-runtime, dan valt main() terug op het
// oude Chrome/Edge-app-venster (zie openVenster).

import (
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
	swMaximize    = 3
	wmSetIcon     = 0x0080
	imageIcon     = 1
	lrDefaultSize = 0x0040
	lrShared      = 0x8000
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	procShowWindow   = user32.NewProc("ShowWindow")
	procLoadImageW   = user32.NewProc("LoadImageW")
	procSendMessageW = user32.NewProc("SendMessageW")
	procFindWindowW  = user32.NewProc("FindWindowW")
	procDestroyWin   = user32.NewProc("DestroyWindow")
	procModuleHandle = kernel32.NewProc("GetModuleHandleW")
)

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
	procShowWindow.Call(hwnd, swMaximize)
	log.Println("WebView2-venster geopend, gegevensmap", data)

	// Afsluiten-knop in de viewer (POST /__ptsviewer/stop): venster sluiten
	go func() {
		<-stopVerzocht
		log.Println("afsluiten via de knop")
		w.Destroy()
	}()

	w.Navigate(url)
	w.Run()
	return true
}

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
