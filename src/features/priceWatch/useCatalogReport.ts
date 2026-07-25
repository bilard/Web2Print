// src/features/priceWatch/useCatalogReport.ts
// Hooks lecture-seule (temps réel) du tableau de bord Veille tarifaire catalogue :
// liste des suivis (pour le sélecteur), rapport `latest`, tendance `history`. Toute
// la donnée est pré-agrégée à l'écriture (cf. reportStore) → le dashboard ne charge
// jamais de lignes brutes.
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { priceWatchCol, reportLatestDoc, reportHistoryDoc, competitorsCol } from './paths'
import type { StoredReport, KpiHistoryPoint } from './reportStore'
import type { HarvestMeta } from './dashboard/opsMetrics'
import { stableId } from './core'
import { listWorkflows } from '@/features/workflows/persistence/workflowsApi'

export interface WatchSummary {
  watchId: string
  label?: string
  updatedAt: number
  lastReportAt?: number
  /** Workflow d'origine du suivi (si connu) → lien « Ouvrir le workflow » dans le sélecteur. */
  workflowId?: string
}

/** Liste des suivis de l'utilisateur, du plus récemment mis à jour au plus ancien. */
export function useWatchList(): WatchSummary[] {
  const uid = useAuthStore((s) => s.user?.uid)
  const [items, setItems] = useState<WatchSummary[]>([])
  // Index `stableId(workflowId) → workflowId` : retrouve le workflow d'origine des suivis
  // créés AVANT la persistance de `workflowId` (leur watchId par défaut = stableId(wfId),
  // cf. deriveWatchId). Chargé une fois ; ne backfille que les suivis sans workflowId stocké.
  const [wfIndex, setWfIndex] = useState<Map<string, string>>(() => new Map())
  useEffect(() => {
    if (!uid) { setWfIndex(new Map()); return }
    let alive = true
    listWorkflows(uid)
      .then((wfs) => {
        if (!alive) return
        const m = new Map<string, string>()
        for (const wf of wfs) m.set(stableId(wf.id), wf.id)
        setWfIndex(m)
      })
      .catch(() => { if (alive) setWfIndex(new Map()) })
    return () => { alive = false }
  }, [uid])
  useEffect(() => {
    if (!uid) { setItems([]); return }
    return onSnapshot(
      collection(db, priceWatchCol(uid)),
      (snap) => {
        const out: WatchSummary[] = snap.docs.map((d) => {
          const data = d.data() as {
            label?: string; customLabel?: string; workflowId?: string
            updatedAt?: { toMillis?: () => number } | number; lastReportAt?: number
          }
          const upd = typeof data.updatedAt === 'number'
            ? data.updatedAt
            : (data.updatedAt?.toMillis?.() ?? data.lastReportAt ?? 0)
          // `customLabel` = renommage manuel (Gérer les suivis), PRIORITAIRE sur `label`
          // (nom du workflow, réécrit à chaque rapport par « Comparer catalogue »).
          return { watchId: d.id, label: data.customLabel || data.label, updatedAt: upd, lastReportAt: data.lastReportAt, workflowId: data.workflowId }
        })
        out.sort((a, b) => b.updatedAt - a.updatedAt)
        setItems(out)
      },
      () => setItems([]),
    )
  }, [uid])
  // Rétro-remplit `workflowId` (repli déterministe) sans écraser une valeur déjà persistée.
  return useMemo(
    () => items.map((w) => (w.workflowId ? w : { ...w, workflowId: wfIndex.get(w.watchId) })),
    [items, wfIndex],
  )
}

/**
 * Méta de moisson par concurrent, EN LIVE (onSnapshot sur `competitors`). Se met à jour
 * à CHAQUE passe de moisson, sans attendre un « Comparer catalogue » → alimente le cockpit
 * opérationnel pour qu'il bouge en direct pendant la collecte. Les docs curseur (recherche
 * dirigée) sont ignorés.
 */
export function useCompetitorMeta(watchId: string | null): Map<string, HarvestMeta> {
  const uid = useAuthStore((s) => s.user?.uid)
  const [meta, setMeta] = useState<Map<string, HarvestMeta>>(() => new Map())
  useEffect(() => {
    if (!uid || !watchId) { setMeta(new Map()); return }
    return onSnapshot(
      collection(db, competitorsCol(uid, watchId)),
      (snap) => {
        const m = new Map<string, HarvestMeta>()
        snap.forEach((d) => {
          const data = d.data() as Record<string, unknown>
          if (data.domain === 'directed-cursor') return // doc curseur, pas un concurrent
          const upd = data.updatedAt
          m.set(d.id, {
            domain: typeof data.domain === 'string' ? data.domain : undefined,
            productCount: typeof data.productCount === 'number' ? data.productCount : undefined,
            pageCount: typeof data.pageCount === 'number' ? data.pageCount : undefined,
            harvestBeatAt: typeof data.harvestBeatAt === 'number' ? data.harvestBeatAt : undefined,
            harvestProgress: typeof data.harvestProgress === 'number' ? data.harvestProgress : undefined,
            harvestSweeps: typeof data.harvestSweeps === 'number' ? data.harvestSweeps : undefined,
            cumulHarvestMs: typeof data.cumulHarvestMs === 'number' ? data.cumulHarvestMs : undefined,
            lastHarvestMs: typeof data.lastHarvestMs === 'number' ? data.lastHarvestMs : undefined,
            lastEngine: typeof data.lastEngine === 'string' ? data.lastEngine : undefined,
            lastPassPages: typeof data.lastPassPages === 'number' ? data.lastPassPages : undefined,
            lastPassProducts: typeof data.lastPassProducts === 'number' ? data.lastPassProducts : undefined,
            lastPassAt: typeof data.lastPassAt === 'number' ? data.lastPassAt : undefined,
            pctPrice: typeof data.pctPrice === 'number' ? data.pctPrice : undefined,
            updatedAt: typeof upd === 'number' ? upd : (upd as { toMillis?: () => number })?.toMillis?.(),
          })
        })
        setMeta(m)
      },
      () => setMeta(new Map()),
    )
  }, [uid, watchId])
  return meta
}

/** Rapport `latest` d'un suivi (KPIs + stats/concurrent + liste produit bornée). */
export function useCatalogReport(watchId: string | null): StoredReport | null {
  const uid = useAuthStore((s) => s.user?.uid)
  const [report, setReport] = useState<StoredReport | null>(null)
  useEffect(() => {
    if (!uid || !watchId) { setReport(null); return }
    return onSnapshot(
      doc(db, reportLatestDoc(uid, watchId)),
      (snap) => setReport(snap.exists() ? (snap.data() as StoredReport) : null),
      () => setReport(null),
    )
  }, [uid, watchId])
  return report
}

/** Points de tendance KPI d'un suivi (ring-buffer). */
export function useReportHistory(watchId: string | null): KpiHistoryPoint[] {
  const uid = useAuthStore((s) => s.user?.uid)
  const [points, setPoints] = useState<KpiHistoryPoint[]>([])
  useEffect(() => {
    if (!uid || !watchId) { setPoints([]); return }
    return onSnapshot(
      doc(db, reportHistoryDoc(uid, watchId)),
      (snap) => setPoints((snap.data()?.points as KpiHistoryPoint[]) ?? []),
      () => setPoints([]),
    )
  }, [uid, watchId])
  return points
}
