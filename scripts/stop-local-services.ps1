#Requires -Version 7.0
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
. (Join-Path $PSScriptRoot 'service-runtime.ps1')
$projectRoot = Get-LamsRoot
$lockId = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))
$startupLock = [Threading.Mutex]::new($false, "Local\LamsStartup-$lockId")
$locked = $false
try {
    try { $locked = $startupLock.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Một lượt khởi động/dừng LAMS đang chạy. Chờ hoàn tất rồi thử lại.' }
    foreach ($service in @('web', 'insight', 'core')) {
        $path = Join-Path $projectRoot ".tools\desktop-launch\$service-runtime.json"
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if ($record.schema -ne 1 -or $record.service -ne $service -or $record.root -ne [IO.Path]::GetFullPath($projectRoot)) {
            throw "Không dừng $service vì bản ghi tiến trình không thuộc checkout này."
        }
        $processes = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate)
        # Dừng từ con đến cha; source có thể đã đổi nhưng PID và thời điểm tạo phải còn đúng.
        $owned = @($processes | Where-Object { Test-LamsRuntimeChain $record $_.ProcessId $processes } | Sort-Object CreationDate -Descending)
        foreach ($process in $owned) {
            if ($process.ProcessId -eq $PID) { throw 'Từ chối dừng chính launcher.' }
            $current = Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ProcessId)" -Property ProcessId,CreationDate
            if ($current -and $current.CreationDate -eq $process.CreationDate) { Stop-Process -Id $process.ProcessId -ErrorAction Stop }
        }
        Write-Host "[OK] $service đã dừng hoặc không còn tiến trình thuộc lượt khởi động đã ghi nhận."
    }
    Write-Host 'Đã dừng dịch vụ ứng dụng của checkout này. Docker, database và cửa sổ Desktop được giữ nguyên.'
} finally {
    if ($locked) { $startupLock.ReleaseMutex() }
    $startupLock.Dispose()
}
