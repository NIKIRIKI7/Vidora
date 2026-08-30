import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Easing,
  OffthreadVideo,
  staticFile,
} from 'remotion';
import {
  Cpu,
  Shield,
  Zap,
  Globe2,
  Lock,
  Code2,
  Terminal,
  Sparkles,
  ExternalLink,
  Layers,
  ArrowRight,
  Database,
  Radio,
  CheckCircle2,
} from 'lucide-react';

export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 788,
  fps: 30,
  width: 1920,
  height: 1080,
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
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
} as const;

// -----------------------------------------------------------------------------
// ФРАГМЕНТ 2: Схема суверенитета (Интеллект, Приватность, Фиксированная себестоимость)
// -----------------------------------------------------------------------------
const SovereigntyTrinity: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background slow zoom
  const bgScale = interpolate(frame, [0, 200], [1, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Header springs
  const headerSpring = spring({ frame, fps, config: { damping: 18, stiffness: 150 } });
  const centerNodeSpring = spring({ frame: frame - 15, fps, config: { damping: 16, stiffness: 140 } });

  // 3 Pillars Staggered Entrance
  const pillar1Spring = spring({ frame: frame - 35, fps, config: { damping: 16, stiffness: 160 } });
  const pillar2Spring = spring({ frame: frame - 50, fps, config: { damping: 16, stiffness: 160 } });
  const pillar3Spring = spring({ frame: frame - 65, fps, config: { damping: 16, stiffness: 160 } });

  // Bottom takeaway spring
  const footerSpring = spring({ frame: frame - 85, fps, config: { damping: 20, stiffness: 120 } });

  // Animated laser connector pulse
  const laserDash = frame * 10;

  return (
    <AbsoluteFill
      className="overflow-hidden select-none"
      style={{ backgroundColor: COLORS.background, fontFamily: TYPOGRAPHY.fontFamily }}
    >
      {/* Background Neon Grid & Glows */}
      <AbsoluteFill
        style={{
          transform: `scale(${bgScale})`,
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(79, 219, 200, 0.16) 0%, transparent 60%),
            radial-gradient(circle at 80% 80%, rgba(221, 183, 255, 0.12) 0%, transparent 55%),
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 54px 54px, 54px 54px',
        }}
      />

      <AbsoluteFill className="p-16 flex flex-col justify-between z-10">
        {/* Top Header */}
        <div
          className="flex items-center justify-between w-full border-b border-white/10 pb-5"
          style={{
            transform: `translateY(${interpolate(headerSpring, [0, 1], [-30, 0])}px)`,
            opacity: headerSpring,
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/15"
              style={{ backgroundColor: COLORS.surface }}
            >
              <Cpu className="w-6 h-6" style={{ color: COLORS.secondary }} />
            </div>
            <div>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold uppercase tracking-wider">
                Full Sovereignty Architecture
              </span>
              <h2 className="text-3xl font-black text-white m-0 tracking-tight">
                Конец эпохи облачной монополии
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs text-teal-300 bg-teal-950/40 border border-teal-500/30 px-4 py-2 rounded-xl">
            <Shield className="w-4 h-4" />
            <span>100% Local Autonomous Compute</span>
          </div>
        </div>

        {/* Center: Convergence Diagram (3 Pillars to Sovereign Workstation) */}
        <div className="relative w-full h-[520px] flex items-center justify-center my-auto">
          {/* SVG Animated Energy Beams */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 1792 520">
            <defs>
              <linearGradient id="beam1" x1="20%" y1="15%" x2="50%" y2="50%">
                <stop offset="0%" stopColor={COLORS.primary} stopOpacity="1" />
                <stop offset="100%" stopColor={COLORS.secondary} stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="beam2" x1="50%" y1="10%" x2="50%" y2="50%">
                <stop offset="0%" stopColor={COLORS.secondary} stopOpacity="1" />
                <stop offset="100%" stopColor={COLORS.secondary} stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="beam3" x1="80%" y1="15%" x2="50%" y2="50%">
                <stop offset="0%" stopColor={COLORS.accent} stopOpacity="1" />
                <stop offset="100%" stopColor={COLORS.secondary} stopOpacity="0.4" />
              </linearGradient>
            </defs>

            <path d="M 360 140 L 896 350" stroke="url(#beam1)" strokeWidth="3" strokeDasharray="10 8" strokeDashoffset={-laserDash} />
            <path d="M 896 140 L 896 350" stroke="url(#beam2)" strokeWidth="4" strokeDasharray="10 8" strokeDashoffset={-laserDash} />
            <path d="M 1432 140 L 896 350" stroke="url(#beam3)" strokeWidth="3" strokeDasharray="10 8" strokeDashoffset={-laserDash} />
          </svg>

          {/* Pillar 1: Frontier Intelligence */}
          <div
            className="absolute left-16 top-6 w-[420px] p-6 rounded-2xl border backdrop-blur-xl"
            style={{
              borderColor: `${COLORS.primary}50`,
              backgroundColor: `${COLORS.surface}ee`,
              transform: `translateY(${interpolate(pillar1Spring, [0, 1], [40, 0])}px) scale(${pillar1Spring})`,
              opacity: pillar1Spring,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.primary}20`, color: COLORS.primary }}
              >
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-purple-300 font-bold block">
                  Pillar 01
                </span>
                <h4 className="text-lg font-black text-white m-0">Флагманский интеллект</h4>
              </div>
            </div>
            <p className="text-xs font-mono text-white/70 m-0 leading-relaxed">
              27B Dense архитектура с 64 слоями на уровне новейших закрытых моделей индустрии
            </p>
          </div>

          {/* Pillar 2: 100% Privacy */}
          <div
            className="absolute top-6 w-[420px] p-6 rounded-2xl border backdrop-blur-xl"
            style={{
              left: 'calc(50% - 210px)',
              borderColor: `${COLORS.secondary}50`,
              backgroundColor: `${COLORS.surface}ee`,
              transform: `translateY(${interpolate(pillar2Spring, [0, 1], [40, 0])}px) scale(${pillar2Spring})`,
              opacity: pillar2Spring,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.secondary}20`, color: COLORS.secondary }}
              >
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-teal-300 font-bold block">
                  Pillar 02
                </span>
                <h4 className="text-lg font-black text-white m-0">Абсолютная приватность</h4>
              </div>
            </div>
            <p className="text-xs font-mono text-white/70 m-0 leading-relaxed">
              Исходный код, базы данных и секреты никогда не передаются на внешние облачные серверы
            </p>
          </div>

          {/* Pillar 3: Zero Runtime Cost */}
          <div
            className="absolute right-16 top-6 w-[420px] p-6 rounded-2xl border backdrop-blur-xl"
            style={{
              borderColor: `${COLORS.accent}50`,
              backgroundColor: `${COLORS.surface}ee`,
              transform: `translateY(${interpolate(pillar3Spring, [0, 1], [40, 0])}px) scale(${pillar3Spring})`,
              opacity: pillar3Spring,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${COLORS.accent}20`, color: COLORS.accent }}
              >
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-rose-300 font-bold block">
                  Pillar 03
                </span>
                <h4 className="text-lg font-black text-white m-0">Фиксированная себестоимость</h4>
              </div>
            </div>
            <p className="text-xs font-mono text-white/70 m-0 leading-relaxed">
              Оплата только электричества из розетки ($0.35 за 1M токенов) без абонентских подписок
            </p>
          </div>

          {/* Center Sovereign Workstation Node */}
          <div
            className="absolute bottom-4 w-[520px] p-6 rounded-3xl border-2 backdrop-blur-2xl text-center z-20 flex items-center justify-between shadow-2xl"
            style={{
              borderColor: COLORS.secondary,
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              transform: `scale(${centerNodeSpring})`,
              opacity: centerNodeSpring,
              boxShadow: `0 0 70px rgba(79, 219, 200, 0.35)`,
            }}
          >
            <div className="flex items-center gap-4 text-left">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/20 flex items-center justify-center text-teal-300">
                <Cpu className="w-8 h-8" />
              </div>
              <div>
                <span className="text-xs font-mono text-teal-300 font-bold uppercase tracking-wider block">
                  Sovereign Dev Station
                </span>
                <h3 className="text-xl font-black text-white m-0">Локальный ПК Инженера</h3>
              </div>
            </div>
            <div className="px-4 py-2 rounded-xl bg-teal-500/20 text-teal-300 text-xs font-mono font-bold">
              UNLIMITED TOKENS
            </div>
          </div>
        </div>

        {/* Bottom Banner */}
        <div
          className="flex items-center justify-between text-xs font-mono text-white/50 border-t border-white/10 pt-4"
          style={{
            opacity: footerSpring,
            transform: `translateY(${interpolate(footerSpring, [0, 1], [20, 0])}px)`,
          }}
        >
          <span>Независимость от API-лимитов, цензуры и нестабильных удаленных кластеров</span>
          <span className="text-teal-300 font-bold">Zero Dependency Ecosystem</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// -----------------------------------------------------------------------------
// ФРАГМЕНТ 3: Анимация глобальной сети децентрализованных разработчиков
// -----------------------------------------------------------------------------
const DecentralizedMeshNetwork: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const ribbonSpring = spring({ frame: frame - 15, fps, config: { damping: 16, stiffness: 120 } });
  const counterSpring = spring({ frame: frame - 30, fps, config: { damping: 20, stiffness: 100 } });

  // Rotating ribbon movement
  const ribbonShift = interpolate(frame, [0, 170], [-60, 60], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Live node counter
  const nodeCount = Math.round(
    interpolate(counterSpring, [0, 1], [0, 2400000], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  ).toLocaleString('en-US');

  return (
    <AbsoluteFill
      className="overflow-hidden select-none p-16 flex flex-col justify-between"
      style={{ backgroundColor: COLORS.background, fontFamily: TYPOGRAPHY.fontFamily }}
    >
      {/* Background Animated Constellation Grid */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 30% 40%, ${COLORS.secondary}20 0%, transparent 60%),
                       radial-gradient(circle at 70% 60%, ${COLORS.primary}20 0%, transparent 60%)`,
        }}
      />

      {/* Kinetic Ribbons in Background */}
      <div
        className="absolute inset-0 flex flex-col justify-center gap-12 pointer-events-none opacity-20 overflow-hidden"
        style={{ transform: 'rotate(-6deg) scale(1.15)' }}
      >
        <div
          className="whitespace-nowrap font-black text-7xl font-mono uppercase tracking-tighter text-teal-300 flex gap-8"
          style={{ transform: `translateX(${ribbonShift * 2}px)` }}
        >
          <span>OPEN WEIGHTS REVOLUTION</span>
          <span>✹</span>
          <span>AUTONOMOUS WORKSTATIONS</span>
          <span>✹</span>
          <span>DECENTRALIZED INTELLIGENCE</span>
        </div>
        <div
          className="whitespace-nowrap font-black text-7xl font-mono uppercase tracking-tighter text-purple-300 flex gap-8"
          style={{ transform: `translateX(${-ribbonShift * 2}px)` }}
        >
          <span>ZERO CLOUD LOCK-IN</span>
          <span>✳</span>
          <span>LOCAL INFERENCE MATRIX</span>
          <span>✳</span>
          <span>OPEN SOURCE SUPREMACY</span>
        </div>
      </div>

      {/* Top Header */}
      <div
        className="flex items-center justify-between w-full border-b border-white/10 pb-5 z-10"
        style={{
          transform: `translateY(${interpolate(titleSpring, [0, 1], [-30, 0])}px)`,
          opacity: titleSpring,
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center border border-white/15"
            style={{ backgroundColor: COLORS.surface }}
          >
            <Globe2 className="w-6 h-6" style={{ color: COLORS.secondary }} />
          </div>
          <div>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold uppercase tracking-wider">
              Global Decentralized Network
            </span>
            <h2 className="text-3xl font-black text-white m-0 tracking-tight">
              Будущее принадлежит открытому коду
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-teal-950/50 border border-teal-500/40">
          <Radio className="w-4 h-4 text-teal-300 animate-pulse" />
          <span className="font-mono text-xs text-teal-300 font-bold">Global Mesh: Active</span>
        </div>
      </div>

      {/* Center: Hero Stats & Decentralized Architecture Cards */}
      <div className="grid grid-cols-12 gap-8 my-auto z-10">
        {/* Giant Metric 1: Autonomous Active Instances */}
        <div
          className="col-span-6 p-8 rounded-3xl border border-teal-400/40 backdrop-blur-2xl flex flex-col justify-between"
          style={{
            backgroundColor: `${COLORS.surface}ee`,
            transform: `scale(${ribbonSpring})`,
            opacity: ribbonSpring,
            boxShadow: `0 25px 60px rgba(0,0,0,0.6), 0 0 50px ${COLORS.secondary}15`,
          }}
        >
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-teal-300 font-bold block mb-2">
              Autonomous Nodes Worldwide
            </span>
            <div className="text-6xl font-black font-mono text-white tracking-tight">
              +{nodeCount}
            </div>
          </div>
          <p className="text-sm font-mono text-white/70 m-0 mt-6 pt-4 border-t border-white/10">
            Локальных инженеров разворачивают автономные стеки без внешних облачных зависимостей
          </p>
        </div>

        {/* Giant Metric 2: Open Source AI Traffic Dominance */}
        <div
          className="col-span-6 p-8 rounded-3xl border border-purple-400/40 backdrop-blur-2xl flex flex-col justify-between"
          style={{
            backgroundColor: `${COLORS.surface}ee`,
            transform: `scale(${ribbonSpring})`,
            opacity: ribbonSpring,
            boxShadow: `0 25px 60px rgba(0,0,0,0.6), 0 0 50px ${COLORS.primary}15`,
          }}
        >
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-purple-300 font-bold block mb-2">
              Global Open Model Traffic
            </span>
            <div className="text-6xl font-black font-mono text-purple-300 tracking-tight">
              &gt; 45% Share
            </div>
          </div>
          <p className="text-sm font-mono text-white/70 m-0 mt-6 pt-4 border-t border-white/10">
            Линейка Qwen лидирует по числу загрузок и производных дистиллированных версий на Hugging Face
          </p>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="flex items-center justify-between text-xs font-mono text-white/50 border-t border-white/10 pt-4 z-10">
        <span>Полная независимость инженера от корпоративных ограничений и подписок</span>
        <span className="text-teal-300 font-bold">The Power Is In Your Hands</span>
      </div>
    </AbsoluteFill>
  );
};

// -----------------------------------------------------------------------------
// ФРАГМЕНТ 4: Финальные титры и ресурсы (Hugging Face, SGLang, agent.md)
// -----------------------------------------------------------------------------
const FinalResourcesOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const cardsSpring = spring({ frame: frame - 15, fps, config: { damping: 16, stiffness: 130 } });
  const badgeSpring = spring({ frame: frame - 45, fps, config: { damping: 12, stiffness: 180 } });

  const resources = [
    {
      title: 'Hugging Face Weights',
      url: 'hf.co/collections/Qwen/Qwen3.8-27B',
      desc: 'Оригинальные веса BF16, кванты GGUF, AWQ, EXL2 и MLX',
      icon: Database,
      tag: 'Download Model',
      color: COLORS.secondary,
    },
    {
      title: 'SGLang Inference Server',
      url: 'github.com/sgl-project/sglang',
      desc: 'Движок RadixAttention со скоростью генерации 200+ токенов/сек',
      icon: Zap,
      tag: 'Server Engine',
      color: COLORS.primary,
    },
    {
      title: 'agent.md & MCP Protocol',
      url: 'modelcontextprotocol.io',
      desc: 'Инженерные стандарты контекста и безопасных интеграций',
      icon: Code2,
      tag: 'Agent Standards',
      color: COLORS.accent,
    },
  ];

  return (
    <AbsoluteFill
      className="overflow-hidden select-none p-16 flex flex-col justify-between"
      style={{ backgroundColor: COLORS.background, fontFamily: TYPOGRAPHY.fontFamily }}
    >
      {/* Background Radial Glow */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${COLORS.secondary}25 0%, transparent 60%),
                       radial-gradient(circle at 80% 80%, ${COLORS.primary}20 0%, transparent 55%)`,
        }}
      />

      {/* Top Giant Call to Action */}
      <div
        className="text-center max-w-4xl mx-auto z-10"
        style={{
          transform: `translateY(${interpolate(titleSpring, [0, 1], [-30, 0])}px)`,
          opacity: titleSpring,
        }}
      >
        <span className="text-xs font-mono font-bold uppercase tracking-widest text-teal-300 block mb-2">
          Your Autonomous AI Journey Starts Here
        </span>
        <h1 className="text-5xl font-black text-white tracking-tight m-0 leading-tight">
          Скачивайте веса и создавайте будущее своими руками
        </h1>
      </div>

      {/* Center 3 Resource Blocks */}
      <div className="grid grid-cols-3 gap-6 my-auto z-10">
        {resources.map((res, idx) => {
          const cardSpring = spring({
            frame: frame - 15 - idx * 8,
            fps,
            config: { damping: 16, stiffness: 150 },
          });

          return (
            <div
              key={res.title}
              className="p-6 rounded-3xl border backdrop-blur-xl flex flex-col justify-between relative overflow-hidden"
              style={{
                borderColor: `${res.color}40`,
                backgroundColor: `${COLORS.surface}ee`,
                transform: `translateY(${interpolate(cardSpring, [0, 1], [40, 0])}px) scale(${cardSpring})`,
                opacity: cardSpring,
                boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: `${res.color}20`, color: res.color }}
                  >
                    <res.icon className="w-6 h-6" />
                  </div>
                  <span
                    className="text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border"
                    style={{
                      borderColor: `${res.color}40`,
                      backgroundColor: `${res.color}15`,
                      color: res.color,
                    }}
                  >
                    {res.tag}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-1">{res.title}</h3>
                <p className="text-xs font-mono text-white/60 mb-4">{res.desc}</p>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-between font-mono text-xs text-teal-300">
                <span>{res.url}</span>
                <ExternalLink className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Floating Stamp Badge */}
      <div
        className="flex items-center justify-between border-t border-white/10 pt-4 z-10 font-mono text-xs text-white/50"
        style={{
          transform: `scale(${badgeSpring})`,
          opacity: badgeSpring,
        }}
      >
        <div className="flex items-center gap-2 text-teal-300 font-bold">
          <CheckCircle2 className="w-4 h-4" />
          <span>Qwen 3.8 27B · The Sovereign Developer Standard</span>
        </div>
        <span className="text-purple-300">Open Source · Offline · Limitless</span>
      </div>
    </AbsoluteFill>
  );
};

// -----------------------------------------------------------------------------
// MAIN SCENE COMPONENT (Сцена 28: 788 кадров @ 30 fps)
// -----------------------------------------------------------------------------
export const Scene: React.FC = () => {
  return (
    <AbsoluteFill
      className="overflow-hidden"
      style={{
        backgroundColor: COLORS.background,
        fontFamily: TYPOGRAPHY.fontFamily,
      }}
    >
      {/* --------------------------------------------------------------------- */}
      {/* Фрагмент 1 [B-ROLL]: 0.00s - 7.72s (Sequence from={0} durationInFrames={232}) */}
      {/* Финальная плашка Qwen 3.8 27B: The Model to Beat for Local AI         */}
      {/* --------------------------------------------------------------------- */}
      <Sequence from={0} durationInFrames={232}>
        <OffthreadVideo
          src={staticFile('assets/b-roll/source2_1648_1704.mp4')}
          className="w-full h-full object-cover"
        />
        <AbsoluteFill className="bg-black/30" />
        <AbsoluteFill className="flex items-end p-12">
          <p className="text-4xl font-black text-white drop-shadow-md">
            Квен три точка восемь на двадцать семь миллиардов параметров навсегда изменила правила игры в индустрии.
          </p>
        </AbsoluteFill>
      </Sequence>

      {/* --------------------------------------------------------------------- */}
      {/* Фрагмент 2 [МОУШН-ДИЗАЙН]: 7.72s - 14.41s (Sequence from={232} durationInFrames={200}) */}
      {/* Схема: финальная инфографика суверенитета (интеллект, приватность, стоимость) */}
      {/* --------------------------------------------------------------------- */}
      <Sequence from={232} durationInFrames={200}>
        <SovereigntyTrinity />
      </Sequence>

      {/* --------------------------------------------------------------------- */}
      {/* Фрагмент 3 [МОУШН-ДИЗАЙН]: 14.41s - 20.07s (Sequence from={432} durationInFrames={170}) */}
      {/* Анимация: глобальная сеть децентрализованных разработчиков            */}
      {/* --------------------------------------------------------------------- */}
      <Sequence from={432} durationInFrames={170}>
        <DecentralizedMeshNetwork />
      </Sequence>

      {/* --------------------------------------------------------------------- */}
      {/* Фрагмент 4 [МОУШН-ДИЗАЙН]: 20.07s - 26.25s (Sequence from={602} durationInFrames={186}) */}
      {/* Финальные титры и ресурсы (Hugging Face, SGLang, agent.md)            */}
      {/* --------------------------------------------------------------------- */}
      <Sequence from={602} durationInFrames={186}>
        <FinalResourcesOutro />
      </Sequence>
    </AbsoluteFill>
  );
};

export default Scene;