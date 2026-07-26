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
  id: 'ConclusionAndCTA',
  durationInFrames: 1326, // 22.1s * 60fps
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
  errorRed: '#ff4444',
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

// =============================================================================
// HELPERS
// =============================================================================
const seededRandom = (seed: number): number => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

// --- Fragment 1: Fast Cuts (0.15 - 8.32s) ---
const FastCutsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Opacity for entry and exit
  const opacity = interpolate(frame, [0, 15, 475, 490], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Decide which cut to show (fast pacing initially, then settle)
  const isSettled = frame > 240; // After 4 seconds, stabilize on AI representation
  const cutIndex = isSettled ? 3 : Math.floor(frame / 12) % 3;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity, overflow: 'hidden' }}>
      
      {/* CUT 0: Servers */}
      {cutIndex === 0 && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 20, width: '90%', height: '80%' }}>
            {Array.from({ length: 40 }).map((_, i) => {
              const active = seededRandom(i + frame * 0.1) > 0.5;
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: COLORS.surface,
                    border: `2px solid ${active ? COLORS.secondary : COLORS.background}`,
                    boxShadow: active ? `0 0 20px ${COLORS.secondary}88` : 'none',
                    borderRadius: 8,
                    position: 'relative',
                  }}
                >
                  <div style={{ position: 'absolute', top: '10%', right: '10%', width: 10, height: 10, borderRadius: '50%', backgroundColor: active ? COLORS.secondary : '#333' }} />
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* CUT 1: Code on monitor */}
      {cutIndex === 1 && (
        <AbsoluteFill style={{ padding: 60, fontFamily: 'monospace', fontSize: 32, color: COLORS.primary, lineHeight: 1.5 }}>
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              style={{
                opacity: 0.5 + seededRandom(i + frame) * 0.5,
                transform: `translateX(${seededRandom(i) * 20}px)`,
              }}
            >
              {seededRandom(i) > 0.5 
                ? `const vector_${i} = matrix.computeDet(jacobian_space);`
                : `await neural_engine.backpropagate(vector_${i}, target_dim);`}
            </div>
          ))}
        </AbsoluteFill>
      )}

      {/* CUT 2: Neon Face Silhouette */}
      {cutIndex === 2 && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
           <div style={{
             width: 400, 
             height: 600, 
             backgroundColor: COLORS.surface, 
             borderRadius: '200px 200px 50px 50px',
             boxShadow: `0 0 100px ${COLORS.accent}88, inset 0 0 80px ${COLORS.accent}`,
             position: 'relative',
             transform: `scale(${1 + Math.sin(frame * 0.5) * 0.05})`,
           }}>
             {/* Glowing eyes */}
             <div style={{ position: 'absolute', top: 250, left: 100, width: 60, height: 20, backgroundColor: COLORS.accent, borderRadius: 10, boxShadow: `0 0 40px ${COLORS.accent}` }} />
             <div style={{ position: 'absolute', top: 250, right: 100, width: 60, height: 20, backgroundColor: COLORS.accent, borderRadius: 10, boxShadow: `0 0 40px ${COLORS.accent}` }} />
           </div>
        </AbsoluteFill>
      )}

      {/* CUT 3: Settled AI Representation (FABLE closing the problem) */}
      {isSettled && (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          {/* Abstract mathematical swirl collapsing */}
          <div
            style={{
              position: 'absolute',
              width: width * 1.5,
              height: width * 1.5,
              borderRadius: '50%',
              border: `2px dashed ${COLORS.primary}44`,
              transform: `rotate(${frame * 2}deg) scale(${interpolate(frame, [240, 490], [2, 0.5])})`,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <div style={{ width: '80%', height: '80%', borderRadius: '50%', border: `4px solid ${COLORS.secondary}88` }} />
            <div style={{ position: 'absolute', width: '50%', height: '50%', borderRadius: '50%', backgroundColor: `${COLORS.accent}22`, boxShadow: `0 0 100px ${COLORS.accent}` }} />
          </div>
          
          <div
            style={{
              fontSize: 120,
              fontWeight: 900,
              color: COLORS.text,
              fontFamily: TYPOGRAPHY.fontFamily,
              textShadow: `0 0 60px ${COLORS.primary}`,
              zIndex: 10,
              transform: `scale(${interpolate(frame, [240, 270], [0.8, 1], { easing: EASINGS.overshoot, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`,
            }}
          >
            FABLE AI
          </div>
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};

// --- Fragment 2: Chat Interface (8.06 - 17.59s) ---
const ChatInterfaceScene: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 16, 556, 572], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const uiScale = interpolate(frame, [0, 30], [0.95, 1], {
    easing: EASINGS.easeOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // User typing logic
  const rawQuery = "Can you prove the Jacobian Conjecture?";
  const typedLength = Math.floor(interpolate(frame, [30, 120], [0, rawQuery.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const currentQuery = rawQuery.substring(0, typedLength);
  const isSent = frame > 140;

  // AI response logic
  const showLoading = isSent && frame < 220;
  const showResponse = frame >= 220;
  const glitchStarts = frame > 300;

  // Glitch calculations
  const glitchIntensity = glitchStarts ? interpolate(frame, [300, 450], [0, 1], { extrapolateRight: 'clamp' }) : 0;
  
  // Random scramble text
  const rawResponse = "Analyzing Jacobian topological space... Mapping determinant...";
  const scrambledResponse = rawResponse.split('').map((char, i) => {
    if (!glitchStarts) return char;
    return seededRandom(frame + i) < glitchIntensity * 0.8 ? ['#', '@', '%', '&', '!', '?', '*'][Math.floor(seededRandom(frame + i * 2) * 7)] : char;
  }).join('');

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', opacity }}>
      {/* Background soft grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${COLORS.surface} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.surface} 1px, transparent 1px)`, backgroundSize: '60px 60px', opacity: 0.2 }} />

      <div
        style={{
          width: 1200,
          height: 800,
          backgroundColor: COLORS.surface,
          borderRadius: 24,
          border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: `0 40px 100px rgba(0,0,0,0.5), 0 0 ${glitchIntensity * 100}px ${COLORS.errorRed}66`,
          transform: `scale(${uiScale}) translate(${glitchIntensity * (seededRandom(frame) * 20 - 10)}px, ${glitchIntensity * (seededRandom(frame + 1) * 20 - 10)}px)`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ height: 70, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 30px', gap: 16 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: COLORS.accent }} />
          <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: '#facc15' }} />
          <div style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: COLORS.secondary }} />
          <div style={{ marginLeft: 20, fontFamily: TYPOGRAPHY.fontFamily, fontSize: 24, color: COLORS.text, fontWeight: 'bold', opacity: 0.8 }}>
            Claude AI - <span style={{ color: glitchStarts ? COLORS.errorRed : COLORS.secondary }}>Active Session</span>
          </div>
        </div>

        {/* Chat Area */}
        <div style={{ flex: 1, padding: 40, display: 'flex', flexDirection: 'column', gap: 30 }}>
          
          {/* User Message */}
          {isSent && (
            <div style={{ alignSelf: 'flex-end', backgroundColor: COLORS.primary, padding: '20px 30px', borderRadius: '24px 24px 4px 24px', maxWidth: '80%' }}>
              <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 32, color: COLORS.background, fontWeight: 500 }}>
                {rawQuery}
              </div>
            </div>
          )}

          {/* AI Response / Loading */}
          {showLoading && (
            <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 12, padding: '20px', alignItems: 'center', height: 76 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: COLORS.secondary, opacity: interpolate((frame + i * 15) % 60, [0, 30, 60], [0.3, 1, 0.3]) }} />
              ))}
            </div>
          )}

          {showResponse && (
            <div
              style={{
                alignSelf: 'flex-start',
                backgroundColor: glitchStarts ? '#2a0a14' : '#1e293b',
                padding: '20px 30px',
                borderRadius: '24px 24px 24px 4px',
                maxWidth: '80%',
                border: glitchStarts ? `2px solid ${COLORS.errorRed}` : 'none',
              }}
            >
              <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 32, color: glitchStarts ? COLORS.accent : COLORS.text, lineHeight: 1.5 }}>
                {scrambledResponse}
              </div>
              {glitchStarts && (
                <div style={{ fontFamily: 'monospace', fontSize: 24, color: COLORS.errorRed, marginTop: 20 }}>
                  FATAL_ERR: DIM_3_DETERMINANT_VIOLATION
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div style={{ height: 100, borderTop: '1px solid rgba(255,255,255,0.05)', padding: '20px 30px', display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, height: '100%', backgroundColor: '#0b1326', borderRadius: 12, padding: '0 20px', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 28, color: COLORS.text, opacity: isSent ? 0.3 : 1 }}>
              {isSent ? "Ask a follow up..." : currentQuery}
              {!isSent && <span style={{ display: 'inline-block', width: 4, height: 28, backgroundColor: COLORS.text, marginLeft: 4, verticalAlign: 'middle' }} />}
            </div>
          </div>
        </div>
      </div>
      
      {/* Glitch Overlay for whole screen */}
      {glitchStarts && (
        <AbsoluteFill style={{ backgroundColor: COLORS.errorRed, mixBlendMode: 'color-dodge', opacity: glitchIntensity * (seededRandom(frame) > 0.5 ? 0.3 : 0), pointerEvents: 'none' }} />
      )}
    </AbsoluteFill>
  );
};

// --- Fragment 3: Subscribe CTA (17.32 - 22.1s) ---
const SubscribeCTAScene: React.FC = () => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Card slide up
  const cardY = interpolate(frame, [20, 60], [200, 0], {
    easing: EASINGS.easeOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Cursor animation
  // Start: (1500, 900), End: center of button (~960, 580)
  const cursorX = interpolate(frame, [60, 120], [1500, 960], {
    easing: EASINGS.easeInOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const cursorY = interpolate(frame, [60, 120], [1000, 580], {
    easing: EASINGS.easeInOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const isHovered = frame > 110;
  const isClicked = frame > 130;

  // Button click scale effect
  const btnScale = interpolate(frame, [130, 135, 145], [1, 0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const btnBg = isClicked ? COLORS.surface : (isHovered ? '#c395ff' : COLORS.primary);
  const btnTextCol = isClicked ? COLORS.secondary : COLORS.background;
  const btnText = isClicked ? 'ВЫ ПОДПИСАНЫ' : 'ПОДПИСАТЬСЯ';
  
  const rippleScale = interpolate(frame, [135, 160], [0, 3], {
    easing: EASINGS.easeOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rippleOpacity = interpolate(frame, [135, 160], [0.8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, opacity, justifyContent: 'center', alignItems: 'center' }}>
      
      {/* Background Particles / Tech Grid */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.1, backgroundImage: `radial-gradient(${COLORS.secondary} 2px, transparent 2px)`, backgroundSize: '60px 60px', transform: `translateY(${frame * 0.5}px)` }} />
      
      {/* Main CTA Card */}
      <div
        style={{
          width: 800,
          padding: 60,
          backgroundColor: 'rgba(23, 31, 51, 0.8)',
          backdropFilter: 'blur(20px)',
          borderRadius: 40,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: `0 40px 100px rgba(0,0,0,0.8), 0 0 80px ${isClicked ? COLORS.secondary : COLORS.primary}33`,
          transform: `translateY(${cardY}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 40,
        }}
      >
        <div style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 48, fontWeight: 800, color: COLORS.text, textAlign: 'center', lineHeight: 1.2 }}>
          Технологии ломают<br/>привычный мир
        </div>
        
        <div style={{ position: 'relative' }}>
          {/* Ripple Effect */}
          {frame > 135 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 24,
                backgroundColor: COLORS.secondary,
                transform: `scale(${rippleScale})`,
                opacity: rippleOpacity,
                pointerEvents: 'none',
              }}
            />
          )}

          {/* Button */}
          <div
            style={{
              padding: '24px 60px',
              backgroundColor: btnBg,
              borderRadius: 24,
              transform: `scale(${btnScale})`,
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              border: isClicked ? `2px solid ${COLORS.secondary}` : 'none',
              boxShadow: isHovered && !isClicked ? `0 0 40px ${COLORS.primary}88` : 'none',
              transition: 'background-color 0.2s',
              zIndex: 2,
              position: 'relative',
            }}
          >
            <span style={{ fontFamily: TYPOGRAPHY.fontFamily, fontSize: 36, fontWeight: 900, color: btnTextCol, letterSpacing: 2 }}>
              {btnText}
            </span>
          </div>
        </div>
      </div>

      {/* Cursor */}
      <div
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY,
          zIndex: 10,
          transform: isClicked ? 'scale(0.9)' : 'scale(1)',
        }}
      >
        {/* Simple stylized cursor SVG */}
        <svg width="60" height="90" viewBox="0 0 100 150">
          <path d="M 20 20 L 80 80 L 50 90 L 40 140 Z" fill="#ffffff" stroke="#000000" strokeWidth="8" />
        </svg>
      </div>

    </AbsoluteFill>
  );
};

// =============================================================================
// MAIN COMPOSITION
// =============================================================================
const Scene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {/* 
        TIMINGS (60 FPS):
        F1 (Fast Cuts): 0.15 - 8.32s -> Frames 9 to 499 (Length 490)
        F2 (Chat): 8.06 - 17.59s -> Frames 483 to 1055 (Length 572)
        F3 (CTA): 17.32 - 22.1s -> Frames 1039 to 1326 (Length 287)
      */}

      <Sequence from={9} durationInFrames={490}>
        <FastCutsScene />
      </Sequence>

      <Sequence from={483} durationInFrames={572}>
        <ChatInterfaceScene />
      </Sequence>

      <Sequence from={1039} durationInFrames={287}>
        <SubscribeCTAScene />
      </Sequence>

    </AbsoluteFill>
  );
};

export default Scene;