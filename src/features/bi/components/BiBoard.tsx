// Corps du module BI pour UN tableau de bord donné : toolbar (dont annulation/rétablissement)
// et grille. `BiScreen` la monte avec `key={current.id}` : voir son en-tête pour le pourquoi.
//
// ⚠ Références stables vers `DashboardGrid` : `tiles`/`current.filters` viennent tels quels
// du parent (pas de littéral recréé), et `onClearFilters` est mémoïsé — sans ça, chaque frame
// de glissement fournirait une fonction fraîche à `TileBody` (mémoïsé par `React.memo`) et
// annulerait la mémoïsation : chaque tuile referait son agrégation pendant le geste.
import { useCallback, useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'
import { useLayoutDraft } from '../hooks/useLayoutDraft'
import { usePendingTiles } from '../hooks/usePendingTiles'
import { saveDashboard } from '../store/dashboardsStore'
import { newTile, placeTile } from '../engine/newTile'
import { effectivePimSource } from '../registry/pim.source'
import { AddTileMenu } from './AddTileMenu'
import { BiBoardHeader } from './BiBoardHeader'
import { BiToolbar } from './BiToolbar'
import { DashboardGrid } from './DashboardGrid'
import { useTranslation } from '@/lib/i18n'
import type { Dashboard, FilterClause, TileKind, TilePlacement } from '../types'

interface BiBoardProps {
  current: Dashboard
  items: Dashboard[]
  uid: string | null
  width: number
  editing: boolean
  onToggleEdit: () => void
  canEdit: boolean
  onSelect: (id: string) => void
  /** Placé à côté du titre — le bouton « Nouveau tableau de bord » de `BiScreen`, qui
   *  possède seul `onCreated`. Optionnel : `BiBoard` reste utilisable sans (tests). */
  headerAction?: ReactNode
}

export function BiBoard({
  current, items, uid, width, editing, onToggleEdit, canEdit, onSelect, headerAction,
}: BiBoardProps) {
  const { t } = useTranslation()

  // ⚠ `t` est RECRÉÉE à chaque rendu (`lib/i18n/index.ts`) : l'inclure en dépendance
  // recréerait `persist`/`persistFilters` — donc `onClearFilters` — à chaque rendu, et
  // romprait la mémoïsation de `DashboardGrid` que ce composant existe pour préserver. Son
  // seul usage est un message d'erreur affiché au clic, jamais pendant un geste : la lire au
  // moment de l'appel ne coûte au pire qu'un libellé dans l'ancienne langue.
  const persist = useCallback((layout: TilePlacement[]) => {
    if (!uid) return
    saveDashboard(uid, { ...current, layout }).catch((e: unknown) => {
      // ⚠ Un refus d'écriture doit se VOIR : sans règle Firestore, l'échec est silencieux.
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    })
  }, [uid, current])
  const draft = useLayoutDraft(current.layout, persist)

  // ⚠⚠ Source DÉRIVÉE de la feuille active — jamais le registre statique : c'est elle que
  // `useTileData` lit. Le menu doit proposer EXACTEMENT les mêmes champs, sinon tuile en erreur.
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex] ?? null
  const source = useMemo(() => effectivePimSource(sheet), [sheet])
  // ⚠ MÊME condition que `useTileData`/`effectivePimSource` : une feuille sans colonne n'est
  // pas exploitable, le moteur se replie alors sur le catalogue master. L'en-tête doit dire
  // ce que le moteur lit VRAIMENT, sinon il ment sur le jeu de données.
  const hasSheet = sheet !== null && sheet.columns.length > 0
  const hasProducts = usePimStore((s) => s.products.length > 0)

  // ⚠⚠ Poser une tuile doit être ATOMIQUE du point de vue du rendu : la tuile et son
  // placement dans le même rendu. Voir `usePendingTiles` pour ce que coûtait le décalage.
  const { tiles, add: addPending } = usePendingTiles(current.tiles)

  // ⚠ `addPlacement` (et non `draft.setDraft`) : poser une tuile n'est pas un geste de
  // glissement, voir le commentaire de `useLayoutDraft.addPlacement` pour le pourquoi.
  const addTile = useCallback((
    kind: TileKind, measureId: string, dimensionId?: string, columnDimensionId?: string,
  ) => {
    // ⚠ Seule voie de CRÉATION du module : un refus muet laisserait croire que le clic n'a
    // rien fait, plutôt que de dire que l'espace de travail n'est pas encore prêt.
    if (!uid) { toast.error(t('bi.save.failed')); return }
    const tile = newTile(kind, 'pim.products', measureId, dimensionId, columnDimensionId)
    const measureLabel = t(source.measures.find((m) => m.id === measureId)?.labelKey ?? 'bi.add.measure')
    const dim = dimensionId ? source.dimensions.find((d) => d.id === dimensionId) : undefined
    // Le titre nomme la mesure ET la dimension. `dim?.label` prime sur `labelKey` : une
    // colonne de feuille porte son nom dans la donnée, pas dans le catalogue i18n.
    tile.title = dim
      ? t('bi.add.defaultTitle', { measure: measureLabel, dimension: dim.label ?? t(dim.labelKey) })
      : t('bi.add.defaultTitleKpi', { measure: measureLabel })
    const layout = placeTile(draft.layout, tile.id, kind)
    // ⚠⚠ Les deux dans le MÊME gestionnaire : React les regroupe en un seul rendu, et la
    // grille reçoit la tuile et son placement ensemble. C'est tout l'objet du correctif.
    addPending(tile)
    draft.addPlacement(layout)
    // ⚠ `tiles` (composé), pas `current.tiles` : deux ajouts rapprochés, avant tout écho de
    // la base, perdraient sinon le premier.
    // ⚠⚠ Feuille mémorisée à la POSE DE LA PREMIÈRE TUILE, jamais à la création : créé avec
    // la feuille A active mais bâti sur la B, le tableau avertirait à tort. Une fois posée,
    // la valeur ne bouge plus — c'est elle qui fait foi pour l'avertissement.
    saveDashboard(uid, {
      ...current, tiles: [...tiles, tile], layout,
      sourceSheetName: current.sourceSheetName ?? (hasSheet ? sheet.name : undefined),
    })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : t('bi.save.failed')))
    // ⚠ `draft.layout`/`draft.addPlacement` plutôt que `draft` : cet objet est un littéral
    // RECRÉÉ à chaque rendu — le dépendre en entier annulerait la mémoïsation du callback.
  }, [uid, current, tiles, hasSheet, sheet, source, draft.layout, draft.addPlacement, addPending, t])

  const persistFilters = useCallback((filters: FilterClause[]) => {
    if (!uid) return
    saveDashboard(uid, { ...current, filters }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    })
  }, [uid, current])
  /** Retire les filtres globaux — le geste proposé par une tuile vide. */
  const onClearFilters = useCallback(() => persistFilters([]), [persistFilters])

  return (
    <>
      <BiBoardHeader
        headerAction={headerAction}
        activeSheetName={hasSheet ? sheet.name : undefined}
        usesMasterCatalogue={!hasSheet && hasProducts}
        builtOnSheetName={current.sourceSheetName}
        toolbar={(
          <BiToolbar
            items={items} currentId={current.id} onSelect={onSelect}
            editing={editing} onToggleEdit={onToggleEdit} canEdit={canEdit}
            undo={draft.undo} redo={draft.redo} canUndo={draft.canUndo} canRedo={draft.canRedo}
          />
        )}
      />

      {/* ⚠ Le geste, jamais le seul état local `editing` : un droit révoqué en cours de
          session (cf. `BiScreen`) doit faire disparaître le menu à l'identique du bouton et
          du raccourci clavier — pas de fenêtre où un rôle consultation seule pourrait écrire. */}
      {editing && canEdit && <AddTileMenu source={source} onAdd={addTile} />}

      <DashboardGrid
        tiles={tiles}
        layout={draft.layout}
        editing={editing}
        width={width}
        globalFilters={current.filters}
        onDrag={draft.setDraft}
        onCommit={draft.commit}
        onClearFilters={onClearFilters}
      />
    </>
  )
}
