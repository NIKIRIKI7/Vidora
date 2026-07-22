import React from 'react'
import { Composition } from 'remotion'
import { Scene } from './scenes/current'

const FPS = 30
const WIDTH = 1920
const HEIGHT = 1080
const DEFAULT_DURATION = 150

const Root: React.FC = () => (
  <Composition
    id="current"
    component={Scene}
    durationInFrames={DEFAULT_DURATION}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
)

export { Root }
