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
# eerst de Go-tests (bestandstoegang e.d.); die hebben de map app nodig, dus hier
go vet ./...
$goFout = $LASTEXITCODE
if ($goFout -eq 0) { go test -count=1 ./...; $goFout = $LASTEXITCODE }
if ($goFout -ne 0) { Pop-Location; Remove-Item -Recurse -Force $app; throw "go vet of go test mislukt (exitcode $goFout)" }
go build -trimpath -ldflags "-H windowsgui -s -w" -o "$hoofd\dist\Lutrea-Profielviewer-$versie.exe" .
$goFout = $LASTEXITCODE
Pop-Location
if ($goFout -ne 0) { Remove-Item -Recurse -Force $app; throw "go build mislukt (exitcode $goFout)" }
Remove-Item -Recurse -Force $app
# Een net gebouwde exe zit soms even op slot (virusscan): tot drie keer proberen,
# daarna stoppen met een fout in plaats van "Klaar" te melden.
function Probeer([scriptblock]$stap, [string]$wat) {
  for ($i = 1; $i -le 3; $i++) {
    try { & $stap; return } catch {
      if ($i -eq 3) { throw "$wat mislukt: $($_.Exception.Message)" }
      Write-Host "$wat lukt niet (poging $i), over 3 s opnieuw..."
      Start-Sleep -Seconds 3
    }
  }
}
Probeer { Copy-Item "$hoofd\dist\Lutrea-Profielviewer-$versie.exe" "$hoofd\Lutrea-Profielviewer.exe" -ErrorAction Stop } 'Exe kopieren'
$zip = "$hoofd\dist\Lutrea-Profielviewer_compleet_$versie.zip"
if (Test-Path $zip) { Remove-Item $zip }
$mee = 'LEESMIJ.txt','Lutrea-Profielviewer.exe','index.html','viewer.js','manifest.webmanifest','sw.js','merk-lutrea.png','dev-server.py','start_pts_viewer.bat','maak_snelkoppeling.vbs','icons','vendor','bron-exe'
Probeer {
  if (Test-Path $zip) { Remove-Item $zip -ErrorAction Stop }
  Compress-Archive -Path ($mee | ForEach-Object { "$hoofd\$_" }) -DestinationPath $zip -ErrorAction Stop
} 'Zip maken'
if (-not (Test-Path $zip)) { throw "Zip ontbreekt: $zip" }
Write-Host "Klaar: dist\Lutrea-Profielviewer-$versie.exe en dist\Lutrea-Profielviewer_compleet_$versie.zip"
