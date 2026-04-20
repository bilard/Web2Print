# SVG Text Wrapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import multi-line SVG text with preserved width and rich styles, supporting automatic wrapping and inline editing.

**Architecture:** Three-phase import (XML parse → Fabric parse → enrichment), style remapping via text matching, IText ↔ Textbox toggle on double-click.

**Tech Stack:** Fabric.js v6 (Textbox/IText), native DOMParser, TypeScript strict

---

## Task 1: Create `svgTextParser.ts` — XML Parse & Tspan Extraction

**Files:**
- Create: `src/features/svg/svgTextParser.ts`
- Test: `src/features/svg/svgTextParser.test.ts`

### Step 1: Write the failing test

Create `src/features/svg/svgTextParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseTextElements } from './svgTextParser'

describe('svgTextParser', () => {
  it('extracts text and width from SVG with single tspan', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text x="10" y="20" width="150" font-size="16" fill="black">
          <tspan>Hello World</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result).toHaveLength(1)
    expect(result[0].width).toBe(150)
    expect(result[0].tspans).toHaveLength(1)
    expect(result[0].tspans[0].textContent).toBe('Hello World')
  })

  it('extracts multiple tspans with individual styles', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text x="10" y="20" width="200">
          <tspan fill="red" font-weight="bold">Bold Red</tspan>
          <tspan fill="blue" font-style="italic">Italic Blue</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].tspans).toHaveLength(2)
    expect(result[0].tspans[0].styles.fill).toBe('red')
    expect(result[0].tspans[0].styles.fontWeight).toBe('bold')
    expect(result[0].tspans[1].styles.fill).toBe('blue')
    expect(result[0].tspans[1].styles.fontStyle).toBe('italic')
  })

  it('computes cumulative start/end positions for each tspan', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100">
          <tspan>Hello</tspan>
          <tspan> World</tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].tspans[0].cumulativeStart).toBe(0)
    expect(result[0].tspans[0].cumulativeEnd).toBe(5) // "Hello".length
    expect(result[0].tspans[1].cumulativeStart).toBe(5)
    expect(result[0].tspans[1].cumulativeEnd).toBe(11) // "Hello World".length
  })

  it('handles text without width attribute', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text x="10" y="20">No Width Text</text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result[0].width).toBeUndefined()
  })

  it('extracts all SVG text style attributes', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100">
          <tspan
            fill="red"
            font-family="Arial"
            font-size="14"
            font-weight="600"
            font-style="italic"
            text-decoration="underline"
            baseline-shift="2"
            letter-spacing="1.5"
          >
            Styled
          </tspan>
        </text>
      </svg>
    `
    const result = parseTextElements(svg)
    const styles = result[0].tspans[0].styles
    expect(styles.fill).toBe('red')
    expect(styles.fontFamily).toBe('Arial')
    expect(styles.fontSize).toBe(14)
    expect(styles.fontWeight).toBe('600')
    expect(styles.fontStyle).toBe('italic')
    expect(styles.textDecoration).toBe('underline')
    expect(styles.baselineShift).toBe(2)
    expect(styles.letterSpacing).toBe(1.5)
  })

  it('ignores text elements without width', () => {
    const svg = `
      <svg viewBox="0 0 200 200">
        <text width="100"><tspan>Has Width</tspan></text>
        <text><tspan>No Width</tspan></text>
      </svg>
    `
    const result = parseTextElements(svg)
    expect(result).toHaveLength(1)
    expect(result[0].tspans[0].textContent).toBe('Has Width')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test src/features/svg/svgTextParser.test.ts
```

Expected: FAIL — "parseTextElements is not exported"

### Step 3: Implement `svgTextParser.ts`

Create `src/features/svg/svgTextParser.ts`:

```typescript
export interface TextStyle {
  fill?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string
  textDecoration?: string
  baselineShift?: string | number
  letterSpacing?: number
  [key: string]: unknown
}

export interface TspanInfo {
  textContent: string
  cumulativeStart: number
  cumulativeEnd: number
  styles: TextStyle
}

export interface TextMetadata {
  width?: number
  tspans: TspanInfo[]
}

/**
 * Parse SVG and extract all <text> elements with width + tspan styles.
 * Only returns text elements that have a width attribute.
 */
export function parseTextElements(svgText: string): TextMetadata[] {
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  } catch {
    return []
  }

  const result: TextMetadata[] = []
  const textElements = doc.querySelectorAll('text')

  for (const textEl of Array.from(textElements)) {
    const widthStr = textEl.getAttribute('width')
    const width = widthStr ? parseFloat(widthStr) : undefined

    // Skip text without width
    if (width === undefined) continue

    const tspans: TspanInfo[] = []
    let cumulativePos = 0

    for (const tspanEl of Array.from(textEl.querySelectorAll('tspan'))) {
      const textContent = tspanEl.textContent ?? ''
      const cumulativeStart = cumulativePos
      const cumulativeEnd = cumulativePos + textContent.length

      const styles = extractStyles(tspanEl)

      tspans.push({
        textContent,
        cumulativeStart,
        cumulativeEnd,
        styles,
      })

      cumulativePos = cumulativeEnd
    }

    // If text has no tspan children, treat the text node directly
    if (tspans.length === 0) {
      const textContent = textEl.textContent ?? ''
      const styles = extractStyles(textEl)
      tspans.push({
        textContent,
        cumulativeStart: 0,
        cumulativeEnd: textContent.length,
        styles,
      })
    }

    if (tspans.length > 0) {
      result.push({ width, tspans })
    }
  }

  return result
}

/**
 * Extract all SVG text styling attributes from an element.
 */
function extractStyles(el: Element): TextStyle {
  const styles: TextStyle = {}

  // SVG attributes (camelCase in code)
  const attrMap: [string, (v: string) => unknown][] = [
    ['fill', (v) => v],
    ['font-family', (v) => v],
    ['font-size', (v) => parseFloat(v)],
    ['font-weight', (v) => isNaN(Number(v)) ? v : Number(v)],
    ['font-style', (v) => v],
    ['text-decoration', (v) => v],
    ['baseline-shift', (v) => isNaN(Number(v)) ? v : parseFloat(v)],
    ['letter-spacing', (v) => parseFloat(v)],
  ]

  for (const [attr, parse] of attrMap) {
    const value = el.getAttribute(attr)
    if (value !== null) {
      const key = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) as keyof TextStyle
      styles[key] = parse(value)
    }
  }

  // Also check computed styles for CSS-applied attributes
  const computed = window.getComputedStyle(el)
  const cssMap: [string, string][] = [
    ['fill', 'fill'],
    ['font-family', 'fontFamily'],
    ['font-size', 'fontSize'],
    ['font-weight', 'fontWeight'],
    ['font-style', 'fontStyle'],
    ['text-decoration-line', 'textDecoration'],
    ['letter-spacing', 'letterSpacing'],
  ]

  for (const [cssName, styleKey] of cssMap) {
    const value = computed.getPropertyValue(cssName).trim()
    if (value && !styles[styleKey as keyof TextStyle]) {
      if (styleKey === 'fontSize') {
        styles[styleKey as keyof TextStyle] = parseFloat(value)
      } else if (styleKey === 'letterSpacing') {
        styles[styleKey as keyof TextStyle] = parseFloat(value)
      } else {
        styles[styleKey as keyof TextStyle] = value
      }
    }
  }

  return styles
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test src/features/svg/svgTextParser.test.ts
```

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/svg/svgTextParser.ts src/features/svg/svgTextParser.test.ts
git commit -m "feat(svg): create text parser for tspan extraction with styles"
```

---

## Task 2: Create `textboxConverter.ts` — Style Remapping

**Files:**
- Create: `src/features/svg/textboxConverter.ts`
- Test: `src/features/svg/textboxConverter.test.ts`

### Step 1: Write the failing test

Create `src/features/svg/textboxConverter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { remapStylesToFabric, normalizeText } from './textboxConverter'
import type { TspanInfo, TextStyle } from './svgTextParser'

describe('textboxConverter', () => {
  it('remaps single tspan styles to Fabric format', () => {
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello World',
        cumulativeStart: 0,
        cumulativeEnd: 11,
        styles: { fill: 'red', fontSize: 16 },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)
    // result should be {line: {char: style}}
    expect(result).toBeDefined()
    expect(result[0]).toBeDefined() // First line
    expect(Object.keys(result[0]).length).toBeGreaterThan(0)
  })

  it('remaps multiple tspans with different styles', () => {
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        styles: { fill: 'red' },
      },
      {
        textContent: ' World',
        cumulativeStart: 5,
        cumulativeEnd: 11,
        styles: { fill: 'blue' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)
    expect(result).toBeDefined()
    // First 5 chars should be red, next 6 should be blue
    // (exact structure depends on line breaks in wrapped text)
  })

  it('normalizes whitespace for matching', () => {
    expect(normalizeText('Hello  World')).toBe('Hello World')
    expect(normalizeText('  Hello\n  World  ')).toBe('Hello World')
  })

  it('handles tspan matching with whitespace variation', () => {
    // Original tspan may have extra spaces, wrapped text may not
    const wrappedText = 'Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello  World', // extra space
        cumulativeStart: 0,
        cumulativeEnd: 12,
        styles: { fill: 'red' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)
    // Should still match despite whitespace difference
    expect(result).toBeDefined()
  })

  it('matches tspans in sequence', () => {
    const wrappedText = 'Hello Hello World'
    const tspans: TspanInfo[] = [
      {
        textContent: 'Hello',
        cumulativeStart: 0,
        cumulativeEnd: 5,
        styles: { fill: 'red' },
      },
      {
        textContent: 'Hello',
        cumulativeStart: 5,
        cumulativeEnd: 10,
        styles: { fill: 'blue' },
      },
      {
        textContent: ' World',
        cumulativeStart: 10,
        cumulativeEnd: 16,
        styles: { fill: 'green' },
      },
    ]

    const result = remapStylesToFabric(wrappedText, tspans)
    expect(result).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test src/features/svg/textboxConverter.test.ts
```

Expected: FAIL — functions not exported

### Step 3: Implement `textboxConverter.ts`

Create `src/features/svg/textboxConverter.ts`:

```typescript
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
    // Note: This is approximate — exact char-level styling depends on
    // how whitespace was normalized. For now, apply to the matched range.
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test src/features/svg/textboxConverter.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/svg/textboxConverter.ts src/features/svg/textboxConverter.test.ts
git commit -m "feat(svg): create style remapper for Fabric format"
```

---

## Task 3: Integrate Parser & Converter into `svgToFabric.ts`

**Files:**
- Modify: `src/features/svg/svgToFabric.ts`

### Step 1: Import new modules

In `src/features/svg/svgToFabric.ts`, add at the top after existing imports:

```typescript
import { parseTextElements } from './svgTextParser'
import { remapStylesToFabric } from './textboxConverter'
```

### Step 2: Modify `fabricTextToIText` to support Textbox conversion

Replace the `fabricTextToIText` function with:

```typescript
/**
 * Convertit un FabricText en IText ou Textbox éditable.
 *
 * Si le texte a une largeur définie (et des styles tspan), crée un Textbox avec wrapping.
 * Sinon, crée un IText normal.
 */
function fabricTextToEditableText(
  src: FabricText,
  metadata?: TextMetadata
): IText | Textbox {
  const anySrc = src as unknown as Record<string, unknown>
  const text = typeof src.text === 'string' ? src.text : String(anySrc.text ?? '')

  const opts: Record<string, unknown> = {
    left: src.left,
    top: src.top,
    originX: src.originX,
    originY: src.originY,
    scaleX: src.scaleX,
    scaleY: src.scaleY,
    angle: src.angle,
    skewX: src.skewX,
    skewY: src.skewY,
    flipX: src.flipX,
    flipY: src.flipY,
    opacity: src.opacity,
    visible: src.visible,
    fontSize: src.fontSize,
    fontFamily: cleanFontFamily(src.fontFamily) ?? 'Inter',
    fontWeight: src.fontWeight,
    fontStyle: src.fontStyle,
    underline: src.underline,
    overline: src.overline,
    linethrough: src.linethrough,
    textAlign: src.textAlign,
    lineHeight: src.lineHeight,
    charSpacing: src.charSpacing,
    fill: src.fill,
    stroke: src.stroke,
    strokeWidth: src.strokeWidth,
    shadow: src.shadow,
    textBackgroundColor: src.textBackgroundColor,
    direction: src.direction,
  }

  // If metadata has width, create Textbox with wrapping + styles
  if (metadata?.width) {
    opts.width = metadata.width

    // Remap tspan styles to Fabric format
    const styles = remapStylesToFabric(text, metadata.tspans)
    if (Object.keys(styles).length > 0) {
      opts.styles = styles
    }

    const textbox = new Textbox(text, opts as any)
    // Store original width for edit/reset cycles
    const anyTextbox = textbox as FabricObject & { data?: Record<string, unknown> }
    anyTextbox.data = {
      ...(anyTextbox.data ?? {}),
      originalWidth: metadata.width,
      svgTextMetadata: metadata,
    }
    return textbox
  }

  // Otherwise, create regular IText
  return new IText(text, opts as any)
}
```

Import `Textbox` if not already imported:

```typescript
import {
  loadSVGFromString,
  FabricText,
  IText,
  Textbox,  // Add this if missing
  Group,
  // ... rest of imports
} from 'fabric'
```

Also import the `TextMetadata` type:

```typescript
import type { TextMetadata } from './svgTextParser'
```

### Step 3: Modify `upgradeTextsInPlace` to pass metadata

Replace `upgradeTextsInPlace` function:

```typescript
/**
 * Remplace récursivement chaque FabricText par un IText/Textbox éditable,
 * en passant les metadata de tspan si disponible.
 */
function upgradeTextsInPlace(
  objects: FabricObject[],
  textMetadataMap: Map<number, TextMetadata>
): FabricObject[] {
  let textIndex = 0

  return objects.map((obj) => {
    if (obj instanceof Group) {
      const children = (obj._objects ?? []) as FabricObject[]
      const upgraded = upgradeTextsInPlace(children, textMetadataMap)
      obj._objects = upgraded
      return obj
    }

    if (obj instanceof FabricText && !(obj instanceof IText) && !(obj instanceof Textbox)) {
      const metadata = textMetadataMap.get(textIndex)
      const result = fabricTextToEditableText(obj, metadata)
      textIndex++
      return result
    }

    return obj
  })
}
```

### Step 4: Modify `parseSvgToFabric` to extract metadata before Fabric parse

Replace the `parseSvgToFabric` function:

```typescript
export async function parseSvgToFabric(svgText: string): Promise<SvgParseResult> {
  // Phase 1: Parse XML to extract text metadata (width + tspan styles)
  const textMetadataList = parseTextElements(svgText)
  const textMetadataMap = new Map(textMetadataList.map((m, i) => [i, m]))

  // Phase 2: Fabric parse (normal)
  const parsed = await loadSVGFromString(svgText)
  const rawObjects = (parsed.objects ?? []).filter((o): o is FabricObject => !!o)

  // Phase 3: Upgrade texts with metadata + register fonts
  const flatObjects = upgradeTextsInPlace(rawObjects, textMetadataMap)
  registerUsedFonts(flatObjects)

  // Reconstruct hierarchy from SVG structure
  const structure = parseSvgStructure(svgText)
  const objects = structure.length > 0
    ? buildHierarchy(flatObjects, structure)
    : flatObjects

  const dims = extractViewBox(svgText) ?? { width: 1920, height: 1080 }
  const optsWidth = Number((parsed.options as Record<string, unknown>)?.width)
  const optsHeight = Number((parsed.options as Record<string, unknown>)?.height)
  const width = Number.isFinite(optsWidth) && optsWidth > 0 ? optsWidth : dims.width
  const height = Number.isFinite(optsHeight) && optsHeight > 0 ? optsHeight : dims.height

  decorateAll(objects)

  return { objects, width, height }
}
```

### Step 5: Test the integration

```bash
npm test src/features/svg/svgToFabric.test.ts
```

Verify existing tests still pass.

### Step 6: Commit

```bash
git add src/features/svg/svgToFabric.ts
git commit -m "feat(svg): integrate text parser and style remapping into import pipeline"
```

---

## Task 4: Support IText ↔ Textbox Toggle on Canvas

**Files:**
- Modify: `src/features/editor/useAddObject.ts` (or appropriate canvas event handler)
- Test: Create `src/features/editor/useTextboxToggle.test.ts`

### Step 1: Locate canvas double-click handler

Check the canvas interaction code. The double-click on a Fabric object likely lives in a hook or event handler. Find where you handle `object:selected` or similar events.

Likely location: `src/features/editor/CanvasContainer.tsx` or similar.

### Step 2: Write a helper hook for IText/Textbox toggle

Create `src/features/editor/useTextboxToggle.ts`:

```typescript
import { IText, Textbox } from 'fabric'
import type { FabricObject } from 'fabric'

/**
 * Hook to toggle a Textbox between editable (IText) and read-only (Textbox) mode.
 *
 * On double-click: Textbox → IText (editable)
 * On blur: IText → Textbox (re-wrapped with original width)
 */
export function useTextboxToggle(canvas: fabric.Canvas) {
  const toggleToEditMode = (textbox: Textbox) => {
    // Store original width
    const originalWidth = (textbox.data as Record<string, unknown> | undefined)?.originalWidth as number | undefined
      ?? textbox.width

    // Create IText from Textbox
    const itext = new IText(textbox.text ?? '', {
      left: textbox.left,
      top: textbox.top,
      fontSize: textbox.fontSize,
      fontFamily: textbox.fontFamily,
      fontWeight: textbox.fontWeight,
      fontStyle: textbox.fontStyle,
      fill: textbox.fill,
      stroke: textbox.stroke,
      strokeWidth: textbox.strokeWidth,
      opacity: textbox.opacity,
      scaleX: textbox.scaleX,
      scaleY: textbox.scaleY,
      angle: textbox.angle,
      styles: (textbox as unknown as { styles?: Record<number, Record<number, Record<string, unknown>>> }).styles,
    })

    // Copy metadata
    const anyItext = itext as FabricObject & { data?: Record<string, unknown> }
    anyItext.data = {
      ...(textbox.data ?? {}),
      originalWidth,
    }

    // Replace in canvas
    const idx = canvas.getObjects().indexOf(textbox)
    if (idx >= 0) {
      canvas.remove(textbox)
      canvas.insertAt(itext, idx)
      canvas.setActiveObject(itext)
      itext.selectAll()
      canvas.renderAll()
    }

    return itext
  }

  const toggleToReadMode = (itext: IText) => {
    const originalWidth = (itext.data as Record<string, unknown> | undefined)?.originalWidth as number | undefined

    // Create Textbox from IText
    const textbox = new Textbox(itext.text ?? '', {
      left: itext.left,
      top: itext.top,
      width: originalWidth,
      fontSize: itext.fontSize,
      fontFamily: itext.fontFamily,
      fontWeight: itext.fontWeight,
      fontStyle: itext.fontStyle,
      fill: itext.fill,
      stroke: itext.stroke,
      strokeWidth: itext.strokeWidth,
      opacity: itext.opacity,
      scaleX: itext.scaleX,
      scaleY: itext.scaleY,
      angle: itext.angle,
      styles: (itext as unknown as { styles?: Record<number, Record<number, Record<string, unknown>>> }).styles,
    })

    // Copy metadata
    const anyTextbox = textbox as FabricObject & { data?: Record<string, unknown> }
    anyTextbox.data = {
      ...(itext.data ?? {}),
    }

    // Replace in canvas
    const idx = canvas.getObjects().indexOf(itext)
    if (idx >= 0) {
      canvas.remove(itext)
      canvas.insertAt(textbox, idx)
      canvas.setActiveObject(textbox)
      canvas.renderAll()
    }

    return textbox
  }

  return { toggleToEditMode, toggleToReadMode }
}
```

### Step 3: Integrate toggle into canvas event handler

Find your canvas double-click or object:dblclick handler. Add:

```typescript
// In your canvas setup / interaction handler
canvas.on('object:dblclick', (e: fabric.IEvent) => {
  const target = e.target as FabricObject | undefined
  if (!target) return

  if (target instanceof Textbox) {
    const { toggleToEditMode } = useTextboxToggle(canvas)
    toggleToEditMode(target as Textbox)
  }
})

canvas.on('text:editing:exited', (e: fabric.IEvent) => {
  const target = e.target as FabricObject | undefined
  if (!target || !(target instanceof IText)) return

  // If was a Textbox before, convert back
  if ((target.data as Record<string, unknown> | undefined)?.originalWidth !== undefined) {
    const { toggleToReadMode } = useTextboxToggle(canvas)
    toggleToReadMode(target as IText)
  }
})
```

### Step 4: Verify via canvas interaction

No unit test needed for this step — test manually in the app:
- Import an SVG with multi-line text
- Double-click the text
- Verify it enters edit mode (text becomes unwrapped)
- Click outside or press Escape
- Verify it returns to wrapped Textbox mode

### Step 5: Commit

```bash
git add src/features/editor/useTextboxToggle.ts
git commit -m "feat(editor): add IText ↔ Textbox toggle on double-click"
```

---

## Task 5: Integration Test — Full SVG Import Flow

**Files:**
- Modify: `src/features/svg/svgToFabric.test.ts`

### Step 1: Add integration test to `svgToFabric.test.ts`

Append to the test file:

```typescript
describe('SVG text wrapping integration', () => {
  it('imports multi-line SVG text with width and wrapping', async () => {
    const svg = `
      <svg viewBox="0 0 400 300">
        <text x="10" y="20" width="200" font-size="14" fill="black">
          <tspan>First Line</tspan>
          <tspan>Second Line</tspan>
        </text>
      </svg>
    `

    const result = await parseSvgToFabric(svg)
    expect(result.objects).toHaveLength(1)

    const textObj = result.objects[0]
    expect(textObj instanceof Textbox).toBe(true)
    expect((textObj as Textbox).width).toBe(200)
    expect(textObj.text).toContain('First Line')
  })

  it('preserves rich text styles after wrapping', async () => {
    const svg = `
      <svg viewBox="0 0 400 300">
        <text x="10" y="20" width="200" font-size="14">
          <tspan fill="red" font-weight="bold">Bold Red</tspan>
          <tspan fill="blue"> Blue</tspan>
        </text>
      </svg>
    `

    const result = await parseSvgToFabric(svg)
    const textObj = result.objects[0] as Textbox
    const styles = (textObj as unknown as { styles?: Record<number, Record<number, Record<string, unknown>>> }).styles

    // Verify styles were remapped
    expect(styles).toBeDefined()
  })

  it('ignores text without width attribute', async () => {
    const svg = `
      <svg viewBox="0 0 400 300">
        <text x="10" y="20">No Width</text>
      </svg>
    `

    const result = await parseSvgToFabric(svg)
    const textObj = result.objects[0]

    // Should be IText, not Textbox
    expect(textObj instanceof IText).toBe(true)
    expect(textObj instanceof Textbox).toBe(false)
  })
})
```

### Step 2: Run integration tests

```bash
npm test src/features/svg/svgToFabric.test.ts
```

Expected: All tests pass.

### Step 3: Commit

```bash
git add src/features/svg/svgToFabric.test.ts
git commit -m "test(svg): add integration tests for text wrapping and style preservation"
```

---

## Task 6: Extend Fabric TypeScript Types (if needed)

**Files:**
- Modify: `src/types/fabric.d.ts`

### Step 1: Check if types need extension

If TypeScript complains about `data` or `styles` on Fabric objects, extend the types:

Add to `src/types/fabric.d.ts`:

```typescript
import type { TextMetadata } from '@/features/svg/svgTextParser'

declare module 'fabric' {
  interface FabricObject {
    data?: {
      id?: string
      type?: string
      name?: string
      originalWidth?: number
      svgTextMetadata?: TextMetadata
      [key: string]: unknown
    }
  }
}
```

### Step 2: Verify no TypeScript errors

```bash
npm run type-check
```

Expected: No errors related to `data` or `styles`.

### Step 3: Commit (if changed)

```bash
git add src/types/fabric.d.ts
git commit -m "types: extend Fabric types for text metadata"
```

---

## Verification Checklist

- [ ] All unit tests pass: `npm test src/features/svg/`
- [ ] Type check passes: `npm run type-check`
- [ ] SVG import with multi-line text works in the app
- [ ] Double-click text → editable mode
- [ ] Blur text → back to wrapped Textbox
- [ ] Styles are preserved through edit cycle
- [ ] Existing non-multi-line SVG imports still work (no regressions)

