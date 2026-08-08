import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  AbsoluteFill,
  Sequence,
} from 'remotion';

// =============================================================================
// COMPOSITION CONFIG
// =============================================================================
export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 238, // 7.93s @ 30 FPS
  fps: 30,
  width: 3840,
  height: 2160,
};

// =============================================================================
// STYLE CONSTANTS
// =============================================================================
const COLORS = {
  primary: '#ddb7ff',    // Soft Lavender
  secondary: '#4fdbc8',  // Neon Cyan / Turquoise
  background: '#0b1326', // Deep Dark Blue
  surface: '#171f33',    // Dark Surface Card
  accent: '#ffb4ab',     // Soft Coral / Red-Pink Accent
  text: '#dae2fd',       // Light Ice Blue Text
  textMuted: '#8b9bb4',  // Muted Slate Text
} as const;

const TYPOGRAPHY = {
  fontFamily: 'Inter, Montserrat, system-ui, -apple-system, sans-serif',
  monospace: 'JetBrains Mono, Fira Code, Courier New, monospace',
} as const;

const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

// =============================================================================
// PRE-GENERATED SEEDED DATA
// =============================================================================
const seededRandom = (seed: number): number => {
  const x = Math.sin((seed + 1) * 9999) * 10000;
  return x - Math.floor(x);
};

const PARTICLES = Array.from({ length: 40 }, (_, i) => ({
  x: seededRandom(i * 3.1) * 3840,
  y: seededRandom(i * 7.7) * 2160,
  size: 6 + seededRandom(i * 5.3) * 12,
  speed: 0.5 + seededRandom(i * 2.9) * 1.5,
  delay: Math.floor(seededRandom(i * 11.1) * 60),
}));

// =============================================================================
// GLOBAL BACKGROUND COMPONENT
// =============================================================================
const BackgroundGrid: React.FC = () => {
  const frame = useCurrentFrame();
  const driftY = interpolate(frame, [0, compositionConfig.durationInFrames], [0, -180], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, overflow: 'hidden' }}>
      {/* Ambient Glows */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '-10%',
          width: '55%',
          height: '55%',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.primary}22 0%, transparent 70%)`,
          filter: 'blur(140px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '-10%',
          width: '60%',
          height: '60%',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.secondary}18 0%, transparent 70%)`,
          filter: 'blur(160px)',
        }}
      />

      {/* SVG Tech Grid Pattern */}
      <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.12 }}>
        <defs>
          <pattern
            id="grid-4k-outro"
            width={120}
            height={120}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(0, ${driftY})`}
          >
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke={COLORS.primary} strokeWidth={2} />
            <circle cx={0} cy={0} r={3} fill={COLORS.secondary} opacity={0.6} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-4k-outro)" />
      </svg>

      {/* Floating Particles */}
      {PARTICLES.map((p, i) => {
        const opacity = interpolate(
          frame,
          [p.delay, p.delay + 30, compositionConfig.durationInFrames - 30],
          [0, 0.4, 0.4],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        const yPos = (p.y - frame * p.speed * 2) % 2160;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: yPos < 0 ? yPos + 2160 : yPos,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              backgroundColor: i % 2 === 0 ? COLORS.secondary : COLORS.primary,
              opacity,
              boxShadow: `0 0 16px ${i % 2 === 0 ? COLORS.secondary : COLORS.primary}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 1: Rescued Server from Landfill (0.00s - 1.68s | 0 - 50 frames)
// =============================================================================
const Fragment1: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, duration], [0.9, 1.0], {
    easing: EASINGS.easeOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const fadeOut = interpolate(frame, [duration - 8, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div
        style={{
          width: 2400,
          height: 1100,
          backgroundColor: COLORS.surface,
          borderRadius: 40,
          border: `4px solid ${COLORS.secondary}`,
          boxShadow: `0 30px 100px ${COLORS.secondary}44`,
          transform: `scale(${scale})`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 40,
          padding: 80,
        }}
      >
        <div style={{ backgroundColor: `${COLORS.secondary}22`, padding: '16px 40px', borderRadius: 20, border: `2px solid ${COLORS.secondary}` }}>
          <span style={{ fontFamily: TYPOGRAPHY.monospace, fontSize: 36, color: COLORS.secondary }}>RESCUED FROM LANDFILL</span>
        </div>

        <h1 style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 120, fontWeight: 900, color: COLORS.text, margin: 0, textAlign: 'center' }}>
          СПАСЛИ МАШИНУ ОТ СВАЛКИ
        </h1>

        <span style={{ fontFamily: TYPOGRAPHY.monospace, fontSize: 40, color: COLORS.textMuted }}>
          [ DELL OPTIPLEX 3050 // LOCAL AI SERVER ]
        </span>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 2: Install Linux & Ollama on Old Laptop (1.68s - 4.80s | 50 - 144 frames)
// =============================================================================
const Fragment2: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const step1 = interpolate(frame, [5, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const step2 = interpolate(frame, [25, 42], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const fadeOut = interpolate(frame, [duration - 10, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut, gap: 50 }}>
      <span style={{ fontFamily: TYPOGRAPHY.monospace, fontSize: 40, color: COLORS.textMuted, letterSpacing: 6 }}>
        OLD LAPTOP RECYCLED
      </span>

      <div style={{ display: 'flex', gap: 60 }}>
        <div
          style={{
            opacity: step1,
            backgroundColor: COLORS.surface,
            padding: '50px 80px',
            borderRadius: 36,
            border: `3px solid ${COLORS.primary}`,
            boxShadow: `0 20px 80px ${COLORS.primary}33`,
            textAlign: 'center',
          }}
        >
          <span style={{ fontFamily: TYPOGRAPHY.monospace, fontSize: 32, color: COLORS.primary }}>STEP 1</span>
          <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 72, fontWeight: 900, color: COLORS.text, margin: '16px 0 0 0' }}>
            ПОСТАВЬТЕ LINUX
          </h2>
        </div>

        <div
          style={{
            opacity: step2,
            backgroundColor: COLORS.surface,
            padding: '50px 80px',
            borderRadius: 36,
            border: `3px solid ${COLORS.secondary}`,
            boxShadow: `0 20px 80px ${COLORS.secondary}33`,
            textAlign: 'center',
          }}
        >
          <span style={{ fontFamily: TYPOGRAPHY.monospace, fontSize: 32, color: COLORS.secondary }}>STEP 2</span>
          <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 72, fontWeight: 900, color: COLORS.text, margin: '16px 0 0 0' }}>
            УСТАНОВИТЕ OLLAMA
          </h2>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 3: Subscribe & Like Call to Action (4.80s - 7.93s | 144 - 238 frames)
// =============================================================================
const Fragment3: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const scale = interpolate(frame, [0, 20], [0.8, 1.0], {
    easing: EASINGS.overshoot,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 50 }}>
      <div style={{ transform: `scale(${scale})`, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
        <h1
          style={{
            fontFamily: TYPOGRAPHY.fontFamily,
            fontSize: 140,
            fontWeight: 900,
            color: COLORS.primary,
            margin: 0,
            textShadow: `0 20px 80px ${COLORS.primary}66`,
          }}
        >
          ПОДПИШИСЬ И ПОСТАВЬ ЛАЙК
        </h1>

        <div style={{ display: 'flex', gap: 40, marginTop: 20 }}>
          <div style={{ backgroundColor: COLORS.secondary, color: COLORS.background, padding: '24px 60px', borderRadius: 24, fontFamily: TYPOGRAPHY.fontFamily, fontSize: 48, fontWeight: 900 }}>
            👍 LIKE
          </div>
          <div style={{ backgroundColor: COLORS.accent, color: COLORS.background, padding: '24px 60px', borderRadius: 24, fontFamily: TYPOGRAPHY.fontFamily, fontSize: 48, fontWeight: 900 }}>
            🔔 SUBSCRIBE
          </div>
        </div>

        <span style={{ fontFamily: TYPOGRAPHY.monospace, fontSize: 36, color: COLORS.textMuted, marginTop: 10 }}>
          💬 КАКУЮ МОДЕЛЬ ЗАПУСТИЛИ БЫ ВЫ?
        </span>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// MAIN COMPOSITION ORCHESTRATION
// =============================================================================
const Scene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <BackgroundGrid />

      {/* Frag 1: 0.00s - 1.68s (0 - 50 frames) */}
      <Sequence from={0} durationInFrames={50}>
        <Fragment1 duration={50} />
      </Sequence>

      {/* Frag 2: 1.68s - 4.80s (50 - 144 frames) */}
      <Sequence from={50} durationInFrames={94}>
        <Fragment2 duration={94} />
      </Sequence>

      {/* Frag 3: 4.80s - 7.93s (144 - 238 frames) */}
      <Sequence from={144} durationInFrames={94}>
        <Fragment3 duration={94} />
      </Sequence>
    </AbsoluteFill>
  );
};

export default Scene;