#Requires -Version 7.0
param(
    [ValidateSet('Setup', 'Web', 'Desktop', 'Doctor', 'Stop')][string]$Action = 'Web',
    [switch]$NoOpen,
    [switch]$RebuildCore,
    [switch]$ConfigureOnly
)
$ErrorActionPreference = 'Stop'
if ($ConfigureOnly -and $Action -ne 'Setup') { throw '-ConfigureOnly chỉ dùng với Setup.' }
Push-Location $PSScriptRoot
try {
    switch ($Action) {
        'Setup' { & (Join-Path $PSScriptRoot 'scripts/bootstrap-local.ps1') -ConfigureOnly:$ConfigureOnly }
        'Doctor' {
            & (Join-Path $PSScriptRoot 'scripts/doctor.ps1')
            if ($LASTEXITCODE -ne 0) { throw 'Doctor phát hiện môi trường chưa đạt yêu cầu. Kiểm tra các lỗi ở trên.' }
        }
        'Stop' { & (Join-Path $PSScriptRoot 'scripts/stop-local-services.ps1') }
        default { & (Join-Path $PSScriptRoot 'scripts/start-local-desktop.ps1') -Mode $Action -NoOpen:$NoOpen -RebuildCore:$RebuildCore }
    }
} finally { Pop-Location }
