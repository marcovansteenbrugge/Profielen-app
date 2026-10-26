#!/usr/bin/env python3
"""Versie van de Profielviewer ophogen, overal tegelijk.

Gebruik (vanuit de hoofdmap):  python tools/zet_versie.py 2.10.0

Past aan:
  - index.html      <title>, het versielabel naast de titel, en viewer.js?v=N (+1, tegen de cache)
  - bron-exe/main.go          appVersie
  - bron-exe/rsrc_windows_amd64.syso  versie-info van de exe (tekst + VS_FIXEDFILEINFO)
  - LEESMIJ.txt               eerste regel
Daarna zelf: een blok "Nieuw in X" bovenaan LEESMIJ.txt (onder de installatie-uitleg) en de handleiding.
"""
import re, struct, sys
from pathlib import Path

HOOFD = Path(__file__).resolve().parent.parent

def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
        sys.exit("gebruik: python tools/zet_versie.py 2.10.0")
    nieuw = sys.argv[1]
    a, b, c = (int(x) for x in nieuw.split('.'))

    main_go = HOOFD / 'bron-exe' / 'main.go'
    s = main_go.read_text(encoding='utf-8')
    oud = re.search(r'appVersie\s*=\s*"([\d.]+)"', s).group(1)
    s = re.sub(r'(appVersie\s*=\s*")[\d.]+(")', rf'\g<1>{nieuw}\g<2>', s)
    main_go.write_text(s, encoding='utf-8')

    idx = HOOFD / 'index.html'
    s = idx.read_text(encoding='utf-8')
    s = re.sub(r'<title>Lutrea Profielviewer [\d.]+</title>', f'<title>Lutrea Profielviewer {nieuw}</title>', s)
    s = re.sub(r'(id="appVersie"[^>]*>)[\d.]+(</span>)', rf'\g<1>{nieuw}\g<2>', s)
    s = re.sub(r'viewer\.js\?v=(\d+)', lambda m: f'viewer.js?v={int(m.group(1)) + 1}', s)
    idx.write_text(s, encoding='utf-8')

    les = HOOFD / 'LEESMIJ.txt'
    s = les.read_text(encoding='utf-8')
    s = re.sub(r'^Lutrea Profielviewer [\d.]+', f'Lutrea Profielviewer {nieuw}', s, count=1)
    les.write_text(s, encoding='utf-8')

    # versie-info voor go-winres (bron-exe/winres/winres.json): de nette manier om de .syso te maken
    wr = HOOFD / 'bron-exe' / 'winres' / 'winres.json'
    if wr.exists():
        t = wr.read_text(encoding='utf-8')
        t = re.sub(r'"(file|product)_version": "[\d.]+"', lambda m: f'"{m.group(1)}_version": "{nieuw}.0"', t)
        t = re.sub(r'"(FileVersion|ProductVersion)": "[\d.]+"', lambda m: f'"{m.group(1)}": "{nieuw}"', t)
        wr.write_text(t, encoding='utf-8')

    syso = HOOFD / 'bron-exe' / 'rsrc_windows_amd64.syso'
    data = bytearray(syso.read_bytes())
    n = data.count(oud.encode('utf-16-le'))
    if len(oud) != len(nieuw):
        print(f'{oud} -> {nieuw}: andere lengte, de .syso kan niet in place worden aangepast.\n'
              'Maak hem opnieuw met go-winres (in bron-exe):\n'
              '  go run github.com/tc-hib/go-winres@latest make --in winres/winres.json --out rsrc\n'
              '(dat schrijft rsrc_windows_amd64.syso; winres.json is al bijgewerkt)')
        return
    data = data.replace(oud.encode('utf-16-le'), nieuw.encode('utf-16-le'))   # zelfde lengte nodig
    i = data.find(bytes.fromhex('BD04EFFE'))   # VS_FIXEDFILEINFO-handtekening
    for off in (i + 8, i + 16):                # FileVersion en ProductVersion (MS, LS)
        struct.pack_into('<II', data, off, (a << 16) | b, (c << 16))
    syso.write_bytes(data)
    print(f'{oud} -> {nieuw}  (syso: {n} tekstvelden, versie-info bijgewerkt)')

if __name__ == '__main__':
    main()
