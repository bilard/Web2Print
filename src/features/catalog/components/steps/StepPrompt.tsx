// Étape 3 du wizard « Catalogue studio » : carte prompt (génération EN HAUT),
// puis cartes Style des fiches et Sections. Thème, couvertures et fonds de
// page s'éditent dans l'Aperçu (panneau « Fond de page », PageOptionsPanel).
// L'IA ne bloque jamais : échec → repli sur defaultCatalogPlan + toast explicite.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ArrowRight, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { buildCatalogTree, flattenTree } from '../../catalogTree'
import { DEFAULT_GRID, representativeGrid } from '../../catalogEngine'
import { cellDims, cellFit, magnifiedTextFit, mergedPageStyle, WIDE_MAGNIFY } from '../pages/catalogCss'
import { defaultUniverseColor } from '../../catalogFlatplan'
import { isWideCard } from '../pages/freeLayout'
import { generateCatalogPlan, defaultCatalogPlan } from '../../catalogPlan'
import { extractPromoFields, buildDetailLines, buildSpecTable } from '@/features/retail-promo/promoMapping'
import { DEFAULT_CARD_STYLE, type CardBox, type CardObjectId } from '../../catalogTypes'
import { CardStyleCard } from './CardStyleCard'
import { CardStylePreview } from './CardStylePreview'
import { PageSimPreview } from './PageSimPreview'
import { PreviewTextToolbar } from './PreviewTextToolbar'
import { CharteCard } from './CharteCard'
import { CoverVisualField } from './CoverVisualField'
import { usePreviewPan } from '../../usePreviewPan'
import { emblemPrompt, useCoverImage } from '../../useCoverImage'
import { SectionsCard } from './SectionsCard'
import { StepActionsPortal } from './StepActionsPortal'
import { t } from '@/lib/i18n'

export function StepPrompt() {
  const name = useCatalogStore((s) => s.name)
  const prompt = useCatalogStore((s) => s.prompt)
  const plan = useCatalogStore((s) => s.plan)
  const charte = useCatalogStore((s) => s.charte)
  const rawRows = useCatalogStore((s) => s.rawRows)
  const rowOverrides = useCatalogStore((s) => s.rowOverrides)
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const selectedRowIds = useCatalogStore((s) => s.selectedRowIds)
  const levelKeys = useCatalogStore((s) => s.levelKeys)
  const treeEdits = useCatalogStore((s) => s.treeEdits)
  const fieldMap = useCatalogStore((s) => s.fieldMap)
  const customFields = useCatalogStore((s) => s.customFields)
  const format = useCatalogStore((s) => s.format)
  const coverImageUrl = useCatalogStore((s) => s.coverImageUrl)
  const setPrompt = useCatalogStore((s) => s.setPrompt)
  const setPlan = useCatalogStore((s) => s.setPlan)
  const setStep = useCatalogStore((s) => s.setStep)
  const [busy, setBusy] = useState(false)
  // Création AUTOMATIQUE de l'emblème quand le plan désigne une marque (cf. generate).
  const { generateCover } = useCoverImage()
  // Objet sélectionné dans l'overlay de disposition libre → met en évidence + focus le curseur correspondant.
  const [selectedObject, setSelectedObject] = useState<CardObjectId | null>(null)
  // Produit affiché dans l'aperçu (👁 sur les puces de la carte Sections) + variante.
  const [previewRowId, setPreviewRowId] = useState<string | null>(null)
  const [previewFeatured, setPreviewFeatured] = useState(false)
  // L'aperçu suit le STATUT du produit choisi : sélectionner une vedette (ou
  // étoiler le produit affiché) bascule sur le template Vedette — le toggle
  // manuel Standard/Vedette reste utilisable après coup.
  const previewedIsFeatured = useMemo(
    () => previewRowId != null && (plan?.sections.some((s) => s.featuredIds.includes(previewRowId)) ?? false),
    [plan, previewRowId],
  )
  useEffect(() => {
    if (previewRowId) setPreviewFeatured(previewedIsFeatured)
  }, [previewedIsFeatured, previewRowId])

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
  // TOUJOURS via rowsById : `selectedRows` porte les lignes BRUTES, donc l'aperçu
  // ignorait les surcharges (visuel détouré, correction de données) tant qu'aucun
  // produit n'était choisi au 👁 — l'aperçu montrait alors autre chose que les pages.
  const sampleRow = useMemo(
    () => (previewRowId ? rowsById.get(previewRowId) : null) ?? (selectedRows[0] ? rowsById.get(selectedRows[0]._id) : null) ?? null,
    [previewRowId, rowsById, selectedRows],
  )
  const sampleFields = useMemo(
    () => (sampleRow ? extractPromoFields(sampleRow, rawColumns, fieldMap, customFields) : null),
    [sampleRow, rawColumns, fieldMap, customFields],
  )
  const sampleDetails = useMemo(
    () => (sampleFields ? buildDetailLines(customFields, sampleFields, plan?.cardStyle?.hiddenDetails, plan?.cardStyle?.maxBulletLines) : []),
    [customFields, sampleFields, plan?.cardStyle?.hiddenDetails, plan?.cardStyle?.maxBulletLines],
  )
  const sampleSpecs = useMemo(
    () => (sampleFields ? buildSpecTable(customFields, sampleFields, plan?.cardStyle?.hiddenDetails, plan?.cardStyle?.maxSpecLines) : null),
    [customFields, sampleFields, plan?.cardStyle?.hiddenDetails, plan?.cardStyle?.maxSpecLines],
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
      const next = await generateCatalogPlan(prompt, { catalogName: name, tree, sampleNames, charte }, plan)
      setPlan(next)
      toast.success('Plan généré — ajustez-le librement ci-dessous')
      // « Créer un logo "X" » demande une CRÉATION, pas un bouton à trouver : dès
      // que le plan désigne une marque et qu'aucun visuel n'existe, l'emblème est
      // produit dans la foulée. Jamais d'écrasement d'un logo déjà chargé.
      const brand = next.brandName?.trim()
      if (brand && !useCatalogStore.getState().logoUrl) {
        await generateCover(emblemPrompt(brand, next.theme.accent), 'logo')
      }
    } catch (e) {
      // Repli NON DESTRUCTIF : un plan existant (style des fiches, fonds de page,
      // vedettes, couvertures — des heures de réglages) n'est JAMAIS remplacé par
      // le plan neutre. Sans plan, le défaut débloque la première génération.
      if (plan) {
        toast.error(`IA indisponible (${String((e as Error).message).slice(0, 120)}) — plan actuel CONSERVÉ`)
      } else {
        setPlan(defaultCatalogPlan(tree, name))
        toast.error(`IA indisponible (${String((e as Error).message).slice(0, 120)}) — plan par défaut appliqué`)
      }
    } finally {
      setBusy(false)
    }
  }

  const cardStyle = useMemo(() => ({ ...DEFAULT_CARD_STYLE, ...plan?.cardStyle }), [plan])
  // Patch de disposition depuis l'overlay : lit l'état FRAIS du store — un même
  // geste peut émettre DEUX patchs successifs (ex. inversion de liaison) et une
  // closure sur `plan` écraserait le premier.
  const patchLayout = (id: CardObjectId, box: CardBox, wideOverride?: boolean) => {
    const s = useCatalogStore.getState()
    if (!s.plan) return
    const cs = { ...DEFAULT_CARD_STYLE, ...s.plan.cardStyle }
    // Chaque variante a son propre jeu de positions : le patch va dans celui
    // de la variante AFFICHÉE (verticale → layout · pleine largeur → layoutWide) ;
    // en simulation de page, la variante RÉELLE de la fiche éditée est passée.
    const key = (wideOverride ?? simWide ?? previewWide) ? 'layoutWide' : 'layout'
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
  // Simulation de PAGE : 0 = fiche seule (édition), sinon densité simulée (N/page).
  const [pageSim, setPageSim] = useState<0 | 1 | 2 | 3 | 4 | 6 | 8>(0)
  // Variante RÉELLE de la 1re fiche de la page simulée (mesurée par le rendu
  // moteur) — les patchs et le panneau « Bloc sélectionné » écrivent dans SON
  // jeu de positions ; le toggle Verticale/Pleine largeur ne vaut que hors sim.
  const [simMeasuredWide, setSimMeasuredWide] = useState(false)
  const simWide = pageSim ? simMeasuredWide : null
  // Zoom UTILISATEUR de l'aperçu (%) — 100 = ajusté à la colonne ; clic sur le % = reset.
  const [previewZoom, setPreviewZoom] = useState(100)
  // ⌘/Ctrl + molette OU pincement trackpad (wheel avec ctrlKey) = zoom fluide.
  // Listener NATIF passive:false — React attache wheel en passif, preventDefault
  // y serait ignoré et la page défilerait en même temps.
  const zoomAreaRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = zoomAreaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setPreviewZoom((z) => Math.min(200, Math.max(50, Math.round(z * Math.exp(-e.deltaY / 300)))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [plan != null])
  // PAN à la barre d'espace (outil main) : voile de capture au-dessus de l'aperçu —
  // ne déplace QUE le conteneur de l'aperçu (jamais la colonne de gauche).
  const scrollBoxRef = useRef<HTMLDivElement | null>(null)
  const { panning, overlayProps } = usePreviewPan({ hRef: scrollBoxRef })
  const baseIsWide = isWideCard(cell.w, cell.h)
  const previewWide = previewVariant === 'auto' ? baseIsWide : previewVariant === 'wide'
  // Forme de la carte d'aperçu : la cellule réelle si elle correspond à la
  // variante éditée, sinon une cellule CANONIQUE de l'autre famille
  // (grille 2 = pleine largeur · grille 4 = verticale).
  const uniformText = plan?.cardStyle?.uniformTextScale === true
  const previewCell = useMemo(() => {
    if (previewWide === baseIsWide) return cell
    const g = previewWide ? 2 : DEFAULT_GRID
    const { w, h } = cellDims(format, g)
    if (previewWide) {
      // Carte LARGE d'un catalogue à cellules verticales = carte ÉLARGIE réelle
      // (2 cellules + gap, magnifiée ×1.3) : même FORME que la cellule grille 2
      // mais le TEXTE reste celui du catalogue — reprendre le fit de la grille 2
      // (1.45) affichait un texte ~18 % plus grand que les pages (mesuré en prod).
      // Fit visuel = textFit de la carte magnifiée × la magnification.
      const fit = Math.round(magnifiedTextFit(cell.fit, WIDE_MAGNIFY, uniformText) * WIDE_MAGNIFY * 100) / 100
      return { w, h, fit }
    }
    // Variante verticale forcée : « Taille identique » cale TOUT le catalogue sur
    // le fit représentatif — l'aperçu doit suivre, sinon fit de la forme canonique.
    return { w, h, fit: uniformText ? cell.fit : cellFit(format, g) }
  }, [cell, previewWide, baseIsWide, format, uniformText])

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

        {/* Colonne gauche BORNÉE (600 px, arbre compact) ; l'APERÇU prend TOUTE
            la largeur restante — son zoom s'auto-mesure sur la place disponible. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] items-start">
          {/* Colonne gauche : prompt + sections */}
          <div className="space-y-5 min-w-0">
            <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="w-4 h-4 text-indigo-400" /> Prompt global
              </h2>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
                placeholder={t('cat.prompt.placeholder')}
                className="w-full px-3 py-2 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600 resize-none" />
              {!plan && (
                <p className="text-xs text-muted-foreground">
                  Sans IA, un plan par défaut (grille homogène, thème neutre) reste disponible dès le premier clic.
                </p>
              )}
              {/* DÉBOUCHÉ VISUEL du brief : « Générer le plan (IA) » traduit la
                  demande en prompt image (EN) ; le visuel se lance ICI, sans
                  passer par l'Aperçu — même bouton que le panneau « Fond de page ». */}
              {plan && (
                <div className="pt-1 space-y-2 border-t border-border/60">
                  <p className="text-[11px] text-white/50">
                    Visuel de couverture — <b className="text-white/70">le prompt ci-dessus part tel quel</b> à Nano Banana 2,
                    sans reformulation.
                  </p>
                  {/* AUCUN second champ : le Prompt global est juste au-dessus,
                      le recopier ici créait deux zones jumelles. Un prompt image
                      DISTINCT reste possible dans l'Aperçu › Fond de page. */}
                  <CoverVisualField target="cover" prompt={plan.cover.imagePrompt || prompt} imageUrl={coverImageUrl} />
                </div>
              )}
            </section>
            {/* Moteur créatif : éléments joints (charte PDF, logo, visuels) → palette
                + typos extraites, consignes libres — le tout pilote le plan IA. */}
            <CharteCard />
            {plan ? (
              <SectionsCard plan={plan} flatNodes={flatNodes} rowsById={rowsById} columns={rawColumns} fieldMap={fieldMap}
                previewId={previewRowId} onPreview={setPreviewRowId} />
            ) : (
              <p className="text-sm text-muted-foreground">Générez un plan pour éditer le style des fiches et les sections — thème et couvertures s'éditent dans l'Aperçu (panneau « Fond de page »).</p>
            )}
          </div>

          {/* Colonne droite du centre : APERÇU grand (le résultat), collé en haut.
              Clic sur le FOND (hors bloc et hors contrôles) → désélection du bloc
              actif — les blocs/outils de l'overlay stopPropagation, et on ignore
              tout clic sur un contrôle (palette d'ancrage, barres du header, zoom). */}
          {plan && (
            <div ref={zoomAreaRef} className="relative lg:sticky lg:top-0 w-full min-w-0"
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button, input, select, label, [data-object-id]')) return
                setSelectedObject(null)
              }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">{t('cat.prompt.cardPreview')}</span>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* Gestion de PARAGRAPHE du bloc sélectionné (gras/italique/souligné + alignement). */}
                  <PreviewTextToolbar obj={selectedObject} style={cardStyle}
                    patch={(p) => setPlan({ ...plan, cardStyle: { ...cardStyle, ...p } })} />
                  {/* Zoom de l'aperçu : relatif à l'ajustement auto — clic sur le % = 100. */}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={t('cat.prompt.zoomTitle')}>
                    <span aria-hidden>🔍</span>
                    <input type="range" min={50} max={200} step={5} value={previewZoom}
                      onChange={(e) => setPreviewZoom(Number(e.target.value))} className="w-24 accent-indigo-600" />
                    <button type="button" onClick={() => setPreviewZoom(100)} title={t('cat.prompt.zoom100')}
                      className="w-10 text-right tabular-nums hover:text-white">{previewZoom}%</button>
                  </div>
                  {/* Simulation de PAGE : la page réelle avec N fiches échantillon —
                      régler les tailles par bloc dans le vrai contexte d'impression. */}
                  <select value={pageSim} onChange={(e) => setPageSim(Number(e.target.value) as typeof pageSim)}
                    title={t('cat.prompt.simulatePage')}
                    className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] text-muted-foreground hover:text-white">
                    <option value={0}>Fiche seule</option>
                    {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>Page · {n}/page</option>)}
                  </select>
                  {/* Disposition éditée : chaque variante a SES positions (layout / layoutWide). */}
                  {pageSim === 0 && (
                    <div className="flex rounded-md overflow-hidden border border-border text-[11px]"
                      title={t('cat.prompt.layoutNote')}>
                      <button type="button" onClick={() => { setPreviewVariant('vertical'); setSelectedObject(null) }}
                        className={`px-2.5 py-1 ${!previewWide ? 'bg-indigo-600 text-[#fff]' : 'bg-surface-2 text-muted-foreground hover:text-white'}`}>
                        Verticale
                      </button>
                      <button type="button" onClick={() => { setPreviewVariant('wide'); setSelectedObject(null) }}
                        className={`px-2.5 py-1 ${previewWide ? 'bg-indigo-600 text-[#fff]' : 'bg-surface-2 text-muted-foreground hover:text-white'}`}>
                        Pleine largeur
                      </button>
                    </div>
                  )}
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
              {/* Zoom > 100 % : la carte déborde → défilement LOCAL des deux axes
                  (hauteur bornée au viewport) — le pan reste confiné à l'aperçu. */}
              <div ref={scrollBoxRef} className="overflow-auto pb-2 max-h-[calc(100vh-150px)]">
                {pageSim > 0 && sampleRow ? (
                  <PageSimPreview plan={plan} cardStyle={cardStyle} format={format}
                    columns={rawColumns} fieldMap={fieldMap} customFields={customFields}
                    row={sampleRow} grid={pageSim as Exclude<typeof pageSim, 0>}
                    zoom={previewZoom / 100}
                    onLayoutChange={patchLayout} onSelect={setSelectedObject} selected={selectedObject}
                    onMeasuredWide={setSimMeasuredWide} />
                ) : (
                  <CardStylePreview theme={plan.theme} cardStyle={cardStyle} pageStyle={mergedPageStyle(plan.pageStyle)} chapterColor={plan.sections.find((sec) => !sec.nodeId.includes('/'))?.color || defaultUniverseColor(0)} fields={sampleFields} details={sampleDetails} specs={sampleSpecs} cell={previewCell}
                    wide={previewWide} featuredVariant={previewFeatured} selected={selectedObject}
                    editable onLayoutChange={patchLayout}
                    onSelect={setSelectedObject} zoom={previewZoom / 100} />
                )}
              </div>
              {/* Voile PAN (espace maintenu) : capte le pointeur au-dessus de l'aperçu —
                  le drag des blocs est suspendu le temps du déplacement. */}
              {panning && (
                <div {...overlayProps} className="absolute inset-0 z-40 cursor-grab active:cursor-grabbing" />
              )}
            </div>
          )}
        </div>
      </div>

      {plan && (
        <aside className="w-80 shrink-0 border-l border-border bg-surface overflow-y-auto">
          <CardStyleCard plan={plan} setPlan={setPlan} selectedObject={selectedObject}
            onClearSelection={() => setSelectedObject(null)} onSelectObject={setSelectedObject}
            wide={simWide ?? previewWide} />
        </aside>
      )}
    </div>
  )
}
