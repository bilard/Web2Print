// src/features/analytics/useLiveTraffic.ts
// Flux LIVE des visites (onSnapshot temps réel) — le même trafic que les
// alertes Telegram (🟢 page d'un utilisateur connecté, 🔵 session anonyme),
// affiché DANS l'app. Complète useAnalyticsEvents (polling 60 s, période) :
// ici, les N derniers événements arrivent à la seconde, sans rafraîchir.
import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { mapAnalyticsDoc } from './useAnalyticsEvents'
import type { AnalyticsEvent } from './metrics'

export function useLiveTraffic(count = 30): AnalyticsEvent[] {
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  useEffect(() => {
    const q = query(collection(db, 'analyticsEvents'), orderBy('ts', 'desc'), limit(count))
    return onSnapshot(
      q,
      (snap) => setEvents(snap.docs.map((d) => mapAnalyticsDoc(d.data(), d.id))),
      () => setEvents([]),
    )
  }, [count])
  return events
}
