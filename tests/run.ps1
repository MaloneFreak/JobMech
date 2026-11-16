# Runs every test suite against the real program.
#
#   powershell -ExecutionPolicy Bypass -File tests\run.ps1
#
# What happens:
#   1. JobMech is built from src\ into a temporary folder (the same layout as a release).
#   2. It is started on an empty, throw-away data folder with the debugging port open, and the suites
#      in tests\suites drive the real window: first run, a whole application, the studio, PDF and Word
#      export, memory, the tracker, settings, the native bridge and the network path.
#   3. It is started again on a copy of tests\fixtures\v1 to check the JobMech 1 -> 2 migration.
# Your own data folder is never touched and nothing is sent to the internet: the AI is either the
# built-in offline test engine or tests\fake-ai.ps1, a stand-in provider on 127.0.0.1.
param(
  [int]$Port = 9333,
  [string]$Only = '',
  [switch]$Keep
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$work = Join-Path ([IO.Path]::GetTempPath()) ('jobmech-tests-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $work | Out-Null
$script:total = 0
$script:failures = @()

function Check([string]$name, $pass, $info = '') {
  $script:total++
  if (-not $pass) { $script:failures += "$name $info"; Write-Host "    FAIL  $name  $info" -ForegroundColor Red }
}
function Cdp([string]$expr) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$here\cdp.ps1" -Port $Port -Expr $expr
}
function Run-Suite([string]$file) {
  $name = [IO.Path]::GetFileNameWithoutExtension($file)
  if ($Only -and $name -notlike "*$Only*") { return }
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File "$here\cdp.ps1" -Port $Port -Prelude "$here\lib\prelude.js" -File $file
  if ($LASTEXITCODE -ne 0 -or -not $out) { Check "$name ran" $false 'the suite could not be evaluated'; return }
  $r = ($out | Out-String) | ConvertFrom-Json
  $script:total += $r.total
  $bad = @($r.failed)
  Write-Host ("  {0,-30} {1,3} checks  {2}" -f $name, $r.total, $(if ($bad.Count) { "$($bad.Count) FAILED" } else { 'ok' })) -ForegroundColor $(if ($bad.Count) { 'Red' } else { 'Green' })
  foreach ($f in $bad) {
    $info = if ($null -ne $f.info -and "$($f.info)" -ne '') { $f.info | ConvertTo-Json -Compress -Depth 8 } else { '' }
    $script:failures += "${name}: $($f.name) $info"
    Write-Host "    FAIL  $($f.name)  $info" -ForegroundColor Red
  }
}
function Start-App([string]$dataDir) {
  $p = Start-Process "$work\stage\JobMech\JobMech.exe" -ArgumentList "`"--data-dir=$dataDir`"", "--debug-port=$Port" -PassThru
  $state = Cdp "(async()=>{for(let i=0;i<300&&!window.__jobmechReady&&!document.querySelector('.onb');i++)await new Promise(r=>setTimeout(r,100));return String(window.__jobmechReady||(document.querySelector('.onb')?'first-run':'timeout'))})()"
  if ($state -ne 'true' -and $state -ne 'first-run') { throw "JobMech did not start: $state" }
  return $p
}
function Stop-App($p) {
  try { Cdp "import('/js/host.js').then(h=>{h.call('app.quit');return 'bye'})" | Out-Null } catch { }
  if (-not $p.WaitForExit(10000)) { try { $p.Kill() } catch { }; return $false }
  return $true
}
function Log-Problems([string]$dataDir) {
  $log = Join-Path $dataDir 'logs\jobmech.log'
  if (-not (Test-Path $log)) { return @() }
  return @(Get-Content $log | Where-Object { $_ -match '\[(JS|ERROR|FATAL|WEBVIEW)\]' })
}

$fake = $null
$app = $null
try {
  Write-Host 'Building JobMech from source' -ForegroundColor Cyan
  & "$root\package.ps1" -OutDir "$work\stage" -NoZip | Out-Null
  Check 'the program builds from source' (Test-Path "$work\stage\JobMech\JobMech.exe")

  # ---------------------------------------------------------------- where the data would live
  # Asked with --print-data-dir, which only reports: no window opens and nothing is created.
  if (-not $Only) {
    $exe = "$work\stage\JobMech\JobMech.exe"
    function Where-Data([string[]]$extra) {
      $out = "$work\where.txt"
      Remove-Item $out -ErrorAction SilentlyContinue
      $p = Start-Process $exe -ArgumentList (@("`"--print-data-dir=$out`"") + $extra) -PassThru
      [void]$p.WaitForExit(10000)
      if (Test-Path $out) { return (Get-Content $out -Raw).Trim() } else { return '' }
    }
    $userDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'JobMech\data'
    $existed = Test-Path $userDir
    Check 'a fresh copy keeps its data in the user profile' ((Where-Data @()) -eq "user|$userDir")
    Check 'asking where the data lives creates nothing' ((Test-Path $userDir) -eq $existed)
    New-Item -ItemType Directory -Force "$work\stage\JobMech\data" | Out-Null
    Check 'a data folder next to the program makes the copy portable' ((Where-Data @()) -eq "portable|$work\stage\JobMech\data")
    Check 'an explicit data folder wins over both' ((Where-Data @("`"--data-dir=$work\elsewhere`"")) -eq "custom|$work\elsewhere" -and -not (Test-Path "$work\elsewhere"))
    Remove-Item "$work\stage\JobMech\data" -Recurse -Force
  }

  $fake = Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$here\fake-ai.ps1`"", '-Port', ($Port + 1) -WindowStyle Hidden -PassThru

  # ---------------------------------------------------------------- a brand-new data folder
  Write-Host 'Fresh data folder' -ForegroundColor Cyan
  $data = "$work\data-fresh"
  $app = Start-App $data
  Cdp "window.__fakeAiPort = $($Port + 1)" | Out-Null
  foreach ($f in Get-ChildItem "$here\suites\*.js" | Where-Object { $_.Name -notlike '09-*' } | Sort-Object Name) { Run-Suite $f.FullName }

  if (-not $Only) {
    $second = Start-Process "$work\stage\JobMech\JobMech.exe" -ArgumentList "`"--data-dir=$data`"" -PassThru
    Check 'a second start hands over to the open window and exits' ($second.WaitForExit(8000) -and $second.ExitCode -eq 0 -and -not $app.HasExited)
    Check 'the window closes cleanly on request' (Stop-App $app)
    $app = $null
    $win = Get-Content "$data\window.json" -Raw | ConvertFrom-Json
    Check 'the window size is remembered' ($win.w -ge 600 -and $win.h -ge 400) "w=$($win.w) h=$($win.h)"
    $problems = Log-Problems $data
    Check 'nothing was written to the error log' ($problems.Count -eq 0) ($problems | Select-Object -First 3 | Out-String)
  }

  # ---------------------------------------------------------------- a JobMech 1 data folder
  if (-not $Only -or '09-migration-v1' -like "*$Only*") {
    if ($app) { Stop-App $app | Out-Null; $app = $null }
    Write-Host 'JobMech 1 data folder' -ForegroundColor Cyan
    $data = "$work\data-v1"
    Copy-Item "$here\fixtures\v1" $data -Recurse
    Set-Content "$data\.port" '51234' -Encoding ascii
    $app = Start-App $data
    Run-Suite "$here\suites\09-migration-v1.js"
    Check 'the window closes cleanly after migrating' (Stop-App $app)
    $app = $null
    $leaks = @(Get-ChildItem $data -Recurse -File -Force | Where-Object { $_.FullName -notmatch '\\\.webview\\' } | Select-String -SimpleMatch 'fixture-key-not-real' -List)
    Check 'the old API key is nowhere on disk in plain text' ($leaks.Count -eq 0) ($leaks.Path -join ', ')
    Check 'the key file is encrypted' ((Test-Path "$data\secrets.dat") -and (Get-Item "$data\secrets.dat").Length -gt 50)
    $app = Start-App $data
    $again = Cdp "(async()=>{const s=await import('/js/store.js');return JSON.stringify([s.state.migrated,s.state.apps.length,s.state.memory.facts.length,(await (await import('/js/host.js')).secrets.info('openrouter')).exists])})()"
    Check 'starting again does not migrate twice and keeps everything' ($again -eq '[null,2,3,true]') $again
    Check 'the window closes cleanly again' (Stop-App $app)
    $app = $null
    $problems = Log-Problems $data
    Check 'nothing was written to the error log during migration' ($problems.Count -eq 0) ($problems | Select-Object -First 3 | Out-String)

    # ---------------------------------------------------------------- upgrading from a copy that kept its data next to the program
    # A newer copy starts empty and is pointed at the older copy's folder: data and saved API keys come along.
    Write-Host 'Bringing data over from an older copy' -ForegroundColor Cyan
    $new = "$work\data-new"
    New-Item -ItemType Directory -Force "$new\dev-out\old-copy\data" | Out-Null
    Get-ChildItem $data -Force | Where-Object { $_.Name -ne '.webview' } | Copy-Item -Destination "$new\dev-out\old-copy\data" -Recurse -Force
    $app = Start-App $new
    $moved = Cdp "(async()=>{const h=await import('/js/host.js');const s=await import('/js/store.js');const before=(await h.secrets.info('openrouter')).exists;const r=await h.data.importFrom(s.state.info.dataDir+'\\dev-out\\old-copy');await s.init();const k=await h.secrets.info('openrouter');return [before,r.keys,k.exists,k.host,s.state.apps.length,s.state.settings.onboarded,s.state.profile.fullName].join('|')})()"
    Check 'a new copy takes over the data and the saved keys of an older copy on this PC' ($moved -eq 'false|1|true|openrouter.ai|2|true|Lena Brandt') $moved
    Check 'the window closes cleanly after bringing data over' (Stop-App $app)
    $app = $null
    $problems = Log-Problems $new
    Check 'nothing was written to the error log while bringing data over' ($problems.Count -eq 0) ($problems | Select-Object -First 3 | Out-String)
  }
}
finally {
  if ($app -and -not $app.HasExited) { try { $app.Kill() } catch { } }
  if ($fake -and -not $fake.HasExited) { try { $fake.Kill() } catch { } }
  if ($Keep) { Write-Host "Kept $work" } else { Start-Sleep -Milliseconds 800; Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
if ($script:failures.Count) {
  Write-Host "$($script:failures.Count) of $($script:total) checks FAILED" -ForegroundColor Red
  exit 1
}
Write-Host "All $($script:total) checks passed" -ForegroundColor Green
exit 0
