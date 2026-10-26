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

// Alleen op Windows is er een eigen WebView2-venster; elders het browservenster.
func openWebView2(url string) bool { return false }

func melding(tekst string) { fmt.Fprintln(os.Stderr, tekst) }

func staVoorgrondToe() {}
