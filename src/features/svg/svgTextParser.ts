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
  /** Index de LIGNE visuelle (issu du `y` du tspan). Illustrator émet une ligne
   *  par valeur de `y` — sans cette information les lignes seraient concaténées
   *  bout à bout ("TITREtexte" au lieu de "TITRE\ntexte"). */
  line?: number
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
function extractStyles(
  el: Element,
  cssRules?: Record<string, Record<string, string>>
): TextStyle {
  const styles: TextStyle = {}

  // Pas de `getComputedStyle` ici : le document vient de `DOMParser` et n'est
  // PAS attaché au DOM — le navigateur n'y applique donc aucune feuille de
  // style et ne renvoie que des valeurs par défaut (`fill: rgb(0,0,0)`,
  // `font-family: "depends on user agent"`). Ces valeurs bidon écrasaient la
  // cascade et repeignaient tous les textes en noir. On résout les classes
  // nous-mêmes via `cssRules`.
  for (const [attrName, styleProp] of Object.entries(STYLE_ATTRIBUTE_MAP)) {
    let value = el.getAttribute(attrName)

    // Puis le style inline et les règles de classe du <style> du document.
    // Indispensable pour Illustrator, qui met TOUT dans des classes
    // (`.cls-2 { fill:#009640; font-family:Montserrat-ExtraBold }`) : sans ça
    // les couleurs et polices par portion de texte étaient perdues.
    if ((value === null || value === '') && cssRules) {
      value = getCascadedAttr(el, attrName, cssRules)
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

interface TextSegment {
  textContent: string
  /** Styles cascadés : ceux du <text>, puis de chaque <tspan> ancêtre, puis les siens. */
  styles: TextStyle
  /** `y` effectif (hérité de l'ancêtre le plus proche qui en porte un). */
  y: number | null
}

/**
 * Découpe un `<text>` en SEGMENTS de texte, dans l'ordre du document, avec les
 * styles cascadés depuis les ancêtres.
 *
 * On parcourt les NŒUDS (texte + tspans) et non les éléments : chaque portion
 * de texte n'est comptée qu'une fois, quel que soit l'imbriquement.
 *
 * ⚠️ Illustrator IMBRIQUE les tspans — un tspan de style enveloppe les tspans
 * de positionnement :
 *   `<tspan class="cls-2"><tspan x="0" y="0">TITRE</tspan></tspan>`
 * Ramasser tous les descendants comptait le texte DEUX fois (celui du parent,
 * qui contient déjà celui de l'enfant) : « TITRE » devenait « TITRETITRE ».
 * Un tspan peut aussi mêler texte propre et tspans enfants
 * (`<tspan fill="red">Outer<tspan fill="blue">Inner</tspan>More</tspan>`) —
 * d'où le parcours par nœuds, qui donne trois segments correctement stylés.
 */
function collectTextSegments(
  textEl: Element,
  cssRules: Record<string, Record<string, string>>
): TextSegment[] {
  const out: TextSegment[] = []

  const walk = (el: Element, inherited: TextStyle, inheritedY: number | null): void => {
    const styles = { ...inherited, ...extractStyles(el, cssRules) }
    const yAttr = el.getAttribute('y')
    const y = yAttr !== null && yAttr !== '' && Number.isFinite(parseFloat(yAttr))
      ? parseFloat(yAttr)
      : inheritedY

    let hadChild = false
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        const textContent = node.textContent ?? ''
        // On garde les espaces INTRA-LIGNE (séparateurs entre deux portions
        // stylées : les perdre collerait les mots), mais pas l'indentation du
        // fichier — reconnaissable à son saut de ligne.
        if (textContent.trim() || (textContent && !textContent.includes('\n'))) {
          out.push({ textContent, styles, y })
          hadChild = true
        }
      } else if (
        node.nodeType === 1 &&
        (node as Element).tagName.toLowerCase() === 'tspan'
      ) {
        walk(node as Element, styles, y)
        hadChild = true
      }
    }
    // `<tspan></tspan>` : aucun contenu, mais on conserve le segment vide pour
    // que l'indexation des tspans reste alignée sur le document source.
    if (!hadChild && el !== textEl) out.push({ textContent: '', styles, y })
  }

  walk(textEl, extractStyles(textEl, cssRules), null)
  return out
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

    const leaves = collectTextSegments(textEl, cssRules)

    if (leaves.length === 0) {
      // If no tspan children, treat the text element itself as one tspan
      const textContent = textEl.textContent || ''
      const styles = extractStyles(textEl, cssRules)
      tspans.push({
        textContent,
        styles,
        cumulativeStart: 0,
        cumulativeEnd: textContent.length,
        line: 0,
      })
    } else {
      // Une LIGNE par valeur de `y` : c'est ainsi qu'Illustrator encode les
      // retours à la ligne (les tspans d'une même ligne se suivent en `x`).
      const lineOfY = new Map<number, number>()
      let nextLine = 0
      leaves.forEach(({ textContent, styles, y }, idx) => {
        const key = y ?? 0
        if (!lineOfY.has(key)) lineOfY.set(key, nextLine++)

        tspans.push({
          textContent,
          styles,
          cumulativeStart: cumulativePos,
          cumulativeEnd: cumulativePos + textContent.length,
          line: lineOfY.get(key)!,
        })

        cumulativePos += textContent.length
        // Add newline between tspans to preserve multi-line layout (except after last)
        if (idx < leaves.length - 1) {
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
