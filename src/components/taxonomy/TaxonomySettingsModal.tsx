import { useState } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { useUpdateTaxonomySettings } from '@/features/taxonomy/useTaxonomyMutations'
import type { Taxonomy } from '@/features/taxonomy/types'

interface TaxonomySettingsModalProps {
  taxonomy: Taxonomy
  onClose: () => void
}

export function TaxonomySettingsModal({ taxonomy, onClose }: TaxonomySettingsModalProps) {
  const [sourceUrl, setSourceUrl] = useState(taxonomy.sourceUrl ?? '')
  const update = useUpdateTaxonomySettings()

  const handleSave = () => {
    update.mutate(
      { id: taxonomy.id, sourceUrl: sourceUrl.trim() },
      { onSuccess: onClose }
    )
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-[440px] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-[13px] font-semibold text-white/80">
            Paramètres — {taxonomy.name}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wider mb-1.5">
              URL de la source
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://exemple.com/nomenclature"
              className="w-full bg-[#0f0f0f] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/90 placeholder:text-white/25 outline-none focus:border-indigo-500/60 transition-colors"
            />
            {sourceUrl.trim() && (
              <a
                href={sourceUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Ouvrir le lien
              </a>
            )}
            <p className="text-[10px] text-white/30 mt-1.5">
              Site web de référence de cette nomenclature.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/[0.06] bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] text-white/60 hover:text-white/90 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="px-3 py-1.5 text-[12px] font-medium bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
