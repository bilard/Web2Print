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

/** Listeners notifiés à chaque invalidation : permet aux hooks actifs de
 *  refetch sans avoir à bump manuellement un refreshKey. */
const invalidationListeners = new Set<() => void>()

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

/** Invalide le cache ET notifie tous les hooks actifs pour qu'ils refetch. */
export function invalidateTemplatesCache() {
  cachedTemplates = null
  cacheTimestamp = 0
  invalidationListeners.forEach((fn) => {
    try { fn() } catch { /* swallow listener errors */ }
  })
}

/**
 * Hook : retourne le template qui matche l'URL (ou juste le domaine si l'URL
 * n'est pas encore disponible — typiquement avant de lancer l'enrichissement,
 * on n'a que brand/title mais pas encore d'URL).
 */
export function useMatchingTemplate(
  input: { url?: string | null; brand?: string | null; title?: string | null; refreshKey?: number },
): ScrapingTemplate | null {
  const [match, setMatch] = useState<ScrapingTemplate | null>(null)
  // Bump automatique quand invalidateTemplatesCache() est appelé de n'importe où.
  const [autoVersion, setAutoVersion] = useState(0)
  useEffect(() => {
    const fn = () => setAutoVersion((v) => v + 1)
    invalidationListeners.add(fn)
    return () => { invalidationListeners.delete(fn) }
  }, [])

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
        // 3) fallback : match par alias explicite (brandAliases)
        const byAlias = templates.find((t) =>
          (t.brandAliases ?? []).some((a) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === needle),
        )
        if (byAlias) { setMatch(byAlias); return }
      }
      setMatch(null)
    })()
    return () => { cancelled = true }
  }, [input.url, input.brand, input.title, input.refreshKey, autoVersion])

  return match
}

/**
 * Version impérative (non-hook) : retourne le template qui matche une URL donnée,
 * ou null. Utilisée par les pipelines d'enrichissement hors contexte React.
 * Partage le cache 30s avec le hook.
 */
export async function findMatchingTemplate(url: string): Promise<ScrapingTemplate | null> {
  try {
    const templates = await getCachedTemplates()
    if (templates.length === 0) return null
    // 1) match direct sur l'URL
    const byUrl = templates.find((t) => templateMatchesUrl(t, url))
    if (byUrl) return byUrl
    // 2) fallback : match par domaine
    const host = (() => {
      try { return new URL(url).hostname.toLowerCase() } catch { return '' }
    })()
    if (!host) return null
    const byDomain = templates.find((t) => {
      const vd = t.vendorDomain.toLowerCase()
      return host.includes(vd) || vd.includes(host)
    })
    return byDomain ?? null
  } catch {
    return null
  }
}
