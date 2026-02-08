[CmdletBinding()]
param(
  [ValidateSet('none', 'patch', 'minor', 'major')]
  [string]$Bump = 'none',

  [string]$Version,

  [switch]$PackageOnly,

  [switch]$SkipChecks,

  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$BaseImagesUrl = 'https://vscode-nanobanana.gh.miniasp.com/'

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Host "==> $Name"
  & $Action
}

function Invoke-Npm {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  & npm @Args
  if ($LASTEXITCODE -ne 0) {
    throw "npm command failed: npm $($Args -join ' ')"
  }
}

function Invoke-Vsce {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  & npx @vscode/vsce @Args
  if ($LASTEXITCODE -ne 0) {
    throw "vsce command failed: npx @vscode/vsce $($Args -join ' ')"
  }
}

if (-not (Test-Path -Path 'package.json')) {
  throw 'package.json not found. Please run this script at the extension project root.'
}

if (-not (Test-Path -Path 'icon.png')) {
  throw 'icon.png not found. Add icon.png before packaging/publishing.'
}

if ($PackageOnly -and $Bump -ne 'none') {
  throw 'Bump cannot be used with -PackageOnly.'
}

if ($Version -and $Bump -ne 'none') {
  throw 'Use either -Version or -Bump, not both.'
}

if (-not $SkipChecks) {
  Invoke-Step -Name 'Install dependencies' -Action { Invoke-Npm -Args @('ci') }
  Invoke-Step -Name 'Type check' -Action { Invoke-Npm -Args @('run', 'typecheck') }
  Invoke-Step -Name 'Unit tests' -Action { Invoke-Npm -Args @('run', 'test') }
  Invoke-Step -Name 'Build extension' -Action { Invoke-Npm -Args @('run', 'build') }
}

if ($PackageOnly) {
  Invoke-Step -Name 'Create VSIX package' -Action {
    Invoke-Vsce -Args @('package', '--baseImagesUrl', $BaseImagesUrl)
  }
  Write-Host 'Done. VSIX package generated.'
  exit 0
}

$publishArgs = @('publish')
$patForCommand = $env:VSCE_PAT

if ($Version) {
  $publishArgs += $Version
} elseif ($Bump -ne 'none') {
  $publishArgs += $Bump
}

if ($DryRun) {
  $displayPat = if ([string]::IsNullOrWhiteSpace($patForCommand)) { '<VSCE_PAT>' } else { '<REDACTED>' }
  Write-Host "Dry run only. Command: npx @vscode/vsce $($publishArgs -join ' ') --baseImagesUrl $BaseImagesUrl --pat $displayPat"
  exit 0
}

if ([string]::IsNullOrWhiteSpace($patForCommand)) {
  throw 'VSCE_PAT is not set. Export VSCE_PAT before publishing.'
}

$publishArgs += @('--baseImagesUrl', $BaseImagesUrl, '--pat', $patForCommand)

Invoke-Step -Name 'Publish to Visual Studio Marketplace' -Action {
  Invoke-Vsce -Args $publishArgs
}

Write-Host 'Publish completed successfully.'
