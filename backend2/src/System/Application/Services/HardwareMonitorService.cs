using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using Kernel.Platform.Config;
using Kernel.Platform.Gpu;
using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Contracts;

namespace SystemContext.Application.Services;

public sealed class HardwareMonitorService
{
    private readonly IGpuManager _gpuManager;
    private readonly IProcessSupervisor _processSupervisor;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<HardwareMonitorService> _logger;
    private static readonly DateTime StartTime = DateTime.UtcNow;

    public HardwareMonitorService(
        IGpuManager gpuManager,
        IProcessSupervisor processSupervisor,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<HardwareMonitorService> logger)
    {
        _gpuManager = gpuManager;
        _processSupervisor = processSupervisor;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public SystemHardwareStatusDto GetMetrics()
    {
        using var process = Process.GetCurrentProcess();
        var memoryMb = Math.Round((double)process.WorkingSet64 / (1024 * 1024), 2);
        var managedMemoryMb = Math.Round((double)GC.GetTotalMemory(forceFullCollection: false) / (1024 * 1024), 2);

        var (freeGb, totalGb) = GetStorageSpace();

        return new SystemHardwareStatusDto
        {
            CpuUsagePercent = Math.Round(GetRoughCpuPercent(process), 2),
            ProcessMemoryMb = memoryMb,
            ManagedMemoryMb = managedMemoryMb,
            StorageFreeGb = freeGb,
            StorageTotalGb = totalGb,
            GpuAvailable = _gpuManager.IsGpuAvailable(),
            OsDescription = RuntimeInformation.OSDescription,
            Uptime = DateTime.UtcNow - StartTime
        };
    }

    public async Task<SystemHardwareInfoDto> GetHardwareInfoAsync(CancellationToken ct = default)
    {
        double ramGb = Math.Round((double)GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / (1024.0 * 1024 * 1024), 1);

        string device = "CPU Mode";
        string gpuType = "cpu";
        double vramGb = 0.0;

        try
        {
            var result = await _processSupervisor.RunAsync(
                "nvidia-smi",
                "--query-gpu=name,memory.total --format=csv,noheader,nounits",
                cancellationToken: ct);

            if (result.ExitCode == 0 && !string.IsNullOrWhiteSpace(result.StandardOutput))
            {
                var line = result.StandardOutput
                    .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
                    .FirstOrDefault();

                if (!string.IsNullOrWhiteSpace(line))
                {
                    var parts = line.Split(',', StringSplitOptions.TrimEntries);
                    if (parts.Length >= 2)
                    {
                        device = parts[0];
                        gpuType = "cuda";
                        if (double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var mb))
                        {
                            vramGb = Math.Round(mb / 1024.0, 1);
                        }
                    }
                    else if (parts.Length == 1)
                    {
                        device = parts[0];
                        gpuType = "cuda";
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "[HardwareMonitor] nvidia-smi недоступен или GPU NVIDIA отсутствует.");
            if (_gpuManager.IsGpuAvailable())
            {
                gpuType = "cuda";
                device = "CUDA Device";
            }
        }

        return new SystemHardwareInfoDto(device, gpuType, vramGb, ramGb);
    }

    private (double FreeGb, double TotalGb) GetStorageSpace()
    {
        try
        {
            var targetDir = Path.GetFullPath(_storageConfig.DataStorageDir);

            var root = Path.GetPathRoot(targetDir);
            if (!string.IsNullOrEmpty(root))
            {
                var drive = new DriveInfo(root);
                var freeGb = Math.Round((double)drive.AvailableFreeSpace / (1024 * 1024 * 1024), 2);
                var totalGb = Math.Round((double)drive.TotalSize / (1024 * 1024 * 1024), 2);
                return (freeGb, totalGb);
            }
        }
        catch
        {
            // Ошибки монтирования/песочницы возвращают нули
        }
        return (0.0, 0.0);
    }

    private static double GetRoughCpuPercent(Process process)
    {
        var totalCpuTime = process.TotalProcessorTime.TotalMilliseconds;
        var totalTimePassed = (DateTime.UtcNow - process.StartTime.ToUniversalTime()).TotalMilliseconds;
        if (totalTimePassed <= 0) return 0.0;
        return (totalCpuTime / (Environment.ProcessorCount * totalTimePassed)) * 100.0;
    }
}
