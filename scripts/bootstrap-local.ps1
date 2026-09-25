$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$projectRoot = Get-LamsRoot
& (Join-Path $PSScriptRoot 'doctor.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Môi trường chưa đạt yêu cầu; bootstrap đã dừng.' }

$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath (Join-Path $projectRoot '.env.example') -Destination $envPath
    Write-Host '[OK] Đã tạo .env từ .env.example.' -ForegroundColor Green
} else {
    Write-Host '[OK] Giữ nguyên .env hiện có.' -ForegroundColor Green
}
Import-LamsEnv $envPath

Push-Location (Join-Path $projectRoot 'frontend')
try { Invoke-LamsNative 'npm' @('ci') 'npm ci frontend thất bại' } finally { Pop-Location }

Push-Location (Join-Path $projectRoot 'backend\insight-service')
try {
    Invoke-LamsNative 'npm' @('ci') 'npm ci Insight Service thất bại'
    Invoke-LamsNative 'npm' @('run', 'prisma:validate') 'Prisma validate thất bại'
    Invoke-LamsNative 'npm' @('run', 'prisma:generate') 'Prisma generate thất bại'
} finally { Pop-Location }

& (Join-Path $PSScriptRoot 'start-infra.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Khởi động hạ tầng thất bại.' }

Push-Location (Join-Path $projectRoot 'backend\insight-service')
try { Invoke-LamsNative 'npm' @('run', 'prisma:deploy') 'Prisma migrate deploy thất bại' } finally { Pop-Location }

Write-Host ''
Write-Host 'Bootstrap hoàn tất. Flyway sẽ tự migrate khi Core Service khởi động.' -ForegroundColor Green
Write-Host 'Chạy ba ứng dụng ở ba terminal:'
Write-Host '  .\scripts\start-core.ps1'
Write-Host '  cd backend\insight-service; npm run start:dev'
Write-Host '  cd frontend; npm run dev'
