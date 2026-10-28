package omzet

// LAZ decoderen met laz-perf (dezelfde decoder als de viewer: vendor/laz-perf/laz-perf.wasm)
// in wazero, een WebAssembly-runtime in pure Go (geen cgo). Plan omzetten-in-exe, F4/F5.
//
// laz-perf is met Emscripten gebouwd en maakt zijn klasse ChunkDecoder bekend via "embind":
// bij het opstarten roept de module _embind_register_class(_constructor/_function) aan met
// nummers in zijn functietabel. Normaal vangt de JavaScript-lijm (laz-perf.js) dat op; hier
// doet een kleine Go-vervanging dat, en roept de decoder daarna via de functietabel aan:
//   constructor:  invoker(rawConstructor) → this
//   methode:      invoker(context, this, args…)
//   destructor:   rawDestructor(this)
// Elke werker krijgt een eigen runtime en instantie (eigen geheugen); het vertalen naar
// machinecode gebeurt één keer (gedeelde compilatiecache).

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/experimental/table"
)

var (
	lazCache = wazero.NewCompilationCache()
)

type embindMethode struct {
	invoker, context uint32
	sig              string
}

// LazDecoder: één laz-perf-instantie (niet tegelijk vanuit meerdere goroutines gebruiken).
type LazDecoder struct {
	rt      wazero.Runtime
	mod     api.Module
	malloc  api.Function
	free    api.Function
	klasse  uint32 // rawType van ChunkDecoder
	maak    embindMethode
	maakFn  uint32 // rawConstructor
	weg     uint32 // rawDestructor
	open    embindMethode
	punt    embindMethode
	klassen map[uint32]string
	// aangeroepen functies uit de tabel (eenmalig opgezocht)
	maakF, wegF, openF, puntF api.Function
}

// NieuweLazDecoder start een laz-perf-instantie uit de wasm-bytes.
func NieuweLazDecoder(ctx context.Context, wasm []byte) (*LazDecoder, error) {
	rt := wazero.NewRuntimeWithConfig(ctx, wazero.NewRuntimeConfig().WithCompilationCache(lazCache))
	d := &LazDecoder{rt: rt, klassen: map[uint32]string{}}
	fout := func(err error) (*LazDecoder, error) { rt.Close(ctx); return nil, err }
	gecompileerd, err := rt.CompileModule(ctx, wasm)
	if err != nil {
		return fout(fmt.Errorf("laz-perf vertalen: %w", err))
	}
	// "env" en "wasi_snapshot_preview1": eigen Go-functies met precies de typen die de module
	// vraagt (Emscripten splitst 64-bits getallen, dus de standaard-WASI van wazero past niet)
	hosts := map[string]wazero.HostModuleBuilder{}
	for _, imp := range gecompileerd.ImportedFunctions() {
		modNaam, naam, _ := imp.Import()
		if modNaam != "env" && modNaam != "wasi_snapshot_preview1" {
			continue
		}
		if hosts[modNaam] == nil {
			hosts[modNaam] = rt.NewHostModuleBuilder(modNaam)
		}
		f := d.hostFunctie(naam)
		hosts[modNaam].NewFunctionBuilder().WithGoModuleFunction(api.GoModuleFunc(func(ctx context.Context, m api.Module, stack []uint64) {
			f(ctx, m, stack)
		}), imp.ParamTypes(), imp.ResultTypes()).Export(naam)
	}
	for _, h := range hosts {
		if _, err := h.Instantiate(ctx); err != nil {
			return fout(err)
		}
	}
	mod, err := rt.InstantiateModule(ctx, gecompileerd, wazero.NewModuleConfig().WithStartFunctions())
	if err != nil {
		return fout(fmt.Errorf("laz-perf starten: %w", err))
	}
	d.mod = mod
	for _, n := range []string{"emscripten_stack_init", "__wasm_call_ctors"} {
		if f := mod.ExportedFunction(n); f != nil {
			if _, err := f.Call(ctx); err != nil {
				return fout(fmt.Errorf("laz-perf %s: %w", n, err))
			}
		}
	}
	if d.open.sig == "" {
		if f := mod.ExportedFunction("_embind_initialize_bindings"); f != nil {
			if _, err := f.Call(ctx); err != nil {
				return fout(fmt.Errorf("laz-perf bindings: %w", err))
			}
		}
	}
	if d.open.sig == "" || d.punt.sig == "" || d.maak.sig == "" {
		return fout(errors.New("laz-perf: ChunkDecoder (open, getPoint) niet gevonden"))
	}
	d.malloc, d.free = mod.ExportedFunction("malloc"), mod.ExportedFunction("free")
	if d.maakF, err = d.functie(d.maak.invoker, d.maak.sig); err == nil {
		if d.openF, err = d.functie(d.open.invoker, d.open.sig); err == nil {
			if d.puntF, err = d.functie(d.punt.invoker, d.punt.sig); err == nil {
				d.wegF, err = d.functie(d.weg, "vi")
			}
		}
	}
	if err != nil {
		return fout(err)
	}
	return d, nil
}

// functie zoekt een functie in de tabel op, met de typen uit een embind-handtekening
// (v = void, i = i32, f = f32, d = f64, j = i64; eerste letter is het resultaat).
func (d *LazDecoder) functie(index uint32, sig string) (f api.Function, err error) {
	typ := func(c byte) api.ValueType {
		switch c {
		case 'j':
			return api.ValueTypeI64
		case 'f':
			return api.ValueTypeF32
		case 'd':
			return api.ValueTypeF64
		}
		return api.ValueTypeI32
	}
	var res []api.ValueType
	if sig[0] != 'v' {
		res = []api.ValueType{typ(sig[0])}
	}
	var par []api.ValueType
	for i := 1; i < len(sig); i++ {
		par = append(par, typ(sig[i]))
	}
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("laz-perf: functie %d (%s) niet te vinden: %v", index, sig, r)
		}
	}()
	return table.LookupFunction(d.mod, 0, index, par, res), nil
}

func (d *LazDecoder) tekst(m api.Module, ptr uint32) string {
	var b []byte
	for {
		c, ok := m.Memory().ReadByte(ptr)
		if !ok || c == 0 {
			return string(b)
		}
		b = append(b, c)
		ptr++
	}
}

// hostFunctie: de vervanging voor de JavaScript-lijm, per geïmporteerde functie.
func (d *LazDecoder) hostFunctie(naam string) func(context.Context, api.Module, []uint64) {
	u32 := func(v uint64) uint32 { return uint32(v) }
	switch naam {
	case "_embind_register_class":
		// rawType, rawPointerType, rawConstPointerType, baseClassRawType, getActualTypeSignature,
		// getActualType, upcastSignature, upcast, downcastSignature, downcast, name,
		// destructorSignature, rawDestructor
		return func(_ context.Context, m api.Module, s []uint64) {
			naam := d.tekst(m, u32(s[10]))
			d.klassen[u32(s[0])] = naam
			if naam == "ChunkDecoder" {
				d.klasse, d.weg = u32(s[0]), u32(s[12])
			}
		}
	case "_embind_register_class_constructor":
		// rawClassType, argCount, rawArgTypesAddr, invokerSignature, invoker, rawConstructor
		return func(_ context.Context, m api.Module, s []uint64) {
			if d.klassen[u32(s[0])] == "ChunkDecoder" && u32(s[1]) == 1 {
				d.maak = embindMethode{invoker: u32(s[4]), sig: d.tekst(m, u32(s[3]))}
				d.maakFn = u32(s[5])
			}
		}
	case "_embind_register_class_function":
		// rawClassType, methodName, argCount, rawArgTypesAddr, invokerSignature, rawInvoker, context, isPureVirtual
		return func(_ context.Context, m api.Module, s []uint64) {
			if d.klassen[u32(s[0])] != "ChunkDecoder" {
				return
			}
			me := embindMethode{invoker: u32(s[5]), context: u32(s[6]), sig: d.tekst(m, u32(s[4]))}
			switch d.tekst(m, u32(s[1])) {
			case "open":
				d.open = me
			case "getPoint":
				d.punt = me
			}
		}
	case "emscripten_memcpy_big":
		return func(_ context.Context, m api.Module, s []uint64) {
			dst, src, n := u32(s[0]), u32(s[1]), u32(s[2])
			if b, ok := m.Memory().Read(src, n); ok {
				tmp := append([]byte(nil), b...)
				m.Memory().Write(dst, tmp)
			}
		}
	case "emscripten_resize_heap":
		return func(_ context.Context, m api.Module, s []uint64) {
			nodig := u32(s[0])
			huidig := m.Memory().Size()
			if nodig <= huidig {
				s[0] = 1
				return
			}
			if _, ok := m.Memory().Grow((nodig - huidig + 65535) / 65536); ok {
				s[0] = 1
			} else {
				s[0] = 0
			}
		}
	case "__cxa_allocate_exception":
		return func(ctx context.Context, m api.Module, s []uint64) {
			r, err := m.ExportedFunction("malloc").Call(ctx, s[0])
			if err != nil || len(r) == 0 {
				panic(errors.New("laz-perf: geen geheugen voor een uitzondering"))
			}
			s[0] = r[0]
		}
	case "__cxa_throw":
		return func(context.Context, api.Module, []uint64) {
			panic(errors.New("laz-perf gaf een fout (C++-uitzondering)"))
		}
	case "fd_write":
		// fd, iovs, iovsLen, nwritten: uitvoer (printf) weggooien, maar wel als geschreven melden
		return func(_ context.Context, m api.Module, s []uint64) {
			iovs, n, uit := u32(s[1]), u32(s[2]), u32(s[3])
			var totaal uint32
			for i := uint32(0); i < n; i++ {
				l, _ := m.Memory().ReadUint32Le(iovs + i*8 + 4)
				totaal += l
			}
			m.Memory().WriteUint32Le(uit, totaal)
			s[0] = 0
		}
	case "environ_sizes_get":
		return func(_ context.Context, m api.Module, s []uint64) {
			m.Memory().WriteUint32Le(u32(s[0]), 0)
			m.Memory().WriteUint32Le(u32(s[1]), 0)
			s[0] = 0
		}
	case "abort":
		return func(context.Context, api.Module, []uint64) { panic(errors.New("laz-perf brak af (abort)")) }
	}
	// de overige embind-aanmeldingen (typen) en strftime_l: niets doen, 0 teruggeven
	return func(_ context.Context, _ api.Module, s []uint64) {
		for i := range s {
			s[i] = 0
		}
	}
}

// Sluit de instantie.
func (d *LazDecoder) Sluit(ctx context.Context) { d.rt.Close(ctx) }

// Chunk decodeert één chunk (de gecomprimeerde bytes) naar n punten van rl bytes elk.
func (d *LazDecoder) Chunk(ctx context.Context, data []byte, formaat uint8, rl uint16, n int) (punten []byte, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("laz-perf: %v", r)
		}
	}()
	roep := func(f api.Function, args ...uint64) uint64 {
		r, err := f.Call(ctx, args...)
		if err != nil {
			panic(err)
		}
		if len(r) > 0 {
			return r[0]
		}
		return 0
	}
	mem := d.mod.Memory()
	in := uint32(roep(d.malloc, uint64(len(data))))
	defer roep(d.free, uint64(in))
	if !mem.Write(in, data) {
		return nil, errors.New("laz-perf: chunk past niet in het geheugen")
	}
	uit := uint32(roep(d.malloc, uint64(rl)))
	defer roep(d.free, uint64(uit))
	this := roep(d.maakF, uint64(d.maakFn))
	defer roep(d.wegF, this)
	roep(d.openF, uint64(d.open.context), this, uint64(formaat), uint64(rl), uint64(in))
	punten = make([]byte, n*int(rl))
	for i := 0; i < n; i++ {
		roep(d.puntF, uint64(d.punt.context), this, uint64(uit))
		b, ok := mem.Read(uit, uint32(rl))
		if !ok {
			return nil, errors.New("laz-perf: punt buiten het geheugen")
		}
		copy(punten[i*int(rl):], b)
	}
	return punten, nil
}

// LazVlr zoekt de laszip-VLR (user_id "laszip encoded", record 22204) en geeft de vaste
// chunk-grootte (vindLaszipVlr in de viewer).
func LazVlr(kop []byte, aantalVLR uint32, kopGrootte uint16) (chunk int32, err error) {
	le := binary.LittleEndian
	o := int(kopGrootte)
	for i := uint32(0); i < aantalVLR; i++ {
		if o+54 > len(kop) {
			break
		}
		uid := string(kop[o+2 : o+18])
		if j := indexNul(uid); j >= 0 {
			uid = uid[:j]
		}
		rid := le.Uint16(kop[o+18:])
		lengte := int(le.Uint16(kop[o+20:]))
		if uid == "laszip encoded" && rid == 22204 && o+54+16 <= len(kop) {
			return int32(le.Uint32(kop[o+54+12:])), nil
		}
		o += 54 + lengte
	}
	return 0, errors.New("laszip-VLR niet gevonden in dit LAZ-bestand")
}

func indexNul(s string) int {
	for i := 0; i < len(s); i++ {
		if s[i] == 0 {
			return i
		}
	}
	return -1
}
