using System.Text.Json.Serialization;

namespace MotionContext.Domain;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum RevisionOrigin
{
    AiGenerated,
    UserEdited,
    Rollback
}
