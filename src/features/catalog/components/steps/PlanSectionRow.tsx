// src/features/catalog/components/steps/PlanSectionRow.tsx
// Une ligne de section du plan : libellé + compteur produits, densité de grille
// (UNIVERS seulement — le flux continu applique la grille de l'univers à tout
// son contenu), et jusqu'à 3 vedettes cliquables (pleine page) par nœud.
import { CATALOG_GRIDS, type CatalogGrid, type CatalogSectionPlan, type CatalogTreeNode } from '../../catalogTypes'

interface PlanSectionRowProps {
  node: CatalogTreeNode
  section: CatalogSectionPlan
  sampleFields: { id: string; name: string }[]
  onGrid: (grid: CatalogGrid) => void
  onToggleFeatured: (rowId: string) => void
}

export function PlanSectionRow({ node, section, sampleFields, onGrid, onToggleFeatured }: PlanSectionRowProps) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-b-0"
      style={{ paddingLeft: (node.level - 1) * 20 + 12 }}>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white truncate">{node.label}</div>
        <div className="text-xs text-muted-foreground">{node.productIds.length} produit{node.productIds.length > 1 ? 's' : ''}</div>
      </div>

      {node.level === 1 && (
        <select value={section.productsPerPage} onChange={(e) => onGrid(Number(e.target.value) as CatalogGrid)}
          className="w-24 px-2 py-1.5 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600 shrink-0">
          {CATALOG_GRIDS.map((g) => <option key={g} value={g}>{g}/page</option>)}
        </select>
      )}

      <div className="flex items-center gap-1.5 shrink-0">
        {sampleFields.map((f) => {
          const active = section.featuredIds.includes(f.id)
          return (
            <button key={f.id} type="button" onClick={() => onToggleFeatured(f.id)}
              title={active ? 'Vedette — cliquer pour retirer' : 'Marquer en vedette (pleine page)'}
              className={`px-2 py-1 rounded-md text-xs truncate max-w-[110px] ${
                active ? 'bg-indigo-600 text-[#fff]' : 'bg-surface-2 text-muted-foreground hover:text-white'
              }`}>
              {f.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
