# Orchestrator script to run Blockchain Health Records App
$ErrorActionPreference = "Stop"

$toolsDir = Join-Path $PSScriptRoot ".tools"
$nodeDir = Join-Path $toolsDir "node"

$nodeExe = Join-Path $nodeDir "node.exe"

# 1. Add portable tools to PATH
$env:PATH = "$nodeDir;" + $env:PATH

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

# 5. Start Express API Backend Server in a separate window to view API logs
Write-Host "Starting Express Backend API..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/k title Blockchain Health Backend API && `"$nodeExe`" server.js" -WorkingDirectory "$PSScriptRoot\backend"

# Wait 2 seconds for Express to boot
Start-Sleep -Seconds 2

# 6. Run React Frontend in the current terminal (with browser auto-open)
Write-Host "Starting Vite React Frontend..." -ForegroundColor Green
Set-Location -Path "$PSScriptRoot\frontend"
npm run dev -- --open

