@echo off
cd /d "%~dp0"
if exist "JobMech_Update.exe" (
    move /y "JobMech_Update.exe" "JobMech.exe" >nul 2>nul
)
if exist "JobMech_Update.exe" (
    echo An older JobMech.exe instance is still running. Please close/quit JobMech from the System Tray or Task Manager, then run Start-JobMech.bat again.
    pause
    exit /b 1
)
if not exist "JobMech.exe" (
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /optimize+ /out:JobMech.exe /r:System.dll /r:System.Core.dll /r:System.Web.Extensions.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Xml.dll src\JobMechServer.cs
)
start "" "JobMech.exe"
exit
