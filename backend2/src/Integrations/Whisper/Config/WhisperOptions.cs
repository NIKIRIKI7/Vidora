using System.ComponentModel.DataAnnotations;

namespace Integrations.Whisper.Config;

public sealed class WhisperOptions
{
    public const string SectionName = "Integrations:Whisper";

    public WhisperModelOptions Model { get; set; } = new();
    public WhisperHardwareOptions Hardware { get; set; } = new();
    public WhisperInferenceOptions Inference { get; set; } = new();
    public WhisperMemoryOptions MemoryManagement { get; set; } = new();
    public WhisperNativeOptions NativeLibraries { get; set; } = new();

    public void ValidateAndSanitize(Action<string> logWarning)
    {
        if (Hardware.Device.Equals("cpu", StringComparison.OrdinalIgnoreCase) &&
            Hardware.ComputeType.Equals("float16", StringComparison.OrdinalIgnoreCase))
        {
            logWarning("[Whisper:Config] ComputeType 'float16' не поддерживается на CPU. Скорректировано на 'int8'.");
            Hardware.ComputeType = "int8";
        }

        if (Hardware.Device.Equals("cuda", StringComparison.OrdinalIgnoreCase) &&
            Hardware.ComputeType.Equals("float32", StringComparison.OrdinalIgnoreCase))
        {
            logWarning("[Whisper:Config] ComputeType 'float32' на GPU потребляет чрезмерный VRAM. Рекомендуется 'float16'.");
        }

        if (Inference.BeamSize > 1 && Inference.WordTimestamps)
        {
            logWarning("[Whisper:Config] Рекомендуется BeamSize=1 для задач Forced Alignment ради максимального ускорения.");
        }

        if (string.IsNullOrWhiteSpace(Model.DirectoryPath))
        {
            throw new InvalidOperationException("[Whisper:Config] Параметр 'Model:DirectoryPath' не может быть пустым.");
        }
    }
}

public sealed class WhisperModelOptions
{
    [Required]
    public string Name { get; set; } = "small";

    [Required]
    public string DirectoryPath { get; set; } = "data_storage/ai-models/whisper/faster-whisper-small";

    public string DownloadUrl { get; set; } = string.Empty;

    public bool AutoDownloadIfMissing { get; set; } = true;
}

public sealed class WhisperHardwareOptions
{
    public string Device { get; set; } = "cuda";

    public int DeviceIndex { get; set; } = 0;

    public string ComputeType { get; set; } = "float16";

    public int CpuThreads { get; set; } = 4;

    public bool AutoFallbackToCpuOnOom { get; set; } = true;
}

public sealed class WhisperInferenceOptions
{
    public string DefaultLanguage { get; set; } = "ru";

    public int BeamSize { get; set; } = 1;

    public double Patience { get; set; } = 1.0;

    public double Temperature { get; set; } = 0.0;

    public bool WordTimestamps { get; set; } = true;

    public bool SuppressBlank { get; set; } = true;

    public bool EnableVad { get; set; } = true;

    public double VadThreshold { get; set; } = 0.5;

    public int MinSilenceDurationMs { get; set; } = 200;
}

public sealed class WhisperMemoryOptions
{
    public string RetentionPolicy { get; set; } = "UnloadImmediately";

    public int IdleTimeoutSeconds { get; set; } = 60;

    public int VramHeadroomMb { get; set; } = 1024;
}

public sealed class WhisperNativeOptions
{
    public string CudaDirectory { get; set; } = "tools/cuda12";

    public string CustomLibraryPath { get; set; } = string.Empty;
}
