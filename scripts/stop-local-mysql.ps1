$ErrorActionPreference = "Stop"

$processes = Get-Process mysqld -ErrorAction SilentlyContinue
if (!$processes) {
  Write-Output "MySQL is not running"
  exit 0
}

$processes | Stop-Process -Force
Write-Output "MySQL stopped"
