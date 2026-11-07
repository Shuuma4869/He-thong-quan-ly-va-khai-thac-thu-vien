param([switch]$RebuildCore, [ValidateSet('Desktop', 'Web')][string]$Mode = 'Desktop', [switch]$NoOpen)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'desktop-readiness.ps1')
. (Join-Path $PSScriptRoot 'core-build-state.ps1')
. (Join-Path $PSScriptRoot 'service-runtime.ps1')

$projectRoot = Get-LamsRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Chưa có cấu hình local. Chạy .\lams.ps1 Setup trước.' }
Import-LamsEnv -OverrideExisting
Test-LamsLocalConfiguration
& (Join-Path $PSScriptRoot 'doctor.ps1')
foreach ($path in @('frontend/node_modules', 'backend/insight-service/node_modules/.prisma/client')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $path))) { throw 'Thiếu dependency hoặc Prisma client. Chạy .\lams.ps1 Setup trước.' }
}
if ($Mode -eq 'Desktop') {
    Invoke-LamsNative 'node' @((Join-Path $projectRoot 'frontend\scripts\release-manifest.mjs')) 'Chưa có desktop khớp source. Chạy scripts/build-desktop.ps1 trước, hoặc dùng .\lams.ps1 Web'
}
$logs = Join-Path $projectRoot '.tools\desktop-launch'
New-Item -ItemType Directory -Path $logs -Force | Out-Null

$lockId = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))
$startupLock = [Threading.Mutex]::new($false, "Local\LamsStartup-$lockId")
$locked = $false
try {
    try { $locked = $startupLock.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Một lượt khởi động LAMS đang chạy. Chờ lượt đó hoàn tất rồi thử lại.' }
$services = @(@{ name = 'core'; port = 8080 }, @{ name = 'insight'; port = 3000 })
if ($Mode -eq 'Web') { $services += @{ name = 'web'; port = 5173 } }
foreach ($service in $services) {
    if (Test-LamsTcpPort -Port $service.port) { Assert-LamsServiceRuntime $projectRoot $service.name $service.port }
}
if (-not (Test-LamsTcpPort -Port 8080)) {
    $coreRoot = Join-Path $projectRoot 'backend\core-service'
    $jar = Get-ChildItem -LiteralPath (Join-Path $coreRoot 'target') -Filter 'core-service-*.jar' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike '*.original' } | Select-Object -First 1
    if ($RebuildCore -or -not $jar -or -not (Test-LamsCoreBuild $coreRoot $jar.FullName)) {
        Write-Host '[ĐANG CHẠY] Build Core từ source hiện tại…'
        & (Join-Path $PSScriptRoot 'start-core.ps1') -BuildOnly
    }
}
Invoke-LamsNative 'docker' @('info', '--format', '{{.ServerVersion}}') 'Docker Engine chưa sẵn sàng'
Push-Location $projectRoot
try {
    Invoke-LamsNative 'docker' @('compose', 'up', '-d', '--wait', 'postgres', 'redis', 'kafka') 'Không thể khởi động hạ tầng LAMS'
} finally { Pop-Location }

$pwsh = (Get-Command pwsh.exe).Source
function Start-LocalService([string]$Name, [string[]]$Extra = @()) {
    # Start-Process nối ArgumentList thành một chuỗi; -File cần dấu ngoặc kép khi root có khoảng trắng.
    $scriptPath = Join-Path $PSScriptRoot "start-$Name.ps1"
    $arguments = @('-NoProfile', '-File', ('"' + $scriptPath + '"')) + $Extra
    Start-Process -FilePath $pwsh -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs "$Name.out.log") -RedirectStandardError (Join-Path $logs "$Name.err.log") | Out-Null
}
if (-not (Test-LamsTcpPort -Port 8080)) {
    Start-LocalService 'core' @('-UseExistingBuild')
}
if (-not (Test-LamsTcpPort -Port 3000)) {
    Push-Location (Join-Path $projectRoot 'backend/insight-service')
    try { Invoke-LamsNative 'npm.cmd' @('run', 'prisma:deploy') 'Prisma migration thất bại; không khởi động Insight với schema chưa sẵn sàng' }
    finally { Pop-Location }
    Start-LocalService 'insight'
}

Wait-LamsApi 'Core' 'http://127.0.0.1:8080/api/v1/health' 'lams-core-service'
Wait-LamsApi 'Core database' 'http://127.0.0.1:8080/actuator/health'
Wait-LamsApi 'Insight' 'http://127.0.0.1:3000/api/v1/health' 'lams-insight-service'
Assert-LamsServiceRuntime $projectRoot 'core' 8080
Assert-LamsServiceRuntime $projectRoot 'insight' 3000
if ($Mode -eq 'Desktop') {
    if (-not $NoOpen) { & (Join-Path $PSScriptRoot 'start-desktop.ps1') -Release }
    Write-Host '[OK] Backend và bản LAMS Desktop sẵn sàng.' -ForegroundColor Green
} else {
    if (-not (Test-LamsTcpPort -Port 5173)) { Start-LocalService 'web' }
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest 'http://127.0.0.1:5173/' -TimeoutSec 3
            if ($response.StatusCode -eq 200 -and $response.Content -match '/src/main.tsx') { $ready = $true; break }
        } catch {}
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'Web chưa sẵn sàng sau 90 giây. Xem .tools/desktop-launch/web.err.log rồi chạy lại .\lams.ps1 Web.' }
    Assert-LamsServiceRuntime $projectRoot 'web' 5173
    if (-not $NoOpen) { Start-Process 'http://localhost:5173/' }
    Write-Host '[OK] LAMS Web: http://localhost:5173/' -ForegroundColor Green
}
} finally {
    if ($locked) { $startupLock.ReleaseMutex() }
    $startupLock.Dispose()
}
