$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$projectRoot = Get-LamsRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    Import-LamsEnv $envPath -OverrideExisting
    Test-LamsLocalConfiguration
} else { Import-LamsEnv (Join-Path $projectRoot '.env.example') -OverrideExisting }

Push-Location $projectRoot
try {
    Invoke-LamsNative 'node' @('--test', '.\scripts\demo-catalog.test.mjs', '.\scripts\gutenberg-csv.test.mjs') 'Kiểm thử dữ liệu demo thất bại'
} finally { Pop-Location }

Push-Location "$projectRoot/backend/core-service"
try {
    Invoke-LamsNative '.\mvnw.cmd' @('-B', 'clean', 'verify') 'Spring clean verify thất bại'
} finally { Pop-Location }

Push-Location "$projectRoot/backend/insight-service"
try {
    Invoke-LamsNative 'npm' @('run', 'prisma:validate') 'Prisma validate thất bại'
    Invoke-LamsNative 'npm' @('run', 'prisma:generate') 'Prisma generate thất bại'
    Invoke-LamsNative 'npm' @('test') 'Nest test thất bại'
    Invoke-LamsNative 'npm' @('run', 'test:integration') 'Insight PostgreSQL integration thất bại'
    Invoke-LamsNative 'npm' @('run', 'build') 'Nest build thất bại'
} finally { Pop-Location }

Push-Location "$projectRoot/frontend"
try {
    Invoke-LamsNative 'npm' @('run', 'typecheck') 'Frontend typecheck thất bại'
    Invoke-LamsNative 'npm' @('run', 'lint') 'Frontend lint thất bại'
    Invoke-LamsNative 'npm' @('test') 'Frontend test thất bại'
    Invoke-LamsNative 'npm' @('run', 'build') 'Frontend build thất bại'
} finally { Pop-Location }

Push-Location $projectRoot
try {
    Invoke-LamsNative 'docker' @('compose', 'config', '--quiet') 'Docker Compose config không hợp lệ'
} finally { Pop-Location }

Write-Host 'Kiểm tra chất lượng Core, Insight, frontend và Compose đã hoàn tất. Chạy thêm OpenAPI validator và E2E theo pre-push gate.'
