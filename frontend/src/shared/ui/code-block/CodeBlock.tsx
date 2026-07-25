import { Icon } from '../icon'

export const CodeBlock = ({ title, code, className = '' }: { title: string; code: string; className?: string }) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    <div className="flex justify-between items-center">
      <h3 className="text-[18px] font-medium text-on-surface flex items-center gap-2">
        <Icon name="code" className="text-[18px] text-secondary" />
        {title}
      </h3>
      <button className="text-on-surface-variant hover:text-white transition-colors" title="Copy">
        <Icon name="content_copy" className="text-[16px]" />
      </button>
    </div>
    <div className="border border-white/5 shadow-inner bg-surface-container-lowest/50 p-4 rounded-lg overflow-x-auto">
      <pre className="font-mono text-[13px] text-on-surface-variant leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  </div>
)
