// Poser une tuile : la seule voie de CRÉATION du module. Sortie de `BiBoard` pour la tenir
// sous la limite de 150 lignes — et parce que c'est le seul geste du composant qui compose
// un titre, une requête ET une écriture d'un coup.
import { useCallback } from 'react'
import { toast } from 'sonner'
import type { ExcelSheet } from '@/features/excel/types'
import { useTranslation } from '@/lib/i18n'
import { saveDashboard } from '../store/dashboardsStore'
import { newTile, placeTile } from '../engine/newTile'
import { biLabel } from '../components/biLabel'
import type { DataSource } from '../registry/types'
import { measureKey, replacePage, type Dashboard, type MeasureRef, type SourceId, type Tile, type TileKind, type TilePlacement } from '../types'

interface AddTileContext {
  uid: string | null
  current: Dashboard
  pageId: string
  /** Tuiles COMPOSÉES (`usePendingTiles`) : deux ajouts rapprochés, avant tout écho de la
   *  base, perdraient sinon le premier. */
  tiles: Tile[]
  layout: TilePlacement[]
  source: DataSource
  sourceId: SourceId
  /** La source lit-elle la veille ? Alors la feuille active n'a rien à voir avec ces chiffres. */
  onWatch: boolean
  sheet: ExcelSheet | null
  hasSheet: boolean
  addPending: (tile: Tile) => void
  addPlacement: (layout: TilePlacement[]) => void
  onCreated: (tileId: string) => void
}

export function useAddTile(ctx: AddTileContext) {
  const { t } = useTranslation()
  const {
    uid, current, pageId, tiles, layout, source, sourceId, onWatch,
    sheet, hasSheet, addPending, addPlacement, onCreated,
  } = ctx

  return useCallback((
    kind: TileKind, measure: MeasureRef, dimensionId?: string, columnDimensionId?: string,
  ) => {
    // ⚠ Un refus muet laisserait croire que le clic n'a rien fait, plutôt que de dire que
    // l'espace de travail n'est pas encore prêt.
    if (!uid) { toast.error(t('bi.save.failed')); return }
    const tile = newTile(kind, sourceId, measure, dimensionId, columnDimensionId)
    // ⚠ Le titre nomme la mesure comme le menu la nommait : une mesure DÉRIVÉE porte son
    // agrégation ET sa colonne (« Somme · Prix »).
    const found = source.measures.find((m) => m.id === measureKey({ ...measure, alias: undefined }))
    const measureLabel = found ? biLabel(found, t) : t('bi.add.measure')
    const dim = dimensionId ? source.dimensions.find((d) => d.id === dimensionId) : undefined
    tile.title = dim
      ? t('bi.add.defaultTitle', { measure: measureLabel, dimension: dim.label ?? t(dim.labelKey) })
      : t('bi.add.defaultTitleKpi', { measure: measureLabel })
    const next = placeTile(layout, tile.id, kind)
    // ⚠⚠ Les trois dans le MÊME gestionnaire : React les regroupe en un seul rendu, et la
    // grille reçoit la tuile, son placement et sa sélection ensemble.
    addPending(tile)
    addPlacement(next)
    onCreated(tile.id)
    // ⚠⚠ Feuille mémorisée à la POSE DE LA PREMIÈRE TUILE, jamais à la création, et jamais
    // pour une source de VEILLE : celle-ci ne lit pas la feuille active.
    saveDashboard(uid, {
      ...replacePage(current, pageId, { tiles: [...tiles, tile], layout: next }),
      sourceSheetName: current.sourceSheetName ?? (!onWatch && hasSheet && sheet ? sheet.name : undefined),
    }).catch((e: unknown) => toast.error(e instanceof Error ? e.message : t('bi.save.failed')))
    // ⚠ `t` hors dépendances À DESSEIN : fermeture recréée à chaque rendu, elle romprait la
    // mémoïsation que `DashboardGrid` exige de tout ce que `BiBoard` lui transmet.
  }, [uid, current, pageId, tiles, layout, source, sourceId, onWatch, sheet, hasSheet,
    addPending, addPlacement, onCreated])
}
