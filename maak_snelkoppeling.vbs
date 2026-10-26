' Maakt een snelkoppeling "Lutrea Profielviewer" op het bureaublad, met het Lutrea-icoon.
' Dubbelklik dit bestand één keer; daarna start je de viewer via het bureaublad.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
map = fso.GetParentFolderName(WScript.ScriptFullName)
bureaublad = sh.SpecialFolders("Desktop")
Set lnk = sh.CreateShortcut(bureaublad & "\Lutrea Profielviewer.lnk")
lnk.TargetPath = map & "\start_pts_viewer.bat"
lnk.WorkingDirectory = map
lnk.IconLocation = map & "\icons\pts-viewer.ico"
lnk.WindowStyle = 7
lnk.Description = "Lutrea Profielviewer"
lnk.Save
MsgBox "Snelkoppeling 'Lutrea Profielviewer' staat op je bureaublad.", 64, "Lutrea Profielviewer"
