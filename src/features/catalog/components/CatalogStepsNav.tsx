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

/** Id du slot d'actions d'étape (rempli par les étapes via StepActionsPortal). */
export const STEP_ACTIONS_SLOT_ID = 'catalog-step-actions'

export function CatalogStepsNav({ step, onStep, canLeave }: Props) {
  return (
    <nav className="flex items-center gap-1 px-6 py-2 border-b border-border bg-surface">
      {/* « Source » reste toujours accessible : sans données rechargées, c'est la seule issue. */}
      {STEPS.map((s) => (
        <button key={s.id} onClick={() => (canLeave || s.id === 'source') && onStep(s.id)} disabled={!canLeave && s.id !== step && s.id !== 'source'}
          className={`px-3 py-1.5 rounded-md text-sm ${s.id === step ? 'bg-indigo-600 text-[#fff] font-medium' : 'text-muted-foreground hover:text-white hover:bg-surface-2'}`}>
          {s.label}
        </button>
      ))}
      {/* Actions de l'étape active (Générer, Continuer…) — TOUJOURS visibles. */}
      <div id={STEP_ACTIONS_SLOT_ID} className="ml-auto flex items-center gap-2" />
    </nav>
  )
}
