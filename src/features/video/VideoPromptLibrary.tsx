import { useState } from 'react'
import { Play, Pencil, Trash2, Library, Loader2, Check, X, Save } from 'lucide-react'
import type { VideoPrompt } from './useVideoPromptLibrary'
import { t } from '@/lib/i18n'

interface Props {
  prompts: VideoPrompt[]
  loading: boolean
  /** ID du prompt actuellement chargé dans le formulaire (carte « active »). */
  editingId: string | null
  onReplay: (prompt: VideoPrompt) => void
  onEdit: (prompt: VideoPrompt) => void
  onDelete: (id: string) => Promise<void>
  onRename: (id: string, title: string) => Promise<void>
  /** Réécrit cette entrée depuis le formulaire courant (uniquement la carte chargée). */
  onUpdate: (id: string) => void | Promise<void>
}

function previewLine(prompt: VideoPrompt): string {
  const t = prompt.title?.trim()
  if (t) return t
  return prompt.topic.replace(/\s+/g, ' ').trim().slice(0, 80)
}

function formatRelative(prompt: VideoPrompt): string {
  const ts = prompt.lastUsedAt?.toMillis() ?? prompt.createdAt?.toMillis()
  if (!ts) return ''
  const delta = Date.now() - ts
  const min = Math.round(delta / 60000)
  if (min < 1) return 'à l\'instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  if (d < 7) return `il y a ${d} j`
  const w = Math.round(d / 7)
  if (w < 5) return `il y a ${w} sem`
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export function VideoPromptLibrary({
  prompts,
  loading,
  editingId,
  onReplay,
  onEdit,
  onDelete,
  onRename,
  onUpdate,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const startRename = (p: VideoPrompt) => {
    setRenamingId(p.id)
    setEditingTitle(p.title ?? p.topic.slice(0, 60))
  }

  const submitRename = async () => {
    if (!renamingId) return
    await onRename(renamingId, editingTitle)
    setRenamingId(null)
  }

  const handleUpdate = async (id: string) => {
    setUpdatingId(id)
    try {
      await onUpdate(id)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setPendingId(id)
    try {
      await onDelete(id)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex flex-col h-full border-l border-white/10 bg-surface-2">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <Library className="w-4 h-4 text-indigo-300" />
        <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
          Bibliothèque
        </h3>
        <span className="ml-auto text-[10px] text-white/30 tabular-nums">
          {loading ? '…' : prompts.length}
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
        </div>
      ) : prompts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <p className="text-xs text-white/40 leading-relaxed">
            Tes prompts générés s'enregistrent ici. Tu peux ensuite les <strong className="text-white/70">rejouer</strong> ou les <strong className="text-white/70">modifier</strong>.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {prompts.map((p) => {
            const isRenaming = renamingId === p.id
            const isPending = pendingId === p.id
            const isLoaded = editingId === p.id
            return (
              <li
                key={p.id}
                className={
                  'group rounded-lg border transition-colors p-2.5 ' +
                  (isLoaded
                    ? 'border-indigo-500/50 bg-indigo-500/10'
                    : 'border-white/5 bg-white/3 hover:bg-white/5 hover:border-white/10')
                }
              >
                {isRenaming ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitRename()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      className="flex-1 bg-white/5 border border-indigo-500/50 rounded px-2 py-1 text-xs text-white focus:outline-none"
                    />
                    <button
                      onClick={() => void submitRename()}
                      className="p-1.5 rounded hover:bg-white/10 text-emerald-400"
                      aria-label="Valider"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className="p-1.5 rounded hover:bg-white/10 text-white/50"
                      aria-label="Annuler"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <p
                        className="text-xs text-white/85 leading-snug line-clamp-2 cursor-pointer"
                        onDoubleClick={() => startRename(p)}
                        title="Double-clic pour renommer"
                      >
                        {previewLine(p)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                      {p.aspect && (
                        <span className="text-[9px] uppercase tracking-wider text-white/50 px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                          {p.aspect === 'square' ? '1:1' : p.aspect === 'portrait' ? '9:16' : '16:9'}
                        </span>
                      )}
                      {typeof p.targetDurationSec === 'number' && (
                        <span className="text-[9px] uppercase tracking-wider text-white/50 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono tabular-nums">
                          {p.targetDurationSec}s
                        </span>
                      )}
                      {p.brand && (
                        <span className="text-[9px] text-indigo-300/80 px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 truncate max-w-[120px]">
                          {p.brand}
                        </span>
                      )}
                      <span className="ml-auto text-[10px] text-white/30">{formatRelative(p)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onReplay(p)}
                        className="flex-1 flex items-center justify-center gap-1 text-[11px] bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-200 rounded px-2 py-1 font-medium"
                        title="Rejouer"
                      >
                        <Play className="w-3 h-3" />
                        Rejouer
                      </button>
                      <button
                        onClick={() => onEdit(p)}
                        className="flex items-center justify-center text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 rounded px-2 py-1"
                        title="Charger dans le formulaire"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {isLoaded && (
                        <button
                          onClick={() => void handleUpdate(p.id)}
                          disabled={updatingId === p.id}
                          className="flex items-center justify-center text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded px-2 py-1 disabled:opacity-40"
                          title={t('vd.lib.updateTemplate')}
                        >
                          {updatingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        </button>
                      )}
                      <button
                        onClick={() => void handleDelete(p.id)}
                        disabled={isPending}
                        className="flex items-center justify-center text-[11px] bg-white/5 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30 border border-white/10 text-white/50 rounded px-2 py-1 disabled:opacity-30"
                        title="Supprimer"
                      >
                        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
