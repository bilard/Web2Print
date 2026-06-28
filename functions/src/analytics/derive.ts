export type Area = 'promo' | 'docs' | 'app' | 'other'
export type Device = 'mobile' | 'tablet' | 'desktop'

const APP_PREFIXES = ['/dashboard', '/editor', '/data', '/taxonomies', '/scraping-templates', '/workflows', '/login', '/onboarding']
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pingdom|monitor/i

export function deriveArea(path: string): Area {
  if (path === '/promo' || path.startsWith('/promo/')) return 'promo'
  if (path === '/docs' || path.startsWith('/docs/')) return 'docs'
  if (APP_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return 'app'
  return 'other'
}

export function deriveDevice(ua: string): Device {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function normalizeRef(referrer: string | undefined): string | null {
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua)
}

export interface EventInput {
  path: string
  ref: string | null
  src: string | null
  vid: string
  sid: string
  uid: string | null
}

export function buildEventDoc(
  body: unknown,
  headers: { ua: string; referer: string | undefined; country: string | null },
): (EventInput & { area: Area; device: Device; country: string | null }) | null {
  if (isBot(headers.ua)) return null
  const b = (body ?? {}) as Record<string, unknown>
  const path = typeof b.path === 'string' ? b.path : null
  const vid = typeof b.vid === 'string' ? b.vid : null
  const sid = typeof b.sid === 'string' ? b.sid : null
  if (!path || !path.startsWith('/') || !vid || !sid) return null
  return {
    path: path.slice(0, 300),
    area: deriveArea(path),
    ref: normalizeRef(headers.referer),
    src: typeof b.src === 'string' ? b.src.slice(0, 120) : null,
    device: deriveDevice(headers.ua),
    country: headers.country,
    vid: vid.slice(0, 60),
    sid: sid.slice(0, 60),
    uid: typeof b.uid === 'string' ? b.uid : null,
  }
}
