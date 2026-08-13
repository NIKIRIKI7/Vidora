import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';
import { Wallet, CreditCard, ArrowRight, ServerCog, Lock, TrendingDown } from 'lucide-react';

// =============================================================================
// COMPOSITION CONFIG
// =============================================================================
export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 660,
  fps: 30,
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
// BILL PAYMENT VISUAL (0 - 8s)
// =============================================================================
const BillPaymentVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const walletY = interpolate(frame, [0, 25], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeOut,
  });
  const walletOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardScale = interpolate(frame, [15, 40], [0.7, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
    output: 'perceptual-scale',
  });
  const cardOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Flying money bills — staggered
  const bills = [0, 1, 2, 3, 4, 5].map((i) => {
    const delay = 45 + i * 9;
    const dur = 55;
    const progress = interpolate(frame, [delay, delay + dur], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASINGS.easeIn,
    });
    const opacity = interpolate(
      frame,
      [delay, delay + 10, delay + dur - 15, delay + dur],
      [0, 1, 1, 0],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
    );
    const xOffset = (i % 3) * 26 - 26;
    const startX = width * 0.5 + xOffset;
    const startY = height * 0.5 - 10;
    const endX = width * 0.82 + xOffset * 0.4;
    const endY = height * 0.18 - i * 6;
    const curX = startX + (endX - startX) * progress;
    const curY = startY + (endY - startY) * progress - Math.sin(progress * Math.PI) * 90;
    const rotate = interpolate(progress, [0, 1], [0, 25 + i * 8]);
    return { curX, curY, rotate, opacity };
  });

  const counterValue = Math.round(
    interpolate(frame, [40, 130], [0, 50], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASINGS.easeInOut,
    }),
  );
  const counterOpacity = interpolate(frame, [40, 55], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sceneOutOpacity = interpolate(frame, [190, 220], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      className="flex items-center justify-center"
      style={{ backgroundColor: COLORS.background, opacity: sceneOutOpacity }}
    >
      {/* Ambient glow */}
      <div
        className="absolute rounded-full"
        style={{
          width: 900,
          height: 900,
          background: `radial-gradient(circle, ${COLORS.primary}22 0%, transparent 70%)`,
          top: '10%',
          left: '20%',
        }}
      />

      <div className="flex items-center justify-center gap-24 relative z-10">
        {/* Wallet */}
        <div
          className="flex flex-col items-center gap-6"
          style={{ transform: `translateY(${walletY}px)`, opacity: walletOpacity }}
        >
          <div
            className="flex items-center justify-center rounded-[40px] border"
            style={{
              width: 260,
              height: 260,
              backgroundColor: COLORS.surface,
              borderColor: `${COLORS.primary}33`,
            }}
          >
            <Wallet
              className="w-28 h-28"
              style={{ color: COLORS.primary }}
              strokeWidth={1.5}
            />
          </div>
          <span
            className="text-3xl font-bold tracking-wide"
            style={{ color: COLORS.text }}
          >
            Ваш кошелёк
          </span>
        </div>

        <ArrowRight
          className="w-20 h-20"
          style={{ color: `${COLORS.text}55`, opacity: walletOpacity }}
          strokeWidth={1.5}
        />

        {/* Card / Bill payment */}
        <div
          className="flex flex-col items-center gap-6"
          style={{ transform: `scale(${cardScale})`, opacity: cardOpacity }}
        >
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-[40px] border relative overflow-hidden"
            style={{
              width: 340,
              height: 260,
              backgroundColor: COLORS.surface,
              borderColor: `${COLORS.accent}44`,
            }}
          >
            <div
              className="absolute top-0 left-0 w-full h-2"
              style={{ backgroundColor: COLORS.accent }}
            />
            <CreditCard
              className="w-20 h-20"
              style={{ color: COLORS.accent }}
              strokeWidth={1.5}
            />
            <span
              className="text-4xl font-black"
              style={{ color: COLORS.accent, opacity: counterOpacity }}
            >
              ${counterValue}/мес
            </span>
          </div>
          <span
            className="text-3xl font-bold tracking-wide"
            style={{ color: COLORS.text }}
          >
            SaaS-подписка
          </span>
        </div>
      </div>

      {/* Flying money bills */}
      {bills.map((bill, idx) => (
        <div
          key={idx}
          className="absolute flex items-center justify-center rounded-lg"
          style={{
            width: 70,
            height: 42,
            left: bill.curX,
            top: bill.curY,
            backgroundColor: COLORS.secondary,
            opacity: bill.opacity,
            transform: `rotate(${bill.rotate}deg)`,
          }}
        >
          <span className="text-xl font-black" style={{ color: COLORS.background }}>
            $
          </span>
        </div>
      ))}
    </AbsoluteFill>
  );
};

// =============================================================================
// CODE LEAK VISUAL (7s - 14.5s)
// =============================================================================
const CodeLeakVisual: React.FC = () => {
  const frame = useCurrentFrame();

  const inOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const outOpacity = interpolate(frame, [175, 210], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const browserY = interpolate(frame, [0, 30], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeOut,
  });

  const serverScale = interpolate(frame, [10, 40], [0.8, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
    output: 'perceptual-scale',
  });

  const codeLines = ['const apiKey = "sk-...";', 'function auth() {', '  return db.connect();', '}'];

  const linesRevealed = interpolate(frame, [30, 90], [0, codeLines.length], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeInOut,
  });

  const dashOffset = interpolate(frame, [50, 130], [0, -400], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeInOut,
  });
  const arrowOpacity = interpolate(frame, [45, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const lockShake = Math.sin(frame / 3) * (frame > 140 && frame < 175 ? 4 : 0);

  return (
    <AbsoluteFill
      className="flex items-center justify-center"
      style={{ backgroundColor: COLORS.background, opacity: inOpacity * outOpacity }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 800,
          height: 800,
          background: `radial-gradient(circle, ${COLORS.accent}1e 0%, transparent 70%)`,
          top: '15%',
          right: '10%',
        }}
      />

      <div className="flex items-center justify-center gap-16 relative z-10 w-full max-w-6xl">
        {/* Browser code block */}
        <div
          className="flex flex-col gap-4 rounded-[32px] border p-8 relative overflow-hidden"
          style={{
            width: 520,
            backgroundColor: COLORS.surface,
            borderColor: `${COLORS.primary}33`,
            transform: `translateY(${browserY}px)`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.accent }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.secondary }} />
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.primary }} />
            <span className="text-lg font-bold ml-3 opacity-50" style={{ color: COLORS.text }}>
              browser://ai-chat
            </span>
          </div>
          <div className="flex flex-col gap-2 font-mono">
            {codeLines.map((line, i) => {
              const lineOpacity = interpolate(linesRevealed, [i, i + 0.6], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              });
              return (
                <span
                  key={i}
                  className="text-2xl"
                  style={{ color: i === 0 ? COLORS.accent : COLORS.text, opacity: lineOpacity }}
                >
                  {line}
                </span>
              );
            })}
          </div>
        </div>

        {/* Dashed arrow flow */}
        <div className="flex flex-col items-center gap-3" style={{ opacity: arrowOpacity }}>
          <svg width="180" height="60" viewBox="0 0 180 60">
            <line
              x1="0"
              y1="30"
              x2="160"
              y2="30"
              stroke={COLORS.accent}
              strokeWidth="4"
              strokeDasharray="14 10"
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
            <polygon points="160,20 180,30 160,40" fill={COLORS.accent} />
          </svg>
          <span className="text-xl font-bold uppercase tracking-widest" style={{ color: COLORS.accent }}>
            утечка
          </span>
        </div>

        {/* Foreign server */}
        <div
          className="flex flex-col items-center gap-6"
          style={{ transform: `scale(${serverScale})` }}
        >
          <div
            className="flex items-center justify-center rounded-[40px] border relative"
            style={{
              width: 240,
              height: 240,
              backgroundColor: COLORS.surface,
              borderColor: `${COLORS.accent}44`,
              transform: `translateX(${lockShake}px)`,
            }}
          >
            <ServerCog className="w-24 h-24" style={{ color: COLORS.accent }} strokeWidth={1.5} />
            <div
              className="absolute -bottom-4 -right-4 flex items-center justify-center rounded-full"
              style={{ width: 56, height: 56, backgroundColor: COLORS.background, border: `3px solid ${COLORS.accent}` }}
            >
              <Lock className="w-7 h-7" style={{ color: COLORS.accent }} strokeWidth={2} />
            </div>
          </div>
          <span className="text-3xl font-bold tracking-wide text-center" style={{ color: COLORS.text }}>
            Чужой сервер
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// TITLE CARD ("Есть третий путь") (14.5s - 22s)
// =============================================================================
const ThirdWayTitle: React.FC = () => {
  const frame = useCurrentFrame();

  const inOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const badgeY = interpolate(frame, [0, 25], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeOut,
  });

  const titleScale = interpolate(frame, [15, 45], [0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
    output: 'perceptual-scale',
  });
  const titleOpacity = interpolate(frame, [15, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 10 tool dots orbiting
  const dots = Array.from({ length: 10 }, (_, i) => {
    const delay = 55 + i * 5;
    const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const angle = (i / 10) * Math.PI * 2 + frame / 200;
    const radius = 330;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.55;
    return { x, y, opacity };
  });

  const subOpacity = interpolate(frame, [140, 165], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const subY = interpolate(frame, [140, 165], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeOut,
  });

  return (
    <AbsoluteFill
      className="flex flex-col items-center justify-center"
      style={{ backgroundColor: COLORS.background, opacity: inOpacity }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: 1100,
          height: 1100,
          background: `radial-gradient(circle, ${COLORS.secondary}18 0%, transparent 65%)`,
        }}
      />

      <div
        className="px-8 py-3 rounded-full border mb-10 relative z-10"
        style={{
          backgroundColor: COLORS.surface,
          borderColor: `${COLORS.secondary}44`,
          transform: `translateY(${badgeY}px)`,
        }}
      >
        <span
          className="text-2xl font-bold tracking-[0.3em] uppercase flex items-center gap-3"
          style={{ color: COLORS.secondary }}
        >
          <TrendingDown className="w-7 h-7" strokeWidth={1.5} />
          Третий путь
        </span>
      </div>

      <div className="relative flex items-center justify-center" style={{ width: 900, height: 500 }}>
        {/* orbiting dots representing 10 tools */}
        {dots.map((dot, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 22,
              height: 22,
              backgroundColor: i % 2 === 0 ? COLORS.primary : COLORS.secondary,
              opacity: dot.opacity,
              transform: `translate(${dot.x}px, ${dot.y}px)`,
              boxShadow: `0 0 20px ${i % 2 === 0 ? COLORS.primary : COLORS.secondary}88`,
            }}
          />
        ))}

        <h1
          className="text-[108px] font-black text-center leading-none relative z-10"
          style={{
            color: COLORS.text,
            transform: `scale(${titleScale})`,
            opacity: titleOpacity,
          }}
        >
          Есть третий
          <br />
          путь
        </h1>
      </div>

      <p
        className="text-4xl font-bold text-center max-w-4xl mt-8 relative z-10"
        style={{
          color: COLORS.primary,
          opacity: subOpacity,
          transform: `translateY(${subY}px)`,
        }}
      >
        10 опенсорс-проектов, закрывающих все эти боли
      </p>
    </AbsoluteFill>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const Scene: React.FC = () => {
  return (
    <AbsoluteFill
      className="flex items-center justify-center w-full h-full"
      style={{ backgroundColor: COLORS.background, fontFamily: TYPOGRAPHY.fontFamily }}
    >
      {/* Фрагмент 1a: Оплата SaaS-сервиса (0 - ~7s = 210 frames) */}
      <Sequence from={0} durationInFrames={220} premountFor={30}>
        <BillPaymentVisual />
      </Sequence>

      {/* Фрагмент 1b: Утечка кода в браузер (~7s - 14.5s) */}
      <Sequence from={200} durationInFrames={215} premountFor={30}>
        <CodeLeakVisual />
      </Sequence>

      {/* Фрагмент 1c: "Есть третий путь" + переход к основной части */}
      <Sequence from={395} durationInFrames={265} premountFor={30}>
        <ThirdWayTitle />
      </Sequence>
    </AbsoluteFill>
  );
};

export default Scene;