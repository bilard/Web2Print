import { useState, useEffect } from 'react'
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react'
import { useEditorStore } from '@/stores/editor.store'
import { useTextEditor, getCurrentTextStyle, getActivePtScale } from '@/features/editor/useTextEditor'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { AVAILABLE_FONTS, getAllFonts } from '@/features/assets/useFonts'
import type { TextStyle } from '@/features/editor/useTextEditor'
import type { Canvas } from 'fabric'

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96]

function ToolBtn({
  active, onClick, title, children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'bg-indigo-500/30 text-indigo-300'
          : 'text-white/50 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

export function TextToolbar() {
  const { selectedObjectId, selectedObjectIds, canvasObjects } = useEditorStore()
  const fabricRef = { current: globalFabricCanvas as Canvas | null }
  const { applyStyle } = useTextEditor(fabricRef)

  // All selected text objects (supports multi-selection)
  const selectedTextObjects = canvasObjects.filter(
    (o) => o.type === 'text' && selectedObjectIds.includes(o.id)
  )
  const hasTextSelected = selectedTextObjects.length > 0

  // Reference object for displaying current style (first selected text)
  const primaryTextObj = selectedTextObjects[0] ?? canvasObjects.find((o) => o.id === selectedObjectId && o.type === 'text')

  // Track style live from canvas (works for single, multi-selection, and editing)
  const [cursorStyle, setCursorStyle] = useState<TextStyle | null>(null)
  // IDML point scale: Fabric fontSize = IDML_pt × ptScale → divide for display
  const [ptScale, setPtScale] = useState(1)

  useEffect(() => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const update = () => {
      setCursorStyle(getCurrentTextStyle(canvas))
      setPtScale(getActivePtScale(canvas))
    }
    const clearStyle = () => { setCursorStyle(null); setPtScale(1) }
    update()
    canvas.on('selection:created' as any, update)
    canvas.on('selection:updated' as any, update)
    canvas.on('selection:cleared' as any, clearStyle)
    canvas.on('text:selection:changed' as any, update)
    canvas.on('text:editing:entered' as any, update)
    canvas.on('text:editing:exited' as any, update)
    canvas.on('object:modified' as any, update)
    return () => {
      canvas.off('selection:created' as any, update)
      canvas.off('selection:updated' as any, update)
      canvas.off('selection:cleared' as any, clearStyle)
      canvas.off('text:selection:changed' as any, update)
      canvas.off('text:editing:entered' as any, update)
      canvas.off('text:editing:exited' as any, update)
      canvas.off('object:modified' as any, update)
    }
  }, [selectedObjectId])

  if (!hasTextSelected || !primaryTextObj) return null

  // Cursor style (in-edit per-char) takes priority, then store values from primary object
  const style: TextStyle = cursorStyle ?? {
    fontFamily: primaryTextObj.fontFamily ?? 'Inter',
    fontSize: primaryTextObj.fontSize ?? 24,
    fontWeight: (primaryTextObj.fontWeight as 'normal' | 'bold') ?? 'normal',
    fontStyle: (primaryTextObj.fontStyle as 'normal' | 'italic') ?? 'normal',
    underline: primaryTextObj.underline ?? false,
    linethrough: primaryTextObj.linethrough ?? false,
    textAlign: (primaryTextObj.textAlign as TextStyle['textAlign']) ?? 'left',
    fill: primaryTextObj.fill ?? '#ffffff',
    charSpacing: primaryTextObj.charSpacing ?? 0,
    lineHeight: primaryTextObj.lineHeight ?? 1.16,
  }

  return (
    <div className="bg-[#1e1e1e] border-b border-white/10 px-3 py-1.5 flex items-center gap-1 flex-wrap shrink-0 z-20">
      {/* Font family */}
      <select
        value={style.fontFamily}
        onChange={(e) => applyStyle({ fontFamily: e.target.value })}
        className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 w-36 cursor-pointer"
        style={{ fontFamily: style.fontFamily }}
      >
        {(() => {
          const allFonts = getAllFonts()
          const docFonts = allFonts.filter(f => !AVAILABLE_FONTS.some(af => af.family === f.family))
          return <>
            {docFonts.length > 0 && (
              <optgroup label="Fonts du document">
                {docFonts.map(f => <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>)}
              </optgroup>
            )}
            <optgroup label="Google Fonts">
              {AVAILABLE_FONTS.map(f => <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>)}
            </optgroup>
          </>
        })()}
      </select>

      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* Font size — affiché en points IDML (fontSize / ptScale), appliqué en unités Fabric */}
      <div className="flex items-center">
        {(() => {
          const displayPt = Math.round(style.fontSize / ptScale)
          const applyPt = (pt: number) => applyStyle({ fontSize: Math.max(1, pt) * ptScale })
          const sizes = FONT_SIZES.includes(displayPt)
            ? FONT_SIZES
            : [...FONT_SIZES, displayPt].sort((a, b) => a - b)
          return <>
            <select
              value={displayPt}
              onChange={(e) => applyPt(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-l px-1.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 w-14 cursor-pointer"
            >
              {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              type="number"
              value={displayPt}
              onChange={(e) => applyPt(Math.max(1, Number(e.target.value)))}
              className="bg-white/5 border border-white/10 border-l-0 rounded-r px-1.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 w-12"
              min={1}
              max={400}
            />
          </>
        })()}
      </div>

      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* Bold / Italic / Underline */}
      <ToolBtn
        active={style.fontWeight === 'bold'}
        onClick={() => applyStyle({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })}
        title="Gras (⌘B)"
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        active={style.fontStyle === 'italic'}
        onClick={() => applyStyle({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })}
        title="Italique (⌘I)"
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolBtn>
      <ToolBtn
        active={style.underline}
        onClick={() => applyStyle({ underline: !style.underline })}
        title="Souligné (⌘U)"
      >
        <Underline className="w-3.5 h-3.5" />
      </ToolBtn>

      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* Alignment */}
      {(
        [
          { align: 'left' as const, Icon: AlignLeft, title: 'Gauche' },
          { align: 'center' as const, Icon: AlignCenter, title: 'Centre' },
          { align: 'right' as const, Icon: AlignRight, title: 'Droite' },
          { align: 'justify' as const, Icon: AlignJustify, title: 'Justifié' },
        ] as const
      ).map(({ align, Icon, title }) => (
        <ToolBtn
          key={align}
          active={style.textAlign === align}
          onClick={() => applyStyle({ textAlign: align })}
          title={title}
        >
          <Icon className="w-3.5 h-3.5" />
        </ToolBtn>
      ))}

      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* Color */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-white/40">Couleur</span>
        <input
          type="color"
          value={style.fill}
          onChange={(e) => applyStyle({ fill: e.target.value })}
          className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20 p-0"
          title="Couleur du texte"
        />
      </div>
    </div>
  )
}
