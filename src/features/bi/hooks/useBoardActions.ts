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
import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { saveDashboard } from '../store/dashboardsStore'
import { appendPage, replacePage, type Dashboard, type DashboardPage, type FilterClause, type Tile, type TilePlacement } from '../types'

export function useBoardActions(uid: string | null, current: Dashboard, pageId: string) {
  const { t } = useTranslation()

  /**
   * ⚠⚠ Ce que l'écran montre RÉELLEMENT de la page courante.
   *
   * `saveDashboard` écrit avec `setDoc`, qui REMPLACE le document : TOUTE écriture réécrit
   * donc les pages, y compris celle qu'elle ne prétend pas toucher. Or `current` vient de
   * l'abonnement Firestore et retarde d'un aller-retour — renommer juste après un
   * déplacement remettait la tuile à sa place d'avant, et juste après une reconfiguration
   * lui rendait sa requête d'avant. Même famille que les défauts vus en recette sur
   * `setTileKind` et sur le clic qui déclenche `onDragStop`.
   */
  const live = useRef<{ pageId: string; tiles: Tile[]; layout: TilePlacement[] } | null>(null)

  /**
   * Publie l'état affiché de la page courante. `BiBoard` l'appelle dans un effet, à chaque
   * rendu : c'est la seule voie qui voie AUSSI les écritures faites hors de ce hook
   * (`useTileEdits`, `useAddTile`), lesquelles laissent `current` en retard tout autant.
   *
   * ⚠ Référence STABLE : elle ne recrée aucun rappel, donc ne casse pas la mémoïsation de
   * `DashboardGrid` que ce hook existe pour préserver.
   */
  const trackPage = useCallback((tiles: Tile[], layout: TilePlacement[]) => {
    live.current = { pageId, tiles, layout }
  }, [pageId])

  /**
   * Le document tel qu'il faut l'ÉCRIRE : `current` recousu avec ce que l'écran montre.
   *
   * ⚠ Le `pageId` publié est vérifié : `BiBoard` est remontée à chaque changement de page,
   * mais une publication venue d'une autre page ne doit jamais atterrir sur celle-ci.
   */
  const fresh = useCallback((pages?: DashboardPage[]): Dashboard => {
    const base = pages
      ? { ...current, pages, tiles: pages[0].tiles, layout: pages[0].layout }
      : current
    const p = live.current
    if (!p || p.pageId !== pageId) return base
    return replacePage(base, pageId, { tiles: p.tiles, layout: p.layout })
  }, [current, pageId])

  const write = useCallback((next: Dashboard) => {
    // ⚠ Un refus d'écriture doit se VOIR : sans règle Firestore, l'échec est silencieux.
    if (!uid) { toast.error(t('bi.save.failed')); return }
    saveDashboard(uid, next).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
    })
  }, [uid])

  /**
   * Mise en page de la page COURANTE, au relâchement d'un geste.
   *
   * ⚠⚠ Les TUILES sont fournies par l'appelant et réécrites avec — jamais laissées à celles
   * de `current`. Vu en recette : un simple CLIC sur une tuile déclenche le `onDragStop` de
   * `react-grid-layout` (poignée pressée puis relâchée sans mouvement), donc cette écriture ;
   * `current` vient de l'abonnement Firestore et retarde d'un aller-retour, si bien qu'un
   * champ tout juste déposé était RÉÉCRIT À L'ANCIEN par le clic suivant, sans un mot. Le
   * mal est symétrique de celui que documentait `setTileKind` pour la mise en page.
   */
  const persistLayout = useCallback((layout: TilePlacement[], tiles: Tile[]) => {
    // ⚠ La publication est rafraîchie AVANT l'écriture : `undo`/`redo` appellent ce rappel de
    // façon SYNCHRONE, avant tout re-rendu — l'effet de `BiBoard` n'a donc pas encore
    // republié, et une écriture enchaînée repartirait de l'état d'avant l'annulation.
    live.current = { pageId, tiles, layout }
    const next = replacePage(current, pageId, { layout, tiles })
    // ⚠⚠ `replacePage` rend le document INCHANGÉ (même référence) quand la page visée n'y est
    // plus — un tableau rouvert ailleurs, une page supprimée d'un autre poste. L'écriture
    // partait alors quand même, réécrivait à l'identique, et le placement semblait « ne pas
    // se sauvegarder » sans le moindre message. Ce projet a déjà payé plusieurs écritures
    // perdues en silence : celle-ci se voit.
    if (next === current) { toast.error(t('bi.save.pageGone')); return }
    write(next)
  }, [write, current, pageId])

  const persistFilters = useCallback((filters: FilterClause[]) => {
    write({ ...fresh(), filters })
  }, [write, fresh])

  /** Retire les filtres globaux — le geste proposé par une tuile vide. */
  const clearFilters = useCallback(() => persistFilters([]), [persistFilters])

  // ⚠⚠ `fresh()` et non `current` : renommer ne PRÉTEND toucher à aucune page, mais `setDoc`
  // les réécrit toutes. Sans ce recousage, renommer juste après un déplacement remettait la
  // tuile à sa place d'avant — et juste après une reconfiguration, lui rendait sa requête
  // d'avant. Un geste anodin ne doit jamais défaire le geste précédent.
  const rename = useCallback((name: string) => {
    const next = fresh()
    // ⚠⚠ Une page UNIQUE porte le nom du tableau : la page reconstituée d'un document
    // ancien prend déjà `d.name` (cf. `parseDashboard`), mais dès qu'une écriture a figé
    // `pages`, elle gardait son nom d'origine. Vu à l'écran : un tableau renommé
    // « GSB 2026 » dont l'onglet annonçait toujours « Sans titre ».
    const pages = next.pages && next.pages.length === 1
      ? [{ ...next.pages[0], name }]
      : next.pages
    write({ ...next, name, ...(pages ? { pages } : {}) })
  }, [write, fresh])

  /**
   * Retient la BASE du module « Données » qui alimente ce tableau de bord.
   *
   * ⚠ `undefined` efface le choix : `saveDashboard` écrit avec `setDoc`, qui REMPLACE le
   * document, et `stripUndefined` retire le champ — le tableau retombe alors sur la feuille
   * active, exactement comme les tableaux enregistrés avant ce champ.
   */
  const setSourceDb = useCallback((dbId?: string, dbName?: string) => {
    write({ ...fresh(), sourceDbId: dbId, sourceDbName: dbName })
  }, [write, fresh])

  /**
   * Ajoute une page vide et la RETOURNE, pour que l'appelant l'affiche sans attendre l'écho.
   *
   * ⚠⚠ `pages` est fourni par l'appelant plutôt que lu dans `current` : entre le clic et
   * l'écho Firestore, `current` ne porte pas encore la page qu'on vient d'ajouter. La lire
   * ici ferait retomber un second clic sur le MÊME identifiant — et l'écriture suivante
   * effacerait la page précédente sans un mot.
   */
  const addPage = useCallback((pages: DashboardPage[]): DashboardPage => {
    // ⚠ `fresh(pages)` : les pages viennent de l'appelant, mais la page COURANTE y est
    // recousue avec ce que l'écran montre — ajouter un onglet ne doit pas défaire le
    // déplacement ni la reconfiguration qu'on vient de faire sur celle qu'on quitte.
    const next = appendPage(fresh(pages), t('bi.page.defaultName', { n: pages.length + 1 }))
    write(next)
    return next.pages[next.pages.length - 1]
  }, [write, fresh])

  /**
   * Retire une tuile de la page — et rend de quoi la REMETTRE.
   *
   * ⚠⚠ Les tuiles et la mise en page viennent de l'appelant, jamais de `current` : entre le
   * geste et l'écho Firestore, `current` retarde d'un aller-retour, et supprimer depuis lui
   * ressusciterait la tuile qu'on vient d'ajouter ou déplacerait celles qu'on vient de
   * bouger. Même mal que celui documenté sur `persistLayout`.
   *
   * ⚠⚠ La tuile part AVEC son placement. Laisser le placement orphelin ne se verrait pas
   * tout de suite — `react-grid-layout` ignore une case sans tuile — mais réserverait un
   * trou dans la grille que plus rien ne remplirait.
   */
  const removeTile = useCallback((
    tileId: string, tiles: Tile[], layout: TilePlacement[],
  ): (() => void) | null => {
    if (!tiles.some((x) => x.id === tileId)) return null
    const nextTiles = tiles.filter((x) => x.id !== tileId)
    const nextLayout = layout.filter((l) => l.tileId !== tileId)
    live.current = { pageId, tiles: nextTiles, layout: nextLayout }
    write(replacePage(current, pageId, { tiles: nextTiles, layout: nextLayout }))
    // Restauration : on réécrit l'état d'AVANT, tel qu'il était au moment du geste. Une
    // suppression sans retour en arrière se paie d'une tuile à reconstruire de zéro.
    return () => {
      live.current = { pageId, tiles, layout }
      write(replacePage(current, pageId, { tiles, layout }))
    }
  }, [write, current, pageId])

  /**
   * Fait changer de SOURCE les tuiles qui le peuvent, et rend de quoi revenir en arrière.
   *
   * ⚠ Les tuiles viennent de l'appelant — ce que l'écran montre —, jamais de `current` : le
   * document retarde d'un aller-retour, et écrire depuis lui défait le geste précédent.
   */
  const retarget = useCallback((next: Tile[], layout: TilePlacement[], before: Tile[]) => {
    live.current = { pageId, tiles: next, layout }
    write(replacePage(current, pageId, { tiles: next, layout }))
    return () => {
      live.current = { pageId, tiles: before, layout }
      write(replacePage(current, pageId, { tiles: before, layout }))
    }
  }, [write, current, pageId])

  // ⚠⚠ Changer le type d'un visuel n'est PLUS ici : c'est devenu un geste du constructeur
  // (`retypeTile` + `useTileEdits`), pour trois raisons qui tiennent ensemble — la requête
  // doit être remise d'aplomb avec le type (un indicateur ne garde pas d'axe, sous peine
  // d'afficher la première ligne d'un regroupement comme si c'était le total), la tuile doit
  // changer AU CLIC plutôt qu'à l'écho de la base, et le geste doit être annulable par les
  // mêmes flèches que le reste.

  // ⚠ `write` n'est PAS rendu : c'était l'échappatoire générique par laquelle un appelant
  // pouvait réécrire le document sans passer par `fresh()` — donc réintroduire le défaut.
  return {
    trackPage, persistLayout, persistFilters, clearFilters, rename, setSourceDb, addPage,
    removeTile, retarget,
  }
}
