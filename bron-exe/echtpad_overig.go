//go:build !windows

package main

import "path/filepath"

// vastPad: het echte pad van een bestaand bestand of map.
func vastPad(pad string) (string, error) { return filepath.EvalSymlinks(pad) }
