// Les bases du module « Données » vues depuis le module BI : les LISTER pour en choisir une,
// et CHARGER celle que le tableau de bord a retenue.
//
// ⚠⚠ Aucune lecture n'est réécrite ici : `useExcelFirebase` sait déjà lister
// (`listSavedFiles`) et charger (`loadFromFirebase`) une base, et c'est le MÊME
// `useExcelStore` que lisent les tuiles (`effectivePimSource`). Une seconde voie d'accès
// finirait par diverger de celle du module Données — et les deux écrans ne montreraient plus
// les mêmes chiffres pour la même base.
//
// ⚠⚠ Charger une base, c'est REMPLACER les feuilles en mémoire, celles du module Données
// comprises. Le chargement recopie donc `currentDocId`/`currentFileName`/`currentPath` comme
// le fait `DataPage.handleLoadFile` : sans cela, l'enregistrement automatique du module
// Données réécrirait l'ANCIENNE base avec le contenu de la nouvelle.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useExcelStore } from '@/stores/excel.store'
import { useExcelFirebase } from '@/features/excel/useExcelFirebase'
import { debugLog } from '@/lib/debugLog'
import type { BiMessage } from '../types'

/** Une base telle que le sélecteur la propose. `rows` sert à annoncer le coût du chargement. */
export interface PimDatabase {
  docId: string
  name: string
  rows: number
  path: string[]
}

interface PimDbState {
  state: 'idle' | 'loading' | 'ready' | 'error'
  /** Base RÉELLEMENT en mémoire (ou en cours de lecture), pour la nommer dans l'avancement. */
  name: string | null
  /** Lignes annoncées par la fiche de la base — un chargement muet se lit comme une panne. */
  rows: number
  message?: BiMessage
}

const IDLE: PimDbState = { state: 'idle', name: null, rows: 0 }

interface PimDbStore {
  data: PimDbState
  patch: (next: PimDbState) => void
}

// ⚠ L'état vit dans un store de module, comme celui de la veille : l'avancement s'affiche
// dans la barre transversale, hors de portée d'une prop du sélecteur.
const usePimDbStore = create<PimDbStore>((set) => ({ data: IDLE, patch: (data) => set({ data }) }))

/** Ce que le chargement de la base est en train de faire. Lecture SEULE. */
export function usePimDbState(): PimDbState {
  return usePimDbStore((s) => s.data)
}

/** Remet l'état à zéro. Réservé aux tests : le store est un singleton de module. */
export function resetPimDbStateForTest(): void {
  usePimDbStore.setState({ data: IDLE })
}

/**
 * Les bases disponibles, lues UNE fois au montage. Ce sont des métadonnées (nom, volumétrie,
 * chemin) : la requête est légère, aucun contenu de base n'est rapatrié.
 */
export function usePimDbList(): { items: PimDatabase[]; loading: boolean } {
  const { listSavedFiles } = useExcelFirebase()
  const [items, setItems] = useState<PimDatabase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listSavedFiles()
      .then((files) => {
        if (cancelled) return
        setItems(files.map((f) => ({
          docId: f.docId, name: f.fileName, rows: f.totalRows, path: f.path,
        })))
      })
      // ⚠ Une liste illisible se DIT (le sélecteur restera vide) plutôt que de faire croire
      // à une absence de bases.
      .catch((e: unknown) => console.warn('[bi] bases du module Données illisibles :', e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { items, loading }
}

interface LoaderArgs {
  /** Base retenue par le tableau de bord. `undefined` = aucun choix (comportement d'avant). */
  dbId: string | undefined
  /** Feuille sur laquelle le tableau a été construit, pour retomber sur la BONNE. */
  sheetName: string | undefined
  list: PimDatabase[]
  listLoading: boolean
  /**
   * ⚠⚠ Le chargement se MÉRITE : une base de plusieurs dizaines de milliers de lignes n'est
   * lue que si une tuile posée réclame la source PIM — ou si l'utilisateur vient de choisir
   * cette base, ce qui EST une demande explicite (sans quoi la première tuile ne pourrait
   * être construite : le menu des champs n'aurait aucune colonne à proposer).
   */
  wanted: boolean
}

/**
 * Charge la base retenue dans `useExcelStore`, d'où les tuiles la lisent. À appeler UNE fois
 * par tableau de bord.
 */
export function usePimDbLoader({ dbId, sheetName, list, listLoading, wanted }: LoaderArgs): void {
  const { loadFromFirebase } = useExcelFirebase()
  const patch = usePimDbStore((s) => s.patch)
  const currentDocId = useExcelStore((s) => s.currentDocId)

  useEffect(() => {
    if (!wanted || !dbId) { patch(IDLE); return }
    const db = list.find((f) => f.docId === dbId)
    if (!db) {
      // Tant que la liste arrive, on ne conclut rien : la base n'est introuvable qu'APRÈS.
      if (listLoading) { patch({ ...IDLE, state: 'loading' }); return }
      patch({ ...IDLE, state: 'error', message: { kind: 'key', key: 'bi.db.missing' } })
      return
    }
    if (dbId === currentDocId) {
      patch({ state: 'ready', name: db.name, rows: db.rows })
      return
    }
    // ⚠⚠ Import local jamais enregistré (`currentDocId` nul mais des feuilles en mémoire) :
    // le remplacer le DÉTRUIRAIT sans retour possible. On refuse, et on dit pourquoi.
    //
    // ⚠⚠ Le nombre de feuilles est lu à l'INSTANT du contrôle, jamais suivi en dépendance :
    // `loadFromFirebase` pose les feuilles AVANT de rendre la main, l'effet se relançait donc
    // au milieu de sa propre lecture, son nettoyage l'annulait, et `.then` — qui pose
    // `currentDocId` — n'était JAMAIS exécuté. La base s'affichait sans que rien n'enregistre
    // à quelle base elle appartient, et l'écran restait sur cet avertissement. Vu en recette.
    if (currentDocId === null && useExcelStore.getState().sheets.length > 0) {
      patch({ ...IDLE, state: 'error', message: { kind: 'key', key: 'bi.db.unsavedSheets' } })
      return
    }

    let cancelled = false
    patch({ state: 'loading', name: db.name, rows: db.rows })
    debugLog('[bi-db] chargement de la base', db.name, db.rows, 'lignes annoncées')
    loadFromFirebase(dbId)
      .then((sheets) => {
        if (cancelled) return
        if (!sheets) {
          patch({ ...IDLE, state: 'error', message: { kind: 'key', key: 'bi.db.missing' } })
          return
        }
        const st = useExcelStore.getState()
        st.setCurrentDocId(dbId)
        st.setCurrentFileName(db.name)
        st.setCurrentPath(db.path)
        // ⚠⚠ `setSheets` CLAMPE l'index actif, il ne le remet pas à zéro : sans ce choix
        // explicite, une base chargée alors que l'index valait 3 serait mesurée sur sa
        // quatrième feuille, sans le moindre signal. On retombe sur la feuille de
        // construction quand elle existe, sinon sur la première.
        const i = sheetName ? sheets.findIndex((s) => s.name === sheetName) : -1
        st.setActiveSheet(i >= 0 ? i : 0)
        patch({ state: 'ready', name: db.name, rows: db.rows })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.error('[bi-db] base illisible', e)
        patch({
          ...IDLE, state: 'error',
          message: { kind: 'key', key: 'bi.db.failed', params: { error: e instanceof Error ? e.message : String(e) } },
        })
      })
    return () => { cancelled = true }
  }, [wanted, dbId, sheetName, list, listLoading, currentDocId, patch])
}
