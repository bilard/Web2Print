import type { EnrichedProduct, EnrichedSpec, EnrichedAdvantage } from './types'

/**
 * Sanitization minimaliste appliquée à TOUTE EnrichedProduct au chargement
 * (fresh enrichissement OU rehydration depuis Firestore). Idempotent.
 *
 * Cible les patterns parasites issus du LLM qui passent à travers le filtrage
 * markdown :
 *  - description = navigation/footer du site (Nos services, Le blog, Aide & Contact)
 *  - description = métadonnées concaténées (Code commande RS:… Référence:…)
 *  - specs avec name = checkbox marker `- [x]` ou prose
 *  - specs avec value = pricing / UI button
 *  - specs avec group = nom de section H2 récupéré par erreur
 *  - advantages avec group = fragment ("ET avantages", "OU caractéristiques")
 *
 * Garantie : ne modifie jamais une donnée propre. Fonction pure et testable.
 */

const NAV_TERMS_RE = /(nos\s+services?|le\s+blog(?:\s*RS)?|aide\s*&\s*contact|mentions?\s+l[eé]gales?|politique\s+de\s+(?:confidentialit[eé]|cookies?|protection)|centre\s+d['’]aide|mon\s+compte|se\s+connecter|s['’]identifier|s['’]enregistrer|newsletter|carri[eè]re|contactez[\s-]nous|[àa]\s+propos|secteurs?\s+industriels?|suivez[\s-]nous|mon\s+panier|liste\s+de\s+souhaits|suivi\s+de\s+colis|voir\s+le\s+panier)/gi

const METADATA_LINE_RE = /^[^.]*?\b(code\s+commande|r[eé]f[eé]rence\s+fabricant|num[eé]ro\s+(de\s+)?(?:s[eé]rie|article)|sku|ean|gtin|code[\s-]?barres?)\s*:/i

const CHECKBOX_MARKER_RE = /^\s*[-*•]?\s*\[[xX✓✔ ]?\]\s*$/

const FRAGMENT_GROUP_RE = /^\s*(et|ou|and|or|&|\+)\s+\S/i

/** Sections de description H2 que le LLM utilise par erreur comme spec.group. */
const SECTION_AS_GROUP_RE = /^(caract[eé]ristiques?\s+et\s+avantages?|applications?|points?\s+forts?|features?|advantages?|d[eé]tail\s+produit|description|faq|questions?(\s+fr[eé]quentes?)?)$/i

export function isNavLikeDescription(text: string): boolean {
  if (!text || text.length < 20) return false
  const matches = text.match(NAV_TERMS_RE)
  if (matches && matches.length >= 2) return true
  if (matches && matches.length >= 1) {
    const words = text.split(/\s+/).filter(Boolean).length
    if (words < 30) return true
  }
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean)
  if (lines.length > 0 && lines.every(l => METADATA_LINE_RE.test(l))) return true
  return false
}

function isJunkSpec(s: EnrichedSpec): boolean {
  const name = s.name?.trim() ?? ''
  const value = s.value?.trim() ?? ''
  if (!name) return true
  if (CHECKBOX_MARKER_RE.test(name)) return true
  // Quantity tier indicator (RS pricing : "1 +", "10 +", "100 +")
  if (/^\d+\s*\+\s*$/.test(name)) return true
  // Real spec names are 1-5 words, < 60 chars. Au-delà c'est de la prose.
  if (name.length > 60) return true
  if (/[.!?]$/.test(name) && name.length > 25) return true
  if (/^[•▪►▶]\s/.test(name) || /^[•▪►▶]\s/.test(value)) return true
  // Pricing leak (value contient seulement chiffres/séparateurs + devise)
  if (/^\s*[\d\s.,]+\s*[€$£]\s*$/.test(value)) return true
  // UI button leak
  if (/(cliquez\s+sur|v[eé]rifier\s+les|ajouter\s+au\s+panier)/i.test(value) && value.length > 30) return true
  // Group = nom de section description
  const groupClean = s.group?.replace(/^\*+|\*+$/g, '').trim()
  if (groupClean && SECTION_AS_GROUP_RE.test(groupClean)) return true
  return false
}

function cleanAdvantage(a: EnrichedAdvantage): EnrichedAdvantage {
  if (a.group && FRAGMENT_GROUP_RE.test(a.group)) {
    const { group: _g, ...rest } = a
    return rest
  }
  return a
}

/**
 * Applique l'ensemble des règles défensives sur un EnrichedProduct.
 * Idempotent — peut être appelé sur des données fraîchement enrichies ou
 * sur des données rechargées depuis Firestore (cas legacy avec données
 * polluées extraites avant le strip pré-LLM).
 */
export function sanitizeEnrichedProduct(product: EnrichedProduct): EnrichedProduct {
  let description = product.description ?? ''
  if (description && isNavLikeDescription(description)) description = ''

  const specifications = (product.specifications ?? []).filter(s => !isJunkSpec(s))
  const advantages = (product.advantages ?? []).map(cleanAdvantage)

  return { ...product, description, specifications, advantages }
}
