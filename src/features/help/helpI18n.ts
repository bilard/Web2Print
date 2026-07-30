// Traduction des contenus d'aide — PAR RÉUTILISATION, pas par recopie.
//
// `/docs/` est généré depuis cette même aide (scripts/build-docs-content.mjs),
// et `scripts/docs-i18n/strings.<locale>.json` en est déjà la traduction :
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
import { useLocaleStore, type Locale } from '@/stores/locale.store'

type HelpMap = Record<string, string>

/**
 * Chargeurs par langue — DEUX sources fusionnées, dans cet ordre :
 *  1. `strings.<locale>.json` — titres, catégories, intros, libellés (750/753).
 *  2. `helpBodies.<locale>.ts` — les CORPS markdown, absents du premier parce
 *     que la doc publique les transforme avant publication. L'overlay gagne.
 *
 * ⚠️ Registre EXPLICITE, et non un `import()` calculé sur la langue : chaque
 * mapping pèse plus de 150 Ko et doit rester un chunk séparé, chargé seulement
 * si quelqu'un lit l'aide dans cette langue. Une langue absente d'ici n'est pas
 * une erreur — son aide s'affiche en français, comme le reste du repli.
 */
const SOURCES: Partial<Record<Locale, () => Promise<HelpMap>>> = {
  en: async () => {
    const [docs, bodies] = await Promise.all([
      import('../../../scripts/docs-i18n/strings.en.json'),
      import('./helpBodies.en'),
    ])
    return { ...(docs.default as HelpMap), ...bodies.HELP_BODIES_EN }
  },
  es: async () => {
    const [docs, bodies] = await Promise.all([
      import('../../../scripts/docs-i18n/strings.es.json'),
      import('./helpBodies.es'),
    ])
    return { ...(docs.default as HelpMap), ...bodies.HELP_BODIES_ES }
  },
}

/** Mappings déjà chargés, par langue — l'aide se relit souvent, pas le fichier. */
const MAPS = new Map<Locale, HelpMap>()
const LOADING = new Map<Locale, Promise<void>>()

function loadMap(locale: Locale): Promise<void> {
  let pending = LOADING.get(locale)
  if (!pending) {
    const load = SOURCES[locale]
    pending = (load ? load() : Promise.resolve({}))
      .then((map) => { MAPS.set(locale, map) })
      .catch(() => { MAPS.set(locale, {}) })
    LOADING.set(locale, pending)
  }
  return pending
}

/**
 * Rend un texte d'aide dans la langue active.
 *
 * En français : renvoie la chaîne telle quelle, aucun chargement.
 * Dans une langue traduite : déclenche le chargement du mapping au premier
 * rendu, puis re-rend une fois qu'il est là.
 */
export function useHelpText(): (fr: string) => string {
  const locale = useLocaleStore((s) => s.locale)
  const [, bump] = useState(0)

  useEffect(() => {
    if (!SOURCES[locale] || MAPS.has(locale)) return
    let alive = true
    void loadMap(locale).then(() => { if (alive) bump((n) => n + 1) })
    return () => { alive = false }
  }, [locale])

  const map = MAPS.get(locale)
  return (fr: string) => map?.[fr] ?? fr
}
