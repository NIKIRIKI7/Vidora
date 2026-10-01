import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { rewriteRemotionMediaImports } from '../src/shared/lib/remotionMediaImports.ts'

describe('rewriteRemotionMediaImports', () => {
  it('переносит Audio из remotion в @remotion/media', () => {
    const code = `import { AbsoluteFill, Audio } from 'remotion';\nconst C = () => <AbsoluteFill />`
    const out = rewriteRemotionMediaImports(code)
    assert.match(out, /import \{ Audio \} from '@remotion\/media';/)
    assert.match(out, /import \{ AbsoluteFill \} from 'remotion';/)
    assert.doesNotMatch(out, /Audio[^}]*from 'remotion'/)
  })

  it('переносит Video из remotion в @remotion/media', () => {
    const code = `import { Video } from 'remotion';\nconst C = () => <Video src="x" />`
    const out = rewriteRemotionMediaImports(code)
    assert.match(out, /import \{ Video \} from '@remotion\/media';/)
  })

  it('переименовывает OffthreadVideo в Video и оставляет staticFile в remotion', () => {
    const code = [
      "import { OffthreadVideo, staticFile } from 'remotion';",
      'const C = () => <OffthreadVideo src={staticFile("a.mp4")} />',
    ].join('\n')
    const out = rewriteRemotionMediaImports(code)
    assert.match(out, /import \{ Video \} from '@remotion\/media';/)
    assert.match(out, /import \{ staticFile \} from 'remotion';/)
    assert.match(out, /<Video src=\{staticFile\("a\.mp4"\)\} \/>/)
    assert.doesNotMatch(out, /OffthreadVideo/)
  })

  it('дедуплицирует Video и OffthreadVideo в один импорт', () => {
    const code = [
      "import { Video, OffthreadVideo, Sequence } from 'remotion';",
      'export const C = () => <><Sequence /><Video /><OffthreadVideo /></>',
    ].join('\n')
    const out = rewriteRemotionMediaImports(code)
    assert.match(out, /import \{ Video \} from '@remotion\/media';/)
    assert.match(out, /import \{ Sequence \} from 'remotion';/)
    assert.equal((out.match(/from '@remotion\/media'/g) || []).length, 1)
    assert.equal((out.match(/\bVideo\b/g) || []).length, 3)
  })

  it('не трогает код без медиа-импортов из remotion', () => {
    const code = "import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';\nexport const C = () => null"
    assert.equal(rewriteRemotionMediaImports(code), code)
  })

  it('не трогает уже корректный импорт из @remotion/media', () => {
    const code = "import { Audio, Video } from '@remotion/media';\nexport const C = () => null"
    assert.equal(rewriteRemotionMediaImports(code), code)
  })

  it('поддерживает двойные кавычки и точку с запятой', () => {
    const code = 'import { Audio } from "remotion";\nexport const C = () => <Audio src="x" />'
    const out = rewriteRemotionMediaImports(code)
    assert.match(out, /import \{ Audio \} from '@remotion\/media';/)
  })

  it('переносит несколько remotion-импортов независимо', () => {
    const code = [
      "import { Audio } from 'remotion';",
      "import { OffthreadVideo } from 'remotion';",
    ].join('\n')
    const out = rewriteRemotionMediaImports(code)
    assert.match(out, /import \{ Audio, Video \} from '@remotion\/media';/)
  })
})
