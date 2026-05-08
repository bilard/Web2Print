// src/features/workflows/editor/NodePalette.tsx
import type { DragEvent } from 'react'
import { Lock } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { nodeRegistry } from '../registry'
import type { NodeSpec } from '../types'
import { WORKFLOW_DRAG_TYPE } from './WorkflowEditor'

/** Étapes du wizard — l'ordre détermine l'affichage et la numérotation. */
interface PaletteStep {
  category: NodeSpec['category']
  step: number
  label: string
  hint: string
  required: boolean
  /** Classes Tailwind appliquées aux boutons et au badge. */
  accent: {
    text: string
    border: string
    hoverBg: string
    badgeBg: string
    badgeBorder: string
  }
}

const STEPS: PaletteStep[] = [
  {
    category: 'import',
    step: 1,
    label: 'Import',
    hint: "Charger les données ou les fichiers d'entrée.",
    required: true,
    accent: {
      text: 'text-amber-300',
      border: 'border-amber-500/20',
      hoverBg: 'hover:bg-amber-500/10',
      badgeBg: 'bg-amber-500/15',
      badgeBorder: 'border-amber-500/40',
    },
  },
  {
    category: 'enrichment',
    step: 2,
    label: 'Enrichissement',
    hint: 'Compléter / transformer les données (optionnel).',
    required: false,
    accent: {
      text: 'text-violet-300',
      border: 'border-violet-500/20',
      hoverBg: 'hover:bg-violet-500/10',
      badgeBg: 'bg-violet-500/15',
      badgeBorder: 'border-violet-500/40',
    },
  },
  {
    category: 'persistence',
    step: 3,
    label: 'Sauvegarde',
    hint: 'Persister dans le PIM, le DAM ou la taxonomie (optionnel).',
    required: false,
    accent: {
      text: 'text-emerald-300',
      border: 'border-emerald-500/20',
      hoverBg: 'hover:bg-emerald-500/10',
      badgeBg: 'bg-emerald-500/15',
      badgeBorder: 'border-emerald-500/40',
    },
  },
  {
    category: 'export',
    step: 4,
    label: 'Export',
    hint: 'Générer un fichier final (Excel, PPTX…).',
    required: false,
    accent: {
      text: 'text-sky-300',
      border: 'border-sky-500/20',
      hoverBg: 'hover:bg-sky-500/10',
      badgeBg: 'bg-sky-500/15',
      badgeBorder: 'border-sky-500/40',
    },
  },
  {
    category: 'utility',
    step: 5,
    label: 'Utilitaires',
    hint: 'Helpers techniques.',
    required: false,
    accent: {
      text: 'text-neutral-300',
      border: 'border-neutral-600/20',
      hoverBg: 'hover:bg-neutral-500/10',
      badgeBg: 'bg-neutral-700/40',
      badgeBorder: 'border-neutral-600/40',
    },
  },
]

export function NodePalette() {
  const upsertNode = useWorkflowStore((s) => s.upsertNode)
  const placedNodes = useWorkflowStore((s) => s.current?.nodes ?? [])
  const rf = useReactFlow()

  const grouped = nodeRegistry.list().reduce<Record<string, NodeSpec[]>>((acc, spec) => {
    ;(acc[spec.category] ??= []).push(spec)
    return acc
  }, {})

  // Catégories ayant au moins un node posé sur le canvas (lookup via spec.type
  // → spec.category, car WorkflowNode.type stocke le type du node, pas la
  // catégorie).
  const placedCategories = new Set<NodeSpec['category']>()
  for (const n of placedNodes) {
    const spec = nodeRegistry.get(n.type)
    if (spec) placedCategories.add(spec.category)
  }

  const spawn = (spec: NodeSpec) => {
    const center = rf.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    })
    upsertNode({
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: spec.type,
      position: center,
      config: spec.defaultConfig,
    })
  }

  const onDragStart = (event: DragEvent, spec: NodeSpec) => {
    event.dataTransfer.setData(WORKFLOW_DRAG_TYPE, spec.type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const visibleSteps = STEPS.filter((s) => (grouped[s.category]?.length ?? 0) > 0)

  // Une étape est déverrouillée si au moins une étape antérieure (parmi celles
  // qui ont des nodes dans la registry) a un node sur le canvas. L'étape 1 est
  // toujours déverrouillée. Les utilitaires (step 5) sont déverrouillés dès
  // qu'au moins un node est posé.
  const stepIsUnlocked = (step: PaletteStep, idx: number): boolean => {
    if (idx === 0) return true
    return visibleSteps.slice(0, idx).some((prev) => placedCategories.has(prev.category))
  }

  return (
    <aside className="w-60 border-r border-neutral-800 bg-[#0f0f0f] overflow-y-auto p-3">
      <h3 className="text-[10px] uppercase text-neutral-500 font-semibold mb-1 tracking-wider">
        Palette
      </h3>
      <p className="text-[10px] text-neutral-600 mb-4 leading-tight">
        Construisez votre workflow étape par étape — glissez sur le canvas ou cliquez pour spawn au centre.
      </p>

      <ol className="relative">
        {visibleSteps.map((step, idx) => {
          const specs = grouped[step.category] ?? []
          const isLast = idx === visibleSteps.length - 1
          const unlocked = stepIsUnlocked(step, idx)
          // L'étape précédente affichée (pour le message d'unlock) — peut ne
          // pas exister si on est sur Utilitaires/Export sans antérieur visible.
          const prevLabel = idx > 0 ? visibleSteps[idx - 1].label : null
          return (
            <li key={step.category} className="relative pl-7 pb-4">
              {/* Connecteur vertical entre étapes */}
              {!isLast ? (
                <span
                  aria-hidden
                  className={`absolute left-[10px] top-6 bottom-0 w-px ${
                    unlocked ? 'bg-neutral-800' : 'bg-neutral-900'
                  }`}
                />
              ) : null}

              {/* Badge numéroté */}
              <span
                className={`absolute left-0 top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold border ${
                  unlocked
                    ? `${step.accent.badgeBg} ${step.accent.badgeBorder} ${step.accent.text}`
                    : 'bg-neutral-900 border-neutral-800 text-neutral-600'
                }`}
              >
                {unlocked ? step.step : <Lock className="w-2.5 h-2.5" />}
              </span>

              {/* En-tête de l'étape */}
              <div className={`mb-2 ${unlocked ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-1.5">
                  <h4
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      unlocked ? step.accent.text : 'text-neutral-500'
                    }`}
                  >
                    {step.label}
                  </h4>
                  {!step.required && unlocked ? (
                    <span className="text-[9px] text-neutral-600 uppercase tracking-wider">
                      optionnel
                    </span>
                  ) : null}
                </div>
                <p className="text-[10px] text-neutral-600 leading-tight mt-0.5">
                  {unlocked
                    ? step.hint
                    : prevLabel
                      ? `Disponible après ${prevLabel}.`
                      : 'Verrouillé.'}
                </p>
              </div>

              {/* Liste de nodes — désactivée si étape verrouillée */}
              {unlocked ? (
                <ul className="space-y-1">
                  {specs.map((spec) => {
                    const Icon = spec.icon
                    return (
                      <li key={spec.type}>
                        <button
                          onClick={() => spawn(spec)}
                          draggable
                          onDragStart={(e) => onDragStart(e, spec)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left bg-[#161616] border ${step.accent.border} ${step.accent.hoverBg} transition-colors cursor-grab active:cursor-grabbing`}
                          title={spec.description}
                        >
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${step.accent.text}`} />
                          <span className="truncate text-white/90">{spec.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <ul className="space-y-1">
                  {specs.map((spec) => {
                    const Icon = spec.icon
                    return (
                      <li key={spec.type}>
                        <div
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left bg-[#0d0d0d] border border-neutral-900 text-neutral-700 cursor-not-allowed select-none"
                          title={prevLabel ? `Disponible après ${prevLabel}.` : 'Verrouillé.'}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0 text-neutral-700" />
                          <span className="truncate">{spec.label}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
