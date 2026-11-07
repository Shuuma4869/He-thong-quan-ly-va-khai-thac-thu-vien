$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('lams-launcher-' + [guid]::NewGuid().ToString('N') + ' Tiếng Việt')
$scripts = Join-Path $fixture 'scripts'
New-Item -ItemType Directory -Path $scripts,(Join-Path $fixture 'frontend/node_modules'),
    (Join-Path $fixture 'backend/insight-service/node_modules/.prisma/client') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'start-local-desktop.ps1') -Destination $scripts
Set-Content -LiteralPath (Join-Path $fixture '.env') 'TEST_FIXTURE=true'
$common = @'
function Get-LamsRoot { Split-Path $PSScriptRoot -Parent }
function Import-LamsEnv { param([switch]$OverrideExisting) }
function Test-LamsLocalConfiguration {}
function Test-LamsTcpPort { param([int]$Port) return $global:Occupied }
function Invoke-LamsNative {
    param($FilePath,$ArgumentList,$FailureMessage)
    if ($FilePath -eq 'node' -and $global:BadManifest) { throw 'stale manifest' }
    $global:NativeCalls.Add($FilePath + ' ' + ($ArgumentList -join ' '))
}
function Start-Process {
    param($FilePath,$ArgumentList,$WorkingDirectory,$WindowStyle,$RedirectStandardOutput,$RedirectStandardError)
    $global:Starts.Add(@{ arguments=$ArgumentList; style=$WindowStyle })
}
function Invoke-WebRequest { param($Uri,$TimeoutSec) return @{StatusCode=200;Content='<script src="/src/main.tsx"></script>'} }
'@
Set-Content -LiteralPath (Join-Path $scripts 'common.ps1') $common
Set-Content -LiteralPath (Join-Path $scripts 'doctor.ps1') '# Prerequisite fixture'
Set-Content -LiteralPath (Join-Path $scripts 'desktop-readiness.ps1') 'function Wait-LamsApi { param($Name,$Url,$Service) }'
Set-Content -LiteralPath (Join-Path $scripts 'core-build-state.ps1') 'function Test-LamsCoreBuild { param($CoreRoot,$Jar) return $true }'
Set-Content -LiteralPath (Join-Path $scripts 'service-runtime.ps1') @'
function Assert-LamsServiceRuntime { param($Root,$Service,$Port); if ($global:Foreign) { throw 'foreign listener' } }
'@
Set-Content -LiteralPath (Join-Path $scripts 'start-core.ps1') 'param([switch]$BuildOnly); if (-not $BuildOnly) { throw "Expected BuildOnly" }; $global:BuildCount++'
try {
    $global:Occupied = $false; $global:Foreign = $false; $global:BadManifest = $false; $global:BuildCount = 0
    $global:Starts = [Collections.Generic.List[object]]::new()
    $global:NativeCalls = [Collections.Generic.List[string]]::new()
    & (Join-Path $scripts 'start-local-desktop.ps1') -Mode Web -NoOpen
    if ($global:BuildCount -ne 1 -or $global:Starts.Count -ne 3) { throw 'Fresh Web must build missing JAR and start three services' }
    foreach ($process in $global:Starts) {
        if ($process.style -ne 'Hidden' -or $process.arguments[2] -ne ('"' + $process.arguments[2].Trim('"') + '"')) { throw 'Path quoting or hidden launch missing' }
        if ($process.arguments[2] -notmatch 'Tiếng Việt') { throw 'Unicode fixture not exercised' }
    }
    if (-not ($global:NativeCalls | Where-Object { $_ -match 'prisma:deploy' })) { throw 'Missing Prisma migration gate' }
    $global:Occupied = $true; $global:Starts.Clear()
    & (Join-Path $scripts 'start-local-desktop.ps1') -Mode Web -NoOpen
    if ($global:Starts.Count -ne 0 -or $global:BuildCount -ne 1) { throw 'Second launch duplicated services or build' }
    $global:Foreign = $true
    $rejected = $false
    try { & (Join-Path $scripts 'start-local-desktop.ps1') -Mode Web -NoOpen } catch { $rejected = $_.Exception.Message -eq 'foreign listener' }
    if (-not $rejected -or $global:Starts.Count) { throw 'Foreign listener was not rejected before startup' }
    $global:Foreign = $false; $global:BadManifest = $true; $global:NativeCalls.Clear()
    $rejected = $false
    try { & (Join-Path $scripts 'start-local-desktop.ps1') -Mode Desktop -NoOpen } catch { $rejected = $_.Exception.Message -eq 'stale manifest' }
    if (-not $rejected -or $global:NativeCalls.Count) { throw 'Stale desktop should fail before starting infrastructure' }
    Write-Output 'PASS: fresh Web builds JAR, three hidden services, quoted Unicode paths, Prisma gate, repeat launch, foreign port, stale desktop'
} finally {
    $resolved = (Resolve-Path -LiteralPath $fixture).Path
    if (-not $resolved.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $resolved -Leaf) -notlike 'lams-launcher-*') { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
    foreach ($name in @('Occupied','Foreign','BadManifest','BuildCount','Starts','NativeCalls')) { Remove-Variable -Name $name -Scope Global -ErrorAction SilentlyContinue }
}
