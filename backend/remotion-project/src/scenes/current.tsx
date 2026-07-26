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
  durationInFrames: 2880, // 48s * 60fps
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
// SUBCOMPONENTS
// =============================================================================

// Fragment 1: 0.15 - 2.75s (Frames 9 - 165)
const MathCubeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20, 136, 156], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cubeScale = interpolate(frame, [0, 60], [0.5, 1], {
    easing: EASINGS.overshoot,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const cubeRotation = frame * 0.5;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity }}>
      <div style={{ position: 'relative', width: 400, height: 400, transform: `scale(${cubeScale}) rotate(${cubeRotation}deg)` }}>
        <svg viewBox="-100 -100 200 200" width="100%" height="100%" style={{ overflow: 'visible' }}>
          <path d="M 0 0 L 86.6 -50 L 0 -100 L -86.6 -50 Z" fill={COLORS.primary} opacity={0.9} />
          <path d="M 0 0 L -86.6 -50 L -86.6 50 L 0 100 Z" fill={COLORS.secondary} opacity={0.7} />
          <path d="M 0 0 L 86.6 -50 L 86.6 50 L 0 100 Z" fill={COLORS.accent} opacity={0.8} />
          <path d="M 0 0 L 86.6 -50 M 0 0 L -86.6 -50 M 0 0 L 0 100" stroke={COLORS.background} strokeWidth={3} />
        </svg>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: '20%',
          fontFamily: TYPOGRAPHY.fontFamily,
          fontSize: width * 0.05,
          fontWeight: 900,
          color: COLORS.text,
          textShadow: `0 10px 30px ${COLORS.primary}66`,
        }}
      >
        Гипотеза Якоби
      </div>
    </AbsoluteFill>
  );
};

// Fragment 2 & 3: Grid Flythrough and Icons (Frames 148 - 929)
const InfiniteGridWithIcons: React.FC = () => {
  const frame = useCurrentFrame();
  
  const gridOpacity = interpolate(frame, [0, 30, 751, 781], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const gridOffset = (frame * 4) % 100;
  const gridScale = interpolate(frame, [0, 781], [1, 2.5], {
    extrapolateRight: 'clamp',
  });

  // Icons logic (starts later within this sequence at local frame 222 = global 370)
  const iconsLocalFrame = frame - 222;
  const showIcons = iconsLocalFrame >= 0;
  
  const iconsOpacity = interpolate(iconsLocalFrame, [0, 30, 529, 559], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const crossoutWidth = interpolate(iconsLocalFrame, [120, 160], [0, 140], {
    easing: EASINGS.easeOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      {/* Moving 3D Grid */}
      <AbsoluteFill style={{ opacity: gridOpacity, perspective: 800 }}>
        <div style={{ position: 'absolute', width: '200%', height: '200%', left: '-50%', top: '-20%', transform: `rotateX(60deg) scale(${gridScale})`, transformOrigin: 'center 80%' }}>
          <svg width="100%" height="100%">
            <defs>
              <pattern id="flyGrid" width="100" height="100" patternUnits="userSpaceOnUse" patternTransform={`translate(0, ${gridOffset})`}>
                <path d="M 100 0 L 0 0 0 100" fill="none" stroke={COLORS.secondary} strokeWidth={2} opacity={0.4} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#flyGrid)" />
          </svg>
        </div>
      </AbsoluteFill>

      {/* Floating Icons */}
      {showIcons && (
        <div style={{ display: 'flex', gap: '8%', zIndex: 10, opacity: iconsOpacity }}>
          {['+', '−', '×', '÷'].map((icon, i) => {
            const floatY = Math.sin((iconsLocalFrame + i * 20) * 0.05) * 20;
            const isDivide = icon === '÷';
            
            return (
              <div
                key={icon}
                style={{
                  width: 200,
                  height: 200,
                  backgroundColor: COLORS.surface,
                  borderRadius: 40,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: 120,
                  fontWeight: 900,
                  color: COLORS.primary,
                  fontFamily: TYPOGRAPHY.fontFamily,
                  transform: `translateY(${floatY}px)`,
                  boxShadow: `0 20px 50px rgba(0,0,0,0.5)`,
                  border: `2px solid ${COLORS.primary}44`,
                  position: 'relative',
                }}
              >
                {icon}
                {isDivide && (
                  <div
                    style={{
                      position: 'absolute',
                      width: `${crossoutWidth}%`,
                      height: 16,
                      backgroundColor: COLORS.errorRed,
                      transform: 'rotate(-45deg)',
                      borderRadius: 8,
                      boxShadow: `0 0 20px ${COLORS.errorRed}`,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

// Fragment 4: 15.22 - 18.40s (Frames 913 - 1104)
const PolyMappingText: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const opacity = interpolate(frame, [0, 20, 171, 191], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = interpolate(frame, [0, 191], [0.9, 1.1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity }}>
      <div
        style={{
          fontFamily: TYPOGRAPHY.fontFamily,
          fontSize: width * 0.07,
          fontWeight: 900,
          color: COLORS.text,
          transform: `scale(${scale})`,
          textAlign: 'center',
          lineHeight: 1.2,
          textShadow: `0 15px 40px ${COLORS.secondary}44`,
        }}
      >
        Полиномиальное<br />
        <span style={{ color: COLORS.secondary }}>отображение</span>
      </div>
    </AbsoluteFill>
  );
};

// Fragment 5: 18.14 - 25.31s (Frames 1088 - 1519)
const PointZoom: React.FC = () => {
  const frame = useCurrentFrame();
  
  const opacity = interpolate(frame, [0, 30, 401, 431], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const zoomScale = interpolate(frame, [0, 200], [1, 5], {
    easing: EASINGS.easeInOut,
    extrapolateRight: 'clamp',
  });

  const pulseRadius = 100 + Math.sin(frame * 0.1) * 20;
  const pulseOpacity = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.2, 0.8]);

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity }}>
      {/* Background abstract grid zooming in */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', transform: `scale(${zoomScale})`, opacity: 0.3 }}>
        <svg width="100%" height="100%">
          <pattern id="zoomGrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke={COLORS.primary} strokeWidth={1} />
          </pattern>
          <rect width="100%" height="100%" fill="url(#zoomGrid)" />
        </svg>
      </div>

      {/* Central Point */}
      <div
        style={{
          width: 40,
          height: 40,
          backgroundColor: COLORS.text,
          borderRadius: '50%',
          zIndex: 2,
          boxShadow: `0 0 30px ${COLORS.text}`,
        }}
      />

      {/* Pulsing Red Sphere outline */}
      <div
        style={{
          position: 'absolute',
          width: pulseRadius * 2,
          height: pulseRadius * 2,
          borderRadius: '50%',
          border: `6px solid ${COLORS.accent}`,
          opacity: pulseOpacity,
          boxShadow: `0 0 40px ${COLORS.accent} inset, 0 0 40px ${COLORS.accent}`,
          zIndex: 1,
        }}
      />
    </AbsoluteFill>
  );
};

// Fragment 6: 25.05 - 33.12s (Frames 1503 - 1987)
const PointDistort: React.FC = () => {
  const frame = useCurrentFrame();
  
  const opacity = interpolate(frame, [0, 30, 454, 484], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Stretch into oval (frame 60 to 180) -> Squash into pancake (180 to 300)
  const scaleX = interpolate(frame, [0, 60, 180, 300], [1, 1, 2.5, 4], {
    easing: EASINGS.easeInOut,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  
  const scaleY = interpolate(frame, [0, 60, 180, 300], [1, 1, 0.6, 0.1], {
    easing: EASINGS.easeInOut,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity }}>
      {/* Background Grid */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', transform: 'scale(5)', opacity: 0.1 }}>
        <svg width="100%" height="100%">
          <pattern id="distortGrid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke={COLORS.primary} strokeWidth={1} />
          </pattern>
          <rect width="100%" height="100%" fill="url(#distortGrid)" />
        </svg>
      </div>

      {/* Transforming Sphere */}
      <div
        style={{
          width: 240,
          height: 240,
          backgroundColor: `${COLORS.accent}44`,
          border: `8px solid ${COLORS.accent}`,
          borderRadius: '50%',
          transform: `scaleX(${scaleX}) scaleY(${scaleY})`,
          boxShadow: `0 0 60px ${COLORS.accent}`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{ width: 40, height: 40, backgroundColor: COLORS.text, borderRadius: '50%' }} />
      </div>
    </AbsoluteFill>
  );
};

// Fragment 7: 32.88 - 36.61s (Frames 1973 - 2197)
const HydraulicPress: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  
  const opacity = interpolate(frame, [0, 20, 204, 224], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Top press moves down, Bottom press moves up
  const topPressY = interpolate(frame, [40, 160], [-500, height * 0.5 - 40], {
    easing: EASINGS.easeIn,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  
  const bottomPressY = interpolate(frame, [40, 160], [height + 100, height * 0.5 + 40], {
    easing: EASINGS.easeIn,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const canHeight = interpolate(frame, [100, 160], [300, 30], {
    easing: EASINGS.easeIn,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <AbsoluteFill style={{ alignItems: 'center', opacity }}>
      {/* Top Press */}
      <div
        style={{
          position: 'absolute',
          top: topPressY,
          width: 800,
          height: 500,
          backgroundColor: '#334155',
          borderBottom: '20px solid #1e293b',
          transform: 'translateY(-100%)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.8)',
        }}
      />
      
      {/* Bottom Press */}
      <div
        style={{
          position: 'absolute',
          top: bottomPressY,
          width: 800,
          height: 500,
          backgroundColor: '#334155',
          borderTop: '20px solid #1e293b',
          boxShadow: '0 -30px 60px rgba(0,0,0,0.8)',
        }}
      />

      {/* Metal Can */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 200,
          height: canHeight,
          backgroundColor: '#94a3b8',
          transform: 'translate(-50%, -50%)',
          borderRadius: interpolate(canHeight, [300, 30], [20, 15]),
          border: '4px solid #cbd5e1',
          boxShadow: 'inset 20px 0 40px rgba(0,0,0,0.3)',
        }}
      />
    </AbsoluteFill>
  );
};

// Fragment 8: 36.35 - 38.71s (Frames 2181 - 2323)
const PointMerge: React.FC = () => {
  const frame = useCurrentFrame();
  
  const opacity = interpolate(frame, [0, 10, 132, 142], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const dot1X = interpolate(frame, [20, 80], [-300, 0], {
    easing: EASINGS.easeIn,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const dot2X = interpolate(frame, [20, 80], [300, 0], {
    easing: EASINGS.easeIn,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const mergeFrame = frame - 80;
  const isMerged = mergeFrame >= 0;

  const glitchOpacity = interpolate(mergeFrame, [0, 5, 20], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity }}>
      {/* Grid */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.2 }}>
        <svg width="100%" height="100%">
          <pattern id="mergeGrid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke={COLORS.primary} strokeWidth={2} />
          </pattern>
          <rect width="100%" height="100%" fill="url(#mergeGrid)" />
        </svg>
      </div>

      <div style={{ position: 'relative', width: 100, height: 100 }}>
        {/* Dot 1 */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 60,
            height: 60,
            backgroundColor: COLORS.secondary,
            borderRadius: '50%',
            transform: `translate(calc(-50% + ${dot1X}px), -50%)`,
            boxShadow: `0 0 40px ${COLORS.secondary}`,
            opacity: isMerged ? 0 : 1,
          }}
        />
        
        {/* Dot 2 */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 60,
            height: 60,
            backgroundColor: COLORS.primary,
            borderRadius: '50%',
            transform: `translate(calc(-50% + ${dot2X}px), -50%)`,
            boxShadow: `0 0 40px ${COLORS.primary}`,
            opacity: isMerged ? 0 : 1,
          }}
        />

        {/* Merged Glitch Dot */}
        {isMerged && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 80,
              height: 80,
              backgroundColor: COLORS.errorRed,
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: `0 0 80px ${COLORS.errorRed}`,
            }}
          />
        )}
      </div>

      {/* Glitch Overlay */}
      {isMerged && (
        <AbsoluteFill
          style={{
            backgroundColor: COLORS.errorRed,
            opacity: glitchOpacity * 0.3,
            mixBlendMode: 'screen',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// Fragment 9: 38.71 - 46.31s (Frames 2323 - 2779)
const MathCurve: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const opacity = interpolate(frame, [0, 30, 426, 456], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const pathProgress = interpolate(frame, [30, 150], [100, 0], {
    easing: EASINGS.easeInOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const textOpacity = interpolate(frame, [150, 180], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const textY = interpolate(frame, [150, 180], [50, 0], {
    easing: EASINGS.easeOut,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity }}>
      {/* Background Grid */}
      <div style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.15 }}>
        <svg width="100%" height="100%">
          <pattern id="curveGrid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke={COLORS.primary} strokeWidth={2} />
          </pattern>
          <rect width="100%" height="100%" fill="url(#curveGrid)" />
        </svg>
      </div>

      {/* Smooth Mathematical Curve */}
      <svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <path
          d="M -100 800 C 400 800, 600 200, 1000 200 S 1500 800, 2020 800"
          fill="none"
          stroke={COLORS.secondary}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray="100"
          pathLength="100"
          strokeDashoffset={pathProgress}
          style={{ filter: `drop-shadow(0 0 20px ${COLORS.secondary})` }}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          top: '35%',
          fontFamily: TYPOGRAPHY.fontFamily,
          fontSize: width * 0.06,
          fontWeight: 900,
          color: COLORS.accent,
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          textShadow: `0 10px 40px ${COLORS.accent}66`,
        }}
      >
        Определитель ≠ 0
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
      {/* Frag 1: 0.15 - 2.75s -> Frames 9 - 165 (Duration: 156) */}
      <Sequence from={9} durationInFrames={156}>
        <MathCubeScene />
      </Sequence>
      
      {/* Frag 2 & 3: 2.47 - 15.48s -> Frames 148 - 929 (Duration: 781) */}
      <Sequence from={148} durationInFrames={781}>
        <InfiniteGridWithIcons />
      </Sequence>
      
      {/* Frag 4: 15.22 - 18.40s -> Frames 913 - 1104 (Duration: 191) */}
      <Sequence from={913} durationInFrames={191}>
        <PolyMappingText />
      </Sequence>
      
      {/* Frag 5: 18.14 - 25.31s -> Frames 1088 - 1519 (Duration: 431) */}
      <Sequence from={1088} durationInFrames={431}>
        <PointZoom />
      </Sequence>
      
      {/* Frag 6: 25.05 - 33.12s -> Frames 1503 - 1987 (Duration: 484) */}
      <Sequence from={1503} durationInFrames={484}>
        <PointDistort />
      </Sequence>
      
      {/* Frag 7: 32.88 - 36.61s -> Frames 1973 - 2197 (Duration: 224) */}
      <Sequence from={1973} durationInFrames={224}>
        <HydraulicPress />
      </Sequence>
      
      {/* Frag 8: 36.35 - 38.71s -> Frames 2181 - 2323 (Duration: 142) */}
      <Sequence from={2181} durationInFrames={142}>
        <PointMerge />
      </Sequence>
      
      {/* Frag 9: 38.71 - 46.31s -> Frames 2323 - 2779 (Duration: 456) */}
      <Sequence from={2323} durationInFrames={456}>
        <MathCurve />
      </Sequence>
    </AbsoluteFill>
  );
};

export default Scene;