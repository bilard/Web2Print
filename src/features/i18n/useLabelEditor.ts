import { useEffect, useState } from 'react'
import { useLocaleStore } from '@/stores/locale.store'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { findKeysByText } from '@/lib/i18n/reverseIndex'
import type { TranslationKey } from '@/lib/i18n'

/** Libellé désigné par un Alt+clic, prêt à être réécrit. */
export interface LabelTarget {
  /** Clés candidates — plusieurs quand le même mot sert dans plusieurs écrans. */
  keys: TranslationKey[]
  /** Texte tel qu'il est affiché (sert d'aperçu dans le popover). */
  text: string
  /** Origine du texte : contenu visible, ou attribut (infobulle, placeholder…). */
  source: 'text' | 'title' | 'aria-label' | 'placeholder'
  x: number
  y: number
}

/** Attributs porteurs de texte traduit, dans l'ordre où on les interroge. */
const TEXT_ATTRS = ['title', 'aria-label', 'placeholder'] as const

/** Au-delà, on remonterait jusqu'à des conteneurs dont le texte agrège l'écran entier. */
const MAX_DEPTH = 5

/**
 * Arme le Alt+clic : « ce mot ne me convient pas, je le réécris ».
 *
 * Alt et pas un mode plein écran : l'utilisateur reste dans son travail, désigne
 * le mot qui le gêne là où il le gêne, et l'application continue de fonctionner
 * autour. Le mode ne s'arme que si l'édition est activée dans les réglages —
 * sinon un Alt+clic accidentel ouvrirait un popover en pleine production.
 */
export function useLabelEditor() {
  const editing = useI18nOverridesStore((s) => s.editing)
  const [target, setTarget] = useState<LabelTarget | null>(null)

  useEffect(() => {
    if (!editing) {
      setTarget(null)
      return
    }

    function onClick(e: MouseEvent) {
      if (!e.altKey) return
      const start = e.target as HTMLElement | null
      if (!start) return

      const { locale } = useLocaleStore.getState()
      const { overrides, version } = useI18nOverridesStore.getState()
      const table = overrides[locale] ?? {}

      let node: HTMLElement | null = start
      for (let depth = 0; node && depth < MAX_DEPTH; depth++, node = node.parentElement) {
        // Les attributs d'abord : sur un bouton-icône, `textContent` est vide et
        // c'est l'infobulle qui porte le seul texte traduit de l'élément.
        for (const attr of TEXT_ATTRS) {
          const value = node.getAttribute(attr)
          if (!value) continue
          const keys = findKeysByText(value, locale, table, version)
          if (keys.length > 0) {
            e.preventDefault()
            e.stopPropagation()
            setTarget({ keys, text: value, source: attr, x: e.clientX, y: e.clientY })
            return
          }
        }
        const text = node.textContent ?? ''
        // Un conteneur agrège le texte de ses enfants : au-delà de quelques
        // centaines de caractères, ce n'est plus un libellé, c'est un écran.
        if (text.length > 0 && text.length < 400) {
          const keys = findKeysByText(text, locale, table, version)
          if (keys.length > 0) {
            e.preventDefault()
            e.stopPropagation()
            setTarget({ keys, text, source: 'text', x: e.clientX, y: e.clientY })
            return
          }
        }
      }
    }

    // Phase de CAPTURE : sans elle, le `onClick` du composant sous-jacent
    // partirait d'abord — on ouvrirait une modale ou on supprimerait une ligne
    // en croyant renommer son libellé.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [editing])

  return { target, clearTarget: () => setTarget(null) }
}
