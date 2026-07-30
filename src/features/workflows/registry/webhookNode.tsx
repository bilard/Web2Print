// Node « Webhook / Make » : POST HTTP sortant générique. Passerelle d'intégration —
// pousse les données du workflow vers une URL de webhook externe (typiquement le
// module « Custom Webhook » de Make, qui distribue ensuite vers 2000+ apps SaaS).
// Calqué sur send-telegram (mode iterate + jumeau serveur pour le cron).
import { Webhook } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'
import { interpolate } from '../runtime/interpolate'
import { extractRows } from '../runtime/executor'
// `run()` n'est pas un composant : helper `t()` de module (lit la locale courante).
import { t } from '@/lib/i18n'

type WebhookMethod = 'POST' | 'PUT' | 'PATCH'

interface WebhookConfig {
  url: string
  method: WebhookMethod
  /** En-têtes HTTP, un « Clé: Valeur » par ligne. Optionnel. */
  headers: string
  /** Gabarit de corps JSON (avec {{Colonne}}). Vide = envoyer la donnée entrante telle quelle. */
  body: string
  /** 1 requête par ligne si l'entrée `data` est un tableau de lignes. */
  iterate: boolean
  /** Lit et expose la réponse du webhook sur le port `response` (module « Webhook Response » de Make). */
  waitResponse: boolean
}

interface WebhookResult {
  sent: boolean
  count: number
  statuses: number[]
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

const inputCls =
  'w-full bg-background border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none'

function WebhookConfigUi({
  config,
  onChange,
}: {
  config: WebhookConfig
  onChange: (next: WebhookConfig) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-neutral-400 mb-1 block">URL du webhook</label>
        <input
          type="text"
          value={config.url}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="https://hook.eu2.make.com/xxxxxxxx"
          className={inputCls}
        />
        <p className="text-[10px] text-neutral-600 mt-1.5 leading-snug">
          Colle l'URL du module <strong className="text-neutral-400">« Custom Webhook »</strong> de
          Make (ou tout autre webhook). Make distribue ensuite vers ses 2000+ apps.
        </p>
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">{t('node.webhook.method.label')}</label>
        <select
          value={config.method}
          onChange={(e) => onChange({ ...config, method: e.target.value as WebhookMethod })}
          className={inputCls}
        >
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">Corps (JSON)</label>
        <textarea
          value={config.body}
          onChange={(e) => onChange({ ...config, body: e.target.value })}
          rows={4}
          placeholder={'{\n  "name": "{{name}}",\n  "price": "{{price}}"\n}'}
          className={`${inputCls} resize-y font-mono`}
        />
        <p className="text-[10px] text-neutral-600 mt-1.5 leading-snug">
          Gabarit avec <code className="text-emerald-300/80">{'{{Colonne}}'}</code>. Laisse vide pour
          envoyer telle quelle la donnée reçue sur le port{' '}
          <code className="text-emerald-300/80">data</code>.
        </p>
      </div>

      <div>
        <label className="text-xs text-neutral-400 mb-1 block">{t('node.webhook.headers.label')}</label>
        <textarea
          value={config.headers}
          onChange={(e) => onChange({ ...config, headers: e.target.value })}
          rows={2}
          placeholder={'Authorization: Bearer xxx\nX-Custom: valeur'}
          className={`${inputCls} resize-y font-mono`}
        />
        <p className="text-[10px] text-neutral-600 mt-1.5 leading-snug">
          {t('node.webhook.headers.note')}
        </p>
      </div>

      <label className="flex items-start gap-2 px-2 py-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 cursor-pointer hover:bg-cyan-500/10 transition-colors">
        <input
          type="checkbox"
          checked={config.iterate}
          onChange={(e) => onChange({ ...config, iterate: e.target.checked })}
          className="accent-cyan-500 mt-0.5"
        />
        <div className="flex-1">
          <div className="text-[12px] text-cyan-200">{t('node.webhook.iterate.label')}</div>
          <div className="text-[10px] text-neutral-500 leading-snug mt-0.5">
            {t('node.webhook.iterate.note')}
          </div>
        </div>
      </label>

      <label className="flex items-start gap-2 px-2 py-2 rounded-md border border-cyan-500/20 bg-cyan-500/5 cursor-pointer hover:bg-cyan-500/10 transition-colors">
        <input
          type="checkbox"
          checked={config.waitResponse}
          onChange={(e) => onChange({ ...config, waitResponse: e.target.checked })}
          className="accent-cyan-500 mt-0.5"
        />
        <div className="flex-1">
          <div className="text-[12px] text-cyan-200">{t('node.webhook.wait.label')}</div>
          <div className="text-[10px] text-neutral-500 leading-snug mt-0.5">
            Expose le corps de réponse sur le port{' '}
            <code className="text-emerald-300/80">response</code> (module « Webhook Response » de
            Make). Sinon, on ne lit que le statut HTTP.
          </div>
        </div>
      </label>
    </div>
  )
}

const webhookNode: NodeSpec<
  WebhookConfig,
  { data?: unknown },
  { result: WebhookResult; response: unknown }
> = {
  type: 'webhook-post',
  category: 'communication',
  labelKey: 'node.webhook-post.label',
  descriptionKey: 'node.webhook-post.desc',
  icon: Webhook,
  inputs: [{ name: 'data', type: 'any' }],
  outputs: [
    { name: 'result', type: 'any' },
    { name: 'response', type: 'any' },
  ],
  configSchema: [],
  defaultConfig: {
    url: '',
    method: 'POST',
    headers: '',
    body: '',
    iterate: false,
    waitResponse: false,
  },
  runtime: 'any',
  ConfigComponent: WebhookConfigUi,
  run: async (ctx, config, inputs) => {
    const url = config.url.trim()
    if (!url) {
      throw new Error(t('run.wh.urlMissingHint'))
    }

    // Mode « 1 requête par ligne » : ré-interpolation du config brut par ligne.
    // AUCUNE ligne reçue → rien n'est envoyé, par design (cf. send-telegram).
    if (config.iterate) {
      const rows = extractRows(inputs.data)
      if (!rows || rows.length === 0) {
        ctx.log('info', t('run.wh.noRowToSend'))
        return { result: { sent: false, count: 0, statuses: [] }, response: null }
      }
      const rawConfig = ctx.rawConfig as WebhookConfig | undefined
      ctx.log('info', t('run.wh.iterating', { count: rows.length }))
      const statuses: number[] = []
      const responses: unknown[] = []
      for (let i = 0; i < rows.length; i++) {
        if (ctx.signal.aborted) {
          ctx.log('warn', t('run.wh.interrupted', { count: statuses.length }))
          break
        }
        const row = rows[i]
        const r = rawConfig ? interpolate(rawConfig, { ...row, row, index: i }) : config
        const reqUrl = r.url.trim() || url
        const body = r.body.trim() ? r.body : JSON.stringify(row)
        try {
          const out = await sendWebhook(
            reqUrl,
            r.method,
            parseHeaders(r.headers),
            body,
            config.waitResponse,
            ctx.signal,
          )
          statuses.push(out.status)
          if (config.waitResponse) responses.push(out.body)
          ctx.log(out.ok ? 'info' : 'warn', `[${i + 1}/${rows.length}] HTTP ${out.status}`)
        } catch (err) {
          ctx.log('warn', t('run.wh.rowFailed', { i: i + 1, message: err instanceof Error ? err.message : String(err) }))
        }
      }
      return {
        result: { sent: statuses.length > 0, count: statuses.length, statuses },
        response: config.waitResponse ? responses : null,
      }
    }

    // Mode requête unique.
    const body = config.body.trim() ? config.body : JSON.stringify(inputs.data ?? {})
    const out = await sendWebhook(
      url,
      config.method,
      parseHeaders(config.headers),
      body,
      config.waitResponse,
      ctx.signal,
    )
    if (!out.ok) {
      throw new Error(t('run.wh.httpError', {
        status: out.status,
        body: out.bodyText ? ` — ${out.bodyText.slice(0, 200)}` : '',
      }))
    }
    ctx.log('info', t('run.wh.sent', { url, status: out.status }))
    return {
      result: { sent: true, count: 1, statuses: [out.status] },
      response: config.waitResponse ? out.body : null,
    }
  },
}

nodeRegistry.register(webhookNode)
