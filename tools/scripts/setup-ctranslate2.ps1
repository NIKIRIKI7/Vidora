param (
    [string]$TargetDir = "$PSScriptRoot/../../backend2/tools/cuda12"
)

$ErrorActionPreference = "Stop"
Write-Host "=== [1/4] Checking CUDA 12 environment and deploying CTranslate2 ===" -ForegroundColor Cyan

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
}

try {
    $gpuName = (Get-CimInstance Win32_VideoController | Where-Object { $_.Name -like "*NVIDIA*" }).Name
    if ($gpuName) {
        Write-Host "GPU found: $gpuName" -ForegroundColor Green
    } else {
        Write-Host "No NVIDIA GPU detected. Inference will be CPU-only." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not query GPU. Continuing..." -ForegroundColor Yellow
}

# GPU package (preferred)
$gpuCache = "$env:USERPROFILE\.nuget\packages\fasterwhisper.net.gpu\1.0.8\runtimes\win-x64\native"
if (Test-Path $gpuCache) {
    Write-Host "Found GPU native libs: $gpuCache" -ForegroundColor Green
    Copy-Item "$gpuCache/*" -Destination $TargetDir -Recurse -Force
    Write-Host "Copied GPU libraries to $TargetDir" -ForegroundColor Green
} else {
    # Fallback to CPU package
    $cpuCache = "$env:USERPROFILE\.nuget\packages\fasterwhisper.net"
    if (Test-Path $cpuCache) {
        $nativeDirs = Get-ChildItem -Path $cpuCache -Recurse -Directory -Filter "runtimes" -ErrorAction SilentlyContinue
        foreach ($dir in $nativeDirs) {
            $winX64 = Join-Path $dir.FullName "win-x64\native"
            if (Test-Path $winX64) {
                Write-Host "Found CPU native libs: $winX64" -ForegroundColor Yellow
                Copy-Item "$winX64/*" -Destination $TargetDir -Recurse -Force
                Write-Host "Copied CPU libraries to $TargetDir" -ForegroundColor Green
            }
        }
    }
}

# cuDNN 8 (required for GPU ctranslate2)
Write-Host "`n=== [2/4] Checking cuDNN 8 ===" -ForegroundColor Cyan
$cudaBin = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin"
$cudnn8 = Join-Path $cudaBin "cudnn64_8.dll"
if (Test-Path $cudnn8) {
    Write-Host "[OK] cuDNN 8 found in CUDA bin" -ForegroundColor Green
} else {
    Write-Host "[FAIL] cuDNN 8 NOT found!" -ForegroundColor Red
    Write-Host "  GPU mode requires cuDNN 8.9.x (NOT cuDNN 9)" -ForegroundColor Yellow
    Write-Host "  Run: install-cuda-toolkit.ps1 for instructions" -ForegroundColor Yellow
}

# Copy cuDNN 8 to target dir and test bin
$testBin = "$PSScriptRoot/../../backend2/tests/Kernel.Tests/bin/Debug/net10.0"
foreach ($dest in @($TargetDir, $testBin)) {
    if (Test-Path $dest -and (Test-Path $cudaBin)) {
        Get-ChildItem "$cudaBin\cudnn*8.dll" -ErrorAction SilentlyContinue | ForEach-Object {
            Copy-Item $_.FullName -Destination $dest -Force
        }
    }
}

# Copy CUDA runtime
Write-Host "`n=== [3/4] Copying CUDA runtime ===" -ForegroundColor Cyan
$cudaRuntime = @("cudart64_12.dll", "cublas64_12.dll", "cublasLt64_12.dll", "cusparse64_12.dll")
foreach ($dll in $cudaRuntime) {
    $src = Join-Path $cudaBin $dll
    if (Test-Path $src) {
        Copy-Item $src -Destination $testBin -Force -ErrorAction SilentlyContinue
    }
}

# Copy to runtime output
Write-Host "`n=== [4/4] Copying to runtime output ===" -ForegroundColor Cyan
$binTarget = "$PSScriptRoot/../../backend2/bin/Debug/net10.0"
if (Test-Path $binTarget) {
    Copy-Item "$TargetDir/*" -Destination $binTarget -Force -ErrorAction SilentlyContinue
    Write-Host "Copied to backend2: $binTarget" -ForegroundColor Green
}
if (Test-Path $testBin) {
    Copy-Item "$TargetDir/*" -Destination $testBin -Force -ErrorAction SilentlyContinue
    Write-Host "Copied to tests: $testBin" -ForegroundColor Green
}

Write-Host "`nCTranslate2 setup complete. Libraries at: $TargetDir" -ForegroundColor Green
Write-Host "Package: FasterWhisper.NET.Gpu 1.0.8 (GPU-enabled, requires cuDNN 8.9.x)" -ForegroundColor Cyan
