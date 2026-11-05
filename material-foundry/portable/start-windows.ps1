# Material Foundry / Understand Code - Windows launcher.
# Serves the "app" folder on this computer only (127.0.0.1) and opens it in your browser.
# Uses only what ships with Windows (PowerShell). Nothing is installed, nothing is sent anywhere.
# To stop: close this window.

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $PSScriptRoot) 'app'))
if (-not (Test-Path (Join-Path $root 'index.html'))) {
  Write-Host "Папка 'app' не найдена. Сначала полностью распакуйте ZIP-архив."
  Write-Host "The 'app' folder was not found. Please unpack the whole ZIP first."
  Read-Host 'Enter'
  exit 1
}

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.wasm' = 'application/wasm'; '.json' = 'application/json'; '.png' = 'image/png'
  '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.woff' = 'font/woff'; '.zip' = 'application/zip'; '.txt' = 'text/plain; charset=utf-8'
}

$listener = $null
$port = 0
foreach ($p in 8765..8785) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), $p
    $l.Start()
    $listener = $l
    $port = $p
    break
  } catch { }
}
if (-not $listener) {
  Write-Host 'Нет свободного порта 8765-8785. / No free port between 8765 and 8785.'
  Read-Host 'Enter'
  exit 1
}

$url = "http://127.0.0.1:$port/#code"
if ($args -contains '--materials') { $url = "http://127.0.0.1:$port/" }
Write-Host ''
Write-Host "  Программа запущена: $url"
Write-Host "  Material Foundry is running: $url"
Write-Host ''
Write-Host '  Не закрывайте это окно, пока пользуетесь программой.'
Write-Host '  Keep this window open while you use the program. Close it to stop.'
Start-Process $url

$ascii = [System.Text.Encoding]::ASCII
function Send-Response($stream, [int]$code, [string]$status, [string]$type, [byte[]]$body, [bool]$head) {
  $header = "HTTP/1.1 $code $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $hb = $ascii.GetBytes($header)
  $stream.Write($hb, 0, $hb.Length)
  if (-not $head -and $body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, $ascii, $false, 8192, $true)
    $requestLine = $reader.ReadLine()
    while ($true) {
      $h = $reader.ReadLine()
      if ($null -eq $h -or $h -eq '') { break }
    }
    if (-not $requestLine) { continue }
    $parts = $requestLine.Split(' ')
    $method = $parts[0]
    $path = [System.Uri]::UnescapeDataString(($parts[1] -split '\?')[0])
    if ($path -eq '/') { $path = '/index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/').Replace('/', '\'))))
    if (($method -ne 'GET' -and $method -ne 'HEAD') -or -not $full.StartsWith($root + '\') -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
      Send-Response $stream 404 'Not Found' 'text/plain' ($ascii.GetBytes('Not found')) ($method -eq 'HEAD')
    } else {
      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $type = $types[$ext]
      if (-not $type) { $type = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      Send-Response $stream 200 'OK' $type $bytes ($method -eq 'HEAD')
    }
  } catch {
    # A browser closed the connection early; keep serving.
  } finally {
    $client.Close()
  }
}
