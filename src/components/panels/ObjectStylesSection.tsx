import { useState } from 'react'
import { Plus, X, Check, Brush } from 'lucide-react'
import { toast } from 'sonner'
import { useObjectStyles, captureStyle, applyStyle } from '@/features/brandkit/useObjectStyles'
import { globalFabricCanvas, globalSnapshot } from '@/features/editor/globalCanvas'
import { syncToStore } from '@/features/editor/useAddObject'
import { PropertySection } from '@/components/shared/panel'
import { useTranslation } from '@/lib/i18n'

/**
 * Styles d'objets réutilisables (panneau Palette) : capture du style de la
 * sélection sous un nom, application en 1 clic — partagés entre tous les projets.
 */
export function ObjectStylesSection() {
  const { t } = useTranslation()
  const { styles, add, remove } = useObjectStyles()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const capture = () => {
    const canvas = globalFabricCanvas
    const obj = canvas?.getActiveObject()
    if (!obj) {
      toast.warning(t('objectStyles.selectToCapture'))
      return
    }
    add(captureStyle(obj, name.trim() || `Style ${(styles?.length ?? 0) + 1}`))
    setName('')
    setNaming(false)
    toast.success(t('objectStyles.saved'))
  }

  const apply = (id: string) => {
    const canvas = globalFabricCanvas
    const objs = canvas?.getActiveObjects() ?? []
    const style = styles?.find((s) => s.id === id)
    if (!canvas || !style) return
    if (objs.length === 0) {
      toast.warning(t('objectStyles.selectToApply'))
      return
    }
    objs.forEach((o) => applyStyle(o, style))
    canvas.requestRenderAll()
    syncToStore(canvas)
    globalSnapshot?.()
  }

  return (
    <PropertySection
      title={t('objectStyles.title')}
      tourId="palette-styles"
      help={t('objectStyles.help')}
    >
      {styles !== null && styles.length === 0 && (
        <p className="text-[10px] text-white/20 italic py-1">{t('objectStyles.empty')}</p>
      )}
      <div className="flex flex-col gap-1">
        {(styles ?? []).map((s) => (
          <div key={s.id} className="group flex items-center gap-2">
            <button
              onClick={() => apply(s.id)}
              className="flex-1 flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10 transition-colors text-left"
              title={t('objectStyles.apply')}
            >
              <span
                className="w-4 h-4 rounded border shrink-0"
                style={{
                  backgroundColor: typeof s.props.fill === 'string' ? s.props.fill : 'transparent',
                  borderColor: typeof s.props.stroke === 'string' && s.props.stroke ? s.props.stroke : 'rgba(255,255,255,0.2)',
                }}
              />
              <span className="text-xs text-white/70 truncate">{s.name}</span>
              {typeof s.props.fontFamily === 'string' && (
                <span className="text-[9px] text-white/25 truncate">{s.props.fontFamily} {String(s.props.fontSize ?? '')}</span>
              )}
            </button>
            <button
              onClick={() => remove(s.id)}
              aria-label={`Supprimer le style ${s.name}`}
              className="hidden group-hover:block p-0.5 text-white/30 hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2">
        {naming ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && capture()}
              placeholder={t('objectStyles.name')}
              className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-1 text-[10px] text-white placeholder:text-white/20 min-w-0"
            />
            <button onClick={capture} className="text-green-400 hover:text-green-300 p-0.5"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => setNaming(false)} className="text-white/30 hover:text-white/50 p-0.5"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button
            onClick={() => setNaming(true)}
            className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] text-white/60 transition-colors"
          >
            <Plus className="w-3 h-3" /> <Brush className="w-3 h-3" /> {t('pal.captureStyle')}
          </button>
        )}
      </div>
    </PropertySection>
  )
}
