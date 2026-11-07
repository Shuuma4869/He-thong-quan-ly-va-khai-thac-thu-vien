$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('lams-stop-' + [guid]::NewGuid().ToString('N'))
$scripts = Join-Path $fixture 'scripts'
$runtime = Join-Path $fixture '.tools/desktop-launch'
New-Item -ItemType Directory -Path $scripts,$runtime -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'stop-local-services.ps1'),(Join-Path $PSScriptRoot 'service-runtime.ps1') -Destination $scripts
Set-Content -LiteralPath (Join-Path $scripts 'common.ps1') @'
function Get-LamsRoot { Split-Path $PSScriptRoot -Parent }
function Get-CimInstance {
    param($ClassName,$Filter,$Property)
    if ($Filter) { return $global:StopFixtureProcesses | Where-Object { "ProcessId = $($_.ProcessId)" -eq $Filter } }
    return $global:StopFixtureProcesses
}
function Stop-Process { param($Id,$ErrorAction); $global:StoppedFixturePids.Add([int]$Id) }
'@
try {
    $created = [datetime]'2026-11-07T00:00:00Z'
    $global:StopFixtureProcesses = @(
        @{ProcessId=100;ParentProcessId=1;CreationDate=$created},
        @{ProcessId=101;ParentProcessId=100;CreationDate=$created.AddSeconds(1)},
        @{ProcessId=900;ParentProcessId=1;CreationDate=$created}
    )
    $global:StoppedFixturePids = [Collections.Generic.List[int]]::new()
    $record = @{schema=1;service='web';root=$fixture;ownerPid=100;startedAt=$created.ToString('o')}
    $path = Join-Path $runtime 'web-runtime.json'
    $record | ConvertTo-Json | Set-Content -LiteralPath $path
    & (Join-Path $scripts 'stop-local-services.ps1')
    if (($global:StoppedFixturePids -join ',') -ne '101,100') { throw 'Must stop owned child before owner and leave foreign PID alone' }
    $global:StoppedFixturePids.Clear()
    $global:StopFixtureProcesses[0].CreationDate = $created.AddMinutes(1)
    & (Join-Path $scripts 'stop-local-services.ps1')
    if ($global:StoppedFixturePids.Count) { throw 'Reused owner PID must not be stopped' }
    $record.root = Join-Path $fixture 'foreign'
    $record | ConvertTo-Json | Set-Content -LiteralPath $path
    $rejected = $false
    try { & (Join-Path $scripts 'stop-local-services.ps1') } catch { $rejected = $_.Exception.Message -match 'không thuộc checkout' }
    if (-not $rejected -or $global:StoppedFixturePids.Count) { throw 'Foreign root must fail without stopping anything' }
    Write-Output 'PASS: owned descendants, foreign process, reused PID, foreign workspace'
} finally {
    $resolved = (Resolve-Path -LiteralPath $fixture).Path
    if (-not $resolved.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $resolved -Leaf) -notlike 'lams-stop-*') { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
    Remove-Variable -Name StopFixtureProcesses,StoppedFixturePids -Scope Global -ErrorAction SilentlyContinue
}
