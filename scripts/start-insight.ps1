$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Import-LamsEnv
$origins = @($env:FRONTEND_ORIGIN -split ',' | Where-Object { $_ }) + @('http://localhost:5173', 'http://tauri.localhost')
$env:FRONTEND_ORIGIN = ($origins | ForEach-Object { $_.Trim() } | Select-Object -Unique) -join ','
Push-Location (Join-Path (Get-LamsRoot) 'backend\insight-service')
try { Invoke-LamsNative 'npm.cmd' @('run', 'start:dev') 'Insight khởi động thất bại' }
finally { Pop-Location }
