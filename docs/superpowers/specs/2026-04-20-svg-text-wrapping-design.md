# SVG Text Wrapping & Multi-line Support — Design Spec
**Date:** 2026-04-20  
**Status:** Design approved

## Problem Statement

Currently, SVG imports don't preserve text wrapping and multi-line layout:
- Text with multiple `<tspan>` elements imports as a single line
- Rich text styles (per-line/per-tspan color, weight, size) are lost
- No support for automatic text wrapping in editable blocks
- Users can't define block width constraints for text flow

## Scope

This spec covers:
1. ✅ Import multi-line SVG text with preserved `<tspan>` styles (all styles: fill, fontSize, fontFamily, fontWeight, fontStyle, textDecoration, baselineShift, letterSpacing)
2. ✅ Detect and apply width constraints from SVG `width` attribute
3. ✅ Convert to `Textbox` (Fabric.js) with automatic wrapping + style remapping
4. ✅ Support editing via double-click toggle: `Textbox` (read-only, wrapped) ↔ `IText` (editable, unwrapped)
5. ✅ Preserve original width for re-wrapping after edits

Out of scope: custom SVG text rendering, text-on-path, vertical text

## Design

### 1. Data Structures

```typescript
interface TextMetadata {
  width?: number  // SVG <text width="...">
  tspans: TspanInfo[]
}

interface TspanInfo {
  textContent: string      // text inside <tspan>
  cumulativeStart: number  // char position in full text
  cumulativeEnd: number
  styles: TextStyle        // all SVG/CSS styles
}

interface TextStyle {
  fill?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string  // "normal" | "italic"
  textDecoration?: string  // "underline" | "line-through"
  baselineShift?: string | number
  letterSpacing?: number
  // ... all other SVG text attributes
}
```

Store in Fabric object: `obj.data.svgTextMetadata` (TextMetadata) + `obj.data.originalWidth` (number)

### 2. Import Pipeline

**Phase 1: XML Parse (before Fabric)**
- Read SVG string via `new DOMParser()`
- Extract each `<text width="X">` element
- For each `<text>`:
  - Read `width` attribute
  - Walk child `<tspan>` nodes recursively
    - Capture textContent
    - Extract all computed styles (SVG attributes + CSS classes)
    - Record cumulative position in full text
- Store in Map: `textIndex → TextMetadata`

**Phase 2: Fabric Parse (unchanged)**
- Call `loadSVGFromString()` normally
- Fabric parses SVG, fuses `<tspan>` into single `FabricText` per `<text>` element

**Phase 3: Enrichment + Conversion**
- For each `FabricText` in Fabric output:
  - Look up TextMetadata in Map (by index)
  - If metadata exists:
    - Create `Textbox` with `width` set
    - Let Fabric auto-wrap based on width
    - Remap tspan styles → Fabric `styles` format: `{line: {char: style}}`
    - Store metadata in `obj.data`
  - Otherwise: keep as `IText` (fallback for texts without width)

### 3. Style Remapping Algorithm

After Fabric applies text wrapping, character positions change. Re-apply styles:

```
Input:
  - wrappedText (final text after Fabric wrapping)
  - originalTspans [{textContent, styles}, ...]

For each originalTspan:
  1. Normalize tspan.textContent (trim, collapse spaces)
  2. Find first occurrence in wrappedText
  3. Record start/end positions in wrappedText
  4. Apply styles to that range
  5. Convert range to Fabric format {line: {char: style}}
```

**Handling complexity:**
- **Whitespace normalization:** Fabric may normalize spacing → collapse consecutive spaces before matching
- **Duplicate text:** Match in sequence (first tspan → first occurrence, second tspan → next occurrence, etc.)
- **Conflicting styles:** Last applicable wins (standard CSS cascade)

### 4. Edit Mode: IText ↔ Textbox Toggle

**On double-click (enter edit mode):**
```
Textbox (width-constrained, wrapped, read-only)
  ↓ double-clic in canvas
Store originalWidth in temporary var
Convert to IText:
  - Keep text + styles
  - Set width = undefined (remove constraint)
  - Enable Fabric editing
  ↓
IText (editable, unwrapped)
```

**On blur / finish edit (exit edit mode):**
```
IText (modified by user)
  ↓ blur or click elsewhere
Restore to Textbox:
  - Keep modified text + styles
  - Reapply originalWidth
  - Trigger Fabric re-wrap
  - Disable editing
  ↓
Textbox (re-wrapped with new content)
```

**Storage:** Keep `originalWidth` in `obj.data` so it survives save/load.

### 5. Resize Behavior

When user drags handles to resize a `Textbox`:
- Fabric auto-wraps based on new width
- Styles remain applied (Fabric handles this)
- On finish resize: update `obj.data.originalWidth` to the new width
- Subsequent edits use the new width

### 6. Fallback Cases

| Case | Behavior |
|------|----------|
| SVG text has no `width` attribute | Import as `IText` (no wrapping) |
| Empty text or empty tspan | Ignore empty spans, keep text |
| Nested `<tspan>` (tspan within tspan) | Parse recursively, build flat style map |
| Mixed styled + unstyled text | Styled parts get full style object, unstyled inherit defaults |

### 7. Implementation Files

**New files:**
- `src/features/svg/svgTextParser.ts` — XML parse + tspan extraction
- `src/features/svg/textboxConverter.ts` — FabricText → Textbox + style remapping

**Modified files:**
- `src/features/svg/svgToFabric.ts` — Integrate parser + converter into pipeline
- `src/types/fabric.d.ts` — Extend FabricObject.data type if needed

### 8. Testing

- Unit tests for `svgTextParser`: XML parse → TextMetadata
- Unit tests for `textboxConverter`: style remapping algorithm
- Integration test: SVG import → verify width + styles preserved
- Edge case tests: empty spans, whitespace, nested tspan, duplicate text

### 9. Edge Cases & Risks

**Risk: Whitespace normalization causes style dephase**
- Mitigation: Normalize both original tspan and final wrapped text before matching

**Risk: Complex nested tspan structures**
- Mitigation: Recursive parser, flatten to single-level for matching

**Risk: Performance on large text blocks**
- Mitigation: Batch matching (one pass through wrappedText), avoid O(n²)

**Risk: User edits text, styles don't follow changes**
- Mitigation: Re-compute style map on edit completion (not real-time)

## Success Criteria

✅ SVG multi-line text imports with preserved width  
✅ All tspan styles (fill, fontSize, weight, style, decoration, etc.) preserved  
✅ Text automatically wraps based on width  
✅ Double-click toggles between wrapped (Textbox) and unwrapped (IText) modes  
✅ Styles remain after edit → wrap cycle  
✅ Rich text (multiple styles in one block) renders correctly  
✅ No regressions in existing SVG import (non-multi-line SVGs work as before)  
