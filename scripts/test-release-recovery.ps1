param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-LamsRoot
$runId = [guid]::NewGuid().ToString('N')
$container = "lams-p8-recovery-$runId"
$logRoot = Join-Path $root ".tools\p8-recovery-$runId"
$saved = @{}
$processes = @()
$created = $false
$passed = $false
$started = [DateTime]::UtcNow

function Set-TemporaryEnv([string]$Name, [string]$Value) {
    if (-not $saved.ContainsKey($Name)) { $saved[$Name] = [Environment]::GetEnvironmentVariable($Name, 'Process') }
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
}

function Query-Db([string]$Database, [string]$Sql) {
    $value = & docker exec $container psql -U lams -d $Database -At -v ON_ERROR_STOP=1 -c $Sql
    if ($LASTEXITCODE -ne 0) { throw "Truy vấn database $Database thất bại." }
    return ($value | Out-String).Trim()
}

function Wait-Http([string]$Url, [int]$Seconds = 90) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch {}
        Start-Sleep -Seconds 1
    }
    throw "Dịch vụ thử nghiệm không sẵn sàng: $Url"
}

function Free-Port {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try { return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port }
    finally { $listener.Stop() }
}

function Start-Core([string]$Database, [int]$Port) {
    Set-TemporaryEnv CORE_DATABASE_URL "jdbc:postgresql://127.0.0.1:$dbPort/$Database"
    Set-TemporaryEnv CORE_PORT "$Port"
    $proc = Start-Process -FilePath (Get-Command java.exe).Source `
        -ArgumentList @('-jar', 'target/core-service-0.1.0-SNAPSHOT.jar') `
        -WorkingDirectory (Join-Path $root 'backend/core-service') -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logRoot "core-$Database.out.log") `
        -RedirectStandardError (Join-Path $logRoot "core-$Database.err.log")
    $script:processes += $proc
    Wait-Http "http://127.0.0.1:$Port/api/v1/health"
}

try {
    Invoke-LamsNative 'docker' @('info', '--format', '{{.OSType}}') 'Docker chưa chạy'
    $jar = Join-Path $root 'backend/core-service/target/core-service-0.1.0-SNAPSHOT.jar'
    $insightEntry = Join-Path $root 'backend/insight-service/dist/main.js'
    if (-not (Test-Path -LiteralPath $jar) -or -not (Test-Path -LiteralPath $insightEntry)) {
        throw 'Cần build Core và Insight trước khi diễn tập recovery.'
    }
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $password = [guid]::NewGuid().ToString('N')
    Set-TemporaryEnv POSTGRES_PASSWORD $password
    Set-TemporaryEnv CORE_DATABASE_USERNAME 'lams'
    Set-TemporaryEnv CORE_DATABASE_PASSWORD $password
    Set-TemporaryEnv LAMS_JWT_SECRET ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))
    Set-TemporaryEnv OUTBOX_ENABLED 'false'
    Set-TemporaryEnv CORS_ALLOWED_ORIGINS 'http://localhost:5173'
    Set-TemporaryEnv GOOGLE_BOOKS_ENABLED 'false'
    Invoke-LamsNative 'docker' @('run', '-d', '--name', $container, '--label', "lams.p8-recovery=$runId",
        '-e', 'POSTGRES_USER=lams', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=lams_core',
        '-p', '127.0.0.1::5432', 'postgres:17.11-alpine') 'Không tạo được PostgreSQL cô lập'
    $created = $true
    $binding = & docker port $container 5432/tcp
    if ($LASTEXITCODE -ne 0 -or $binding -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'PostgreSQL test không bind loopback.' }
    $dbPort = [int]$Matches[1]
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        & docker exec $container pg_isready -h 127.0.0.1 -U lams -d lams_core | Out-Null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) { throw 'PostgreSQL cô lập chưa sẵn sàng.' }
    Invoke-LamsNative 'docker' @('exec', $container, 'createdb', '-U', 'lams', 'lams_insight') 'Không tạo được database Insight nguồn'

    $sourcePort = Free-Port
    Start-Core 'lams_core' $sourcePort
    Set-TemporaryEnv INSIGHT_DATABASE_URL "postgresql://lams:$password@127.0.0.1:$dbPort/lams_insight"
    Push-Location (Join-Path $root 'backend/insight-service')
    try { Invoke-LamsNative 'npm.cmd' @('run', 'prisma:deploy') 'Prisma migrate deploy thất bại' }
    finally { Pop-Location }

    $email = "recovery-$runId@example.test"
    $userPassword = [guid]::NewGuid().ToString('N')
    $register = @{ fullName = 'Recovery fixture'; email = $email; password = $userPassword } | ConvertTo-Json -Compress
    $registered = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$sourcePort/api/v1/auth/register" `
        -ContentType 'application/json' -Body $register
    $actor = [guid]::Parse($registered.user.id).ToString()
    [void](Query-Db 'lams_core' "INSERT INTO user_roles(user_id,role_code) VALUES ('$actor','LIBRARIAN')")
    $book = [guid]::NewGuid().ToString()
    $edition = [guid]::NewGuid().ToString()
    $branch = [guid]::NewGuid().ToString()
    $shelf = [guid]::NewGuid().ToString()
    $copy = [guid]::NewGuid().ToString()
    $recommendation = [guid]::NewGuid().ToString()
    [void](Query-Db 'lams_core' "INSERT INTO books(id,title,normalized_title) VALUES ('$book','Recovery fixture book','recovery fixture book'); INSERT INTO editions(id,book_id) VALUES ('$edition','$book'); INSERT INTO branches(id,code,name) VALUES ('$branch','P8','Recovery branch'); INSERT INTO shelves(id,branch_id,code,label) VALUES ('$shelf','$branch','P8-S','Recovery shelf'); INSERT INTO book_copies(id,edition_id,barcode,shelf_id,status) VALUES ('$copy','$edition','P8-RECOVERY','$shelf','AVAILABLE')")
    [void](Query-Db 'lams_insight' "INSERT INTO acquisition_recommendations(id,book_id,branch_id,window_from,window_to,snapshot_at,source_contract_version,source_revision,score_version,score,confidence,evidence,created_by) VALUES ('$recommendation','$book','$branch','2026-10-01T00:00:00Z','2026-10-07T00:00:00Z','2026-10-08T00:00:00Z','v1','p8-recovery','acquisition-v1',25.0,0.85,'{}'::jsonb,'$actor')")

    $backupStart = [DateTime]::UtcNow
    Invoke-LamsNative 'docker' @('exec', $container, 'pg_dump', '-U', 'lams', '-d', 'lams_core', '-Fc', '--no-owner', '--no-acl', '-f', '/tmp/core.dump') 'Backup Core thất bại'
    Invoke-LamsNative 'docker' @('exec', $container, 'pg_dump', '-U', 'lams', '-d', 'lams_insight', '-Fc', '--no-owner', '--no-acl', '-f', '/tmp/insight.dump') 'Backup Insight thất bại'
    foreach ($name in @('core','insight')) {
        & docker exec $container pg_restore --list "/tmp/$name.dump" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Archive $name không đọc được." }
    }
    $backupSeconds = ([DateTime]::UtcNow - $backupStart).TotalSeconds
    $restoreStart = [DateTime]::UtcNow
    Invoke-LamsNative 'docker' @('exec', $container, 'createdb', '-U', 'lams', 'lams_core_restore') 'Không tạo được Core restore DB'
    Invoke-LamsNative 'docker' @('exec', $container, 'createdb', '-U', 'lams', 'lams_insight_restore') 'Không tạo được Insight restore DB'
    Invoke-LamsNative 'docker' @('exec', $container, 'pg_restore', '-U', 'lams', '-d', 'lams_core_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '/tmp/core.dump') 'Restore Core thất bại'
    Invoke-LamsNative 'docker' @('exec', $container, 'pg_restore', '-U', 'lams', '-d', 'lams_insight_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '/tmp/insight.dump') 'Restore Insight thất bại'

    $coreInvariant = "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM books), (SELECT count(*) FROM editions), (SELECT count(*) FROM book_copies), (SELECT count(*) FROM flyway_schema_history WHERE success)"
    $insightInvariant = "SELECT (SELECT count(*) FROM acquisition_recommendations), (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL)"
    $coreBefore = Query-Db 'lams_core' $coreInvariant
    $coreAfter = Query-Db 'lams_core_restore' $coreInvariant
    $insightBefore = Query-Db 'lams_insight' $insightInvariant
    $insightAfter = Query-Db 'lams_insight_restore' $insightInvariant
    if ($coreBefore -ne $coreAfter -or $insightBefore -ne $insightAfter) { throw 'Invariant trước/sau restore không khớp.' }
    if ((Query-Db 'lams_core_restore' "SELECT id FROM book_copies WHERE barcode='P8-RECOVERY'") -ne $copy) { throw 'Copy fixture không còn sau restore.' }
    if ((Query-Db 'lams_insight_restore' "SELECT id FROM acquisition_recommendations WHERE id='$recommendation'") -ne $recommendation) { throw 'Acquisition fixture không còn sau restore.' }

    $restoredCorePort = Free-Port
    Start-Core 'lams_core_restore' $restoredCorePort
    $login = @{ identifier = $email; password = $userPassword; remember = $false } | ConvertTo-Json -Compress
    $session = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$restoredCorePort/api/v1/auth/login" `
        -ContentType 'application/json' -Body $login
    if (-not $session.accessToken) { throw 'Auth login sau restore thất bại.' }
    $catalog = Invoke-RestMethod -Uri "http://127.0.0.1:$restoredCorePort/api/v1/public/catalog/books?query=Recovery&size=20"
    if ($catalog.page.totalElements -ne 1 -or $catalog.items[0].id -ne $book) { throw 'Catalog sau restore không khớp.' }
    $restoredCopy = Invoke-RestMethod -Uri "http://127.0.0.1:$restoredCorePort/api/v1/copies/by-barcode?barcode=P8-RECOVERY" `
        -Headers @{ Authorization = "Bearer $($session.accessToken)" }
    if ($restoredCopy.id -ne $copy -or $restoredCopy.status -ne 'AVAILABLE') { throw 'Inventory Copy sau restore không khớp.' }

    $restoredInsightPort = Free-Port
    Set-TemporaryEnv INSIGHT_DATABASE_URL "postgresql://lams:$password@127.0.0.1:$dbPort/lams_insight_restore"
    Set-TemporaryEnv CORE_API_URL "http://127.0.0.1:$restoredCorePort/api/v1"
    Set-TemporaryEnv INSIGHT_PORT "$restoredInsightPort"
    $insight = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @('dist/main.js') `
        -WorkingDirectory (Join-Path $root 'backend/insight-service') -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logRoot 'insight.out.log') `
        -RedirectStandardError (Join-Path $logRoot 'insight.err.log')
    $processes += $insight
    Wait-Http "http://127.0.0.1:$restoredInsightPort/api/v1/health"
    $records = Invoke-RestMethod -Uri "http://127.0.0.1:$restoredInsightPort/api/v1/acquisition/recommendations" `
        -Headers @{ Authorization = "Bearer $($session.accessToken)" }
    if ($records.page.totalElements -ne 1 -or $records.items[0].id -ne $recommendation) { throw 'Acquisition API sau restore không khớp.' }
    $csv = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$restoredInsightPort/api/v1/acquisition/recommendations.csv" `
        -Headers @{ Authorization = "Bearer $($session.accessToken)" }
    if ($csv.StatusCode -ne 200 -or $csv.Content -notmatch $recommendation) { throw 'CSV Acquisition sau restore không khớp.' }
    $restoreSeconds = ([DateTime]::UtcNow - $restoreStart).TotalSeconds
    Write-Host ("PASS: hai database backup {0:N1}s, restore và khởi động Core/Insight {1:N1}s." -f $backupSeconds,$restoreSeconds)
    Write-Host "Core users/books/editions/copies/Flyway=$coreAfter; Insight recommendations/Prisma=$insightAfter."
    Write-Host 'Auth login, Catalog, Inventory Copy, Acquisition list và CSV trên database restore đạt. Không có snapshot nguyên tử xuyên hai database.'
    $passed = $true
} finally {
    foreach ($proc in $processes) {
        if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    }
    if ($created) {
        $owner = & docker inspect --format '{{ index .Config.Labels "lams.p8-recovery" }}' $container 2>$null
        if ($LASTEXITCODE -eq 0 -and $owner -eq $runId) { & docker rm -f -v $container | Out-Null }
    }
    foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    if ($passed -and (Test-Path -LiteralPath $logRoot)) {
        $toolsRoot = [System.IO.Path]::GetFullPath((Join-Path $root '.tools'))
        $resolvedLog = [System.IO.Path]::GetFullPath($logRoot)
        if (-not $resolvedLog.StartsWith($toolsRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Đường dẫn log nằm ngoài thư mục thử nghiệm; không xóa.'
        }
        Remove-Item -LiteralPath $resolvedLog -Recurse -Force
    }
    # Khi lỗi, giữ log trong .tools bị ignore để điều tra; dump chỉ tồn tại trong container tạm.
}
