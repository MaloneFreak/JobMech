# Evaluates JavaScript inside a running JobMech window through the WebView2 remote debugging port.
# JobMech must have been started with --debug-port=<Port> (see tests\run.ps1).
#
#   .\cdp.ps1 -Expr "document.title"
#   .\cdp.ps1 -File .\suites\01-core.js
#   .\cdp.ps1 -Shot C:\temp\window.png
#
# The expression may return a promise; its resolved value is printed (strings as-is, the rest as JSON).
param(
  [int]$Port = 9333,
  [string]$Expr,
  [string]$File,
  [string]$Prelude,
  [string]$Shot,
  [int]$TimeoutSec = 180
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions
$json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = [int]::MaxValue
$json.RecursionLimit = 256

# The window needs a moment after start-up: first the debugger answers, then the page appears.
$targets = $null
$page = $null
for ($i = 0; $i -lt 80 -and -not $page; $i++) {
  try {
    $targets = Invoke-RestMethod "http://127.0.0.1:$Port/json" -TimeoutSec 3
    $page = $targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'https://app.jobmech.example/*' } | Select-Object -First 1
  } catch { }
  if (-not $page) { Start-Sleep -Milliseconds 400 }
}
if (-not $targets) { throw "No debugger is listening on port $Port. Is JobMech running with --debug-port=$Port?" }
if (-not $page) { throw "The JobMech page was not found among the debugger targets." }

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$cts = New-Object System.Threading.CancellationTokenSource
$cts.CancelAfter([TimeSpan]::FromSeconds($TimeoutSec))
[void]$ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $cts.Token).GetAwaiter().GetResult()

function Invoke-Cdp([string]$method, $params) {
  $script:seq++
  $payload = $json.Serialize(@{ id = $script:seq; method = $method; params = $params })
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $seg = New-Object System.ArraySegment[byte] -ArgumentList @(, $bytes)
  [void]$ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $cts.Token).GetAwaiter().GetResult()
  $buf = New-Object byte[] 262144
  while ($true) {
    $ms = New-Object System.IO.MemoryStream
    do {
      $rseg = New-Object System.ArraySegment[byte] -ArgumentList @(, $buf)
      $r = $ws.ReceiveAsync($rseg, $cts.Token).GetAwaiter().GetResult()
      $ms.Write($buf, 0, $r.Count)
    } while (-not $r.EndOfMessage)
    $msg = $json.DeserializeObject([Text.Encoding]::UTF8.GetString($ms.ToArray()))
    if ($msg.ContainsKey('id') -and $msg['id'] -eq $script:seq) { return $msg }
  }
}
$script:seq = 0

try {
  if ($Shot) {
    $r = Invoke-Cdp 'Page.captureScreenshot' @{ format = 'png' }
    if ($r.ContainsKey('error')) { throw $r['error']['message'] }
    [IO.File]::WriteAllBytes($Shot, [Convert]::FromBase64String($r['result']['data']))
    "Saved $Shot"
  }
  if ($File) { $Expr = [IO.File]::ReadAllText($File, [Text.Encoding]::UTF8) }
  if ($Expr) {
    if ($Prelude) { $Expr = [IO.File]::ReadAllText($Prelude, [Text.Encoding]::UTF8) + "`n" + $Expr }
    $r = Invoke-Cdp 'Runtime.evaluate' @{ expression = $Expr; awaitPromise = $true; returnByValue = $true; userGesture = $true }
    if ($r.ContainsKey('error')) { throw $r['error']['message'] }
    $res = $r['result']
    if ($res.ContainsKey('exceptionDetails')) {
      $ex = $res['exceptionDetails']
      $text = $ex['text']
      if ($ex.ContainsKey('exception') -and $ex['exception'].ContainsKey('description')) { $text = $text + ' ' + $ex['exception']['description'] }
      [Console]::Error.WriteLine("JS EXCEPTION: $text")
      exit 1
    }
    $value = $res['result']['value']
    if ($value -is [string]) { $value } else { $json.Serialize($value) }
  }
}
finally {
  try { $ws.Dispose() } catch { }
}
