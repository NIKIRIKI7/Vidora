import createFetchClient from 'openapi-fetch'
import createQueryClient from 'openapi-react-query'
import { API } from '@shared/lib'
import type { paths } from './schema'

export const fetchClient = createFetchClient<paths>({ baseUrl: API })

export const $api = createQueryClient(fetchClient)

const ERROR_KEYS = ['detail', 'message', 'error'] as const

/**
 * openapi-fetch не бросает исключение на non-2xx, а возвращает `error`.
 * Возвращаем человекочитаемое сообщение, чтобы вызывающий код мог бросить
 * его и сохранить прежнюю (axios) обработку ошибок в try/catch.
 */
export const apiErrorMessage = (error: unknown, fallback = 'Ошибка запроса'): string => {
  if (typeof error === 'string' && error.trim().length > 0) return error
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    for (const key of ERROR_KEYS) {
      const value = record[key]
      if (typeof value === 'string' && value.trim().length > 0) return value
    }
  }
  return fallback
}
