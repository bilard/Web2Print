// Données d'une tuile : source → lignes → moteur. Mémoïsé par spec ET par lignes : sans
// cela, vingt tuiles branchées en direct recalculeraient tout à chaque battement.
import { useCallback, useMemo, useState } from 'react'
import { usePimStore } from '@/stores/pim.store'
import { useExcelStore } from '@/stores/excel.store'
import { aggregate, type AggregateResult } from '../engine/aggregate'
import { pimRows, rowsFromSheet } from '../engine/rowsFromPim'
import { getSource } from '../registry/sources'
import { effectivePimSource } from '../registry/pim.source'
import { BiKeyedError, type BiMessage, type FilterClause, type QuerySpec } from '../types'

export interface TileData {
  result: AggregateResult | null
  state: 'loading' | 'empty' | 'error' | 'ready'
  /**
   * Ce que la tuile a à dire, sous forme de CLÉ quand le catalogue la porte.
   *
   * ⚠⚠ Traduit par le composant, jamais ici : le `t` de `useTranslation` est une fermeture
   * RECRÉÉE à chaque rendu, l'ajouter aux dépendances du `useMemo` ci-dessous ferait
   * recalculer l'agrégation de chaque tuile à chaque rendu — la mémoïsation que ce hook
   * existe pour tenir. Le `t()` de module, lui, figerait la langue et manquerait les
   * surcharges de compte (hydratées après le premier rendu).
   */
  message?: BiMessage
  updatedAt: number | null
  live: boolean
  retry: () => void
}

export function useTileData(query: QuerySpec, globalFilters: FilterClause[]): TileData {
  const products = usePimStore((s) => s.products)
  const sheets = useExcelStore((s) => s.sheets)
  const activeSheetIndex = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[activeSheetIndex] ?? null
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return useMemo<TileData>(() => {
    try {
      const registered = getSource(query.source)
      // Lot 1 : seule la source client est branchée. Les sources `server` et `snapshot`
      // arrivent au lot 3 — le dire vaut mieux que rendre une tuile vide.
      if (registered.engine !== 'client') {
        return { result: null, state: 'error',
          message: { kind: 'raw', text: `Source non encore disponible : ${registered.id}` },
          updatedAt: null, live: false, retry }
      }
      // La source PIM lit la feuille ACTIVE du module Données — ce que l'utilisateur voit
      // réellement — et ne se replie sur le catalogue master (`usePimStore`) que si aucune
      // feuille n'est chargée. Il n'y a pas de signal « catalogue pas encore arrivé » à
      // distinguer d'une absence de donnée : sans l'un ni l'autre, c'est un état `empty`.
      const hasSheet = sheet !== null && sheet.columns.length > 0
      if (!hasSheet && products.length === 0) {
        // ⚠ `live: false` : rien ne coule dans cette tuile. Un point qui bat sur un cadre
        // vide affirmerait un flux qui n'existe pas.
        // ⚠ L'état vide LE PLUS COURANT : tout utilisateur sans feuille ouverte le lit.
        // Il passe donc par le catalogue, sous peine d'être en français pour tout le monde.
        return { result: null, state: 'empty',
          message: { kind: 'key', key: 'bi.tile.noDataLoaded' },
          updatedAt: null, live: false, retry }
      }
      // ⚠⚠ `effectivePimSource` est le point de décision UNIQUE (partagé avec `AddTileMenu`) :
      // sans lui, le menu et le moteur pourraient diverger sur les dimensions disponibles.
      const source = registered.id === 'pim.products' ? effectivePimSource(sheet) : registered
      const rows = hasSheet ? rowsFromSheet(sheet) : pimRows(products, [])
      const merged: QuerySpec = { ...query, filters: [...query.filters, ...globalFilters] }
      const result = aggregate(rows, merged, source)
      // ⚠⚠ `live` était `true` EN DUR : une tuile en erreur, ou vide faute de base ouverte,
      // portait le même point clignotant qu'une tuile réellement alimentée. Seule une
      // source `client` branchée sur des lignes présentes est en direct — c'est l'abonnement
      // Firestore de `usePimStore`/`useExcelStore` qui la fait battre, rien d'autre.
      const ready = result.rows.length > 0
      return {
        result,
        state: ready ? 'ready' : 'empty',
        updatedAt: Date.now(), live: ready, retry,
      }
    } catch (e) {
      // Une erreur qui porte sa CLÉ est traduite au rendu ; les autres restent techniques
      // (leur internationalisation est hors périmètre) et s'affichent telles quelles.
      const message: BiMessage = e instanceof BiKeyedError
        ? { kind: 'key', key: e.messageKey, params: e.params }
        : { kind: 'raw', text: e instanceof Error ? e.message : String(e) }
      return { result: null, state: 'error', message, updatedAt: null, live: false, retry }
    }
    // `attempt` est une dépendance VOLONTAIRE : c'est ce qui rejoue le calcul sur « réessayer ».
  }, [sheet, products, query, globalFilters, attempt, retry])
}
