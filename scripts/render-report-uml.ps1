param([Parameter(Mandatory = $true)][string]$PlantUmlJar)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$source = Join-Path $root 'ho-so-nop-bai\bao-cao\so-do'
$output = Join-Path $root 'ho-so-nop-bai\bao-cao\hinh'
if (-not (Test-Path -LiteralPath $PlantUmlJar -PathType Leaf)) { throw "Không tìm thấy PlantUML JAR: $PlantUmlJar" }
$jar = (Resolve-Path -LiteralPath $PlantUmlJar).Path
$sources = @(Get-ChildItem -LiteralPath $source -Filter '*.puml' -File)
if ($sources.Count -eq 0) { throw "Không có nguồn PlantUML trong $source" }

# PlantUML/Graphviz trên Windows không ghi được PNG nếu đường dẫn output có dấu.
# Dựng trong thư mục ASCII riêng rồi chép kết quả về hồ sơ.
$stage = Join-Path 'D:\' ('lams-report-uml-' + [guid]::NewGuid().ToString('N'))
$stageFull = [System.IO.Path]::GetFullPath($stage)
if (-not $stageFull.StartsWith('D:\lams-report-uml-', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Đường dẫn tạm không hợp lệ: $stageFull"
}
try {
    New-Item -ItemType Directory -Path $stageFull -Force | Out-Null
    $stagedJar = Join-Path $stageFull 'plantuml.jar'
    Copy-Item -LiteralPath $jar -Destination $stagedJar
    foreach ($item in $sources) { Copy-Item -LiteralPath $item.FullName -Destination $stageFull }
    $inputs = @(Get-ChildItem -LiteralPath $stageFull -Filter '*.puml' -File | ForEach-Object FullName)
    $runOutput = & java -jar $stagedJar -charset UTF-8 -tpng -o out $inputs 2>&1
    if ($LASTEXITCODE -ne 0 -or ($runOutput | Out-String) -match 'Exception|ERROR|Error line') {
        throw "Không thể dựng sơ đồ PlantUML: $($runOutput | Out-String)"
    }
    $rendered = @(Get-ChildItem -LiteralPath (Join-Path $stageFull 'out') -Filter '*.png' -File)
    if ($rendered.Count -ne $sources.Count) { throw "Dựng được $($rendered.Count)/$($sources.Count) sơ đồ." }
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    foreach ($item in $sources) {
        $png = Join-Path (Join-Path $stageFull 'out') ($item.BaseName + '.png')
        if (-not (Test-Path -LiteralPath $png -PathType Leaf)) { throw "Thiếu hình: $png" }
        Copy-Item -LiteralPath $png -Destination (Join-Path $output ($item.BaseName + '.png')) -Force
    }
    Write-Output "Đã dựng $($sources.Count) sơ đồ trong $output"
} finally {
    if (Test-Path -LiteralPath $stageFull) { Remove-Item -LiteralPath $stageFull -Recurse -Force }
}
