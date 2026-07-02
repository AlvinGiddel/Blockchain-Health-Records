# Optimized setup script for portable Node.js using tar.exe
$ErrorActionPreference = "Stop"

$toolsDir = Join-Path $PSScriptRoot ".tools"
$nodeZip = Join-Path $toolsDir "node.zip"
$nodeDir = Join-Path $toolsDir "node"

if (-not (Test-Path $toolsDir)) {
    New-Item -ItemType Directory -Path $toolsDir | Out-Null
}

# --- Download & Extract Node.js ---
if (-not (Test-Path $nodeDir)) {
    # Clean up legacy folders if they exist
    $legacyNode = Get-ChildItem -Path $toolsDir -Directory -Filter "node-v20.11.1*" | Select-Object -First 1
    if ($legacyNode) { Remove-Item -Path $legacyNode.FullName -Recurse -Force | Out-Null }
    if (Test-Path $nodeZip) { Remove-Item -Path $nodeZip -Force | Out-Null }

    Write-Host "Downloading portable Node.js (v20.11.1)..." -ForegroundColor Cyan
    $nodeUrl = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip"
    
    try {
        Start-BitsTransfer -Source $nodeUrl -Destination $nodeZip -ErrorAction Stop
    } catch {
        Write-Host "BITS failed, falling back to WebRequest..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeZip
    }

    Write-Host "Extracting Node.js using tar..." -ForegroundColor Cyan
    tar.exe -xf "$nodeZip" -C "$toolsDir"
    
    $extractedNodeDir = Get-ChildItem -Path $toolsDir -Directory -Filter "node-v20.11.1*" | Select-Object -First 1
    Rename-Item -Path $extractedNodeDir.FullName -NewName "node"
    Remove-Item -Path $nodeZip -Force
    Write-Host "Node.js setup completed successfully." -ForegroundColor Green
} else {
    Write-Host "Node.js is already set up in $nodeDir." -ForegroundColor Green
}

# Add tools to PATH for the current session and print versions
$env:PATH = "$nodeDir;" + $env:PATH
Write-Host "`nEnvironment verification:" -ForegroundColor Cyan
node -v
npm -v

