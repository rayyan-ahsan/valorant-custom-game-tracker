param(
    [ValidateSet('step', 'auto', 'manual')][string]$Mode = 'step',
    [ValidateSet('msedge', 'chrome', 'chromium')][string]$Browser = 'msedge',
    [ValidateSet('bo1', 'bo2', 'bo3')][string]$Format = 'bo1',
    [string]$PostgresBin,
    [switch]$SkipBuild,
    [switch]$Headless,
    [switch]$Verify,
    [switch]$Resilience,
    [string]$StagingUrl
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$names = @('VISUAL_STAGING','VISUAL_RESILIENCE','VISUAL_TEST','VISUAL_MODE','VISUAL_BROWSER','VISUAL_FORMAT','VISUAL_HEADLESS','VISUAL_VERIFY','VISUAL_ASSET_DIR','BUILD_PATH','CI')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$testExitCode = 1
Push-Location -LiteralPath $projectRoot
try {
    if (-not (Test-Path -LiteralPath 'visual-tests/node_modules/playwright/package.json')) {
        Write-Host 'Installing visual test dependencies...'
        Push-Location -LiteralPath 'visual-tests'
        try {
            & npm ci
            if ($LASTEXITCODE -ne 0) { throw 'Could not install the visual test dependencies.' }
        } finally { Pop-Location }
    }
    $env:VISUAL_ASSET_DIR = Join-Path $projectRoot '.visual-runs/build'
    if (-not $SkipBuild -and -not $StagingUrl) {
        $env:BUILD_PATH = $env:VISUAL_ASSET_DIR
        # CRA otherwise treats this repository's existing lint warnings as errors
        # when the launcher is used in CI. Syntax/build errors still fail.
        $env:CI = 'false'
        Push-Location -LiteralPath 'FrontEnd'
        try {
            & npm run build
            if ($LASTEXITCODE -ne 0) { throw 'The frontend build failed.' }
        } finally { Pop-Location }
    }
    if (-not $StagingUrl -and -not (Test-Path -LiteralPath (Join-Path $env:VISUAL_ASSET_DIR 'index.html'))) {
        throw 'There is no visual build yet. Run again without -SkipBuild.'
    }
    $env:VISUAL_STAGING = if ($StagingUrl) { '1' } else { '0' }
    $env:VISUAL_RESILIENCE = if ($Resilience) { '1' } else { '0' }
    $env:VISUAL_TEST = '1'
    $env:VISUAL_MODE = $Mode
    $env:VISUAL_BROWSER = $Browser
    $env:VISUAL_FORMAT = $Format
    $env:VISUAL_HEADLESS = if ($Headless) { '1' } else { '0' }
    $env:VISUAL_VERIFY = if ($Verify) { '1' } else { '0' }
    if ($StagingUrl) {
        # Explicit staging mode uses the deployed frontend, certificates, proxy,
        # cookies and database. It creates synthetic accounts on that server.
        Write-Host 'Testing the supplied staging server with ten synthetic player accounts.'
        & node visual-tests/runner.mjs --url $StagingUrl.TrimEnd('/')
    } else {
        Write-Host 'Opening an isolated ten-player session. Use Stop in the control panel to exit cleanly.'
        & (Join-Path $PSScriptRoot 'test-flow.ps1') -PostgresBin $PostgresBin -Visual -WithoutRace
    }
    $testExitCode = $LASTEXITCODE
} finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    Pop-Location
}
exit $testExitCode
