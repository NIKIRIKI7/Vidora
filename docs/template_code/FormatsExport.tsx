import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: 'FormatsExport',
  durationInSeconds: 11,
  fps: 30,
  width: 1080,
  height: 1920,
};

const COLORS = {
  primary: '#ddb7ff',
  secondary: '#4fdbc8',
  accent: '#ffb4ab',
  background: '#0b1326',
  text: '#dae2fd',
  surface: '#171f33',
} as const;

const TYPOGRAPHY = {
  heading: 'Inter, system-ui, sans-serif',
  body: 'Geist, system-ui, sans-serif',
} as const;

const Fragment1PreviewGrid: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 145, 161], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const gridItems = [
    { w: '45%', h: 180, label: '16:9', color: COLORS.primary },
    { w: '25%', h: 280, label: '9:16', color: COLORS.secondary },
    { w: '45%', h: 180, label: '16:9', color: COLORS.accent },
    { w: '25%', h: 280, label: '9:16', color: COLORS.primary },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '30%', left: 60, right: 60,
        display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center',
      }}>
        {gridItems.map((item, i) => {
          const itemScale = interpolate(frame, [10 + i * 8, 20 + i * 8], [0.8, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            easing: Easing.bezier(0.33, 1, 0.68, 1),
          });
          return (
            <div key={i} style={{
              width: item.w, height: item.h,
              backgroundColor: COLORS.surface, borderRadius: 12,
              border: `2px solid ${item.color}44`,
              transform: `scale(${itemScale})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 8,
            }}>
              <div style={{
                width: '60%', height: '50%',
                backgroundColor: item.color, borderRadius: 6, opacity: 0.3,
              }} />
              <span style={{ fontFamily: TYPOGRAPHY.body, fontSize: 16, color: item.color, opacity: 0.7 }}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 160,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 34, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Горизонтальный обзор.<br />Вертикальный Shorts.<br />Любое разрешение — от HD до 4K.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment2RenderProgress: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 115, 131], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 45], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const progress = interpolate(frame, [0, 100], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const done = frame > 90;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '35%', left: 120, right: 120,
        backgroundColor: COLORS.surface, borderRadius: 24, padding: 50,
        border: `1px solid ${COLORS.primary}22`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          border: `4px solid ${done ? COLORS.secondary : COLORS.primary}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 40,
        }}>
          <span style={{ fontSize: 36, color: done ? COLORS.secondary : COLORS.primary }}>
            {done ? '✓' : '⟳'}
          </span>
        </div>
        <div style={{
          width: '100%', height: 12, backgroundColor: COLORS.background, borderRadius: 6, overflow: 'hidden', marginBottom: 20,
        }}>
          <div style={{
            width: `${progress * 100}%`, height: '100%',
            backgroundColor: done ? COLORS.secondary : COLORS.primary,
            borderRadius: 6,
          }} />
        </div>
        <span style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 20, color: COLORS.text, opacity: 0.6,
        }}>
          {done ? 'Готово!' : `${Math.round(progress * 100)}%`}
        </span>
        {done && (
          <div style={{
            marginTop: 30, padding: '12 30', backgroundColor: COLORS.secondary22,
            borderRadius: 8, border: `1px solid ${COLORS.secondary}44`,
          }}>
            <span style={{ fontFamily: TYPOGRAPHY.body, fontSize: 18, color: COLORS.secondary }}>
              video_2026_07_25.mp4
            </span>
          </div>
        )}
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 120,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 32, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Один клик — и видео готово к публикации.<br />MP4, без водяных знаков.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment3PlatformLogos: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, 26, 34], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const platforms = ['YouTube', 'Instagram', 'TikTok', 'Telegram'];
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '40%', left: 0, right: 0,
        display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap',
        padding: '0 40px',
      }}>
        {platforms.map((name, i) => {
          const logoOpacity = interpolate(frame, [5 + i * 6, 15 + i * 6], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          const logoY = interpolate(frame, [5 + i * 6, 15 + i * 6], [30, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            easing: Easing.bezier(0.33, 1, 0.68, 1),
          });
          return (
            <div key={i} style={{
              opacity: logoOpacity, transform: `translateY(${logoY}px)`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 100, height: 100, borderRadius: 24,
                backgroundColor: COLORS.surface, border: `2px solid ${COLORS.primary}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: COLORS.primary }}>
                  {name[0]}
                </span>
              </div>
              <span style={{
                fontFamily: TYPOGRAPHY.body, fontSize: 18, color: COLORS.text, opacity: 0.7,
              }}>
                {name}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const FormatsExport: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={161}>
        <Fragment1PreviewGrid />
      </Sequence>
      <Sequence from={161} durationInFrames={131}>
        <Fragment2RenderProgress />
      </Sequence>
      <Sequence from={292} durationInFrames={38}>
        <Fragment3PlatformLogos />
      </Sequence>
    </AbsoluteFill>
  );
};

export default FormatsExport;
