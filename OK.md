# OK — OmniVoice: нативный GGUF-движок вместо Python (Vidora)

## Цель

Полностью убрать Python-зависимость из Voice-пайплайна Vidora и перевести синтез речи
на нативный GGUF-движок: C# + C-ABI-рантайм (`omnivoice_native.dll`), работающий на
скачанных файлах `cstr/omnivoice-GGUF` с бэкендом CUDA 12.

## Решение: честная заглушка без фейкового звука

Была развилка — «мок-заглушка с тестовым звуком» или «честная заглушка». Выбран второй
вариант:

- Полный сквозной plumbing всех 4 параметров синтеза (`speed`, `pitch`,
  `guidance_scale`, `num_steps`) от UI до движка.
- Готовый P/Invoke-слой (`OmniVoiceNativeRuntime`) к будущему `omnivoice_native.dll`.
- При отсутствии рантайма синтез **честно** завершается ошибкой
  `OmniVoiceRuntimeException` с инструкцией сборки — НИКАКОГО фейкового аудио и бипов.

## Что сделано

### Конфигурация (GGUF)
- `OmniVoiceOptions` + `appsettings.json`: `ModelDirectory = data_storage/ai-models/omnivoice-gguf`,
  `BaseModelFileName = omnivoice-q8_0.gguf`, `VocoderModelFileName = omnivoice-tokenizer-f16.gguf`,
  `ClonesCacheDirectory = .../omnivoice-gguf/clones`, `RuntimeDirectory = tools/omnivoice_runtime`,
  `RuntimeFileName = omnivoice_native.dll`, `LogFileName = app_events.jsonl`.

### Новые компоненты (C#)
- `Integrations/OmniVoice/Contracts/OmniVoiceRuntimeException.cs` — понятная ошибка «GGML-рантайм не установлен».
- `Integrations/OmniVoice/Contracts/IOmniVoiceEngine.cs` — в сигнатуры Synthesize/Clone/Design добавлены
  `speed`, `pitch`, `steps`, `guidanceScale`.
- `Integrations/OmniVoice/Native/OmniVoiceNativeRuntime.cs` — P/Invoke-слой: `LocateRuntime()`,
  `IsAvailable()`, `Init(deviceIndex, forceCpu)`, `Synthesize(...)`, `Unload()`. DllImport:
  `ovs_init`, `ovs_synthesize`, `ovs_free_samples`, `ovs_unload` (Cdecl/Ansi).
  Глобальный mutex — один активный device на процесс.
- `Integrations/OmniVoice/Native/NativeOmniVoiceEngine.cs` — полный движок:
  проверка GGUF-артефактов, `EnsureLoadedAsync`, CUDA → CPU fallback, синтез,
  ресемплинг `AudioResampler`, пост-DSP высоты `AudioPitchShifter` (по `pitch`);
  клонирование и дизайн-голоса сохранены (детерминированный RMS/инструкция).
- `Integrations/OmniVoice/Audio/AudioPitchShifter.cs` — честный DSP: phase vocoder
  (Laroche–Dolson), `PitchShift`, `TimeStretch`, `ResampleLinear`, radix-2 FFT/IFFT.
- `Integrations/OmniVoice/Diagnostics/OmniVoiceEventLogger.cs` — JSONL-логирование в
  `data_storage/app_events.jsonl`: `runtime_ready`, `synthesis_ingress`, `pre_inference`,
  `pitch_dsp`, `synthesis_summary`, `synthesis_failure`.

### Сквозная передача параметров
- `VoiceSpec` — `GuidanceScale` (1.0–10.0, default 2.0), `NumSteps` (8–128, default 24),
  валидация `pitch` (0.5–2.0), `speed` (0.2–4.0).
- `VoiceCommands` (`SynthesizeSpeechCommand`, `BatchItemSpec`) — те же параметры.
- `VoiceEndpoints` — DTO с snake/camel алиасами (`guidance_scale`/`guidanceScale`,
  `num_steps`/`numSteps`/`steps`) + `Effective*` значения; `/synthesize`, `/batch`,
  `/api/v1/audio/generate` пробрасывают их.
- `VoiceModule` — формирует `VoiceSpec` со всеми параметрами.
- Провайдеры `OmniVoiceTtsProvider`, `OmniVoiceDesignProvider`, `VoiceCloneProviders` —
  передают параметры в движок.
- Фронтенд: `voice/types.ts`, `voice/api.ts`, `AudioHubView.tsx` шлют `guidance_scale`/`num_steps`.

### Инфраструктура
- `IntegrationsServiceExtensions` — DI: `OmniVoiceNativeRuntime` и `OmniVoiceEventLogger`.
- `SystemDatabaseSeeder` — артефакт `omnivoice` переведён на GGUF-каталог
  (`omnivoice-gguf`, `https://huggingface.co/cstr/omnivoice-GGUF`, `1.0-gguf`),
  добавлена миграция существующей записи со старого ONNX-пути.
- `tools/omnivoice_runtime/omnivoice_native.h` — контракт C-ABI для сборки рантайма.
- Пакет `Microsoft.ML.OnnxRuntime.Gpu` удалён из `backend2.csproj` (больше не нужен).

## Итоги тестирования

- `dotnet build backend2.csproj` — **0 ошибок, 0 предупреждений** (сборка вынесена в темп
  каталог, т.к. запущенный `backend2.exe` блокирует `bin`).
- `dotnet test` — **221 тест / 218 зелёных / 3 красных**. Все 3 падения проверены на чистом
  HEAD (c0cf0e2) в отдельном worktree — **идентичны на базовой линии**, это pre-existing
  проблемы НЕ из этой работы:
  - `SystemOrmTests`: тест ждёт id `whisper-small`, сидер создаёт `whisper-small-ct2`.
  - `ProductionTests.ProcessManager_*`: этап пайплайна падает ещё на HEAD.
  - `WavAudioDecoder_ShouldDecodeRealWavFiles`: нет реальных WAV-файлов в `data_storage`.
- Добавлено 4 новых теста валидации `VoiceSpec` (`GuidanceScale`, `NumSteps`, `Pitch`,
  связка параметров) — все проходят.

## Что отложено осознанно

- Сборка самого `omnivoice_native.dll` из `audio.cpp`/`omnivoice.cpp` (cstr-omnivoice) —
  требует компилятора CUDA 12; контракт зафиксирован в `omnivoice_native.h`, P/Invoke готов.
  До появления DLL синтез честно сообщает об отсутствии рантайма.
- Python-провайдеры (`backend/app/...`, CosyVoice, FishAudio, venv, скрипты) — НЕ удаляются,
  чтобы не сломать существующую загрузку/сборку; чистка вынесена в отдельную задачу.