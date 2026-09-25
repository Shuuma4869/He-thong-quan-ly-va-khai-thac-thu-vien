$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$projectRoot = Get-LamsRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Thiếu .env. Hãy chạy scripts\bootstrap-local.ps1 trước.' }
Import-LamsEnv $envPath

$coreRoot = Join-Path $projectRoot 'backend\core-service'
Push-Location $coreRoot
try {
    Invoke-LamsNative '.\mvnw.cmd' @('-DskipTests', 'package') 'Không thể package Core Service'
    $jar = Get-ChildItem -LiteralPath (Join-Path $coreRoot 'target') -Filter 'core-service-*.jar' |
        Where-Object { $_.Name -notlike '*.original' } |
        Select-Object -First 1
    if (-not $jar) { throw 'Không tìm thấy Core Service JAR sau khi package.' }
    Invoke-LamsNative 'java' @('-jar', $jar.FullName) 'Core Service dừng với lỗi'
} finally { Pop-Location }
