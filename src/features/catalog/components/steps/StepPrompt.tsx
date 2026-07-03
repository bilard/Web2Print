// src/features/catalog/components/steps/StepPrompt.tsx
// Étape 3 du wizard « Catalogue studio » : prompt global → plan IA (thème, sections,
// couverture) éditable librement, puis génération des visuels de couverture (Nano Banana).
// L'IA ne bloque jamais : échec → repli sur defaultCatalogPlan + toast explicite.
import { useMemo, useState } from 'react'
import { Loader2, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { buildCatalogTree, flattenTree } from '../../catalogTree'
import { generateCatalogPlan, defaultCatalogPlan } from '../../catalogPlan'
import type { CatalogSectionPlan } from '../../catalogTypes'
import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import { PlanSectionRow } from './PlanSectionRow'
import { PlanStylePanel } from './PlanStylePanel'

export function StepPrompt() {
  const name = useCatalogStore((s) => s.name)
  const prompt = useCatalogStore((s) => s.prompt)
  const plan = useCatalogStore((s) => s.plan)
  const rawRows = useCatalogStore((s) => s.rawRows)
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const selectedRowIds = useCatalogStore((s) => s.selectedRowIds)
  const levelKeys = useCatalogStore((s) => s.levelKeys)
  const treeEdits = useCatalogStore((s) => s.treeEdits)
  const fieldMap = useCatalogStore((s) => s.fieldMap)
  const coverImageUrl = useCatalogStore((s) => s.coverImageUrl)
  const backCoverImageUrl = useCatalogStore((s) => s.backCoverImageUrl)
  const setPrompt = useCatalogStore((s) => s.setPrompt)
  const setPlan = useCatalogStore((s) => s.setPlan)
  const setSectionDensity = useCatalogStore((s) => s.setSectionDensity)
  const toggleFeatured = useCatalogStore((s) => s.toggleFeatured)
  const setStep = useCatalogStore((s) => s.setStep)
  const [busy, setBusy] = useState(false)

  const rowsById = useMemo(() => new Map(rawRows.map((r) => [r._id, r])), [rawRows])
  const selectedRows = useMemo(() => {
    const ids = new Set(selectedRowIds)
    return rawRows.filter((r) => ids.has(r._id))
  }, [rawRows, selectedRowIds])
  const tree = useMemo(
    () => buildCatalogTree(selectedRows, rawColumns, levelKeys, treeEdits),
    [selectedRows, rawColumns, levelKeys, treeEdits],
  )
  const flatNodes = useMemo(() => flattenTree(tree), [tree])

  const generate = async () => {
    setBusy(true)
    try {
      const sampleNames: Record<string, string[]> = {}
      for (const n of flatNodes) {
        sampleNames[n.id] = n.productIds.slice(0, 3).map((id) => {
          const row = rowsById.get(id)
          const f = row ? extractPromoFields(row, rawColumns, fieldMap) : null
          return `${id} — ${f?.name ?? id}`
        })
      }
      setPlan(await generateCatalogPlan(prompt, { catalogName: name, tree, sampleNames }))
      toast.success('Plan généré — ajustez-le librement ci-contre')
    } catch (e) {
      setPlan(defaultCatalogPlan(tree, name))
      toast.error(`IA indisponible (${String((e as Error).message).slice(0, 120)}) — plan par défaut appliqué`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8 max-w-7xl mx-auto">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Prompt global</h2>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6}
            placeholder="Décrivez le catalogue voulu : univers, ton, couleurs, densité des pages…"
            className="w-full px-3 py-2 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600 resize-none" />
          <button onClick={() => void generate()} disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-sm font-medium">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Générer le plan (IA)
          </button>
          {!plan && <p className="text-sm text-muted-foreground">Sans IA, un plan par défaut (grille homogène, thème neutre) reste disponible dès le premier clic.</p>}
        </section>

        <section className="space-y-5 min-w-0">
          {plan ? (
            <>
              <PlanStylePanel plan={plan} setPlan={setPlan} coverImageUrl={coverImageUrl} backCoverImageUrl={backCoverImageUrl} />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Sections</h3>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={plan.sizeByPrice ?? true}
                      onChange={(e) => setPlan({ ...plan, sizeByPrice: e.target.checked })}
                      className="accent-indigo-600" />
                    Taille des fiches selon le prix
                  </label>
                </div>
                <div className="border border-border rounded-md bg-surface">
                  {/* Itère sur l'arbre COURANT (pas plan.sections) : un nœud ajouté après
                      la génération du plan (retouche de l'étape Structure) doit rester
                      configurable — repli section par défaut si absente du plan. */}
                  {flatNodes.filter((node) => node.productIds.length > 0).map((node) => {
                    const section: CatalogSectionPlan = plan.sections.find((s) => s.nodeId === node.id)
                      ?? { nodeId: node.id, productsPerPage: 4, randomDensity: false, featuredIds: [] }
                    const products = node.productIds.map((id) => {
                      const row = rowsById.get(id)
                      const f = row ? extractPromoFields(row, rawColumns, fieldMap) : null
                      return { id, name: f?.name ?? id }
                    })
                    return (
                      <PlanSectionRow key={node.id} node={node} section={section} products={products}
                        onDensity={(d) => setSectionDensity(node.id, d)}
                        onToggleFeatured={(rowId) => toggleFeatured(node.id, rowId)} />
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Générez un plan pour éditer le thème et les sections.</p>
          )}
        </section>
      </div>

      <div className="flex justify-end max-w-7xl mx-auto pt-6">
        <button onClick={() => setStep('preview')} disabled={!plan}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-[#fff] text-sm font-medium">
          Continuer → Aperçu <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
