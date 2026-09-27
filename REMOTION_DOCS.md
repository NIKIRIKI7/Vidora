# Remotion & @remotion/player — документация

> Источник: Context7 (`/remotion-dev/remotion`), официальная документация Remotion.
> Версии API соответствуют актуальному Remotion 4.x.

Remotion — фреймворк для создания видео программно с помощью React. Видео — это набор
React-компонентов; каждый кадр — это его render при текущем значении кадра. Один и тот же
код используется и для превью в браузере (`@remotion/player` / Remotion Studio), и для
серверного рендера в MP4 (`@remotion/renderer`).

---

## 1. Установка

Новый проект:

```bash
npx create-video@latest
```

Добавление в существующий проект:

```bash
npm i remotion @remotion/cli @remotion/player
npm i -D typescript @types/react @types/react-dom
```

### Ключевые пакеты

| Пакет | Назначение |
|---|---|
| `remotion` | Ядро: компоненты, хуки, анимация (`interpolate`, `spring`) |
| `@remotion/cli` | `remotion studio`, `remotion render`, `remotion still`, `bundle` |
| `@remotion/player` | Встраивание плеера в обычное React-приложение |
| `@remotion/renderer` | Программный рендер: `renderMedia`, `renderStill`, `selectComposition` |
| `@remotion/bundler` | `bundle()` — сборка Webpack-бандла проекта для рендера |
| `@remotion/media` | Новые `<Video>`/`<Audio>` на Mediabunny + WebCodecs (быстрее) |
| `@remotion/media-utils` | `getVideoMetadata`, `getAudioMetadata`, `getAudioDurationInSeconds` |
| `@remotion/zod-types` | Доп. Zod-типы (напр. цвет `zColor()`) |
| `@remotion/google-fonts` | Локальные Google Fonts без внешних запросов |
| `@remotion/transitions` | Готовые переходы между сценами |
| `@remotion/captions` | Субтитры (TikTok/Whisper-стиль) |
| `@remotion/three` | Интеграция с react-three-fiber |
| `@remotion/lambda` | Рендер в AWS Lambda |

---

## 2. Структура проекта

```text
my-video/
├── src/
│   ├── index.ts        # точка входа: registerRoot()
│   ├── Root.tsx        # список <Composition>
│   ├── MyComposition.tsx
│   └── MyStill.tsx
├── public/             # статические ассеты (staticFile)
├── remotion.config.ts  # конфигурация CLI/Studio
└── package.json
```

Точка входа (`src/index.ts`):

```ts
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
```

`remotion.config.ts`:

```ts
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setConcurrency(4);
Config.setCodec('h264');
Config.overrideWebpackConfig((config) => config);
```

---

## 3. Основные концепции

### `<Composition>`

Регистрирует видео. Задаёт размеры, fps и длительность в кадрах.

```tsx
import { Composition } from 'remotion';
import { MyVideo } from './MyVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MyVideo"
      component={MyVideo}
      durationInFrames={300} // 10 секунд при 30 fps
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ titleText: 'Hello World' }}
    />
  );
};
```

Ключевые props: `id`, `component` (или `lazyComponent`) `durationInFrames`, `fps`,
`width`, `height`, `defaultProps`, `calculateMetadata`, `schema`.

### `<Still>` — статичное изображение

```tsx
import { Still } from 'remotion';

<Still id="MyStill" component={MyStill} width={1920} height={1080} />
```

### `<Folder>` — группировка в Studio

```tsx
import { Folder, Composition } from 'remotion';

<Folder id="MyVideo-Scenes">
  <Composition id="Scene1" component={Scene1} durationInFrames={150} fps={30} width={1920} height={1080} />
  <Composition id="Scene2" component={Scene2} durationInFrames={150} fps={30} width={1920} height={1080} />
</Folder>
```

Регистрация сцен отдельными `<Composition>` позволяет двойным кликом переходить к сцене
в таймлайне Studio.

### `calculateMetadata()` — динамические размеры/длительность

Позволяет вычислить `durationInFrames`, `fps`, `width`, `height`, `props` асинхронно,
например из входных данных.

```tsx
import { CalculateMetadataFunction } from 'remotion';

const calculateMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const duration = await getAudioDurationInSeconds(props.audioUrl);
  return {
    durationInFrames: Math.ceil(duration * 30),
    fps: 30,
  };
};

<Composition
  id="MyComp"
  component={MyComp}
  calculateMetadata={calculateMetadata}
  defaultProps={{ audioUrl: '' }}
  durationInFrames={30}
  fps={30}
  width={1920}
  height={1080}
/>
```

> В `@remotion/player` `calculateMetadata` не вызывается — если метаданные динамические,
> синхронизируйте props плеера вручную или переиспользуйте ту же логику.

---

## 4. Хуки

### `useCurrentFrame()`

Возвращает текущий кадр (относительно родительского `<Composition>` / `<Sequence>` /
`<Series.Sequence>`). Начинается с `0`.

```tsx
import { useCurrentFrame } from 'remotion';

const frame = useCurrentFrame(); // 0, 1, 2, ...
```

### `useVideoConfig()`

Возвращает параметры композиции:

```tsx
import { useVideoConfig } from 'remotion';

const { width, height, fps, durationInFrames } = useVideoConfig();
// 1920, 1080, 30, 300
```

### `useIsPlayer()`

Экспериментальный флаг: рендерится ли композиция внутри `<Player>` (а не в Studio/рендере).
Доступен как `Experimental.useIsPlayer`.

> Важно: компоненты Remotion должны быть **детерминированными** относительно кадра.
> Все вычисления — от `useCurrentFrame()`, никакого `Date.now()`, `Math.random()` без
> `random(seed)` из Remotion.

---

## 5. Компоненты разметки и медиа

### `<AbsoluteFill>`

`<div>` на весь кадр (`position: absolute; inset: 0`) — базовый контейнер.

```tsx
import { AbsoluteFill } from 'remotion';

<AbsoluteFill style={{ backgroundColor: 'black', justifyContent: 'center' }}>
  <h1>Hello</h1>
</AbsoluteFill>
```

### `<Sequence>` — локальная шкала времени

Смещает начало времени для детей. Внутри `useCurrentFrame()` начинается с `0`. Вне
интервала — не рендерится.

```tsx
import { Sequence } from 'remotion';

<Sequence from={30} durationInFrames={60}>
  <Title />
</Sequence>
```

Props: `from`, `durationInFrames` (по умолчанию до конца композиции),
`layout` (`"absolute-fill"` (по умолчанию) или `"none"`), `premountFor`, `name`, `showInTimeline`.

### `<Series>` — последовательность без расчёта смещений

```tsx
import { Series } from 'remotion';

<Series>
  <Series.Sequence durationInFrames={45}>
    <Intro />
  </Series.Sequence>
  <Series.Sequence durationInFrames={60} offset={-10}>
    <Main />
  </Series.Sequence>
</Series>
```

### `<Loop>` — повтор выбранного участка

```tsx
import { Loop } from 'remotion';

<Loop durationInFrames={60} times={3}>
  <Spinner />
</Loop>

<Loop durationInFrames={60} layout="none">
  <Anything />
</Loop>
```

### `staticFile()`

Резолвит путь к файлу из `public/`.

```tsx
import { staticFile, Img } from 'remotion';

<Img src={staticFile('logo.png')} />
```

### `<Img>`

Аналог `<img>` с гарантированным ожиданием загрузки перед рендером кадра.

### `<Audio>`

```tsx
import { Audio, staticFile } from 'remotion';

<Audio src={staticFile('music.mp3')} volume={0.5} />
<Audio
  src={staticFile('voice.wav')}
  startFrom={30}            // пропустить 30 кадров в начале
  endAt={120}               // закончить на 120 кадре
  volume={(f) => Math.min(1, f / 30)} // плавное появление
  playbackRate={1.2}
/>
```

### `<Video>` / `<OffthreadVideo>` / `<Html5Video>`

| Компонент | Пакет | Особенности |
|---|---|---|
| `<Video>` / `<Audio>` | `@remotion/media` | Mediabunny + WebCodecs, самый быстрый, кадр-в-кадр, HLS, client-side rendering |
| `<OffthreadVideo>` | `remotion` | Rust + FFmpeg, кадр-в-кадр, стабилен для серверного рендера |
| `<Html5Video>` / `<Html5Audio>` | `remotion` | HTML5-теги, **не гарантируют** кадр-в-кадр |

```tsx
import { OffthreadVideo, staticFile } from 'remotion';

<OffthreadVideo src={staticFile('clip.mp4')} startFrom={30} endAt={150} volume={0.8} />
```

Сводка по возможностям (из доков Remotion):

| | `@remotion/media` | `<OffthreadVideo>` | HTML5 |
|---|---|---|---|
| Кадр-в-кадр | ✅ | ✅ | ❌ |
| Частичная загрузка | ✅ | ❌ | только `muted` |
| Скорость рендера | самая быстрая | быстрая | средняя |
| HLS | ✅ | Chrome 142+ (preview) | только preview |
| Loopable | ✅ | ❌ | ✅ |
| `playbackRate` | ✅ | ✅ | ✅ |
| Three.js-текстура | ✅ | `useOffthreadVideoTexture()` | `useVideoTexture()` |

### Прочее

- `<IFrame>` — встраиваемый iframe.
- `<Freeze frame={...}>` — заморозка времени для детей.
- `<Artifact>` — побочный вывод из рендера (`onArtifact`).
- `<Solid>`, `<CanvasImage>`, `<Interactive>` — из `remotion`.
- `random(seed)` — детерминированный рандом.

---

## 6. Анимация

### `interpolate()`

Линейная интерполяция между ключевыми точками с опциями.

```tsx
import { interpolate } from 'remotion';

const opacity = interpolate(frame, [0, 30], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  easing: Easing.bezier(0.42, 0, 0.58, 1),
});

const color = interpolate(frame, [0, 60], ['#ff0000', '#0000ff']);
```

Параметры: `input`, `inputRange`, `outputRange`, `options.extrapolateLeft`,
`extrapolateRight`, `options.easing`. Возвращает `number` или строку/цвет.

### `spring()`

Физичная пружинная анимация.

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const scale = spring({
  frame,
  fps,
  from: 0,
  to: 1,
  config: { mass: 1, damping: 10, stiffness: 100, overshootClamping: false },
  durationInFrames: 40,
  delay: 5,
});
```

Параметры: `frame`, `fps`, `from` (0), `to` (1), `reverse`, `config` (`mass`, `damping`,
`stiffness`, `overshootClamping`), `durationInFrames`, `durationRestThreshold`, `delay`.

### `Easing`

```tsx
import { Easing } from 'remotion';

Easing.linear
Easing.ease
Easing.in(Easing.quad) / Easing.out(Easing.cubic) / Easing.inOut(Easing.sin)
Easing.bezier(x1, y1, x2, y2)
Easing.step0 / Easing.step1
Easing.bounce / Easing.elastic(1) / Easing.back(1.5) / Easing.circle / Easing.exp
Easing.spring({ damping: 200, durationRestThreshold: 0.03, allowTail: true })
```

`Easing.spring()` нормализован к прогрессу интерполяции (не требует `frame`/`fps`) и
рассчитывается, как будто длится 30 кадров. Полезен в `interpolate()`:

```tsx
const scale = interpolate(30, [0, 60], [0, 1], {
  easing: Easing.spring({ damping: 200, durationRestThreshold: 0.03 }),
});
```

---

## 7. `@remotion/player`

`<Player>` встраивает Remotion-композицию в обычное React-приложение (SPA, Next.js,
Electron-веб, Angular через обёртку). Сам плеер не требует Remotion Studio.

### Базовое использование

```tsx
import { Player } from '@remotion/player';
import { MyVideo } from './remotion/MyVideo';

export const App: React.FC = () => {
  return (
    <Player
      component={MyVideo}
      durationInFrames={120}
      compositionWidth={1920}
      compositionHeight={1080}
      fps={30}
      controls
    />
  );
};
```

### Props `<Player>`

Обязательные: `component` (или `lazyComponent`), `durationInFrames`, `fps`,
`compositionWidth`, `compositionHeight`.

Опциональные:

| Prop | Тип | По умолчанию | Описание |
|---|---|---|---|
| `inputProps` | object | `{}` | Props в рендеримый компонент |
| `loop` | boolean | `false` | Зацикливать воспроизведение |
| `autoPlay` | boolean | `false` | Автостарт |
| `controls` | boolean | `false` | Показывать seek-bar и play/pause |
| `showVolumeControls` | boolean | `true` | Показывать громкость |
| `allowFullscreen` | boolean | `true` | Разрешить fullscreen |
| `clickToPlay` | boolean | `true` при `controls` | Клик по плееру — play/pause |
| `doubleClickToFullscreen` | boolean | `false` | Двойной клик — fullscreen |
| `spaceKeyToPlayOrPause` | boolean | `true` | Space — play/pause |
| `moveToBeginningWhenEnded` | boolean | `true` | Сброс на 0 после конца |
| `initialFrame` | number | `0` | Стартовый кадр |
| `style` / `className` | CSS | — | Размеры и стили контейнера |
| `renderLoading` | fn | — | Кастомный лоадер |
| `errorFallback` | fn | — | Кастомный обработчик ошибок |
| `renderPoster` / `showPosterWhenPaused` | fn / boolean | — | Постер-кадр |
| `acknowledgeRemotionLicense` | boolean | `false` | Подтверждение лицензии (>3 человек) |
| `volume`, `playbackRate` | number | `1` | Начальные значения |

### Размер плеера

```tsx
<Player
  component={MyVideo}
  durationInFrames={120}
  compositionWidth={1920}
  compositionHeight={1080}
  fps={30}
  controls
  loop
  style={{ width: 1280, height: 720 }}
/>
```

### `PlayerRef` — императивные методы

```tsx
import { Player, type PlayerRef } from '@remotion/player';
import { useRef } from 'react';

const playerRef = useRef<PlayerRef>(null);

<Player ref={playerRef} component={MyVideo} durationInFrames={120}
  compositionWidth={1920} compositionHeight={1080} fps={30} controls />
```

Методы: `play()`, `pause()`, `toggle()`, `seekTo(frame)`, `getCurrentFrame()`,
`isPlaying()`, `mute()`, `unmute()`, `isMuted()`, `getVolume()`, `setVolume(v)`,
`getContainerNode()`, `requestFullscreen()`, `exitFullscreen()`, `requestPointerLock()`,
`getScale()`, `addEventListener()`, `removeEventListener()`.

### События

Подписка через `playerRef.current.addEventListener('play', handler)` (и обязательная
отписка в `useEffect` cleanup):

```tsx
import { type CallbackListener } from '@remotion/player';

useEffect(() => {
  const ref = playerRef.current;
  if (!ref) return;

  const onPlay: CallbackListener<'play'> = () => console.log('play');
  const onSeeked: CallbackListener<'seeked'> = (e) => console.log('seeked', e.detail.frame);
  const onTimeupdate: CallbackListener<'timeupdate'> = (e) => console.log('time', e.detail.frame);
  const onEnded: CallbackListener<'ended'> = () => console.log('ended');

  ref.addEventListener('play', onPlay);
  ref.addEventListener('seeked', onSeeked);
  ref.addEventListener('timeupdate', onTimeupdate);
  ref.addEventListener('ended', onEnded);

  return () => {
    ref.removeEventListener('play', onPlay);
    ref.removeEventListener('seeked', onSeeked);
    ref.removeEventListener('timeupdate', onTimeupdate);
    ref.removeEventListener('ended', onEnded);
  };
}, []);
```

Доступные события: `play`, `pause`, `ended`, `seeked`, `timeupdate`, `frameupdate`,
`ratechange`, `volumechange`, `mutechange`, `scalechange`, `fullscreenchange`, `error`,
`click`, `doubleclick`, `waiting`, `resume`.

Разница: `seeked` — по завершении перехода, `timeupdate` — на каждом обновлении.

### Хуки внутри Player

`useCurrentFrame()` и `useVideoConfig()` работают внутри компонента и внутри `<Player>`
без изменений. Отличия от Studio: `calculateMetadata` не вызывается, `delayRender()`/
`continueRender()` ведут себя как в браузере.

---

## 8. Рендеринг

### CLI

```bash
npx remotion studio                     # интерактивное превью
npx remotion compositions src/index.ts  # список композиций
npx remotion render src/index.ts MyVideo out/video.mp4
npx remotion still src/index.ts MyStill out/thumb.png
npx remotion bundle                     # собрать бандл
npx remotion benchmark                  # замер производительности
npx remotion versions                   # версии пакетов
```

Полезные флаги `render`: `--codec=h264|h265|vp8|vp9|prores|gif`, `--crf`, `--image-format=jpeg|png`,
`--concurrency=4|50%`, `--frames=0-99`, `--props='{"k":"v"}'`, `--scale`, `--log=verbose`.

### `renderMedia()` (server-side)

Полный цикл: бандл (`bundle()` или URL) + `selectComposition()` + `renderMedia()`.

```tsx
import { renderMedia, selectComposition } from '@remotion/renderer';

const serveUrl = '/path/to/bundle';        // или https://...
const composition = await selectComposition({
  serveUrl,
  id: 'my-video',
  inputProps: { titleText: 'Hello World' },
});

await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: '/path/to/video.mp4',     // без него → Buffer в памяти
  inputProps: { titleText: 'Hello World' },
});
```

Ключевые параметры `renderMedia`:
`serveUrl`, `composition`, `codec`, `outputLocation`, `inputProps`, `frameRange`
(кадр \| `[start, end]` \| `[start, null]` \| массив диапазонов), `concurrency`
(число \| `'50%'` \| `null`), `imageFormat`, `pixelFormat`, `audioCodec`,
`audioBitrate`, `videoBitrate`, `crf`, `muted`, `onProgress`, `onDownload`,
`onArtifact`, `metadata`, `logLevel`.

### Рендер по датасету

```tsx
import { renderMedia, selectComposition } from '@remotion/renderer';

for (const entry of data) {
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'MyComp',
    inputProps: entry,
  });

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: `out/${entry.name}.mp4`,
    inputProps: entry,
  });
}
```

### `renderStill()` и покадровый рендер

- `renderStill()` — один кадр в PNG/JPEG.
- `renderFrames()` + `stitchFramesToVideo()` — legacy-подход (рендер кадров и склейка FFmpeg).

### `bundle()` и `getCompositions()`

```tsx
import { bundle } from '@remotion/bundler';
import { getCompositions } from '@remotion/renderer';

const bundleLocation = await bundle(require.resolve('./src/index.ts'));
const comps = await getCompositions(bundleLocation, { inputProps: { custom: 'data' } });
const composition = comps.find((c) => c.id === 'HelloWorld');
```

---

## 9. Динамические props и Zod-схемы

Схема валидирует `inputProps` в Studio и даёт типобезопасность.

```tsx
import { z } from 'zod';
import { Composition } from 'remotion';
import { zColor } from '@remotion/zod-types';

export const myCompSchema = z.object({
  titleText: z.string(),
  titleColor: zColor(),
});

export const MyComp: React.FC<z.infer<typeof myCompSchema>> = ({ titleText, titleColor }) => (
  <h1 style={{ color: titleColor }}>{titleText}</h1>
);

<Composition
  id="MyComp"
  component={MyComp}
  schema={myCompSchema}
  defaultProps={{ titleText: 'Hello', titleColor: '#ffffff' }}
  durationInFrames={150}
  fps={30}
  width={1920}
  height={1080}
/>
```

---

## 10. Best practices

- **Детерминизм:** вся анимация — функция от `useCurrentFrame()`; используйте
  `random(seed)` вместо `Math.random()`, не полагайтесь на системное время.
- **`AbsoluteFill`/`Sequence`/`Series`** для композиции сцен; не считайте оффсеты вручную.
- **`calculateMetadata`** для динамической длительности/размеров (например, под длину аудио).
- **`@remotion/media` `<Video>`/`<Audio>`** — быстрее и кадр-в-кадр; `<OffthreadVideo>`
  — надёжный серверный вариант; избегайте HTML5-тегов, если нужна точность кадра.
- **`staticFile()`** для ассетов из `public/`; для внешних — CORS.
- **`premountFor`** в `<Sequence>` и `@remotion/media`: подгрузка ассетов заранее, меньше
  дрожания при скролле таймлайна.
- **Конкурентность** рендера: `concurrency: '50%'` или число процессов; для CI — `null`.
- **Кэш рендера:** `@remotion/media` кэширует кадры; для тяжёлых сцен — `useMemo`.
- **`<Player>`** — только для превью; финальный вывод делайте через `@remotion/renderer`.

---

## 11. Лицензия

Remotion бесплатен для личного использования и небольших команд. Для компаний с **более
чем 3 сотрудниками** требуется коммерческая лицензия. При использовании `@remotion/player`
в продукте может понадобиться проп `acknowledgeRemotionLicense`.

Официальная документация: https://www.remotion.dev/docs
