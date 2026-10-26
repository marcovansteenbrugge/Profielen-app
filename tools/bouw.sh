#!/bin/sh
# Bouwt Lutrea-Profielviewer.exe (cross-compile vanaf Linux/macOS). Gebruik: sh tools/bouw.sh
set -e
HOOFD=$(cd "$(dirname "$0")/.." && pwd)
VERSIE=$(sed -n 's/.*appVersie *= *"\([0-9.]*\)".*/\1/p' "$HOOFD/bron-exe/main.go")
cd "$HOOFD/bron-exe" && rm -rf app && mkdir app
cp -r ../index.html ../viewer.js ../manifest.webmanifest ../sw.js ../merk-lutrea.png ../icons ../vendor app/
mkdir -p "$HOOFD/dist"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o "$HOOFD/dist/Lutrea-Profielviewer-$VERSIE.exe" .
rm -rf app
cp "$HOOFD/dist/Lutrea-Profielviewer-$VERSIE.exe" "$HOOFD/Lutrea-Profielviewer.exe"
cd "$HOOFD/.." && rm -f "$HOOFD/dist/Lutrea-Profielviewer_compleet_$VERSIE.zip"
zip -qr "$HOOFD/dist/Lutrea-Profielviewer_compleet_$VERSIE.zip" "$(basename "$HOOFD")" -x '*/app/*' '*/dist/*' '*/tests/*' '*/testdata/*' '*/docs/*' '*/tools/*' '*/.git/*' '*/node_modules/*'
echo "Klaar: dist/Lutrea-Profielviewer-$VERSIE.exe"
