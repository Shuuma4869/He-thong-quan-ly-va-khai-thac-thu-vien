$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$projectRoot = Get-LamsRoot

$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    $template = Get-Content -LiteralPath (Join-Path $projectRoot '.env.example') -Raw -Encoding utf8
    $password = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLowerInvariant()
    $jwt = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48)).ToLowerInvariant()
    $template = $template.Replace('change-me-local-only', $password)
    $template = $template.Replace('local-development-placeholder-change-before-deploy-32-bytes', $jwt)
    [System.IO.File]::WriteAllText($envPath, $template, [System.Text.UTF8Encoding]::new($false))
    Write-Host '[OK] Đã tạo .env local với mật khẩu và JWT secret ngẫu nhiên.' -ForegroundColor Green
} else {
    Write-Host '[OK] Giữ nguyên .env hiện có.' -ForegroundColor Green
}
Import-LamsEnv $envPath -OverrideExisting
Test-LamsLocalConfiguration
& (Join-Path $PSScriptRoot 'doctor.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Môi trường chưa đạt yêu cầu; bootstrap đã dừng.' }

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

$env:PGPASSWORD = $env:POSTGRES_PASSWORD
try {
    & docker compose exec -T -e PGPASSWORD postgres psql -h 127.0.0.1 -U $env:POSTGRES_USER -d $env:POSTGRES_DB -tA -c 'SELECT 1;' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'PostgreSQL không chấp nhận mật khẩu trong .env. Volume cũ có thể dùng mật khẩu khác; không xóa volume. Khôi phục mật khẩu đúng hoặc đổi bằng quy trình quản trị DB.'
    }
} finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }

Push-Location (Join-Path $projectRoot 'backend\insight-service')
try { Invoke-LamsNative 'npm' @('run', 'prisma:deploy') 'Prisma migrate deploy thất bại' } finally { Pop-Location }

Write-Host ''
Write-Host 'Bootstrap hoàn tất. Flyway sẽ tự migrate khi Core Service khởi động.' -ForegroundColor Green
Write-Host 'Chạy ba ứng dụng ở ba terminal:'
Write-Host '  .\scripts\start-core.ps1'
Write-Host '  .\scripts\start-insight.ps1'
Write-Host '  .\scripts\start-desktop.ps1'
Write-Host 'Desktop cần chạy setup-desktop.ps1 một lần trước đó; xem tai-lieu/08-van-hanh/desktop-windows.md.'
