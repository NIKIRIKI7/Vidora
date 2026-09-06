# install-cudnn8.ps1
# Quick install cuDNN 8.9.7 via pip (no NVIDIA Developer Account needed)
# Requires Python 3.x

$ErrorActionPreference = "Stop"
$cudaBin = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin"

Write-Host "=== Installing cuDNN 8.9.7 for FASTERWHISPER ===" -ForegroundColor Cyan
Write-Host ""

# Check CUDA
if (!(Test-Path $cudaBin)) {
    Write-Host "[FAIL] CUDA Toolkit not found at $cudaBin" -ForegroundColor Red
    Write-Host "Install CUDA Toolkit 12.6 first: https://developer.nvidia.com/cuda-12-6-3-download-archive" -ForegroundColor Yellow
    exit 1
}

# Check if cuDNN 8 already installed
if (Test-Path (Join-Path $cudaBin "cudnn64_8.dll")) {
    $ver = [System.Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $cudaBin "cudnn64_8.dll"))
    Write-Host "[OK] cuDNN 8 already installed (v$($ver.FileVersion))" -ForegroundColor Green
    $answer = Read-Host "Reinstall? (y/N)"
    if ($answer -ne "y") { exit 0 }
}

# Check Python
$python = Get-Command python -ErrorAction SilentlyContinue
if (!$python) {
    Write-Host "[FAIL] Python not found. Install from https://python.org" -ForegroundColor Red
    exit 1
}

# Create temp venv
$tempDir = "C:\Users\$env:USERNAME\AppData\Local\Temp\cudnn-install"
Write-Host "Creating temp venv at $tempDir..." -ForegroundColor Gray
python -m venv $tempDir 2>&1 | Out-Null

# Install cuDNN 8
Write-Host "Installing nvidia-cudnn-cu12==8.9.7.29..." -ForegroundColor Gray
& "$tempDir\Scripts\pip.exe" install nvidia-cudnn-cu12==8.9.7.29 2>&1 | Select-String "Successfully|ERROR"

# Copy DLLs
$srcBin = "$tempDir\Lib\site-packages\nvidia\cudnn\bin"
if (!(Test-Path "$srcBin\cudnn64_8.dll")) {
    Write-Host "[FAIL] cuDNN 8 DLLs not found at $srcBin" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Copying cuDNN 8 DLLs to CUDA bin..." -ForegroundColor Cyan
$script = @"
@echo off
for %%f in ("$srcBin\cudnn*8.dll") do copy /Y "%%f" "$cudaBin\" >nul
"@
$script | Out-File "$env:TEMP\copy_cudnn.bat" -Encoding ascii
Start-Process cmd -ArgumentList "/c $env:TEMP\copy_cudnn.bat" -Verb RunAs -Wait
Start-Sleep 2

# Verify
Write-Host ""
Write-Host "=== Verification ===" -ForegroundColor Cyan
$cudnnFiles = Get-ChildItem $cudaBin -Filter "cudnn*8.dll" | Sort-Object Name
if ($cudnnFiles.Count -gt 0) {
    Write-Host "[OK] cuDNN 8 installed:" -ForegroundColor Green
    foreach ($f in $cudnnFiles) {
        Write-Host "  $($f.Name) ($([math]::Round($f.Length/1MB,1)) MB)" -ForegroundColor Green
    }
} else {
    Write-Host "[FAIL] cuDNN 8 DLLs not found after install" -ForegroundColor Red
    exit 1
}

# Cleanup
Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\copy_cudnn.bat" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done! cuDNN 8.9.7 installed for FasterWhisper GPU support." -ForegroundColor Green
