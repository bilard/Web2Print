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
  // ES: "precio de venta : 999,00€" / "precio especial"
  current_es: /precio\s+(?:de\s+venta|final|especial|cliente|oferta)\s*:?\s*\n?\s*([\d\s  .,]+)\s*€/i,
  // "prix d'origine : 1 199,00€" / "était 1 199,00€"
  original: /(?:prix\s+d['']origine|était|barré|barr[eé])\s*:?\s*\n?\s*([\d\s  .,]+)\s*€/i,
  // ES: "precio habitual : 1 199,00€" / "precio sin descuento" / "antes"
  original_es: /(?:precio\s+(?:habitual|original|sin\s+descuento|de\s+lista|cat[aá]logo|normal|pvp)|antes)\s*:?\s*\n?\s*([\d\s  .,]+)\s*€/i,
  // "Économisez 200,00€"
  discountAmount: /[Éé]conomis[eéè]z?\s+([\d\s  .,]+)\s*€/i,
  // ES: "Ahorras 100,00€" / "Descuento 50,00€"
  discountAmount_es: /(?:ahorra[sz]?|descuento)\s+([\d\s  .,]+)\s*€/i,
  // Markdown strikethrough "~~367,49 €~~" → prix barré (avant promo)
  originalStrike: /~~\s*([\d  .,]+)\s*€\s*~~/i,
  // "-137,50 €" / "−137,50€" — réduction en montant signée (≥ 3 caractères
  // chiffres pour éviter "-1€" ambigu ; le pattern % est traité séparément).
  discountAmountSigned: /(?<![.,\d])[-−]\s*(\d[\d  .,]{2,})\s*€/g,
  // "-17%" ou "(-17%)" — itérée avec exclusion bannières marketing
  discountPercent: /[-−]\s*(\d{1,2})\s*%/g,
  // "1 449,00 € HT"
  htPrice: /(\d[\d\s  .,]*)\s*€[^\w€]{0,12}HT\b/i,
  // "1 738,80 € TTC"
  ttcPrice: /(\d[\d\s  .,]*)\s*€[^\w€]{0,12}TTC\b/i,
  // "Dont 3,40€ d'éco-participation" / "dont 2,50 € de participation DEEE"
  ecoPart: /(?:dont|y\s+compris)\s+([\d\s  .,]+)\s*€\s*(?:d['']?[ée]co[\s-]?participation|[ée]co[\s-]?part\b|de\s+participation\s+DEEE)/i,
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

  // 0. Pré-nettoyage : retirer les markers markdown bold/italic et balises HTML
  //    inline (sup/sub/strong/b/em/i) qui s'intercalent entre les digits, le `€`
  //    et les labels HT/TTC. Sans ce nettoyage, des sorties Turndown comme
  //    `**414,20** €^HT^` empêchent la regex `(\d…)\s*€…HT` de matcher.
  let cleanMd = md
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/<\/?(?:sup|sub|strong|b|em|i|span)\b[^>]*>/gi, '')

  // 1. Retirer les contextes "livraison" pour ne pas confondre leurs prix
  for (const m of cleanMd.matchAll(SHIPPING_CONTEXT_RE)) {
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

    // ES: "precio de venta"
    if (result.ttc == null) {
      const currentEsM = cleanMd.match(PRICE_PATTERNS.current_es)
      if (currentEsM) {
        const n = parsePriceNumber(currentEsM[1])
        if (n != null) { result.ttc = n; found = true }
      }
    }

    // Prix barré / origine — par mot-clé "était / prix d'origine / barré"
    const originalM = cleanMd.match(PRICE_PATTERNS.original)
    if (originalM) {
      const n = parsePriceNumber(originalM[1])
      if (n != null) { result.original = n; found = true }
    }

    // ES: "precio habitual / precio original / antes"
    if (result.original == null) {
      const originalEsM = cleanMd.match(PRICE_PATTERNS.original_es)
      if (originalEsM) {
        const n = parsePriceNumber(originalEsM[1])
        if (n != null) { result.original = n; found = true }
      }
    }

    // Prix barré — strikethrough markdown `~~367,49 €~~` (Jardiland & co)
    // Retire la section du cleanMd pour ne pas confondre ce prix barré avec
    // le prix TTC réel dans le fallback EUR plus bas.
    if (result.original == null) {
      const strikeM = cleanMd.match(PRICE_PATTERNS.originalStrike)
      if (strikeM) {
        const n = parsePriceNumber(strikeM[1])
        if (n != null) { result.original = n; found = true }
        cleanMd = cleanMd.replace(strikeM[0], ' ')
      }
    }

    // Heuristique deux prix adjacents : `229,99 €367,49 €` (Jardiland sans
    // strikethrough HTML — Jina ne préserve pas le `<del>`/CSS line-through).
    // Gère les deux ordres : prix_actuel puis barré (p2>p1) ET barré puis
    // prix_actuel (p1>p2, style Leroy Merlin : 585,90 € → 285,14 €).
    if (result.ttc == null && result.original == null) {
      const adjM = cleanMd.match(/(\d[\d   .,]*)\s*€\s*(\d[\d   .,]*)\s*€/)
      if (adjM) {
        const p1 = parsePriceNumber(adjM[1])
        const p2 = parsePriceNumber(adjM[2])
        if (p1 != null && p2 != null && p1 > 0 && p2 > 0 && Math.abs(p1 - p2) > 0.01) {
          result.ttc = Math.min(p1, p2)
          result.original = Math.max(p1, p2)
          found = true
          cleanMd = cleanMd.replace(adjM[0], ' ')
        }
      }
    }

    // Inférence HT depuis 2 prix juxtaposés. Stratégie 2 paliers :
    //   1. Fenêtre locale (250 chars autour du match TTC) — préfère les prix
    //      adjacents physiquement (cas typique : "414,20 € HT\n497,04 € TTC").
    //   2. Fallback global : si rien dans la fenêtre, cherche dans tout le doc
    //      un € avec ratio TVA plausible (TTC/HT entre 1.05 et 1.25) — couvre
    //      les pages où HT et TTC sont rendus dans des sections séparées.
    // Couvre le cas où turndown perd les superscripts `<sup>HT</sup>` /
    // labels HT/TTC parfois absents après conversion HTML→markdown.
    if (result.ttc != null && result.ht == null) {
      const ttcM = cleanMd.match(PRICE_PATTERNS.ttcPrice)
      const fallbackTtcIdx = ttcM?.index
      const anchorIdx = fallbackTtcIdx ?? cleanMd.search(/\d[\d\s.,]*\s*€/)
      const inTvaRange = (n: number) => n < result.ttc! && result.ttc! / n >= 1.05 && result.ttc! / n <= 1.25

      // Palier 1 : fenêtre locale 250 chars
      let htCandidate: number | undefined
      if (anchorIdx >= 0) {
        const window = cleanMd.slice(Math.max(0, anchorIdx - 250), anchorIdx + 250)
        const local = [...window.matchAll(/(\d[\d\s.,]+)\s*€/g)]
          .map((m) => parsePriceNumber(m[1]))
          .filter((n): n is number => n != null && n > 0 && Math.abs(n - result.ttc!) > 0.01)
          .filter(inTvaRange)
          .sort((a, b) => b - a)
        htCandidate = local[0]
      }

      // Palier 2 : fallback global sur tout le markdown
      if (htCandidate == null) {
        const global = [...cleanMd.matchAll(/(\d[\d\s.,]+)\s*€/g)]
          .map((m) => parsePriceNumber(m[1]))
          .filter((n): n is number => n != null && n > 0 && Math.abs(n - result.ttc!) > 0.01)
          .filter(inTvaRange)
          .sort((a, b) => b - a)
        htCandidate = global[0]
      }

      if (htCandidate != null) {
        result.ht = htCandidate
        found = true
      }
    }

    // Réduction (montant) — par mot-clé "Économisez X €"
    const discAmtM = cleanMd.match(PRICE_PATTERNS.discountAmount)
    if (discAmtM) {
      const n = parsePriceNumber(discAmtM[1])
      if (n != null) {
        result.discount = { ...result.discount, amount: n }
        found = true
      }
    }

    // ES: "Ahorras X €"
    if (result.discount?.amount == null) {
      const discAmtEsM = cleanMd.match(PRICE_PATTERNS.discountAmount_es)
      if (discAmtEsM) {
        const n = parsePriceNumber(discAmtEsM[1])
        if (n != null) { result.discount = { ...result.discount, amount: n }; found = true }
      }
    }

    // Réduction (montant) — signé négatif `-137,50 €` (Jardiland & co)
    // Skip les bannières marketing et les contextes shipping (déjà filtrés via cleanMd).
    // Retire le match du cleanMd pour ne pas confondre ce montant avec un prix TTC.
    if (result.discount?.amount == null) {
      for (const m of cleanMd.matchAll(PRICE_PATTERNS.discountAmountSigned)) {
        const idx = m.index ?? 0
        if (isInMarketingBanner(cleanMd, idx)) continue
        const n = parsePriceNumber(m[1])
        if (n != null && n > 0) {
          result.discount = { ...result.discount, amount: n }
          found = true
          cleanMd = cleanMd.replace(m[0], ' ')
          break
        }
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

  // Diagnostic — visible dans la console DevTools, utile pour comprendre
  // pourquoi un prix manque sur un site spécifique.
  if (found) {
    console.log('[parsePricing] result:', {
      ttc: result.ttc, ht: result.ht, original: result.original,
      currency: result.currency,
      discount: result.discount, eco: result.ecoParticipation,
    })
  } else {
    // Log un échantillon de la fenêtre prix pour debug
    const eurMatches = [...cleanMd.matchAll(/(\d[\d\s.,]*)\s*€/g)].slice(0, 5).map(m => m[0])
    console.log('[parsePricing] no price detected. €-matches sample:', eurMatches)
  }

  return found ? result : null
}
