import React from 'react';
import {
  useCurrentFrame,
  interpolate,
  Easing,
  AbsoluteFill,
} from 'remotion';

// =============================================================================
// COMPOSITION CONFIG
// =============================================================================
export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 220,
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
} as const;

const TYPOGRAPHY = {
  fontFamily: 'Inter, system-ui, sans-serif',
  codeFamily: 'monospace',
} as const;

const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
};

// =============================================================================
// PRE-GENERATED DATA
// =============================================================================
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

const CODE_SNIPPETS = [
  'for (int i = 0; i < N; i++) {',
  '  for (int j = 0; j < N; j++) {',
  '    sum += matrix[i][j];',
  '  }',
  '}',
  '// Cache miss detected',
  '0x7ffeefbff5c0',
  'L1_CACHE_SIZE = 32768',
  'void fetch_memory(int* addr) {',
  'if (addr not in cache) {',
  '  stall_cpu();',
  'return data;',
  'std::vector<int> data;',
  'performance.now();',
];

const FLYING_CODE = Array.from({ length: 40 }).map((_, i) => ({
  text: CODE_SNIPPETS[Math.floor(seededRandom(i) * CODE_SNIPPETS.length)],
  x: seededRandom(i + 100) * 100, // percentage
  speed: 10 + seededRandom(i + 200) * 20,
  delay: Math.floor(seededRandom(i + 300) * 100),
  opacity: 0.1 + seededRandom(i + 400) * 0.4,
  scale: 0.5 + seededRandom(i + 500) * 1,
}));

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

const ServerRacks: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        opacity: 0.4,
        padding: '0 100px',
        boxSizing: 'border-box',
      }}
    >
      {Array.from({ length: 4 }).map((_, rackIdx) => {
        return (
          <div
            key={rackIdx}
            style={{
              width: 300,
              height: '80%',
              backgroundColor: '#070b17',
              border: `4px solid ${COLORS.surface}`,
              borderRadius: 20,
              display: 'flex',
              flexDirection: 'column',
              padding: 20,
              gap: 20,
              boxShadow: `inset 0 0 50px rgba(0,0,0,0.8)`,
            }}
          >
            {Array.from({ length: 12 }).map((_, unitIdx) => {
              const seed = rackIdx * 100 + unitIdx;
              const blinkRate = 10 + seededRandom(seed) * 20;
              const isBlinking = (frame + seededRandom(seed) * 100) % blinkRate < blinkRate / 2;
              const lightColor = isBlinking ? COLORS.accent : COLORS.surface;
              
              return (
                <div
                  key={unitIdx}
                  style={{
                    width: '100%',
                    height: 80,
                    backgroundColor: COLORS.surface,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 20px',
                    boxSizing: 'border-box',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      backgroundColor: lightColor,
                      boxShadow: isBlinking ? `0 0 20px ${COLORS.accent}` : 'none',
                    }}
                  />
                  <div
                    style={{
                      width: '60%',
                      height: 10,
                      backgroundColor: 'rgba(255,255,255,0.05)',
                      marginLeft: 'auto',
                      borderRadius: 5,
                    }}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

const DownwardGraph: React.FC = () => {
  const frame = useCurrentFrame();
  
  const drawProgress = interpolate(frame, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeInOut,
  });

  const pathLength = 3000;
  const strokeDashoffset = pathLength * (1 - drawProgress);

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: 0.6,
        filter: `drop-shadow(0 0 40px ${COLORS.accent})`,
      }}
    >
      <path
        d="M -200 400 L 400 450 L 800 800 L 1200 700 L 1600 1500 L 2200 2400 L 2500 2400"
        fill="none"
        stroke={COLORS.accent}
        strokeWidth={30}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={strokeDashoffset}
      />
    </svg>
  );
};

const HoodieSilhouette: React.FC = () => {
  const frame = useCurrentFrame();
  
  const floatY = interpolate(Math.sin(frame / 15), [-1, 1], [-20, 20]);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: -100,
        left: '50%',
        transform: `translateX(-50%) translateY(${floatY}px)`,
        width: 1600,
        height: 1600,
      }}
    >
      <svg viewBox="0 0 200 200" width="100%" height="100%">
        {/* Drop shadow definition */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Shoulders and Torso */}
        <path
          d="M 10,220 C 10,130 40,110 100,110 C 160,110 190,130 190,220 Z"
          fill="#040812"
          stroke={COLORS.surface}
          strokeWidth={2}
          filter="url(#glow)"
        />
        {/* Hood/Head dropped down */}
        <path
          d="M 50,115 C 35,40 165,40 150,115 Z"
          fill="#040812"
          stroke={COLORS.surface}
          strokeWidth={2}
        />
        {/* Hands on head (abstract shapes) */}
        <path
          d="M 20,220 C 40,140 70,120 90,125"
          fill="none"
          stroke={COLORS.surface}
          strokeWidth={6}
          strokeLinecap="round"
        />
        <path
          d="M 180,220 C 160,140 130,120 110,125"
          fill="none"
          stroke={COLORS.surface}
          strokeWidth={6}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

const PerformanceKillerScene: React.FC = () => {
  const frame = useCurrentFrame();
  
  const opacity = interpolate(frame, [70, 85], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const scale = interpolate(frame, [70, 85], [1, 1.5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeIn,
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
      }}
    >
      <ServerRacks />
      <DownwardGraph />
      
      {/* Red Vignette for dramatic effect */}
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: 'radial-gradient(circle at center, transparent 30%, rgba(255, 180, 171, 0.15) 100%)',
        }}
      />
      
      <HoodieSilhouette />
    </AbsoluteFill>
  );
};

const FlyingCodeScene: React.FC = () => {
  const frame = useCurrentFrame();
  
  const sceneOpacity = interpolate(frame, [80, 95], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const buttonScale = interpolate(frame, [110, 130], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  const textOpacity = interpolate(frame, [130, 145], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Button pulse effect after appearance
  const pulse = interpolate(
    Math.sin((frame - 130) * 0.1),
    [-1, 1],
    [1, 1.05]
  );
  
  const finalButtonScale = frame > 130 ? pulse : buttonScale;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.background,
        opacity: sceneOpacity,
      }}
    >
      {/* Flying Code Background */}
      {FLYING_CODE.map((code, idx) => {
        // Continuous upward scroll
        const yPos = 4000 - (((frame - 80) * code.speed + code.delay) % 4500);
        
        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              left: `${code.x}%`,
              top: yPos,
              fontFamily: TYPOGRAPHY.codeFamily,
              fontSize: `${40 * code.scale}px`,
              color: idx % 3 === 0 ? COLORS.secondary : COLORS.primary,
              opacity: code.opacity,
              whiteSpace: 'nowrap',
              transform: 'translateX(-50%)',
            }}
          >
            {code.text}
          </div>
        );
      })}

      {/* Central Subscribe UI */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 60,
          width: '100%',
        }}
      >
        <div
          style={{
            fontFamily: TYPOGRAPHY.fontFamily,
            fontSize: 80,
            fontWeight: 800,
            color: COLORS.text,
            opacity: textOpacity,
            letterSpacing: 4,
            textAlign: 'center',
            textTransform: 'uppercase',
            textShadow: `0 10px 40px ${COLORS.background}`,
          }}
        >
          Думай как процессор
        </div>

        <div
          style={{
            transform: `scale(${finalButtonScale})`,
            backgroundColor: COLORS.secondary,
            padding: '60px 140px',
            borderRadius: 80,
            boxShadow: `0 30px 100px rgba(79, 219, 200, 0.4), inset 0 0 40px rgba(255,255,255,0.4)`,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            border: `6px solid ${COLORS.text}`,
          }}
        >
          <span
            style={{
              fontFamily: TYPOGRAPHY.fontFamily,
              fontSize: 100,
              fontWeight: 900,
              color: COLORS.background,
              margin: 0,
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            Подписаться
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const Scene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, overflow: 'hidden' }}>
      {/* Fragment 1: The Performance Killer */}
      <PerformanceKillerScene />
      
      {/* Fragment 2: Subscribe & Code */}
      <FlyingCodeScene />
    </AbsoluteFill>
  );
};

export default Scene;