// Lecture d'un Google Sheet par l'API `values`, SANS export binaire.
//
// Pourquoi ce second chemin : `files/{id}/export?mimeType=…xlsx` est plafonné par Google à
// ~10 Mo. Le catalogue F1 (75 000 lignes) l'a franchi le jour où il a gagné quelques
// colonnes — l'import tombait alors en « HTTP 403 » alors que le fichier était parfaitement
// accessible. L'API `values` ne connaît pas ce plafond, ne réclame pas SheetJS, et ne
// transporte qu'UN onglet au lieu du classeur entier.
//
// ⚠ JUMEAU de `functions/src/workflow/nodes/google.ts` (bundles séparés) : le serveur lit
// déjà de cette façon depuis juillet 2026 pour le cron. Le nommage des colonnes doit rester
// IDENTIQUE des deux côtés, sinon « Comparer catalogue » ne retrouve plus ses colonnes selon
// que le run vient du navigateur ou de la nuit.
import type { CellValue, ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'
import { detectColumnType } from '@/features/excel/fieldDetection'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

/**
 * Reproduit le nommage de colonnes de SheetJS `sheet_to_json` sur la ligne d'en-tête :
 * clé = en-tête, doublons suffixés `_1`/`_2`, en-tête vide → `__EMPTY[_N]`. C'est ce qui
 * rend les deux chemins de lecture interchangeables pour les nodes en aval.
 */
export function sheetKeysFromHeader(header: unknown[]): string[] {
  const seen = new Map<string, number>()
  let emptyIdx = 0
  return header.map((cell) => {
    const raw = cell == null ? '' : String(cell).trim()
    if (raw === '') {
      const key = emptyIdx === 0 ? '__EMPTY' : `__EMPTY_${emptyIdx}`
      emptyIdx++
      return key
    }
    const n = seen.get(raw) ?? 0
    seen.set(raw, n + 1)
    return n === 0 ? raw : `${raw}_${n}`
  })
}

/** Matrice `values` → feuille exploitable. Les lignes entièrement vides sont ignorées,
 *  comme le fait `sheet_to_json`. PUR : c'est la partie qu'un test peut vérifier. */
export function matrixToSheet(matrix: unknown[][], name: string): ExcelSheet {
  const keys = sheetKeysFromHeader(matrix[0] ?? [])
  const rows: ExcelRow[] = []
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? []
    if (cells.every((c) => c == null || String(c).trim() === '')) continue
    const row: ExcelRow = { _id: `row_${rows.length}` }
    for (let c = 0; c < keys.length; c++) row[keys[c]] = (cells[c] ?? null) as CellValue
    rows.push(row)
  }
  // Type détecté sur un ÉCHANTILLON : le chemin XLSX type ses colonnes, celui-ci doit le
  // faire aussi — sinon un prix s'affiche et s'exporte comme du texte selon le chemin
  // emprunté. Quelques centaines de lignes suffisent à trancher, 75 000 coûteraient cher.
  const sample = rows.slice(0, 500)
  const columns: ExcelColumn[] = keys.map((key, i) => {
    const detected = detectColumnType(sample.map((row) => row[key] as CellValue))
    return { key, label: key, fieldType: detected, detectedType: detected, isPrimary: i === 0, width: 150 }
  })
  return { name, columns, rows, taxonomy: [] }
}

/** Onglets du classeur, dans l'ordre d'affichage. */
async function listSheetTabs(id: string, token: string): Promise<string[]> {
  const res = await fetch(`${SHEETS_API}/${id}?fields=sheets.properties(title,index)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Sheets : lecture des onglets impossible (HTTP ${res.status} — ${(await res.text().catch(() => '')).slice(0, 160)})`)
  }
  const json = (await res.json()) as { sheets?: { properties?: { title?: string; index?: number } }[] }
  return (json.sheets ?? [])
    .map((s) => ({ title: s.properties?.title ?? 'Sheet1', index: s.properties?.index ?? 0 }))
    .sort((a, b) => a.index - b.index)
    .map((s) => s.title)
}

/**
 * Ligne d'EN-TÊTE d'un onglet, et rien d'autre (range `1:1`).
 *
 * Sert à l'éditeur : sans elle, les colonnes d'une feuille ne sont connues qu'APRÈS un run
 * complet — on configurait donc les nodes en aval contre les colonnes de l'avant-dernière
 * version du fichier, sans que rien ne le signale. Une requête, une ligne transférée.
 */
export async function readGoogleSheetHeader(
  id: string, token: string, sheetIndex = 0,
): Promise<{ tab: string; columns: string[] }> {
  const tabs = await listSheetTabs(id, token)
  if (tabs.length === 0) throw new Error('Sheets : ce classeur ne contient aucun onglet.')
  const title = tabs[Math.max(0, Math.min(sheetIndex, tabs.length - 1))]
  const res = await fetch(
    `${SHEETS_API}/${id}/values/${encodeURIComponent(`${title}!1:1`)}?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    throw new Error(`Sheets : lecture de l'en-tête impossible (HTTP ${res.status} — ${(await res.text().catch(() => '')).slice(0, 160)})`)
  }
  const matrix = ((await res.json()) as { values?: unknown[][] }).values ?? []
  return { tab: title, columns: sheetKeysFromHeader(matrix[0] ?? []) }
}

/** Lit UN onglet (par position) sans passer par l'export XLSX. */
export async function readGoogleSheetTab(
  id: string, token: string, sheetIndex = 0,
): Promise<ExcelSheet> {
  const tabs = await listSheetTabs(id, token)
  if (tabs.length === 0) throw new Error('Sheets : ce classeur ne contient aucun onglet.')
  const title = tabs[Math.max(0, Math.min(sheetIndex, tabs.length - 1))]
  // UNFORMATTED_VALUE : les nombres restent des nombres (un prix « 12,40 € » lu en texte
  // ferait échouer toutes les comparaisons de prix en aval).
  const res = await fetch(
    `${SHEETS_API}/${id}/values/${encodeURIComponent(title)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    throw new Error(`Sheets : lecture de l'onglet « ${title} » impossible (HTTP ${res.status} — ${(await res.text().catch(() => '')).slice(0, 160)})`)
  }
  const matrix = ((await res.json()) as { values?: unknown[][] }).values ?? []
  if (matrix.length === 0) throw new Error(`Sheets : l'onglet « ${title} » est vide.`)
  return matrixToSheet(matrix, title)
}
