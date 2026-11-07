param([switch]$UseExistingBuild, [switch]$BuildOnly)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'core-build-state.ps1')
. (Join-Path $PSScriptRoot 'service-runtime.ps1')

$projectRoot = Get-LamsRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Thiếu .env. Hãy chạy scripts\bootstrap-local.ps1 trước.' }
Import-LamsEnv $envPath -OverrideExisting
Test-LamsLocalConfiguration
if (-not $BuildOnly -and (Test-LamsTcpPort -Port 8080)) { throw 'Core đã chạy trên cổng 8080; không mở tiến trình thứ hai.' }
$origins = @((Get-LamsSetting 'CORS_ALLOWED_ORIGINS' 'http://localhost:5173').Split(',') | ForEach-Object { $_.Trim() })
$env:CORS_ALLOWED_ORIGINS = (@($origins + 'http://tauri.localhost') | Select-Object -Unique) -join ','

$coreRoot = Join-Path $projectRoot 'backend\core-service'
Push-Location $coreRoot
try {
    if (-not $UseExistingBuild) {
        $before = Get-LamsCoreFingerprint $coreRoot
        Invoke-LamsNative '.\mvnw.cmd' @('-DskipTests', 'package') 'Không thể package Core Service'
    }
    $jar = Get-ChildItem -LiteralPath (Join-Path $coreRoot 'target') -Filter 'core-service-*.jar' |
        Where-Object { $_.Name -notlike '*.original' } |
        Select-Object -First 1
    if (-not $jar) { throw 'Không tìm thấy Core Service JAR sau khi package.' }
    if (-not $UseExistingBuild) {
        if ($before -ne (Get-LamsCoreFingerprint $coreRoot)) { throw 'Source Core thay đổi trong lúc build. Build lại trước khi chạy.' }
        @{ schema = 1; source = $before; jarSha256 = (Get-FileHash -LiteralPath $jar.FullName).Hash; builtAt = [DateTime]::UtcNow.ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $coreRoot 'target\lams-core-build.json')
    }
    if (-not (Test-LamsCoreBuild -CoreRoot $coreRoot -Jar $jar.FullName)) {
        throw 'JAR chưa được xác minh hoặc đã cũ. Chạy scripts/start-core.ps1 để build lại, hoặc launcher với -RebuildCore.'
    }
    if ($BuildOnly) { Write-Host '[OK] Core JAR và manifest khớp source.'; return }
    New-LamsServiceRuntime $projectRoot 'core'
    # Java trên Windows có thể làm mất dấu trong đối số đường dẫn tuyệt đối.
    # Thư mục làm việc đã là coreRoot; tên JAR do Maven tạo chỉ dùng ASCII.
    Invoke-LamsNative 'java' @('-jar', (Join-Path 'target' $jar.Name)) 'Core Service dừng với lỗi'
} finally { Pop-Location }
