import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { classifyProductInTaxonomy } from './aiClassifyProduct'
import { extractRowProductInfo, hasClassificationSignal } from './extractRowProductInfo'
import {
  PRODUCT_TAXONOMY_ID_KEY,
  PRODUCT_TAXONOMY_NODE_ID_KEY,
  getProductTaxonomyLink,
} from './productTaxonomy'
import type { Taxonomy } from './types'

export interface BulkAttachProgress {
  /** Nombre de rows déjà traitées (classées + ignorées + échouées). */
  done: number
  total: number
  /** Rows classées avec succès (lien écrit). */
  classified: number
  /** Rows écartées : pas de signal exploitable, confidence trop faible, déjà classées. */
  skipped: number
  /** Rows en erreur LLM. */
  errors: number
}

export interface BulkAttachOptions {
  /** Seuil minimal de confiance pour appliquer la classification (0–1). */
  minConfidence: number
  /** Si true, écrase un lien existant (vers la même ou une autre taxonomie). */
  overwriteLinked: boolean
}

const DEFAULT_PROGRESS: BulkAttachProgress = {
  done: 0,
  total: 0,
  classified: 0,
  skipped: 0,
  errors: 0,
}

/** Pilote la classification IA en lot des rows de la sheet active vers les
 *  nœuds de la taxonomie cible. Séquentiel pour limiter la pression sur le LLM
 *  et donner un feedback visuel pas à pas. Annulable via `abort()`. */
export function useBulkAttachToTaxonomy() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<BulkAttachProgress>(DEFAULT_PROGRESS)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    setProgress(DEFAULT_PROGRESS)
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const run = useCallback(
    async (taxonomy: Taxonomy, options: BulkAttachOptions & { rowIds?: string[] }) => {
      // Lecture du store à la demande pour rester robuste aux closures stales
      // (ex : appel direct après `setSheets` dans le même tick).
      const store = useExcelStore.getState()
      const sheet = store.sheets[store.activeSheetIndex]
      const updateCell = store.updateCell
      const sheetIdx = store.activeSheetIndex
      if (!sheet) {
        toast.error('Aucune feuille active')
        return
      }
      if (Object.keys(taxonomy.nodes).length === 0) {
        toast.error(`La taxonomie « ${taxonomy.name} » est vide`)
        return
      }

      const targetRows = options.rowIds
        ? sheet.rows.filter((r) => options.rowIds!.includes(r._id))
        : sheet.rows

      if (targetRows.length === 0) {
        toast.info('Aucun produit à classer')
        return
      }

      const ac = new AbortController()
      abortRef.current = ac
      setRunning(true)
      const initial: BulkAttachProgress = {
        done: 0,
        total: targetRows.length,
        classified: 0,
        skipped: 0,
        errors: 0,
      }
      setProgress(initial)

      let classified = 0
      let skipped = 0
      let errors = 0

      try {
        for (let i = 0; i < targetRows.length; i++) {
          if (ac.signal.aborted) break
          const row = targetRows[i]
          const rowId = row._id
          const link = getProductTaxonomyLink(row)
          if (!options.overwriteLinked && link) {
            skipped++
          } else {
            const info = extractRowProductInfo(sheet, row)
            if (!hasClassificationSignal(info)) {
              skipped++
            } else {
              try {
                const result = await classifyProductInTaxonomy(taxonomy, info)
                if (ac.signal.aborted) break
                if (
                  result.nodeId &&
                  taxonomy.nodes[result.nodeId] &&
                  result.confidence >= options.minConfidence
                ) {
                  updateCell(sheetIdx, rowId, PRODUCT_TAXONOMY_ID_KEY, taxonomy.id)
                  updateCell(sheetIdx, rowId, PRODUCT_TAXONOMY_NODE_ID_KEY, result.nodeId)
                  classified++
                } else {
                  skipped++
                }
              } catch (err) {
                console.error('[bulkAttach] classify error row', rowId, err)
                errors++
              }
            }
          }
          setProgress({
            done: i + 1,
            total: targetRows.length,
            classified,
            skipped,
            errors,
          })
        }

        if (ac.signal.aborted) {
          toast.info(`Attachement interrompu — ${classified} produit(s) classé(s)`)
        } else if (errors > 0) {
          toast.warning(
            `${classified} produit(s) classé(s), ${skipped} ignoré(s), ${errors} erreur(s)`,
          )
        } else {
          toast.success(
            `${classified} produit(s) attaché(s) à « ${taxonomy.name} »` +
              (skipped > 0 ? ` (${skipped} ignoré(s))` : ''),
          )
        }
      } finally {
        setRunning(false)
        abortRef.current = null
      }
    },
    [],
  )

  return { run, abort, reset, running, progress }
}
