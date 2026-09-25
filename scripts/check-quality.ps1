$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot

Push-Location "$projectRoot/backend/core-service"
try {
    & .\mvnw.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Spring test thất bại.' }
} finally { Pop-Location }

Push-Location "$projectRoot/backend/insight-service"
try {
    & npm test
    if ($LASTEXITCODE -ne 0) { throw 'Nest test thất bại.' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Nest build thất bại.' }
} finally { Pop-Location }

Push-Location "$projectRoot/frontend"
try {
    & npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Frontend typecheck thất bại.' }
    & npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Frontend lint thất bại.' }
    & npm run test
    if ($LASTEXITCODE -ne 0) { throw 'Frontend test thất bại.' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build thất bại.' }
} finally { Pop-Location }

Push-Location $projectRoot
try {
    & docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose config không hợp lệ.' }
} finally { Pop-Location }

Write-Host 'Kiểm tra chất lượng starter đã hoàn tất.'
