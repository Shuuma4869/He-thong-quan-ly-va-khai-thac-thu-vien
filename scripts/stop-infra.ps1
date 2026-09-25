$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

Push-Location (Get-LamsRoot)
try {
    Invoke-LamsNative 'docker' @('compose', 'down') 'Không thể dừng hạ tầng LAMS'
} finally { Pop-Location }

Write-Host '[OK] Đã dừng hạ tầng LAMS; named volumes vẫn được giữ.' -ForegroundColor Green
