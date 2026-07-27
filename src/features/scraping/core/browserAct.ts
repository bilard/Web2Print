// Client de l'API BrowserAct (https://api.browseract.com, v2).
//
// ⚠ BrowserAct n'est PAS un scraper « URL → HTML » comme Jina, Firecrawl ou Bright Data :
// c'est un EXÉCUTEUR de bots. On ne lui donne pas une page à lire, on lui demande de
// lancer un `workflow_id` — un bot construit dans leur tableau de bord — avec des
// paramètres d'entrée nommés, puis on interroge la tâche jusqu'à sa fin. La sortie est
// `output.string`, dont le format est celui qu'a défini le bot (typiquement du JSON), pas
// du HTML. Conséquences directes sur le câblage :
//   • pas de palier possible dans la cascade `fetchHtml` (elle rend du HTML synchrone) ;
//   • asynchrone et facturé à la TÂCHE, avec 1 tâche concurrente en gratuit / 20 en payant
//     → utilisable PAR PRODUIT (recherche dirigée, fiche PIM), jamais par page de liste.
//
// HYPOTHÈSE à confirmer au premier appel authentifié : le PRÉFLIGHT reflète l'origine et
// autorise `authorization`, donc les appels navigateur devraient passer sans proxy Cloud
// Function. Ce n'est PAS une mesure — faute de clé, la réponse 200 authentifiée n'a jamais
// été observée, et ScrapFly (cf. `apiKeys.ts`) s'est révélé bloqué côté navigateur APRÈS un
// préflight en apparence permissif. Si ça tombe, le remède est un jumeau côté functions.
//
// Fail-open partout : toute erreur rend null / [] et laisse l'appelant poursuivre avec les
// moteurs existants. Un exécuteur payant indisponible ne doit jamais casser une passe.
import { debugLog } from '@/lib/debugLog'

const API_BASE = 'https://api.browseract.com'

/** Statuts de tâche publiés par l'API. */
type BrowserActTaskStatus =
  | 'created' | 'running' | 'finished' | 'canceled' | 'pausing' | 'paused' | 'failed' | 'unknown'

/** Statuts terminaux : inutile de continuer à interroger la tâche. */
const TERMINAL: ReadonlySet<BrowserActTaskStatus> = new Set(['finished', 'canceled', 'failed'])

export interface BrowserActWorkflow {
  id: string
  name: string
  description?: string
}

export interface BrowserActResult {
  status: BrowserActTaskStatus
  /** Sortie brute du bot (`output.string`) — format défini par le bot, souvent du JSON. */
  output?: string
  /** Fichiers produits par la tâche (le bot peut exporter un CSV/JSON). */
  files?: string[]
  /** Crédits consommés par la tâche (suivi de coût). */
  credit?: number
  /** Message d'échec lisible (`task_failure_info.message`). */
  error?: string
}

/**
 * Déballe l'enveloppe standard `{ code, msg, data, traceId }`. L'API la renvoie sur les
 * erreurs ; les réponses de succès sont parfois le payload nu. On accepte les deux plutôt
 * que de dépendre d'une forme que la doc ne garantit pas.
 */
function unwrap(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (typeof obj.code === 'number' && obj.code !== 0) return null // erreur métier
  const data = obj.data
  if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>
  return obj
}

interface CallOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

/** Appel authentifié. Rend null sur toute anomalie (réseau, HTTP, enveloppe en erreur). */
async function call(
  path: string, apiKey: string, opts: CallOptions = {},
): Promise<Record<string, unknown> | null> {
  const { method = 'GET', body, timeoutMs = 30_000, signal } = opts
  const key = apiKey.trim()
  if (!key) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => { try { ctrl.abort() } catch { /* ignore */ } }, timeoutMs)
  const onAbort = () => { try { ctrl.abort() } catch { /* ignore */ } }
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      debugLog('[browseract] HTTP', res.status, path)
      return null
    }
    return unwrap(await res.json())
  } catch (e) {
    debugLog('[browseract] échec', path, e instanceof Error ? e.message : e)
    return null
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Bots du compte (page 1, jusqu'à `limit`). Sert à peupler le sélecteur de bot ET de ping
 * authentifié pour le test de connectivité de la clé. Rend null si la clé est refusée —
 * distinct d'un compte SANS bot, qui rend [].
 */
export async function listBrowserActWorkflows(
  apiKey: string, limit = 100,
): Promise<BrowserActWorkflow[] | null> {
  const data = await call(`/v2/workflow/list-workflows?page=1&limit=${limit}`, apiKey)
  if (!data) return null
  const items = Array.isArray(data.items) ? data.items : []
  return items.flatMap((raw): BrowserActWorkflow[] => {
    if (!raw || typeof raw !== 'object') return []
    const o = raw as Record<string, unknown>
    if (typeof o.id !== 'string' || !o.id) return []
    return [{
      id: o.id,
      name: typeof o.name === 'string' && o.name ? o.name : o.id,
      description: typeof o.description === 'string' ? o.description : undefined,
    }]
  })
}

/** Lance une tâche et rend son `task_id`, ou null. */
async function startTask(
  apiKey: string, workflowId: string, params: Record<string, string>, signal?: AbortSignal,
): Promise<string | null> {
  const data = await call('/v2/workflow/run-task', apiKey, {
    method: 'POST',
    signal,
    body: {
      workflow_id: workflowId,
      input_parameters: Object.entries(params).map(([name, value]) => ({ name, value })),
    },
  })
  const id = data?.id
  return typeof id === 'string' && id ? id : null
}

/** État courant d'une tâche. */
async function getTask(apiKey: string, taskId: string, signal?: AbortSignal): Promise<BrowserActResult | null> {
  const data = await call(`/v2/workflow/get-task?task_id=${encodeURIComponent(taskId)}`, apiKey, { signal })
  if (!data) return null
  const status = (typeof data.status === 'string' ? data.status : 'unknown') as BrowserActTaskStatus
  const out = data.output && typeof data.output === 'object' ? data.output as Record<string, unknown> : undefined
  const failure = data.task_failure_info && typeof data.task_failure_info === 'object'
    ? data.task_failure_info as Record<string, unknown> : undefined
  return {
    status,
    output: typeof out?.string === 'string' ? out.string : undefined,
    files: Array.isArray(out?.files) ? out.files.filter((f): f is string => typeof f === 'string') : undefined,
    credit: typeof data.credit === 'number' ? data.credit : undefined,
    error: typeof failure?.message === 'string' ? failure.message : undefined,
  }
}

export interface RunOptions {
  /** Budget total d'attente. Au-delà, on rend le dernier état connu (fail-open). */
  timeoutMs?: number
  /** Intervalle entre deux interrogations de la tâche. */
  pollMs?: number
  signal?: AbortSignal
  log?: (msg: string) => void
}

/**
 * Lance un bot et attend son résultat. Le polling est la seule voie synchrone offerte par
 * l'API (l'alternative, `callback_url`, suppose un webhook public et un run qui survit à
 * l'attente — hors de portée d'une passe de scraping).
 *
 * Rend null si la tâche n'a pas pu démarrer ; sinon le dernier état connu, MÊME non
 * terminal (budget épuisé) : l'appelant décide, il n'hérite pas d'une exception.
 */
export async function runBrowserActWorkflow(
  apiKey: string,
  workflowId: string,
  params: Record<string, string>,
  opts: RunOptions = {},
): Promise<BrowserActResult | null> {
  const { timeoutMs = 180_000, pollMs = 3_000, signal, log } = opts
  const taskId = await startTask(apiKey, workflowId, params, signal)
  if (!taskId) {
    log?.(`BrowserAct : impossible de lancer le bot ${workflowId} (clé ou identifiant invalide ?)`)
    return null
  }
  const deadline = Date.now() + timeoutMs
  let last: BrowserActResult | null = null
  while (Date.now() < deadline) {
    if (signal?.aborted) break
    const state = await getTask(apiKey, taskId, signal)
    if (state) {
      last = state
      if (TERMINAL.has(state.status)) {
        log?.(`BrowserAct : tâche ${taskId} ${state.status}${state.credit != null ? ` (${state.credit} crédits)` : ''}`)
        return state
      }
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  log?.(`BrowserAct : tâche ${taskId} toujours « ${last?.status ?? 'inconnue'} » après ${Math.round(timeoutMs / 1000)} s — abandon.`)
  return last
}

/**
 * Lignes de données d'une sortie de bot. `output.string` n'a pas de format garanti : on
 * accepte un tableau JSON, un objet JSON unique, ou du JSONL (une ligne = un objet).
 *
 * FAIL-CLOSED sur la forme : ce qui n'est pas un objet exploitable est ignoré, on ne rend
 * jamais un demi-enregistrement. C'est un exécuteur payant et asynchrone — le mode de
 * panne à éviter est d'écrire des données douteuses dans le catalogue.
 */
export function parseBrowserActRows(output: string | undefined): Record<string, unknown>[] {
  const raw = output?.trim()
  if (!raw) return []
  const asRows = (v: unknown): Record<string, unknown>[] => {
    if (Array.isArray(v)) return v.flatMap(asRows)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      // Un bot enveloppe souvent ses lignes (`{ data: [...] }`, `{ results: [...] }`).
      for (const k of ['data', 'items', 'results', 'rows', 'products']) {
        if (Array.isArray(o[k])) return asRows(o[k])
      }
      return [o]
    }
    return []
  }
  try { return asRows(JSON.parse(raw)) } catch { /* JSONL ci-dessous */ }
  const rows: Record<string, unknown>[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{')) continue
    try { rows.push(...asRows(JSON.parse(t))) } catch { /* ligne illisible : ignorée */ }
  }
  return rows
}
