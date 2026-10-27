param(
    [switch]$ConfirmDemoDatabase,
    [ValidateRange(1, 1000)][int]$BatchSize = 500
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-LamsRoot
Import-LamsEnv (Join-Path $root '.env') -OverrideExisting
Test-LamsLocalConfiguration
if ($env:COMPOSE_PROJECT_NAME -ne 'lams' -or
    $env:CORE_DATABASE_URL -notmatch '^jdbc:postgresql://(localhost|127\.0\.0\.1):15432/lams_core(?:\?|$)') {
    throw 'Chỉ được import vào database demo local lams_core trên cổng 15432.'
}
if (-not $ConfirmDemoDatabase -and
    (Read-Host 'Sẽ bổ sung Book thật từ catalog Project Gutenberg vào lams_core. Gõ CATALOG để tiếp tục') -cne 'CATALOG') {
    throw 'Đã hủy, dữ liệu không thay đổi.'
}

$snapshot = Join-Path $root 'data\catalog\project-gutenberg-novels-10000.jsonl.gz'
$manifestPath = Join-Path $root 'data\catalog\project-gutenberg-novels-10000.manifest.json'
if (-not (Test-Path -LiteralPath $snapshot) -or -not (Test-Path -LiteralPath $manifestPath)) {
    throw 'Thiếu snapshot hoặc manifest catalog trong repository.'
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
$node = Join-Path $root '.tools\node-v22.23.3-win-x64\node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = 'node' }

Push-Location $root
try {
    $schema = & docker compose exec -T postgres psql -U $env:POSTGRES_USER -d lams_core -tA -c "SELECT to_regclass('public.catalog_external_sources');"
    if ($LASTEXITCODE -ne 0 -or $schema.Trim() -ne 'catalog_external_sources') {
        throw 'Core chưa áp dụng migration V25. Khởi động Core trước khi import.'
    }
    $batchCount = [math]::Ceiling($manifest.stats.selected / $BatchSize)
    for ($index = 0; $index -lt $batchCount; $index++) {
        $lines = & $node (Join-Path $root 'scripts\gutenberg-import-batch.mjs') $snapshot $manifestPath $index $BatchSize
        if ($LASTEXITCODE -ne 0) { throw "Không tạo được SQL batch $($index + 1)." }
        Write-Host "Import batch $($index + 1)/$batchCount..."
        ($lines -join "`n") + "`n" | & docker compose exec -T postgres psql -U $env:POSTGRES_USER -d lams_core -v ON_ERROR_STOP=1 -tA
        if ($LASTEXITCODE -ne 0) { throw "Batch $($index + 1) thất bại; batch trước vẫn giữ nguyên, có thể chạy lại." }
    }
    $sql = "SELECT 'books',count(*) FROM books UNION ALL SELECT 'editions',count(*) FROM editions UNION ALL SELECT 'copies',count(*) FROM book_copies UNION ALL SELECT 'authors',count(*) FROM authors UNION ALL SELECT 'categories',count(*) FROM categories UNION ALL SELECT 'publishers',count(*) FROM publishers UNION ALL SELECT 'gutenberg_links',count(*) FROM catalog_external_sources WHERE source_code='PROJECT_GUTENBERG' UNION ALL SELECT 'database_bytes',pg_database_size(current_database()) ORDER BY 1;"
    & docker compose exec -T postgres psql -U $env:POSTGRES_USER -d lams_core -tA -c $sql
    if ($LASTEXITCODE -ne 0) { throw 'Import xong nhưng không đọc được thống kê cuối.' }
} finally { Pop-Location }
