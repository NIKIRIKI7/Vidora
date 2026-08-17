// Само-проверка чистой логики инсертера тегов:
//   node frontend/src/shared/ui/voice-tag-toolbar/selfcheck.ts
import assert from 'node:assert/strict'
import { padPauseTag, findWordRange } from './useVoiceTagInserter.ts'

// Пауза впритык к слову с обеих сторон -> пробелы
assert.equal(padPauseTag('<#1.0#>', 'Приветмир', 6), ' <#1.0#> ')
// Справа уже пробел -> пробел только слева
assert.equal(padPauseTag('<#1.0#>', 'Привет мир', 6), ' <#1.0#>')
// Пауза после пробела -> без левого пробела
assert.equal(padPauseTag('<#1.0#>', 'мир', 0), '<#1.0#> ')
// Всё ещё впритык справа -> правый пробел добавляется любому тегу
assert.equal(padPauseTag('(sighs)', 'мир', 0), '(sighs) ')
// Курсор внутри слова (кириллица) -> всё слово
const s = 'Привет хорошО мир'
const [s0, e0] = findWordRange(s, 8)
assert.equal(s.slice(s0, e0), 'хорошО')
// Курсор на пробеле между словами -> слово справа
const [s1, e1] = findWordRange('два слова', 3)
assert.equal('два слова'.slice(s1, e1), 'слова')
// Курсор в начале слова -> это слово
const [s2, e2] = findWordRange('два слова', 0)
assert.equal('два слова'.slice(s2, e2), 'два')
// Курсор в конце строки после слова -> слово слева
const [s3, e3] = findWordRange('конец', 5)
assert.equal('конец'.slice(s3, e3), 'конец')

console.log('voice-tag-inserter selfcheck OK')
