// src/features/workflows/UserTemplatesSection.tsx
// Section « Mes modèles » de la page Workflows : modèles créés par l'utilisateur
// (privés). Clic = instancier un workflow ; crayon = éditer les infos ; corbeille
// = supprimer. L'édition du graphe se fait en instanciant puis « Modèle » dans
// l'éditeur (option « Mettre à jour »).
import { useEffect, useState } from 'react'
import { Pencil, Trash2, X } from 'lucide-react'
import { notify } from '@/lib/notify'
import type { UserWorkflowTemplate } from './templates'
import { listUserTemplates, updateUserTemplateMeta, deleteUserTemplate } from './persistence/workflowsApi'

interface Props {
  uid: string
  canEdit: boolean
  canDelete: boolean
  onUse: (template: UserWorkflowTemplate) => void
}

export function UserTemplatesSection({ uid, canEdit, canDelete, onUse }: Props) {
  const [templates, setTemplates] = useState<UserWorkflowTemplate[]>([])
  const [editing, setEditing] = useState<UserWorkflowTemplate | null>(null)

  useEffect(() => {
    void listUserTemplates(uid).then(setTemplates)
  }, [uid])

  const saveMeta = async (meta: { name: string; description: string; emoji: string }) => {
    if (!editing) return
    const id = editing.id
    setEditing(null)
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...meta } : t)))
    await updateUserTemplateMeta(uid, id, meta)
    notify.success('Modèle mis à jour')
  }

  const remove = async (t: UserWorkflowTemplate) => {
    setTemplates((prev) => prev.filter((x) => x.id !== t.id))
    await deleteUserTemplate(uid, t.id)
  }

  if (templates.length === 0) return null

  return (
    <section className="mb-8" aria-label="Mes modèles de workflows">
      <h2 className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Mes modèles</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {templates.map((t) => (
          <div
            key={t.id}
            className="relative text-left bg-surface border border-white/[0.06] rounded-lg p-3.5 hover:border-indigo-500/60 hover:bg-white/[0.02] transition-colors group"
          >
            <button onClick={() => onUse(t)} className="block w-full text-left" title="Créer un workflow depuis ce modèle">
              <div className="text-xl mb-2" aria-hidden="true">{t.emoji}</div>
              <div className="text-[13px] font-medium text-white/80 group-hover:text-white pr-12">{t.name}</div>
              <p className="text-[11px] text-white/35 mt-1 leading-snug line-clamp-3">{t.description}</p>
              <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-indigo-300/70 bg-indigo-500/10 rounded px-1.5 py-0.5">
                Mon modèle
              </span>
            </button>
            <div className="absolute top-2 right-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {canEdit && (
                <button
                  onClick={() => setEditing(t)}
                  className="p-1 text-neutral-500 hover:text-white"
                  aria-label="Modifier les infos du modèle"
                  title="Modifier nom / émoji / description"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => void remove(t)}
                  className="p-1 text-neutral-500 hover:text-red-400"
                  aria-label="Supprimer le modèle"
                  title="Supprimer le modèle"
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
          <h2 className="text-lg font-semibold">Modifier le modèle</h2>
          <button onClick={onClose} className="p-1 text-neutral-500 hover:text-white" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <label className="block text-sm w-16 shrink-0">
            <span className="text-white/60">Émoji</span>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={4}
              className="mt-1 w-full bg-well border border-neutral-700 rounded px-2 py-2 text-center text-lg outline-none focus:border-indigo-500"
            />
          </label>
          <label className="block text-sm flex-1">
            <span className="text-white/60">Nom</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full bg-well border border-neutral-700 rounded px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500"
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-white/60">Description</span>
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
