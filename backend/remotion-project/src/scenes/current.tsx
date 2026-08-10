import React from 'react';
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  AbsoluteFill,
  Sequence,
} from 'remotion';

export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 511,
  fps: 30,
  width: 3840,
  height: 2160,
};

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
} as const;

const EASINGS = {
  easeOut: Easing.bezier(0.33, 1, 0.68, 1),
  easeIn: Easing.bezier(0.32, 0, 0.67, 0),
  easeInOut: Easing.bezier(0.37, 0, 0.63, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
};

// =============================================================================
// FRAGMENT 1: Stands (00:12:22 - 00:12:35)
// =============================================================================
const StandBlock: React.FC<{
  title: string;
  badge: string;
  delay: number;
  badgeColor: string;
}> = ({ title, badge, delay, badgeColor }) => {
  const frame = useCurrentFrame();
  
  const yOffset = interpolate(frame, [delay, delay + 25], [1000, 0], {
    easing: EASINGS.easeOut,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const badgeScale = interpolate(frame, [delay + 15, delay + 35], [0, 1], {
    easing: EASINGS.overshoot,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <div
      style={{
        width: '35vw',
        height: '22vw',
        backgroundColor: COLORS.surface,
        borderRadius: '2vw',
        border: `0.4vw solid ${COLORS.primary}`,
        boxShadow: `0 3vw 0 ${COLORS.primary}, 0 5vw 10vw rgba(0,0,0,0.5)`,
        transform: `translateY(${yOffset}px)`,
        opacity,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: '4.5vw',
          color: COLORS.text,
          fontWeight: 800,
          fontFamily: TYPOGRAPHY.fontFamily,
          textAlign: 'center',
          marginBottom: '2vw',
        }}
      >
        {title}
      </div>
      <div
        style={{
          transform: `scale(${badgeScale})`,
          backgroundColor: badgeColor,
          color: COLORS.background,
          padding: '1vw 3vw',
          borderRadius: '1vw',
          fontSize: '3.5vw',
          fontWeight: 900,
          fontFamily: TYPOGRAPHY.fontFamily,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {badge}
      </div>
    </div>
  );
};

const StandsScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const exitOpacity = interpolate(frame, [duration - 15, duration], [1, 0], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
        gap: '6vw',
        opacity: exitOpacity,
      }}
    >
      <StandBlock
        title="Проверено 10"
        badge="True"
        delay={0}
        badgeColor={COLORS.secondary}
      />
      <StandBlock
        title="Пропущено"
        badge="Also True"
        delay={10}
        badgeColor={COLORS.accent}
      />
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 2: NOT AGI (00:12:35 - 00:12:51)
// =============================================================================
const NotAgiScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const scale1 = interpolate(frame, [0, 20], [3, 1], {
    easing: EASINGS.easeOut,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const opacity1 = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const scale2 = interpolate(frame, [25, 45], [0.5, 1], {
    easing: EASINGS.overshoot,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const opacity2 = interpolate(frame, [25, 35], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const exitOpacity = interpolate(frame, [duration - 15, duration], [1, 0], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity: exitOpacity,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2vw',
        }}
      >
        <div
          style={{
            fontSize: '12vw',
            fontWeight: 900,
            color: COLORS.accent,
            fontFamily: TYPOGRAPHY.fontFamily,
            lineHeight: 1.1,
            transform: `scale(${scale1})`,
            opacity: opacity1,
            textShadow: `0 1vw 3vw ${COLORS.accent}66`,
          }}
        >
          NOT AGI.
        </div>
        <div
          style={{
            fontSize: '8vw',
            fontWeight: 800,
            color: COLORS.secondary,
            fontFamily: TYPOGRAPHY.fontFamily,
            lineHeight: 1.1,
            transform: `scale(${scale2})`,
            opacity: opacity2,
          }}
        >
          BUT CHECKABLE.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 3: Envelopes & Magnifying Glass (00:12:51 - 00:13:06)
// =============================================================================
const Envelope: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [delay, delay + 15], [0, 1], {
    easing: EASINGS.overshoot,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <div
      style={{
        width: '10vw',
        height: '7vw',
        backgroundColor: COLORS.surface,
        borderRadius: '0.5vw',
        border: `0.3vw solid ${COLORS.primary}`,
        position: 'relative',
        transform: `scale(${scale})`,
        overflow: 'hidden',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 70">
        <path
          d="M 0 0 L 50 40 L 100 0"
          fill="none"
          stroke={COLORS.primary}
          strokeWidth="6"
        />
      </svg>
    </div>
  );
};

const MagnifyingGlassScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const glassX = interpolate(frame, [20, 90], [-30, 30], {
    easing: EASINGS.easeInOut,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const glassOpacity = interpolate(frame, [20, 30], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  
  const textY = interpolate(frame, [40, 60], [100, 0], {
    easing: EASINGS.easeOut,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const textOpacity = interpolate(frame, [40, 55], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const exitOpacity = interpolate(frame, [duration - 15, duration], [1, 0], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity: exitOpacity,
        flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', width: '60vw', height: '20vw' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '2vw',
            position: 'absolute',
            width: '100%',
            height: '100%',
          }}
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <Envelope key={i} delay={i * 2} />
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            top: '-5vw',
            left: '50%',
            transform: `translate(calc(-50% + ${glassX}vw), 0)`,
            opacity: glassOpacity,
            zIndex: 10,
          }}
        >
          <svg
            width="18vw"
            height="18vw"
            viewBox="0 0 24 24"
            fill="none"
            stroke={COLORS.secondary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" fill={`${COLORS.background}99`} backdropFilter="blur(10px)"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
      </div>

      <div
        style={{
          marginTop: '6vw',
          fontSize: '4vw',
          color: COLORS.text,
          fontWeight: 700,
          fontFamily: TYPOGRAPHY.fontFamily,
          backgroundColor: COLORS.surface,
          padding: '1.5vw 3vw',
          borderRadius: '2vw',
          border: `0.3vw solid ${COLORS.primary}`,
          transform: `translateY(${textY}px)`,
          opacity: textOpacity,
        }}
      >
        Публичное чтение — идет сейчас
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 4: Marketing to Peer Review (00:13:06 - 00:13:20)
// =============================================================================
const MarketingToPeerReviewScene: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  // Marketing Phase
  const marketingOpacity = interpolate(frame, [0, 10, 45, 55], [0, 1, 1, 0], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const marketingScale = interpolate(frame, [0, 15, 45, 55], [0.8, 1, 1, 0.8], {
    easing: EASINGS.easeOut,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const crossWidth = interpolate(frame, [20, 35], [0, 100], {
    easing: EASINGS.easeInOut,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  // Peer Review Phase
  const peerReviewScale = interpolate(frame, [50, 70], [0.5, 1], {
    easing: EASINGS.overshoot,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const peerReviewOpacity = interpolate(frame, [50, 65], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  // Subscribe Button
  const subY = interpolate(frame, [80, 100], [200, 0], {
    easing: EASINGS.overshoot,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const subOpacity = interpolate(frame, [80, 95], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const exitOpacity = interpolate(frame, [duration - 15, duration], [1, 0], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity: exitOpacity,
      }}
    >
      {/* Marketing Group */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2vw',
          transform: `scale(${marketingScale})`,
          opacity: marketingOpacity,
        }}
      >
        <svg
          width="12vw"
          height="12vw"
          viewBox="0 0 24 24"
          fill="none"
          stroke={COLORS.primary}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              fontSize: '5vw',
              color: COLORS.text,
              fontWeight: 800,
              fontFamily: TYPOGRAPHY.fontFamily,
            }}
          >
            Отдел маркетинга
          </span>
          {/* Cross out line */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '-5%',
              width: `${crossWidth}%`,
              height: '0.8vw',
              backgroundColor: COLORS.accent,
              transform: 'translateY(-50%) rotate(-3deg)',
              boxShadow: `0 0 2vw ${COLORS.accent}`,
            }}
          />
        </div>
      </div>

      {/* Peer Review Group */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '3vw',
          transform: `scale(${peerReviewScale}) translateY(-4vw)`,
          opacity: peerReviewOpacity,
        }}
      >
        <div
          style={{
            fontSize: '8vw',
            color: COLORS.secondary,
            fontWeight: 900,
            fontFamily: TYPOGRAPHY.fontFamily,
            textTransform: 'uppercase',
            textShadow: `0 0 4vw ${COLORS.secondary}88`,
          }}
        >
          Peer Review
        </div>
      </div>

      {/* Subscribe Button */}
      <div
        style={{
          position: 'absolute',
          bottom: '15%',
          transform: `translateY(${subY}px)`,
          opacity: subOpacity,
        }}
      >
        <div
          style={{
            backgroundColor: COLORS.primary,
            color: COLORS.background,
            padding: '1.5vw 4vw',
            borderRadius: '4vw',
            fontSize: '3.5vw',
            fontWeight: 800,
            fontFamily: TYPOGRAPHY.fontFamily,
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '1.5vw',
            boxShadow: `0 2vw 4vw rgba(0,0,0,0.6)`,
          }}
        >
          <svg
            width="4vw"
            height="4vw"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2C5.12 19.5 12 19.5 12 19.5s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z" />
            <polygon fill={COLORS.background} stroke={COLORS.background} points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
          </svg>
          Subscribe
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const Scene: React.FC = () => {
  // Timings:
  // F1: 0.00 - 4.88s  => 146 frames
  // F2: 4.88 - 8.95s  => 123 frames
  // F3: 8.95 - 12.87s => 117 frames
  // F4: 12.87 - 17.03s => 125 frames
  // Total: 511 frames
  
  const SCENES = [
    { id: 'F1', from: 0, duration: 146 },
    { id: 'F2', from: 146, duration: 123 },
    { id: 'F3', from: 269, duration: 117 },
    { id: 'F4', from: 386, duration: 125 },
  ] as const;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      {SCENES.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.from}
          durationInFrames={scene.duration}
        >
          {scene.id === 'F1' && <StandsScene duration={scene.duration} />}
          {scene.id === 'F2' && <NotAgiScene duration={scene.duration} />}
          {scene.id === 'F3' && <MagnifyingGlassScene duration={scene.duration} />}
          {scene.id === 'F4' && <MarketingToPeerReviewScene duration={scene.duration} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export default Scene;