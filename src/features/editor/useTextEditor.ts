import { useCallback } from 'react'
import { Canvas, IText } from 'fabric'
import { useEditorStore } from '@/stores/editor.store'
import { loadFont, AVAILABLE_FONTS } from '@/features/assets/useFonts'
import { syncToStore } from './useAddObject'

export interface TextStyle {
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  underline: boolean
  linethrough: boolean
  textAlign: 'left' | 'center' | 'right' | 'justify'
  fill: string
  charSpacing: number
  lineHeight: number
}

function getActiveIText(canvas: Canvas): IText | null {
  const obj = canvas.getActiveObject()
  return obj instanceof IText ? obj : null
}

/**
 * Returns the IDML point scale for the first selected text object.
 * Fabric fontSize = IDML_pt × ptScale — divide by ptScale to display in pts.
 * Non-IDML objects return 1 (no conversion needed).
 */
export function getActivePtScale(canvas: Canvas | null): number {
  if (!canvas) return 1
  const active = canvas.getActiveObject()
  const readScale = (o: unknown) =>
    o instanceof IText ? ((o as any).data?.idmlPtScale as number | undefined) ?? 1 : 1
  if (active instanceof IText) return readScale(active)
  if (active && (active as any).type === 'activeselection') {
    const objs = (active as any)._objects as unknown[] | undefined
    const first = Array.isArray(objs) ? objs.find((o) => o instanceof IText) : undefined
    if (first) return readScale(first)
  }
  return 1
}

/** Collect all IText objects currently active on the canvas (single or multi-selection) */
function getActiveITexts(canvas: Canvas): IText[] {
  const active = canvas.getActiveObject()
  if (!active) return []
  if (active instanceof IText) return [active]
  // ActiveSelection: iterate contained objects
  const objs = (active as any)._objects as unknown[]
  if (Array.isArray(objs)) {
    return objs.filter((o): o is IText => o instanceof IText)
  }
  return []
}

/** Apply style to one IText, handling per-char selection vs full object */
function applyStyleToIText(itext: IText, style: Partial<TextStyle>) {
  const hasSelection = itext.isEditing && itext.selectionStart !== itext.selectionEnd

  if (hasSelection) {
    const selectionStyles: Record<string, unknown> = {}
    if (style.fontSize !== undefined) selectionStyles.fontSize = style.fontSize
    if (style.fontWeight !== undefined) selectionStyles.fontWeight = style.fontWeight
    if (style.fontStyle !== undefined) selectionStyles.fontStyle = style.fontStyle
    if (style.underline !== undefined) selectionStyles.underline = style.underline
    if (style.linethrough !== undefined) selectionStyles.linethrough = style.linethrough
    if (style.fill !== undefined) selectionStyles.fill = style.fill
    if (style.fontFamily !== undefined) selectionStyles.fontFamily = style.fontFamily
    if (Object.keys(selectionStyles).length > 0) {
      itext.setSelectionStyles(selectionStyles)
    }
    if (style.textAlign !== undefined) itext.set({ textAlign: style.textAlign })
  } else {
    const fabricProps: Record<string, unknown> = {}
    if (style.fontSize !== undefined) fabricProps.fontSize = style.fontSize
    if (style.fontWeight !== undefined) fabricProps.fontWeight = style.fontWeight
    if (style.fontStyle !== undefined) fabricProps.fontStyle = style.fontStyle
    if (style.underline !== undefined) fabricProps.underline = style.underline
    if (style.linethrough !== undefined) fabricProps.linethrough = style.linethrough
    if (style.textAlign !== undefined) fabricProps.textAlign = style.textAlign
    if (style.fill !== undefined) fabricProps.fill = style.fill
    if (style.charSpacing !== undefined) fabricProps.charSpacing = style.charSpacing
    if (style.lineHeight !== undefined) fabricProps.lineHeight = style.lineHeight
    if (style.fontFamily !== undefined) fabricProps.fontFamily = style.fontFamily

    if (Object.keys(fabricProps).length > 0) {
      itext.set(fabricProps)
    }

    // Effacer les overrides per-char pour les propriétés modifiées
    const perCharCapable = ['fontSize', 'fontWeight', 'fontStyle', 'underline', 'linethrough', 'fill', 'fontFamily'] as const
    const toReset = perCharCapable.filter((p) => style[p] !== undefined)
    if (toReset.length > 0) {
      const styles = itext.styles as Record<number, Record<number, Record<string, unknown>>> | undefined
      if (styles) {
        for (const line of Object.values(styles)) {
          if (!line) continue
          for (const charStyle of Object.values(line)) {
            if (!charStyle) continue
            for (const prop of toReset) {
              delete (charStyle as Record<string, unknown>)[prop]
            }
          }
        }
      }
    }
  }

  itext.setCoords()
  ;(itext as any).dirty = true
}

export function useTextEditor(fabricRef: React.RefObject<Canvas | null>) {
  const { selectedObjectId, updateObject } = useEditorStore()

  const applyStyle = useCallback((style: Partial<TextStyle>) => {
    const canvas = fabricRef.current
    if (!canvas) return

    const itexts = getActiveITexts(canvas)
    if (itexts.length === 0) return

    const doApply = () => {
      for (const itext of itexts) {
        applyStyleToIText(itext, style)
      }
      canvas.requestRenderAll()
      syncToStore(canvas)
      const activeObj = canvas.getActiveObject()
      canvas.fire('object:modified', { target: activeObj ?? itexts[0] })
    }

    // Font loading — load once then apply
    if (style.fontFamily) {
      const isAvailable = document.fonts.check(`12px "${style.fontFamily}"`)
      if (isAvailable) {
        doApply()
        return
      }
      const fontDef = AVAILABLE_FONTS.find((f) => f.family === style.fontFamily)
      if (fontDef) {
        loadFont(fontDef).then(() => doApply())
        return
      }
    }

    doApply()
  }, [fabricRef, selectedObjectId, updateObject])

  return { applyStyle }
}

/**
 * Read the style at the cursor position (or first character) when editing,
 * falling back to per-character styles from line 0, then to the base object.
 * Works for single selection, in-edit mode, AND multi-selection (reads first IText).
 */
export function getCurrentTextStyle(canvas: Canvas | null): TextStyle | null {
  if (!canvas) return null

  // Single IText active (editing or just selected)
  let itext = getActiveIText(canvas)

  // Multi-selection: use the first IText in the ActiveSelection
  if (!itext) {
    const active = canvas.getActiveObject()
    if (active && (active as any).type === 'activeselection') {
      const objs = (active as any)._objects as unknown[] | undefined
      if (Array.isArray(objs)) {
        itext = objs.find((o): o is IText => o instanceof IText) ?? null
      }
    }
  }

  if (!itext) return null

  // Try to get style at cursor or first character
  const cursorStyle = getStyleAtCursor(itext)

  return {
    fontFamily: (cursorStyle.fontFamily ?? itext.fontFamily as string) ?? 'Inter',
    fontSize: (cursorStyle.fontSize ?? itext.fontSize) ?? 24,
    fontWeight: ((cursorStyle.fontWeight ?? itext.fontWeight) as 'normal' | 'bold') ?? 'normal',
    fontStyle: ((cursorStyle.fontStyle ?? itext.fontStyle) as 'normal' | 'italic') ?? 'normal',
    underline: (cursorStyle.underline ?? itext.underline) ?? false,
    linethrough: (cursorStyle.linethrough ?? (itext as any).linethrough) ?? false,
    textAlign: (itext.textAlign as TextStyle['textAlign']) ?? 'left',
    fill: (cursorStyle.fill ?? (typeof itext.fill === 'string' ? itext.fill : null)) ?? '#ffffff',
    charSpacing: (itext as any).charSpacing ?? 0,
    lineHeight: itext.lineHeight ?? 1.16,
  }
}

/**
 * Extract the per-character style at the cursor position,
 * or at the first styled character if not editing.
 */
function getStyleAtCursor(itext: IText): Record<string, unknown> {
  const styles = (itext as any).styles as Record<number, Record<number, Record<string, unknown>>> | undefined
  if (!styles) return {}

  // If editing, get style at cursor position
  if ((itext as any).isEditing) {
    const pos = (itext as any).selectionStart ?? 0
    // Convert linear position to line/char
    const text = itext.text ?? ''
    const lines = text.split('\n')
    let charCount = 0
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineLen = lines[lineIdx].length
      if (pos <= charCount + lineLen) {
        const charIdx = Math.max(0, pos - charCount - 1) // Style of char before cursor
        const charStyle = styles[lineIdx]?.[charIdx]
        if (charStyle && Object.keys(charStyle).length > 0) return charStyle
        // Try first char of this line
        const firstChar = styles[lineIdx]?.[0]
        if (firstChar && Object.keys(firstChar).length > 0) return firstChar
        break
      }
      charCount += lineLen + 1 // +1 for \n
    }
  }

  // Fallback: first styled character
  for (const lineKey of Object.keys(styles).sort((a, b) => Number(a) - Number(b))) {
    const line = styles[Number(lineKey)]
    if (!line) continue
    for (const charKey of Object.keys(line).sort((a, b) => Number(a) - Number(b))) {
      const charStyle = line[Number(charKey)]
      if (charStyle && Object.keys(charStyle).length > 0) return charStyle
    }
  }
  return {}
}
