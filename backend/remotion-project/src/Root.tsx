import React from 'react'
import { Composition } from 'remotion'
import * as CurrentSceneModule from './scenes/current'
import * as LucideDemoModule from './scenes/lucideDemo'

const SceneComponent: React.FC = (props) => {
  const Component =
    (CurrentSceneModule as any).default ||
    (CurrentSceneModule as any).Scene ||
    Object.values(CurrentSceneModule).find((v) => typeof v === 'function') ||
    (() => null)

  return <Component {...props} />
}

const getConfig = () => {
  const config = (CurrentSceneModule as any).compositionConfig || {}
  const fps = Number(config.fps) || 30
  const width = Number(config.width) || 1920
  const height = Number(config.height) || 1080
  const durationInSeconds = Number(config.durationInSeconds) || 5
  const durationInFrames =
    Number(config.durationInFrames) || Math.ceil(durationInSeconds * fps) || 150
  return { fps, width, height, durationInFrames }
}

export const Root: React.FC = () => {
  const { fps, width, height, durationInFrames } = getConfig()
  const l = LucideDemoModule.compositionConfig
  return (
    <>
      <Composition
        id="current"
        component={SceneComponent}
        durationInFrames={durationInFrames}
        fps={fps}
        width={width}
        height={height}
      />
      <Composition
        id="lucide-icons-test"
        component={LucideDemoModule.Scene}
        durationInFrames={l.durationInFrames}
        fps={l.fps}
        width={l.width}
        height={l.height}
      />
    </>
  )
}
