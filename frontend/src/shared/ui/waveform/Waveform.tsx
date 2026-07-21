import { Icon } from '../icon/Icon'

export const Waveform = ({ playing = false }: { playing?: boolean }) => {
  const bars = [20, 40, 80, 100, 60, 30, 15, 50, 70, 90, 45, 25, 10]

  return (
    <div className="rounded-lg p-3 relative h-16 flex items-center justify-center overflow-hidden group cursor-pointer border border-primary/20 hover:border-primary/50 transition-colors bg-surface-container/20">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10 opacity-50"></div>

      <div
        className={`flex items-center gap-[2px] h-full w-full px-2 transition-opacity ${playing ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'}`}
      >
        {bars.map((h, i) => (
          <div
            key={i}
            className={`w-1 rounded-full ${h > 60 ? 'bg-secondary shadow-[0_0_8px_rgba(79,219,200,0.8)]' : 'bg-primary'}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity bg-black/40 ${playing ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <Icon name="play_arrow" className="text-white text-[24px]" filled />
      </div>
    </div>
  )
}
