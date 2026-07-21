export interface SceneCardProps {
  scene: string
  time: string
  description: string
  isActive?: boolean
}

export const SceneCard = ({ scene, time, description, isActive = false }: SceneCardProps) => (
  <div
    className={`rounded-lg p-3 bg-surface-container/20 border transition-colors group cursor-pointer relative overflow-hidden ${isActive ? 'border-primary/30' : 'border-white/5 hover:border-primary/30'}`}
  >
    {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>}
    <div className={`flex justify-between items-center mb-2 ${isActive ? 'pl-2' : ''}`}>
      <span
        className={`font-label text-xs font-medium uppercase tracking-wider ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}
      >
        {scene}
      </span>
      <span className="font-mono text-[13px] text-on-surface-variant">{time}</span>
    </div>
    <p className={`text-sm leading-relaxed ${isActive ? 'text-on-surface pl-2' : 'text-on-surface-variant'}`}>
      {description}
    </p>
  </div>
)
