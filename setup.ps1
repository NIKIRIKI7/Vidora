# Vidora setup script (Windows)
# Run: powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== Vidora Setup ===" -ForegroundColor Cyan

# 1. Python virtual environment
Write-Host "[1/5] Python virtual environment..." -ForegroundColor Yellow
$venvPath = Join-Path $root "backend" ".venv"
if (-not (Test-Path $venvPath)) {
    python -m venv $venvPath
    Write-Host "  ✔ Created .venv" -ForegroundColor Green
} else {
    Write-Host "  ✔ .venv already exists" -ForegroundColor Green
}

# 2. Python dependencies
Write-Host "[2/5] Python dependencies..." -ForegroundColor Yellow
$pip = Join-Path $venvPath "Scripts" "pip"
& $pip install -r (Join-Path $root "backend" "requirements.txt")
Write-Host "  ✔ Python deps installed" -ForegroundColor Green

# 3. Frontend dependencies
Write-Host "[3/5] Frontend dependencies..." -ForegroundColor Yellow
Set-Location (Join-Path $root "frontend")
pnpm install
Write-Host "  ✔ Frontend deps installed" -ForegroundColor Green

# 4. Remotion dependencies
Write-Host "[4/5] Remotion dependencies..." -ForegroundColor Yellow
Set-Location (Join-Path $root "backend" "remotion-project")
npm install
Write-Host "  ✔ Remotion deps installed" -ForegroundColor Green

# 5. Environment file
Write-Host "[5/5] Environment file..." -ForegroundColor Yellow
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $root ".env.example") $envFile
    Write-Host "  ✔ Created .env from .env.example" -ForegroundColor Green
} else {
    Write-Host "  ✔ .env already exists" -ForegroundColor Green
}

Set-Location $root
Write-Host "`n=== Setup complete! ===" -ForegroundColor Cyan
Write-Host "Run: cd frontend && pnpm dev:all" -ForegroundColor White
