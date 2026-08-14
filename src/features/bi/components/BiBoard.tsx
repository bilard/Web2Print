// Corps du module BI pour UNE page d'UN tableau de bord : bandeau, rail, canevas, volets,
// onglets. `BiScreen` la monte avec `key={id}:{pageId}` : voir son en-tête pour le pourquoi.
//
// ⚠ Références stables vers `DashboardGrid` : `tiles`/`current.filters` viennent tels quels du
// parent, et `onClearFilters`/`onSelectTile` sont mémoïsés — sans ça, chaque frame de
// glissement fournirait une fonction fraîche à `TileBody` (mémoïsé) et chaque tuile referait
// son agrégation.
import { useCallback, useState, type ReactNode } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'
import { useLayoutDraft } from '../hooks/useLayoutDraft'
import { usePendingTiles } from '../hooks/usePendingTiles'
import { useBoardActions } from '../hooks/useBoardActions'
import { useTickingNow } from '../hooks/useTickingNow'
import { useAddTile } from '../hooks/useAddTile'
import { useBoardSource, useWatchSourceState, isWatchSource } from '../hooks/useWatchData'
import { getSource } from '../registry/sources'
import { AddTileMenu } from './AddTileMenu'
import { SourcePicker, SourceStatusList } from './SourcePicker'
import { BiTopBar } from './BiTopBar'
import { BiCrossbar } from './BiCrossbar'
import { BiWorkspace } from './BiWorkspace'
import { BiFiltersPanel } from './BiFiltersPanel'
import { BiVisualsPanel } from './BiVisualsPanel'
import { BiFieldsPanel } from './BiFieldsPanel'
import { BiPageTabs } from './BiPageTabs'
import { BiStatusBar } from './BiStatusBar'
import { DashboardGrid } from './DashboardGrid'
import { useTranslation } from '@/lib/i18n'
import type { Dashboard, DashboardPage, TileKind } from '../types'

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
  /** Le bouton « Nouveau tableau de bord » de `BiScreen`, qui possède seul `onCreated`. */
  headerAction?: ReactNode
}

export function BiBoard({
  current, page, pages, items, uid, editing, onToggleEdit, canEdit,
  onSelect, onSelectPage, onPageCreated, headerAction,
}: BiBoardProps) {
  const { t } = useTranslation()
  const act = useBoardActions(uid, current, page.id)
  const draft = useLayoutDraft(page.layout, act.persistLayout)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)

  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex] ?? null
  // ⚠ MÊME condition que `useTileData`/`effectivePimSource` : une feuille sans colonne n'est
  // pas exploitable, le moteur se replie alors sur le catalogue master — la barre doit dire
  // ce que le moteur lit VRAIMENT.
  const hasSheet = sheet !== null && sheet.columns.length > 0
  const hasProducts = usePimStore((s) => s.products.length > 0)

  // ⚠⚠ Poser une tuile est ATOMIQUE au rendu : la tuile et son placement ensemble.
  const { tiles, add: addPending } = usePendingTiles(page.tiles)
  // ⚠⚠ Source dérivée de la feuille active pour le PIM, registre pour la veille : le menu doit
  // proposer EXACTEMENT les champs que `useTileData` lira. Le hook déclenche au passage les
  // lectures réclamées par les tuiles POSÉES, jamais par la source seulement choisie.
  const { sourceId, setSourceId, source, context, demanded } = useBoardSource(tiles, sheet)
  const watch = useWatchSourceState(sourceId)
  const onWatch = isWatchSource(sourceId)
  // ⚠ `null` et non 0 : « 0 lignes » se lirait comme une source vide, jamais comme non lue.
  const rowCount = onWatch ? (watch.rows.length || null) : hasSheet ? sheet.rows.length : null
  const now = useTickingNow(true)

  // ⚠ `draft.addPlacement`/`draft.layout` et non `draft` : ce littéral est RECRÉÉ à chaque
  // rendu, le passer en entier annulerait la mémoïsation du rappel.
  const addTile = useAddTile({
    uid, current, pageId: page.id, tiles, layout: draft.layout, source, sourceId, onWatch,
    sheet, hasSheet, addPending, addPlacement: draft.addPlacement, onCreated: setSelectedTileId,
  })

  const selected = tiles.find((x) => x.id === selectedTileId) ?? null
  const onChangeKind = useCallback(
    (kind: TileKind) => {
      if (selectedTileId) act.setTileKind(tiles, selectedTileId, kind, draft.layout)
    }, [act, tiles, selectedTileId, draft.layout])
  const onAddPage = useCallback(() => onPageCreated(act.addPage(pages)), [act, pages, onPageCreated])

  return (
    <>
      <BiTopBar
        current={current} items={items} canEdit={canEdit} onSelectBoard={onSelect}
        onRename={act.rename} updatedAt={onWatch ? watch.updatedAt : null} now={now}
        sourcePicker={<SourcePicker context={context} demanded={demanded} sourceId={sourceId}
          onSourceChange={setSourceId} withStatus={false} />}
        editing={editing} onToggleEdit={onToggleEdit}
        undo={draft.undo} redo={draft.redo} canUndo={draft.canUndo} canRedo={draft.canRedo}
        actions={headerAction}
      />

      <BiWorkspace
        editing={editing}
        crossbar={(
          <BiCrossbar
            activeSheetName={hasSheet && !onWatch ? sheet.name : undefined}
            usesMasterCatalogue={!onWatch && !hasSheet && hasProducts}
            builtOnSheetName={onWatch ? undefined : current.sourceSheetName}
            /* ⚠ Le geste ET le droit : un droit révoqué en cours de session doit faire
               disparaître le menu à l'identique du bouton et du raccourci clavier. */
            /* L'état des sources de veille : des PHRASES, qui ont ici la place qu'elles
               n'ont pas dans le bandeau — et qui parlent du jeu de données, comme la barre. */
            trailing={<><SourceStatusList context={context} demanded={demanded} sourceId={sourceId} />
              {editing && canEdit && <AddTileMenu source={source} onAdd={addTile} />}</>}
          />
        )}
        canvas={(width) => (
          <DashboardGrid
            tiles={tiles} layout={draft.layout} editing={editing} width={width}
            globalFilters={current.filters} selectedTileId={selectedTileId}
            onDrag={draft.setDraft} onCommit={draft.commit}
            onClearFilters={act.clearFilters} onSelectTile={setSelectedTileId}
          />
        )}
        panels={(
          <>
            <BiFiltersPanel hasSelection={selected !== null} globalFilters={current.filters} />
            <BiVisualsPanel kind={selected?.kind ?? null} onChangeKind={onChangeKind} canEdit={canEdit} />
            <BiFieldsPanel source={source} />
          </>
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
