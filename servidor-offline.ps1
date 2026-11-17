$ErrorActionPreference = "Stop"
$Port = if ($env:PORT) { $env:PORT } else { "3000" }
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DistDir = Join-Path $RootDir "dist"
$DataRoot = Join-Path $RootDir "Dados_Estudo_Local"
$BackupDir = Join-Path $DataRoot "Backup_Automatico"
$BlobsDir = Join-Path $DataRoot ".blobs"

$Subfolders = @(
  $DataRoot,
  $BackupDir,
  $BlobsDir,
  (Join-Path $DataRoot "PDFs Pessoais"),
  (Join-Path $DataRoot "Lei Seca"),
  (Join-Path $DataRoot "Provas"),
  (Join-Path $DataRoot "Resumos"),
  (Join-Path $DataRoot "Discursivas"),
  (Join-Path $DataRoot "Editais")
)
foreach ($d in $Subfolders) {
  if (!(Test-Path -LiteralPath $d)) {
    New-Item -ItemType Directory -Path $d -Force | Out-Null
  }
}

$MimeTypes = @{
  ".html"        = "text/html; charset=utf-8"
  ".js"          = "application/javascript; charset=utf-8"
  ".mjs"         = "application/javascript; charset=utf-8"
  ".css"         = "text/css; charset=utf-8"
  ".json"        = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".svg"         = "image/svg+xml"
  ".png"         = "image/png"
  ".jpg"         = "image/jpeg"
  ".jpeg"        = "image/jpeg"
  ".ico"         = "image/x-icon"
  ".woff"        = "font/woff"
  ".woff2"       = "font/woff2"
  ".pdf"         = "application/pdf"
  ".txt"         = "text/plain; charset=utf-8"
}

function ConvertTo-SafeSegment([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return "item" }
  $clean = $Text -replace '[<>:"/\\|?*\x00-\x1F]', '_'
  $clean = $clean.Trim().TrimEnd('.')
  if ([string]::IsNullOrWhiteSpace($clean)) { return "item" }
  if ($clean.Length -gt 140) { return $clean.Substring(0, 140) }
  return $clean
}

function ConvertTo-BlobFileName([string]$Key) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Key)
  $b64 = [Convert]::ToBase64String($bytes)
  return $b64.Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Send-JsonResponse($Response, [int]$StatusCode, [string]$JsonText) {
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.Headers.Add("Cache-Control", "no-store")
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($JsonText)
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Start()

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  estuda.gov.br - Servidor Local Offline (PowerShell .NET) Ativo!" -ForegroundColor Green
Write-Host "  Acesse: http://localhost:$Port" -ForegroundColor Yellow
Write-Host "  Dados salvos em: $DataRoot" -ForegroundColor Gray
Write-Host "====================================================================" -ForegroundColor Cyan

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $Req = $Context.Request
    $Res = $Context.Response
    try {
      $PathName = $Req.Url.AbsolutePath
      $Method = $Req.HttpMethod.ToUpperInvariant()

      if ($PathName -eq "/api/health" -and $Method -eq "GET") {
        Send-JsonResponse $Res 200 '{"status":"ok","aiConfigured":false,"localOfflineMode":true}'
        continue
      }

      if ($PathName -eq "/api/local-disk/status" -and $Method -eq "GET") {
        $CanonicalFile = Join-Path $BackupDir "estuda-gov-db-atual.json"
        $HasDb = Test-Path -LiteralPath $CanonicalFile
        $Obj = @{
          enabled = $true
          dataDir = $DataRoot
          hasDb   = $HasDb
        } | ConvertTo-Json -Compress
        Send-JsonResponse $Res 200 $Obj
        continue
      }

      if ($PathName -eq "/api/local-disk/db" -and $Method -eq "GET") {
        $CanonicalFile = Join-Path $BackupDir "estuda-gov-db-atual.json"
        if (!(Test-Path -LiteralPath $CanonicalFile)) {
          Send-JsonResponse $Res 404 '{"found":false}'
          continue
        }
        $Parsed = Get-Content -LiteralPath $CanonicalFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $RespJson = @{
          found = $true
          snapshot = @{
            raw = [string]$Parsed.raw
            updatedAt = [string]$Parsed.updatedAt
            byteLength = ([string]$Parsed.raw).Length
          }
        } | ConvertTo-Json -Compress -Depth 5
        Send-JsonResponse $Res 200 $RespJson
        continue
      }

      if ($PathName -eq "/api/local-disk/db" -and $Method -eq "POST") {
        $Reader = New-Object System.IO.StreamReader($Req.InputStream, [System.Text.Encoding]::UTF8)
        $BodyText = $Reader.ReadToEnd()
        $Reader.Close()
        $CanonicalFile = Join-Path $BackupDir "estuda-gov-db-atual.json"
        $TmpFile = "$CanonicalFile.tmp"
        [System.IO.File]::WriteAllText($TmpFile, $BodyText, [System.Text.Encoding]::UTF8)
        Move-Item -LiteralPath $TmpFile -Destination $CanonicalFile -Force
        Send-JsonResponse $Res 200 '{"ok":true}'
        continue
      }

      if ($PathName -eq "/api/local-disk/blob" -and $Method -eq "POST") {
        $Key = $Req.QueryString["key"]
        if ([string]::IsNullOrWhiteSpace($Key)) { $Key = $Req.Headers["x-blob-key"] }
        $SafeName = ConvertTo-BlobFileName $Key
        $BinPath = Join-Path $BlobsDir "$SafeName.bin"
        $MetaPath = Join-Path $BlobsDir "$SafeName.meta.json"
        $Mem = New-Object System.IO.MemoryStream
        $Req.InputStream.CopyTo($Mem)
        $Bytes = $Mem.ToArray()
        $Mem.Close()
        [System.IO.File]::WriteAllBytes($BinPath, $Bytes)
        $MetaJson = @{ key = $Key; mimeType = $Req.ContentType; size = $Bytes.Length } | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText($MetaPath, $MetaJson, [System.Text.Encoding]::UTF8)
        Send-JsonResponse $Res 200 '{"ok":true}'
        continue
      }

      if ($PathName -eq "/api/local-disk/blob" -and $Method -eq "GET") {
        $Key = $Req.QueryString["key"]
        $SafeName = ConvertTo-BlobFileName $Key
        $BinPath = Join-Path $BlobsDir "$SafeName.bin"
        if (!(Test-Path -LiteralPath $BinPath)) {
          $Res.StatusCode = 404
          $Res.Close()
          continue
        }
        $Res.StatusCode = 200
        $Res.ContentType = "application/pdf"
        $Bytes = [System.IO.File]::ReadAllBytes($BinPath)
        $Res.ContentLength64 = $Bytes.Length
        $Res.OutputStream.Write($Bytes, 0, $Bytes.Length)
        $Res.Close()
        continue
      }

      if ($PathName -eq "/api/local-disk/readable-file" -and $Method -eq "POST") {
        $RawName = [System.Uri]::UnescapeDataString([string]$Req.Headers["x-file-name"])
        $RawSub = [System.Uri]::UnescapeDataString([string]$Req.Headers["x-subfolders"])
        $TargetDir = $DataRoot
        foreach ($part in ($RawSub -split '/')) {
          if (![string]::IsNullOrWhiteSpace($part)) {
            $TargetDir = Join-Path $TargetDir (ConvertTo-SafeSegment $part)
          }
        }
        if (!(Test-Path -LiteralPath $TargetDir)) {
          New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
        }
        $TargetFile = Join-Path $TargetDir (ConvertTo-SafeSegment $RawName)
        $Mem = New-Object System.IO.MemoryStream
        $Req.InputStream.CopyTo($Mem)
        [System.IO.File]::WriteAllBytes($TargetFile, $Mem.ToArray())
        $Mem.Close()
        Send-JsonResponse $Res 200 '{"ok":true}'
        continue
      }

      # Static file from dist
      $RelPath = [System.Uri]::UnescapeDataString($(if ($PathName -eq "/") { "/index.html" } else { $PathName }))
      $RelPath = $RelPath.TrimStart('/').Replace('/', '\')
      $FilePath = Join-Path $DistDir $RelPath
      if (!(Test-Path -LiteralPath $FilePath -PathType Leaf)) {
        $FilePath = Join-Path $DistDir "index.html"
      }
      if (!(Test-Path -LiteralPath $FilePath -PathType Leaf)) {
        $Res.StatusCode = 404
        $Res.Close()
        continue
      }
      $Ext = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
      $Res.StatusCode = 200
      $Res.ContentType = $(if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" })
      $FileBytes = [System.IO.File]::ReadAllBytes($FilePath)
      $Res.ContentLength64 = $FileBytes.Length
      $Res.OutputStream.Write($FileBytes, 0, $FileBytes.Length)
      $Res.Close()
    } catch {
      try { $Res.StatusCode = 500; $Res.Close() } catch {}
    }
  }
} finally {
  $Listener.Stop()
}
