/**
 * Parser dédié Makita (makita.fr, makita.com).
 *
 * Structure DOM cible (rendue côté serveur, sans SPA) :
 *   <div class="techspecs-content" id="groupid_165">
 *     <h3 class="techspecs-content-title">Battery:</h3>
 *   </div>
 *   <div class="techspecs--row" id="groupid_165"></div>
 *   <li class="techspecs--row row-content">
 *     <div class="techspecs--row-specification">Énergie</div>
 *     <div class="techspecs--row-value">18 V</div>
 *   </li>
 *
 * Les titres de groupe (en anglais) sont traduits en FR via une map fixe ;
 * ce qui n'est pas mappé reste tel quel (toléré).
 */

import type { EnrichedSpec, ProductVariant } from '../types'

export interface MakitaParsed {
  title: string
  description: string
  advantages: string[]
  specifications: EnrichedSpec[]
  variants: ProductVariant[]
  images: string[]
  heroImage: string
  documents: string[]
}

const GROUP_TITLE_FR: Record<string, string> = {
  battery: 'Batterie',
  'power source': 'Alimentation',
  performance: 'Performance',
  dimensions: 'Dimensions',
  weight: 'Poids',
  noise: 'Niveau sonore',
  'sound pressure': 'Niveau sonore',
  vibration: 'Vibrations',
  capacity: 'Capacité',
  'cutting capacity': 'Capacité de coupe',
  drilling: 'Perçage',
  motor: 'Moteur',
  'blade specifications': 'Caractéristiques de lame',
  speed: 'Vitesse',
}

function translateGroup(rawEn: string): string {
  const key = rawEn.trim().toLowerCase().replace(/:$/, '').replace(/\s+/g, ' ')
  return GROUP_TITLE_FR[key] ?? rawEn.trim().replace(/:$/, '')
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function parseMakitaProduct(html: string, pageUrl: string): MakitaParsed {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // ── Titre ────────────────────────────────────────────────────────────────
  const title =
    textOf(doc.querySelector('h1')) ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ||
    doc.title.replace(/\s*\|.*$/, '').trim()

  // ── Description ─────────────────────────────────────────────────────────
  const metaDesc =
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ||
    ''
  // Fallback : premier paragraphe significatif
  let description = metaDesc
  if (!description || description.length < 40) {
    const firstP = Array.from(doc.querySelectorAll('p'))
      .map(p => textOf(p))
      .find(t => t.length >= 60 && t.length <= 800)
    if (firstP) description = firstP
  }

  // ── Avantages (USPs) ────────────────────────────────────────────────────
  const advantages = Array.from(doc.querySelectorAll('li.usp'))
    .map(li => textOf(li))
    .filter(t => t.length >= 3)

  // ── Mapping groupid → titre FR ──────────────────────────────────────────
  const groupTitles = new Map<string, string>()
  doc.querySelectorAll('div.techspecs-content[id^="groupid_"]').forEach(el => {
    const id = el.getAttribute('id') ?? ''
    const h3 = textOf(el.querySelector('h3.techspecs-content-title'))
    if (id && h3) groupTitles.set(id, translateGroup(h3))
  })

  // ── Specs : itérer les <li class="techspecs--row row-content"> ──────────
  // Chaque <li> est précédé d'un <div class="techspecs--row" id="groupid_X">
  // (qui joue le rôle de marqueur de groupe pour la ligne suivante).
  const specifications: EnrichedSpec[] = []
  const rows = doc.querySelectorAll('li.techspecs--row.row-content')
  rows.forEach(li => {
    const name = textOf(li.querySelector('.techspecs--row-specification'))
    const valueEl = li.querySelector('.techspecs--row-value')
    let value = textOf(valueEl)
    // Valeur booléenne représentée par une icône check
    if (!value && valueEl?.querySelector('i.fa-check, [class*="check"]')) value = 'Oui'
    if (!name || !value) return

    // Le group du <li> = id du <div.techspecs--row> immédiatement précédent
    const prev = li.previousElementSibling
    const groupId = prev?.getAttribute('id') ?? ''
    const group = groupTitles.get(groupId) || 'Caractéristiques'

    specifications.push({ name, value, group })
  })

  // ── Variantes : références DUH752, DUH752RT, DUH752SF dans le texte ─────
  // Elles apparaissent dans la section "Autres modèles de la famille" ou au
  // bas de page. On extrait du body entier via regex sur les liens produits.
  const variants: ProductVariant[] = []
  const variantRefs = new Set<string>()
  doc.querySelectorAll('a[href*="/product/"]').forEach(a => {
    const href = a.getAttribute('href') ?? ''
    const m = href.match(/\/product\/([a-z0-9]+)\.html/i)
    if (!m) return
    const ref = m[1].toUpperCase()
    if (!/^[A-Z]{2,5}\d{2,5}[A-Z]{0,4}$/.test(ref)) return
    if (variantRefs.has(ref)) return
    variantRefs.add(ref)
    const label = textOf(a) || ref
    variants.push({ reference: ref, label, properties: {} })
  })

  // ── Images ──────────────────────────────────────────────────────────────
  const images = new Set<string>()
  const heroImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')?.trim() ||
    ''
  if (heroImage) images.add(heroImage)
  doc.querySelectorAll('img[src], img[data-src]').forEach(img => {
    const src = img.getAttribute('src') || img.getAttribute('data-src') || ''
    if (!src) return
    // Résoudre les URL relatives
    let resolved: string
    try { resolved = new URL(src, pageUrl).toString() } catch { return }
    // Filtrer : doit contenir une image produit Makita (fi.makitamedia / CDN connu)
    if (!/makitamedia|makita\.com|makita\.fr|cloudinary/i.test(resolved)) return
    if (/sprite|logo|icon|button|placeholder/i.test(resolved)) return
    images.add(resolved)
  })

  // ── Documents PDF ───────────────────────────────────────────────────────
  const documents = new Set<string>()
  doc.querySelectorAll('a[href$=".pdf" i], a[href*=".pdf?" i]').forEach(a => {
    const href = a.getAttribute('href') ?? ''
    if (!href) return
    let resolved: string
    try { resolved = new URL(href, pageUrl).toString() } catch { return }
    // Titre : texte du lien ou nom du fichier
    const linkText = textOf(a) || ''
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
  }
}
