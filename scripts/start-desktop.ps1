param([switch]$Release)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Import-LamsEnv
$root = Get-LamsRoot
if ($Release) {
    $app = Join-Path $root 'frontend\src-tauri\target\release\lams-desktop.exe'
    if (-not (Test-Path -LiteralPath $app)) { throw 'Chưa có bản release. Chạy scripts/build-desktop.ps1 trước.' }
    # This is the user-requested application window, not a background helper.
    Start-Process -FilePath $app -WorkingDirectory (Split-Path $app) -WindowStyle Normal
    exit 0
}
if ((& node --version) -notmatch '^v22\.') { throw 'Cần Node 22. Chạy scripts/setup-desktop.ps1.' }
if (Test-LamsTcpPort -Port 5173) { throw 'Cổng 5173 đang được dùng. Dừng Vite cũ trước khi chạy desktop dev.' }
Push-Location (Join-Path $root 'frontend')
try { Invoke-LamsNative 'npm.cmd' @('run', 'desktop:dev') 'Tauri dev thất bại' }
finally { Pop-Location }
