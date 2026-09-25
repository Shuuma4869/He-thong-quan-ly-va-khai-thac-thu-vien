@echo off
setlocal
set "MVNW_DIR=%~dp0.mvn\wrapper\dists\apache-maven-3.9.11"
set "MVNW_CMD=%MVNW_DIR%\bin\mvn.cmd"
if exist "%MVNW_CMD%" goto run

echo Dang tai Apache Maven 3.9.11 cho Maven Wrapper...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $zip=Join-Path $env:TEMP 'lams-maven-3.9.11.zip'; Invoke-WebRequest -Uri 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.11/apache-maven-3.9.11-bin.zip' -OutFile $zip; New-Item -ItemType Directory -Force -Path '%~dp0.mvn\wrapper\dists' | Out-Null; Expand-Archive -LiteralPath $zip -DestinationPath '%~dp0.mvn\wrapper\dists' -Force; Remove-Item -LiteralPath $zip"
if errorlevel 1 exit /b 1

:run
call "%MVNW_CMD%" %*
exit /b %errorlevel%
