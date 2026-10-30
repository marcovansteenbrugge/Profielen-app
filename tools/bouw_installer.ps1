# Maakt de installer: dist\Lutrea-Profielviewer-<versie>-setup.exe (Inno Setup 6, docs\installatie.plan.md).
# Gebruik (PowerShell, vanuit de hoofdmap):
#   .\tools\bouw_installer.ps1           installer uit dist\Lutrea-Profielviewer-<versie>.exe (eerst .\tools\bouw.ps1)
#   .\tools\bouw_installer.ps1 -Toets    plus de installatietoets: een toetsvariant (eigen AppId, geen snelkoppelingen
#                                        of koppeling) stil installeren in dist\installtoets, controleren en verwijderen
# Nodig: Inno Setup 6 (https://jrsoftware.org/isdl.php). De versie komt uit bron-exe\main.go (appVersie).
param([switch]$Toets)
$ErrorActionPreference = 'Stop'
$hoofd = Split-Path -Parent $PSScriptRoot
$iss = "$hoofd\tools\profielviewer.iss"
$versie = (Select-String -Path "$hoofd\bron-exe\main.go" -Pattern 'appVersie\s*=\s*"([\d.]+)"').Matches[0].Groups[1].Value
$exe = "$hoofd\dist\Lutrea-Profielviewer-$versie.exe"

function Stop-Met([string]$melding) {
  Write-Host "FOUT: $melding"
  exit 1
}

function Zoek-Iscc {
  $op = Get-Command ISCC.exe -ErrorAction SilentlyContinue
  if ($op) { return $op.Source }
  foreach ($basis in ${env:ProgramFiles(x86)}, $env:ProgramFiles, "$env:LOCALAPPDATA\Programs") {
    if ($basis -and (Test-Path "$basis\Inno Setup 6\ISCC.exe")) { return "$basis\Inno Setup 6\ISCC.exe" }
  }
  return $null
}

# draait ISCC; geeft het pad van de installer
function Bouw-Installer([string]$uitvoer, [bool]$toetsvariant) {
  $iscc = Zoek-Iscc
  if (-not $iscc) { Stop-Met "Inno Setup 6 (ISCC.exe) is niet gevonden. Installeer het vanaf https://jrsoftware.org/isdl.php en probeer opnieuw." }
  New-Item -ItemType Directory -Force $uitvoer | Out-Null
  $arg = @("/Q", "/DVersie=$versie", "/DBron=$exe", "/DUitvoer=$uitvoer")
  if ($toetsvariant) { $arg += "/DToets=1" }
  $arg += $iss
  $ErrorActionPreference = 'Continue'
  $uit = & $iscc @arg 2>&1 | Out-String
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($code -ne 0) { Stop-Met "ISCC faalde (code $code):`n$uit" }
  $naam = if ($toetsvariant) { "Lutrea-Profielviewer-$versie-toets-setup.exe" } else { "Lutrea-Profielviewer-$versie-setup.exe" }
  $inst = Join-Path $uitvoer $naam
  if (-not (Test-Path $inst)) { Stop-Met "ISCC meldde geen fout, maar $inst ontbreekt.`n$uit" }
  return $inst
}

if (-not (Test-Path $exe)) { Stop-Met "$exe ontbreekt. Bouw eerst de exe: .\tools\bouw.ps1" }

if (-not $Toets) {
  $inst = Bouw-Installer "$hoofd\dist" $false
  Write-Host ("Klaar: dist\{0}  ({1:N1} MB)" -f (Split-Path -Leaf $inst), ((Get-Item $inst).Length / 1MB))
  exit 0
}

# ── Installatietoets ──────────────────────────────────────────────────────────
$fouten = @()
function Controleer([bool]$goed, [string]$wat) {
  if ($goed) { Write-Host "  OK   $wat" } else { Write-Host "  FOUT $wat"; $script:fouten += $wat }
}

Write-Host "Statische controles van profielviewer.iss"
$tekst = Get-Content -Raw -Encoding UTF8 $iss
Controleer ($tekst -match '(?m)^PrivilegesRequired=lowest\s*$') "installeren zonder beheerdersrechten (PrivilegesRequired=lowest)"
Controleer ($tekst -match '(?m)^DefaultDirName=\{localappdata\}\\Programs\\Lutrea Profielviewer\s*$') "installatieplek in %LOCALAPPDATA%\Programs"
Controleer (-not ($tekst -match '\{autopf|\{pf|\{commonpf|HKLM')) "geen Program Files en geen HKLM"
Controleer ($tekst -match '(?m)^CloseApplications=no\s*$') "de installer sluit een draaiende viewer niet zelf"
$verwijderRegels = $tekst -split "`r?`n" | Where-Object { $_ -match '^\s*Type:' }
Controleer (@($verwijderRegels | Where-Object { $_ -notmatch 'Name:\s*"\{app\}' }).Count -eq 0) "de verwijderaar ruimt alleen de eigen programmamap op"
Controleer (-not ($tekst -match '(?i)\{localappdata\}\\Lutrea\\|Lutrea\\PTS-viewer')) "de instellingen in %LOCALAPPDATA%\Lutrea worden niet genoemd"
$koppeling = [regex]::Match($tekst, '(?ms)^\[Registry\]\s*\n(?:;[^\n]*\n)*#ifndef Toets\s*\n(.*?)^#endif')
Controleer ($koppeling.Success -and $koppeling.Groups[1].Value -match 'Classes\\\.pvproj"; ValueType: string; ValueName: ""; ValueData: "LutreaProfielviewer\.Project"') ".pvproj gekoppeld aan LutreaProfielviewer.Project, alleen buiten de toetsvariant"
Controleer ($koppeling.Success -and $koppeling.Groups[1].Value -match 'shell\\open\\command";.*""%1"""') "openen geeft het bestand mee als startparameter (%1)"
Controleer ($koppeling.Success -and $koppeling.Groups[1].Value -match 'LutreaProfielviewer\.Project"; [^\n]*Flags: uninsdeletekey') "de koppeling gaat weg bij verwijderen (uninsdeletekey)"
Controleer ($tekst -match '(?ms)#ifndef Toets\s*\n(?:;[^\n]*\n)*ChangesAssociations=yes\s*\n#endif') "ChangesAssociations=yes (Verkenner ververst het icoon)"

$toetsmap = "$hoofd\dist\installtoets"
$appmap = "$toetsmap\app"
if (Test-Path $toetsmap) { Remove-Item -Recurse -Force $toetsmap }
Write-Host "Toetsvariant bouwen"
$inst = Bouw-Installer $toetsmap $true
Controleer (Test-Path $inst) "toetsvariant gebouwd: $(Split-Path -Leaf $inst)"

$sleutel = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{73608BA1-929E-4032-95FB-62DF4C8FE38F}_is1'
function Koppeling-Nu { (Get-ItemProperty 'HKCU:\Software\Classes\.pvproj' -ErrorAction SilentlyContinue).'(default)' }
$koppelingVooraf = Koppeling-Nu
Write-Host "Stil installeren in dist\installtoets\app"
$p = Start-Process -FilePath $inst -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$appmap`"", "/LOG=`"$toetsmap\installeren.log`"" -Wait -PassThru
Controleer ($p.ExitCode -eq 0) "installer klaar met code 0 (was $($p.ExitCode))"
Controleer (Test-Path "$appmap\Lutrea-Profielviewer.exe") "exe geïnstalleerd als Lutrea-Profielviewer.exe"
if (Test-Path "$appmap\Lutrea-Profielviewer.exe") {
  Controleer ((Get-Item "$appmap\Lutrea-Profielviewer.exe").Length -eq (Get-Item $exe).Length) "geïnstalleerde exe is de gebouwde exe van $versie"
}
Controleer (Test-Path $sleutel) "verwijdersleutel onder HKCU (verwijderen via Windows-instellingen)"
if (Test-Path $sleutel) {
  $info = Get-ItemProperty $sleutel
  Controleer ($info.DisplayVersion -eq $versie) "versie in Windows-instellingen is $versie (was $($info.DisplayVersion))"
}

Controleer ((Koppeling-Nu) -eq $koppelingVooraf) "toetsvariant laat de .pvproj-koppeling ongemoeid"

Write-Host "Stil opnieuw installeren (bijwerken over de vorige heen)"
$p = Start-Process -FilePath $inst -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=`"$appmap`"" -Wait -PassThru
Controleer ($p.ExitCode -eq 0) "opnieuw installeren klaar met code 0 (was $($p.ExitCode))"

Write-Host "Stil verwijderen"
$verwijder = "$appmap\unins000.exe"
Controleer (Test-Path $verwijder) "verwijderaar aanwezig"
if (Test-Path $verwijder) {
  Start-Process -FilePath $verwijder -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait | Out-Null
  # de verwijderaar draait verder als kopie in %TEMP%: wachten tot hij klaar is
  for ($i = 0; $i -lt 60 -and ((Test-Path $appmap) -or (Test-Path $sleutel)); $i++) { Start-Sleep -Milliseconds 500 }
}
Controleer (-not (Test-Path $appmap)) "programmamap weg na verwijderen"
Controleer (-not (Test-Path $sleutel)) "verwijdersleutel weg na verwijderen"

if ($fouten.Count -eq 0) {
  Remove-Item -Recurse -Force $toetsmap
  Write-Host "fouten: geen"
  exit 0
}
Write-Host "fouten: $($fouten.Count)"
exit 1
