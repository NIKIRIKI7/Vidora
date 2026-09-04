using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using SystemContext.Domain.Ports;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Alignment;

public sealed class WhisperAlignmentProvider : IForcedAlignmentProvider
{
    public AlignmentEngineType EngineType => AlignmentEngineType.Whisper;

    private readonly IMlProcessHost _mlHost;
    private readonly IPathResolver _pathResolver;
    private readonly ISystemSettingRepository _settingRepo;
    private readonly ILogger<WhisperAlignmentProvider> _logger;

    public WhisperAlignmentProvider(
        IMlProcessHost mlHost,
        IPathResolver pathResolver,
        ISystemSettingRepository settingRepo,
        ILogger<WhisperAlignmentProvider> logger)
    {
        _mlHost = mlHost;
        _pathResolver = pathResolver;
        _settingRepo = settingRepo;
        _logger = logger;
    }

    public async Task<AlignmentData> AlignAsync(string audioFilePath, string expectedText, CancellationToken ct = default)
    {
        var safeAudio = _pathResolver.ResolveSafePath(audioFilePath);

        var customSetting = await _settingRepo.GetByKeyAsync("voice.whisper_model_path", ct);
        string modelTarget = customSetting?.Value ?? "ai-models/whisper/small.pt";

        var resolvedModelPath = ModelPathResolver.Locate(modelTarget, "data_storage");
        if (string.IsNullOrEmpty(resolvedModelPath))
        {
            var whisperDirCandidates = ModelPathResolver.GetCandidatePaths("ai-models/whisper", "data_storage");
            foreach (var dirPath in whisperDirCandidates)
            {
                if (Directory.Exists(dirPath))
                {
                    var ptFiles = Directory.GetFiles(dirPath, "*.pt");
                    if (ptFiles.Length > 0)
                    {
                        resolvedModelPath = ptFiles[0];
                        break;
                    }
                }
            }
        }

        if (string.IsNullOrEmpty(resolvedModelPath) || !File.Exists(resolvedModelPath))
        {
            _logger.LogError("[WhisperAligner] Веса модели Whisper не найдены по пути: {Path}. Fallback.", modelTarget);
            return FallbackProportionalAlignment(expectedText, safeAudio);
        }

        SyncScriptFile();

        var scriptPath = Path.Combine(Directory.GetCurrentDirectory(), "tools", "scripts", "whisper_align.py");

        _logger.LogInformation("[WhisperAligner] Запуск выравнивания. Скрипт: {Script}, Модель: {Model}",
            scriptPath, resolvedModelPath);

        var payload = new
        {
            audio_path = safeAudio,
            text = expectedText,
            model_path = resolvedModelPath
        };

        ProcessExecutionResult result;
        try
        {
            result = await _mlHost.ExecuteScriptAsync(
                scriptRelativePath: Path.Combine("tools", "scripts", "whisper_align.py"),
                jsonPayload: payload,
                contextName: "Whisper_Alignment",
                acquireGpuLock: true,
                cancellationToken: ct);
        }
        catch (ProcessExecutionException ex)
        {
            _logger.LogError(ex, "[WhisperAligner] Python завершился аварийно (ExitCode: {Code}).\nSTDERR:\n{StdErr}\nSTDOUT:\n{StdOut}",
                ex.ExitCode, ex.StandardError, "");
            return FallbackProportionalAlignment(expectedText, safeAudio);
        }

        try
        {
            return ParseAlignmentJson(result.StandardOutput);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[WhisperAligner] Сбой разбора JSON-вывода Whisper:\n{Output}", result.StandardOutput);
            return FallbackProportionalAlignment(expectedText, safeAudio);
        }
    }

    private AlignmentData ParseAlignmentJson(string jsonOutput)
    {
        if (string.IsNullOrWhiteSpace(jsonOutput))
        {
            throw new InvalidOperationException("Вывод скрипта Whisper пуст.");
        }

        using var doc = JsonDocument.Parse(jsonOutput);
        var root = doc.RootElement;

        if (root.TryGetProperty("status", out var statusProp) && statusProp.GetString() == "error")
        {
            var msg = root.TryGetProperty("message", out var m) ? m.GetString() : "Неизвестная ошибка в скрипте Whisper.";
            throw new InvalidOperationException(msg);
        }

        long totalDurationMs = root.TryGetProperty("total_duration_ms", out var td) ? td.GetInt64() : 0;
        var words = new List<TimedWord>();

        if (root.TryGetProperty("words", out var wordsArr) && wordsArr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in wordsArr.EnumerateArray())
            {
                var word = item.GetProperty("word").GetString() ?? string.Empty;
                var start = item.GetProperty("start_ms").GetInt64();
                var end = item.GetProperty("end_ms").GetInt64();
                var conf = item.TryGetProperty("confidence", out var c) ? c.GetDouble() : 1.0;

                if (!string.IsNullOrWhiteSpace(word))
                {
                    words.Add(new TimedWord(word, start, end, conf));
                }
            }
        }

        _logger.LogInformation("[WhisperAligner] Успешно распознано слов: {Count}, длительность: {Ms} мс", words.Count, totalDurationMs);
        return new AlignmentData(words, totalDurationMs, "Whisper");
    }

    private AlignmentData FallbackProportionalAlignment(string text, string audioPath)
    {
        _logger.LogWarning("[WhisperAligner] ПЕРЕХОД НА FALLBACK (пропорциональное распределение слов)");
        var tokens = text.Split([' ', '\n', '\r', '\t'], StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 0) return AlignmentData.Empty;

        long estimatedDurationMs = 2000;
        if (File.Exists(audioPath))
        {
            var len = new FileInfo(audioPath).Length;
            estimatedDurationMs = Math.Max(500, (long)(len / (48000.0 * 2) * 1000));
        }

        long step = estimatedDurationMs / tokens.Length;
        var list = new List<TimedWord>();
        for (int i = 0; i < tokens.Length; i++)
        {
            long start = i * step;
            long end = (i == tokens.Length - 1) ? estimatedDurationMs : (i + 1) * step;
            list.Add(new TimedWord(tokens[i], start, end, 0.5));
        }

        return new AlignmentData(list, estimatedDurationMs, "FallbackProportional");
    }

    private void SyncScriptFile()
    {
        var targetDir = Path.Combine(Directory.GetCurrentDirectory(), "tools", "scripts");
        if (!Directory.Exists(targetDir)) Directory.CreateDirectory(targetDir);

        var scriptPath = Path.Combine(targetDir, "whisper_align.py");

        var scriptCode = """
#!/usr/bin/env python3
import sys, os, json, wave, torch, whisper
import numpy as np

def load_wav_mono_16k(audio_path):
    with wave.open(audio_path, "rb") as wf:
        sr = wf.getframerate()
        ch = wf.getnchannels()
        width = wf.getsampwidth()
        frames = wf.readframes(wf.getnframes())

        if width == 2:
            data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
        elif width == 4:
            data = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
        elif width == 1:
            data = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
        else:
            raise ValueError(f"Unsupported sample width: {width} bytes")

        if ch > 1:
            data = data.reshape(-1, ch).mean(axis=1)

        if sr != 16000:
            num_target = int(len(data) * 16000 / sr)
            orig_idx = np.linspace(0, len(data) - 1, len(data))
            target_idx = np.linspace(0, len(data) - 1, num_target)
            data = np.interp(target_idx, orig_idx, data).astype(np.float32)

        return data

def main():
    payload_json = os.environ.get("ML_TASK_PAYLOAD")
    if not payload_json:
        print(json.dumps({"status": "error", "message": "ML_TASK_PAYLOAD is missing"}), file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(payload_json)
        audio_path = data["audio_path"]
        expected_text = data.get("text", "")
        model_path = data["model_path"]

        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        device = "cuda" if torch.cuda.is_available() else "cpu"
        use_fp16 = (device == "cuda")

        audio_np = load_wav_mono_16k(audio_path)
        model = whisper.load_model(model_path, device=device)

        result = model.transcribe(
            audio_np,
            initial_prompt=expected_text,
            word_timestamps=True,
            fp16=use_fp16,
            verbose=False
        )

        words = []
        total_duration_ms = int(len(audio_np) / 16000.0 * 1000)

        for segment in result.get("segments", []):
            for w in segment.get("words", []):
                start_ms = int(round(w["start"] * 1000))
                end_ms = int(round(w["end"] * 1000))
                word_str = w["word"].strip()
                confidence = float(w.get("probability", 1.0))
                if word_str:
                    words.append({
                        "word": word_str,
                        "start_ms": start_ms,
                        "end_ms": end_ms,
                        "confidence": round(confidence, 2)
                    })

        print(json.dumps({
            "status": "ok",
            "total_duration_ms": total_duration_ms,
            "words": words
        }, ensure_ascii=False))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
""";

        bool needWrite = true;
        if (File.Exists(scriptPath))
        {
            var existingContent = File.ReadAllText(scriptPath, System.Text.Encoding.UTF8);
            if (string.Equals(existingContent.Trim(), scriptCode.Trim(), StringComparison.Ordinal))
            {
                needWrite = false;
            }
        }

        if (needWrite)
        {
            File.WriteAllText(scriptPath, scriptCode, new System.Text.UTF8Encoding(false));
            _logger.LogInformation("[WhisperAligner] Скрипт whisper_align.py синхронизирован на диск.");
        }
    }
}
