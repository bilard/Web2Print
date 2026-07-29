import type { Locale } from '../i18n'
// functions/src/workflow/types.ts
export interface ServerNode { id: string; type: string; position?: unknown; config: unknown }
export interface ServerEdge {
  id: string; source: string; sourceHandle: string; target: string; targetHandle: string
}
export interface ServerWorkflow {
  id: string; name: string; ownerId: string
  nodes: ServerNode[]; edges: ServerEdge[]
}

type LogLevel = 'info' | 'warn' | 'error'
export interface RunLog { ts: number; level: LogLevel; node?: string; msg: string }

export interface ServerRunCtx {
  uid: string
  /** Langue de l'utilisateur, résolue UNE fois au début du run (pas par message).
   *  Les logs serveur atterrissent dans la même console que ceux du client :
   *  sans elle, un run cron logue en français sous une interface anglaise. */
  locale: Locale
  log: (level: LogLevel, msg: string) => void
  signal: AbortSignal
  /** Id du workflow — identité par défaut (ex. suivi de veille). Absent dans un body de loop. */
  workflowId?: string
  /** Nom du workflow — libellé lisible par défaut. */
  workflowName?: string
  /** Config brut (sans interpolation des {{...}}) — pour les nodes qui ré-interpolent
   *  par ligne (ex : send-telegram en mode « 1 message par ligne »). */
  rawConfig?: unknown
  /** Signale un connecteur réellement utilisé par le node (ex « jina », « brightdata »,
   *  « llm ») — remonté au client pour afficher le bon badge sur la carte. */
  reportConnector?: (connectorId: string) => void
  /** Signale que le CYCLE de moisson est terminé à 100 % (tous les sites balayés) —
   *  le scheduler bascule alors sur l'échéance calendaire de relance (cf. CycleCalendar)
   *  au lieu d'enchaîner à la cadence rapide. */
  reportCycleComplete?: () => void
  /** Échéance (epoch ms) à laquelle les nodes À CURSEUR (moisson, recherche dirigée)
   *  doivent rendre la main pour laisser leur fenêtre aux nodes AVAL (Comparer, exports).
   *  Sans elle, la moisson consomme tout le budget du run et le comparatif — dernier du
   *  graphe — est interrompu à CHAQUE run (dashboard jamais rafraîchi). */
  deadlineAt?: number
}

type ServerRun = (
  ctx: ServerRunCtx,
  config: Record<string, unknown>,
  inputs: Record<string, unknown>,
) => Promise<Record<string, unknown>>

export interface ServerNodeSpec { type: string; run: ServerRun }
