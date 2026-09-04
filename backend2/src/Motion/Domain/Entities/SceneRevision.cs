using Kernel.Platform.Persistence;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Entities;

public class SceneRevision : BaseEntity<long>
{
    public SceneCodeId SceneCodeId { get; private set; }
    public RevisionNumber RevisionNumber { get; private set; }
    public TsxCode SourceCode { get; private set; } = null!;
    public string SourceHash { get; private set; } = string.Empty;
    public RevisionOrigin Origin { get; private set; }

    protected SceneRevision() { }

    internal static SceneRevision Create(
        SceneCodeId sceneCodeId,
        RevisionNumber revisionNumber,
        TsxCode sourceCode,
        RevisionOrigin origin)
    {
        return new SceneRevision
        {
            SceneCodeId = sceneCodeId,
            RevisionNumber = revisionNumber,
            SourceCode = sourceCode,
            SourceHash = sourceCode.Sha256Hash,
            Origin = origin,
            CreatedAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
    }
}
