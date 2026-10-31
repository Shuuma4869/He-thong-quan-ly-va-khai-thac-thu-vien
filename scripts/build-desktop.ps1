param([ValidateSet('local','pilot','production')][string]$Environment = 'local', [string]$CoreApiUrl, [string]$InsightApiUrl)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
# Build with the desktop origin even if another script imported web settings in this shell.
$savedCoreUrl = $env:VITE_CORE_API_URL
$savedInsightUrl = $env:VITE_INSIGHT_API_URL
$savedStage = $env:VITE_DEPLOYMENT_ENV
if ($Environment -ne 'local' -and -not $CoreApiUrl) { throw 'Cần -CoreApiUrl HTTPS của môi trường đã triển khai; không dùng localhost cho bản phát hành.' }
$env:VITE_DEPLOYMENT_ENV = $Environment
$env:VITE_CORE_API_URL = if ($Environment -eq 'local' -and -not $CoreApiUrl) { 'http://api.tauri.localhost:8080/api/v1' } else { $CoreApiUrl }
$env:VITE_INSIGHT_API_URL = if ($Environment -eq 'local' -and -not $InsightApiUrl) { 'http://api.tauri.localhost:3000/api/v1' } else { $InsightApiUrl }
Push-Location (Join-Path (Get-LamsRoot) 'frontend')
try { Invoke-LamsNative 'npm.cmd' @('run', 'desktop:build') 'Build desktop thất bại' }
finally {
    Pop-Location
    $env:VITE_CORE_API_URL = $savedCoreUrl
    $env:VITE_INSIGHT_API_URL = $savedInsightUrl
    $env:VITE_DEPLOYMENT_ENV = $savedStage
}
