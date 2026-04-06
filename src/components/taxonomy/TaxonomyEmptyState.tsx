// src/components/taxonomy/TaxonomyEmptyState.tsx
import { FolderTree, Upload } from 'lucide-react'

interface TaxonomyEmptyStateProps {
  onImport: () => void
}

export function TaxonomyEmptyState({ onImport }: TaxonomyEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-5 max-w-xs text-center">
        <div className="w-16 h-16 bg-white/[0.04] rounded-2xl flex items-center justify-center">
          <FolderTree className="w-8 h-8 text-white/15" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-white/60 mb-1.5">Aucune taxonomie</h3>
          <p className="text-[12px] text-white/35 leading-relaxed">
            Importez un fichier Markdown, CSV ou Excel pour créer votre première arborescence.
          </p>
        </div>
        <button
          onClick={onImport}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white text-[13px] font-medium px-5 py-2.5 rounded-xl transition-colors"
        >
          <Upload className="w-4 h-4" />
          Importer une taxonomie
        </button>
      </div>
    </div>
  )
}
