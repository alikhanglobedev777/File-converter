$ErrorActionPreference = 'Stop'
$projectPath = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$inputFile = Join-Path $projectPath 'artifacts\achievement-formatted.xlsx'
$excelInstance = $null
$reviewBook = $null
try {
    $excelInstance = New-Object -ComObject Excel.Application
    $excelInstance.Visible = $false
    $excelInstance.DisplayAlerts = $false
    $excelInstance.AutomationSecurity = 3
    $reviewBook = $excelInstance.Workbooks.Open($inputFile, 0, $true)
    Write-Output "Excel worksheet count: $($reviewBook.Worksheets.Count)"
    for ($sheetIndex = 1; $sheetIndex -le $reviewBook.Worksheets.Count; $sheetIndex++) {
        $reviewSheet = $reviewBook.Worksheets.Item($sheetIndex)
        try {
            $sheetOutput = Join-Path $projectPath "artifacts\excel-page-$sheetIndex.pdf"
            $reviewSheet.ExportAsFixedFormat(0, $sheetOutput)
            Write-Output "Exported worksheet $sheetIndex for visual review."
        } finally {
            [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($reviewSheet)
        }
    }
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
