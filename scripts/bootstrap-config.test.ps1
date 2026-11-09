$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('lams-config-' + [guid]::NewGuid().ToString('N') + ' Tiếng Việt')
$scripts = Join-Path $fixture 'scripts'
New-Item -ItemType Directory -Path $scripts -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'common.ps1'),(Join-Path $PSScriptRoot 'bootstrap-local.ps1') -Destination $scripts
Copy-Item -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) '.env.example') -Destination $fixture
try {
    $pwsh = (Get-Command pwsh.exe).Source
    & $pwsh -NoProfile -File (Join-Path $scripts 'bootstrap-local.ps1') -ConfigureOnly
    if ($LASTEXITCODE -ne 0) { throw 'First configuration failed' }
    $path = Join-Path $fixture '.env'
    $before = (Get-FileHash -LiteralPath $path).Hash
    $config = Get-Content -LiteralPath $path -Raw
    if ($config.Contains('change-me-local-only') -or $config.Contains('local-development-placeholder-change-before-deploy-32-bytes')) {
        throw 'Default secrets were not replaced'
    }
    & $pwsh -NoProfile -File (Join-Path $scripts 'bootstrap-local.ps1') -ConfigureOnly
    if ($LASTEXITCODE -ne 0 -or $before -ne (Get-FileHash -LiteralPath $path).Hash) { throw 'Repeated configuration changed existing secrets' }
    if (Test-Path -LiteralPath (Join-Path $fixture 'frontend/node_modules')) { throw 'ConfigureOnly installed dependencies' }
    Write-Output 'PASS: fresh configuration, generated secrets, repeated configuration preserves exact bytes, Unicode path'
} finally {
    $resolved = (Resolve-Path -LiteralPath $fixture).Path
    if (-not $resolved.StartsWith([IO.Path]::GetTempPath(), [StringComparison]::OrdinalIgnoreCase) -or
        (Split-Path $resolved -Leaf) -notlike 'lams-config-*') { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
