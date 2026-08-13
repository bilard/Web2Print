// Filtres et suggestions de l'explorateur concurrent. PUR : aucune dépendance
// React/Firebase, tout est testable sur un tableau de `PairedRow`.
//
// Les tokens de titre viennent de `nameTokens` (module d'appariement par nom) : un seul
// tokeniseur pour toute la veille — un second, écrit ici, dériverait de l'autre et les
// suggestions ne désigneraient plus les mêmes fiches que la recherche.
import { nameTokens } from '../catalog/nameMatch'
import { foldText } from '../catalog/categories'
import { normalizeEan } from '../catalog/keys'
import { discountPct, type PairedRow } from './pairing'
import { isUnderPath } from './taxonomyTree'
import type { DoubtReason } from './confidence'

/** Position du concurrent face à mon prix (lecture ACHETEUR, cf. `pw` : < 0 = lui moins cher). */
export type GapBand = 'all' | 'cheaper' | 'aligned' | 'dearer'
export type PairFilter = 'all' | 'matched' | 'orphan'
export type StockFilter = 'all' | 'in-stock' | 'out-of-stock'

export interface ExplorerFilter {
  q: string
  /** Appariées seules par défaut : l'écran sert d'abord à VALIDER un appariement. */
  pairing: PairFilter
  gap: GapBand
  stock: StockFilter
  /** Fiches en promotion (prix barré présent et remise réelle). */
  promoOnly: boolean
  /** Fiches sans prix exploitable (parsing à vérifier). */
  noPriceOnly: boolean
  priceMin: number | null
  priceMax: number | null
  /** Mots-clés de titre exigés (issus des suggestions sémantiques). */
  tokens: string[]
  /** Chemin de taxonomie F1 sélectionné dans l'arbre (préfixe : ses descendants passent). */
  path: string[]
  /** Fiabilité de l'appariement : `suspect` = tout ce qui n'est pas jugé sûr. */
  trust: TrustFilter
  /** UN motif de doute précis. Sans lui, « 12 437 douteux » ne se traite pas : c'est en
   *  isolant un motif qu'on décide s'il faut corriger une règle (une référence d'origine
   *  n'est pas un défaut de la fiche) ou vérifier les lignes une à une. */
  reason: DoubtReason | null
  /** Les moins fiables en tête — l'ordre de travail quand on audite les rapprochements. */
  worstFirst: boolean
  /** Avancement de l'audit : ce qui reste à juger, ce qui a été validé, ce qui a été rejeté. */
  audit: AuditFilter
  /** Verdict de la comparaison des photos. */
  visual: VisualFilter
}

/** `different` seul désigne les appariements que les PHOTOS contredisent — la liste la
 *  plus rentable à éplucher, puisque le désaccord y est déjà établi. */
export type VisualFilter = 'all' | 'same' | 'different' | 'unclear' | 'none'

/** `pending` = jamais jugé. C'est la file de travail : elle se vide à mesure qu'on statue. */
export type AuditFilter = 'all' | 'pending' | 'ok' | 'ko'

/** `suspect` réunit « à vérifier » et « douteux » : le but est de sortir du lot tout ce
 *  qui n'est pas acquis, pas de distinguer deux nuances de doute dans un menu. */
export type TrustFilter = 'all' | 'suspect' | 'doubt' | 'sure'

export const EMPTY_EXPLORER_FILTER: ExplorerFilter = {
  q: '', pairing: 'matched', gap: 'all', stock: 'all',
  promoOnly: false, noPriceOnly: false, priceMin: null, priceMax: null, tokens: [], path: [],
  trust: 'all', worstFirst: false, audit: 'all', visual: 'all', reason: null,
}

export function isExplorerFilterActive(f: ExplorerFilter): boolean {
  return !!f.q.trim() || f.pairing !== 'matched' || f.gap !== 'all' || f.stock !== 'all'
    || f.promoOnly || f.noPriceOnly || f.priceMin != null || f.priceMax != null
    || f.tokens.length > 0 || f.path.length > 0 || f.trust !== 'all' || f.worstFirst
    || f.reason != null
    || f.audit !== 'all' || f.visual !== 'all'
}

/**
 * Texte interrogé par la recherche : les deux côtés de la ligne. Chercher un EAN F1 doit
 * ramener la fiche concurrent qui lui est appariée même si le marchand ne publie pas de
 * code-barres — c'est tout l'intérêt de l'écran.
 */
function haystack(r: PairedRow): string {
  const l = r.listing
  const s = r.source
  return foldText([
    l.name, l.ref ?? '', l.gtin13 ?? '',
    s?.name ?? '', s?.ref ?? '', s?.ean ?? '',
  ].join(' '))
}

/** Un EAN saisi avec des séparateurs (« 4 049582 395377 ») doit trouver sa fiche. */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

export function matchesExplorerQuery(r: PairedRow, q: string): boolean {
  const raw = q.trim()
  if (!raw) return true
  const hay = haystack(r)
  const tokens = foldText(raw).split(/\s+/).filter(Boolean)
  if (tokens.every((t) => hay.includes(t))) return true
  // Repli code-barres : la requête ne porte que des chiffres → on compare les EAN
  // NORMALISÉS (les séparateurs de saisie comme d'affichage sont neutralisés).
  const d = digitsOnly(raw)
  if (d.length < 8) return false
  const ean = normalizeEan(d)
  if (!ean) return false
  return normalizeEan(r.source?.ean) === ean || normalizeEan(r.listing.gtin13) === ean
}

/** `verdictOf` est fourni par l'écran (état Firestore) : `filterRows` reste PUR — aucun
 *  accès réseau, tout est testable sur un tableau de lignes et une lambda. */
export function filterRows(
  rows: PairedRow[], f: ExplorerFilter,
  verdictOf?: (url: string) => 'ok' | 'ko' | null,
  visualOf?: (url: string) => { verdict: string } | null,
): PairedRow[] {
  const kept = rows.filter((r) => {
    if (f.visual !== 'all') {
      // `none` = pas encore analysée. Distinguer « non analysée » de « non concluante »
      // est indispensable : la première attend une passe, la seconde a déjà coûté un appel
      // et ne dira jamais rien de plus.
      const v = visualOf?.(r.listing.url) ?? null
      if (f.visual === 'none') { if (v) return false }
      else if (v?.verdict !== f.visual) return false
    }
    if (f.audit !== 'all') {
      const v = verdictOf?.(r.listing.url) ?? null
      if (f.audit === 'pending' && v != null) return false
      if (f.audit === 'ok' && v !== 'ok') return false
      if (f.audit === 'ko' && v !== 'ko') return false
    }
    if (f.pairing === 'matched' && !r.source) return false
    if (f.pairing === 'orphan' && r.source) return false

    if (f.trust !== 'all') {
      // Une fiche orpheline n'a pas d'appariement à mettre en doute : elle sort de tout
      // filtre de fiabilité plutôt que de gonfler le tas des suspects.
      const band = r.confidence?.band
      if (!band) return false
      if (f.trust === 'suspect' && band === 'sure') return false
      if (f.trust === 'doubt' && band !== 'doubt') return false
      if (f.trust === 'sure' && band !== 'sure') return false
    }

    // Un motif isolé ne s'applique qu'aux lignes qu'il GRÈVE : comme `countDoubts`, les
    // lignes sûres sont hors sujet — un doute mineur qui n'a rien coûté à la bande n'est
    // pas du travail à faire.
    if (f.reason && (!r.confidence || r.confidence.band === 'sure' || !r.confidence.doubts.includes(f.reason))) return false

    // Taxonomie : sélection par PRÉFIXE — choisir une famille garde ses sous-familles.
    if (f.path.length > 0 && !isUnderPath(r.source?.path ?? [], f.path)) return false

    const gap = r.cmp.deltaPct
    if (f.gap !== 'all') {
      if (gap == null) return false
      // deltaPct = concurrent − moi : négatif ⇒ le concurrent est MOINS cher.
      if (f.gap === 'cheaper' && gap >= -1) return false
      if (f.gap === 'dearer' && gap <= 1) return false
      if (f.gap === 'aligned' && Math.abs(gap) > 1) return false
    }

    if (f.stock !== 'all' && r.listing.availability !== f.stock) return false
    if (f.promoOnly && discountPct(r.listing) == null) return false
    if (f.noPriceOnly && r.cmp.priceHt != null) return false

    const price = r.cmp.priceHt
    if (f.priceMin != null && (price == null || price < f.priceMin)) return false
    if (f.priceMax != null && (price == null || price > f.priceMax)) return false

    if (f.tokens.length > 0) {
      const hay = foldText(`${r.listing.name} ${r.source?.name ?? ''}`)
      if (!f.tokens.every((t) => hay.includes(t))) return false
    }

    return matchesExplorerQuery(r, f.q)
  })
  // Tri APRÈS filtrage, et avant toute pagination côté écran. Les orphelines n'ont pas
  // d'indice : elles vont en fin de liste plutôt qu'en tête d'un audit qui ne les vise pas.
  if (!f.worstFirst) return kept
  return [...kept].sort((a, b) => (a.confidence?.score ?? 999) - (b.confidence?.score ?? 999))
}

// ── Suggestions ─────────────────────────────────────────────────────────────────────

export type SuggestionKind = 'token' | 'ref' | 'ean' | 'product'

export interface Suggestion {
  kind: SuggestionKind
  /** Valeur injectée dans la recherche (ou ajoutée aux mots-clés pour `token`). */
  value: string
  label: string
  /** Nombre de fiches concernées — un mot-clé qui ne cadre rien n'est pas proposé. */
  count: number
}

/**
 * Mots-clés les plus porteurs des titres du site actif, calculés UNE fois par onglet.
 * Un token présent sur presque toutes les fiches ne discrimine rien (« tondeuse » chez
 * un vendeur de tondeuses) : on écarte au-delà de 60 % de couverture.
 */
export function buildTokenIndex(rows: PairedRow[]): { token: string; count: number }[] {
  const freq = new Map<string, number>()
  for (const r of rows) {
    for (const t of nameTokens(r.listing.name)) freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  const ceiling = Math.max(2, Math.floor(rows.length * 0.6))
  return [...freq.entries()]
    .filter(([, n]) => n >= 2 && n <= ceiling)
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token, 'fr'))
}

/**
 * Suggestions pour la saisie en cours : d'abord les correspondances EXACTES de clés
 * (réf, EAN — une saisie de code-barres doit tomber sur sa fiche, pas sur un mot-clé),
 * puis les mots-clés de titre, puis les libellés produits.
 */
export function suggest(
  rows: PairedRow[],
  tokenIndex: { token: string; count: number }[],
  q: string,
  limit = 8,
): Suggestion[] {
  const raw = q.trim()
  if (raw.length < 2) return []
  const needle = foldText(raw)
  const out: Suggestion[] = []
  const seen = new Set<string>()
  const push = (s: Suggestion) => {
    const k = `${s.kind}:${s.value}`
    if (seen.has(k) || out.length >= limit) return
    seen.add(k); out.push(s)
  }

  const d = digitsOnly(raw)
  if (d.length >= 6) {
    for (const r of rows) {
      const ean = r.source?.ean ?? r.listing.gtin13
      if (ean && digitsOnly(ean).includes(d)) push({ kind: 'ean', value: ean, label: ean, count: 1 })
    }
  }
  for (const r of rows) {
    const ref = r.source?.ref ?? r.listing.ref
    if (ref && foldText(ref).includes(needle)) push({ kind: 'ref', value: ref, label: ref, count: 1 })
  }
  for (const { token, count } of tokenIndex) {
    if (token.startsWith(needle)) push({ kind: 'token', value: token, label: token, count })
  }
  for (const r of rows) {
    if (foldText(r.listing.name).includes(needle)) {
      push({ kind: 'product', value: r.listing.name, label: r.listing.name, count: 1 })
    }
  }
  return out
}
