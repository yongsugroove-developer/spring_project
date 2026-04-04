param(
  [string]$ServerUrl = $env:CAPACITOR_SERVER_URL,
  [string]$VersionCode = $env:ANDROID_VERSION_CODE,
  [string]$VersionName = $env:ANDROID_VERSION_NAME
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$androidStudioJbr = "C:\Program Files\Android\Android Studio\jbr"
$keystorePropsPath = Join-Path $repoRoot "android\keystore.properties"

function Get-AnyEnvValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return (
    [Environment]::GetEnvironmentVariable($Name, "Process"),
    [Environment]::GetEnvironmentVariable($Name, "User"),
    [Environment]::GetEnvironmentVariable($Name, "Machine")
  ) | Where-Object { $_ } | Select-Object -First 1
}

if (-not $ServerUrl) {
  throw "Set CAPACITOR_SERVER_URL to the deployed HTTPS domain before building a public APK."
}

if (-not $ServerUrl.StartsWith("https://")) {
  throw "CAPACITOR_SERVER_URL must start with https:// for public distribution."
}

if (-not $VersionCode) {
  $VersionCode = "1"
}

if (-not $VersionName) {
  $VersionName = "1.0.0"
}

$env:CAPACITOR_SERVER_URL = $ServerUrl
$env:ANDROID_VERSION_CODE = $VersionCode
$env:ANDROID_VERSION_NAME = $VersionName

if (-not $env:JAVA_HOME -and (Test-Path $androidStudioJbr)) {
  $env:JAVA_HOME = $androidStudioJbr
  if ($env:Path -notlike "*$androidStudioJbr\bin*") {
    $env:Path = "$androidStudioJbr\bin;$env:Path"
  }
}

if (-not (Test-Path $keystorePropsPath)) {
  $requiredEnv = @(
    "ANDROID_KEYSTORE_PATH",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD"
  )

  foreach ($name in $requiredEnv) {
    $value = Get-AnyEnvValue -Name $name
    if (-not $value) {
      throw "Release signing is missing. Create android/keystore.properties or set $name."
    }
    Set-Item -Path "Env:$name" -Value $value
  }
}

Push-Location $repoRoot
try {
  npm run mobile:android:sync

  Push-Location (Join-Path $repoRoot "android")
  try {
    .\gradlew.bat assembleRelease
  } finally {
    Pop-Location
  }
} finally {
  Pop-Location
}

$apkPath = Join-Path $repoRoot "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkPath)) {
  throw "Release APK not found at $apkPath"
}

Write-Host "Release APK ready:" $apkPath
Write-Host "Server URL:" $ServerUrl
Write-Host "Version:" "$VersionName ($VersionCode)"
