type ColorScale = Record<string, string>

export const colors = {
  surface: '#0b1326' as const,
  surfaceDim: '#0b1326' as const,
  surfaceBright: '#31394d' as const,
  surfaceContainerLowest: '#060e20' as const,
  surfaceContainerLow: '#131b2e' as const,
  surfaceContainer: '#171f33' as const,
  surfaceContainerHigh: '#222a3d' as const,
  surfaceContainerHighest: '#2d3449' as const,
  onSurface: '#dae2fd' as const,
  onSurfaceVariant: '#cfc2d6' as const,
  inverseSurface: '#dae2fd' as const,
  inverseOnSurface: '#283044' as const,
  outline: '#988d9f' as const,
  outlineVariant: '#4d4354' as const,
  surfaceTint: '#ddb7ff' as const,
  background: '#0b1326' as const,
  onBackground: '#dae2fd' as const,
  surfaceVariant: '#2d3449' as const,

  primary: '#ddb7ff' as const,
  onPrimary: '#490080' as const,
  primaryContainer: '#b76dff' as const,
  onPrimaryContainer: '#400071' as const,
  inversePrimary: '#842bd2' as const,
  primaryFixed: '#f0dbff' as const,
  primaryFixedDim: '#ddb7ff' as const,
  onPrimaryFixed: '#2c0051' as const,
  onPrimaryFixedVariant: '#6900b3' as const,

  secondary: '#4fdbc8' as const,
  onSecondary: '#003731' as const,
  secondaryContainer: '#04b4a2' as const,
  onSecondaryContainer: '#003f38' as const,
  secondaryFixed: '#71f8e4' as const,
  secondaryFixedDim: '#4fdbc8' as const,
  onSecondaryFixed: '#00201c' as const,
  onSecondaryFixedVariant: '#005048' as const,

  tertiary: '#c0c1ff' as const,
  onTertiary: '#1000a9' as const,
  tertiaryContainer: '#8083ff' as const,
  onTertiaryContainer: '#0d0096' as const,
  tertiaryFixed: '#e1e0ff' as const,
  tertiaryFixedDim: '#c0c1ff' as const,
  onTertiaryFixed: '#07006c' as const,
  onTertiaryFixedVariant: '#2f2ebe' as const,

  error: '#ffb4ab' as const,
  onError: '#690005' as const,
  errorContainer: '#93000a' as const,
  onErrorContainer: '#ffdad6' as const,
} satisfies ColorScale

export const typography = {
  display: {
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
  },
  headline: {
    fontFamily: 'Inter',
    fontSize: 32,
    fontWeight: 600,
    lineHeight: 1.2,
    mobile: { fontSize: 24 },
  },
  title: {
    fontFamily: 'Inter',
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.5,
  },
  body: {
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.6,
  },
  label: {
    fontFamily: 'Geist',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: '0.05em',
  },
  mono: {
    fontFamily: 'Geist Mono',
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.4,
  },
} as const

export const spacing = {
  base: 4,
  xs: 8,
  sm: 16,
  md: 24,
  lg: 40,
  xl: 64,
  gutter: 16,
  marginMobile: 20,
  marginDesktop: 32,
} as const

export const rounded = {
  sm: '0.25rem',
  DEFAULT: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  full: '9999px',
} as const
