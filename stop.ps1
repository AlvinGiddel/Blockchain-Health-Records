# Orchestrator script to stop all Blockchain Health Records App processes
$ErrorActionPreference = "Continue"

Write-Host "Stopping all application servers (Node.js)..." -ForegroundColor Yellow

# Kill all node processes
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

Write-Host "All application processes stopped successfully." -ForegroundColor Green

