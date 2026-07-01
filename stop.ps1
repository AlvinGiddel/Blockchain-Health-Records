# Orchestrator script to stop all Blockchain Health Records App processes
$ErrorActionPreference = "Continue"

Write-Host "Stopping all application servers (Node.js and MongoDB)..." -ForegroundColor Yellow

# Kill all node and mongod processes
Stop-Process -Name node, mongod -Force -ErrorAction SilentlyContinue

Write-Host "All application processes stopped successfully." -ForegroundColor Green
