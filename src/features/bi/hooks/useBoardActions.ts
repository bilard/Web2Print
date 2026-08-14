// Les écritures d'un tableau de bord, sorties de `BiBoard` pour la tenir sous 150 lignes.
//
// ⚠⚠ Toutes passent par `replacePage`/`appendPage` (purs) puis par `saveDashboard`, qui
// valide : aucune ne compose un document à la main. Une page écrite de travers ne serait
// détectée qu'à la relecture, c'est-à-dire une fois le contenu déjà perdu.
//
// ⚠ `t` est volontairement hors des dépendances : la fermeture est RECRÉÉE à chaque rendu,
// et l'inclure recréerait chaque rappel — ce qui romprait la mémoïsation de `DashboardGrid`
// que `BiBoard` existe pour préserver. Ces libellés ne servent qu'à un message d'erreur ou à
// un nom par défaut, jamais pendant un geste.
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { saveDashboard } from '../store/dashboardsStore'
import { appendPage, replacePage, type Dashboard, type DashboardPage, type FilterClause, type Tile, type TileKind, type TilePlacement } from '../types'

export function useBoardActions(uid: string | null, current: Dashboard, pageId: string) {
  const { t } = useTranslation()

  const write = useCallback((next: Dashboard) => {
    // ⚠ Un refus d'écriture doit se VOIR : sans règle Firestore, l'échec est silencieux.
    if (!uid) { toast.error(t('bi.save.failed')); return }
    saveDashboard(uid, next).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    })
  }, [uid])

  /** Mise en page de la page COURANTE, au relâchement d'un geste. */
  const persistLayout = useCallback((layout: TilePlacement[]) => {
    write(replacePage(current, pageId, { layout }))
  }, [write, current, pageId])

  const persistFilters = useCallback((filters: FilterClause[]) => {
    write({ ...current, filters })
  }, [write, current])

  /** Retire les filtres globaux — le geste proposé par une tuile vide. */
  const clearFilters = useCallback(() => persistFilters([]), [persistFilters])

  const rename = useCallback((name: string) => write({ ...current, name }), [write, current])

  const addPage = useCallback((): DashboardPage => {
    const next = appendPage(current, t('bi.page.defaultName', { n: current.pages.length + 1 }))
    write(next)
    return next.pages[next.pages.length - 1]
  }, [write, current])

  /**
   * Change le TYPE du visuel sélectionné. ⚠ La requête reste intacte : c'est la même mesure
   * et la même dimension rendues autrement. Seul le tableau croisé exige deux dimensions, et
   * `PivotTile` le dit déjà de lui-même plutôt que de rendre un chiffre faux.
   */
  const setTileKind = useCallback((tiles: Tile[], tileId: string, kind: TileKind) => {
    const next: Tile[] = tiles.map((x) => (x.id === tileId ? { ...x, kind } : x))
    write(replacePage(current, pageId, { tiles: next }))
  }, [write, current, pageId])

  return { write, persistLayout, persistFilters, clearFilters, rename, addPage, setTileKind }
}
