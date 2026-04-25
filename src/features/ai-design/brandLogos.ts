/**
 * Registre des logos de marques connus. Claude Vision retourne un
 * `imageSlot` role="logo" avec `description` = domaine ou nom de marque ;
 * on résout ici vers l'URL de l'asset à charger sur le canvas.
 *
 * Fallback si aucune correspondance : https://logo.clearbit.com/{domain} qui
 * couvre la plupart des marques grand public en logo carré PNG avec fond
 * transparent.
 */

const KNOWN_BRAND_LOGOS: Record<string, string> = {
  'jardiland.com':
    'https://media.jardiland.com/ctfassets/47xEB72acFrVVv6D5T7fIw/d723aadda06630396f0819d703bc4fa8/logo-jardiland-signature-main.png?timestamp=v2',
}

// Mots génériques que Claude Vision met devant le nom de marque réel
// dans les descriptions ("logo Jardiland orange", "marque RYOBI", etc.)
const GENERIC_PREFIX_WORDS = new Set([
  'logo', 'logos', 'marque', 'brand', 'enseigne', 'marca',
  'le', 'la', 'les', 'du', 'de', 'des', 'un', 'une',
])

function normalizeBrandKey(description: string): string | null {
  const trimmed = description.trim().toLowerCase()
  if (!trimmed) return null
  // "jardiland.com" → "jardiland.com"
  if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(trimmed)) return trimmed
  // "JARDILAND.COM orange en haut" → extrait le domain si présent
  const domainMatch = trimmed.match(/([a-z0-9-]+\.[a-z]{2,})/i)
  if (domainMatch) return domainMatch[1].toLowerCase()
  // Mots successifs : ignore "logo", "marque", "le", etc. → premier mot non-générique
  const words = trimmed.split(/[\s,;:.\-_/]+/).filter(Boolean)
  for (const w of words) {
    if (GENERIC_PREFIX_WORDS.has(w)) continue
    if (w.length < 2) continue
    return `${w}.com`
  }
  return null
}

/**
 * Résout une description de slot logo (fournie par Claude Vision) vers une
 * URL d'image chargeable. null si rien de plausible ne peut être extrait.
 */
export function resolveBrandLogoUrl(description: string | undefined): string | null {
  if (!description) return null
  const key = normalizeBrandKey(description)
  if (!key) return null
  return KNOWN_BRAND_LOGOS[key] ?? `https://logo.clearbit.com/${key}`
}
