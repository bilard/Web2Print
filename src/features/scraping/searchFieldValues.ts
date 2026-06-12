import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'

/**
 * Résout la valeur d'un champ demandé en langage naturel dans le prompt de
 * recherche (« prix de vente », « EAN », « référence »…) sur un produit enrichi.
 * Matching sémantique générique (concepts produit universels), PAS de logique
 * par enseigne. Fallback : recherche du libellé dans les spécifications.
 */

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "")
}

function formatPrice(n: number, currency: string): string {
  try {
    return n.toLocaleString('fr-FR', { style: 'currency', currency: currency || 'EUR' })
  } catch {
    return `${n} ${currency || '€'}`
  }
}

function hostOf(url: string | null): string {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function promoValue(p: EnrichedProduct): string {
  const pr = p.pricing
  if (!pr) return ''
  const parts: string[] = []
  if (pr.original != null) parts.push(`avant : ${formatPrice(pr.original, pr.currency)}`)
  if (pr.discount?.percent != null) parts.push(`−${pr.discount.percent}%`)
  else if (pr.discount?.amount != null) parts.push(`−${formatPrice(pr.discount.amount, pr.currency)}`)
  if (pr.validUntil) parts.push(`jusqu'au ${pr.validUntil.slice(0, 10)}`)
  return parts.join(' · ')
}

function priceValue(p: EnrichedProduct): string {
  const pr = p.pricing
  if (pr?.ttc != null) return formatPrice(pr.ttc, pr.currency)
  if (pr?.ht != null) return `${formatPrice(pr.ht, pr.currency)} HT`
  if (typeof p.price === 'number') return formatPrice(p.price, pr?.currency ?? 'EUR')
  if (typeof p.price === 'string') return p.price
  return ''
}

/** Valeur du champ `field` (texte libre du prompt) pour le produit `p`. '' si introuvable. */
export function resolveFieldValue(field: string, p: EnrichedProduct): string {
  const f = normalize(field)
  if (/site|source|enseigne|magasin|vendeur|boutique/.test(f)) return hostOf(p.sourceUrl)
  if (/\bean\b|gtin|code.?barre/.test(f)) return p.ean ?? ''
  if (/ref|sku|\bmpn\b/.test(f)) return p.distributorRef ?? p.manufacturerRef ?? p.model ?? ''
  if (/promo|remise|solde|reduc|barre|discount/.test(f)) return promoValue(p)
  if (/prix|price|tarif|cout|coût/.test(f)) return priceValue(p)
  if (/marque|brand|fabricant/.test(f)) return p.brand ?? ''
  if (/modele|model|designation/.test(f)) return p.model ?? ''
  if (/nom|titre|name|produit|intitule/.test(f)) return p.name ?? ''
  if (/description|descriptif|resume/.test(f)) return p.description ?? ''
  // Fallback générique : chercher une spécification dont le nom matche le champ.
  const spec = p.specifications.find((s) => normalize(s.name).includes(f) || f.includes(normalize(s.name)))
  return spec?.value ?? ''
}
