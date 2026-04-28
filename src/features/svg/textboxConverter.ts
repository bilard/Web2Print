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

    // Apply styles to this range
    applyStylesToRange(result, wrappedText, startPos, endPos, tspan.styles)
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

    charPos = lineEnd + 1 // +1 for \n character itself
  }
}

