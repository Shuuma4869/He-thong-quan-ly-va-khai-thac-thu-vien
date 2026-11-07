@echo off
setlocal EnableExtensions
chcp 65001 >nul
where pwsh.exe >nul 2>&1
if errorlevel 1 (
  echo [LOI] Can PowerShell 7. Xem tai-lieu\08-van-hanh\desktop-windows.md.
  pause
  exit /b 1
)
pwsh.exe -NoLogo -NoProfile -File "%~dp0scripts\start-local-desktop.ps1"
set "LAMS_RESULT=%ERRORLEVEL%"
if not "%LAMS_RESULT%"=="0" (
  echo.
  echo [LOI] LAMS chua khoi dong thanh cong. Xem thong bao phia tren.
  pause
)
exit /b %LAMS_RESULT%
