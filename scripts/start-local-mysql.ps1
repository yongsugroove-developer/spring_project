$ErrorActionPreference = "Stop"

$root = "C:\mysql-local"
$base = Join-Path $root "mysql-8.4.8-winx64"
$config = Join-Path $root "my.ini"
$mysqld = Join-Path $base "bin\mysqld.exe"

if (!(Test-Path $mysqld)) {
  throw "mysqld.exe not found at $mysqld"
}

$existing = Get-Process mysqld -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output "MySQL already running"
  exit 0
}

$process = Start-Process -FilePath $mysqld -ArgumentList "--defaults-file=$config","--console" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5
Write-Output "MySQL started with PID $($process.Id)"
