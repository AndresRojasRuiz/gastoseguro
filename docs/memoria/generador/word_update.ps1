param(
  [Parameter(Mandatory = $true)][string]$InputDocx,
  [Parameter(Mandatory = $true)][string]$OutputDocx,
  [Parameter(Mandatory = $true)][string]$OutputPdf
)
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null
try {
  $doc = $word.Documents.Open($InputDocx, $false, $false, $false)
  $null = $doc.Fields.Update()
  foreach ($toc in $doc.TablesOfContents) { $null = $toc.Update() }
  foreach ($tof in $doc.TablesOfFigures) { $null = $tof.Update() }
  $doc.Repaginate()
  foreach ($toc in $doc.TablesOfContents) { $null = $toc.UpdatePageNumbers() }
  foreach ($tof in $doc.TablesOfFigures) { $null = $tof.UpdatePageNumbers() }
  $pages = $doc.ComputeStatistics(2)
  $words = $doc.ComputeStatistics(0)
  $doc.SaveAs2($OutputDocx, 16)
  $doc.ExportAsFixedFormat($OutputPdf, 17)
  Write-Output "pages=$pages words=$words tocs=$($doc.TablesOfContents.Count) tofs=$($doc.TablesOfFigures.Count)"
}
finally {
  if ($doc -ne $null) { $doc.Close($false) }
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
