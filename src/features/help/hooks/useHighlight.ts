import { useEffect, useRef } from 'react'
import { useHelpStore } from '../help.store'

const HIGHLIGHT_CLASS =
  'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0f0f0f] animate-pulse transition-shadow'

/**
 * À placer sur un composant cible. Quand help.store.highlightTarget === id,
 * applique un ring indigo pulsant + scroll au centre. Reset automatique par le store.
 */
export function useHighlight<T extends HTMLElement>(id: string): {
  ref: React.RefObject<T>
  className: string
} {
  const ref = useRef<T>(null)
  const isActive = useHelpStore((s) => s.highlightTarget === id)

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [isActive])

  return {
    ref,
    className: isActive ? HIGHLIGHT_CLASS : '',
  }
}
