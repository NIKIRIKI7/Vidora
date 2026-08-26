import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  OffthreadVideo,
  staticFile,
} from 'remotion';
import { Zap, Sparkles, ArrowUpRight, Flame } from 'lucide-react';

export const compositionConfig = {
  id: 'CinematicPosterScene',
  durationInFrames: 300, // 10 секунд при 30 FPS
  fps: 30,
  width: 1920,
  height: 1080,
};

const COLORS = {
  bgDark: '#08090d',
  bgLight: '#f4f4f6',
  neonGreen: '#39ff14',
  electricPurple: '#ddb7ff',
  hotRed: '#ff2a5f',
  textLight: '#ffffff',
  textDark: '#0d0e12',
} as const;

export const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // -------------------------------------------------------------
  // ФРАГМЕНТ 1: ПОСТЕРНЫЙ СПЛИТ И КИНЕТИЧЕСКАЯ ТИПОГРАФИКА (0–5 сек)
  // -------------------------------------------------------------
  
  // 1. Анимация раскрытия контрастного круга
  const circleScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
  });
  const circleRotation = interpolate(frame, [0, 150], [-25, -10], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 2. Вылет заголовков с пружинным овершутом
  const title1Spring = spring({
    frame: frame - 4,
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.5 },
  });
  const title2Spring = spring({
    frame: frame - 12,
    fps,
    config: { damping: 12, stiffness: 180, mass: 0.5 },
  });

  // 3. Плавающие векторные бейджи и звездочки
  const badge1Spring = spring({
    frame: frame - 20,
    fps,
    config: { damping: 10, stiffness: 220 },
  });
  const badge2Spring = spring({
    frame: frame - 28,
    fps,
    config: { damping: 10, stiffness: 220 },
  });

  const floatBob = Math.sin(frame / 12) * 8;
  const starRotate = frame * 2.5;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDark }}>
      
      {/* ================================================================= */}
      {/* ФРАГМЕНТ 1: ДИНАМИЧНЫЙ ПОСТЕР (Кадры 0 - 150)                     */}
      {/* ================================================================= */}
      <Sequence from={0} durationInFrames={150}>
        <AbsoluteFill className="overflow-hidden flex items-center justify-center">
          
          {/* Слой 0: Тонкая фоновая сетка */}
          <div 
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
              backgroundSize: '80px 80px',
            }}
          />

          {/* Слой 1: Геометрический Сплит-Круг (черно-белый контраст) */}
          <div
            className="absolute rounded-full overflow-hidden flex shadow-[0_0_80px_rgba(0,0,0,0.9)]"
            style={{
              width: 820,
              height: 820,
              transform: `scale(${circleScale}) rotate(${circleRotation}deg)`,
              border: '2px solid rgba(255,255,255,0.1)',
            }}
          >
            <div className="w-1/2 h-full bg-[#0a0a0c]" />
            <div className="w-1/2 h-full bg-[#f0f0f3]" />
          </div>

          {/* Слой 2: Огромный фоновый контурный текст (Outline Stroke) */}
          <div 
            className="absolute z-10 flex flex-col items-center select-none pointer-events-none"
            style={{
              transform: `translateY(${floatBob * 0.5}px)`,
            }}
          >
            <h1
              className="text-[150px] font-black uppercase tracking-tighter leading-none m-0"
              style={{
                color: 'transparent',
                WebkitTextStroke: '2px rgba(255, 255, 255, 0.25)',
                transform: `scale(${interpolate(title1Spring, [0, 1], [0.8, 1])})`,
                opacity: title1Spring,
              }}
            >
              SPOT
            </h1>
          </div>

          {/* Слой 3: Основная плотная кинетическая типографика */}
          <div className="relative z-20 flex flex-col items-center select-none text-center">
            <h1
              className="text-[130px] font-black tracking-tight leading-[0.88] uppercase text-white m-0 drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)]"
              style={{
                transform: `translateY(${interpolate(title1Spring, [0, 1], [80, 0])}px) scale(${title1Spring})`,
                opacity: title1Spring,
              }}
            >
              LIGHT!
            </h1>

            {/* Подзаголовок в скошенной неоновой плашке */}
            <div
              className="mt-6 px-8 py-2.5 bg-[#ff2a5f] text-white font-black text-xl uppercase tracking-widest flex items-center gap-2 shadow-[0_0_30px_rgba(255,42,95,0.6)]"
              style={{
                transform: `rotate(-3deg) scale(${title2Spring})`,
                opacity: title2Spring,
              }}
            >
              <Flame size={20} className="fill-white" />
              <span>ЧИСТАЯ АРХИТЕКТУРА</span>
            </div>
          </div>

          {/* Слой 4: Плавающие акцентные бейджи и иконки */}
          {/* Левый верхний значок */}
          <div
            className="absolute top-24 left-28 z-30 flex items-center gap-2 px-5 py-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-md shadow-2xl"
            style={{
              transform: `scale(${badge1Spring}) rotate(-8deg) translateY(${floatBob}px)`,
              opacity: badge1Spring,
            }}
          >
            <Zap size={18} className="text-[#39ff14] fill-[#39ff14]" />
            <span className="text-xs font-mono font-bold tracking-widest text-white uppercase">
              NEXT-GEN ENGINE
            </span>
          </div>

          {/* Правая нижняя звезда ✹ */}
          <div
            className="absolute bottom-24 right-32 z-30 flex items-center justify-center w-20 h-20 bg-[#39ff14] text-black font-black text-4xl rounded-3xl shadow-[0_0_40px_rgba(57,255,20,0.5)]"
            style={{
              transform: `scale(${badge2Spring}) rotate(${starRotate}deg)`,
              opacity: badge2Spring,
            }}
          >
            ✹
          </div>

        </AbsoluteFill>
      </Sequence>

      {/* ================================================================= */}
      {/* ФРАГМЕНТ 2: ЖИВОЙ B-ROLL С КИНЕМАТОГРАФИЧНЫМ ОВЕРЛЕЕМ (150 - 300)  */}
      {/* ================================================================= */}
      <Sequence from={150} durationInFrames={150}>
        <AbsoluteFill className="overflow-hidden bg-black flex items-center justify-center">
          
          {/* 1. Живой видеофутаж B-Roll на весь экран */}
          <OffthreadVideo
            src={staticFile('assets/b-roll/broll_4a48e3_855715.mp4')}
            className="w-full h-full object-cover"
          />

          {/* 2. Легкое виньетирование и градиентное затемнение под текст */}
          <AbsoluteFill 
            className="pointer-events-none"
            style={{
              background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.7) 100%), linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%)',
            }}
          />

          {/* 3. Минималистичный журнальный титр поверх видео */}
          <AbsoluteFill className="flex flex-col justify-between p-20 pointer-events-none z-20">
            
            {/* Верхний маркер */}
            <div 
              className="flex items-center gap-3"
              style={{
                opacity: interpolate(frame - 150, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                transform: `translateY(${interpolate(frame - 150, [0, 20], [-20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#39ff14] animate-pulse" />
              <span className="text-xs font-mono tracking-[0.3em] uppercase text-white/80">
                CASE STUDY // REAL PRODUCTION
              </span>
            </div>

            {/* Нижний акцентный текст суфлера */}
            <div 
              className="max-w-4xl flex flex-col gap-3"
              style={{
                opacity: interpolate(frame - 150, [10, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                transform: `translateY(${interpolate(frame - 150, [10, 35], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`,
              }}
            >
              <h2 className="text-6xl font-black text-white tracking-tight leading-[1.05] m-0 drop-shadow-2xl">
                Локальный запуск без сторонних серверов и скрытых затрат.
              </h2>
              <div className="flex items-center gap-2 text-[#39ff14] text-sm font-mono tracking-widest mt-2">
                <span>01. DEEP DIVE ARCHITECTURE</span>
                <ArrowUpRight size={16} />
              </div>
            </div>

          </AbsoluteFill>

        </AbsoluteFill>
      </Sequence>

    </AbsoluteFill>
  );
};

export default Scene;