# install-cuda-toolkit.ps1
# Run this AFTER installing CUDA Toolkit 12.6 from NVIDIA website
# Download: https://developer.nvidia.com/cuda-12-6-3-download-archive
# Also requires cuDNN 8.9.x (NOT cuDNN 9!)

Write-Host "=== Checking CUDA Toolkit Installation ===" -ForegroundColor Cyan

# Check CUDA_PATH
if ($env:CUDA_PATH) {
    Write-Host "[OK] CUDA_PATH: $env:CUDA_PATH" -ForegroundColor Green
} else {
    $cudaPath = "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6"
    if (Test-Path $cudaPath) {
        $env:CUDA_PATH = $cudaPath
        Write-Host "[OK] Found CUDA at: $cudaPath" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] CUDA Toolkit not found. Please install from:" -ForegroundColor Red
        Write-Host "  https://developer.nvidia.com/cuda-12-6-3-download-archive" -ForegroundColor Yellow
        exit 1
    }
}

$cudaBin = Join-Path $env:CUDA_PATH "bin"

# Check for nvcc (compiler)
$nvcc = Join-Path $cudaBin "nvcc.exe"
if (Test-Path $nvcc) {
    Write-Host "[OK] nvcc: $nvcc" -ForegroundColor Green
    & $nvcc --version 2>&1 | Select-String "release"
} else {
    Write-Host "[WARN] nvcc not found at $nvcc" -ForegroundColor Yellow
}

# Check CUDA runtime DLLs
Write-Host "`n=== Checking CUDA runtime ===" -ForegroundColor Cyan
$dlls = @("cudart64_12.dll", "cublas64_12.dll", "cublasLt64_12.dll", "cusparse64_12.dll")
foreach ($dll in $dlls) {
    $path = Join-Path $cudaBin $dll
    if (Test-Path $path) {
        Write-Host "[OK] $dll ($([math]::Round((Get-Item $path).Length/1MB,1)) MB)" -ForegroundColor Green
    } else {
        Write-Host "[WARN] $dll not found" -ForegroundColor Yellow
    }
}

# Check for cuDNN 8 (CRITICAL: ctranslate2 requires cuDNN 8, NOT cuDNN 9)
Write-Host "`n=== Checking cuDNN 8 ===" -ForegroundColor Cyan
$cudnn8 = Join-Path $cudaBin "cudnn64_8.dll"
if (Test-Path $cudnn8) {
    $ver = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($cudnn8)
    Write-Host "[OK] cuDNN 8: $cudnn8 (v$($ver.FileVersion))" -ForegroundColor Green
} else {
    Write-Host "[FAIL] cuDNN 8 NOT found at $cudnn8" -ForegroundColor Red
    Write-Host ""
    Write-Host "  FASTERWHISPER REQUIRES cuDNN 8.9.x, NOT cuDNN 9!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Option A: Download cuDNN 8.9.7 from NVIDIA (requires login):" -ForegroundColor Yellow
    Write-Host "    https://developer.nvidia.com/cudnn-8-9-7-download-archive" -ForegroundColor Yellow
    Write-Host "    Copy bin/*.dll to: $cudaBin" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Option B: Quick install via pip (no CUDA installation needed):" -ForegroundColor Yellow
    Write-Host "    python -m venv C:\cudnn-temp" -ForegroundColor Yellow
    Write-Host "    C:\cudnn-temp\Scripts\pip install nvidia-cudnn-cu12==8.9.7.29" -ForegroundColor Yellow
    Write-Host "    Copy C:\cudnn-temp\Lib\site-packages\nvidia\cudnn\bin\cudnn*8.dll to: $cudaBin" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Option C: Run tools/scripts/install-cudnn8.ps1 (automated)" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Verify all cuDNN 8 split DLLs
$cudnnDlls = Get-ChildItem $cudaBin -Filter "cudnn*8.dll" | Sort-Object Name
Write-Host "  Found $($cudnnDlls.Count) cuDNN 8 DLLs:" -ForegroundColor Green
foreach ($f in $cudnnDlls) {
    Write-Host "    $($f.Name) ($([math]::Round($f.Length/1MB,1)) MB)" -ForegroundColor Green
}

# Now deploy native libs to backend2 bin
$backendBin = Join-Path $PSScriptRoot "..\..\backend2\bin\Debug\net10.0"
$testBin = Join-Path $PSScriptRoot "..\..\backend2\tests\Kernel.Tests\bin\Debug\net10.0"

Write-Host "`n=== Deploying FasterWhisper.NET native libs ===" -ForegroundColor Cyan

$gpuNative = "C:\Users\mcniki\.nuget\packages\fasterwhisper.net.gpu\1.0.8\runtimes\win-x64\native"
if (Test-Path $gpuNative) {
    Write-Host "  Source: $gpuNative (GPU package)" -ForegroundColor Green
    foreach ($dest in @($backendBin, $testBin)) {
        if (Test-Path $dest) {
            Copy-Item "$gpuNative\*" -Destination $dest -Force
            Write-Host "[OK] Copied GPU native libs to: $dest" -ForegroundColor Green
        }
    }
    # Also copy cuDNN 8 to test bin
    foreach ($dest in @($backendBin, $testBin)) {
        if (Test-Path $dest) {
            Copy-Item "$cudaBin\cudnn*8.dll" -Destination $dest -Force
            Write-Host "[OK] Copied cuDNN 8 to: $dest" -ForegroundColor Green
        }
    }
    # Copy CUDA runtime to test bin
    if (Test-Path $testBin) {
        foreach ($dll in $dlls) {
            Copy-Item (Join-Path $cudaBin $dll) -Destination $testBin -Force
        }
        Write-Host "[OK] Copied CUDA runtime to: $testBin" -ForegroundColor Green
    }
} else {
    Write-Host "[WARN] GPU native libs not found at $gpuNative" -ForegroundColor Yellow
    Write-Host "  Run: dotnet restore backend2/backend2.csproj" -ForegroundColor Yellow
}

Write-Host "`n=== Done! Run tests with: ===" -ForegroundColor Green
Write-Host "  dotnet test backend2/tests/Kernel.Tests/Kernel.Tests.csproj --filter ""WhisperDirectApiTest|WhisperNativeIntegrationTests|WhisperBenchmarkTests"" --logger ""console;verbosity=detailed""" -ForegroundColor Yellow
