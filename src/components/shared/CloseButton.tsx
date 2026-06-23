import type { MouseEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CloseButtonProps {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  /** Taille du bouton. `sm` = 28px, `md` = 32px (défaut). */
  size?: 'sm' | 'md'
  className?: string
  title?: string
  disabled?: boolean
}

/**
 * Bouton de fermeture visible et cohérent dans toute l'app.
 * Remplace les croix « X » discrètes (text-white/30…) par une vraie cible
 * cliquable : fond surface, bordure, état hover/focus explicites.
 */
export function CloseButton({
  onClick,
  size = 'md',
  className,
  title = 'Fermer',
  disabled,
}: CloseButtonProps) {
  const box = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-white/10',
        'bg-surface-2 text-white/70 transition-colors',
        'hover:bg-surface hover:text-white hover:border-white/20',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:opacity-40 disabled:pointer-events-none',
        box,
        className,
      )}
    >
      <X className={icon} />
    </button>
  )
}
