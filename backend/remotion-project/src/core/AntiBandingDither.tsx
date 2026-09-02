import React from 'react';

/**
 * Статический микро-шум поверх кадра, разрушающий 8-битную квантизацию
 * темных градиентов. Детерминирован (feTurbulence без seed) -> одинаковый
 * узор на каждом кадре, без мерцания. soft-light + низкая непрозрачность
 * разбивают концентрические полосы, не поднимая уровень черного.
 */
export const AntiBandingDither: React.FC<{ opacity?: number }> = ({
  opacity = 0.04,
}) => (
  <div
    aria-hidden="true"
    style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      mixBlendMode: 'soft-light',
      opacity,
    }}
  >
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <filter id="vidora-dither">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#vidora-dither)" />
    </svg>
  </div>
);
