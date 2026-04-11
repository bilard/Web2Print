import { Check } from 'lucide-react'
import type { BriefStep } from '@/features/briefs/types'

interface Props {
  current: BriefStep
  onNavigate?: (step: BriefStep) => void
}

const STEPS: { id: BriefStep; label: string }[] = [
  { id: 1, label: 'Brief client' },
  { id: 2, label: 'Questions IA' },
  { id: 3, label: 'Panier' },
  { id: 4, label: 'Deck' },
  { id: 5, label: 'Export PPT' },
]

export function BriefStepper({ current, onNavigate }: Props) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, idx) => {
        const done = step.id < current
        const active = step.id === current
        const clickable = !!onNavigate && step.id !== current
        const handleClick = () => clickable && onNavigate?.(step.id)
        return (
          <div key={step.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClick}
              disabled={!clickable}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                done
                  ? 'bg-indigo-500 text-white'
                  : active
                    ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/60'
                    : 'bg-white/[0.06] text-white/40'
              } ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-indigo-400/60' : 'cursor-default'}`}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : step.id}
            </button>
            <span
              onClick={handleClick}
              className={`text-[12px] ${active ? 'text-white' : done ? 'text-white/60' : 'text-white/30'} ${clickable ? 'cursor-pointer hover:text-white' : ''}`}
            >
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={`w-6 h-px ${done ? 'bg-indigo-500/60' : 'bg-white/[0.08]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
