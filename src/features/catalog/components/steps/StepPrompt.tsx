// src/features/catalog/components/steps/StepPrompt.tsx
// Étape 3 du wizard « Catalogue studio » : carte prompt (génération EN HAUT),
// puis cartes Thème/Couverture/4e (PlanStylePanel) et carte Sections.
// L'IA ne bloque jamais : échec → repli sur defaultCatalogPlan + toast explicite.
import { useMemo, useState } from 'react'
import { Loader2, ArrowRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { buildCatalogTree, flattenTree } from '../../catalogTree'
import { generateCatalogPlan, defaultCatalogPlan } from '../../catalogPlan'
import { extractPromoFields } from '@/features/retail-promo/promoMapping'
import { PlanStylePanel } from './PlanStylePanel'
import { PageStyleCard } from './PageStyleCard'
import { CardStyleCard } from './CardStyleCard'
import { SectionsCard } from './SectionsCard'
import { StepActionsPortal } from './StepActionsPortal'

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
  // Fiche exemple pour l'aperçu live du style (1er produit sélectionné).
  const sampleFields = useMemo(
    () => (selectedRows.length > 0 ? extractPromoFields(selectedRows[0], rawColumns, fieldMap) : null),
    [selectedRows, rawColumns, fieldMap],
  )

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
      toast.success('Plan généré — ajustez-le librement ci-dessous')
    } catch (e) {
      setPlan(defaultCatalogPlan(tree, name))
      toast.error(`IA indisponible (${String((e as Error).message).slice(0, 120)}) — plan par défaut appliqué`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Actions dans le HEADER des étapes : toujours visibles, même page scrollée */}
        <StepActionsPortal>
          <button onClick={() => void generate()} disabled={busy}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-sm font-medium">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Générer le plan (IA)
          </button>
          <button onClick={() => setStep('preview')} disabled={!plan}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md border border-indigo-500 text-indigo-300 hover:bg-indigo-600 hover:text-[#fff] disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium">
            Continuer → Aperçu <ArrowRight className="w-4 h-4" />
          </button>
        </StepActionsPortal>

        <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="w-4 h-4 text-indigo-400" /> Prompt global
          </h2>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
            placeholder="Décrivez le catalogue voulu : univers, ton, couleurs, densité des pages…"
            className="w-full px-3 py-2 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600 resize-none" />
          {!plan && (
            <p className="text-xs text-muted-foreground">
              Sans IA, un plan par défaut (grille homogène, thème neutre) reste disponible dès le premier clic.
            </p>
          )}
        </section>

        {plan ? (
          <>
            <PlanStylePanel plan={plan} setPlan={setPlan} coverImageUrl={coverImageUrl} backCoverImageUrl={backCoverImageUrl} />
            <PageStyleCard plan={plan} setPlan={setPlan} />
            <CardStyleCard plan={plan} setPlan={setPlan} sampleFields={sampleFields} />
            <SectionsCard plan={plan} flatNodes={flatNodes} rowsById={rowsById} columns={rawColumns} fieldMap={fieldMap} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Générez un plan pour éditer le thème, les couvertures et les sections.</p>
        )}
      </div>
    </div>
  )
}
