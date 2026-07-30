import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { t } from '@/lib/i18n'

interface OptionHelpProps {
  /** Texte d'aide affiché au survol / focus de l'icône. */
  text: string
}

/**
 * Petite icône « ? » d'aide contextuelle posée à côté d'une option.
 * La bulle est rendue via un portail (position: fixed) pour ne pas être rognée
 * par les conteneurs `overflow` des panneaux. Alignée à droite de l'icône, elle
 * s'étend vers la gauche pour rester dans l'écran (panneaux collés au bord droit).
 */
export function OptionHelp({ text }: OptionHelpProps) {
  const [box, setBox] = useState<{ right: number; top: number } | null>(null)
  const ref = useRef<HTMLButtonElement>(null)

  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setBox({ right: window.innerWidth - r.right, top: r.bottom + 6 })
  }, [])
  const hide = useCallback(() => setBox(null), [])

  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        aria-label={t('help.aria', { text })}
        className="inline-flex items-center justify-center text-white/25 hover:text-indigo-400 focus:text-indigo-400 transition-colors focus:outline-none shrink-0"
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {box &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: 'fixed', right: box.right, top: box.top, maxWidth: 240 }}
            className="z-[60] pointer-events-none bg-surface border border-indigo-500/40 rounded-lg px-2.5 py-1.5 text-[11px] leading-snug text-white/85 shadow-xl"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}
