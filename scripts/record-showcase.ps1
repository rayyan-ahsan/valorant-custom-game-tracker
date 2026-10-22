param([string]$PostgresBin, [switch]$SkipBuild, [switch]$ManualCaptain)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$savedShowcase = $env:VISUAL_SHOWCASE
$savedManual = $env:VISUAL_MANUAL_CAPTAIN
Push-Location -LiteralPath $projectRoot
try {
    if (-not (Test-Path -LiteralPath '.visual-runs/video-tools/node_modules/ffmpeg-static/index.js')) {
        & npm install --prefix .visual-runs/video-tools --no-audit --no-fund ffmpeg-static
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the video encoder.' }
    }
    $started = Get-Date
    $env:VISUAL_SHOWCASE = '1'
    $env:VISUAL_MANUAL_CAPTAIN = if ($ManualCaptain) { '1' } else { '0' }
    & ./scripts/test-visual.ps1 -Mode auto -Headless:(-not $ManualCaptain) -Format bo3 -PostgresBin $PostgresBin -SkipBuild:$SkipBuild
    if ($LASTEXITCODE -ne 0) { throw 'The showcase flow failed. See .visual-runs/server.log.' }
    $recording = Get-ChildItem -Path '.visual-runs/run-*/recording.json' |
        Where-Object { $_.LastWriteTime -ge $started } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $recording) { throw 'No completed recording was produced.' }
    & node visual-tests/encode-showcase.mjs $recording.DirectoryName
    if ($LASTEXITCODE -ne 0) { throw 'Video export failed.' }
} finally {
    $env:VISUAL_SHOWCASE = $savedShowcase
    $env:VISUAL_MANUAL_CAPTAIN = $savedManual
    Pop-Location
}
