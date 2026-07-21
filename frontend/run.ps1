# Forward execution to root run.ps1 script
Set-Location -Path "$PSScriptRoot\.."
& "$PSScriptRoot\..\run.ps1"
