// Traduction des contenus d'aide — PAR RÉUTILISATION, pas par recopie.
//
// `/docs/` est généré depuis cette même aide (scripts/build-docs-content.mjs),
// et `scripts/docs-i18n/strings.en.json` en est déjà la traduction anglaise :
// 750 des 753 chaînes y figurent, clefées par le texte FRANÇAIS exact.
//
// On branche donc l'aide sur ce mapping plutôt que de dupliquer 500 chaînes
// dans le catalogue i18n : une seule source de vérité, et la doc publique et
// l'app restent traduites par le même fichier.
//
// ⚠️ Repli VOLONTAIRE sur le français si la clé manque : une phrase d'aide
// retouchée côté FR sort du mapping et s'affiche telle quelle, au lieu de
// disparaître. C'est le même comportement que `build.mjs` (« N chaînes non
// traduites (repli FR) »).
import { useEffect, useState } from 'react'
import { useLocaleStore } from '@/stores/locale.store'

type HelpMap = Record<string, string>

let MAP: HelpMap | null = null
let loading: Promise<void> | null = null

/** Charge le mapping une seule fois (159 Ko) — jamais en français. */
function loadMap(): Promise<void> {
  loading ??= import('../../../scripts/docs-i18n/strings.en.json')
    .then((m) => { MAP = m.default as HelpMap })
    .catch(() => { MAP = {} })
  return loading
}

/**
 * Rend un texte d'aide dans la langue active.
 *
 * En français : renvoie la chaîne telle quelle, aucun chargement.
 * En anglais : déclenche le chargement du mapping au premier rendu, puis
 * re-rend une fois qu'il est là.
 */
export function useHelpText(): (fr: string) => string {
  const locale = useLocaleStore((s) => s.locale)
  const [, bump] = useState(0)

  useEffect(() => {
    if (locale !== 'en' || MAP) return
    let alive = true
    void loadMap().then(() => { if (alive) bump((n) => n + 1) })
    return () => { alive = false }
  }, [locale])

  return (fr: string) => (locale === 'en' && MAP ? MAP[fr] ?? fr : fr)
}
