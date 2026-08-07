// functions/src/workflow/nodes/google.ts
// Réimplémentation SERVEUR des nodes Google (wire-compatibles avec les specs
// client) : gsheets-export (sheet → Google Sheets dans Drive) et send-gmail.
// Auth : refresh token offline du compte (cf. google/serverAuth.ts) — aucune
// session navigateur requise. Contrainte drive.file conservée : on n'écrit que
// dans des fichiers/dossiers créés par l'app.
import { registerServerNode } from '../registry'
import { t, DEFAULT_LOCALE, type Locale } from '../../i18n'
// Helpers d'API PURS (hors contexte de run) : ils n'ont pas `ctx.locale`. Ce n'est
// PAS un compromis observable — `run.api.error` a le MÊME texte dans les deux langues
// (un diagnostic `Sheets get 403: …` n'a pas de prose à traduire), donc le repli ne
// peut pas produire un message dans la mauvaise langue. Si un message de ces helpers
// portait un jour de la prose, il faudrait y passer la locale.
const tLocal = (key: Parameters<typeof t>[1], params?: Record<string, string | number>) => t(DEFAULT_LOCALE, key, params)
/** Étiquette BCP 47 pour les nombres localisés (`fr-FR` était figé). */
const intlTag = (locale: Locale): string => (locale === 'en' ? 'en-GB' : 'fr-FR')
import { interpolate, extractRows } from '../interpolate'
import { getGoogleAccessToken } from '../../google/serverAuth'
import { asServerFile } from './serverFile'
import { injectTable, hasTableToken } from './emailTable'

type ColorTone = 'positive' | 'negative' | 'neutral' | 'muted'
interface SheetColorRule { column: string; equals: string; tone: ColorTone }
interface SheetLike {
  name?: string
  columns?: { key: string; label?: string }[]
  rows?: Record<string, unknown>[]
  colorRules?: SheetColorRule[]
}

/** Ton sémantique → couleurs Google Sheets (fond PASTEL CLAIR sur fond blanc). */
const TONE_RGB: Record<ColorTone, { bg: { red: number; green: number; blue: number }; fg?: { red: number; green: number; blue: number } }> = {
  positive: { bg: { red: 0.85, green: 0.94, blue: 0.83 }, fg: { red: 0.11, green: 0.37, blue: 0.13 } },
  negative: { bg: { red: 0.96, green: 0.80, blue: 0.80 }, fg: { red: 0.6, green: 0.11, blue: 0.11 } },
  neutral: { bg: { red: 0.90, green: 0.90, blue: 0.90 } },
  muted: { bg: { red: 0.96, green: 0.96, blue: 0.96 }, fg: { red: 0.5, green: 0.5, blue: 0.5 } },
}

/** Applique des règles de format conditionnel (couleur de fond par valeur d'une
 *  colonne, ex « position » = moins cher/plus cher). Non bloquant. */
async function applyColorRules(
  token: string, id: string, gid: number, keys: string[],
  colorRules: SheetColorRule[], rowCount: number,
): Promise<void> {
  // Purge les règles existantes sur cet onglet (sinon elles s'accumulent à chaque
  // run en mode update / cron). deleteConditionalFormatRule index 0 répété N fois.
  let existing = 0
  try {
    const getRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(sheetId),conditionalFormats)`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (getRes.ok) {
      const j = (await getRes.json()) as { sheets?: Array<{ properties?: { sheetId?: number }; conditionalFormats?: unknown[] }> }
      const tab = j.sheets?.find((s) => s.properties?.sheetId === gid)
      existing = tab?.conditionalFormats?.length ?? 0
    }
  } catch { /* best effort */ }
  const deletes = Array.from({ length: existing }, () => ({ deleteConditionalFormatRule: { sheetId: gid, index: 0 } }))
  const adds = colorRules
    .map((rule) => {
      const colIdx = keys.indexOf(rule.column)
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
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'conditionalFormat', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
}

/** Clés de colonnes dans l'ordre d'export (colonnes déclarées, sinon union des clés). */
function sheetKeys(sheet: SheetLike): string[] {
  const rows = sheet.rows ?? []
  let keys = (sheet.columns ?? []).map((c) => c.key).filter((k) => k && k !== '_id')
  if (keys.length === 0) {
    const all = new Set<string>()
    for (const r of rows) for (const k of Object.keys(r)) if (k !== '_id') all.add(k)
    keys = [...all]
  }
  return keys
}

interface GFormat { type: string; pattern: string }

/** Déduit le format Google Sheets d'une colonne depuis sa clé/libellé + ses valeurs.
 *  Renvoie null = laisser tel quel (texte). Pièges gérés :
 *   - EAN/réf/code → TEXTE (sinon Google passe les 13 chiffres en notation scientifique) ;
 *   - pourcentage : nos valeurs sont DÉJÀ en % (12.7 = 12,7 %) → pattern sans ×100 ;
 *   - devise € pour prix/montant ; entiers longs (≥12 chiffres) = identifiants → texte. */
export function detectColumnFormat(key: string, label: string, values: unknown[]): GFormat | null {
  const hint = `${key} ${label}`.toLowerCase()
  const vals = values.map((v) => String(v ?? '').trim()).filter(Boolean)

  if (/\b(ean|gtin|upc|isbn|sku|ref|reference|référence|code|mpn)\b/.test(hint)) return { type: 'TEXT', pattern: '@' }
  if (/(%|pourcent|\bpct\b|ecart_pct)/.test(hint)) return { type: 'NUMBER', pattern: '0.00"%"' }
  if (/(prix|price|montant|tarif|co[uû]t|cost|devise|€|\beur\b)/.test(hint)) return { type: 'NUMBER', pattern: '#,##0.00 "€"' }
  if (vals.length === 0) return null

  const isNum = (s: string) => /^-?\d+(?:[.,]\d+)?$/.test(s)
  if (vals.every(isNum)) {
    if (vals.every((v) => /^\d{12,}$/.test(v))) return { type: 'TEXT', pattern: '@' } // identifiant long
    return { type: 'NUMBER', pattern: '#,##0.##' }
  }
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)
  if (vals.every(isDate)) return { type: 'DATE', pattern: 'dd/mm/yyyy' }
  return null
}

/** Convertit une valeur de cellule pour l'écriture RAW : un nombre RESTE un nombre
 *  (colonnes numériques), tout le reste reste une STRING. ⚠️ Clé du fix : empêche
 *  Google d'interpréter « 6.5 » comme la date « 6 mai » ou « 4892… » en scientifique. */
export function toCell(v: unknown, fmt: GFormat | null): string | number {
  const s = String(v ?? '')
  if (fmt && fmt.type === 'NUMBER' && s.trim() !== '') {
    const n = Number(s.replace(',', '.').replace(/[^\d.+-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return s
}

/** Récupère le 1er onglet (titre, gid) et la taille ACTUELLE de sa grille — cette
 *  dernière sert à rendre au classeur les cellules vides en fin d'export (cf. trimGrid). */
async function getFirstTab(
  token: string, id: string,
): Promise<{ title: string; gid: number; rowCount: number; columnCount: number }> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(title,sheetId,gridProperties)`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'sheets.get', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
  const json = (await res.json()) as {
    sheets?: { properties?: {
      title?: string; sheetId?: number; gridProperties?: { rowCount?: number; columnCount?: number }
    } }[]
  }
  const p = json.sheets?.[0]?.properties
  return {
    title: p?.title ?? 'Sheet1',
    gid: p?.sheetId ?? 0,
    rowCount: p?.gridProperties?.rowCount ?? 0,
    columnCount: p?.gridProperties?.columnCount ?? 0,
  }
}

/**
 * Ramène la grille de l'onglet à la taille RÉELLEMENT écrite.
 *
 * ⚠ Un classeur Google plafonne à 10 millions de cellules, TOUTES FEUILLES CONFONDUES, et
 * `values:clear` ne rend rien : il vide les valeurs, pas la grille. Un onglet qui a compté
 * une fois 75 000 lignes × 130 colonnes garde ces cellules réservées à jamais, vides mais
 * comptées — jusqu'à ce que l'export échoue en « vous dépasserez le nombre maximum de
 * 10000000 cellules ». On ne réduit JAMAIS en dessous de ce qui vient d'être écrit
 * (colonnes formule comprises) et on n'agrandit pas : l'écriture s'en charge.
 */
async function trimGrid(
  token: string, id: string, gid: number,
  rowCount: number, columnCount: number,
  current: { rowCount: number; columnCount: number },
): Promise<void> {
  const rows = Math.max(1, rowCount)
  const cols = Math.max(1, columnCount)
  if (current.rowCount <= rows && current.columnCount <= cols) return
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: gid, gridProperties: { rowCount: rows, columnCount: cols } },
          fields: 'gridProperties.rowCount,gridProperties.columnCount',
        },
      }],
    }),
  })
  if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'sheets.trim', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
}

/** Écrit la matrice de valeurs (RAW, types préservés) dans l'onglet, après l'avoir vidé. */
async function writeValues(token: string, id: string, title: string, matrix: (string | number)[][]): Promise<void> {
  const enc = encodeURIComponent(title)
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${enc}:clear`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  })
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${enc}!A1?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: matrix }),
    },
  )
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300)
    // Quota de CLASSEUR (10 M de cellules, tous onglets) : le message brut de Google ne
    // dit pas quoi faire, et les cellules vides d'anciens exports en sont la cause n°1.
    if (/10000000|10 000 000/.test(body)) {
      throw new Error(tLocal('run.gs.workbookFull'))
    }
    throw new Error(tLocal('run.api.error', { api: 'sheets.values', status: res.status, body: body.slice(0, 200) }))
  }
}

/** Applique un numberFormat par colonne (ligne d'en-tête exclue). Non bloquant. */
/** Colonnes traitées comme des MÉTRIQUES (échelle de couleur lisible). */
const METRIC_TYPES = new Set(['number', 'currency', 'percent', 'duration'])
const HEADER_BG = { red: 0.16, green: 0.20, blue: 0.36 }
const MAX_COL_WIDTH_PX = 320

/**
 * MISE EN FORME du tableau : en-tête habillé et FIGÉ, colonnes ajustées au
 * contenu avec passage à la ligne, échelle de couleur sur les colonnes chiffrées.
 *
 * ⚠️ JUMEAU de `applySheetPresentation` / `applyMetricColorScales`
 * (`src/features/gdrive/gdriveCore.ts`) : un workflow lancé depuis le navigateur
 * passe par le client, le même workflow lancé par le cron ou « Lancer (serveur) »
 * passe ICI. Toute évolution de l'un doit être reportée sur l'autre, sinon le
 * rendu dépend de qui a déclenché l'export — exactement le symptôme qui a fait
 * croire que la mise en forme n'était pas déployée.
 *
 * Ne concerne QUE le tableau : le graphe est un objet flottant ancré après les
 * données, et toutes les plages s'arrêtent au nombre de colonnes.
 */
async function applyPresentation(
  token: string, id: string, gid: number, colCount: number, rowCount: number,
  metricColumnIndexes: number[],
): Promise<void> {
  if (colCount === 0) return
  const requests: unknown[] = [
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
    ...(rowCount > 0 ? [{
      repeatCell: {
        range: { sheetId: gid, startRowIndex: 1, endRowIndex: rowCount + 1, startColumnIndex: 0, endColumnIndex: colCount },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
        fields: 'userEnteredFormat(wrapStrategy,verticalAlignment)',
      },
    }] : []),
    {
      updateSheetProperties: {
        properties: { sheetId: gid, gridProperties: { frozenRowCount: 1 } },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    { setBasicFilter: { filter: { range: { sheetId: gid, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: colCount } } } },
    { autoResizeDimensions: { dimensions: { sheetId: gid, dimension: 'COLUMNS', startIndex: 0, endIndex: colCount } } },
    // Échelles de couleur : posées APRÈS `applyColorRules`, qui purge les règles
    // existantes — dans l'ordre inverse elles disparaîtraient sans trace.
    ...(rowCount > 0 ? metricColumnIndexes.map((i) => ({
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
    })) : []),
  ]
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`batchUpdate ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  await capWideColumnsServer(token, id, gid, colCount)
}

/** Ramène à 320 px les colonnes qu'`autoResizeDimensions` a rendues démesurées.
 *  Avec le WRAP posé juste avant, le contenu passe sur plusieurs lignes. */
/** Plages CONTIGUËS de colonnes portant le même groupe.
 *  ⚠️ JUMEAU de `contiguousGroups` (`src/features/gdrive/gdriveCore.ts`), couvert
 *  côté client par `contiguousGroups.test.ts`. */
function contiguousGroupsServer(groups: (string | undefined)[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let i = 0
  while (i < groups.length) {
    const g = groups[i]
    if (!g) { i++; continue }
    let j = i + 1
    while (j < groups.length && groups[j] === g) j++
    // `i + 1` : la première colonne reste VISIBLE et sépare ce groupe du suivant.
    // Sans ce séparateur, Google fusionne les groupes adjacents de même niveau et
    // tous les concurrents n'en forment plus qu'un.
    // `i + 1` TOUJOURS (jumeau du client) : Sheets fusionne les groupes que ne sépare
    // qu'une seule colonne — mesuré en production, quatorze blocs n'en formaient qu'un.
    if (j - (i + 1) > 1) out.push({ start: i + 1, end: j })
    i = j
  }
  return out
}

/**
 * GROUPES DE COLONNES pliables — un par concurrent.
 *
 * ⚠️ REPLIÉS à la création : déplié, un groupe n'est qu'un crochet discret et la
 * fonctionnalité passe pour absente. ⚠️ Les groupes existants sont supprimés
 * d'abord, sinon Google les empile à chaque ré-export.
 */
async function applyColumnGroupsServer(
  token: string, id: string, gid: number, groups: (string | undefined)[],
): Promise<void> {
  const ranges = contiguousGroupsServer(groups)
  const existing = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(sheetId),columnGroups(range(startIndex,endIndex)))`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const requests: unknown[] = []
  if (existing.ok) {
    const j = (await existing.json()) as {
      sheets?: Array<{ properties?: { sheetId?: number }; columnGroups?: Array<{ range?: { startIndex?: number; endIndex?: number } }> }>
    }
    for (const g of j.sheets?.find((x) => x.properties?.sheetId === gid)?.columnGroups ?? []) {
      requests.push({ deleteDimensionGroup: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: g.range?.startIndex ?? 0, endIndex: g.range?.endIndex ?? 0 } } })
    }
  }
  for (const { start, end } of ranges) {
    requests.push({ addDimensionGroup: { range: { sheetId: gid, dimension: 'COLUMNS', startIndex: start, endIndex: end } } })
  }
  if (requests.length === 0) return
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`groupes ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)

  // ⚠️ Repli dans un appel SÉPARÉ : un `batchUpdate` est atomique. Si Google
  // refuse le repli, le lot entier serait annulé — on perdrait les groupes en
  // voulant seulement les fermer. Ici, un échec ne laisse que des groupes ouverts.
  if (ranges.length === 0) return
  const collapse = ranges.map(({ start, end }) => ({
    updateDimensionGroup: {
      dimensionGroup: {
        range: { sheetId: gid, dimension: 'COLUMNS', startIndex: start, endIndex: end },
        depth: 1,
        collapsed: true,
      },
      fields: 'collapsed',
    },
  }))
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: collapse }),
  }).catch(() => { /* groupes ouverts : dégradation acceptable */ })
}

async function capWideColumnsServer(token: string, id: string, gid: number, colCount: number): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(sheetId),data(columnMetadata(pixelSize)))`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return
  const json = (await res.json()) as {
    sheets?: Array<{ properties?: { sheetId?: number }; data?: Array<{ columnMetadata?: Array<{ pixelSize?: number }> }> }>
  }
  const widths = json.sheets?.find((x) => x.properties?.sheetId === gid)?.data?.[0]?.columnMetadata ?? []
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
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  }).catch(() => {})
}

async function applyNumberFormats(token: string, id: string, gid: number, formats: (GFormat | null)[]): Promise<void> {
  const requests = formats.flatMap((f, i) =>
    f
      ? [{
          repeatCell: {
            range: { sheetId: gid, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
            cell: { userEnteredFormat: { numberFormat: { type: f.type, pattern: f.pattern } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        }]
      : [],
  )
  if (requests.length === 0) return
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'batchUpdate', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
}

/** Pose le fuseau horaire du document (formules/dates internes au Sheet) sur
 *  Europe/Paris. N'affecte PAS la colonne « Date de modification » de la liste
 *  Drive (horodatage système UTC rendu par l'UI). Non bloquant. */
async function setSpreadsheetTimeZone(token: string, id: string, timeZone = 'Europe/Paris'): Promise<void> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ updateSpreadsheetProperties: { properties: { timeZone }, fields: 'timeZone' } }] }),
  })
  if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'timeZone', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
}

// --- Colonnes formule (parité avec src/features/gdrive/gdriveCore.ts) ---------
interface FormulaColumn { header: string; template: string; format?: string }

/** Format de sortie d'une colonne formule → numberFormat Google. Clés partagées avec
 *  l'éditeur client (GSheetsFormulaColumns). '' / 'auto' = aucun format imposé. */
const FORMULA_FORMATS: Record<string, { type: string; pattern: string }> = {
  text: { type: 'TEXT', pattern: '@' },
  number: { type: 'NUMBER', pattern: '#,##0.00' },
  percent: { type: 'PERCENT', pattern: '0.00%' },
  scientific: { type: 'SCIENTIFIC', pattern: '0.00E+00' },
  currency: { type: 'CURRENCY', pattern: '#,##0.00 "€"' },
  currency_round: { type: 'CURRENCY', pattern: '#,##0 "€"' },
  accounting: { type: 'NUMBER', pattern: '#,##0.00 "€";(#,##0.00 "€")' },
  date: { type: 'DATE', pattern: 'dd/mm/yyyy' },
  time: { type: 'TIME', pattern: 'hh:mm:ss' },
  datetime: { type: 'DATE_TIME', pattern: 'dd/mm/yyyy hh:mm:ss' },
  duration: { type: 'NUMBER', pattern: '[h]:mm:ss' },
}

/** Parse « En-tête [format] = template » (le [format] est optionnel ; template référence {col}). */
export function parseFormulaColumns(raw: string): FormulaColumn[] {
  return String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line): FormulaColumn | null => {
      const eq = line.indexOf('=')
      if (eq < 0) return null
      const template = line.slice(eq + 1).trim()
      const left = line.slice(0, eq)
      const fm = left.match(/^(.*?)\s*\[([a-z_]+)\]\s*$/)
      const header = (fm ? fm[1] : left).trim()
      const format = fm ? fm[2] : undefined
      return header && template ? { header, template, format } : null
    })
    .filter((f): f is FormulaColumn => f !== null)
}

/** Index 0-based → lettre de colonne A1 (0→A, 26→AA). */
export function colLetter(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

/** Résout un template : retire `=` initial, remplace `{nom}` par lettre+ligne. */
export function resolveFormula(template: string, letterByName: (n: string) => string | null, sheetRow: number): string {
  return template.replace(/^=/, '').replace(/\{([^}]+)\}/g, (_m, name: string) => {
    const l = letterByName(name.trim())
    return l ? `${l}${sheetRow}` : name
  })
}

/** Écrit les colonnes formule (à droite des données) en USER_ENTERED = formules vivantes. */
async function writeFormulas(
  token: string, id: string, title: string,
  dataKeys: string[], formulas: FormulaColumn[], nRows: number,
): Promise<void> {
  const letter: Record<string, string> = {}
  dataKeys.forEach((k, i) => { letter[k] = colLetter(i) })
  formulas.forEach((f, j) => { letter[f.header] = colLetter(dataKeys.length + j) })
  const byName = (name: string) => letter[name] ?? null
  const values: string[][] = []
  for (let r = 0; r < nRows; r++) {
    values.push(formulas.map((f) => `=${resolveFormula(f.template, byName, r + 2)}`))
  }
  const enc = encodeURIComponent(title)
  const start = colLetter(dataKeys.length)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${enc}!${start}2?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    },
  )
  if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'sheets.formulas', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
}

/** CSV RFC4180 minimal depuis une sheet (colonnes déclarées, sinon union des clés). */
function sheetToCsv(sheet: SheetLike): string {
  const rows = sheet.rows ?? []
  const keys = sheetKeys(sheet)
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = keys.map((k) => esc((sheet.columns ?? []).find((c) => c.key === k)?.label ?? k)).join(',')
  const lines = rows.map((r) => keys.map((k) => esc(r[k])).join(','))
  return [header, ...lines].join('\r\n')
}

// --- gsheets-export ---------------------------------------------------------
// Config client (gdriveNodes.tsx) : { name, parentFolderId, parentFolderName }.
// In : sheet*. Out : { result: DriveFileMeta }. Le client convertit un XLSX ;
// côté serveur on uploade le CSV avec conversion Drive → même Google Sheet.
/** Extrait l'ID d'un Google Sheet depuis une URL collée ou un ID brut. */
function parseSpreadsheetId(raw: string): string {
  const s = String(raw ?? '').trim()
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || s.match(/\/d\/([a-zA-Z0-9_-]+)/)
  return m ? m[1] : s
}

// --- Graphe natif (addChart) — parité avec src/features/gdrive/gdriveCore.ts ----
/** Plage d'une colonne (en-tête incluse, headerCount=1). */
function chartGridRange(gid: number, colIndex: number, rowCount: number) {
  return { sheetId: gid, startRowIndex: 0, endRowIndex: rowCount + 1, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 }
}

/** Mappe les noms de colonnes (clé OU libellé) vers les index écrits (données puis
 *  formules) + total. Retourne null si l'axe X ou toutes les valeurs sont introuvables. */
export function resolveChartIndices(
  keys: string[],
  cols: { key: string; label?: string }[],
  formulas: { header: string }[],
  xName: string,
  valueNames: string,
): { xColIndex: number; valueColIndices: number[]; totalCols: number } | null {
  const nameToIndex = new Map<string, number>()
  keys.forEach((k, i) => {
    nameToIndex.set(k, i)
    const label = cols.find((c) => c.key === k)?.label
    if (label) nameToIndex.set(label, i)
  })
  formulas.forEach((f, j) => nameToIndex.set(f.header, keys.length + j))
  const totalCols = keys.length + formulas.length
  const xColIndex = nameToIndex.get(xName.trim())
  if (xColIndex === undefined) return null
  const valueColIndices = valueNames
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((n) => nameToIndex.get(n))
    .filter((i): i is number => i !== undefined)
  if (valueColIndices.length === 0) return null
  return { xColIndex, valueColIndices, totalCols }
}

/** Requête addChart : basicChart (bar/line/area) ou pieChart (pie/doughnut). */
export function buildChartRequest(o: {
  gid: number; chartType: string; xColIndex: number; valueColIndices: number[];
  rowCount: number; anchorColIndex: number; title: string
}): Record<string, unknown> {
  const isPie = o.chartType === 'pie' || o.chartType === 'doughnut'
  const position = {
    overlayPosition: {
      anchorCell: { sheetId: o.gid, rowIndex: 1, columnIndex: o.anchorColIndex },
      offsetXPixels: 0, offsetYPixels: 0, widthPixels: 600, heightPixels: 371,
    },
  }
  if (isPie) {
    return {
      addChart: { chart: { spec: { title: o.title, pieChart: {
        legendPosition: 'RIGHT_LEGEND',
        pieHole: o.chartType === 'doughnut' ? 0.4 : 0,
        domain: { sourceRange: { sources: [chartGridRange(o.gid, o.xColIndex, o.rowCount)] } },
        series: { sourceRange: { sources: [chartGridRange(o.gid, o.valueColIndices[0], o.rowCount)] } },
      } }, position } } }
  }
  const BASIC: Record<string, string> = { bar: 'COLUMN', line: 'LINE', area: 'AREA' }
  return {
    addChart: { chart: { spec: { title: o.title, basicChart: {
      chartType: BASIC[o.chartType] ?? 'COLUMN',
      legendPosition: 'BOTTOM_LEGEND',
      headerCount: 1,
      axis: [{ position: 'BOTTOM_AXIS' }, { position: 'LEFT_AXIS' }],
      domains: [{ domain: { sourceRange: { sources: [chartGridRange(o.gid, o.xColIndex, o.rowCount)] } } }],
      series: o.valueColIndices.map((ci) => ({
        series: { sourceRange: { sources: [chartGridRange(o.gid, ci, o.rowCount)] } },
        targetAxis: 'LEFT_AXIS',
      })),
    } }, position } } }
}

/** Supprime les graphes existants (idempotent en mode update) puis insère le nouveau. */
async function addSheetChartServer(
  token: string, id: string, gid: number,
  o: {
    chartType: string; xName: string; valueNames: string;
    keys: string[]; cols: { key: string; label?: string }[];
    formulas: FormulaColumn[]; rowCount: number; title: string
  },
): Promise<void> {
  const resolved = resolveChartIndices(o.keys, o.cols, o.formulas, o.xName, o.valueNames)
  if (!resolved) throw new Error(tLocal('run.gs.chartAxisMissing'))
  const { xColIndex, valueColIndices, totalCols } = resolved

  const requests: Record<string, unknown>[] = []
  const existing = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(charts(chartId))`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (existing.ok) {
    const json = (await existing.json()) as { sheets?: { charts?: { chartId?: number }[] }[] }
    for (const s of json.sheets ?? []) {
      for (const c of s.charts ?? []) {
        if (typeof c.chartId === 'number') requests.push({ deleteEmbeddedObject: { objectId: c.chartId } })
      }
    }
  }
  requests.push(buildChartRequest({
    gid, chartType: o.chartType, xColIndex, valueColIndices,
    rowCount: o.rowCount, anchorColIndex: totalCols + 1, title: o.title,
  }))
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'addChart', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
}

registerServerNode({
  type: 'gsheets-export',
  run: async (ctx, config, inputs) => {
    const sheet = (inputs.sheet ?? {}) as SheetLike
    if (!sheet.rows || sheet.rows.length === 0) {
      throw new Error(t(ctx.locale, 'run.gs.emptySheetInput'))
    }
    const name = String(config.name ?? '').trim() || 'Workflow Export'
    const token = await getGoogleAccessToken(ctx.uid)

    // Matrice de valeurs TYPÉE : nombres en number, reste en string. On écrit via
    // l'API Sheets values (RAW) au lieu d'un import CSV — l'auto-détection CSV de
    // Google interprétait « 6.5 » comme une date et « 229.99 » (point décimal) comme
    // du texte en locale FR. RAW + types explicites = rendu déterministe.
    const keys = sheetKeys(sheet)
    const cols = sheet.columns ?? []
    const formats = keys.map((k) =>
      detectColumnFormat(k, cols.find((c) => c.key === k)?.label ?? k, sheet.rows!.map((r) => r[k])),
    )
    // Colonnes formule (config.formulaColumns « En-tête = template {col} ») : ajoutées
    // à droite, écrites en USER_ENTERED (formules vivantes). Cf. parité client gdriveCore.
    const formulas = parseFormulaColumns(String(config.formulaColumns ?? ''))
    const header = [
      ...keys.map((k) => String(cols.find((c) => c.key === k)?.label ?? k)),
      ...formulas.map((f) => f.header),
    ]
    const matrix: (string | number)[][] = [
      header,
      // colonnes formule = placeholder vide en RAW (écrasées ensuite en USER_ENTERED)
      ...sheet.rows.map((r) => [...keys.map((k, i) => toCell(r[k], formats[i])), ...formulas.map(() => '')]),
    ]

    // Obtenir le spreadsheet : mode « update » réutilise un fichier créé par l'app
    // (contrainte drive.file) ; sinon on crée un nouveau Sheet VIDE dans Drive.
    const mode = String(config.mode ?? 'create')
    const targetId = parseSpreadsheetId(String(config.spreadsheetId ?? ''))
    let id: string
    let displayName = name
    let webViewLink: string | undefined
    let outcome: 'created' | 'updated'

    if (mode === 'update' && targetId) {
      id = targetId
      outcome = 'updated'
    } else {
      const metadata: Record<string, unknown> = { name, mimeType: 'application/vnd.google-apps.spreadsheet' }
      const parent = String(config.parentFolderId ?? '').trim()
      if (parent) metadata.parents = [parent]
      const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      })
      const json = (await res.json().catch(() => null)) as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } } | null
      if (!res.ok || !json?.id) throw new Error(t(ctx.locale, 'run.gs.driveCreateFailed', { status: res.status, message: json?.error?.message ?? t(ctx.locale, 'run.api.noDetail') }))
      id = json.id
      displayName = json.name ?? name
      webViewLink = json.webViewLink
      outcome = 'created'
    }

    const { title, gid, rowCount: gridRows, columnCount: gridCols } = await getFirstTab(token, id)
    if (outcome === 'created') {
      await setSpreadsheetTimeZone(token, id).catch((e) =>
        ctx.log('warn', t(ctx.locale, 'run.gs.tzIgnored', { message: e instanceof Error ? e.message : String(e) })),
      )
    }
    await writeValues(token, id, title, matrix)
    if (formulas.length > 0 && sheet.rows.length > 0) {
      await writeFormulas(token, id, title, keys, formulas, sheet.rows.length).catch((e) =>
        ctx.log('warn', t(ctx.locale, 'run.gs.formulasIgnored', { message: e instanceof Error ? e.message : String(e) })),
      )
      ctx.log('info', t(ctx.locale, 'run.gs.formulasAdded', { count: formulas.length }))
    }
    // Formats = colonnes données (détectés) + colonnes formule (format choisi par l'utilisateur).
    const allFormats = [...formats, ...formulas.map((f) => (f.format ? FORMULA_FORMATS[f.format] ?? null : null))]
    await applyNumberFormats(token, id, gid, allFormats).catch((e) =>
      ctx.log('warn', t(ctx.locale, 'run.gs.formatIgnored', { message: e instanceof Error ? e.message : String(e) })),
    )
    // Couleurs conditionnelles (ex: colonne « position » → vert/rouge), si la feuille en porte.
    const colorRules = Array.isArray(sheet.colorRules) ? sheet.colorRules : []
    if (colorRules.length > 0) {
      await applyColorRules(token, id, gid, keys, colorRules, sheet.rows.length).catch((e) =>
        ctx.log('warn', t(ctx.locale, 'run.gs.condColorsIgnored', { message: e instanceof Error ? e.message : String(e) })),
      )
    }

    // Mise en forme du TABLEAU : après les couleurs conditionnelles, qui purgent
    // les règles existantes. Non bloquante — l'export a déjà réussi.
    const metricIdx = (sheet.columns ?? [])
      .map((c, i) => ({ c: c as { fieldType?: string; detectedType?: string }, i }))
      .filter(({ c }) => METRIC_TYPES.has(String(c.fieldType)) || METRIC_TYPES.has(String(c.detectedType)))
      .map(({ i }) => i)
    await applyPresentation(token, id, gid, keys.length + formulas.length, sheet.rows.length, metricIdx)
      .then(() => ctx.log('info', t(ctx.locale, 'run.gs.styled')))
      .catch((e) => ctx.log('warn', t(ctx.locale, 'run.gs.styleIgnored', { message: e instanceof Error ? e.message : String(e) })))

    // Groupes pliables par concurrent (colonnes marquées par la matrice de veille).
    const groupOf = (sheet.columns ?? []).map((c) => (c as { group?: string }).group)
    if (groupOf.some(Boolean)) {
      await applyColumnGroupsServer(token, id, gid, groupOf)
        .then(() => ctx.log('info', t(ctx.locale, 'run.gs.grouped')))
        .catch((e) => ctx.log('warn', t(ctx.locale, 'run.gs.groupIgnored', { message: e instanceof Error ? e.message : String(e) })))
    }

    // Rend au classeur les cellules des exports PRÉCÉDENTS (grille conservée par Google
    // même après `values:clear`) — sans quoi le quota de 10 M finit par bloquer l'export.
    // Après les colonnes formule et les formats : on ne coupe donc rien de ce qui vient
    // d'être posé. Non bloquant : l'export a déjà réussi à ce stade.
    await trimGrid(token, id, gid, matrix.length, (matrix[0]?.length ?? 1) + formulas.length,
      { rowCount: gridRows, columnCount: gridCols })
      .then(() => {
        const before = gridRows * gridCols
        const after = matrix.length * ((matrix[0]?.length ?? 1) + formulas.length)
        if (before > after) ctx.log('info', t(ctx.locale, 'run.gs.gridTrimmed', { count: (before - after).toLocaleString(intlTag(ctx.locale)) }))
      })
      .catch((e) => ctx.log('warn', t(ctx.locale, 'run.gs.gridTrimIgnored', { message: e instanceof Error ? e.message : String(e) })))

    // Graphe natif optionnel (cron compris) : inséré via l'API après écriture des valeurs.
    const chartX = String(config.chartXColumn ?? '').trim()
    const chartVals = String(config.chartValueColumns ?? '').trim()
    if (config.chartEnabled && chartX && chartVals && sheet.rows.length > 0) {
      await addSheetChartServer(token, id, gid, {
        chartType: String(config.chartType || 'bar'),
        xName: chartX, valueNames: chartVals,
        keys, cols, formulas, rowCount: sheet.rows.length, title: displayName,
      })
        .then(() => ctx.log('info', t(ctx.locale, 'run.gs.chartInserted')))
        .catch((e) => ctx.log('warn', t(ctx.locale, 'run.gs.chartIgnored', { message: e instanceof Error ? e.message : String(e) })))
    } else if (config.chartEnabled) {
      ctx.log('warn', t(ctx.locale, 'run.gs.chartSkipped'))
    }

    ctx.log('info', t(ctx.locale, outcome === 'created' ? 'run.gs.sheetCreated' : 'run.gs.sheetUpdated', {
      name: displayName, rows: sheet.rows.length, link: webViewLink ?? id,
    }))
    return { result: { id, name: displayName, webViewLink } }
  },
})

// --- send-gmail --------------------------------------------------------------
// Config client (communicationNodes.tsx) : { clientId, to, subject, body, isHtml,
// iterate, attachmentMode ('source'|'filtered'), attachmentFilename }.
// In : data:any (+ attachment:file, sans équivalent serveur). Out : { result }.
interface GmailAttachment {
  filename: string
  mimeType: string
  base64: string
}

function readDecl(ruleBody: string, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(ruleBody)
  return m ? m[1].trim() : null
}

// Adapte un document HTML autonome (ex : sortie « html » d'un node amont) pour un CORPS
// de mail : strip <html>/<head>, extraction <body>, <style> remonté devant, ET
// background/color/padding du `body {}` réécrits INLINE sur un wrapper (sinon Gmail
// droppe le fond → texte clair invisible sur blanc). (Jumeau de prepareHtmlForEmail
// dans communicationNodes.tsx.)
function prepareHtmlForEmail(html: string): string {
  const isFullDoc = /<html[\s>]/i.test(html) || /<body[\s>]/i.test(html)
  if (!isFullDoc) return html
  const styles = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi))
    .map((m) => m[1])
    .join('\n')
    .trim()
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)
  const inner = bodyMatch ? bodyMatch[1] : html

  const bodyRule = /(?:^|[^-\w])body\s*\{([^}]*)\}/i.exec(styles)?.[1] ?? ''
  const wrapStyle = [
    (readDecl(bodyRule, 'background') ?? readDecl(bodyRule, 'background-color')) &&
      `background:${readDecl(bodyRule, 'background') ?? readDecl(bodyRule, 'background-color')}`,
    readDecl(bodyRule, 'color') && `color:${readDecl(bodyRule, 'color')}`,
    readDecl(bodyRule, 'padding') && `padding:${readDecl(bodyRule, 'padding')}`,
  ]
    .filter(Boolean)
    .join(';')

  const styleBlock = styles ? `<style>\n${styles}\n</style>\n` : ''
  return wrapStyle ? `${styleBlock}<div style="${wrapStyle}">${inner}</div>` : `${styleBlock}${inner}`
}

// Injecte le contenu HTML/texte brut reçu sur le port `data` à la place de {{html}}.
function injectHtmlToken(body: string, data: unknown, isHtml: boolean): string {
  if (typeof data !== 'string') return body
  // CORPS VIDE + du HTML en entrée : ce contenu EST le corps (jumeau du client). Sans
  // cela le mail partait vide faute d'un `{{html}}` que rien n'obligeait à connaître.
  if (!body.trim()) return isHtml ? prepareHtmlForEmail(data) : data
  if (!/\{\{\s*html\s*\}\}/.test(body)) return body
  const injected = isHtml ? prepareHtmlForEmail(data) : data
  return body.replace(/\{\{\s*html\s*\}\}/g, () => injected)
}

function buildMime(to: string, subject: string, body: string, isHtml: boolean, attachment?: GmailAttachment): string {
  const subj = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  const bodyType = isHtml ? 'text/html' : 'text/plain'
  if (!attachment) {
    return [
      `To: ${to}`, `Subject: ${subj}`, 'MIME-Version: 1.0',
      `Content-Type: ${bodyType}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '',
      Buffer.from(body, 'utf8').toString('base64'),
    ].join('\r\n')
  }
  const boundary = `gm${Date.now()}`
  return [
    `To: ${to}`, `Subject: ${subj}`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary=${boundary}`, '',
    `--${boundary}`,
    `Content-Type: ${bodyType}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '',
    Buffer.from(body, 'utf8').toString('base64'),
    `--${boundary}`,
    `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    'Content-Transfer-Encoding: base64', '',
    attachment.base64,
    `--${boundary}--`,
  ].join('\r\n')
}

// La langue est passée explicitement : cette erreur porte de la PROSE et remonte
// dans le journal du run.
async function gmailSend(token: string, mime: string, locale: Locale): Promise<string> {
  const raw = Buffer.from(mime, 'utf8').toString('base64url')
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  const json = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null
  if (!res.ok || !json?.id) {
    throw new Error(t(locale, 'run.gm.apiError', { status: res.status, message: json?.error?.message ?? t(locale, 'run.api.noDetail') }))
  }
  return json.id
}

registerServerNode({
  type: 'send-gmail',
  run: async (ctx, config, inputs) => {
    const token = await getGoogleAccessToken(ctx.uid)
    const isHtml = Boolean(config.isHtml)
    const rows = extractRows(inputs.data)

    // Fichier source pour la pièce jointe « source » : port dédié `attachment`, ou
    // tolérance de câblage sur `data` si c'est un ServerFile (ex : sortie `file` du
    // node « Rapport de coûts IA »).
    const srcFile = asServerFile(inputs.attachment) ?? asServerFile(inputs.data)

    // Pièce jointe : 'source' = fichier reçu en amont (ServerFile) ; 'filtered' = CSV
    // des lignes reçues.
    const buildAttachment = (forRows: Record<string, unknown>[] | null): GmailAttachment | undefined => {
      if (config.attachmentMode === 'source') {
        if (!srcFile) {
          ctx.log('warn', t(ctx.locale, 'run.gm.noSourceFile'))
          return undefined
        }
        return { filename: srcFile.name, mimeType: srcFile.mimeType, base64: srcFile.base64 }
      }
      if (config.attachmentMode !== 'filtered' || !forRows || forRows.length === 0) return undefined
      const csv = sheetToCsv({ rows: forRows })
      return {
        filename: String(config.attachmentFilename ?? '').trim() || 'extract.csv',
        mimeType: 'text/csv',
        base64: Buffer.from(csv, 'utf8').toString('base64'),
      }
    }

    // Mode « 1 email par ligne » : ré-interpolation par row, aucune ligne = aucun envoi.
    if (config.iterate) {
      if (!rows || rows.length === 0) {
        ctx.log('info', t(ctx.locale, 'run.gm.noRowToSend'))
        return { result: { sent: false, count: 0 } }
      }
      const raw = (ctx.rawConfig ?? {}) as Record<string, unknown>
      let count = 0
      for (let i = 0; i < rows.length; i++) {
        if (ctx.signal.aborted) break
        const r = interpolate(raw, { ...rows[i], row: rows[i], index: i }) as Record<string, unknown>
        const to = String(r.to ?? '').trim()
        if (!to) { ctx.log('warn', t(ctx.locale, 'run.gm.rowNoRecipient', { i: i + 1 })); continue }
        const mime = buildMime(to, String(r.subject ?? ''), String(r.body ?? ''), isHtml, buildAttachment([rows[i]]))
        await gmailSend(token, mime, ctx.locale)
        count++
        ctx.log('info', t(ctx.locale, 'run.gm.rowSent', { i: i + 1, total: rows.length, to }))
      }
      return { result: { sent: count > 0, count } }
    }

    const to = String(config.to ?? '').trim()
    if (!to) throw new Error(t(ctx.locale, 'run.gm.noRecipient'))
    let body = injectHtmlToken(String(config.body ?? ''), inputs.data, isHtml)
    // ⚠ ARRÊT si le jeton survit (jumeau du client) : le mail partirait avec « {{html} }»
    // écrit en toutes lettres, visible du destinataire et irrattrapable une fois envoyé.
    if (/\{\{\s*html\s*\}\}/.test(body)) throw new Error(t(ctx.locale, 'run.gm.htmlTokenNoData'))
    if (rows && hasTableToken(body)) body = injectTable(body, rows, isHtml)
    const mime = buildMime(to, String(config.subject ?? ''), body, isHtml, buildAttachment(rows))
    const id = await gmailSend(token, mime, ctx.locale)
    ctx.log('info', t(ctx.locale, 'run.gm.sent', { to, id }))
    return { result: { sent: true, count: 1 } }
  },
})

// ---------------------------------------------------------------------------
// gsheets-import (jumeau SERVEUR) — lit un Google Sheet via l'API Sheets `values`
// et le convertit en Sheet wire-compatible avec le node client (parseExcelFile).
// Débloque la SOURCE d'un workflow cron : headless ne peut pas lire un Upload
// navigateur, mais peut lire un Google Sheets du Drive de l'utilisateur.
//
// Parité des CLÉS de colonnes : parseExcelFile passe par `sheet_to_json`, donc
// clé = en-tête (ligne 1) ; doublons suffixés `_1/_2`, en-tête vide → `__EMPTY[_N]`.
// On reproduit exactement ce nommage pour que « Comparer catalogue » retrouve
// ses colonnes (réf / EAN) à l'identique en cron comme en test client.
//
// Léger : aucune dépendance `xlsx`, aucun export binaire. L'API `values` renvoie
// la matrice typée (UNFORMATTED_VALUE) en UNE requête — supporte 75k+ lignes en
// RAM ; les sorties sont ensuite tronquées (capOutputs) avant écriture Firestore.
// Scope : `auth/drive` (serveur) couvre déjà l'API Sheets, cf. gsheets-export.
// ---------------------------------------------------------------------------

/** Reproduit le nommage de colonnes de SheetJS `sheet_to_json` sur la ligne d'en-tête. */
function sheetKeysFromHeader(header: unknown[]): string[] {
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

/** Liste les onglets (titre + position) d'un classeur, triés par index. */
async function listSheetTabs(token: string, id: string): Promise<{ title: string; index: number }[]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(title,index)`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'sheets.get', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
  const json = (await res.json()) as { sheets?: { properties?: { title?: string; index?: number } }[] }
  return (json.sheets ?? [])
    .map((s) => ({ title: s.properties?.title ?? 'Sheet1', index: s.properties?.index ?? 0 }))
    .sort((a, b) => a.index - b.index)
}

registerServerNode({
  type: 'gsheets-import',
  run: async (ctx, config) => {
    const fileId = String(config.fileId ?? '').trim()
    if (!fileId) throw new Error(t(ctx.locale, 'run.gs.noFileSelected'))
    const token = await getGoogleAccessToken(ctx.uid)

    const tabs = await listSheetTabs(token, fileId)
    if (tabs.length === 0) throw new Error(t(ctx.locale, 'run.gs.noTab'))
    const idx = Math.max(0, Math.min(Number(config.sheetIndex ?? 0), tabs.length - 1))
    const title = tabs[idx].title
    ctx.log('info', t(ctx.locale, 'run.gs.importing', { name: String(config.fileName ?? fileId), index: idx, title }))

    const enc = encodeURIComponent(title)
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${enc}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) throw new Error(tLocal('run.api.error', { api: 'sheets.values', status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) }))
    const json = (await res.json()) as { values?: unknown[][] }
    const matrix = json.values ?? []
    if (matrix.length === 0) throw new Error(t(ctx.locale, 'run.gs.tabEmpty', { title }))

    const keys = sheetKeysFromHeader(matrix[0])
    const columns = keys.map((key, i) => ({ key, label: key, isPrimary: i === 0 }))
    const rows: Record<string, unknown>[] = []
    for (let r = 1; r < matrix.length; r++) {
      const cells = matrix[r] ?? []
      // Ignorer les lignes entièrement vides (parité sheet_to_json).
      if (cells.every((c) => c == null || String(c).trim() === '')) continue
      const row: Record<string, unknown> = { _id: `row_${rows.length}` }
      for (let c = 0; c < keys.length; c++) row[keys[c]] = cells[c] ?? null
      rows.push(row)
    }
    ctx.log('info', t(ctx.locale, 'run.gs.imported', { rows: rows.length, columns: keys.length, title }))
    return { sheet: { name: title, columns, rows, taxonomy: [] } }
  },
})
