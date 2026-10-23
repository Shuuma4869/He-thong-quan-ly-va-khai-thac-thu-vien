param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$projectRoot = Get-LamsRoot
$runId = [guid]::NewGuid().ToString('N')
$network = "lams-pilot-test-$runId"
$database = "lams-pilot-db-$runId"
$core = "lams-pilot-core-$runId"
$image = 'lams-core-pilot-check'
$ownedContainers = @()
$networkCreated = $false
$saved = @{}
$settings = @{
    POSTGRES_PASSWORD = [guid]::NewGuid().ToString('N')
    CORE_DATABASE_PASSWORD = ''
    LAMS_JWT_SECRET = ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
}
$settings.CORE_DATABASE_PASSWORD = $settings.POSTGRES_PASSWORD
try {
    foreach ($key in $settings.Keys) {
        $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $settings[$key], 'Process')
    }
    Invoke-LamsNative 'docker' @('info', '--format', '{{.OSType}}') 'Docker chưa sẵn sàng'
    if (-not $SkipBuild) {
        Invoke-LamsNative 'docker' @('build', '-t', $image, (Join-Path $projectRoot 'backend/core-service')) 'Build Core thất bại'
    }
    Invoke-LamsNative 'docker' @('network', 'create', '--label', "lams.pilot-test=$runId", $network) 'Không tạo được mạng test'
    $networkCreated = $true
    Invoke-LamsNative 'docker' @('run', '-d', '--name', $database, '--network', $network,
        '--label', "lams.pilot-test=$runId", '-e', 'POSTGRES_USER=lams', '-e', 'POSTGRES_PASSWORD',
        '-e', 'POSTGRES_DB=lams_core', 'postgres:17.6-alpine') 'Không tạo được database test'
    $ownedContainers += $database
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        & docker exec $database pg_isready -h 127.0.0.1 -U lams -d lams_core | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Database test chưa sẵn sàng.' }
    # HTTP and internal PostgreSQL are confined to this temporary local network, not cloud TLS tests.
    Invoke-LamsNative 'docker' @('run', '-d', '--name', $core, '--network', $network,
        '--label', "lams.pilot-test=$runId", '--memory', '512m', '-p', '127.0.0.1::8080',
        '-e', 'SPRING_PROFILES_ACTIVE=pilot', '-e', 'PORT=8080',
        '-e', "CORE_DATABASE_URL=jdbc:postgresql://${database}:5432/lams_core",
        '-e', 'CORE_DATABASE_USERNAME=lams', '-e', 'CORE_DATABASE_PASSWORD', '-e', 'LAMS_JWT_SECRET',
        '-e', 'CORS_ALLOWED_ORIGINS=https://tauri.localhost',
        '-e', 'JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=60 -XX:InitialRAMPercentage=20 -XX:ActiveProcessorCount=2',
        $image) 'Không tạo được Core test'
    $ownedContainers += $core
    $binding = & docker port $core 8080/tcp
    if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Core test không bind loopback.' }
    $base = "http://127.0.0.1:$($Matches[1])"
    $ready = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        try {
            $health = Invoke-RestMethod "$base/actuator/health/readiness" -TimeoutSec 2
            if ($health.status -eq 'UP') { $ready = $true; break }
        } catch {}
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'Core readiness không UP trong giới hạn; kiểm môi trường và memory.' }
    $structuredLog = $false
    $lines = & docker logs $core 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Không đọc được log Core test.' }
    foreach ($line in $lines) {
        if ($line.StartsWith('{')) {
            try {
                $entry = $line | ConvertFrom-Json
                if (($entry.PSObject.Properties.Name -contains 'ecs') -and $entry.ecs.version) { $structuredLog = $true }
            } catch {}
        }
    }
    if (-not $structuredLog) { throw 'Core pilot chưa xuất log JSON ECS.' }
    $uid = & docker exec $core id -u
    if ($LASTEXITCODE -ne 0 -or "$uid" -ne '10001') { throw 'Core phải chạy bằng UID 10001.' }
    $body = @{fullName='Pilot container check';email="$runId@example.test";password=[guid]::NewGuid().ToString('N')} | ConvertTo-Json
    $response = Invoke-WebRequest -UseBasicParsing "$base/api/v1/auth/register" -Method Post -ContentType 'application/json' -Body $body `
        -Headers @{Origin='https://tauri.localhost';'X-LAMS-Client'='1'}
    $cookie = ($response.Headers['Set-Cookie'] -join ';')
    if ($response.StatusCode -ne 201 -or $cookie -notmatch 'Secure' -or $cookie -notmatch 'SameSite=None' -or $cookie -notmatch 'HttpOnly') {
        throw 'Cookie pilot không đúng policy.'
    }
    # Restore only into a new database in this run's disposable PostgreSQL container.
    Invoke-LamsNative 'docker' @('exec', $database, 'pg_dump', '-U', 'lams', '-d', 'lams_core', '-Fc', '--no-owner', '--no-acl', '-f', '/tmp/core.dump') 'Backup test thất bại'
    Invoke-LamsNative 'docker' @('exec', $database, 'createdb', '-U', 'lams', 'lams_restore_check') 'Không tạo được database restore mới'
    Invoke-LamsNative 'docker' @('exec', $database, 'pg_restore', '-U', 'lams', '-d', 'lams_restore_check', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '/tmp/core.dump') 'Restore test thất bại'
    $query = 'select count(*) from users;'
    $before = & docker exec $database psql -U lams -d lams_core -At -v ON_ERROR_STOP=1 -c $query
    if ($LASTEXITCODE -ne 0) { throw 'Không đọc được database nguồn.' }
    $after = & docker exec $database psql -U lams -d lams_restore_check -At -v ON_ERROR_STOP=1 -c $query
    if ($LASTEXITCODE -ne 0 -or "$before" -ne '1' -or "$before" -ne "$after") { throw 'Dữ liệu restore không khớp.' }
    Write-Host 'PASS: Core pilot readiness, JSON ECS, UID 10001, cookie policy và backup/restore PostgreSQL local trong giới hạn RAM 512 MiB.'
    Write-Host 'Chưa kiểm TLS Neon/Render, CPU cloud hoặc cookie HTTPS thực tế trong WebView2.'
} finally {
    foreach ($name in $ownedContainers) {
        $owner = & docker inspect --format '{{ index .Config.Labels "lams.pilot-test" }}' $name 2>$null
        if ($LASTEXITCODE -eq 0 -and $owner -eq $runId) { & docker rm -f $name | Out-Null }
    }
    if ($networkCreated) {
        $owner = & docker network inspect --format '{{ index .Labels "lams.pilot-test" }}' $network 2>$null
        if ($LASTEXITCODE -eq 0 -and $owner -eq $runId) { & docker network rm $network | Out-Null }
    }
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
}
