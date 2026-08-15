// Corps du module BI pour UNE page d'UN tableau de bord : bandeau, rail, canevas, volets,
// onglets. `BiScreen` la monte avec `key={id}:{pageId}` : voir son en-tête pour le pourquoi.
//
// ⚠ Références stables vers `DashboardGrid` : `tiles`/`current.filters` viennent tels quels du
// parent, et `onClearFilters`/`onSelectTile` sont mémoïsés — sans ça, chaque frame de
// glissement fournirait une fonction fraîche à `TileBody` (mémoïsé) et chaque tuile referait
// son agrégation.
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { TvMinimal } from 'lucide-react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'
import { upsertFilter, describeFilter } from '../filters/filterOptions'
import { drillDown, applyDrill, type DrillStep } from '../filters/drill'
import { CrossFilterChip } from './CrossFilterChip'
import { BiQuickFilter } from './BiQuickFilter'
import { BiSourceRail } from './BiSourceRail'
import { quickFilterTarget } from '../filters/quickFilter'
import { DrillCrumbs } from './DrillCrumbs'
import { useBoardExport } from '../export/useBoardExport'
import { useSourceRows } from '../hooks/useSourceRows'
import { dimensionLabel } from '../filters/dimensionLabel'
import { useLayoutDraft } from '../hooks/useLayoutDraft'
import { usePendingTiles } from '../hooks/usePendingTiles'
import { useBoardActions } from '../hooks/useBoardActions'
import { useTickingNow } from '../hooks/useTickingNow'
import { useAddTile } from '../hooks/useAddTile'
import { retargetTiles } from '../engine/retarget'
import { useBoardCommands } from '../hooks/useBoardCommands'
import type { TvMode } from '../hooks/useTvMode'
import { PromptBoardDialog } from './PromptBoardDialog'
import { exportBoardToPng, exportBoardToPdf } from '../export/exportImage'
import {
  useBoardSource, useWatchSourceState, useShownUpdatedAt, useWatchSelection, isWatchSource,
} from '../hooks/useWatchData'
import { getSource } from '../registry/sources'
import { effectivePimSource } from '../registry/pim.source'
import { ageLabel } from '../engine/age'
import { useTileEdits } from '../builder/useTileEdits'
import { useBuilderHistory } from '../builder/useBuilderHistory'
import { retypeTile } from '../builder/wellEdits'
import { AddTileMenu } from './AddTileMenu'
import { SourcePicker, SourceStatusList } from './SourcePicker'
import { BiTopBar } from './BiTopBar'
import { BiCrossbar } from './BiCrossbar'
import { BiWorkspace } from './BiWorkspace'
import { BiPanels } from './BiPanels'
import { BiPageTabs } from './BiPageTabs'
import { BiStatusBar } from './BiStatusBar'
import { DashboardGrid } from './DashboardGrid'
import { useTranslation } from '@/lib/i18n'
import type { Dashboard, DashboardPage, SourceId, Tile, TileKind, TilePlacement } from '../types'

interface BiBoardProps {
  current: Dashboard
  /** Page AFFICHÉE. `BiScreen` la choisit et remonte le composant quand elle change. */
  page: DashboardPage
  /** ⚠⚠ Pages TELLES QUE l'écran les connaît : celles du document PLUS celle qu'on vient
   *  d'ajouter, que l'écho n'a pas ramenée. Lire `current.pages` ferait clignoter l'onglet. */
  pages: DashboardPage[]
  items: Dashboard[]
  uid: string | null
  editing: boolean
  onToggleEdit: () => void
  canEdit: boolean
  onSelect: (id: string) => void
  onSelectPage: (id: string) => void
  /** La page ajoutée, remontée à l'écran qui l'affiche AVANT l'écho de la base. */
  onPageCreated: (page: DashboardPage) => void
  /** Mode TV, tenu par l'ÉCRAN : `BiBoard` est remontée à chaque rotation de page, elle ne
   *  peut donc pas porter cet état elle-même. */
  tv: TvMode
  /** Le bouton « Nouveau tableau de bord » de `BiScreen`, qui possède seul `onCreated`. */
  headerAction?: ReactNode
}

export function BiBoard({
  current, page, pages, items, uid, editing, onToggleEdit, canEdit,
  onSelect, onSelectPage, onPageCreated, headerAction, tv,
}: BiBoardProps) {
  const { t } = useTranslation()
  const act = useBoardActions(uid, current, page.id)
  // ⚠⚠ Les tuiles TELLES QU'AFFICHÉES, lues au moment de l'écriture. Elles sont calculées
  // plus bas (`usePendingTiles` puis `useTileEdits`), alors que `useLayoutDraft` réclame son
  // rappel d'écriture ICI : d'où la référence. Sans elle, l'écriture de mise en page
  // repartirait des tuiles de `current` — en retard d'un aller-retour Firestore — et le
  // premier clic sur une tuile effacerait le champ qu'on venait d'y déposer.
  const shownTiles = useRef<Tile[]>(page.tiles)
  const persistLayout = useCallback(
    (l: TilePlacement[]) => act.persistLayout(l, shownTiles.current), [act.persistLayout])
  const draft = useLayoutDraft(page.layout, persistLayout)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)
  // Zone capturée par l'export image/PDF : le canevas et son bandeau de filtres.
  const captureRef = useRef<HTMLDivElement>(null)
  const [promptOpen, setPromptOpen] = useState(false)
  const { createFromPlan } = useBoardCommands(uid)
  // ⚠ Le canevas est monté dans tous les cas, mais la référence peut n'être pas encore
  // posée au tout premier rendu : on refuse alors la capture au lieu de laisser passer un
  // `null` qui ferait échouer html2canvas avec un message incompréhensible.
  const captureBoard = (fn: (el: HTMLElement, name: string) => Promise<void>) => async () => {
    const el = captureRef.current
    if (!el) throw new Error(t('bi.export.imageFailed'))
    await fn(el, current.name)
  }
  // ⚠ En mode TV, aucun geste d'édition : les pages tournent toutes seules, et un panneau
  // ouvert pendant une bascule ferait perdre le réglage en cours.
  const inEdit = editing && !tv.on
  /**
   * Filtre posé par un CLIC dans une tuile (« filtrage croisé »).
   *
   * ⚠ Volontairement en état d'écran, non persisté : c'est une exploration, pas une
   * configuration. Il disparaît au rechargement, comme dans les outils décisionnels — un
   * filtre de lecture qui survivrait sans qu'on l'ait posé délibérément ferait douter de
   * tous les chiffres à la réouverture.
   */
  const [crossFilter, setCrossFilter] = useState<
    { tileId: string; field: string; value: string | null } | null
  >(null)
  /** Ce qui filtre réellement la page : les filtres enregistrés PLUS celui du clic. */
  const effectiveFilters = useMemo(
    () => (crossFilter
      ? upsertFilter(current.filters, { field: crossFilter.field, op: 'eq', value: crossFilter.value })
      : current.filters),
    [current.filters, crossFilter],
  )
  const pick = useCallback((tileId: string, field: string, value: string | null) => {
    // Re-cliquer la même valeur annule : le geste doit être réversible sans passer par le
    // bandeau, sinon on reste prisonnier d'un filtre posé par mégarde.
    setCrossFilter((cur) =>
      cur && cur.tileId === tileId && cur.field === field && cur.value === value
        ? null
        : { tileId, field, value })
  }, [])

  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex] ?? null
  // ⚠ MÊME condition que `useTileData`/`effectivePimSource` : une feuille sans colonne n'est
  // pas exploitable, le moteur se replie alors sur le catalogue master — la barre doit dire
  // ce que le moteur lit VRAIMENT.
  const hasSheet = sheet !== null && sheet.columns.length > 0
  const hasProducts = usePimStore((s) => s.products.length > 0)

  // ⚠⚠ Poser une tuile est ATOMIQUE au rendu : la tuile et son placement ensemble.
  const { tiles: posed, add: addPending } = usePendingTiles(page.tiles)
  // ⚠⚠ La tuile RECONFIGURÉE s'affiche au geste, pas à l'écho de la base : même décalage que
  // pour la pose, et sans cette surcharge la puce apparaîtrait dans la zone pendant que la
  // tuile continuerait d'afficher les chiffres d'avant.
  const edits = useTileEdits({ uid, current, pageId: page.id, tiles: posed, layout: draft.layout })
  const tiles = edits.tiles

  /**
   * Forage en cours, PAR TUILE : descendre dans « Ventes par univers » ne doit pas changer
   * l'axe des autres tuiles de la page.
   *
   * ⚠ Non persisté, comme le filtre croisé : c'est une exploration. Rouvrir le tableau
   * ramène chaque tuile à son niveau enregistré, sinon on retrouverait un axe qu'on n'a
   * jamais configuré et des chiffres réduits sans savoir pourquoi.
   */
  const [drills, setDrills] = useState<Record<string, DrillStep[]>>({})
  const drillInto = useCallback((tileId: string, value: string | null) => {
    const tile = tiles.find((x) => x.id === tileId)
    if (!tile) return
    const steps = drills[tileId] ?? []
    // La requête courante inclut les pas déjà franchis : on repart d'elle, pas de la tuile
    // enregistrée, sinon le second niveau écraserait le premier.
    const base = steps.length ? applyDrill(tile.query, steps) : tile.query
    const next = drillDown(base, value, tile.interactions?.drillPath)
    if (!next) return
    setDrills((cur) => ({ ...cur, [tileId]: [...steps, next.step] }))
  }, [tiles, drills])
  const drillBack = useCallback((tileId: string, index: number) => {
    setDrills((cur) => ({ ...cur, [tileId]: (cur[tileId] ?? []).slice(0, index) }))
  }, [])

  shownTiles.current = tiles
  // ⚠⚠ La page TELLE QU'AFFICHÉE, publiée aux écritures qui ne prétendent toucher NI aux
  // tuiles NI à la mise en page (renommer, changer de base source, vider les filtres, ajouter
  // un onglet). `setDoc` REMPLACE le document : sans cette publication, ces gestes anodins
  // réécrivent les pages de `current` — en retard d'un aller-retour Firestore — et défont le
  // déplacement ou la reconfiguration qu'on vient de faire. Même référence que `shownTiles`,
  // posée au même endroit et donc toujours d'accord avec elle.
  act.trackPage(tiles, draft.layout)
  // ⚠⚠ Source dérivée de la feuille active pour le PIM, registre pour la veille : le menu doit
  // proposer EXACTEMENT les champs que `useTileData` lira. Le hook déclenche au passage les
  // lectures réclamées par les tuiles POSÉES, jamais par la source seulement choisie.
  const { sourceId, setSourceId, source, context, demanded } = useBoardSource(tiles, sheet)
  const watch = useWatchSourceState(sourceId)
  const shownUpdatedAt = useShownUpdatedAt(demanded)
  const { setWatchId } = useWatchSelection()
  // Sur quoi porte le filtre d'un coup d'œil (le concurrent, sur la veille).
  const quick = useMemo(() => quickFilterTarget(demanded), [demanded])
  const onWatch = isWatchSource(sourceId)

  // ⚠ L'export part des filtres EFFECTIFS (ceux du tableau plus celui d'un clic croisé) :
  // on exporte les chiffres qu'on a sous les yeux, jamais d'autres.
  const sourceRows = useSourceRows(sourceId)
  const exportBoard = useBoardExport(current.name, tiles, source, sourceRows, effectiveFilters)
  // ⚠ `null` et non 0 : « 0 lignes » se lirait comme une source vide, jamais comme non lue.
  const rowCount = onWatch ? (watch.rows.length || null) : hasSheet ? sheet.rows.length : null
  const now = useTickingNow(true)

  // ⚠⚠ UNE seule paire de flèches pour DEUX piles : la mise en page et la configuration des
  // champs. Le journal d'ordre rend aux flèches la chronologie que l'utilisateur attend.
  const hist = useBuilderHistory({
    setDraft: draft.setDraft, commit: draft.commit, commitLayout: draft.commitLayout,
    layoutUndo: draft.undo, layoutRedo: draft.redo,
    canLayoutUndo: draft.canUndo, canLayoutRedo: draft.canRedo, edits,
  })

  // ⚠ `draft.layout` et non `draft` : ce littéral est RECRÉÉ à chaque rendu, le passer en
  // entier annulerait la mémoïsation du rappel.
  const addTile = useAddTile({
    uid, current, pageId: page.id, tiles, layout: draft.layout, source, sourceId, onWatch,
    sheet, hasSheet, addPending, commitLayout: hist.onCommitLayout, onCreated: setSelectedTileId,
  })

  const selected = tiles.find((x) => x.id === selectedTileId) ?? null
  const applyEdit = useCallback((next: Tile) => { edits.apply(next); hist.note() },
    [edits, hist])
  // ⚠⚠ Le type change ET la requête est remise d'aplomb (`retypeTile`) : une tuile à barres
  // réglée sur une dimension, passée en indicateur, n'afficherait que la PREMIÈRE ligne du
  // regroupement — un chiffre faux, sans le moindre avertissement.
  const onChangeKind = useCallback((kind: TileKind) => {
    if (selected) applyEdit(retypeTile(selected, kind))
  }, [selected, applyEdit])
  /**
   * Supprime une tuile — avec le geste pour la reprendre.
   *
   * ⚠⚠ Pas de fenêtre de confirmation : elle arrêterait le travail pour un geste qui se
   * défait en un clic. Le toast porte l'annulation, et il porte le NOM de la tuile — « Tuile
   * supprimée » sur un tableau de vingt cadres ne dit pas laquelle est partie.
   */
  const removeTile = useCallback((tileId: string) => {
    const tile = tiles.find((x) => x.id === tileId)
    const before = draft.layout
    const undo = act.removeTile(tileId, tiles, before)
    if (!undo) return
    // ⚠⚠ Le BROUILLON de mise en page suit l'écriture. `useLayoutDraft` ne se resynchronise
    // jamais sur le document (état de montage figé) : sans cette pose, la tuile restaurée
    // revenait sans placement, et `react-grid-layout` lui donnait une case 1×1 dans un coin.
    hist.onCommitLayout(before.filter((l) => l.tileId !== tileId))
    // La sélection suit : les volets de droite décriraient sinon une tuile qui n'existe plus.
    setSelectedTileId((cur) => (cur === tileId ? null : cur))
    toast.success(t('bi.tile.removed', { title: tile?.title || '—' }), {
      action: {
        label: t('bi.tile.undo'),
        // ⚠⚠ La tuile revient DANS LE RENDU en même temps que son placement. Sans
        // `addPending`, l'écriture part mais la grille ne connaît encore que sept enfants
        // pour huit cases : `react-grid-layout` élague la case orpheline et rappelle
        // `onLayoutChange`, si bien que la tuile — arrivée une seconde plus tard avec
        // l'écho Firestore — se retrouvait sans place et tombait en 1×1 dans un coin. C'est
        // le décalage que `usePendingTiles` existe pour couvrir, déjà vu à la pose.
        onClick: () => {
          undo()
          if (tile) addPending(tile)
          hist.onCommitLayout(before)
        },
      },
    })
  }, [act, tiles, draft.layout, hist, addPending])

  /**
   * Changer la source du tableau : les tuiles qui le peuvent SUIVENT.
   *
   * ⚠⚠ Une tuile ne bascule que si la source d'arrivée porte tous ses champs. Celles qui
   * restent sont NOMMÉES avec le champ en cause — « 3 tuiles non converties » n'apprend
   * rien, « Écart médian — champ absent : medGapPct » dit quoi faire.
   * ⚠ Le geste est annulable : un clic dans un menu ne doit pas abîmer un tableau sans
   * retour possible.
   */
  const changeSource = useCallback((next: SourceId) => {
    setSourceId(next)
    const target = next === 'pim.products' ? effectivePimSource(sheet) : getSource(next)
    const r = retargetTiles(tiles, next, target)
    if (r.moved === 0 && r.blocked.length === 0) return
    if (r.moved > 0) {
      const undo = act.retarget(r.tiles, draft.layout, tiles)
      toast.success(t('bi.source.retargeted', { count: r.moved }), {
        description: r.blocked.length
          ? r.blocked.map((b) => t('bi.source.blockedOne', { title: b.title, field: b.field })).join(' · ')
          : undefined,
        action: { label: t('bi.tile.undo'), onClick: () => undo() },
      })
      return
    }
    // Rien n'a pu suivre : le dire, plutôt que de laisser croire que le clic n'a rien fait.
    toast.warning(t('bi.source.retargetNone'), {
      description: r.blocked.map((b) => t('bi.source.blockedOne', { title: b.title, field: b.field })).join(' · '),
    })
  }, [act, tiles, draft.layout, setSourceId, sheet, t])

  const onAddPage = useCallback(() => onPageCreated(act.addPage(pages)), [act, pages, onPageCreated])

  return (
    <>
      {tv.on ? (
        <header className="flex items-center gap-3 shrink-0 px-4 py-2 bg-surface border-b border-white/[0.06]">
          <h1 className="text-[14px] font-semibold text-white">{current.name}</h1>
          {pages.length > 1 && <span className="text-[12px] text-white/45">{page.name}</span>}
          <span className="flex-1" />
          <span className="text-[11px] text-white/40 tabular-nums">
            {onWatch && watch.updatedAt != null
              ? t('bi.status.age', { age: ageLabel(watch.updatedAt, now) })
              : t('bi.status.noAge')}
          </span>
          <button type="button" onClick={tv.exit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-well px-2.5 py-1 text-[12px] text-white/70 hover:text-white">
            <TvMinimal className="w-3.5 h-3.5" />{t('bi.top.tvExit')}
          </button>
        </header>
      ) : (
      <BiTopBar
        current={current} items={items} canEdit={canEdit} onSelectBoard={onSelect}
        /* ⚠ L'âge des données AFFICHÉES, jamais celui de la source choisie pour la prochaine
           tuile : cf. `useShownUpdatedAt`. */
        onRename={act.rename} updatedAt={shownUpdatedAt} now={now}
        /* ⚠ `onDbChange` seulement pour qui peut écrire : le choix de base est PERSISTÉ dans
           le document, un rôle consultation seule ne doit pas tenter l'écriture. */
        sourcePicker={<SourcePicker context={context} demanded={demanded} sourceId={sourceId}
          withStatus={false} editing={inEdit} />}
        editing={editing} onToggleEdit={onToggleEdit} onExport={exportBoard}
        onExportPng={captureBoard(exportBoardToPng)}
        onExportPdf={captureBoard(exportBoardToPdf)}
        onPrompt={() => setPromptOpen(true)}
        undo={hist.undo} redo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo}
        actions={headerAction}
      />
      )}

      <PromptBoardDialog
        open={promptOpen} onOpenChange={setPromptOpen} source={source} sourceId={sourceId}
        onPlanned={async (board) => {
          // ⚠ L'attribution suit le tableau créé : sur la veille, elle n'a pas de sens
          // (les chiffres ne viennent d'aucune feuille) ; sur le PIM, elle est ce qui
          // permettra plus tard de dire « bâti sur la feuille X ».
          const id = await createFromPlan(board, onWatch ? undefined : {
            sourceDbId: current.sourceDbId,
            sourceDbName: current.sourceDbName,
            sourceSheetName: hasSheet ? sheet.name : current.sourceSheetName,
          })
          // ⚠ On bascule sur le tableau créé : le laisser en arrière-plan donnerait
          // l'impression que le geste n'a rien produit.
          if (id) onSelect(id)
        }}
      />

      <BiWorkspace
        captureRef={captureRef}
        /* ⚠ Le choix du jeu de données est une LISTE à gauche, pas un menu du bandeau : on y
           voit d'un coup d'œil qu'une veille et une base produits s'excluent. */
        sourceRail={(
          <BiSourceRail
            watches={context.watches} sourceId={sourceId} watchId={context.watchId}
            dbId={current.sourceDbId} sheetName={current.sourceSheetName} demanded={demanded}
            onChoose={(c) => {
              if (c.watchId) setWatchId(c.watchId)
              if (c.dbId !== undefined && canEdit) act.setSourceDb(c.dbId ?? undefined, c.dbName)
              changeSource(c.source)
            }}
          />
        )}
        editing={inEdit}
        crossbar={(
          <BiCrossbar
            activeSheetName={hasSheet && !onWatch ? sheet.name : undefined}
            usesMasterCatalogue={!onWatch && !hasSheet && hasProducts}
            builtOnSheetName={onWatch ? undefined : current.sourceSheetName}
            /* ⚠ Le geste ET le droit : un droit révoqué en cours de session doit faire
               disparaître le menu à l'identique du bouton et du raccourci clavier. */
            /* L'état des sources de veille : des PHRASES, qui ont ici la place qu'elles
               n'ont pas dans le bandeau — et qui parlent du jeu de données, comme la barre. */
            trailing={<>
              {/* ⚠ La PORTE D'ENTRÉE du filtrage croisé : le clic sur une barre faisait déjà
                  la même chose, mais rien ne l'annonçait. Même mécanique, même puce. */}
              {quick && (
                <BiQuickFilter
                  sourceId={quick.sourceId} source={getSource(quick.sourceId)} field={quick.field}
                  value={crossFilter?.field === quick.field ? crossFilter.value : null}
                  onChange={(v) => setCrossFilter(v === null
                    ? null
                    : { tileId: '', field: quick.field, value: v })}
                />
              )}
              <SourceStatusList context={context} demanded={demanded} sourceId={sourceId}
              dbName={current.sourceDbName} />
              {/* ⚠ Le filtre du clic AVANT le reste : c'est lui qui restreint ce que montrent
                  les tuiles à cet instant, et il doit se lire sans survol. */}
              {crossFilter && (
                <CrossFilterChip
                  label={describeFilter(
                    { field: crossFilter.field, op: 'eq', value: crossFilter.value },
                    dimensionLabel(source, crossFilter.field, t),
                    (v) => (v === null || v === undefined ? t('bi.filters.emptyValue') : String(v)),
                  )}
                  onClear={() => setCrossFilter(null)}
                />
              )}
              {/* ⚠ Le forage de la tuile SÉLECTIONNÉE : sans fil d'Ariane, l'axe change,
                  les chiffres se réduisent, et rien ne dit ni d'où l'on vient ni comment
                  revenir. */}
              {selectedTileId && (drills[selectedTileId]?.length ?? 0) > 0 && (
                <DrillCrumbs
                  steps={drills[selectedTileId]}
                  labelOf={(f) => dimensionLabel(source, f, t)}
                  onUp={(i) => drillBack(selectedTileId, i)}
                />
              )}
              {inEdit && canEdit && <AddTileMenu source={source} onAdd={addTile} />}</>}
          />
        )}
        canvas={(width) => (
          <DashboardGrid
            tiles={tiles} layout={draft.layout} editing={inEdit} width={width}
            /* ⚠ Les filtres du tableau ET celui du clic : les tuiles calculent avec les deux,
               sinon le graphe cliqué serait le seul à changer et la page se contredirait. */
            globalFilters={effectiveFilters} selectedTileId={selectedTileId}
            crossFilter={crossFilter} onPick={pick}
            onDrill={drillInto} drills={drills}
            onDrag={hist.onDrag} onCommit={hist.onCommit}
            onClearFilters={act.clearFilters} onSelectTile={setSelectedTileId}
            onRemoveTile={removeTile}
          />
        )}
        panels={(
          <BiPanels
            tile={selected} source={source} globalFilters={current.filters}
            canEdit={canEdit} onChangeKind={onChangeKind} onApply={applyEdit}
          />
        )}
      />

      <BiPageTabs
        pages={pages} activeId={page.id} onSelect={onSelectPage}
        onAdd={onAddPage} canAdd={editing && canEdit}
        status={<BiStatusBar sourceLabel={t(getSource(sourceId).labelKey)} rowCount={rowCount}
          updatedAt={onWatch ? watch.updatedAt : null} now={now} />}
      />
    </>
  )
}
