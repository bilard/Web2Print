import { useEffect, useMemo, useState } from 'react'
import { Workflow as WorkflowIcon, Check, Search } from 'lucide-react'
import { toast } from 'sonner'
import { listWorkflows } from '@/features/workflows/persistence/workflowsApi'
import { updateUserAccess, type ManagedUser } from '@/features/access/usersApi'
import { recordAudit } from '@/lib/auditLog'
import { t } from '@/lib/i18n'

/**
 * Choix des WORKFLOWS auxquels un membre a accès, un par un.
 *
 * La permission `workflows.view` ouvre le MODULE ; cette liste dit lesquels de
 * ses workflows le membre voit réellement dans l'espace commun de la société.
 *
 * ⚠️ Aucune case cochée ⇒ TOUS les workflows. Une liste vide ne peut pas vouloir
 * dire « aucun » : tous les comptes existants en sont dépourvus, et l'inverse
 * aurait coupé l'accès à chacun dès le déploiement. La restriction est un acte
 * volontaire, et l'écran le dit.
 */
export function UserWorkflowScope({
  user, workspaceUid, onSaved,
}: { user: ManagedUser; workspaceUid: string; onSaved: () => void }) {
  const [all, setAll] = useState<{ id: string; name: string }[]>([])
  const [selected, setSelected] = useState<string[]>(user.allowedWorkflows)
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!workspaceUid) return
    void listWorkflows(workspaceUid)
      .then((ws) => setAll(ws.map((w) => ({ id: w.id, name: w.name || w.id }))))
      .catch((e) => console.warn('[UserWorkflowScope] lecture des workflows refusée:', e))
  }, [workspaceUid])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return needle ? all.filter((w) => w.name.toLowerCase().includes(needle)) : all
  }, [all, q])

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const save = async () => {
    setSaving(true)
    try {
      await updateUserAccess(user.uid, { allowedWorkflows: selected })
      recordAudit({
        action: 'access.workflows.scope', module: 'access',
        targetId: user.uid, targetLabel: user.email,
        meta: { before: `${user.allowedWorkflows.length || 'tous'}`, after: `${selected.length || 'tous'}` },
      })
      toast.success(selected.length ? t('wfs.saved', { n: selected.length }) : t('wfs.savedAll'))
      onSaved()
    } catch (e) {
      toast.error(t('wfs.failed'))
      console.warn('[UserWorkflowScope] enregistrement refusé:', e)
    } finally { setSaving(false) }
  }

  const dirty = selected.join('|') !== user.allowedWorkflows.join('|')

  return (
    <div>
      <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        <WorkflowIcon className="w-3 h-3" /> {t('wfs.title')}
      </p>
      <p className="text-[10px] text-white/35 mb-1.5">
        {selected.length === 0 ? t('wfs.allHint') : t('wfs.someHint', { n: selected.length })}
      </p>

      {all.length > 6 && (
        <div className="relative mb-1.5">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('wfs.search')}
            className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white placeholder:text-white/30" />
        </div>
      )}

      {all.length === 0 ? (
        <p className="text-[11px] text-white/25">{t('wfs.none')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((w) => {
            const on = selected.includes(w.id)
            return (
              <button key={w.id} onClick={() => toggle(w.id)}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors ${on
                  ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-100'
                  : 'border-white/10 text-white/45 hover:text-white/75 hover:border-white/20'}`}>
                {on && <Check className="w-3 h-3" />}{w.name}
              </button>
            )
          })}
        </div>
      )}

      {dirty && (
        <div className="flex items-center gap-2 mt-2">
          <button onClick={() => void save()} disabled={saving}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-[#fff]">
            {t('wfs.apply')}
          </button>
          <button onClick={() => setSelected(user.allowedWorkflows)}
            className="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 text-white/50 hover:text-white/80">
            {t('ac.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
