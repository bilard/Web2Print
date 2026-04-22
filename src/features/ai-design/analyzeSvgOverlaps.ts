/**
 * Analyse le SVG généré pour identifier les zones de texte qui se chevauchent
 */

import type { DesignPlan } from './artDirectorSchema'

export interface TextZone {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  element: Element
}

export interface Overlap {
  zone1Id: string
  zone2Id: string
  overlapArea: number
}

export interface PlanVsSvgComparison {
  plannedZone: {
    id: string
    role: string
    x: number
    y: number
    w: number
    h: number
  }
  actualZone: TextZone | null
  matched: boolean
  deviation?: {
    dx: number
    dy: number
    dw: number
    dh: number
  }
}

/**
 * Extrait toutes les zones de texte du SVG
 */
export function extractTextZones(svgString: string): TextZone[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgString, 'image/svg+xml')

  if (doc.documentElement.tagName === 'parsererror') {
    console.error('[analyzeSvgOverlaps] SVG parse error')
    return []
  }

  const zones: TextZone[] = []
  const textElements = doc.querySelectorAll('text')

  textElements.forEach((textEl, idx) => {
    // Récupérer la position du <text> parent
    let parentX = parseFloat(textEl.getAttribute('x') || '')
    let parentY = parseFloat(textEl.getAttribute('y') || '')

    // Récupérer la taille de police
    const parentFontSize = parseFloat(textEl.getAttribute('font-size') || '12')
    const textAnchor = textEl.getAttribute('text-anchor') || 'start'
    const fontFamily = textEl.getAttribute('font-family') || 'Arial'
    const isMonospace = fontFamily.toLowerCase().includes('mono') || fontFamily.toLowerCase().includes('courier')
    const charWidth = isMonospace ? parentFontSize * 0.6 : parentFontSize * 0.5

    // Récupérer les tspan
    const tspans = Array.from(textEl.querySelectorAll('tspan'))

    if (tspans.length > 0) {
      // Si y a des tspan, utiliser leurs coordonnées individuelles
      tspans.forEach((tspan, tspanIdx) => {
        const tspanX = parseFloat(tspan.getAttribute('x') || '')
        const tspanY = parseFloat(tspan.getAttribute('y') || '')
        const tspanFontSize = parseFloat(tspan.getAttribute('font-size') || parentFontSize)

        const text = tspan.textContent || ''
        const estimatedWidth = text.length * charWidth
        const estimatedHeight = tspanFontSize * 1.2

        let adjustedX = isNaN(tspanX) ? (isNaN(parentX) ? 0 : parentX) : tspanX
        const adjustedY = isNaN(tspanY) ? (isNaN(parentY) ? 0 : parentY) : tspanY

        // Ajuster X selon text-anchor
        if (textAnchor === 'middle') {
          adjustedX = adjustedX - (estimatedWidth / 2)
        } else if (textAnchor === 'end') {
          adjustedX = adjustedX - estimatedWidth
        }

        const zoneId = tspan.id || `${textEl.id || `text-${idx}`}-tspan${tspanIdx}`

        zones.push({
          id: zoneId,
          x: adjustedX,
          y: adjustedY,
          width: Math.max(estimatedWidth, 1),
          height: Math.max(estimatedHeight, tspanFontSize * 0.8),
          text: text.substring(0, 60),
          element: tspan,
        })
      })
    } else {
      // Si pas de tspan, utiliser le texte du parent
      const allText = textEl.textContent || ''
      const estimatedWidth = allText.length * charWidth
      const estimatedHeight = parentFontSize * 1.2

      let adjustedX = isNaN(parentX) ? 0 : parentX
      const adjustedY = isNaN(parentY) ? 0 : parentY

      // Ajuster X selon text-anchor
      if (textAnchor === 'middle') {
        adjustedX = adjustedX - (estimatedWidth / 2)
      } else if (textAnchor === 'end') {
        adjustedX = adjustedX - estimatedWidth
      }

      const zoneId = textEl.id || `text-${idx}`

      zones.push({
        id: zoneId,
        x: adjustedX,
        y: adjustedY,
        width: Math.max(estimatedWidth, 1),
        height: Math.max(estimatedHeight, parentFontSize * 0.8),
        text: allText.substring(0, 60).replace(/\n/g, ' '),
        element: textEl,
      })
    }
  })

  return zones
}

/**
 * Vérifie si deux zones se chevauchent
 */
function doZonesOverlap(zone1: TextZone, zone2: TextZone): boolean {
  return !(
    zone1.x + zone1.width < zone2.x ||
    zone2.x + zone2.width < zone1.x ||
    zone1.y + zone1.height < zone2.y ||
    zone2.y + zone2.height < zone1.y
  )
}

/**
 * Calcule la surface de chevauchement
 */
function calculateOverlapArea(zone1: TextZone, zone2: TextZone): number {
  if (!doZonesOverlap(zone1, zone2)) return 0

  const overlapX = Math.min(zone1.x + zone1.width, zone2.x + zone2.width) - Math.max(zone1.x, zone2.x)
  const overlapY = Math.min(zone1.y + zone1.height, zone2.y + zone2.height) - Math.max(zone1.y, zone2.y)

  return Math.max(0, overlapX) * Math.max(0, overlapY)
}

/**
 * Analyse tous les chevauchements possibles
 */
export function findOverlaps(zones: TextZone[]): Overlap[] {
  const overlaps: Overlap[] = []

  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const overlapArea = calculateOverlapArea(zones[i], zones[j])
      if (overlapArea > 0) {
        overlaps.push({
          zone1Id: zones[i].id,
          zone2Id: zones[j].id,
          overlapArea,
        })
      }
    }
  }

  // Trier par surface de chevauchement (plus grand d'abord)
  overlaps.sort((a, b) => b.overlapArea - a.overlapArea)

  return overlaps
}

/**
 * Affiche un rapport d'analyse complet
 */
export function analyzeAndReport(svgString: string): {
  zones: TextZone[]
  overlaps: Overlap[]
  hasIssues: boolean
} {
  console.group('[SVG Analysis] Overlap Detection Report')

  const zones = extractTextZones(svgString)
  console.log(`✓ Extracted ${zones.length} text zones from SVG`)

  // Afficher les zones
  console.table(
    zones.map((z) => ({
      'Zone ID': z.id,
      'X (mm)': z.x.toFixed(2),
      'Y (mm)': z.y.toFixed(2),
      'Width (mm)': z.width.toFixed(2),
      'Height (mm)': z.height.toFixed(2),
      'Text': z.text.substring(0, 30),
    }))
  )

  // Analyser les chevauchements
  const overlaps = findOverlaps(zones)

  if (overlaps.length === 0) {
    console.log('✓ No overlaps detected!')
  } else {
    console.warn(`⚠️  ${overlaps.length} overlap(s) detected:`)
    console.table(
      overlaps.map((o) => ({
        'Zone 1': o.zone1Id,
        'Zone 2': o.zone2Id,
        'Overlap Area (mm²)': o.overlapArea.toFixed(2),
      }))
    )

    // Détailler chaque chevauchement
    console.log('\n📊 Detailed Overlap Analysis:')
    for (const overlap of overlaps.slice(0, 5)) {
      const z1 = zones.find(z => z.id === overlap.zone1Id)
      const z2 = zones.find(z => z.id === overlap.zone2Id)
      if (z1 && z2) {
        const msg = `  ${z1.id} [${z1.x.toFixed(1)},${z1.y.toFixed(1)},${z1.width.toFixed(1)}×${z1.height.toFixed(1)}] ` +
                    `↔ ${z2.id} [${z2.x.toFixed(1)},${z2.y.toFixed(1)},${z2.width.toFixed(1)}×${z2.height.toFixed(1)}]`
        console.warn(msg)
      }
    }
  }

  // Dump le SVG pour inspection manuelle
  console.log('\n📄 SVG Structure (first 2000 chars):')
  console.log(svgString.substring(0, 2000))

  console.groupEnd()

  return {
    zones,
    overlaps,
    hasIssues: overlaps.length > 0,
  }
}

/**
 * Compar le plan Art Director avec le SVG généré pour identifier les déviation
 */
export function compareWithPlan(svgString: string, plan: DesignPlan): PlanVsSvgComparison[] {
  const svgZones = extractTextZones(svgString)

  return plan.zones.map((plannedZone) => {
    // Chercher une zone correspondante dans le SVG (par proximité de coordonnées)
    // Tolérance: 5mm de déviation
    const tolerance = 5
    const matchedZone = svgZones.find(
      (z) =>
        Math.abs(z.x - plannedZone.bboxMm.x) < tolerance &&
        Math.abs(z.y - plannedZone.bboxMm.y) < tolerance
    )

    const comparison: PlanVsSvgComparison = {
      plannedZone: {
        id: plannedZone.id,
        role: plannedZone.role,
        x: plannedZone.bboxMm.x,
        y: plannedZone.bboxMm.y,
        w: plannedZone.bboxMm.w,
        h: plannedZone.bboxMm.h,
      },
      actualZone: matchedZone || null,
      matched: !!matchedZone,
    }

    if (matchedZone) {
      comparison.deviation = {
        dx: matchedZone.x - plannedZone.bboxMm.x,
        dy: matchedZone.y - plannedZone.bboxMm.y,
        dw: matchedZone.width - plannedZone.bboxMm.w,
        dh: matchedZone.height - plannedZone.bboxMm.h,
      }
    }

    return comparison
  })
}
