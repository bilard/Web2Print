import { useMemo } from 'react'
import { IText } from 'fabric'
import { globalFabricCanvas } from './CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'

export interface TextSegment {
  text: string        // display: variable name for placeholder, literal chars for regular
  fill: string
  fontSize: number
  fontFamily: string
  fontWeight: string
  fontStyle: string
  startIndex: number  // linear position in templateText (or itext.text)
  endIndex: number    // exclusive
  isPlaceholder: boolean
  variableKey?: string
}

type CharStyleMap = Record<number, Record<number, Record<string, unknown>>>

function styleKey(s: Pick<TextSegment, 'fill' | 'fontSize' | 'fontFamily' | 'fontWeight' | 'fontStyle'>): string {
  return `${s.fill}|${s.fontSize}|${s.fontFamily}|${s.fontWeight}|${s.fontStyle}`
}

export function extractTextSegments(itext: IText): TextSegment[] {
  const rawData = (itext as unknown as { data?: Record<string, unknown> }).data
  const templateText = rawData?.templateText as string | undefined
  const templateStyles = rawData?.templateStyles as CharStyleMap | undefined

  // Work on templateText if available (contains {{}} placeholders), otherwise resolved text
  const workText = templateText ?? (itext.text ?? '')
  if (!workText) return []

  const base = {
    fill: typeof itext.fill === 'string' ? itext.fill : '#000000',
    fontSize: itext.fontSize ?? 16,
    fontFamily: (itext.fontFamily as string) ?? 'Inter',
    fontWeight: (itext.fontWeight as string) ?? 'normal',
    fontStyle: (itext.fontStyle as string) ?? 'normal',
  }

  const charStyles: CharStyleMap = templateStyles ??
    ((itext as unknown as { styles: CharStyleMap }).styles ?? {})

  /** Style for the char AT linear position `pos` in workText */
  function styleAtPos(pos: number) {
    // workText.slice(0, pos) gives us the prefix — its split gives line/char of char AT pos
    const before = workText.slice(0, pos)
    const lines = before.split('\n')
    const li = lines.length - 1
    const ci = lines[li].length
    const cs = charStyles[li]?.[ci] ?? {}
    return {
      fill: (cs.fill as string) ?? base.fill,
      fontSize: (cs.fontSize as number) ?? base.fontSize,
      fontFamily: (cs.fontFamily as string) ?? base.fontFamily,
      fontWeight: (cs.fontWeight as string) ?? base.fontWeight,
      fontStyle: (cs.fontStyle as string) ?? base.fontStyle,
    }
  }

  const segments: TextSegment[] = []
  const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g
  let lastIdx = 0
  let match: RegExpExecArray | null
  PLACEHOLDER_RE.lastIndex = 0

  /** Group consecutive chars in workText[from..to) by style */
  function addLiteralSegments(from: number, to: number) {
    let current: TextSegment | null = null
    for (let pos = from; pos < to; pos++) {
      const style = styleAtPos(pos)
      if (!current || styleKey(current) !== styleKey(style)) {
        current = { text: workText[pos], ...style, startIndex: pos, endIndex: pos + 1, isPlaceholder: false }
        segments.push(current)
      } else {
        current.text += workText[pos]
        current.endIndex = pos + 1
      }
    }
  }

  while ((match = PLACEHOLDER_RE.exec(workText)) !== null) {
    if (match.index > lastIdx) addLiteralSegments(lastIdx, match.index)
    const varKey = match[1]
    segments.push({
      text: varKey,
      ...styleAtPos(match.index),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
      isPlaceholder: true,
      variableKey: varKey,
    })
    lastIdx = match.index + match[0].length
  }

  if (lastIdx < workText.length) addLiteralSegments(lastIdx, workText.length)

  return segments
}

/** Returns objectId → TextSegment[] for text objects with mixed styles OR placeholders */
export function useTextSegments(): Record<string, TextSegment[]> {
  const { canvasObjects } = useEditorStore()

  return useMemo(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return {}
    const result: Record<string, TextSegment[]> = {}

    for (const obj of canvas.getObjects()) {
      const data = (obj as unknown as { data?: { id?: string } }).data
      if (obj instanceof IText && data?.id) {
        const segs = extractTextSegments(obj)
        if (segs.length > 1 || segs.some((s) => s.isPlaceholder)) {
          result[data.id] = segs
        }
      }
    }
    return result
  }, [canvasObjects])
}
