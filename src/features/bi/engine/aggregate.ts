// Filtrer → grouper → mesurer → trier. PUR : aucun accès réseau, aucun rendu, aucun React.
import { BiKeyedError, isDerivedMeasure, measureKey, type FilterClause, type MeasureRef, type QuerySpec } from '../types'
import { allowedAggregations } from '../registry/aggregations'
import { measureOf } from '../registry/deriveMeasures'
import type { DataSource, Dimension, Measure, MeasureFormat, Row } from '../registry/types'
import type { TranslationKey } from '@/lib/i18n'

interface ResultColumn {
  key: string
  /** ⚠ Typée : sans quoi chaque composant consommateur casterait à l'affichage, et un
   *  libellé absent du catalogue passerait sans bruit. `labelKey` sert aux libellés du
   *  catalogue i18n ; `label` (ci-dessous) aux noms qui viennent de la DONNÉE (une colonne
   *  de feuille) — le consommateur préfère `label` quand il est présent. */
  labelKey: TranslationKey
  label?: string
  /** Nom de la colonne agrégée quand il vient du catalogue i18n (source déclarée en dur) et
   *  non de la donnée. Repris de `Measure.columnKey` — sans lui, une mesure dérivée d'une
   *  source de veille s'afficherait « Somme », sans dire de quoi. */
  columnKey?: TranslationKey
  role: 'dimension' | 'measure'
  format?: MeasureFormat
  /**
   * Reprend `Measure.aggregable` : une médiane ou un pourcentage ne se recompose pas entre
   * groupes. ⚠⚠ À lire ici et JAMAIS à déduire du `format` : `pim.freshnessDays` est un
   * `float` non agrégeable, `pim.filled` un `int` agrégeable. Un consommateur qui somme
   * sans regarder ce drapeau affiche « Total 312 % ».
   */
  aggregable?: boolean
}
type ResultRow = Record<string, string | number | null>
export interface AggregateResult { columns: ResultColumn[]; rows: ResultRow[] }

/** Clé de regroupement d'une valeur de temps. ⚠ En UTC, comme tous les compteurs mensuels
 *  de l'application — sans quoi une ligne changerait de mois selon le fuseau du lecteur. */
function bucketOf(value: unknown, bucket: 'day' | 'week' | 'month'): string | null {
  const ms = value instanceof Date ? value.getTime() : Number(value)
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  if (bucket === 'month') return `${yyyy}-${mm}`
  if (bucket === 'day') return `${yyyy}-${mm}-${String(d.getUTCDate()).padStart(2, '0')}`
  // Semaine ISO : le lundi de la semaine porte la clé, c'est lisible et ordonnable.
  const day = (d.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(yyyy, d.getUTCMonth(), d.getUTCDate() - day))
  return monday.toISOString().slice(0, 10)
}

function matches(row: Row, f: FilterClause, dim: Dimension | undefined): boolean {
  const v = dim ? dim.get(row) : row[f.field]
  const s = v == null ? '' : String(v).toLowerCase()
  const n = Number(v)
  switch (f.op) {
    case 'eq':       return v === f.value || s === String(f.value ?? '').toLowerCase()
    case 'ne':       return !(v === f.value || s === String(f.value ?? '').toLowerCase())
    case 'in':       return Array.isArray(f.value) && f.value.some((x) => String(x).toLowerCase() === s)
    case 'gt':       return n > Number(f.value)
    case 'gte':      return n >= Number(f.value)
    case 'lt':       return n < Number(f.value)
    case 'lte':      return n <= Number(f.value)
    case 'contains': return s.includes(String(f.value ?? '').toLowerCase())
    case 'between':  return Array.isArray(f.value) && n >= Number(f.value[0]) && n <= Number(f.value[1])
    case 'empty':    return v == null || s === ''
    case 'notEmpty': return !(v == null || s === '')
  }
}

/** Valeur de groupe d'une ligne pour une dimension. `null` = valeur ABSENTE — un groupe à
 *  part entière, jamais fondue dans une autre ni écartée : la somme des groupes doit
 *  toujours valoir le total général. */
function groupValue(row: Row, dim: Dimension, bucket?: 'day' | 'week' | 'month'): string | null {
  const raw = dim.get(row)
  if (raw == null || raw === '') return null
  if (dim.kind === 'date' && bucket) return bucketOf(raw, bucket)
  return String(raw)
}

/**
 * Une `MeasureRef` → la mesure à exécuter. Les DEUX formes passent par ici :
 * - `{ id }` : une mesure DÉCLARÉE par la source (fonction pure qui fait déjà autorité) ;
 * - `{ field, agg }` : une mesure DÉRIVÉE d'une colonne, calculée par le noyau du registre.
 *
 * ⚠ La source dérive DÉJÀ ses colonnes (`pimSourceFromSheet`) : on l'y cherche d'abord, ce
 * qui conserve le libellé, l'unité et le drapeau d'agrégeabilité qu'elle a posés. Le repli
 * ne sert qu'aux sources qui exposent une colonne en dimension sans en dériver les mesures.
 */
function resolveMeasure(ref: MeasureRef, source: DataSource, dimById: Map<string, Dimension>): Measure {
  const id = isDerivedMeasure(ref) ? `${ref.agg}:${ref.field}` : ref.id
  const declared = source.measures.find((x) => x.id === id)
  if (declared) return declared
  // ⚠⚠ Jamais de repli à zéro : un zéro se lit comme une donnée, une erreur se corrige.
  if (!isDerivedMeasure(ref)) throw new Error(`Mesure inconnue pour cette source : ${ref.id}`)
  const dim = dimById.get(ref.field)
  // ⚠⚠ Le cas RÉEL : une tuile bâtie sur une feuille, rouverte avec une autre feuille active
  // qui n'a pas cette colonne (cf. `sourceSheetName`). Le dire, plutôt que rendre « — ».
  if (!dim) throw new BiKeyedError('bi.error.unknownColumn', { column: ref.field })
  if (!allowedAggregations(dim.kind).includes(ref.agg)) {
    throw new BiKeyedError('bi.error.aggNotAllowed', { column: dim.label ?? ref.field })
  }
  // ⚠ Le nom de la colonne suit sa PROVENANCE : `label` quand il vient de la donnée (feuille),
  // sinon la clé de catalogue de la dimension. Poser `label: ref.field` en repli afficherait
  // « Somme · medGapPct » — un identifiant technique en pleine tuile.
  // ⚠ L'unité de la dimension est transmise : sans elle, la moyenne d'un taux repassait
  // agrégeable et une tuile pouvait de nouveau la totaliser entre groupes.
  return measureOf({
    key: ref.field, kind: dim.kind, format: dim.format,
    label: dim.label, labelKey: dim.label ? undefined : dim.labelKey,
  }, ref.agg)
}

export function aggregate(rows: Row[], query: QuerySpec, source: DataSource): AggregateResult {
  const dimById = new Map(source.dimensions.map((d) => [d.id, d]))
  const measures = query.measures.map((ref) => ({ ref, m: resolveMeasure(ref, source, dimById) }))

  const columns: ResultColumn[] = [
    ...query.dimensions.map((d) => {
      const dim = dimById.get(d.id)
      // ⚠ Même règle que pour les mesures : une dimension inconnue lève plutôt que de
      // se rabattre sur son id brut, qui n'est pas une clé de traduction valide.
      if (!dim) throw new Error(`Dimension inconnue pour cette source : ${d.id}`)
      return { key: d.id, labelKey: dim.labelKey, label: dim.label, role: 'dimension' as const }
    }),
    ...measures.map(({ ref, m }) => ({
      key: measureKey(ref), labelKey: m.labelKey, label: m.label, columnKey: m.columnKey,
      role: 'measure' as const,
      format: m.format, aggregable: m.aggregable,
    })),
  ]

  const kept = query.filters.length
    ? rows.filter((r) => query.filters.every((f) => matches(r, f, dimById.get(f.field))))
    : rows

  // Sans dimension : une seule ligne de totaux (le cas des tuiles KPI).
  if (query.dimensions.length === 0) {
    if (kept.length === 0) return { columns, rows: [] }
    const line: ResultRow = {}
    for (const { ref, m } of measures) line[measureKey(ref)] = m.compute(kept)
    return { columns, rows: [line] }
  }

  const groups = new Map<string, { keys: (string | null)[]; rows: Row[] }>()
  for (const row of kept) {
    const keys = query.dimensions.map((d) => {
      const dim = dimById.get(d.id)
      if (!dim) throw new Error(`Dimension inconnue pour cette source : ${d.id}`)
      return groupValue(row, dim, d.bucket)
    })
    const k = JSON.stringify(keys)
    const g = groups.get(k) ?? { keys, rows: [] }
    g.rows.push(row)
    groups.set(k, g)
  }

  let out: ResultRow[] = [...groups.values()].map(({ keys, rows: gr }) => {
    const line: ResultRow = {}
    query.dimensions.forEach((d, i) => { line[d.id] = keys[i] })
    // ⚠ Chaque mesure est calculée sur les LIGNES du groupe. Une médiane ne se recompose
    // pas depuis les médianes de sous-groupes — d'où le passage des lignes, pas des totaux.
    for (const { ref, m } of measures) line[measureKey(ref)] = m.compute(gr)
    return line
  })

  if (query.sort?.length) {
    const [s] = query.sort
    out.sort((a, b) => {
      const av = a[s.by], bv = b[s.by]
      // Les valeurs absentes vont en fin de liste, quel que soit le sens du tri.
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv : String(av).localeCompare(String(bv), 'fr')
      return s.dir === 'desc' ? -cmp : cmp
    })
  } else {
    out.sort((a, b) => String(a[query.dimensions[0].id] ?? '￿')
      .localeCompare(String(b[query.dimensions[0].id] ?? '￿'), 'fr'))
  }

  if (query.limit) out = out.slice(0, query.limit)
  return { columns, rows: out }
}
