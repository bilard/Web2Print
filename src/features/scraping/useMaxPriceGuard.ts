import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { priceToNumber } from './searchPlanner'
import type { PriceProbe } from './useResultPrices'

/** Contrainte de prix du prompt appliquée en live : quand le prix réel scrapé
 *  (JSON-LD) d'un résultat sélectionné arrive et dépasse `maxPrice`, il est
 *  décoché. Les choix manuels sur les autres lignes ne sont pas touchés. */
export function useMaxPriceGuard(
  maxPrice: number | undefined,
  priceByUrl: Record<string, PriceProbe>,
  setSelected: Dispatch<SetStateAction<Set<string>>>,
): void {
  useEffect(() => {
    if (!maxPrice) return
    setSelected((prev) => {
      const over = Array.from(prev).filter((url) => {
        const v = priceToNumber(priceByUrl[url]?.value)
        return v !== undefined && v > maxPrice
      })
      if (over.length === 0) return prev
      const next = new Set(prev)
      for (const url of over) next.delete(url)
      return next
    })
  }, [priceByUrl, maxPrice, setSelected])
}
