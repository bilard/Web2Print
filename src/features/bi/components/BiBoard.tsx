// Corps du module BI pour UN tableau de bord donné : toolbar (dont annulation/rétablissement)
// et grille. `BiScreen` la monte avec `key={current.id}` : voir son en-tête pour le pourquoi.
//
// ⚠ Références stables vers `DashboardGrid` : `current.tiles`/`current.filters` viennent tels
// quels du parent (pas de littéral recréé), et `onClearFilters` est mémoïsé par `useCallback` —
// sans ça, chaque frame de glissement (mise à jour de `draft.layout`, donc re-rendu de ce
// composant) fournirait une fonction fraîche à `TileBody`, mémoïsé par `React.memo` côté
// `DashboardGrid`, et annulerait la mémoïsation : chaque tuile referait son agrégation pendant
// le geste.
import { useCallback, useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { useLayoutDraft } from '../hooks/useLayoutDraft'
import { saveDashboard } from '../store/dashboardsStore'
import { newTile, placeTile } from '../engine/newTile'
import { effectivePimSource } from '../registry/pim.source'
import { AddTileMenu } from './AddTileMenu'
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

  // ⚠ `t` (issu de `useTranslation`) est une fonction RECRÉÉE à chaque rendu (voir
  // `lib/i18n/index.ts`) : l'inclure ici recréerait `persist`/`persistFilters` — et donc
  // `onClearFilters` — à chaque rendu, et romprait la mémoïsation de `DashboardGrid` que ce
  // composant existe justement pour préserver. Le seul usage de `t` est un message d'erreur
  // affiché au clic (jamais pendant un geste) : le lire au moment de l'appel plutôt que de le
  // capturer en dépendance ne coûte rien de réel — au pire un libellé dans l'ancienne langue si
  // l'utilisateur change de langue entre-temps.
  const persist = useCallback((layout: TilePlacement[]) => {
    if (!uid) return
    saveDashboard(uid, { ...current, layout }).catch((e: unknown) => {
      // ⚠ Un refus d'écriture doit se VOIR : sans règle Firestore, l'échec est silencieux.
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    })
  }, [uid, current])
  const draft = useLayoutDraft(current.layout, persist)

  // ⚠⚠ Source DÉRIVÉE de la feuille active (module Données) — jamais le registre statique :
  // c'est elle que `useTileData` consulte réellement (cf. `pim.source.ts`). Le menu doit
  // proposer EXACTEMENT les mêmes dimensions/mesures, sous peine de tuiles créées en erreur.
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex] ?? null
  const source = useMemo(() => effectivePimSource(sheet), [sheet])

  // ⚠ `addPlacement` (et non `draft.setDraft`) : poser une tuile n'est pas un geste de
  // glissement, voir le commentaire de `useLayoutDraft.addPlacement` pour le pourquoi.
  const addTile = useCallback((kind: TileKind, measureId: string, dimensionId?: string) => {
    // ⚠ Seule voie de CRÉATION du module : un refus muet laisserait croire que le clic n'a
    // rien fait, plutôt que de dire que l'espace de travail n'est pas encore prêt.
    if (!uid) { toast.error(t('bi.save.failed')); return }
    const tile = newTile(kind, 'pim.products', measureId, dimensionId)
    const measureLabel = t(source.measures.find((m) => m.id === measureId)?.labelKey ?? 'bi.add.measure')
    const dim = dimensionId ? source.dimensions.find((d) => d.id === dimensionId) : undefined
    // Le titre par défaut nomme la mesure ET la dimension : « Nombre de produits par
    // Univers » se lit, « Sans titre » non. `dim?.label` prime sur `labelKey` : une colonne
    // de feuille porte son nom dans la donnée, pas dans le catalogue i18n.
    tile.title = dim
      ? t('bi.add.defaultTitle', { measure: measureLabel, dimension: dim.label ?? t(dim.labelKey) })
      : t('bi.add.defaultTitleKpi', { measure: measureLabel })
    const layout = placeTile(draft.layout, tile.id, kind)
    draft.addPlacement(layout)
    saveDashboard(uid, { ...current, tiles: [...current.tiles, tile], layout })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : t('bi.save.failed')))
    // ⚠ `draft.layout`/`draft.addPlacement` plutôt que `draft` : l'objet retourné par
    // `useLayoutDraft` est un littéral RECRÉÉ à chaque rendu (contrairement à `addPlacement`,
    // mémoïsé lui) — le dépendre en entier annulerait toute mémoïsation de ce callback.
  }, [uid, current, source, draft.layout, draft.addPlacement, t])

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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">{t('bi.screen.title')}</h1>
            <p className="text-sm text-white/50">{t('bi.screen.intro')}</p>
          </div>
          {headerAction}
        </div>
        <BiToolbar
          items={items} currentId={current.id} onSelect={onSelect}
          editing={editing} onToggleEdit={onToggleEdit} canEdit={canEdit}
          undo={draft.undo} redo={draft.redo} canUndo={draft.canUndo} canRedo={draft.canRedo}
        />
      </header>

      {/* ⚠ Le geste, jamais le seul état local `editing` : un droit révoqué en cours de
          session (cf. `BiScreen`) doit faire disparaître le menu à l'identique du bouton et
          du raccourci clavier — pas de fenêtre où un rôle consultation seule pourrait écrire. */}
      {editing && canEdit && <AddTileMenu source={source} onAdd={addTile} />}

      <DashboardGrid
        tiles={current.tiles}
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
