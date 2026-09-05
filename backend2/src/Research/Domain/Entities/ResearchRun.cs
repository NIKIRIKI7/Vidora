using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using Research.Domain.Events;
using Research.Domain.ValueObjects;

namespace Research.Domain.Entities;

public class ResearchRun : BaseEntity<ResearchRunId>
{
    public const int MaxQueryLength = 200;
    public string TopicQuery { get; private set; } = string.Empty;
    public string Niche { get; private set; } = string.Empty;
    public ResearchStatus Status { get; private set; }
    public string? ErrorMessage { get; private set; }
    public DateTimeOffset? CompletedAt { get; private set; }

    private readonly List<VideoCandidate> _candidates = [];
    public IReadOnlyList<VideoCandidate> Candidates => _candidates.AsReadOnly();

    private readonly List<EarlySignal> _signals = [];
    public IReadOnlyList<EarlySignal> Signals => _signals.AsReadOnly();

    private readonly List<Opportunity> _opportunities = [];
    public IReadOnlyList<Opportunity> Opportunities => _opportunities.AsReadOnly();

    protected ResearchRun() { }

    public static ResearchRun StartNew(ResearchRunId id, string topicQuery, string? niche = null)
    {
        if (string.IsNullOrWhiteSpace(topicQuery))
        {
            throw new ValidationException("topic_query", "Поисковый запрос для исследования обязателен.");
        }

        if (topicQuery.Trim().Length > MaxQueryLength)
        {
            throw new ValidationException("topic_query", $"Длина запроса не должна превышать {MaxQueryLength} символов.");
        }

        var run = new ResearchRun
        {
            Id = id,
            TopicQuery = topicQuery.Trim(),
            Niche = string.IsNullOrWhiteSpace(niche) ? "General" : niche.Trim(),
            Status = ResearchStatus.Queued,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        run.AddDomainEvent(new ResearchRunStartedEvent(run.Id.Value, run.TopicQuery, run.Niche));
        return run;
    }

    public void MarkStatus(ResearchStatus newStatus)
    {
        if (Status is ResearchStatus.Completed or ResearchStatus.Failed or ResearchStatus.Cancelled)
        {
            return;
        }

        Status = newStatus;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new ResearchStageChangedEvent(Id.Value, newStatus));
    }

    public void AddCandidates(IEnumerable<VideoCandidate> candidates)
    {
        foreach (var c in candidates)
        {
            if (_candidates.All(existing => existing.VideoId != c.VideoId))
            {
                _candidates.Add(c);
            }
        }
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void AddSignals(IEnumerable<EarlySignal> signals)
    {
        _signals.AddRange(signals);
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new EarlySignalsIdentifiedEvent(Id.Value, _signals.Count));
    }

    public void AddOpportunities(IEnumerable<Opportunity> opportunities)
    {
        _opportunities.AddRange(opportunities);
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new OpportunitiesSynthesizedEvent(Id.Value, _opportunities.Count));
    }

    public void MarkCompleted()
    {
        if (Status is ResearchStatus.Completed or ResearchStatus.Cancelled) return;
        Status = ResearchStatus.Completed;
        CompletedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new ResearchRunCompletedEvent(Id.Value, _candidates.Count, _signals.Count, _opportunities.Count));
    }

    public void MarkFailed(string reason)
    {
        if (Status is ResearchStatus.Completed or ResearchStatus.Cancelled) return;
        Status = ResearchStatus.Failed;
        ErrorMessage = reason?.Trim() ?? "Неизвестная ошибка анализа виральности.";
        CompletedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new ResearchRunFailedEvent(Id.Value, ErrorMessage));
    }

    public void Cancel()
    {
        if (Status is ResearchStatus.Completed or ResearchStatus.Failed) return;
        Status = ResearchStatus.Cancelled;
        ErrorMessage = "Исследование отменено пользователем.";
        CompletedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTimeOffset.UtcNow;
        AddDomainEvent(new ResearchRunCancelledEvent(Id.Value));
    }
}
