// Les écritures d'un tableau de bord, sorties de `BiBoard` pour la tenir sous 150 lignes.
//
// ⚠⚠ Toutes passent par `replacePage`/`appendPage` (purs) puis par `saveDashboard`, qui
// valide : aucune ne compose un document à la main. Une page écrite de travers ne serait
// détectée qu'à la relecture, c'est-à-dire une fois le contenu déjà perdu.
//
// ⚠⚠ L'objet RENDU est un littéral recréé à chaque rendu ; seuls les rappels qu'il porte sont
// stables. On passe donc `act.clearFilters` à un composant mémoïsé, jamais `act` lui-même.
//
// ⚠ `t` est volontairement hors des dépendances : la fermeture est RECRÉÉE à chaque rendu,
// et l'inclure recréerait chaque rappel — ce qui romprait la mémoïsation de `DashboardGrid`
// que `BiBoard` existe pour préserver. Ces libellés ne servent qu'à un message d'erreur ou à
// un nom par défaut, jamais pendant un geste.
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { saveDashboard } from '../store/dashboardsStore'
import { appendPage, replacePage, type Dashboard, type DashboardPage, type FilterClause, type TilePlacement } from '../types'

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

  // ⚠ `{ ...current }` sans toucher aux pages : renommer ne réécrit AUCUNE mise en page,
  // donc rien à retarder — contrairement aux gestes du constructeur, qui en réécrivent une.
  const rename = useCallback((name: string) => write({ ...current, name }), [write, current])

  /**
   * Retient la BASE du module « Données » qui alimente ce tableau de bord.
   *
   * ⚠ `undefined` efface le choix : `saveDashboard` écrit avec `setDoc`, qui REMPLACE le
   * document, et `stripUndefined` retire le champ — le tableau retombe alors sur la feuille
   * active, exactement comme les tableaux enregistrés avant ce champ.
   */
  const setSourceDb = useCallback((dbId?: string, dbName?: string) => {
    write({ ...current, sourceDbId: dbId, sourceDbName: dbName })
  }, [write, current])

  /**
   * Ajoute une page vide et la RETOURNE, pour que l'appelant l'affiche sans attendre l'écho.
   *
   * ⚠⚠ `pages` est fourni par l'appelant plutôt que lu dans `current` : entre le clic et
   * l'écho Firestore, `current` ne porte pas encore la page qu'on vient d'ajouter. La lire
   * ici ferait retomber un second clic sur le MÊME identifiant — et l'écriture suivante
   * effacerait la page précédente sans un mot.
   */
  const addPage = useCallback((pages: DashboardPage[]): DashboardPage => {
    const next = appendPage({ ...current, pages }, t('bi.page.defaultName', { n: pages.length + 1 }))
    write(next)
    return next.pages[next.pages.length - 1]
  }, [write, current])

  // ⚠⚠ Changer le type d'un visuel n'est PLUS ici : c'est devenu un geste du constructeur
  // (`retypeTile` + `useTileEdits`), pour trois raisons qui tiennent ensemble — la requête
  // doit être remise d'aplomb avec le type (un indicateur ne garde pas d'axe, sous peine
  // d'afficher la première ligne d'un regroupement comme si c'était le total), la tuile doit
  // changer AU CLIC plutôt qu'à l'écho de la base, et le geste doit être annulable par les
  // mêmes flèches que le reste.

  return { write, persistLayout, persistFilters, clearFilters, rename, setSourceDb, addPage }
}
