/**
 * Parser dédié Milwaukee (milwaukeetool.eu / fr.milwaukeetool.eu) — SPA Relay/Next.
 *
 * Limite connue : les caractéristiques techniques NE SONT PAS rendues dans le
 * HTML initial. Elles proviennent d'un endpoint Relay/REST appelé client-side
 * (ex: `/api/product-detail/product-specifications`). Ce parser extrait donc
 * uniquement ce qui est présent dans le DOM SSR : titre, description,
 * avantages marketing (ProductFeaturesTextstyles), images, PDF d'utilisation
 * et références de variantes détectées dans le DOM.
 *
 * Pour obtenir les specs complètes, le pipeline doit laisser le LLM enrichir
 * via markdown Jina (qui lui rend la page côté navigateur) OU appeler l'API
 * interne Milwaukee en amont.
 */

import type { EnrichedSpec, ProductVariant } from '../types'

export interface MilwaukeeParsed {
  title: string
  description: string
  advantages: string[]
  specifications: EnrichedSpec[]
  variants: ProductVariant[]
  images: string[]
  heroImage: string
  documents: string[]
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function parseMilwaukeeProduct(html: string, pageUrl: string): MilwaukeeParsed {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // ── Titre : H1 ProductDetailsContentstyles ────────────────────────────
  const title =
    textOf(doc.querySelector('h1[class*="ProductDetailsContent"]')) ||
    textOf(doc.querySelector('h1')) ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || ''

  // ── Description ────────────────────────────────────────────────────────
  const description =
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || ''

  // ── Avantages : li.ProductFeaturesTextstyles__Feature ─────────────────
  const advantages: string[] = []
  doc.querySelectorAll('li[class*="ProductFeaturesText"]').forEach(li => {
    const t = textOf(li)
    if (t.length >= 10 && t.length <= 500) advantages.push(t)
  })

  // ── Specs : indisponibles en HTML SSR (Relay API côté client) ─────────
  const specifications: EnrichedSpec[] = []

  // ── Variantes : références de type "M18 FPD3-0X" détectées dans le DOM ─
  // On cible les nœuds contenant explicitement la référence (h3/h4/span
  // des cartes "autres modèles de la famille").
  const variants: ProductVariant[] = []
  const seenRef = new Set<string>()
  const text = doc.body?.textContent ?? ''
  const variantRe = /\b(M\s?\d{2,3}\s+[A-Z]{1,5}\d{0,4}(?:-[A-Z0-9]{1,6}){0,2})\b/g
  let m: RegExpExecArray | null
  while ((m = variantRe.exec(text)) !== null) {
    const ref = m[1].replace(/\s+/g, ' ').trim()
    if (seenRef.has(ref)) continue
    seenRef.add(ref)
    variants.push({ reference: ref, label: ref, properties: {} })
    if (variants.length >= 20) break
  }

  // ── Images ──────────────────────────────────────────────────────────────
  const images = new Set<string>()
  const heroImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() || ''
  // L'og:image de Milwaukee est générique (Facebook tile). On le garde en
  // fallback mais on tente d'abord de trouver une vraie image produit.
  doc.querySelectorAll('img[src], img[data-src]').forEach(img => {
    const raw = img.getAttribute('src') || img.getAttribute('data-src') || ''
    if (!raw) return
    let resolved: string
    try { resolved = new URL(raw, pageUrl).toString() } catch { return }
    if (!/milwaukee/i.test(resolved)) return
    if (/logo|sprite|icon|placeholder|homepage/i.test(resolved)) return
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(resolved)) return
    images.add(resolved)
  })
  // Meilleur hero : première image produit spécifique (FPDxxx / ref) ou og
  let bestHero = heroImage
  for (const u of images) {
    if (/Hero/i.test(u)) { bestHero = u; break }
  }
  if (bestHero && !images.has(bestHero)) images.add(bestHero)

  // ── Documents PDF ──────────────────────────────────────────────────────
  const documents = new Set<string>()
  const seen = new Set<string>()
  doc.querySelectorAll('a[href*=".pdf" i]').forEach(a => {
    const href = a.getAttribute('href') ?? ''
    if (!href || href === '#') return
    let resolved: string
    try { resolved = new URL(href, pageUrl).toString() } catch { return }
    if (!/\.pdf($|\?)/i.test(resolved)) return
    if (seen.has(resolved)) return
    seen.add(resolved)
    const linkText = textOf(a)
    const download = a.getAttribute('download') ?? ''
    const filename = resolved.split('/').pop()?.replace(/\.pdf.*$/i, '') ?? ''
    const cleanName = (linkText && linkText.length >= 3 && linkText.length <= 120)
      ? linkText
      : (download && download.length >= 3)
        ? download.replace(/\.pdf$/i, '')
        : decodeURIComponent(filename).replace(/[_-]+/g, ' ').trim() || 'Notice'
    documents.add(`${cleanName}##${resolved}`)
  })

  return {
    title,
    description,
    advantages,
    specifications,
    variants,
    images: Array.from(images),
    heroImage: bestHero,
    documents: Array.from(documents),
  }
}
