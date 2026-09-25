$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$projectRoot = Get-LamsRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) { Import-LamsEnv $envPath }
else { Import-LamsEnv (Join-Path $projectRoot '.env.example') }

Push-Location "$projectRoot/backend/core-service"
try {
    Invoke-LamsNative '.\mvnw.cmd' @('test') 'Spring test thất bại'
    Invoke-LamsNative '.\mvnw.cmd' @('-DskipTests', 'package') 'Spring package thất bại'
} finally { Pop-Location }

Push-Location "$projectRoot/backend/insight-service"
try {
    Invoke-LamsNative 'npm' @('run', 'prisma:validate') 'Prisma validate thất bại'
    Invoke-LamsNative 'npm' @('test') 'Nest test thất bại'
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

Write-Host 'Kiểm tra chất lượng starter đã hoàn tất.'
