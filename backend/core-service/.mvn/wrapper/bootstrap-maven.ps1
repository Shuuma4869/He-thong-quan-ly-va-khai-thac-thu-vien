param(
    [Parameter(Mandatory = $true)][string]$Destination
)

$ErrorActionPreference = 'Stop'
$version = '3.9.11'
$archive = Join-Path $env:TEMP "lams-maven-$version.zip"
$uri = "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/$version/apache-maven-$version-bin.zip"

try {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Invoke-WebRequest -Uri $uri -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $Destination -Force
}
finally {
    if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
