import { useState, useEffect, useMemo, useCallback } from 'react'
import { API } from '@shared/lib'

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
      const url = role
        ? `${API}/api/v1/system/models/catalog?role=${encodeURIComponent(role)}`
        : `${API}/api/v1/system/models/catalog`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ModelCatalogEntry[] = await res.json()
      setModels(data)
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