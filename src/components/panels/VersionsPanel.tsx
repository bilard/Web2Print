import { useState } from 'react'
import { History, Plus, RotateCcw, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useVersions } from '@/features/versions/useVersions'
import { useEditorStore } from '@/stores/editor.store'
import { OptionHelp } from '@/components/shared/OptionHelp'
import { useTranslation, intlLocale } from '@/lib/i18n'

/**
 * Historique de versions du document : snapshots manuels avec miniature,
 * restauration en 1 clic (recharge l'éditeur), 20 versions max.
 */
export function VersionsPanel() {
  const { t, locale } = useTranslation()
  const projectId = useEditorStore((s) => s.projectId)
  const { versions, createVersion, restoreVersion, deleteVersion } = useVersions(projectId)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const onCreate = async () => {
    setBusy(true)
    try {
      await createVersion('')
      toast.success(t('versions.created'))
    } catch (e) {
      toast.error(t('versions.createError', { message: String(e instanceof Error ? e.message : e) }))
    } finally {
      setBusy(false)
    }
  }

  const onRestore = async (id: string) => {
    setBusy(true)
    try {
      await restoreVersion(id) // recharge la page en cas de succès
    } catch (e) {
      toast.error(t('versions.restoreError', { message: String(e instanceof Error ? e.message : e) }))
      setBusy(false)
    }
  }

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1 text-[10px] text-white/40 uppercase tracking-wider">
          <History className="w-3 h-3" /> Versions
          <OptionHelp text={t('versions.help')} />
        </h4>
        <button
          onClick={() => void onCreate()}
          disabled={busy || !projectId}
          className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-50 text-[10px] text-indigo-300 transition-colors"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Créer une version
        </button>
      </div>

      {versions === null ? (
        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 text-white/20 animate-spin" /></div>
      ) : versions.length === 0 ? (
        <p className="text-[10px] text-white/20 italic py-1">{t('versions.empty')}</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {versions.map((v) => (
            <div key={v.id} className="group flex items-center gap-2 p-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
              {v.thumbnail ? (
                <img src={v.thumbnail} alt="" className="w-10 h-10 object-cover rounded bg-well shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded bg-well shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[11px] text-white/75 truncate">{v.label}</span>
                  {v.auto && (
                    <span className="shrink-0 px-1 py-px rounded bg-white/[0.08] text-[8px] uppercase tracking-wide text-white/40">
                      auto
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-white/30">{new Date(v.createdAt).toLocaleString(intlLocale(locale))}</div>
              </div>
              {confirmId === v.id ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => void onRestore(v.id)}
                    disabled={busy}
                    className="px-1.5 py-0.5 rounded bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-[9px]"
                  >
                    Confirmer
                  </button>
                  <button onClick={() => setConfirmId(null)} className="text-[9px] text-white/40 hover:text-white/70 px-1">
                    Annuler
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setConfirmId(v.id)}
                    title={t('versions.restore')}
                    className="p-1 rounded text-white/30 hover:text-indigo-400 hover:bg-white/[0.06]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => void deleteVersion(v.id).then(() => toast.success(t('versions.deleted')))}
                    title={t('versions.delete')}
                    className="hidden group-hover:block p-1 rounded text-white/30 hover:text-red-400 hover:bg-white/[0.06]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-[9px] text-white/15 leading-relaxed">
        La restauration ré-écrit le contenu du document puis recharge l'éditeur. Créez une version
        avant de restaurer si vous voulez pouvoir revenir à l'état actuel.
      </p>
    </div>
  )
}
