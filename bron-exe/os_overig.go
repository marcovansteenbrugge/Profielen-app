//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
)

func verbergConsole(cmd *exec.Cmd) {}

func openStandaardBrowser(url string) { exec.Command("xdg-open", url).Start() }

func fout(tekst string) { fmt.Fprintln(os.Stderr, tekst) }
