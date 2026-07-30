import { useState } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { improveSearchPrompt } from './searchPlanner'
import { t } from '@/lib/i18n'

interface Props {
  prompt: string
  onPromptChange: (value: string) => void
  /** Lance la recherche (⌘/Ctrl+Entrée). */
  onSubmit: () => void
  disabled: boolean
}

/** Champ « Que cherches-tu ? » de l'onglet Recherche, avec bouton d'amélioration
 *  du prompt par le LLM actif (réécriture : sujet précis + sites + champs). */
export function SearchPromptInput({ prompt, onPromptChange, onSubmit, disabled }: Props) {
  const [improving, setImproving] = useState(false)

  const handleImprove = async () => {
    if (!prompt.trim() || improving) return
    setImproving(true)
    try {
      const improved = await improveSearchPrompt(prompt.trim())
      onPromptChange(improved)
      toast.success(t('tst.sc.promptImproved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('tst.sc.improveFailed'))
    } finally {
      setImproving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[10px] text-white/30 uppercase tracking-wider">Que cherches-tu ?</label>
        <button
          onClick={handleImprove}
          disabled={!prompt.trim() || improving || disabled}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-violet-500/25 bg-violet-500/10 text-violet-300/80 hover:text-violet-200 hover:bg-violet-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('sc.prompt.rewrite')}
        >
          {improving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {improving ? 'Amélioration…' : 'Améliorer le prompt'}
        </button>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit() }}
        placeholder={t('sc.search.promptPlaceholder')}
        rows={3}
        disabled={improving}
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none resize-none disabled:opacity-60"
      />
    </div>
  )
}
