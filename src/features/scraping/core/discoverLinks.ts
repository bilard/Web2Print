/** Sélection des liens candidats pour la découverte de fiches produit (Crawl).
 *
 *  Problème résolu : une page famille e-commerce contient des CENTAINES de
 *  liens même-host qui ne sont PAS des fiches produit (méga-menu, footer,
 *  breadcrumb). Un filtre « host identique + limit » prend les N premiers
 *  liens du document — donc le menu — et les vraies cartes produit (souvent
 *  hydratées en AJAX après scroll) n'entrent jamais dans le quota.
 *
 *  La Cloud Function Puppeteer classifie les ancres par contexte DOM :
 *   - `cardLinks` : ancres de la zone contenu appartenant à des groupes
 *     répétés (≥ 3 frères de même signature structurelle) — la grille.
 *   - `navLinks`  : ancres sous header/nav/footer/aside/[role=navigation].
 *  Ici on choisit le meilleur étage de candidats, de façon PURE et testable. */

interface DiscoveredEntry {
  title: string
  url: string
}

export type DiscoveryTier = 'cards' | 'content' | 'all'

/** Clé de comparaison d'URL : sans hash, sans slash final, host minuscule
 *  sans `www.` — pour que la soustraction nav fonctionne entre les liens
 *  Jina et ceux de la Cloud Function (normalisations différentes). */
export function normalizeUrlKey(raw: string): string {
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return `${host}${path}${u.search}`
  } catch {
    return raw.replace(/#.*$/, '')
  }
}

export interface DiscoverySources {
  /** Résumé de liens Jina (moteur navigateur) : [titre, href]. */
  jinaEntries: [string, string][]
  /** Tous les <a href> hydratés vus par la Cloud Function (après scroll). */
  cloudLinks: string[]
  /** Ancres en zone de navigation (header/nav/footer/aside) — à exclure. */
  cloudNavLinks: string[]
  /** Ancres « carte » : groupes répétés en zone contenu (la grille). */
  cloudCardLinks: DiscoveredEntry[]
}

/** Choisit l'étage de candidats le plus fiable :
 *   1. `cards`   : la Cloud Function a identifié une grille répétée → on ne
 *      prend QUE ces liens (le menu n'y est jamais).
 *   2. `content` : pas de grille détectée mais on connaît les liens de nav →
 *      union Jina ∪ cloud MOINS la navigation.
 *   3. `all`     : la Cloud Function n'a rien classifié (échec/ancienne
 *      version) → union brute historique, dernier recours.
 *  Un lien présent à la fois en nav et en carte reste une carte (les titres
 *  de cartes vivent parfois dans un conteneur au nom ambigu). */
export function selectDiscoveryEntries(src: DiscoverySources): { entries: [string, string][]; tier: DiscoveryTier } {
  const cardKeys = new Set(src.cloudCardLinks.map((c) => normalizeUrlKey(c.url)))

  if (src.cloudCardLinks.length >= 3) {
    return {
      entries: src.cloudCardLinks.map((c) => [c.title, c.url] as [string, string]),
      tier: 'cards',
    }
  }

  const slugTitle = (u: string): string => {
    try {
      const seg = new URL(u).pathname.split('/').filter(Boolean).pop() ?? ''
      return seg.replace(/\.\w{2,5}$/, '').replace(/[-_]+/g, ' ').trim() || new URL(u).hostname
    } catch { return u }
  }

  const union: [string, string][] = [
    ...src.cloudCardLinks.map((c) => [c.title, c.url] as [string, string]),
    ...src.jinaEntries,
    ...src.cloudLinks.map((h) => [slugTitle(h), h] as [string, string]),
  ]

  if (src.cloudNavLinks.length > 0) {
    const navKeys = new Set(src.cloudNavLinks.map(normalizeUrlKey))
    const content = union.filter(([, href]) => {
      const key = normalizeUrlKey(href)
      return cardKeys.has(key) || !navKeys.has(key)
    })
    return { entries: content, tier: 'content' }
  }

  return { entries: union, tier: 'all' }
}
