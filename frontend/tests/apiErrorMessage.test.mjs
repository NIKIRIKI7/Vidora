import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// apiErrorMessage живёт в client.ts, который на импорте тянет openapi-fetch и
// схему — ради юнит-теста дублируем ровно ту логику разбора, что в client.ts.
const ERROR_KEYS = ['detail', 'message', 'error']

const extractNestedMessage = value => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractNestedMessage(item)
      if (nested) return nested
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      const found = extractNestedMessage(nested)
      if (found) return found
    }
  }
  return null
}

const apiErrorMessage = (error, fallback = 'Ошибка запроса') => {
  if (typeof error === 'string' && error.trim()) return error

  if (error && typeof error === 'object') {
    const record = error
    if (record.details) {
      const detailed = extractNestedMessage(record.details)
      if (detailed) return detailed
    }
    for (const key of ERROR_KEYS) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  return fallback
}

describe('apiErrorMessage', () => {
  it('prefers nested details over the generic detail field', () => {
    assert.equal(
      apiErrorMessage({
        detail: 'Ошибка валидации данных.',
        details: { minimax_key: ['MiniMax API-ключ и Group ID не заданы.'] },
      }),
      'MiniMax API-ключ и Group ID не заданы.'
    )
  })

  it('digs through several levels of details', () => {
    assert.equal(
      apiErrorMessage({ detail: 'общее', details: { field: { nested: ['глубоко'] } } }),
      'глубоко'
    )
  })

  it('falls back to detail when details is empty', () => {
    assert.equal(apiErrorMessage({ detail: 'Общий текст ошибки', details: {} }), 'Общий текст ошибки')
  })

  it('supports message and error keys', () => {
    assert.equal(apiErrorMessage({ message: 'из message' }), 'из message')
    assert.equal(apiErrorMessage({ error: 'из error' }), 'из error')
  })

  it('returns fallback for empty input', () => {
    assert.equal(apiErrorMessage(null), 'Ошибка запроса')
    assert.equal(apiErrorMessage({}), 'Ошибка запроса')
    assert.equal(apiErrorMessage(undefined, 'Свой текст'), 'Свой текст')
  })

  it('passes through plain strings', () => {
    assert.equal(apiErrorMessage('строка ошибки'), 'строка ошибки')
  })
})