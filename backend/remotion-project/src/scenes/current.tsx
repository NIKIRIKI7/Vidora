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
  id: 'FableVideo',
  durationInFrames: 9732, // 162.2s * 60fps
  fps: 60,
  width: 1920,
  height: 1080,
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
  error: '#ff4444',
  neonPink: '#ff007f',
  neonGreen: '#39ff14',
} as const;

const TYPOGRAPHY = {
  fontFamily: 'Inter, system-ui, sans-serif',
} as const;

const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
};

const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

// =============================================================================
// REUSABLE COMPONENTS
// =============================================================================

const GlitchText: React.FC<{ text: string; frame: number; size: number }> = ({ text, frame, size }) => {
  const isGlitch = seededRandom(frame) > 0.8;
  const offsetMax = size * 0.05;
  const x1 = isGlitch ? seededRandom(frame + 1) * offsetMax * 2 - offsetMax : 0;
  const x2 = isGlitch ? seededRandom(frame + 2) * offsetMax * 2 - offsetMax : 0;
  
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    fontSize: size,
    fontWeight: 900,
    whiteSpace: 'nowrap',
    fontFamily: TYPOGRAPHY.fontFamily,
    margin: 0,
    top: '50%',
    left: '50%',
  };

  return (
    <>
      <div style={{ ...baseStyle, color: COLORS.secondary, transform: `translate(calc(-50% + ${x1}px), -50%)`, opacity: 0.8 }}>
        {text}
      </div>
      <div style={{ ...baseStyle, color: COLORS.primary, transform: `translate(calc(-50% + ${x2}px), -50%)`, opacity: 0.8 }}>
        {text}
      </div>
      <div style={{ ...baseStyle, color: COLORS.text, transform: `translate(-50%, -50%)`, textShadow: `0 0 ${size * 0.2}px ${COLORS.accent}88` }}>
        {text}
      </div>
    </>
  );
};

const BackgroundGrid: React.FC<{ frame: number; speedX?: number; speedY?: number; opacity?: number }> = ({ frame, speedX = 1, speedY = 0, opacity = 0.15 }) => {
  const cellSize = 100;
  const offsetX = (frame * speedX) % cellSize;
  const offsetY = (frame * speedY) % cellSize;

  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', opacity }}>
      <defs>
        <pattern id="bg-grid" width={cellSize} height={cellSize} patternUnits="userSpaceOnUse" patternTransform={`translate(${offsetX}, ${offsetY})`}>
          <path d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`} fill="none" stroke={COLORS.primary} strokeWidth={2} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg-grid)" />
    </svg>
  );
};

const TypingIndicator: React.FC<{ frame: number; size: number }> = ({ frame, size }) => {
  return (
    <div style={{ display: 'flex', gap: size * 0.8, alignItems: 'center' }}>
      {[0, 20, 40].map((delay, i) => {
        const op = interpolate((frame + delay) % 60, [0, 30, 60], [0.3, 1, 0.3]);
        return <div key={i} style={{ width: size, height: size, borderRadius: '50%', backgroundColor: COLORS.text, opacity: op }} />;
      })}
    </div>
  );
};

// =============================================================================
// SCENES
// =============================================================================

// --- SCENE 1: Hook (0 - 1092 frames) ---
const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const hookVisible = frame <= 330;
  const zoomOut = interpolate(frame, [530, 600], [0, 1], { easing: EASINGS.easeInOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const chatFade = interpolate(frame, [600, 630], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Photo Box Dimensions
  const photoW = interpolate(zoomOut, [0, 1], [width, 800]);
  const photoH = interpolate(zoomOut, [0, 1], [height, 600]);
  const photoX = interpolate(zoomOut, [0, 1], [0, 100]);
  const photoY = interpolate(zoomOut, [0, 1], [0, (height - 600) / 2]);
  const photoRadius = interpolate(zoomOut, [0, 1], [0, 30]);

  const photoIdx = Math.floor(frame / 8) % 6;
  const stampScale = interpolate(frame, [400, 440], [4, 1], { easing: EASINGS.overshoot, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const stampOpacity = interpolate(frame, [400, 420], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const typingDone = frame > 800;
  const line1Len = interpolate(frame, [800, 850], [0, 16], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const line2Len = interpolate(frame, [870, 930], [0, 29], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const line3Len = interpolate(frame, [950, 1030], [0, 30], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <BackgroundGrid frame={frame} speedY={2} speedX={0} />

      {/* Photos Section */}
      {frame > 315 && (
        <div style={{ position: 'absolute', left: photoX, top: photoY, width: photoW, height: photoH, borderRadius: photoRadius, overflow: 'hidden', backgroundColor: '#111', border: zoomOut > 0.5 ? `2px solid ${COLORS.surface}` : 'none' }}>
          <div style={{ width: '100%', height: '100%', backgroundColor: ['#222', '#333', '#1a1a1a', '#2a2a2a', '#111', '#252525'][photoIdx], display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ fontSize: 300, color: '#555', fontWeight: 900, fontFamily: TYPOGRAPHY.fontFamily, margin: 0 }}>
              {['A', 'B', 'C', 'D', 'E', 'F'][photoIdx]}
            </div>
          </div>
          {/* Stamp */}
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(-50%, -50%) scale(${stampScale}) rotate(-15deg)`, opacity: stampOpacity, color: COLORS.error, border: `8px solid ${COLORS.error}`, padding: '20px 40px', borderRadius: 20, fontSize: 80, fontWeight: 900, fontFamily: TYPOGRAPHY.fontFamily, textShadow: `0 0 20px ${COLORS.error}66`, boxShadow: `0 0 40px ${COLORS.error}44`, whiteSpace: 'nowrap' }}>
            НЕ РЕШЕНО
          </div>
        </div>
      )}

      {/* Cyberpunk Hook Overlay */}
      {hookVisible && (
        <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity: interpolate(frame, [300, 330], [1, 0]) }}>
          <BackgroundGrid frame={frame} speedY={4} />
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: `${(i * 7) % 95}%`, top: ((frame * (2 + i % 4) * 3 + i * 200) % 1500) - 200, color: COLORS.secondary, opacity: 0.4, fontSize: 30 + (i % 5) * 10, fontFamily: 'monospace', fontWeight: 'bold', margin: 0 }}>
              {['det(J)=1', '∂f/∂x', '∑(a)', 'F(x)', '∇×E', 'J≠0'][i % 6]}
            </div>
          ))}
          <GlitchText text="87 ЛЕТ" frame={frame} size={280} />
        </AbsoluteFill>
      )}

      {/* Chat UI */}
      <div style={{ position: 'absolute', left: interpolate(chatFade, [0, 1], [1920, 1000]), top: 240, width: 800, height: 600, backgroundColor: COLORS.surface, borderRadius: 30, opacity: chatFade, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: `0 20px 60px rgba(0,0,0,0.5)` }}>
        <div style={{ height: 80, backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', padding: '0 40px', fontSize: 32, fontWeight: 'bold', color: COLORS.text, fontFamily: TYPOGRAPHY.fontFamily, borderBottom: `2px solid ${COLORS.primary}44` }}>
          Fable-5 AI
        </div>
        <div style={{ padding: 40, flex: 1 }}>
          {!typingDone ? (
            <div style={{ marginTop: 20 }}><TypingIndicator frame={frame} size={24} /></div>
          ) : (
            <div style={{ fontFamily: 'monospace', fontSize: 42, color: COLORS.text, display: 'flex', flexDirection: 'column', gap: 30 }}>
              <div>{'АНАЛИЗ ЗАВЕРШЕН.'.slice(0, Math.floor(line1Len))}</div>
              <div style={{ color: COLORS.accent }}>{'ГИПОТЕЗА ЯКОБИ: ОПРОВЕРГНУТА.'.slice(0, Math.floor(line2Len))}</div>
              <div style={{ color: frame > 1030 ? COLORS.neonGreen : COLORS.text, textShadow: frame > 1030 ? `0 0 20px ${COLORS.neonGreen}` : 'none', fontWeight: frame > 1030 ? 900 : 'normal' }}>
                {'КОНТРПРИМЕР: ОПРЕДЕЛИТЕЛЬ = -2'.slice(0, Math.floor(line3Len))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// --- SCENE 2: Intro (0 - 900 frames) ---
const Scene2Intro: React.FC = () => {
  const frame = useCurrentFrame();
  
  // Section 1: Servers (0 - 300)
  const serverOpacity = interpolate(frame, [250, 300], [1, 0], { extrapolateRight: 'clamp' });
  
  // Section 2: AI Core Waves (300 - 600)
  const coreFade = interpolate(frame, [300, 330, 570, 600], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const waveRadius = (frame % 120) * 8;
  const waveOpacity = interpolate(waveRadius, [0, 800], [0.8, 0], { extrapolateRight: 'clamp' });

  // Section 3: Abstract Graphs (600 - 900)
  const graphFade = interpolate(frame, [600, 630], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {/* Servers */}
      {frame < 300 && (
        <AbsoluteFill style={{ opacity: serverOpacity, justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: 40, width: '90%', height: '80%' }}>
            {Array.from({ length: 15 * 8 }).map((_, i) => {
              const blink = seededRandom(i + frame * 0.05) > 0.8;
              return (
                <div key={i} style={{ backgroundColor: blink ? COLORS.secondary : COLORS.surface, borderRadius: 8, boxShadow: blink ? `0 0 20px ${COLORS.secondary}` : 'none', transition: 'all 0.1s' }} />
              );
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* AI Core */}
      {frame >= 300 && frame < 600 && (
        <AbsoluteFill style={{ opacity: coreFade, justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'absolute', width: waveRadius, height: waveRadius, borderRadius: '50%', border: `4px solid ${COLORS.accent}`, opacity: waveOpacity, transform: 'translate(-50%, -50%)', left: '50%', top: '50%' }} />
          <div style={{ position: 'absolute', width: (waveRadius + 200) % 960, height: (waveRadius + 200) % 960, borderRadius: '50%', border: `2px solid ${COLORS.primary}`, opacity: waveOpacity * 0.5, transform: 'translate(-50%, -50%)', left: '50%', top: '50%' }} />
          <div style={{ width: 160, height: 160, backgroundColor: COLORS.text, borderRadius: '50%', boxShadow: `0 0 80px ${COLORS.text}` }} />
        </AbsoluteFill>
      )}

      {/* Graphs */}
      {frame >= 600 && (
        <AbsoluteFill style={{ opacity: graphFade }}>
          <BackgroundGrid frame={frame} speedX={4} opacity={0.3} />
          <svg width="100%" height="100%" style={{ position: 'absolute' }}>
            <path
              d={`M 0 540 Q 480 ${300 + Math.sin(frame * 0.1) * 200} 960 540 T 1920 540`}
              fill="none" stroke={COLORS.error} strokeWidth={8}
            />
            <path
              d={`M 0 540 Q 480 ${780 + Math.cos(frame * 0.1) * 200} 960 540 T 1920 540`}
              fill="none" stroke={COLORS.secondary} strokeWidth={4}
            />
          </svg>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// --- SCENE 3: Core Problem (0 - 2880 frames) ---
const Scene3Core: React.FC = () => {
  const frame = useCurrentFrame();
  
  // 0 - 480: Math Cube
  const cubeOp = interpolate(frame, [0, 60, 420, 480], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cubeRot = interpolate(frame, [0, 480], [0, 90]);

  // 480 - 1000: Grid & Icons
  const iconsOp = interpolate(frame, [480, 540, 940, 1000], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  // 1000 - 1800: Point -> Pancake -> Merge
  const squashOp = interpolate(frame, [1000, 1060, 1750, 1800], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const scalePulse = 1 + Math.sin(frame * 0.2) * 0.1;
  const squashY = interpolate(frame, [1300, 1400], [1, 0.15], { easing: EASINGS.easeInOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const squashX = interpolate(frame, [1300, 1400], [1, 2.5], { easing: EASINGS.easeInOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const mergeDist = interpolate(frame, [1500, 1650], [400, 0], { easing: EASINGS.easeIn, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const isMerged = frame > 1650;

  // 1800 - 2880: Smooth Curve
  const curveOp = interpolate(frame, [1800, 1860], [0, 1], { extrapolateLeft: 'clamp' });
  const drawProgress = interpolate(frame, [1860, 1960], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {/* 0 - 480: Math Cube */}
      {frame < 480 && (
        <AbsoluteFill style={{ opacity: cubeOp, justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 80, fontWeight: 900, color: COLORS.text, marginBottom: 120 }}>
            Гипотеза Якоби
          </div>
          <div style={{ width: 400, height: 400, position: 'relative', transform: `rotateZ(${cubeRot}deg)` }}>
            <svg width="100%" height="100%" viewBox="-100 -50 200 150">
              <path d="M 0 0 L 86.6 -50 L 0 -100 L -86.6 -50 Z" fill={COLORS.primary} opacity={0.8} />
              <path d="M 0 0 L -86.6 -50 L -86.6 50 L 0 100 Z" fill={COLORS.secondary} opacity={0.6} />
              <path d="M 0 0 L 86.6 -50 L 86.6 50 L 0 100 Z" fill={COLORS.accent} opacity={0.6} />
            </svg>
          </div>
        </AbsoluteFill>
      )}

      {/* 480 - 1000: Icons & Grid */}
      {frame >= 480 && frame < 1000 && (
        <AbsoluteFill style={{ opacity: iconsOp, justifyContent: 'center', alignItems: 'center' }}>
          <BackgroundGrid frame={frame} speedX={3} speedY={1.5} opacity={0.4} />
          <div style={{ display: 'flex', gap: 120, fontSize: 160, fontWeight: 900, color: COLORS.text, fontFamily: TYPOGRAPHY.fontFamily }}>
            <div>+</div>
            <div>−</div>
            <div>×</div>
            <div style={{ position: 'relative' }}>
              ÷
              <div style={{ position: 'absolute', top: '50%', left: '-20%', width: '140%', height: 20, backgroundColor: COLORS.error, transform: 'translateY(-50%) rotate(-45deg)', borderRadius: 10 }} />
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* 1000 - 1800: Squash and Merge */}
      {frame >= 1000 && frame < 1800 && (
        <AbsoluteFill style={{ opacity: squashOp, justifyContent: 'center', alignItems: 'center' }}>
          <BackgroundGrid frame={frame} speedX={2} />
          <div style={{ position: 'relative', width: 600, height: 600 }}>
            {/* Center squashable element */}
            {frame < 1500 ? (
              <div style={{ position: 'absolute', top: '50%', left: '50%', width: 240, height: 240, margin: '-120px 0 0 -120px', borderRadius: '50%', backgroundColor: COLORS.error, boxShadow: `0 0 80px ${COLORS.error}`, transform: `scale(${scalePulse}) scaleX(${squashX}) scaleY(${squashY})` }} />
            ) : (
              <>
                <div style={{ position: 'absolute', top: '50%', left: `calc(50% - ${mergeDist}px)`, width: 160, height: 160, margin: '-80px 0 0 -80px', borderRadius: '50%', backgroundColor: isMerged ? COLORS.error : COLORS.accent, boxShadow: `0 0 60px ${isMerged ? COLORS.error : COLORS.accent}` }} />
                <div style={{ position: 'absolute', top: '50%', left: `calc(50% + ${mergeDist}px)`, width: 160, height: 160, margin: '-80px 0 0 -80px', borderRadius: '50%', backgroundColor: isMerged ? COLORS.error : COLORS.accent, boxShadow: `0 0 60px ${isMerged ? COLORS.error : COLORS.accent}`, opacity: isMerged ? 0 : 1 }} />
                {isMerged && (
                  <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: 100, fontFamily: 'monospace', fontWeight: 900, color: COLORS.text, textShadow: '0 0 20px rgba(0,0,0,0.8)' }}>
                    ERROR_MERGE
                  </div>
                )}
              </>
            )}
          </div>
        </AbsoluteFill>
      )}

      {/* 1800 - 2880: Smooth Curve */}
      {frame >= 1800 && (
        <AbsoluteFill style={{ opacity: curveOp, justifyContent: 'center', alignItems: 'center' }}>
          <BackgroundGrid frame={frame} speedX={0.5} opacity={0.1} />
          <svg width="100%" height="100%" style={{ position: 'absolute' }}>
            <path d="M 200 900 C 600 900, 1300 200, 1720 200" fill="none" stroke={COLORS.secondary} strokeWidth={16} strokeLinecap="round" strokeDasharray={100} pathLength={100} strokeDashoffset={drawProgress} />
          </svg>
          <div style={{ position: 'absolute', top: 300, left: 300, fontSize: 80, fontWeight: 900, fontFamily: TYPOGRAPHY.fontFamily, color: COLORS.text, opacity: interpolate(frame, [1960, 2020], [0, 1], { extrapolateLeft: 'clamp' }) }}>
            Определитель ≠ 0
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// --- SCENE 4: Blind Spot (0 - 1500 frames) ---
const Scene4BlindSpot: React.FC = () => {
  const frame = useCurrentFrame();

  // 0 - 500: Reversible Path
  const lineOp = interpolate(frame, [0, 60, 440, 500], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drawBack = interpolate(frame, [60, 200], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 500 - 1000: Timeline & Maze
  const timeOp = interpolate(frame, [500, 560, 940, 1000], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const year = Math.floor(interpolate(frame, [600, 800], [1939, 2026], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));

  // 1000 - 1500: News Feed
  const newsOp = interpolate(frame, [1000, 1060], [0, 1], { extrapolateLeft: 'clamp' });
  const scrollY = interpolate(frame, [1060, 1400], [0, -800], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {/* Final to Start Path */}
      {frame < 500 && (
        <AbsoluteFill style={{ opacity: lineOp, justifyContent: 'center', alignItems: 'center' }}>
          <svg width="100%" height="100%" style={{ position: 'absolute' }}>
            <path d="M 1400 540 L 520 540" fill="none" stroke={COLORS.primary} strokeWidth={12} strokeLinecap="round" strokeDasharray={100} pathLength={100} strokeDashoffset={drawBack} />
          </svg>
          <div style={{ position: 'absolute', left: 480, top: 540, width: 80, height: 80, margin: '-40px 0 0 -40px', borderRadius: '50%', backgroundColor: COLORS.accent, boxShadow: `0 0 40px ${COLORS.accent}`, opacity: frame > 200 ? 1 : 0 }} />
          <div style={{ position: 'absolute', left: 1400, top: 540, width: 80, height: 80, margin: '-40px 0 0 -40px', borderRadius: '50%', backgroundColor: COLORS.secondary, boxShadow: `0 0 40px ${COLORS.secondary}` }} />
          <div style={{ position: 'absolute', top: 620, left: 1200, fontSize: 40, fontFamily: TYPOGRAPHY.fontFamily, color: COLORS.text }}>Финальная</div>
          <div style={{ position: 'absolute', top: 620, left: 400, fontSize: 40, fontFamily: TYPOGRAPHY.fontFamily, color: COLORS.text, opacity: frame > 200 ? 1 : 0 }}>Стартовая</div>
        </AbsoluteFill>
      )}

      {/* Timeline & Maze */}
      {frame >= 500 && frame < 1000 && (
        <AbsoluteFill style={{ opacity: timeOp, justifyContent: 'center', alignItems: 'center' }}>
          {/* Abstract Maze paths */}
          <svg width="100%" height="100%" style={{ position: 'absolute', opacity: 0.3 }}>
            <path d="M 200 200 L 800 200 L 800 800 L 1400 800 L 1400 200" fill="none" stroke={COLORS.primary} strokeWidth={20} strokeDasharray={100} pathLength={100} strokeDashoffset={interpolate(frame, [500, 900], [100, 0], { extrapolateRight: 'clamp' })} />
            <path d="M 400 800 L 400 400 L 1200 400 L 1200 900" fill="none" stroke={COLORS.secondary} strokeWidth={20} strokeDasharray={100} pathLength={100} strokeDashoffset={interpolate(frame, [600, 950], [100, 0], { extrapolateRight: 'clamp' })} />
          </svg>
          <div style={{ fontSize: 240, fontWeight: 900, fontFamily: TYPOGRAPHY.fontFamily, color: COLORS.text, textShadow: `0 0 40px ${COLORS.text}66` }}>
            {year}
          </div>
        </AbsoluteFill>
      )}

      {/* News Feed */}
      {frame >= 1000 && (
        <AbsoluteFill style={{ opacity: newsOp, alignItems: 'center' }}>
          <BackgroundGrid frame={frame} speedY={2} />
          <div style={{ position: 'absolute', top: 800 + scrollY, display: 'flex', flexDirection: 'column', gap: 60 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ width: 1000, height: 400, backgroundColor: COLORS.surface, borderRadius: 30, display: 'flex', padding: 40, gap: 40, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', opacity: i === 1 ? 1 : 0.4 }}>
                <div style={{ width: 320, height: '100%', backgroundColor: COLORS.background, borderRadius: 20 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, justifyContent: 'center' }}>
                  <div style={{ width: '90%', height: 40, backgroundColor: COLORS.background, borderRadius: 10 }} />
                  <div style={{ width: '70%', height: 40, backgroundColor: COLORS.background, borderRadius: 10 }} />
                  <div style={{ width: '40%', height: 40, backgroundColor: COLORS.background, borderRadius: 10 }} />
                </div>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// --- SCENE 5: Matrix Hack (0 - 1980 frames) ---
const Scene5Matrix: React.FC = () => {
  const frame = useCurrentFrame();

  // 0 - 400: Terminal & Glitch
  const termOp = interpolate(frame, [0, 60, 360, 400], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flashOp = interpolate(frame, [380, 390, 400], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const typedCode = "fable-5 --solve jacobian --model deep_reasoning".slice(0, Math.floor(interpolate(frame, [60, 200], [0, 50], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));

  // 400 - 800: Huge -2
  const neonOp = interpolate(frame, [400, 440, 760, 800], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const neonScale = interpolate(frame, [400, 800], [0.8, 1.2]);

  // 800 - 1400: 3 Starts
  const branchOp = interpolate(frame, [800, 860, 1340, 1400], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drawBase = interpolate(frame, [860, 920], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const drawBranches = interpolate(frame, [920, 1020], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // 1400 - 1980: Twitter Post
  const twitOp = interpolate(frame, [1400, 1460], [0, 1], { extrapolateLeft: 'clamp' });
  const twitY = interpolate(frame, [1400, 1500], [100, 0], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {/* Terminal */}
      {frame < 400 && (
        <AbsoluteFill style={{ opacity: termOp, justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ width: 1400, height: 800, backgroundColor: '#050505', borderRadius: 20, padding: 60, fontFamily: 'monospace', fontSize: 48, color: COLORS.neonGreen, border: '2px solid #333' }}>
            <span style={{ color: COLORS.accent }}>root@ai-core:~#</span> {typedCode}
            <span style={{ display: 'inline-block', width: 24, height: 48, backgroundColor: COLORS.neonGreen, marginLeft: 10, opacity: Math.floor(frame / 30) % 2 }} />
          </div>
        </AbsoluteFill>
      )}

      {/* Flash */}
      <AbsoluteFill style={{ backgroundColor: '#fff', opacity: flashOp, zIndex: 10 }} />

      {/* Huge -2 */}
      {frame >= 400 && frame < 800 && (
        <AbsoluteFill style={{ opacity: neonOp, justifyContent: 'center', alignItems: 'center' }}>
          <BackgroundGrid frame={frame} speedY={1} speedX={1} />
          <div style={{ fontSize: 600, fontWeight: 900, fontFamily: TYPOGRAPHY.fontFamily, color: COLORS.neonPink, textShadow: `0 0 100px ${COLORS.neonPink}`, transform: `scale(${neonScale})`, margin: 0 }}>
            -2
          </div>
        </AbsoluteFill>
      )}

      {/* Splitting Paths */}
      {frame >= 800 && frame < 1400 && (
        <AbsoluteFill style={{ opacity: branchOp, justifyContent: 'center', alignItems: 'center' }}>
          <svg width="100%" height="100%" style={{ position: 'absolute' }}>
            {/* Base line */}
            <path d="M 960 900 L 960 600" fill="none" stroke={COLORS.text} strokeWidth={12} strokeLinecap="round" strokeDasharray={100} pathLength={100} strokeDashoffset={drawBase} />
            {/* 3 Branches */}
            <path d="M 960 600 C 960 400, 460 400, 460 200" fill="none" stroke={COLORS.primary} strokeWidth={12} strokeLinecap="round" strokeDasharray={100} pathLength={100} strokeDashoffset={drawBranches} />
            <path d="M 960 600 L 960 200" fill="none" stroke={COLORS.secondary} strokeWidth={12} strokeLinecap="round" strokeDasharray={100} pathLength={100} strokeDashoffset={drawBranches} />
            <path d="M 960 600 C 960 400, 1460 400, 1460 200" fill="none" stroke={COLORS.accent} strokeWidth={12} strokeLinecap="round" strokeDasharray={100} pathLength={100} strokeDashoffset={drawBranches} />
          </svg>
          
          <div style={{ position: 'absolute', top: 900, left: 960, width: 60, height: 60, margin: '-30px 0 0 -30px', borderRadius: '50%', backgroundColor: COLORS.text, opacity: frame > 860 ? 1 : 0 }} />
          
          <div style={{ position: 'absolute', top: 200, left: 460, width: 60, height: 60, margin: '-30px 0 0 -30px', borderRadius: '50%', backgroundColor: COLORS.primary, boxShadow: `0 0 40px ${COLORS.primary}`, opacity: frame > 1020 ? 1 : 0 }} />
          <div style={{ position: 'absolute', top: 200, left: 960, width: 60, height: 60, margin: '-30px 0 0 -30px', borderRadius: '50%', backgroundColor: COLORS.secondary, boxShadow: `0 0 40px ${COLORS.secondary}`, opacity: frame > 1020 ? 1 : 0 }} />
          <div style={{ position: 'absolute', top: 200, left: 1460, width: 60, height: 60, margin: '-30px 0 0 -30px', borderRadius: '50%', backgroundColor: COLORS.accent, boxShadow: `0 0 40px ${COLORS.accent}`, opacity: frame > 1020 ? 1 : 0 }} />

          <div style={{ position: 'absolute', bottom: 100, fontSize: 80, fontWeight: 900, fontFamily: TYPOGRAPHY.fontFamily, color: COLORS.text, opacity: interpolate(frame, [1050, 1100], [0, 1], { extrapolateLeft: 'clamp' }) }}>
            1 ФИНАЛ = 3 СТАРТА
          </div>
        </AbsoluteFill>
      )}

      {/* Twitter Post */}
      {frame >= 1400 && (
        <AbsoluteFill style={{ opacity: twitOp, justifyContent: 'center', alignItems: 'center' }}>
          <BackgroundGrid frame={frame} speedY={0.5} opacity={0.2} />
          <div style={{ width: 1000, backgroundColor: COLORS.surface, borderRadius: 40, padding: 60, boxShadow: '0 40px 100px rgba(0,0,0,0.6)', transform: `translateY(${twitY}px)`, border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 30, marginBottom: 40 }}>
              <div style={{ width: 100, height: 100, borderRadius: '50%', backgroundColor: COLORS.primary }} />
              <div>
                <div style={{ fontSize: 40, fontWeight: 'bold', color: COLORS.text, fontFamily: TYPOGRAPHY.fontFamily }}>Levent Alpoge</div>
                <div style={{ fontSize: 32, color: '#888', fontFamily: TYPOGRAPHY.fontFamily }}>@leventalpoge</div>
              </div>
            </div>
            <div style={{ fontSize: 48, lineHeight: 1.4, color: COLORS.text, fontFamily: TYPOGRAPHY.fontFamily }}>
              The Jacobian Conjecture is false. Fable-5 found a counterexample in dimension 3 with determinant -2. Our paper is out tonight.
            </div>
            <div style={{ marginTop: 40, color: COLORS.secondary, fontSize: 36, fontFamily: TYPOGRAPHY.fontFamily }}>
              #Math #AI #Discovery
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// --- SCENE 6: Outro & CTA (0 - 1380 frames) ---
const Scene6Outro: React.FC = () => {
  const frame = useCurrentFrame();

  // 0 - 300: Fast Cuts
  const cutsOp = interpolate(frame, [250, 300], [1, 0], { extrapolateRight: 'clamp' });
  const cutIdx = Math.floor(frame / 10) % 4;
  
  // 300 - 800: Chat UI
  const chatOp = interpolate(frame, [300, 330, 770, 800], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const chatTyped = "Explain the Jacobian Conjecture counterexample".slice(0, Math.floor(interpolate(frame, [360, 500], [0, 45], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })));

  // 800 - 1380: Subscribe CTA
  const ctaOp = interpolate(frame, [800, 860], [0, 1], { extrapolateLeft: 'clamp' });
  const cursorX = interpolate(frame, [900, 1000], [1200, 960], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const cursorY = interpolate(frame, [900, 1000], [800, 580], { easing: EASINGS.easeOut, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const btnScale = interpolate(frame, [1000, 1010, 1020], [1, 0.9, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const btnColor = frame > 1010 ? '#333' : COLORS.text;
  const btnTextColor = frame > 1010 ? COLORS.text : COLORS.background;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {/* Fast Cuts */}
      {frame < 300 && (
        <AbsoluteFill style={{ opacity: cutsOp }}>
          <div style={{ width: '100%', height: '100%', backgroundColor: [COLORS.background, COLORS.surface, '#050505', '#111'][cutIdx], display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ fontSize: 200, fontFamily: 'monospace', color: COLORS.secondary, opacity: 0.3, fontWeight: 'bold' }}>
              {['SYSTEM_ERROR', '0xFA88C2', 'OVERRIDE', 'COMPUTING...'][cutIdx]}
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* Chat Prompt */}
      {frame >= 300 && frame < 800 && (
        <AbsoluteFill style={{ opacity: chatOp, justifyContent: 'center', alignItems: 'center' }}>
          <BackgroundGrid frame={frame} speedY={1} />
          <div style={{ width: 1400, backgroundColor: COLORS.surface, borderRadius: 60, padding: '40px 60px', display: 'flex', alignItems: 'center', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.05)' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', backgroundColor: '#555', marginRight: 40 }} />
            <div style={{ fontSize: 52, color: COLORS.text, fontFamily: TYPOGRAPHY.fontFamily, flex: 1 }}>
              {chatTyped}
              <span style={{ opacity: Math.floor(frame / 30) % 2 ? 1 : 0 }}>|</span>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* Subscribe CTA */}
      {frame >= 800 && (
        <AbsoluteFill style={{ opacity: ctaOp, justifyContent: 'center', alignItems: 'center' }}>
          <BackgroundGrid frame={frame} speedY={2} opacity={0.3} />
          
          <div style={{ fontSize: 80, fontWeight: 900, fontFamily: TYPOGRAPHY.fontFamily, color: COLORS.text, marginBottom: 120 }}>
            Технологии меняют всё.
          </div>

          <div style={{ width: 480, height: 140, backgroundColor: btnColor, borderRadius: 70, display: 'flex', justifyContent: 'center', alignItems: 'center', transform: `scale(${btnScale})`, transition: 'background-color 0.2s', boxShadow: frame > 1010 ? 'none' : `0 20px 40px ${COLORS.text}66` }}>
            <div style={{ fontSize: 44, fontWeight: 'bold', fontFamily: TYPOGRAPHY.fontFamily, color: btnTextColor }}>
              {frame > 1010 ? 'ВЫ ПОДПИСАНЫ' : 'ПОДПИСАТЬСЯ'}
            </div>
          </div>

          <div style={{ position: 'absolute', left: cursorX, top: cursorY, zIndex: 10 }}>
            <svg width="80" height="120" viewBox="0 0 100 150">
              <path d="M 20 20 L 80 80 L 50 90 L 40 140 Z" fill="#fff" stroke="#000" strokeWidth="6" />
            </svg>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// =============================================================================
// MAIN COMPOSITION
// =============================================================================
const FableVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <Sequence from={0} durationInFrames={1092}>
        <Scene1Hook />
      </Sequence>
      
      <Sequence from={1092} durationInFrames={900}>
        <Scene2Intro />
      </Sequence>
      
      <Sequence from={1992} durationInFrames={2880}>
        <Scene3Core />
      </Sequence>
      
      <Sequence from={4872} durationInFrames={1500}>
        <Scene4BlindSpot />
      </Sequence>
      
      <Sequence from={6372} durationInFrames={1980}>
        <Scene5Matrix />
      </Sequence>
      
      <Sequence from={8352} durationInFrames={1380}>
        <Scene6Outro />
      </Sequence>
    </AbsoluteFill>
  );
};

export default FableVideo;