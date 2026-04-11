// src/components/taxonomy/TaxonomySidebar.tsx
import { useState } from 'react'
import { Plus, MoreVertical } from 'lucide-react'
import {
  useRenameTaxonomy,
  useDeleteTaxonomy,
  useDuplicateTaxonomy,
} from '@/features/taxonomy/useTaxonomyMutations'
import { useTaxonomyStore } from '@/stores/taxonomy.store'
import { TaxonomyContextMenu } from './TaxonomyContextMenu'
import { TaxonomySettingsModal } from './TaxonomySettingsModal'
import type { Taxonomy } from '@/features/taxonomy/types'

interface TaxonomySidebarProps {
  taxonomies: Taxonomy[]
  onImport: () => void
}

export function TaxonomySidebar({
  taxonomies,
  onImport,
}: TaxonomySidebarProps) {
  const { selectedTaxonomyId, setSelectedTaxonomy } = useTaxonomyStore()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [settingsId, setSettingsId] = useState<string | null>(null)

  const rename = useRenameTaxonomy()
  const deleteTax = useDeleteTaxonomy()
  const duplicate = useDuplicateTaxonomy()

  const handleRename = (id: string) => {
    const trimmed = editName.trim()
    if (trimmed) rename.mutate({ id, name: trimmed })
    setEditingId(null)
  }

  const formatDate = (ts: { toDate: () => Date }) =>
    ts.toDate().toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    })

  const nodeCount = (tax: Taxonomy) => Object.keys(tax.nodes).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
          Taxonomies
        </h2>
        <button
          onClick={onImport}
          className="p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
          aria-label="Importer une taxonomie"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {taxonomies.length === 0 ? (
          <p className="text-[11px] text-white/25 text-center py-6">
            Aucune taxonomie
          </p>
        ) : (
          taxonomies.map((tax) => (
            <div
              key={tax.id}
              className={`relative group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                selectedTaxonomyId === tax.id
                  ? 'bg-teal-500/[0.1] text-teal-300'
                  : 'text-white/50 hover:bg-white/[0.04] hover:text-white/70'
              }`}
              onClick={() => setSelectedTaxonomy(tax.id)}
            >
              <div className="flex-1 min-w-0">
                {editingId === tax.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => handleRename(tax.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(tax.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="w-full bg-white/10 rounded px-1.5 py-0.5 text-[12px] text-white outline-none ring-1 ring-indigo-500"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <p className="text-[12px] font-medium truncate">
                      {tax.name}
                    </p>
                    <p className="text-[10px] text-white/25">
                      {nodeCount(tax)} nœuds · {formatDate(tax.updatedAt)}
                    </p>
                  </>
                )}
              </div>

              {/* Menu */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenMenu(openMenu === tax.id ? null : tax.id)
                }}
                className="p-1 rounded text-white/20 hover:text-white/60 hover:bg-white/[0.08] transition-colors opacity-0 group-hover:opacity-100"
                aria-label={`Options pour ${tax.name}`}
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {openMenu === tax.id && (
                <TaxonomyContextMenu
                  onClose={() => setOpenMenu(null)}
                  onRename={() => { setEditName(tax.name); setEditingId(tax.id); setOpenMenu(null) }}
                  onDuplicate={() => { duplicate.mutate({ id: tax.id }); setOpenMenu(null) }}
                  onSettings={() => { setSettingsId(tax.id); setOpenMenu(null) }}
                  onDelete={() => {
                    deleteTax.mutate(tax.id)
                    if (selectedTaxonomyId === tax.id) setSelectedTaxonomy(null)
                    setOpenMenu(null)
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>

      {settingsId && (() => {
        const tax = taxonomies.find((t) => t.id === settingsId)
        if (!tax) return null
        return (
          <TaxonomySettingsModal
            taxonomy={tax}
            onClose={() => setSettingsId(null)}
          />
        )
      })()}
    </div>
  )
}
