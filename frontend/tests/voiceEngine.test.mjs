import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { resolveCleanVoiceEngine } from '../src/shared/lib/voiceEngine.ts'

describe('resolveCleanVoiceEngine', () => {
  it('maps designed-voice prefixes to LocalTts regardless of rawEngine', () => {
    assert.equal(resolveCleanVoiceEngine('des_10053f46e4b5', 'minimax/speech-2.8-hd'), 'LocalTts')
    assert.equal(resolveCleanVoiceEngine('des_10053f46e4b5', 'CloudMiniMax'), 'LocalTts')
    assert.equal(resolveCleanVoiceEngine('des_10053f46e4b5', null), 'LocalTts')
  })

  it('maps local clone prefixes to LocalTts', () => {
    assert.equal(resolveCleanVoiceEngine('clone_local_abc123', 'minimax'), 'LocalTts')
    assert.equal(resolveCleanVoiceEngine('local_tts_xyz', null), 'LocalTts')
  })

  it('maps minimax clone and builtin ids to CloudMiniMax', () => {
    assert.equal(resolveCleanVoiceEngine('clone_mm_abc123', null), 'CloudMiniMax')
    assert.equal(resolveCleanVoiceEngine('male-qn-qingse', null), 'CloudMiniMax')
    assert.equal(resolveCleanVoiceEngine('qingse', null), 'CloudMiniMax')
  })

  it('maps openai builtin ids to CloudOpenAi', () => {
    assert.equal(resolveCleanVoiceEngine('alloy', 'tts-1'), 'CloudOpenAi')
    assert.equal(resolveCleanVoiceEngine('echo', null), 'CloudOpenAi')
    assert.equal(resolveCleanVoiceEngine('shimmer', null), 'CloudOpenAi')
  })

  it('reads provider prefixes from the raw engine string', () => {
    assert.equal(resolveCleanVoiceEngine('custom_1', 'minimax/speech-2.8-hd'), 'CloudMiniMax')
    assert.equal(resolveCleanVoiceEngine('custom_2', 'openai/tts-1-hd'), 'CloudOpenAi')
  })

  it('falls back to LocalTts for unknown speakers and engines', () => {
    assert.equal(resolveCleanVoiceEngine(null, null), 'LocalTts')
    assert.equal(resolveCleanVoiceEngine('', ''), 'LocalTts')
    assert.equal(resolveCleanVoiceEngine('something_odd', 'mystery'), 'LocalTts')
  })
})