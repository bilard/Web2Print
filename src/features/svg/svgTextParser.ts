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
  baselineShift?: string | number
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
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  tspans: TspanInfo[]
  /** True if the <text> has data-paragraph="true" (emitted by buildSvgFromPlan).
   *  Signale que les tspans représentent des lignes distinctes d'un paragraphe
   *  unique — la reconstruction doit les joindre par \n plutôt que les concaténer. */
  paragraph?: boolean
  /** Contenu ORIGINAL fourni par l'émetteur (attribut `data-content`). Présent
   *  pour les SVG générés par `buildSvgFromPlan` — permet de passer le texte
   *  non-wrappé à Fabric.Textbox afin qu'il re-wrappe naturellement à sa largeur
   *  plutôt que de subir les sauts de ligne forcés issus des tspans auto-wrappées. */
  content?: string
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
const NUMERIC_ATTRIBUTES = new Set(['font-size', 'letter-spacing'])

/**
 * Extract style attributes from an SVG element, including computed styles
 * SVG attributes take precedence over computed CSS styles.
 * @param el - The XML element to extract styles from
 * @returns TextStyle object with all extracted styles
 */
function extractStyles(el: Element): TextStyle {
  const styles: TextStyle = {}

  // Try to get computed styles (if available in DOM context)
  let computedStyleMap: Record<string, string> = {}
  try {
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const computed = window.getComputedStyle(el)
      // Map CSS properties to TextStyle properties
      computedStyleMap = {
        fill: computed.fill || '',
        fontFamily: computed.fontFamily || '',
        fontSize: computed.fontSize || '',
        fontWeight: computed.fontWeight || '',
        fontStyle: computed.fontStyle || '',
        textDecoration: computed.textDecoration || '',
        baselineShift: computed.baselineShift || '',
        letterSpacing: computed.letterSpacing || '',
      }
    }
  } catch {
    // If getComputedStyle fails, continue with attribute extraction
  }

  // Extract attributes (takes precedence over computed styles)
  for (const [attrName, styleProp] of Object.entries(STYLE_ATTRIBUTE_MAP)) {
    let value = el.getAttribute(attrName)

    // Fall back to computed style if attribute not set
    if (value === null && computedStyleMap[styleProp]) {
      value = computedStyleMap[styleProp]
    }

    if (value !== null && value !== '') {
      if (NUMERIC_ATTRIBUTES.has(attrName)) {
        const numValue = parseFloat(value)
        if (!isNaN(numValue)) {
          ;(styles[styleProp] as unknown) = numValue
        }
      } else if (attrName === 'baseline-shift') {
        // baselineShift can be a string ("super", "sub") or a number
        const numValue = parseFloat(value)
        if (!isNaN(numValue)) {
          ;(styles[styleProp] as unknown) = numValue
        } else {
          ;(styles[styleProp] as unknown) = value
        }
      } else {
        ;(styles[styleProp] as unknown) = value
      }
    }
  }

  return styles
}

/**
 * Recursively extract all tspan elements from a parent element
 * @param el - Parent element to search
 * @returns Array of tspan elements in document order
 */
function getAllTspanDescendants(el: Element): Element[] {
  const tspans: Element[] = []
  const stack = Array.from(el.children)

  while (stack.length > 0) {
    const current = stack.shift()!
    if (current.tagName.toLowerCase() === 'tspan') {
      tspans.push(current)
    }
    // Add children to stack for recursive traversal
    stack.unshift(...Array.from(current.children))
  }

  return tspans
}

/**
 * Parse SVG string and extract all text elements that have a width attribute
 * Recursively extracts all tspan descendants and their styles.
 * @param svgText - SVG as string
 * @returns Array of TextMetadata objects with parsed tspans
 */
export function parseTextElements(svgText: string): TextMetadata[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')

  const cssRules = parseStyleRules(doc)
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

    // Get all tspan descendants (recursively)
    const tspanElements = getAllTspanDescendants(textEl)

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
      // Process each tspan descendant
      // Join with \n to preserve original SVG line breaks
      tspanElements.forEach((tspanEl, idx) => {
        const textContent = tspanEl.textContent || ''
        const styles = extractStyles(tspanEl)

        tspans.push({
          textContent,
          styles,
          cumulativeStart: cumulativePos,
          cumulativeEnd: cumulativePos + textContent.length,
        })

        cumulativePos += textContent.length
        // Add newline between tspans to preserve multi-line layout (except after last)
        if (idx < tspanElements.length - 1) {
          cumulativePos += 1
        }
      })
    }

    // Extract text-level paragraph properties.
    // text-anchor is native SVG; line-height and text-align ride via CSS or inline style.
    const textAnchor = getCascadedAttr(textEl, 'text-anchor', cssRules)
    const textAnchorToAlign: Record<string, 'left' | 'center' | 'right'> = {
      start: 'left',
      middle: 'center',
      end: 'right',
    }
    const cssTextAlign = getCascadedAttr(textEl, 'text-align', cssRules)
    const textAlign =
      (cssTextAlign as 'left' | 'center' | 'right' | 'justify' | null) ??
      (textAnchor ? textAnchorToAlign[textAnchor] : undefined)

    const lineHeightStr = getCascadedAttr(textEl, 'line-height', cssRules)
    let lineHeight: number | undefined
    if (lineHeightStr) {
      const parsed = parseFloat(lineHeightStr)
      if (!isNaN(parsed)) {
        // When given as a px value matching font-size, convert to ratio via font-size.
        const fontSizeStr = getCascadedAttr(textEl, 'font-size', cssRules)
        const fontSize = fontSizeStr ? parseFloat(fontSizeStr) : NaN
        lineHeight = Number.isFinite(fontSize) && fontSize > 0 && parsed >= fontSize / 2
          ? parsed / fontSize
          : parsed
      }
    }

    const paragraph = textEl.getAttribute('data-paragraph') === 'true'
    const dataContent = textEl.getAttribute('data-content')
    const content = dataContent !== null ? dataContent : undefined

    results.push({
      width,
      lineHeight,
      textAlign,
      tspans,
      paragraph,
      content,
    })
  })

  return results
}

/**
 * Parse an SVG <style> block into a map of { "selector": { "prop": "value" } }.
 * Supports simple class selectors (".cls-6") — enough for Illustrator exports.
 */
function parseStyleRules(doc: Document): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {}
  const styleEls = doc.getElementsByTagName('style')
  for (const styleEl of Array.from(styleEls)) {
    const css = styleEl.textContent ?? ''
    const ruleRe = /([^{}]+)\{([^}]+)\}/g
    let match: RegExpExecArray | null
    while ((match = ruleRe.exec(css))) {
      const selectors = match[1].split(',').map((s) => s.trim()).filter(Boolean)
      const body = match[2]
      const props: Record<string, string> = {}
      for (const decl of body.split(';')) {
        const idx = decl.indexOf(':')
        if (idx === -1) continue
        const prop = decl.slice(0, idx).trim().toLowerCase()
        const value = decl.slice(idx + 1).trim()
        if (prop) props[prop] = value
      }
      for (const sel of selectors) {
        rules[sel] = { ...(rules[sel] ?? {}), ...props }
      }
    }
  }
  return rules
}

/**
 * Resolve an attribute or CSS property for an element, checking:
 *   1. the inline attribute, 2. the inline style="...", 3. <style> class rules.
 */
function getCascadedAttr(
  el: Element,
  name: string,
  cssRules: Record<string, Record<string, string>>
): string | null {
  const direct = el.getAttribute(name)
  if (direct !== null && direct !== '') return direct

  const inlineStyle = el.getAttribute('style')
  if (inlineStyle) {
    const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i').exec(inlineStyle)
    if (m) return m[1].trim()
  }

  const classAttr = el.getAttribute('class')
  if (classAttr) {
    for (const cls of classAttr.split(/\s+/)) {
      const fromRule = cssRules[`.${cls}`]?.[name]
      if (fromRule) return fromRule
    }
  }
  return null
}
