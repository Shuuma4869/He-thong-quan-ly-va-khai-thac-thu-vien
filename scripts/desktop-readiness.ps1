function Test-LamsHealthResponse {
    param([object]$Body, [string]$Service)
    if ($null -eq $Body) { return $false }
    $status = $Body.PSObject.Properties['status']
    if (-not $status -or $status.Value -ne 'UP') { return $false }
    if ($Service) {
        $identity = $Body.PSObject.Properties['service']
        if (-not $identity -or $identity.Value -ne $Service) { return $false }
    }
    return $true
}

function Wait-LamsApi {
    param([string]$Name, [string]$Url, [string]$Service, [int]$TimeoutSeconds = 90)
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $body = Invoke-RestMethod -Uri $Url -TimeoutSec 3
            if (Test-LamsHealthResponse -Body $body -Service $Service) {
                Write-Host "[OK] $Name sẵn sàng."
                return
            }
        } catch {}
        Start-Sleep -Seconds 2
    }
    throw "$Name chưa sẵn sàng sau $TimeoutSeconds giây. Kiểm tra log tại .tools\desktop-launch rồi thử lại."
}
