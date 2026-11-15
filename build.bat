@echo off
rem Rebuilds JobMech.exe from the sources in src\ using the C# compiler that ships with Windows.
rem No Visual Studio or SDK is needed. Close JobMech before running this.
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo Could not find the .NET Framework C# compiler at %CSC%
  exit /b 1
)
set ICON=
if exist "src\JobMech.ico" set ICON=/win32icon:src\JobMech.ico /resource:src\JobMech.ico,JobMech.ico
"%CSC%" /nologo /target:winexe /platform:x64 /optimize+ /warn:3 ^
  /out:JobMech.exe /win32manifest:src\app.manifest %ICON% ^
  /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll ^
  /r:System.Web.dll /r:System.Web.Extensions.dll /r:System.Security.dll ^
  /r:Microsoft.Web.WebView2.Core.dll /r:Microsoft.Web.WebView2.WinForms.dll ^
  src\Program.cs src\MainForm.cs src\Services.cs
if errorlevel 1 (
  echo.
  echo BUILD FAILED
  exit /b 1
)
echo Built JobMech.exe
endlocal
