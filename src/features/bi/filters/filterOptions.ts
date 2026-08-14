// Ce qu'un filtre propose à l'utilisateur, et comment il se raconte une fois posé. PUR.
//
// ⚠ Les valeurs proposées viennent des DONNÉES RÉELLES, jamais d'une liste devinée : un
// filtre qui offre « COURROIES » sur un catalogue qui n'en contient pas fait chercher une
// ligne qui n'existe pas. Elles sont donc extraites des lignes chargées, avec leur effectif.
import type { FilterClause } from '../types'
import type { Dimension, Row } from '../registry/types'

/** Une valeur proposée dans une multi-sélection, avec le nombre de lignes qu'elle porte. */
export interface FilterOption {
  /** `null` = valeur ABSENTE. C'est une option à part entière : « sans marque » est une
   *  question légitime, et la masquer ferait mentir la somme des effectifs. */
  value: string | null
  count: number
}

/** Au-delà, une liste déroulante n'est plus lisible et la recherche prend le relais. Le
 *  plafond protège aussi le rendu : une colonne de références distinctes peut compter des
 *  dizaines de milliers de valeurs. */
export const MAX_OPTIONS = 500

/**
 * Valeurs distinctes d'une dimension, les plus fréquentes d'abord. PUR.
 *
 * ⚠ Le tri par effectif décroissant n'est pas cosmétique : sur une colonne à forte
 * cardinalité, les premières entrées sont les seules que l'utilisateur verra sans chercher,
 * et ce sont celles qui pèsent réellement dans ses chiffres.
 */
export function filterOptions(rows: Row[], dim: Dimension, max = MAX_OPTIONS): {
  options: FilterOption[]
  /** Des valeurs ont été écartées faute de place — l'écran doit le dire. */
  truncated: boolean
} {
  const counts = new Map<string | null, number>()
  for (const row of rows) {
    const raw = dim.get(row)
    const key = raw === null || raw === undefined || String(raw).trim() === '' ? null : String(raw)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const all = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    // Effectif décroissant, puis alphabétique pour que deux valeurs à égalité gardent un
    // ordre stable d'un rendu à l'autre.
    .sort((a, b) => b.count - a.count
      || String(a.value ?? '￿').localeCompare(String(b.value ?? '￿'), 'fr'))
  return { options: all.slice(0, max), truncated: all.length > max }
}

/** Bornes d'une colonne numérique, pour proposer une plage qui a du sens. `null` quand la
 *  colonne ne porte aucun nombre — l'écran propose alors autre chose qu'un curseur. */
export function numericRange(rows: Row[], dim: Dimension): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let seen = false
  for (const row of rows) {
    const raw = dim.get(row)
    // ⚠⚠ `Number(null)` et `Number('')` valent ZÉRO, et `Number.isFinite(0)` est vrai : sans
    // ce garde-fou, une colonne entièrement vide rendrait la plage « 0 – 0 », et une valeur
    // absente tirerait le minimum à zéro. Une absence n'est pas un zéro.
    if (raw === null || raw === undefined || String(raw).trim() === '') continue
    const n = Number(raw)
    if (!Number.isFinite(n)) continue
    seen = true
    if (n < min) min = n
    if (n > max) max = n
  }
  return seen ? { min, max } : null
}

/**
 * Le filtre, dit en une ligne — c'est le texte de la puce du bandeau.
 *
 * ⚠ Tout ce qui restreint la vue doit se lire : un filtre invisible fait mentir le chiffre
 * qu'il réduit. D'où une formulation systématiquement explicite, valeurs comprises.
 */
export function describeFilter(
  clause: FilterClause,
  fieldLabel: string,
  formatValue: (v: unknown) => string = (v) => String(v ?? ''),
): string {
  const v = clause.value
  switch (clause.op) {
    case 'eq':       return `${fieldLabel} : ${formatValue(v)}`
    case 'ne':       return `${fieldLabel} ≠ ${formatValue(v)}`
    case 'in': {
      const list = Array.isArray(v) ? v : []
      // Au-delà de trois valeurs, on compte plutôt que d'étaler : la puce doit rester lisible.
      if (list.length <= 3) return `${fieldLabel} : ${list.map(formatValue).join(', ')}`
      return `${fieldLabel} : ${list.length} valeurs`
    }
    case 'between': {
      const [a, b] = Array.isArray(v) ? v : [undefined, undefined]
      return `${fieldLabel} : ${formatValue(a)} – ${formatValue(b)}`
    }
    case 'gt':       return `${fieldLabel} > ${formatValue(v)}`
    case 'gte':      return `${fieldLabel} ≥ ${formatValue(v)}`
    case 'lt':       return `${fieldLabel} < ${formatValue(v)}`
    case 'lte':      return `${fieldLabel} ≤ ${formatValue(v)}`
    case 'contains': return `${fieldLabel} contient « ${formatValue(v)} »`
    case 'empty':    return `${fieldLabel} : non renseigné`
    case 'notEmpty': return `${fieldLabel} : renseigné`
  }
}

/**
 * Fusionne un filtre dans une liste existante. PUR.
 *
 * ⚠ Un même champ ne doit pas se retrouver filtré deux fois par le même opérateur : au
 * deuxième clic croisé sur une autre barre, l'utilisateur veut CHANGER de valeur, pas
 * ajouter une condition qui ne laisserait plus aucune ligne.
 */
export function upsertFilter(filters: FilterClause[], next: FilterClause): FilterClause[] {
  const rest = filters.filter((f) => !(f.field === next.field && f.op === next.op))
  return [...rest, next]
}

/** Retire un filtre, identifié par son champ ET son opérateur. */
export function removeFilter(filters: FilterClause[], field: string, op: FilterClause['op']): FilterClause[] {
  return filters.filter((f) => !(f.field === field && f.op === op))
}

/**
 * Bascule d'un filtre de sélection croisée : re-cliquer la valeur déjà filtrée la retire.
 * C'est ce qui rend le geste réversible sans passer par le bandeau.
 */
export function toggleCrossFilter(
  filters: FilterClause[], field: string, value: string | null,
): FilterClause[] {
  const current = filters.find((f) => f.field === field && f.op === 'eq')
  if (current && current.value === value) return removeFilter(filters, field, 'eq')
  return upsertFilter(filters, { field, op: 'eq', value })
}
