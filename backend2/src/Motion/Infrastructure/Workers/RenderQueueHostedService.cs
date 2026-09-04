using System.Diagnostics;
using Kernel.Contracts;
using Kernel.Platform.Gpu;
using Kernel.Platform.WebSockets;
using Kernel.Ports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MotionContext.Domain;
using MotionContext.Domain.Entities;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;
using MotionContext.Infrastructure.Persistence;

namespace MotionContext.Infrastructure.Workers;

public sealed class RenderQueueHostedService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly IRenderJobQueue _jobQueue;
    private readonly IGpuManager _gpuManager;
    private readonly IRenderTracker _tracker;
    private readonly IWebSocketGateway _webSocketGateway;
    private readonly ILogger<RenderQueueHostedService> _logger;

    public RenderQueueHostedService(
        IServiceProvider serviceProvider,
        IRenderJobQueue jobQueue,
        IGpuManager gpuManager,
        IRenderTracker tracker,
        IWebSocketGateway webSocketGateway,
        ILogger<RenderQueueHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _jobQueue = jobQueue;
        _gpuManager = gpuManager;
        _tracker = tracker;
        _webSocketGateway = webSocketGateway;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[RenderQueue] Воркер очереди рендеринга инициализирован.");

        await RecoverPendingJobsAsync(stoppingToken);

        await foreach (var jobId in _jobQueue.DequeueAllAsync(stoppingToken))
        {
            try
            {
                await ProcessJobAsync(jobId, stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "[RenderQueue] Непредвиденный сбой при обработке задачи: {JobId}", jobId.Value);
            }
        }
    }

    private async Task RecoverPendingJobsAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MotionDbContext>();

            var pendingJobs = await db.RenderJobs
                .Where(j => j.Status == RenderJobStatus.Queued)
                .OrderBy(j => j.CreatedAt)
                .Select(j => j.Id)
                .ToListAsync(ct);

            foreach (var jobId in pendingJobs)
            {
                _logger.LogInformation("[RenderQueue] Восстановление отложенной задачи {JobId} в канал очереди", jobId.Value);
                await _jobQueue.EnqueueAsync(jobId, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[RenderQueue] Ошибка при восстановлении невыполненных задач");
        }
    }

    private async Task ProcessJobAsync(RenderJobId jobId, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var jobRepo = scope.ServiceProvider.GetRequiredService<IRenderJobRepository>();
        var sceneRepo = scope.ServiceProvider.GetRequiredService<ISceneCodeRepository>();
        var workspaceMgr = scope.ServiceProvider.GetRequiredService<IRemotionWorkspaceManager>();
        var remotionRunner = scope.ServiceProvider.GetRequiredService<IRemotionRunner>();

        var job = await jobRepo.GetByIdAsync(jobId, ct);
        if (job == null || job.Status != RenderJobStatus.Queued) return;

        var sceneCode = await sceneRepo.GetByIdAsync(job.SceneCodeId, ct);
        if (sceneCode == null)
        {
            await FailJobAsync(jobRepo, job, "Связанная сущность SceneCode не найдена.");
            return;
        }

        var revision = sceneCode.FindRevision(job.TargetRevisionNumber);
        if (revision == null)
        {
            await FailJobAsync(jobRepo, job, $"Ревизия #{job.TargetRevisionNumber.Value} не найдена.");
            return;
        }

        job.MarkRendering();
        await jobRepo.UpdateAsync(job, ct);
        await jobRepo.SaveChangesAsync(ct);

        IAsyncDisposable? gpuLock = null;
        WorkspaceMount? mount = null;
        var sw = Stopwatch.StartNew();

        try
        {
            gpuLock = await _gpuManager.AcquireGpuLockAsync("remotion-render", ct);
            mount = await workspaceMgr.PrepareWorkspaceAsync(sceneCode, revision, job.Id, null, ct);

            var progressHandler = new Progress<RemotionProgress>(p =>
            {
                _tracker.Track(job.Id.Value, p.RenderedFrames, p.TotalFrames);
                _ = _webSocketGateway.BroadcastAsync("RENDER_PROGRESS", new ProgressNotificationDto
                {
                    TaskId = job.Id.Value,
                    Stage = "rendering",
                    Current = p.RenderedFrames,
                    Total = p.TotalFrames,
                    Status = JobStatus.Processing,
                    Message = $"Кадр {p.RenderedFrames}/{p.TotalFrames} ({p.Percent}%)"
                }, CancellationToken.None);
            });

            var spec = new RemotionRenderSpec(
                EntryPointTsx: mount.EntryPointTsx,
                CompositionId: "Scene",
                OutputMp4Path: mount.OutputVideoPath,
                Fps: sceneCode.Composition.Fps,
                Width: sceneCode.Composition.Width,
                Height: sceneCode.Composition.Height);

            await remotionRunner.RenderAsync(spec, progressHandler, ct);
            sw.Stop();

            var fileInfo = new FileInfo(mount.OutputVideoPath);
            job.MarkCompleted(mount.OutputVideoPath, fileInfo.Length, sceneCode.Composition.DurationSeconds);

            _logger.LogInformation("[RenderQueue] Задача {JobId} выполнена за {Sec:F1} сек.", job.Id.Value, sw.Elapsed.TotalSeconds);

            await _webSocketGateway.BroadcastAsync("RENDER_COMPLETED", new
            {
                job_id = job.Id.Value,
                output_path = job.OutputPath,
                duration_ms = sw.ElapsedMilliseconds
            }, CancellationToken.None);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("[RenderQueue] Задача {JobId} отменена вызывающей стороной.", job.Id.Value);
            job.Cancel();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[RenderQueue] Сбой задачи {JobId}: {Error}", job.Id.Value, ex.Message);
            job.MarkFailed(ex.Message);

            await _webSocketGateway.BroadcastAsync("RENDER_FAILED", new
            {
                job_id = job.Id.Value,
                error = ex.Message
            }, CancellationToken.None);
        }
        finally
        {
            _tracker.Remove(job.Id.Value);
            if (gpuLock != null)
            {
                await gpuLock.DisposeAsync();
            }

            await jobRepo.UpdateAsync(job, CancellationToken.None);
            await jobRepo.SaveChangesAsync(CancellationToken.None);

            if (mount != null)
            {
                await workspaceMgr.CleanupWorkspaceAsync(mount.WorkspaceDirectory, CancellationToken.None);
            }
        }
    }

    private static async Task FailJobAsync(IRenderJobRepository repo, RenderJob job, string reason)
    {
        job.MarkFailed(reason);
        await repo.UpdateAsync(job, CancellationToken.None);
        await repo.SaveChangesAsync(CancellationToken.None);
    }
}
