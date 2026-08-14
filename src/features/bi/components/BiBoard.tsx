// Corps du module BI pour UNE page d'UN tableau de bord : bandeau, rail, canevas, volets,
// onglets. `BiScreen` la monte avec `key={id}:{pageId}` : voir son en-tête pour le pourquoi.
//
// ⚠ Références stables vers `DashboardGrid` : `tiles`/`current.filters` viennent tels quels du
// parent (pas de littéral recréé), et `onClearFilters`/`onSelectTile` sont mémoïsés — sans ça,
// chaque frame de glissement fournirait une fonction fraîche à `TileBody` (mémoïsé par
// `React.memo`) et annulerait la mémoïsation : chaque tuile referait son agrégation.
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
import { SourcePicker } from './SourcePicker'
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
  items: Dashboard[]
  uid: string | null
  editing: boolean
  onToggleEdit: () => void
  canEdit: boolean
  onSelect: (id: string) => void
  onSelectPage: (id: string) => void
  /** Le bouton « Nouveau tableau de bord » de `BiScreen`, qui possède seul `onCreated`. */
  headerAction?: ReactNode
}

export function BiBoard({
  current, page, items, uid, editing, onToggleEdit, canEdit, onSelect, onSelectPage, headerAction,
}: BiBoardProps) {
  const { t } = useTranslation()
  const act = useBoardActions(uid, current, page.id)
  const draft = useLayoutDraft(page.layout, act.persistLayout)
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null)

  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex] ?? null
  // ⚠ MÊME condition que `useTileData`/`effectivePimSource` : une feuille sans colonne n'est
  // pas exploitable, le moteur se replie alors sur le catalogue master. La barre doit dire
  // ce que le moteur lit VRAIMENT, sinon elle ment sur le jeu de données.
  const hasSheet = sheet !== null && sheet.columns.length > 0
  const hasProducts = usePimStore((s) => s.products.length > 0)

  // ⚠⚠ Poser une tuile doit être ATOMIQUE du point de vue du rendu : la tuile et son
  // placement dans le même rendu. Voir `usePendingTiles` pour ce que coûtait le décalage.
  const { tiles, add: addPending } = usePendingTiles(page.tiles)
  // ⚠⚠ Source dérivée de la feuille active pour le PIM, registre pour la veille — le menu doit
  // proposer EXACTEMENT les champs que `useTileData` lira. Le hook déclenche au passage les
  // lectures réclamées par les tuiles POSÉES, jamais par la source seulement sélectionnée.
  const { sourceId, setSourceId, source, context, demanded } = useBoardSource(tiles, sheet)
  const watch = useWatchSourceState(sourceId)
  const onWatch = isWatchSource(sourceId)
  // ⚠ `null` plutôt que 0 quand rien n'est chargé : « 0 lignes » se lirait comme une source
  // vide, alors que personne ne l'a encore lue.
  const rowCount = onWatch ? (watch.rows.length || null) : hasSheet ? sheet.rows.length : null
  const updatedAt = onWatch ? watch.updatedAt : null
  const now = useTickingNow(true)

  // ⚠ `addPlacement` (et non `draft.setDraft`) : poser une tuile n'est pas un geste de
  // glissement, voir le commentaire de `useLayoutDraft.addPlacement` pour le pourquoi.
  // ⚠ `draft.layout`/`draft.addPlacement` plutôt que `draft` : cet objet est un littéral
  // RECRÉÉ à chaque rendu — le passer en entier annulerait la mémoïsation du rappel.
  const addTile = useAddTile({
    uid, current, pageId: page.id, tiles, layout: draft.layout, source, sourceId, onWatch,
    sheet, hasSheet, addPending, addPlacement: draft.addPlacement, onCreated: setSelectedTileId,
  })

  const selected = tiles.find((x) => x.id === selectedTileId) ?? null
  const onChangeKind = useCallback((kind: TileKind) => {
    if (selectedTileId) act.setTileKind(tiles, selectedTileId, kind)
  }, [act, tiles, selectedTileId])
  const onAddPage = useCallback(() => onSelectPage(act.addPage().id), [act, onSelectPage])

  return (
    <>
      <BiTopBar
        current={current} items={items} canEdit={canEdit} onSelectBoard={onSelect}
        onRename={act.rename} updatedAt={updatedAt} now={now}
        sourcePicker={<SourcePicker context={context} demanded={demanded} sourceId={sourceId} onSourceChange={setSourceId} />}
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
            /* ⚠ Le geste, jamais le seul état local `editing` : un droit révoqué en cours de
               session doit faire disparaître le menu à l'identique du bouton et du raccourci. */
            trailing={editing && canEdit ? <AddTileMenu source={source} onAdd={addTile} /> : undefined}
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
        pages={current.pages} activeId={page.id} onSelect={onSelectPage}
        onAdd={onAddPage} canAdd={editing && canEdit}
        status={(
          <BiStatusBar
            sourceLabel={t(getSource(sourceId).labelKey)} rowCount={rowCount}
            updatedAt={updatedAt} now={now}
          />
        )}
      />
    </>
  )
}
