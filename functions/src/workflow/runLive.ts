// functions/src/workflow/runLive.ts
// État LIVE du dernier run serveur d'un workflow, pour que le CLIENT (éditeur) puisse
// afficher la progression sur les cartes (sinon un run cron/serveur est invisible côté
// navigateur). Un doc par workflow (écrasé à chaque run) : users/{uid}/workflowRunsLive/{workflowId}.
import { getFirestore } from 'firebase-admin/firestore'
import { recordIncident } from '../priceWatch/opsIncidents'
import type { RunLog } from './types'

type LiveNodeStatus = 'running' | 'success' | 'error' | 'skipped' | 'pending'

export interface RunLiveDoc {
  runId: string
  trigger: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'success' | 'partial' | 'error'
  nodeStates: Record<string, LiveNodeStatus>
  logs: RunLog[]
  /** Sorties par node (sheets tronquées) pour l'aperçu données côté client. */
  nodeOutputs?: Record<string, Record<string, unknown>>
  /** Connecteurs réellement utilisés par node (badges sur les cartes). */
  nodeConnectors?: Record<string, string[]>
  /** Volume traité par node — sans lui, un run planifié n'affiche que des statuts et la
   *  progression reste muette sur ce qui avance réellement. */
  nodeCounts?: Record<string, number>
  /** Nombre de PASSAGES par node. Un run long est segmenté et repris : une moisson
   *  repasse des dizaines de fois sans jamais « finir » au sens du graphe. */
  nodeCycles?: Record<string, number>
}

/**
 * Upsert du doc d'état live. Non bloquant : ne fait JAMAIS échouer le run.
 *
 * `replace` REMPLACE le document au lieu de le fusionner — obligatoire au démarrage d'un
 * run neuf. Le merge Firestore fusionne les maps clé à clé : `nodeStates` conservait donc
 * les entrées de nodes SUPPRIMÉS du graphe, affichés « en erreur » indéfiniment sur les
 * cartes, et un `endedAt` périmé survivait au nouveau `startedAt` (durée de run absurde).
 *
 * ⚠ try/catch ENGLOBANT (pas seulement `.catch`) : Firestore `.set()` valide ses données
 * de façon SYNCHRONE et LÈVE (pas une promesse rejetée) sur un `undefined` imbriqué —
 * un `.catch` seul laisserait ce throw remonter et crasher le run.
 */
export async function writeRunLive(
  uid: string, workflowId: string, data: Partial<RunLiveDoc>, opts: { replace?: boolean } = {},
): Promise<void> {
  try {
    const ref = getFirestore().doc(`users/${uid}/workflowRunsLive/${workflowId}`)
    await (opts.replace ? ref.set(data) : ref.set(data, { merge: true }))
  } catch { /* état live best-effort — ne bloque jamais l'exécution */ }
}

/** Traduit en FRANÇAIS les erreurs techniques courantes (souvent émises en anglais par
 *  Firestore / les SDK) pour la console de suivi. Le message d'origine est conservé entre
 *  parenthèses pour le débogage. Motif inconnu → message renvoyé tel quel. */
export function humanizeError(raw: string): string {
  const m = raw || ''
  const fr =
    /Cannot use "undefined"|invalid Firestore document/i.test(m) ? 'Écriture refusée : une valeur vide (undefined) a été rencontrée dans les données du run.'
    : /deadline|timeout|dépass/i.test(m) ? 'Délai d’exécution dépassé — le run a été interrompu avant la fin.'
    : /Insufficient credits|balance insuffisante|402|resource-exhausted/i.test(m) ? 'Crédits épuisés chez un fournisseur de scraping — appels suspendus.'
    : /heap out of memory|out of memory/i.test(m) ? 'Mémoire saturée pendant le run.'
    : /permission|unauthenticated|PERMISSION_DENIED/i.test(m) ? 'Accès refusé (authentification ou permissions).'
    : /quota|RESOURCE_EXHAUSTED/i.test(m) ? 'Quota atteint sur un service externe.'
    : /network|fetch failed|ECONNRESET|ENOTFOUND/i.test(m) ? 'Erreur réseau en joignant un service externe.'
    : null
  return fr ? `${fr} (${m.slice(0, 300)})` : m
}

/** Ajoute une ligne d'ERREUR aux logs live SANS écraser l'historique du run (arrayUnion).
 *  Sans elle, un crash de run ne laissait qu'un `status: 'error'` muet — introuvable
 *  depuis l'app (« dernier run en erreur » sans aucun détail). Message traduit en FR.
 *
 *  Consigne AUSSI l'incident dans le journal dédié (`opsIncidents`) quand ce workflow
 *  adresse un suivi de la veille tarifaire (`opts.watchId`) : les logs live sont écrasés
 *  au run suivant, le journal survit quatre-vingt-dix jours — cf. incidents.ts. */
export async function appendRunLiveError(
  uid: string, workflowId: string, msg: string, opts: { watchId?: string | null; runId?: string } = {},
): Promise<void> {
  const { FieldValue } = await import('firebase-admin/firestore')
  const fr = humanizeError(msg).slice(0, 600)
  try {
    await getFirestore()
      .doc(`users/${uid}/workflowRunsLive/${workflowId}`)
      .set({ logs: FieldValue.arrayUnion({ ts: Date.now(), level: 'error', msg: fr }) }, { merge: true })
  } catch { /* best-effort */ }
  if (opts.watchId) {
    // ⚠ Pas de clé `runId: undefined` : Firestore valide `.set()` de façon SYNCHRONE et
    // lève sur un `undefined` imbriqué (cf. reference_firestore_setdoc_undefined_trap).
    await recordIncident(uid, opts.watchId, {
      ts: Date.now(), message: fr, origin: 'server', ...(opts.runId ? { runId: opts.runId } : {}),
    })
  }
}
