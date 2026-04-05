// src/pages/TaxonomiesPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2 } from 'lucide-react'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useAddNode } from '@/features/taxonomy/useTaxonomyMutations'
import { TaxonomySidebar } from '@/components/taxonomy/TaxonomySidebar'
import { TaxonomyTree } from '@/components/taxonomy/TaxonomyTree'
import { TaxonomySearchBar } from '@/components/taxonomy/TaxonomySearchBar'
import { TaxonomyImportModal } from '@/components/taxonomy/TaxonomyImportModal'
import { LinkProjectsModal } from '@/components/taxonomy/LinkProjectsModal'
import { TaxonomyEmptyState } from '@/components/taxonomy/TaxonomyEmptyState'

interface TaxonomiesPageProps {
  embedded?: boolean
}

export default function TaxonomiesPage({ embedded = false }: TaxonomiesPageProps) {
  const navigate = useNavigate()
  const { data: taxonomies, isLoading } = useTaxonomies()
  const { selectedTaxonomyId } = useTaxonomyStore()
  const addNode = useAddNode()

  const [importOpen, setImportOpen] = useState(false)
  const [linkNodeId, setLinkNodeId] = useState<string | null>(null)

  const selectedTaxonomy =
    taxonomies?.find((t) => t.id === selectedTaxonomyId) ?? null

  const handleAddRootNode = () => {
    if (!selectedTaxonomyId) return
    addNode.mutate({
      taxonomyId: selectedTaxonomyId,
      parentId: null,
      label: 'Nouveau nœud',
    })
  }

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} bg-[#0f0f0f] text-white flex flex-col overflow-hidden`}>
      {!embedded && (
        <header className="h-11 bg-[#161616] border-b border-white/[0.06] flex items-center px-3 gap-2 shrink-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-md transition-colors"
            aria-label="Retour au tableau de bord"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-[13px] font-semibold text-white/70">Taxonomies</h1>
        </header>
      )}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-52 bg-[#141414] border-r border-white/[0.06] flex flex-col shrink-0 overflow-hidden">
          <TaxonomySidebar taxonomies={taxonomies ?? []} onImport={() => setImportOpen(true)} />
        </aside>
        <main className="flex-1 flex flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
            </div>
          ) : !taxonomies || taxonomies.length === 0 ? (
            <TaxonomyEmptyState onImport={() => setImportOpen(true)} />
          ) : !selectedTaxonomy ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[12px] text-white/30">Sélectionnez une taxonomie dans la liste</p>
            </div>
          ) : (
            <>
              <div className="h-11 bg-[#161616] border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
                <div className="flex-1 max-w-sm">
                  <TaxonomySearchBar taxonomy={selectedTaxonomy} />
                </div>
                <button
                  onClick={handleAddRootNode}
                  className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] px-3 py-1.5 rounded-md transition-colors"
                  aria-label="Ajouter un nœud racine"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nœud racine
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <TaxonomyTree
                  taxonomy={selectedTaxonomy}
                  onLinkProjects={(nodeId) => setLinkNodeId(nodeId)}
                />
              </div>
            </>
          )}
        </main>
      </div>
      <TaxonomyImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <LinkProjectsModal
        open={!!linkNodeId}
        taxonomyId={selectedTaxonomyId ?? ''}
        nodeId={linkNodeId}
        taxonomy={selectedTaxonomy}
        onClose={() => setLinkNodeId(null)}
      />
    </div>
  )
}
