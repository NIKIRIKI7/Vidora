export const TimelineTrack = ({ progress }: { progress: number }) => (
  <div className="relative w-full h-8 group cursor-pointer">
    <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
      <div
        className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-secondary to-primary"
        style={{ width: `${progress}%` }}
      ></div>
    </div>

    <div
      className="absolute top-1/2 -translate-y-1/2 -ml-1 w-2 h-6 bg-white rounded-sm shadow-[0_0_10px_rgba(255,255,255,0.8)] border border-black/20 group-hover:scale-y-110 transition-transform"
      style={{ left: `${progress}%` }}
    ></div>

    <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 rounded-full pointer-events-none flex">
      <div className="w-[33%] border-r border-background/50 h-full"></div>
      <div className="w-[28%] border-r border-background/50 h-full"></div>
    </div>
  </div>
)
