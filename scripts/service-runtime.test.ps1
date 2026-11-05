$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'service-runtime.ps1')
$created = [datetime]'2026-11-05T00:00:00Z'
$record = @{ ownerPid = 100; startedAt = $created.ToString('o') }
$owner = @{ ProcessId = 100; ParentProcessId = 1; CreationDate = $created }
$child = @{ ProcessId = 101; ParentProcessId = 100; CreationDate = $created.AddSeconds(1) }
$listener = @{ ProcessId = 102; ParentProcessId = 101; CreationDate = $created.AddSeconds(2) }
if (-not (Test-LamsRuntimeChain $record 102 @($owner, $child, $listener))) { throw 'Valid nested service rejected' }
if (Test-LamsRuntimeChain $record 999 @($owner, $child, $listener)) { throw 'Unknown process accepted' }
$replacement = @{ ProcessId = 100; ParentProcessId = 1; CreationDate = $created.AddSeconds(5) }
if (Test-LamsRuntimeChain $record 102 @($replacement, $child, $listener)) { throw 'Reused PID accepted' }
if (Test-LamsRuntimeChain $record 102 @($owner, $listener)) { throw 'Broken parent chain accepted' }
$loop = @{ ProcessId = 101; ParentProcessId = 102; CreationDate = $created.AddSeconds(2) }
if (Test-LamsRuntimeChain $record 102 @($loop, $listener)) { throw 'Cyclic chain accepted' }
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('lams-runtime-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixture 'backend/core-service/target'), (Join-Path $fixture 'backend/insight-service/src') -Force | Out-Null
try {
    Set-Content -LiteralPath (Join-Path $fixture '.env') 'LOCAL_TEST=true'
    Set-Content -LiteralPath (Join-Path $fixture 'backend/insight-service/src/main.ts') 'before'
    $before = Get-LamsServiceFingerprint $fixture 'insight'
    if ($before -ne (Get-LamsServiceFingerprint $fixture 'insight')) { throw 'Fingerprint is unstable' }
    Set-Content -LiteralPath (Join-Path $fixture 'backend/insight-service/src/main.ts') 'after'
    if ($before -eq (Get-LamsServiceFingerprint $fixture 'insight')) { throw 'Source change missed' }
    $before = Get-LamsServiceFingerprint $fixture 'core'
    Set-Content -LiteralPath (Join-Path $fixture '.env') 'LOCAL_TEST=false'
    if ($before -eq (Get-LamsServiceFingerprint $fixture 'core')) { throw 'Configuration change missed' }
    $before = Get-LamsServiceFingerprint $fixture 'core'
    Set-Content -LiteralPath (Join-Path $fixture 'backend/core-service/target/core-service-test.jar') 'binary'
    if ($before -eq (Get-LamsServiceFingerprint $fixture 'core')) { throw 'Binary change missed' }
    Write-Output 'PASS: service ancestry, unknown process, reused PID, broken/cyclic ancestry, stable fingerprint, source/configuration/binary changes'
} finally {
    $resolved = (Resolve-Path -LiteralPath $fixture).Path
    if (-not $resolved.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $resolved -Leaf) -notlike 'lams-runtime-*') { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
