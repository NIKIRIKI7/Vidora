import { createDefaultRemotionSuite } from '@web-react-player/remotion'
import { API } from './helpers'

export const remotionSuite = createDefaultRemotionSuite()

export const assetResolver = (assetPath: string) => {
  if (/^(https?:\/\/|data:|blob:)/.test(assetPath)) return assetPath
  return `${API}/api/v1/render/media?path=${encodeURIComponent(assetPath)}`
}
