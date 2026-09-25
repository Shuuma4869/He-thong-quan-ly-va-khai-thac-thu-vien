@echo off
setlocal
if defined MAVEN_USER_HOME (
  set "MVNW_CACHE=%MAVEN_USER_HOME%"
) else if defined LOCALAPPDATA (
  set "MVNW_CACHE=%LOCALAPPDATA%\LAMS\maven"
) else (
  set "MVNW_CACHE=%USERPROFILE%\.m2\wrapper\dists\lams"
)
set "MVNW_DIR=%MVNW_CACHE%\apache-maven-3.9.11"
set "MVNW_CMD=%MVNW_DIR%\bin\mvn.cmd"
if exist "%MVNW_CMD%" goto run

echo Dang tai Apache Maven 3.9.11 cho Maven Wrapper...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0.mvn\wrapper\bootstrap-maven.ps1" -Destination "%MVNW_CACHE%"
if errorlevel 1 exit /b 1

:run
call "%MVNW_CMD%" %*
exit /b %errorlevel%
