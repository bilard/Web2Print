// src/features/priceWatch/useCatalogReport.ts
// Hooks lecture-seule (temps réel) du tableau de bord Veille tarifaire catalogue :
// liste des suivis (pour le sélecteur), rapport `latest`, tendance `history`. Toute
// la donnée est pré-agrégée à l'écriture (cf. reportStore) → le dashboard ne charge
// jamais de lignes brutes.
import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { priceWatchCol, reportLatestDoc, reportHistoryDoc } from './paths'
import type { StoredReport, KpiHistoryPoint } from './reportStore'

export interface WatchSummary {
  watchId: string
  label?: string
  updatedAt: number
  lastReportAt?: number
}

/** Liste des suivis de l'utilisateur, du plus récemment mis à jour au plus ancien. */
export function useWatchList(): WatchSummary[] {
  const uid = useAuthStore((s) => s.user?.uid)
  const [items, setItems] = useState<WatchSummary[]>([])
  useEffect(() => {
    if (!uid) { setItems([]); return }
    return onSnapshot(
      collection(db, priceWatchCol(uid)),
      (snap) => {
        const out: WatchSummary[] = snap.docs.map((d) => {
          const data = d.data() as { label?: string; updatedAt?: { toMillis?: () => number } | number; lastReportAt?: number }
          const upd = typeof data.updatedAt === 'number'
            ? data.updatedAt
            : (data.updatedAt?.toMillis?.() ?? data.lastReportAt ?? 0)
          return { watchId: d.id, label: data.label, updatedAt: upd, lastReportAt: data.lastReportAt }
        })
        out.sort((a, b) => b.updatedAt - a.updatedAt)
        setItems(out)
      },
      () => setItems([]),
    )
  }, [uid])
  return items
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
