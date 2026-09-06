# Отчёт: Whisper integration — GPU работает с cuDNN 8

## Статус: ✅ GPU транскрипция работает

### Корневая причина (найдена и решена)

`ctranslate2.dll` (GPU, 126 MB) из `FasterWhisper.NET.Gpu 1.0.8` импортирует `cudnn64_8.dll` (cuDNN v8), **НЕ** `cudnn64_9.dll` (cuDNN v9).

PE import table analysis (pefile):
```
ctranslate2.dll imports:
  cudnn64_8.dll        ← cuDNN 8.9.x required
  cublas64_12.dll
  libiomp5md.dll
```

### Что установлено сейчас

| Компонент | Версия | Путь |
|-----------|--------|------|
| CUDA Toolkit | 12.6.3 | `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6` |
| cuDNN | **8.9.7** | `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin\cudnn64_8.dll` |
| FasterWhisper.NET.Gpu | 1.0.8 | NuGet, `runtimes\win-x64\native\ctranslate2.dll` (126 MB) |
| faster-whisper-small | model | `data_storage/ai-models/whisper/faster-whisper-small/model.bin` (461 MB) |
| GPU | RTX 3050 Laptop | Compute capability 8.6, CUDA driver 616.56 |

### Результаты теста

**GPU режим** (`device: "cuda"`, `computeType: "float16"`):
```
Audio: tts-6866959b120d41dfaae78e4c0e179425_master.wav
Decoded: 39040 samples, 2.44s
=== GPU mode, float16 ===
GPU Model loaded.
Segments: 1
  [0.00-2.44] "Привет, мир! Это тестовое сообщение."
    [0.38-0.54] "Привет," p=0.715
    [0.68-0.98] "мир!" p=0.768
    [1.12-1.14] "Это" p=0.982
    [1.34-1.36] "тест" p=0.773
    [1.70-1.88] "сообщение." p=0.993
    [2.02-2.88] "." p=0.951
```

Test time: ~5 seconds on RTX 3050.

### Важные ограничения

1. **cuDNN 9 НЕ совместима** — `ctranslate2.dll` не загрузится с `cudnn64_9.dll`
2. **GPU-сборка НЕ работает на CPU** — нет SGEMM BLAS backend, 0 сегментов
3. **Копии cuDNN 8 DLL копируются автоматически** через `Kernel.Tests.csproj` target `CopyNativeLibs`
4. **Python `nvidia-cudnn` пакет** содержит cuDNN 8.9.7 — быстрый способ установить без NVIDIA Developer Account

### Файлы проекта

**Backend:**
- `NativeWhisperModel.cs` — async managed API, WAV→float[] decoder
- `WavAudioDecoder.cs` — нативный декодер WAV в float[] 16kHz mono
- `WhisperAlignmentProvider.cs` — обёртка для forced alignment
- `IntegrationsServiceExtensions.cs` — DI registration
- `appsettings.json` — конфигурация: `Device: "cuda"`, `ComputeType: "float16"`

**Тесты:**
- `WhisperDirectApiTest.cs` — GPU→CPU fallback test
- `WhisperNativeIntegrationTests.cs` — 4 integration tests
- `WhisperBenchmarkTests.cs` — RTF benchmark

**Инфраструктура:**
- `Kernel.Tests.csproj` — `CopyNativeLibs` target: копирует FasterWhisper.NET native + cuDNN 8 + CUDA runtime
- `install-cuda-toolkit.ps1` — проверка CUDA + cuDNN 8 + деплой native libs
- `setup-ctranslate2.ps1` — деплой CTranslate2 native libs + cuDNN 8

**Frontend (12+4 файла):**
- InnerTube features (comments, hook, heatmap) + Scenario Bridge
- `tsc --noEmit` проходит

### Как запускать

```powershell
# Чистая сборка + тест
dotnet build backend2/tests/Kernel.Tests/Kernel.Tests.csproj
dotnet test backend2/tests/Kernel.Tests/Kernel.Tests.csproj --filter "WhisperDirectApiTest"

# Все Whisper тесты
dotnet test backend2/tests/Kernel.Tests/Kernel.Tests.csproj --filter "WhisperDirectApiTest|WhisperNativeIntegrationTests|WhisperBenchmarkTests" --logger "console;verbosity=detailed"
```

### Установка на новой машине

1. Установить CUDA Toolkit 12.6: https://developer.nvidia.com/cuda-12-6-3-download-archive
2. Установить cuDNN 8.9.7 (один из вариантов):
   - **Быстрый способ** (без NVIDIA аккаунта):
     ```powershell
     python -m venv C:\cudnn-temp
     C:\cudnn-temp\Scripts\pip install nvidia-cudnn-cu12==8.9.7.29
     Copy-Item C:\cudnn-temp\Lib\site-packages\nvidia\cudnn\bin\cudnn*8.dll "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin\"
     ```
   - **Официальный способ**: https://developer.nvidia.com/cudnn-8-9-7-download-archive
3. Запустить `tools/scripts/install-cuda-toolkit.ps1`
4. Запустить `dotnet test` для верификации
