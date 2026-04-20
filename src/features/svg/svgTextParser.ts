/**
 * SVG Text Parser
 * Extracts text elements with width constraints, including all tspan children
 * and their individual styles for later conversion to Fabric.js textboxes.
 */

/**
 * All SVG text styling attributes that can be applied to text/tspan
 */
export interface TextStyle {
  fill?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  fontStyle?: string
  textDecoration?: string
  baselineShift?: number
  letterSpacing?: number
}

/**
 * Information about a single tspan element
 */
export interface TspanInfo {
  textContent: string
  styles: TextStyle
  cumulativeStart: number
  cumulativeEnd: number
}

/**
 * Metadata for a text element with width constraint
 */
export interface TextMetadata {
  width?: number
  tspans: TspanInfo[]
}

/**
 * Map SVG attribute names to TextStyle property names
 */
const STYLE_ATTRIBUTE_MAP: Record<string, keyof TextStyle> = {
  fill: 'fill',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'text-decoration': 'textDecoration',
  'baseline-shift': 'baselineShift',
  'letter-spacing': 'letterSpacing',
}

/**
 * Attributes that should be parsed as numbers
 */
const NUMERIC_ATTRIBUTES = new Set(['font-size', 'baseline-shift', 'letter-spacing'])

/**
 * Extract style attributes from an SVG element
 * @param el - The XML element to extract styles from
 * @returns TextStyle object with all extracted styles
 */
function extractStyles(el: Element): TextStyle {
  const styles: TextStyle = {}

  // Extract all attributes that map to TextStyle
  for (const [attrName, styleProp] of Object.entries(STYLE_ATTRIBUTE_MAP)) {
    const value = el.getAttribute(attrName)
    if (value !== null) {
      if (NUMERIC_ATTRIBUTES.has(attrName)) {
        const numValue = parseFloat(value)
        if (!isNaN(numValue)) {
          ;(styles[styleProp] as unknown) = numValue
        }
      } else {
        ;(styles[styleProp] as unknown) = value
      }
    }
  }

  return styles
}

/**
 * Parse SVG string and extract all text elements that have a width attribute
 * @param svgText - SVG as string
 * @returns Array of TextMetadata objects with parsed tspans
 */
export function parseTextElements(svgText: string): TextMetadata[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'text/xml')

  const results: TextMetadata[] = []

  // Find all <text> elements
  const textElements = doc.querySelectorAll('text')

  textElements.forEach((textEl) => {
    const widthAttr = textEl.getAttribute('width')

    // Only include text elements that have a width attribute
    if (widthAttr === null) {
      return
    }

    const width = parseFloat(widthAttr)

    const tspans: TspanInfo[] = []
    let cumulativePos = 0

    // Get all child tspan elements
    const tspanElements = Array.from(textEl.querySelectorAll(':scope > tspan'))

    if (tspanElements.length === 0) {
      // If no tspan children, treat the text element itself as one tspan
      const textContent = textEl.textContent || ''
      const styles = extractStyles(textEl)
      tspans.push({
        textContent,
        styles,
        cumulativeStart: 0,
        cumulativeEnd: textContent.length,
      })
    } else {
      // Process each tspan child
      tspanElements.forEach((tspanEl) => {
        const textContent = tspanEl.textContent || ''
        const styles = extractStyles(tspanEl)

        tspans.push({
          textContent,
          styles,
          cumulativeStart: cumulativePos,
          cumulativeEnd: cumulativePos + textContent.length,
        })

        cumulativePos += textContent.length
      })
    }

    results.push({
      width,
      tspans,
    })
  })

  return results
}
