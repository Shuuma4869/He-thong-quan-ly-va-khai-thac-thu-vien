$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$problems = 0

function Write-Ok([string]$Message) { Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-WarningMessage([string]$Message) { Write-Host "[CẢNH BÁO] $Message" -ForegroundColor Yellow }
function Write-Problem([string]$Message) { Write-Host "[LỖI] $Message" -ForegroundColor Red; $script:problems++ }

if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Ok ((& git --version) -join ' ')
} else { Write-Problem 'Không tìm thấy Git.' }

if (Get-Command java -ErrorAction SilentlyContinue) {
    $javaText = (& java -version 2>&1) -join ' '
    if ($javaText -match 'version "21(\.|\")') { Write-Ok 'Java 21' }
    else { Write-Problem "Java hiện tại không phải 21: $javaText" }
} else { Write-Problem 'Không tìm thấy Java 21.' }

if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = (& node --version).Trim()
    if ($nodeVersion -match '^v22\.') { Write-Ok "Node $nodeVersion" }
    else { Write-Problem "Node hiện tại là $nodeVersion; dự án yêu cầu Node 22.x." }
} else { Write-Problem 'Không tìm thấy Node 22.x.' }

if (Get-Command npm -ErrorAction SilentlyContinue) {
    $npmVersion = (& npm --version).Trim()
    if ($npmVersion -match '^10\.') { Write-Ok "npm $npmVersion" }
    else { Write-Problem "npm hiện tại là $npmVersion; dự án yêu cầu npm 10.x." }
} else { Write-Problem 'Không tìm thấy npm 10.x.' }

if (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerVersion = (& docker --version 2>&1) -join ' '
    if ($LASTEXITCODE -eq 0) { Write-Ok $dockerVersion } else { Write-Problem 'Docker CLI không hoạt động.' }

    $daemonVersion = (& docker info --format '{{.ServerVersion}}' 2>&1) -join ' '
    if ($LASTEXITCODE -eq 0) { Write-Ok "Docker daemon $daemonVersion" }
    else { Write-Problem "Docker daemon chưa sẵn sàng: $daemonVersion" }

    $composeVersion = (& docker compose version --short 2>&1) -join ' '
    if ($LASTEXITCODE -eq 0) { Write-Ok "Docker Compose $composeVersion" }
    else { Write-Problem 'Không tìm thấy Docker Compose plugin.' }
} else { Write-Problem 'Không tìm thấy Docker.' }

$envPath = Join-Path (Get-LamsRoot) '.env'
if (Test-Path -LiteralPath $envPath) { Write-Ok 'Đã có file .env local.' }
else { Write-WarningMessage 'Chưa có .env; bootstrap sẽ copy từ .env.example và không ghi đè file có sẵn.' }

$ports = @(
    @{ Name = 'PostgreSQL'; Value = [int](Get-LamsSetting 'POSTGRES_PORT' '15432') },
    @{ Name = 'Redis'; Value = [int](Get-LamsSetting 'REDIS_PORT' '16379') },
    @{ Name = 'Kafka'; Value = [int](Get-LamsSetting 'KAFKA_PORT' '19092') },
    @{ Name = 'MinIO API'; Value = [int](Get-LamsSetting 'MINIO_API_PORT' '19000') },
    @{ Name = 'MinIO Console'; Value = [int](Get-LamsSetting 'MINIO_CONSOLE_PORT' '19001') }
)

foreach ($item in $ports) {
    if (Test-LamsTcpPort -Port $item.Value) { Write-WarningMessage "$($item.Name): cổng $($item.Value) đang được sử dụng." }
    else { Write-Ok "$($item.Name): cổng $($item.Value) đang trống." }
}

if ($problems -gt 0) {
    Write-Host "Doctor phát hiện $problems prerequisite bắt buộc chưa đạt." -ForegroundColor Red
    exit 1
}

Write-Host 'Môi trường đạt prerequisite bắt buộc của LAMS.' -ForegroundColor Green
