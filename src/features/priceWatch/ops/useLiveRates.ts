// Branche le calcul de régime (`liveRates`) sur les échos Firestore des concurrents.
//
// Le hook ne fait qu'échantillonner : toute la logique est dans le module pur, testé. Il
// n'ouvre AUCUN abonnement de plus — les métas sont déjà écoutées par l'écran, on se
// contente de dériver ce qui passe.
import { useEffect, useRef, useState } from 'react'
import { pushSample, rateOf, type LiveRate, type RateSample } from './liveRates'
import type { HarvestMeta } from '../dashboard/opsMetrics'

/** Cadence de recalcul : les régimes doivent retomber tout seuls quand plus rien n'arrive.
 *  Sans cette horloge, un site figé garderait à l'écran le dernier régime mesuré — le
 *  mensonge exact que ce bandeau existe pour supprimer. */
const TICK_MS = 2_000

export function useLiveRates(meta: Map<string, HarvestMeta>): Map<string, LiveRate> {
  const histories = useRef(new Map<string, RateSample[]>())
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const now = Date.now()
  const out = new Map<string, LiveRate>()
  for (const [siteId, m] of meta) {
    const sample: RateSample = {
      at: now, products: m.productCount ?? 0, pages: m.pageCount ?? 0, beat: m.harvestBeatAt,
    }
    histories.current.set(siteId, pushSample(histories.current.get(siteId) ?? [], sample))
    out.set(siteId, rateOf(histories.current.get(siteId)!, now, m.harvestBeatAt))
  }
  return out
}
