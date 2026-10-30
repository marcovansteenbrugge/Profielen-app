; Inno Setup 6: installer van de Lutrea Profielviewer (docs\installatie.plan.md).
; Wordt gebouwd door tools\bouw_installer.ps1:
;   ISCC /DVersie=2.11.4 /DBron=<pad naar dist\Lutrea-Profielviewer-2.11.4.exe> /DUitvoer=<map> profielviewer.iss
; Per gebruiker, zonder beheerdersrechten (B1). Instellingen in %LOCALAPPDATA%\Lutrea en de projectmappen van
; de gebruiker worden niet aangeraakt, ook niet bij verwijderen (B3). De installer sluit een draaiende viewer
; nooit zelf (B4). Bij /DToets=1 (alleen de installatietoets) krijgt de installer een eigen AppId en geen
; snelkoppelingen of bestandskoppeling, zodat een toets een echte installatie nooit raakt.

#ifndef Versie
  #error Geef de versie mee: /DVersie=<versie>
#endif
#ifndef Bron
  #error Geef de exe mee: /DBron=<pad naar de gebouwde exe>
#endif
#ifndef Uitvoer
  #define Uitvoer "..\dist"
#endif

[Setup]
#ifdef Toets
AppId={{73608BA1-929E-4032-95FB-62DF4C8FE38F}
AppName=Lutrea Profielviewer (installatietoets)
OutputBaseFilename=Lutrea-Profielviewer-{#Versie}-toets-setup
#else
AppId={{9FD39965-143C-4A5B-B6C9-A30FEB9D51CC}
AppName=Lutrea Profielviewer
OutputBaseFilename=Lutrea-Profielviewer-{#Versie}-setup
#endif
AppVersion={#Versie}
AppVerName=Lutrea Profielviewer {#Versie}
AppPublisher=Lutrea Group B.V.
VersionInfoVersion={#Versie}
VersionInfoProductName=Lutrea Profielviewer
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\Lutrea Profielviewer
UsePreviousAppDir=yes
DefaultGroupName=Lutrea Profielviewer
DisableProgramGroupPage=yes
OutputDir={#Uitvoer}
SetupIconFile={#SourcePath}\..\icons\pts-viewer.ico
UninstallDisplayIcon={app}\Lutrea-Profielviewer.exe
UninstallDisplayName=Lutrea Profielviewer
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; een draaiende viewer zet de exe op slot: dan meldt de installer "sluit het programma en probeer opnieuw"
; (stil installeren: een foutcode); hij sluit de viewer nooit zelf
CloseApplications=no
RestartApplications=no
#ifndef Toets
; Verkenner opnieuw laten kijken naar de .pvproj-koppeling en het icoon
ChangesAssociations=yes
#endif

[Languages]
Name: "nl"; MessagesFile: "compiler:Languages\Dutch.isl"

[Tasks]
#ifndef Toets
Name: "bureaublad"; Description: "Snelkoppeling op het bureaublad"; Flags: unchecked
#endif

[Files]
Source: "{#Bron}"; DestDir: "{app}"; DestName: "Lutrea-Profielviewer.exe"; Flags: ignoreversion

[Icons]
#ifndef Toets
Name: "{group}\Lutrea Profielviewer"; Filename: "{app}\Lutrea-Profielviewer.exe"
Name: "{userdesktop}\Lutrea Profielviewer"; Filename: "{app}\Lutrea-Profielviewer.exe"; Tasks: bureaublad
#endif

[Registry]
; .pvproj dubbelklikken opent het project (B2); de exe neemt het pad als startparameter (bron-exe\recent.go)
#ifndef Toets
Root: HKCU; Subkey: "Software\Classes\.pvproj"; ValueType: string; ValueName: ""; ValueData: "LutreaProfielviewer.Project"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\LutreaProfielviewer.Project"; ValueType: string; ValueName: ""; ValueData: "Profielviewer-project"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\LutreaProfielviewer.Project\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\Lutrea-Profielviewer.exe"",0"
Root: HKCU; Subkey: "Software\Classes\LutreaProfielviewer.Project\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Lutrea-Profielviewer.exe"" ""%1"""
#endif

[Run]
Filename: "{app}\Lutrea-Profielviewer.exe"; Description: "Lutrea Profielviewer starten"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; alleen de eigen programmamap, en alleen als die leeg is
Type: dirifempty; Name: "{app}"
