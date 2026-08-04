import { Pencil, X } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useI18nOverridesStore } from '@/stores/i18nOverrides.store'
import { useLabelEditor } from '@/features/i18n/useLabelEditor'
import { LabelEditPopover } from './LabelEditPopover'

/**
 * Couche d'édition des libellés — montée UNE FOIS au-dessus de l'application.
 *
 * N'affiche RIEN et n'ouvre JAMAIS l'éditeur tant que le mode n'est pas armé
 * depuis les réglages : un Alt+clic est un geste courant (sélection, raccourcis
 * système) et il ne doit pas ouvrir un éditeur de vocabulaire au milieu d'une
 * session de travail normale.
 *
 * ⚠️ Le hook, lui, reste monté en permanence : mode désarmé, il se contente de
 * RÉPONDRE à un Alt+clic visant un vrai libellé, par un message expliquant
 * comment activer le mode. Sans cette réponse, le raccourci passait pour cassé
 * alors qu'il n'était simplement pas activé. Pas de `preventDefault` dans ce
 * cas : le clic normal suit son cours.
 */
export function LabelEditorOverlay() {
  const { t } = useTranslation()
  const editing = useI18nOverridesStore((s) => s.editing)
  const setEditing = useI18nOverridesStore((s) => s.setEditing)
  const { target, clearTarget } = useLabelEditor()

  if (!editing) return null

  return (
    <>
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/90 text-[#fff] text-[11px] font-medium shadow-lg">
        <Pencil className="w-3 h-3" />
        {t('i18n.edit.modeHint')}
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label={t('i18n.edit.exitMode')}
          className="ml-1 opacity-70 hover:opacity-100"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      {target && <LabelEditPopover target={target} onClose={clearTarget} />}
    </>
  )
}
