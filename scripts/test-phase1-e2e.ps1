param([int]$CorePort = 18081, [int]$FrontendPort = 15174, [int]$InsightPort = 13001, [switch]$Desktop, [int]$DebugPort = 19222, [string]$DesktopExecutable, [string]$MavenExecutable, [string]$CoreServiceDirectory, [string]$Grep, [switch]$UseExistingPrismaClient, [switch]$EnableKafkaNotifications)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$projectRoot = Get-LamsRoot
$coreService = if ($CoreServiceDirectory) { (Resolve-Path -LiteralPath $CoreServiceDirectory).Path }
    else { Join-Path $projectRoot 'backend\core-service' }
if (-not (Test-Path -LiteralPath (Join-Path $coreService 'pom.xml'))) { throw 'Thư mục Core Service không hợp lệ.' }
$maven = if ($MavenExecutable) { (Resolve-Path -LiteralPath $MavenExecutable).Path }
    else { Join-Path $coreService 'mvnw.cmd' }
if ($Desktop) { $CorePort = 8080; $InsightPort = 3000 }
$ports = if ($Desktop) { @($CorePort, $InsightPort, $DebugPort) } else { @($CorePort, $InsightPort, $FrontendPort) }
foreach ($port in $ports) {
    if (Test-LamsTcpPort -Port $port) { throw "Cổng kiểm thử $port đang được sử dụng." }
}
if ((& node --version) -notmatch '^v22\.') { throw 'Cần Node 22 theo version pin.' }
Invoke-LamsNative 'docker' @('info', '--format', '{{.OSType}}') 'Docker chưa sẵn sàng'
$runId = [guid]::NewGuid().ToString('N')
$container = "lams-phase1-e2e-$runId"
$kafkaContainer = "lams-phase1-e2e-kafka-$runId"
$logs = Join-Path $projectRoot "backend\core-service\target\e2e-runtime-$runId"
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$launched = @()
$created = $false
$kafkaCreated = $false
$savedEnvironment = @{}
$settings = @{
    POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N')
    CORE_DATABASE_USERNAME = 'lams'
    CORE_PORT = "$CorePort"
    LAMS_JWT_SECRET = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
    AUTH_COOKIE_SECURE = 'false'
    CORS_ALLOWED_ORIGINS = "http://127.0.0.1:$FrontendPort"
    VITE_CORE_API_URL = "http://127.0.0.1:$CorePort/api/v1"
    CORE_API_URL = "http://127.0.0.1:$CorePort/api/v1"
    INSIGHT_PORT = "$InsightPort"
    FRONTEND_ORIGIN = "http://127.0.0.1:$FrontendPort"
    VITE_INSIGHT_API_URL = "http://127.0.0.1:$InsightPort/api/v1"
    LAMS_E2E_INSIGHT_URL = "http://127.0.0.1:$InsightPort/api/v1"
    GOOGLE_BOOKS_ENABLED = 'false'
    GOOGLE_BOOKS_API_KEY = ''
    LAMS_E2E_CORE_URL = "http://127.0.0.1:$CorePort/api/v1"
    LAMS_E2E_FRONTEND_URL = "http://127.0.0.1:$FrontendPort"
    LAMS_E2E_CONTAINER = $container
    LAMS_E2E_OWNER = $runId
    LAMS_E2E_DESKTOP_CDP = ''
}
if ($Desktop) {
    $desktopExe = if ($DesktopExecutable) { (Resolve-Path -LiteralPath $DesktopExecutable).Path }
        else { Join-Path $projectRoot 'frontend\src-tauri\target\release\lams-desktop.exe' }
    if (-not (Test-Path -LiteralPath $desktopExe)) { throw 'Chạy scripts/build-desktop.ps1 trước khi kiểm thử desktop.' }
    $settings.CORS_ALLOWED_ORIGINS = 'http://tauri.localhost'
    $settings.FRONTEND_ORIGIN = 'http://tauri.localhost'
    $settings.LAMS_E2E_FRONTEND_URL = 'http://tauri.localhost'
    $settings.LAMS_E2E_DESKTOP_CDP = "http://127.0.0.1:$DebugPort"
    # Test-only debug port and isolated WebView profile; never applied by the app launcher.
    $settings.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$DebugPort"
    $settings.WEBVIEW2_USER_DATA_FOLDER = (Join-Path $logs 'webview-profile')
}
if ($EnableKafkaNotifications) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $kafkaPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()
    $settings.KAFKA_BOOTSTRAP_SERVERS = "localhost:$kafkaPort"
    $settings.OUTBOX_ENABLED = 'true'
    $settings.OUTBOX_JOB_ENABLED = 'true'
    $settings.NOTIFICATIONS_ENABLED = 'true'
    $settings.NOTIFICATIONS_GROUP_ID = "lams-phase1-e2e-$runId"
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
        '-p', '127.0.0.1::5432', 'postgres:17.11-alpine') 'Không tạo được database kiểm thử'
    $created = $true
    $binding = & docker port $container 5432/tcp
    if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Port database không đúng loopback.' }
    $dbPort = $Matches[1]
    foreach ($key in @('CORE_DATABASE_URL', 'CORE_DATABASE_PASSWORD', 'INSIGHT_DATABASE_URL')) {
        $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    }
    $env:CORE_DATABASE_URL = "jdbc:postgresql://127.0.0.1:$dbPort/lams_core"
    $env:CORE_DATABASE_PASSWORD = $env:POSTGRES_PASSWORD
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        # The temporary initdb server accepts Unix sockets before the final TCP server starts.
        & docker exec $container pg_isready -h 127.0.0.1 -U lams -d lams_core | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Database kiểm thử chưa sẵn sàng.' }
    if ($EnableKafkaNotifications) {
        Invoke-LamsNative 'docker' @('run', '-d', '--name', $kafkaContainer, '--label', "lams.phase1-e2e=$runId",
            '-p', "127.0.0.1:${kafkaPort}:19092", '-e', 'KAFKA_NODE_ID=1', '-e', 'KAFKA_PROCESS_ROLES=broker,controller',
            '-e', 'KAFKA_LISTENERS=INTERNAL://:29092,EXTERNAL://:19092,CONTROLLER://:29093',
            '-e', "KAFKA_ADVERTISED_LISTENERS=INTERNAL://localhost:29092,EXTERNAL://localhost:$kafkaPort",
            '-e', 'KAFKA_INTER_BROKER_LISTENER_NAME=INTERNAL', '-e', 'KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER',
            '-e', 'KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT',
            '-e', 'KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:29093', '-e', 'KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1',
            '-e', 'KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1', '-e', 'KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1',
            '-e', 'KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0', '-e', 'CLUSTER_ID=MkU3OEVBNTcwNTJENDM2Qk',
            'apache/kafka:4.1.2') 'Không tạo được Kafka kiểm thử'
        $kafkaCreated = $true
        $brokerReady = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            & docker exec $kafkaContainer /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:29092 --list 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) { $brokerReady = $true; break }
            Start-Sleep -Seconds 1
        }
        if (-not $brokerReady) { throw 'Kafka kiểm thử chưa sẵn sàng.' }
        foreach ($topic in @('lams.circulation.events.v1', 'lams.hold.events.v1')) {
            Invoke-LamsNative 'docker' @('exec', $kafkaContainer, '/opt/kafka/bin/kafka-topics.sh',
                '--bootstrap-server', 'localhost:29092', '--create', '--if-not-exists', '--topic', $topic,
                '--partitions', '1', '--replication-factor', '1') "Không tạo được topic $topic"
        }
    }
    Invoke-LamsNative 'docker' @('exec', $container, 'createdb', '-U', 'lams', 'lams_insight_test') 'Không tạo được database Insight tạm'
    $env:INSIGHT_DATABASE_URL = "postgresql://lams:$($env:POSTGRES_PASSWORD)@127.0.0.1:$dbPort/lams_insight_test"
    Push-Location $coreService
    try { Invoke-LamsNative $maven @('-DskipTests', 'package') 'Core package thất bại' }
    finally { Pop-Location }
    $launchCore = @{
        FilePath = (Get-Command java.exe).Source
        ArgumentList = @('-jar', (Join-Path $coreService 'target\core-service-0.1.0-SNAPSHOT.jar'))
        WorkingDirectory = $coreService
        WindowStyle = 'Hidden'; PassThru = $true
        RedirectStandardOutput = (Join-Path $logs 'core.out.log')
        RedirectStandardError = (Join-Path $logs 'core.err.log')
    }
    $core = Start-Process @launchCore
    $launched += @{ pid = $core.Id; ticks = $core.StartTime.ToUniversalTime().Ticks }
    Wait-TestHttp "http://127.0.0.1:$CorePort/api/v1/health"
    $core.Refresh()
    if ($core.HasExited) { throw "Core E2E đã thoát; xem $logs\core.err.log. Cổng có thể đã bị tiến trình khác chiếm." }
    Push-Location (Join-Path $projectRoot 'backend\insight-service')
    try {
        if ($UseExistingPrismaClient) {
            if (-not (Test-Path -LiteralPath 'node_modules\.prisma\client\query_engine-windows.dll.node')) {
                throw 'Chưa có Prisma client local để kiểm thử.'
            }
        } else {
            Invoke-LamsNative 'npm.cmd' @('run', 'prisma:generate') 'Prisma generate thất bại'
        }
        Invoke-LamsNative 'npm.cmd' @('run', 'prisma:deploy') 'Insight migration test thất bại'
        Invoke-LamsNative 'npm.cmd' @('run', 'build') 'Insight build thất bại'
    }
    finally { Pop-Location }
    $launchInsight = @{
        FilePath = (Get-Command node.exe).Source; ArgumentList = @('dist/main.js')
        WorkingDirectory = (Join-Path $projectRoot 'backend\insight-service')
        WindowStyle = 'Hidden'; PassThru = $true
        RedirectStandardOutput = (Join-Path $logs 'insight.out.log')
        RedirectStandardError = (Join-Path $logs 'insight.err.log')
    }
    $insight = Start-Process @launchInsight
    $launched += @{ pid = $insight.Id; ticks = $insight.StartTime.ToUniversalTime().Ticks }
    Wait-TestHttp "http://127.0.0.1:$InsightPort/api/v1/health"
    if ($EnableKafkaNotifications) {
        $consumerReady = $false
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            try {
                $health = Invoke-RestMethod -Uri "http://127.0.0.1:$InsightPort/api/v1/health" -TimeoutSec 2
                if ($health.notifications.enabled -and $health.notifications.connected) { $consumerReady = $true; break }
            } catch {}
            Start-Sleep -Seconds 1
        }
        if (-not $consumerReady) { throw 'Insight notifications consumer chưa kết nối Kafka.' }
    }
    $insight.Refresh()
    if ($insight.HasExited) { throw "Insight E2E đã thoát; xem $logs\insight.err.log. Cổng có thể đã bị tiến trình khác chiếm." }
    if ($Desktop) {
        $desktopProcess = Start-Process -FilePath $desktopExe -WorkingDirectory (Split-Path $desktopExe) -WindowStyle Normal -PassThru
        $launched += @{ pid = $desktopProcess.Id; ticks = $desktopProcess.StartTime.ToUniversalTime().Ticks }
        Wait-TestHttp "http://127.0.0.1:$DebugPort/json/version"
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            $desktopProcess.Refresh()
            if ($desktopProcess.MainWindowHandle -ne 0) { break }
            if ($desktopProcess.HasExited) { throw 'Ứng dụng desktop đã thoát khi khởi động.' }
            Start-Sleep -Seconds 1
        }
        if ($desktopProcess.MainWindowHandle -eq 0) { throw 'Không tìm thấy cửa sổ desktop LAMS.' }
        Write-Output "LAMS native process: $($desktopProcess.Id); window handle: $($desktopProcess.MainWindowHandle)"
    } else {
    $launchFrontend = @{
        FilePath = (Get-Command node.exe).Source
        ArgumentList = @('node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', "$FrontendPort", '--strictPort')
        WorkingDirectory = (Join-Path $projectRoot 'frontend'); WindowStyle = 'Hidden'; PassThru = $true
        RedirectStandardOutput = (Join-Path $logs 'frontend.out.log')
        RedirectStandardError = (Join-Path $logs 'frontend.err.log')
    }
    $frontend = Start-Process @launchFrontend
    $launched += @{ pid = $frontend.Id; ticks = $frontend.StartTime.ToUniversalTime().Ticks }
    Wait-TestHttp "http://127.0.0.1:$FrontendPort/"
    $frontend.Refresh()
    if ($frontend.HasExited) { throw "Frontend E2E đã thoát; xem $logs\frontend.err.log. Cổng có thể đã bị tiến trình khác chiếm." }
    }
    Push-Location (Join-Path $projectRoot 'frontend')
    try {
        $arguments = @('run', 'test:e2e')
        if ($Grep) { $arguments += @('--', '--grep', $Grep) }
        Invoke-LamsNative 'npm' $arguments 'E2E Auth/Member/Catalog thất bại'
    }
    finally { Pop-Location }
    if ($Desktop) { Write-Output 'DESKTOP_E2E_PASS' } else { Write-Output 'WEB_E2E_PASS' }
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
        if ($kafkaCreated) {
            $label = & docker inspect --format '{{ index .Config.Labels "lams.phase1-e2e" }}' $kafkaContainer
            if ($LASTEXITCODE -eq 0 -and $label -eq $runId) {
                & docker rm -f -v $kafkaContainer | Out-Null
                if ($LASTEXITCODE -ne 0) { Write-Warning "Cần dọn Kafka kiểm thử $kafkaContainer." }
            }
        }
    }
    foreach ($key in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process')
    }
}
