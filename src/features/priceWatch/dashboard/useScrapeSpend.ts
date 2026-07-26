// Consommation scraping du MOIS COURANT, EN LIVE (onSnapshot sur scrapeUsage/{uid}_{mois}).
// Alimente le compteur Jina du dashboard veille, sans passer par le module Finances.
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

interface PlatformSpend { tokens: number; requests: number; costUsd: number }
export interface ScrapeSpend { total: number; byPlatform: Record<string, PlatformSpend> }

export function useScrapeSpend(): ScrapeSpend | null {
  const uid = useAuthStore((s) => s.user?.uid)
  const [spend, setSpend] = useState<ScrapeSpend | null>(null)
  useEffect(() => {
    if (!uid) return
    const month = new Date().toISOString().slice(0, 7)
    const ref = doc(db, 'scrapeUsage', `${uid}_${month}`)
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) { setSpend({ total: 0, byPlatform: {} }); return }
      const data = snap.data() as { total?: { costUsd?: number }; byPlatform?: Record<string, Partial<PlatformSpend>> }
      const byPlatform: Record<string, PlatformSpend> = {}
      for (const [k, v] of Object.entries(data.byPlatform ?? {})) {
        byPlatform[k] = { tokens: v?.tokens ?? 0, requests: v?.requests ?? 0, costUsd: v?.costUsd ?? 0 }
      }
      setSpend({ total: data.total?.costUsd ?? 0, byPlatform })
    }, () => setSpend({ total: 0, byPlatform: {} }))
  }, [uid])
  return spend
}
