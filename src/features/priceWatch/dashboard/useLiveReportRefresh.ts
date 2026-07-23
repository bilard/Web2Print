// src/features/priceWatch/dashboard/useLiveReportRefresh.ts
// Actualisation LIVE du rapport « Comparer » pendant la moisson : entre deux runs serveur
// (~30 min), les tuiles d'analyse (appariés, tenue prix, écart, impact) restaient figées
// alors que l'index concurrent grossit en continu. Quand la collecte est ACTIVE et que le
// rapport a vieilli, on relance `recomputeReport` (même moteur que le node « Comparer »,
// depuis les données persistées) → `reports/latest` réécrit → tout le dashboard bouge.
//
// Garde-fous de coût (le recalcul relit source + index complets — des milliers de docs) :
//   - onglet VISIBLE uniquement (pas de recalcul en arrière-plan) ;
//   - au plus un recalcul toutes les MIN_REPORT_AGE_MS ;
//   - seulement si une passe de moisson a écrit APRÈS le dernier rapport ;
//   - jamais deux recalculs en parallèle.
import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useCompetitorMeta } from '../useCatalogReport'
import { recomputeReport } from '../catalog/recomputeReport'
import type { StoredReport } from '../reportStore'
import type { HarvestMeta } from './opsMetrics'

/** Âge minimal du rapport avant recalcul (throttle du coût Firestore/CPU). */
export const MIN_REPORT_AGE_MS = 4 * 60_000
/** Fenêtre du heartbeat de moisson : au-delà, la collecte est considérée à l'arrêt. */
const HEARTBEAT_WINDOW_MS = 3 * 60_000
const CHECK_EVERY_MS = 30_000

/** Décision PURE : faut-il recalculer le rapport maintenant ? */
export function shouldRefreshReport(args: {
  runAt: number
  lastCollectAt: number | null
  now: number
  visible: boolean
}): boolean {
  const { runAt, lastCollectAt, now, visible } = args
  if (!visible || runAt <= 0) return false
  if (now - runAt < MIN_REPORT_AGE_MS) return false
  if (lastCollectAt == null || now - lastCollectAt > HEARTBEAT_WINDOW_MS) return false
  return lastCollectAt > runAt // du neuf a été collecté depuis le dernier rapport
}

/** Dernière écriture de méta de moisson (heartbeat), null si aucune. */
function lastCollectOf(meta: Map<string, HarvestMeta>): number | null {
  let last: number | null = null
  for (const m of meta.values()) if (m.updatedAt != null && (last == null || m.updatedAt > last)) last = m.updatedAt
  return last
}

export function useLiveReportRefresh(watchId: string | null, report: StoredReport | null): void {
  const uid = useAuthStore((s) => s.user?.uid)
  const liveMeta = useCompetitorMeta(watchId)
  const busy = useRef(false)
  // Refs : l'interval lit les valeurs fraîches sans se ré-armer à chaque snapshot.
  const reportRef = useRef(report)
  reportRef.current = report
  const metaRef = useRef(liveMeta)
  metaRef.current = liveMeta

  useEffect(() => {
    if (!uid || !watchId) return
    const tick = async () => {
      const r = reportRef.current
      if (busy.current || !r) return
      const ok = shouldRefreshReport({
        runAt: r.runAt,
        lastCollectAt: lastCollectOf(metaRef.current),
        now: Date.now(),
        visible: document.visibilityState === 'visible',
      })
      if (!ok) return
      busy.current = true
      try {
        const siteRefs = r.byCompetitor.map((c) => ({ siteId: c.siteId, domain: c.domain }))
        await recomputeReport(uid, watchId, siteRefs)
      } catch (e) {
        console.warn('[veille] recalcul live du rapport échoué :', e instanceof Error ? e.message : e)
      } finally {
        busy.current = false
      }
    }
    const id = setInterval(() => { void tick() }, CHECK_EVERY_MS)
    return () => clearInterval(id)
  }, [uid, watchId])
}
