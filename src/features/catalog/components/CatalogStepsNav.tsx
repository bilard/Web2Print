// src/features/catalog/components/CatalogStepsNav.tsx
import type { CatalogStep } from '@/stores/catalog.store'

const STEPS: { id: CatalogStep; label: string }[] = [
  { id: 'source', label: '1 · Source' },
  { id: 'structure', label: '2 · Structure' },
  { id: 'prompt', label: '3 · Prompt & style' },
  { id: 'preview', label: '4 · Aperçu' },
  { id: 'export', label: '5 · Export' },
]

interface Props { step: CatalogStep; onStep: (s: CatalogStep) => void; canLeave: boolean }

export function CatalogStepsNav({ step, onStep, canLeave }: Props) {
  return (
    <nav className="flex gap-1 px-6 py-2 border-b border-border bg-surface">
      {/* « Source » reste toujours accessible : sans données rechargées, c'est la seule issue. */}
      {STEPS.map((s) => (
        <button key={s.id} onClick={() => (canLeave || s.id === 'source') && onStep(s.id)} disabled={!canLeave && s.id !== step && s.id !== 'source'}
          className={`px-3 py-1.5 rounded-md text-sm ${s.id === step ? 'bg-indigo-600 text-[#fff] font-medium' : 'text-muted-foreground hover:text-white hover:bg-surface-2'}`}>
          {s.label}
        </button>
      ))}
    </nav>
  )
}
