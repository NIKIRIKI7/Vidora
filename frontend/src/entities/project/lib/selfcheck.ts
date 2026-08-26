import { extractBRollFromVisualNote, toStaticFilePath, parseMarkdownFull, serializeProjectToMarkdown } from './parseMarkdown.ts'
import type { ProjectSettings } from '../model/types'

let failed = 0
const check = (name: string, cond: boolean) => {
  console.log(cond ? 'PASS' : 'FAIL', name)
  if (!cond) failed++
}

// extractBRollFromVisualNote
const e1 = extractBRollFromVisualNote('B-roll: assets/b-roll/intro_cyberpunk.mp4')
check('remark: B-roll path', e1.bRollPath === 'assets/b-roll/intro_cyberpunk.mp4' && e1.cleanNote === 'B-roll')

const e2 = extractBRollFromVisualNote('B-roll: assets/b-roll/harness_diagram.webm | Схема архитектуры')
check('remark: path | desc', e2.bRollPath === 'assets/b-roll/harness_diagram.webm' && e2.cleanNote === 'Схема архитектуры')

const e3 = extractBRollFromVisualNote('Схема архитектуры -> assets/b-roll/harness_diagram.webm')
check('remark: desc -> path', e3.bRollPath === 'assets/b-roll/harness_diagram.webm' && e3.cleanNote === 'Схема архитектуры')

const e4 = extractBRollFromVisualNote('[График цен](assets/b-roll/prices_chart.mp4)')
check('remark: md-link', e4.bRollPath === 'assets/b-roll/prices_chart.mp4' && e4.cleanNote === 'График цен')

const e5 = extractBRollFromVisualNote('B-roll: unknown_tool_bug.mp4')
check('remark: short name', e5.bRollPath === 'unknown_tool_bug.mp4')

const e6 = extractBRollFromVisualNote('Крупный план: счетчик звёзд')
check('remark: no path', e6.bRollPath === undefined)

const e7 = extractBRollFromVisualNote('B-roll: C:\\Videos\\Footage\\deepseek_demo.mp4')
check('remark: windows abs', e7.bRollPath === 'C:\\Videos\\Footage\\deepseek_demo.mp4')

const e8 = extractBRollFromVisualNote('B-roll: /Users/alex/Movies/broll_terminal.webm | Запуск в терминале')
check('remark: unix abs + desc', e8.bRollPath === '/Users/alex/Movies/broll_terminal.webm' && e8.cleanNote === 'Запуск в терминале')

const e9 = extractBRollFromVisualNote('B-roll: https://assets.mixkit.co/videos/preview/mixkit-code-animation-1080p.mp4')
check('remark: url', e9.bRollPath === 'https://assets.mixkit.co/videos/preview/mixkit-code-animation-1080p.mp4')

const e10 = extractBRollFromVisualNote('B-roll: C:\\Users\\mcniki\\Downloads\\02_harness_diagram.webm')
check('remark: full windows path', e10.bRollPath === 'C:\\Users\\mcniki\\Downloads\\02_harness_diagram.webm')

const e11 = extractBRollFromVisualNote('B-roll: C:\\Мои Видео\\DeepSeek 2026\\02_harness_diagram.webm')
check('remark: windows path with spaces', e11.bRollPath === 'C:\\Мои Видео\\DeepSeek 2026\\02_harness_diagram.webm')

const e12 = extractBRollFromVisualNote('Схема ядра -> D:/Footage/deepseek/03_install_terminal.webm')
check('remark: arrow + full path', e12.bRollPath === 'D:/Footage/deepseek/03_install_terminal.webm' && e12.cleanNote === 'Схема ядра')

const e13 = extractBRollFromVisualNote('B-roll: /Users/mcniki/Movies/02_harness_diagram.webm | Запуск')
check('remark: unix abs + desc', e13.bRollPath === '/Users/mcniki/Movies/02_harness_diagram.webm' && e13.cleanNote === 'Запуск')

const e14 = extractBRollFromVisualNote('B-roll: C:\\Videos\\Мой клип 2026.mp4 | Описание кадра')
check('remark: path with spaces + desc', e14.bRollPath === 'C:\\Videos\\Мой клип 2026.mp4' && e14.cleanNote === 'Описание кадра')

const e15 = extractBRollFromVisualNote('C:\\Footage\\clip.mp4')
check('remark: whole note is abs path', e15.bRollPath === 'C:\\Footage\\clip.mp4')

// toStaticFilePath
check('static: assets/', toStaticFilePath('assets/b-roll/x.mp4') === 'assets/b-roll/x.mp4')
check('static: public/', toStaticFilePath('public/02.webm') === 'assets/02.webm')
check('static: bare', toStaticFilePath('02.webm') === 'assets/b-roll/02.webm')
check('static: subdir', toStaticFilePath('b-roll-raw/02.webm') === 'assets/b-roll-raw/02.webm')

// parse + serialize round-trip
const md = `---
title: "Test"
---
[Scene 1] (00:00:00)
*(B-roll: assets/b-roll/clip.mp4)* Первый кадр.

*(Схема)* Второй кадр.

*(Третий кадр)*

<!-- b-roll: assets/b-roll/comment.mp4 фрагмент 3 -->
`
const parsed = parseMarkdownFull(md)
const frags = parsed.scenes?.[0]?.fragments ?? []
check('parse: remark b-roll', frags[0]?.bRollFileName === 'assets/b-roll/clip.mp4')
check('parse: no path remark', frags[1]?.bRollFileName === undefined)
check('parse: comment b-roll to frag 3', frags[2]?.bRollFileName === 'assets/b-roll/comment.mp4')
check('parse: comment not in text', !(frags[2]?.text ?? '').includes('b-roll'))

const serialized = serializeProjectToMarkdown(parsed as unknown as ProjectSettings)
const reFrags = parseMarkdownFull(serialized).scenes?.[0]?.fragments ?? []
check('roundtrip: remark path kept', reFrags[0]?.bRollFileName === 'assets/b-roll/clip.mp4')
check('roundtrip: comment path kept', reFrags[2]?.bRollFileName === 'assets/b-roll/comment.mp4')
check('roundtrip: text kept', (reFrags[0]?.text ?? '').includes('Первый кадр'))

if (failed) {
  throw new Error(`${failed} check(s) failed`)
}
console.log('OK')
