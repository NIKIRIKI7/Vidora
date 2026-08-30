import React from 'react'
import { Composition } from 'remotion'
import * as CurrentSceneModule from './scenes/current'

const SceneComponent: React.FC = (props) => {
  const Component =
    (CurrentSceneModule as any).default ||
    (CurrentSceneModule as any).Scene ||
    Object.values(CurrentSceneModule).find((v) => typeof v === 'function') ||
    (() => null)

  return <Component {...props} />
}

export const Root: React.FC = () => {
  return (
    <Composition
      id="current"
      component={SceneComponent}
      calculateMetadata={async () => {
        const sceneModule = CurrentSceneModule as any
        const durationInFrames = sceneModule.durationInFrames || 300
        const isVertical = sceneModule.isVertical || false
        const fps = sceneModule.fps || 30

        return {
          durationInFrames,
          fps,
          width: isVertical ? 1080 : 1920,
          height: isVertical ? 1920 : 1080,
        }
      }}
    />
  )
}
