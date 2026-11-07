# Chỉ tái sử dụng dịch vụ do script trong workspace này khởi động và còn khớp đầu vào.
function Get-LamsServiceFingerprint {
    param([string]$Root, [ValidateSet('core', 'insight', 'web')][string]$Service)
    $relative = if ($Service -eq 'core') {
        @('.env', 'backend/core-service/src', 'backend/core-service/pom.xml', 'backend/core-service/target/lams-core-build.json')
    } elseif ($Service -eq 'insight') {
        @('.env', 'backend/insight-service/src', 'backend/insight-service/prisma',
          'backend/insight-service/package.json', 'backend/insight-service/package-lock.json',
          'backend/insight-service/tsconfig.json', 'backend/insight-service/tsconfig.build.json', 'backend/insight-service/nest-cli.json')
    } else {
        @('.env', 'frontend/.env', 'frontend/.env.local', 'frontend/src', 'frontend/public',
          'frontend/package.json', 'frontend/package-lock.json', 'frontend/vite.config.ts', 'frontend/index.html')
    }
    $entries = foreach ($path in $relative) {
        $full = Join-Path $Root $path
        if (-not (Test-Path -LiteralPath $full)) { "$path=MISSING"; continue }
        $files = if (Test-Path -LiteralPath $full -PathType Container) { Get-ChildItem -LiteralPath $full -File -Recurse } else { Get-Item -LiteralPath $full }
        foreach ($file in ($files | Sort-Object FullName)) {
            "$([IO.Path]::GetRelativePath($Root, $file.FullName))=$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash)"
        }
    }
    if ($Service -eq 'core') {
        $entries += @(Get-ChildItem -LiteralPath (Join-Path $Root 'backend/core-service/target') -Filter 'core-service-*.jar' -File -ErrorAction SilentlyContinue |
            Sort-Object Name | ForEach-Object { "$($_.Name)=$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)" })
    }
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))))
}

function New-LamsServiceRuntime {
    param([string]$Root, [ValidateSet('core', 'insight', 'web')][string]$Service)
    $directory = Join-Path $Root '.tools\desktop-launch'
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $PID" -Property CreationDate
    $record = @{ schema = 1; ownerPid = $PID; startedAt = $owner.CreationDate.ToUniversalTime().ToString('o');
        root = [IO.Path]::GetFullPath($Root); service = $Service; fingerprint = (Get-LamsServiceFingerprint $Root $Service) }
    $record | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory "$Service-runtime.json")
}

function Test-LamsRuntimeChain {
    param($Record, [int]$ListenerPid, [array]$Processes)
    $byId = @{}
    foreach ($process in $Processes) { $byId[[int]$process.ProcessId] = $process }
    $seen = @{}
    $current = $ListenerPid
    while ($current -gt 0 -and $byId.ContainsKey($current) -and -not $seen.ContainsKey($current)) {
        $seen[$current] = $true
        $process = $byId[$current]
        if ($current -eq [int]$Record.ownerPid) {
            return ([datetime]$process.CreationDate).ToUniversalTime().Ticks -eq ([datetime]$Record.startedAt).ToUniversalTime().Ticks
        }
        $parent = [int]$process.ParentProcessId
        if ($byId.ContainsKey($parent) -and ([datetime]$byId[$parent].CreationDate) -gt ([datetime]$process.CreationDate)) { return $false }
        $current = $parent
    }
    return $false
}

function Assert-LamsServiceRuntime {
    param([string]$Root, [ValidateSet('core', 'insight', 'web')][string]$Service, [int]$Port)
    $reason = 'không có thông tin khởi động từ workspace này'
    try {
        $record = Get-Content -LiteralPath (Join-Path $Root ".tools\desktop-launch\$Service-runtime.json") -Raw -ErrorAction Stop | ConvertFrom-Json
        if ($record.schema -ne 1 -or $record.service -ne $Service -or $record.root -ne [IO.Path]::GetFullPath($Root)) { throw 'thông tin workspace không khớp' }
        if ($record.fingerprint -ne (Get-LamsServiceFingerprint $Root $Service)) { throw 'source, cấu hình hoặc bản build đã thay đổi sau khi dịch vụ khởi động' }
        $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
        if ($listeners.Count -eq 0) { throw 'không tìm thấy tiến trình lắng nghe' }
        $processes = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate -ErrorAction Stop)
        foreach ($listener in $listeners) {
            if (-not (Test-LamsRuntimeChain $record $listener $processes)) { throw 'tiến trình giữ cổng không thuộc lượt khởi động đã ghi nhận' }
        }
        return
    } catch { $reason = $_.Exception.Message }
    throw "Không tái sử dụng $Service tại cổng ${Port}: $reason. Chạy .\lams.ps1 Stop tại checkout đã mở dịch vụ, rồi khởi động lại. Với tiến trình ngoài launcher, đóng trong cửa sổ đã chạy nó. Launcher không tự dừng tiến trình khác."
}
