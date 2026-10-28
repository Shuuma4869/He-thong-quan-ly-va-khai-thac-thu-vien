Set-StrictMode -Version 3.0

$script:LamsRoot = Split-Path -Parent $PSScriptRoot

# Prefer the project's pinned Node without changing the machine-wide installation.
$localNode = Join-Path $script:LamsRoot '.tools\node-v22.23.3-win-x64'
if (Test-Path -LiteralPath (Join-Path $localNode 'node.exe')) { $env:PATH = "$localNode;$env:PATH" }
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path -LiteralPath $cargoBin) { $env:PATH = "$cargoBin;$env:PATH" }

function Get-LamsRoot {
    return $script:LamsRoot
}

function Import-LamsEnv {
    param(
        [string]$Path = (Join-Path $script:LamsRoot '.env'),
        [switch]$OverrideExisting
    )

    if (-not (Test-Path -LiteralPath $Path)) { return }

    foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1) { continue }
        $name = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if ($OverrideExisting -or [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

function Test-LamsLocalConfiguration {
    $required = @('POSTGRES_USER', 'POSTGRES_PASSWORD', 'CORE_DATABASE_URL',
        'CORE_DATABASE_USERNAME', 'CORE_DATABASE_PASSWORD', 'INSIGHT_DATABASE_URL', 'LAMS_JWT_SECRET')
    foreach ($name in $required) {
        if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process'))) {
            throw "Thiếu $name trong .env local. Không in giá trị bí mật."
        }
    }
    if ($env:LAMS_JWT_SECRET.Length -lt 32 -or $env:LAMS_JWT_SECRET -match 'placeholder|change-me') {
        throw 'LAMS_JWT_SECRET quá ngắn hoặc còn là giá trị mẫu. Tạo secret mới trong .env, không gửi vào chat.'
    }
    if ($env:CORE_DATABASE_PASSWORD -ne $env:POSTGRES_PASSWORD) {
        throw 'CORE_DATABASE_PASSWORD khác POSTGRES_PASSWORD trong .env.'
    }
    if ($env:CORE_DATABASE_URL -notmatch '^jdbc:postgresql://[^/]+/[^?]+') {
        throw 'CORE_DATABASE_URL cần là JDBC PostgreSQL URL hợp lệ.'
    }
    try {
        $insightUri = [uri]$env:INSIGHT_DATABASE_URL
        if ($insightUri.Scheme -ne 'postgresql' -or -not $insightUri.Host -or -not $insightUri.AbsolutePath.Trim('/')) {
            throw 'URL không hợp lệ.'
        }
        $credentials = $insightUri.UserInfo.Split(':', 2)
        if ($credentials.Count -ne 2 -or [uri]::UnescapeDataString($credentials[1]) -ne $env:POSTGRES_PASSWORD) {
            throw 'Mật khẩu không khớp.'
        }
    } catch {
        throw 'INSIGHT_DATABASE_URL không hợp lệ hoặc mật khẩu khác POSTGRES_PASSWORD trong .env.'
    }
}

function Get-LamsSetting {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DefaultValue
    )

    $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrEmpty($processValue)) { return $processValue }

    foreach ($fileName in @('.env', '.env.example')) {
        $path = Join-Path $script:LamsRoot $fileName
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $match = Get-Content -LiteralPath $path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
        if ($match) { return $match.Substring($match.IndexOf('=') + 1).Trim() }
    }

    return $DefaultValue
}

function Invoke-LamsNative {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)][string]$FailureMessage
    )

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$FailureMessage (exit code $LASTEXITCODE)."
    }
}

function Test-LamsTcpPort {
    param(
        [string]$HostName = '127.0.0.1',
        [Parameter(Mandatory = $true)][int]$Port,
        [int]$TimeoutMilliseconds = 500
    )

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync($HostName, $Port)
        return $task.Wait($TimeoutMilliseconds) -and $client.Connected
    }
    catch { return $false }
    finally { $client.Dispose() }
}
