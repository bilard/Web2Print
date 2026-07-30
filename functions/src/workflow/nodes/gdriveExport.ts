// functions/src/workflow/nodes/gdriveExport.ts
// Jumeau SERVEUR du node « Export Google Drive » (client : src/features/workflows/
// registry/gdriveNodes.tsx, gdriveExportNode). Upload en headless (cron) d'un
// fichier reçu sur le port `file` (ServerFile) vers Google Drive, via le jeton
// OAuth serveur rafraîchi (mêmes identité/scope drive.file que gsheets-export).
//
// ⚠️ Scope drive.file : on n'écrit QUE dans des dossiers créés par l'app. Un
// parentFolderId pické en drive.readonly côté client échouera (403) — comme le
// client. Sans parentFolderId → racine « Mon Drive » de l'app.
import { registerServerNode } from '../registry'
import { getGoogleAccessToken } from '../../google/serverAuth'
import { asServerFile } from './serverFile'
import { t } from '../../i18n'

interface DriveFileMeta {
  id: string
  name: string
  webViewLink?: string
}

registerServerNode({
  type: 'gdrive-export',
  run: async (ctx, config, inputs) => {
    const file = asServerFile(inputs.file)
    if (!file) {
      throw new Error(t(ctx.locale, 'run.gd.missingFile'))
    }
    const token = await getGoogleAccessToken(ctx.uid)
    ctx.reportConnector?.('gdrive')

    const name = String(config.name ?? '').trim() || file.name || `upload_${Date.now()}`
    const parentFolderId = String(config.parentFolderId ?? '').trim()

    const metadata: Record<string, unknown> = { name }
    if (parentFolderId) metadata.parents = [parentFolderId]

    // Upload multipart (metadata + média) — l'API Drive accepte un body multipart/related.
    const boundary = '-------w2p-' + ctx.uid.slice(0, 8) + '-' + name.length
    const media = Buffer.from(file.base64, 'base64')
    const head =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      `--${boundary}\r\n` +
      `Content-Type: ${file.mimeType}\r\n\r\n`
    const tail = `\r\n--${boundary}--`
    const body = Buffer.concat([Buffer.from(head, 'utf8'), media, Buffer.from(tail, 'utf8')])

    ctx.log('info', t(ctx.locale, 'run.gd.uploading', { name, size: (media.length / 1024).toFixed(1) }))
    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    )
    const meta = (await res.json().catch(() => null)) as (DriveFileMeta & { error?: { message?: string } }) | null
    if (!res.ok || !meta?.id) {
      throw new Error(t(ctx.locale, 'run.gd.uploadFailed', { status: res.status, message: meta?.error?.message ?? t(ctx.locale, 'run.api.noDetail') }))
    }

    ctx.log('info', t(ctx.locale, 'run.gd.ok', { link: meta.webViewLink ?? meta.id }))
    return { result: { id: meta.id, name: meta.name, webViewLink: meta.webViewLink } }
  },
})
