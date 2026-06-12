import { useState } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { improveSearchPrompt } from './searchPlanner'

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
      toast.success('Prompt amélioré — relis et ajuste si besoin')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Amélioration impossible (LLM indisponible)")
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
          title="Réécrire le prompt avec le LLM actif : sujet précis, sites explicites, champs attendus"
        >
          {improving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          {improving ? 'Amélioration…' : 'Améliorer le prompt'}
        </button>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit() }}
        placeholder={'Ex : « tondeuses Honda électriques — prix et promos chez LeroyMerlin, Castorama et Jardiland »,\n« perceuses à percussion 18V Makita site officiel »…'}
        rows={3}
        disabled={improving}
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none resize-none disabled:opacity-60"
      />
    </div>
  )
}
