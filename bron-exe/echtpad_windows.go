//go:build windows

package main

// Het echte pad van een bestaand bestand of map volgens Windows zelf. Go's
// EvalSymlinks lost een junction (mklink /J) niet op, en die kan elke gebruiker
// maken; daarom GetFinalPathNameByHandleW. Lost ook korte 8.3-namen op.

import (
	"strings"
	"syscall"
	"unsafe"
)

var procFinalPad = syscall.NewLazyDLL("kernel32.dll").NewProc("GetFinalPathNameByHandleW")

const fileFlagBackupSemantics = 0x02000000 // nodig om een map te openen

func vastPad(pad string) (string, error) {
	p, err := syscall.UTF16PtrFromString(pad)
	if err != nil {
		return "", err
	}
	h, err := syscall.CreateFile(p, 0,
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE,
		nil, syscall.OPEN_EXISTING, fileFlagBackupSemantics, 0)
	if err != nil {
		return "", err
	}
	defer syscall.CloseHandle(h)
	buf := make([]uint16, 512)
	for {
		n, _, e := procFinalPad.Call(uintptr(h), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), 0)
		if n == 0 {
			return "", e
		}
		if int(n) < len(buf) {
			buf = buf[:n]
			break
		}
		buf = make([]uint16, n+1)
	}
	s := syscall.UTF16ToString(buf)
	switch {
	case strings.HasPrefix(s, `\\?\UNC\`):
		s = `\\` + s[len(`\\?\UNC\`):]
	case strings.HasPrefix(s, `\\?\`):
		s = s[len(`\\?\`):]
	}
	return s, nil
}
