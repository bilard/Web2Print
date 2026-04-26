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
 * Liste de candidats pour un logo, par ordre de qualité décroissante. Le
 * canvas essaie chaque URL jusqu'à ce qu'une se charge correctement. Permet
 * de tomber proprement sur Google Favicon (toujours disponible) quand
 * Clearbit n'a pas la marque ou est injoignable.
 */
export function resolveBrandLogoCandidates(description: string | undefined): string[] {
  if (!description) return []
  const key = normalizeBrandKey(description)
  if (!key) return []
  const candidates: string[] = []
  if (KNOWN_BRAND_LOGOS[key]) candidates.push(KNOWN_BRAND_LOGOS[key])
  // Clearbit : logos transparents haute qualité, ~80% des marques connues
  candidates.push(`https://logo.clearbit.com/${key}`)
  // Google Favicon V2 : toujours disponible, retombe sur favicon basse-res si
  // pas mieux. Ultime garantie d'avoir quelque chose à afficher.
  candidates.push(`https://www.google.com/s2/favicons?domain=${key}&sz=256`)
  return candidates
}

/**
 * Résout une description de slot logo vers la première URL candidate.
 * @deprecated Utiliser resolveBrandLogoCandidates pour un fallback robuste.
 */
export function resolveBrandLogoUrl(description: string | undefined): string | null {
  const candidates = resolveBrandLogoCandidates(description)
  return candidates[0] ?? null
}
