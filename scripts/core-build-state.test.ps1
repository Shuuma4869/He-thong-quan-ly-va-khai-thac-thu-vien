$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'core-build-state.ps1')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('lams-core-state-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixture 'src'), (Join-Path $fixture 'target') -Force | Out-Null
try {
    Set-Content (Join-Path $fixture 'pom.xml') '<project/>'
    Set-Content (Join-Path $fixture 'src\example.java') 'original'
    $jar = Join-Path $fixture 'target\example.jar'
    Set-Content $jar 'fixture binary'
    if (Test-LamsCoreBuild $fixture $jar) { throw 'Missing manifest accepted' }
    @{ schema = 1; source = (Get-LamsCoreFingerprint $fixture); jarSha256 = (Get-FileHash $jar).Hash } |
        ConvertTo-Json | Set-Content (Join-Path $fixture 'target\lams-core-build.json')
    if (-not (Test-LamsCoreBuild $fixture $jar)) { throw 'Valid build rejected' }
    Set-Content (Join-Path $fixture 'src\example.java') 'modified'
    if (Test-LamsCoreBuild $fixture $jar) { throw 'Stale source accepted' }
    Set-Content (Join-Path $fixture 'src\example.java') 'original'
    Set-Content $jar 'modified binary'
    if (Test-LamsCoreBuild $fixture $jar) { throw 'Changed binary accepted' }
    Write-Output 'PASS: missing manifest, matching build, stale source, changed JAR'
} finally {
    $resolved = (Resolve-Path -LiteralPath $fixture).Path
    if (-not $resolved.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $resolved -Leaf) -notlike 'lams-core-state-*') { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
