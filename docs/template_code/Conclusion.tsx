import React from 'react';
import { useCurrentFrame, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: 'Conclusion',
  durationInSeconds: 10,
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

const Fragment1Speaker: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 115, 130], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: `radial-gradient(ellipse 50% 40% at 50% 35%, ${COLORS.primary}22 0%, transparent 60%)`,
      }} />
      <div style={{
        position: 'absolute', bottom: 280, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{
          width: 360, height: 360, borderRadius: '50%',
          backgroundColor: COLORS.surface,
          border: `3px solid ${COLORS.primary}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 100, color: COLORS.primary }}>👤</span>
        </div>
      </div>
      <div style={{
        opacity: textOpacity,
        position: 'absolute', bottom: 100,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 34, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Видео — это новый способ говорить.<br />Vidora дает голос каждому тексту.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment2CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 105, 117], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [15, 40], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const buttonScale = interpolate(frame, [30, 45, 60, 75, 90], [1, 1.08, 1, 1.08, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: '15%', left: '20%', right: '20%', bottom: '25%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 60,
      }}>
        <div style={{
          width: 100, height: 100, borderRadius: 24,
          backgroundColor: COLORS.primary, opacity: 0.15,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 48, fontWeight: 800, color: COLORS.primary, opacity: 0.2 }}>V</span>
        </div>
        <div style={{
          padding: '24 80', backgroundColor: COLORS.primary, borderRadius: 60,
          transform: `scale(${buttonScale})`,
          cursor: 'pointer',
          boxShadow: `0 0 30px ${COLORS.primary}44`,
        }}>
          <span style={{
            fontFamily: TYPOGRAPHY.heading, fontSize: 28, fontWeight: 600, color: COLORS.background,
          }}>
            Начать
          </span>
        </div>
      </div>
      <div style={{
        opacity: textOpacity,
        position: 'absolute', bottom: 100,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 32, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Попробуйте Vidora прямо сейчас.<br />Первый проект — бесплатно.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment3FinalFade: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 25, 30], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  return (
    <AbsoluteFill style={{
      backgroundColor: COLORS.background, opacity,
      justifyContent: 'center', alignItems: 'center',
    }}>
      <div style={{
        width: 120, height: 120, borderRadius: 28,
        backgroundColor: COLORS.primary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 30,
      }}>
        <span style={{ fontSize: 52, fontWeight: 800, color: COLORS.background }}>V</span>
      </div>
      <span style={{
        fontFamily: TYPOGRAPHY.heading, fontSize: 48, color: COLORS.text,
        fontWeight: 300, letterSpacing: 6,
      }}>
        Vidora 2026.
      </span>
    </AbsoluteFill>
  );
};

const Conclusion: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={130}>
        <Fragment1Speaker />
      </Sequence>
      <Sequence from={130} durationInFrames={117}>
        <Fragment2CTA />
      </Sequence>
      <Sequence from={247} durationInFrames={53}>
        <Fragment3FinalFade />
      </Sequence>
    </AbsoluteFill>
  );
};

export default Conclusion;
