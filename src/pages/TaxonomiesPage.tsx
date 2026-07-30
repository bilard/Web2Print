import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, Filter, ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useCan } from '@/features/access/useAccess'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { useAddNode } from '@/features/taxonomy/useTaxonomyMutations'
import { TaxonomySidebar } from '@/components/taxonomy/TaxonomySidebar'
import { TaxonomyTree } from '@/components/taxonomy/TaxonomyTree'
import { TaxonomySearchBar } from '@/components/taxonomy/TaxonomySearchBar'
import { TaxonomyImportModal } from '@/components/taxonomy/TaxonomyImportModal'
import { LinkProjectsModal } from '@/components/taxonomy/LinkProjectsModal'
import { TaxonomyEmptyState } from '@/components/taxonomy/TaxonomyEmptyState'
import { TaxonomyMainTabs } from '@/components/taxonomy/TaxonomyMainTabs'
import { BriefsPanel } from '@/components/briefs/BriefsPanel'
import { useBriefUIStore } from '@/stores/brief.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { t, useI18nVersion } from '@/lib/i18n'

interface TaxonomiesPageProps {
  embedded?: boolean
}

export default function TaxonomiesPage({ embedded = false }: TaxonomiesPageProps) {
  // Vocabulaire du compte : abonne tout le sous-arbre (cf. useI18nVersion).
  useI18nVersion()
  const navigate = useNavigate()
  const canEdit = useCan('taxonomies.edit')
  const canBriefs = useCan('taxonomies.briefs')
  const { data: taxonomies, isLoading } = useTaxonomies()
  const {
    selectedTaxonomyId,
    showLinkedOnly,
    toggleShowLinkedOnly,
    collapseAll,
    expandAll,
    expandedNodeIds,
  } = useTaxonomyStore()

  const addNode = useAddNode()
  const currentTab = useBriefUIStore((s) => s.currentTab)

  const setCurrentTab = useBriefUIStore((s) => s.setCurrentTab)

  const [importOpen, setImportOpen] = useState(false)
  const [linkNodeId, setLinkNodeId] = useState<string | null>(null)

  useModuleIntent('taxonomies', (action) => {
    if (action === 'tab:tree') setCurrentTab('tree')
    else if (action === 'tab:briefs') setCurrentTab('briefs')
    else if (action === 'action:import') setImportOpen(true)
  })

  const selectedTaxonomy =
    taxonomies?.find((t) => t.id === selectedTaxonomyId) ?? null

  // Y a-t-il au moins un nœud développé dans la taxonomie courante ?
  const hasExpanded = !!selectedTaxonomy && Object.keys(selectedTaxonomy.nodes).some((id) => expandedNodeIds.has(id))

  const handleToggleExpandAll = () => {
    if (!selectedTaxonomy) return
    if (hasExpanded) {
      collapseAll()
    } else {
      // Développe uniquement les nœuds qui ont des enfants
      const expandable = Object.values(selectedTaxonomy.nodes)
        .filter((n) => Object.values(selectedTaxonomy.nodes).some((c) => c.parentId === n.id))
        .map((n) => n.id)
      expandAll(expandable)
    }
  }

  const handleAddRootNode = () => {
    if (!selectedTaxonomyId) return
    addNode.mutate({
      taxonomyId: selectedTaxonomyId,
      parentId: null,
      label: 'Nouveau nœud',
    })
  }

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} bg-background text-white flex flex-col overflow-hidden`}>
      {!embedded && (
        <header className="h-11 bg-well border-b border-white/[0.06] flex items-center px-3 gap-2 shrink-0">
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
        <aside className="w-52 bg-surface-2 border-r border-white/[0.06] flex flex-col shrink-0 overflow-hidden">
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
              <p className="text-[12px] text-white/30">{t('tx.pickTaxonomy')}</p>
            </div>
          ) : (
            <>
              <TaxonomyMainTabs />
              {currentTab === 'tree' || !canBriefs ? (
              <>
              <div className="h-11 bg-well border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
                <div className="flex-1 max-w-sm">
                  <TaxonomySearchBar taxonomy={selectedTaxonomy} />
                </div>
                <button
                  onClick={handleToggleExpandAll}
                  className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] px-3 py-1.5 rounded-md transition-colors"
                  title={t(hasExpanded ? 'ui.collapseAll' : 'ui.expandAll')}
                >
                  {hasExpanded
                    ? <ChevronsDownUp className="w-3.5 h-3.5" />
                    : <ChevronsUpDown className="w-3.5 h-3.5" />}
                  {hasExpanded ? 'Tout fermer' : 'Tout ouvrir'}
                </button>
                <button
                  onClick={toggleShowLinkedOnly}
                  className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md transition-colors ${
                    showLinkedOnly
                      ? 'bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/[0.06]'
                  }`}
                  aria-pressed={showLinkedOnly}
                  title={t('tx.onlyLinked')}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {t('taxonomiesPage.linkedOnly')}
                </button>
                {canEdit && (
                  <button
                    onClick={handleAddRootNode}
                    className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 hover:bg-white/[0.06] px-3 py-1.5 rounded-md transition-colors"
                    aria-label="Ajouter un nœud racine"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Nœud racine
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                <TaxonomyTree
                  taxonomy={selectedTaxonomy}
                  onLinkProjects={(nodeId) => setLinkNodeId(nodeId)}
                />
              </div>
              </>
              ) : (
                <BriefsPanel taxonomy={selectedTaxonomy} />
              )}
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
