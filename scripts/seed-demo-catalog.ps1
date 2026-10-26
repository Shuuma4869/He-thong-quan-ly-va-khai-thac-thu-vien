param([switch]$ConfirmDemoDatabase)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-LamsRoot
Import-LamsEnv (Join-Path $root '.env') -OverrideExisting
Test-LamsLocalConfiguration
if ($env:COMPOSE_PROJECT_NAME -ne 'lams' -or
    $env:CORE_DATABASE_URL -notmatch '^jdbc:postgresql://(localhost|127\.0\.0\.1):15432/lams_core(?:\?|$)') {
    throw 'Chỉ được seed database local/demo lams_core trên cổng 15432.'
}
if (-not $ConfirmDemoDatabase -and (Read-Host 'Sẽ thêm 32 tác phẩm và 64 bản demo vào lams_core. Gõ DEMO để tiếp tục') -cne 'DEMO') {
    throw 'Đã hủy, dữ liệu không thay đổi.'
}

Push-Location $root
try {
    $countSql = 'SELECT ''authors'',count(*) FROM authors UNION ALL SELECT ''categories'',count(*) FROM categories UNION ALL SELECT ''books'',count(*) FROM books UNION ALL SELECT ''editions'',count(*) FROM editions UNION ALL SELECT ''book_copies'',count(*) FROM book_copies UNION ALL SELECT ''branches'',count(*) FROM branches UNION ALL SELECT ''shelves'',count(*) FROM shelves ORDER BY 1;'
    Write-Host 'Số lượng trước khi seed:'
    & docker compose exec -T postgres psql -U $env:POSTGRES_USER -d lams_core -tA -c $countSql
    if ($LASTEXITCODE -ne 0) { throw 'Không đọc được database demo.' }

    $sqlPath = Join-Path $root '.tools\demo-catalog.sql'
    & node (Join-Path $root 'scripts\demo-catalog.mjs') | Set-Content -LiteralPath $sqlPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw 'Không tạo được SQL demo.' }
    try {
        Get-Content -LiteralPath $sqlPath -Raw -Encoding utf8 |
            & docker compose exec -T postgres psql -U $env:POSTGRES_USER -d lams_core -v ON_ERROR_STOP=1 -tA
        if ($LASTEXITCODE -ne 0) { throw 'Seed thất bại; transaction đã rollback. Kiểm tra dữ liệu cũ.' }
    } finally { Remove-Item -LiteralPath $sqlPath -ErrorAction SilentlyContinue }
    Write-Host 'Số lượng sau khi seed:'
    & docker compose exec -T postgres psql -U $env:POSTGRES_USER -d lams_core -tA -c $countSql
    if ($LASTEXITCODE -ne 0) { throw 'Seed xong nhưng không đọc được số lượng sau.' }
    Write-Host 'Ảnh bìa Standard Ebooks chưa được duyệt; không có ảnh nào được ghi tự động.'
} finally { Pop-Location }
