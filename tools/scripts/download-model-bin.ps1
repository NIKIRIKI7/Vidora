$ErrorActionPreference = "Stop"
$TargetDir = Join-Path $PSScriptRoot "..\..\backend2\data_storage\ai-models\whisper\faster-whisper-small"

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
}

$modelBin = Join-Path $TargetDir "model.bin"
if (Test-Path $modelBin) {
    $size = (Get-Item $modelBin).Length
    if ($size -gt 400000000) {
        Write-Host "model.bin already exists ($([math]::Round($size/1MB, 1)) MB). Skipping." -ForegroundColor Green
        Get-ChildItem $TargetDir | ForEach-Object { Write-Host "  $($_.Name)  $([math]::Round($_.Length/1MB, 1)) MB" }
        exit 0
    }
    Write-Host "model.bin is incomplete ($([math]::Round($size/1MB, 1)) MB). Re-downloading..." -ForegroundColor Yellow
    Remove-Item $modelBin -Force
}

$url = "https://huggingface.co/Systran/faster-whisper-small/resolve/main/model.bin"
Write-Host "Downloading model.bin (~461 MB) from HuggingFace..." -ForegroundColor Cyan
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$progressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri $url -OutFile $modelBin -UseBasicParsing
$progressPreference = 'Continue'

$finalSize = (Get-Item $modelBin).Length
Write-Host "model.bin downloaded: $([math]::Round($finalSize/1MB, 1)) MB" -ForegroundColor Green

Write-Host "`nModel directory contents:" -ForegroundColor Cyan
Get-ChildItem $TargetDir | ForEach-Object { Write-Host "  $($_.Name)  $([math]::Round($_.Length/1MB, 1)) MB" }
