import { useEffect, useState } from 'react'
import type { ScrapingTemplate } from './types'
import { listTemplates } from './templatesStore'
import { templateMatchesUrl } from './engine'

/**
 * Retourne le template qui matche une URL donnée, ou null.
 * Cache en mémoire pour éviter de refetch à chaque check de domaine.
 */
let cachedTemplates: ScrapingTemplate[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 30_000

async function getCachedTemplates(): Promise<ScrapingTemplate[]> {
  const now = Date.now()
  if (cachedTemplates && (now - cacheTimestamp) < CACHE_TTL_MS) return cachedTemplates
  try {
    const fresh = await listTemplates()
    cachedTemplates = fresh
    cacheTimestamp = now
    return fresh
  } catch {
    return cachedTemplates ?? []
  }
}

/** Invalide le cache (appelé quand un template est créé/modifié/supprimé). */
export function invalidateTemplatesCache() {
  cachedTemplates = null
  cacheTimestamp = 0
}

/**
 * Hook : retourne le template qui matche l'URL (ou juste le domaine si l'URL
 * n'est pas encore disponible — typiquement avant de lancer l'enrichissement,
 * on n'a que brand/title mais pas encore d'URL).
 */
export function useMatchingTemplate(
  input: { url?: string | null; brand?: string | null; title?: string | null },
): ScrapingTemplate | null {
  const [match, setMatch] = useState<ScrapingTemplate | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const templates = await getCachedTemplates()
      if (cancelled || templates.length === 0) return
      // 1) match direct sur l'URL si connue
      if (input.url) {
        const byUrl = templates.find((t) => templateMatchesUrl(t, input.url!))
        if (byUrl) { setMatch(byUrl); return }
      }
      // 2) sinon match par brand → domaine (ex: brand="Nicoll" → template dont vendorDomain contient "nicoll")
      const needle = (input.brand ?? input.title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (needle.length >= 3) {
        const byBrand = templates.find((t) => {
          const vendorKey = t.vendorDomain.toLowerCase().replace(/[^a-z0-9]/g, '')
          return vendorKey.includes(needle) || needle.includes(vendorKey.split('.')[0])
        })
        if (byBrand) { setMatch(byBrand); return }
      }
      setMatch(null)
    })()
    return () => { cancelled = true }
  }, [input.url, input.brand, input.title])

  return match
}
