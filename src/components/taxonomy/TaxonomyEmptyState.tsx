import { FolderTree } from 'lucide-react'

interface TaxonomyEmptyStateProps {
  onImport: () => void
}

export function TaxonomyEmptyState({ onImport }: TaxonomyEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 gap-4 text-white/40">
      <FolderTree className="w-16 h-16 opacity-20" aria-hidden="true" />
      <p className="text-lg font-medium text-white/30">Aucune taxonomie</p>
      <p className="text-sm text-white/20 text-center max-w-xs">
        Importez un fichier Markdown, CSV ou XLSX pour créer votre première taxonomie.
      </p>
      <button
        onClick={onImport}
        className="mt-2 flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
      >
        Importer une taxonomie
      </button>
    </div>
  )
}
