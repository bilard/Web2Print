// Le NOYAU de calcul des mesures dérivées d'une colonne. PUR : ni React, ni réseau, ni i18n.
//
// ⚠⚠ Un seul exemplaire de ces règles pour tout le module : `deriveMeasures` (ce que le menu
// propose) et `aggregate` (ce que le moteur exécute) l'appellent tous les deux. Deux
// implémentations divergeraient, et un chiffre faux ne se voit pas.
import { toFiniteNumber } from '@/lib/numberValue'
import { AGGREGATIONS, type Aggregation } from '../types'
import type { FieldKind, MeasureFormat, Row } from './types'

interface AggregationTrait {
  /** Format d'affichage par défaut ; une colonne typée (monnaie, pourcentage) le surcharge. */
  format: MeasureFormat
  /**
   * `false` = ne se recompose pas entre groupes. ⚠ Une médiane de médianes et une moyenne de
   * pourcentages ne veulent rien dire : l'interface refuse de les totaliser (spec, D1).
   */
  aggregable: boolean
  /** Réservée aux colonnes numériques : sommer des libellés n'a aucun sens. */
  numericOnly: boolean
  /** `true` si l'agrégation rend une valeur DE LA COLONNE (donc dans son unité). */
  keepsUnit: boolean
}

const TRAITS: Record<Aggregation, AggregationTrait> = {
  count:         { format: 'int',   aggregable: true,  numericOnly: false, keepsUnit: false },
  countDistinct: { format: 'int',   aggregable: true,  numericOnly: false, keepsUnit: false },
  filledPct:     { format: 'pct',   aggregable: false, numericOnly: false, keepsUnit: false },
  sum:           { format: 'float', aggregable: true,  numericOnly: true,  keepsUnit: true },
  avg:           { format: 'float', aggregable: true,  numericOnly: true,  keepsUnit: true },
  median:        { format: 'float', aggregable: false, numericOnly: true,  keepsUnit: true },
  min:           { format: 'float', aggregable: true,  numericOnly: true,  keepsUnit: true },
  max:           { format: 'float', aggregable: true,  numericOnly: true,  keepsUnit: true },
}

export const isAggregable = (agg: Aggregation): boolean => TRAITS[agg].aggregable

/** Format d'une mesure dérivée : l'unité de la colonne quand l'agrégation la conserve. */
export function aggregationFormat(agg: Aggregation, columnFormat?: MeasureFormat): MeasureFormat {
  return TRAITS[agg].keepsUnit && columnFormat ? columnFormat : TRAITS[agg].format
}

/** Agrégations que le TYPE de la colonne autorise. */
export function allowedAggregations(kind: FieldKind): Aggregation[] {
  return AGGREGATIONS.filter((a) => !TRAITS[a].numericOnly || kind === 'number')
}

/**
 * Agrégations que le type ET L'UNITÉ de la colonne autorisent.
 *
 * ⚠⚠ La SOMME d'une colonne en POURCENTAGE n'est jamais proposée : additionner des taux ne
 * produit aucune grandeur. Sans ce filtre, dériver les colonnes de la veille mettait
 * « Somme · Écart médian (%) » dans le menu — exactement le geste que tout ce module
 * s'emploie à interdire (vingt-quatre concurrents totalisés à « −312 % »).
 *
 * ⚠ Le MOTEUR, lui, reste permissif (`allowedAggregations`) : une tuile déjà enregistrée qui
 * somme une colonne de pourcentage doit continuer de rendre son chiffre plutôt que de tomber
 * en erreur à la réouverture. Ce qui n'est plus OFFERT ne peut plus être créé, ce qui l'a été
 * continue de vivre.
 */
export function allowedAggregationsFor(kind: FieldKind, format?: MeasureFormat): Aggregation[] {
  return allowedAggregations(kind).filter((a) => !(format === 'pct' && a === 'sum'))
}

/**
 * Une mesure dérivée se recompose-t-elle ENTRE groupes ?
 *
 * ⚠⚠ Une agrégation qui rend une valeur DE la colonne (somme, moyenne, médiane, extrema)
 * hérite de son unité — donc de sa non-additivité : moyenne, minimum ou maximum d'un
 * POURCENTAGE ne se totalisent pas davantage qu'une médiane. Le décompte des lignes, lui,
 * reste additif quelle que soit l'unité de la colonne comptée.
 */
export function isAggregableFor(agg: Aggregation, format?: MeasureFormat): boolean {
  if (!TRAITS[agg].aggregable) return false
  return !(TRAITS[agg].keepsUnit && format === 'pct')
}

/** Valeur PRÉSENTE ? Une chaîne d'espaces ne l'est pas — même règle que la complétude. */
const isPresent = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== ''

/** Les nombres LISIBLES de la colonne. ⚠ Les autres sont ÉCARTÉS, jamais comptés zéro :
 *  une moyenne sur trois valeurs dont une vide se divise par deux, pas par trois. */
function numbersOf(rows: Row[], field: string): number[] {
  const out: number[] = []
  for (const r of rows) {
    const n = toFiniteNumber(r[field])
    if (n !== null) out.push(n)
  }
  return out
}

/** ⚠ Effectif PAIR : moyenne des deux valeurs centrales, sinon la médiane sauterait d'un cran. */
function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length / 2
  return s.length % 2 === 1 ? s[Math.floor(mid)] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Applique une agrégation à une colonne, sur les lignes d'un groupe.
 *
 * ⚠⚠ Rend `null` — jamais 0 — quand la valeur n'existe pas (aucun nombre lisible pour une
 * moyenne, un minimum, une médiane). Un zéro se lirait comme une donnée ; `formatMeasure`
 * affiche « — » pour un `null`. Seule la SOMME de rien vaut 0, ce qui est vrai.
 */
export function computeAggregation(rows: Row[], field: string, agg: Aggregation): number | null {
  switch (agg) {
    case 'count':
      return rows.reduce((n, r) => (isPresent(r[field]) ? n + 1 : n), 0)
    case 'countDistinct': {
      // ⚠ L'ABSENCE n'est pas une valeur : elle ne compte pas comme une modalité distincte.
      const seen = new Set<string>()
      for (const r of rows) if (isPresent(r[field])) seen.add(String(r[field]).trim())
      return seen.size
    }
    case 'filledPct': {
      if (!rows.length) return null
      return (rows.reduce((n, r) => (isPresent(r[field]) ? n + 1 : n), 0) / rows.length) * 100
    }
    case 'sum':
      return numbersOf(rows, field).reduce((n, v) => n + v, 0)
    case 'avg': {
      const v = numbersOf(rows, field)
      return v.length ? v.reduce((n, x) => n + x, 0) / v.length : null
    }
    case 'median':
      return median(numbersOf(rows, field))
    case 'min': {
      const v = numbersOf(rows, field)
      return v.length ? Math.min(...v) : null
    }
    case 'max': {
      const v = numbersOf(rows, field)
      return v.length ? Math.max(...v) : null
    }
  }
}
