import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, query, where, orderBy, Timestamp, type DocumentData } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { AnalyticsEvent } from './metrics'

function mapDoc(d: DocumentData): AnalyticsEvent {
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

export function useAnalyticsEvents(fromMs: number, toMs: number, enabled: boolean) {
  return useQuery({
    queryKey: ['analyticsEvents', fromMs, toMs],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AnalyticsEvent[]> => {
      const snap = await getDocs(
        query(
          collection(db, 'analyticsEvents'),
          where('ts', '>=', Timestamp.fromMillis(fromMs)),
          where('ts', '<=', Timestamp.fromMillis(toMs)),
          orderBy('ts', 'asc'),
        ),
      )
      return snap.docs.map((s) => mapDoc(s.data()))
    },
  })
}
