import { useState } from 'react'
import { AlertTriangle, OctagonAlert, CheckCircle2 } from 'lucide-react'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { collectPreflightInfo, runPreflight, type PreflightIssue } from '@/features/editor/preflight'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { PropertySection } from '@/components/shared/panel'
import { useTranslation } from '@/lib/i18n'

/**
 * Section « Preflight » du panneau Impression : analyse le canvas (résolution
 * effective des images, objets hors page, textes minuscules ou trop près du
 * bord) et liste les problèmes ; clic sur un problème = sélectionne l'objet.
 */
export function PreflightSection() {
  const { t } = useTranslation()
  const [issues, setIssues] = useState<PreflightIssue[] | null>(null)

  const analyze = () => {
    const canvas = globalFabricCanvas
    if (!canvas) return
    const { canvasWidth, canvasHeight, dpi, bleedMm } = useUIStore.getState()
    setIssues(
      runPreflight(collectPreflightInfo(canvas), {
        width: canvasWidth,
        height: canvasHeight,
        dpi,
        bleedMm,
        safeMm: 3,
      }),
    )
  }

  const selectObject = (objectId: string | null) => {
    const canvas = globalFabricCanvas
    if (!canvas || !objectId) return
    const obj = canvas.getObjects().find((o) => o.data?.id === objectId)
    if (!obj) return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
    useEditorStore.getState().setSelectedObjectId(objectId)
  }

  const errors = issues?.filter((i) => i.severity === 'error') ?? []
  const warnings = issues?.filter((i) => i.severity === 'warning') ?? []

  return (
    <PropertySection
      title={t('preflight.title')}
      help="Contrôle pré-impression : images sous 150/225 DPI effectifs, objets hors page (au-delà du fond perdu), textes < 5 pt ou à moins de 3 mm du bord de coupe."
      badge={
        <button
          onClick={analyze}
          className="px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[11px] text-white/70 transition-colors"
        >
          Analyser
        </button>
      }
    >
      {issues !== null && issues.length === 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-300/80 px-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Aucun problème détecté — prêt pour l'impression.
        </div>
      )}

      {issues !== null && issues.length > 0 && (
        <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
          <div className="text-[10px] text-white/30 px-1">
            {errors.length} erreur{errors.length > 1 ? 's' : ''} · {warnings.length} avertissement{warnings.length > 1 ? 's' : ''}
          </div>
          {[...errors, ...warnings].map((issue, i) => (
            <button
              key={i}
              onClick={() => selectObject(issue.objectId)}
              className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.07] text-left transition-colors"
              title={issue.objectId ? t('preflight.clickSelect') : undefined}
            >
              {issue.severity === 'error' ? (
                <OctagonAlert className="w-3.5 h-3.5 text-red-400 shrink-0 mt-px" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-px" />
              )}
              <span className="min-w-0">
                <span className="block text-[11px] text-white/75 truncate">{issue.objectName}</span>
                <span className="block text-[10px] text-white/40 leading-snug">{issue.message}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </PropertySection>
  )
}
