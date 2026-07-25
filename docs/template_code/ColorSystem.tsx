import React from 'react';
import { useCurrentFrame, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: 'ColorSystem',
  durationInSeconds: 14,
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

const Fragment1Palette: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 161, 176], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const palette = [
    { name: 'Primary', color: COLORS.primary },
    { name: 'Secondary', color: COLORS.secondary },
    { name: 'Accent', color: COLORS.accent },
    { name: 'Background', color: COLORS.background, border: true },
    { name: 'Surface', color: COLORS.surface, border: true },
    { name: 'Text', color: COLORS.text },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '25%', left: 80, right: 80,
        display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center',
      }}>
        {palette.map((item, i) => {
          const itemOpacity = interpolate(frame, [10 + i * 10, 20 + i * 10], [0, 1], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          const glow = interpolate(frame, [20 + i * 10, 40 + i * 10, 80 + i * 10], [0, 1, 0], {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
          });
          return (
            <div key={i} style={{
              opacity: itemOpacity,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 100, height: 100, borderRadius: 20,
                backgroundColor: item.color,
                border: item.border ? `2px solid ${COLORS.primary}44` : 'none',
                boxShadow: glow > 0 ? `0 0 ${30 * glow}px ${item.color}66` : 'none',
              }} />
              <span style={{
                fontFamily: TYPOGRAPHY.body, fontSize: 14, color: item.color, opacity: 0.8,
              }}>
                {item.name}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 120,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 32, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Vidora использует шестицветную палитру.<br />Первичный, вторичный, акцентный,<br />фон, поверхность, текст.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment2ColorChange: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 161, 173], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [15, 45], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const colorOffset = Math.floor(frame / 30) % 3;
  const colorSets = [
    { primary: COLORS.primary, secondary: COLORS.secondary },
    { primary: '#4fdbc8', secondary: '#ddb7ff' },
    { primary: '#ffb4ab', secondary: '#4fdbc8' },
  ];
  const c = colorSets[colorOffset];
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '25%', left: 80, right: 80,
        display: 'flex', gap: 20,
      }}>
        <div style={{
          flex: 1, backgroundColor: COLORS.surface, borderRadius: 16,
          padding: 20, border: `1px solid ${c.primary}44`,
        }}>
          <div style={{
            width: '100%', height: 80, backgroundColor: c.primary, borderRadius: 8, opacity: 0.3,
          }} />
          <div style={{
            width: '70%', height: 14, backgroundColor: c.text, borderRadius: 3, marginTop: 16, opacity: 0.12,
          }} />
          <div style={{
            width: '50%', height: 14, backgroundColor: c.text, borderRadius: 3, marginTop: 8, opacity: 0.12,
          }} />
        </div>
        <div style={{
          flex: 1, backgroundColor: COLORS.surface, borderRadius: 16,
          padding: 20, border: `1px solid ${c.secondary}44`,
        }}>
          <div style={{
            width: '100%', height: 80, backgroundColor: c.secondary, borderRadius: 8, opacity: 0.3,
          }} />
          <div style={{
            width: '60%', height: 14, backgroundColor: c.text, borderRadius: 3, marginTop: 16, opacity: 0.12,
          }} />
          <div style={{
            width: '40%', height: 14, backgroundColor: c.text, borderRadius: 3, marginTop: 8, opacity: 0.12,
          }} />
        </div>
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 120,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 30, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Меняешь цвета в настройках —<br />весь проект подстраивается.<br />Единый стиль без лишней работы.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment3FinalLogo: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 40, 49], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const scale = interpolate(frame, [0, 20], [0.8, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  return (
    <AbsoluteFill style={{
      backgroundColor: COLORS.background, opacity,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <div style={{
        transform: `scale(${scale})`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30,
      }}>
        <div style={{
          width: 140, height: 140, borderRadius: 36,
          backgroundColor: COLORS.primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 60px ${COLORS.primary}44`,
        }}>
          <span style={{ fontSize: 64, fontWeight: 800, color: COLORS.background }}>V</span>
        </div>
        <span style={{
          fontFamily: TYPOGRAPHY.heading, fontSize: 42, color: COLORS.text,
          fontWeight: 300, letterSpacing: 4,
        }}>
          Vidora. Пиши. Создавай. Вдохновляй.
        </span>
      </div>
    </AbsoluteFill>
  );
};

const ColorSystem: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={176}>
        <Fragment1Palette />
      </Sequence>
      <Sequence from={176} durationInFrames={173}>
        <Fragment2ColorChange />
      </Sequence>
      <Sequence from={349} durationInFrames={71}>
        <Fragment3FinalLogo />
      </Sequence>
    </AbsoluteFill>
  );
};

export default ColorSystem;
