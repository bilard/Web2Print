// Heuristiques d'URL et de DOM partagées par les DEUX découvreurs de pages liées :
// celui du moteur de scraping (`scraping/core/relatedUrls`) et celui du PIM
// (`excel/ai-enrichment/relatedUrls`).
//
// ⚠ Ces deux modules sont des FORKS ASSUMÉS — le PIM qualifie les PDF
// (`EnrichedDocument`) et écarte les pages d'avis, le moteur rend des URL nues. On ne
// les fusionne pas : leurs types de sortie diffèrent, et fusionner changerait le
// comportement du scraping. Mais ces quatre fonctions-ci, elles, étaient recopiées
// caractère pour caractère alors qu'elles n'ont rien à voir avec la divergence : ce
// sont des règles sur les URL et le DOM des marchands, qui doivent évoluer ENSEMBLE.
// Un nouveau paramètre de tracking ajouté d'un seul côté produirait deux
// dédoublonnages différents de la même page.

const TAB_QUERY_KEYS = ['tab', 'section', 'view', 'pane', 'content']

/** Nom du paramètre de requête qui porte l'onglet actif, s'il y en a un. */
export function detectTabKeyFromUrl(baseUrl: URL): string | null {
  for (const [k] of baseUrl.searchParams) {
    if (TAB_QUERY_KEYS.includes(k.toLowerCase())) return k
  }
  return null
}

const TAB_ID_ATTRS = ['aria-controls', 'data-tab-id', 'data-tab', 'data-view', 'data-pane', 'data-section', 'data-qa']
const TAB_ID_STRIP = /^(cmp-tab-|tab-|nav-item-|panel-)/i

/** Identifiant d'onglet porté par un élément : les thèmes marchands le déclarent sous
 *  une demi-douzaine d'attributs différents, préfixés de façon variable. */
export function extractTabId(el: Element): string | null {
  for (const attr of TAB_ID_ATTRS) {
    const raw = el.getAttribute(attr)
    if (!raw) continue
    const cleaned = raw.replace(TAB_ID_STRIP, '').trim()
    if (cleaned && cleaned.length > 0 && cleaned.length < 80) return cleaned
  }
  const id = el.id
  if (id && id.length < 80 && /tab|panel/i.test(id)) {
    return id.replace(TAB_ID_STRIP, '')
  }
  return null
}

/** Chrome de navigation : en-tête, pied, fil d'Ariane, méga-menu, colonne latérale.
 *  Les liens qui s'y trouvent appartiennent au SITE, pas à la fiche produit. */
const NAV_ANCESTOR_SELECTORS = [
  'header', 'footer',
  'nav[role="navigation"]',
  '[class*="breadcrumb" i]',
  '[class*="sidebar" i]',
  '[class*="mega-menu" i]',
  '[class*="site-nav" i]',
]

export function isInsideNav(el: Element): boolean {
  let cur: Element | null = el
  while (cur) {
    for (const sel of NAV_ANCESTOR_SELECTORS) {
      if (cur.matches?.(sel)) return true
    }
    cur = cur.parentElement
  }
  return false
}

/** Paramètres de campagne : deux liens qui n'en diffèrent que ne sont qu'une page. */
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'msclkid', 'dclid',
])

export interface NormalizeOptions {
  keepHash?: boolean
}

/**
 * Forme canonique d'une URL, pour dédoublonner : hôte en minuscules, slash final
 * retiré, paramètres de tracking écartés puis triés, ancre supprimée sauf demande
 * contraire (les onglets d'une fiche produit vivent souvent dans le hash).
 * `null` si la chaîne n'est pas une URL absolue.
 */
export function normalizeUrl(raw: string, opts: NormalizeOptions = {}): string | null {
  try {
    const u = new URL(raw)
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    const params = Array.from(u.searchParams.entries())
      .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b))
    u.search = ''
    for (const [k, v] of params) u.searchParams.append(k, v)
    if (!opts.keepHash) u.hash = ''
    return u.toString().replace(/\/$/, '') // second trim for root
  } catch {
    return null
  }
}
