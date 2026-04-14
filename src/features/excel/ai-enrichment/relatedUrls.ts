/** Related-URL discovery utilities (pure, testable). */

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'msclkid', 'dclid',
])

export interface NormalizeOptions {
  keepHash?: boolean
}

export function normalizeUrl(raw: string, opts: NormalizeOptions = {}): string | null {
  try {
    const u = new URL(raw)
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1)
    }
    const params = Array.from(u.searchParams.entries())
      .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b))
    u.search = ''
    for (const [k, v] of params) u.searchParams.append(k, v)
    if (!opts.keepHash) u.hash = ''
    return u.toString().replace(/\/$/, '') // second trim for root
  } catch {
    return null
  }
}
