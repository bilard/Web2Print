/**
 * Convertit un PDF en SVG éditable — miroir de `imageToSvg.ts`, mais la source est
 * la PREMIÈRE page du PDF rasterisée en image (PDF promo flatten = pas de calque
 * texte exploitable, on passe donc par la même décomposition Vision que les images).
 *
 * Pipeline :
 *  - Rasterisation de la page 1 via pdfjs-dist sur un `<canvas>` (DPI calculé pour
 *    une bonne qualité OCR : côté le plus long visé ~2000 px, scale borné [1, 4]).
 *  - Le canvas → PNG → upload Firebase Storage (référence URL HTTPS dans le SVG,
 *    embed base64 rejeté car Firestore plafonne à 1 MiB/document).
 *  - SVG dimensionné aux pixels rasterisés, avec le calque `image-bg-locked` IDENTIQUE
 *    à celui d'`imageToSvg.ts` → `useImageToSvgDecompose` décompose sans modification.
 */

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage, auth } from '@/lib/firebase/config'
import { registerDynamicFontVariant } from '@/features/assets/useFonts'
import { registerFontBuffer } from '@/features/assets/fontBufferRegistry'
import { escapeXml, slugifyFileName } from './xmlUtils'
import { t } from '@/lib/i18n'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** Côté le plus long visé pour la rasterisation (compromis qualité OCR / coût Vision). */
const TARGET_MAX_PX = 2000

/** Police rendue disponible pour l'import (extraite du PDF ou tirée de Google
 *  Fonts) — à uploader dans `projects/{id}/fonts/` pour la réouverture. */
export interface PdfFontAsset {
  family: string
  weight: string
  style: string
  data: Uint8Array
  ext: 'ttf' | 'woff2'
}

export interface PdfToSvgResult {
  /** Blob SVG prêt à être passé à parseSvg / loadSVGFromString */
  file: File
  /** Dimensions de la page rasterisée (= dimensions du SVG / du canvas projet) */
  width: number
  height: number
  /** URL publique Firebase Storage du PNG rasterisé */
  imageUrl: string
  /** Chemin Storage (pour suppression éventuelle ultérieure) */
  storagePath: string
  /** true = le PDF avait un calque texte natif → <text> SVG exacts, OCR inutile */
  hasTextLayer: boolean
  /** Polices chargées pour ce PDF (absentes du navigateur) — à persister dans le projet. */
  fonts: PdfFontAsset[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Uint8Array → base64 (chunké : btoa ne digère pas les gros buffers d'un coup). */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/**
 * Ré-encode les images du PDF en PNG RGB via MuPDF lui-même. mutool embarque
 * les flux JPEG d'ORIGINE dans le SVG — or les JPEG CMYK Adobe (InDesign) sont
 * mal décodés par les navigateurs (photo noire/inversée). MuPDF, lui, gère
 * CMYK/ICC correctement : on intercepte chaque image via un Device JS et on
 * remplace les data-URI du SVG dans l'ordre du flux de contenu.
 */
function reencodeMupdfImages(
  mupdfMod: typeof import('mupdf'),
  page: { run(device: unknown, matrix: unknown): void },
  svg: string,
): string {
  const pngs: string[] = []
  try {
    const dev = new mupdfMod.Device({
      fillImage(image: { toPixmap(): { asPNG(): Uint8Array; destroy?: () => void } }) {
        try {
          const pix = image.toPixmap()
          pngs.push(`data:image/png;base64,${uint8ToBase64(pix.asPNG())}`)
          pix.destroy?.()
        } catch {
          pngs.push('')
        }
      },
      fillImageMask() {},
      clipImageMask() {},
    } as unknown as ConstructorParameters<typeof mupdfMod.Device>[0])
    page.run(dev, mupdfMod.Matrix.identity)
  } catch (err) {
    console.warn('[pdfToSvg] interception images MuPDF partielle:', err)
  }
  if (pngs.length === 0) return svg
  let idx = 0
  return svg.replace(/(<image\b[^>]*?(?:xlink:)?href=")data:image\/[^"]+(")/g, (full, pre: string, post: string) => {
    const rep = pngs[idx++]
    return rep ? pre + rep + post : full
  })
}

/**
 * Déballe le(s) <g> RACINE de mutool : tout le contenu de page est enveloppé
 * dans un unique groupe (clip de page) → Fabric importerait UN SEUL objet
 * groupé, rien d'éditable individuellement. On remonte les enfants à la
 * racine tant que le wrapper est unique et sans transform significative.
 */
function unwrapMupdfRootGroups(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  const root = dom.documentElement
  const NON_CONTENT = new Set(['defs', 'title', 'desc', 'metadata', 'clippath', 'mask', 'symbol'])
  let changed = false
  for (let pass = 0; pass < 4; pass++) {
    const kids = Array.from(root.children).filter((el) => !NON_CONTENT.has(el.tagName.toLowerCase()))
    if (kids.length !== 1 || kids[0].tagName.toLowerCase() !== 'g') break
    const g = kids[0]
    const tr = (g.getAttribute('transform') ?? '').trim()
    // Transform non triviale → on ne déballe pas (elle porterait sur les enfants).
    if (tr && !/^matrix\(\s*1[ ,]+-?0[ ,]+-?0[ ,]+1[ ,]+-?0[ ,]+-?0\s*\)$/.test(tr)) break
    while (g.firstChild) root.insertBefore(g.firstChild, g)
    g.remove()
    changed = true
  }
  return changed ? new XMLSerializer().serializeToString(dom) : svg
}

/**
 * Déballe les <g clip-path> NEUTRES : MuPDF enveloppe les marques d'impression
 * (traits de coupe, cibles de repérage, slug InDesign) dans un <g> clippé à la
 * PAGE ENTIÈRE, émis en dernier (sommet du z-order). Fabric en ferait UN Group
 * dont la bbox couvre toute la page — sans test par-pixel, il capte TOUS les
 * clics du canvas et plus rien ne semble sélectionnable. Un clip pleine page ne
 * rogne rien : on le retire et on remonte les enfants à la racine (chaque
 * marque devient un petit objet à bbox locale, les clics passent au travers).
 */
export function unwrapNeutralClipGroups(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  const root = dom.documentElement
  const W = parseFloat(root.getAttribute('width') ?? '0')
  const H = parseFloat(root.getAttribute('height') ?? '0')
  if (!W || !H) return svg
  // clipPath rectangulaires couvrant (au moins) toute la page → neutres.
  const neutral = new Set<string>()
  for (const cp of Array.from(dom.querySelectorAll('clipPath'))) {
    const d = cp.querySelector('path')?.getAttribute('d') ?? ''
    const m = d.match(/^M\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)\s*H\s*(-?[\d.]+)\s*V\s*(-?[\d.]+)\s*H\s*-?[\d.]+\s*Z$/i)
    if (!m) continue
    const [x0, y0, x1, y1] = m.slice(1).map(Number)
    if (x0 <= 0.5 && y0 <= 0.5 && x1 >= W - 0.5 && y1 >= H - 0.5) {
      const id = cp.getAttribute('id')
      if (id) neutral.add(id)
    }
  }
  if (neutral.size === 0) return svg
  let changed = false
  for (const g of Array.from(root.querySelectorAll('g[clip-path]'))) {
    const ref = (g.getAttribute('clip-path') ?? '').match(/url\(#([^)]+)\)/)?.[1]
    if (!ref || !neutral.has(ref)) continue
    // Seul attribut = le clip neutre → déballage sans effet de rendu. Un autre
    // attribut (transform, style…) porterait sur les enfants : on ne touche pas.
    if (g.getAttributeNames().some((n) => n !== 'clip-path')) continue
    const parent = g.parentNode
    if (!parent) continue
    while (g.firstChild) parent.insertBefore(g.firstChild, g)
    g.remove()
    changed = true
  }
  return changed ? new XMLSerializer().serializeToString(dom) : svg
}

/**
 * Supprime les <text> imprimés en DOUBLE passe : InDesign émet le slug/la date
 * (et parfois des labels) deux fois exactement superposés — une passe blanche
 * de dégagement puis la passe encrée. À l'import chaque passe deviendrait un
 * objet → doublons dans les calques. Même contenu + même position (±0.5 pt)
 * = doublon ; on garde le DERNIER du document (celui dessiné au-dessus).
 */
export function dedupeMupdfTexts(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  const last = new Map<string, Element>()
  let removed = false
  for (const t of Array.from(dom.documentElement.querySelectorAll('text'))) {
    const key = [
      (t.textContent ?? '').trim(),
      Math.round(parseFloat(t.getAttribute('x') ?? '0')),
      Math.round(parseFloat(t.getAttribute('y') ?? '0')),
      t.getAttribute('transform') ?? '',
    ].join('|')
    const prev = last.get(key)
    if (prev) { prev.remove(); removed = true }
    last.set(key, t)
  }
  return removed ? new XMLSerializer().serializeToString(dom) : svg
}

/**
 * Regroupe les <text> top-level appartenant au même BLOC visuel dans un <g>
 * (→ un seul Group Fabric, déplaçable d'un tenant) : prix composé « 22 DT ,99 »,
 * bulle « 30 % d'économie », pastille « +55g GRATUIT »… Critère : même couleur
 * ET boîtes englobantes estimées (0.52 × fontSize par caractère) gonflées de
 * 0.6 × fontSize qui se touchent — validé sur PDF réel : la couleur sépare les
 * blocs adjacents (flash prix rouge vs bulle % blanche à 7.5 pt l'un de l'autre).
 * Les champs de fusion {{…}} forment leur PROPRE famille de clusters : un bloc
 * marketing empile des champs de couleurs différentes (libellé bleu, marque
 * rose, description noire) → proximité seule, jamais mélangés aux non-champs.
 * Le moteur de publipostage descend dans les groupes (collectObjectsDeep).
 * Exclus : textes rotatés (transform).
 */
export function groupMupdfTextBlocks(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  const root = dom.documentElement

  interface Run { el: Element; fs: number; fill: string; l: number; t: number; r: number; b: number; ph: boolean }
  const runs: Run[] = []
  for (const el of Array.from(root.children)) {
    if (el.tagName !== 'text') continue
    if (el.getAttribute('transform')) continue
    const content = el.textContent ?? ''
    const fs = parseFloat(el.getAttribute('font-size') ?? '12')
    const x = parseFloat(el.getAttribute('x') ?? '0')
    const y = parseFloat(el.getAttribute('y') ?? '0')
    if (!Number.isFinite(fs) || !Number.isFinite(x) || !Number.isFinite(y)) continue
    runs.push({
      el, fs,
      fill: (el.getAttribute('fill') ?? '#000000').toLowerCase(),
      l: x, t: y - fs, r: x + content.length * fs * 0.52, b: y + fs * 0.25,
      ph: /\{\{|\}\}/.test(content),
    })
  }
  if (runs.length < 2) return svg

  const near = (a: Run, b: Run): boolean => {
    if (a.ph !== b.ph) return false
    if (a.ph) {
      // Champs {{…}} : interligne d'un bloc marketing (couleurs libres).
      const pad = 0.8 * Math.max(a.fs, b.fs)
      return a.l - pad < b.r && b.l - pad < a.r && a.t - pad < b.b && b.t - pad < a.b
    }
    if (a.fill !== b.fill) return false
    const pad = 0.6 * Math.min(a.fs, b.fs)
    return a.l - pad < b.r && b.l - pad < a.r && a.t - pad < b.b && b.t - pad < a.b
  }
  // Union-find : agrège les runs voisins de proche en proche.
  const parent = runs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (near(runs[i], runs[j])) parent[find(j)] = find(i)
    }
  }
  const clusters = new Map<number, Run[]>()
  runs.forEach((r, i) => {
    const root_ = find(i)
    clusters.set(root_, [...(clusters.get(root_) ?? []), r])
  })

  let grouped = false
  for (const members of clusters.values()) {
    if (members.length < 2) continue
    const g = dom.createElementNS('http://www.w3.org/2000/svg', 'g')
    const label = members.map((m) => (m.el.textContent ?? '').trim()).join(' ').slice(0, 30)
    g.setAttribute('id', `bloc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'texte'}`)
    // Inséré à la place du premier membre (ordre document = z-order conservé).
    root.insertBefore(g, members[0].el)
    for (const m of members) g.appendChild(m.el)
    grouped = true
  }
  return grouped ? new XMLSerializer().serializeToString(dom) : svg
}

/**
 * Annote les champs de fusion {{…}} groupés en bloc marketing avec leur CADRE
 * de composition : largeur = union du bloc, alignement détecté depuis la
 * géométrie réelle du PDF (bords droits communs → right, centres → center).
 * svgToFabric convertit ces <text> en **Textbox à cadre fixe** — sans ça la
 * substitution de fusion perd le formatage d'origine : un IText s'étend vers
 * la droite depuis son ancre gauche (alignement à droite du design perdu) et
 * les valeurs longues débordent au lieu de passer à la ligne.
 */
export function annotateMergeFieldFrames(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  let changed = false
  for (const g of Array.from(dom.documentElement.querySelectorAll('g'))) {
    const texts = Array.from(g.children).filter(
      (el): el is Element => el.tagName === 'text' && /\{\{/.test(el.textContent ?? ''),
    )
    if (texts.length < 2) continue
    interface F { el: Element; left: number; right: number }
    const fields: F[] = []
    for (const el of texts) {
      const x = parseFloat(el.getAttribute('x') ?? '')
      const run = parseFloat(el.getAttribute('data-pdf-run-width') ?? '')
      const n = (el.textContent ?? '').length
      if (!Number.isFinite(x) || !Number.isFinite(run) || n < 2) continue
      // data-pdf-run-width va jusqu'au DÉBUT du dernier glyphe → extrapole sa chasse.
      fields.push({ el, left: x, right: x + (run * n) / (n - 1) })
    }
    if (fields.length < 2) continue
    const frameLeft = Math.min(...fields.map((f) => f.left))
    const frameRight = Math.max(...fields.map((f) => f.right))
    const spread = (vals: number[]) => Math.max(...vals) - Math.min(...vals)
    const align = spread(fields.map((f) => f.right)) <= 2.5 ? 'right'
      : spread(fields.map((f) => (f.left + f.right) / 2)) <= 2.5 ? 'center'
      : 'left'
    for (const f of fields) {
      f.el.setAttribute('data-merge-frame', `${frameLeft.toFixed(1)},${(frameRight - frameLeft).toFixed(1)},${align}`)
      changed = true
    }
  }
  return changed ? new XMLSerializer().serializeToString(dom) : svg
}

/** Bbox approximative d'un path : min/max des points M/L/C/H/V, transformés
 *  par la matrice InDesign classique matrix(a,b,c,d,e,f). Suffisant pour les
 *  rounded-rects d'ombre/de carte (les points de contrôle Bézier débordent
 *  peu). Null si le d est trop exotique. */
function approxPathBBox(el: Element): { l: number; t: number; r: number; b: number } | null {
  const d = el.getAttribute('d') ?? ''
  const tr = el.getAttribute('transform') ?? ''
  const tm = tr.match(/matrix\(\s*([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)\s*\)/i)
  const [a, b, c, dd, e, f] = tm ? tm.slice(1).map(Number) : [1, 0, 0, 1, 0, 0]
  let x = 0, y = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const add = (px: number, py: number) => {
    const X = a * px + c * py + e
    const Y = b * px + dd * py + f
    if (X < minX) minX = X; if (X > maxX) maxX = X
    if (Y < minY) minY = Y; if (Y > maxY) maxY = Y
  }
  const tokens = d.match(/[MLCHVZmlchvz]|-?[\d.]+(?:e-?\d+)?/gi) ?? []
  let i = 0
  let cmd = ''
  const num = () => parseFloat(tokens[i++])
  while (i < tokens.length) {
    const tk = tokens[i]
    if (/^[MLCHVZ]$/i.test(tk)) { cmd = tk.toUpperCase(); i++; if (cmd === 'Z') continue }
    switch (cmd) {
      case 'M': case 'L': x = num(); y = num(); add(x, y); break
      case 'H': x = num(); add(x, y); break
      case 'V': y = num(); add(x, y); break
      case 'C': {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num()
        x = num(); y = num()
        add(x1, y1); add(x2, y2); add(x, y)
        break
      }
      default: return null // commande non gérée (relatives, A, Q…)
    }
  }
  return Number.isFinite(minX) ? { l: minX, t: minY, r: maxX, b: maxY } : null
}

/**
 * Retire les masques de luminosité MuPDF : Fabric ignore <mask> et dessine
 * son CONTENU comme des objets pleins → voile gris opaque. Avant suppression,
 * le pattern « ombre portée InDesign » (groupe maské contenant UN SEUL path
 * sombre semi-transparent) est CONVERTI en ombre native : un data-shadow est
 * posé sur l'élément porteur (le sibling suivant, dessiné par-dessus l'ombre)
 * — svgToFabric le traduira en `shadow` Fabric, éditable via le panneau Ombre.
 */
export function stripMupdfMasks(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  let touched = false
  for (const el of Array.from(dom.querySelectorAll('[mask]'))) {
    // Pattern ombre : un unique path au fill sombre et semi-transparent.
    const paths = Array.from(el.querySelectorAll('path'))
    const carrier = el.nextElementSibling
    if (paths.length === 1 && carrier) {
      const p = paths[0]
      const fill = p.getAttribute('fill') ?? '#000000'
      const opacity = parseFloat(p.getAttribute('fill-opacity') ?? '1')
      const sb = approxPathBBox(p)
      const cb = carrier.tagName.toLowerCase() === 'path' ? approxPathBBox(carrier) : null
      if (opacity <= 0.85 && sb && cb) {
        // L'ombre doit envelopper largement le porteur (sinon ce n'est pas son ombre).
        const overlapW = Math.min(sb.r, cb.r) - Math.max(sb.l, cb.l)
        const overlapH = Math.min(sb.b, cb.b) - Math.max(sb.t, cb.t)
        if (overlapW > (cb.r - cb.l) * 0.7 && overlapH > (cb.b - cb.t) * 0.7) {
          const m = fill.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
          const [r, g, bl] = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]
          const offsetX = (sb.l + sb.r) / 2 - (cb.l + cb.r) / 2
          const offsetY = (sb.t + sb.b) / 2 - (cb.t + cb.b) / 2
          // Débord du rect d'ombre au-delà du porteur ≈ étendue du flou.
          const blur = Math.max(2, ((sb.r - sb.l - (cb.r - cb.l)) + (sb.b - sb.t - (cb.b - cb.t))) / 4)
          carrier.setAttribute('data-shadow', JSON.stringify({
            color: `rgba(${r},${g},${bl},${Math.min(1, Math.max(0.05, opacity)).toFixed(2)})`,
            blur: +blur.toFixed(1),
            offsetX: +offsetX.toFixed(1),
            offsetY: +offsetY.toFixed(1),
          }))
        }
      }
    }
    el.remove(); touched = true
  }
  for (const el of Array.from(dom.querySelectorAll('mask'))) { el.remove(); touched = true }
  for (const el of Array.from(dom.querySelectorAll('g[id^="mask_"]'))) { el.remove(); touched = true }
  return touched ? new XMLSerializer().serializeToString(dom) : svg
}

/**
 * « WRZTFA+ArialNarrow-Bold » → { family: 'Arial Narrow', weight: '700' } :
 * retire le préfixe de subset, déduit graisse/style du nom (avec OU SANS
 * séparateur — « BebasNeueBold » compte), retire le suffixe de style, espace
 * le camelCase. Partagé entre le nettoyage du SVG et l'extraction des polices
 * embarquées — les deux DOIVENT produire le même nom de famille.
 */
export function parsePdfFontName(raw: string): { family: string; weight: string; style: string } {
  let name = raw.replace(/^[A-Z]{6}\+/, '')
  const bold = /bold|black|heavy/i.test(name)
  const italic = /italic|oblique/i.test(name)
  // Suffixes de style enchaînés (« -BoldItalic », « Bold ») ; « Narrow » /
  // « Condensed » sont des sous-familles typographiques, on les garde.
  name = name.replace(/(?:[-_ ]?(?:Extra|Semi|Demi|Ultra)?(?:Bold|Black|Heavy|Italic|Oblique|Regular|Light|Medium|Thin))+$/i, '')
  const family = name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim() || raw
  return { family, weight: bold ? '700' : '400', style: italic ? 'italic' : 'normal' }
}

/**
 * Nettoie les polices en sous-ensembles PDF (« WRZTFA+ArialNarrow-Bold ») :
 * famille propre + graisse/style en attributs. La famille est posée SEULE,
 * sans pile « , Arial, sans-serif » : Fabric ne quote pas un fontFamily
 * contenant une virgule → ctx.font invalide → le canvas retombait sur sa
 * police par défaut (serif) même quand la famille était disponible.
 */
function cleanSubsetFontFamilies(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  for (const t of Array.from(dom.querySelectorAll('text'))) {
    const raw = t.getAttribute('font-family') ?? ''
    if (!raw) continue
    const { family, weight, style } = parsePdfFontName(raw)
    if (weight === '700' && !t.getAttribute('font-weight')) t.setAttribute('font-weight', 'bold')
    if (style === 'italic' && !t.getAttribute('font-style')) t.setAttribute('font-style', 'italic')
    t.setAttribute('font-family', family)
  }
  return new XMLSerializer().serializeToString(dom)
}

/**
 * Extrait les fichiers de polices EMBARQUÉS du PDF (FontDescriptor →
 * FontFile/FontFile2 = TrueType/Type1 exploitables par FontFace). Les
 * FontFile3 (CFF nu, sans tables sfnt) ne sont pas chargeables tels quels —
 * leurs familles passeront par le fallback Google Fonts.
 */
function extractPdfFonts(
  doc: { countObjects(): number; newIndirect(i: number): { resolve(): unknown } },
): { name: string; data: Uint8Array }[] {
  const out: { name: string; data: Uint8Array }[] = []
  const seen = new Set<string>()
  let count = 0
  try { count = doc.countObjects() } catch { return out }
  for (let i = 1; i < count; i++) {
    try {
      const obj = doc.newIndirect(i).resolve() as {
        isDictionary?: () => boolean
        get?: (k: string) => { asName?: () => string; isNull?: () => boolean; readStream?: () => { asUint8Array(): Uint8Array } } | null
      } | null
      if (!obj?.isDictionary?.() || !obj.get) continue
      if (obj.get('Type')?.asName?.() !== 'FontDescriptor') continue
      const name = obj.get('FontName')?.asName?.() ?? ''
      if (!name || seen.has(name)) continue
      for (const key of ['FontFile2', 'FontFile']) {
        const ff = obj.get(key)
        if (!ff || ff.isNull?.()) continue
        const data = ff.readStream?.().asUint8Array()
        if (data && data.length > 0) {
          out.push({ name, data })
          seen.add(name)
        }
        break
      }
    } catch { /* objet illisible — on continue */ }
  }
  return out
}

/** Tire le binaire woff2 d'une famille sur Google Fonts (null si absente). */
async function fetchGoogleFont(family: string): Promise<Uint8Array | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}`
    const cssResp = await fetch(url)
    if (!cssResp.ok) return null
    const css = await cssResp.text()
    const fontUrl = css.match(/url\((https:[^)]+\.woff2)\)/)?.[1]
    if (!fontUrl) return null
    const binResp = await fetch(fontUrl)
    if (!binResp.ok) return null
    return new Uint8Array(await binResp.arrayBuffer())
  } catch {
    return null
  }
}

/** ArrayBuffer « propre » (sans offset) pour FontFace. */
const toArrayBuffer = (u8: Uint8Array): ArrayBuffer =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer

/**
 * Cale la CHASSE de chaque texte sur sa largeur PDF d'origine via scaleX :
 * la police de rendu (système/Google Fonts) n'a pas les métriques exactes de
 * celle du PDF, et la compression horizontale InDesign (matrix a≠d, ex.
 * « 30 % » condensé à 75 %) est perdue à l'aplatissement — sans calage le
 * texte déborde sur son voisin (le « 30 » recouvrait le « % »). La largeur
 * cible vient des positions par-glyphe mutool (data-pdf-run-width, jusqu'au
 * début du dernier glyphe) ; la largeur de rendu est mesurée avec la police
 * RÉELLEMENT chargée → à appeler APRÈS registerPdfFonts.
 */
export function fitTextWidthsToPdf(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  const texts = Array.from(dom.querySelectorAll('text[data-pdf-run-width]'))
  if (texts.length === 0) return svg
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return svg
  for (const t of texts) {
    const target = parseFloat(t.getAttribute('data-pdf-run-width') ?? '')
    t.removeAttribute('data-pdf-run-width')
    if (!Number.isFinite(target) || target <= 0) continue
    if (t.getAttribute('transform')) continue // rotaté : laissé tel quel
    const content = t.textContent ?? ''
    if (content.length < 2) continue
    // Champ de fusion : le contenu sera REMPLACÉ par les données — caler la
    // chasse du placeholder n'a pas de sens (et le scaleX fausserait le cadre
    // du Textbox posé par annotateMergeFieldFrames).
    if (/\{\{/.test(content)) continue
    const fs = parseFloat(t.getAttribute('font-size') ?? '12')
    const family = (t.getAttribute('font-family') ?? 'sans-serif').replace(/"/g, '')
    const bold = (t.getAttribute('font-weight') ?? '') === 'bold'
    const italic = (t.getAttribute('font-style') ?? '') === 'italic'
    ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fs}px "${family}"`
    // Même périmètre que la cible : le run SANS son dernier glyphe.
    const measured = ctx.measureText(content.slice(0, -1)).width
    if (!measured || !Number.isFinite(measured)) continue
    const sx = target / measured
    if (Math.abs(sx - 1) < 0.02 || sx < 0.4 || sx > 1.8) continue // bruit / mesure aberrante
    const x = parseFloat(t.getAttribute('x') ?? '0')
    // Échelle horizontale ANCRÉE sur x (x' = sx·x + tx = x) — Fabric l'importe
    // en scaleX sans déplacer le texte.
    t.setAttribute('transform', `matrix(${sx.toFixed(4)} 0 0 1 ${(x * (1 - sx)).toFixed(2)} 0)`)
  }
  // Toujours re-sérialiser : les data-pdf-run-width ont été consommés même
  // quand aucun scaleX n'est posé (sx≈1).
  return new XMLSerializer().serializeToString(dom)
}

/**
 * Rend disponibles les polices du SVG converti : les subsets TrueType
 * embarqués dans le PDF sont enregistrés via FontFace sous leur nom de
 * famille nettoyé ; les familles restantes indisponibles (CFF non
 * extractible, ex. Bebas Neue) sont tirées de Google Fonts (enregistrées en
 * 400 ET 700 — sinon le navigateur synthétiserait un faux-bold). Retourne les
 * fichiers chargés pour persistance dans `projects/{id}/fonts/`.
 */
async function registerPdfFonts(
  extracted: { name: string; data: Uint8Array }[],
  svg: string,
): Promise<PdfFontAsset[]> {
  const assets: PdfFontAsset[] = []
  const isAvailable = (family: string): boolean => {
    try { return document.fonts.check(`12px "${family.replace(/"/g, '')}"`) } catch { return false }
  }

  for (const f of extracted) {
    const { family, weight, style } = parsePdfFontName(f.name)
    if (isAvailable(family)) continue // police système/déjà chargée : plus complète que le subset
    try {
      const buf = toArrayBuffer(f.data)
      const face = new FontFace(family, buf, { weight, style })
      await face.load()
      document.fonts.add(face)
      const fileName = `${family}__${weight}__${style}.ttf`
      registerDynamicFontVariant(family, weight, style, fileName)
      registerFontBuffer(family, weight, style, buf, fileName)
      assets.push({ family, weight, style, data: f.data, ext: 'ttf' })
    } catch (err) {
      console.warn(`[pdfToSvg] police embarquée « ${f.name} » illisible :`, err)
    }
  }

  // Familles encore manquantes après les embarquées → Google Fonts.
  const families = new Set(Array.from(svg.matchAll(/font-family="([^",]+)"/g), (m) => m[1].trim()))
  for (const family of families) {
    if (isAvailable(family)) continue
    const data = await fetchGoogleFont(family)
    if (!data) {
      console.warn(`[pdfToSvg] police « ${family} » indisponible (ni embarquée exploitable, ni Google Fonts) — fallback navigateur`)
      continue
    }
    const buf = toArrayBuffer(data)
    for (const weight of ['400', '700'] as const) {
      try {
        const face = new FontFace(family, buf, { weight, style: 'normal' })
        await face.load()
        document.fonts.add(face)
        const fileName = `${family}__${weight}__normal.woff2`
        registerDynamicFontVariant(family, weight, 'normal', fileName)
        registerFontBuffer(family, weight, 'normal', buf, fileName)
        assets.push({ family, weight, style: 'normal', data, ext: 'woff2' })
      } catch { /* graisse refusée — l'autre suffira */ }
    }
  }
  return assets
}

/**
 * Aplatis les <text transform="matrix(a b c d e f)"><tspan y x="x0 x1 …"> de
 * MuPDF en <text x y> simples compréhensibles par l'importeur Fabric. Les
 * matrices diagonales (échelle uniforme, pas de rotation) sont absorbées dans
 * x/y/font-size ; les autres (texte rotaté) sont laissées telles quelles.
 */
function flattenMupdfTextTransforms(svg: string): string {
  const dom = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (dom.querySelector('parsererror')) return svg
  for (const t of Array.from(dom.querySelectorAll('text'))) {
    const tr = t.getAttribute('transform') ?? ''
    const m = tr.match(/matrix\(\s*([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)[ ,]+([-\d.e]+)\s*\)/i)
    const [a, b, c, d, e, f] = m ? m.slice(1).map(Number) : [1, 0, 0, 1, 0, 0]
    const tspan = t.querySelector('tspan')
    const holder = tspan ?? t
    const xs = (holder.getAttribute('x') ?? '0').trim().split(/\s+/).map(Number)
    const y = Number(holder.getAttribute('y') ?? '0')
    const content = holder.textContent ?? ''
    const fontSize = Number(t.getAttribute('font-size') ?? '12')
    // Run vide (espaces InDesign) → objet parasite, on le supprime.
    if (!content.trim()) {
      t.remove()
      continue
    }
    if (Math.abs(b) < 0.001 && Math.abs(c) < 0.001 && a > 0 && d > 0) {
      // Matrice DIAGONALE — y compris échelle non uniforme (texte condensé
      // InDesign, ex. matrix(.866 0 0 1.1547…)) : la hauteur visuelle est
      // portée par d → font-size × d. La chasse exacte (compression a/d +
      // métriques de la police d'origine) est mémorisée via la largeur
      // par-glyphe réelle → fitTextWidthsToPdf la rétablit par scaleX une
      // fois les polices chargées.
      t.removeAttribute('transform')
      t.setAttribute('x', (xs[0] * a + e).toFixed(2))
      t.setAttribute('y', (y * d + f).toFixed(2))
      t.setAttribute('font-size', (fontSize * d).toFixed(2))
      if (xs.length === content.length && xs.length >= 2) {
        // Largeur PDF du run jusqu'au DÉBUT du dernier glyphe (positions
        // exactes mutool) — référence absolue, indépendante de la police.
        t.setAttribute('data-pdf-run-width', ((xs[xs.length - 1] - xs[0]) * a).toFixed(2))
      }
      t.textContent = content
    } else {
      // ROTATION (ruban « OFFRE » vertical…) : ancre transformée + rotate()
      // simple — Fabric sait l'interpréter, contrairement à la matrix brute
      // combinée aux x par-glyphe.
      const px = a * xs[0] + c * y + e
      const py = b * xs[0] + d * y + f
      const angle = (Math.atan2(b, a) * 180) / Math.PI
      const scale = Math.hypot(a, b) || 1
      t.setAttribute('x', px.toFixed(2))
      t.setAttribute('y', py.toFixed(2))
      t.setAttribute('font-size', (fontSize * scale).toFixed(2))
      t.setAttribute('transform', `rotate(${angle.toFixed(1)} ${px.toFixed(2)} ${py.toFixed(2)})`)
      t.textContent = content
    }
  }
  return new XMLSerializer().serializeToString(dom)
}

/**
 * Conversion VECTORIELLE via MuPDF (WASM, moteur de mutool) : le PDF devient un
 * vrai SVG — paths exacts, images embarquées, et TEXTE RÉEL (`text=text`) avec
 * positions par glyphe, couleur, taille et graisse natives. Fidélité totale,
 * zéro OCR. Retourne null si la conversion échoue (→ fallback raster+OCR).
 * Chargé dynamiquement : le WASM (~8 Mo) n'est tiré qu'au premier import PDF.
 */
async function convertWithMupdf(
  pdfFile: File,
): Promise<{ svg: string; width: number; height: number; textCount: number; pdfFonts: { name: string; data: Uint8Array }[] } | null> {
  try {
    const mupdf = await import('mupdf')
    const data = new Uint8Array(await pdfFile.arrayBuffer())
    const doc = mupdf.Document.openDocument(data, 'application/pdf')
    try {
      const buf = new mupdf.Buffer()
      const writer = new mupdf.DocumentWriter(buf, 'svg', 'text=text')
      const page = doc.loadPage(0)
      const device = writer.beginPage(page.getBounds())
      page.run(device, mupdf.Matrix.identity)
      writer.endPage()
      writer.close()
      let svg = buf.asString()

      // Polices de substitution MuPDF → équivalents installés navigateur.
      svg = svg
        .replace(/font-family="Nimbus Sans[^"]*"/g, 'font-family="Arial, Helvetica, sans-serif"')
        .replace(/font-family="Nimbus Roman[^"]*"/g, 'font-family="\'Times New Roman\', serif"')
        .replace(/font-family="Nimbus Mono[^"]*"/g, 'font-family="\'Courier New\', monospace"')

      // Aplatis les <text> MuPDF (transform matrix + tspan avec x PAR GLYPHE)
      // en <text x y> simples : l'importeur SVG Fabric ne gère ni l'un ni
      // l'autre (tous les textes atterrissaient empilés en 0,0). Seuls les
      // textes horizontaux non déformés sont aplatis ; les rares rotatés
      // gardent leur transform (rendus par Fabric tel quel).
      svg = flattenMupdfTextTransforms(svg)
      // JPEG CMYK Adobe → PNG RGB décodés par MuPDF (photo noire sinon).
      svg = reencodeMupdfImages(mupdf, page, svg)
      // Masques de luminosité (ombres douces) : Fabric les rendrait en voile
      // gris opaque → retirés.
      svg = stripMupdfMasks(svg)
      // Wrapper <g> de page mutool → déballé, sinon UN SEUL objet groupé.
      svg = unwrapMupdfRootGroups(svg)
      // <g> des marques d'impression clippé pleine page → déballé, sinon il
      // capte tous les clics du canvas (Group bbox = page entière au sommet).
      svg = unwrapNeutralClipGroups(svg)
      // Double passe d'impression (blanc + encre superposés) → dédoublonné.
      svg = dedupeMupdfTexts(svg)
      // Textes d'un même bloc visuel (prix composé, bulle %…) → un <g> = un
      // Group Fabric déplaçable d'un tenant.
      svg = groupMupdfTextBlocks(svg)
      // Champs {{…}} → cadre de composition (largeur du bloc + alignement
      // détecté) : svgToFabric en fera des Textbox qui gardent le formatage
      // d'origine à la fusion (alignement, retour à la ligne).
      svg = annotateMergeFieldFrames(svg)
      // Polices en sous-ensembles (WRZTFA+ArialNarrow-Bold) → familles propres.
      svg = cleanSubsetFontFamilies(svg)

      const wm = svg.match(/width="([\d.]+)"/)
      const hm = svg.match(/height="([\d.]+)"/)
      const width = wm ? Math.round(parseFloat(wm[1])) : 0
      const height = hm ? Math.round(parseFloat(hm[1])) : 0
      const textCount = (svg.match(/<text[\s>]/g) ?? []).length
      // Marqueur pdf-text-layer (attribut) : EditorPage saute l'auto-décompo OCR.
      svg = svg.replace('<svg ', '<svg data-pipeline="pdf-to-svg-mupdf" data-text-layer="pdf-text-layer" ')
      // Fichiers de polices embarqués (subsets TrueType) : extraits AVANT le
      // destroy du document, chargés ensuite via FontFace pour un rendu fidèle.
      const pdfFonts = extractPdfFonts(doc as unknown as Parameters<typeof extractPdfFonts>[0])
      return { svg, width, height, textCount, pdfFonts }
    } finally {
      doc.destroy()
    }
  } catch (err) {
    console.warn('[pdfToSvg] conversion vectorielle MuPDF échouée — fallback raster:', err)
    return null
  }
}

/** Run de texte NATIF extrait du PDF (calque texte pdf.js, pas d'OCR). */
interface PdfTextRun {
  text: string
  /** Coordonnées pixels raster (x = gauche, yBaseline = ligne de base SVG) */
  x: number
  yBaseline: number
  width: number
  fontSize: number
  fontFamily: string
  bold: boolean
  italic: boolean
  /** Couleur échantillonnée sur le raster (le calque texte pdf.js n'a pas la couleur) */
  fill: string
}

/** Échantillonne la couleur du TEXTE d'un run : pixels de la bbox les plus
 *  éloignés de la couleur de fond (anneau de bordure). Fallback noir. */
function sampleRunColor(
  ctx: CanvasRenderingContext2D,
  box: { left: number; top: number; width: number; height: number },
  imgW: number,
  imgH: number,
): { fill: string; bgUniform: boolean; bgColor: [number, number, number] } {
  const x0 = Math.max(0, Math.floor(box.left) - 3)
  const y0 = Math.max(0, Math.floor(box.top) - 3)
  const w = Math.min(imgW - x0, Math.ceil(box.width) + 6)
  const h = Math.min(imgH - y0, Math.ceil(box.height) + 6)
  if (w <= 2 || h <= 2) return { fill: '#000000', bgUniform: false, bgColor: [255, 255, 255] }
  const data = ctx.getImageData(x0, y0, w, h).data
  // Fond = moyenne de l'anneau de bordure ; uniformité = écart max sur l'anneau.
  let br = 0, bg = 0, bb = 0, bn = 0
  let maxDev = 0
  const border: number[] = []
  for (let x = 0; x < w; x++) { border.push((0 * w + x) * 4, ((h - 1) * w + x) * 4) }
  for (let y = 0; y < h; y++) { border.push((y * w + 0) * 4, (y * w + (w - 1)) * 4) }
  for (const i of border) { br += data[i]; bg += data[i + 1]; bb += data[i + 2]; bn++ }
  br /= bn; bg /= bn; bb /= bn
  for (const i of border) {
    const d = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb)
    if (d > maxDev) maxDev = d
  }
  // Texte = moyenne des pixels intérieurs nettement distincts du fond.
  let tr = 0, tg = 0, tb = 0, tn = 0
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb)
    if (d > 120) { tr += data[i]; tg += data[i + 1]; tb += data[i + 2]; tn++ }
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  const fill = tn > 4 ? `#${hex(tr / tn)}${hex(tg / tn)}${hex(tb / tn)}` : '#000000'
  return { fill, bgUniform: maxDev < 70, bgColor: [br, bg, bb] }
}

/**
 * Rasterise la 1re page d'un PDF en blob PNG + extrait le calque TEXTE NATIF
 * (pdf.js getTextContent : positions/tailles exactes, pas d'OCR). Les runs de
 * texte horizontaux sont ÉFFACÉS du raster quand leur fond est uniforme
 * (rect couleur de fond) — le SVG les réécrit en <text> éditables par-dessus.
 */
async function rasterizeFirstPage(pdfFile: File): Promise<{ blob: Blob; width: number; height: number; textRuns: PdfTextRun[] }> {
  const buffer = await pdfFile.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = clamp(TARGET_MAX_PX / Math.max(base.width, base.height), 1, 4)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error(t('err.noCanvas'))
    // Fond blanc : certains PDF ont un fond transparent, on veut un visuel imprimé opaque.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // pdfjs v5 : `canvas` est requis dans RenderParameters (en plus du context).
    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    // ── Calque texte natif ──────────────────────────────────────────────────
    const textRuns: PdfTextRun[] = []
    try {
      const tc = await page.getTextContent()
      const styles = tc.styles as Record<string, { fontFamily?: string }>
      for (const item of tc.items) {
        if (!('str' in item)) continue
        const str = item.str
        if (!str || !str.trim()) continue
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
        // Texte non horizontal (ruban vertical…) : laissé en raster, fidélité d'abord.
        if (Math.abs(tx[1]) > 0.01 || Math.abs(tx[2]) > 0.01) continue
        const fontSize = Math.hypot(tx[2], tx[3])
        if (fontSize < 4) continue
        const x = tx[4]
        const yBaseline = tx[5]
        const wRun = item.width * scale
        if (wRun <= 0) continue
        const box = { left: x, top: yBaseline - fontSize, width: wRun, height: fontSize * 1.2 }
        const { fill, bgUniform, bgColor } = sampleRunColor(ctx, box, canvas.width, canvas.height)
        const styleFamily = styles[item.fontName]?.fontFamily ?? 'sans-serif'
        const rawFont = `${item.fontName} ${styleFamily}`
        textRuns.push({
          text: str,
          x, yBaseline, width: wRun, fontSize,
          fontFamily: styleFamily,
          bold: /bold|black|heavy/i.test(rawFont),
          italic: /italic|oblique/i.test(rawFont),
          fill,
        })
        // Efface le run du raster si le fond est uniforme (sinon on garderait
        // un doublon sous le <text> éditable). Fond non uniforme (photo) :
        // on laisse le raster, le <text> exactement superposé le recouvre.
        if (bgUniform) {
          ctx.fillStyle = `rgb(${Math.round(bgColor[0])},${Math.round(bgColor[1])},${Math.round(bgColor[2])})`
          ctx.fillRect(box.left - 2, box.top - 2, box.width + 4, box.height + 4)
        }
      }
    } catch (err) {
      console.warn('[pdfToSvg] extraction du calque texte échouée — fallback OCR:', err)
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rasterisation PNG échouée'))), 'image/png')
    })
    return { blob, width: canvas.width, height: canvas.height, textRuns }
  } finally {
    void pdf.destroy()
  }
}

/**
 * Construit un SVG éditable à partir d'un fichier PDF (page 1 rasterisée).
 * Upload le PNG vers Firebase Storage et l'utilise dans le `<image>` du SVG.
 */
export async function convertPdfToEditableSvg(pdfFile: File): Promise<PdfToSvgResult> {
  if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
    throw new Error(t('err.svg.notPdf', { type: pdfFile.type || t('err.svg.unknownType') }))
  }

  const baseNameForFile = pdfFile.name.replace(/\.[^.]+$/, '') || 'pdf'

  // 1) Conversion VECTORIELLE MuPDF (fidélité totale + texte natif éditable).
  //    On ne la retient que si le PDF a du texte réel ; un PDF aplati (texte
  //    vectorisé/scanné) passe au pipeline raster + OCR qui, lui, sait rendre
  //    les textes éditables.
  const vector = await convertWithMupdf(pdfFile)
  if (vector && vector.width > 0 && vector.height > 0 && vector.textCount > 0) {
    // Polices du PDF rendues disponibles AVANT le rendu Fabric (fidélité :
    // sans elles, « 22 » Bebas Neue retombait sur le serif par défaut).
    const fonts = await registerPdfFonts(vector.pdfFonts, vector.svg)
    // Chasse calée sur les largeurs PDF — nécessite les polices chargées.
    const fittedSvg = fitTextWidthsToPdf(vector.svg)
    const svgFile = new File([fittedSvg], `${baseNameForFile}.svg`, { type: 'image/svg+xml' })
    return {
      file: svgFile,
      width: vector.width,
      height: vector.height,
      imageUrl: '',
      storagePath: '',
      hasTextLayer: true,
      fonts,
    }
  }

  // 2) Fallback : rasterisation + calque texte pdf.js (ou OCR si aplati).
  const user = auth.currentUser
  if (!user) throw new Error(t('err.svg.signInPdf'))

  const { blob, width, height, textRuns } = await rasterizeFirstPage(pdfFile)

  const slug = slugifyFileName(pdfFile.name, 'pdf')
  const fileName = `${Date.now()}-${slug}.png`
  // Chemin sous `users/{uid}/...` : couvert par la règle générique d'accès utilisateur
  // dans storage.rules — pas besoin d'ajouter une règle dédiée.
  const storagePath = `users/${user.uid}/pdf-to-svg-sources/${fileName}`
  const ref = storageRef(storage, storagePath)

  await uploadBytes(ref, blob, {
    contentType: 'image/png',
    cacheControl: 'public, max-age=31536000',
  })
  const imageUrl = await getDownloadURL(ref)

  const safeName = escapeXml(pdfFile.name)
  const safeUrl = escapeXml(imageUrl)

  // Calque texte NATIF : chaque run du PDF devient un <text> SVG éditable, aux
  // positions/tailles/couleurs exactes du document (zéro OCR, zéro LLM). Le run
  // a déjà été effacé du raster quand son fond était uniforme.
  const hasTextLayer = textRuns.length > 0
  // <text> à la RACINE (pas de <g> enveloppant) : chaque run devient un objet
  // Fabric individuel directement sélectionnable/éditable à l'import. Le
  // commentaire pdf-text-layer sert de marqueur (EditorPage saute l'OCR).
  const textLayer = hasTextLayer
    ? `  <!-- pdf-text-layer : calque texte natif du PDF -->\n${textRuns
        .map((r) => {
          const style = [
            `font-size:${r.fontSize.toFixed(1)}px`,
            `font-family:${escapeXml(r.fontFamily)}`,
            r.bold ? 'font-weight:bold' : '',
            r.italic ? 'font-style:italic' : '',
            `fill:${r.fill}`,
          ].filter(Boolean).join(';')
          return `  <text x="${r.x.toFixed(1)}" y="${r.yBaseline.toFixed(1)}" style="${style}">${escapeXml(r.text)}</text>`
        })
        .join('\n')}\n`
    : '  <!-- Pas de calque texte natif (PDF aplati) : overlays via "Décomposer" (OCR) -->\n'

  // Calque `image-bg-locked` IDENTIQUE à imageToSvg.ts (data-role sur le <g> ET le
  // <image>) → useImageToSvgDecompose lit ce marker et décompose sans modification.
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-source-name="${safeName}" data-pipeline="pdf-to-svg-${hasTextLayer ? 'textlayer' : 'mvp'}">
  <g id="image-bg-locked" data-role="image-bg-locked">
    <image href="${safeUrl}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" data-role="image-bg-locked"/>
  </g>
${textLayer}</svg>
`

  const baseName = pdfFile.name.replace(/\.[^.]+$/, '') || 'pdf'
  const svgFile = new File([svg], `${baseName}.svg`, { type: 'image/svg+xml' })

  return { file: svgFile, width, height, imageUrl, storagePath, hasTextLayer, fonts: [] }
}
