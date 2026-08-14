// Corps du module BI pour UN tableau de bord donné : toolbar (dont annulation/rétablissement)
// et grille. `BiScreen` la monte avec `key={current.id}` : voir son en-tête pour le pourquoi.
//
// ⚠ Références stables vers `DashboardGrid` : `current.tiles`/`current.filters` viennent tels
// quels du parent (pas de littéral recréé), et `onClearFilters` est mémoïsé par `useCallback` —
// sans ça, chaque frame de glissement (mise à jour de `draft.layout`, donc re-rendu de ce
// composant) fournirait une fonction fraîche à `TileBody`, mémoïsé par `React.memo` côté
// `DashboardGrid`, et annulerait la mémoïsation : chaque tuile referait son agrégation pendant
// le geste.
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useLayoutDraft } from '../hooks/useLayoutDraft'
import { saveDashboard } from '../store/dashboardsStore'
import { BiToolbar } from './BiToolbar'
import { DashboardGrid } from './DashboardGrid'
import { useTranslation } from '@/lib/i18n'
import type { Dashboard, FilterClause, TilePlacement } from '../types'

interface BiBoardProps {
  current: Dashboard
  items: Dashboard[]
  uid: string | null
  width: number
  editing: boolean
  onToggleEdit: () => void
  canEdit: boolean
  onSelect: (id: string) => void
}

export function BiBoard({ current, items, uid, width, editing, onToggleEdit, canEdit, onSelect }: BiBoardProps) {
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
        <div>
          <h1 className="text-xl font-semibold text-white">{t('bi.screen.title')}</h1>
          <p className="text-sm text-white/50">{t('bi.screen.intro')}</p>
        </div>
        <BiToolbar
          items={items} currentId={current.id} onSelect={onSelect}
          editing={editing} onToggleEdit={onToggleEdit} canEdit={canEdit}
          undo={draft.undo} redo={draft.redo} canUndo={draft.canUndo} canRedo={draft.canRedo}
        />
      </header>

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
