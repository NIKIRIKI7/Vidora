using System.Diagnostics;
using System.Runtime.InteropServices;
using Kernel.Platform.Config;
using Kernel.Platform.Gpu;
using Microsoft.Extensions.Options;
using SystemContext.Contracts;

namespace SystemContext.Application.Services;

public sealed class HardwareMonitorService
{
    private readonly IGpuManager _gpuManager;
    private readonly AppStorageConfig _storageConfig;
    private static readonly DateTime StartTime = DateTime.UtcNow;

    public HardwareMonitorService(
        IGpuManager gpuManager,
        IOptions<AppStorageConfig> storageConfig)
    {
        _gpuManager = gpuManager;
        _storageConfig = storageConfig.Value;
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
