// Ce que le dernier run serveur a produit, tel que le publie `workflowRunsLive`. PUR.
//
// ⚠ Le document portait DÉJÀ tout ceci ; la PWA n'en lisait que les pastilles de statut
// par node et jetait le reste. Sur un mobile, un node rouge sans message ne se diagnostique
// pas : il faut ouvrir un ordinateur pour savoir si le scraping a manqué de crédits, si un
// site a coupé, ou si le run a simplement été arrêté. Tout est là, gratuitement — le
// document est déjà lu.
/** Une ligne du journal telle que le SERVEUR l'écrit : `node` porte l'identifiant du node
 *  émetteur, ce que le type client de l'éditeur ne modélise pas (il indexe par node). */
export interface RunLog { ts: number; level: 'info' | 'warn' | 'error'; node?: string; msg: string }

export type RunStatus = 'running' | 'success' | 'partial' | 'error' | 'stopped'

export interface RunLiveDoc {
  runId?: string
  trigger?: string
  startedAt?: number
  endedAt?: number
  status?: RunStatus
  nodeStates?: Record<string, string>
  logs?: RunLog[]
  nodeConnectors?: Record<string, string[]>
}

export interface RunSummary {
  status: RunStatus | null
  /** Ce qui a déclenché le run (cron, manuel, webhook…). */
  trigger: string | null
  startedAt: number | null
  /** Durée écoulée : jusqu'à `endedAt`, ou jusqu'à maintenant si le run court encore. */
  durationMs: number | null
  running: boolean
  nodes: { total: number; ok: number; error: number; running: number; skipped: number }
  errors: number
  warnings: number
}

/**
 * Un run marqué « en cours » qui dépasse cette durée n'est pas en cours : il a été tué
 * (temps de fonction dépassé, redéploiement). Sans péremption, la PWA annonce une collecte
 * active des heures après la fin — mensonge plus coûteux sur mobile, où l'on décide de ne
 * PAS relancer sur la foi de cet affichage.
 */
export const STALE_RUN_MS = 31 * 60 * 1000

export function summarizeRun(doc: RunLiveDoc | null, now: number): RunSummary | null {
  if (!doc || !doc.startedAt) return null
  const stale = doc.status === 'running' && now - doc.startedAt > STALE_RUN_MS
  const running = doc.status === 'running' && !stale
  const states = Object.values(doc.nodeStates ?? {})
  const logs = doc.logs ?? []
  return {
    // Un run périmé n'est ni un succès ni un échec : on le dit interrompu plutôt que de
    // le laisser tourner indéfiniment à l'écran.
    status: stale ? 'stopped' : (doc.status ?? null),
    trigger: doc.trigger ?? null,
    startedAt: doc.startedAt,
    durationMs: (doc.endedAt ?? (running ? now : null)) != null
      ? (doc.endedAt ?? now) - doc.startedAt
      : null,
    running,
    nodes: {
      total: states.length,
      ok: states.filter((s) => s === 'success').length,
      error: states.filter((s) => s === 'error').length,
      running: stale ? 0 : states.filter((s) => s === 'running').length,
      skipped: states.filter((s) => s === 'skipped').length,
    },
    errors: logs.filter((l) => l.level === 'error').length,
    warnings: logs.filter((l) => l.level === 'warn').length,
  }
}

export type LogFilter = 'all' | 'warn' | 'error'

/**
 * Journal filtré, du plus RÉCENT au plus ancien et borné.
 *
 * L'ordre inverse est délibéré : sur un run de plusieurs centaines de lignes, ce qu'on
 * cherche depuis un téléphone est la dernière chose qui s'est passée, pas la première.
 * Le plafond évite de peindre mille lignes dans une vue qu'on fait défiler au doigt.
 */
export function filterLogs(logs: RunLog[], filter: LogFilter, cap = 120): RunLog[] {
  const keep = filter === 'all'
    ? logs
    : filter === 'error'
      ? logs.filter((l) => l.level === 'error')
      : logs.filter((l) => l.level === 'error' || l.level === 'warn')
  return [...keep].reverse().slice(0, cap)
}

/** Messages émis par UN node. C'est ce qui manquait le plus : une pastille rouge dit
 *  qu'il a échoué, jamais pourquoi. */
export function logsOfNode(logs: RunLog[], nodeId: string, cap = 30): RunLog[] {
  return [...logs.filter((l) => l.node === nodeId)].reverse().slice(0, cap)
}
