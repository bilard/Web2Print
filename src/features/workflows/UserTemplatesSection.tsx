// Section « Mes modèles » de la page Workflows : modèles créés par l'utilisateur
// (privés). Clic = instancier un workflow ; crayon = éditer les infos ; corbeille
// = supprimer. L'édition du graphe se fait en instanciant puis « Modèle » dans
// l'éditeur (option « Mettre à jour »).
import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { notify } from '@/lib/notify'
import type { UserWorkflowTemplate } from './templates'
import { listUserTemplates, updateUserTemplateMeta, deleteUserTemplate } from './persistence/workflowsApi'
import { EmojiPicker } from './editor/EmojiPicker'
import { useTranslation } from '@/lib/i18n'

interface Props {
  uid: string
  canEdit: boolean
  canDelete: boolean
  onUse: (template: UserWorkflowTemplate) => void
}

export function UserTemplatesSection({ uid, canEdit, canDelete, onUse }: Props) {
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<UserWorkflowTemplate[]>([])
  const [editing, setEditing] = useState<UserWorkflowTemplate | null>(null)

  useEffect(() => {
    void listUserTemplates(uid).then(setTemplates)
  }, [uid])

  const saveMeta = async (meta: { name: string; description: string; emoji: string }) => {
    if (!editing) return
    const id = editing.id
    setEditing(null)
    setTemplates((prev) => prev.map((tpl) => (tpl.id === id ? { ...tpl, ...meta } : tpl)))
    await updateUserTemplateMeta(uid, id, meta)
    notify.success(t('wf.tpl.updated'))
  }

  const remove = async (tpl: UserWorkflowTemplate) => {
    setTemplates((prev) => prev.filter((x) => x.id !== tpl.id))
    await deleteUserTemplate(uid, tpl.id)
  }

  if (templates.length === 0) return null

  return (
    <section className="mb-8" aria-label={t('wf.tpl.section')}>
      <h2 className="text-[11px] uppercase tracking-wider text-white/30 mb-3">{t('wf.tpl.title')}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="relative text-left bg-surface border border-white/[0.06] rounded-lg p-3.5 hover:border-indigo-500/60 hover:bg-white/[0.02] transition-colors group"
          >
            <button onClick={() => onUse(tpl)} className="block w-full text-left" title={t('wf.tpl.createFrom')}>
              <div className="text-xl mb-2" aria-hidden="true">{tpl.emoji}</div>
              <div className="text-[13px] font-medium text-white/80 group-hover:text-white pr-12">{tpl.name}</div>
              <p className="text-[11px] text-white/35 mt-1 leading-snug line-clamp-3">{tpl.description}</p>
              <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-indigo-300/70 bg-indigo-500/10 rounded px-1.5 py-0.5">
                {t('userTemplatesSection.myTemplate')}
              </span>
            </button>
            <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {canEdit && (
                <button
                  onClick={() => setEditing(tpl)}
                  className="p-1 text-neutral-500 hover:text-white"
                  aria-label={t('wf.tpl.edit')}
                  title={t('wf.tpl.edit.help')}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => void remove(tpl)}
                  className="p-1 text-neutral-500 hover:text-red-400"
                  aria-label={t('wf.tpl.delete')}
                  title={t('wf.tpl.delete')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && <EditMetaDialog template={editing} onClose={() => setEditing(null)} onSave={saveMeta} />}
    </section>
  )
}

function EditMetaDialog({
  template,
  onClose,
  onSave,
}: {
  template: UserWorkflowTemplate
  onClose: () => void
  onSave: (meta: { name: string; description: string; emoji: string }) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description)
  const [emoji, setEmoji] = useState(template.emoji)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface border border-neutral-800 rounded-lg p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('wf.tpl.editTitle')}</h2>
          <CloseButton onClick={onClose} title={t('wf.tpl.close')} />
        </div>
        <div className="flex gap-2">
          <label className="block text-sm w-16 shrink-0">
            <span className="text-white/60">{t('wf.tpl.emoji')}</span>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </label>
          <label className="block text-sm flex-1">
            <span className="text-white/60">{t('wf.tpl.name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full bg-well border border-neutral-700 rounded px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-white/60">{t('wf.tpl.description')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full bg-well border border-neutral-700 rounded px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500 resize-none"
          />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-neutral-400 hover:text-white text-sm">
            Annuler
          </button>
          <button
            onClick={() => onSave({ name, description, emoji })}
            disabled={!name.trim()}
            className="px-4 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
