/**
 * Assembleur : template + TemplateFillData + dimensions → SVG final.
 *
 * Flow :
 *  1. Projette les bboxes normalisées (0-1) sur widthMm × heightMm.
 *  2. Substitue {{palette.X}} dans decorativeSvg.
 *  3. Émet <rect> de fond si slot texte a un backgroundRef.
 *  4. Émet <image> placeholder pour chaque image slot (le useGenerateDesign
 *     remplacera plus tard par les data URIs).
 *  5. Émet <text> pour chaque slot texte avec data-content pour le re-wrap
 *     naturel par Fabric.Textbox.
 *  6. Émet les features item par item (picto + title + desc).
 */

import type {
  Template,
  NormalizedBbox,
  TextSlot,
  ImageSlot,
  FeatureListSlot,
  Palette,
  ColorRef,
} from './types'
import type { TemplateFillData } from '../templateFillSchema'
import { resolvePicto } from './pictoLibrary'

export interface AssembleArgs {
  template: Template
  fillData: TemplateFillData
  widthMm: number
  heightMm: number
  bleedMm: number
}

/** Projette un bbox normalisé (0-1) sur les dimensions du canvas, en mm. */
function project(bbox: NormalizedBbox, widthMm: number, heightMm: number) {
  return {
    x: bbox.x * widthMm,
    y: bbox.y * heightMm,
    w: bbox.w * widthMm,
    h: bbox.h * heightMm,
  }
}

/** Résout une référence couleur en hex. */
function resolveColor(ref: ColorRef, palette: Palette): string {
  switch (ref) {
    case 'primary': return palette.primary
    case 'secondary': return palette.secondary
    case 'neutral': return palette.neutral
    case 'text': return palette.text
    case 'white': return '#FFFFFF'
    case 'black': return '#000000'
    default:
      // hex littéral ou clé inconnue : on retourne la valeur telle quelle.
      return ref
  }
}

/** Substitue {{palette.primary}} etc. dans le SVG décoratif. */
function substitutePalette(svg: string, palette: Palette): string {
  return svg
    .replace(/\{\{palette\.primary\}\}/g, palette.primary)
    .replace(/\{\{palette\.secondary\}\}/g, palette.secondary)
    .replace(/\{\{palette\.neutral\}\}/g, palette.neutral)
    .replace(/\{\{palette\.text\}\}/g, palette.text)
}

/**
 * Scale une taille pt selon la surface du canvas par rapport à la surface A4.
 * Un template est designé pour A4 (210×297 mm) ; pour un canvas plus petit/grand,
 * on scale les fontSize au pro-rata de la racine carrée du ratio de surfaces
 * (préserve la proportion visuelle sans créer des textes démesurés sur grand format).
 */
const A4_AREA_MM2 = 210 * 297

function scaleFontSize(baseSizePt: number, widthMm: number, heightMm: number): number {
  const area = widthMm * heightMm
  const ratio = Math.sqrt(area / A4_AREA_MM2)
  return baseSizePt * ratio
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Encode \n en &#10; pour survivre à la sérialisation XML d'attribut. */
function encodeDataContent(v: string): string {
  return escapeAttr(v).replace(/\n/g, '&#10;')
}

interface EmittedPart {
  zIndex: number
  svg: string
}

function emitImageSlot(
  id: string,
  slot: ImageSlot,
  widthMm: number,
  heightMm: number,
  palette: Palette,
  fallbackToPicto: boolean,
): EmittedPart[] {
  const box = project(slot.bbox, widthMm, heightMm)
  // Image placeholder — sera remplacé par un data URI au stade slot-fill.
  const img = `<image id="${escapeAttr(id)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" href="placeholder:${escapeAttr(id)}" preserveAspectRatio="${slot.preserveAspectRatio === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}"/>`
  const parts: EmittedPart[] = [{ zIndex: 50, svg: img }]

  if (fallbackToPicto && slot.fallbackPictoKey) {
    const picto = resolvePicto(slot.fallbackPictoKey)
    if (picto) {
      parts.push({
        zIndex: 40,
        svg: `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="0 0 24 24" color="${resolveColor('text', palette)}">${picto.content}</svg>`,
      })
    }
  }

  return parts
}

function emitTextSlot(
  id: string,
  slot: TextSlot,
  content: string,
  palette: Palette,
  widthMm: number,
  heightMm: number,
  fontFamily: string,
): EmittedPart[] {
  const box = project(slot.bbox, widthMm, heightMm)
  const parts: EmittedPart[] = []

  // Rect de fond pour les slots CTA/price-badge qui en définissent un.
  if (slot.backgroundRef) {
    const bgColor = resolveColor(slot.backgroundRef, palette)
    parts.push({
      zIndex: 20,
      svg: `<rect id="${escapeAttr(id)}-bg" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${escapeAttr(bgColor)}" stroke="none" data-role="slot-background"/>`,
    })
  }

  const fontSizePt = scaleFontSize(slot.fontSize, widthMm, heightMm)
  const fontSizeMm = fontSizePt * 0.3528

  const textAnchor = slot.align === 'center' ? 'middle' : slot.align === 'right' ? 'end' : 'start'
  const anchorX =
    slot.align === 'center' ? box.x + box.w / 2
    : slot.align === 'right' ? box.x + box.w
    : box.x

  // Positionnement baseline : centré verticalement dans la bbox pour les textes
  // à 1 ligne (cas typique title/subtitle/cta/price). Le Textbox re-wrap naturel.
  const verticalCenter = box.y + box.h / 2
  const baselineY = verticalCenter + fontSizeMm * 0.35

  const fillColor = resolveColor(slot.colorRef, palette)
  const decoAttr = slot.decoration ? ` text-decoration="${slot.decoration}"` : ''
  const dataContent = ` data-content="${encodeDataContent(content)}"`

  const attrs = `font-family="${escapeAttr(fontFamily)}" font-size="${fontSizeMm}" font-weight="${slot.fontWeight}" fill="${escapeAttr(fillColor)}" text-anchor="${textAnchor}" width="${box.w}"${decoAttr}${dataContent}`

  parts.push({
    zIndex: 70,
    svg: `<text id="${escapeAttr(id)}" x="${anchorX}" y="${baselineY}" ${attrs}>${escapeText(content)}</text>`,
  })

  return parts
}

function emitFeatureList(
  listSlot: FeatureListSlot,
  features: TemplateFillData['copy']['features'],
  palette: Palette,
  widthMm: number,
  heightMm: number,
  bodyFont: string,
): EmittedPart[] {
  const parts: EmittedPart[] = []
  const container = project(listSlot.container, widthMm, heightMm)
  const items = features.slice(0, listSlot.maxItems)
  if (items.length === 0) return parts

  // Calcul de la bbox de chaque item.
  const layoutRows = listSlot.layout === 'grid-2col' ? Math.ceil(items.length / 2) : items.length
  const itemH = container.h / layoutRows
  const itemW = listSlot.layout === 'grid-2col' ? container.w / 2 : container.w

  items.forEach((feature, i) => {
    const row = listSlot.layout === 'grid-2col' ? Math.floor(i / 2) : i
    const col = listSlot.layout === 'grid-2col' ? i % 2 : 0
    const itemOriginX = container.x + col * itemW
    const itemOriginY = container.y + row * itemH

    const templateItem = listSlot.itemTemplate

    // Picto — fallback sur pictoLibrary si pictoHint matche, sinon fallbackPictoKey du template.
    const pictoKey = feature.pictoHint ?? templateItem.picto.fallbackPictoKey
    const picto = resolvePicto(pictoKey)
    if (picto) {
      const pb = templateItem.picto.bbox
      const px = itemOriginX + pb.x * itemW
      const py = itemOriginY + pb.y * itemH
      const pw = pb.w * itemW
      const ph = pb.h * itemH
      parts.push({
        zIndex: 60,
        svg: `<svg id="feature-${i}-picto" x="${px}" y="${py}" width="${pw}" height="${ph}" viewBox="0 0 24 24" color="${resolveColor('primary', palette)}">${picto.content}</svg>`,
      })
    }

    // Title — émis comme un TextSlot synthétisé.
    const titleBox = templateItem.title.bbox
    const titleSlot: TextSlot = {
      bbox: {
        x: (itemOriginX + titleBox.x * itemW) / widthMm,
        y: (itemOriginY + titleBox.y * itemH) / heightMm,
        w: (titleBox.w * itemW) / widthMm,
        h: (titleBox.h * itemH) / heightMm,
      },
      role: 'body',
      fontFamily: 'body',
      fontSize: templateItem.title.fontSize,
      fontWeight: templateItem.title.fontWeight,
      align: 'left',
      colorRef: templateItem.title.colorRef,
    }
    parts.push(...emitTextSlot(`feature-${i}-title`, titleSlot, feature.title, palette, widthMm, heightMm, bodyFont))

    // Desc — idem.
    const descBox = templateItem.desc.bbox
    const descSlot: TextSlot = {
      bbox: {
        x: (itemOriginX + descBox.x * itemW) / widthMm,
        y: (itemOriginY + descBox.y * itemH) / heightMm,
        w: (descBox.w * itemW) / widthMm,
        h: (descBox.h * itemH) / heightMm,
      },
      role: 'body',
      fontFamily: 'body',
      fontSize: templateItem.desc.fontSize,
      fontWeight: templateItem.desc.fontWeight,
      align: 'left',
      colorRef: templateItem.desc.colorRef,
    }
    parts.push(...emitTextSlot(`feature-${i}-desc`, descSlot, feature.desc, palette, widthMm, heightMm, bodyFont))
  })

  return parts
}

export function assembleSvgFromTemplate(args: AssembleArgs): string {
  const { template, fillData, widthMm, heightMm, bleedMm } = args
  const palette = fillData.palette

  const parts: EmittedPart[] = []

  // Fond neutre full-canvas (palette.neutral) — non-sélectionnable.
  parts.push({
    zIndex: 0,
    svg: `<rect x="${-bleedMm}" y="${-bleedMm}" width="${widthMm + 2 * bleedMm}" height="${heightMm + 2 * bleedMm}" fill="${escapeAttr(palette.neutral)}" stroke="none" data-role="background-decor"/>`,
  })

  // SVG décoratif du template (coords en % du viewBox, substitution palette).
  const decorSvg = substitutePalette(template.decorativeSvg, palette)
  parts.push({ zIndex: 10, svg: decorSvg })

  const heroFont = template.fonts.hero
  const bodyFont = template.fonts.body
  const resolveFont = (f: 'hero' | 'body') => (f === 'hero' ? heroFont : bodyFont)

  // Image slots
  if (template.slots.logo) {
    const hasAsset = fillData.assetMappings.logo !== undefined
    parts.push(...emitImageSlot('logo', template.slots.logo, widthMm, heightMm, palette, !hasAsset))
  }
  if (template.slots.badge) {
    const hasAsset = fillData.assetMappings.badge !== undefined
    parts.push(...emitImageSlot('badge', template.slots.badge, widthMm, heightMm, palette, !hasAsset))
  }
  if (template.slots.heroProduct) {
    const hasAsset = fillData.assetMappings.heroProduct !== undefined
    parts.push(...emitImageSlot('heroProduct', template.slots.heroProduct, widthMm, heightMm, palette, !hasAsset))
  }

  // Text slots
  if (template.slots.title) {
    parts.push(...emitTextSlot('title', template.slots.title, fillData.copy.title, palette, widthMm, heightMm, resolveFont(template.slots.title.fontFamily)))
  }
  if (template.slots.subtitle && fillData.copy.subtitle) {
    parts.push(...emitTextSlot('subtitle', template.slots.subtitle, fillData.copy.subtitle, palette, widthMm, heightMm, resolveFont(template.slots.subtitle.fontFamily)))
  }
  if (template.slots.priceNew && fillData.copy.priceNew) {
    parts.push(...emitTextSlot('priceNew', template.slots.priceNew, fillData.copy.priceNew, palette, widthMm, heightMm, resolveFont(template.slots.priceNew.fontFamily)))
  }
  if (template.slots.priceOld && fillData.copy.priceOld) {
    parts.push(...emitTextSlot('priceOld', template.slots.priceOld, fillData.copy.priceOld, palette, widthMm, heightMm, resolveFont(template.slots.priceOld.fontFamily)))
  }
  if (template.slots.cta && fillData.copy.cta) {
    parts.push(...emitTextSlot('cta', template.slots.cta, fillData.copy.cta, palette, widthMm, heightMm, resolveFont(template.slots.cta.fontFamily)))
  }
  if (template.slots.mentions && fillData.copy.mentions) {
    parts.push(...emitTextSlot('mentions', template.slots.mentions, fillData.copy.mentions, palette, widthMm, heightMm, resolveFont(template.slots.mentions.fontFamily)))
  }

  // Features list
  if (template.slots.features && fillData.copy.features.length > 0) {
    parts.push(...emitFeatureList(template.slots.features, fillData.copy.features, palette, widthMm, heightMm, bodyFont))
  }

  // Tri par zIndex (stable) pour garantir l'ordre de rendu.
  parts.sort((a, b) => a.zIndex - b.zIndex)

  const viewBox = `${-bleedMm} ${-bleedMm} ${widthMm + 2 * bleedMm} ${heightMm + 2 * bleedMm}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${parts.map((p) => p.svg).join('')}</svg>`
}
