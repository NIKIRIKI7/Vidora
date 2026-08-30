import { API } from '@shared/lib'

export type WidgetCategory = 'core' | 'social' | 'tech' | 'metrics' | 'narrative' | 'layout' | 'custom'

export type PropType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'object' | 'enum'

export type PropValue = string | number | boolean | null | PropValue[] | { [key: string]: PropValue }

export interface WidgetPropDefinition {
  name: string
  type: PropType
  required: boolean
  default?: PropValue
  description: string
  enum_values?: string[]
}

export interface WidgetMetadata {
  id: string
  name: string
  category: WidgetCategory
  description: string
  import_path: string
  is_custom: boolean
  props: WidgetPropDefinition[]
  default_props: Record<string, PropValue>
  tsx_code?: string
  example_snippet: string
  tags: string[]
}

export interface CustomWidgetCreatePayload {
  id: string
  name: string
  category: WidgetCategory
  description: string
  props: WidgetPropDefinition[]
  default_props: Record<string, PropValue>
  tsx_code: string
  example_snippet: string
  tags: string[]
}

export interface WidgetPackageExport {
  vidora_schema_version: string
  exported_at: string
  generator: string
  widgets: WidgetMetadata[]
}

export interface WidgetPackageImportResponse {
  status: string
  imported_count: number
  imported_ids: string[]
  skipped_ids: string[]
  errors: string[]
}

const API_BASE = `${API}/api/v1/code/widgets`

export const widgetsApi = {
  async getAll(category?: string): Promise<WidgetMetadata[]> {
    const url = category ? `${API_BASE}?category=${category}` : API_BASE
    const res = await fetch(url)
    if (!res.ok) throw new Error('Ошибка загрузки виджетов')
    const data = await res.json()
    return data.widgets
  },

  async getById(id: string): Promise<WidgetMetadata> {
    const res = await fetch(`${API_BASE}/${id}`)
    if (!res.ok) throw new Error(`Виджет ${id} не найден`)
    const data = await res.json()
    return data.widget
  },

  async create(widget: CustomWidgetCreatePayload): Promise<WidgetMetadata> {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(widget),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Не удалось создать виджет')
    }
    const data = await res.json()
    return data.widget
  },

  async update(id: string, updates: Partial<WidgetMetadata>): Promise<WidgetMetadata> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Ошибка обновления виджета')
    }
    const data = await res.json()
    return data.widget
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Ошибка удаления виджета')
    }
  },

  async exportPackage(ids?: string[]): Promise<WidgetPackageExport> {
    const url = ids && ids.length > 0 ? `${API_BASE}/export?ids=${ids.join(',')}` : `${API_BASE}/export`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Ошибка экспорта пакета виджетов')
    return await res.json()
  },

  async importPackage(packageJson: Record<string, unknown>, overwrite = true): Promise<WidgetPackageImportResponse> {
    const res = await fetch(`${API_BASE}/import?overwrite=${overwrite}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(packageJson),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Ошибка импорта пакета виджетов')
    }
    return await res.json()
  },
}
