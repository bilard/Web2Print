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

      {/* Site logo input with preview */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">
          Logo
        </label>
        <div className="flex gap-2">
          {/* Logo preview box */}
          <div className="shrink-0 w-20 h-20 rounded border border-neutral-700 bg-[#0f0f0f] flex items-center justify-center overflow-hidden">
            {brief.siteLogoUrl ? (
              <img
                src={brief.siteLogoUrl}
                alt="Logo preview"
                className="w-full h-full object-contain p-2"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <svg className="w-8 h-8 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>
          {/* URL input */}
          <input
            type="url"
            value={brief.siteLogoUrl ?? ''}
            onChange={(e) => setBrief({ siteLogoUrl: e.target.value })}
            placeholder="https://… (URL du logo)"
            className="flex-1 bg-[#0f0f0f] border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600"
          />
        </div>
        {brief.siteLogoUrl && (
          <p className="text-[10px] text-indigo-400">
            ✓ Le logo sera intégré au design
          </p>
        )}
      </div>

      {/* Site URL input */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wide text-neutral-400">
          URL du site (optionnel)
        </label>
        <input
          type="url"
          value={brief.siteUrl ?? ''}
          onChange={(e) => setBrief({ siteUrl: e.target.value })}
          placeholder="https://… (Site pour lequel créer le support)"
          className="w-full bg-[#0f0f0f] border border-neutral-800 rounded px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600"
        />
        {brief.siteUrl && (
          <p className="text-[10px] text-indigo-400">
            ✓ Le contenu du site sera analysé pour le contexte
          </p>
        )}
      </div>

      {/* Brand guide section */}
      <div className="space-y-2 pt-2">
        <label className="text-xs uppercase tracking-wide text-neutral-400">
          Charte graphique / kit de communication (optionnel)
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors border border-neutral-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Fichiers
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors border border-neutral-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7l9-4 9 4m0 0v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7m0 0l9-4 9 4" />
            </svg>
            Dossier complet
          </button>
        </div>
        {brief.brandGuideUrl && (
          <p className="text-[10px] text-indigo-400">
            ✓ Guide brandé sera utilisé pour les exports
          </p>
        )}
      </div>
    </div>
  )
}
