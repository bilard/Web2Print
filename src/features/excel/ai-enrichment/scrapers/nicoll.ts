/**
 * Parser dédié Nicoll (nicoll.fr) — site Drupal.
 *
 * Structure DOM cible :
 *   <h1> Caniveau avec grille acier heel - C250 - L100 int Kenadrain</h1>
 *   <h2 class="chapo"> Caniveau permettant de collecter les eaux de pluie…</h2>
 *   <h2 class="titre-item">Descriptif technique</h2>
 *     <div class="content">
 *       <table><tr><td>Largeur intérieure</td><td>100 mm</td></tr>…</table>
 *     </div>
 *   <h2 class="titre-item">Références</h2>
 *     <table data-striping="1">
 *       <tr data-variation-id="42622">
 *         <td><span class="field_ref_nicoll">DR100CH</span></td>
 *         <td><span class="attribute_field_label">1m caniv.100 hd…</span></td>
 *         <td><span class="attribute_field_t_couleur">Noir</span></td>
 *       </tr>…
 *     </table>
 *   <h2 class="titre-item">Documents</h2>
 *     <a href=".pdf">…</a>
 */

import type { EnrichedSpec, ProductVariant } from '../types'

export interface NicollParsed {
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

export function parseNicollProduct(html: string, pageUrl: string): NicollParsed {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // ── Titre : premier H1 produit (ignorer celui du bandeau RGPD) ──────────
  let title = ''
  const h1s = Array.from(doc.querySelectorAll('h1'))
  for (const h of h1s) {
    const t = textOf(h)
    if (!t) continue
    if (/vie privée|cookies?|consent/i.test(t)) continue
    title = t
    break
  }
  if (!title) {
    title =
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
      doc.title.replace(/\s*\|.*$/, '').trim()
  }

  // ── Description : meta + h2.chapo ──────────────────────────────────────
  const metaDesc =
    doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
    ''
  const chapo = textOf(doc.querySelector('h2.chapo'))
  const description = chapo && chapo.length >= 20 ? chapo : metaDesc

  // ── Avantages : h2.chapo + éventuels items sous h2.chapo ────────────────
  const advantages: string[] = []
  if (chapo && chapo.length >= 20) advantages.push(chapo)
  // Tags sémantiques spécifiques Nicoll (plus-produits, atouts)
  doc.querySelectorAll('.plus-produits li, .atout li, .engagement li').forEach(li => {
    const t = textOf(li)
    if (t.length >= 10 && t.length <= 400) advantages.push(t)
  })

  // ── Specs : tableau sous <h2>Descriptif technique</h2> ─────────────────
  const specifications: EnrichedSpec[] = []
  // Trouver le h2 "Descriptif technique" puis le tableau suivant
  const h2s = Array.from(doc.querySelectorAll('h2'))
  const specH2 = h2s.find(h => /descriptif\s+technique|caract[eé]ristiques?/i.test(textOf(h)))
  if (specH2) {
    // remonter au parent du h2 puis chercher le tableau dedans (structure Drupal)
    const container = specH2.parentElement?.parentElement ?? specH2.parentElement ?? doc
    const tbl = container?.querySelector('table')
    if (tbl) {
      tbl.querySelectorAll('tr').forEach(tr => {
        const tds = tr.querySelectorAll('td')
        if (tds.length < 2) return
        const name = textOf(tds[0])
        const value = textOf(tds[1])
        if (!name || !value || name.length > 80 || value.length > 300) return
        specifications.push({ name, value, group: 'Descriptif technique' })
      })
    }
  }

  // ── Variantes : table[data-striping] ───────────────────────────────────
  const variants: ProductVariant[] = []
  doc.querySelectorAll('table[data-striping] tr[data-variation-id]').forEach(tr => {
    // Chaque <td> contient <span class="title">Réf.</span> + <span class="field_…">valeur</span>
    // On cible le <span> de valeur via [selector-id] ou en excluant .title.
    const ref = textOf(tr.querySelector('span.field_ref_nicoll:not(.title)'))
    const label = textOf(tr.querySelector('span.attribute_field_label:not(.title)'))
    const color = textOf(tr.querySelector('span.attribute_field_t_couleur:not(.title)'))
    if (!ref) return
    const properties: Record<string, string> = {}
    if (color) properties['Couleur'] = color
    variants.push({ reference: ref, label: label || ref, properties })
  })

  // ── Images ──────────────────────────────────────────────────────────────
  const images = new Set<string>()
  const heroImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')?.trim() ||
    ''
  if (heroImage) images.add(heroImage)
  doc.querySelectorAll('img[src], source[srcset]').forEach(img => {
    const raw = img.getAttribute('src') || img.getAttribute('srcset') || ''
    const first = raw.split(',')[0]?.trim().split(' ')[0] ?? ''
    if (!first) return
    let resolved: string
    try { resolved = new URL(first, pageUrl).toString() } catch { return }
    if (!/nicoll|\/sites\/default\/files\/products?\//i.test(resolved)) return
    if (/sprite|logo|icon|button|placeholder|badge/i.test(resolved)) return
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(resolved)) return
    images.add(resolved)
  })

  // ── Documents PDF (href non vide, unique) ──────────────────────────────
  const documents = new Set<string>()
  const seenUrl = new Set<string>()
  doc.querySelectorAll('a[href*=".pdf" i]').forEach(a => {
    const href = a.getAttribute('href') ?? ''
    if (!href || href === '#') return
    let resolved: string
    try { resolved = new URL(href, pageUrl).toString() } catch { return }
    if (!/\.pdf($|\?)/i.test(resolved)) return
    if (seenUrl.has(resolved)) return
    seenUrl.add(resolved)
    const linkText = textOf(a)
    const filename = resolved.split('/').pop()?.replace(/\.pdf.*$/i, '') ?? ''
    const cleanName = linkText && linkText.length >= 3 && linkText.length <= 120
      ? linkText
      : decodeURIComponent(filename).replace(/[_%-]+/g, ' ').trim() || 'Document'
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
