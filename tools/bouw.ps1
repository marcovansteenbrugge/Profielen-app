# Bouwt Lutrea-Profielviewer.exe en het complete zip-pakket.
# Gebruik (PowerShell, vanuit de hoofdmap):  .\tools\bouw.ps1
# Nodig: Go 1.22+ (https://go.dev/dl/). Uitvoer in .\dist\
$ErrorActionPreference = 'Stop'
$hoofd = Split-Path -Parent $PSScriptRoot
$versie = (Select-String -Path "$hoofd\bron-exe\main.go" -Pattern 'appVersie\s*=\s*"([\d.]+)"').Matches[0].Groups[1].Value
$app = "$hoofd\bron-exe\app"
if (Test-Path $app) { Remove-Item -Recurse -Force $app }
New-Item -ItemType Directory $app | Out-Null
foreach ($f in 'index.html','viewer.js','manifest.webmanifest','sw.js','merk-lutrea.png') { Copy-Item "$hoofd\$f" $app }
Copy-Item -Recurse "$hoofd\icons" $app
Copy-Item -Recurse "$hoofd\vendor" $app
New-Item -ItemType Directory -Force "$hoofd\dist" | Out-Null
Push-Location "$hoofd\bron-exe"
$env:GOOS = 'windows'; $env:GOARCH = 'amd64'; $env:CGO_ENABLED = '0'
go build -trimpath -ldflags "-H windowsgui -s -w" -o "$hoofd\dist\Lutrea-Profielviewer-$versie.exe" .
Pop-Location
Remove-Item -Recurse -Force $app
Copy-Item "$hoofd\dist\Lutrea-Profielviewer-$versie.exe" "$hoofd\Lutrea-Profielviewer.exe"
$zip = "$hoofd\dist\Lutrea-Profielviewer_compleet_$versie.zip"
if (Test-Path $zip) { Remove-Item $zip }
$mee = 'LEESMIJ.txt','Lutrea-Profielviewer.exe','index.html','viewer.js','manifest.webmanifest','sw.js','merk-lutrea.png','dev-server.py','start_pts_viewer.bat','maak_snelkoppeling.vbs','icons','vendor','bron-exe'
Compress-Archive -Path ($mee | ForEach-Object { "$hoofd\$_" }) -DestinationPath $zip
Write-Host "Klaar: dist\Lutrea-Profielviewer-$versie.exe en dist\Lutrea-Profielviewer_compleet_$versie.zip"
