// functions/src/workflow/nodes/google.ts
// Réimplémentation SERVEUR des nodes Google (wire-compatibles avec les specs
// client) : gsheets-export (sheet → Google Sheets dans Drive) et send-gmail.
// Auth : refresh token offline du compte (cf. google/serverAuth.ts) — aucune
// session navigateur requise. Contrainte drive.file conservée : on n'écrit que
// dans des fichiers/dossiers créés par l'app.
import { registerServerNode } from '../registry'
import { interpolate, extractRows } from '../interpolate'
import { getGoogleAccessToken } from '../../google/serverAuth'

interface SheetLike {
  name?: string
  columns?: { key: string; label?: string }[]
  rows?: Record<string, unknown>[]
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

/** Récupère le 1er onglet (titre + gid) d'un spreadsheet. */
async function getFirstTab(token: string, id: string): Promise<{ title: string; gid: number }> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties(title,sheetId)`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Sheets get ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const json = (await res.json()) as { sheets?: { properties?: { title?: string; sheetId?: number } }[] }
  const p = json.sheets?.[0]?.properties
  return { title: p?.title ?? 'Sheet1', gid: p?.sheetId ?? 0 }
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
  if (!res.ok) throw new Error(`Sheets values ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

/** Applique un numberFormat par colonne (ligne d'en-tête exclue). Non bloquant. */
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
  if (!res.ok) throw new Error(`batchUpdate ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
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
  if (!res.ok) throw new Error(`timeZone ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
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
  if (!res.ok) throw new Error(`Sheets formules ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
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
  if (!resolved) throw new Error('axe X ou colonnes de valeurs introuvables')
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
  if (!res.ok) throw new Error(`addChart ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
}

registerServerNode({
  type: 'gsheets-export',
  run: async (ctx, config, inputs) => {
    const sheet = (inputs.sheet ?? {}) as SheetLike
    if (!sheet.rows || sheet.rows.length === 0) {
      throw new Error('gsheets-export : sheet vide en entrée.')
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
    let verb: string

    if (mode === 'update' && targetId) {
      id = targetId
      verb = 'mis à jour'
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
      if (!res.ok || !json?.id) throw new Error(`gsheets-export : création Drive ${res.status} — ${json?.error?.message ?? 'échec'}`)
      id = json.id
      displayName = json.name ?? name
      webViewLink = json.webViewLink
      verb = 'créé'
    }

    const { title, gid } = await getFirstTab(token, id)
    if (verb === 'créé') {
      await setSpreadsheetTimeZone(token, id).catch((e) =>
        ctx.log('warn', `Fuseau horaire ignoré : ${e instanceof Error ? e.message : e}`),
      )
    }
    await writeValues(token, id, title, matrix)
    if (formulas.length > 0 && sheet.rows.length > 0) {
      await writeFormulas(token, id, title, keys, formulas, sheet.rows.length).catch((e) =>
        ctx.log('warn', `Colonnes formule ignorées : ${e instanceof Error ? e.message : e}`),
      )
      ctx.log('info', `${formulas.length} colonne(s) formule ajoutée(s).`)
    }
    // Formats = colonnes données (détectés) + colonnes formule (format choisi par l'utilisateur).
    const allFormats = [...formats, ...formulas.map((f) => (f.format ? FORMULA_FORMATS[f.format] ?? null : null))]
    await applyNumberFormats(token, id, gid, allFormats).catch((e) =>
      ctx.log('warn', `Formatage colonnes ignoré : ${e instanceof Error ? e.message : e}`),
    )

    // Graphe natif optionnel (cron compris) : inséré via l'API après écriture des valeurs.
    const chartX = String(config.chartXColumn ?? '').trim()
    const chartVals = String(config.chartValueColumns ?? '').trim()
    if (config.chartEnabled && chartX && chartVals && sheet.rows.length > 0) {
      await addSheetChartServer(token, id, gid, {
        chartType: String(config.chartType || 'bar'),
        xName: chartX, valueNames: chartVals,
        keys, cols, formulas, rowCount: sheet.rows.length, title: displayName,
      })
        .then(() => ctx.log('info', 'Graphique inséré.'))
        .catch((e) => ctx.log('warn', `Graphique ignoré : ${e instanceof Error ? e.message : e}`))
    } else if (config.chartEnabled) {
      ctx.log('warn', 'Graphique ignoré : axe X / colonnes de valeurs manquants (ou aucune donnée).')
    }

    ctx.log('info', `Google Sheet « ${displayName} » ${verb} (${sheet.rows.length} lignes) — ${webViewLink ?? id}`)
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

async function gmailSend(token: string, mime: string): Promise<string> {
  const raw = Buffer.from(mime, 'utf8').toString('base64url')
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  const json = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null
  if (!res.ok || !json?.id) {
    throw new Error(`send-gmail : Gmail ${res.status} — ${json?.error?.message ?? 'échec envoi'}`)
  }
  return json.id
}

registerServerNode({
  type: 'send-gmail',
  run: async (ctx, config, inputs) => {
    const token = await getGoogleAccessToken(ctx.uid)
    const isHtml = Boolean(config.isHtml)
    const rows = extractRows(inputs.data)

    // Pièce jointe : 'filtered' = CSV des lignes reçues ; 'source' nécessite un
    // fichier produit en amont (rendu navigateur) → indisponible côté serveur.
    const buildAttachment = (forRows: Record<string, unknown>[] | null): GmailAttachment | undefined => {
      if (config.attachmentMode !== 'filtered' || !forRows || forRows.length === 0) return undefined
      const csv = sheetToCsv({ rows: forRows })
      return {
        filename: String(config.attachmentFilename ?? '').trim() || 'extract.csv',
        mimeType: 'text/csv',
        base64: Buffer.from(csv, 'utf8').toString('base64'),
      }
    }
    if (config.attachmentMode === 'source') {
      ctx.log('warn', 'Pièce jointe « source » indisponible côté serveur (fichier produit par le navigateur) — envoi sans pièce jointe.')
    }

    // Mode « 1 email par ligne » : ré-interpolation par row, aucune ligne = aucun envoi.
    if (config.iterate) {
      if (!rows || rows.length === 0) {
        ctx.log('info', 'Mode « 1 email par ligne » : aucune ligne reçue — rien à envoyer.')
        return { result: { sent: false, count: 0 } }
      }
      const raw = (ctx.rawConfig ?? {}) as Record<string, unknown>
      let count = 0
      for (let i = 0; i < rows.length; i++) {
        if (ctx.signal.aborted) break
        const r = interpolate(raw, { ...rows[i], row: rows[i], index: i }) as Record<string, unknown>
        const to = String(r.to ?? '').trim()
        if (!to) { ctx.log('warn', `Ligne ${i + 1} ignorée : destinataire vide.`); continue }
        const mime = buildMime(to, String(r.subject ?? ''), String(r.body ?? ''), isHtml, buildAttachment([rows[i]]))
        await gmailSend(token, mime)
        count++
        ctx.log('info', `[${i + 1}/${rows.length}] email → ${to}`)
      }
      return { result: { sent: count > 0, count } }
    }

    const to = String(config.to ?? '').trim()
    if (!to) throw new Error('send-gmail : destinataire (« to ») manquant.')
    const mime = buildMime(to, String(config.subject ?? ''), String(config.body ?? ''), isHtml, buildAttachment(rows))
    const id = await gmailSend(token, mime)
    ctx.log('info', `Email envoyé à ${to} (id ${id}).`)
    return { result: { sent: true, count: 1 } }
  },
})
