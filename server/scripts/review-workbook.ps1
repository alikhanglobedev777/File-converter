$ErrorActionPreference = 'Stop'
$projectPath = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$inputFile = Join-Path $projectPath 'artifacts\achievement-formatted.xlsx'
$outputFile = Join-Path $projectPath 'artifacts\achievement-excel-preview.pdf'
$excelInstance = $null
$reviewBook = $null
try {
    $excelInstance = New-Object -ComObject Excel.Application
    $excelInstance.Visible = $false
    $excelInstance.DisplayAlerts = $false
    $excelInstance.AutomationSecurity = 3
    $reviewBook = $excelInstance.Workbooks.Open($inputFile, 0, $true)
    $reviewBook.ExportAsFixedFormat(0, $outputFile)
    Write-Output "Excel opened the generated workbook and exported all worksheets for visual review."
} finally {
    if ($null -ne $reviewBook) {
        $reviewBook.Close($false)
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($reviewBook)
    }
    if ($null -ne $excelInstance) {
        $excelInstance.Quit()
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($excelInstance)
    }
}
