import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: 'InterfaceControl',
  durationInSeconds: 19,
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

const Fragment1Panorama: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 212, 228], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 55], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const sidebarW = 200;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{ display: 'flex', height: '100%', padding: 20, gap: 16, paddingTop: 100 }}>
        <div style={{
          width: sidebarW, backgroundColor: COLORS.surface, borderRadius: 16,
          border: `1px solid ${COLORS.primary}22`, padding: 16,
        }}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              padding: 12, marginBottom: 8, borderRadius: 8,
              backgroundColor: i === 1 ? COLORS.primary22 : 'transparent',
              fontFamily: TYPOGRAPHY.body, fontSize: 14, color: COLORS.text, opacity: 0.7,
            }}>
              Сцена {i + 1}
            </div>
          ))}
        </div>
        <div style={{
          flex: 1, backgroundColor: COLORS.surface, borderRadius: 16,
          border: `1px solid ${COLORS.primary}22`, padding: 20, overflow: 'hidden',
        }}>
          <div style={{ width: '100%', height: 24, backgroundColor: COLORS.primary, borderRadius: 4, marginBottom: 16, opacity: 0.2 }} />
          <div style={{ width: '90%', height: 14, backgroundColor: COLORS.text, borderRadius: 3, marginBottom: 10, opacity: 0.12 }} />
          <div style={{ width: '75%', height: 14, backgroundColor: COLORS.text, borderRadius: 3, marginBottom: 10, opacity: 0.12 }} />
          <div style={{ width: '85%', height: 14, backgroundColor: COLORS.text, borderRadius: 3, marginBottom: 10, opacity: 0.12 }} />
          <div style={{
            marginTop: 16, padding: 12, backgroundColor: COLORS.background, borderRadius: 8,
            fontFamily: 'monospace', fontSize: 13, color: COLORS.secondary, opacity: 0.5,
          }}>
            {'<Sequence from={0}>'}
          </div>
        </div>
        <div style={{
          width: sidebarW, backgroundColor: COLORS.surface, borderRadius: 16,
          border: `1px solid ${COLORS.secondary}22`, padding: 16,
        }}>
          <div style={{ fontFamily: TYPOGRAPHY.body, fontSize: 12, color: COLORS.secondary, marginBottom: 12, opacity: 0.8 }}>
            Аудио
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              height: 30, backgroundColor: COLORS.secondary, borderRadius: 4, marginBottom: 8, opacity: 0.15 + i * 0.05,
            }} />
          ))}
        </div>
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 100,
        padding: '0 40px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 28, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Трехпанельный редактор. Слева — сцены.<br />По центру — сценарий и код.<br />Справа — аудиосинхронизация.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment2FragmentMenu: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 190, 205], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 55], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const menuItems = ['Prompt', 'Code', 'B-roll', 'Audio'];
  const highlightIdx = Math.floor(frame / 25) % 4;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '28%', left: 80, right: 80,
        backgroundColor: COLORS.surface, borderRadius: 24, padding: 40,
        border: `2px solid ${COLORS.primary}44`,
      }}>
        <div style={{
          width: '100%', height: 160, backgroundColor: COLORS.background, borderRadius: 12,
          marginBottom: 30, border: `1px solid ${COLORS.primary}22`,
        }} />
        <div style={{ display: 'flex', gap: 12 }}>
          {menuItems.map((item, i) => {
            const isHighlight = i === highlightIdx;
            return (
              <div key={i} style={{
                flex: 1, padding: '16 8', borderRadius: 12, textAlign: 'center',
                backgroundColor: isHighlight ? COLORS.primary22 : COLORS.background,
                border: `1px solid ${isHighlight ? COLORS.primary : 'transparent'}`,
                fontFamily: TYPOGRAPHY.body, fontSize: 16, color: isHighlight ? COLORS.primary : COLORS.text,
                fontWeight: isHighlight ? 600 : 400,
              }}>
                {item}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 100,
        padding: '0 40px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 26, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Каждый фрагмент можно доработать отдельно:<br />сгенерировать промпт, поправить код,<br />добавить B-roll или голос за кадром.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment3ProjectSwitch: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 108, 120], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const dropdownOpen = frame > 30;
  const projects = ['Vidora Promo', 'Product Hunt', 'Twitter Ad', 'YouTube Intro'];
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '30%', left: 200, right: 200,
        backgroundColor: COLORS.surface, borderRadius: 16,
        border: `1px solid ${COLORS.primary}33`, padding: 20,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 16, backgroundColor: COLORS.background, borderRadius: 10,
          cursor: 'pointer',
        }}>
          <span style={{ fontFamily: TYPOGRAPHY.body, fontSize: 20, color: COLORS.text }}>
            Vidora Promo
          </span>
          <span style={{ color: COLORS.primary, fontSize: 14 }}>▼</span>
        </div>
        {dropdownOpen && (
          <div style={{ marginTop: 8 }}>
            {projects.slice(1).map((name, i) => {
              const itemOpacity = interpolate(frame, [35 + i * 8, 45 + i * 8], [0, 1], {
                extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              });
              return (
                <div key={i} style={{
                  opacity: itemOpacity, padding: 14, borderRadius: 8, marginTop: 4,
                  backgroundColor: 'transparent',
                  fontFamily: TYPOGRAPHY.body, fontSize: 18, color: COLORS.text, opacity: 0.6 * itemOpacity,
                  cursor: 'pointer',
                }}>
                  {name}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div style={{
        opacity: textOpacity, position: 'absolute', bottom: 160,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 30, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Работай с несколькими проектами<br />одновременно — переключайся<br />в один клик.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const InterfaceControl: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={228}>
        <Fragment1Panorama />
      </Sequence>
      <Sequence from={228} durationInFrames={205}>
        <Fragment2FragmentMenu />
      </Sequence>
      <Sequence from={433} durationInFrames={137}>
        <Fragment3ProjectSwitch />
      </Sequence>
    </AbsoluteFill>
  );
};

export default InterfaceControl;
