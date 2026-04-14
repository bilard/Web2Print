/**
 * Parser dédié Bosch Professional (bosch-professional.com).
 *
 * Structure DOM cible (rendue SSR) :
 *   <h1 class="bba bba--hl4">Perceuse-visseuse PRO HEAVY DUTY GSR 18V-110 C</h1>
 *   <div class="o-gt-stage__info">
 *     <ul><li class="bba bba--medium">Avantage 1</li>…</ul>
 *   </div>
 *   <div class="table__heading"><h3>Données les plus importantes</h3></div>
 *   <div class="table__body-row">
 *     <div class="table__body-cell"><span>Couple…</span></div>
 *     <div class="table__body-cell"><span>47/85/110 Nm</span></div>
 *   </div>
 */

import type { EnrichedSpec, ProductVariant } from '../types'

export interface BoschParsed {
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

export function parseBoschProduct(html: string, pageUrl: string): BoschParsed {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // ── Titre ───────────────────────────────────────────────────────────────
  const title =
    textOf(doc.querySelector('h1.bba.bba--hl4')) ||
    textOf(doc.querySelector('h1')) ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.title.replace(/\s*\|.*$/, '').trim()

  // ── Description ─────────────────────────────────────────────────────────
  const description =
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
    ''

  // ── Avantages (USPs) ────────────────────────────────────────────────────
  // La liste marketing se trouve dans .o-gt-stage__info (bloc hero).
  const advantages: string[] = []
  doc.querySelectorAll('.o-gt-stage__info ul li.bba--medium').forEach(li => {
    const t = textOf(li)
    if (t.length >= 10 && t.length <= 400) advantages.push(t)
  })

  // ── Specs : table__body-row avec 2 cellules ─────────────────────────────
  // Le groupe = h3 de la table__heading précédente (ex: "Données les plus
  // importantes"). Une page peut avoir plusieurs sections.
  const specifications: EnrichedSpec[] = []
  let currentGroup = 'Caractéristiques techniques'
  // On parcourt tous les nœuds intéressants (headings + rows) dans l'ordre.
  const specContainers = doc.querySelectorAll(
    'div.table__heading h3, div.table__body-row'
  )
  specContainers.forEach(node => {
    if (node.tagName === 'H3') {
      const h3 = textOf(node)
      if (h3 && h3.length <= 80) currentGroup = h3
      return
    }
    const cells = node.querySelectorAll(':scope > .table__body-cell')
    if (cells.length < 2) return
    const name = textOf(cells[0])
    const value = textOf(cells[1])
    if (!name || !value || name === value) return
    if (name.length > 120 || value.length > 300) return
    specifications.push({ name, value, group: currentGroup })
  })

  // ── Variantes : non exposées en liste sur la fiche (SKU unique). ─────────
  // On expose au moins le SKU courant si détecté via URL ou trackingElement.
  const variants: ProductVariant[] = []
  const skuMatch = pageUrl.match(/([0-9A-Z]{10,})\/?$/i) || pageUrl.match(/-([0-9A-Z]{10,})\b/i)
  if (skuMatch) {
    variants.push({ reference: skuMatch[1].toUpperCase(), label: title || skuMatch[1], properties: {} })
  }

  // ── Images ──────────────────────────────────────────────────────────────
  const images = new Set<string>()
  const heroImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')?.trim() ||
    ''
  if (heroImage) images.add(heroImage)
  doc.querySelectorAll('img[src], img[data-src], source[srcset]').forEach(img => {
    const raw = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('srcset') || ''
    // srcset peut contenir plusieurs URLs séparées par virgule
    const first = raw.split(',')[0]?.trim().split(' ')[0] ?? ''
    if (!first) return
    let resolved: string
    try { resolved = new URL(first, pageUrl).toString() } catch { return }
    if (!/bosch|ocsmedia|boschmediaservice/i.test(resolved)) return
    if (/sprite|logo|icon|button|placeholder|badge|award/i.test(resolved)) return
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(resolved)) return
    images.add(resolved)
  })

  // ── Documents PDF (href non vide uniquement) ────────────────────────────
  const documents = new Set<string>()
  doc.querySelectorAll('a[href*=".pdf" i]').forEach(a => {
    const href = a.getAttribute('href') ?? ''
    if (!href || href === '#') return
    let resolved: string
    try { resolved = new URL(href, pageUrl).toString() } catch { return }
    if (!/\.pdf($|\?)/i.test(resolved)) return
    // Titre : data-track_dyn_document_title > texte lien > nom fichier
    const track = a.getAttribute('data-track_dyn_document_title') ?? ''
    const linkText = textOf(a)
    const filename = resolved.split('/').pop()?.replace(/\.pdf.*$/i, '') ?? ''
    const cleanName = (track && track.length >= 3)
      ? track.replace(/\.pdf$/i, '')
      : (linkText && linkText.length >= 3 && linkText.length <= 120)
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
  }
}
