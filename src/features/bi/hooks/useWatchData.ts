// Chargement des sources « veille tarifaire » du module BI, et sélection du suivi actif.
//
// ⚠⚠ RIEN ne se charge tant qu'aucune tuile ne réclame la source. Le catalogue source de F1
// pèse 115 814 produits relus par tranches, les fiches d'un concurrent plusieurs Mo : les
// charger « au cas où » à l'ouverture du module figerait l'onglet pour qui ne veut qu'un
// compteur. C'est `useWatchLoader(demandées)` — appelé UNE fois par le tableau de bord, avec
// la liste des sources RÉELLEMENT citées par ses tuiles — qui déclenche les lectures.
//
// ⚠⚠ Un seul concurrent en mémoire à la fois (contrainte dure, cf. `useSiteExplorer.ts`) :
// changer de concurrent VIDE les fiches précédentes avant de lire les suivantes.
//
// ⚠ L'état vit dans un store de module et non dans le tableau de bord : `useTileData` est
// appelé au fond de la grille (`DashboardGrid` → `TileBody`), hors de portée d'une prop.
import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import type { ExcelSheet } from '@/features/excel/types'
import { loadSourceCatalog } from '@/features/priceWatch/reportStore'
import { loadAllListings } from '@/features/priceWatch/catalog/store'
import { useCatalogReport, useWatchList, type WatchSummary } from '@/features/priceWatch/useCatalogReport'
import type { StoredReport } from '@/features/priceWatch/reportStore'
import { debugLog } from '@/lib/debugLog'
import type { Row } from '../registry/types'
import { catalogRows, listingRows, summaryRows } from '../registry/watch.source'
import { effectivePimSource } from '../registry/pim.source'
import { getSource } from '../registry/sources'
import type { BiMessage, SourceId, Tile } from '../types'

/** Les trois sources de la veille. `watch.listings` (lot 1, jamais branchée) n'en est pas. */
const WATCH_SOURCE_IDS = ['watch.summary', 'watch.catalog', 'watch.site'] as const
export type WatchSourceId = (typeof WATCH_SOURCE_IDS)[number]

export function isWatchSource(id: SourceId): id is WatchSourceId {
  return (WATCH_SOURCE_IDS as readonly string[]).includes(id)
}

export interface WatchSourceState {
  rows: Row[]
  /** État TEL QUE la tuile doit le rendre. `idle` = personne ne réclame encore la source. */
  state: 'idle' | 'loading' | 'empty' | 'error' | 'ready'
  /** Cause de l'état, en CLÉ : traduite au rendu (le moteur et les hooks sont muets). En état
   *  `ready`, c'est la RÉSERVE qui accompagne les chiffres (relevé incomplet), pas leur cause. */
  message?: BiMessage
  /** Avancement de la relecture : tranches lues, produits reçus / annoncés. */
  progress: { done: number; total: number; loaded: number; expected: number }
  updatedAt: number | null
}

const IDLE: WatchSourceState = {
  rows: [], state: 'idle', progress: { done: 0, total: 0, loaded: 0, expected: 0 }, updatedAt: null,
}

interface WatchStore {
  /** Suivi actif — celui que le sélecteur affiche et que toutes les sources interrogent. */
  watchId: string | null
  /** Concurrent choisi pour `watch.site`. Un seul, jamais deux (plusieurs Mo par site). */
  siteId: string | null
  data: Record<WatchSourceId, WatchSourceState>
  setWatchId: (id: string | null) => void
  setSiteId: (id: string | null) => void
  patch: (id: WatchSourceId, next: WatchSourceState) => void
}

const useWatchStore = create<WatchStore>((set) => ({
  watchId: null,
  siteId: null,
  data: { 'watch.summary': IDLE, 'watch.catalog': IDLE, 'watch.site': IDLE },
  // ⚠ Changer de suivi REMET les données à zéro : les garder afficherait les chiffres du
  // suivi précédent sous le nom du nouveau, ce qu'aucun libellé ne rattrape.
  //
  // ⚠⚠ …mais SEULEMENT sur un vrai changement. Re-choisir le suivi déjà actif vidait tout,
  // et RIEN ne le rechargeait : les effets de `useWatchLoader` ne repartent que si leurs
  // dépendances bougent, or ni `watchId` ni le rapport n'avaient changé. Résultat vu à
  // l'écran : toutes les tuiles figées en squelette, et un bandeau qui annonçait « rien
  // n'est chargé » pour des sources que les tuiles réclamaient pourtant.
  setWatchId: (watchId) => set((s) => (
    s.watchId === watchId ? {} : {
      watchId, siteId: null,
      data: { 'watch.summary': IDLE, 'watch.catalog': IDLE, 'watch.site': IDLE },
    }
  )),
  setSiteId: (siteId) => set((s) => (
    s.siteId === siteId ? {} : { siteId, data: { ...s.data, 'watch.site': IDLE } }
  )),
  patch: (id, next) => set((s) => ({ data: { ...s.data, [id]: next } })),
}))

/** Remet le store à l'état initial. Réservé aux tests : le store est un singleton de module,
 *  et une suite qui n'en repartirait pas hériterait du suivi de la précédente. */
export function resetWatchDataForTest(): void {
  useWatchStore.setState({
    watchId: null, siteId: null,
    data: { 'watch.summary': IDLE, 'watch.catalog': IDLE, 'watch.site': IDLE },
  })
}

/** Pose l'état d'une source. Réservé aux tests : en vrai, seul `useWatchLoader` écrit ici. */
export function setWatchStateForTest(id: WatchSourceId, next: WatchSourceState): void {
  useWatchStore.getState().patch(id, next)
}

/**
 * L'une au moins de ces sources n'a-t-elle RIEN de chargé ?
 *
 * ⚠ Un seul abonnement pour toute la liste : lire l'état source par source demanderait un
 * hook dans une boucle, ce que React interdit.
 */
export function useAnyWatchIdle(ids: readonly WatchSourceId[]): boolean {
  return useWatchStore((s) => ids.some((id) => s.data[id].state === 'idle'))
}

/**
 * Fraîcheur des données QUI ALIMENTENT l'écran — le plus récent relevé parmi les sources
 * réellement citées par les tuiles.
 *
 * ⚠⚠ Surtout PAS la source sélectionnée dans le bandeau : celle-ci ne décide que de la
 * PROCHAINE tuile posée. Le bandeau affichait « jamais relevé » dès qu'on regardait une
 * source non encore utilisée, alors que l'écran, lui, montrait des chiffres datés — un âge
 * qui parle d'autre chose que ce qu'on a sous les yeux ne se corrige par aucun libellé.
 */
export function useShownUpdatedAt(ids: readonly SourceId[]): number | null {
  const watched = ids.filter(isWatchSource)
  return useWatchStore((s) => {
    let latest: number | null = null
    for (const id of watched) {
      const at = s.data[id].updatedAt
      if (at != null && (latest === null || at > latest)) latest = at
    }
    return latest
  })
}

/** Suivi actif + concurrent choisi, et les gestes pour en changer (le sélecteur de source). */
export function useWatchSelection() {
  const watchId = useWatchStore((s) => s.watchId)
  const siteId = useWatchStore((s) => s.siteId)
  const setWatchId = useWatchStore((s) => s.setWatchId)
  const setSiteId = useWatchStore((s) => s.setSiteId)
  return { watchId, siteId, setWatchId, setSiteId }
}

/**
 * Ce qu'une tuile branchée sur la veille doit rendre. Lecture SEULE : aucun effet ici, sans
 * quoi vingt tuiles déclencheraient vingt relectures du même catalogue.
 *
 * Accepte n'importe quelle source pour rester appelable sans condition (règle des hooks) :
 * une source étrangère à la veille rend l'état inerte, que l'appelant ignore.
 */
export function useWatchSourceState(id: SourceId): WatchSourceState {
  return useWatchStore((s) => (isWatchSource(id) ? s.data[id] : IDLE))
}

/** Concurrents du suivi, tirés du rapport : c'est la liste que propose le sélecteur. */
interface WatchSite { siteId: string; domain: string }

function sitesOf(report: StoredReport | null): WatchSite[] {
  const sites = report?.sites ?? []
  return [...sites].sort((a, b) => a.domain.localeCompare(b.domain, 'fr'))
}

export interface WatchContext {
  watches: WatchSummary[]
  sites: WatchSite[]
  watchId: string | null
  siteId: string | null
}

/**
 * Ce que le tableau de bord doit savoir de sa source : celle des NOUVELLES tuiles (le
 * registre pour la veille, la source dérivée de la feuille active pour le PIM) et le
 * contexte de veille. Déclenche au passage les chargements réclamés par les tuiles POSÉES —
 * jamais par la source simplement SÉLECTIONNÉE : choisir « catalogue source » dans une liste
 * ne doit pas relire 115 814 produits tant qu'aucune tuile ne les regarde.
 */
export function useBoardSource(tiles: Tile[], sheet: ExcelSheet | null) {
  // ⚠ Amorcé sur la source des tuiles DÉJÀ POSÉES : rouvrir un tableau de veille sur
  // « Produits (PIM) » ferait mentir la liste sur ce qui alimente l'écran.
  const [sourceId, setSourceId] = useState<SourceId>(() => tiles[0]?.query.source ?? 'pim.products')
  const demanded = useMemo(() => tiles.map((t) => t.query.source), [tiles])
  const context = useWatchLoader(demanded)
  // ⚠⚠ `effectivePimSource` reste le point de décision UNIQUE pour le PIM : le menu doit
  // proposer EXACTEMENT les champs que `useTileData` connaîtra, sinon la tuile créée tombe
  // en erreur (« Dimension inconnue pour cette source »).
  const source = useMemo(
    () => (sourceId === 'pim.products' ? effectivePimSource(sheet) : getSource(sourceId)),
    [sourceId, sheet],
  )
  // ⚠⚠ `demanded` remonte au sélecteur : c'est ce qui ALIMENTE les tuiles, pas ce que la
  // liste affiche. Sans lui, un tableau de veille rouvert relirait 115 814 produits pendant
  // que le bandeau, resté sur la source sélectionnée, n'annoncerait rien — l'écran figé sans
  // explication que ce lot existe pour éviter.
  return { sourceId, setSourceId, source, context, demanded }
}

/**
 * Effets de chargement. À appeler UNE SEULE FOIS par tableau de bord, avec les sources que
 * ses tuiles citent — c'est cette liste qui autorise (ou non) les lectures coûteuses.
 *
 * Le rapport `reports/latest`, lui, est suivi dès qu'un suivi est actif : un document, lu en
 * direct (`onSnapshot`), qui donne aussi la liste des concurrents au sélecteur. C'est le seul
 * chargement qui ne se mérite pas, parce qu'il ne coûte rien.
 */
export function useWatchLoader(demanded: SourceId[]): WatchContext {
  const uid = useWorkspaceUid()
  const watches = useWatchList()
  const { watchId, siteId, setWatchId } = useWatchSelection()
  const patch = useWatchStore((s) => s.patch)
  const report = useCatalogReport(watchId)
  const sites = useMemo(() => sitesOf(report), [report])

  const wantsSummary = demanded.includes('watch.summary')
  // ⚠⚠ FILET : l'état de la synthèse est une DÉPENDANCE de son effet. S'il retombe à `idle`
  // par un chemin qu'on n'a pas prévu, l'effet republie au lieu de laisser les tuiles en
  // squelette perpétuel. Sans risque de boucle : l'effet n'écrit que `ready`/`empty`, donc
  // la dépendance se stabilise au premier passage. ⚠ Réservé à la synthèse — un catalogue
  // de 115 814 produits ne se relit pas « au cas où ».
  const summaryState = useWatchStore((s) => s.data['watch.summary'].state)
  const wantsCatalog = demanded.includes('watch.catalog')
  const wantsSite = demanded.includes('watch.site')

  // Suivi actif par défaut : le plus récemment mis à jour. Sans lui, l'utilisateur qui ajoute
  // une tuile de veille voit « aucun suivi » alors qu'il en a vingt-quatre.
  useEffect(() => {
    if (!watchId && watches.length > 0) setWatchId(watches[0].watchId)
  }, [watchId, watches, setWatchId])

  // ── watch.summary : le rapport, déjà en direct ────────────────────────────────────────
  useEffect(() => {
    if (!wantsSummary) { patch('watch.summary', IDLE); return }
    if (!watchId) {
      patch('watch.summary', { ...IDLE, state: 'empty', message: { kind: 'key', key: 'bi.watch.noWatch' } })
      return
    }
    if (!report) {
      patch('watch.summary', { ...IDLE, state: 'empty', message: { kind: 'key', key: 'bi.watch.noReport' } })
      return
    }
    const rows = summaryRows(report.byCompetitor)
    patch('watch.summary', {
      ...IDLE, rows, state: rows.length ? 'ready' : 'empty',
      message: rows.length ? undefined : { kind: 'key', key: 'bi.watch.noReport' },
      updatedAt: report.runAt ?? Date.now(),
    })
  }, [wantsSummary, watchId, report, patch, summaryState])

  // ── watch.catalog : relecture par TRANCHES, avancement publié ─────────────────────────
  useEffect(() => {
    // ⚠ Sortir de scène LIBÈRE les lignes : un catalogue de 115 814 produits n'a rien à
    // faire en mémoire quand plus aucune tuile ne le regarde.
    if (!wantsCatalog || !uid || !watchId) { patch('watch.catalog', IDLE); return }
    let cancelled = false
    patch('watch.catalog', { ...IDLE, state: 'loading' })
    debugLog('[bi-watch] relecture du catalogue source — début')
    loadSourceCatalog(uid, watchId, (done, total, expected) => {
      if (cancelled) return
      patch('watch.catalog', { ...IDLE, state: 'loading', progress: { done, total, loaded: 0, expected } })
    })
      .then((src) => {
        if (cancelled) return
        // Jamais écrit : le geste à faire, pas un cadre vide.
        if (!src) {
          patch('watch.catalog', { ...IDLE, state: 'empty', message: { kind: 'key', key: 'bi.watch.catalogAbsent' } })
          return
        }
        const progress = {
          done: 0, total: 0, loaded: src.products.length, expected: src.expected,
        }
        // ⚠⚠ Tranches manquantes = TOTAL SOUS-COMPTÉ. Les chiffres sont RENDUS QUAND MÊME,
        // avec leur réserve affichée à côté d'eux en permanence : « 87 412 fiches — relevé
        // incomplet » fait travailler, un écran qui refuse tout n'apprend rien et renvoie
        // l'acheteur vers l'ancien écran. La règle « aucun chiffre faux en silence » tient
        // par l'avertissement, pas par le refus — celui-ci reste pour ce qui est vraiment
        // inexploitable (catalogue jamais écrit, source illisible).
        if (src.partial) {
          console.warn('[bi-watch] catalogue source AMPUTÉ :', src.products.length, '/', src.expected)
        }
        const rows = catalogRows(src.products)
        debugLog('[bi-watch] catalogue source', rows.length, 'produits en', src.ms, 'ms')
        patch('watch.catalog', {
          ...IDLE, rows, progress, updatedAt: Date.now(),
          state: rows.length ? 'ready' : 'empty',
          message: rows.length
            ? (src.partial
              ? { kind: 'key', key: 'bi.watch.catalogPartial', params: { loaded: src.products.length, expected: src.expected } }
              : undefined)
            : { kind: 'key', key: 'bi.watch.catalogAbsent' },
        })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.error('[bi-watch] catalogue source illisible', e)
        patch('watch.catalog', {
          ...IDLE, state: 'error',
          message: { kind: 'raw', text: e instanceof Error ? e.message : String(e) },
        })
      })
    return () => { cancelled = true }
  }, [wantsCatalog, uid, watchId, patch])

  // ── watch.site : les fiches d'UN concurrent ───────────────────────────────────────────
  useEffect(() => {
    if (!wantsSite || !uid || !watchId) { patch('watch.site', IDLE); return }
    if (!siteId) {
      patch('watch.site', { ...IDLE, state: 'empty', message: { kind: 'key', key: 'bi.watch.noSite' } })
      return
    }
    let cancelled = false
    // Les fiches précédentes partent AVANT la lecture suivante : deux sites simultanés en
    // mémoire, c'est exactement ce que la contrainte interdit.
    patch('watch.site', { ...IDLE, state: 'loading' })
    loadAllListings(uid, watchId, siteId)
      .then((listings) => {
        if (cancelled) return
        const rows = listingRows(listings)
        debugLog('[bi-watch]', siteId, rows.length, 'fiches')
        patch('watch.site', {
          ...IDLE, rows, updatedAt: Date.now(),
          state: rows.length ? 'ready' : 'empty',
          message: rows.length ? undefined : { kind: 'key', key: 'bi.watch.noReport' },
        })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.error('[bi-watch] fiches du concurrent illisibles', e)
        patch('watch.site', {
          ...IDLE, state: 'error',
          message: { kind: 'key', key: 'bi.watch.siteFailed', params: { error: e instanceof Error ? e.message : String(e) } },
        })
      })
    return () => { cancelled = true }
  }, [wantsSite, uid, watchId, siteId, patch])

  return { watches, sites, watchId, siteId }
}
