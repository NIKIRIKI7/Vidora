import React from 'react';
import { useCurrentFrame, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';

export const compositionConfig = {
  id: 'Introduction',
  durationInSeconds: 9,
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

const Fragment1Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 85, 101], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const glow = interpolate(frame, [0, 30, 60, 90], [0.3, 1, 0.5, 0.8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const textY = interpolate(frame, [20, 40], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ opacity, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{
          width: 200, height: 200, borderRadius: 48,
          backgroundColor: COLORS.primary,
          boxShadow: `0 0 ${80 * glow}px ${COLORS.primary}44, 0 0 ${160 * glow}px ${COLORS.primary}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 60,
        }}>
          <span style={{ fontSize: 80, fontWeight: 800, color: COLORS.background }}>V</span>
        </div>
      </div>
      <div style={{
        opacity: textOpacity,
        transform: `translateY(${textY}px)`,
        position: 'absolute', bottom: 280,
        padding: '0 80px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.body, fontSize: 36, color: COLORS.text,
          textAlign: 'center', lineHeight: 1.5, margin: 0,
        }}>
          Создание видео — это сложно.<br />Дорого.<br />Долго.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment2Speaker: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15, 111, 126], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const textOpacity = interpolate(frame, [20, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: `radial-gradient(ellipse 60% 50% at 50% 35%, ${COLORS.primary}22 0%, transparent 70%)`,
      }} />
      <div style={{
        position: 'absolute', bottom: 280, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{
          width: 400, height: 400, borderRadius: '50%',
          backgroundColor: COLORS.surface,
          border: `4px solid ${COLORS.primary}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 120, color: COLORS.primary }}>👤</span>
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
          Но что, если я скажу вам,<br />что теперь достаточно<br />просто написать текст?
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Fragment3Zoom: React.FC = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 37], [1, 1.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.33, 1, 0.68, 1),
  });
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const textOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, transform: `scale(${scale})`, opacity }}>
      <div style={{
        position: 'absolute', top: '20%', left: '10%', right: '10%', bottom: '30%',
        backgroundColor: COLORS.surface, borderRadius: 24,
        border: `1px solid ${COLORS.primary}33`,
        display: 'flex', flexDirection: 'column', padding: 40,
      }}>
        <div style={{ width: '100%', height: 40, backgroundColor: COLORS.primary, borderRadius: 8, marginBottom: 20, opacity: 0.6 }} />
        <div style={{ width: '80%', height: 20, backgroundColor: COLORS.surface, borderRadius: 4, marginBottom: 12, opacity: 0.4 }} />
        <div style={{ width: '60%', height: 20, backgroundColor: COLORS.surface, borderRadius: 4, marginBottom: 12, opacity: 0.4 }} />
        <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
          <div style={{ flex: 1, height: 120, backgroundColor: COLORS.primary, borderRadius: 12, opacity: 0.3 }} />
          <div style={{ flex: 1, height: 120, backgroundColor: COLORS.secondary, borderRadius: 12, opacity: 0.3 }} />
        </div>
      </div>
      <div style={{
        opacity: textOpacity,
        position: 'absolute', bottom: 160,
        padding: '0 60px',
      }}>
        <p style={{
          fontFamily: TYPOGRAPHY.heading, fontSize: 48, color: COLORS.primary,
          textAlign: 'center', fontWeight: 700, margin: 0,
        }}>
          Знакомьтесь — Vidora.
        </p>
      </div>
    </AbsoluteFill>
  );
};

const Introduction: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={101}>
        <Fragment1Logo />
      </Sequence>
      <Sequence from={104} durationInFrames={126}>
        <Fragment2Speaker />
      </Sequence>
      <Sequence from={234} durationInFrames={37}>
        <Fragment3Zoom />
      </Sequence>
    </AbsoluteFill>
  );
};

export default Introduction;
