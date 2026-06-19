// functions/src/workflow/nodes/webhookPost.ts
// Réimplémentation SERVEUR (headless) du node client `webhook-post` (Webhook / Make).
// WIRE-COMPATIBLE : mêmes clés de config, même port d'entrée `data`, mêmes ports de
// sortie `result` / `response`. Permet l'exécution en cron (sans navigateur).
import { registerServerNode } from '../registry'
import { interpolate, extractRows } from '../interpolate'

/** Découpe un bloc « Clé: Valeur » (une par ligne) en map d'en-têtes. */
function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (key) out[key] = line.slice(idx + 1).trim()
  }
  return out
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

interface WebhookCall {
  status: number
  ok: boolean
  body: unknown
  bodyText: string
}

/** Émet la requête HTTP. `content-type: application/json` par défaut (surchargé par les en-têtes). */
async function sendWebhook(
  url: string,
  method: string,
  userHeaders: Record<string, string>,
  body: string,
  readBody: boolean,
  signal: AbortSignal,
): Promise<WebhookCall> {
  const headers: Record<string, string> = { ...userHeaders }
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, { method, headers, body, signal })
  let parsed: unknown = null
  let bodyText = ''
  if (readBody || !res.ok) {
    bodyText = await res.text().catch(() => '')
    parsed = (res.headers.get('content-type') ?? '').includes('json') ? safeJson(bodyText) : bodyText
  }
  return { status: res.status, ok: res.ok, body: parsed, bodyText }
}

registerServerNode({
  type: 'webhook-post',
  run: async (ctx, config, inputs) => {
    const url = String(config.url ?? '').trim()
    if (!url) throw new Error('webhook-post : URL du webhook manquante.')
    const method = String(config.method ?? 'POST')
    const waitResponse = Boolean(config.waitResponse)

    // Mode « 1 requête par ligne » : ré-interpolation du config brut par ligne.
    if (config.iterate) {
      const rows = extractRows(inputs.data)
      if (!rows || rows.length === 0) {
        ctx.log('info', 'Mode « 1 requête par ligne » : aucune ligne reçue — rien à envoyer.')
        return { result: { sent: false, count: 0, statuses: [] }, response: null }
      }
      const raw = (ctx.rawConfig ?? {}) as Record<string, unknown>
      const statuses: number[] = []
      const responses: unknown[] = []
      for (let i = 0; i < rows.length; i++) {
        if (ctx.signal.aborted) break
        const row = rows[i]
        const r = interpolate(raw, { ...row, row, index: i }) as Record<string, unknown>
        const reqUrl = String(r.url ?? '').trim() || url
        const headers = parseHeaders(String(r.headers ?? ''))
        const body = String(r.body ?? '').trim() ? String(r.body) : JSON.stringify(row)
        try {
          const out = await sendWebhook(reqUrl, String(r.method ?? method), headers, body, waitResponse, ctx.signal)
          statuses.push(out.status)
          if (waitResponse) responses.push(out.body)
          ctx.log(out.ok ? 'info' : 'warn', `[${i + 1}/${rows.length}] HTTP ${out.status}`)
        } catch (err) {
          ctx.log('warn', `Ligne ${i + 1} échouée : ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      return {
        result: { sent: statuses.length > 0, count: statuses.length, statuses },
        response: waitResponse ? responses : null,
      }
    }

    // Mode requête unique.
    const headers = parseHeaders(String(config.headers ?? ''))
    const body = String(config.body ?? '').trim() ? String(config.body) : JSON.stringify(inputs.data ?? {})
    const out = await sendWebhook(url, method, headers, body, waitResponse, ctx.signal)
    if (!out.ok) {
      throw new Error(`webhook-post : HTTP ${out.status}${out.bodyText ? ` — ${out.bodyText.slice(0, 200)}` : ''}`)
    }
    ctx.log('info', `Webhook envoyé → ${url} (HTTP ${out.status}).`)
    return {
      result: { sent: true, count: 1, statuses: [out.status] },
      response: waitResponse ? out.body : null,
    }
  },
})
