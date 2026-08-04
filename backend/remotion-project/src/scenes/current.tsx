import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  AbsoluteFill,
  Sequence
} from 'remotion';

// ============================================================================
// COMPOSITION CONFIG
// ============================================================================
export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 747,
  fps: 30,
  width: 3840,
  height: 2160,
};

// ============================================================================
// STYLE CONSTANTS
// ============================================================================
const COLORS = {
  primary: '#ddb7ff',
  secondary: '#4fdbc8',
  background: '#0b1326',
  surface: '#171f33',
  accent: '#ffb4ab',
  text: '#dae2fd',
} as const;

const TYPOGRAPHY = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
} as const;

const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

// ============================================================================
// BACKGROUND
// ============================================================================
const BackgroundGrid: React.FC = () => {
  const frame = useCurrentFrame();

  // 3840 * 0.1 = 384
  const drift = interpolate(frame, [0, 747], [0, -384], { 
    extrapolateLeft: 'clamp', 
    extrapolateRight: 'clamp' 
  });
  
  const gridSize = 153.6; // 3840 * 0.04

  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.1 }}>
      <defs>
        <pattern
          id="bg-grid"
          width={gridSize}
          height={gridSize}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${drift}, ${drift})`}
        >
          <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke={COLORS.primary} strokeWidth={2} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg-grid)" />
    </svg>
  );
};

// ============================================================================
// FRAGMENT 1 (Frames 0 - 55)
// ============================================================================
const Fragment1: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [45, 55], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const scale = interpolate(frame, [0, 20], [0.8, 1], { easing: EASINGS.overshoot, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shackleY = interpolate(frame, [10, 20], [-20, 0], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{
          backgroundColor: COLORS.surface,
          padding: '4% 6%',
          borderRadius: '2%',
          border: `0.3vw solid ${COLORS.primary}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: `0 2vw 4vw rgba(0,0,0,0.5)`,
          opacity,
          transform: `scale(${scale})`
      }}>
         <svg width="10vw" height="10vw" viewBox="0 0 100 100" fill="none">
             <path d="M 25 40 L 25 25 C 25 10, 75 10, 75 25 L 75 40" stroke={COLORS.accent} strokeWidth="8" strokeLinecap="round" style={{ transform: `translateY(${shackleY}px)` }} />
             <rect x="15" y="40" width="70" height="50" rx="10" fill={COLORS.accent} />
         </svg>
         <div style={{ marginTop: '3vw', fontSize: '4vw', fontWeight: 'bold', color: COLORS.text, fontFamily: TYPOGRAPHY.fontFamily }}>
            CLAUDE FABLE 5
         </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// FRAGMENT 2 (Frames 55 - 155)
// ============================================================================
const Fragment2: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [90, 100], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const maskWidth = interpolate(frame, [10, 40], [0, 100], { easing: EASINGS.easeInOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ position: 'relative', fontFamily: TYPOGRAPHY.fontFamily }}>
          <div style={{ 
              fontSize: '5vw', 
              fontWeight: 900, 
              color: `${COLORS.secondary}40`, 
              textAlign: 'center',
          }}>
             Секретная архитектура<br />Anthropic
          </div>
          <div style={{ 
              position: 'absolute',
              top: 0, left: 0, width: '100%',
              fontSize: '5vw', 
              fontWeight: 900, 
              color: COLORS.secondary, 
              textAlign: 'center',
              textShadow: `0 1vw 2vw ${COLORS.secondary}80`,
              clipPath: `polygon(0 0, ${maskWidth}% 0, ${maskWidth}% 100%, 0 100%)`
          }}>
             Секретная архитектура<br />Anthropic
          </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// FRAGMENT 3 (Frames 155 - 238)
// ============================================================================
const Fragment3: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [73, 83], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const gpuScale = interpolate(frame, [0, 20], [0.8, 1], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const stampScale = interpolate(frame, [20, 30], [3, 1], { easing: EASINGS.overshoot, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const stampOpacity = interpolate(frame, [20, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', gap: '4vw', transform: `scale(${gpuScale})` }}>
          {[1, 2, 3].map(i => (
              <div key={i} style={{
                  width: '15vw', height: '20vw', backgroundColor: COLORS.surface,
                  border: `0.3vw solid ${COLORS.primary}`, borderRadius: '1vw',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                  boxShadow: `0 1vw 2vw rgba(0,0,0,0.5)`
              }}>
                  <div style={{ width: '8vw', height: '8vw', backgroundColor: COLORS.secondary, borderRadius: '50%' }} />
                  <div style={{ width: '10vw', height: '2vw', backgroundColor: COLORS.text, marginTop: '2vw', borderRadius: '0.5vw' }} />
              </div>
          ))}
      </div>

      <div style={{
          position: 'absolute',
          transform: `scale(${stampScale}) rotate(-15deg)`,
          opacity: stampOpacity,
          color: COLORS.accent,
          border: `0.5vw solid ${COLORS.accent}`,
          padding: '2vw 4vw',
          fontSize: '6vw',
          fontFamily: TYPOGRAPHY.fontFamily,
          fontWeight: 900,
          borderRadius: '2vw',
          textShadow: `0 0 2vw ${COLORS.accent}80`,
          boxShadow: `0 0 4vw ${COLORS.accent}40 inset`,
          backgroundColor: `${COLORS.background}E6`
      }}>
          JUST GUESSING
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// FRAGMENT 4 (Frames 238 - 318)
// ============================================================================
const Fragment4: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [70, 80], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const progress = interpolate(frame, [10, 50], [2000, 0], { easing: EASINGS.easeInOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut * opacity }}>
      <div style={{ fontSize: '4vw', color: COLORS.text, fontFamily: TYPOGRAPHY.fontFamily, fontWeight: 'bold', marginBottom: '2vw' }}>
          Kimi K-3 Benchmarks
      </div>
      <svg width="60vw" height="30vw" viewBox="0 0 1000 500" style={{ overflow: 'visible' }}>
          <path d="M 0 125 L 1000 125 M 0 250 L 1000 250 M 0 375 L 1000 375" stroke={COLORS.surface} strokeWidth="5" />
          <path d="M 0 450 C 200 400, 300 100, 500 200 S 800 50, 1000 100" 
                fill="none" stroke={COLORS.secondary} strokeWidth="15"
                strokeDasharray={2000} strokeDashoffset={progress}
                strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 0 480 C 250 480, 400 300, 600 250 S 800 200, 1000 150" 
                fill="none" stroke={COLORS.primary} strokeWidth="15"
                strokeDasharray={2000} strokeDashoffset={progress}
                strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};

// ============================================================================
// FRAGMENT 5 (Frames 318 - 407)
// ============================================================================
const Fragment5: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [79, 89], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const h1 = interpolate(frame, [10, 40], [0, 25], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const h2 = interpolate(frame, [20, 50], [0, 30], { easing: EASINGS.overshoot, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '15vw', height: '35vw', fontFamily: TYPOGRAPHY.fontFamily }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2vw' }}>
              <div style={{ fontSize: '3vw', color: COLORS.text, fontWeight: 'bold' }}>{Math.floor((h1/25)*85)}%</div>
              <div style={{ width: '12vw', height: `${h1}vw`, backgroundColor: COLORS.secondary, borderRadius: '1vw 1vw 0 0' }} />
              <div style={{ fontSize: '3vw', color: COLORS.secondary, fontWeight: 'bold' }}>KIMI K-3</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2vw' }}>
              <div style={{ fontSize: '3vw', color: COLORS.accent, fontWeight: 'bold' }}>{Math.floor((h2/30)*92)}%</div>
              <div style={{ width: '12vw', height: `${h2}vw`, backgroundColor: COLORS.accent, borderRadius: '1vw 1vw 0 0', boxShadow: `0 0 4vw ${COLORS.accent}80` }} />
              <div style={{ fontSize: '3vw', color: COLORS.accent, fontWeight: 'bold' }}>FABLE 5</div>
          </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// FRAGMENT 6 (Frames 407 - 485)
// ============================================================================
const Fragment6: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [68, 78], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const w1 = interpolate(frame, [10, 40], [0, 100], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const v1 = interpolate(frame, [10, 40], [0, 2.8], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const w2 = interpolate(frame, [20, 50], [0, 100], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const v2 = interpolate(frame, [20, 50], [0, 1], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut, fontFamily: TYPOGRAPHY.fontFamily }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5vw', width: '80%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1vw' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '3.5vw', color: COLORS.primary, fontWeight: 900 }}>PARAMS</div>
                  <div style={{ fontSize: '3.5vw', color: COLORS.primary, fontWeight: 900 }}>{v1.toFixed(1)}T</div>
              </div>
              <div style={{ width: '100%', height: '4vw', backgroundColor: COLORS.surface, borderRadius: '2vw', overflow: 'hidden' }}>
                  <div style={{ width: `${w1}%`, height: '100%', backgroundColor: COLORS.primary, borderRadius: '2vw', boxShadow: `0 0 2vw ${COLORS.primary}80` }} />
              </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1vw' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: '3.5vw', color: COLORS.secondary, fontWeight: 900 }}>CONTEXT</div>
                  <div style={{ fontSize: '3.5vw', color: COLORS.secondary, fontWeight: 900 }}>{v2.toFixed(1)}M</div>
              </div>
              <div style={{ width: '100%', height: '4vw', backgroundColor: COLORS.surface, borderRadius: '2vw', overflow: 'hidden' }}>
                  <div style={{ width: `${w2}%`, height: '100%', backgroundColor: COLORS.secondary, borderRadius: '2vw', boxShadow: `0 0 2vw ${COLORS.secondary}80` }} />
              </div>
          </div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// FRAGMENTS 7, 8, 9 (Frames 485 - 747)
// ============================================================================
const ROWS = 28;
const COLS = 32;
const TOTAL_EXPERTS = ROWS * COLS;

const ACTIVE_SETS: number[][] = [];
let seedCounter = 42;
for (let i = 0; i < 40; i++) {
  const set = new Set<number>();
  while (set.size < 16) {
      set.add(Math.floor(seededRandom(seedCounter++) * TOTAL_EXPERTS));
  }
  ACTIVE_SETS.push(Array.from(set));
}

const MoEScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [252, 262], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isFrag9 = frame >= 171;

  let activeIndices = ACTIVE_SETS[0];
  if (isFrag9) {
      const step = Math.floor((frame - 171) / 5);
      activeIndices = ACTIVE_SETS[step % ACTIVE_SETS.length];
  }

  const gridScale = interpolate(frame, [0, 40], [1.2, 1], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const gridOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const textOpacity = interpolate(frame, [95, 115], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [95, 115], [50, 0], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bgDarken = interpolate(frame, [95, 115], [0, 0.75], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: fadeOut, fontFamily: TYPOGRAPHY.fontFamily }}>
      <div style={{ 
          opacity: gridOpacity, 
          transform: `scale(${gridScale})`,
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          width: '65%',
          aspectRatio: `${COLS} / ${ROWS}`,
          gap: '0.2vw'
      }}>
          {Array.from({ length: TOTAL_EXPERTS }).map((_, i) => {
              const isActive = activeIndices.includes(i);
              const baseOpacity = 0.1 + seededRandom(i) * 0.15;
              return (
                  <div key={i} style={{
                      backgroundColor: isActive ? COLORS.accent : COLORS.primary,
                      opacity: isActive ? 1 : baseOpacity,
                      borderRadius: '0.1vw',
                      boxShadow: isActive ? `0 0 1.5vw ${COLORS.accent}` : 'none'
                  }} />
              )
          })}
      </div>
      
      <AbsoluteFill style={{ backgroundColor: `rgba(11, 19, 38, ${bgDarken})`, pointerEvents: 'none' }} />

      <div style={{
          position: 'absolute',
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          fontSize: '6vw',
          fontWeight: 900,
          color: COLORS.text,
          textAlign: 'center',
          textShadow: `0 1vw 3vw #000`,
          display: 'flex',
          flexDirection: 'column',
          gap: '1vw'
      }}>
          <div>896 ЭКСПЕРТОВ</div>
          <div style={{ color: COLORS.accent, fontSize: '4.5vw' }}>16 АКТИВНЫХ</div>
      </div>
    </AbsoluteFill>
  );
};

// ============================================================================
// MAIN SCENE EXPORT
// ============================================================================
export const Scene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <BackgroundGrid />
      
      <Sequence from={0} durationInFrames={55}>
        <Fragment1 />
      </Sequence>
      
      <Sequence from={55} durationInFrames={100}>
        <Fragment2 />
      </Sequence>
      
      <Sequence from={155} durationInFrames={83}>
        <Fragment3 />
      </Sequence>
      
      <Sequence from={238} durationInFrames={80}>
        <Fragment4 />
      </Sequence>
      
      <Sequence from={318} durationInFrames={89}>
        <Fragment5 />
      </Sequence>
      
      <Sequence from={407} durationInFrames={78}>
        <Fragment6 />
      </Sequence>
      
      <Sequence from={485} durationInFrames={262}>
        <MoEScene />
      </Sequence>
    </AbsoluteFill>
  );
};

export default Scene;