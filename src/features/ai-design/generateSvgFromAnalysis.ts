/**
 * Génère un SVG éditable basé sur l'analyse d'une image de design.
 * Le SVG respecte 100% le design original et supporte:
 * - Texte éditable (conserve font, couleur, position)
 * - Images remplaçables (placeholders avec slot data)
 * - Structure complète du design
 */

import type { DesignAnalysis } from './analyzeDesignImage'

export interface EditableSvg {
  svg: string
  editableElements: Array<{
    id: string
    type: 'text' | 'image'
    bbox: { x: number; y: number; w: number; h: number }
    properties: Record<string, unknown>
  }>
}

export function generateSvgFromAnalysis(analysis: DesignAnalysis, widthMm: number, heightMm: number): EditableSvg {
  const scale = widthMm / analysis.layout.width
  const svgWidth = widthMm
  const svgHeight = heightMm

  // Build SVG parts
  const parts: string[] = []

  // Background
  parts.push(`<rect x="0" y="0" width="100%" height="100%" fill="${analysis.colors.background}" />`)

  // Render elements in order (bottom to top: shapes, images, text)
  const shapeElements = analysis.elements.filter((e) => ['box', 'shape'].includes(e.type))
  const imageElements = analysis.elements.filter((e) => e.type === 'image')
  const textElements = analysis.elements.filter((e) => e.type === 'text')
  const logoElements = analysis.elements.filter((e) => e.type === 'logo')
  const iconElements = analysis.elements.filter((e) => e.type === 'icon')

  // Shapes (backgrounds, boxes)
  for (const elem of shapeElements) {
    const { x, y, w, h } = elem.bbox
    const xPx = (x / 100) * svgWidth
    const yPx = (y / 100) * svgHeight
    const wPx = (w / 100) * svgWidth
    const hPx = (h / 100) * svgHeight

    const fill = (elem.properties.fill as string) || analysis.colors.primary
    const stroke = (elem.properties.stroke as string) || 'none'

    parts.push(
      `<rect x="${xPx}" y="${yPx}" width="${wPx}" height="${hPx}" fill="${fill}" stroke="${stroke}" stroke-width="1" />`
    )
  }

  // Images (editable image slots)
  const editableElements: EditableSvg['editableElements'] = []

  for (const elem of imageElements) {
    const { x, y, w, h } = elem.bbox
    const xPx = (x / 100) * svgWidth
    const yPx = (y / 100) * svgHeight
    const wPx = (w / 100) * svgWidth
    const hPx = (h / 100) * svgHeight

    // Placeholder rect with data attributes
    parts.push(
      `<g id="${elem.id}" data-role="image-slot" data-editable="true">` +
        `<rect x="${xPx}" y="${yPx}" width="${wPx}" height="${hPx}" fill="#f0f0f0" stroke="#cccccc" stroke-width="1" stroke-dasharray="5,5" />` +
        `<text x="${xPx + wPx / 2}" y="${yPx + hPx / 2}" text-anchor="middle" dominant-baseline="middle" fill="#999" font-size="12">Image</text>` +
        `</g>`
    )

    editableElements.push({
      id: elem.id,
      type: 'image',
      bbox: elem.bbox,
      properties: elem.properties,
    })
  }

  // Logos (same as images but styled differently)
  for (const elem of logoElements) {
    const { x, y, w, h } = elem.bbox
    const xPx = (x / 100) * svgWidth
    const yPx = (y / 100) * svgHeight
    const wPx = (w / 100) * svgWidth
    const hPx = (h / 100) * svgHeight

    parts.push(
      `<g id="${elem.id}" data-role="logo-slot" data-editable="true">` +
        `<rect x="${xPx}" y="${yPx}" width="${wPx}" height="${hPx}" fill="transparent" stroke="#999" stroke-width="1" stroke-dasharray="3,3" />` +
        `</g>`
    )

    editableElements.push({
      id: elem.id,
      type: 'image',
      bbox: elem.bbox,
      properties: elem.properties,
    })
  }

  // Icons (small image placeholders)
  for (const elem of iconElements) {
    const { x, y, w, h } = elem.bbox
    const xPx = (x / 100) * svgWidth
    const yPx = (y / 100) * svgHeight
    const wPx = (w / 100) * svgWidth
    const hPx = (h / 100) * svgHeight

    parts.push(
      `<g id="${elem.id}" data-role="icon-slot">` +
        `<circle cx="${xPx + wPx / 2}" cy="${yPx + hPx / 2}" r="${Math.min(wPx, hPx) / 2}" fill="none" stroke="#ddd" stroke-width="1" />` +
        `</g>`
    )
  }

  // Text elements (editable)
  for (const typog of analysis.typography) {
    const elem = analysis.elements.find((e) => e.id === typog.elementId)
    if (!elem) continue

    const { x, y, w, h } = elem.bbox
    const xPx = (x / 100) * svgWidth
    const yPx = (y / 100) * svgHeight
    const wPx = (w / 100) * svgWidth
    const hPx = (h / 100) * svgHeight

    const fontSize = typog.fontSize * scale
    const textAnchor = typog.align === 'center' ? 'middle' : typog.align === 'right' ? 'end' : 'start'
    const textX =
      typog.align === 'center'
        ? xPx + wPx / 2
        : typog.align === 'right'
          ? xPx + wPx
          : xPx

    parts.push(
      `<text id="${typog.elementId}" x="${textX}" y="${yPx + hPx / 2}" ` +
        `font-family="${typog.fontFamily}" font-size="${fontSize}" font-weight="${typog.fontWeight}" ` +
        `fill="${typog.color}" text-anchor="${textAnchor}" dominant-baseline="middle" ` +
        `data-editable="true" data-role="text-slot">${escapeXml(typog.text)}</text>`
    )

    editableElements.push({
      id: typog.elementId,
      type: 'text',
      bbox: elem.bbox,
      properties: {
        fontFamily: typog.fontFamily,
        fontSize,
        fontWeight: typog.fontWeight,
        color: typog.color,
        align: typog.align,
      },
    })
  }

  const svg = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
${parts.join('\n')}
</svg>`

  return { svg, editableElements }
}

function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case "'":
        return '&apos;'
      case '"':
        return '&quot;'
      default:
        return c
    }
  })
}
