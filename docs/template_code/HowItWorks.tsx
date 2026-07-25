import React from 'react';
import { useCurrentFrame, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: 'HowItWorks',
  durationInSeconds: 15,
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

const Fragment1SplitScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 143, 158], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{ flex: 1, display: 'flex', padding: 40, gap: 20, paddingTop: 120 }}>
        <div style={{
          flex: 1, backgroundColor: COLORS.surface, borderRadius: 16,
          border: `1px solid ${COLORS.primary}22`, padding: 20, overflow: 'hidden',
        }}>
          <div style={{ width: 40, height: 12, backgroundColor: COLORS.primary, borderRadius: 4, marginBottom: 16, opacity: 0.5 }} />
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{
              width: `${60 + Math.random() * 30}%`, height: 14,
              backgroundColor: COLORS.text, borderRadius: 3,
              marginBottom: 10, opacity: 0.15 + i * 0.05,
            }} />
          ))}
        </div>
        <div style={{
          flex: 1, backgroundColor: COLORS.surface, borderRadius: 16,
          border: `1px solid ${COLORS.secondary}22`, padding: 20, overflow: 'hidden',
        }}>
          <div style={{ width: '100%', height: '60%', backgroundColor: COLORS.primary, borderRadius: 8, opacity: 0.2 }} />
          <div style={{ width: '100%', height: 12, backgroundColor: COLORS.secondary, borderRadius: 3, marginTop: 12, opacity: 0.15 }} />
          <div style={{ width: '70%', height: 12, backgroundColor: COLORS.secondary, borderRadius: 3, marginTop: 8, opacity: 0.15 }} />
        </div>
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 120,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 32, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Вы пишете сценарий в формате Markdown.<br />Разбиваете на сцены.<br />Добавляете визуальные ремарки.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment2TextToCode: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 135, 150], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const lines = [
    'export const Scene', '  durationInFrames:', '  <AbsoluteFill>', '    interpolate',
    '    Sequence', '  </AbsoluteFill>', 'export default Scene',
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{ position: 'absolute', top: 160, left: 80, right: 80, bottom: 260, overflow: 'hidden' }}>
        <div style={{
          backgroundColor: '#0d1117', borderRadius: 16, padding: 30,
          border: `1px solid ${COLORS.primary}33`, height: '100%', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: '#27c93f' }} />
          </div>
          {lines.map((line, i) => {
            const lineOpacity = interpolate(frame, [10 + i * 15, 25 + i * 15], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            });
            const lineX = interpolate(frame, [10 + i * 15, 25 + i * 15], [60, 0], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              easing: Easing.bezier(0.33, 1, 0.68, 1),
            });
            return (
              <div key={i} style={{
                opacity: lineOpacity, transform: `translateX(${lineX}px)`,
                fontFamily: 'monospace', fontSize: 22, color: COLORS.primary,
                marginBottom: 12, letterSpacing: 0.5,
              }}>
                <span style={{ color: COLORS.secondary, marginRight: 16 }}>{i + 1}</span>
                {line}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 80,
        padding: '0 40px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 28, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.4, margin: 0,
        }}>
          Vidora через ИИ генерирует Remotion-компоненты.<br />Каждая сцена — отдельный TSX-файл<br />с анимацией.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment3CodeGeneration: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, 85, 101], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const scrollY = interpolate(frame, [0, 101], [0, -400], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const codeLines = Array.from({ length: 30 }, (_, i) => `const line${i} = 'code ${i}';`);
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: 140, left: 80, right: 80, bottom: 260, overflow: 'hidden',
        backgroundColor: '#0d1117', borderRadius: 16,
        border: `1px solid ${COLORS.primary}22`, padding: 20,
      }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27c93f' }} />
        </div>
        <div style={{ transform: `translateY(${scrollY}px)` }}>
          {codeLines.map((line, i) => (
            <div key={i} style={{
              fontFamily: 'monospace', fontSize: 18, color: COLORS.primary,
              marginBottom: 8, opacity: 0.3 + (i % 3) * 0.2,
            }}>
              <span style={{ color: COLORS.secondary, marginRight: 12, opacity: 0.4 }}>{i + 1}</span>
              {line}
            </div>
          ))}
        </div>
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 80,
        padding: '0 40px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 28, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Никакого видеомонтажа. Никаких таймлайнов.<br />Только текст и магия нейросетей.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const HowItWorks: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={158}>
        <Fragment1SplitScreen />
      </Sequence>
      <Sequence from={170} durationInFrames={150}>
        <Fragment2TextToCode />
      </Sequence>
      <Sequence from={344} durationInFrames={106}>
        <Fragment3CodeGeneration />
      </Sequence>
    </AbsoluteFill>
  );
};

export default HowItWorks;
