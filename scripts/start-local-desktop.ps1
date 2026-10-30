param([switch]$RebuildCore)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$projectRoot = Get-LamsRoot
$logs = Join-Path $projectRoot '.tools\desktop-launch'
New-Item -ItemType Directory -Path $logs -Force | Out-Null

function Wait-LamsApi([string]$Name, [string]$Url) {
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            if ((Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3).StatusCode -eq 200) {
                Write-Host "[OK] $Name sẵn sàng."
                return
            }
        } catch {}
        Start-Sleep -Seconds 2
    }
    throw "$Name không sẵn sàng sau 90 giây. Xem log trong $logs."
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

Wait-LamsApi 'Core' 'http://127.0.0.1:8080/api/v1/health'
Wait-LamsApi 'Insight' 'http://127.0.0.1:3000/api/v1/health'
& (Join-Path $PSScriptRoot 'start-desktop.ps1') -Release
Write-Host '[OK] LAMS Desktop đã mở.' -ForegroundColor Green
