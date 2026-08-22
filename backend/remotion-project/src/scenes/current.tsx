import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from 'remotion';
import {
  BrainCircuit,
  Sparkles,
  Users,
  ShieldCheck,
  Flame,
  Activity,
  Cpu,
  TrendingUp,
  Workflow,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Radar,
  Radio,
  Lock,
  Compass,
  FileSpreadsheet,
  Globe2,
} from 'lucide-react';

// =============================================================================
// COMPOSITION CONFIG
// =============================================================================
export const compositionConfig = {
  id: 'Scene',
  durationInFrames: 524,
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
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
} as const;

const EASINGS = {
  easeOut: Easing.bezier(0.16, 1, 0.3, 1),
  easeIn: Easing.bezier(0.7, 0, 0.84, 0),
  easeInOut: Easing.bezier(0.65, 0, 0.35, 1),
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1),
  snappy: Easing.bezier(0.2, 0.9, 0.1, 1.1),
};

// =============================================================================
// FRAGMENT 1: HIGH-ENERGY MEDICAL / CLINICAL DATA HUD (Frames 0 - 152)
// =============================================================================
const Fragment1: React.FC = () => {
  const frame = useCurrentFrame();

  // Dynamic Camera Zoom & Shake
  const cameraScale = interpolate(frame, [0, 150], [1.08, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeOut,
  });

  const enterOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scanlineY = (frame * 18) % 1080;
  const gridOffset = (frame * 1.5) % 60;

  // Waveform animated bars
  const bars = Array.from({ length: 28 }).map((_, i) => {
    const wave = Math.sin((frame + i * 8) * 0.15) * 0.5 + 0.5;
    const heightVal = 20 + wave * 90;
    return heightVal;
  });

  // Animated Telemetry Values
  const confidenceScore = interpolate(frame, [15, 80], [38, 97.4], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeOut,
  }).toFixed(1);

  const varianceIndex = interpolate(frame, [10, 70], [8.42, 1.14], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeOut,
  }).toFixed(2);

  const processedCases = Math.floor(
    interpolate(frame, [0, 140], [1240, 189420], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASINGS.easeOut,
    })
  ).toLocaleString();

  // Pop-in animations for widgets
  const hudLeftX = interpolate(frame, [5, 25], [-120, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  const hudRightX = interpolate(frame, [12, 32], [120, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  const centerScale = interpolate(frame, [8, 30], [0.8, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  return (
    <AbsoluteFill
      className="flex items-center justify-center w-full h-full relative overflow-hidden"
      style={{
        opacity: enterOpacity,
        fontFamily: TYPOGRAPHY.fontFamily,
        transform: `scale(${cameraScale})`,
      }}
    >
      {/* Background Matrix Grid */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, ${COLORS.primary}22 1px, transparent 1px), linear-gradient(to bottom, ${COLORS.primary}22 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
          backgroundPosition: `0px ${gridOffset}px`,
        }}
      />

      {/* Radial Neon Lights */}
      <div
        className="absolute w-[800px] h-[800px] rounded-full blur-[160px] pointer-events-none opacity-25 animate-pulse"
        style={{ backgroundColor: COLORS.secondary, top: '-20%', left: '-10%' }}
      />
      <div
        className="absolute w-[800px] h-[800px] rounded-full blur-[170px] pointer-events-none opacity-20"
        style={{ backgroundColor: COLORS.primary, bottom: '-20%', right: '-10%' }}
      />

      {/* Cyber Scanline */}
      <div
        className="absolute left-0 w-full h-1 pointer-events-none opacity-40 z-30"
        style={{
          top: `${scanlineY}px`,
          background: `linear-gradient(90deg, transparent, ${COLORS.secondary}, ${COLORS.primary}, transparent)`,
          boxShadow: `0 0 15px ${COLORS.secondary}`,
        }}
      />

      {/* Top HUD Bar */}
      <div className="absolute top-10 left-16 right-16 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <div className="w-4 h-4 rounded-full animate-ping" style={{ backgroundColor: COLORS.secondary }} />
          <div
            className="px-4 py-1.5 rounded-lg border border-white/10 text-xs font-mono tracking-widest uppercase font-bold"
            style={{ backgroundColor: `${COLORS.surface}cc`, color: COLORS.secondary }}
          >
            SYS://MED-SYNTHESIS.TELEMETRY • ACTIVE STREAM
          </div>
          <span className="text-xs font-mono opacity-60" style={{ color: COLORS.text }}>
            NODE_CLUSTER: BIO-AI-9000
          </span>
        </div>

        <div className="flex items-center gap-6 font-mono text-xs" style={{ color: COLORS.text }}>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span className="opacity-80">LATENCY: 4.2ms</span>
          </div>
          <div
            className="px-3 py-1 rounded-md font-bold text-xs"
            style={{ backgroundColor: `${COLORS.accent}26`, color: COLORS.accent }}
          >
            HUMAN-IN-THE-LOOP: REQ
          </div>
        </div>
      </div>

      {/* Main 3-Column Cockpit Layout */}
      <div className="w-full max-w-7xl grid grid-cols-12 gap-8 px-12 z-10 items-center">
        {/* Left Widget: Live Clinical Biosensors & Vectors */}
        <div
          className="col-span-4 flex flex-col gap-6 p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl"
          style={{
            backgroundColor: `${COLORS.surface}e6`,
            transform: `translateX(${hudLeftX}px)`,
          }}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6" style={{ color: COLORS.secondary }} />
              <span className="font-mono font-bold text-sm tracking-wider" style={{ color: COLORS.text }}>
                EVALUATION VECTOR
              </span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/10" style={{ color: COLORS.secondary }}>
              LIVE
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-xs font-mono opacity-70" style={{ color: COLORS.text }}>
              <span>BIOCHEMICAL CONFIDENCE</span>
              <span className="font-bold" style={{ color: COLORS.secondary }}>
                {confidenceScore}%
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden p-0.5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${confidenceScore}%`,
                  backgroundColor: COLORS.secondary,
                  boxShadow: `0 0 12px ${COLORS.secondary}`,
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex justify-between text-xs font-mono opacity-70" style={{ color: COLORS.text }}>
              <span>VARIANCE ANOMALY INDEX</span>
              <span className="font-bold" style={{ color: COLORS.accent }}>
                {varianceIndex} σ
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden p-0.5">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${interpolate(Number(varianceIndex), [1.14, 8.42], [15, 95])}%`,
                  backgroundColor: COLORS.accent,
                }}
              />
            </div>
          </div>

          {/* Dynamic Frequency Graphic */}
          <div className="pt-2">
            <span className="text-[10px] font-mono tracking-widest uppercase opacity-50 block mb-2" style={{ color: COLORS.text }}>
              REAL-TIME NEURAL ACTIVATION DENSITY
            </span>
            <div className="flex items-end justify-between gap-1 h-20 px-2 py-1 rounded-xl bg-black/40 border border-white/5">
              {bars.map((h, idx) => (
                <div
                  key={idx}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    backgroundColor: idx % 3 === 0 ? COLORS.secondary : COLORS.primary,
                    opacity: 0.85,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Center: Central Diagnostic Scope & Core Metric */}
        <div
          className="col-span-4 flex flex-col items-center justify-center p-10 rounded-full border-2 border-white/20 shadow-[0_0_80px_rgba(79,219,200,0.15)] backdrop-blur-2xl relative aspect-square text-center"
          style={{
            backgroundColor: `${COLORS.surface}ee`,
            transform: `scale(${centerScale})`,
          }}
        >
          {/* Rotating decorative neon rings */}
          <div
            className="absolute inset-0 rounded-full border border-dashed border-white/20"
            style={{
              transform: `rotate(${frame * 1.2}deg)`,
            }}
          />
          <div
            className="absolute -inset-4 rounded-full border border-dotted border-white/15"
            style={{
              transform: `rotate(${-frame * 0.8}deg)`,
            }}
          />

          <BrainCircuit
            className="w-16 h-16 mb-4 animate-bounce"
            style={{ color: COLORS.secondary }}
            strokeWidth={1.5}
          />
          <span className="text-xs font-mono font-bold tracking-widest uppercase opacity-70" style={{ color: COLORS.text }}>
            PROCESSED DATASET NODES
          </span>
          <div className="text-5xl font-black tracking-tight my-2" style={{ color: COLORS.text }}>
            {processedCases}
          </div>
          <div
            className="px-4 py-1.5 rounded-full text-xs font-mono font-bold uppercase tracking-wider border border-white/10"
            style={{ backgroundColor: `${COLORS.secondary}20`, color: COLORS.secondary }}
          >
            VALIDATION CYCLE ACTIVE
          </div>
        </div>

        {/* Right Widget: Verification & Human Oversight Directive */}
        <div
          className="col-span-4 flex flex-col gap-6 p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl"
          style={{
            backgroundColor: `${COLORS.surface}e6`,
            transform: `translateX(${hudRightX}px)`,
          }}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6" style={{ color: COLORS.primary }} />
              <span className="font-mono font-bold text-sm tracking-wider" style={{ color: COLORS.text }}>
                SUPERVISORY AUDIT
              </span>
            </div>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
              PASSED
            </span>
          </div>

          <div className="flex flex-col gap-4">
            <div className="p-4 rounded-2xl bg-black/30 border border-white/5 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-xs font-bold font-mono" style={{ color: COLORS.text }}>
                  CLINICAL DOCTOR SIGN-OFF
                </span>
                <span className="text-xs opacity-60" style={{ color: COLORS.text }}>
                  Human confirmation required on 100% of diagnostic outputs.
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-black/30 border border-white/5 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex flex-col">
                <span className="text-xs font-bold font-mono" style={{ color: COLORS.text }}>
                  AUTONOMOUS LIMIT ENFORCED
                </span>
                <span className="text-xs opacity-60" style={{ color: COLORS.text }}>
                  Zero automated action authorized without physical physician key.
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-white/10 flex items-center justify-between text-xs font-mono">
            <span className="opacity-60" style={{ color: COLORS.text }}>
              OVERSIGHT STATUS:
            </span>
            <span className="font-bold text-emerald-300">MANDATORY ACTIVE</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 2: $4.5T NVIDIA ECOSYSTEM & MASSIVE CAPITAL BURN NETWORK (Frames 152 - 225)
// =============================================================================
const Fragment2: React.FC = () => {
  const frame = useCurrentFrame();

  const enterOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fast pulse zoom effect
  const graphZoom = interpolate(frame, [0, 70], [1.15, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeOut,
  });

  const centerScale = interpolate(frame, [0, 20], [0.7, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  // Orbit rotation angle
  const orbitAngle = frame * 1.8;

  // Real-time burning money ticker
  const burnedMillions = Math.floor(
    interpolate(frame, [0, 70], [24000, 650000], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASINGS.easeOut,
    })
  ).toLocaleString();

  const nodes = [
    { name: 'OPENAI', label: '$115B BURN PROJECTION', color: COLORS.primary, icon: BrainCircuit, offset: 0 },
    { name: 'AMD', label: 'MI350X ACCELERATION', color: COLORS.secondary, icon: Cpu, offset: 90 },
    { name: 'ORACLE CLOUD', label: '16GW POWER BACKLOG', color: COLORS.accent, icon: Layers, offset: 180 },
    { name: 'MISTRAL AI', label: 'ENTERPRISE LLM CLUSTERS', color: COLORS.primary, icon: Workflow, offset: 270 },
  ];

  return (
    <AbsoluteFill
      className="flex items-center justify-center w-full h-full relative overflow-hidden"
      style={{
        opacity: enterOpacity,
        fontFamily: TYPOGRAPHY.fontFamily,
        transform: `scale(${graphZoom})`,
      }}
    >
      {/* Dynamic Background Particle Field */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${COLORS.accent} 1.5px, transparent 1.5px)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div
        className="absolute w-[950px] h-[950px] rounded-full blur-[180px] pointer-events-none opacity-30 animate-pulse"
        style={{ backgroundColor: '#76b900' }}
      />

      {/* Top Banner Stat */}
      <div className="absolute top-12 flex items-center gap-4 z-20">
        <div
          className="flex items-center gap-3 px-6 py-2 rounded-full border border-red-500/30 bg-red-500/15 backdrop-blur-md"
          style={{ color: COLORS.accent }}
        >
          <Flame className="w-5 h-5 animate-pulse" />
          <span className="text-sm font-mono font-black tracking-widest uppercase">
            CUMULATIVE HYPERSCALER CAPEX: ${burnedMillions},000,000
          </span>
        </div>
      </div>

      {/* Central NVIDIA Hub & Massive Valuation */}
      <div
        className="relative z-10 flex flex-col items-center justify-center p-12 rounded-full border-4 border-[#76b900]/40 shadow-[0_0_120px_rgba(118,185,0,0.35)] backdrop-blur-2xl text-center"
        style={{
          width: 420,
          height: 420,
          backgroundColor: `${COLORS.surface}fa`,
          transform: `scale(${centerScale})`,
        }}
      >
        {/* Orbital rings */}
        <div
          className="absolute -inset-16 rounded-full border-2 border-dashed border-[#76b900]/30 pointer-events-none"
          style={{ transform: `rotate(${orbitAngle}deg)` }}
        />
        <div
          className="absolute -inset-32 rounded-full border border-dotted border-white/10 pointer-events-none"
          style={{ transform: `rotate(${-orbitAngle * 0.7}deg)` }}
        />

        <div className="w-18 h-18 rounded-3xl flex items-center justify-center bg-[#76b900]/20 border border-[#76b900] mb-3 shadow-[0_0_30px_rgba(118,185,0,0.5)]">
          <Cpu className="w-10 h-10 text-[#76b900]" strokeWidth={1.5} />
        </div>
        <span className="text-xs font-mono font-black tracking-widest text-[#76b900] uppercase">
          NVIDIA ECOSYSTEM NEXUS
        </span>
        <div className="text-5xl font-black mt-1 tracking-tight" style={{ color: COLORS.text }}>
          $4.5 TRILLION
        </div>
        <div className="flex items-center gap-2 mt-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
          <TrendingUp className="w-3.5 h-3.5 text-[#76b900]" />
          <span className="text-[11px] font-mono opacity-80" style={{ color: COLORS.text }}>
            GLOBAL COMPUTE MONOPOLY
          </span>
        </div>
      </div>

      {/* Orbiting Satellite Enterprise Nodes */}
      {nodes.map((node, i) => {
        const angleRad = ((orbitAngle + node.offset) * Math.PI) / 180;
        const radiusX = 640;
        const radiusY = 340;
        const posX = 960 + Math.cos(angleRad) * radiusX;
        const posY = 540 + Math.sin(angleRad) * radiusY;

        const NodeIcon = node.icon;

        return (
          <React.Fragment key={i}>
            {/* Pulsing Connector Line to Center */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <line
                x1={960}
                y1={540}
                x2={posX}
                y2={posY}
                stroke={node.color}
                strokeWidth={2.5}
                strokeDasharray="6 6"
                strokeOpacity={0.6}
              />
            </svg>

            {/* Orbiting Card */}
            <div
              className="absolute z-10 flex flex-col gap-2 p-6 rounded-2xl border border-white/15 shadow-2xl backdrop-blur-xl"
              style={{
                width: 270,
                left: `${posX}px`,
                top: `${posY}px`,
                transform: 'translate(-50%, -50%)',
                backgroundColor: `${COLORS.surface}f0`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${node.color}26` }}
                  >
                    <NodeIcon className="w-4 h-4" style={{ color: node.color }} />
                  </div>
                  <span className="font-extrabold text-base tracking-wide" style={{ color: COLORS.text }}>
                    {node.name}
                  </span>
                </div>
                <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
              </div>

              <div
                className="px-3 py-1.5 rounded-lg border border-white/5 font-mono text-[11px] font-bold tracking-wider"
                style={{ backgroundColor: `${COLORS.background}99`, color: node.color }}
              >
                {node.label}
              </div>
            </div>
          </React.Fragment>
        );
      })}

      {/* Bottom Ticker Info */}
      <div className="absolute bottom-10 flex items-center gap-8 px-8 py-3 rounded-full border border-white/10 bg-black/40 backdrop-blur-md font-mono text-xs z-20">
        <span className="flex items-center gap-2 text-emerald-300 font-bold">
          <Globe2 className="w-4 h-4" /> 5-YEAR DEBT CYCLE EXPANSION
        </span>
        <span className="opacity-30">|</span>
        <span style={{ color: COLORS.accent }} className="font-bold">
          POWER GRID DEMAND: +89% CAGR
        </span>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// FRAGMENT 3: ULTRA-DYNAMIC FINAL VERDICT & SYNERGY COCKPIT (Frames 225 - 524)
// =============================================================================
const Fragment3: React.FC = () => {
  const frame = useCurrentFrame();

  const enterOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Camera dynamics (Continuous subtle floating & push)
  const cameraZoom = interpolate(frame, [0, 290], [1, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.easeInOut,
  });

  // Staggered transitions
  // Stage 1: Fast metric bars explosion (frames 0 - 80)
  // Stage 2: Dual Core Comparison holographic lock-in (frames 70 - 200)
  // Stage 3: Grand Finale Seal & Golden Synthesis Verdict (frames 180 - 299)

  const leftCardX = interpolate(frame, [10, 45], [-160, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  const rightCardX = interpolate(frame, [18, 52], [160, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  const sealScale = interpolate(frame, [180, 220], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASINGS.overshoot,
  });

  const sealOpacity = interpolate(frame, [180, 205], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Live Counter for Boomerang Talent Rehire
  const rehirePercentage = Math.floor(
    interpolate(frame, [20, 110], [0, 40], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASINGS.easeOut,
    })
  );

  const humanValueIndex = Math.floor(
    interpolate(frame, [25, 120], [10, 100], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASINGS.easeOut,
    })
  );

  return (
    <AbsoluteFill
      className="flex flex-col items-center justify-between p-14 w-full h-full relative overflow-hidden"
      style={{
        opacity: enterOpacity,
        fontFamily: TYPOGRAPHY.fontFamily,
        transform: `scale(${cameraZoom})`,
      }}
    >
      {/* Dynamic Background Glow Fields */}
      <div
        className="absolute w-[850px] h-[850px] rounded-full blur-[170px] pointer-events-none opacity-25"
        style={{ backgroundColor: COLORS.primary, top: '-15%', left: '15%' }}
      />
      <div
        className="absolute w-[850px] h-[850px] rounded-full blur-[170px] pointer-events-none opacity-25"
        style={{ backgroundColor: COLORS.secondary, bottom: '-15%', right: '15%' }}
      />

      {/* Top Cockpit Telemetry Bar */}
      <div className="w-full max-w-7xl flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-3.5 h-3.5 rounded-full animate-ping" style={{ backgroundColor: COLORS.secondary }} />
          <div
            className="px-5 py-2 rounded-xl border border-white/10 text-xs font-mono font-black tracking-widest uppercase flex items-center gap-2"
            style={{ backgroundColor: `${COLORS.surface}e6`, color: COLORS.secondary }}
          >
            <Compass className="w-4 h-4" /> SYNTHESIS COCKPIT // 2026 BENCHMARK
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="px-4 py-1.5 rounded-xl border border-white/10 font-mono text-xs font-bold"
            style={{ backgroundColor: `${COLORS.surface}cc`, color: COLORS.text }}
          >
            GARTNER: 50% RE-HIRING EXPANSION
          </div>
          <div
            className="px-4 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" /> RESPONSIBILITY: HUMAN LOCKED
          </div>
        </div>
      </div>

      {/* Central Split Interactive HUD (AI Power Multiplier vs Human Accountability) */}
      <div className="w-full max-w-7xl grid grid-cols-12 gap-8 my-auto z-10 items-stretch">
        {/* Left Side: AI Accelerator Engine */}
        <div
          className="col-span-6 p-10 rounded-3xl border border-white/10 backdrop-blur-2xl flex flex-col justify-between shadow-2xl relative overflow-hidden"
          style={{
            backgroundColor: `${COLORS.surface}ee`,
            transform: `translateX(${leftCardX}px)`,
          }}
        >
          <div className="absolute top-0 left-0 w-full h-2.5" style={{ backgroundColor: COLORS.primary }} />

          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-6">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: `${COLORS.primary}26`, border: `1px solid ${COLORS.primary}4d` }}
                >
                  <BrainCircuit className="w-7 h-7" style={{ color: COLORS.primary }} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-3xl font-black tracking-tight" style={{ color: COLORS.text }}>
                    AI: Мощный инструмент
                  </h3>
                  <span className="text-xs font-mono font-bold tracking-wider" style={{ color: COLORS.primary }}>
                    FORCE MULTIPLIER & COMPUTE ENGINE
                  </span>
                </div>
              </div>
            </div>

            {/* Feature Metrics */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Скорость драфтов', value: '10x Faster', sub: 'Синтез шаблонов' },
                { label: 'Анализ терабайтов', value: 'Instant', sub: 'Семантический поиск' },
                { label: 'Автоматизация рутины', value: '94% Standard', sub: 'Базовые скрипты' },
                { label: 'Генерация гипотез', value: 'Unlimited', sub: 'Вариативность' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl border border-white/5 bg-black/30 flex flex-col justify-between"
                >
                  <span className="text-xs opacity-60 font-mono" style={{ color: COLORS.text }}>
                    {item.label}
                  </span>
                  <div className="text-xl font-black mt-1" style={{ color: COLORS.primary }}>
                    {item.value}
                  </div>
                  <span className="text-[11px] opacity-40 font-mono" style={{ color: COLORS.text }}>
                    {item.sub}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono">
            <span className="opacity-50" style={{ color: COLORS.text }}>
              EXECUTION LAYER:
            </span>
            <span className="font-bold" style={{ color: COLORS.primary }}>
              HIGH PERFORMANCE ACCELERATION
            </span>
          </div>
        </div>

        {/* Right Side: Human Experience & Final Accountability */}
        <div
          className="col-span-6 p-10 rounded-3xl border border-white/10 backdrop-blur-2xl flex flex-col justify-between shadow-2xl relative overflow-hidden"
          style={{
            backgroundColor: `${COLORS.surface}ee`,
            transform: `translateX(${rightCardX}px)`,
          }}
        >
          <div className="absolute top-0 left-0 w-full h-2.5" style={{ backgroundColor: COLORS.secondary }} />

          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-6">
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: `${COLORS.secondary}26`, border: `1px solid ${COLORS.secondary}4d` }}
                >
                  <Users className="w-7 h-7" style={{ color: COLORS.secondary }} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-3xl font-black tracking-tight" style={{ color: COLORS.text }}>
                    Человек: Незаменимый опыт
                  </h3>
                  <span className="text-xs font-mono font-bold tracking-wider text-emerald-300">
                    FINAL RESPONSIBILITY & INTUITION
                  </span>
                </div>
              </div>
            </div>

            {/* Feature Metrics */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Найм Boomerang-кадров', value: `${rehirePercentage}%`, sub: 'Возврат ключевых лидов' },
                { label: 'Юридическая ответственность', value: '100% Human', sub: 'Принятие рисков' },
                { label: 'Системная архитектура', value: 'Critical Core', sub: 'Стратегический замысел' },
                { label: 'Эмпатия и этика', value: `${humanValueIndex}% Unmatched`, sub: 'Нестандартные кейсы' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-2xl border border-white/5 bg-black/30 flex flex-col justify-between"
                >
                  <span className="text-xs opacity-60 font-mono" style={{ color: COLORS.text }}>
                    {item.label}
                  </span>
                  <div className="text-xl font-black mt-1" style={{ color: COLORS.secondary }}>
                    {item.value}
                  </div>
                  <span className="text-[11px] opacity-40 font-mono" style={{ color: COLORS.text }}>
                    {item.sub}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono">
            <span className="opacity-50" style={{ color: COLORS.text }}>
              DECISION AUTHORITY:
            </span>
            <span className="font-bold text-emerald-300">
              IRREPLACEABLE STRATEGIC LEAD
            </span>
          </div>
        </div>
      </div>

      {/* Floating Grand Finale Seal in Center (Overlays seamlessly at the climax) */}
      {frame > 175 && (
        <div
          className="absolute z-30 flex flex-col items-center justify-center p-8 rounded-3xl border-2 border-emerald-400/40 shadow-[0_0_140px_rgba(79,219,200,0.4)] backdrop-blur-3xl text-center"
          style={{
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) scale(${sealScale})`,
            opacity: sealOpacity,
            backgroundColor: `${COLORS.surface}fa`,
            width: 720,
          }}
        >
          {/* Neon spinning outer ring */}
          <div
            className="absolute -inset-6 rounded-3xl border border-dashed border-emerald-400/30 pointer-events-none"
            style={{ transform: `rotate(${frame * 0.6}deg)` }}
          />

          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-400/20 border-2 border-emerald-400 mb-4 shadow-[0_0_40px_rgba(79,219,200,0.6)]">
            <ShieldCheck className="w-10 h-10 text-emerald-300" strokeWidth={1.5} />
          </div>

          <span className="text-xs font-mono font-black tracking-widest text-emerald-300 uppercase">
            ИТОГОВЫЙ СТРАТЕГИЧЕСКИЙ ВЕРДИКТ
          </span>
          <div className="text-3xl font-black mt-2 leading-snug" style={{ color: COLORS.text }}>
            СИНЕРГИЯ ЭКСПЕРТИЗЫ И АЛГОРИТМОВ
          </div>
          <p className="text-sm opacity-80 mt-3 max-w-lg leading-relaxed" style={{ color: COLORS.text }}>
            Технология масштабирует возможности профессионалов, но никогда не заменит человеческую интуицию и ответственность.
          </p>

          <div className="mt-6 flex items-center gap-4">
            <div className="px-5 py-2 rounded-xl bg-white/10 font-mono text-xs font-bold" style={{ color: COLORS.text }}>
              2026 GLOBAL BENCHMARK
            </div>
            <div className="px-5 py-2 rounded-xl bg-emerald-500/30 text-emerald-200 font-mono text-xs font-bold">
              VERIFIED REALITY
            </div>
          </div>
        </div>
      )}

      {/* Bottom Ultra-wide Metric Ticker */}
      <div className="w-full max-w-7xl px-8 py-3 rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl flex items-center justify-between font-mono text-xs z-20">
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4" style={{ color: COLORS.secondary }} />
          <span style={{ color: COLORS.text }} className="font-bold">
            HUMAN-AI SYMBIOSIS PROTOCOL
          </span>
        </div>
        <div className="flex items-center gap-8 opacity-80" style={{ color: COLORS.text }}>
          <span>HYBRID TEAMS: +42% RELIABILITY</span>
          <span>AUTONOMOUS ONLY: 95% FAILURE RATE</span>
          <span className="text-emerald-300 font-bold">EXPERIENCE REMAINS SUPREME</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// =============================================================================
// MAIN SCENE COMPOSITION
// =============================================================================
const Scene: React.FC = () => {
  const { durationInFrames } = useVideoConfig();

  const F1_DURATION = 152;
  const F2_START = 152;
  const F2_DURATION = 73; // 152 to 225
  const F3_START = 225;
  const F3_DURATION = durationInFrames - F3_START; // 299 frames

  return (
    <AbsoluteFill className="w-full h-full relative" style={{ backgroundColor: COLORS.background }}>
      {/* Fragment 1: Clinical / Medical High-Tech Telemetry HUD (0:01 - 0:04) */}
      <Sequence from={0} durationInFrames={F1_DURATION}>
        <Fragment1 />
      </Sequence>

      {/* Fragment 2: $4.5T NVIDIA Graph & Capital Acceleration (0:05 - 0:07) */}
      <Sequence from={F2_START} durationInFrames={F2_DURATION}>
        <Fragment2 />
      </Sequence>

      {/* Fragment 3: Synergy Cockpit & Final Verdict Seal (0:07 - 0:17) */}
      <Sequence from={F3_START} durationInFrames={F3_DURATION}>
        <Fragment3 />
      </Sequence>
    </AbsoluteFill>
  );
};

export default Scene;