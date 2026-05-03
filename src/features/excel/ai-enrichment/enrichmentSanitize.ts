import type { EnrichedProduct, EnrichedSpec, EnrichedAdvantage } from './types'
import { isJunkImageUrl } from './imageFilter'

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

  // Filtre les images junk au reload Firestore — couvre les données enregistrées
  // avant l'extension du filtre `isJunkImageUrl` (mégamenu Drupal Nicoll, etc.).
  const images = (product.images ?? []).filter(u => typeof u === 'string' && u.startsWith('http') && !isJunkImageUrl(u))

  return { ...product, description, specifications, advantages, images }
}

/**
 * Extrait le paragraphe en prose le plus long d'un markdown — utilisé en
 * fallback quand le LLM rend une description vide ou trop courte.
 *
 * Logique : on parcourt les paragraphes (séparés par lignes vides), on rejette
 * ceux qui contiennent des liens markdown, des bullets, des tables, des
 * métadonnées ou de la nav. On retourne le plus long ≥ 80 chars qui ressemble
 * à de la prose descriptive (commence par majuscule, contient au moins 2
 * phrases ou ≥ 100 chars).
 */
export function extractLongestProseParagraph(md: string): string {
  if (!md) return ''
  const paragraphs = md.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)

  const isProse = (p: string): boolean => {
    if (p.length < 80) return false
    if (p.startsWith('#') || p.startsWith('|') || p.startsWith('-') || p.startsWith('*')) return false
    if (/^[•▪►▶]/.test(p)) return false
    if (p.startsWith('!')) return false
    if (/^https?:\/\//.test(p)) return false
    // Pas de markdown link au début (souvent des titles cliquables)
    if (/^\[/.test(p)) return false
    // Métadonnées concentrées (Code commande, Référence:, etc.)
    if (/^(code\s+commande|r[eé]f[eé]rence|sku|ean|gtin|brand|marque)\s*[:=]/i.test(p)) return false
    // Cookie / GDPR / privacy banner — souvent des paragraphes longs en
    // français qui ressemblent à de la prose mais sont du juridique.
    if (/\b(cookies?|privacy|recaptcha|consent|fonctionnalit[eé]s?\s+(?:du\s+)?site|exp[eé]rience\s+client|paramétrer|accepter|refuser|technologies\s+essentielles)\b/i.test(p)) return false
    // Doit ressembler à de la prose : commence par majuscule, contient un verbe
    // (heuristique : la 1re ligne contient un mot ≥ 5 chars).
    const firstLine = p.split('\n')[0]
    if (!/^[A-ZÀ-Ÿ]/.test(firstLine)) return false
    if (firstLine.length < 30 && !p.includes('\n')) return false
    if (isNavLikeDescription(p)) return false
    return true
  }

  const candidates = paragraphs.filter(isProse)
  if (candidates.length === 0) return ''
  // Plus long en premier
  candidates.sort((a, b) => b.length - a.length)
  // Limite raisonnable (évite les blocs FAQ entiers)
  const longest = candidates[0]
  return longest.length > 2000 ? longest.slice(0, 2000) + '…' : longest
}
