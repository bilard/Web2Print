import { useMemo, useState } from 'react'
import { Search, Plus, Star, Sparkles, Loader2, Library } from 'lucide-react'
import { toast } from 'sonner'
import {
  CATEGORY_META,
  PROMPT_CATEGORIES,
  type Prompt,
  type PromptCategory,
  type PromptDraft,
} from './types'
import { usePrompts } from './usePrompts'
import { PromptListItem } from './PromptListItem'
import { PromptEditDialog } from './PromptEditDialog'

interface PromptLibraryPanelProps {
  onPick: (prompt: Prompt) => void
}

type FilterTab = 'all' | 'favorites' | PromptCategory

export function PromptLibraryPanel({ onPick }: PromptLibraryPanelProps) {
  const {
    prompts,
    isLoading,
    uid,
    create,
    update,
    remove,
    toggleFavorite,
    duplicate,
  } = usePrompts()

  const [tab, setTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ open: boolean; prompt: Prompt | null }>({
    open: false,
    prompt: null,
  })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return prompts
      .filter((p) => {
        if (tab === 'favorites' && !p.favorite) return false
        if (tab !== 'all' && tab !== 'favorites' && p.category !== tab) return false
        if (q) {
          return (
            p.title.toLowerCase().includes(q) ||
            p.content.toLowerCase().includes(q)
          )
        }
        return true
      })
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
        if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount
        return b.updatedAt - a.updatedAt
      })
  }, [prompts, tab, search])

  const handleSave = async (draft: PromptDraft) => {
    try {
      if (editing.prompt) {
        await update(editing.prompt.id, draft)
        toast.success('Prompt mis à jour')
      } else {
        await create(draft)
        toast.success('Prompt créé')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la sauvegarde')
    }
  }

  const handleDelete = async (id: string) => {
    const p = prompts.find((x) => x.id === id)
    if (!p) return
    if (!window.confirm(`Supprimer le prompt « ${p.title} » ?`)) return
    try {
      await remove(id)
      toast.success('Prompt supprimé')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la suppression')
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      await duplicate(id)
      toast.success('Prompt dupliqué')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de la duplication')
    }
  }

  const tabs: { id: FilterTab; label: string; icon?: React.ComponentType<{ className?: string }> }[] = [
    { id: 'all', label: 'Tous', icon: Library },
    { id: 'favorites', label: 'Favoris', icon: Star },
    ...PROMPT_CATEGORIES.map((c) => ({
      id: c as FilterTab,
      label: CATEGORY_META[c].label,
      icon: CATEGORY_META[c].icon,
    })),
  ]

  return (
    <>
      <aside className="h-full w-full bg-[#1a1a1a] border-l border-white/10 flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10 shrink-0">
          <Sparkles className="w-4 h-4 text-violet-300" />
          <h2 className="text-[14px] font-semibold text-white">Bibliothèque de prompts</h2>
        </div>

        <div className="px-4 pt-3 pb-2 space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un prompt…"
              className="w-full bg-[#0f0f0f] border border-white/10 focus:border-violet-500/50 rounded-lg pl-9 pr-3 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1.5 text-[12px] rounded-full px-2.5 py-1 border whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-violet-500/15 text-violet-200 border-violet-500/40'
                      : 'bg-white/[0.03] text-white/65 border-white/10 hover:border-white/20'
                  }`}
                >
                  {Icon && <Icon className="w-3 h-3 opacity-80" />}
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
          {!uid ? (
            <div className="px-3 py-8 text-center text-[13px] text-white/50">
              Connecte-toi pour synchroniser tes prompts.
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12 text-white/40">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : prompts.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[13px] text-white/55">
                Ta bibliothèque est vide. Crée ton premier prompt avec le bouton ci-dessous.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-[13px] text-white/45">
              Aucun prompt ne correspond.
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((p) => (
                <PromptListItem
                  key={p.id}
                  prompt={p}
                  onUse={onPick}
                  onToggleFavorite={(id) => toggleFavorite(id)}
                  onEdit={(prompt) => setEditing({ open: true, prompt })}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => setEditing({ open: true, prompt: null })}
            disabled={!uid}
            className="w-full flex items-center justify-center gap-2 text-[13px] text-white bg-violet-500 hover:bg-violet-400 disabled:bg-white/[0.06] disabled:text-white/40 rounded-lg py-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau prompt
          </button>
        </div>
      </aside>

      <PromptEditDialog
        open={editing.open}
        initial={editing.prompt}
        onClose={() => setEditing({ open: false, prompt: null })}
        onSave={handleSave}
      />
    </>
  )
}
