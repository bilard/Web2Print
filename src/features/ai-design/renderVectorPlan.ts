/**
 * Rend un SVG multi-calques où :
 *  - Layer 1 (fond, plein cadre) : image Nano Banana intacte → visuel 100 % fidèle
 *  - Layer 2 (hitboxes invisibles) : rectangles transparents sélectionnables dans
 *    Fabric pour permettre à l'utilisateur de cliquer sur un texte / zone image
 *    et déclencher une édition. L'apparence visuelle n'est PAS modifiée par ces
 *    hitboxes — elles servent uniquement à l'interactivité.
 *
 * Le contrat fort : ce que l'utilisateur voit = l'image Gemini, sans aucune altération.
 */

import type { DesignPlan } from './artDirectorSchema'
import type { VectorMatchPlan } from './vectorizeImage'

interface RenderArgs {
  plan: DesignPlan
  match: VectorMatchPlan
  widthMm: number
  heightMm: number
  includeBleed: boolean
  bleedMm: number
  nanobananaImageUri: string
  /** Images produit scrapées depuis le site fournisseur, prêtes à être posées
   *  dans leur zone respective (remplace le hitbox transparent). */
  productAssets?: Array<{ type: string; dataUri: string; title?: string }>
}

export function renderVectorPlan(args: RenderArgs): string {
  const {
    plan,
    match,
    widthMm,
    heightMm,
    includeBleed,
    bleedMm,
    nanobananaImageUri,
    productAssets = [],
  } = args
  const overflow = includeBleed ? bleedMm : 0
  const vbX = -overflow
  const vbY = -overflow
  const vbW = widthMm + 2 * overflow
  const vbH = heightMm + 2 * overflow

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">`)

  // Layer 1 : image Nano Banana intacte, plein cadre.
  parts.push(
    `<image id="nanobanana-bg" x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" href="${escapeAttr(nanobananaImageUri)}" preserveAspectRatio="xMidYMid slice"/>`,
  )

  // Layer 2 : zones image éditables. Si on a scrapé des assets produit, on
  // pose l'asset correspondant dans la zone détectée (calque superposé sur
  // la zone produit de l'image Gemini). Sinon, hitbox transparent sélectionnable.
  match.imageRegions.forEach((region, i) => {
    const productAsset = productAssets[i] // simple mapping 1-1 par ordre
    if (productAsset) {
      parts.push(
        `<image id="${escapeAttr(region.id)}" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" href="${escapeAttr(productAsset.dataUri)}" preserveAspectRatio="xMidYMid meet"/>`,
      )
    } else {
      parts.push(
        `<rect id="${escapeAttr(region.id)}-hitbox" class="editable-image-hitbox" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" fill="#FFFFFF" opacity="0.001"/>`,
      )
    }
  })

  // Layer 3 : hitboxes texte (invisibles, sélectionnables dans Fabric). Chaque
  // zone de texte du plan devient un objet cliquable. Quand l'utilisateur double-clique,
  // l'interface peut ouvrir un éditeur de texte. Ne modifie PAS le rendu visuel.
  const matchByZoneId = new Map(match.texts.map((t) => [t.zoneId, t]))
  const textRoles = new Set(['title', 'subtitle', 'body', 'cta', 'price'])
  for (const zone of plan.zones) {
    if (!textRoles.has(zone.role)) continue
    if (!zone.content || zone.content.trim() === '') continue
    const m = matchByZoneId.get(zone.id)
    const x = m?.x ?? zone.bboxMm.x
    const y = m?.y ?? zone.bboxMm.y
    const w = m?.w ?? zone.bboxMm.w
    const h = m?.h ?? zone.bboxMm.h
    parts.push(
      `<rect id="${escapeAttr(zone.id)}-text-hitbox" class="editable-text-hitbox" x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" opacity="0.001"/>`,
    )
  }

  parts.push('</svg>')
  return parts.join('')
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
