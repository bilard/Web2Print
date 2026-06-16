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

/** Applique un numberFormat par colonne au Sheet (ligne d'en-tête exclue). Non bloquant :
 *  le formatage est un bonus, jamais une raison de faire échouer l'export. */
async function applyColumnFormats(token: string, spreadsheetId: string, sheet: SheetLike): Promise<void> {
  const keys = sheetKeys(sheet)
  const rows = sheet.rows ?? []
  const cols = sheet.columns ?? []
  const formats = keys.map((k) =>
    detectColumnFormat(k, cols.find((c) => c.key === k)?.label ?? k, rows.map((r) => r[k])),
  )
  if (formats.every((f) => f === null)) return

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.sheetId`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const meta = (await metaRes.json().catch(() => null)) as { sheets?: { properties?: { sheetId?: number } }[] } | null
  const gid = meta?.sheets?.[0]?.properties?.sheetId ?? 0

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
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  })
  if (!res.ok) throw new Error(`batchUpdate ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
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
    const csv = sheetToCsv(sheet)

    // Mode « update » : réécrit le contenu d'un Google Sheet EXISTANT (créé par
    // l'app — contrainte drive.file) via un upload média Drive. Évite d'empiler
    // un nouveau fichier à chaque exécution (ex : cron quotidien).
    const mode = String(config.mode ?? 'create')
    const targetId = parseSpreadsheetId(String(config.spreadsheetId ?? ''))
    if (mode === 'update' && targetId) {
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${targetId}?uploadType=media&fields=id,name,webViewLink`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv; charset=UTF-8' },
          body: csv,
        },
      )
      const json = (await res.json().catch(() => null)) as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } } | null
      if (!res.ok || !json?.id) {
        throw new Error(
          `gsheets-export : mise à jour Drive ${res.status} — ${json?.error?.message ?? 'échec'} ` +
          `(le fichier doit avoir été créé par l’app : scope drive.file).`,
        )
      }
      ctx.log('info', `Google Sheet « ${json.name} » mis à jour (${sheet.rows.length} lignes) — ${json.webViewLink ?? json.id}`)
      await applyColumnFormats(token, json.id, sheet).catch((e) => ctx.log('warn', `Formatage colonnes ignoré : ${e instanceof Error ? e.message : e}`))
      return { result: { id: json.id, name: json.name, webViewLink: json.webViewLink } }
    }

    const metadata: Record<string, unknown> = {
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
    }
    const parent = String(config.parentFolderId ?? '').trim()
    if (parent) metadata.parents = [parent]

    const boundary = `wf${Date.now()}`
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: text/csv; charset=UTF-8',
      '',
      csv,
      `--${boundary}--`,
    ].join('\r\n')

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      },
    )
    const json = (await res.json().catch(() => null)) as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } } | null
    if (!res.ok || !json?.id) {
      throw new Error(`gsheets-export : Drive ${res.status} — ${json?.error?.message ?? 'échec upload'}`)
    }
    ctx.log('info', `Google Sheet « ${json.name} » créé (${sheet.rows.length} lignes) — ${json.webViewLink ?? json.id}`)
    await applyColumnFormats(token, json.id, sheet).catch((e) => ctx.log('warn', `Formatage colonnes ignoré : ${e instanceof Error ? e.message : e}`))
    return { result: { id: json.id, name: json.name, webViewLink: json.webViewLink } }
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
