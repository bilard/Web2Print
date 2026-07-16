/**
 * Résolution de la page produit FABRICANT à partir d'une fiche source (revendeur).
 *
 * Renvoie des CANDIDATS (URL + réf échouée en clair + confiance) — l'utilisateur
 * confirme avant fusion. Garde-fou du module : ne jamais comparer le mauvais
 * produit. Universel : la whitelist `BRAND_OFFICIAL_SITES` accélère les marques
 * connues, mais une marque inconnue est résolue par recherche généraliste
 * (feedback_scraping_universal_rules) — jamais de scraper par fournisseur.
 */

import { detectBrandFromUrl, detectBrandLabelFromUrl, BRAND_OFFICIAL_SITES, RESELLER_HOSTS } from '@/features/scraping/useJina'
import { extractProductReference } from '@/features/scraping/core/manufacturerFallback'
import { jinaSearch } from '@/features/excel/ai-enrichment/useProductEnrichment'
import type { ManufacturerCandidate } from './types'

export interface ResolveInput {
  /** URL source (revendeur). */
  url: string
  /** Marque (texte) déjà connue de la fiche, repli si l'URL ne la révèle pas. */
  brand?: string
  /** Référence fabricant/MPN déjà connue. */
  manufacturerRef?: string
  /** Nom produit — sert à extraire une référence si `manufacturerRef` manque. */
  name?: string
}

function hostOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return null }
}

/** Vrai si l'URL cible la locale FR (chemin /fr/ ou /fr-fr/). */
function isFrenchUrl(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase()
    return p.startsWith('/fr/') || p.startsWith('/fr-') || p === '/fr'
  } catch { return false }
}

/**
 * Réécrit une URL fabricant vers sa variante FR quand le chemin porte une locale
 * (/de/de/…, /en/…, /it/it/…). Générique — segments de locale, JAMAIS par marque.
 * Retourne null si aucune locale réécrivable (déjà FR ou pas de segment locale).
 */
function toFrenchLocale(url: string): string | null {
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    if (segs.length === 0) return null
    const isLang = (s: string) => /^[a-z]{2}$/.test(s)
    let changed = false
    if (isLang(segs[0]) && segs[1] && isLang(segs[1])) {
      if (segs[0] !== 'fr' || segs[1] !== 'fr') { segs[0] = 'fr'; segs[1] = 'fr'; changed = true }
    } else if (isLang(segs[0])) {
      if (segs[0] !== 'fr') { segs[0] = 'fr'; changed = true }
    }
    if (!changed) return null
    u.pathname = '/' + segs.join('/')
    return u.toString()
  } catch { return null }
}

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Résout le domaine officiel + le label de marque. Généraliste hors whitelist. */
async function resolveOfficialDomain(input: ResolveInput): Promise<{ domain: string; label: string } | null> {
  // 1. Marque détectée depuis l'URL revendeur (nom dans le path OU préfixe SKU).
  const detected = detectBrandFromUrl(input.url)
  if (detected) {
    const domain = hostOf(detected.officialSite.baseUrl)
    if (domain) return { domain, label: detected.officialSite.label }
  }

  // 2. Marque texte connue de la whitelist.
  const brandText = (input.brand ?? '').trim().toLowerCase()
  if (brandText) {
    const hit = BRAND_OFFICIAL_SITES[brandText]
    if (hit) {
      const domain = hostOf(hit.baseUrl)
      if (domain) return { domain, label: hit.label }
    }
    // 3. Repli GÉNÉRALISTE : découvrir le domaine officiel par recherche.
    try {
      const results = await jinaSearch(`${brandText} site officiel`, 6)
      for (const r of results) {
        const h = hostOf(r.url)
        if (h && !RESELLER_HOSTS.test(h) && !/wikipedia|amazon|youtube|facebook/.test(h)) {
          return { domain: h, label: input.brand!.trim() }
        }
      }
    } catch { /* recherche indisponible → pas de candidat */ }
  }
  return null
}

/**
 * Construit la liste de candidats fabricant, triés par confiance décroissante.
 * Confiance : réf dans l'URL → high, réf dans le titre → medium, sinon low.
 */
export async function resolveManufacturerCandidates(input: ResolveInput): Promise<ManufacturerCandidate[]> {
  const official = await resolveOfficialDomain(input)
  const ref = (input.manufacturerRef ?? extractProductReference(input.name ?? '') ?? '').trim()
  if (!official && !ref) return []

  const label = official?.label ?? detectBrandLabelFromUrl(input.url) ?? (input.brand ?? 'Fabricant')
  const domain = official?.domain ?? ''
  const refAlnum = ref ? alnum(ref) : ''

  // Requêtes : la plus ciblée (`réf site:domaine`) d'abord.
  const queries: string[] = []
  if (ref && domain) queries.push(`${ref} site:${domain}`)
  if (ref && input.brand) queries.push(`${input.brand} ${ref}`)
  if (!ref && domain && input.name) queries.push(`${input.name} site:${domain}`)
  if (queries.length === 0) return []

  const seen = new Set<string>()
  const candidates: ManufacturerCandidate[] = []

  for (const q of queries) {
    let results
    try { results = await jinaSearch(q, 8) } catch { continue }
    for (const r of results) {
      const h = hostOf(r.url)
      if (!h) continue
      // Ne garder que le domaine officiel quand on le connaît.
      if (domain && h !== domain && !h.endsWith('.' + domain)) continue
      if (!domain && RESELLER_HOSTS.test(h)) continue
      if (seen.has(r.url)) continue
      seen.add(r.url)

      const urlAlnum = alnum(r.url)
      const titleAlnum = alnum(r.title ?? '')
      // Une réf trop courte (< 5 car. alnum) sur-matche des URLs sans lien (« 18v »,
      // codes 3-4 chiffres) → jamais « high » (sinon le lot fusionnerait en silence
      // le mauvais produit, l'inverse du but « vérité fabricant »). Plafond « medium ».
      const refStrong = refAlnum.length >= 5
      let confidence: ManufacturerCandidate['confidence'] = 'low'
      if (refStrong && urlAlnum.includes(refAlnum)) confidence = 'high'
      else if (refAlnum && (urlAlnum.includes(refAlnum) || titleAlnum.includes(refAlnum))) confidence = 'medium'
      else if (domain && h === domain) confidence = 'medium'

      candidates.push({
        url: r.url,
        title: r.title ?? r.url,
        brand: label,
        domain: h,
        matchedRef: ref || null,
        confidence,
      })
    }
    // Assez de signal fort → inutile d'élargir.
    if (candidates.some((c) => c.confidence === 'high') && candidates.length >= 3) break
  }

  // Ajouter la variante FR de chaque candidat localisé (page fabricant traduite) :
  // la démo est française, on veut comparer aux valeurs FR (et éviter le bruit
  // d'avis en langue étrangère, non filtré par les parsers FR/EN).
  const expanded: ManufacturerCandidate[] = []
  const seenUrl = new Set<string>()
  for (const c of candidates) {
    const fr = toFrenchLocale(c.url)
    if (fr && !seenUrl.has(fr)) { seenUrl.add(fr); expanded.push({ ...c, url: fr }) }
    if (!seenUrl.has(c.url)) { seenUrl.add(c.url); expanded.push(c) }
  }

  const rank = { high: 0, medium: 1, low: 2 }
  // Tri : confiance d'abord, puis pages FR en tête (à confiance égale).
  expanded.sort((a, b) =>
    (rank[a.confidence] - rank[b.confidence])
    || ((isFrenchUrl(b.url) ? 1 : 0) - (isFrenchUrl(a.url) ? 1 : 0)),
  )
  return expanded.slice(0, 5)
}
