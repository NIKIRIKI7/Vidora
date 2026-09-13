export const ProgressBar = ({ progress, className = '' }: { progress: number; className?: string }) => (
  <div
    className={`w-full h-1.5 bg-on-surface/10 rounded-full overflow-hidden ${className}`}
    role="progressbar"
    aria-valuenow={progress}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div
      className="h-full bg-secondary shadow-sm shadow-secondary/70 transition-all duration-300"
      style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
    />
  </div>
)
