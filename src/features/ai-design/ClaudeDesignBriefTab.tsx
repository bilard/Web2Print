import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { useUIStore } from '@/stores/ui.store'
import { optimizePrompt } from './optimizePrompt'

export function ClaudeDesignBriefTab() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)
  const setPromptOptimized = useDesignBriefStore((s) => s.setPromptOptimized)

  const isOptimizing = useUIStore((s) => s.isOptimizingPrompt)
  const [optimizedResult, setOptimizedResult] = useState('')

  const handleOptimize = async () => {
    if (!brief.prompt.trim()) {
      toast.error('Écris un prompt brut d\'abord')
      return
    }

    try {
      const result = await optimizePrompt(brief.prompt)
      setOptimizedResult(result)
      toast.success('Prompt optimisé ✓')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l\'optimisation'
      toast.error(message)
    }
  }

  const handleAccept = () => {
    setPromptOptimized(optimizedResult)
    setOptimizedResult('')
    toast.success('Prompt optimisé accepté')
  }

  return (
    <div className="space-y-4">
      {/* Two-column layout: Brut | Optimisé */}
      <div className="grid grid-cols-2 gap-4">
        {/* Column 1: Prompt brut */}
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-neutral-400">Prompt brut</label>
          <textarea
            value={brief.prompt}
            onChange={(e) => setBrief({ prompt: e.target.value })}
            placeholder="Ex : Affiche promo soldes d'été -30% pour magasin de chaussures, ambiance bord de mer"
            rows={8}
            className="w-full bg-[#0f0f0f] border border-neutral-800 rounded px-3 py-2 text-sm resize-none text-neutral-200 placeholder-neutral-600 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600"
          />
        </div>

        {/* Column 2: Prompt optimisé */}
        <div className="space-y-1">
          <label className="text-xs uppercase tracking-wide text-neutral-400">Prompt optimisé</label>
          <textarea
            value={optimizedResult || brief.promptOptimized}
            readOnly
            placeholder="Clique sur 'Optimiser' pour voir la version améliorée"
            rows={8}
            className="w-full bg-[#0a0a0a] border border-neutral-700 rounded px-3 py-2 text-sm resize-none text-neutral-400 placeholder-neutral-600 cursor-default"
          />
        </div>
      </div>

      {/* Optimize button */}
      <button
        onClick={handleOptimize}
        disabled={isOptimizing || !brief.prompt.trim()}
        className="w-full flex items-center justify-center gap-2 py-2 rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {isOptimizing ? 'Optimisation…' : 'Optimiser le prompt'}
      </button>

      {/* Accept button (visible when there's a new optimized result) */}
      {optimizedResult && (
        <button
          onClick={handleAccept}
          className="w-full py-2 rounded bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
        >
          ✓ Accepter l'optimisation
        </button>
      )}

      {/* Info text */}
      <p className="text-[10px] text-neutral-500">
        La colonne de droite est mise à jour après acceptation. Vous pouvez l'éditer manuellement si souhaité.
      </p>
    </div>
  )
}
