// Export d'un tableau de bord en classeur : une feuille par tuile, plus une feuille de tête
// qui dit CE QUI A ÉTÉ EXPORTÉ.
//
// ⚠⚠ Un export qui tait ses filtres est un piège : le fichier circule, on lit « 22 143 » sans
// savoir qu'un filtre de concurrent était posé, et le chiffre se met à voyager faux. La
// feuille de tête porte donc la source, la date du relevé et chaque filtre en toutes lettres.
import * as XLSX from 'xlsx'
import type { AggregateResult } from '../engine/aggregate'

export interface ExportedTile {
  title: string
  result: AggregateResult
  /** En-têtes déjà traduits, dans l'ordre des colonnes du résultat. */
  headers: string[]
}

export interface ExportContext {
  boardName: string
  sourceLabel: string
  /** Filtres actifs, déjà décrits en français (cf. `describeFilter`). */
  filters: string[]
  /** Horodatage du relevé, au format déjà localisé par l'appelant. */
  takenAt: string
}

/** Excel refuse un nom d'onglet de plus de 31 caractères, ou portant `[]:*?/\`. */
function sheetName(title: string, index: number): string {
  const clean = title.replace(/[[\]:*?/\\]/g, ' ').trim() || `Tuile ${index + 1}`
  return clean.length <= 31 ? clean : `${clean.slice(0, 28)}…`
}

/** Deux tuiles peuvent porter le même titre : Excel, lui, refuse deux onglets homonymes. */
function uniqueNames(tiles: ExportedTile[]): string[] {
  const used = new Set<string>()
  return tiles.map((t, i) => {
    const base = sheetName(t.title, i)
    let name = base
    let n = 2
    while (used.has(name)) {
      const suffix = ` (${n++})`
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`
    }
    used.add(name)
    return name
  })
}

/** Le classeur, prêt à écrire. Séparé de l'écriture du fichier pour être testable. */
export function buildWorkbook(tiles: ExportedTile[], ctx: ExportContext): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  // Feuille de tête : ce que le lecteur doit savoir avant de croire les chiffres.
  const head: string[][] = [
    ['Tableau de bord', ctx.boardName],
    ['Source', ctx.sourceLabel],
    ['Relevé', ctx.takenAt],
    [],
    ['Filtres actifs'],
    ...(ctx.filters.length ? ctx.filters.map((f) => ['', f]) : [['', 'Aucun']]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(head), 'Lecture')

  const names = uniqueNames(tiles)
  tiles.forEach((tile, i) => {
    const { result, headers } = tile
    const rows = result.rows.map((row) =>
      // ⚠ Les valeurs partent BRUTES, pas formatées : « 1 299,90 € » arriverait en texte dans
      // Excel et ne se sommerait plus. Le formatage est une affaire d'écran.
      result.columns.map((c) => {
        const v = row[c.key]
        return v === null || v === undefined ? '' : v
      }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), names[i])
  })
  return wb
}

export function exportBoardToXlsx(tiles: ExportedTile[], ctx: ExportContext): void {
  const wb = buildWorkbook(tiles, ctx)
  const stamp = ctx.takenAt.replace(/[^\d]/g, '').slice(0, 12)
  XLSX.writeFile(wb, `${sheetName(ctx.boardName, 0)}-${stamp}.xlsx`)
}
