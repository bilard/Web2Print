/**
 * Écriture des données FABRICANT dans la fiche — colonnes `ai_mfr_*` AJOUTÉES à
 * côté des colonnes source (`ai_*`). Rien n'est écrasé (feedback_never_overwrite
 * / append). Calqué sur `useSaveEnrichedProduct`.
 *
 * `ai_mfr_alignment` fige le rapprochement de specs (dictionnaire + LLM) résolu
 * au scrape : la comparaison se recalcule ensuite de façon déterministe, sans LLM.
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelColumn, FieldTypeId } from '@/features/excel/types'
import type { EnrichedProduct } from '@/features/excel/ai-enrichment/types'
import { writeSheetsToFirestore } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import type { LlmSpecPairs, ManufacturerCandidate } from './types'
import { t } from '@/lib/i18n'

interface ColDef { key: string; label: string; fieldType: FieldTypeId; width: number }

/** Colonnes fabricant — miroir `ai_mfr_*` du sous-ensemble comparé. */
const ENRICHMENT_COLUMNS_MFR: ColDef[] = [
  { key: 'ai_mfr_name', label: 'Fabricant · Nom', fieldType: 'text', width: 260 },
  { key: 'ai_mfr_brand', label: 'Fabricant · Marque', fieldType: 'text', width: 140 },
  { key: 'ai_mfr_model', label: 'Fabricant · Modèle', fieldType: 'text', width: 180 },
  { key: 'ai_mfr_manufacturer_ref', label: 'Fabricant · Réf.', fieldType: 'text', width: 160 },
  { key: 'ai_mfr_ean', label: 'Fabricant · EAN', fieldType: 'text', width: 160 },
  { key: 'ai_mfr_specifications', label: 'Fabricant · Spécifications', fieldType: 'text_long', width: 320 },
  { key: 'ai_mfr_description', label: 'Fabricant · Description', fieldType: 'text_long', width: 320 },
  { key: 'ai_mfr_advantages', label: 'Fabricant · Points forts', fieldType: 'text_long', width: 280 },
  { key: 'ai_mfr_pricing', label: 'Fabricant · Prix', fieldType: 'text_long', width: 200 },
  { key: 'ai_mfr_images', label: 'Fabricant · Images', fieldType: 'image', width: 160 },
  { key: 'ai_mfr_documents', label: 'Fabricant · Documents', fieldType: 'text_long', width: 260 },
  { key: 'ai_mfr_source', label: 'Fabricant · Source', fieldType: 'url', width: 260 },
  { key: 'ai_mfr_confidence', label: 'Fabricant · Confiance', fieldType: 'text', width: 120 },
  { key: 'ai_mfr_matched_ref', label: 'Fabricant · Réf. matchée', fieldType: 'text', width: 160 },
  { key: 'ai_mfr_alignment', label: 'Fabricant · Alignement', fieldType: 'text_long', width: 120 },
]

const buildCol = (def: ColDef): ExcelColumn => ({
  key: def.key,
  label: def.label,
  fieldType: def.fieldType,
  detectedType: def.fieldType,
  isPrimary: false,
  width: def.width,
})

function serializeManufacturer(
  data: EnrichedProduct,
  meta: { candidate: ManufacturerCandidate; alignment: LlmSpecPairs },
): Record<string, string | null> {
  return {
    ai_mfr_name: data.name || null,
    ai_mfr_brand: data.brand || null,
    ai_mfr_model: data.model || null,
    ai_mfr_manufacturer_ref: data.manufacturerRef || null,
    ai_mfr_ean: data.ean || null,
    ai_mfr_specifications: data.specifications.length > 0
      ? data.specifications.map((s) => s.group ? `[${s.group}]${s.name}: ${s.value}` : `${s.name}: ${s.value}`).join(' | ')
      : null,
    ai_mfr_description: data.description || null,
    ai_mfr_advantages: data.advantages.length > 0
      ? data.advantages.map((a) => a.group ? `[${a.group}]${a.text}` : a.text).join(' | ')
      : null,
    ai_mfr_pricing: data.pricing ? JSON.stringify(data.pricing) : null,
    ai_mfr_images: data.images.length > 0 ? data.images.join(' | ') : null,
    ai_mfr_documents: data.documents.length > 0 ? JSON.stringify(data.documents) : null,
    ai_mfr_source: meta.candidate.url || null,
    ai_mfr_confidence: meta.candidate.confidence,
    ai_mfr_matched_ref: meta.candidate.matchedRef,
    ai_mfr_alignment: Object.keys(meta.alignment).length > 0 ? JSON.stringify(meta.alignment) : null,
  }
}

export function useSaveManufacturerData() {
  const addColumn = useExcelStore((s) => s.addColumn)
  const updateCell = useExcelStore((s) => s.updateCell)
  const setCurrentFileName = useExcelStore((s) => s.setCurrentFileName)
  const setCurrentDocId = useExcelStore((s) => s.setCurrentDocId)
  const [saving, setSaving] = useState(false)

  const save = useCallback(
    async (
      rowId: string,
      data: EnrichedProduct,
      meta: { candidate: ManufacturerCandidate; alignment: LlmSpecPairs },
    ): Promise<boolean> => {
      const { sheets, activeSheetIndex, currentFileName, currentDocId, currentPath } = useExcelStore.getState()
      const sheet = sheets[activeSheetIndex]
      if (!sheet) { toast.error('Aucune feuille active'); return false }
      if (!auth.currentUser) { toast.error(t('tst.mv.signInToSave')); return false }

      setSaving(true)
      try {
        const existingKeys = new Set(sheet.columns.map((c) => c.key))
        for (const def of ENRICHMENT_COLUMNS_MFR) {
          if (!existingKeys.has(def.key)) addColumn(activeSheetIndex, buildCol(def))
        }

        const values = serializeManufacturer(data, meta)
        for (const [key, value] of Object.entries(values)) {
          updateCell(activeSheetIndex, rowId, key, value)
        }

        const fresh = useExcelStore.getState()
        const effectiveFileName = currentFileName ?? fresh.sheets[activeSheetIndex]?.name ?? 'data_enrichi'
        if (!currentFileName) setCurrentFileName(effectiveFileName)

        const savedDocId = await writeSheetsToFirestore(
          effectiveFileName, fresh.sheets, currentDocId ?? null, currentPath ?? [],
        )
        if (savedDocId && savedDocId !== currentDocId) setCurrentDocId(savedDocId)

        toast.success(t('tst.mv.saved'), {
          description: `${data.specifications.length} spec(s) fabricant comparées`,
        })
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur lors de la sauvegarde'
        console.error('[save-manufacturer] FAILED', e)
        toast.error(t('tst.mv.saveFailed'), { description: msg })
        return false
      } finally {
        setSaving(false)
      }
    },
    [addColumn, updateCell, setCurrentFileName, setCurrentDocId],
  )

  return { save, saving }
}
