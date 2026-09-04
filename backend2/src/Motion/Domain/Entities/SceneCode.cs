using Kernel.Exceptions;
using Kernel.Platform.Persistence;
using MotionContext.Domain.Events;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Entities;

public class SceneCode : BaseEntity<SceneCodeId>
{
    public string ProjectId { get; private set; } = string.Empty;
    public string SceneId { get; private set; } = string.Empty;
    public CompositionConfig Composition { get; private set; }
    public RevisionNumber CurrentRevisionNumber { get; private set; }

    private readonly List<SceneRevision> _revisions = [];
    public IReadOnlyList<SceneRevision> Revisions => _revisions.AsReadOnly();

    private readonly HashSet<string> _requiredCapabilities = new(StringComparer.OrdinalIgnoreCase);
    public IReadOnlyCollection<string> RequiredCapabilities => _requiredCapabilities;

    protected SceneCode() { }

    public static SceneCode Create(
        SceneCodeId id,
        string projectId,
        string sceneId,
        CompositionConfig composition,
        TsxCode initialCode,
        RevisionOrigin origin = RevisionOrigin.AiGenerated,
        IEnumerable<string>? capabilities = null)
    {
        if (string.IsNullOrWhiteSpace(projectId))
            throw new ValidationException("project_id", "Идентификатор проекта обязателен.");
        if (string.IsNullOrWhiteSpace(sceneId))
            throw new ValidationException("scene_id", "Идентификатор сцены обязателен.");

        var aggregate = new SceneCode
        {
            Id = id,
            ProjectId = projectId.Trim(),
            SceneId = sceneId.Trim(),
            Composition = composition,
            CurrentRevisionNumber = RevisionNumber.Initial,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };

        if (capabilities != null)
        {
            foreach (var cap in capabilities.Where(c => !string.IsNullOrWhiteSpace(c)))
            {
                aggregate._requiredCapabilities.Add(cap.Trim().ToLowerInvariant());
            }
        }

        var initialRevision = SceneRevision.Create(aggregate.Id, aggregate.CurrentRevisionNumber, initialCode, origin);
        aggregate._revisions.Add(initialRevision);

        aggregate.AddDomainEvent(new SceneCodeGeneratedEvent(
            aggregate.Id.Value,
            aggregate.ProjectId,
            aggregate.SceneId,
            aggregate.CurrentRevisionNumber.Value,
            initialRevision.SourceHash));

        return aggregate;
    }

    public SceneRevision AddRevision(TsxCode newCode, RevisionOrigin origin, IEnumerable<string>? capabilities = null)
    {
        var current = GetCurrentRevision();
        if (string.Equals(current.SourceHash, newCode.Sha256Hash, StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainConflictException(
                "Новый код полностью идентичен активной ревизии сцены.",
                "REVISION_CONTENT_IDENTICAL");
        }

        CurrentRevisionNumber = CurrentRevisionNumber.Next();
        var revision = SceneRevision.Create(Id, CurrentRevisionNumber, newCode, origin);
        _revisions.Add(revision);
        UpdatedAt = DateTimeOffset.UtcNow;

        if (capabilities != null)
        {
            _requiredCapabilities.Clear();
            foreach (var cap in capabilities.Where(c => !string.IsNullOrWhiteSpace(c)))
            {
                _requiredCapabilities.Add(cap.Trim().ToLowerInvariant());
            }
        }

        AddDomainEvent(new SceneRevisionCreatedEvent(Id.Value, CurrentRevisionNumber.Value, origin, revision.SourceHash));
        return revision;
    }

    public SceneRevision RollbackTo(RevisionNumber targetRevisionNumber)
    {
        if (targetRevisionNumber == CurrentRevisionNumber)
        {
            throw new DomainConflictException(
                $"Сцена уже находится на ревизии #{targetRevisionNumber.Value}.",
                "ALREADY_AT_REVISION");
        }

        var target = _revisions.FirstOrDefault(r => r.RevisionNumber == targetRevisionNumber)
            ?? throw new ResourceNotFoundException("SceneRevision", targetRevisionNumber.Value);

        CurrentRevisionNumber = CurrentRevisionNumber.Next();
        var rollbackRevision = SceneRevision.Create(Id, CurrentRevisionNumber, target.SourceCode, RevisionOrigin.Rollback);
        _revisions.Add(rollbackRevision);
        UpdatedAt = DateTimeOffset.UtcNow;

        AddDomainEvent(new SceneRolledBackEvent(Id.Value, targetRevisionNumber.Value, CurrentRevisionNumber.Value));
        return rollbackRevision;
    }

    public void UpdateComposition(CompositionConfig newConfig)
    {
        Composition = newConfig;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public SceneRevision GetCurrentRevision() =>
        _revisions.FirstOrDefault(r => r.RevisionNumber == CurrentRevisionNumber)
        ?? _revisions.OrderByDescending(r => r.RevisionNumber).First();

    public SceneRevision? FindRevision(RevisionNumber number) =>
        _revisions.FirstOrDefault(r => r.RevisionNumber == number);
}
