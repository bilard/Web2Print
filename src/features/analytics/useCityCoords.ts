import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CityCount } from './metrics'
import { t } from '@/lib/i18n'

export interface CityCoords {
  lat: number
  lon: number
}

/** `0` = ville introuvable (négatif mis en cache pour ne pas re-géocoder en boucle). */
type CacheEntry = CityCoords | 0
// v3 : quartier entre parenthèses strippé avant géocodage (« San Jose (West San Jose) » ne
// matchait jamais) ; v2 : match par pays strict. Bump = purge des négatifs devenus résolubles.
const CACHE_KEY = 'w2p:cityCoords:v3'

const keyOf = (c: Pick<CityCount, 'city' | 'country'>): string => `${c.city}|${c.country ?? ''}`

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, CacheEntry>
  } catch {
    return {}
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Quota plein : on garde le cache mémoire de React Query pour la session.
  }
}

/** Géocode une ville via Open-Meteo (gratuit, CORS, sans clé). Erreur réseau ⇒ throw (retry React Query). */
async function geocode(city: string, country: string | null): Promise<CacheEntry> {
  // DB-IP suffixe parfois le quartier : « San Jose (West San Jose) » — Open-Meteo ne connaît que la ville.
  const name = city.replace(/\s*\(.+\)\s*$/, '')
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(t('err.an.geocoding', { city, status: res.status }))
  const data = (await res.json()) as {
    results?: { latitude: number; longitude: number; country_code?: string }[]
  }
  const results = data.results ?? []
  // Pays connu ⇒ match strict : mieux vaut aucun point qu'un point dans le mauvais pays
  // (ex. DB-IP renvoie « Balikesir, US » → sans garde, le point atterrissait en Turquie).
  const hit = country ? results.find((r) => r.country_code === country) : results[0]
  return hit ? { lat: hit.latitude, lon: hit.longitude } : 0
}

/**
 * Coordonnées des villes de connexion : les events ne stockent que `city`/`country`
 * (DB-IP), on résout donc en lat/lon côté client avec un cache localStorage partagé
 * entre sessions. Renvoie une Map `« ville|pays » → coordonnées` (villes résolues seulement).
 */
export function useCityCoords(cities: CityCount[]): { coords: Map<string, CityCoords>; pending: boolean } {
  const keys = cities.map(keyOf).sort().join(';')
  const { data, isLoading } = useQuery({
    queryKey: ['cityCoords', keys],
    enabled: cities.length > 0,
    staleTime: Infinity,
    queryFn: async (): Promise<Record<string, CacheEntry>> => {
      const cache = readCache()
      const missing = cities.filter((c) => cache[keyOf(c)] === undefined)
      const resolved = await Promise.all(
        missing.map(async (c) => [keyOf(c), await geocode(c.city, c.country)] as const),
      )
      for (const [k, v] of resolved) cache[k] = v
      if (resolved.length > 0) writeCache(cache)
      return cache
    },
  })
  const coords = useMemo(() => {
    const map = new Map<string, CityCoords>()
    for (const [k, v] of Object.entries(data ?? {})) if (v !== 0) map.set(k, v)
    return map
  }, [data])
  return { coords, pending: isLoading }
}
