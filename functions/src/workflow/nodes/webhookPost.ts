// functions/src/workflow/nodes/webhookPost.ts
// Réimplémentation SERVEUR (headless) du node client `webhook-post` (Webhook / Make).
// WIRE-COMPATIBLE : mêmes clés de config, même port d'entrée `data`, mêmes ports de
// sortie `result` / `response`. Permet l'exécution en cron (sans navigateur).
import { lookup } from 'node:dns/promises'
import { registerServerNode } from '../registry'
import { interpolate, extractRows } from '../interpolate'
import { t, type Locale } from '../../i18n'

/**
 * Garde-fou SSRF : le node tourne côté serveur (Cloud Functions, contexte admin) et
 * fetch une URL ARBITRAIRE fournie par l'utilisateur. On refuse les schémas non-HTTP
 * et les cibles internes (loopback, IP privées, link-local/métadonnées cloud). On
 * résout le nom via DNS pour bloquer un domaine public pointant vers une IP privée.
 * (Résidu TOCTOU assumé : le fetch peut re-résoudre — risque mineur vs. attaque triviale.)
 */
function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true // link-local + métadonnées cloud (169.254.169.254)
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false
  }
  const v6 = ip.toLowerCase()
  return (
    v6 === '::1' ||
    v6 === '::' ||
    v6.startsWith('fe80') || // link-local
    v6.startsWith('fc') ||
    v6.startsWith('fd') || // ULA
    v6.startsWith('::ffff:') // IPv4-mapped (laisse passer la vérif au resolver, déjà couvert v4)
  )
}

// La langue est passée EXPLICITEMENT : cette garde est une fonction pure, sans
// contexte de run, et ses messages remontent dans le journal comme les autres.
async function assertSafeUrl(raw: string, locale: Locale): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(t(locale, 'run.wh.invalidUrl', { url: raw }))
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(t(locale, 'run.wh.badScheme', { scheme: parsed.protocol }))
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
    throw new Error(t(locale, 'run.wh.internalTarget'))
  }
  // Si l'hôte est déjà une IP littérale, on la teste directement ; sinon on résout.
  const literal = /^[\d.]+$/.test(host) || host.includes(':')
  const addrs = literal ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  for (const { address } of addrs) {
    if (isPrivateIp(address)) {
      throw new Error(t(locale, 'run.wh.internalIp'))
    }
  }
}

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
  locale: Locale,
): Promise<WebhookCall> {
  await assertSafeUrl(url, locale)
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
    if (!url) throw new Error(t(ctx.locale, 'run.wh.urlMissing'))
    const method = String(config.method ?? 'POST')
    const waitResponse = Boolean(config.waitResponse)

    // Mode « 1 requête par ligne » : ré-interpolation du config brut par ligne.
    if (config.iterate) {
      const rows = extractRows(inputs.data)
      if (!rows || rows.length === 0) {
        ctx.log('info', t(ctx.locale, 'run.wh.noRowToSend'))
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
          const out = await sendWebhook(reqUrl, String(r.method ?? method), headers, body, waitResponse, ctx.signal, ctx.locale)
          statuses.push(out.status)
          if (waitResponse) responses.push(out.body)
          ctx.log(out.ok ? 'info' : 'warn', `[${i + 1}/${rows.length}] HTTP ${out.status}`)
        } catch (err) {
          ctx.log('warn', t(ctx.locale, 'run.wh.rowFailed', { i: i + 1, message: err instanceof Error ? err.message : String(err) }))
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
    const out = await sendWebhook(url, method, headers, body, waitResponse, ctx.signal, ctx.locale)
    if (!out.ok) {
      throw new Error(t(ctx.locale, 'run.wh.httpError', {
        status: out.status,
        body: out.bodyText ? ` — ${out.bodyText.slice(0, 200)}` : '',
      }))
    }
    ctx.log('info', t(ctx.locale, 'run.wh.sent', { url, status: out.status }))
    return {
      result: { sent: true, count: 1, statuses: [out.status] },
      response: waitResponse ? out.body : null,
    }
  },
})
