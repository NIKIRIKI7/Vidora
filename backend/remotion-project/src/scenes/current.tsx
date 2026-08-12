import React from 'react';
import { 
  useCurrentFrame, 
  useVideoConfig, 
  interpolate, 
  spring,
  AbsoluteFill,
  Sequence 
} from 'remotion';

export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 295,
  fps: 30,
  width: 2160,
  height: 3840,
};

const COLORS = {
  primary: '#ddb7ff',
  secondary: '#4fdbc8',
  background: '#0b1326',
  surface: '#171f33',
  accent: '#FFD700', // ИСТИННО ЗОЛОТОЙ
  text: '#ffffff',
} as const;

const DynamicSubtitle: React.FC<{ text: string, highlights: string[] }> = ({ text, highlights }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');

  return (
    <div className="absolute w-full flex flex-wrap justify-center items-end px-[8%] bottom-[12%] z-[100] gap-x-[18px] gap-y-[10px]">
      <div className="absolute inset-0 -top-20 blur-3xl opacity-80" style={{ background: `radial-gradient(ellipse at center, ${COLORS.background} 0%, transparent 70%)` }} />
      {words.map((word, i) => {
        const delay = i * 4;
        const scale = spring({ frame: frame - delay, fps, config: { damping: 12, mass: 0.6 } });
        const isHighlight = highlights.some(h => word.toLowerCase().includes(h.toLowerCase()));
        return (
          <span key={i} className="relative z-10" style={{ transform: `scale(${scale})`, color: isHighlight ? COLORS.accent : COLORS.text, fontSize: isHighlight ? '85px' : '75px', fontWeight: 900, textShadow: isHighlight ? `0 0 30px ${COLORS.accent}66` : `0 10px 20px ${COLORS.background}`, display: 'inline-block' }}>
            {word}
          </span>
        );
      })}
    </div>
  );
};

const Fragment1: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  
  const camZoom = spring({ frame, fps, config: { damping: 15 } });
  const scale = interpolate(camZoom, [0, 1], [0.8, 2.8]);
  
  const dropTw = spring({ frame: frame - 10, fps, config: { damping: 12, stiffness: 150 } });
  const tweezerY = interpolate(dropTw, [0, 1], [-1500, 0]);
  
  const squeeze = spring({ frame: frame - 25, fps, config: { damping: 14 } });
  const angleL = interpolate(squeeze, [0, 1], [-25, -8]);
  const angleR = interpolate(squeeze, [0, 1], [25, 8]);
  const posX = interpolate(squeeze, [0, 1], [60, 15]);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <div className="absolute w-full h-full flex items-center justify-center" style={{ transform: `scale(${scale})`, transformOrigin: '50% 50%' }}>
        <div className="absolute flex items-center justify-center rounded-[60px]" style={{ width: 800, height: 800, backgroundColor: COLORS.surface, border: `12px solid ${COLORS.primary}44`, boxShadow: `0 0 150px ${COLORS.primary}22` }}>
          <div className="relative flex items-center justify-center rounded-[20px]" style={{ width: 300, height: 300, backgroundColor: '#0a0a0a', border: `4px solid ${COLORS.secondary}` }}>
            <div className="rounded-[2px]" style={{ width: 8, height: 160, backgroundColor: COLORS.accent, boxShadow: `0 0 40px ${COLORS.accent}`, transform: 'rotate(45deg)' }} />
          </div>
        </div>
        <div className="absolute z-10" style={{ top: height / 2 - 200, left: width / 2, transform: `translate(-50%, ${tweezerY}px)` }}>
          <div className="absolute origin-top-right rounded-[0_0_10px_30px]" style={{ width: 60, height: 1200, backgroundColor: '#cbd5e1', left: -posX, bottom: 0, transform: `rotate(${angleL}deg)`, borderRight: '10px solid #94a3b8' }} />
          <div className="absolute origin-top-left rounded-[0_0_30px_10px]" style={{ width: 60, height: 1200, backgroundColor: '#cbd5e1', right: -posX, bottom: 0, transform: `rotate(${angleR}deg)`, borderLeft: '10px solid #94a3b8' }} />
        </div>
      </div>
      <DynamicSubtitle text="Эта крошечная проволока может показаться простой," highlights={['крошечная', 'простой,']} />
    </AbsoluteFill>
  );
};

const Fragment2: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  
  const moveX = spring({ frame: frame - 10, fps, config: { damping: 15 } });
  const moveOut = spring({ frame: frame - 45, fps, config: { damping: 15 } });
  const armX = interpolate(moveX, [0, 1], [width + 500, width / 2]) - interpolate(moveOut, [0, 1], [0, width + 500]);
  
  const armDrop = spring({ frame: frame - 20, fps, config: { damping: 12 } });
  const armLift = spring({ frame: frame - 35, fps, config: { damping: 12 } });
  const armY = interpolate(armDrop, [0, 1], [-800, 0]) - interpolate(armLift, [0, 1], [0, 800]);

  const chipPlaced = frame >= 30;
  const clickFlash = (frame === 30 || frame === 31) ? 1 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#f8fafc' }}>
      <svg width="100%" height="100%" className="absolute top-0 left-0 opacity-40">
        {Array.from({ length: 15 }).map((_, i) => (
          <React.Fragment key={i}>
            <line x1={0} y1={i * 250} x2={width} y2={i * 250} stroke={COLORS.secondary} strokeWidth={8} />
            <line x1={i * 250} y1={0} x2={i * 250} y2={height} stroke={COLORS.secondary} strokeWidth={8} />
          </React.Fragment>
        ))}
      </svg>
      <div className="absolute rounded-[30px]" style={{ left: width / 2, top: height / 2 + 100, transform: 'translate(-50%, -50%)', width: 320, height: 320, border: `12px dashed ${COLORS.secondary}` }} />
      <div className="absolute rounded-[20px]" style={{ left: width / 2, top: height / 2 + 100, transform: 'translate(-50%, -50%) scale(1.05)', width: 300, height: 300, backgroundColor: COLORS.surface, opacity: chipPlaced ? 1 : 0, boxShadow: `0 40px 80px rgba(0,0,0,0.4)` }}>
        <div style={{ margin: 20, width: 260, height: 260, border: `4px solid ${COLORS.primary}`, borderRadius: 10 }} />
      </div>
      
      <AbsoluteFill style={{ backgroundColor: COLORS.secondary, opacity: clickFlash * 0.5 }} />
      
      <div className="absolute flex flex-col items-center rounded-[0_0_40px_40px]" style={{ left: armX, top: height / 2 + 100 + armY, transform: 'translate(-50%, -100%)', width: 200, height: 2000, backgroundColor: COLORS.surface, boxShadow: '-30px 0 80px rgba(0,0,0,0.3)' }}>
        <div style={{ width: 160, height: 400, backgroundColor: COLORS.primary, marginTop: 100, borderRadius: 20 }} />
        <div className="absolute" style={{ width: 80, height: 100, backgroundColor: '#94a3b8', bottom: -100 }} />
        <div className="absolute rounded-[20px]" style={{ bottom: -120 - 300, width: 300, height: 300, backgroundColor: COLORS.surface, opacity: chipPlaced ? 0 : 1, border: `4px solid ${COLORS.primary}` }} />
      </div>
      <DynamicSubtitle text="но она играет огромную роль в том," highlights={['огромную', 'роль']} />
    </AbsoluteFill>
  );
};

const Fragment3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  // НОУТБУК И ТЕЛЕФОН СТРОГО ПО ЦЕНТРУ Y-ОСИ (минус отступ для субтитров)
  const deskY = height * 0.55; 

  const laptopPop = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  const laptopOpen = interpolate(laptopPop, [0, 1], [95, 0]);
  const laptopScale = interpolate(laptopPop, [0, 1], [0.5, 1.25]);

  const phonePop = spring({ frame: frame - 20, fps, config: { damping: 12, mass: 1.2 } });
  const phoneY = interpolate(phonePop, [0, 1], [1500, 0]);
  
  const pulse = Math.sin(frame / 6) * 0.5 + 0.5;
  const dataScroll = (frame * 5) % 200;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
      <div className="absolute w-full" style={{ top: deskY, height: 1200, background: `linear-gradient(180deg, ${COLORS.surface} 0%, transparent 100%)`, borderTop: `4px solid ${COLORS.primary}44` }} />

      {/* Контейнер устройств отцентрован */}
      <div className="absolute flex items-end justify-center" style={{ width: '100%', top: deskY - 30, transform: 'translateY(-100%)', perspective: 2000 }}>
        
        {/* Laptop */}
        <div className="relative flex flex-col items-center mr-10" style={{ transform: `scale(${laptopScale})`, transformOrigin: 'bottom center' }}>
          <div className="relative overflow-hidden rounded-[30px_30px_0_0]" style={{ width: 900, height: 600, backgroundColor: '#0f172a', border: '20px solid #1e293b', transformOrigin: 'bottom center', transform: `rotateX(${laptopOpen}deg)`, boxShadow: `0 -20px 80px ${COLORS.primary}44` }}>
            <div style={{ width: '100%', height: 80, backgroundColor: '#1e293b', marginBottom: 20 }} />
            <div style={{ padding: 40 }}>
              <div className="rounded-[15px]" style={{ width: '60%', height: 30, backgroundColor: COLORS.primary, marginBottom: 40 }} />
              <div className="rounded-[10px]" style={{ width: '80%', height: 20, backgroundColor: COLORS.secondary, marginBottom: 20 }} />
              <div className="rounded-[10px]" style={{ width: '70%', height: 20, backgroundColor: COLORS.secondary, marginBottom: 20 }} />
              <div className="flex mt-20 gap-4">
                {[1,2,3].map((i) => <div key={i} className="rounded-[20px]" style={{ width: 120, height: 150, backgroundColor: `${COLORS.accent}${Math.floor(pulse * 99)}` }} />)}
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white opacity-5 pointer-events-none" />
          </div>
          <div className="relative z-10 rounded-[10_10_40px_40px]" style={{ width: 1000, height: 40, backgroundColor: '#94a3b8', boxShadow: '0 30px 60px rgba(0,0,0,0.9)' }}>
            <div className="rounded-b-[10px]" style={{ width: 150, height: 10, backgroundColor: '#64748b', margin: '0 auto' }} />
          </div>
        </div>

        {/* Smartphone */}
        <div className="relative z-20" style={{ transform: `translateY(${phoneY}px) scale(1.2)` }}>
          <div className="relative overflow-hidden rounded-[50px]" style={{ width: 350, height: 700, backgroundColor: '#0f172a', border: '16px solid #334155', boxShadow: `-40px 30px 80px rgba(0,0,0,0.8), 0 0 50px ${COLORS.secondary}55` }}>
            <div className="rounded-[0_0_20px_20px]" style={{ width: 100, height: 30, backgroundColor: '#334155', margin: '0 auto' }} />
            <div style={{ padding: 30, marginTop: 40 }}>
               <div className="rounded-full" style={{ width: 120, height: 120, border: `15px solid ${COLORS.secondary}`, margin: '0 auto 40px', opacity: pulse * 0.5 + 0.5 }} />
               {[1,2,3,4].map(i => <div key={i} className="rounded-[20px]" style={{ width: '100%', height: 40, backgroundColor: '#1e293b', marginBottom: 20 }} />)}
            </div>
            <div className="absolute pointer-events-none" style={{ top: -100 + dataScroll, left: 0, right: 0, height: 100, background: `linear-gradient(180deg, transparent, ${COLORS.primary}66, transparent)` }} />
          </div>
        </div>
      </div>
      <DynamicSubtitle text="чтобы ваш телефон, ноутбук и другая электроника работали надежно." highlights={['телефон,', 'ноутбук', 'надежно.']} />
    </AbsoluteFill>
  );
};

const Scene: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: COLORS.background }}>
    <Sequence from={0} durationInFrames={101}><Fragment1 /></Sequence>
    <Sequence from={101} durationInFrames={64}><Fragment2 /></Sequence>
    <Sequence from={165} durationInFrames={130}><Fragment3 /></Sequence>
  </AbsoluteFill>
);
export default Scene;