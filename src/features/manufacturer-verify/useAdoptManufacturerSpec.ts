/**
 * Adoption d'une valeur FABRICANT dans le MASTER de la source.
 *
 * « La vérité est chez le fabricant » → l'utilisateur promeut une spec présente
 * seulement chez le fabricant (« + fabricant ») dans les specs du produit
 * (colonne `ai_specifications` = master). La provenance est tracée dans
 * `ai_mfr_adopted` (clés canoniques adoptées) → badge/couleur permanents + reset.
 *
 * Append/retrait par SEGMENT de la chaîne sérialisée (jamais d'écrasement global).
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelColumn, FieldTypeId } from '@/features/excel/types'
import { writeSheetsToFirestore } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'

const ADOPTED_COL = 'ai_mfr_adopted'

const buildCol = (key: string, label: string, fieldType: FieldTypeId, width: number): ExcelColumn => ({
  key, label, fieldType, detectedType: fieldType, isPrimary: false, width,
})

/** Segmente une chaîne « a | b | c » en préservant l'ordre. */
const splitSegs = (raw: string): string[] => raw.split(' | ').map((s) => s.trim()).filter(Boolean)

export interface AdoptSpec {
  /** Clé stable de la ligne (ex: `spec:puissance`). */
  key: string
  /** Libellé affiché (nom de la spec). */
  label: string
  /** Valeur fabricant à adopter. */
  value: string
}

export function useAdoptManufacturerSpec() {
  const addColumn = useExcelStore((s) => s.addColumn)
  const updateCell = useExcelStore((s) => s.updateCell)
  const setCurrentDocId = useExcelStore((s) => s.setCurrentDocId)
  const [busy, setBusy] = useState(false)

  const setAdopted = useCallback(async (rowId: string, spec: AdoptSpec, adopt: boolean): Promise<boolean> => {
    const { sheets, activeSheetIndex, currentFileName, currentDocId, currentPath } = useExcelStore.getState()
    const sheet = sheets[activeSheetIndex]
    const row = sheet?.rows.find((r) => r._id === rowId)
    if (!sheet || !row) { toast.error('Ligne introuvable'); return false }
    if (!auth.currentUser) { toast.error('Vous devez être connecté.'); return false }

    setBusy(true)
    try {
      // Créer les colonnes cibles si absentes.
      const keys = new Set(sheet.columns.map((c) => c.key))
      if (!keys.has('ai_specifications')) addColumn(activeSheetIndex, buildCol('ai_specifications', 'Spécifications', 'text_long', 320))
      if (!keys.has(ADOPTED_COL)) addColumn(activeSheetIndex, buildCol(ADOPTED_COL, 'Fabricant · Adoptées', 'text_long', 120))

      const specSeg = `${spec.label}: ${spec.value}`
      const specsRaw = typeof row.ai_specifications === 'string' ? row.ai_specifications : ''
      const adoptedRaw = typeof row[ADOPTED_COL] === 'string' ? (row[ADOPTED_COL] as string) : ''
      const specs = splitSegs(specsRaw)
      const adopted = splitSegs(adoptedRaw)

      if (adopt) {
        // Ajouter la spec au master (si pas déjà présente par libellé) + tracer la clé.
        const already = specs.some((s) => s.toLowerCase().startsWith(`${spec.label.toLowerCase()}:`))
        if (!already) specs.push(specSeg)
        if (!adopted.includes(spec.key)) adopted.push(spec.key)
      } else {
        // Retirer du master la spec adoptée + la clé de provenance.
        const idx = specs.findIndex((s) => s.toLowerCase().startsWith(`${spec.label.toLowerCase()}:`))
        if (idx >= 0) specs.splice(idx, 1)
        const ai = adopted.indexOf(spec.key)
        if (ai >= 0) adopted.splice(ai, 1)
      }

      updateCell(activeSheetIndex, rowId, 'ai_specifications', specs.length ? specs.join(' | ') : null)
      updateCell(activeSheetIndex, rowId, ADOPTED_COL, adopted.length ? adopted.join(' | ') : null)

      const fresh = useExcelStore.getState()
      const savedDocId = await writeSheetsToFirestore(
        currentFileName ?? sheet.name ?? 'data_enrichi', fresh.sheets, currentDocId ?? null, currentPath ?? [],
      )
      if (savedDocId && savedDocId !== currentDocId) setCurrentDocId(savedDocId)

      toast.success(adopt ? 'Valeur fabricant adoptée dans la fiche' : 'Adoption annulée')
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      console.error('[adopt-mfr-spec] FAILED', e)
      toast.error('Échec', { description: msg })
      return false
    } finally {
      setBusy(false)
    }
  }, [addColumn, updateCell, setCurrentDocId])

  return { setAdopted, busy }
}
