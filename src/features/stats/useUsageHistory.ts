// Historique multi-mois des coûts par connecteur (le seul vrai ajout au suivi existant,
// limité au mois courant). Lit les N derniers docs mensuels par ID déterministe
// (`{uid}_{YYYY-MM}`) → série temporelle. ⚠ Jina/Firecrawl (scrapeUsage) n'existent qu'à
// partir de leur instrumentation (2026-07) → les mois antérieurs les affichent à 0.
import { useQuery } from '@tanstack/react-query'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

export interface MonthUsage {
  month: string // YYYY-MM
  llmUsd: number
  scrapeUsd: number
  brightDataUsd: number
  removebgUsd: number
  totalUsd: number
  tokensLlm: number
}

function lastNMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 7))
    d.setMonth(d.getMonth() - 1)
  }
  return out // du plus récent au plus ancien
}

async function fetchHistory(uid: string, months: number): Promise<MonthUsage[]> {
  const ids = lastNMonths(months)
  const rows = await Promise.all(ids.map(async (m): Promise<MonthUsage> => {
    const [ai, bd, rb, sc] = await Promise.all([
      getDoc(doc(db, 'aiUsage', `${uid}_${m}`)),
      getDoc(doc(db, 'brightDataUsage', `${uid}_${m}`)),
      getDoc(doc(db, 'removebgUsage', `${uid}_${m}`)),
      getDoc(doc(db, 'scrapeUsage', `${uid}_${m}`)),
    ])
    const aiData = ai.exists() ? (ai.data() as { total?: { costUsd?: number }; byProvider?: Record<string, { tokensIn?: number; tokensOut?: number }> }) : {}
    let tokensLlm = 0
    for (const p of Object.values(aiData.byProvider ?? {})) tokensLlm += (p?.tokensIn ?? 0) + (p?.tokensOut ?? 0)
    const llmUsd = aiData.total?.costUsd ?? 0
    const scrapeUsd = sc.exists() ? ((sc.data() as { total?: { costUsd?: number } }).total?.costUsd ?? 0) : 0
    const brightDataUsd = bd.exists() ? ((bd.data() as { costUsd?: number }).costUsd ?? 0) : 0
    const removebgUsd = rb.exists() ? ((rb.data() as { costUsd?: number }).costUsd ?? 0) : 0
    return { month: m, llmUsd, scrapeUsd, brightDataUsd, removebgUsd, totalUsd: llmUsd + scrapeUsd + brightDataUsd + removebgUsd, tokensLlm }
  }))
  return rows.reverse() // chronologique (ancien → récent)
}

export function useUsageHistory(months = 6) {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['usage-history', user?.uid, months],
    queryFn: () => fetchHistory(user!.uid, months),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}
