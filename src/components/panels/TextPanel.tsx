import { Textbox } from 'fabric'
import { Type, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useEditorStore } from '@/stores/editor.store'

interface TextStyle {
  label: string
  preview: string
  fontFamily: string
  fontSize: number
  fontWeight: string
  fill: string
}

const TEXT_STYLES: TextStyle[] = [
  { label: 'Titre principal', preview: 'Titre', fontFamily: 'Montserrat', fontSize: 48, fontWeight: 'bold', fill: '#ffffff' },
  { label: 'Sous-titre', preview: 'Sous-titre', fontFamily: 'Montserrat', fontSize: 32, fontWeight: '600', fill: '#ffffff' },
  { label: 'Titre section', preview: 'Section', fontFamily: 'Inter', fontSize: 24, fontWeight: 'bold', fill: '#ffffff' },
  { label: 'Corps de texte', preview: 'Paragraphe', fontFamily: 'Inter', fontSize: 16, fontWeight: 'normal', fill: '#cccccc' },
  { label: 'Citation', preview: '"Citation"', fontFamily: 'Playfair Display', fontSize: 20, fontWeight: 'normal', fill: '#aaaaaa' },
  { label: 'Légende', preview: 'Légende', fontFamily: 'Inter', fontSize: 12, fontWeight: 'normal', fill: '#888888' },
  { label: 'Bouton', preview: 'BOUTON', fontFamily: 'Inter', fontSize: 14, fontWeight: 'bold', fill: '#6366f1' },
  { label: 'Étiquette', preview: 'Label', fontFamily: 'Poppins', fontSize: 11, fontWeight: '500', fill: '#ffffff' },
]

function addTextToCanvas(style: TextStyle) {
  const canvas = globalFabricCanvas
  if (!canvas) return

  const id = `text_${Date.now()}`
  const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom = canvas.getZoom()
  const cx = canvas.getWidth() / 2
  const cy = canvas.getHeight() / 2
  const docX = (cx - vt[4]) / zoom
  const docY = (cy - vt[5]) / zoom

  const itext = new Textbox(style.label, {
    left: docX - 100,
    top: docY - style.fontSize / 2,
    width: 200,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fill: style.fill,
    data: { id, type: 'text', name: style.label },
  })

  canvas.add(itext)
  canvas.setActiveObject(itext)
  canvas.requestRenderAll()
  syncToStore(canvas)
  useEditorStore.getState().setSelectedObjectId(id)
  itext.on('modified', () => syncToStore(canvas))
  itext.on('moving', () => syncToStore(canvas))
}

export function TextPanel() {
  return (
    <div className="p-3 flex flex-col gap-3">
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Styles de texte</p>

      <div className="flex flex-col gap-1.5">
        {TEXT_STYLES.map((style) => (
          <button
            key={style.label}
            onClick={() => addTextToCanvas(style)}
            className="flex items-center gap-3 p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 rounded-lg transition-all group text-left"
          >
            <div className="w-7 h-7 bg-indigo-500/10 rounded-md flex items-center justify-center shrink-0">
              <Type className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <p
                className="text-white/80 group-hover:text-white transition-colors truncate"
                style={{
                  fontFamily: style.fontFamily,
                  fontSize: `${Math.min(style.fontSize * 0.4 + 8, 18)}px`,
                  fontWeight: style.fontWeight,
                }}
              >
                {style.preview}
              </p>
              <p className="text-[10px] text-white/30 mt-0.5">{style.label} · {style.fontSize}pt</p>
            </div>
          </button>
        ))}
      </div>

      <div className="border-t border-white/5 pt-3">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Alignement rapide</p>
        <div className="flex gap-1">
          {[
            { icon: AlignLeft, label: 'Gauche' },
            { icon: AlignCenter, label: 'Centre' },
            { icon: AlignRight, label: 'Droite' },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              title={label}
              className="flex-1 py-2 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/40 rounded-md transition-colors text-white/40 hover:text-white"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
