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
  id: 'ConclusionCtaScene',
  durationInSeconds: 7.47,
  durationInFrames: 224,
  fps: 30,
  width: 2160,
  height: 3840,
};

// =============================================================================
// STYLE CONSTANTS
// =============================================================================
const COLORS = {
  primary: '#ddb7ff',
  secondary: '#4fdbc8',
  background: '#0b1326',
  surface: '#171f33',
  accent: '#ffb4ab',
  text: '#dae2fd',
  border: 'rgba(221, 183, 255, 0.15)',
  glow: 'rgba(79, 219, 200, 0.3)',
} as const;

const TYPOGRAPHY = {
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
} as const;

const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
  bounce: Easing.bezier(0.34, 1.3, 0.64, 1),
} as const;

// =============================================================================
// SHARED BACKGROUND & HUD
// =============================================================================
const TechGridBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const gridOffsetY = (frame * 1.8) % 120;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, overflow: 'hidden' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.12 }}>
        <defs>
          <pattern
            id="cta-grid"
            width="120"
            height="120"
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(0, ${gridOffsetY})`}
          >
            <path d="M 120 0 L 0 0 0 120" fill="none" stroke={COLORS.primary} strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cta-grid)" />
      </svg>

      {/* Ambient Glow Orbs */}
      <div
        style={{
          position: 'absolute',
          top: '25%',
          left: '50%',
          width: 1400,
          height: 1400,
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${COLORS.primary}18 0%, rgba(0,0,0,0) 70%)`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '20%',
          right: '-10%',
          width: 1200,
          height: 1200,
          background: `radial-gradient(circle, ${COLORS.secondary}15 0%, rgba(0,0,0,0) 70%)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

const HeaderHUD: React.FC<{ tagText: string }> = ({ tagText }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 160,
        left: 120,
        right: 120,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: COLORS.secondary,
            boxShadow: `0 0 20px ${COLORS.secondary}`,
          }}
        />
        <span
          style={{
            fontFamily: TYPOGRAPHY.fontFamily,
            fontSize: 42,
            fontWeight: 800,
            letterSpacing: 4,
            color: COLORS.secondary,
            textTransform: 'uppercase',
          }}
        >
          {tagText}
        </span>
      </div>
      <div
        style={{
          padding: '12px 32px',
          backgroundColor: COLORS.surface,
          border: `2px solid ${COLORS.border}`,
          borderRadius: 40,
          fontFamily: TYPOGRAPHY.fontFamily,
          fontSize: 36,
          fontWeight: 600,
          color: COLORS.text,
        }}
      >
        SUMMARY & CTA
      </div>
    </div>
  );
};

// =============================================================================
// FRAGMENT 1: DATACENTER ON YOUR PALM (0.00s - 3.04s | 91 frames)
// =============================================================================
const Fragment1DatacenterPalm: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const cardScale = interpolate(frame, [0, 20], [0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  const chassisGlow = interpolate(frame % 30, [0, 15, 30], [0.3, 0.9, 0.3], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const badgeScale = interpolate(frame, [25, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.bounce,
  });

  const exitOpacity = interpolate(frame, [duration - 12, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      <HeaderHUD tagText="FINAL VERDICT" />

      {/* Main Container Card */}
      <div
        style={{
          position: 'absolute',
          top: '25%',
          left: 120,
          right: 120,
          height: 1950,
          backgroundColor: COLORS.surface,
          borderRadius: 48,
          border: `3px solid ${COLORS.border}`,
          boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 80,
          boxSizing: 'border-box',
          transform: `scale(${cardScale})`,
        }}
      >
        <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 42, color: COLORS.secondary, fontWeight: 700 }}>
          ИИ-РЕВОЛЮЦИЯ
        </div>

        <h2
          style={{
            fontFamily: TYPOGRAPHY.fontFamily,
            fontSize: 76,
            fontWeight: 900,
            color: COLORS.text,
            margin: '16px 0 40px 0',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          Дата-центр на вашей ладони
        </h2>

        {/* Assembled Mini PC Visual Box */}
        <div
          style={{
            width: '100%',
            height: 800,
            backgroundColor: 'rgba(11, 19, 38, 0.9)',
            border: `3px solid ${COLORS.border}`,
            borderRadius: 40,
            padding: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            marginBottom: 40,
            overflow: 'hidden',
          }}
        >
          {/* Server Rack Icons Grid Background */}
          <div style={{ display: 'flex', gap: 40, opacity: 0.15, position: 'absolute', top: 40 }}>
            <span style={{ fontSize: 100 }}>🗄️</span>
            <span style={{ fontSize: 100 }}>🖥️</span>
            <span style={{ fontSize: 100 }}>🗄️</span>
          </div>

          {/* Glowing Compact Mini PC Chassis */}
          <div
            style={{
              width: 520,
              height: 330,
              backgroundColor: '#050a14',
              border: `4px solid ${COLORS.secondary}`,
              borderRadius: 36,
              boxShadow: `0 0 ${100 * chassisGlow}px ${COLORS.secondary}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 2,
            }}
          >
            <div style={{ fontSize: 60, marginBottom: 8 }}>⚡</div>
            <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 44, fontWeight: 900, color: '#ffffff', letterSpacing: 2 }}>
              AMD RYZEN AI
            </div>
            <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 28, fontWeight: 800, color: COLORS.primary, marginTop: 8 }}>
              POCKET DATACENTER
            </div>
          </div>
        </div>

        {/* Bottom Power Callout Badge */}
        <div
          style={{
            marginTop: 'auto',
            width: '100%',
            backgroundColor: COLORS.secondary,
            borderRadius: 36,
            padding: '36px 48px',
            transform: `scale(${badgeScale})`,
            boxShadow: `0 20px 60px ${COLORS.secondary}50`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <span style={{ fontSize: 50 }}>🖐️⚡</span>
          <span style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 40, fontWeight: 900, color: COLORS.background, textAlign: 'center' }}>
            МОЩНОСТЬ СЕРВЕРА ДОМА
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 2: COMMUNITY POLL & SUBSCRIBE CTA (3.04s - 7.46s | 133 frames)
// =============================================================================
const Fragment2CommunityCTA: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const cardScale = interpolate(frame, [0, 20], [0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  // Staggered Poll Option Entrances
  const option1Scale = interpolate(frame, [15, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.bounce,
  });

  const option2Scale = interpolate(frame, [30, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.bounce,
  });

  // Subscribe Button Pulse Effect
  const subBtnPulse = interpolate(frame % 25, [0, 12, 25], [1, 1.05, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <HeaderHUD tagText="COMMUNITY POLL & CTA" />

      {/* Main Card */}
      <div
        style={{
          position: 'absolute',
          top: '25%',
          left: 120,
          right: 120,
          height: 1950,
          backgroundColor: COLORS.surface,
          borderRadius: 48,
          border: `3px solid ${COLORS.border}`,
          boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 80,
          boxSizing: 'border-box',
          transform: `scale(${cardScale})`,
        }}
      >
        <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 42, color: COLORS.secondary, fontWeight: 700 }}>
          ВОПРОС ДНЯ
        </div>

        <h2
          style={{
            fontFamily: TYPOGRAPHY.fontFamily,
            fontSize: 70,
            fontWeight: 900,
            color: COLORS.text,
            margin: '12px 0 40px 0',
            textAlign: 'center',
            lineHeight: 1.25,
          }}
        >
          Заменит ли такой ПК подписки на облачный ИИ?
        </h2>

        {/* Poll Options Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30, width: '100%', marginBottom: 40 }}>
          {/* Option 1 */}
          <div
            style={{
              backgroundColor: 'rgba(79, 219, 200, 0.12)',
              border: `3px solid ${COLORS.secondary}`,
              borderRadius: 32,
              padding: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transform: `scale(${option1Scale})`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <span style={{ fontSize: 44 }}>🟢</span>
              <span style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 38, fontWeight: 900, color: COLORS.text }}>
                ДА, КУПИЛ БЫ!
              </span>
            </div>
            <span style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 38, fontWeight: 900, color: COLORS.secondary }}>
              84%
            </span>
          </div>

          {/* Option 2 */}
          <div
            style={{
              backgroundColor: 'rgba(255, 180, 171, 0.12)',
              border: `3px solid ${COLORS.accent}`,
              borderRadius: 32,
              padding: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transform: `scale(${option2Scale})`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <span style={{ fontSize: 44 }}>🔴</span>
              <span style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 38, fontWeight: 900, color: COLORS.text }}>
                НЕТ, ОБЛАКО УДОБНЕЕ
              </span>
            </div>
            <span style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 38, fontWeight: 900, color: COLORS.accent }}>
              16%
            </span>
          </div>
        </div>

        {/* Comment Prompt Banner */}
        <div
          style={{
            width: '100%',
            backgroundColor: 'rgba(11, 19, 38, 0.8)',
            border: `2px dashed ${COLORS.primary}`,
            borderRadius: 32,
            padding: 36,
            textAlign: 'center',
            marginBottom: 40,
          }}
        >
          <span style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 36, fontWeight: 800, color: COLORS.primary }}>
            💬 Напиши свое мнение в комментариях!
          </span>
        </div>

        {/* Subscribe Call-To-Action Button */}
        <div
          style={{
            marginTop: 'auto',
            width: '100%',
            backgroundColor: COLORS.primary,
            borderRadius: 36,
            padding: 44,
            transform: `scale(${subBtnPulse})`,
            boxShadow: `0 20px 60px ${COLORS.primary}60`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <span style={{ fontSize: 50 }}>🔔</span>
          <span style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 44, fontWeight: 900, color: COLORS.background }}>
            ПОДПИСЫВАЙСЯ НА КАНАЛ
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// MAIN COMPOSITION
// =============================================================================
const ConclusionCtaScene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <TechGridBackground />

      {/* Fragment 1: Datacenter on Your Palm (0.00s - 3.04s | 91 frames) */}
      <Sequence from={0} durationInFrames={91}>
        <Fragment1DatacenterPalm duration={91} />
      </Sequence>

      {/* Fragment 2: Community Poll & Subscribe CTA (3.04s - 7.46s | 133 frames) */}
      <Sequence from={91} durationInFrames={133}>
        <Fragment2CommunityCTA duration={133} />
      </Sequence>
    </AbsoluteFill>
  );
};

export default ConclusionCtaScene;