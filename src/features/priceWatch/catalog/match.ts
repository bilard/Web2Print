// src/features/priceWatch/catalog/match.ts
// Appariement catalogue source ↔ index concurrent, et calcul des écarts. PUR.
//
// L'appariement ne construit JAMAIS de table en mémoire à partir du catalogue
// concurrent complet : à l'échelle visée (75 000 références × N concurrents), cela
// dépasse la mémoire d'une Cloud Function. Il interroge un index par clé — la
// résolution d'une clé est déléguée à `IndexLookup`, que l'appelant branche sur
// Firestore (production) ou sur une Map (tests, petits volumes).

import {
  candidateKeys, proveMatch, normalizeRef, stripLeadingZeros, normalizeEan,
  isInternalBarcode, MIN_REF_LEN,
  type JoinKey, type MatchProof, type SourceProductKeys,
} from './keys'
import type { CompetitorListing, Availability } from './prestashop'

/** TVA française de droit commun. Paramétrable : certaines familles en dérogent. */
export const DEFAULT_VAT_RATE = 0.2

/**
 * Clés sous lesquelles indexer un produit relevé chez un concurrent. Un même produit
 * peut être indexé plusieurs fois (référence brute, référence dépaddée, code-barres) :
 * c'est un index, la duplication y est normale et permet un lookup en O(1) quelle que
 * soit la clé dont dispose la source.
 */
export function indexKeysOf(listing: CompetitorListing): string[] {
  const out = new Set<string>()
  const ref = normalizeRef(listing.ref)
  if (ref.length >= MIN_REF_LEN) {
    out.add(ref)
    const nz = stripLeadingZeros(ref)
    if (nz.length >= MIN_REF_LEN) out.add(nz)
  }
  const ean = normalizeEan(listing.gtin13)
  // Un code-barres interne à la boutique n'est pas une clé de jointure : l'indexer
  // exposerait à des collisions entre enseignes.
  if (ean && !isInternalBarcode(ean)) out.add(ean)
  return [...out]
}

/** Clés à interroger pour un produit source, dans l'ordre de fiabilité. */
export function lookupKeysOf(p: SourceProductKeys): JoinKey[] {
  return candidateKeys(p)
}

/** Résout une clé d'index en produits concurrents candidats. */
export type IndexLookup = (key: string) => CompetitorListing[] | undefined

export type MatchOutcome = 'matched' | 'not-found' | 'no-key'

export interface SourceProduct extends SourceProductKeys {
  id: string
  name: string
  /** Prix de vente du catalogue source. Hors taxes par convention ERP. */
  price?: number
}

export interface MatchResult {
  productId: string
  siteId: string
  outcome: MatchOutcome
  listing?: CompetitorListing
  proof?: MatchProof
}

/**
 * Apparie un produit source à l'index d'un concurrent.
 *
 * Deux verrous, dans cet ordre : la clé doit RÉSOUDRE dans l'index, puis
 * l'appariement doit être PROUVÉ par égalité exacte (`proveMatch`). Le second n'est
 * pas redondant : un index peut contenir des collisions (deux produits sous la même
 * référence dépaddée), et un candidat non prouvé doit être rejeté, jamais retenu
 * faute de mieux.
 */
export function matchProduct(
  product: SourceProduct,
  siteId: string,
  lookup: IndexLookup,
): MatchResult {
  const keys = lookupKeysOf(product)
  if (keys.length === 0) return { productId: product.id, siteId, outcome: 'no-key' }

  for (const key of keys) {
    for (const candidate of lookup(key.value) ?? []) {
      const proof = proveMatch([key], {
        sku: candidate.ref,
        gtin13: candidate.gtin13,
        url: candidate.url,
        name: candidate.name,
      })
      if (proof) return { productId: product.id, siteId, outcome: 'matched', listing: candidate, proof }
    }
  }
  return { productId: product.id, siteId, outcome: 'not-found' }
}

/** Index en mémoire — pour les tests et les volumes modestes. */
export function buildMemoryIndex(listings: CompetitorListing[]): IndexLookup {
  const map = new Map<string, CompetitorListing[]>()
  for (const l of listings) {
    for (const key of indexKeysOf(l)) {
      const bucket = map.get(key)
      if (bucket) bucket.push(l)
      else map.set(key, [l])
    }
  }
  return (key) => map.get(key)
}

export interface PriceComparison {
  /** Prix concurrent TTC, tel qu'affiché sur le site marchand. */
  priceTtc?: number
  /** Prix barré TTC (avant remise), quand le site en affiche un. */
  listPriceTtc?: number
  /** Prix concurrent ramené hors taxes, pour être comparable au prix source. */
  priceHt?: number
  /** Écart en euros HT : concurrent − source. Négatif = le concurrent est moins cher. */
  deltaHt?: number
  /** Écart relatif en %, arrondi au dixième. */
  deltaPct?: number
  /** Position du prix source face au concurrent. */
  position?: 'cheaper' | 'aligned' | 'more-expensive'
  availability?: Availability
}

/** Arrondi monétaire au centime. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Compare un prix source (HT) au prix relevé chez un concurrent.
 *
 * Les marchands B2C relevés affichent du TTC. On expose les deux formes : le TTC
 * verbatim (ce que voit l'acheteur) et un HT recalculé (seul comparable au prix
 * catalogue). Quand le site déclare explicitement un prix HT, aucune conversion.
 *
 * `alignedPct` : bande d'indifférence sous laquelle deux prix sont dits alignés — un
 * écart de quelques centimes n'est pas un signal de positionnement.
 */
export function comparePrices(
  sourcePriceHt: number | undefined,
  listing: CompetitorListing,
  opts: { vatRate?: number; alignedPct?: number } = {},
): PriceComparison {
  const vat = opts.vatRate ?? DEFAULT_VAT_RATE
  const alignedPct = opts.alignedPct ?? 1
  const out: PriceComparison = { availability: listing.availability }

  if (listing.price == null) return out

  // taxIncluded absent = marchand B2C français : TTC par défaut. L'inverse
  // (supposer du HT) sous-estimerait le prix concurrent de 20 % et produirait des
  // alertes de positionnement fausses.
  const isHt = listing.taxIncluded === false
  out.priceTtc = round2(isHt ? listing.price * (1 + vat) : listing.price)
  out.priceHt = round2(isHt ? listing.price : listing.price / (1 + vat))
  if (listing.listPrice != null) {
    out.listPriceTtc = round2(isHt ? listing.listPrice * (1 + vat) : listing.listPrice)
  }

  if (sourcePriceHt != null && sourcePriceHt > 0) {
    out.deltaHt = round2(out.priceHt - sourcePriceHt)
    out.deltaPct = Math.round(((out.priceHt - sourcePriceHt) / sourcePriceHt) * 1000) / 10
    out.position = Math.abs(out.deltaPct) < alignedPct
      ? 'aligned'
      : out.deltaPct > 0 ? 'cheaper' : 'more-expensive'
  }
  return out
}

/**
 * Références d'origine citées dans une description commerciale.
 * « Lame adaptable pour AL-KO. Remplace origine: 516747, 344769, 117720. »
 *   → ['516747', '344769', '117720']
 *
 * Enjeu métier : sur un catalogue de pièces, les articles ADAPTABLES portent une
 * référence interne au distributeur, absente de tout catalogue concurrent. Les
 * références d'origine qu'ils remplacent sont, elles, universelles — c'est la seule
 * clé de jointure disponible pour cette part du catalogue.
 */
export function extractOriginRefs(description: string | null | undefined): string[] {
  const text = String(description ?? '')
  if (!text) return []
  const out: string[] = []
  const seen = new Set<string>()

  // « Remplace origine: A, B », « Origine : A, B », « Remplace: A, B »
  // La liste se termine à une fin de PHRASE (point suivi d'un blanc ou de la fin) et
  // non au premier point : les références en contiennent (« 000.02.501 »).
  for (const m of text.matchAll(/(?:remplace\s+origine|origine|remplace)\s*:\s*([\s\S]{2,300}?)(?=\.(?:\s|$)|;|$)/gi)) {
    for (const token of m[1].split(/[,;]| et /i)) {
      const raw = token.trim().replace(/\s*\)$/, '')
      // Une référence contient au moins un chiffre : écarte les mots de la phrase.
      if (!/\d/.test(raw)) continue
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,}$/.test(raw)) continue
      const norm = normalizeRef(raw)
      if (norm.length < MIN_REF_LEN || seen.has(norm)) continue
      seen.add(norm)
      out.push(raw)
    }
  }
  return out
}
