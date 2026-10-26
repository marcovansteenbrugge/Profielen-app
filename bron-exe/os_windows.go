//go:build windows

package main

import (
	"os/exec"
	"syscall"
	"unsafe"
)

func verbergConsole(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}

func openStandaardBrowser(url string) {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	verbergConsole(cmd)
	cmd.Start()
}

func fout(tekst string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	mb := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(tekst)
	k, _ := syscall.UTF16PtrFromString("Lutrea Profielviewer")
	mb.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(k)), 0x10)
}
