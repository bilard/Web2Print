// src/features/catalog/components/steps/SectionsCard.tsx
// Carte « Sections » de l'étape Prompt : densité par défaut (toutes sections),
// toggle taille ∝ prix, puis une ligne par nœud de l'arbre (PlanSectionRow).
import { LayoutGrid } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import { CATALOG_GRIDS, type CatalogGrid, type CatalogPlan, type CatalogSectionPlan, type CatalogTreeNode } from '../../catalogTypes'
import { subtreeProductCount } from '../../catalogTree'
import { defaultUniverseColor } from '../../catalogFlatplan'
import { PlanSectionRow } from './PlanSectionRow'

interface SectionsCardProps {
  plan: CatalogPlan
  flatNodes: CatalogTreeNode[]
  rowsById: Map<string, MergeRow>
  columns: MergeColumn[]
  fieldMap: Partial<Record<PromoFieldKey, string>>
  /** Produit affiché dans l'aperçu de la fiche (👁 sur les puces). */
  previewId?: string | null
  onPreview?: (rowId: string) => void
}

export function SectionsCard({ plan, flatNodes, rowsById, columns, fieldMap, previewId, onPreview }: SectionsCardProps) {
  const setPlan = useCatalogStore((s) => s.setPlan)
  const setSectionDensity = useCatalogStore((s) => s.setSectionDensity)
  const setAllSectionsDensity = useCatalogStore((s) => s.setAllSectionsDensity)
  const toggleFeatured = useCatalogStore((s) => s.toggleFeatured)
  const setSectionColor = useCatalogStore((s) => s.setSectionColor)

  // Couleur effective de chaque CHAPITRE : override utilisateur ?? palette cyclique
  // (même résolution que le chemin de fer et le rendu des pages).
  const chapterColorOf = new Map<string, string>()
  flatNodes.filter((n) => n.level === 1 && subtreeProductCount(n) > 0).forEach((n, i) => {
    const custom = plan.sections.find((x) => x.nodeId === n.id)?.color
    chapterColorOf.set(n.id, custom || defaultUniverseColor(i))
  })
  const chapterOf = (node: CatalogTreeNode): string => chapterColorOf.get(node.id.split('/')[0]) ?? defaultUniverseColor(0)

  // Valeur du sélecteur « défaut » : la densité commune des univers, sinon « mixte ».
  const densities = flatNodes.filter((n) => n.level === 1).map((n) => {
    const sec = plan.sections.find((x) => x.nodeId === n.id)
    return !sec ? '4' : sec.randomDensity ? 'random' : String(sec.productsPerPage)
  })
  const globalDensity = densities.length > 0 && densities.every((d) => d === densities[0]) ? densities[0] : ''

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <LayoutGrid className="w-4 h-4 text-indigo-400" /> Sections
        </h3>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Produits/page (défaut)
            <select value={globalDensity}
              onChange={(e) => e.target.value && setAllSectionsDensity(
                e.target.value === 'random' ? 'random' : Number(e.target.value) as CatalogGrid,
                flatNodes.filter((n) => subtreeProductCount(n) > 0).map((n) => n.id),
              )}
              className="w-24 px-2 py-1.5 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600">
              <option value="" disabled>mixte</option>
              {CATALOG_GRIDS.map((g) => <option key={g} value={g}>{g}/page</option>)}
              <option value="random">Aléatoire</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={plan.sizeByPrice ?? true}
              onChange={(e) => setPlan({ ...plan, sizeByPrice: e.target.checked })}
              className="accent-indigo-600" />
            Taille des fiches selon le prix
          </label>
        </div>
      </div>
      <div className="border border-border rounded-md bg-background/40 overflow-hidden">
        {/* Itère sur l'arbre COURANT (pas plan.sections) : un nœud ajouté après la
            génération du plan doit rester configurable — repli section par défaut.
            Filtre sur le SOUS-ARBRE : un univers sans produit direct garde sa ligne
            (c'est elle qui porte le sélecteur de densité). */}
        {flatNodes.filter((node) => subtreeProductCount(node) > 0).map((node) => {
          const section: CatalogSectionPlan = plan.sections.find((s) => s.nodeId === node.id)
            ?? { nodeId: node.id, productsPerPage: 4, randomDensity: false, featuredIds: [] }
          const products = node.productIds.map((id) => {
            const row = rowsById.get(id)
            const f = row ? extractPromoFields(row, columns, fieldMap) : null
            return { id, name: f?.name ?? id }
          })
          return (
            <PlanSectionRow key={node.id} node={node} section={section} products={products}
              chapterColor={chapterOf(node)}
              onDensity={(d) => setSectionDensity(node.id, d)}
              onToggleFeatured={(rowId) => toggleFeatured(node.id, rowId)}
              onColor={node.level === 1 ? (c) => setSectionColor(node.id, c) : undefined}
              previewId={previewId} onPreview={onPreview} />
          )
        })}
      </div>
    </section>
  )
}
