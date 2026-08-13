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
]