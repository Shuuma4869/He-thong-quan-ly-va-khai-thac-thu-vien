$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$projectRoot = Get-LamsRoot
Import-LamsEnv (Join-Path $projectRoot '.env')
$pgUser = Get-LamsSetting 'POSTGRES_USER' 'lams'
$minioPort = [int](Get-LamsSetting 'MINIO_API_PORT' '19000')

Push-Location $projectRoot
try {
    Invoke-LamsNative 'docker' @('compose', 'exec', '-T', 'postgres', 'psql', '-U', $pgUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT 1;') 'PostgreSQL SELECT 1 thất bại'
    $databases = & docker compose exec -T postgres psql -U $pgUser -d postgres -tA -c "SELECT datname FROM pg_database WHERE datname IN ('lams_core','lams_insight') ORDER BY datname;"
    if ($LASTEXITCODE -ne 0 -or ($databases -notcontains 'lams_core') -or ($databases -notcontains 'lams_insight')) {
        throw 'Không tìm thấy đủ database lams_core và lams_insight.'
    }
    Write-Host '[OK] PostgreSQL và hai database LAMS.' -ForegroundColor Green

    $redisKey = 'lams:smoke:temporary'
    $pingResult = (& docker compose exec -T redis redis-cli PING).Trim()
    if ($LASTEXITCODE -ne 0 -or $pingResult -ne 'PONG') { throw 'Redis PING thất bại.' }
    $setResult = (& docker compose exec -T redis redis-cli SET $redisKey ok).Trim()
    if ($LASTEXITCODE -ne 0 -or $setResult -ne 'OK') { throw 'Redis SET thất bại.' }
    $getResult = (& docker compose exec -T redis redis-cli GET $redisKey).Trim()
    if ($LASTEXITCODE -ne 0 -or $getResult -ne 'ok') { throw 'Redis GET thất bại.' }
    Invoke-LamsNative 'docker' @('compose', 'exec', '-T', 'redis', 'redis-cli', 'DEL', $redisKey) 'Redis DEL thất bại'
    Write-Host '[OK] Redis PING/SET/GET/DEL.' -ForegroundColor Green

    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $topic = "lams.smoke.internal.$suffix"
    $message = "lams-internal-$suffix"
    Invoke-LamsNative 'docker' @('compose', 'exec', '-T', 'kafka', '/opt/kafka/bin/kafka-topics.sh', '--bootstrap-server', 'kafka:29092', '--create', '--topic', $topic, '--partitions', '1', '--replication-factor', '1') 'Tạo Kafka topic internal thất bại'
    $message | & docker compose exec -T kafka /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server kafka:29092 --topic $topic
    if ($LASTEXITCODE -ne 0) { throw 'Kafka producer internal thất bại.' }
    $received = & docker compose exec -T kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka:29092 --topic $topic --from-beginning --max-messages 1 --timeout-ms 15000
    if ($LASTEXITCODE -ne 0 -or ($received -notcontains $message)) { throw 'Kafka consumer internal không nhận đúng message.' }
    & docker compose exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:29092 --delete --topic $topic | Out-Null
    Write-Host '[OK] Kafka internal kafka:29092 produce/consume.' -ForegroundColor Green

    Push-Location (Join-Path $projectRoot 'backend\insight-service')
    try { Invoke-LamsNative 'node' @('scripts/kafka-smoke.mjs') 'Kafka external host produce/consume thất bại' } finally { Pop-Location }

    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$minioPort/minio/health/live" -TimeoutSec 10
    if ($response.StatusCode -ne 200) { throw 'MinIO health không trả HTTP 200.' }
    Write-Host '[OK] MinIO health.' -ForegroundColor Green
} finally { Pop-Location }

Write-Host 'Smoke test hạ tầng hoàn tất.' -ForegroundColor Green
