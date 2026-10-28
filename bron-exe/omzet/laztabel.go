package omzet

// LASzip chunk-tabel decoderen: vertaling van vendor/laz-perf/chunktable.js (zelfde algoritme
// als LASzip/laz-perf). Aan het eind van een .laz staat per chunk de gecomprimeerde
// bytegrootte, arithmetisch gecodeerd met een IntegerCompressor (32 bits, 2 contexten).
// Resultaat: de byte-offset van elke chunk plus de eind-offset.

import (
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	acMin   = 0x01000000
	bmShift = 13
	bmMax   = 1 << 13
	dmShift = 15
	dmMax   = 1 << 15
)

type bitModel struct {
	bit0Count, bitCount, bit0Prob, updateCycle, bitsUntilUpdate uint32
}

func nieuwBitModel() *bitModel {
	return &bitModel{bit0Count: 1, bitCount: 2, bit0Prob: 1 << (bmShift - 1), updateCycle: 4, bitsUntilUpdate: 4}
}

func (m *bitModel) update() {
	if m.bitCount += m.updateCycle; m.bitCount > bmMax {
		m.bitCount = (m.bitCount + 1) >> 1
		m.bit0Count = (m.bit0Count + 1) >> 1
		if m.bit0Count == m.bitCount {
			m.bitCount++
		}
	}
	scale := uint64(0x80000000) / uint64(m.bitCount)
	m.bit0Prob = uint32(uint64(m.bit0Count) * scale >> (31 - bmShift))
	m.updateCycle = (5 * m.updateCycle) >> 2
	if m.updateCycle > 64 {
		m.updateCycle = 64
	}
	m.bitsUntilUpdate = m.updateCycle
}

type model struct {
	symbols, lastSymbol                      uint32
	distribution, symbolCount, decoderTable  []uint32
	tableSize, tableShift                    uint32
	totalCount, updateCycle, symbolsUntilUpd uint32
}

func nieuwModel(symbols uint32) *model {
	m := &model{symbols: symbols, lastSymbol: symbols - 1, distribution: make([]uint32, symbols), symbolCount: make([]uint32, symbols)}
	if symbols > 16 {
		tb := uint32(3)
		for symbols > 1<<(tb+2) {
			tb++
		}
		m.tableSize = 1 << tb
		m.tableShift = dmShift - tb
		m.decoderTable = make([]uint32, m.tableSize+2)
	}
	m.updateCycle = symbols
	for k := range m.symbolCount {
		m.symbolCount[k] = 1
	}
	m.update()
	m.updateCycle = (symbols + 6) >> 1
	m.symbolsUntilUpd = m.updateCycle
	return m
}

func (m *model) update() {
	if m.totalCount += m.updateCycle; m.totalCount > dmMax {
		m.totalCount = 0
		for n := range m.symbolCount {
			m.symbolCount[n] = (m.symbolCount[n] + 1) >> 1
			m.totalCount += m.symbolCount[n]
		}
	}
	var sum uint64
	s := uint32(0)
	scale := uint64(0x80000000) / uint64(m.totalCount)
	for k := uint32(0); k < m.symbols; k++ {
		m.distribution[k] = uint32(scale * sum >> (31 - dmShift))
		sum += uint64(m.symbolCount[k])
		if m.tableSize != 0 {
			w := m.distribution[k] >> m.tableShift
			for s < w {
				s++
				m.decoderTable[s] = k - 1
			}
		}
	}
	if m.tableSize != 0 {
		m.decoderTable[0] = 0
		for s <= m.tableSize {
			s++
			m.decoderTable[s] = m.symbols - 1
		}
	}
	m.updateCycle = (5 * m.updateCycle) >> 2
	if maxCycle := (m.symbols + 6) << 3; m.updateCycle > maxCycle {
		m.updateCycle = maxCycle
	}
	m.symbolsUntilUpd = m.updateCycle
}

type arithDecoder struct {
	b             []byte
	p             int
	value, length uint32
}

var errTabelAfgekapt = errors.New("chunk-tabel is afgekapt")

func (d *arithDecoder) byte_() uint32 {
	if d.p >= len(d.b) {
		panic(errTabelAfgekapt)
	}
	d.p++
	return uint32(d.b[d.p-1])
}

func (d *arithDecoder) renorm() {
	for {
		d.value = d.value<<8 | d.byte_()
		d.length <<= 8
		if d.length >= acMin {
			return
		}
	}
}

func (d *arithDecoder) decodeBit(m *bitModel) uint32 {
	x := m.bit0Prob * (d.length >> bmShift)
	sym := uint32(0)
	if d.value >= x {
		sym = 1
	}
	if sym == 0 {
		d.length = x
		m.bit0Count++
	} else {
		d.value -= x
		d.length -= x
	}
	if d.length < acMin {
		d.renorm()
	}
	if m.bitsUntilUpdate--; m.bitsUntilUpdate == 0 {
		m.update()
	}
	return sym
}

func (d *arithDecoder) decodeSymbol(m *model) uint32 {
	var sym, x uint32
	y := d.length
	if m.decoderTable != nil {
		d.length >>= dmShift
		dv := d.value / d.length
		t := dv >> m.tableShift
		sym = m.decoderTable[t]
		n := uint64(m.decoderTable[t+1]) + 1
		for n > uint64(sym)+1 {
			k := uint32((uint64(sym) + n) >> 1)
			if m.distribution[k] > dv {
				n = uint64(k)
			} else {
				sym = k
			}
		}
		x = m.distribution[sym] * d.length
		if sym != m.lastSymbol {
			y = m.distribution[sym+1] * d.length
		}
	} else {
		d.length >>= dmShift
		n := m.symbols
		k := n >> 1
		for {
			z := d.length * m.distribution[k]
			if z > d.value {
				n, y = k, z
			} else {
				sym, x = k, z
			}
			if k = (sym + n) >> 1; k == sym {
				break
			}
		}
	}
	d.value -= x
	d.length = y - x
	if d.length < acMin {
		d.renorm()
	}
	m.symbolCount[sym]++
	if m.symbolsUntilUpd--; m.symbolsUntilUpd == 0 {
		m.update()
	}
	return sym
}

func (d *arithDecoder) readShort() uint32 {
	d.length >>= 16
	sym := d.value / d.length
	d.value -= d.length * sym
	if d.length < acMin {
		d.renorm()
	}
	return sym
}

func (d *arithDecoder) readBits(bits uint32) uint32 {
	if bits > 19 {
		lo := d.readShort()
		hi := d.readBits(bits - 16)
		return hi<<16 | lo
	}
	d.length >>= bits
	sym := d.value / d.length
	d.value -= d.length * sym
	if d.length < acMin {
		d.renorm()
	}
	return sym
}

// intDecompressor: IntegerCompressor(bits = 32, contexts, bitsHigh = 8)
type intDecompressor struct {
	dec        *arithDecoder
	bitsHigh   uint32
	mBits      []*model
	corrector0 *bitModel
	corrector  []*model // index 1..32
}

func nieuweIntDecompressor(dec *arithDecoder, contexts int) *intDecompressor {
	ic := &intDecompressor{dec: dec, bitsHigh: 8, corrector0: nieuwBitModel(), corrector: make([]*model, 33)}
	for i := 0; i < contexts; i++ {
		ic.mBits = append(ic.mBits, nieuwModel(33))
	}
	for k := uint32(1); k <= 32; k++ {
		if k <= ic.bitsHigh {
			ic.corrector[k] = nieuwModel(1 << k)
		} else {
			ic.corrector[k] = nieuwModel(1 << ic.bitsHigh)
		}
	}
	return ic
}

func (ic *intDecompressor) readCorrector(mBits *model) int64 {
	dec := ic.dec
	k := dec.decodeSymbol(mBits)
	if k == 0 {
		return int64(dec.decodeBit(ic.corrector0))
	}
	if k >= 32 {
		return -2147483648
	}
	var c uint32
	if k <= ic.bitsHigh {
		c = dec.decodeSymbol(ic.corrector[k])
	} else {
		k1 := k - ic.bitsHigh
		c = dec.decodeSymbol(ic.corrector[k])
		c1 := dec.readBits(k1)
		c = c<<k1 | c1
	}
	if int64(c) >= int64(1)<<(k-1) {
		return int64(c) + 1
	}
	return int64(c) - (int64(1)<<k - 1)
}

func (ic *intDecompressor) decompress(pred int32, context int) int32 {
	return int32(int64(pred) + ic.readCorrector(ic.mBits[context])) // | 0: rondlopen binnen 32 bits
}

// ChunkTabel decodeert de chunk-tabel: buf = de bytes vanaf de tabel-offset tot het eind van
// het bestand; eersteChunk = byte-offset van de eerste chunk (puntdata-start + 8). Geeft de
// offsets (aantal chunks + 1).
func ChunkTabel(buf []byte, eersteChunk int64, variabel bool) (offsets []int64, err error) {
	if len(buf) < 8 {
		return nil, errTabelAfgekapt
	}
	versie, aantal := binary.LittleEndian.Uint32(buf[0:]), binary.LittleEndian.Uint32(buf[4:])
	if versie != 0 {
		return nil, fmt.Errorf("onbekende chunk-tabel-versie %d", versie)
	}
	defer func() {
		if r := recover(); r != nil {
			if e, ok := r.(error); ok && errors.Is(e, errTabelAfgekapt) {
				offsets, err = nil, e
				return
			}
			panic(r)
		}
	}()
	offsets = []int64{eersteChunk}
	if aantal == 0 {
		return offsets, nil
	}
	dec := &arithDecoder{b: buf, p: 8, length: 0xFFFFFFFF}
	dec.value = dec.byte_()<<24 | dec.byte_()<<16 | dec.byte_()<<8 | dec.byte_()
	ic := nieuweIntDecompressor(dec, 2)
	var vorigeGrootte, vorigAantal int32
	pos := eersteChunk
	for i := uint32(0); i < aantal; i++ {
		if variabel {
			vorigAantal = ic.decompress(vorigAantal, 0)
		}
		vorigeGrootte = ic.decompress(vorigeGrootte, 1)
		pos += int64(vorigeGrootte)
		offsets = append(offsets, pos)
	}
	return offsets, nil
}
