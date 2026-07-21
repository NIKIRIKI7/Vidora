export const ProgressBar = ({ progress, className = '' }: { progress: number; className?: string }) => (
  <div
    className={`w-full h-1.5 bg-white/10 rounded-full overflow-hidden ${className}`}
    role="progressbar"
    aria-valuenow={progress}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div
      className="h-full bg-secondary shadow-[0_0_5px_rgba(113,248,228,0.8)] transition-all duration-300"
      style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
    />
  </div>
)
