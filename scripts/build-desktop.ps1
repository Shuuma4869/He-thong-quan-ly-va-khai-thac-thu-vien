$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
# Build with the desktop origin even if another script imported web settings in this shell.
$savedCoreUrl = $env:VITE_CORE_API_URL
$savedInsightUrl = $env:VITE_INSIGHT_API_URL
$env:VITE_CORE_API_URL = 'http://api.tauri.localhost:8080/api/v1'
$env:VITE_INSIGHT_API_URL = 'http://api.tauri.localhost:3000/api/v1'
Push-Location (Join-Path (Get-LamsRoot) 'frontend')
try { Invoke-LamsNative 'npm.cmd' @('run', 'desktop:build') 'Build desktop thất bại' }
finally {
    Pop-Location
    $env:VITE_CORE_API_URL = $savedCoreUrl
    $env:VITE_INSIGHT_API_URL = $savedInsightUrl
}
