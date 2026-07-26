export interface FragmentTiming {
  id: string
  startTime: number
  endTime: number
}

export interface RenderPayload {
  task_id?: string
  progress: number
  status: 'rendering' | 'done' | 'error'
  target_id?: string
  target?: string
  output_path?: string
  error?: string
}

export type CenterViewMode = 'player' | 'code' | 'split' | 'markdown'
