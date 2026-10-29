param(
    [string]$DocumentPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'ho-so-nop-bai\bao-cao\Bao-cao-tieu-luan-LAMS.docx')
)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $DocumentPath).Path
if ([IO.Path]::GetExtension($source) -ne '.docx') { throw 'Cần chọn tài liệu DOCX.' }
$pdf = [IO.Path]::ChangeExtension($source, '.pdf')
$word = $null
$document = $null
try {
    # Dùng phiên Word riêng; không đóng hoặc chỉnh tài liệu người dùng đang mở.
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($source, $false, $false)
    $document.UpdateStylesOnOpen = $false
    foreach ($name in @('Normal', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'Heading 3', 'Caption', 'TOC 1', 'TOC 2')) {
        $style = $document.Styles.Item($name)
        $style.Font.Name = 'Times New Roman'
        $style.Font.Color = 0
        if ($name -in @('Title', 'Subtitle')) {
            $style.Font.Italic = 0
            $style.ParagraphFormat.Borders.Enable = 0
        }
    }
    for ($pass = 0; $pass -lt 3; $pass++) {
        $null = $document.Fields.Update()
        foreach ($toc in $document.TablesOfContents) { $toc.Update() }
        $document.Repaginate()
    }
    $document.Save()
    $document.ExportAsFixedFormat($pdf, 17)
    Write-Output "Đã xuất $pdf ($($document.ComputeStatistics(2)) trang)."
} finally {
    if ($document) { $document.Close(0); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
    if ($word) { $word.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
}
