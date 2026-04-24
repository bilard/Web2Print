import { useState, useEffect } from 'react'

interface FontDef {
  family: string
  label: string
  weights: number[]
}

export const AVAILABLE_FONTS: FontDef[] = [
  { family: 'Inter', label: 'Inter', weights: [400, 700] },
  { family: 'Roboto', label: 'Roboto', weights: [400, 700] },
  { family: 'Open Sans', label: 'Open Sans', weights: [400, 700] },
  { family: 'Lato', label: 'Lato', weights: [400, 700] },
  { family: 'Montserrat', label: 'Montserrat', weights: [400, 700] },
  { family: 'Playfair Display', label: 'Playfair Display', weights: [400, 700] },
  { family: 'Source Code Pro', label: 'Source Code Pro', weights: [400, 700] },
  { family: 'Merriweather', label: 'Merriweather', weights: [400, 700] },
  { family: 'Oswald', label: 'Oswald', weights: [400, 700] },
  { family: 'Poppins', label: 'Poppins', weights: [400, 700] },
  { family: 'Nunito', label: 'Nunito', weights: [400, 700] },
  { family: 'Raleway', label: 'Raleway', weights: [400, 700] },
]

const loadedFonts = new Set<string>()

// Fonts chargées dynamiquement (Import IDML, uploads custom)
const dynamicFontFamilies = new Set<string>()

// Variantes disponibles par famille : family → [{weight, style, fileName}]
interface FontVariant {
  weight: string
  style: string
  label: string
  fileName: string
}

const dynamicFontVariants = new Map<string, FontVariant[]>()

function variantLabel(weight: string, style: string): string {
  const w = parseInt(weight) || 400
  const isItalic = style === 'italic'
  let label = ''
  if (w <= 100) label = 'Thin'
  else if (w <= 200) label = 'ExtraLight'
  else if (w <= 300) label = 'Light'
  else if (w <= 400) label = 'Regular'
  else if (w <= 500) label = 'Medium'
  else if (w <= 600) label = 'SemiBold'
  else if (w <= 700) label = 'Bold'
  else if (w <= 800) label = 'ExtraBold'
  else label = 'Black'
  if (isItalic) label += ' Italic'
  return label
}

export function registerDynamicFontVariant(family: string, weight: string, style: string, fileName: string, customLabel?: string) {
  dynamicFontFamilies.add(family)
  if (!dynamicFontVariants.has(family)) dynamicFontVariants.set(family, [])
  const variants = dynamicFontVariants.get(family)!
  // Avoid duplicate
  if (!variants.some(v => v.weight === weight && v.style === style)) {
    variants.push({ weight, style, label: customLabel || variantLabel(weight, style), fileName })
  }
  // Auto-register synthetic italic variant (browser can synthesize it)
  if (style === 'normal' && !variants.some(v => v.weight === weight && v.style === 'italic')) {
    const italicLabel = customLabel
      ? `${customLabel} Italic`
      : variantLabel(weight, 'italic')
    variants.push({ weight, style: 'italic', label: italicLabel, fileName })
  }
}

export function getDynamicFontVariants(family: string): FontVariant[] {
  return dynamicFontVariants.get(family) ?? []
}

/**
 * Strip version/technology suffixes from a font family name for comparison.
 * "DIN OT" → "din", "DIN 2014" → "din", "Minion Pro" → "minion"
 */
function normalizeFontBase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\b(ot|std|pro|lt|ltstd|mt|ps|tt)\b/gi, '')  // technology suffixes
    .replace(/\b\d{4}\b/g, '')                              // year numbers like 2014
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve an IDML font family name to an available loaded font.
 * Tries exact match, then normalized match, then base-family match.
 */
export function resolveAvailableFont(family: string): string {
  if (!family) return 'Arial'

  // 1. Exact match
  if (dynamicFontFamilies.has(family)) return family

  // 2. Case-insensitive match with normalized separators
  const norm = family.toLowerCase().replace(/[-_]/g, ' ').trim()
  for (const f of dynamicFontFamilies) {
    const normF = f.toLowerCase().replace(/[-_]/g, ' ').trim()
    if (normF === norm) return f
  }

  // 3. Match without technology/version suffixes
  //    e.g. "DIN 2014" ↔ "DIN OT" (both → "din")
  const base = normalizeFontBase(family)
  let bestMatch: string | null = null
  let bestLen = 0
  for (const f of dynamicFontFamilies) {
    const baseF = normalizeFontBase(f)
    if (baseF === base && f.length > bestLen) {
      bestMatch = f
      bestLen = f.length
    }
  }
  if (bestMatch) return bestMatch

  // 4. No match found — return as-is, browser will use fallback
  return family
}

export function getAllFonts(): FontDef[] {
  const dynamic: FontDef[] = Array.from(dynamicFontFamilies).map(f => ({
    family: f, label: f, weights: [400, 700, 900],
  }))
  return [...dynamic, ...AVAILABLE_FONTS]
}

function buildGoogleFontsUrl(font: FontDef): string {
  const weights = font.weights.join(';')
  const family = encodeURIComponent(font.family)
  return `https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&display=swap`
}

export async function loadFont(font: FontDef): Promise<void> {
  if (loadedFonts.has(font.family)) return
  return new Promise((resolve) => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = buildGoogleFontsUrl(font)
    link.onload = () => { loadedFonts.add(font.family); resolve() }
    link.onerror = () => resolve() // fail silently
    document.head.appendChild(link)
  })
}

const pendingFontLoads = new Map<string, Promise<void>>()

/**
 * Injecte la feuille Google Fonts pour une famille arbitraire (nom choisi par
 * un LLM par exemple) et attend que les variantes regular/bold/italic soient
 * réellement prêtes à peindre — nécessaire avant de créer des Fabric Textbox,
 * sinon Fabric mesure avec le fallback système.
 *
 * Partage `loadedFonts` avec `loadFont` pour éviter les registres dupliqués.
 */
export async function ensureGoogleFontLoaded(family: string): Promise<void> {
  const key = family?.trim()
  if (!key) return
  if (loadedFonts.has(key)) return
  const existing = pendingFontLoads.get(key)
  if (existing) return existing

  const loadPromise = (async () => {
    const familyUrl = key.replace(/\s+/g, '+')
    const href = `https://fonts.googleapis.com/css2?family=${familyUrl}:ital,wght@0,400;0,700;1,400;1,700&display=swap`
    const linkId = `google-font-${key.replace(/\s+/g, '-').toLowerCase()}`
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.href = href
      document.head.appendChild(link)
    }
    try {
      await Promise.all([
        document.fonts.load(`400 16px "${key}"`),
        document.fonts.load(`700 16px "${key}"`),
        document.fonts.load(`italic 400 16px "${key}"`),
        document.fonts.load(`italic 700 16px "${key}"`),
      ])
    } catch (err) {
      console.warn(`[useFonts] Variantes de "${key}" indisponibles :`, err)
    }
    loadedFonts.add(key)
  })()

  pendingFontLoads.set(key, loadPromise)
  try {
    await loadPromise
  } finally {
    pendingFontLoads.delete(key)
  }
}

/** Charge en parallèle plusieurs familles Google Fonts. Dédoublonne et ignore vides. */
export async function ensureGoogleFontsLoaded(families: Array<string | undefined>): Promise<void> {
  const unique = Array.from(
    new Set(families.map((f) => (f ?? '').trim()).filter((f) => f.length > 0))
  )
  await Promise.all(unique.map((f) => ensureGoogleFontLoaded(f)))
}

export function usePreloadFonts() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all(AVAILABLE_FONTS.map(loadFont)).then(() => setReady(true))
  }, [])

  return ready
}
