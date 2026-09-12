export * from './model/types'
export * from './model/store'
export * from './model/useScenarioEngineStore'
export * from './model/useModelCatalog'
export * from './lib/astAdapter'
export * from './lib/parseMarkdown'

// Project-domain helpers (public API of the slice).
export {
  API,
  getProjectPath,
  getAudioPathForScene,
  sanitizeFilename,
  hashCode,
  formatTimecode,
  formatShortTimecode,
  pad,
  parseTcString,
  concatSceneAudio,
  generateDefaultSceneTsx,
  isAudioDirty,
  extractCleanVoiceText,
  getSceneTeleprompterScript,
  getProjectTeleprompterScript,
  getWhisperSyncedDuration,
  getSceneDurationFromTimecode,
  getVisualNoteDuration,
} from './lib/helpers'
export type { TeleprompterOptions } from './lib/helpers'
export {
  normalizeText,
  fixOverlappingTimings,
  recalculateTimingsProportionally,
  applyBRollWithRipple,
  recalculateProjectTimecodes,
} from './lib/timingAlgorithms'
export { resolveBRollVideoSrc } from './lib/bRollSrc'
