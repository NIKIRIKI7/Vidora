using Research.Domain.Entities;

namespace Research.Domain.Ports;

public interface IResearchReportExporter
{
    Task<byte[]> ExportToExcelAsync(ResearchRun run, CancellationToken ct = default);
}
