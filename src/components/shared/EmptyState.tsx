import type { ComponentType, ReactNode } from 'react'

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>
  title: string
  /** Une phrase qui explique quoi faire (pas seulement « rien ici »). */
  hint?: string
  /** Action principale (bouton accentué). */
  action?: { label: string; onClick: () => void; icon?: ComponentType<{ className?: string }> }
  children?: ReactNode
}

/**
 * État vide standard : icône + titre + indication + UNE action concrète.
 * Convention produit : un écran vide doit toujours proposer le prochain pas.
 */
export function EmptyState({ icon: Icon, title, hint, action, children }: EmptyStateProps) {
  const ActionIcon = action?.icon
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      <Icon className="w-10 h-10 text-white/10" aria-hidden="true" />
      <p className="text-sm font-medium text-white/40">{title}</p>
      {hint && <p className="text-xs text-white/25 max-w-xs leading-snug">{hint}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-1 flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm transition-colors"
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" aria-hidden="true" />}
          {action.label}
        </button>
      )}
      {children}
    </div>
  )
}
