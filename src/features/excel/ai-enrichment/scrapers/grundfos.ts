/**
 * Parser dédié Grundfos (product-selection.grundfos.com) — AEM / Adobe.
 *
 * Structure DOM cible (onglet Spécifications actif) :
 *   <h1 data-qa="myGrundfos-listPriceWidget-verifyProductNumberGPC"
 *       class="cmp-catalogue-hero__heading"> ALPHA1 GO 25-40 130 </h1>
 *   <p class="cmp-catalogue-hero__product-number"> Numéro 93074186 </p>
 *   <h1 data-qa="heading-specifications">Spécifications</h1>
 *   <table data-qa="table-specifications">
 *     <tr data-qa="table-row-U">
 *       <td title="Tension nominale">Tension nominale</td>
 *       <td data-qa="table-row-old-U">220-240 V</td>
 *     </tr>…
 *   </table>
 */

import type { EnrichedSpec, ProductVariant } from '../types'

export interface GrundfosParsed {
  title: string
  description: string
  advantages: string[]
  specifications: EnrichedSpec[]
  variants: ProductVariant[]
  images: string[]
  heroImage: string
  documents: string[]
  productNumber: string
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function parseGrundfosProduct(html: string, pageUrl: string): GrundfosParsed {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // ── Titre : h1.cmp-catalogue-hero__heading ──────────────────────────────
  const heroH1 =
    doc.querySelector('h1.cmp-catalogue-hero__heading') ||
    doc.querySelector('h1[data-qa*="ProductNumber"]') ||
    doc.querySelector('h1')
  let title = textOf(heroH1)
  // Strip trailing " ALPHA1 GO 25-40 130 - 93074186" meta content duplication
  title = title.split(/\s{2,}/)[0].trim() || title
  if (!title) {
    title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || ''
  }

  // ── Numéro produit ──────────────────────────────────────────────────────
  const productNumberRaw =
    textOf(doc.querySelector('.cmp-catalogue-hero__product-number')) ||
    doc.querySelector('meta[itemprop="productID"]')?.getAttribute('content')?.trim() || ''
  const pnMatch = productNumberRaw.match(/\b(\d{6,12})\b/)
  const productNumber = pnMatch ? pnMatch[1] : ''

  // ── Description : meta og:description ──────────────────────────────────
  const description =
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || ''

  // ── Avantages : section bénéfices / unique selling points ──────────────
  const advantages: string[] = []
  doc.querySelectorAll('.cmp-benefits__item, .cmp-unique-selling-points li, .cmp-description li').forEach(li => {
    const t = textOf(li)
    if (t.length >= 10 && t.length <= 400) advantages.push(t)
  })

  // ── Specs : table[data-qa="table-specifications"] ──────────────────────
  const specifications: EnrichedSpec[] = []
  doc.querySelectorAll('table[data-qa="table-specifications"] tr').forEach(tr => {
    // Sauter l'en-tête (th)
    if (tr.querySelector('th')) return
    const tds = tr.querySelectorAll('td')
    if (tds.length < 2) return
    // Nom = title attr (fallback text)
    const nameFromAttr = tds[0].getAttribute('title')?.trim() ?? ''
    const name = nameFromAttr || textOf(tds[0])
    const value = textOf(tds[1])
    if (!name || !value || name.length > 100 || value.length > 300) return
    specifications.push({ name, value, group: 'Spécifications' })
  })

  // ── Variantes : la fiche produit est déjà une variante unique ──────────
  const variants: ProductVariant[] = []
  if (productNumber) {
    variants.push({
      reference: productNumber,
      label: title || productNumber,
      properties: {},
    })
  }

  // ── Images ──────────────────────────────────────────────────────────────
  const images = new Set<string>()
  // og:image peut être vide → fallback sur l'API imaging Grundfos
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ?? ''
  let heroImage = ogImage
  if ((!heroImage || heroImage.length < 10) && productNumber) {
    heroImage = `https://api.grundfos.com/gpi/imaging/product?productnumber=${productNumber}&w=600&h=450`
  }
  if (heroImage) images.add(heroImage)
  doc.querySelectorAll('img[src], img[data-src]').forEach(img => {
    const raw = img.getAttribute('src') || img.getAttribute('data-src') || ''
    if (!raw) return
    let resolved: string
    try { resolved = new URL(raw, pageUrl).toString() } catch { return }
    if (!/grundfos/i.test(resolved)) return
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(resolved) && !/imaging\//i.test(resolved)) return
    if (/logo|sprite|icon|placeholder|sdcs|topbar|megamenu/i.test(resolved)) return
    images.add(resolved)
  })

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
    const filename = resolved.split('/').pop()?.replace(/\.pdf.*$/i, '') ?? ''
    const cleanName = linkText && linkText.length >= 3 && linkText.length <= 120
      ? linkText
      : decodeURIComponent(filename).replace(/[_-]+/g, ' ').trim() || 'Document'
    documents.add(`${cleanName}##${resolved}`)
  })

  return {
    title,
    description,
    advantages,
    specifications,
    variants,
    images: Array.from(images),
    heroImage,
    documents: Array.from(documents),
    productNumber,
  }
}
