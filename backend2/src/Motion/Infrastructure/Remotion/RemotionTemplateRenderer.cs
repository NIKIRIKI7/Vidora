using System.Text.Json;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Remotion;

public sealed class RemotionTemplateRenderer : IRemotionTemplateRenderer
{
    public string RenderRootTsx(CompositionConfig composition, object inputProps)
    {
        var propsJson = JsonSerializer.Serialize(inputProps);

        return $$"""
            import React from 'react';
            import { Composition, registerRoot } from 'remotion';
            import Scene from './SceneComponent';
            import './styles.css';

            export const RemotionRoot: React.FC = () => {
                return (
                    <Composition
                        id="Scene"
                        component={Scene}
                        durationInFrames={{{composition.DurationInFrames}}}
                        fps={{{composition.Fps}}}
                        width={{{composition.Width}}}
                        height={{{composition.Height}}}
                        defaultProps={ { props: {{propsJson}} } }
                    />
                );
            };

            registerRoot(RemotionRoot);
            """;
    }

    public string RenderStylesCss(MontageTheme theme)
    {
        return $$"""
            @tailwind base;
            @tailwind components;
            @tailwind utilities;

            :root {
                --color-primary: {{theme.Primary}};
                --color-secondary: {{theme.Secondary}};
                --color-accent: {{theme.Accent}};
                --color-background: {{theme.Background}};
                --color-surface: {{theme.Surface}};
                --color-text: {{theme.Text}};
            }
            """;
    }

    public string RenderInputPropsJson(object inputProps)
    {
        return JsonSerializer.Serialize(inputProps, new JsonSerializerOptions { WriteIndented = true });
    }
}
