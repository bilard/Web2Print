// Bascule Consultation / Édition, et l'annulation-rétablissement qui n'a de sens qu'en édition.
//
// ⚠ Repris de `BiToolbar` : la bascule est EXPLICITE (bouton, ou touche « E » côté écran) et
// cadenassée par `canEdit` — le mode consultation ne doit jamais laisser traîner une poignée.
import { Undo2, Redo2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function BiModeSwitch({
  editing, onToggleEdit, canEdit, undo, redo, canUndo, canRedo,
}: {
  editing: boolean
  onToggleEdit: () => void
  canEdit: boolean
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const { t } = useTranslation()
  // ⚠ Sans le droit d'écrire, il n'y a pas deux modes : afficher un segment inerte laisserait
  // croire que l'édition est à un clic. On ne montre rien.
  if (!canEdit) return null

  const seg = (pressed: boolean) =>
    `px-2.5 py-1 rounded-md text-[11.5px] transition-colors ${
      pressed ? 'bg-indigo-500 text-[#fff] font-semibold' : 'text-white/55 hover:text-white'
    }`

  return (
    <div className="flex items-center gap-1.5">
      <div role="group" aria-label={t('bi.toolbar.toggleHint')}
        className="inline-flex rounded-lg border border-white/[0.06] bg-well p-0.5">
        <button type="button" aria-pressed={!editing} className={seg(!editing)}
          onClick={() => { if (editing) onToggleEdit() }}>
          {t('bi.toolbar.viewing')}
        </button>
        <button type="button" aria-pressed={editing} className={seg(editing)}
          onClick={() => { if (!editing) onToggleEdit() }}>
          {t('bi.toolbar.editing')}
        </button>
      </div>

      {editing && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} disabled={!canUndo} title={t('bi.toolbar.undo')}
            aria-label={t('bi.toolbar.undo')}
            className="p-1.5 rounded-lg bg-well text-white/55 hover:text-white disabled:opacity-30">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} title={t('bi.toolbar.redo')}
            aria-label={t('bi.toolbar.redo')}
            className="p-1.5 rounded-lg bg-well text-white/55 hover:text-white disabled:opacity-30">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
