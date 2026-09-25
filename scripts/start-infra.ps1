$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$projectRoot = Get-LamsRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) {
    throw 'Thiếu .env. Hãy chạy scripts\bootstrap-local.ps1 trước.'
}

Push-Location $projectRoot
try {
    Invoke-LamsNative 'docker' @('compose', 'config', '--quiet') 'Docker Compose config không hợp lệ'
    Invoke-LamsNative 'docker' @('compose', 'up', '-d', '--build', '--wait', 'postgres', 'redis', 'kafka', 'minio') 'Không thể khởi động hạ tầng LAMS'
} finally { Pop-Location }

Write-Host '[OK] PostgreSQL, Redis, Kafka và MinIO đã sẵn sàng.' -ForegroundColor Green
