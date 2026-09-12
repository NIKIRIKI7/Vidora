import { fetchClient, apiErrorMessage } from '@shared/api'
import { useState, useEffect, useMemo, useCallback } from 'react'

export type ModelTaskRole =
  | 'ScenarioDrafting'
  | 'SceneCodeGeneration'
  | 'BRollMatching'
  | 'TtsVoice'
  | 'SttAlignment'

export interface ModelCatalogEntry {
  id: string
  name: string
  provider: string
  mode: 'local' | 'cloud'
  roles: ModelTaskRole[]
  is_available: boolean
  status_details?: string | null
}

export function useModelCatalog(role?: ModelTaskRole) {
  const [models, setModels] = useState<ModelCatalogEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCatalog = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await fetchClient.GET('/api/v1/system/models/catalog', {
        params: { query: { role } },
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      const catalog = data as unknown as ModelCatalogEntry[]
      setModels(catalog)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить каталог моделей')
    } finally {
      setIsLoading(false)
    }
  }, [role])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchCatalog()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchCatalog])

  const localModels = useMemo(() => models.filter((m) => m.mode === 'local'), [models])
  const cloudModels = useMemo(() => models.filter((m) => m.mode === 'cloud'), [models])

  return {
    models,
    localModels,
    cloudModels,
    isLoading,
    error,
    refresh: fetchCatalog,
  }
}