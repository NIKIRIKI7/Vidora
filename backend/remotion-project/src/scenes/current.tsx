import React, { useMemo } from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  AbsoluteFill,
} from 'remotion';

// =============================================================================
// COMPOSITION CONFIG
// =============================================================================
export const compositionConfig = {
  id: 'DynamicBackground',
  durationInSeconds: 10,
  fps: 30,
  width: 1920,
  height: 1080,
};

// =============================================================================
// STYLE CONSTANTS (WINUX 11 FLUENT THEME)
// =============================================================================
const COLORS = {
  primary: '#ddb7ff',     // Lilac Glow
  secondary: '#4fdbc8',   // Mint Cyan Glow
  accent: '#ffb4ab',      // Warm Blush / Coral
  background: '#0b1326',  // Deep Obsidian Dark Navy
  surface: '#171f33',     // Mica Surface
  text: '#dae2fd',
  border: 'rgba(218, 226, 253, 0.12)',
} as const;

const TYPOGRAPHY = {
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
} as const;

const EASINGS = {
  smooth: Easing.bezier(0.25, 0.1, 0.25, 1),
};

// =============================================================================
// COMPONENT: DYNAMIC AMBIENT BACKGROUND
// =============================================================================
const DynamicBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Floating ambient light blooms (Large blur orbs)
  const orb1X = Math.sin(frame / 45) * 60;
  const orb1Y = Math.cos(frame / 40) * 40;
  const orb1Scale = Math.sin(frame / 30) * 0.08 + 1;

  const orb2X = Math.cos(frame / 50) * 55;
  const orb2Y = Math.sin(frame / 45) * 45;
  const orb2Scale = Math.cos(frame / 35) * 0.08 + 1;

  const orb3X = Math.sin(frame / 60) * 40;
  const orb3Y = Math.cos(frame / 55) * 30;
  const orb3Pulse = Math.sin(frame / 25) * 0.1 + 0.9;

  // Grid subtle drift
  const gridShiftX = (frame * 0.4) % 40;
  const gridShiftY = (frame * 0.25) % 40;

  // Procedural floating bokeh particles
  const particles = useMemo(() => {
    return Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      baseX: (i * 83) % 1920,
      speedY: 0.6 + (i % 5) * 0.25,
      radius: 2 + (i % 3) * 1.5,
      driftPhase: i * 1.3,
      opacity: 0.15 + (i % 4) * 0.08,
      color: i % 3 === 0 ? COLORS.primary : i % 3 === 1 ? COLORS.secondary : COLORS.accent,
    }));
  }, []);

  // Aurora wave path calculation
  const waveOffset = frame * 0.03;
  const wavePoints = useMemo(() => {
    const pts = [];
    for (let x = 0; x <= 1920; x += 160) {
      const y =
        540 +
        Math.sin(x * 0.003 + waveOffset) * 90 +
        Math.cos(x * 0.0015 - waveOffset * 0.7) * 50;
      pts.push(`${x},${y}`);
    }
    return pts.join(' L ');
  }, [waveOffset]);

  return (
    <AbsoluteFill
      className="w-full h-full overflow-hidden relative"
      style={{
        backgroundColor: COLORS.background,
        fontFamily: TYPOGRAPHY.fontFamily,
      }}
    >
      {/* 1. Base Layer: Subtle Gradient Radiance */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, #131c33 0%, ${COLORS.background} 80%)`,
        }}
      />

      {/* 2. Primary Lilac Orb (Top Left) */}
      <div
        className="absolute w-[1000px] h-[1000px] rounded-full blur-[170px] pointer-events-none opacity-30"
        style={{
          backgroundColor: COLORS.primary,
          top: '-20%',
          left: '-15%',
          transform: `translate(${orb1X}px, ${orb1Y}px) scale(${orb1Scale})`,
        }}
      />

      {/* 3. Secondary Mint Cyan Orb (Bottom Right) */}
      <div
        className="absolute w-[950px] h-[950px] rounded-full blur-[180px] pointer-events-none opacity-25"
        style={{
          backgroundColor: COLORS.secondary,
          bottom: '-20%',
          right: '-15%',
          transform: `translate(${orb2X}px, ${orb2Y}px) scale(${orb2Scale})`,
        }}
      />

      {/* 4. Warm Blush Center Orb (Soft Midlight) */}
      <div
        className="absolute w-[700px] h-[700px] rounded-full blur-[160px] pointer-events-none opacity-20"
        style={{
          backgroundColor: COLORS.accent,
          top: '30%',
          left: '35%',
          transform: `translate(${orb3X}px, ${orb3Y}px) scale(${orb3Pulse})`,
        }}
      />

      {/* 5. Flowing Fluent Aurora Light Wave */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-25"
        viewBox="0 0 1920 1080"
        fill="none"
      >
        <defs>
          <linearGradient id="auroraGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={COLORS.primary} stopOpacity="0" />
            <stop offset="30%" stopColor={COLORS.primary} stopOpacity="0.8" />
            <stop offset="70%" stopColor={COLORS.secondary} stopOpacity="0.8" />
            <stop offset="100%" stopColor={COLORS.accent} stopOpacity="0" />
          </linearGradient>
          <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="25" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={`M ${wavePoints}`}
          fill="none"
          stroke="url(#auroraGrad)"
          strokeWidth="3.5"
          filter="url(#glowFilter)"
        />
      </svg>

      {/* 6. Subtle Cyber / Fluent Dot Matrix Grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${COLORS.text} 1.5px, transparent 1.5px)`,
          backgroundSize: '40px 40px',
          backgroundPosition: `${gridShiftX}px ${gridShiftY}px`,
        }}
      />

      {/* 7. Floating Bokeh / Cyber Dust Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((p) => {
          const particleY = (1100 - ((frame * p.speedY * 1.8 + p.id * 50) % 1160));
          const particleX = p.baseX + Math.sin(frame * 0.03 + p.driftPhase) * 20;

          return (
            <div
              key={p.id}
              className="absolute rounded-full shadow-lg"
              style={{
                width: `${p.radius * 2}px`,
                height: `${p.radius * 2}px`,
                left: `${particleX}px`,
                top: `${particleY}px`,
                backgroundColor: p.color,
                opacity: p.opacity,
                boxShadow: `0 0 10px ${p.color}`,
              }}
            />
          );
        })}
      </div>

      {/* 8. Cinematic Vignette (Dark Edge Focusing) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 50%, transparent 60%, rgba(11, 19, 38, 0.75) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

export default DynamicBackground;