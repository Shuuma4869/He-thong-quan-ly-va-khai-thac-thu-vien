param([int]$CorePort = 18081, [int]$FrontendPort = 15174)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$projectRoot = Get-LamsRoot
foreach ($port in @($CorePort, $FrontendPort)) {
    if (Test-LamsTcpPort -Port $port) { throw "Cổng kiểm thử $port đang được sử dụng." }
}
if ((& node --version) -notmatch '^v22\.') { throw 'Cần Node 22 theo version pin.' }
Invoke-LamsNative 'docker' @('info', '--format', '{{.OSType}}') 'Docker chưa sẵn sàng'
$runId = [guid]::NewGuid().ToString('N')
$container = "lams-phase1-e2e-$runId"
$logs = Join-Path $projectRoot "backend\core-service\target\e2e-runtime-$runId"
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$launched = @()
$created = $false
$savedEnvironment = @{}
$settings = @{
    POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N')
    CORE_DATABASE_USERNAME = 'lams'
    CORE_PORT = "$CorePort"
    LAMS_JWT_SECRET = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
    AUTH_COOKIE_SECURE = 'false'
    CORS_ALLOWED_ORIGINS = "http://127.0.0.1:$FrontendPort"
    VITE_CORE_API_URL = "http://127.0.0.1:$CorePort/api/v1"
    LAMS_E2E_CORE_URL = "http://127.0.0.1:$CorePort/api/v1"
    LAMS_E2E_FRONTEND_URL = "http://127.0.0.1:$FrontendPort"
    LAMS_E2E_CONTAINER = $container
    LAMS_E2E_OWNER = $runId
}
function Wait-TestHttp([string]$Url) {
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            if ((Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2).StatusCode -eq 200) { return }
        } catch {}
        Start-Sleep -Seconds 1
    }
    throw "Không khởi động được $Url. Xem log trong $logs."
}
try {
    foreach ($key in $settings.Keys) {
        $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    Invoke-LamsNative 'docker' @('run', '-d', '--name', $container, '--label', "lams.phase1-e2e=$runId",
        '-e', 'POSTGRES_USER=lams', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=lams_core',
        '-p', '127.0.0.1::5432', 'postgres:17.6-alpine') 'Không tạo được database kiểm thử'
    $created = $true
    $binding = & docker port $container 5432/tcp
    if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Port database không đúng loopback.' }
    $dbPort = $Matches[1]
    foreach ($key in @('CORE_DATABASE_URL', 'CORE_DATABASE_PASSWORD')) {
        $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    }
    $env:CORE_DATABASE_URL = "jdbc:postgresql://127.0.0.1:$dbPort/lams_core"
    $env:CORE_DATABASE_PASSWORD = $env:POSTGRES_PASSWORD
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & docker exec $container pg_isready -U lams -d lams_core | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Database kiểm thử chưa sẵn sàng.' }
    Push-Location (Join-Path $projectRoot 'backend\core-service')
    try { Invoke-LamsNative '.\mvnw.cmd' @('-DskipTests', 'package') 'Core package thất bại' }
    finally { Pop-Location }
    $launchCore = @{
        FilePath = (Get-Command java.exe).Source; ArgumentList = @('-jar', 'target/core-service-0.1.0-SNAPSHOT.jar')
        WorkingDirectory = (Join-Path $projectRoot 'backend\core-service')
        WindowStyle = 'Hidden'; PassThru = $true
        RedirectStandardOutput = (Join-Path $logs 'core.out.log')
        RedirectStandardError = (Join-Path $logs 'core.err.log')
    }
    $core = Start-Process @launchCore
    $launched += @{ pid = $core.Id; ticks = $core.StartTime.ToUniversalTime().Ticks }
    $launchFrontend = @{
        FilePath = (Get-Command node.exe).Source
        ArgumentList = @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', "$FrontendPort", '--strictPort')
        WorkingDirectory = (Join-Path $projectRoot 'frontend'); WindowStyle = 'Hidden'; PassThru = $true
        RedirectStandardOutput = (Join-Path $logs 'frontend.out.log')
        RedirectStandardError = (Join-Path $logs 'frontend.err.log')
    }
    $frontend = Start-Process @launchFrontend
    $launched += @{ pid = $frontend.Id; ticks = $frontend.StartTime.ToUniversalTime().Ticks }
    Wait-TestHttp "http://127.0.0.1:$CorePort/api/v1/health"
    Wait-TestHttp "http://127.0.0.1:$FrontendPort/"
    Push-Location (Join-Path $projectRoot 'frontend')
    try { Invoke-LamsNative 'npm' @('run', 'test:e2e') 'E2E Phase 1 thất bại' }
    finally { Pop-Location }
    Write-Output 'PHASE1_E2E_PASS'
} finally {
    foreach ($record in $launched) {
        $process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
        if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq $record.ticks) { Stop-Process -Id $record.pid -Force }
    }
    if ($created) {
        $label = & docker inspect --format '{{ index .Config.Labels "lams.phase1-e2e" }}' $container
        if ($LASTEXITCODE -eq 0 -and $label -eq $runId) {
            # Only this run's disposable database; never remove a project volume.
            & docker rm -f -v $container | Out-Null
            if ($LASTEXITCODE -ne 0) { Write-Warning "Cần dọn container kiểm thử $container." }
        }
    }
    foreach ($key in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process')
    }
}
