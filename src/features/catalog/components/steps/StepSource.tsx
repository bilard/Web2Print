// Étape 1 du wizard « Catalogue studio » : connecter un projet PIM ou un dataset
// Excel legacy comme source, puis choisir les produits à inclure dans le catalogue.
import { useMemo, useState } from 'react'
import { Search, ArrowRight } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import type { MergeRow } from '@/stores/merge.store'
import { getRowValue } from '@/features/merge/mergeEngine'
import type { SavedDataset } from '@/features/merge/excelSource'
import { useCatalogSource } from '../../useCatalogSource'
import { SourceGroupList } from './SourceGroupList'

const MAX_VISIBLE_ROWS = 200

interface ProductRowProps { name: string; checked: boolean; onToggle: () => void }

function ProductRow({ name, checked, onToggle }: ProductRowProps) {
  return (
    <label className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0 hover:bg-surface-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onToggle} className="accent-indigo-600 w-4 h-4 shrink-0" />
      <span className="text-sm text-white truncate">{name}</span>
    </label>
  )
}

export function StepSource() {
  const { projects, datasets, loadingProjects, connecting, connect, connectExcelDataset } = useCatalogSource()
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const rawRows = useCatalogStore((s) => s.rawRows)
  const selectedRowIds = useCatalogStore((s) => s.selectedRowIds)
  const fieldMap = useCatalogStore((s) => s.fieldMap)
  const setSelectedRowIds = useCatalogStore((s) => s.setSelectedRowIds)
  const setStep = useCatalogStore((s) => s.setStep)
  const [search, setSearch] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const nameOf = (row: MergeRow) => {
    const v = fieldMap.name ? getRowValue(row, fieldMap.name, rawColumns) : undefined
    return v == null || v === '' ? row._id : String(v)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rawRows
    return rawRows.filter((r) => nameOf(r).toLowerCase().includes(q))
  }, [rawRows, search, fieldMap, rawColumns])

  const visibleRows = filtered.slice(0, MAX_VISIBLE_ROWS)
  const overflowCount = filtered.length - visibleRows.length
  const selectedSet = new Set(selectedRowIds)

  const toggle = (id: string) => {
    setSelectedRowIds(selectedSet.has(id) ? selectedRowIds.filter((x) => x !== id) : [...selectedRowIds, id])
  }
  const selectAllFiltered = () => {
    const ids = new Set(selectedRowIds)
    filtered.forEach((r) => ids.add(r._id))
    setSelectedRowIds([...ids])
  }
  const deselectAllFiltered = () => {
    const filteredIds = new Set(filtered.map((r) => r._id))
    setSelectedRowIds(selectedRowIds.filter((id) => !filteredIds.has(id)))
  }
  const handleConnectPim = async (projectId: string, projectName: string) => {
    setPendingId(projectId)
    await connect(projectId, projectName)
    setPendingId(null)
  }
  const handleConnectExcel = async (ds: SavedDataset) => {
    setPendingId(ds.docId)
    await connectExcelDataset(ds)
    setPendingId(null)
  }

  return (
    <div className="h-full flex">
      <div className="w-80 shrink-0 border-r border-border bg-surface overflow-y-auto p-4 space-y-6">
        <SourceGroupList
          title="Projets PIM"
          items={projects.map((p) => ({ id: p.id, label: p.name, sublabel: p.path.join(' / ') || undefined }))}
          emptyText="Aucun projet PIM disponible. Créez-en un dans le module PIM."
          loading={loadingProjects}
          connecting={connecting}
          pendingId={pendingId}
          onSelect={(id) => { const p = projects.find((x) => x.id === id); if (p) void handleConnectPim(p.id, p.name) }}
        />
        <SourceGroupList
          title="Datasets Excel"
          items={datasets.map((d) => ({ id: d.docId, label: d.fileName, sublabel: `${d.totalRows} lignes` }))}
          emptyText="Aucun dataset Excel importé."
          loading={loadingProjects}
          connecting={connecting}
          pendingId={pendingId}
          onSelect={(id) => { const d = datasets.find((x) => x.docId === id); if (d) void handleConnectExcel(d) }}
        />
      </div>

      {rawRows.length > 0 ? (
        <div className="flex-1 min-w-0 flex flex-col p-4 gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit…"
                className="w-full pl-9 pr-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600" />
            </div>
            <button onClick={selectAllFiltered} className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface text-sm text-white">Tout sélectionner</button>
            <button onClick={deselectAllFiltered} className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface text-sm text-white">Tout désélectionner</button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md bg-surface">
            {visibleRows.map((row) => (
              <ProductRow key={row._id} name={nameOf(row)} checked={selectedSet.has(row._id)} onToggle={() => toggle(row._id)} />
            ))}
          </div>
          {overflowCount > 0 && (
            <p className="text-xs text-muted-foreground -mt-2">+{overflowCount} autres produits (affinez la recherche)</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-muted-foreground">{selectedRowIds.length} produit(s) sélectionné(s)</span>
            <button onClick={() => setStep('structure')} disabled={selectedRowIds.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-[#fff] text-sm font-medium">
              Continuer → Structure <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Connectez un projet PIM ou un dataset Excel pour charger ses produits.
        </div>
      )}
    </div>
  )
}
