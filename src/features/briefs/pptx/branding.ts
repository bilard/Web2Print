import type { Brief } from '@/features/briefs/types'

const HEX6 = /^[0-9A-F]{6}$/

export interface Branding {
  companyName: string
  logoUrl?: string
  primaryColor: string   // 6 hex chars, no #
  secondaryColor: string
  brandKitUrl?: string
  brandKitFilename?: string
}

const FALLBACK_PRIMARY = '6366F1'
const FALLBACK_SECONDARY = '4F46E5'

export function sanitizeHex(input: string | undefined, fallback = FALLBACK_PRIMARY): string {
  if (!input) return fallback
  let v = input.trim().replace(/^#/, '').toUpperCase()
  if (v.length === 3) {
    v = v.split('').map((c) => c + c).join('')
  }
  return HEX6.test(v) ? v : fallback
}

function readString(values: Record<string, unknown>, key: string): string | undefined {
  const v = values[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

export function extractBranding(brief: Brief): Branding {
  const v = brief.client.values
  const brandKit = (v as Record<string, unknown>).brandKit as
    | { url?: string; filename?: string }
    | undefined
  return {
    companyName: readString(v, 'companyName') ?? brief.clientName ?? 'Client',
    logoUrl: readString(v, 'logoUrl'),
    primaryColor: sanitizeHex(readString(v, 'primaryColor'), FALLBACK_PRIMARY),
    secondaryColor: sanitizeHex(readString(v, 'secondaryColor'), FALLBACK_SECONDARY),
    brandKitUrl: brandKit?.url,
    brandKitFilename: brandKit?.filename,
  }
}
