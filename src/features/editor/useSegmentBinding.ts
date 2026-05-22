import { useCallback } from 'react'
import { Textbox } from 'fabric'
import { globalFabricCanvas } from './CanvasContainer'
import { syncToStore } from './useAddObject'
import { useMergeStore } from '@/stores/merge.store'
import { resolveText, remapStyles } from '@/features/merge/mergeEngine'
import type { TextSegment } from './useTextSegments'

type CharStyleMap = Record<number, Record<number, Record<string, unknown>>>

/** Linear position → [lineIndex, charIndex] in `text` */
function linearToLineChar(text: string, pos: number): [number, number] {
  const before = text.slice(0, Math.max(0, pos))
  const lines = before.split('\n')
  return [lines.length - 1, lines[lines.length - 1].length]
}

/** [lineIndex, charIndex] → linear position in `text` */
function lineCharToLinear(text: string, li: number, ci: number): number {
  const lines = text.split('\n')
  let pos = 0
  for (let i = 0; i < li && i < lines.length; i++) pos += lines[i].length + 1
  return pos + ci
}

/**
 * Rebuild style map after replacing text[startIdx..endIdx) with `newLength` chars.
 * - Styles before startIdx: unchanged
 * - New chars [startIdx, startIdx+newLength): get style of original char at startIdx
 * - Styles after endIdx: shifted by delta = newLength - (endIdx - startIdx)
 */
function rebuildStyles(
  origText: string,
  origStyles: CharStyleMap,
  startIdx: number,
  endIdx: number,
  newLength: number,
): CharStyleMap {
  const delta = newLength - (endIdx - startIdx)
  const newText = origText.slice(0, startIdx) + 'X'.repeat(newLength) + origText.slice(endIdx)
  const result: CharStyleMap = {}

  // Style du premier caractère de la plage liée → appliqué à tout le placeholder
  const [startLi, startCi] = linearToLineChar(origText, startIdx)
  const startStyle = origStyles[startLi]?.[startCi]
  if (startStyle) {
    for (let i = 0; i < newLength; i++) {
      const [nli, nci] = linearToLineChar(newText, startIdx + i)
      if (!result[nli]) result[nli] = {}
      result[nli][nci] = { ...startStyle }
    }
  }

  // Shift all existing style entries
  for (const [liStr, lineStyles] of Object.entries(origStyles)) {
    const li = Number(liStr)
    for (const [ciStr, charStyle] of Object.entries(lineStyles)) {
      const ci = Number(ciStr)
      const linearPos = lineCharToLinear(origText, li, ci)
      if (linearPos < startIdx) {
        if (!result[li]) result[li] = {}
        result[li][ci] = charStyle
      } else if (linearPos >= endIdx) {
        const newLinearPos = linearPos + delta
        if (newLinearPos >= 0) {
          const [nli, nci] = linearToLineChar(newText, newLinearPos)
          if (!result[nli]) result[nli] = {}
          result[nli][nci] = charStyle
        }
      }
      // Positions within [startIdx, endIdx) are dropped
    }
  }

  return result
}

export function useSegmentBinding() {
  /** Bind a text segment to a data field: replaces segment with {{fieldKey}} */
  const bind = useCallback((objectId: string, segment: TextSegment, fieldKey: string) => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const obj = canvas.getObjects().find((o) => (o as unknown as { data?: { id?: string } }).data?.id === objectId)
    if (!(obj instanceof Textbox)) return

    const data = (obj as unknown as { data: Record<string, unknown> }).data ?? {}
    const currentTemplate = (data.templateText as string | undefined) ?? obj.text ?? ''
    const currentStyles: CharStyleMap = (data.templateStyles as CharStyleMap | undefined) ??
      ((obj as unknown as { styles: CharStyleMap }).styles ?? {})

    const placeholder = `{{${fieldKey}}}`
    const newTemplate = currentTemplate.slice(0, segment.startIndex) + placeholder + currentTemplate.slice(segment.endIndex)
    const newStyles = rebuildStyles(currentTemplate, currentStyles, segment.startIndex, segment.endIndex, placeholder.length)

    if (!obj.data) obj.data = {}
    obj.data.templateText = newTemplate
    // Ne sauvegarder templateStyles que s'il y a des styles réels à préserver
    if (Object.keys(newStyles).length > 0) {
      obj.data.templateStyles = newStyles
    }

    // Resolve and display
    const { isConnected, rows, currentRowIndex, formulas, hideLineIfEmpty, formulaConfigs, columns } = useMergeStore.getState()
    if (isConnected && rows.length > 0) {
      const row = rows[currentRowIndex]
      const resolved = resolveText(newTemplate, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
      obj.set('text', resolved)
      // Appliquer les styles remappés uniquement si templateStyles n'est pas vide
      if (Object.keys(newStyles).length > 0) {
        const remapped = remapStyles(newTemplate, newStyles, row, formulas, hideLineIfEmpty, formulaConfigs, columns)
        if (Object.keys(remapped).length > 0) {
          ;(obj as unknown as { styles: CharStyleMap }).styles = remapped
        }
      }
    } else {
      obj.set('text', newTemplate)
      if (Object.keys(newStyles).length > 0) {
        ;(obj as unknown as { styles: CharStyleMap }).styles = newStyles
      }
    }

    ;(obj as unknown as { dirty: boolean }).dirty = true
    obj.setCoords()
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  /** Unbind a placeholder segment: replaces {{variable}} with current row value or variable name */
  const unbind = useCallback((objectId: string, segment: TextSegment) => {
    const canvas = globalFabricCanvas
    if (!canvas || !segment.isPlaceholder || !segment.variableKey) return
    const obj = canvas.getObjects().find((o) => (o as unknown as { data?: { id?: string } }).data?.id === objectId)
    if (!(obj instanceof Textbox)) return

    const data = (obj as unknown as { data: Record<string, unknown> }).data ?? {}
    const currentTemplate = (data.templateText as string | undefined) ?? obj.text ?? ''
    const currentStyles: CharStyleMap = (data.templateStyles as CharStyleMap | undefined) ??
      ((obj as unknown as { styles: CharStyleMap }).styles ?? {})

    const { isConnected, rows, currentRowIndex } = useMergeStore.getState()
    const replacement = isConnected && rows.length > 0
      ? String(rows[currentRowIndex][segment.variableKey] ?? segment.variableKey)
      : segment.variableKey

    const newTemplate = currentTemplate.slice(0, segment.startIndex) + replacement + currentTemplate.slice(segment.endIndex)
    const newStyles = rebuildStyles(currentTemplate, currentStyles, segment.startIndex, segment.endIndex, replacement.length)

    if (!obj.data) obj.data = {}
    obj.data.templateText = newTemplate
    obj.data.templateStyles = newStyles

    obj.set('text', newTemplate)
    ;(obj as unknown as { styles: CharStyleMap }).styles = newStyles
    ;(obj as unknown as { dirty: boolean }).dirty = true
    obj.setCoords()
    canvas.requestRenderAll()
    syncToStore(canvas)
  }, [])

  return { bind, unbind }
}
