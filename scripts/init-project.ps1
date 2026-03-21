[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigFile,

  [string]$TargetPath = ".",

  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[INIT] $Message"
}

function Get-ConfigMap {
  param([string]$Path)

  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $obj = $raw | ConvertFrom-Json
  $map = @{}
  foreach ($property in $obj.PSObject.Properties) {
    $map[$property.Name] = [string]$property.Value
  }
  return $map
}

function Ensure-RequiredKeys {
  param(
    [hashtable]$Config,
    [string[]]$Keys
  )

  foreach ($key in $Keys) {
    if (-not $Config.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($Config[$key])) {
      throw "Missing required config value: $key"
    }
  }
}

function Replace-Placeholders {
  param(
    [string]$Content,
    [hashtable]$Config
  )

  $result = $Content
  foreach ($key in $Config.Keys) {
    $token = "{{${key}}}"
    $result = $result.Replace($token, $Config[$key])
  }
  return $result
}

function Write-TemplatedFile {
  param(
    [string]$SourcePath,
    [string]$DestinationPath,
    [hashtable]$Config
  )

  $parent = Split-Path -Parent $DestinationPath
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  $content = Get-Content -LiteralPath $SourcePath -Raw -Encoding UTF8
  $rendered = Replace-Placeholders -Content $content -Config $Config
  Set-Content -LiteralPath $DestinationPath -Value $rendered -Encoding UTF8
}

function Copy-TemplateTree {
  param(
    [string]$SourceRoot,
    [string]$DestinationRoot,
    [hashtable]$Config
  )

  $sourceRootFull = [System.IO.Path]::GetFullPath($SourceRoot)
  $items = Get-ChildItem -LiteralPath $sourceRootFull -Recurse -Force -File
  foreach ($item in $items) {
    $sourceUri = New-Object System.Uri(($sourceRootFull.TrimEnd('\') + '\'))
    $itemUri = New-Object System.Uri($item.FullName)
    $relative = [System.Uri]::UnescapeDataString($sourceUri.MakeRelativeUri($itemUri).ToString()).Replace('/', '\')
    if ($relative -eq "AGENTS.md.template" -or $relative -eq "README.md.template" -or $relative -eq "AGENTS.append.md") {
      continue
    }

    $targetRelative = if ($relative.EndsWith(".template")) {
      $relative.Substring(0, $relative.Length - ".template".Length)
    } else {
      $relative
    }

    $destination = Join-Path $DestinationRoot $targetRelative
    Write-TemplatedFile -SourcePath $item.FullName -DestinationPath $destination -Config $Config
  }
}

function Assert-NoPlaceholdersRemain {
  param([string]$Path)

  $files = Get-ChildItem -LiteralPath $Path -Recurse -File | Where-Object {
    $_.FullName -notmatch "\\template\\"
  }

  foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    if ($content -match "{{[A-Z0-9_]+}}") {
      throw "Unresolved placeholder found in $($file.FullName)"
    }
  }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$targetRoot = if (Test-Path -LiteralPath $TargetPath) {
  Resolve-Path $TargetPath
} else {
  New-Item -ItemType Directory -Path $TargetPath -Force | Out-Null
  Resolve-Path $TargetPath
}
$configPath = Resolve-Path $ConfigFile
$manifestPath = Join-Path $repoRoot "template-manifest.json"

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$config = Get-ConfigMap -Path $configPath
Ensure-RequiredKeys -Config $config -Keys $manifest.required_variables

$coreRoot = Join-Path $repoRoot "template/core"
$profileRoot = Join-Path $repoRoot ("template/profiles/" + $config["STACK_PROFILE"])

if (-not (Test-Path -LiteralPath $profileRoot)) {
  throw "Unknown profile: $($config["STACK_PROFILE"])"
}

Write-Step "Applying core template"
Copy-TemplateTree -SourceRoot $coreRoot -DestinationRoot $targetRoot -Config $config

Write-Step "Applying profile template: $($config["STACK_PROFILE"])"
Copy-TemplateTree -SourceRoot $profileRoot -DestinationRoot $targetRoot -Config $config

$coreAgentsTemplate = Join-Path $coreRoot "AGENTS.md.template"
$profileAgentsAppend = Join-Path $profileRoot "AGENTS.append.md"
$agentsDestination = Join-Path $targetRoot "AGENTS.md"
$coreAgentsContent = Get-Content -LiteralPath $coreAgentsTemplate -Raw -Encoding UTF8
$profileAgentsContent = Get-Content -LiteralPath $profileAgentsAppend -Raw -Encoding UTF8
$mergedAgents = (Replace-Placeholders -Content $coreAgentsContent -Config $config).TrimEnd() + "`r`n`r`n" + (Replace-Placeholders -Content $profileAgentsContent -Config $config).Trim()
Set-Content -LiteralPath $agentsDestination -Value $mergedAgents -Encoding UTF8

$readmeTemplate = Join-Path $coreRoot "README.md.template"
$readmeDestination = Join-Path $targetRoot "README.md"
Write-TemplatedFile -SourcePath $readmeTemplate -DestinationPath $readmeDestination -Config $config

if ($config["STACK_PROFILE"] -eq "node-express") {
  foreach ($dir in @("src", "public", "tests/unit", "tests/integration")) {
    New-Item -ItemType Directory -Force -Path (Join-Path $targetRoot $dir) | Out-Null
  }
}

Assert-NoPlaceholdersRemain -Path $targetRoot

Write-Step "Template initialization completed"
Write-Host "[DONE] Generated project files in $targetRoot"
