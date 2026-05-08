import { useEffect } from 'react'
import { useHelpStore } from '../help.store'

const HIGHLIGHT_CLASSES = ['help-highlight-ring', 'animate-pulse']

/**
 * Effet global : quand `highlightTarget` change, trouve l'élément portant
 * `data-help-id="..."` correspondant, applique un anneau indigo + scroll au
 * centre, retire la classe au reset. Permet de cibler n'importe quel
 * composant en n'ajoutant qu'un attribut DOM, sans plumber de ref.
 *
 * Le sélecteur de fallback `useHighlight(id)` (ref-based) reste utilisé pour
 * les composants qui appliquent déjà cette mécanique. En cas de coexistence
 * (les deux existent pour le même id), les deux s'allument — sans conflit.
 */
export function useDataAttrHighlight() {
  const target = useHelpStore((s) => s.highlightTarget)

  useEffect(() => {
    if (!target) return
    const el = document.querySelector<HTMLElement>(`[data-help-id="${cssEscape(target)}"]`)
    if (!el) return
    el.classList.add(...HIGHLIGHT_CLASSES)
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    return () => {
      el.classList.remove(...HIGHLIGHT_CLASSES)
    }
  }, [target])
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/(["\\])/g, '\\$1')
}
