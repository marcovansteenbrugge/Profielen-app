package omzet

// Tests voor het lezen van PTS met de regels van JavaScript (Number, trim, split).

import (
	"math"
	"reflect"
	"testing"
)

func TestJsNummer(t *testing.T) {
	gevallen := map[string]float64{
		"12": 12, " 12.5 ": 12.5, "-3": -3, "+4": 4, ".5": 0.5, "5.": 5, "1e3": 1000, "1E-2": 0.01,
		"": 0, "   ": 0, "0x1f": 31, "0X1F": 31, "0o17": 15, "0b101": 5, "Infinity": math.Inf(1), "-Infinity": math.Inf(-1),
		"\ufeff7": 7, "\u00a08\u00a0": 8,
	}
	for s, wil := range gevallen {
		if kreeg := jsNummer(s); kreeg != wil {
			t.Errorf("jsNummer(%q) = %v, wil %v", s, kreeg, wil)
		}
	}
	// in JavaScript geen getal (strconv zou ze wel accepteren)
	for _, s := range []string{"abc", "1,5", "inf", "nan", "NaN", "0x1p3", "1_000", "--1", "-0x10", "1e", "e3", ".", "12a", "0x", "0b2"} {
		if v := jsNummer(s); !math.IsNaN(v) {
			t.Errorf("jsNummer(%q) = %v, wil NaN", s, v)
		}
	}
}

func TestJsDelen(t *testing.T) {
	gevallen := map[string][]string{
		"1 2 3":      {"1", "2", "3"},
		"1,2,3":      {"1", "2", "3"},
		"1 ,\t2  3":  {"1", "2", "3"},
		",1,2":       {"", "1", "2"},
		"1,2,":       {"1", "2", ""},
		"1\u00a02 3": {"1", "2", "3"},
		"":           {""},
	}
	for s, wil := range gevallen {
		if kreeg := jsDelen(s); !reflect.DeepEqual(kreeg, wil) {
			t.Errorf("jsDelen(%q) = %q, wil %q", s, kreeg, wil)
		}
	}
}

func TestRgbKolom(t *testing.T) {
	gevallen := []struct {
		regel string
		wil   int
	}{
		{"1 2 3", -1},
		{"1 2 3 10 20 30", 3},
		{"1 2 3 -500 10 20 30", 4},
		{"1 2 3 10 20 30 40", 4},
		{"1 2 3 10 20 30 0.1 0.2 0.9", 3},
		{"1 2 3 0.5 20 30 40 0.1 0.2 0.9", 4},
		{"1 2 3 300 20 30", -1},
		{"1 2 3 Infinity 20 30", -1},
	}
	for _, g := range gevallen {
		if kreeg := rgbKolomVoor(jsDelen(g.regel)); kreeg != g.wil {
			t.Errorf("rgbKolomVoor(%q) = %d, wil %d", g.regel, kreeg, g.wil)
		}
	}
}
