// src/features/catalog/components/steps/StepPrompt.tsx
// Étape 3 du wizard « Catalogue studio » : carte prompt (génération EN HAUT),
// puis cartes Style des fiches et Sections. Thème, couvertures et fonds de
// page s'éditent dans l'Aperçu (panneau « Fond de page », PageOptionsPanel).
// L'IA ne bloque jamais : échec → repli sur defaultCatalogPlan + toast explicite.
import { useMemo, useState } from 'react'
import { Loader2, ArrowRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { buildCatalogTree, flattenTree } from '../../catalogTree'
import { representativeGrid } from '../../catalogEngine'
import { cellDims } from '../pages/catalogCss'
import { generateCatalogPlan, defaultCatalogPlan } from '../../catalogPlan'
import { extractPromoFields, buildDetailLines } from '@/features/retail-promo/promoMapping'
import { DEFAULT_CARD_STYLE, type CardObjectId } from '../../catalogTypes'
import { CardStyleCard } from './CardStyleCard'
import { CardStylePreview } from './CardStylePreview'
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
  const customFields = useCatalogStore((s) => s.customFields)
  const format = useCatalogStore((s) => s.format)
  const setPrompt = useCatalogStore((s) => s.setPrompt)
  const setPlan = useCatalogStore((s) => s.setPlan)
  const setStep = useCatalogStore((s) => s.setStep)
  const [busy, setBusy] = useState(false)
  // Objet sélectionné dans l'overlay de disposition libre → met en évidence + focus le curseur correspondant.
  const [selectedObject, setSelectedObject] = useState<CardObjectId | null>(null)

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
  // Fiche exemple pour l'aperçu live du style (1er produit sélectionné) — AVEC les
  // champs libres pour que l'aperçu montre la même zone « Détails » que le catalogue.
  const sampleFields = useMemo(
    () => (selectedRows.length > 0 ? extractPromoFields(selectedRows[0], rawColumns, fieldMap, customFields) : null),
    [selectedRows, rawColumns, fieldMap, customFields],
  )
  const sampleDetails = useMemo(
    () => (sampleFields ? buildDetailLines(customFields, sampleFields) : []),
    [customFields, sampleFields],
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
      // `plan` courant transmis : régénérer PRÉSERVE les réglages manuels (style
      // des fiches, fonds de page, couleurs de chapitres) — l'IA n'écrase que ce
      // qu'elle renvoie explicitement.
      setPlan(await generateCatalogPlan(prompt, { catalogName: name, tree, sampleNames }, plan))
      toast.success('Plan généré — ajustez-le librement ci-dessous')
    } catch (e) {
      setPlan(defaultCatalogPlan(tree, name))
      toast.error(`IA indisponible (${String((e as Error).message).slice(0, 120)}) — plan par défaut appliqué`)
    } finally {
      setBusy(false)
    }
  }

  const cardStyle = useMemo(() => ({ ...DEFAULT_CARD_STYLE, ...plan?.cardStyle }), [plan])
  // Disposition libre : l'aperçu prend l'ASPECT réel de la cellule imprimée
  // (mêmes proportions carte éditée ↔ fiche du catalogue → placement fidèle).
  const cellAspect = useMemo(
    () => (plan && cardStyle.freeLayout ? (() => { const { w, h } = cellDims(format, representativeGrid(plan.sections)); return w / h })() : undefined),
    [plan, cardStyle.freeLayout, format],
  )

  return (
    <div className="h-full flex min-h-0">
      <div className="flex-1 overflow-y-auto p-6">
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

        <div className="mx-auto max-w-[1400px] grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] items-start">
          {/* Colonne gauche : prompt + sections */}
          <div className="space-y-5 min-w-0">
            <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="w-4 h-4 text-indigo-400" /> Prompt global
              </h2>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
                placeholder="Décrivez le catalogue voulu : univers, ton, couleurs, densité des pages…"
                className="w-full px-3 py-2 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600 resize-none" />
              {!plan && (
                <p className="text-xs text-muted-foreground">
                  Sans IA, un plan par défaut (grille homogène, thème neutre) reste disponible dès le premier clic.
                </p>
              )}
            </section>
            {plan ? (
              <SectionsCard plan={plan} flatNodes={flatNodes} rowsById={rowsById} columns={rawColumns} fieldMap={fieldMap} />
            ) : (
              <p className="text-sm text-muted-foreground">Générez un plan pour éditer le style des fiches et les sections — thème et couvertures s'éditent dans l'Aperçu (panneau « Fond de page »).</p>
            )}
          </div>

          {/* Colonne droite du centre : APERÇU grand (le résultat), collé en haut */}
          {plan && (
            <div className="lg:sticky lg:top-0 w-full lg:w-[560px]">
              <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2">Aperçu de la fiche</div>
              <CardStylePreview theme={plan.theme} cardStyle={cardStyle} fields={sampleFields} details={sampleDetails} aspect={cellAspect}
                editable onLayoutChange={(id, box) => setPlan({ ...plan, cardStyle: { ...cardStyle, layout: { ...cardStyle.layout, [id]: box } } })}
                onSelect={setSelectedObject} />
            </div>
          )}
        </div>
      </div>

      {plan && (
        <aside className="w-80 shrink-0 border-l border-border bg-surface overflow-y-auto">
          <CardStyleCard plan={plan} setPlan={setPlan} selectedObject={selectedObject} />
        </aside>
      )}
    </div>
  )
}
