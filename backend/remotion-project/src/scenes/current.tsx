import React, { useRef } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  spring,
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

export const compositionConfig = {
  id: 'IntelCoreI7Review',
  durationInFrames: 270, // 9 секунд
  fps: 30,
  width: 1920,
  height: 1080,
};

const COLORS = {
  primary: '#0068B5', // Intel Blue
  secondary: '#00C7FD', // Light Blue
  background: '#050B14',
  surface: '#0A1628',
  text: '#ffffff',
} as const;

// --- 3D КОМПОНЕНТ (Строго синхронизированный с Remotion) ---
const CPU3DModel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groupRef = useRef<THREE.Group>(null);

  // ПРАВИЛО: Идеально плавные пружины (БЕЗ Math.max). 
  // Remotion сам корректно обрабатывает отрицательные значения кадров.
  const zoom = spring({ frame: frame - 90, fps, config: { damping: 16, stiffness: 70 } });
  const shiftRight = spring({ frame: frame - 180, fps, config: { damping: 16, stiffness: 70 } });

  // Вычисляем позицию X и Z
  const zPos = interpolate(zoom, [0, 1], [0, 2.5]); // Наезд камеры
  const xPos = interpolate(shiftRight, [0, 1], [0, 3.5]); // Сдвиг вправо

  // ПРАВИЛО: Ручная реализация эффекта Float (Парения) строго по кадрам Remotion
  const floatY = Math.sin(frame / 15) * 0.15; // Движение вверх-вниз
  const floatRotZ = Math.cos(frame / 20) * 0.05; // Покачивание влево-вправо

  // Вращение процессора
  const rotationY = (frame / 50) + interpolate(shiftRight, [0, 1], [0, Math.PI * 1.5], {
    extrapolateRight: 'clamp'
  });
  const rotationX = interpolate(zoom, [0, 1], [0.7, 1.2]); 

  return (
    <group 
      ref={groupRef} 
      // Применяем и основные координаты, и эффект парения
      position={[xPos, floatY, zPos]} 
      rotation={[rotationX, rotationY, floatRotZ]}
    >
      {/* Текстолит (PCB) */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[3, 0.1, 3]} />
        <meshStandardMaterial color="#0A3A2A" metalness={0.5} roughness={0.7} />
      </mesh>
      
      {/* Золотые контакты по краям (имитация) */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[2.85, 0.12, 2.85]} />
        <meshStandardMaterial color="#DAA520" metalness={1} roughness={0.4} />
      </mesh>

      {/* Теплораспределительная крышка (IHS) */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[2.2, 0.3, 2.2]} />
        <meshStandardMaterial color="#E0E0E0" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
};

// --- ОСНОВНАЯ СЦЕНА (Remotion + 2D Оверлеи) ---
export const Scene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  // Анимация 2D-интерфейса
  const text1Opacity = interpolate(frame, [10, 30, 80, 90], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const ui2Progress = spring({ frame: frame - 95, fps, config: { damping: 14 } });
  const ui2Opacity = interpolate(frame, [90, 100, 170, 180], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  const ui3Progress = spring({ frame: frame - 185, fps, config: { damping: 14 } });
  const ui3Opacity = interpolate(frame, [180, 190], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      
      {/* 1. СЛОЙ 3D-ГРАФИКИ */}
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 2, 8], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} color={COLORS.secondary} />
        <pointLight position={[-5, 5, -5]} intensity={1} color={COLORS.primary} />
        
        {/* Отражения */}
        <Environment preset="city" />
        
        <CPU3DModel />
        
        {/* ПРАВИЛО: Тень всегда frames={1}, чтобы не перерисовывать ее каждый кадр */}
        <ContactShadows position={[0, -2.5, 0]} opacity={0.6} scale={15} blur={2.5} far={4} frames={1} />
      </ThreeCanvas>

      {/* 2. СЛОЙ 2D-ИНТЕРФЕЙСА (Tailwind) */}
      <AbsoluteFill className="p-20 flex flex-col justify-center pointer-events-none">
        
        {/* Фрагмент 1 */}
        <div className="absolute inset-0 flex flex-col items-center justify-start pt-32" style={{ opacity: text1Opacity }}>
          <div className="px-6 py-2 rounded-full border border-white/20 backdrop-blur-md mb-6" style={{ backgroundColor: `${COLORS.primary}44` }}>
            <span className="text-sm font-bold tracking-widest uppercase text-white">Next Generation</span>
          </div>
          <h1 className="text-8xl font-black tracking-tighter" style={{ color: COLORS.text }}>Intel Core i7</h1>
        </div>

        {/* Фрагмент 2 */}
        <div className="absolute left-24 top-1/2 -translate-y-1/2 flex flex-col gap-6" style={{ opacity: ui2Opacity, transform: `translateX(${interpolate(ui2Progress, [0, 1], [-50, 0])}px)` }}>
          <div className="p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl" style={{ backgroundColor: `${COLORS.surface}CC` }}>
            <div className="text-6xl font-black mb-2" style={{ color: COLORS.secondary }}>14</div>
            <div className="text-xl font-medium text-white/60 uppercase tracking-widest">Высокопроизводительных<br/>Ядер</div>
          </div>
          <div className="p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl" style={{ backgroundColor: `${COLORS.surface}CC` }}>
            <div className="text-6xl font-black mb-2" style={{ color: COLORS.primary }}>20</div>
            <div className="text-xl font-medium text-white/60 uppercase tracking-widest">Потоков для<br/>рендера</div>
          </div>
        </div>

        {/* Фрагмент 3 */}
        <div className="absolute left-24 top-1/2 -translate-y-1/2 flex flex-col gap-6 w-96" style={{ opacity: ui3Opacity, transform: `translateX(${interpolate(ui3Progress, [0, 1], [-50, 0])}px)` }}>
          <h2 className="text-5xl font-bold text-white leading-tight mb-4">Ледяное <br/><span style={{ color: COLORS.secondary }}>Спокойствие</span></h2>
          <div className="p-6 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl" style={{ backgroundColor: `${COLORS.surface}CC` }}>
            <div className="flex justify-between items-end mb-4">
              <span className="text-white/60 font-medium">Температура (TDP)</span>
              <span className="text-2xl font-bold text-white">65°C</span>
            </div>
            <div className="w-full h-4 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ backgroundColor: COLORS.secondary, width: `${interpolate(ui3Progress, [0, 1], [0, 65])}%` }} />
            </div>
          </div>
        </div>

      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export default Scene;