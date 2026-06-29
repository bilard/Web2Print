// functions/src/analytics/geoip.ts
// Géolocalisation ville/pays par IP, base locale DB-IP City Lite (CC BY 4.0,
// https://db-ip.com). L'IP est lue à la volée puis JETÉE : seules la ville et le
// pays dérivés sont stockés (cf. stance « pas de PII » du module Analytics).
import { getStorage } from 'firebase-admin/storage'
import { Reader, validate, type CityResponse } from 'maxmind'

/** Emplacement de la base dans Cloud Storage (rafraîchie chaque mois par `refreshGeoip`). */
export const MMDB_BUCKET = 'web2print-6fe5a.firebasestorage.app'
export const MMDB_PATH = 'geoip/dbip-city-lite.mmdb'

let readerPromise: Promise<Reader<CityResponse>> | null = null

/** Charge la base depuis Cloud Storage une seule fois par instance (cache module-scope). */
function getReader(): Promise<Reader<CityResponse>> {
  if (!readerPromise) {
    readerPromise = (async () => {
      const [buf] = await getStorage().bucket(MMDB_BUCKET).file(MMDB_PATH).download()
      return new Reader<CityResponse>(buf)
    })().catch((e) => {
      readerPromise = null // échec de chargement : on retentera au prochain appel
      throw e
    })
  }
  return readerPromise
}

/** IP privée / réservée (RFC 1918, loopback, link-local, ULA IPv6) — à ne pas géolocaliser. */
function isPrivateIp(ip: string): boolean {
  return (
    /^10\./.test(ip) ||
    /^127\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === '::1' ||
    /^f[cd][0-9a-f]{2}:/i.test(ip) ||
    /^fe80:/i.test(ip)
  )
}

/**
 * IP cliente réelle depuis les en-têtes proxy (Firebase Hosting/Fastly → Cloud Run).
 * Ordre : `fastly-client-ip`, puis tête de `x-forwarded-for`, puis `x-real-ip`.
 * `null` si rien d'exploitable (IP publique valide requise).
 */
export function clientIpFromHeaders(headers: Record<string, string | string[] | undefined>): string | null {
  const first = (h: string | string[] | undefined): string | undefined =>
    (Array.isArray(h) ? h[0] : h)?.split(',')[0]?.trim()
  const candidates = [first(headers['fastly-client-ip']), first(headers['x-forwarded-for']), first(headers['x-real-ip'])]
  for (const ip of candidates) {
    if (ip && validate(ip) && !isPrivateIp(ip)) return ip
  }
  return null
}

interface Geo {
  country: string | null
  city: string | null
}

/** Géolocalise une IP (ville + pays ISO) via la base locale. `null` si IP absente/inconnue. */
export async function lookupGeo(ip: string | null): Promise<Geo | null> {
  if (!ip) return null
  try {
    const g = (await getReader()).get(ip)
    if (!g) return null
    return { country: g.country?.iso_code ?? null, city: g.city?.names?.en ?? null }
  } catch {
    return null // best-effort : jamais d'erreur exposée au visiteur
  }
}
