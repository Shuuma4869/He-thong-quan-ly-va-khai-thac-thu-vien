function Get-LamsCoreFingerprint {
    param([string]$CoreRoot)
    $root = (Resolve-Path -LiteralPath $CoreRoot).Path
    $files = @(Get-ChildItem -LiteralPath (Join-Path $root 'src') -File -Recurse) + @(Get-Item -LiteralPath (Join-Path $root 'pom.xml'))
    $entries = foreach ($file in ($files | Sort-Object FullName)) {
        $relative = [IO.Path]::GetRelativePath($root, $file.FullName).Replace('\', '/')
        "$relative`0$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash)"
    }
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))))
}

function Test-LamsCoreBuild {
    param([string]$CoreRoot, [string]$Jar)
    $path = Join-Path $CoreRoot 'target\lams-core-build.json'
    if (-not (Test-Path -LiteralPath $path) -or -not (Test-Path -LiteralPath $Jar)) { return $false }
    try {
        $record = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        return $record.schema -eq 1 -and $record.source -eq (Get-LamsCoreFingerprint $CoreRoot) -and
            $record.jarSha256 -eq (Get-FileHash -LiteralPath $Jar -Algorithm SHA256).Hash
    } catch { return $false }
}
