import { AlertTriangle, Eye } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { useTranslation } from '@/lib/i18n'

/**
 * Prévient qu'aucune modification du workflow ne sera conservée.
 *
 * S'ouvre à la PREMIÈRE modification, pas à l'ouverture de l'écran : consulter
 * un workflow en lecture est légitime et n'a pas à être interrompu. Le badge
 * « Lecture seule » de l'en-tête reste, lui, affiché en permanence — la modale
 * alerte, le badge rappelle.
 */
export function ReadOnlyWorkflowDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface border border-amber-400/30 rounded-lg p-5 space-y-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ro-wf-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="ro-wf-title" className="text-lg font-semibold flex items-center gap-2 text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {t('wfe.readOnly.title')}
          </h2>
          <CloseButton onClick={onClose} />
        </div>

        <p className="text-sm text-white/75 leading-relaxed">{t('wfe.readOnly.body')}</p>

        <p className="text-[12px] text-white/45 flex items-start gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-2">
          <Eye className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {t('wfe.readOnly.keepBrowsing')}
        </p>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-100 hover:bg-amber-500/30 text-sm transition-colors"
          >
            {t('wfe.readOnly.understood')}
          </button>
        </div>
      </div>
    </div>
  )
}
