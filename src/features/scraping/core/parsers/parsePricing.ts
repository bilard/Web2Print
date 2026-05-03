/**
 * Extraction de prix structurés depuis du markdown produit.
 * Sources combinées : patterns markdown + JSON-LD `offers` (priorité JSON-LD).
 *
 * Capture :
 *   - prix TTC (actuel)
 *   - prix HT (B2B)
 *   - prix barré (avant promo)
 *   - réduction (montant et/ou pourcentage)
 *   - éco-participation (FR)
 *   - devise (EUR/USD/GBP)
 */

import type { Pricing } from '@/features/excel/ai-enrichment/types'

const NBSP = ' ' // espace insécable U+00A0
const NNBSP = ' ' // narrow no-break space U+202F (séparateur fin FR)

/**
 * Parse une valeur numérique de prix depuis une string.
 * Gère les formats FR (`1 199,00`), anglo-saxon (`1,199.00`), espaces fines.
 * Retourne null si non parsable.
 */
export function parsePriceNumber(raw: string): number | null {
  if (!raw) return null
  // Normaliser espaces (incluant insécables / fines)
  let s = raw.replace(new RegExp(`[${NBSP}${NNBSP}\\s]`, 'g'), '').trim()
  if (!s) return null
  // Détection du format : si on a UNE virgule à la fin (max 3 chars après) → décimale FR
  // Si on a UN point à la fin (max 3 chars après) ET pas de virgule → décimale EN
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastComma > lastDot) {
    // Format FR : virgules retirées (sauf la dernière), virgule → point
    s = s.replace(/,/g, (match, idx) => idx === lastComma ? '.' : '')
    // Retirer les éventuels points (séparateurs milliers)
    const decIdx = s.lastIndexOf('.')
    s = s.slice(0, decIdx).replace(/\./g, '') + s.slice(decIdx)
  } else if (lastDot > lastComma && lastDot >= 0) {
    // Format EN : virgules = milliers → retirées
    s = s.replace(/,/g, '')
  } else {
    // Pas de séparateur décimal → just remove commas/spaces
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return isFinite(n) ? n : null
}

/** Patterns regex pour extraction prix depuis markdown. */
const PRICE_PATTERNS = {
  // "prix actuel : 999,00€" / "prix actuel\n\n999,00€"
  current: /prix\s+(?:actuel|de\s+vente)\s*:?\s*\n?\s*([\d\s  .,]+)\s*€/i,
  // "prix d'origine : 1 199,00€" / "était 1 199,00€"
  original: /(?:prix\s+d['']origine|était|barré|barr[eé])\s*:?\s*\n?\s*([\d\s  .,]+)\s*€/i,
  // "Économisez 200,00€"
  discountAmount: /[Éé]conomis[eéè]z?\s+([\d\s  .,]+)\s*€/i,
  // "-17%" ou "(-17%)" — itérée avec exclusion bannières marketing
  discountPercent: /[-−]\s*(\d{1,2})\s*%/g,
  // "1 449,00 € HT"
  htPrice: /([\d\s  .,]+)\s*€\s*HT\b/i,
  // "1 738,80 € TTC"
  ttcPrice: /([\d\s  .,]+)\s*€\s*TTC\b/i,
  // "Dont 3,40€ d'éco-participation" / "dont 2,50 € de participation DEEE"
  ecoPart: /(?:dont|y\s+compris)\s+([\d\s  .,]+)\s*€\s*(?:d['']?[ée]co[\s-]?participation|de\s+participation\s+DEEE)/i,
  // GBP "£49.99"
  gbp: /£\s*([\d\s  .,]+)/,
  // USD "$59.99"
  usd: /\$\s*([\d\s  .,]+)/,
  // EUR fallback "999,00€" ou "999,00 €"
  eur: /([\d\s  .,]+)\s*€/,
}

/** Mots-clés qui indiquent un prix de livraison/expédition (à ignorer). */
const SHIPPING_CONTEXT_RE = /(?:livraison|exp[eé]dition|frais\s+de\s+port|shipping)\s*:?\s*([\d\s  .,]+)\s*€/gi

/** Mots-clés indiquant un prix marketplace/partenaire (PAS le prix vendeur principal).
 *  Ex Jardiland : `**Offres partenaires** + **6 offres** à partir de **185,99 €**`
 *  Le 185,99€ est une offre tiers, pas le prix Jardiland (qui est 219,00 €). */
const MARKETPLACE_CONTEXT_RE = /(?:[àa]\s+partir\s+de|offres?\s+partenaires?|marketplace|vendeur\s+tiers?|partenaire|\+\s*\d+\s+offres?)/i

/** Vérifie si un prix EUR à la position `idx` dans `md` est dans un contexte marketplace
 *  (les 250 chars précédents contiennent un mot-clé marketplace). */
function isInMarketplaceContext(md: string, idx: number): boolean {
  const before = md.slice(Math.max(0, idx - 250), idx)
  return MARKETPLACE_CONTEXT_RE.test(before)
}

/** Mots-clés indiquant une bannière marketing globale (pas une vraie réduction sur le produit).
 *  Ex Jardiland : `**FRENCH DAYS : JUSQU'À -70% DE REMISE !**` — campagne site, pas promo produit. */
const MARKETING_BANNER_RE = /(?:jusqu['']?\s*[àa]|[àa]\s+partir\s+de)\s*$/i

/** Vérifie si un `-XX%` à la position `idx` est dans une bannière marketing
 *  (les ~30 chars précédents contiennent "jusqu'à" / "à partir de"). */
function isInMarketingBanner(md: string, idx: number): boolean {
  const before = md.slice(Math.max(0, idx - 30), idx)
  return MARKETING_BANNER_RE.test(before)
}

/**
 * Parse les prix structurés depuis du markdown.
 *
 * @param md  markdown sanitized
 * @param jsonLdPrice  données prix extraites de JSON-LD `offers` (priorité)
 * @returns Pricing ou null si rien trouvé
 */
export function parsePricingFromMarkdown(
  md: string,
  jsonLdPrice?: Partial<Pricing>,
): Pricing | null {
  const result: Pricing = { currency: 'EUR' }
  let found = false

  // 1. Retirer les contextes "livraison" pour ne pas confondre leurs prix
  let cleanMd = md
  for (const m of md.matchAll(SHIPPING_CONTEXT_RE)) {
    cleanMd = cleanMd.replace(m[0], '')
  }

  // 2. Détecter devise (priorité GBP/USD si symboles spécifiques présents)
  if (/£/.test(cleanMd) && !/€/.test(cleanMd)) {
    result.currency = 'GBP'
    const m = cleanMd.match(PRICE_PATTERNS.gbp)
    if (m) {
      const n = parsePriceNumber(m[1])
      if (n != null) { result.ttc = n; found = true }
    }
  } else if (/\$/.test(cleanMd) && !/€/.test(cleanMd)) {
    result.currency = 'USD'
    const m = cleanMd.match(PRICE_PATTERNS.usd)
    if (m) {
      const n = parsePriceNumber(m[1])
      if (n != null) { result.ttc = n; found = true }
    }
  } else {
    // EUR (défaut)

    // HT
    const htM = cleanMd.match(PRICE_PATTERNS.htPrice)
    if (htM) {
      const n = parsePriceNumber(htM[1])
      if (n != null) { result.ht = n; found = true }
    }

    // TTC explicite
    const ttcM = cleanMd.match(PRICE_PATTERNS.ttcPrice)
    if (ttcM) {
      const n = parsePriceNumber(ttcM[1])
      if (n != null) { result.ttc = n; found = true }
    }

    // Prix actuel (Dyson-style)
    const currentM = cleanMd.match(PRICE_PATTERNS.current)
    if (currentM && result.ttc == null) {
      const n = parsePriceNumber(currentM[1])
      if (n != null) { result.ttc = n; found = true }
    }

    // Prix barré / origine
    const originalM = cleanMd.match(PRICE_PATTERNS.original)
    if (originalM) {
      const n = parsePriceNumber(originalM[1])
      if (n != null) { result.original = n; found = true }
    }

    // Réduction (montant)
    const discAmtM = cleanMd.match(PRICE_PATTERNS.discountAmount)
    if (discAmtM) {
      const n = parsePriceNumber(discAmtM[1])
      if (n != null) {
        result.discount = { ...result.discount, amount: n }
        found = true
      }
    }

    // Réduction (pourcentage)
    // Itère et skippe les bannières marketing globales (`JUSQU'À -70%`, `à partir de -50%`)
    // qui ne reflètent pas une vraie promo produit.
    for (const m of cleanMd.matchAll(PRICE_PATTERNS.discountPercent)) {
      const idx = m.index ?? 0
      if (isInMarketingBanner(cleanMd, idx)) continue
      const n = parsePriceNumber(m[1])
      if (n != null) {
        result.discount = { ...result.discount, percent: n }
        found = true
        break
      }
    }

    // Éco-participation
    const ecoM = cleanMd.match(PRICE_PATTERNS.ecoPart)
    if (ecoM) {
      const n = parsePriceNumber(ecoM[1])
      if (n != null) { result.ecoParticipation = n; found = true }
    }

    // Fallback : prix EUR seul si aucun TTC encore trouvé.
    // (Une réduction % seule ne dispense pas de chercher le prix réel —
    // sinon une bannière marketing "-70%" suffit à shunter l'extraction du prix.)
    // Itère tous les matchs et skip ceux dans contexte marketplace
    // (Jardiland-style : "à partir de", "Offres partenaires", "+ N offres").
    if (result.ttc == null) {
      const eurMatches = [...cleanMd.matchAll(/([\d\s  .,]+)\s*€/g)]
      for (const m of eurMatches) {
        const idx = m.index ?? 0
        if (isInMarketplaceContext(cleanMd, idx)) continue
        const n = parsePriceNumber(m[1])
        if (n != null && n > 0) {
          result.ttc = n
          found = true
          break
        }
      }
    }
  }

  // 3. Merge JSON-LD (priorité absolue)
  if (jsonLdPrice) {
    if (jsonLdPrice.ttc != null) { result.ttc = jsonLdPrice.ttc; found = true }
    if (jsonLdPrice.ht != null) { result.ht = jsonLdPrice.ht; found = true }
    if (jsonLdPrice.original != null) { result.original = jsonLdPrice.original }
    if (jsonLdPrice.currency) result.currency = jsonLdPrice.currency
    if (jsonLdPrice.validUntil) { result.validUntil = jsonLdPrice.validUntil; found = true }
    if (jsonLdPrice.discount) result.discount = jsonLdPrice.discount
    if (jsonLdPrice.ecoParticipation != null) result.ecoParticipation = jsonLdPrice.ecoParticipation
  }

  return found ? result : null
}
