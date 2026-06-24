// Formatage typographique d'un prix : découpe une valeur brute (« 84.9 », « 1 250,5 », « 84 »)
// en segments « entier / devise / centimes » pour reproduire le gabarit d'origine
// (entier en gros, devise en exposant, centimes en petit). Logique PURE et testable ;
// l'application des styles per-caractère vit dans useDataMerge.

type PriceSegmentRole = 'integer' | 'currency' | 'decimals'

export interface PriceSegment {
  text: string
  role: PriceSegmentRole
}

export interface PriceParts {
  /** Texte complet reconstruit, ex. « 84€,90 ». */
  text: string
  /** Segments dans l'ordre, pour appliquer un style par rôle. */
  segments: PriceSegment[]
}

/**
 * Reformate une valeur brute en « entier{devise},{centimes} ».
 * - `decimals` : nombre de décimales forcé (défaut 2 → « 84 » devient « 84,00 », « 84.9 » → « 84,90 »).
 * - `currency` : symbole inséré entre l'entier et les centimes (défaut « € »).
 * Retourne `null` si la valeur ne contient aucun chiffre (rien à formater).
 */
export function formatPriceParts(
  rawValue: string,
  currency = '€',
  decimals = 2,
): PriceParts | null {
  if (typeof rawValue !== 'string') return null
  // Retire la devise et les espaces, isole le premier nombre.
  const cleaned = rawValue.replace(/[^\d.,]/g, ' ').trim()
  const m = /(\d[\d\s]*?)\s*(?:[.,](\d+))?\s*$/.exec(cleaned)
  if (!m) return null
  const intPart = m[1].replace(/\s/g, '')
  if (!intPart) return null
  let decPart = (m[2] ?? '').replace(/\s/g, '')
  // Forcer exactement `decimals` chiffres : compléter à droite, tronquer si trop long.
  decPart = (decPart + '0'.repeat(decimals)).slice(0, decimals)

  const segments: PriceSegment[] = [{ text: intPart, role: 'integer' }]
  if (currency) segments.push({ text: currency, role: 'currency' })
  if (decimals > 0) segments.push({ text: `,${decPart}`, role: 'decimals' })

  return { text: segments.map((s) => s.text).join(''), segments }
}
