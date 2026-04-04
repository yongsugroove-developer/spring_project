param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,
  [string]$Password = "PlannerSmoke1234!",
  [string]$DisplayName = "Public Smoke Test"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$normalizedBaseUrl = $BaseUrl.TrimEnd("/")
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$email = "smoke+$timestamp@example.invalid"

function Invoke-JsonRequest {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("GET", "POST")]
    [string]$Method,
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [object]$Body,
    [string]$Token
  )

  $headers = @{
    Accept = "application/json"
    "Accept-Language" = "en"
  }

  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $params = @{
    Uri = "$normalizedBaseUrl$Path"
    Method = $Method
    Headers = $headers
  }

  if ($null -ne $Body) {
    $params["ContentType"] = "application/json"
    $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
  }

  try {
    return Invoke-RestMethod @params
  } catch {
    $response = $_.Exception.Response
    if ($response -and $response.GetResponseStream()) {
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
      $bodyText = $reader.ReadToEnd()
      throw "Request failed for ${Path}: $bodyText"
    }
    throw
  }
}

$health = Invoke-JsonRequest -Method GET -Path "/api/health"
if (-not $health.ok) {
  throw "Health endpoint did not report ok=true."
}
if (-not $health.authRequired) {
  throw "Expected authRequired=true for the public deployment."
}
if ($health.storageDriver -ne "mysql") {
  throw "Expected storageDriver=mysql for the public deployment."
}

$register = Invoke-JsonRequest -Method POST -Path "/api/auth/register" -Body @{
  email = $email
  password = $Password
  displayName = $DisplayName
}

$login = Invoke-JsonRequest -Method POST -Path "/api/auth/login" -Body @{
  email = $email
  password = $Password
}

$sessionToken = $login.session.token
if (-not $sessionToken) {
  throw "Login did not return a session token."
}

$me = Invoke-JsonRequest -Method GET -Path "/api/auth/me" -Token $sessionToken
if (-not $me.user.email) {
  throw "Auth me endpoint did not return a user payload."
}

Write-Host "Public deployment checks passed."
Write-Host "Base URL:" $normalizedBaseUrl
Write-Host "Smoke user:" $email
Write-Host "Auth required:" $health.authRequired
Write-Host "Storage driver:" $health.storageDriver
