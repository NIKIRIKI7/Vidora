import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { buildAudioMix, mergeIntervals } from '../src/features/render-project/model/audioMix.ts'

const FPS = 30
const resolve = (path) => `http://api/render?path=${path}`
const projectPath = 'demo'

/** Сцена озвучена одним общим файлом — так выглядит результат любого audioMode. */
const sceneWithVoice = (id, file, { audioOffset = 0, fragments = 3 } = {}) => ({
  id,
  title: `Scene ${id}`,
  timecode: '00:00:00.000',
  audioOffset,
  remotionCode: 'const C = () => null',
  fragments: Array.from({ length: fragments }, (_, i) => ({
    id: `${id}-f${i}`,
    visualNote: '',
    text: `текст ${i}`,
    startTime: i,
    endTime: i + 1,
    audioFileName: file,
  })),
})

describe('scene voice planning', () => {
  it('treats one shared file per scene as a single track spanning the scene', () => {
    const mix = buildAudioMix({
      scenes: [sceneWithVoice('a', 'demo/assets/voice/all.wav', { fragments: 3 })],
      sceneFrames: [90],
      fps: FPS,
      projectPath,
      resolve,
    })

    assert.equal(mix.voice.length, 1)
    // Один файл на сцену: никаких дублей и никаких отступов по таймкодам фрагментов.
    assert.equal(mix.voice[0].length, 1)
    assert.equal(mix.voice[0][0].src, 'http://api/render?path=demo/assets/voice/all.wav')
    assert.equal(mix.voice[0][0].trimBefore, 0)
    assert.equal(mix.voice[0][0].durationInFrames, 90)
    assert.deepEqual(mix.speech, [{ startFrame: 0, endFrame: 90 }])
  })

  it('uses audioOffset to seek into the shared project file', () => {
    const mix = buildAudioMix({
      scenes: [sceneWithVoice('b', 'demo/assets/voice/all.wav', { audioOffset: 12.5 })],
      sceneFrames: [60],
      fps: FPS,
      projectPath,
      resolve,
    })

    assert.equal(mix.voice[0][0].trimBefore, 375)
    // Речь начинается с начала сцены в таймлайне: смещение уже несёт таймкод сцены.
    assert.deepEqual(mix.speech, [{ startFrame: 0, endFrame: 60 }])
  })

  it('shifts speech intervals by preceding scene durations and merges touching ones', () => {
    const mix = buildAudioMix({
      scenes: [
        sceneWithVoice('a', 'demo/assets/voice/all.wav'),
        sceneWithVoice('b', 'demo/assets/voice/all.wav', { audioOffset: 3 }),
      ],
      sceneFrames: [90, 45],
      fps: FPS,
      projectPath,
      resolve,
    })

    // Сцены идут подряд, поэтому интервалы смыкаются и схлопываются в один —
    // иначе ducking на стыке считал бы вложенные интервалы дважды.
    assert.deepEqual(mix.speech, [{ startFrame: 0, endFrame: 135 }])
    assert.equal(mix.voice[1][0].trimBefore, 90)
  })

  it('emits no track for a scene without voice instead of a guessed path', () => {
    const scene = { ...sceneWithVoice('c', 'x.wav') }
    scene.fragments = scene.fragments.map((f) => ({ ...f, audioFileName: undefined }))

    const mix = buildAudioMix({
      scenes: [scene],
      sceneFrames: [90],
      fps: FPS,
      projectPath,
      resolve,
    })

    assert.deepEqual(mix.voice[0], [])
    assert.deepEqual(mix.speech, [])
  })

  it('prefixes bare filenames with the project voice folder', () => {
    const mix = buildAudioMix({
      scenes: [sceneWithVoice('d', 'Scene_d.wav')],
      sceneFrames: [30],
      fps: FPS,
      projectPath,
      resolve,
    })

    assert.equal(mix.voice[0][0].src, 'http://api/render?path=demo/assets/voice/Scene_d.wav')
  })

  it('falls back to per-fragment timing when files were not concatenated', () => {
    const scene = {
      ...sceneWithVoice('e', 'a.wav', { fragments: 2 }),
      fragments: [
        { id: 'e1', visualNote: '', text: 'a', startTime: 0, endTime: 2, audioFileName: 'demo/a.wav' },
        { id: 'e2', visualNote: '', text: 'b', startTime: 2, endTime: 5, audioFileName: 'demo/b.wav' },
      ],
    }

    const mix = buildAudioMix({ scenes: [scene], sceneFrames: [150], fps: FPS, projectPath, resolve })

    assert.equal(mix.voice[0].length, 2)
    assert.deepEqual(
      mix.voice[0].map((t) => [t.trimBefore, t.durationInFrames]),
      [
        [0, 60],
        [60, 90],
      ]
    )
  })
})

describe('music and ducking', () => {
  const music = (over = {}) => ({
    enabled: true,
    customTrackPath: 'demo/assets/music/bg.wav',
    baseVolume: 0.4,
    duckedVolume: 0.1,
    attackMs: 100,
    releaseMs: 200,
    holdMs: 50,
    fadeInSec: 0,
    fadeOutSec: 0,
    loop: true,
    ...over,
  })

  /** Сцена без озвучки: нужна, чтобы в ролике были кадры без речи. */
  const silentScene = () => ({
    id: 'silent',
    title: 'Silent',
    timecode: '00:00:00.000',
    remotionCode: 'const C = () => null',
    fragments: [{ id: 's-f0', visualNote: '', text: '', startTime: 0, endTime: 1 }],
  })

  /** Речь начинается со второго отрезка: видно и attack, и базовую громкость. */
  const silentThenVoice = (backgroundMusic) =>
    buildAudioMix({
      scenes: [silentScene(), sceneWithVoice('a', 'demo/voice.wav')],
      sceneFrames: [90, 90],
      fps: FPS,
      backgroundMusic,
      projectPath,
      resolve,
    })

  it('skips music when disabled or without a track', () => {
    const scenes = [sceneWithVoice('a', 'demo/voice.wav')]
    const base = { scenes, sceneFrames: [300], fps: FPS, projectPath, resolve }

    assert.equal(buildAudioMix({ ...base, backgroundMusic: music({ enabled: false }) }).music, null)
    assert.equal(
      buildAudioMix({ ...base, backgroundMusic: music({ customTrackPath: '  ' }) }).music,
      null
    )
    assert.equal(buildAudioMix(base).music, null)
  })

  it('returns base volume outside speech and ducked volume under voice', () => {
    const volumeAt = silentThenVoice(music()).music.volumeAt

    assert.deepEqual(silentThenVoice(music()).speech, [{ startFrame: 90, endFrame: 180 }])
    assert.equal(volumeAt(0), 0.4)
    assert.equal(volumeAt(120), 0.1)
  })

  it('ramps down over attackMs before the voice starts', () => {
    const volumeAt = silentThenVoice(music()).music.volumeAt

    // Речь начинается на кадре 90, attack = 100мс = 3 кадра.
    assert.equal(volumeAt(86), 0.4)
    assert.ok(volumeAt(89) < 0.4 && volumeAt(89) > 0.1)
    assert.equal(volumeAt(90), 0.1)
  })

  it('holds the duck through the voice and releases afterwards', () => {
    const volumeAt = silentThenVoice(music()).music.volumeAt

    assert.equal(volumeAt(179), 0.1)
    // Речь кончилась на кадре 180: hold 50мс, затем release 200мс.
    assert.ok(volumeAt(184) > 0.1 && volumeAt(184) < 0.4)
    assert.equal(volumeAt(188), 0.4)
  })

  it('applies fade-in and fade-out at the edges of the video', () => {
    const mix = buildAudioMix({
      scenes: [silentScene()],
      sceneFrames: [180],
      fps: FPS,
      backgroundMusic: music({ fadeInSec: 1, fadeOutSec: 1 }),
      projectPath,
      resolve,
    })

    const volumeAt = mix.music.volumeAt
    assert.equal(volumeAt(0), 0)
    assert.equal(volumeAt(90), 0.4)
    assert.ok(volumeAt(179) < 0.05 && volumeAt(179) > 0)
  })

  it('never ducks below the configured ducked volume', () => {
    const mix = buildAudioMix({
      scenes: [sceneWithVoice('a', 'demo/voice.wav')],
      sceneFrames: [300],
      fps: FPS,
      backgroundMusic: music({ baseVolume: 0.1, duckedVolume: 0.4 }),
      projectPath,
      resolve,
    })

    // duckedVolume выше base: музыка не должна усиливаться под голосом.
    assert.equal(mix.music.volumeAt(150), 0.1)
  })

  it('resolves the music path through the asset resolver', () => {
    const mix = silentThenVoice(music())

    assert.equal(mix.music.src, 'http://api/render?path=demo/assets/music/bg.wav')
    assert.equal(mix.music.loop, true)
  })
})

describe('mergeIntervals', () => {
  it('merges overlapping and touching intervals', () => {
    assert.deepEqual(
      mergeIntervals([
        { startFrame: 10, endFrame: 20 },
        { startFrame: 0, endFrame: 12 },
        { startFrame: 30, endFrame: 40 },
        { startFrame: 20, endFrame: 25 },
      ]),
      [
        { startFrame: 0, endFrame: 25 },
        { startFrame: 30, endFrame: 40 },
      ]
    )
  })

  it('drops empty intervals', () => {
    assert.deepEqual(mergeIntervals([{ startFrame: 5, endFrame: 5 }]), [])
  })
})