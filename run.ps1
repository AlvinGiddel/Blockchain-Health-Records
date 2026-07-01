# Orchestrator script to run Blockchain Health Records App
$ErrorActionPreference = "Stop"

$toolsDir = Join-Path $PSScriptRoot ".tools"
$nodeDir = Join-Path $toolsDir "node"
$mongoDir = Join-Path $toolsDir "mongodb"

# 1. Add portable tools to PATH
$env:PATH = "$nodeDir;$mongoDir\bin;" + $env:PATH

# 2. Check and install backend dependencies
if (-not (Test-Path "$PSScriptRoot\backend\node_modules")) {
    Write-Host "Backend dependencies not found. Installing..." -ForegroundColor Cyan
    Set-Location -Path "$PSScriptRoot\backend"
    npm install
}

# 3. Check and install frontend dependencies
if (-not (Test-Path "$PSScriptRoot\frontend\node_modules")) {
    Write-Host "Frontend dependencies not found. Installing..." -ForegroundColor Cyan
    Set-Location -Path "$PSScriptRoot\frontend"
    npm install
}

# 4. Start MongoDB Server in a minimized window
$dbDataDir = Join-Path $mongoDir "data"
if (-not (Test-Path $dbDataDir)) {
    New-Item -ItemType Directory -Path $dbDataDir | Out-Null
}

Write-Host "Starting MongoDB database server..." -ForegroundColor Green
$mongoExe = Join-Path $mongoDir "bin\mongod.exe"
Start-Process -FilePath $mongoExe -ArgumentList "--dbpath=`"$dbDataDir`" --port 27017" -WindowStyle Minimized

# Wait 2 seconds for Mongo to boot
Start-Sleep -Seconds 2

# 5. Start Express API Backend Server in a separate window to view API logs
Write-Host "Starting Express Backend API..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k title Blockchain Health Backend API && node server.js" -WorkingDirectory "$PSScriptRoot\backend"

# Wait 2 seconds for Express to boot
Start-Sleep -Seconds 2

# 6. Run React Frontend in the current terminal (with browser auto-open)
Write-Host "Starting Vite React Frontend..." -ForegroundColor Green
Set-Location -Path "$PSScriptRoot\frontend"
npm run dev -- --open
