# Руководство по разработке моушн-виджетов (Vidora Widget Developer Guide)

Данный документ описывает правила проектирования, жизненный цикл и процесс регистрации новых Remotion-компонентов в экосистеме Vidora.

---

## 1. Архитектура и структура каталогов

Все готовые виджеты размещаются в проекте Remotion по пути:
`remotion-project/src/widgets/`

```text
remotion-project/src/widgets/
├── core/
│   ├── MotionBox.tsx          # Базовый контейнер движения (Spring / Physics / Exit)
│   ├── types.ts               # Общие типы анимации и пропсов
│   └── ThemeContext.tsx       # Доступ к палитре AppColors
├── social/
│   ├── TweetCard.tsx          # Карточка X/Twitter
│   └── SocialComment.tsx      # Комментарии YouTube/Reddit
├── tech/
│   ├── CodeWindow.tsx         # Окно редактора кода с подсветкой
│   ├── TerminalExecution.tsx  # Имитация выполнения CLI команд
│   └── BrowserMockup.tsx      # Окно веб-браузера
├── metrics/
│   ├── AnimatedStatCounter.tsx# Счетчики цифр и валют
│   └── MetricProgressBar.tsx  # Прогресс-бары и шкалы
├── narrative/
│   ├── ComparisonSplit.tsx    # Сравнение Было / Стало
│   └── ContrarianStamp.tsx    # Падающие штампы-вердикты
└── index.ts                   # Единая точка реэкспорта
```

---

## 2. Главные правила разработки компонентов для видео

### ❌ Запрещено:
1. **Никаких CSS-переходов и ключевых кадров (`transition: all 0.3s`, `@keyframes`)** — они несинхронны и ломают покадровый многопоточный рендер Remotion.
2. **Никаких функций текущего времени (`Date.now()`, `Math.random()` без сида)** — рендер должен быть на 100% детерминированным.
3. **Никаких таймеров (`setTimeout`, `setInterval`, `requestAnimationFrame`)**.

### ✅ Обязательно:
1. **Строгая зависимость от кадра**: Вся динамика строится через `useCurrentFrame()`, `useVideoConfig()`, `spring()` и `interpolate()`.
2. **Оборачивание в `MotionBox`**: Компонент не должен сам заново реализовывать физику появления и исчезновения.
3. **Дефолтные значения (Fallbacks)**: Компонент обязан корректно рендериться, даже если переданы только минимальные обязательные пропсы.

---

## 3. Стандартный шаблон нового виджета

Пример создания компонента `MetricProgressBar.tsx`:

```tsx
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { MotionBox } from '../core/MotionBox';

export interface MetricProgressBarProps {
  label: string;
  percentage: number; // 0..100
  accentColor?: string;
  delayFrames?: number;
  durationFrames?: number;
  className?: string;
}

export const MetricProgressBar: React.FC<MetricProgressBarProps> = ({
  label,
  percentage,
  accentColor = '#38bdf8',
  delayFrames = 0,
  durationFrames,
  className = '',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delayFrames);

  const fillProgress = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 16, stiffness: 90 },
  });

  const currentWidth = interpolate(fillProgress, [0, 1], [0, Math.min(100, percentage)]);

  return (
    <MotionBox
      delayFrames={delayFrames}
      durationFrames={durationFrames}
      animation="slide-up"
      className={`w-full max-w-xl mx-auto ${className}`}
    >
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-2xl">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-bold uppercase tracking-wider text-slate-300">{label}</span>
          <span className="font-mono font-black text-lg" style={{ color: accentColor }}>
            {Math.round(currentWidth)}%
          </span>
        </div>
        <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-white/5">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${currentWidth}%`,
              backgroundColor: accentColor,
              boxShadow: `0 0 16px ${accentColor}66`,
            }}
          />
        </div>
      </div>
    </MotionBox>
  );
};
```

---

## 4. Регистрация нового виджета на бэкенде

Чтобы нейросеть мгновенно научилась использовать новый виджет:
1. Откройте `backend/app/infrastructure/remotion/widgets_registry.py`.
2. Добавьте описание нового компонента в словарь `_WIDGETS`:

```python
"MetricProgressBar": WidgetMetadata(
    id="MetricProgressBar",
    name="Индикатор прогресса",
    category=WidgetCategory.METRICS,
    description="Горизонтальная шкала прогресса с неоновым заполнением и числовым индикатором процентов.",
    props=[
        *COMMON_BASE_PROPS,
        WidgetPropDefinition(name="label", type=PropType.STRING, required=True, description="Название метрики"),
        WidgetPropDefinition(name="percentage", type=PropType.NUMBER, required=True, description="Процент от 0 до 100"),
        WidgetPropDefinition(name="accentColor", type=PropType.STRING, required=False, default="#38bdf8", description="Цвет полосы"),
    ],
    example_snippet='<MetricProgressBar label="GPU Memory Load" percentage={87} accentColor="#f43f5e" delayFrames={10} />',
    tags=["metrics", "bar", "progress", "gpu", "percentage"],
),
```

После этого:
* Генератор промптов автоматически добавит TypeScript-сигнатуру компонента во все запросы к LLM.
* Санитайзер кода (`tsx_sanitizer.py`) начнет распознавать `<MetricProgressBar />` и автоматически импортировать его в сгенерированные файлы.
* Эндпоинт `GET /api/v1/code/widgets` мгновенно вернет обновленный каталог для фронтенда.
