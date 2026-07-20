// src/features/priceWatch/catalog/categories.ts
// Découverte des pages catégorie d'un concurrent, filtrées par famille. PUR.
//
// La moisson ciblée (familles à forte concurrence) a besoin des URLs de catégorie du
// concurrent qui recouvrent ces familles. On les lit sur la page d'accueil (menu) et
// on les filtre par mots-clés de famille — pas d'appel externe, pas de dictionnaire
// par site : les liens catégorie PrestaShop suivent tous le motif `/{id}-{slug}`.

/** Retire accents et met en minuscules, pour un rapprochement souple des libellés. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/**
 * Traduit une famille F1 en mots-clés attendus dans un slug de catégorie concurrent.
 * Mapping GÉNÉRIQUE (motoculture), pas par site. Étendable sans risque : un mot-clé
 * surnuméraire élargit la moisson, il ne casse rien.
 */
const FAMILY_KEYWORDS: Record<string, string[]> = {
  COUPE: ['lame', 'coupe', 'couteau', 'fil-nylon', 'bobine', 'tete'],
  COURROIES: ['courroie'],
  FILTRATION: ['filtre', 'filtration'],
  'MEMBRANES ET CARBURATEURS': ['carburateur', 'membrane', 'kit-reparation'],
  ELECTRICITE: ['allumage', 'bobine', 'bougie', 'demarreur', 'batterie', 'electr'],
  'PIECES MOTEURS': ['moteur', 'piston', 'segment', 'soupape', 'joint'],
  'LANCEURS ET DEMARREURS': ['lanceur', 'demarreur'],
}

/** Mots-clés de catégorie pour un ensemble de familles. Familles inconnues ignorées. */
export function keywordsForFamilies(families: string[]): string[] {
  const out = new Set<string>()
  for (const fam of families) {
    for (const kw of FAMILY_KEYWORDS[fam.toUpperCase().trim()] ?? []) out.add(foldText(kw))
  }
  return [...out]
}

export interface CategoryLink {
  url: string
  slug: string
}

/**
 * Liens de catégorie d'une page PrestaShop. Un lien catégorie a la forme
 * `https://host/{id}-{slug}` (sans `.html` final, qui signe une fiche produit).
 * Dédupliqués, restreints au host cible.
 */
export function extractCategoryLinks(html: string, baseUrl: string): CategoryLink[] {
  let host: string
  try { host = new URL(baseUrl).host } catch { return [] }
  const esc = host.replace(/[.]/g, '\\.')
  const re = new RegExp(`href=["'](https?://${esc}/(\\d+-[a-z0-9-]+))["']`, 'gi')
  const seen = new Set<string>()
  const out: CategoryLink[] = []
  for (const m of html.matchAll(re)) {
    const url = m[1]
    if (url.endsWith('.html')) continue // fiche produit, pas catégorie
    const slug = m[2].replace(/^\d+-/, '')
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ url, slug })
  }
  return out
}

/**
 * Catégories retenues pour la moisson. Sans mot-clé (aucune famille ciblée), on rend
 * TOUTES les catégories (moisson du catalogue complet). Sinon on garde celles dont le
 * slug contient au moins un mot-clé.
 */
export function selectCategories(links: CategoryLink[], keywords: string[]): string[] {
  if (keywords.length === 0) return links.map((l) => l.url)
  const out: string[] = []
  for (const link of links) {
    const slug = foldText(link.slug)
    if (keywords.some((kw) => slug.includes(kw))) out.push(link.url)
  }
  return out
}
