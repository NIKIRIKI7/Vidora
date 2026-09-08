param (
    [string]$TargetDir = "$PSScriptRoot/../../backend2/data_storage/ai-models/whisper/faster-whisper-small"
)

$ErrorActionPreference = "Stop"
Write-Host "=== [2/4] Downloading CTranslate2 Whisper model (Small) ===" -ForegroundColor Cyan

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
}

$baseUrl = "https://huggingface.co/Systran/faster-whisper-small/resolve/main"
$files = @(
    "config.json",
    "vocabulary.txt",
    "tokenizer.json",
    "model.bin"
)

foreach ($file in $files) {
    $dest = Join-Path $TargetDir $file
    if (Test-Path $dest) {
        $size = (Get-Item $dest).Length
        Write-Host "  $file already exists ($([math]::Round($size/1MB, 1)) MB), skipping." -ForegroundColor Gray
        continue
    }

    $url = "$baseUrl/$file"
    Write-Host "  Downloading $file..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
        $size = (Get-Item $dest).Length
        Write-Host "  $file saved ($([math]::Round($size/1MB, 1)) MB)." -ForegroundColor Green
    } catch {
        Write-Host "  WARNING: Failed to download $file - $($_.Exception.Message)" -ForegroundColor Red
    }
}

$modelBin = Join-Path $TargetDir "model.bin"
if (Test-Path $modelBin) {
    $size = (Get-Item $modelBin).Length
    Write-Host "`nModel ready at: $TargetDir" -ForegroundColor Green
    Write-Host "  model.bin: $([math]::Round($size/1MB, 1)) MB" -ForegroundColor Cyan
} else {
    Write-Host "`nWARNING: model.bin not found. Download may have failed." -ForegroundColor Red
}
