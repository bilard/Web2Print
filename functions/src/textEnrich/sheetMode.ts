// functions/src/textEnrich/sheetMode.ts
// ⚠ COPIE de src/features/textEnrich/sheetMode.ts (bundles séparés : `functions/` est hermétique,
// `rootDir: "src"`). Toute modification là-bas doit être reportée ici — cf.
// textEnrichParity.test.ts.
// L'enrichissement appliqué à une FEUILLE qui traverse le workflow, et non aux fiches
// d'un projet PIM. PUR.
//
// ⚠ Les deux modes ne se ressemblent qu'en surface. En mode PIM, la révision se pose sur
// le champ, la mémoire de l'original vit en base, et le marqueur rend le passage
// idempotent : relancer reprend là où on s'était arrêté. Ici, la feuille traverse le
// graphe et meurt à la fin du run : l'original est conservé par une COLONNE JUMELLE, et
// rien n'est persisté. Il n'y a donc pas d'idempotence — chaque exécution refait, et
// refacture, le même travail. C'est le comportement juste pour une donnée de passage,
// mais il doit être DIT, puisque la même carte est idempotente sur l'autre chemin.
import type { CellValue } from '../excel/types'
import type { EnrichTarget } from './pass'

/** Ligne de feuille, réduite à ce que l'enrichissement en regarde. */
export type SheetRow = Record<string, unknown>

/** Suffixe de la colonne qui garde le texte d'avant. */
const SOURCE_SUFFIX = ' (source)'

export function sourceColumnOf(key: string): string {
  return `${key}${SOURCE_SUFFIX}`
}

/**
 * Présente les lignes d'une feuille comme des cibles d'enrichissement.
 *
 * ⚠ L'identifiant est le `_id` de la ligne, qui vaut `row_<index>` — une POSITION, pas un
 * produit. C'est suffisant ici, et seulement ici : il ne sert qu'à rattacher une réponse
 * de modèle à sa ligne à l'intérieur d'un même run. L'employer pour relier deux imports
 * successifs serait faux, une ligne insérée décalant tout ce qui suit.
 */
export function sheetTargets(rows: SheetRow[], fields: string[]): EnrichTarget[] {
  return rows.map((row, i) => ({
    id: String(row._id ?? `row_${i}`),
    fields: Object.fromEntries(fields.map((key) => [key, {
      value: (row[key] ?? null) as CellValue,
      // Le calque de révision attend la forme d'un champ PIM ; une feuille n'a pas de
      // notion de source gagnante, d'où la chaîne vide.
      winningSourceId: '',
    }])),
    row: row as Record<string, CellValue>,
  }))
}

/**
 * Reconstruit les lignes enrichies.
 *
 * La colonne d'origine reçoit le texte retenu, et une colonne jumelle garde l'ancien —
 * dans cet ordre, pour que la feuille reste utilisable telle quelle en aval : un export
 * qui ne connaît que `nom` continue de fonctionner, et celui qui veut comparer trouve
 * `nom (source)` à côté. L'inverse (nouvelle colonne pour le texte enrichi) obligerait à
 * remapper tout ce qui est branché derrière.
 */
export function applySheetRevisions(
  rows: SheetRow[],
  revisions: { productId: string; field: string; before: CellValue; after: CellValue }[],
): SheetRow[] {
  const byRow = new Map<string, typeof revisions>()
  for (const r of revisions) {
    const list = byRow.get(r.productId)
    if (list) list.push(r)
    else byRow.set(r.productId, [r])
  }
  return rows.map((row, i) => {
    const mine = byRow.get(String(row._id ?? `row_${i}`))
    if (!mine || mine.length === 0) return row
    const next = { ...row }
    for (const r of mine) {
      next[sourceColumnOf(r.field)] = r.before
      next[r.field] = r.after
    }
    return next
  })
}

/** Colonne de feuille, réduite à ce dont l'aval a besoin. */
export interface SheetColumn { key: string; label?: string }

/**
 * Colonnes de la feuille de sortie : celles d'entrée, plus une jumelle par champ traité.
 *
 * ⚠ Des OBJETS, pas des chaînes. L'export Excel et l'aperçu de données cherchent `c.key` :
 * une liste de chaînes leur donne `undefined` partout, et la feuille sort sans en-têtes
 * ni cellules — après un passage payé. Les colonnes d'entrée sont donc reprises TELLES
 * QUELLES, avec leur libellé et leurs métadonnées.
 *
 * ⚠ La jumelle se place JUSTE APRÈS sa colonne d'origine, pas en fin de feuille. Sur les
 * quatorze colonnes d'un catalogue, un « nom (source) » relégué au bout oblige à faire
 * défiler pour comparer deux textes qui ne tiennent déjà pas dans une cellule.
 */
export function sheetColumnsWithSources<T extends SheetColumn>(
  columns: T[],
  fields: string[],
): (T | SheetColumn)[] {
  const touched = new Set(fields)
  const present = new Set(columns.map((c) => c.key))
  const out: (T | SheetColumn)[] = []
  for (const c of columns) {
    out.push(c)
    // Une feuille déjà passée par la carte porte la jumelle : ne pas la doubler.
    if (touched.has(c.key) && !present.has(sourceColumnOf(c.key))) {
      out.push({ key: sourceColumnOf(c.key), label: sourceColumnOf(c.label ?? c.key) })
    }
  }
  return out
}
