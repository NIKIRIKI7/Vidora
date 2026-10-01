// ============================================================
// Vidora Remotion Reference Scene — "Pulse"
// ------------------------------------------------------------
// Канонические правила Vidora для Remotion-сцен:
//   1. Layout — только inline styles. Tailwind для layout запрещён.
//   2. Все размеры — от useVideoConfig() через unit = min(w, h).
//   3. Пружины не «из нуля»: from = 0.92 → to = 1 + fade-in.
//   4. Пульс — двухфазный interpolate, без Math.max(0, sin).
//   5. Волны — компонент, живущий в окне [startFrame, +life],
//      вне окна возвращает null. Никаких `% period`.
//   6. Sequence для позиционированных детей — с layout="none".
//   7. Градиентный текст — через inline WebkitBackgroundClip.
// ============================================================

import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Heart, Sparkles, Zap } from 'lucide-react';

// ------------------------------------------------------------
// Scene Units — единая система размеров от разрешения.
// unit = min(width, height). Все элементы кратны unit * K,
// поэтому композиция одинакова на 1080p / 1440p / 2160p.
// ------------------------------------------------------------
const useSceneUnits = () => {
  const { width, height } = useVideoConfig();
  const unit = Math.min(width, height);
  return {
    unit,
    glowSize: unit * 0.55,
    ringSize: unit * 0.32,
    heartSize: unit * 0.15,
    iconSize: unit * 0.028,
    captionBottom: unit * 0.1,
    captionFontSize: unit * 0.03,
  };
};

const CAPTION_FROM = 20;

export const Pulse: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const u = useSceneUnits();

  // ---- Появление сцены: мягкий spring + fade-in ----
  const appearScale = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90, mass: 0.7 },
    from: 0.92,
    to: 1,
  });
  const appearOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ---- Затухание в конце сцены ----
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 24, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const sceneOpacity = appearOpacity * fadeOut;

  // ---- Пульс сердца: 120 BPM, двухфазный ----
  // Быстрый систолический подъём (0..0.12) → медленный диастолический спад.
  const beatPeriod = Math.round(fps / 2);
  const beatPhase = (frame % beatPeriod) / beatPeriod;
  const beatPulse = interpolate(
    beatPhase,
    [0, 0.12, 0.32, 1],
    [0, 1, 0.15, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const heartScale = 1 + beatPulse * 0.14;

  // ---- Один плавный оборот искр за всю сцену ----
  const rotation = interpolate(frame, [0, durationInFrames], [0, 360], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'extend',
    easing: Easing.linear,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(135deg, #020617 0%, #1e1b4b 50%, #0f172a 100%)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: sceneOpacity,
      }}
    >
      {/* Мягкое свечение под сердцем */}
      <div
        style={{
          position: 'absolute',
          width: u.glowSize,
          height: u.glowSize,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(236,72,153,0.35) 0%, rgba(236,72,153,0) 70%)',
          filter: `blur(${u.glowSize * 0.08}px)`,
          transform: `scale(${heartScale})`,
          pointerEvents: 'none',
        }}
      />

      {/* Контейнер сцены: искры + волны + сердце */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${appearScale})`,
        }}
      >
        <RotatingSparks
          size={u.ringSize}
          iconSize={u.iconSize}
          rotation={rotation}
        />
        <RippleWave startFrame={0} size={u.heartSize} />
        <RippleWave startFrame={beatPeriod} size={u.heartSize} />

        {/* Сердце */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            width: u.heartSize,
            height: u.heartSize,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #ec4899 0%, #e11d48 100%)',
            boxShadow: `0 0 ${u.heartSize * 0.4}px rgba(244,63,94,0.85)`,
            transform: `scale(${heartScale})`,
          }}
        >
          <Heart size={u.heartSize * 0.45} color="#ffffff" fill="#ffffff" />
        </div>
      </div>

      {/* Подпись снизу. layout="none" — не создаёт вложенный AbsoluteFill */}
      <Sequence from={CAPTION_FROM} layout="none">
        <BottomCaption
          bottom={u.captionBottom}
          fontSize={u.captionFontSize}
          sceneDuration={durationInFrames}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

// ============================================================
// Вспомогательные компоненты. Каждый самодостаточный:
// только inline styles, без зависимости от Tailwind.
// ============================================================

interface RotatingSparksProps {
  size: number;
  iconSize: number;
  rotation: number;
}

const RotatingSparks: React.FC<RotatingSparksProps> = ({
  size,
  iconSize,
  rotation,
}) => (
  <div
    style={{
      position: 'absolute',
      width: size,
      height: size,
      transform: `rotate(${rotation}deg)`,
    }}
  >
    <Sparkles
      size={iconSize}
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translate(-50%, 0)',
        color: '#fcd34d',
      }}
    />
    <Sparkles
      size={iconSize}
      style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        transform: 'translate(-50%, 0)',
        color: '#fcd34d',
      }}
    />
    <Zap
      size={iconSize * 0.85}
      style={{
        position: 'absolute',
        left: 0,
        top: '50%',
        transform: 'translate(0, -50%)',
        color: '#67e8f9',
      }}
    />
    <Zap
      size={iconSize * 0.85}
      style={{
        position: 'absolute',
        right: 0,
        top: '50%',
        transform: 'translate(0, -50%)',
        color: '#67e8f9',
      }}
    />
  </div>
);

interface RippleWaveProps {
  startFrame: number;
  size: number;
}

/**
 * Волна живёт ровно 2 секунды от своего startFrame и затем исчезает.
 * Никаких `% (fps * 2)` — используем явное окно, чтобы избежать
 * скачка фазы (pop) на каждой перезагрузке периода.
 */
const RippleWave: React.FC<RippleWaveProps> = ({ startFrame, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const life = fps * 2;
  const local = frame - startFrame;
  if (local < 0 || local > life) return null;

  const progress = local / life;
  const scale = interpolate(progress, [0, 1], [1, 2.6]);
  const opacity = interpolate(progress, [0, 0.1, 1], [0, 0.65, 0]);

  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${Math.max(1, size * 0.02)}px solid #f472b6`,
        transform: `scale(${scale})`,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};

interface BottomCaptionProps {
  bottom: number;
  fontSize: number;
  /**
   * Длительность СЦЕНЫ (композиции), а не Sequence.
   * Внутри <Sequence> useCurrentFrame() отсчитывает от from,
   * поэтому composition-ный durationInFrames нельзя сравнивать
   * с локальным frame напрямую — иначе fade-out никогда не сработает.
   */
  sceneDuration: number;
}

const BottomCaption: React.FC<BottomCaptionProps> = ({
  bottom,
  fontSize,
  sceneDuration,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slide = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100, mass: 0.6 },
    from: bottom,
    to: 0,
  });
  const enterOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Локальный кадр, в который сцена уже затухает.
  const localEnd = sceneDuration - CAPTION_FROM;
  const fadeOut = interpolate(frame, [localEnd - 24, localEnd], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        display: 'flex',
        justifyContent: 'center',
        transform: `translateY(${slide}px)`,
        opacity: enterOpacity * fadeOut,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize,
          fontWeight: 900,
          letterSpacing: '-0.02em',
          background:
            'linear-gradient(90deg, #ffffff 0%, #fbcfe8 50%, #fda4af 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }}
      >
        Beating with Remotion
      </p>
    </div>
  );
};
