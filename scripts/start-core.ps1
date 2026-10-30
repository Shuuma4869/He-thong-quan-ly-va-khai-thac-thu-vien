param([switch]$UseExistingBuild)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$projectRoot = Get-LamsRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Thiếu .env. Hãy chạy scripts\bootstrap-local.ps1 trước.' }
Import-LamsEnv $envPath -OverrideExisting
Test-LamsLocalConfiguration
if (Test-LamsTcpPort -Port 8080) { throw 'Core đã chạy trên cổng 8080; không mở tiến trình thứ hai.' }
$origins = @((Get-LamsSetting 'CORS_ALLOWED_ORIGINS' 'http://localhost:5173').Split(',') | ForEach-Object { $_.Trim() })
$env:CORS_ALLOWED_ORIGINS = (@($origins + 'http://tauri.localhost') | Select-Object -Unique) -join ','

$coreRoot = Join-Path $projectRoot 'backend\core-service'
Push-Location $coreRoot
try {
    if (-not $UseExistingBuild) {
        Invoke-LamsNative '.\mvnw.cmd' @('-DskipTests', 'package') 'Không thể package Core Service'
    }
    $jar = Get-ChildItem -LiteralPath (Join-Path $coreRoot 'target') -Filter 'core-service-*.jar' |
        Where-Object { $_.Name -notlike '*.original' } |
        Select-Object -First 1
    if (-not $jar) { throw 'Không tìm thấy Core Service JAR sau khi package.' }
    Invoke-LamsNative 'java' @('-jar', (Join-Path 'target' $jar.Name)) 'Core Service dừng với lỗi'
} finally { Pop-Location }
