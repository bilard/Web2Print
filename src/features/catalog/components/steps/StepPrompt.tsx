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
import { DEFAULT_GRID, representativeGrid } from '../../catalogEngine'
import { cellDims, cellFit } from '../pages/catalogCss'
import { isWideCard } from '../pages/freeLayout'
import { generateCatalogPlan, defaultCatalogPlan } from '../../catalogPlan'
import { extractPromoFields, buildDetailLines } from '@/features/retail-promo/promoMapping'
import { DEFAULT_CARD_STYLE, type CardBox, type CardObjectId } from '../../catalogTypes'
import { CardStyleCard } from './CardStyleCard'
import { CardStylePreview } from './CardStylePreview'
import { SectionsCard } from './SectionsCard'
import { StepActionsPortal } from './StepActionsPortal'

export function StepPrompt() {
  const name = useCatalogStore((s) => s.name)
  const prompt = useCatalogStore((s) => s.prompt)
  const plan = useCatalogStore((s) => s.plan)
  const rawRows = useCatalogStore((s) => s.rawRows)
  const rowOverrides = useCatalogStore((s) => s.rowOverrides)
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
  // Produit affiché dans l'aperçu (👁 sur les puces de la carte Sections) + variante.
  const [previewRowId, setPreviewRowId] = useState<string | null>(null)
  const [previewFeatured, setPreviewFeatured] = useState(false)

  // Corrections « publication » appliquées aussi à l'aperçu de fiche (cohérence avec les pages).
  const rowsById = useMemo(
    () => new Map(rawRows.map((r) => [r._id, rowOverrides[r._id] ? { ...r, ...rowOverrides[r._id] } : r])),
    [rawRows, rowOverrides],
  )
  const selectedRows = useMemo(() => {
    const ids = new Set(selectedRowIds)
    return rawRows.filter((r) => ids.has(r._id))
  }, [rawRows, selectedRowIds])
  const tree = useMemo(
    () => buildCatalogTree(selectedRows, rawColumns, levelKeys, treeEdits),
    [selectedRows, rawColumns, levelKeys, treeEdits],
  )
  const flatNodes = useMemo(() => flattenTree(tree), [tree])
  // Fiche exemple pour l'aperçu live du style : produit choisi via 👁 (carte
  // Sections), sinon 1er produit sélectionné — AVEC les champs libres pour que
  // l'aperçu montre la même zone « Détails » que le catalogue.
  const sampleFields = useMemo(() => {
    const row = (previewRowId ? rowsById.get(previewRowId) : null) ?? selectedRows[0] ?? null
    return row ? extractPromoFields(row, rawColumns, fieldMap, customFields) : null
  }, [previewRowId, rowsById, selectedRows, rawColumns, fieldMap, customFields])
  const sampleDetails = useMemo(
    () => (sampleFields ? buildDetailLines(customFields, sampleFields, plan?.cardStyle?.hiddenDetails) : []),
    [customFields, sampleFields, plan?.cardStyle?.hiddenDetails],
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
  // Patch de disposition depuis l'overlay : lit l'état FRAIS du store — un même
  // geste peut émettre DEUX patchs successifs (ex. inversion de liaison) et une
  // closure sur `plan` écraserait le premier.
  const patchLayout = (id: CardObjectId, box: CardBox) => {
    const s = useCatalogStore.getState()
    if (!s.plan) return
    const cs = { ...DEFAULT_CARD_STYLE, ...s.plan.cardStyle }
    // Chaque variante a son propre jeu de positions : le patch va dans celui
    // de la variante AFFICHÉE (verticale → layout · pleine largeur → layoutWide).
    const key = previewWide ? 'layoutWide' : 'layout'
    s.setPlan({ ...s.plan, cardStyle: { ...cs, [key]: { ...(cs[key] ?? {}), [id]: box } } })
  }
  // L'aperçu prend TOUJOURS la taille + le fit réels de la cellule imprimée
  // (réplique exacte de la fiche du catalogue — un seul affichage réaliste).
  const previewGrid = useMemo(() => (plan ? representativeGrid(plan.sections) : 4), [plan])
  const cell = useMemo(() => {
    const { w, h } = cellDims(format, previewGrid)
    return { w, h, fit: cellFit(format, previewGrid) }
  }, [format, previewGrid])
  // Variante ÉDITÉE dans l'aperçu : verticale ou pleine largeur (2 colonnes) —
  // les deux dispositions coexistent dans un catalogue (cartes élargies, grilles
  // mixtes) et s'affinent chacune sur SA forme. Défaut : la forme dominante.
  const [previewVariant, setPreviewVariant] = useState<'auto' | 'vertical' | 'wide'>('auto')
  const baseIsWide = isWideCard(cell.w, cell.h)
  const previewWide = previewVariant === 'auto' ? baseIsWide : previewVariant === 'wide'
  // Forme de la carte d'aperçu : la cellule réelle si elle correspond à la
  // variante éditée, sinon une cellule CANONIQUE de l'autre famille
  // (grille 2 = pleine largeur · grille 4 = verticale).
  const previewCell = useMemo(() => {
    if (previewWide === baseIsWide) return cell
    const g = previewWide ? 2 : DEFAULT_GRID
    const { w, h } = cellDims(format, g)
    return { w, h, fit: cellFit(format, g) }
  }, [cell, previewWide, baseIsWide, format])

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
              <SectionsCard plan={plan} flatNodes={flatNodes} rowsById={rowsById} columns={rawColumns} fieldMap={fieldMap}
                previewId={previewRowId} onPreview={setPreviewRowId} />
            ) : (
              <p className="text-sm text-muted-foreground">Générez un plan pour éditer le style des fiches et les sections — thème et couvertures s'éditent dans l'Aperçu (panneau « Fond de page »).</p>
            )}
          </div>

          {/* Colonne droite du centre : APERÇU grand (le résultat), collé en haut */}
          {plan && (
            <div className="lg:sticky lg:top-0 w-full lg:w-[560px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Aperçu de la fiche</span>
                <div className="flex items-center gap-2">
                  {/* Disposition éditée : chaque variante a SES positions (layout / layoutWide). */}
                  <div className="flex rounded-md overflow-hidden border border-border text-[11px]"
                    title="Chaque disposition s'affine séparément : verticale (cartes standard) · pleine largeur (2 colonnes)">
                    <button type="button" onClick={() => { setPreviewVariant('vertical'); setSelectedObject(null) }}
                      className={`px-2.5 py-1 ${!previewWide ? 'bg-indigo-600 text-[#fff]' : 'bg-surface-2 text-muted-foreground hover:text-white'}`}>
                      Verticale
                    </button>
                    <button type="button" onClick={() => { setPreviewVariant('wide'); setSelectedObject(null) }}
                      className={`px-2.5 py-1 ${previewWide ? 'bg-indigo-600 text-[#fff]' : 'bg-surface-2 text-muted-foreground hover:text-white'}`}>
                      Pleine largeur
                    </button>
                  </div>
                  {/* Variante vedette : les positions sont COMMUNES, seuls ruban/cadre diffèrent. */}
                  <div className="flex rounded-md overflow-hidden border border-border text-[11px]">
                    <button type="button" onClick={() => setPreviewFeatured(false)}
                      className={`px-2.5 py-1 ${!previewFeatured ? 'bg-indigo-600 text-[#fff]' : 'bg-surface-2 text-muted-foreground hover:text-white'}`}>
                      Standard
                    </button>
                    <button type="button" onClick={() => setPreviewFeatured(true)}
                      className={`px-2.5 py-1 ${previewFeatured ? 'bg-indigo-600 text-[#fff]' : 'bg-surface-2 text-muted-foreground hover:text-white'}`}>
                      ★ Vedette
                    </button>
                  </div>
                </div>
              </div>
              <CardStylePreview theme={plan.theme} cardStyle={cardStyle} fields={sampleFields} details={sampleDetails} cell={previewCell}
                wide={previewWide} featuredVariant={previewFeatured} selected={selectedObject}
                editable onLayoutChange={patchLayout}
                onSelect={setSelectedObject} />
            </div>
          )}
        </div>
      </div>

      {plan && (
        <aside className="w-80 shrink-0 border-l border-border bg-surface overflow-y-auto">
          <CardStyleCard plan={plan} setPlan={setPlan} selectedObject={selectedObject}
            onClearSelection={() => setSelectedObject(null)} wide={previewWide} />
        </aside>
      )}
    </div>
  )
}
