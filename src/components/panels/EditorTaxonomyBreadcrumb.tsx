import { useMemo, useState } from 'react'
import { ChevronRight, Tag, Plus } from 'lucide-react'
import { useEditorStore } from '@/stores/editor.store'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { findPath } from '@/features/taxonomy/taxonomyUtils'
import type { TaxonomyNode } from '@/features/taxonomy/types'
import { EditorTaxonomyPicker } from './EditorTaxonomyPicker'

const levelColors = [
  { text: 'text-blue-400', bg: 'bg-blue-500/15' },
  { text: 'text-blue-300', bg: 'bg-blue-400/15' },
  { text: 'text-blue-200', bg: 'bg-blue-300/12' },
  { text: 'text-sky-200', bg: 'bg-sky-400/12' },
  { text: 'text-sky-100', bg: 'bg-sky-300/10' },
]

export function EditorTaxonomyBreadcrumb() {
  const projectId = useEditorStore((s) => s.projectId)
  const { data: taxonomies } = useTaxonomies()
  const [pickerOpen, setPickerOpen] = useState(false)

  const breadcrumbData = useMemo<{ nodes: Record<string, TaxonomyNode>; nodeId: string; taxonomyName: string } | null>(() => {
    if (!projectId || !taxonomies) return null
    for (const tax of taxonomies) {
      for (const node of Object.values(tax.nodes)) {
        if (node.linkedProjectIds.includes(projectId)) {
          return { nodes: tax.nodes, nodeId: node.id, taxonomyName: tax.name }
        }
      }
    }
    return null
  }, [projectId, taxonomies])

  if (!projectId) return null

  // Aucun nœud lié → bouton "Lier"
  if (!breadcrumbData) {
    return (
      <>
        <button
          onClick={() => setPickerOpen(true)}
          className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-white/40 hover:text-indigo-300 hover:bg-indigo-500/10 border border-dashed border-white/10 hover:border-indigo-500/30 transition-colors"
          title="Lier ce projet à une taxonomie"
        >
          <Plus className="w-3 h-3" />
          Lier à une taxonomie
        </button>
        <EditorTaxonomyPicker
          open={pickerOpen}
          projectId={projectId}
          onClose={() => setPickerOpen(false)}
        />
      </>
    )
  }

  const { nodes, nodeId, taxonomyName } = breadcrumbData
  const pathIds = findPath(nodes, nodeId)

  return (
    <>
      <button
        onClick={() => setPickerOpen(true)}
        title={`${taxonomyName} — Cliquez pour modifier`}
        className="flex items-center gap-1 overflow-x-auto ml-2 px-1.5 py-0.5 rounded-md hover:bg-white/[0.04] transition-colors group"
      >
        <Tag className="w-3 h-3 text-white/30 group-hover:text-white/60 shrink-0" />
        {pathIds.map((id, i) => {
          const node = nodes[id]
          if (!node) return null
          const lc = levelColors[Math.min(node.level, levelColors.length - 1)]
          const isLast = i === pathIds.length - 1
          return (
            <span key={id} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="w-3 h-3 text-white/15 shrink-0" />}
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${lc.text} ${lc.bg} ${
                  isLast ? 'ring-1 ring-white/10' : ''
                }`}
              >
                {node.label}
              </span>
            </span>
          )
        })}
      </button>
      <EditorTaxonomyPicker
        open={pickerOpen}
        projectId={projectId}
        onClose={() => setPickerOpen(false)}
      />
    </>
  )
}
