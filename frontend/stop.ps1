# Forward execution to root stop.ps1 script
Set-Location -Path "$PSScriptRoot\.."
& "$PSScriptRoot\..\stop.ps1"
