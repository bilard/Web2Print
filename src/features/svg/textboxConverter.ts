import type { TspanInfo, TextStyle } from './svgTextParser'

/**
 * Fabric.js styles format: {line: {char: style}}
 * line = array index (0-based)
 * char = character index within line (0-based)
 * style = TextStyle object
 */
export type FabricStyleMap = Record<number, Record<number, Partial<TextStyle>>>

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
 *   1. Normalize both wrapped text and tspan content
 *   2. For each tspan, find its position in wrapped text (sequential matching)
 *   3. Convert position to {line, char} coordinates
 *   4. Apply styles to that range
 */
export function remapStylesToFabric(
  wrappedText: string,
  tspans: TspanInfo[]
): FabricStyleMap {
  const result: FabricStyleMap = {}

  // Split wrapped text into lines (Fabric uses \n for line breaks)
  const lines = wrappedText.split('\n')

  // Helper: convert char position to {line, char}
  function posToLineChar(pos: number): { line: number; char: number } {
    let remaining = pos
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineLen = lines[lineIdx].length
      if (remaining <= lineLen) {
        return { line: lineIdx, char: remaining }
      }
      remaining -= lineLen + 1 // +1 for \n
    }
    // Fallback: end of text
    const lastLine = lines.length - 1
    return { line: lastLine, char: lines[lastLine]?.length ?? 0 }
  }

  // Normalize wrapped text for matching
  const normalizedWrapped = normalizeText(wrappedText)
  let searchStart = 0

  for (const tspan of tspans) {
    const normalizedTspan = normalizeText(tspan.textContent)
    if (!normalizedTspan) continue

    // Find next occurrence of normalized tspan in normalized wrapped text
    const matchPos = normalizedWrapped.indexOf(normalizedTspan, searchStart)
    if (matchPos === -1) {
      // Tspan not found — skip (may be due to wrapping changes)
      continue
    }

    searchStart = matchPos + normalizedTspan.length

    // Apply styles to this range
    applyStylesToRange(result, wrappedText, matchPos, matchPos + normalizedTspan.length, tspan.styles)
  }

  return result
}

/**
 * Apply a style to a character range in the wrapped text.
 *
 * This is a helper that applies styles to a range of character positions.
 * Handles line breaks internally.
 */
function applyStylesToRange(
  styleMap: FabricStyleMap,
  wrappedText: string,
  startPos: number,
  endPos: number,
  styles: TextStyle
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

    charPos = lineEnd + 1 // +1 for \n
  }
}

/**
 * Convert a Fabric text object with tspan metadata to a Textbox with applied styles.
 *
 * This is called after Fabric parses SVG and you have enriched data.
 * It's a higher-level function that orchestrates the remapping.
 */
export function createStyledTextbox(
  text: string,
  width: number,
  tspans: TspanInfo[],
  baseProps?: Record<string, unknown>
) {
  const styles = remapStylesToFabric(text, tspans)
  return {
    text,
    width,
    styles,
    ...baseProps,
  }
}
