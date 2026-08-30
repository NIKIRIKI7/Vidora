import React from 'react'
import { Composition } from 'remotion'
import * as CurrentSceneModule from './scenes/current'

class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || String(error) }
  }

  componentDidCatch(error: Error) {
    console.error('[Scene Sandbox] Render crash caught:', error)
  }

  render() {
    if (this.state.hasError) {
      // Fallback кадр: не даём рендеру упасть белым экраном из-за битых пропсов/NaN
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            background: '#12071f',
            color: '#fecaca',
            fontFamily: 'sans-serif',
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Ошибка рендера сцены</div>
          <div
            style={{
              maxWidth: '70%',
              padding: '8px 14px',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'monospace',
              wordBreak: 'break-word',
            }}
          >
            {this.state.message}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

const SceneComponent: React.FC = (props) => {
  const Component =
    (CurrentSceneModule as any).default ||
    (CurrentSceneModule as any).Scene ||
    Object.values(CurrentSceneModule).find((v) => typeof v === 'function') ||
    (() => null)

  return (
    <SceneErrorBoundary>
      <Component {...props} />
    </SceneErrorBoundary>
  )
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
