# A tiny stand-in for an AI provider, listening on 127.0.0.1 only. It lets the tests exercise the
# real network path (streaming, key injection, retries, errors) without any internet access or account.
# It speaks just enough of the OpenAI-compatible and Ollama protocols. The model name picks the behaviour.
param([int]$Port = 9334)
$ErrorActionPreference = 'Stop'
$ExpectedKey = 'Bearer test-key-123'
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$seen = @{}

function Send-Raw($stream, [string]$text) {
  $b = [Text.Encoding]::UTF8.GetBytes($text)
  $stream.Write($b, 0, $b.Length)
  $stream.Flush()
}
function Send-Json($stream, [int]$status, [string]$body, [string]$extra = '') {
  $n = [Text.Encoding]::UTF8.GetByteCount($body)
  Send-Raw $stream "HTTP/1.1 $status X`r`nContent-Type: application/json`r`nContent-Length: $n`r`n${extra}Connection: close`r`n`r`n$body"
}
function Escape-Json([string]$s) { ($s -replace '\\', '\\\\') -replace '"', '\"' }

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 5000
    $buf = New-Object byte[] 65536
    $data = New-Object System.IO.MemoryStream
    $headerEnd = -1
    $text = ''
    while ($headerEnd -lt 0) {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      $data.Write($buf, 0, $n)
      $text = [Text.Encoding]::ASCII.GetString($data.ToArray())
      $headerEnd = $text.IndexOf("`r`n`r`n")
    }
    if ($headerEnd -lt 0) { continue }
    $lines = $text.Substring(0, $headerEnd) -split "`r`n"
    $parts = $lines[0] -split ' '
    $method = $parts[0]
    $path = $parts[1]
    $headers = @{}
    foreach ($l in $lines | Select-Object -Skip 1) {
      $i = $l.IndexOf(':')
      if ($i -gt 0) { $headers[$l.Substring(0, $i).Trim().ToLower()] = $l.Substring($i + 1).Trim() }
    }
    $len = 0
    if ($headers.ContainsKey('content-length')) { $len = [int]$headers['content-length'] }
    $bodyStart = $headerEnd + 4
    while ($data.Length - $bodyStart -lt $len) {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      $data.Write($buf, 0, $n)
    }
    $all = $data.ToArray()
    $body = ''
    if ($len -gt 0) { $body = [Text.Encoding]::UTF8.GetString($all, $bodyStart, [Math]::Min($len, $all.Length - $bodyStart)) }
    $auth = ''
    if ($headers.ContainsKey('authorization')) { $auth = $headers['authorization'] }
    $model = ''
    if ($body -match '"model"\s*:\s*"([^"]+)"') { $model = $Matches[1] }

    if ($path -eq '/shutdown') { Send-Json $stream 200 '{"bye":true}'; break }

    # ---- GitHub "latest release", for the new-version check
    if ($path -match '^/repos/(\w+)/releases/latest$') {
      $kind = $Matches[1]
      $page = 'https://github.com/MaloneFreak/JobMech/releases/tag/v9.9.9'
      if ($kind -eq 'newer') { Send-Json $stream 200 ('{"tag_name":"v9.9.9","html_url":"' + $page + '","draft":false,"prerelease":false}'); continue }
      if ($kind -eq 'older') { Send-Json $stream 200 '{"tag_name":"v1.0.0","html_url":"https://github.com/MaloneFreak/JobMech/releases/tag/v1.0.0","draft":false,"prerelease":false}'; continue }
      if ($kind -eq 'evil') { Send-Json $stream 200 '{"tag_name":"v9.9.9","html_url":"https://evil.example/download","draft":false,"prerelease":false}'; continue }
      if ($kind -eq 'pre') { Send-Json $stream 200 ('{"tag_name":"v99.0.0","html_url":"' + $page + '","draft":false,"prerelease":true}'); continue }
      Send-Json $stream 404 '{"message":"Not Found"}'
      continue
    }

    # ---- Ollama
    if ($path -eq '/api/version') { Send-Json $stream 200 '{"version":"0.0.0-fake"}'; continue }
    if ($path -eq '/api/tags') { Send-Json $stream 200 '{"models":[{"name":"fake-local:latest","size":1234567890,"details":{"parameter_size":"1B"}}]}'; continue }
    if ($path -eq '/api/chat') {
      Send-Raw $stream "HTTP/1.1 200 OK`r`nContent-Type: application/x-ndjson`r`nConnection: close`r`n`r`n"
      foreach ($piece in '{\"engine\":', '\"ollama\",', '\"ok\":true}') {
        Send-Raw $stream ('{"model":"fake-local","message":{"role":"assistant","content":"' + $piece + '"},"done":false}' + "`n")
        Start-Sleep -Milliseconds 30
      }
      Send-Raw $stream ('{"model":"fake-local","message":{"role":"assistant","content":""},"done":true}' + "`n")
      continue
    }

    # ---- OpenAI-compatible
    if ($path -eq '/v1/models') {
      if ($auth -ne $ExpectedKey) { Send-Json $stream 401 '{"error":{"message":"Missing or wrong key"}}'; continue }
      Send-Json $stream 200 '{"data":[{"id":"fake-small"},{"id":"fake-large"},{"id":"text-embedding-fake"}]}'
      continue
    }
    if ($path -eq '/v1/chat/completions' -and $method -eq 'POST') {
      if (-not $seen.ContainsKey($model)) { $seen[$model] = 0 }
      $seen[$model]++
      $answer = '{"ok":true,"model":"' + $model + '","auth":"' + (Escape-Json $auth) + '","call":' + $seen[$model] + '}'
      if ($model -eq 'fake-401') { Send-Json $stream 401 '{"error":{"message":"Invalid key"}}'; continue }
      if ($model -eq 'fake-404') { Send-Json $stream 404 '{"error":{"message":"No such model"}}'; continue }
      if ($model -eq 'fake-429' -and $seen[$model] -eq 1) { Send-Json $stream 429 '{"error":{"message":"Slow down"}}' "Retry-After: 1`r`n"; continue }
      if ($model -eq 'fake-400' -and $body -match '"response_format"|"temperature"') { Send-Json $stream 400 '{"error":{"message":"Unsupported parameter"}}'; continue }
      if ($model -eq 'fake-nostream') {
        Send-Json $stream 200 ('{"choices":[{"message":{"role":"assistant","content":"' + (Escape-Json $answer) + '"},"finish_reason":"stop"}]}')
        continue
      }
      Send-Raw $stream "HTTP/1.1 200 OK`r`nContent-Type: text/event-stream`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
      if ($model -eq 'fake-slow') {
        for ($i = 0; $i -lt 100; $i++) {
          Send-Raw $stream ('data: {"choices":[{"delta":{"content":"tick "}}]}' + "`n`n")
          Start-Sleep -Milliseconds 100
        }
      } elseif ($model -eq 'fake-think') {
        Send-Raw $stream ('data: {"choices":[{"delta":{"reasoning":"hmm"}}]}' + "`n`n")
        Send-Raw $stream ('data: {"choices":[{"delta":{"content":"<think>private notes</think>' + (Escape-Json $answer) + '"}}]}' + "`n`n")
      } else {
        $chunk = 12
        for ($i = 0; $i -lt $answer.Length; $i += $chunk) {
          $piece = $answer.Substring($i, [Math]::Min($chunk, $answer.Length - $i))
          Send-Raw $stream ('data: {"choices":[{"delta":{"content":"' + (Escape-Json $piece) + '"}}]}' + "`n`n")
          Start-Sleep -Milliseconds 25
        }
      }
      Send-Raw $stream ('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}' + "`n`n" + 'data: [DONE]' + "`n`n")
      continue
    }
    Send-Json $stream 404 '{"error":{"message":"Not found"}}'
  }
  catch { }
  finally { try { $client.Close() } catch { } }
}
$listener.Stop()
