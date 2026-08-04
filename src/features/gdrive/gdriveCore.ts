// Helpers non-React pour l'API Google Drive / Google Sheets, utilisés par les
// nodes de workflow. Lecture (drive.readonly) ET écriture (drive.file) supposées
// granted via le flow OAuth de useGoogleDrive / useGoogleSheetsImport.

import type { ExcelSheet } from '@/features/excel/types'
import { cellValue } from '@/features/excel/cellValue'
// xlsx (~484 Ko) et parseExcelFile chargés dynamiquement dans les fonctions GSheets :
// sinon ils cascadent chez tout consommateur de gdriveCore (nodes Drive, etc.).

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

const SHEETS_MIME = 'application/vnd.google-apps.spreadsheet'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface DriveFileMeta {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
}

export class GoogleAuthMissingError extends Error {
  constructor(msg = 'Google Drive non connecté — connectez-vous depuis le panneau Google Drive avant de lancer ce node.') {
    super(msg)
    this.name = 'GoogleAuthMissingError'
  }
}

/** Récupère les métadonnées d'un fichier Drive. */
async function getDriveFileMeta(fileId: string, token: string): Promise<DriveFileMeta> {
  const params = new URLSearchParams({ fields: 'id,name,mimeType,webViewLink' })
  const res = await fetch(`${DRIVE_API}/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Drive : impossible de lire le fichier ${fileId} (HTTP ${res.status}${detail ? ` — ${detail.slice(0, 120)}` : ''})`)
  }
  return (await res.json()) as DriveFileMeta
}

/** Télécharge un fichier Drive en File. Pour un Google Sheets, exporte en XLSX
 *  (Drive convertit automatiquement). Pour un fichier "natif" (PDF, image…),
 *  télécharge le binaire via alt=media. */
export async function downloadDriveFile(fileId: string, token: string): Promise<File> {
  const meta = await getDriveFileMeta(fileId, token)

  let blob: Blob
  let filename = meta.name
  let mime = meta.mimeType

  if (meta.mimeType === SHEETS_MIME) {
    // Google Sheets → export XLSX
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) {
      throw new Error(`Drive : export GSheet échoué (HTTP ${res.status})`)
    }
    blob = await res.blob()
    if (!/\.xlsx$/i.test(filename)) filename = `${filename}.xlsx`
    mime = XLSX_MIME
  } else if (meta.mimeType.startsWith('application/vnd.google-apps.')) {
    throw new Error(
      `Drive : le type natif Google "${meta.mimeType}" n'est pas supporté en download direct. Utilisez "Import GSheet" pour les Sheets.`,
    )
  } else {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`Drive : download échoué (HTTP ${res.status})`)
    }
    blob = await res.blob()
  }

  return new File([blob], filename, { type: mime })
}

/** Importe un Google Sheet par ID → ExcelSheet (premier onglet). */
export async function importGoogleSheetById(sheetId: string, token: string): Promise<ExcelSheet[]> {
  const meta = await getDriveFileMeta(sheetId, token)
  if (meta.mimeType !== SHEETS_MIME) {
    throw new Error(`Le fichier ${meta.name} n'est pas un Google Sheets (mimeType=${meta.mimeType}).`)
  }
  const res = await fetch(
    `${DRIVE_API}/files/${sheetId}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    throw new Error(`Drive : export GSheet "${meta.name}" échoué (HTTP ${res.status})`)
  }
  const blob = await res.blob()
  const file = new File([blob], `${meta.name}.xlsx`, { type: XLSX_MIME })
  const { parseExcelFile } = await import('@/features/excel/useExcelImport')
  const sheets = await parseExcelFile(file)
  if (sheets.length === 0) {
    throw new Error(`Le Google Sheet "${meta.name}" est vide.`)
  }
  return sheets
}

/** Colonne-formule Google Sheets : `template` peut référencer une colonne par son
 *  nom entre accolades, ex. `{price} - {price_concurrent}` → résolu en `=C2-D2`
 *  par ligne (lettre de colonne + numéro de ligne). Un `=` initial est optionnel. */
export interface FormulaColumn {
  header: string
  template: string
  /** Format de sortie Google Sheets (clé ; '' = auto). Cf. Z_BY_FORMAT / serveur. */
  format?: string
}

/** Résout un template de formule pour une ligne donnée : retire un `=` initial et
 *  remplace chaque `{nom}` par la lettre de colonne + le numéro de ligne tableur. */
export function resolveFormula(
  template: string,
  letterByName: (name: string) => string | null,
  sheetRow: number,
): string {
  return template
    .replace(/^=/, '')
    .replace(/\{([^}]+)\}/g, (_m, name: string) => {
      const letter = letterByName(name.trim())
      return letter ? `${letter}${sheetRow}` : name
    })
}

/** Codes de format Excel (z) par format de colonne — alignés sur FORMULA_FORMATS serveur. */
const Z_BY_FORMAT: Record<string, string> = {
  text: '@',
  number: '#,##0.00',
  percent: '0.00%',
  scientific: '0.00E+00',
  currency: '#,##0.00 €',
  currency_round: '#,##0 €',
  accounting: '#,##0.00 €;(#,##0.00 €)',
  date: 'dd/mm/yyyy',
  time: 'hh:mm:ss',
  datetime: 'dd/mm/yyyy hh:mm:ss',
  duration: '[h]:mm:ss',
}

/** Cellule-formule XLSX exploitable par Google Sheets : une valeur en cache (`v`)
 *  est OBLIGATOIRE — sans elle, la cellule est de type « erreur » et s'importe vide.
 *  Google recalcule à l'ouverture ; `v:0` n'est qu'un placeholder. `z` = format choisi
 *  par l'utilisateur, sinon date auto pour NOW/TODAY/DATE. */
export function buildFormulaCell(resolved: string, format?: string): { t: 'n'; f: string; v: number; z?: string } {
  const cell: { t: 'n'; f: string; v: number; z?: string } = { t: 'n', f: resolved, v: 0 }
  if (format && Z_BY_FORMAT[format]) {
    cell.z = Z_BY_FORMAT[format]
  } else {
    const up = resolved.toUpperCase()
    if (up.includes('NOW(')) cell.z = 'yyyy-mm-dd hh:mm'
    else if (up.includes('TODAY(') || up.includes('DATE(')) cell.z = 'yyyy-mm-dd'
  }
  return cell
}

/** Format Excel (`z`) déduit d'une colonne — MÊME logique que `detectColumnFormat`
 *  serveur (functions/src/workflow/nodes/google.ts) mais en codes XLSX. `text:true`
 *  = forcer en texte (EAN/réf/codes longs : sinon notation scientifique). */
function detectColumnFormat(key: string, label: string, values: unknown[]): { z: string | null; text: boolean } {
  const hint = `${key} ${label}`.toLowerCase()
  const vals = values.map((v) => String(v ?? '').trim()).filter(Boolean)
  if (/\b(ean|gtin|upc|isbn|sku|ref|reference|référence|code|mpn)\b/.test(hint)) return { z: '@', text: true }
  if (/(%|pourcent|\bpct\b|ecart_pct)/.test(hint)) return { z: '0.00"%"', text: false }
  if (/(prix|price|montant|tarif|co[uû]t|cost|devise|€|\beur\b)/.test(hint)) return { z: '#,##0.00 €', text: false }
  if (vals.length === 0) return { z: null, text: false }
  const isNum = (s: string) => /^-?\d+(?:[.,]\d+)?$/.test(s)
  if (vals.every(isNum)) {
    if (vals.every((v) => /^\d{12,}$/.test(v))) return { z: '@', text: true } // identifiant long
    return { z: '#,##0.##', text: false }
  }
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)
  if (vals.every(isDate)) return { z: 'dd/mm/yyyy', text: false }
  return { z: null, text: false }
}

/** Chaîne PUREMENT numérique → nombre, sinon null. Strict (pas de strip de lettres) :
 *  « 177.49 »/« 177,49 » → 177.49 ; « castorama.fr »/« v2 »/« plus cher » → null. */
function numericString(s: string): number | null {
  const t = s.trim()
  if (!/^-?\d+(?:[.,]\d+)?$/.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// --- Graphe natif Google Sheets (addChart) ---------------------------------
// Insère un graphe ÉDITABLE dans le Sheet via l'API batchUpdate (≠ image). Parité
// avec le serveur (functions/src/workflow/nodes/google.ts) : même builder de requête.
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

/** Pose le fuseau horaire du document (formules/dates internes au Sheet) sur
 *  Europe/Paris. N'affecte PAS la colonne « Date de modification » de la liste
 *  Drive (horodatage système UTC rendu par l'UI). Non bloquant. */
async function setSpreadsheetTimeZone(token: string, spreadsheetId: string, timeZone = 'Europe/Paris'): Promise<void> {
  await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ updateSpreadsheetProperties: { properties: { timeZone }, fields: 'timeZone' } }] }),
  })
}

export interface SheetChartOptions {
  /** 'bar' | 'line' | 'area' | 'pie' | 'doughnut'. */
  type: string
  /** Colonne d'axe X (clé ou libellé). */
  xColumn: string
  /** Colonnes de valeurs (clés/libellés séparés par des virgules). */
  valueColumns: string
}

interface ResolvedChart {
  gid: number
  chartType: string
  xColIndex: number
  valueColIndices: number[]
  rowCount: number
  anchorColIndex: number
  title: string
}

/** Plage d'une colonne (en-tête incluse, headerCount=1). */
function gridRange(gid: number, colIndex: number, rowCount: number) {
  return {
    sheetId: gid,
    startRowIndex: 0,
    endRowIndex: rowCount + 1,
    startColumnIndex: colIndex,
    endColumnIndex: colIndex + 1,
  }
}

/** Construit la requête `addChart` (basicChart pour bar/line/area, pieChart pour pie/doughnut). */
function buildChartRequest(o: ResolvedChart): Record<string, unknown> {
  const isPie = o.chartType === 'pie' || o.chartType === 'doughnut'
  const position = {
    overlayPosition: {
      anchorCell: { sheetId: o.gid, rowIndex: 1, columnIndex: o.anchorColIndex },
      offsetXPixels: 0, offsetYPixels: 0, widthPixels: 600, heightPixels: 371,
    },
  }
  if (isPie) {
    return {
      addChart: {
        chart: {
          spec: {
            title: o.title,
            pieChart: {
              legendPosition: 'RIGHT_LEGEND',
              pieHole: o.chartType === 'doughnut' ? 0.4 : 0,
              domain: { sourceRange: { sources: [gridRange(o.gid, o.xColIndex, o.rowCount)] } },
              series: { sourceRange: { sources: [gridRange(o.gid, o.valueColIndices[0], o.rowCount)] } },
            },
          },
          position,
        },
      },
    }
  }
  const BASIC: Record<string, string> = { bar: 'COLUMN', line: 'LINE', area: 'AREA' }
  return {
    addChart: {
      chart: {
        spec: {
          title: o.title,
          basicChart: {
            chartType: BASIC[o.chartType] ?? 'COLUMN',
            legendPosition: 'BOTTOM_LEGEND',
            headerCount: 1,
            axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS' }],
            domains: [{ domain: { sourceRange: { sources: [gridRange(o.gid, o.xColIndex, o.rowCount)] } } }],
            series: o.valueColIndices.map((ci) => ({
              series: { sourceRange: { sources: [gridRange(o.gid, ci, o.rowCount)] } },
              targetAxis: 'LEFT_AXIS',
            })),
          },
        },
        position,
      },
    },
  }
}

/** Mappe les noms de colonnes (clé OU libellé) vers les index écrits (données puis formules). */
function resolveChartColumns(
  sheet: ExcelSheet,
  formulas: FormulaColumn[] | undefined,
  chart: SheetChartOptions,
): { xColIndex: number; valueColIndices: number[]; totalCols: number } | null {
  const nameToIndex = new Map<string, number>()
  sheet.columns.forEach((c, i) => {
    nameToIndex.set(c.key, i)
    if (c.label) nameToIndex.set(c.label, i)
  })
  const base = sheet.columns.length
  ;(formulas ?? []).forEach((f, j) => nameToIndex.set(f.header, base + j))
  const totalCols = base + (formulas?.length ?? 0)
  const xColIndex = nameToIndex.get(chart.xColumn.trim())
  if (xColIndex === undefined) return null
  const valueColIndices = chart.valueColumns
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((n) => nameToIndex.get(n))
    .filter((i): i is number => i !== undefined)
  if (valueColIndices.length === 0) return null
  return { xColIndex, valueColIndices, totalCols }
}

/** gid du 1er onglet d'un spreadsheet. */
async function getFirstSheetGid(token: string, spreadsheetId: string): Promise<number> {
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties(sheetId)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Sheets get gid ${res.status}`)
  const json = (await res.json()) as { sheets?: { properties?: { sheetId?: number } }[] }
  return json.sheets?.[0]?.properties?.sheetId ?? 0
}

/** Insère (ou ré-insère) un graphe natif dans le Sheet. Supprime d'abord les graphes
 *  existants (idempotent : le mode mise à jour ne doit pas les accumuler). Non bloquant. */
async function addSheetChart(
  token: string,
  spreadsheetId: string,
  sheet: ExcelSheet,
  formulas: FormulaColumn[] | undefined,
  chart: SheetChartOptions,
  title: string,
): Promise<void> {
  const resolved = resolveChartColumns(sheet, formulas, chart)
  if (!resolved) throw new Error('Colonnes du graphe introuvables (axe X ou valeurs).')
  const gid = await getFirstSheetGid(token, spreadsheetId)
  // Supprime les graphes existants sur ce spreadsheet.
  const existing = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets(charts(chartId))`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const requests: Record<string, unknown>[] = []
  if (existing.ok) {
    const json = (await existing.json()) as { sheets?: { charts?: { chartId?: number }[] }[] }
    for (const s of json.sheets ?? []) {
      for (const c of s.charts ?? []) {
        if (typeof c.chartId === 'number') requests.push({ deleteEmbeddedObject: { objectId: c.chartId } })
      }
    }
  }
  requests.push(buildChartRequest({
    gid,
    chartType: chart.type,
    xColIndex: resolved.xColIndex,
    valueColIndices: resolved.valueColIndices,
    rowCount: sheet.rows.length,
    anchorColIndex: resolved.totalCols + 1,
    title,
  }))
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`addChart ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

// --- Couleurs conditionnelles (parité serveur google.ts) -------------------
type ColorTone = 'positive' | 'negative' | 'neutral' | 'muted'
/** Ton sémantique → couleurs Google Sheets (fond PASTEL CLAIR sur fond blanc). */
const TONE_RGB: Record<ColorTone, { bg: { red: number; green: number; blue: number }; fg?: { red: number; green: number; blue: number } }> = {
  positive: { bg: { red: 0.85, green: 0.94, blue: 0.83 }, fg: { red: 0.11, green: 0.37, blue: 0.13 } },
  negative: { bg: { red: 0.96, green: 0.80, blue: 0.80 }, fg: { red: 0.6, green: 0.11, blue: 0.11 } },
  neutral: { bg: { red: 0.90, green: 0.90, blue: 0.90 } },
  muted: { bg: { red: 0.96, green: 0.96, blue: 0.96 }, fg: { red: 0.5, green: 0.5, blue: 0.5 } },
}

/** Applique les règles de couleur conditionnelle de la feuille (ex: colonne
 *  « position » → vert/rouge). Purge d'abord les règles existantes (anti-accumulation
 *  en mode update). Non bloquant côté appelant. */
async function applySheetColorRules(token: string, spreadsheetId: string, sheet: ExcelSheet): Promise<void> {
  const rules = sheet.colorRules ?? []
  if (rules.length === 0) return
  const gid = await getFirstSheetGid(token, spreadsheetId)
  const rowCount = sheet.rows.length
  let existing = 0
  try {
    const getRes = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets(properties(sheetId),conditionalFormats)`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (getRes.ok) {
      const j = (await getRes.json()) as { sheets?: Array<{ properties?: { sheetId?: number }; conditionalFormats?: unknown[] }> }
      existing = j.sheets?.find((s) => s.properties?.sheetId === gid)?.conditionalFormats?.length ?? 0
    }
  } catch { /* best effort */ }
  const deletes = Array.from({ length: existing }, () => ({ deleteConditionalFormatRule: { sheetId: gid, index: 0 } }))
  const adds = rules
    .map((rule) => {
      const colIdx = sheet.columns.findIndex((c) => c.key === rule.column)
      if (colIdx < 0) return null
      const tone = TONE_RGB[rule.tone]
      return {
        addConditionalFormatRule: {
          index: 0,
          rule: {
            ranges: [{ sheetId: gid, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: colIdx, endColumnIndex: colIdx + 1 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: rule.equals }] },
              format: { backgroundColor: tone.bg, ...(tone.fg ? { textFormat: { foregroundColor: tone.fg } } : {}) },
            },
          },
        },
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  const requests = [...deletes, ...adds]
  if (requests.length === 0) return
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`format conditionnel ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

/**
 * MISE EN FORME du Google Sheet exporté : en-tête habillé et figé, colonnes
 * ajustées au contenu, valeurs numériques mises en couleur.
 *
 * Tout part en UN SEUL `batchUpdate` : chaque aller-retour supplémentaire est une
 * occasion de plus d'échouer à moitié, et laisse l'utilisateur devant une feuille
 * à demi formatée.
 *
 * ⚠️ `autoResizeDimensions` seul produit des colonnes démesurées dès qu'une
 * cellule contient une description : on l'accompagne de `WRAP` et on plafonne
 * ensuite les largeurs excessives — le texte passe alors sur plusieurs lignes au
 * lieu d'étirer la feuille sur trois écrans.
 *
 * ⚠️ Ne concerne QUE le tableau. Le graphe optionnel est un objet flottant ancré
 * APRÈS les données : toutes les plages ci-dessous s'arrêtent au nombre de
 * colonnes, il n'est donc ni reformaté ni supprimé. Il peut seulement se décaler
 * à l'écran si les largeurs changent, ce qui est sans conséquence.
 */
/** Plages CONTIGUËS de colonnes portant le même groupe. Un groupe interrompu
 *  puis repris (colonnes non adjacentes) donne deux plages — jamais une plage
 *  qui engloberait les colonnes intercalées. */
export function contiguousGroups(groups: (string | undefined)[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let i = 0
  while (i < groups.length) {
    const g = groups[i]
    if (!g) { i++; continue }
    let j = i + 1
    while (j < groups.length && groups[j] === g) j++
    // Une colonne seule ne mérite pas un groupe (rien à replier).
    if (j - i > 1) out.push({ start: i, end: j })
    i = j
  }
  return out
}

const HEADER_BG = { red: 0.16, green: 0.20, blue: 0.36 }
const MAX_COL_WIDTH_PX = 320

async function applySheetPresentation(token: string, spreadsheetId: string, sheet: ExcelSheet): Promise<void> {
  const gid = await getFirstSheetGid(token, spreadsheetId)
  const colCount = sheet.columns.length
  if (colCount === 0) return
  const rowCount = sheet.rows.length

  const requests: unknown[] = [
    // En-tête : fond soutenu, texte blanc en gras, légèrement plus grand, centré
    // verticalement — et le texte qui passe à la ligne plutôt que d'être tronqué.
    {
      repeatCell: {
        range: { sheetId: gid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: HEADER_BG,
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP',
            textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 1, green: 1, blue: 1 } },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)',
      },
    },
    // Corps : passage à la ligne, pour que l'ajustement de largeur ait un sens.
    ...(rowCount > 0 ? [{
      repeatCell: {
        range: { sheetId: gid, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
        fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
      },
    }] : []),
    // En-tête FIGÉ : il reste visible au défilement, et le filtre porte dessus.
    {
      updateSheetProperties: {
        properties: { sheetId: gid, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    { setBasicFilter: { filter: { range: { sheetId: gid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: colCount } } } },
    {
      autoResizeDimensions: {
        dimensions: { sheetId: gid, dimension: 'COLUMNS', startIndex: 0, endIndex: colCount },
      },
    },
  ]

  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`mise en forme ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)

  await capWideColumns(token, spreadsheetId, gid, colCount)
}

/** Plafonne les colonnes qu'`autoResizeDimensions` a rendues démesurées.
 *  Combiné au WRAP posé juste avant, le contenu passe sur plusieurs lignes. */
/** Colonnes traitées comme des MÉTRIQUES : une échelle de couleur y est lisible.
 *  `rating` et `checkbox` en sont exclus — leur échelle n'a que deux ou cinq
 *  valeurs, un dégradé n'y apporte rien. */
const METRIC_TYPES = new Set(['number', 'currency', 'percent', 'duration'])

/**
 * Échelle de couleur sur les colonnes chiffrées : rouge (bas) → jaune → vert
 * (haut), bornes calculées par Google sur les valeurs réelles (MIN/MAX).
 *
 * ⚠️ Posée APRÈS `applySheetColorRules`, et sans purge : cette dernière supprime
 * toutes les règles existantes avant d'ajouter les siennes. Dans l'ordre inverse,
 * les échelles disparaîtraient sans laisser de trace.
 */
async function applyMetricColorScales(token: string, spreadsheetId: string, sheet: ExcelSheet): Promise<void> {
  const rowCount = sheet.rows.length
  if (rowCount === 0) return
  const metricCols = sheet.columns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => METRIC_TYPES.has(c.fieldType) || METRIC_TYPES.has(c.detectedType))
  if (metricCols.length === 0) return

  const gid = await getFirstSheetGid(token, spreadsheetId)
  const requests = metricCols.map(({ i }) => ({
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [{ sheetId: gid, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: i, endColumnIndex: i + 1 }],
        gradientRule: {
          minpoint: { color: { red: 0.96, green: 0.80, blue: 0.80 }, type: 'MIN' },
          midpoint: { color: { red: 1, green: 0.95, blue: 0.75 }, type: 'PERCENTILE', value: '50' },
          maxpoint: { color: { red: 0.85, green: 0.94, blue: 0.83 }, type: 'MAX' },
        },
      },
    },
  }))
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`échelles de couleur ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

/**
 * GROUPES DE COLONNES pliables — un par concurrent dans la veille tarifaire.
 *
 * Chaque groupe se replie d'un clic sur le « − » au-dessus de l'en-tête : on
 * compare deux concurrents sans faire défiler quarante colonnes.
 *
 * ⚠️ Les groupes NE SONT PAS repliés à la création. Replier par défaut
 * masquerait les prix concurrents, c'est-à-dire l'objet même du rapport : c'est
 * au lecteur de choisir ce qu'il cache.
 *
 * ⚠️ Un groupe Google Sheets est une PLAGE : seules des colonnes contiguës
 * peuvent en former un. Les colonnes d'un même concurrent le sont par
 * construction (`siteColumns`) — un groupe discontinu est ignoré plutôt que de
 * replier des colonnes voisines qui ne lui appartiennent pas.
 *
 * ⚠️ Les groupes existants sont SUPPRIMÉS d'abord : Google les empile à chaque
 * ré-export, et trois exports produisaient trois niveaux d'imbrication.
 */
async function applyColumnGroups(token: string, spreadsheetId: string, sheet: ExcelSheet): Promise<void> {
  const ranges = contiguousGroups(sheet.columns.map((c) => c.group))
  const gid = await getFirstSheetGid(token, spreadsheetId)

  const existing = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets(properties(sheetId),columnGroups(range(startIndex,endIndex)))`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const deletes: unknown[] = []
  if (existing.ok) {
    const j = (await existing.json()) as {
      sheets?: Array<{ properties?: { sheetId?: number }; columnGroups?: Array<{ range?: { startIndex?: number; endIndex?: number } }> }>
    }
    for (const g of j.sheets?.find((x) => x.properties?.sheetId === gid)?.columnGroups ?? []) {
      deletes.push({ deleteDimensionGroup: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: g.range?.startIndex ?? 0, endIndex: g.range?.endIndex ?? 0 } } })
    }
  }
  const adds = ranges.map(({ start, end }) => ({
    addDimensionGroup: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: start, endIndex: end } },
  }))
  const requests = [...deletes, ...adds]
  if (requests.length === 0) return
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`groupes de colonnes ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

async function capWideColumns(token: string, spreadsheetId: string, gid: number, colCount: number): Promise<void> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets(properties(sheetId),data(columnMetadata(pixelSize)))`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return
  const json = (await res.json()) as {
    sheets?: Array<{ properties?: { sheetId?: number }; data?: Array<{ columnMetadata?: Array<{ pixelSize?: number }> }> }>
  }
  const widths = json.sheets?.find((s) => s.properties?.sheetId === gid)?.data?.[0]?.columnMetadata ?? []
  const requests = widths
    .slice(0, colCount)
    .map((w, i) => ({ w: w.pixelSize ?? 0, i }))
    .filter(({ w }) => w > MAX_COL_WIDTH_PX)
    .map(({ i }) => ({
      updateDimensionProperties: {
        range: { sheetId: gid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: MAX_COL_WIDTH_PX },
        fields: 'pixelSize',
      },
    }))
  if (requests.length === 0) return
  await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  }).catch(() => {})
}

/** Construit un blob XLSX depuis une ExcelSheet (single-sheet workbook).
 *  `formulas` : colonnes ajoutées en fin de tableau comme FORMULES vivantes. */
async function sheetToXlsxBlob(
  sheet: ExcelSheet,
  sheetName: string,
  formulas?: FormulaColumn[],
): Promise<Blob> {
  const XLSX = await import('xlsx')
  // Format par colonne (clé/libellé + valeurs) — aligné sur le serveur. On écrit de
  // VRAIS nombres pour les colonnes numériques (sinon Google importe « 177.49 » en TEXTE
  // sous locale FR → SUM/formules en #VALUE!) et on applique le `z` aux cellules data.
  // L'EAN/réf (colonnes texte) restent du texte.
  // cellValue : évalue les colonnes-formule (et ×100 si « pourcentage ») au lieu d'écrire
  // la valeur brute périmée. Détection de format et écriture alignées sur la même valeur.
  const formats = sheet.columns.map((col) =>
    detectColumnFormat(col.key, col.label || col.key, sheet.rows.map((r) => cellValue(col, r, sheet.columns))),
  )
  const rows = sheet.rows.map((row) => {
    const out: Record<string, unknown> = {}
    sheet.columns.forEach((col, ci) => {
      const raw = cellValue(col, row, sheet.columns)
      const fmt = formats[ci]
      const num = !fmt.text && typeof raw === 'string' ? numericString(raw) : null
      out[col.label || col.key] = num !== null ? num : raw
    })
    return out
  })
  // Test des formules SANS données amont : on injecte 1 ligne d'essai (colonnes data
  // vides) pour que les colonnes-formule s'écrivent et soient évaluables/éditables.
  if (rows.length === 0 && formulas && formulas.length > 0) {
    const empty: Record<string, unknown> = {}
    for (const col of sheet.columns) empty[col.label || col.key] = ''
    rows.push(empty)
  }
  const ws = XLSX.utils.json_to_sheet(rows)

  // Format (`z`) par colonne de données (hors en-tête). `json_to_sheet` ordonne les
  // colonnes selon `sheet.columns` (insertion de out[label||key]), donc l'index ci colle.
  formats.forEach((fmt, ci) => {
    if (!fmt.z) return
    for (let r = 0; r < rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ c: ci, r: r + 1 })] as { t?: string; v?: unknown; z?: string } | undefined
      if (!cell) continue
      cell.z = fmt.z
      if (fmt.text && cell.t !== 's') { cell.t = 's'; cell.v = String(cell.v ?? '') }
    }
  })

  if (formulas && formulas.length > 0) {
    // Résout un nom de colonne en lettre de tableur (selon l'ordre de sheet.columns).
    const letterOf = (name: string): string | null => {
      const i = sheet.columns.findIndex((c) => c.key === name || (c.label || c.key) === name)
      return i >= 0 ? XLSX.utils.encode_col(i) : null
    }
    const baseCol = sheet.columns.length // 1re colonne-formule (index 0-based)
    formulas.forEach((f, fi) => {
      const colNum = baseCol + fi
      // En-tête
      ws[XLSX.utils.encode_cell({ c: colNum, r: 0 })] = { t: 's', v: f.header }
      // Une formule par ligne de données (ligne tableur = index + 2 : +1 en-tête, base 1)
      for (let r = 0; r < rows.length; r++) {
        const resolved = resolveFormula(f.template, letterOf, r + 2)
        ws[XLSX.utils.encode_cell({ c: colNum, r: r + 1 })] = buildFormulaCell(resolved, f.format)
      }
    })
    // Étend la plage du worksheet aux colonnes-formule.
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    range.e.c = Math.max(range.e.c, baseCol + formulas.length - 1)
    range.e.r = Math.max(range.e.r, rows.length)
    ws['!ref'] = XLSX.utils.encode_range(range)
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet1')
  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
  return new Blob([new Uint8Array(data)], { type: XLSX_MIME })
}

/** Upload multipart vers Drive. Retourne la metadata du fichier créé.
 *  - `convertToSheets=true` → Drive convertit le XLSX uploadé en Google Sheets natif. */
async function uploadToDrive(
  token: string,
  body: Blob,
  options: {
    name: string
    parentFolderId?: string
    convertToSheets?: boolean
    sourceMimeType: string
  },
): Promise<DriveFileMeta> {
  const targetMime = options.convertToSheets ? SHEETS_MIME : options.sourceMimeType
  const metadata: Record<string, unknown> = { name: options.name, mimeType: targetMime }
  if (options.parentFolderId) metadata.parents = [options.parentFolderId]

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const metadataPart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n`
  const dataHeader =
    `--${boundary}\r\n` +
    `Content-Type: ${options.sourceMimeType}\r\n\r\n`
  const closingBoundary = `\r\n--${boundary}--`

  const buffer = await body.arrayBuffer()
  const multipartBody = new Blob(
    [metadataPart, dataHeader, buffer, closingBoundary],
    { type: `multipart/related; boundary=${boundary}` },
  )

  const params = new URLSearchParams({ uploadType: 'multipart', fields: 'id,name,mimeType,webViewLink' })
  const res = await fetch(`${DRIVE_UPLOAD}/files?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Drive : permission refusée (HTTP ${res.status}). Reconnectez-vous via le panneau Google Drive — le scope d'écriture (drive.file) est requis.`,
      )
    }
    throw new Error(`Drive : upload échoué (HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''})`)
  }
  return (await res.json()) as DriveFileMeta
}

/** Crée un Google Sheets depuis une ExcelSheet workflow.
 *  Workflow : XLSX en mémoire → upload Drive avec mimeType cible Sheets → Drive
 *  convertit automatiquement. */
export async function exportSheetToGoogleSheets(
  token: string,
  sheet: ExcelSheet,
  options: { name: string; parentFolderId?: string; formulas?: FormulaColumn[]; chart?: SheetChartOptions },
): Promise<DriveFileMeta> {
  const blob = await sheetToXlsxBlob(sheet, sheet.name || 'Sheet1', options.formulas)
  const meta = await uploadToDrive(token, blob, {
    name: options.name,
    parentFolderId: options.parentFolderId,
    convertToSheets: true,
    sourceMimeType: XLSX_MIME,
  })
  await setSpreadsheetTimeZone(token, meta.id).catch(() => {})
  if (options.chart && sheet.rows.length > 0) {
    await addSheetChart(token, meta.id, sheet, options.formulas, options.chart, options.name)
  }
  // Ordre imposé : `applySheetColorRules` PURGE les règles existantes avant
  // d'ajouter les siennes — les échelles doivent donc venir après elle.
  await applySheetPresentation(token, meta.id, sheet).catch((e) => console.warn('[sheets] mise en forme:', e))
  await applySheetColorRules(token, meta.id, sheet).catch(() => {})
  await applyMetricColorScales(token, meta.id, sheet).catch((e) => console.warn('[sheets] échelles:', e))
  await applyColumnGroups(token, meta.id, sheet).catch((e) => console.warn('[sheets] groupes:', e))
  return meta
}

/** Extrait l'ID d'un Google Sheet depuis une URL collée ou un ID brut. */
function parseSpreadsheetId(raw: string): string {
  const s = String(raw ?? '').trim()
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || s.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : s
}

/** Statut d'un fichier Drive : exploitable, dans la corbeille, ou introuvable.
 *  Sert à éviter de « mettre à jour » un fichier supprimé (on crée à la place). */
export async function getDriveFileStatus(token: string, fileId: string): Promise<'ok' | 'trashed' | 'missing'> {
  const id = parseSpreadsheetId(fileId)
  const params = new URLSearchParams({ fields: 'id,trashed', supportsAllDrives: 'true' })
  const res = await fetch(`${DRIVE_API}/files/${id}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) return 'missing'
  // En cas d'erreur d'auth (401/403) on ne tranche pas ici : on laisse l'update lever le bon message.
  if (!res.ok) return 'ok'
  const json = (await res.json()) as { trashed?: boolean }
  return json.trashed ? 'trashed' : 'ok'
}

/** Réécrit le contenu d'un Google Sheets EXISTANT (créé par l'app — scope
 *  drive.file) via un upload média Drive (XLSX converti). Évite de créer un
 *  nouveau fichier à chaque exécution. `fileId` accepte une URL ou un ID. */
export async function updateGoogleSheetById(
  token: string,
  fileId: string,
  sheet: ExcelSheet,
  formulas?: FormulaColumn[],
  chart?: SheetChartOptions,
): Promise<DriveFileMeta> {
  const id = parseSpreadsheetId(fileId)
  const blob = await sheetToXlsxBlob(sheet, sheet.name || 'Sheet1', formulas)
  const params = new URLSearchParams({ uploadType: 'media', fields: 'id,name,mimeType,webViewLink' })
  const res = await fetch(`${DRIVE_UPLOAD}/files/${id}?${params}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': XLSX_MIME },
    body: blob,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 401) {
      // Token invalide/expiré : la reconnexion résout. (≠ 403, qui est un problème de scope.)
      throw new Error(
        'Drive : session expirée (HTTP 401). Le node tourne avec le jeton du NAVIGATEUR : reconnectez-vous via le panneau « Google Drive » (Réglages → Connecteurs).',
      )
    }
    if (res.status === 403) {
      // Token valide mais scope drive.file : seul un fichier créé par CETTE app est modifiable.
      throw new Error(
        "Drive : accès refusé (HTTP 403). Sous le scope drive.file, seul un Google Sheet CRÉÉ PAR L'APP est modifiable. Celui-ci a sans doute été créé ailleurs (manuellement, ou par le connecteur serveur du cron). Créez-le une fois via « Créer un nouveau fichier », puis réutilisez son lien.",
      )
    }
    throw new Error(`Drive : mise à jour échouée (HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''})`)
  }
  const meta = (await res.json()) as DriveFileMeta
  if (chart && sheet.rows.length > 0) {
    await addSheetChart(token, id, sheet, formulas, chart, sheet.name || '')
  }
  // ⚠️ La mise à jour REMPLACE le contenu du fichier par un XLSX converti : toute
  // la mise en forme précédente est perdue. On la réapplique, sans quoi la
  // feuille se dépouillerait à chaque rafraîchissement du node.
  await applySheetPresentation(token, id, sheet).catch((e) => console.warn('[sheets] mise en forme:', e))
  await applySheetColorRules(token, id, sheet).catch(() => {})
  await applyMetricColorScales(token, id, sheet).catch((e) => console.warn('[sheets] échelles:', e))
  await applyColumnGroups(token, id, sheet).catch((e) => console.warn('[sheets] groupes:', e))
  return meta
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'

/**
 * Garantit l'existence d'un dossier Drive de ce nom et renvoie son id. Cherche d'abord un dossier
 * existant VISIBLE par l'app (sous `drive.file`, seuls les dossiers créés/ouverts par l'app le sont),
 * sinon le crée. C'est le pattern canonique pour écrire avec le scope minimal `drive.file` : on ne
 * peut pas écrire dans un dossier arbitraire choisi par l'utilisateur, mais on peut créer le nôtre.
 */
export async function ensureDriveFolder(token: string, name: string): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` }
  const failAuth = (status: number) => {
    if (status === 401 || status === 403) {
      throw new Error(
        `permission refusée (HTTP ${status}). Reconnecte-toi via le panneau Google Drive (scope d'écriture drive.file requis).`,
      )
    }
  }

  // Recherche : escape \ et ' pour la query Drive.
  const esc = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const q = `name='${esc}' and mimeType='${FOLDER_MIME}' and trashed=false`
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name)',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
    spaces: 'drive',
  })
  const findRes = await fetch(`${DRIVE_API}/files?${params}`, { headers: auth })
  if (findRes.ok) {
    const data = (await findRes.json()) as { files?: { id: string }[] }
    const existing = data.files?.[0]?.id
    if (existing) return existing
  } else {
    failAuth(findRes.status)
    // autre erreur de recherche : on tente quand même la création ci-dessous
  }

  const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  })
  if (!createRes.ok) {
    failAuth(createRes.status)
    const detail = await createRes.text().catch(() => '')
    throw new Error(`Drive : création du dossier échouée (HTTP ${createRes.status}${detail ? ` — ${detail.slice(0, 160)}` : ''})`)
  }
  return ((await createRes.json()) as { id: string }).id
}

/** Upload arbitraire d'un File (image, PDF, etc.) vers Drive sans conversion. */
export async function uploadFileToDrive(
  token: string,
  file: File | Blob,
  options: { name: string; parentFolderId?: string },
): Promise<DriveFileMeta> {
  const sourceMimeType = file.type || 'application/octet-stream'
  return uploadToDrive(token, file, {
    name: options.name,
    parentFolderId: options.parentFolderId,
    convertToSheets: false,
    sourceMimeType,
  })
}
