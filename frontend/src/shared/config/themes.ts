export interface AppColors {
  primary: string
  secondary: string
  background: string
  surface: string
  accent: string
  text: string
}

export interface ThemePreset {
  id: string
  name: string
  colors: AppColors
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'vidora-default', name: 'Vidora Default', colors: { primary: '#ddb7ff', secondary: '#4fdbc8', background: '#0b1326', surface: '#171f33', accent: '#ffb4ab', text: '#dae2fd' } },
  { id: 'cyber-neon', name: 'Cyber Neon', colors: { primary: '#38bdf8', secondary: '#818cf8', background: '#020617', surface: '#0f172a', accent: '#f43f5e', text: '#f8fafc' } },
  { id: 'tech-mint', name: 'Tech Mint', colors: { primary: '#10b981', secondary: '#059669', background: '#022c22', surface: '#064e3b', accent: '#34d399', text: '#ecfdf5' } },
  { id: 'deep-violet', name: 'Deep Violet', colors: { primary: '#a855f7', secondary: '#7c3aed', background: '#0f0728', surface: '#1e1145', accent: '#ec4899', text: '#faf5ff' } },
  { id: 'dracula', name: 'Dracula', colors: { primary: '#ff79c6', secondary: '#50fa7b', background: '#282a36', surface: '#44475a', accent: '#bd93f9', text: '#f8f8f2' } },
  { id: 'vercel-minimal', name: 'Vercel Minimal', colors: { primary: '#000000', secondary: '#0070f3', background: '#ffffff', surface: '#fafafa', accent: '#f5a623', text: '#111111' } },
  { id: 'github-dark', name: 'GitHub Dark', colors: { primary: '#58a6ff', secondary: '#3fb950', background: '#0d1117', surface: '#161b22', accent: '#f85149', text: '#c9d1d9' } },
  { id: 'tailwind-ocean', name: 'Tailwind Ocean', colors: { primary: '#38bdf8', secondary: '#818cf8', background: '#0f172a', surface: '#1e293b', accent: '#f472b6', text: '#f8fafc' } },
]