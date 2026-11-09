$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'desktop-readiness.ps1')
$cases = @(
    @{ body = $null; service = 'lams-core-service'; expected = $false },
    @{ body = [pscustomobject]@{ status = 'UP'; service = 'other-app' }; service = 'lams-core-service'; expected = $false },
    @{ body = [pscustomobject]@{ status = 'DEGRADED'; service = 'lams-insight-service' }; service = 'lams-insight-service'; expected = $false },
    @{ body = [pscustomobject]@{ service = 'lams-core-service' }; service = 'lams-core-service'; expected = $false },
    @{ body = [pscustomobject]@{ status = 'UP'; service = 'lams-core-service' }; service = 'lams-core-service'; expected = $true },
    @{ body = [pscustomobject]@{ status = 'DOWN' }; service = ''; expected = $false },
    @{ body = [pscustomobject]@{ status = 'UP' }; service = ''; expected = $true }
)
foreach ($case in $cases) {
    if ((Test-LamsHealthResponse -Body $case.body -Service $case.service) -ne $case.expected) {
        throw 'Health classification failed'
    }
}
try {
    Wait-LamsApi -Name 'Timeout fixture' -Url 'http://127.0.0.1:1' -TimeoutSeconds 0
    throw 'Expected timeout'
} catch {
    if ($_.Exception.Message -notlike '*chưa sẵn sàng*') { throw }
}
Write-Output 'PASS: 7 health cases and bounded timeout'
