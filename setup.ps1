# Optimized setup script for portable Node.js and MongoDB using tar.exe
$ErrorActionPreference = "Stop"

$toolsDir = Join-Path $PSScriptRoot ".tools"
$nodeZip = Join-Path $toolsDir "node.zip"
$nodeDir = Join-Path $toolsDir "node"
$mongoZip = Join-Path $toolsDir "mongo.zip"
$mongoDir = Join-Path $toolsDir "mongodb"

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

# --- Download & Extract MongoDB ---
if (-not (Test-Path $mongoDir)) {
    # Clean up legacy folders if they exist
    $legacyMongo = Get-ChildItem -Path $toolsDir -Directory -Filter "mongodb-*" | Select-Object -First 1
    if ($legacyMongo) { Remove-Item -Path $legacyMongo.FullName -Recurse -Force | Out-Null }
    if (Test-Path $mongoZip) { Remove-Item -Path $mongoZip -Force | Out-Null }

    Write-Host "Downloading portable MongoDB..." -ForegroundColor Cyan
    $mongoUrl = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-7.0.6.zip"
    
    try {
        Start-BitsTransfer -Source $mongoUrl -Destination $mongoZip -ErrorAction Stop
    } catch {
        Write-Host "BITS failed, falling back to WebRequest..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $mongoUrl -OutFile $mongoZip
    }

    Write-Host "Extracting MongoDB using tar..." -ForegroundColor Cyan
    tar.exe -xf "$mongoZip" -C "$toolsDir"
    
    $extractedMongoDir = Get-ChildItem -Path $toolsDir -Directory -Filter "mongodb-*" | Select-Object -First 1
    Rename-Item -Path $extractedMongoDir.FullName -NewName "mongodb"
    Remove-Item -Path $mongoZip -Force
    
    # Create DB data folder
    $dbDataDir = Join-Path $mongoDir "data"
    if (-not (Test-Path $dbDataDir)) {
        New-Item -ItemType Directory -Path $dbDataDir | Out-Null
    }
    Write-Host "MongoDB setup completed successfully." -ForegroundColor Green
} else {
    Write-Host "MongoDB is already set up in $mongoDir." -ForegroundColor Green
}

# Add tools to PATH for the current session and print versions
$env:PATH = "$nodeDir;$mongoDir\bin;" + $env:PATH
Write-Host "`nEnvironment verification:" -ForegroundColor Cyan
node -v
npm -v
mongod --version
