import createFetchClient from 'openapi-fetch'
import createQueryClient from 'openapi-react-query'
import { API } from '@shared/lib'
import type { paths } from './schema'

export const fetchClient = createFetchClient<paths>({ baseUrl: API })

export const $api = createQueryClient(fetchClient)

const ERROR_KEYS = ['detail', 'message', 'error'] as const

/**
 * Рекурсивно ищет первую непустую строку внутри вложенного объекта.
 * Порядок обхода — как есть (Object.values сохраняет порядок ключей).
 * Нужно для разбора `details: { minimax_key: ["..."] }`.
 */
const extractNestedMessage = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractNestedMessage(item)
      if (nested) return nested
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = extractNestedMessage(nested)
      if (found) return found
    }
  }
  return null
}

/**
 * openapi-fetch не бросает исключение на non-2xx, а возвращает `error`.
 * Возвращаем человекочитаемое сообщение, чтобы вызывающий код мог бросить
 * его и сохранить прежнюю (axios) обработку ошибок в try/catch.
 *
 * `details` проверяется раньше `detail`: middleware отдаёт в `detail`
 * обобщённый текст вроде «Ошибка валидации данных», тогда как конкретика
 * («OpenAI API-ключ не задан…») лежит в details.minimax_key[0].
 */
export const apiErrorMessage = (error: unknown, fallback = 'Ошибка запроса'): string => {
  if (typeof error === 'string' && error.trim()) return error

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>

    // 1. details → самое специфичное (например, "minimax_key": ["..."]).
    if (record.details) {
      const detailed = extractNestedMessage(record.details)
      if (detailed) return detailed
    }

    // 2. detail / message / error.
    for (const key of ERROR_KEYS) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }

  return fallback
}
