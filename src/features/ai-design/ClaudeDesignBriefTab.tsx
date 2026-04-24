import { useEffect } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { useBriefUIStore } from '@/stores/brief.store'
import { useBrief } from '@/features/briefs/useBrief'
import { useImproveDesignPrompt } from './useImproveDesignPrompt'

export function ClaudeDesignBriefTab() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)
  const improveMutation = useImproveDesignPrompt()

  const currentBriefId = useBriefUIStore((s) => s.currentBriefId)
  const { data: linkedBrief } = useBrief(currentBriefId)
  const cartImageUrl = linkedBrief?.cart?.items?.[0]?.imageUrl
  const cartProductName = linkedBrief?.cart?.items?.[0]?.name

  useEffect(() => {
    if (!brief.productImageUrl && cartImageUrl) {
      setBrief({ productImageUrl: cartImageUrl })
    }
  }, [cartImageUrl, brief.productImageUrl, setBrief])

  const handleImprovePrompt = () => {
    const current = brief.prompt.trim()
    if (!current || improveMutation.isPending) return
    improveMutation.mutate(current, {
      onSuccess: (improved) => {
        setBrief({ prompt: improved })
        toast.success('Prompt amélioré par Claude')
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : 'Échec de l\'amélioration')
      },
    })
  }

  const canImprove = brief.prompt.trim().length > 0 && !improveMutation.isPending

  return (
    <div className="space-y-4">
      {/* Prompt brut */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs uppercase tracking-wide text-neutral-400">Prompt</label>
          <button
            type="button"
            onClick={handleImprovePrompt}
            disabled={!canImprove}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Reformule et enrichit le prompt via Claude"
          >
            {improveMutation.isPending ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Amélioration…
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                Améliorer via IA
              </>
            )}
          </button>
        </div>
        <textarea
          value={brief.prompt}
          onChange={(e) => setBrief({ prompt: e.target.value })}
          placeholder="Ex : Affiche promo soldes d'été -30% pour magasin de chaussures, ambiance bord de mer"
          rows={8}
          disabled={improveMutation.isPending}
          className="w-full bg-[#0f0f0f] border border-neutral-800 rounded px-3 py-2 text-sm resize-none text-neutral-200 placeholder-neutral-600 focus:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-600 disabled:opacity-60"
        />
      </div>

      {/* Product image input */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">
          Image produit (optionnel)
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={brief.productImageUrl ?? ''}
            onChange={(e) => setBrief({ productImageUrl: e.target.value })}
            placeholder="https://… (panier ou URL manuelle)"
            className="flex-1 bg-[#0f0f0f] border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600"
          />
          {cartImageUrl && (
            <button
              type="button"
              onClick={() => setBrief({ productImageUrl: cartImageUrl })}
              className="shrink-0 px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 text-xs transition-colors"
              title={cartProductName}
            >
              Panier
            </button>
          )}
        </div>
        {brief.productImageUrl && (
          <p className="text-[10px] text-indigo-400">
            ✓ La photo produit remplacera le slot hero-visual
          </p>
        )}
      </div>
    </div>
  )
}
