import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
// Affiche sur les cartes de l'éditeur l'état du dernier run SERVEUR (cron / « Lancer
// serveur ») : sans ça, un run headless est invisible côté navigateur. S'abonne au doc
// users/{uid}/workflowRunsLive/{workflowId} écrit par les Functions et hydrate le runContext.
import { useEffect, useRef } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { STALE_RUN_MS } from '@/features/priceWatch/radar/scrapeState'
import { useRunContext } from './runContext'
import { activeClientRunId, isOwnEcho } from './publishClientRun'
import type { NodeStatus } from '../types'

interface RunLiveDoc {
  runId?: string
  /** Depuis la Task 7, ce document peut aussi être écrit par un run NAVIGATEUR. */
  origin?: 'client' | 'server'
  status?: string
  /** Début du run — sert à repérer un run interrompu resté « en cours ». */
  startedAt?: number
  nodeStates?: Record<string, NodeStatus>
  logs?: { ts: number; level: 'info' | 'warn' | 'error'; node?: string; msg: string }[]
  nodeOutputs?: Record<string, Record<string, unknown>>
  nodeConnectors?: Record<string, string[]>
  nodeCounts?: Record<string, number>
  nodeCycles?: Record<string, number>
}

/**
 * Silence au-delà duquel un run serveur est considéré comme MORT.
 *
 * ⚠⚠ Le statut du document ne suffit pas : une Cloud Function tuée (délai dépassé, mémoire
 * saturée) laisse `status: 'running'` pour toujours. Se fier à ce champ faisait tourner les
 * rouages à l'écran des heures après l'arrêt. Ce qui prouve qu'un run vit, c'est qu'il
 * ÉCRIT — un log, un état de carte, un compteur. Trois minutes : les nodes à curseur
 * battent bien plus souvent que ça, et un vrai run n'est jamais muet si longtemps.
 */
const LIVE_BEAT_MS = 3 * 60_000

export function useServerRunLive(workflowId: string | undefined): void {
  const lastRunId = useRef<string | undefined>(undefined)
  const isInitial = useRef(true)
  /** Dernière écriture observée du run serveur, quelle qu'elle soit. */
  const lastBeat = useRef(0)
  useEffect(() => {
    const uid = getWorkspaceUid()
    if (!uid || !workflowId) return
    lastRunId.current = undefined
    isInitial.current = true
    lastBeat.current = 0
    // ⚠ Réévalué par le TEMPS, pas seulement par les échos : un run mort n'écrit plus rien,
    // donc aucun snapshot ne viendrait jamais dire qu'il s'est arrêté.
    const beat = setInterval(() => {
      if (lastBeat.current > 0 && Date.now() - lastBeat.current > LIVE_BEAT_MS) {
        useRunContext.getState().setServerRunActive(false)
      }
    }, 15_000)
    const stop = onSnapshot(
      doc(db, 'users', uid, 'workflowRunsLive', workflowId),
      (snap) => {
        const d = snap.data() as RunLiveDoc | undefined
        // ⚠ Le document n'est plus écrit par le seul serveur : depuis que le run
        // navigateur publie son battement, cet onglet peut recevoir son PROPRE écho.
        // L'hydrater reviendrait à écraser l'état local par une copie vieille de cinq
        // secondes.
        if (isOwnEcho(d ?? null, activeClientRunId())) return
        // ⚠ DIT à l'écran, même quand on n'hydrate pas : sans ce signal, les cartes du
        // dernier écho restaient « en cours » et tournaient à l'infini des heures après
        // l'arrêt du run — et le temps restant continuait de s'estimer dans le vide.
        //
        // ⚠ Le battement se lit DANS le document, pas à l'instant où on le reçoit : au
        // chargement d'une page, le premier écho arrive « maintenant » même si le run est
        // mort depuis une heure. L'horodatage du dernier journal, lui, ne ment pas.
        const beatTs = Math.max(d?.startedAt ?? 0, ...(d?.logs ?? []).map((l) => l.ts))
        lastBeat.current = beatTs
        useRunContext.getState().setServerRunActive(
          d?.status === 'running' && beatTs > 0 && Date.now() - beatTs < LIVE_BEAT_MS,
        )
        if (!d?.nodeStates) { isInitial.current = false; return }
        // Écho INITIAL d'un run serveur DÉJÀ TERMINÉ (au chargement de page) : on ne ré-hydrate
        // PAS. L'aperçu durable (workflowRuns, toutes sources) montre déjà le dernier run ;
        // ré-hydrater ici écraserait un run CLIENT plus récent par ce run serveur plus ancien.
        // On ne prend la main que pour un run qui DÉMARRE / PROGRESSE pendant la session.
        // ⚠️ Run ZOMBIE : une Cloud Function interrompue (délai dépassé, mémoire
        // saturée) laisse `status: 'running'` et des nodes figés en « en cours » —
        // affichés à l'infini, ce qui fait croire qu'une étape n'aboutit jamais
        // alors que le run est mort depuis longtemps. La PWA applique déjà ce
        // seuil ; l'éditeur l'ignorait.
        const stale = d.status === 'running' && !!d.startedAt && Date.now() - d.startedAt > STALE_RUN_MS
        if (stale) {
          // Un run zombie n'est PAS en cours : ses cartes doivent cesser de tourner.
          useRunContext.getState().setServerRunActive(false)
          isInitial.current = false
          lastRunId.current = d.runId
          console.warn('[runLive] run serveur périmé (démarré il y a > 31 min, jamais terminé) — état ignoré')
          return
        }
        const terminal = !!d.status && d.status !== 'running' && d.status !== 'pending'
        if (isInitial.current && terminal) {
          isInitial.current = false
          lastRunId.current = d.runId
          return
        }
        isInitial.current = false
        // Nouveau run (runId changé) → on vide l'état précédent (aperçu/cartes périmés).
        const reset = !!d.runId && d.runId !== lastRunId.current
        lastRunId.current = d.runId
        // Tout nouveau run (runId changé, quel que soit son statut — serveur OU un autre
        // onglet) reprend la main sur un run client resté « en cours » (isRunning coincé)
        // qui, sinon, masquerait son état (garde dans hydrateServerRun). Sûr : notre PROPRE
        // écho est déjà écarté plus haut par `isOwnEcho` — on ne peut donc pas s'auto-déclencher.
        if (reset && useRunContext.getState().isRunning) {
          useRunContext.getState().resetRun()
        }
        const logsByNode: Record<string, RunLiveDoc['logs']> = {}
        for (const l of d.logs ?? []) {
          if (!l.node) continue
          ;(logsByNode[l.node] ??= []).push(l)
        }
        const states: Record<string, { status: NodeStatus; logs?: { ts: number; level: 'info' | 'warn' | 'error'; msg: string }[]; outputs?: Record<string, unknown>; connectors?: string[]; count?: number; cycles?: number; startedAt?: number }> = {}
        for (const [id, status] of Object.entries(d.nodeStates)) {
          states[id] = {
            status,
            logs: logsByNode[id]?.map((l) => ({ ts: l.ts, level: l.level, msg: l.msg })),
            outputs: d.nodeOutputs?.[id],
            connectors: d.nodeConnectors?.[id],
            // ⚠ Le doc live ne porte pas d'horodatage PAR CARTE : sans ce repli sur celui
            // du run, `elapsedMs` restait à zéro et, avec lui, le débit et l'estimation —
            // c'est-à-dire tout ce qui dit qu'un run planifié avance.
            startedAt: status === 'pending' ? undefined : d.startedAt,
            count: d.nodeCounts?.[id],
            cycles: d.nodeCycles?.[id],
          }
        }
        useRunContext.getState().hydrateServerRun(states, { reset })
      },
      (e) => console.warn('[runLive] écoute interrompue :', e.message),
    )
    return () => { clearInterval(beat); stop() }
  }, [workflowId])
}
