export interface RemotionSkill {
  id: string
  title: string
  description: string
  content: string
  applyTo?: ('scenario' | 'project' | 'scene' | 'fragment' | 'audio' | 'analysis')[]
}

// ponytail: distilled offline fallback, full set comes from POST /api/v1/system/remotion-skills-sync
export const REMOTION_SKILLS: RemotionSkill[] = [
  {
    id: 'remotion-tailwind-motion',
    title: 'Remotion + Tailwind Premium Motion Graphics',
    description: 'Кинетическая типографика, премиальная анимация через useCurrentFrame, spring-физика и верстка слоев AbsoluteFill.',
    applyTo: ['scene', 'fragment', 'project'],
    content: `# Remotion + Tailwind Premium Motion Graphics

Create production-quality motion graphics that feel cinematic, intentional, and polished. Every animation must be driven by useCurrentFrame() + spring() / interpolate(). Never use CSS transitions, animate-* Tailwind classes, or wall-clock timers — they are invisible during Remotion's frame-by-frame render.

## Core Principles
1. **Frame is the only source of truth** — derive every opacity, transform, scale, blur, letter-spacing from current frame.
2. **Spring first, interpolate second** — use spring() for natural motion, then interpolate() to map 0→1 progress onto visual ranges.
3. **Stagger everything** — characters, words, lines, cards, particles. Stagger creates rhythm and premium feel.
4. **Layer with AbsoluteFill** — stack backgrounds, content, overlays, particles. Last rendered = topmost.
5. **Tailwind for statics only** — colors, spacing, typography, borders, flex/grid. All motion via inline style props.
6. **Clamp everything** — always set extrapolateLeft: "clamp" and extrapolateRight: "clamp".

## Spring Configurations
\`\`\`ts
// Smooth elegant (no bounce) — titles, reveals, highlights
{ damping: 200 }

// Snappy UI (minimal bounce)
{ damping: 20, stiffness: 200 }

// Playful bouncy
{ damping: 8, stiffness: 120, mass: 0.6 }

// Heavy cinematic
{ damping: 30, stiffness: 80, mass: 1.4 }

// Ultra fast pop
{ mass: 0.4, stiffness: 300, damping: 14 }
\`\`\`

## Typography & Layering Patterns
- **Word-by-word stagger:** \`text.split(' ').map((word, i) => ... spring({ frame: frame - i * 4, fps, config: { damping: 200 } }))\`
- **Character-level with blur:** \`spring({ frame: frame - i * 2, fps, config: { mass: 0.5, stiffness: 200, damping: 14 } })\` с интерполяцией \`filter: blur(...)px\` и \`letterSpacing\`.
- **Composition Layering:**
  \`\`\`tsx
  <AbsoluteFill className="bg-neutral-950 overflow-hidden">
    {/* 1. Background layer */}
    <AbsoluteFill>{/* gradients, noise, particles */}</AbsoluteFill>
    {/* 2. Content layer */}
    <AbsoluteFill className="flex items-center justify-center">{/* typography, cards */}</AbsoluteFill>
    {/* 3. Overlay layer */}
    <AbsoluteFill className="pointer-events-none">{/* vignettes, light accents */}</AbsoluteFill>
  </AbsoluteFill>
  \`\`\`
`,
  },
  {
    id: 'best-practices',
    title: 'Remotion Best Practices',
    description: 'Ключевые правила генерации: стейты без useState, анимации через интерполяцию, отзывчивые размеры через проценты.',
    content: `## Remotion Best Practices

1. ALWAYS use useCurrentFrame(), useVideoConfig(), interpolate(), Easing, AbsoluteFill, Sequence.
2. NO useState/useEffect/hooks inside components — Remotion re-renders per frame, keep components pure.
3. Layout MUST be responsive: use percentages (width: '100%') or useVideoConfig() so 16:9 and 9:16 both work.
4. Animate everything with Easing.bezier() + interpolate(); plain linear movement looks cheap.
5. Use <Sequence from={...} durationInFrames={...}> to stage fragments in time.
6. Import <img> from staticFile() (public/ assets); do not import binaries in TSX.
7. Text stays legible: high contrast on surface colors, readable font sizes, proper line-height.
8. Never use pages, grids, or absolutely positioned pixels tied to 1920x1080 — real size comes from useVideoConfig().`,
  },
  {
    id: 'markup-timing',
    title: 'Тайминг и монтаж',
    description: 'Как раскладывать фрагменты по времени и делать динамичную смену кадров.',
    content: `## Тайминг и монтаж

- Каждый фрагмент = отдельный <Sequence>, старт = startTime*fps, длительность = (endTime-startTime)*fps.
- Кадр должен меняться не реже раза в 3-5 секунд: зум, B-roll, анимация, смена ракурса.
- Паузы в речи делай через пустые доли <Sequence> (без контента), а не через задержки анимаций.
- Синхронизируй визуал с текстом суфлера: что сказано — то на экране.
- Не растягивай один статичный кадр на весь фрагмент.`,
  },
  {
    id: 'tailwind-css',
    title: 'Стилизация через Tailwind CSS',
    description: 'В проекте подключен Tailwind. Используй utility-классы в className вместо громоздких inline-стилей.',
    content: `## Tailwind CSS
1. В проекте подключен Tailwind CSS v4. Используй className="flex flex-col items-center justify-center w-full h-full" для layout, размеров и шрифтов.
2. ВАЖНО: Tailwind сканирует исходник как текст (JIT) и НЕ выполняет JS — класс, собранный через \${COLORS.x} в шаблонной строке (bg-[\${COLORS.primary}]), молча пропускается и элемент остаётся без стиля. НИКОГДА не интерполируй COLORS в className.
3. Все цвета из объекта COLORS передавай ТОЛЬКО через style: style={{ backgroundColor: COLORS.background, color: COLORS.text }}.
4. style={{...}} также используется для анимируемых свойств (transform, opacity), меняющихся каждый кадр через interpolate(). Всё статичное (layout, шрифты, отступы) — в className.`,
  },
  {
    id: 'r3f-integration',
    title: 'React Three Fiber & Remotion 3D',
    description: 'Строгие правила 3D: отказ от <Float>, привязка к кадрам, тени.',
    content: `## React Three Fiber + Remotion (CRITICAL RULES)
1. Для 3D используй \`ThreeCanvas\` из \`@remotion/three\`, а НЕ \`<Canvas>\` из R3F. Это синхронизирует рендер с Remotion.
2. ЗАПРЕЩЕНО использовать компоненты Drei, зависящие от внутреннего таймера: \`<Float>\`, \`<OrbitControls autoRotate>\`, \`<Wobble>\`. Они рассинхронизируются при экспорте видео и вызывают сильное дергание (jitter).
3. ВСЕ анимации (парение, вращение) делай математически через \`useCurrentFrame()\`. Пример парения:
   \`const floatY = Math.sin(frame / 15) * 0.15;\`
   \`const rotZ = Math.cos(frame / 20) * 0.05;\`
4. ВАЖНО: При использовании \`spring()\`, НИКОГДА не оборачивай \`frame\` в \`Math.max\`. Передавай отрицательные значения напрямую (Remotion сам вернет 0):
   ❌ Плохо: \`spring({ frame: Math.max(0, frame - 30), fps })\`
   ✅ Хорошо: \`spring({ frame: frame - 30, fps })\`
5. Для теней используй \`<ContactShadows frames={1} />\` — обязательно \`frames={1}\`, чтобы запечь тень и сэкономить ресурсы при покадровом рендере.
6. 2D интерфейс (Tailwind) располагай поверх \`ThreeCanvas\` в отдельном \`<AbsoluteFill>\` с \`pointer-events-none\`.`,
  },
  {
    id: 'lucide-icons',
    title: 'Использование иконок (Lucide React)',
    description: 'Как правильно импортировать и стилизовать векторные иконки в сценах.',
    content: `## Иконки (Lucide React)
1. В проекте доступна библиотека \`lucide-react\`. ИСПОЛЬЗУЙ ТОЛЬКО ЕЁ для иконок.
2. Импортируй нужные иконки напрямую: \`import { Cpu, Zap, Activity, MonitorPlay } from 'lucide-react';\`
3. Стилизуй их через Tailwind классы для размера, а цвет передавай через inline-style:
   \`<Cpu className="w-12 h-12" style={{ color: COLORS.primary }} />\`
4. У иконок Lucide есть свойство \`strokeWidth\`. Для более тонкого кинематографичного вида задавай \`strokeWidth={1.5}\` (по умолчанию 2).
5. Если не уверен в точном названии, используй стандартные: \`Play\`, \`Pause\`, \`ChevronRight\`, \`Settings\`, \`User\`, \`Image\`, \`Monitor\`, \`Smartphone\`, \`Video\`.`,
  },
  {
    id: 'voiceover-minimax-localllm',
    title: 'Режиссура озвучки (MiniMax / Local LLM TTS)',
    description: 'Как писать текст для закадрового голоса, чтобы он идеально звучал на облачных API и в локальных LLM-TTS (Qwen/Moss).',
    applyTo: ['scenario'],
    content: `## Режиссура озвучки (MiniMax speech-2.8-hd и Local LLM-TTS)

Сценарий пишется сразу под озвучку нейросетью. В ролике нет ведущего — голос несёт харизму. Адаптируй стиль в зависимости от движка.

### 1. MiniMax speech-2.8-hd (облако)
Модель умеет эмоции, дыхание, смех и драматические паузы. Теги — команды диктору: вслух НЕ произносятся.
- \`[emotion: X]\` — тон всего фрагмента, ставится в самом начале. X строго одно из: happy, sad, angry, fearful, disgusted, surprised, calm. Один тег на фрагмент.
- \`<#X#>\` — пауза в секундах, X от 0.1 до 3.0. С пробелами с обеих сторон: \`слово <#1.0#> слово\`.
- Междометия в скобках: (breath), (sighs), (chuckle), (laughs). Максимум 1-2 на сцену.

### 2. Локальные LLM-TTS (OmniVoice, Qwen-TTS, Moss-TTS)
Модели масштаба 1.7B НЕ понимают служебные теги MiniMax и читают их вслух!
- ЗАПРЕЩЕНО использовать теги \`[emotion]\`, \`<#1.0#>\`, \`(sighs)\`.
- Акцент на слове — пиши его КАПСОМ (LLM-TTS реагируют на регистр).
- Драматическая пауза — МНОГОТОЧИЕ (\`...\`).
- Эмоции — риторические вопросы и восклицания.

### 3. Общие правила (оба движка)
- ВСЕ английские слова, бренды и IT-термины в тексте озвучки — русскими буквами: эпл (Apple), пайтон (Python), си плюс плюс (C++), гугл (Google), бэкенд. В ремарках монтажёра (A-roll/B-roll, названия сервисов) — не транслитерируем.
- Пиши правильно буквы е и ё (не «елка», а «ёлка»; не «берет», а «берёт»).
- Максимум 1-2 эмоциональных акцента на сцену; остальное нейтрально.`,
  },
  {
    id: 'archetype-poster-split',
    title: 'Архетип: Постерный сплит-контраст (Nike / Editorial)',
    description: 'Контрастный геометрический фон, вырезной объект, гигантская кинетическая типографика.',
    applyTo: ['scene', 'fragment', 'project'],
    content: `## Шаблон: Постерный сплит-контраст
\`\`\`tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const zoom = interpolate(frame, [0, 90], [1.0, 1.12], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const titleY = interpolate(frame, [0, 30], [90, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const badgePop = spring({ frame: frame - 20, fps, config: { damping: 10, stiffness: 160 } });

return (
  <AbsoluteFill className="overflow-hidden bg-neutral-950 flex items-center justify-center">
    {/* Фон: контрастный сплит */}
    <div className="absolute inset-0 flex" style={{ transform: \`scale(\${zoom}) rotate(-12deg)\` }}>
      <div className="w-1/2 h-full bg-white" />
      <div className="w-1/2 h-full bg-neutral-950" />
    </div>

    {/* Гигантская кинетическая типографика */}
    <h1
      className="absolute z-10 text-[150px] font-black uppercase tracking-tighter m-0 text-white"
      style={{ transform: \`translateY(\${titleY}px)\`, textShadow: '0 24px 70px rgba(0,0,0,0.7)' }}
    >
      SPOTLIGHT
    </h1>

    {/* Вырезной объект по центру */}
    <div className="relative z-20" style={{ transform: \`scale(\${zoom}) translateY(\${Math.sin(frame / 20) * 10}px)\` }}>
      {/* сюда: OffthreadVideo, 3D-объект или векторная вырезка */}
    </div>

    {/* Хромированный бейдж */}
    <div
      className="absolute bottom-16 right-20 z-30 w-28 h-28 rounded-full border-4 border-white/80 bg-gradient-to-br from-neutral-300 to-neutral-600"
      style={{ transform: \`scale(\${badgePop})\`, boxShadow: '0 30px 80px rgba(0,0,0,0.8)' }}
    />
  </AbsoluteFill>
);
\`\`\``
  },
  {
    id: 'archetype-kinetic-collage',
    title: 'Архетип: Кинетический коллаж и ленты (Streetwear / Acid)',
    description: 'Скошенные цветные ленты с текстом, стикеры-звёзды, ретро-эффекты, гранж.',
    applyTo: ['scene', 'fragment', 'project'],
    content: `## Шаблон: Скошенные ленты и коллаж
\`\`\`tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const ribbon1 = interpolate(frame, [0, 30], [-1300, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const ribbon2 = interpolate(frame, [10, 40], [1300, 0], { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const starSpin = frame * 3;

return (
  <AbsoluteFill className="bg-neutral-900 overflow-hidden flex items-center justify-center">
    {/* Лента 1 */}
    <div
      className="absolute bg-lime-400 text-black font-black text-6xl px-14 py-4 uppercase tracking-tight flex items-center gap-6 shadow-2xl"
      style={{ transform: \`translateX(\${ribbon1}px) rotate(-6deg)\` }}
    >
      <span>WANNA</span>
      <span className="text-white">✹</span>
      <span>GROW FASTER</span>
    </div>

    {/* Лента 2 встречным движением */}
    <div
      className="absolute bg-white text-black font-black text-7xl px-20 py-5 uppercase tracking-tighter shadow-2xl"
      style={{ transform: \`translateX(\${ribbon2}px) rotate(3deg)\` }}
    >
      WITH CONTENT
    </div>

    {/* Стикеры-акценты */}
    <div className="absolute top-12 left-12 text-6xl text-lime-400 select-none" style={{ transform: \`rotate(\${starSpin}deg)\` }}>✳</div>
    <div className="absolute bottom-16 right-14 text-5xl text-pink-500 select-none" style={{ transform: \`rotate(-\${starSpin}deg)\` }}>✹</div>

    {/* Зерно поверх */}
    <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '4px 4px' }} />
  </AbsoluteFill>
);
\`\`\``
  },
  {
    id: 'archetype-editorial-metaphor',
    title: 'Архетип: Журнальный минимализм и предмет-метафора',
    description: 'Светлый текстурированный фон, один парящий предмет, крупный заголовок и мелкие метаданные.',
    applyTo: ['scene', 'fragment', 'project'],
    content: `## Шаблон: Журнальная сцена с изолированным предметом
\`\`\`tsx
const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const floatY = Math.sin(frame / 25) * 14;
const kenBurns = interpolate(frame, [0, 120], [1.0, 1.06], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
const reveal = interpolate(frame, [0, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

return (
  <AbsoluteFill className="bg-[#f4f1ea] text-neutral-900 overflow-hidden" style={{ transform: \`scale(\${kenBurns})\` }}>
    <div className="flex flex-col items-center justify-between h-full p-20">
      {/* Заголовок сверху */}
      <div className="flex flex-col items-center text-center max-w-3xl z-10" style={{ opacity: reveal }}>
        <span className="text-xs font-mono tracking-[0.4em] uppercase text-neutral-400 mb-3">EXECUTIVE BLUEPRINT</span>
        <h1 className="text-6xl font-serif font-medium tracking-tight leading-tight m-0">
          Waiting For The Perfect Moment
        </h1>
      </div>

      {/* Парящий предмет-метафора */}
      <div className="relative flex items-center justify-center my-auto" style={{ transform: \`translateY(\${floatY}px)\` }}>
        <div className="w-72 h-72 rounded-full bg-black/10 blur-3xl absolute -bottom-12" />
        {/* сюда: иконка, 3D-модель или векторный предмет */}
      </div>

      {/* Метаданные снизу */}
      <p className="max-w-md text-center text-xs leading-relaxed tracking-wide text-neutral-500" style={{ opacity: interpolate(frame, [30, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        Consistency is showing up even when motivation ghosts you.
      </p>
    </div>
  </AbsoluteFill>
);
\`\`\``
  },
]