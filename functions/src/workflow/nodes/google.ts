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
function toCell(v: unknown, fmt: GFormat | null): string | number {
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

// --- Colonnes formule (parité avec src/features/gdrive/gdriveCore.ts) ---------
interface FormulaColumn { header: string; template: string }

/** Parse « En-tête = template » (une par ligne ; le template référence {colonne}). */
export function parseFormulaColumns(raw: string): FormulaColumn[] {
  return String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const eq = line.indexOf('=')
      if (eq < 0) return null
      const header = line.slice(0, eq).trim()
      const template = line.slice(eq + 1).trim()
      return header && template ? { header, template } : null
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
    await writeValues(token, id, title, matrix)
    if (formulas.length > 0 && sheet.rows.length > 0) {
      await writeFormulas(token, id, title, keys, formulas, sheet.rows.length).catch((e) =>
        ctx.log('warn', `Colonnes formule ignorées : ${e instanceof Error ? e.message : e}`),
      )
      ctx.log('info', `${formulas.length} colonne(s) formule ajoutée(s).`)
    }
    await applyNumberFormats(token, id, gid, formats).catch((e) =>
      ctx.log('warn', `Formatage colonnes ignoré : ${e instanceof Error ? e.message : e}`),
    )

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
