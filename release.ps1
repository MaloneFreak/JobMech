# Publishes a new version of JobMech.
#
#   powershell -ExecutionPolicy Bypass -File release.ps1 2.1.1
#
# It writes the version number into the source, commits that, creates the tag v2.1.1 and pushes both.
# GitHub Actions (.github\workflows\release.yml) then builds the program, runs every test suite and,
# only if they pass, publishes the release with the zip. Follow it under the "Actions" tab on GitHub.
# If that run fails nothing is published: fix the problem and release the next number.
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [switch]$NoPush
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Give the version as three numbers, for example: release.ps1 2.1.1' }

Push-Location $PSScriptRoot
try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git is not installed or not on the PATH.' }
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne 'main') { throw "Releases are made from the main branch (this is $branch)." }
  if (git status --porcelain) { throw 'There are changes that are not committed yet. Commit them first.' }
  if (git tag --list "v$Version") { throw "Version $Version was released already. Choose the next number." }

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  $file = Join-Path $PSScriptRoot 'src\Program.cs'
  $text = [IO.File]::ReadAllText($file)
  $text = $text -replace 'AssemblyVersion\("[\d.]+"\)', "AssemblyVersion(`"$Version.0`")"
  $text = $text -replace 'AssemblyFileVersion\("[\d.]+"\)', "AssemblyFileVersion(`"$Version.0`")"
  $text = $text -replace 'AppVersion = "[\d.]+"', "AppVersion = `"$Version`""
  [IO.File]::WriteAllText($file, $text, $utf8)

  $file = Join-Path $PSScriptRoot 'src\app.manifest'
  $text = [IO.File]::ReadAllText($file)
  $text = $text -replace '(<assemblyIdentity version=")[\d.]+(" name="JobMech\.Studio")', "`${1}$Version.0`${2}"
  [IO.File]::WriteAllText($file, $text, $utf8)

  git add src/Program.cs src/app.manifest
  if (git diff --cached --name-only) { git commit -q -m "JobMech $Version" }
  git tag "v$Version"
  Write-Host "Version $Version is committed and tagged."

  if ($NoPush) { Write-Host 'Not pushed (-NoPush). Push with: git push origin main; git push origin v' -NoNewline; Write-Host $Version; return }
  git push -q origin main
  git push -q origin "v$Version"
  Write-Host "Pushed. GitHub is now building and testing it; the release appears when that passes:"
  Write-Host "  https://github.com/MaloneFreak/JobMech/actions"
}
finally { Pop-Location }
