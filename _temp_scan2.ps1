$root = "f:\VSC projects\trading-system - lite"
$files = Get-ChildItem -Path $root -Recurse -Include *.py,*.cpp,*.h,*.rs
$files = $files | Where-Object { $_.FullName -notmatch 'build|node_modules|\.git|target|__pycache__|\.next' -and $_.Length -gt 20000 }
$files = $files | Sort-Object Length -Descending | Select-Object -First 30
foreach ($f in $files) {
    Write-Output "$($f.Length) $($f.FullName)"
}
