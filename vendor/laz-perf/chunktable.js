/* LASzip chunk-tabel decoderen (zelfde algoritme als LASzip/laz-perf):
   aan het eind van een .laz staat per chunk de gecomprimeerde bytegrootte,
   arithmetisch gecodeerd met een IntegerCompressor (32 bits, 2 contexten).
   Resultaat: array met de byte-offset van elke chunk + eind-offset. */
(function (global) {
  'use strict';
  const AC_MIN = 0x01000000;
  const BM_SHIFT = 13, BM_MAX = 1 << 13;
  const DM_SHIFT = 15, DM_MAX = 1 << 15;

  function BitModel() {
    this.bit0Count = 1; this.bitCount = 2; this.bit0Prob = 1 << (BM_SHIFT - 1);
    this.updateCycle = this.bitsUntilUpdate = 4;
  }
  BitModel.prototype.update = function () {
    if ((this.bitCount += this.updateCycle) > BM_MAX) {
      this.bitCount = (this.bitCount + 1) >>> 1;
      this.bit0Count = (this.bit0Count + 1) >>> 1;
      if (this.bit0Count === this.bitCount) ++this.bitCount;
    }
    const scale = Math.floor(0x80000000 / this.bitCount);
    this.bit0Prob = Math.floor((this.bit0Count * scale) / Math.pow(2, 31 - BM_SHIFT));
    this.updateCycle = (5 * this.updateCycle) >>> 2;
    if (this.updateCycle > 64) this.updateCycle = 64;
    this.bitsUntilUpdate = this.updateCycle;
  };

  function Model(symbols) {
    this.symbols = symbols;
    this.lastSymbol = symbols - 1;
    this.distribution = new Uint32Array(symbols);
    this.symbolCount = new Uint32Array(symbols);
    if (symbols > 16) {
      let tb = 3;
      while (symbols > (1 << (tb + 2))) ++tb;
      this.tableSize = 1 << tb;
      this.tableShift = DM_SHIFT - tb;
      this.decoderTable = new Uint32Array(this.tableSize + 2);
    } else {
      this.tableSize = 0; this.tableShift = 0; this.decoderTable = null;
    }
    this.totalCount = 0;
    this.updateCycle = symbols;
    for (let k = 0; k < symbols; k++) this.symbolCount[k] = 1;
    this.update();
    this.symbolsUntilUpdate = this.updateCycle = (symbols + 6) >>> 1;
  }
  Model.prototype.update = function () {
    if ((this.totalCount += this.updateCycle) > DM_MAX) {
      this.totalCount = 0;
      for (let n = 0; n < this.symbols; n++) this.totalCount += (this.symbolCount[n] = (this.symbolCount[n] + 1) >>> 1);
    }
    let sum = 0, s = 0;
    const scale = Math.floor(0x80000000 / this.totalCount);
    const deel = Math.pow(2, 31 - DM_SHIFT);
    if (this.tableSize === 0) {
      for (let k = 0; k < this.symbols; k++) {
        this.distribution[k] = Math.floor((scale * sum) / deel);
        sum += this.symbolCount[k];
      }
    } else {
      for (let k = 0; k < this.symbols; k++) {
        this.distribution[k] = Math.floor((scale * sum) / deel);
        sum += this.symbolCount[k];
        const w = this.distribution[k] >>> this.tableShift;
        while (s < w) this.decoderTable[++s] = k - 1;
      }
      this.decoderTable[0] = 0;
      while (s <= this.tableSize) this.decoderTable[++s] = this.symbols - 1;
    }
    this.updateCycle = (5 * this.updateCycle) >>> 2;
    const maxCycle = (this.symbols + 6) << 3;
    if (this.updateCycle > maxCycle) this.updateCycle = maxCycle;
    this.symbolsUntilUpdate = this.updateCycle;
  };

  function Decoder(bytes, pos) {
    this.b = bytes; this.p = pos;
    this.value = ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0;
    this.length = 0xFFFFFFFF;
  }
  Decoder.prototype.byte = function () {
    if (this.p >= this.b.length) throw new Error('chunk-tabel is afgekapt');
    return this.b[this.p++];
  };
  Decoder.prototype.renorm = function () {
    do {
      this.value = ((this.value << 8) | this.byte()) >>> 0;
      this.length = (this.length << 8) >>> 0;
    } while (this.length < AC_MIN);
  };
  Decoder.prototype.decodeBit = function (m) {
    const x = (m.bit0Prob * (this.length >>> BM_SHIFT)) >>> 0;
    const sym = this.value >= x ? 1 : 0;
    if (sym === 0) { this.length = x; ++m.bit0Count; }
    else { this.value = (this.value - x) >>> 0; this.length = (this.length - x) >>> 0; }
    if (this.length < AC_MIN) this.renorm();
    if (--m.bitsUntilUpdate === 0) m.update();
    return sym;
  };
  Decoder.prototype.decodeSymbol = function (m) {
    let n, sym, x, y = this.length;
    if (m.decoderTable) {
      this.length = this.length >>> DM_SHIFT;
      const dv = Math.floor(this.value / this.length);
      const t = dv >>> m.tableShift;
      sym = m.decoderTable[t];
      n = m.decoderTable[t + 1] + 1;
      while (n > sym + 1) {
        const k = (sym + n) >>> 1;
        if (m.distribution[k] > dv) n = k; else sym = k;
      }
      x = (m.distribution[sym] * this.length) >>> 0;
      if (sym !== m.lastSymbol) y = (m.distribution[sym + 1] * this.length) >>> 0;
    } else {
      x = sym = 0;
      this.length = this.length >>> DM_SHIFT;
      n = m.symbols;
      let k = n >>> 1;
      do {
        const z = (this.length * m.distribution[k]) >>> 0;
        if (z > this.value) { n = k; y = z; } else { sym = k; x = z; }
      } while ((k = (sym + n) >>> 1) !== sym);
    }
    this.value = (this.value - x) >>> 0;
    this.length = (y - x) >>> 0;
    if (this.length < AC_MIN) this.renorm();
    ++m.symbolCount[sym];
    if (--m.symbolsUntilUpdate === 0) m.update();
    return sym;
  };
  Decoder.prototype.readShort = function () {
    this.length = this.length >>> 16;
    const sym = Math.floor(this.value / this.length);
    this.value = (this.value - this.length * sym) >>> 0;
    if (this.length < AC_MIN) this.renorm();
    return sym;
  };
  Decoder.prototype.readBits = function (bits) {
    if (bits > 19) {
      const lo = this.readShort();
      const hi = this.readBits(bits - 16);
      return ((hi << 16) | lo) >>> 0;
    }
    this.length = this.length >>> bits;
    const sym = Math.floor(this.value / this.length);
    this.value = (this.value - this.length * sym) >>> 0;
    if (this.length < AC_MIN) this.renorm();
    return sym;
  };

  // IntegerCompressor(bits = 32, contexts = 2, bitsHigh = 8)
  function IntDecompressor(dec, contexts) {
    this.dec = dec;
    this.bitsHigh = 8;
    this.mBits = [];
    for (let i = 0; i < contexts; i++) this.mBits.push(new Model(33));
    this.mCorrector = [new BitModel()];
    for (let k = 1; k <= 32; k++) this.mCorrector.push(new Model(k <= this.bitsHigh ? (1 << k) : (1 << this.bitsHigh)));
  }
  IntDecompressor.prototype.readCorrector = function (mBits) {
    const dec = this.dec;
    let c;
    const k = dec.decodeSymbol(mBits);
    if (k) {
      if (k < 32) {
        if (k <= this.bitsHigh) {
          c = dec.decodeSymbol(this.mCorrector[k]);
        } else {
          const k1 = k - this.bitsHigh;
          c = dec.decodeSymbol(this.mCorrector[k]);
          const c1 = dec.readBits(k1);
          c = ((c << k1) | c1) >>> 0;
        }
        if (c >= Math.pow(2, k - 1)) c += 1; else c -= (Math.pow(2, k) - 1);
      } else {
        c = -2147483648;
      }
    } else {
      c = dec.decodeBit(this.mCorrector[0]);
    }
    return c;
  };
  IntDecompressor.prototype.decompress = function (pred, context) {
    return (pred + this.readCorrector(this.mBits[context])) | 0;
  };

  /**
   * @param {Uint8Array} buf  bytes vanaf de chunk-tabel-offset tot einde bestand
   * @param {number} firstChunkOffset  byte-offset van de eerste chunk (puntdata-start + 8)
   * @param {boolean} [variabel]  true bij variabele chunkgrootte (dan ook aantallen)
   * @returns {number[]} offsets (lengte = aantal chunks + 1)
   */
  function decodeChunkTable(buf, firstChunkOffset, variabel) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const versie = dv.getUint32(0, true);
    const aantal = dv.getUint32(4, true);
    if (versie !== 0) throw new Error(`onbekende chunk-tabel-versie ${versie}`);
    const offsets = [firstChunkOffset];
    if (aantal === 0) return offsets;
    const dec = new Decoder(buf, 8);
    const ic = new IntDecompressor(dec, 2);
    let vorigeGrootte = 0, vorigAantal = 0, pos = firstChunkOffset;
    for (let i = 0; i < aantal; i++) {
      if (variabel) vorigAantal = ic.decompress(vorigAantal, 0);
      vorigeGrootte = ic.decompress(vorigeGrootte, 1);
      pos += vorigeGrootte;
      offsets.push(pos);
    }
    return offsets;
  }

  global.LazChunkTable = { decodeChunkTable };
})(typeof window !== 'undefined' ? window : globalThis);
