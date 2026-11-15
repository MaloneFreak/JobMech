# Builds JobMech.exe from src\ and assembles the folder people actually run:
# JobMech.exe, the three WebView2 DLLs and the app folder. Then zips it for a release.
#
#   .\package.ps1                 -> dist\JobMech\ and dist\JobMech-<version>-win-x64.zip
#   .\package.ps1 -OutDir X -NoZip
#
# Needs nothing but Windows: the C# compiler ships with .NET Framework 4.x.
param(
  [string]$OutDir = (Join-Path $PSScriptRoot 'dist'),
  [switch]$NoZip
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw "The .NET Framework C# compiler was not found at $csc" }
$version = [regex]::Match((Get-Content (Join-Path $root 'src\Program.cs') -Raw), 'AppVersion\s*=\s*"([^"]+)"').Groups[1].Value
if (-not $version) { throw 'Could not read AppVersion from src\Program.cs' }

$stage = Join-Path $OutDir 'JobMech'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

Push-Location $root
try {
  & $csc /nologo /target:winexe /platform:x64 /optimize+ /warn:3 "/out:$stage\JobMech.exe" `
    /win32manifest:src\app.manifest /win32icon:src\JobMech.ico "/resource:src\JobMech.ico,JobMech.ico" `
    /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll `
    /r:System.Web.dll /r:System.Web.Extensions.dll /r:System.Security.dll `
    /r:Microsoft.Web.WebView2.Core.dll /r:Microsoft.Web.WebView2.WinForms.dll `
    src\Program.cs src\MainForm.cs src\Services.cs
  if ($LASTEXITCODE -ne 0) { throw 'BUILD FAILED' }
  Copy-Item Microsoft.Web.WebView2.Core.dll, Microsoft.Web.WebView2.WinForms.dll, WebView2Loader.dll $stage
  Copy-Item app $stage -Recurse
}
finally { Pop-Location }
Write-Host "Built JobMech $version in $stage"

if (-not $NoZip) {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = Join-Path $OutDir "JobMech-$version-win-x64.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  # Entries are added one by one so that their names use "/" as the ZIP format requires
  # (Windows PowerShell's CreateFromDirectory writes "\").
  $base = (Get-Item $OutDir).FullName.TrimEnd('\') + '\'
  $archive = [System.IO.Compression.ZipFile]::Open($zip, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($f in Get-ChildItem $stage -Recurse -File) {
      $name = $f.FullName.Substring($base.Length).Replace('\', '/')
      [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $f.FullName, $name, [System.IO.Compression.CompressionLevel]::Optimal)
    }
  }
  finally { $archive.Dispose() }
  Write-Host "Packaged $zip ($([Math]::Round((Get-Item $zip).Length / 1MB, 2)) MB)"
}
