using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Remotion;

public interface IRemotionTemplateRenderer
{
    string RenderRootTsx(CompositionConfig composition, object inputProps);
    string RenderStylesCss(MontageTheme theme);
    string RenderInputPropsJson(object inputProps);
}
