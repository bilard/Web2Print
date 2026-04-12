import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelColumn, ExcelSheet, FieldTypeId } from '@/features/excel/types'
import type { EnrichedProduct } from './types'
import { useEnrichmentStore } from './enrichmentStore'
import { enrichmentKey } from './types'

const FIRESTORE_COLLECTION = 'excel_data'
const FIRESTORE_MAX_BYTES = 1_048_576 // 1 MB hard limit Firestore

function toDocId(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase()
}

async function writeSheetsToFirestore(fileName: string, sheets: ExcelSheet[]): Promise<void> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Non authentifié — impossible de sauvegarder dans Firestore.')
  }
  const serialized = JSON.stringify(sheets)
  const byteSize = new Blob([serialized]).size
  console.log('[save-enriched] firestore write →', {
    fileName,
    uid: user.uid,
    sheetCount: sheets.length,
    totalRows: sheets.reduce((a, s) => a + s.rows.length, 0),
    byteSize,
  })
  if (byteSize > FIRESTORE_MAX_BYTES) {
    throw new Error(
      `Document trop gros pour Firestore (${(byteSize / 1024).toFixed(0)} Ko > 1024 Ko). ` +
      `Supprime des colonnes/lignes inutiles ou réduis la taille des images.`,
    )
  }
  const docId = toDocId(fileName)
  const ref = doc(db, FIRESTORE_COLLECTION, `${user.uid}_${docId}`)
  await setDoc(ref, {
    userId: user.uid,
    fileName,
    docId,
    sheets: serialized,
    sheetCount: sheets.length,
    totalRows: sheets.reduce((a, s) => a + s.rows.length, 0),
    totalColumns: sheets.reduce((a, s) => a + s.columns.length, 0),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true })
}

/**
 * Persiste les données enrichies dans la feuille Excel active (store Zustand)
 * ET déclenche immédiatement une sauvegarde Firestore (on n'attend pas le debounce
 * auto-save de DataPage).
 *
 * - Crée les colonnes IA (`ai_description`, `ai_advantages`, `ai_specifications`,
 *   `ai_images`, `ai_source`) si elles n'existent pas encore.
 * - Écrit les valeurs dans la ligne courante via `updateCell`.
 * - Relit le snapshot frais du store (`useExcelStore.getState()`) puis appelle
 *   `saveToFirebase(currentFileName, sheets)` directement.
 */

interface EnrichmentColumnDef {
  key: string
  label: string
  fieldType: FieldTypeId
  width: number
}

const ENRICHMENT_COLUMNS: EnrichmentColumnDef[] = [
  { key: 'ai_description',     label: 'IA — Description',   fieldType: 'text_long', width: 320 },
  { key: 'ai_advantages',      label: 'IA — Points forts',  fieldType: 'text_long', width: 280 },
  { key: 'ai_specifications',  label: 'IA — Spécifications', fieldType: 'text_long', width: 320 },
  { key: 'ai_variants',        label: 'IA — Variantes',     fieldType: 'text_long', width: 320 },
  { key: 'ai_images',          label: 'IA — Images',        fieldType: 'image',     width: 160 },
  { key: 'ai_documents',       label: 'IA — Documents',     fieldType: 'url',       width: 280 },
  { key: 'ai_source',          label: 'IA — Source',        fieldType: 'url',       width: 240 },
  { key: 'ai_scraper',         label: 'IA — Scraper',       fieldType: 'text',      width: 120 },
  { key: 'ai_llm_model',       label: 'IA — Modèle LLM',    fieldType: 'text',      width: 160 },
  { key: 'ai_llm_request',    label: 'IA — Requête LLM',   fieldType: 'text_long', width: 120 },
]

const buildColumn = (def: EnrichmentColumnDef): ExcelColumn => ({
  key: def.key,
  label: def.label,
  fieldType: def.fieldType,
  detectedType: def.fieldType,
  isPrimary: false,
  width: def.width,
})

/** Sérialise les différents types d'output en string unique compatible avec les colonnes existantes. */
function serializeEnriched(
  data: EnrichedProduct,
  llmRequestJson: string | null,
): Record<string, string | null> {
  return {
    ai_description: data.description || null,
    ai_advantages: data.advantages.length > 0
      ? data.advantages.map(a => a.group ? `[${a.group}]${a.text}` : a.text).join(' | ')
      : null,
    ai_specifications:
      data.specifications.length > 0
        ? data.specifications.map((s) => s.group ? `[${s.group}]${s.name}: ${s.value}` : `${s.name}: ${s.value}`).join(' | ')
        : null,
    ai_variants: data.variants.length > 0 ? JSON.stringify(data.variants) : null,
    ai_images: data.images.length > 0 ? data.images.join(' | ') : null,
    ai_documents: data.documents.length > 0 ? data.documents.join(' | ') : null,
    ai_source: data.sourceUrl || null,
    ai_scraper: data.scrapingProvider ?? null,
    ai_llm_model: data.llmModel ?? data.llmProvider ?? null,
    ai_llm_request: llmRequestJson,
  }
}

export function useSaveEnrichedProduct() {
  const addColumn = useExcelStore((s) => s.addColumn)
  const updateCell = useExcelStore((s) => s.updateCell)
  const setCurrentFileName = useExcelStore((s) => s.setCurrentFileName)
  const [savedRowIds, setSavedRowIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(
    async (rowId: string, data: EnrichedProduct): Promise<boolean> => {
      console.log('[save-enriched] START', { rowId, hasData: !!data })
      // Snapshot frais du store à chaque appel
      const { sheets, activeSheetIndex, currentFileName } = useExcelStore.getState()
      const sheet = sheets[activeSheetIndex]
      if (!sheet) {
        const msg = 'Aucune feuille active'
        setError(msg)
        toast.error(msg)
        return false
      }

      // Vérif auth immédiate avant d'entreprendre quoi que ce soit
      if (!auth.currentUser) {
        const msg = 'Vous devez être connecté pour sauvegarder.'
        console.error('[save-enriched] no auth user')
        setError(msg)
        toast.error(msg)
        return false
      }

      setSaving(true)
      setError(null)
      try {
        // 1. Créer les colonnes manquantes
        const existingKeys = new Set(sheet.columns.map((c) => c.key))
        const addedCols: string[] = []
        for (const def of ENRICHMENT_COLUMNS) {
          if (!existingKeys.has(def.key)) {
            addColumn(activeSheetIndex, buildColumn(def))
            addedCols.push(def.key)
          }
        }
        console.log('[save-enriched] cols added:', addedCols)

        // 2. Écrire les valeurs dans la ligne courante
        // Récupérer le llmRequest depuis le store d'enrichissement
        const enrichEntry = useEnrichmentStore.getState().entries[enrichmentKey(sheet.name, rowId)]
        const llmRequestJson = enrichEntry?.llmRequest
          ? JSON.stringify(enrichEntry.llmRequest)
          : null
        const values = serializeEnriched(data, llmRequestJson)
        const updatedFields: string[] = []
        for (const [key, value] of Object.entries(values)) {
          updateCell(activeSheetIndex, rowId, key, value)
          updatedFields.push(key)
        }
        console.log('[save-enriched] cells updated:', updatedFields)

        // 3. Relire le snapshot post-mutations
        const freshState = useExcelStore.getState()
        const freshSheets = freshState.sheets
        const freshRow = freshSheets[activeSheetIndex]?.rows.find((r) => r._id === rowId)
        console.log('[save-enriched] fresh row after updates:', freshRow)

        const effectiveFileName =
          currentFileName ?? freshSheets[activeSheetIndex]?.name ?? 'data_enrichi'
        if (!currentFileName) {
          console.log('[save-enriched] no currentFileName, setting to:', effectiveFileName)
          setCurrentFileName(effectiveFileName)
        }

        // 4. Écriture Firestore explicite (ne dépend plus de l'auto-save debounced)
        await writeSheetsToFirestore(effectiveFileName, freshSheets)
        console.log('[save-enriched] firestore write OK')

        setSavedRowIds((prev) => {
          const next = new Set(prev)
          next.add(rowId)
          return next
        })
        toast.success('Données enrichies sauvegardées', {
          description: `${Object.keys(values).length} champs mis à jour`,
        })
        return true
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur lors de la sauvegarde'
        console.error('[save-enriched] FAILED', e)
        setError(msg)
        toast.error('Échec sauvegarde', { description: msg })
        return false
      } finally {
        setSaving(false)
      }
    },
    [addColumn, updateCell, setCurrentFileName],
  )

  const isSaved = useCallback((rowId: string) => savedRowIds.has(rowId), [savedRowIds])

  return { save, isSaved, saving, error }
}
