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

/** CSV RFC4180 minimal depuis une sheet (colonnes déclarées, sinon union des clés). */
function sheetToCsv(sheet: SheetLike): string {
  const rows = sheet.rows ?? []
  let keys = (sheet.columns ?? []).map((c) => c.key).filter((k) => k && k !== '_id')
  if (keys.length === 0) {
    const all = new Set<string>()
    for (const r of rows) for (const k of Object.keys(r)) if (k !== '_id') all.add(k)
    keys = [...all]
  }
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
