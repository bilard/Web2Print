import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where, orderBy, Timestamp, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { AnalyticsEvent } from './metrics'

/** Mapping doc Firestore → AnalyticsEvent (partagé avec le flux live onSnapshot). */
export function mapAnalyticsDoc(d: DocumentData): AnalyticsEvent {
  return {
    ts: (d.ts as Timestamp | undefined)?.toMillis() ?? 0,
    path: d.path ?? '/',
    area: d.area ?? 'other',
    ref: d.ref ?? null,
    src: d.src ?? null,
    device: d.device ?? 'desktop',
    os: d.os ?? null,
    browser: d.browser ?? null,
    country: d.country ?? null,
    city: d.city ?? null,
    vid: d.vid ?? '',
    sid: d.sid ?? '',
    uid: d.uid ?? null,
  }
}

/**
 * Events de la période `[fromMs, toMs]`. Passer `toMs = null` = borne haute OUVERTE
 * (jusqu'à maintenant) : indispensable pour la période courante, sinon les visites
 * postérieures au montage (nouveaux pays, etc.) seraient exclues. Rafraîchi en continu
 * (polling 60 s + au refocus) pour rester à jour.
 */
export function useAnalyticsEvents(fromMs: number, toMs: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['analyticsEvents', fromMs, toMs],
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AnalyticsEvent[]> => {
      const clauses = [where('ts', '>=', Timestamp.fromMillis(fromMs))]
      if (toMs !== null) clauses.push(where('ts', '<=', Timestamp.fromMillis(toMs)))
      const snap = await getDocs(
        query(collection(db, 'analyticsEvents'), ...clauses, orderBy('ts', 'asc')),
      )
      return snap.docs.map((s) => mapAnalyticsDoc(s.data()))
    },
  })
}
