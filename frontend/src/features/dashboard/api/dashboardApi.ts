import { fetchClient, apiErrorMessage } from '@shared/api'
import type { HardwareInfo } from '../model/types'

export const dashboardApi = {
  async getHardwareInfo(): Promise<HardwareInfo> {
    try {
      const { data, error } = await fetchClient.GET('/api/v1/system/hardware')
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      return data as unknown as HardwareInfo
    } catch (err) {
      console.error('dashboardApi.getHardwareInfo:', err)
      return { vram_gb: 0, ram_gb: 16, device: 'CPU Mode', gpu_type: 'cpu' }
    }
  },
}
