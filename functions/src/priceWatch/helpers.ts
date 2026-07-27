// functions/src/priceWatch/helpers.ts
// Helpers purs de la veille tarifaire — jumeau SERVEUR du sous-ensemble de
// src/features/priceWatch/core.ts utilisé par les nodes catalogue (moisson +
// comparaison). Dupliqué car client/serveur ne partagent pas le code ; garder
// wire-compatible avec le client (mêmes ids stables, même parsing de prix).

/** Site concurrent parsé depuis la config « un domaine par ligne ». */
export type SiteEngine = 'auto' | 'jina' | 'firecrawl' | 'brightdata' | 'browseract'

/** Canal de relevé d'un site. Absent = les DEUX (comportement historique).
 *  'harvest' = moisson par catégories ; 'directed' = recherche dirigée réf/EAN. */
export type SiteMode = 'harvest' | 'directed'

export interface CompetitorSite {
  id: string
  domain: string
  fields: string[]
  /** Moteur forcé (node « Sites sources »). Absent = 'auto'. */
  engine?: SiteEngine
  /** Site à prix connectés (identifiants en Firestore siteCredentials). */
  auth?: boolean
  /** Pages par run RÉSERVÉES à ce site (vide = part du budget commun). */
  pageBudget?: number
  /** Identifiant du bot BrowserAct (moteur 'browseract' uniquement) — sans lui, il n'y a
   *  rien à exécuter : l'API n'a pas de primitive « lis cette URL ». */
  botId?: string
  /** Canal de relevé de ce site. Absent = moisson ET recherche dirigée. */
  mode?: SiteMode
}

/** Identifiant Firestore stable et déterministe (clé relationnelle nettoyée). */
export function stableId(value: string): string {
  return value.toLowerCase().replace(/[/#?[\]\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 200) || 'x'
}

/** Normalise UN jeton numérique, gérant séparateurs FR (« 1 299,90 ») et EN
 *  (« 1,299.90 ») : « 1.299 » = milliers, « 284.41 » = décimal. */
function normalizePriceToken(tok: string): number {
  let s = tok
  if (s.includes('.') && s.includes(',')) {
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.')
  } else if (s.includes(',')) {
    const parts = s.split(',')
    s = parts.length === 2 && parts[parts.length - 1].length <= 2 ? parts.join('.') : parts.join('')
  } else if (s.includes('.')) {
    const parts = s.split('.')
    if (parts.length > 2 || parts[parts.length - 1].length === 3) s = parts.join('')
  }
  return parseFloat(s)
}

/** Parse un prix : « 1 299,90 € » → 1299.9. NaN si illisible. Sur une chaîne à
 *  prix MULTIPLES (paire promo « 304,38€284,41€ »), renvoie le PLUS BAS. */
export function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return NaN
  const tokens = [...v.replace(/\s/g, '').matchAll(/-?\d[\d.,]*\d|-?\d/g)]
    .map((m) => normalizePriceToken(m[0]))
    .filter((n) => Number.isFinite(n))
  return tokens.length ? Math.min(...tokens) : NaN
}

/**
 * Parse la config « sites » (une ligne par site). Format :
 *   exemple.com
 *   exemple.com | price, availability
 * Le `|` sépare le domaine des champs à scraper (défaut : ['price']). id = domaine nettoyé.
 */
export function parseSitesConfig(text: string): CompetitorSite[] {
  const out: CompetitorSite[] = []
  const seen = new Set<string>()
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [domainRaw, fieldsRaw] = trimmed.split('|')
    const domain = domainRaw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!domain) continue
    const id = stableId(domain)
    if (seen.has(id)) continue
    seen.add(id)
    const fields = (fieldsRaw ?? '').split(',').map((f) => f.trim()).filter(Boolean)
    out.push({ id, domain, fields: fields.length ? fields : ['price'] })
  }
  return out
}
