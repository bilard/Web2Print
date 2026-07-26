// Couleurs IDML : conversion CMJN → sRGB et table des nuanciers du document.
//
// InDesign travaille en CMJN ; l'éditeur web en sRGB. La conversion n'est pas
// une formule naïve — voir le modèle de Neugebauer documenté ci-dessous — car
// un aplat 100 % noir CMJN ne donne pas #000000 à l'écran, et une conversion
// approximative se voit immédiatement sur les fonds de couleur.
import { parseXml, attr } from './idmlXml'
import type { IdmlColor } from './idmlTypes'

/**
 * CMYK → sRGB using the Neugebauer model with FOGRA39 primaries.
 *
 * The 8 Neugebauer primaries represent every combination of CMY inks
 * at 0% or 100%. Demichel equations compute area fractions for halftone
 * dot overlaps, then we blend the primary colors proportionally.
 * K is applied as a multiplicative darkening factor on top.
 *
 * FOGRA39 primary sRGB values (measured from ICC profile):
 *   W  (no ink)  : (255, 255, 255)
 *   C  (cyan)    : (  0, 158, 220)
 *   M  (magenta) : (227,   6, 118)
 *   Y  (yellow)  : (255, 236,   0)
 *   CM (blue)    : ( 80,  53, 150)
 *   CY (green)   : (  0, 152,  70)
 *   MY (red)     : (227,   6,  19)
 *   CMY          : ( 55,  40,  40)
 */
// FOGRA39 Neugebauer primaries [R, G, B]
const NB_W:   [number, number, number] = [255, 255, 255]
const NB_C:   [number, number, number] = [  0, 158, 220]
const NB_M:   [number, number, number] = [227,   6, 118]
const NB_Y:   [number, number, number] = [255, 236,   0]
const NB_CM:  [number, number, number] = [ 80,  53, 150]
const NB_CY:  [number, number, number] = [  0, 152,  70]
const NB_MY:  [number, number, number] = [227,   6,  19]
const NB_CMY: [number, number, number] = [ 55,  40,  40]

function cmykToRgb(c: number, m: number, y: number, k: number): IdmlColor {
  const C = c / 100, Y = y / 100, K = k / 100
  // Tone curve correction for magenta: compensates for halftone dot interaction
  const M = Math.pow(m / 100, 1.35)

  // Demichel equations: area fractions for each Neugebauer primary
  const c0 = 1 - C, m0 = 1 - M, y0 = 1 - Y
  const a_w   = c0 * m0 * y0   // white (no ink)
  const a_c   = C  * m0 * y0   // cyan only
  const a_m   = c0 * M  * y0   // magenta only
  const a_y   = c0 * m0 * Y    // yellow only
  const a_cm  = C  * M  * y0   // cyan + magenta
  const a_cy  = C  * m0 * Y    // cyan + yellow
  const a_my  = c0 * M  * Y    // magenta + yellow
  const a_cmy = C  * M  * Y    // all three

  // Neugebauer blend (weighted sum of 8 primaries)
  let r = 0, g = 0, b = 0
  const primaries: [[number, number, number], number][] = [
    [NB_W, a_w], [NB_C, a_c], [NB_M, a_m], [NB_Y, a_y],
    [NB_CM, a_cm], [NB_CY, a_cy], [NB_MY, a_my], [NB_CMY, a_cmy],
  ]
  for (const [rgb, a] of primaries) {
    r += a * rgb[0]
    g += a * rgb[1]
    b += a * rgb[2]
  }

  // Apply K channel: multiplicative darkening (Beer-Lambert for black ink)
  // Black 100% → sRGB(34, 30, 33), transmittance ≈ (0.133, 0.118, 0.129)
  if (K > 0) {
    r *= 1 - K * 0.867
    g *= 1 - K * 0.882
    b *= 1 - K * 0.871
  }

  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)))
  return { r: clamp(r), g: clamp(g), b: clamp(b), a: 1 }
}

export function buildColorMap(resources: Record<string, string>): Map<string, IdmlColor> {
  const map = new Map<string, IdmlColor>()
  map.set('Color/Black', { r: 0, g: 0, b: 0, a: 1 })
  map.set('Color/White', { r: 255, g: 255, b: 255, a: 1 })
  map.set('Color/Paper', { r: 255, g: 255, b: 255, a: 1 })
  map.set('Color/None', { r: 0, g: 0, b: 0, a: 0 })
  map.set('Swatch/None', { r: 0, g: 0, b: 0, a: 0 })
  map.set('$ID/None', { r: 0, g: 0, b: 0, a: 0 })
  map.set('Color/Registration', { r: 0, g: 0, b: 0, a: 1 })

  for (const [, xml] of Object.entries(resources)) {
    if (!xml.includes('<Color ')) continue
    try {
      const doc = parseXml(xml)
      const colors = doc.getElementsByTagName('Color')
      for (let i = 0; i < colors.length; i++) {
        const el = colors[i]
        const id = attr(el, 'Self')
        const space = attr(el, 'Space')
        const valStr = attr(el, 'ColorValue')
        if (!id || !valStr) continue

        // Prefer AlternateColorValue (exact RGB from InDesign's ICC conversion)
        const altSpace = attr(el, 'AlternateSpace')
        const altValStr = attr(el, 'AlternateColorValue')
        if (altSpace && altValStr && (altSpace === 'sRGB' || altSpace === 'RGB')) {
          const altVals = altValStr.trim().split(/\s+/).map(Number)
          if (altVals.length >= 3) {
            // InDesign stores AlternateColorValue as 0-255 range
            const maxVal = Math.max(...altVals.slice(0, 3))
            const isNormalized = maxVal <= 1.01 && maxVal > 0
            const factor = isNormalized ? 255 : 1
            map.set(id, {
              r: Math.round(altVals[0] * factor),
              g: Math.round(altVals[1] * factor),
              b: Math.round(altVals[2] * factor),
              a: 1,
            })
            continue
          }
        }

        const vals = valStr.trim().split(/\s+/).map(Number)
        if (space === 'CMYK' && vals.length >= 4) {
          map.set(id, cmykToRgb(vals[0], vals[1], vals[2], vals[3]))
        } else if ((space === 'RGB' || space === 'sRGB') && vals.length >= 3) {
          map.set(id, { r: Math.round(vals[0]), g: Math.round(vals[1]), b: Math.round(vals[2]), a: 1 })
        }
      }
    } catch { /* skip */ }
  }
  return map
}

