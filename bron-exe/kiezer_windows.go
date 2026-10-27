//go:build windows

package main

// Windows-kiezer voor mappen en bestanden (plan eigen-bestandstoegang, F1):
// IFileOpenDialog / IFileSaveDialog via COM, zonder cgo. De kiezer draait op de
// thread van het venster (die is al COM-STA, go-webview2 doet CoInitializeEx), met
// het venster als eigenaar, zodat hij modaal is: het venster wacht tot je kiest.

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"
)

var (
	ole32               = syscall.NewLazyDLL("ole32.dll")
	procCoCreate        = ole32.NewProc("CoCreateInstance")
	procCoTaskMemFree   = ole32.NewProc("CoTaskMemFree")
	clsidFileOpenDialog = syscall.GUID{Data1: 0xDC1C5A9C, Data2: 0xE88A, Data3: 0x4DDE, Data4: [8]byte{0xA5, 0xA1, 0x60, 0xF8, 0x2A, 0x20, 0xAE, 0xF7}}
	clsidFileSaveDialog = syscall.GUID{Data1: 0xC0B4E2F3, Data2: 0xBA21, Data3: 0x4773, Data4: [8]byte{0x8D, 0xBA, 0x33, 0x5E, 0xC9, 0x46, 0xEB, 0x8B}}
	iidIFileOpenDialog  = syscall.GUID{Data1: 0xD57C7288, Data2: 0xD4AD, Data3: 0x4768, Data4: [8]byte{0xBE, 0x02, 0x9D, 0x96, 0x95, 0x32, 0xD9, 0x60}}
	iidIFileSaveDialog  = syscall.GUID{Data1: 0x84BCCD23, Data2: 0x5FDE, Data3: 0x4CDB, Data4: [8]byte{0xAE, 0xA4, 0xAF, 0x64, 0xB8, 0x3D, 0x78, 0xAB}}
)

const (
	clsctxInprocServer = 0x1
	fosOverwritePrompt = 0x2
	fosNoChangeDir     = 0x8
	fosPickFolders     = 0x20
	fosForceFileSystem = 0x40
	fosPathMustExist   = 0x800
	fosFileMustExist   = 0x1000
	sigdnFileSysPath   = 0x80058000
	hrGeannuleerd      = 0x800704C7 // HRESULT_FROM_WIN32(ERROR_CANCELLED)

	// plaatsen in de vtable (IUnknown, IModalWindow, IFileDialog, IShellItem)
	vtRelease        = 2
	vtShow           = 3
	vtSetFileTypes   = 4
	vtSetOptions     = 9
	vtGetOptions     = 10
	vtSetFileName    = 15
	vtSetTitle       = 17
	vtGetResult      = 20
	vtSetDefaultExt  = 22
	vtGetDisplayName = 5
)

// comObject: een COM-object; het eerste veld wijst naar de vtable.
type comObject struct{ vtbl *[32]uintptr }

func (o *comObject) roep(plek int, args ...uintptr) uintptr {
	r, _, _ := syscall.SyscallN(o.vtbl[plek], append([]uintptr{uintptr(unsafe.Pointer(o))}, args...)...)
	return r
}

func (o *comObject) loslaten() { o.roep(vtRelease) }

func hrFout(wat string, hr uintptr) error {
	if int32(hr) < 0 {
		return fmt.Errorf("%s: HRESULT 0x%08X", wat, uint32(hr))
	}
	return nil
}

// filterSpec = COMDLG_FILTERSPEC
type filterSpec struct{ naam, patroon *uint16 }

// toonKiezer opent de kiezer modaal voor eigenaar. "" = geannuleerd.
func toonKiezer(eigenaar uintptr, o kiesOpdracht) (string, error) {
	clsid, iid := &clsidFileOpenDialog, &iidIFileOpenDialog
	if o.Soort == "opslaan" {
		clsid, iid = &clsidFileSaveDialog, &iidIFileSaveDialog
	}
	var dlg *comObject
	hr, _, _ := procCoCreate.Call(uintptr(unsafe.Pointer(clsid)), 0, clsctxInprocServer,
		uintptr(unsafe.Pointer(iid)), uintptr(unsafe.Pointer(&dlg)))
	if err := hrFout("kiezer maken", hr); err != nil {
		return "", err
	}
	defer dlg.loslaten()

	var opties uint32
	dlg.roep(vtGetOptions, uintptr(unsafe.Pointer(&opties)))
	opties |= fosForceFileSystem | fosNoChangeDir | fosPathMustExist
	switch o.Soort {
	case "map":
		opties |= fosPickFolders
	case "open":
		opties |= fosFileMustExist
	case "opslaan":
		opties |= fosOverwritePrompt
	}
	if err := hrFout("opties", dlg.roep(vtSetOptions, uintptr(opties))); err != nil {
		return "", err
	}
	if o.Titel != "" {
		t, _ := syscall.UTF16PtrFromString(o.Titel)
		dlg.roep(vtSetTitle, uintptr(unsafe.Pointer(t)))
	}
	if o.Soort != "map" && len(o.Filter) > 0 {
		specs := make([]filterSpec, 0, len(o.Filter))
		for _, f := range o.Filter {
			n, _ := syscall.UTF16PtrFromString(f.Naam)
			p, _ := syscall.UTF16PtrFromString(f.Patroon)
			specs = append(specs, filterSpec{n, p})
		}
		dlg.roep(vtSetFileTypes, uintptr(len(specs)), uintptr(unsafe.Pointer(&specs[0])))
	}
	if o.Soort == "opslaan" {
		if o.Naam != "" {
			n, _ := syscall.UTF16PtrFromString(o.Naam)
			dlg.roep(vtSetFileName, uintptr(unsafe.Pointer(n)))
		}
		if o.Extensie != "" {
			e, _ := syscall.UTF16PtrFromString(o.Extensie)
			dlg.roep(vtSetDefaultExt, uintptr(unsafe.Pointer(e)))
		}
	}

	hr = dlg.roep(vtShow, eigenaar)
	if uint32(hr) == hrGeannuleerd {
		return "", nil
	}
	if err := hrFout("kiezer tonen", hr); err != nil {
		return "", err
	}
	var item *comObject
	if err := hrFout("keuze ophalen", dlg.roep(vtGetResult, uintptr(unsafe.Pointer(&item)))); err != nil {
		return "", err
	}
	if item == nil {
		return "", errors.New("keuze ophalen: geen item")
	}
	defer item.loslaten()
	var naam *uint16
	if err := hrFout("pad ophalen", item.roep(vtGetDisplayName, sigdnFileSysPath, uintptr(unsafe.Pointer(&naam)))); err != nil {
		return "", err
	}
	defer procCoTaskMemFree.Call(uintptr(unsafe.Pointer(naam)))
	var tekens []uint16
	for p := naam; *p != 0; p = (*uint16)(unsafe.Add(unsafe.Pointer(p), 2)) {
		tekens = append(tekens, *p)
	}
	return syscall.UTF16ToString(tekens), nil
}
