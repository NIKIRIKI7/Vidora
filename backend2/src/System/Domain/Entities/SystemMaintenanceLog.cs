using Kernel.Platform.Persistence;

namespace SystemContext.Domain.Entities;

public class SystemMaintenanceLog : BaseEntity<long>
{
    public string Operation { get; private set; } = null!;
    public long DurationMs { get; private set; }
    public bool IsSuccess { get; private set; }
    public string? Details { get; private set; }

    protected SystemMaintenanceLog() { }

    public static SystemMaintenanceLog Create(string operation, long durationMs, bool isSuccess, string? details = null)
    {
        return new SystemMaintenanceLog
        {
            Operation = operation,
            DurationMs = durationMs,
            IsSuccess = isSuccess,
            Details = details,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }
}
