using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Remotion;

internal interface IRemotionTemplateRenderer
{
    string RenderRootTsx(CompositionConfig composition, object inputProps);
    string RenderStylesCss(MontageTheme theme);
    string RenderInputPropsJson(object inputProps);
}
