param([switch]$RebuildCore)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'desktop-readiness.ps1')
. (Join-Path $PSScriptRoot 'core-build-state.ps1')
. (Join-Path $PSScriptRoot 'service-runtime.ps1')

$projectRoot = Get-LamsRoot
Invoke-LamsNative 'node' @((Join-Path $projectRoot 'frontend\scripts\release-manifest.mjs')) 'Cần build bản desktop khớp source trước khi khởi động dịch vụ'
$logs = Join-Path $projectRoot '.tools\desktop-launch'
New-Item -ItemType Directory -Path $logs -Force | Out-Null

$lockId = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))
$startupLock = [Threading.Mutex]::new($false, "Local\LamsStartup-$lockId")
$locked = $false
try {
    try { $locked = $startupLock.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Một lượt khởi động LAMS đang chạy. Chờ lượt đó hoàn tất rồi thử lại.' }
foreach ($service in @(@{ name = 'core'; port = 8080 }, @{ name = 'insight'; port = 3000 })) {
    if (Test-LamsTcpPort -Port $service.port) { Assert-LamsServiceRuntime $projectRoot $service.name $service.port }
}
if (-not $RebuildCore -and -not (Test-LamsTcpPort -Port 8080)) {
    $coreRoot = Join-Path $projectRoot 'backend\core-service'
    $jar = Get-ChildItem -LiteralPath (Join-Path $coreRoot 'target') -Filter 'core-service-*.jar' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike '*.original' } | Select-Object -First 1
    if (-not $jar -or -not (Test-LamsCoreBuild $coreRoot $jar.FullName)) {
        throw 'JAR Core chưa khớp source. Chạy scripts/start-local-desktop.ps1 -RebuildCore một lần để build lại.'
    }
}
Invoke-LamsNative 'docker' @('info', '--format', '{{.ServerVersion}}') 'Docker Engine chưa sẵn sàng'
Push-Location $projectRoot
try {
    Invoke-LamsNative 'docker' @('compose', 'up', '-d', '--wait', 'postgres', 'redis', 'kafka') 'Không thể khởi động hạ tầng LAMS'
} finally { Pop-Location }

$pwsh = (Get-Command pwsh.exe).Source
if (-not (Test-LamsTcpPort -Port 8080)) {
    $coreArgs = @('-NoProfile', '-File', (Join-Path $PSScriptRoot 'start-core.ps1'))
    if (-not $RebuildCore) { $coreArgs += '-UseExistingBuild' }
    Start-Process -FilePath $pwsh -ArgumentList $coreArgs -WorkingDirectory $projectRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'core.out.log') -RedirectStandardError (Join-Path $logs 'core.err.log') | Out-Null
}
if (-not (Test-LamsTcpPort -Port 3000)) {
    Start-Process -FilePath $pwsh -ArgumentList @('-NoProfile', '-File', (Join-Path $PSScriptRoot 'start-insight.ps1')) `
        -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'insight.out.log') `
        -RedirectStandardError (Join-Path $logs 'insight.err.log') | Out-Null
}

Wait-LamsApi 'Core' 'http://127.0.0.1:8080/api/v1/health' 'lams-core-service'
Wait-LamsApi 'Core database' 'http://127.0.0.1:8080/actuator/health'
Wait-LamsApi 'Insight' 'http://127.0.0.1:3000/api/v1/health' 'lams-insight-service'
Assert-LamsServiceRuntime $projectRoot 'core' 8080
Assert-LamsServiceRuntime $projectRoot 'insight' 3000
& (Join-Path $PSScriptRoot 'start-desktop.ps1') -Release
Write-Host '[OK] LAMS Desktop đã mở.' -ForegroundColor Green
} finally {
    if ($locked) { $startupLock.ReleaseMutex() }
    $startupLock.Dispose()
}
