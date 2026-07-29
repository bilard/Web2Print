// Capture le workflow courant comme modèle réutilisable (création ou mise à jour
// du graphe d'un modèle existant). La config des nodes est embarquée telle quelle.
import { useEffect, useState } from 'react'
import { CloseButton } from '@/components/shared/CloseButton'
import { notify } from '@/lib/notify'
import type { Workflow } from '../types'
import {
  type UserWorkflowTemplate,
  templateFromWorkflow,
} from '../templates'
import { listUserTemplates, saveUserTemplate } from '../persistence/workflowsApi'
import { EmojiPicker } from './EmojiPicker'
import { useTranslation } from '@/lib/i18n'

interface Props {
  workflow: Workflow
  uid: string
  onClose: () => void
  onSaved?: () => void
}

export function SaveAsTemplateDialog({ workflow, uid, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const [existing, setExisting] = useState<UserWorkflowTemplate[]>([])
  const [targetId, setTargetId] = useState('') // '' = nouveau modèle
  const [name, setName] = useState(workflow.name || t('wft.defaultName'))
  const [description, setDescription] = useState(workflow.description || '')
  const [emoji, setEmoji] = useState('⭐')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void listUserTemplates(uid).then(setExisting)
  }, [uid])

  // Sélectionner un modèle existant pré-remplit ses infos (on écrasera son graphe).
  const pickTarget = (id: string) => {
    setTargetId(id)
    const t = existing.find((e) => e.id === id)
    if (t) {
      setName(t.name)
      setDescription(t.description)
      setEmoji(t.emoji)
    }
  }

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const base = existing.find((e) => e.id === targetId)
      const tpl = templateFromWorkflow(
        workflow,
        { id: targetId || undefined, name, description, emoji, createdAt: base?.createdAt },
        uid,
      )
      await saveUserTemplate(uid, tpl)
      notify.success(targetId ? t('wft.updated') : t('wft.created'), `« ${tpl.name} » est dans « Mes modèles ».`)
      onSaved?.()
      onClose()
    } catch (e) {
      notify.error("Échec de l'enregistrement", e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface border border-neutral-800 rounded-lg p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('wft.title')}</h2>
          <CloseButton onClick={onClose} title={t('wft.close')} />
        </div>

        {/* « Cible » : visible seulement s'il existe déjà des modèles à écraser. */}
        {existing.length > 0 && (
          <label className="block text-sm">
            <span className="text-white/60">{t('wft.target')}</span>
            <select
              value={targetId}
              onChange={(e) => pickTarget(e.target.value)}
              className="mt-1 w-full bg-well border border-neutral-700 rounded px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500"
            >
              <option value="">➕ Nouveau modèle</option>
              {existing.map((t) => (
                <option key={t.id} value={t.id}>Mettre à jour : {t.emoji} {t.name}</option>
              ))}
            </select>
          </label>
        )}

        <div className="flex gap-2">
          <label className="block text-sm w-16 shrink-0">
            <span className="text-white/60">{t('wft.emoji')}</span>
            <EmojiPicker value={emoji} onChange={setEmoji} />
          </label>
          <label className="block text-sm flex-1">
            <span className="text-white/60">{t('wft.name')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full bg-well border border-neutral-700 rounded px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-white/60">{t('wft.description')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full bg-well border border-neutral-700 rounded px-2.5 py-2 text-sm text-white outline-none focus:border-indigo-500 resize-none"
          />
        </label>

        <p className="text-[11px] text-white/35 leading-snug">
          La configuration actuelle des nodes ({workflow.nodes.length} nodes, {workflow.edges.length} liens) est
          capturée dans le modèle — URLs et identifiants compris.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-neutral-400 hover:text-white text-sm">
            Annuler
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || !name.trim()}
            className="px-4 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : targetId ? t('wft.update') : t('wft.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
