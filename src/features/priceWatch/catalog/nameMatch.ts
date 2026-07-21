// src/features/priceWatch/catalog/nameMatch.ts
// Appariement par NOM — fallback INCERTAIN, voie SÉPARÉE (« À confirmer »). Ne produit
// que des CANDIDATS à validation humaine ; n'entre JAMAIS dans le comparatif réel (on ne
// touche pas proveMatch). Un seuil de distinctivité écarte les noms génériques (« VIS »,
// « FILTRE A AIR ») qui matcheraient des milliers d'articles. PUR, testable.
import type { CompetitorListing } from './prestashop'

// Mots vides FR + termes trop communs sur un catalogue de pièces (ne discriminent rien).
const STOP = new Set([
  'pour', 'de', 'la', 'le', 'les', 'un', 'une', 'et', 'au', 'aux', 'du', 'des', 'en', 'avec',
  'sur', 'ou', 'par', 'sans', 'type', 'ref', 'reference', 'origine', 'remplace', 'piece',
  'pieces', 'modele', 'the', 'and', 'for',
])

/**
 * Tokens significatifs d'un nom : minuscules sans accents, ponctuation retirée, mots vides
 * et tokens < 3 caractères écartés, dédupliqués. La partie « Origine: … » (réf constructeur)
 * est coupée — elle relève de l'appariement EXACT, pas d'ici.
 */
export function nameTokens(name: string | null | undefined): string[] {
  const cut = String(name ?? '').split(/origine\s*:/i)[0]
  const words = cut.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
  const out: string[] = []
  const seen = new Set<string>()
  for (const w of words) {
    if (w.length < 3 || STOP.has(w) || seen.has(w)) continue
    seen.add(w); out.push(w)
  }
  return out
}

export interface NameCandidate {
  listing: CompetitorListing
  /** Part des tokens du nom source retrouvés chez le candidat (0..1). */
  score: number
  /** Nombre de tokens significatifs communs. */
  common: number
}

/** Index inversé token → listings le portant dans leur nom (évite le O(N×M)). */
export function buildNameIndex(listings: CompetitorListing[]): Map<string, CompetitorListing[]> {
  const idx = new Map<string, CompetitorListing[]>()
  for (const l of listings) {
    for (const t of nameTokens(l.name)) {
      const b = idx.get(t); if (b) b.push(l); else idx.set(t, [l])
    }
  }
  return idx
}

/** En dessous, un nom est trop générique pour un match par nom fiable → aucun candidat. */
const MIN_SOURCE_TOKENS = 3
const MIN_COMMON = 3
const MIN_SCORE = 0.6

/**
 * Candidats concurrents par nom pour UN produit source non apparié, rangés par score,
 * top-K. `[]` si le nom source est trop générique (garde-fou anti faux positifs).
 */
export function nameMatchCandidates(
  sourceName: string,
  index: Map<string, CompetitorListing[]>,
  topK = 3,
): NameCandidate[] {
  const src = nameTokens(sourceName)
  if (src.length < MIN_SOURCE_TOKENS) return []
  const tally = new Map<CompetitorListing, number>()
  for (const t of src) {
    for (const l of index.get(t) ?? []) tally.set(l, (tally.get(l) ?? 0) + 1)
  }
  const out: NameCandidate[] = []
  for (const [listing, common] of tally) {
    if (common < MIN_COMMON) continue
    const score = common / src.length
    if (score < MIN_SCORE) continue
    out.push({ listing, score, common })
  }
  out.sort((a, b) => b.score - a.score || b.common - a.common)
  return out.slice(0, topK)
}
