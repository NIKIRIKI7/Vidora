/**
 * openapi-fetch/fetch бросает DOMException с name 'AbortError' при отмене через
 * AbortSignal. Проверяем его (и легаси CanceledError), чтобы отмена не
 * показывалась пользователю как ошибка.
 */
export const isRequestCanceled = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'AbortError' || error.name === 'CanceledError')
