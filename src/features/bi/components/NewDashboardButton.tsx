// Créer un tableau de bord VIDE mais VALIDE — un document qui ne passerait pas
// `parseDashboard` serait invisible dans la liste, sans que rien ne le dise.
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { saveDashboard } from '../store/dashboardsStore'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { DASHBOARD_VERSION } from '../types'
import { useTranslation } from '@/lib/i18n'

export function NewDashboardButton({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useTranslation()
  const uid = useWorkspaceUid()
  const user = useAuthStore((s) => s.user)
  // ⚠ `accountId` vaut '' quand aucune société n'est rattachée — `??` ne le rattraperait pas.
  const accountId = useAccessStore((s) => s.accountId) || 'default'

  const create = async () => {
    // ⚠ Pas de retour silencieux : `useWorkspaceUid` vaut `null` tant que l'accès n'est pas
    // hydraté, et un clic qui ne fait rien se lit comme un bouton cassé.
    if (!uid || !user) { toast.error(t('bi.save.failed')); return }
    const id = `bi_${Date.now().toString(36)}`
    try {
      await saveDashboard(uid, {
        id, name: t('bi.new.defaultName'), accountId, workspaceUid: uid,
        tiles: [], layout: [], filters: [],
        version: DASHBOARD_VERSION, createdAt: Date.now(), updatedAt: Date.now(), createdBy: user.uid,
      })
      onCreated(id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    }
  }

  return (
    <button
      onClick={create}
      className="inline-flex items-center gap-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 text-[#fff] rounded-lg px-3 py-1.5 transition-colors"
    >
      <Plus className="w-3.5 h-3.5" />{t('bi.new.button')}
    </button>
  )
}
