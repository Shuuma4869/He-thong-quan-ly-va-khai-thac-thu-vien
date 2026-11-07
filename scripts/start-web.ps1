$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'service-runtime.ps1')
Import-LamsEnv -OverrideExisting
Test-LamsLocalConfiguration
if (Test-LamsTcpPort -Port 5173) { throw 'Cổng Web 5173 đã được sử dụng; không mở tiến trình thứ hai.' }
Push-Location (Join-Path (Get-LamsRoot) 'frontend')
try {
    New-LamsServiceRuntime (Get-LamsRoot) 'web'
    Invoke-LamsNative 'npm.cmd' @('run', 'dev', '--', '--host', '127.0.0.1') 'Web khởi động thất bại'
} finally { Pop-Location }
