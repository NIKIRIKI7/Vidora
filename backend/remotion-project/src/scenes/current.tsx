import React from 'react';
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
  id: 'ProductShowcase',
  durationInFrames: 180, // 6 секунд
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

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const ProductShowcase: React.FC = () => {
  const frame = useCurrentFrame();

  // Анимация всего контейнера с заголовком (всплывает и проявляется)
  const titleY = interpolate(frame, [10, 40], [50, 0], {
    easing: Easing.bezier(0.33, 1, 0.68, 1),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  
  const titleOpacity = interpolate(frame, [10, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Анимация трех карточек (каскадное появление с задержкой)
  const cards = [0, 1, 2].map((i) => {
    const delay = 30 + i * 15; // Каждая следующая появляется на 15 кадров позже
    const scale = interpolate(frame, [delay, delay + 25], [0.8, 1], {
      easing: Easing.bezier(0.34, 1.56, 0.64, 1), // Пружинящий эффект (overshoot)
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const opacity = interpolate(frame, [delay, delay + 15], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return { scale, opacity };
  });

  return (
    <AbsoluteFill
      className="flex flex-col items-center justify-center p-20"
      style={{ backgroundColor: COLORS.background, fontFamily: TYPOGRAPHY.fontFamily }}
    >
      
      {/* --- ЗАГОЛОВОК --- */}
      <div
        className="flex flex-col items-center gap-6 mb-20"
        style={{ transform: `translateY(${titleY}px)`, opacity: titleOpacity }}
      >
        <div 
          className="px-6 py-2 rounded-full border border-white/10 shadow-lg" 
          style={{ backgroundColor: COLORS.surface }}
        >
          <span className="text-sm font-bold tracking-widest uppercase" style={{ color: COLORS.accent }}>
            Vidora Update 2.0
          </span>
        </div>
        <h1 className="text-[100px] font-black m-0 tracking-tight" style={{ color: COLORS.text }}>
          Remotion + Tailwind
        </h1>
      </div>

      {/* --- СЕТКА КАРТОЧЕК --- */}
      <div className="flex items-center justify-center gap-8 w-full max-w-7xl">
        {cards.map((anim, idx) => (
          <div
            key={idx}
            className="flex-1 flex flex-col gap-6 p-10 rounded-[32px] border border-white/5 shadow-2xl relative overflow-hidden"
            style={{
              backgroundColor: COLORS.surface,
              transform: `scale(${anim.scale})`,
              opacity: anim.opacity,
            }}
          >
            {/* Декоративная цветная полоса сверху карточки */}
            <div 
              className="absolute top-0 left-0 w-full h-2" 
              style={{ backgroundColor: idx === 1 ? COLORS.secondary : COLORS.primary }} 
            />

            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center" 
              style={{ backgroundColor: `${COLORS.background}88` }}
            >
              <span className="text-3xl font-bold" style={{ color: idx === 1 ? COLORS.secondary : COLORS.primary }}>
                0{idx + 1}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-4xl font-bold m-0" style={{ color: COLORS.text }}>
                {['Zero Config', 'Lightning Fast', 'Beautiful UI'][idx]}
              </h3>
              <p className="text-xl leading-relaxed m-0 opacity-60" style={{ color: COLORS.text }}>
                Используйте utility-классы для стилизации прямо в TSX файлах.
              </p>
            </div>
          </div>
        ))}
      </div>
      
    </AbsoluteFill>
  );
};

export default ProductShowcase;