import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import {
  CATEGORY_META,
  PROMPT_CATEGORIES,
  type Prompt,
  type PromptCategory,
  type PromptDraft,
} from './types'

interface PromptEditDialogProps {
  open: boolean
  initial: Prompt | null
  onClose: () => void
  onSave: (draft: PromptDraft) => Promise<void> | void
}

export function PromptEditDialog({ open, initial, onClose, onSave }: PromptEditDialogProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<PromptCategory>('custom')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle(initial?.title ?? '')
    setContent(initial?.content ?? '')
    setCategory(initial?.category ?? 'custom')
    setSaving(false)
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, saving, onClose])

  if (!open) return null

  const canSave = title.trim().length > 0 && content.trim().length > 0 && !saving

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave({ title: title.trim(), content: content.trim(), category })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/60" onClick={() => !saving && onClose()} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-3xl max-h-[90vh] bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-[14px] font-semibold text-white">
              {initial ? 'Modifier le prompt' : 'Nouveau prompt'}
            </h2>
            <button
              type="button"
              onClick={() => !saving && onClose()}
              className="text-white/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4 flex-1 overflow-y-auto min-h-0">
            <div>
              <label className="block text-[12px] text-white/60 mb-1.5">Titre</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex. Rédiger un email professionnel"
                className="w-full bg-[#0f0f0f] border border-white/10 focus:border-violet-500/50 rounded-lg px-3 py-2 text-[13.5px] text-white placeholder:text-white/30 outline-none transition-colors"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[12px] text-white/60 mb-1.5">Catégorie</label>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_CATEGORIES.map((c) => {
                  const meta = CATEGORY_META[c]
                  const Icon = meta.icon
                  const active = category === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`flex items-center gap-1.5 text-[12.5px] rounded-full px-3 py-1.5 border transition-colors ${
                        active
                          ? 'bg-violet-500/15 text-violet-200 border-violet-500/40'
                          : 'bg-white/[0.03] text-white/70 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 opacity-80" />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-white/60 mb-1.5">
                Contenu du prompt
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Décris la requête. Tu peux utiliser des [placeholders] pour les variables."
                rows={12}
                className="block w-full bg-[#0f0f0f] border border-white/10 focus:border-violet-500/50 rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-white/30 outline-none resize-y font-mono transition-colors min-h-[180px]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => !saving && onClose()}
              className="text-[13px] text-white/70 hover:text-white px-3 py-1.5 rounded-md transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="text-[13px] font-medium text-white bg-violet-500 hover:bg-violet-400 disabled:bg-white/[0.06] disabled:text-white/40 px-4 py-1.5 rounded-md transition-colors"
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
