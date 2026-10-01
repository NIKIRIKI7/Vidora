# Vidora Remotion Scene Standards

Канонические правила для всех Remotion-сцен, генерируемых LLM
или написанных вручную. Нарушение этих правил ломает рендер в
браузере (Player) и/или в headless Chromium.

Референс-реализация: [`Pulse.tsx`](./Pulse.tsx).

---

## 0. Почему layout нельзя делать на Tailwind

`TailwindPlugin` из `@web-react-player/remotion` **не генерирует** утилиты
в рантайме. Он только инжектит переданную строку `customCss`:

```ts
new TailwindPlugin(customCss?: string)
```

Vidora вызывает `createDefaultRemotionSuite()` **без** аргумента, поэтому
внутри `data-remotion-tailwind-scope` не попадает ни одного правила
Tailwind. Скомпилированный CSS приложения сюда не переносится: сцена
рендерится в изолированной области.

Итог: любой класс из сгенерированной TSX-строки молча игнорируется.
Критичный layout на классах = каскадный отказ вёрстки.

Дополнительно в проекте стоит **Tailwind v4**, где градиентный утилит
переименован: `bg-gradient-to-br` (v3) → `bg-linear-to-br` (v4).
Arbitrary values (`w-[600px]`, `blur-[120px]`) требуют статического
сканирования исходников, которого у динамической строки нет в принципе.

**Вывод: layout — только inline `style`. Tailwind не является частью
контракта рендера.**

---

## 1. Layout — только inline styles

**Что запрещено в layout:**
`absolute`, `relative`, `fixed`, `sticky`, `top-*`, `left-*`,
`right-*`, `bottom-*`, `inset-*`, `w-*`, `h-*`, `min-w-*`,
`max-w-*`, `p-*`, `m-*`, `gap-*`, `flex`, `grid`, `items-*`,
`justify-*`, `content-*`, `translate-*`, `scale-*`, `rotate-*`,
`skew-*`, `blur-*`, `bg-gradient-*`, `bg-linear-*`, `bg-clip-text`,
`object-cover`, `w-full`, `h-full`.

**Правильно:**
```tsx
<div style={{
  position: 'absolute',
  top: 0, left: '50%',
  transform: 'translate(-50%, 0)',
  width: unit * 0.3,
  height: unit * 0.3,
}} />
```

**Неправильно:**
```tsx
<div className="absolute top-0 left-1/2 -translate-x-1/2 w-[320px] h-[320px]" />
```

**Что ещё допустимо через классы:** ничего, на что нельзя продублировать
inline. Шрифт, цвет текста, тени, скругления — тоже дублируйте inline:
Tailwind может не сработать.

---

## 2. Resolution Independence

Любой размер — от `useVideoConfig()`:

```tsx
const { width, height } = useVideoConfig();
const unit = Math.min(width, height);
// далее везде unit * K
```

Никаких фиксированных `px` в layout. Иконки — `size={unit * 0.03}`.

---

## 3. Пружины не «из нуля»

`spring({ from: 0 })` даёт визуальный щелчок — сцена «выпрыгивает
из точки». Правильно:

```tsx
const appear = spring({
  frame, fps,
  config: { damping: 14, stiffness: 90, mass: 0.7 },
  from: 0.92,
  to: 1,
});
const opacity = interpolate(frame, [0, 12], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
});
```

---

## 4. Пульс — двухфазный

`Math.max(0, Math.sin(...))` — односторонний горб, выглядит как
судорога. Правильно — интерполяция фазы с быстрым подъёмом и
медленным спадом:

```tsx
const beatPeriod = Math.round(fps / 2);      // 120 BPM
const beatPhase = (frame % beatPeriod) / beatPeriod;
const beatPulse = interpolate(
  beatPhase,
  [0, 0.12, 0.32, 1],                         // систола → диастола
  [0, 1, 0.15, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
);
const heartScale = 1 + beatPulse * 0.14;
```

`beatPeriod` округляйте: при нечётном `fps` дробный период даёт
скачок `frame % beatPeriod` на границе фаз.

---

## 5. Волны и пульсации — окно, а не `% period`

`(frame + delay) % (fps * 2)` даёт **скачок фазы** в момент
сброса: `progress` прыгает с `1.0` на `0.0`, `scale` мгновенно
падает с 2.6 на 1.0 — видимый «pop».

Правильно — компонент, живущий в явном окне:

```tsx
const RippleWave: React.FC<{ startFrame: number; size: number }> = ({
  startFrame, size,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const life = fps * 2;
  const local = frame - startFrame;
  if (local < 0 || local > life) return null;

  const progress = local / life;
  const scale = interpolate(progress, [0, 1], [1, 2.6]);
  const opacity = interpolate(progress, [0, 0.1, 1], [0, 0.65, 0]);
  return <div style={{ position: 'absolute', width: size, height: size,
    borderRadius: '50%', border: `${size * 0.02}px solid #f472b6`,
    transform: `scale(${scale})`, opacity, pointerEvents: 'none' }} />;
};
```

Несколько волн с разными `startFrame` — параллельные инстансы.

---

## 6. `Sequence` для позиционированных детей

`<Sequence>` по умолчанию оборачивает контент в свой
`AbsoluteFill` (`layout="absolute-fill"`). Если ребёнок сам
позиционируется абсолютно (`position: 'absolute'`), обёртка
создаёт лишний слой — элемент уезжает из-под `top`/`bottom`.

```tsx
// Неправильно: caption получит свой AbsoluteFill поверх родителя
<Sequence from={20}>
  <Caption />
</Sequence>

// Правильно: caption сохраняет свою absolute-раскладку
<Sequence from={20} layout="none">
  <Caption />
</Sequence>
```

**Внимание, внутри `Sequence`:** `useCurrentFrame()` отсчитывает кадры
от `from`, а `useVideoConfig().durationInFrames` остаётся длиной
**композиции**. Сравнивать их напрямую нельзя — `fadeOut` по
`durationInFrames` не сработает никогда. Либо передавайте длительность
сцены пропом, либо вычитайте `from`:

```tsx
const localEnd = sceneDuration - SEQUENCE_FROM;
const fadeOut = interpolate(frame, [localEnd - 24, localEnd], [1, 0], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

---

## 7. Градиентный текст — inline

Tailwind `bg-clip-text text-transparent` не сработает в
динамическом TSX. Правильно:

```tsx
<p style={{
  margin: 0,
  background: 'linear-gradient(90deg, #ffffff 0%, #fbcfe8 50%, #fda4af 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
}}>Beating with Remotion</p>
```

---

## 8. Иконки Lucide — цвет и размер inline

```tsx
<Heart
  size={unit * 0.15 * 0.45}
  color="#ffffff"
  fill="#ffffff"
  style={{ /* layout */ }}
/>
```

`className="text-amber-300 fill-white"` может не примениться.
`size` / `color` / `fill` — через props, layout — через `style`.

Центрировать иконку на контейнере смещением — только inline
(`top: 0, left: '50%', transform: 'translate(-50%, 0)'`).

---

## 9. Чек-лист перед сдачей сцены

- [ ] В layout нет ни одного Tailwind-класса.
- [ ] Все размеры — `unit * K` от `useVideoConfig()`.
- [ ] Нет фиксированных `px` в `top/left/right/bottom/width/height`.
- [ ] Появление сцены — spring от 0.92, не от 0.
- [ ] Пульсы — двухфазные `interpolate`, период округлён.
- [ ] Волны — компонент с `startFrame`, не `% period`.
- [ ] Каждый позиционированный ребёнок — `layout="none"` на `Sequence`.
- [ ] `durationInFrames` не сравнивается с кадром внутри `Sequence`.
- [ ] Градиентный текст — inline `WebkitBackgroundClip`.
- [ ] Иконки — `size`, `color`, `fill` через props.
- [ ] Сцена рендерится корректно в 1080p, 1440p, 2160p.

---

## 10. Таблица замен при миграции старых сцен

| Старый класс | Замена |
|--------------|--------|
| `className="absolute inset-0 ..."` | `style={{ position: 'absolute', inset: 0, ... }}` |
| `className="flex items-center justify-center"` | `style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}` |
| `className="w-[600px] h-[320px]"` | `style={{ width: unit * 0.55, height: unit * 0.3 }}` |
| `className="bg-gradient-to-br from-X via-Y to-Z"` | `style={{ background: 'linear-gradient(135deg, X 0%, Y 50%, Z 100%)' }}` |
| `className="blur-[120px]"` | `style={{ filter: \`blur(${unit * 0.1}px)\` }}` |
| `className="text-amber-300 fill-white"` | `<Icon size={unit * 0.03} color="#fcd34d" fill="#ffffff" />` |
| `className="bottom-24"` на `<Sequence>` | `<Sequence layout="none">` + `style={{ bottom: unit * 0.1 }}` |
| `className="w-full h-full object-cover"` | `style={{ width: '100%', height: '100%', objectFit: 'cover' }}` |
