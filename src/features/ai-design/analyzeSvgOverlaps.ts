/**
 * Analyse le SVG généré pour identifier les zones de texte qui se chevauchent
 */

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
  const textElements = doc.querySelectorAll('text, tspan')

  textElements.forEach((el, idx) => {
    const x = parseFloat(el.getAttribute('x') || '0')
    const y = parseFloat(el.getAttribute('y') || '0')
    const dx = parseFloat(el.getAttribute('dx') || '0')
    const dy = parseFloat(el.getAttribute('dy') || '0')
    const text = el.textContent || ''

    // Estimer la largeur et la hauteur du texte
    // Font size: défaut 12 si absent
    const fontSize = parseFloat(el.getAttribute('font-size') || '12')
    const fontWeight = el.getAttribute('font-weight') || 'normal'

    // Approximation: 1 caractère ≈ 0.5 * fontSize en largeur
    const estimatedWidth = text.length * (fontSize * 0.5)
    const estimatedHeight = fontSize * 1.2 // line-height factor

    const zoneId = el.id || `text-${idx}`

    zones.push({
      id: zoneId,
      x: x + dx,
      y: y + dy,
      width: estimatedWidth,
      height: estimatedHeight,
      text: text.trim().substring(0, 50),
      element: el,
    })
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
