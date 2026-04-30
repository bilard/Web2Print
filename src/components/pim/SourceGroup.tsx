import { useState, type ReactNode } from 'react'
import { ChevronRight, ChevronDown, Folder } from 'lucide-react'

interface Props {
  label: string
  count: number
  defaultOpen?: boolean
  children: ReactNode
}

export function SourceGroup({ label, count, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-white/30 hover:text-white/50"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Folder className="w-3 h-3 opacity-60" />
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="tabular-nums text-white/25">{count}</span>
      </button>
      {open && <div className="space-y-px mt-0.5">{children}</div>}
    </div>
  )
}
