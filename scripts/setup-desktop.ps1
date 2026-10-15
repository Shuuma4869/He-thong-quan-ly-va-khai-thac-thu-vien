$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$root = Get-LamsRoot
$version = '22.23.3'
$toolsDir = Join-Path $root '.tools'
$nodeDir = Join-Path $toolsDir "node-v$version-win-x64"
if (-not (Test-Path -LiteralPath (Join-Path $nodeDir 'node.exe'))) {
    New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
    $archive = "node-v$version-win-x64.zip"
    $url = "https://nodejs.org/dist/v$version"
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$url/SHASUMS256.txt").Content
    $match = [regex]::Match($checksums, "(?m)^([a-f0-9]{64})\s+$([regex]::Escape($archive))\s*$")
    if (-not $match.Success) { throw 'Không tìm thấy checksum Node chính thức.' }
    $zip = Join-Path $toolsDir $archive
    Invoke-WebRequest -UseBasicParsing -Uri "$url/$archive" -OutFile $zip
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $match.Groups[1].Value) { throw 'Checksum Node không khớp.' }
    Expand-Archive -LiteralPath $zip -DestinationPath $toolsDir
    Remove-Item -LiteralPath $zip
}
$env:PATH = "$nodeDir;$env:USERPROFILE\.cargo\bin;$env:PATH"
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$cpp = if (Test-Path -LiteralPath $vswhere) {
    & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Lib'
$windowsSdk = Get-ChildItem -LiteralPath $sdkRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'um\x64\kernel32.lib') }
if (-not $cpp -or -not $windowsSdk) {
    Invoke-LamsNative 'winget' @('install', '--id', 'Microsoft.VisualStudio.2022.BuildTools', '--exact', '--source', 'winget',
        '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity', '--override',
        '--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended') 'Cài C++ Build Tools thất bại'
}
if (-not (Test-Path -LiteralPath $vswhere) -or -not (& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)) {
    throw 'C++ Build Tools chưa sẵn sàng. Hoàn tất installer/restart Windows nếu được yêu cầu, rồi chạy lại setup.'
}
if (-not (Get-ChildItem -LiteralPath $sdkRoot -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'um\x64\kernel32.lib') })) {
    throw 'Thiếu Windows SDK x64. Bổ sung Windows SDK trong Visual Studio Installer rồi chạy lại setup.'
}
$rustup = Join-Path $env:USERPROFILE '.cargo\bin\rustup.exe'
if (-not (Test-Path -LiteralPath $rustup)) {
    Invoke-LamsNative 'winget' @('install', '--id', 'Rustlang.Rustup', '--exact', '--source', 'winget', '--silent',
        '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity') 'Cài Rustup thất bại'
}
$webview = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\*',
    'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.PSObject.Properties['name'] -and $_.name -eq 'Microsoft Edge WebView2 Runtime' }
if (-not $webview) {
    Invoke-LamsNative 'winget' @('install', '--id', 'Microsoft.EdgeWebView2Runtime', '--exact', '--source', 'winget', '--silent',
        '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity') 'Cài WebView2 thất bại'
}
Push-Location (Join-Path $root 'frontend\src-tauri')
try { Invoke-LamsNative $rustup @('show', 'active-toolchain') 'Rust toolchain chưa sẵn sàng' }
finally { Pop-Location }
Push-Location (Join-Path $root 'frontend')
try { Invoke-LamsNative 'npm.cmd' @('ci') 'Cài dependency frontend thất bại' }
finally { Pop-Location }
Write-Output 'Môi trường desktop đã sẵn sàng. Không thay Node mặc định toàn máy.'
