import type { TspanInfo, TextStyle } from './svgTextParser'

/**
 * Char-level style accepté par Fabric.Textbox.toObject().
 *
 * Fabric v6 sérialise les styles via stylesToArray (alias `xi`) qui ne compare
 * QUE ce jeu de clés. Une entrée char qui ne contient AUCUNE clé reconnue (par
 * ex. uniquement `letterSpacing` ou `textDecoration` brut) fait crasher la
 * sérialisation avec « Cannot read properties of undefined (reading 'end') ».
 */
export interface FabricCharStyle {
  fill?: string
  stroke?: string
  strokeWidth?: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string
  underline?: boolean
  overline?: boolean
  linethrough?: boolean
  textBackgroundColor?: string
  textDecorationColor?: string
  textDecorationThickness?: number
  deltaY?: number
}

/**
 * Fabric.js styles format: {line: {char: style}}
 * line = array index (0-based)
 * char = character index within line (0-based)
 */
export type FabricStyleMap = Record<number, Record<number, FabricCharStyle>>

function cleanFontFamily(ff: string | undefined): string | undefined {
  if (!ff) return undefined
  const first = ff.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  return first || undefined
}

/**
 * Convertit un TextStyle SVG en style char-level reconnu par Fabric.
 *
 * - `textDecoration` (CSS) → booléens `underline` / `overline` / `linethrough`.
 *   "none" produit un objet vide (le caller doit skip).
 * - `baselineShift` numérique → `deltaY`. Les valeurs string ("super"/"sub")
 *   sont droppées (Fabric attend un nombre, et un string non reconnu rendrait
 *   à nouveau l'objet "invisible" pour le comparateur xi).
 * - `letterSpacing` est droppé : Fabric n'expose pas de char-spacing par
 *   caractère (charSpacing est un attribut au niveau Textbox).
 */
export function sanitizeTspanStylesForFabric(s: TextStyle): FabricCharStyle {
  const out: FabricCharStyle = {}
  if (s.fill) out.fill = s.fill
  if (s.fontFamily) {
    const family = cleanFontFamily(s.fontFamily)
    if (family) out.fontFamily = family
  }
  if (typeof s.fontSize === 'number' && Number.isFinite(s.fontSize)) {
    out.fontSize = s.fontSize
  }
  if (s.fontWeight !== undefined && s.fontWeight !== null && s.fontWeight !== '') {
    out.fontWeight = s.fontWeight
  }
  if (s.fontStyle) out.fontStyle = s.fontStyle
  if (typeof s.textDecoration === 'string') {
    const d = s.textDecoration.toLowerCase()
    if (d.includes('underline')) out.underline = true
    if (d.includes('overline')) out.overline = true
    if (d.includes('line-through')) out.linethrough = true
  }
  if (typeof s.baselineShift === 'number' && Number.isFinite(s.baselineShift)) {
    out.deltaY = s.baselineShift
  }
  return out
}

/**
 * Normalize whitespace for matching: collapse spaces, trim, handle newlines
 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Remap tspan styles to Fabric format after wrapping.
 *
 * Input:
 *   - wrappedText: final text after Fabric wrapping (may have \n for line breaks)
 *   - tspans: original tspan info with textContent + styles
 *
 * Output:
 *   - Fabric styles map {line: {char: style}}
 *
 * Algorithm:
 *   1. For each tspan, use cumulativeStart/End to find position in wrapped text
 *   2. Handle whitespace and line break variations by searching for normalized content
 *   3. Apply styles to matched character range
 */
export function remapStylesToFabric(
  wrappedText: string,
  tspans: TspanInfo[]
): FabricStyleMap {
  const result: FabricStyleMap = {}

  let lastFoundPos = 0

  for (const tspan of tspans) {
    const normalizedTspan = normalizeText(tspan.textContent)
    if (!normalizedTspan) continue

    // Check if tspan has leading or trailing whitespace
    const hasLeadingWhitespace = /^\s/.test(tspan.textContent)
    const hasTrailingWhitespace = /\s$/.test(tspan.textContent)

    // Find the tspan content in the wrapped text, starting from where we left off
    const matchPos = findTspanInText(wrappedText, normalizedTspan, lastFoundPos)
    if (matchPos === -1) {
      // Tspan not found — skip (may be due to wrapping changes)
      continue
    }

    // If the original tspan had leading whitespace, back up to include it
    let startPos = matchPos
    if (hasLeadingWhitespace && matchPos > 0) {
      // Look back to find the start of the whitespace run
      let i = matchPos - 1
      while (i >= 0 && /\s/.test(wrappedText[i])) {
        i--
      }
      startPos = i + 1
    }

    // Calculate the end position: find how much actual text (from wrapped text)
    // corresponds to the normalized match
    let endPos = findMatchEnd(wrappedText, matchPos, normalizedTspan)

    // If the original tspan had trailing whitespace, extend to include it
    if (hasTrailingWhitespace) {
      while (endPos < wrappedText.length && /\s/.test(wrappedText[endPos])) {
        endPos++
      }
    }

    lastFoundPos = endPos

    // Sanitise (convertit `text-decoration` en booléens, drop les clés que
    // Fabric ne reconnaît pas) avant d'appliquer à la range. Si vide,
    // skip — sinon un objet `{ letterSpacing: 2 }` ferait crasher Fabric.
    const fabricStyles = sanitizeTspanStylesForFabric(tspan.styles)
    if (Object.keys(fabricStyles).length === 0) continue

    applyStylesToRange(result, wrappedText, startPos, endPos, fabricStyles)
  }

  return result
}

/**
 * Find the next occurrence of normalized target text in wrapped text.
 * Returns the position in the original wrapped text (including newlines).
 */
function findTspanInText(text: string, normalizedTarget: string, startSearchPos: number): number {
  // Search starting from startSearchPos
  for (let i = startSearchPos; i < text.length; i++) {
    // Extract substring and normalize it, check if it matches
    const remaining = text.substring(i)
    const normalizedRemaining = normalizeText(remaining)

    if (normalizedRemaining.startsWith(normalizedTarget)) {
      // Found it! Return the position in the original text
      return i
    }
  }

  return -1
}

/**
 * Find the end position of a match in the original wrapped text.
 *
 * Starting from matchStart (which may include leading whitespace),
 * find how many characters from the wrapped text correspond to the normalized target length,
 * skipping over whitespace-only positions.
 *
 * Example:
 *   wrappedText = "Hello World"
 *   matchStart = 6 (at 'W')
 *   normalizedTarget = "World"
 *   Returns: 11 (end of "World")
 *
 *   wrappedText = "Hello World"
 *   matchStart = 5 (at ' ', before 'World')
 *   normalizedTarget = "World"
 *   Returns: 11 (end of "World", skipping the initial space)
 */
function findMatchEnd(wrappedText: string, matchStart: number, normalizedTarget: string): number {
  let charCount = 0
  let pos = matchStart
  let foundFirst = false

  while (pos < wrappedText.length && charCount < normalizedTarget.length) {
    const char = wrappedText[pos]

    if (char === '\n') {
      // Skip newlines, don't count them
      pos++
      continue
    }

    // For the first character, skip leading whitespace
    if (!foundFirst && /\s/.test(char)) {
      pos++
      continue
    }

    // We've found the first non-whitespace character
    foundFirst = true
    charCount++
    pos++
  }

  return pos
}

/**
 * Apply a style to a character range in the wrapped text.
 *
 * This is a helper that applies styles to a range of character positions.
 * Position calculations account for line breaks (\n in the text).
 *
 * The positions refer to indices in the original wrapped text string,
 * including all characters (including newlines).
 */
function applyStylesToRange(
  styleMap: FabricStyleMap,
  wrappedText: string,
  startPos: number,
  endPos: number,
  styles: FabricCharStyle
): void {
  const lines = wrappedText.split('\n')
  let charPos = 0

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    const lineStart = charPos
    const lineEnd = charPos + line.length

    // Check if this line overlaps with [startPos, endPos]
    if (lineEnd > startPos && lineStart < endPos) {
      // Characters in this line that fall within the range
      const rangeStart = Math.max(0, startPos - lineStart)
      const rangeEnd = Math.min(line.length, endPos - lineStart)

      for (let charIdx = rangeStart; charIdx < rangeEnd; charIdx++) {
        if (!styleMap[lineIdx]) {
          styleMap[lineIdx] = {}
        }
        styleMap[lineIdx][charIdx] = styles
      }
    }

    charPos = lineEnd + 1 // +1 for \n character itself
  }
}

