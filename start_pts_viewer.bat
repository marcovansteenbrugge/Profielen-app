@echo off
rem -------------------------------------------------------------
rem  Lutrea Profielviewer starten als app-venster
rem  - start de lokale server (dev-server.py) op poort 8017 (eigen poort, botst niet met de GIS-viewer)
rem  - opent de viewer in een eigen venster (Chrome of Edge, app-modus)
rem -------------------------------------------------------------
setlocal
cd /d "%~dp0"
set POORT=8017
set URL=http://127.0.0.1:%POORT%/index.html

rem Controle: staan de bibliotheken (map vendor) naast dit bestand?
if not exist "%~dp0vendor\d3-delaunay\d3-delaunay.js" (
  echo.
  echo  De map "vendor" is niet gevonden naast start_pts_viewer.bat.
  echo  Zonder die map kan de viewer geen surface bouwen.
  echo.
  echo  Oplossing: pak de update uit IN je bestaande map van de viewer
  echo  ^(waar ook de map vendor staat^) en kies "bestanden vervangen".
  echo.
  pause
  exit /b 1
)
if not exist "%~dp0viewer.js" (
  echo viewer.js ontbreekt in deze map.
  pause
  exit /b 1
)

rem Draait de server al? Dan alleen het venster openen.
powershell -NoProfile -Command "try{(New-Object Net.Sockets.TcpClient('127.0.0.1',%POORT%)).Close();exit 0}catch{exit 1}" >nul 2>&1
if %errorlevel%==0 goto openen

set PY=
where py >nul 2>&1 && set PY=py
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY (
  echo Python is niet gevonden. Installeer Python 3 via https://www.python.org/downloads/
  echo en vink bij installatie "Add python.exe to PATH" aan.
  pause
  exit /b 1
)
start "Profielviewer server" /min %PY% "%~dp0dev-server.py" %POORT% "%~dp0."
rem even wachten tot de server luistert
powershell -NoProfile -Command "for($i=0;$i -lt 40;$i++){try{(New-Object Net.Sockets.TcpClient('127.0.0.1',%POORT%)).Close();exit 0}catch{Start-Sleep -Milliseconds 250}};exit 1" >nul 2>&1

:openen
set BROWSER=
for %%B in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) do if not defined BROWSER if exist %%B set BROWSER=%%B

if defined BROWSER (
  start "" %BROWSER% --app=%URL% --start-maximized
) else (
  start "" %URL%
)
endlocal
