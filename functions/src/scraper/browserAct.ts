// Jumeau SERVEUR du client BrowserAct (src/features/scraping/core/browserAct.ts).
// Réduit au strict nécessaire du cron : lancer un bot et attendre son résultat.
//
// ⚠ BrowserAct n'est PAS un lecteur d'URL : il exécute un bot construit dans leur tableau
// de bord, de façon asynchrone (création de tâche + interrogation) et facturée à la TÂCHE.
// Un appel = un run de navigateur, pas une requête HTTP.
const API_BASE = 'https://api.browseract.com'

/** Statuts terminaux : inutile de continuer à interroger la tâche. */
const TERMINAL = new Set(['finished', 'canceled', 'failed'])

/** Déballe l'enveloppe `{ code, msg, data }` ; les succès sont parfois le payload nu. */
function unwrap(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (typeof obj.code === 'number' && obj.code !== 0) return null
  const data = obj.data
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return obj
}

async function call(path: string, apiKey: string, body?: unknown): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: body != null ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      signal: ctrl.signal,
    })
    if (!res.ok) return null
    return unwrap(await res.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Lance un bot et attend sa fin. Rend sa sortie brute (`output.string`), ou null —
 * fail-open : un exécuteur payant indisponible ne doit jamais casser une passe.
 */
export async function runBrowserActBot(
  apiKey: string, botId: string, params: Record<string, string>, timeoutMs = 300_000,
): Promise<string | null> {
  const started = await call('/v2/workflow/run-task', apiKey, {
    workflow_id: botId,
    input_parameters: Object.entries(params).map(([name, value]) => ({ name, value })),
  })
  const taskId = typeof started?.id === 'string' ? started.id : null
  if (!taskId) return null
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await call(`/v2/workflow/get-task?task_id=${encodeURIComponent(taskId)}`, apiKey)
    const status = typeof state?.status === 'string' ? state.status : 'unknown'
    if (TERMINAL.has(status)) {
      const out = state?.output && typeof state.output === 'object' ? state.output as Record<string, unknown> : undefined
      return typeof out?.string === 'string' ? out.string : null
    }
    await new Promise((r) => setTimeout(r, 3_000))
  }
  return null
}
