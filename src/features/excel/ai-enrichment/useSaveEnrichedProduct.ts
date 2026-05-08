import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { collection, doc, serverTimestamp, writeBatch, deleteField } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelColumn, ExcelSheet, FieldTypeId } from '@/features/excel/types'
import type { EnrichedProduct } from './types'
import { useEnrichmentStore } from './enrichmentStore'
import { enrichmentKey } from './types'

const FIRESTORE_COLLECTION = 'excel_data'
const FIRESTORE_PAYLOAD_COLLECTION = 'excel_data_payload'
const FIRESTORE_MAX_BYTES = 1_048_576 // 1 MB hard limit Firestore

/** Persiste les sheets dans le doc Firestore courant (existingDocId) ou dans
 *  un nouveau doc Firestore avec ID auto-généré sinon. Retourne l'ID utilisé.
 *  ⚠ Doit utiliser EXACTEMENT le même mécanisme que `useExcelFirebase.saveToFirebase` :
 *  on vise le `currentDocId` du store quand il existe, jamais un docId calculé à
 *  partir du fileName — sinon on dédouble la BDD côté Firestore. */
async function writeSheetsToFirestore(
  fileName: string,
  sheets: ExcelSheet[],
  existingDocId: string | null,
  path: string[],
): Promise<string> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Non authentifié — impossible de sauvegarder dans Firestore.')
  }
  const serialized = JSON.stringify(sheets)
  const byteSize = new Blob([serialized]).size
  if (byteSize > FIRESTORE_MAX_BYTES) {
    throw new Error(
      `Document trop gros pour Firestore (${(byteSize / 1024).toFixed(0)} Ko > 1024 Ko). ` +
      `Supprime des colonnes/lignes inutiles ou réduis la taille des images.`,
    )
  }
  const ref = existingDocId
    ? doc(db, FIRESTORE_COLLECTION, existingDocId)
    : doc(collection(db, FIRESTORE_COLLECTION))
  const payloadRef = doc(db, FIRESTORE_PAYLOAD_COLLECTION, ref.id)

  const batch = writeBatch(db)
  batch.set(ref, {
    userId: user.uid,
    fileName,
    path,
    sheets: deleteField(),
    sheetCount: sheets.length,
    totalRows: sheets.reduce((a, s) => a + s.rows.length, 0),
    totalColumns: sheets.reduce((a, s) => a + s.columns.length, 0),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  }, { merge: true })
  batch.set(payloadRef, {
    userId: user.uid,
    json: serialized,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  await batch.commit()
  return ref.id
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

export interface EnrichmentColumnDef {
  key: string
  label: string
  fieldType: FieldTypeId
  width: number
}

export const ENRICHMENT_COLUMNS: EnrichmentColumnDef[] = [
  { key: 'ai_description',     label: 'IA — Description',   fieldType: 'text_long', width: 320 },
  { key: 'ai_breadcrumb',      label: 'IA — Fil d\'Ariane', fieldType: 'text_long', width: 260 },
  { key: 'ai_advantages',      label: 'IA — Points forts',  fieldType: 'text_long', width: 280 },
  { key: 'ai_specifications',  label: 'IA — Spécifications', fieldType: 'text_long', width: 320 },
  { key: 'ai_variants',        label: 'IA — Variantes',     fieldType: 'text_long', width: 320 },
  { key: 'ai_images',          label: 'IA — Images',        fieldType: 'image',     width: 160 },
  { key: 'ai_documents',       label: 'IA — Documents',     fieldType: 'text_long', width: 280 },
  { key: 'ai_pricing',         label: 'IA — Prix',          fieldType: 'text_long', width: 200 },
  { key: 'ai_source',          label: 'IA — Source',        fieldType: 'url',       width: 240 },
  { key: 'ai_scraper',         label: 'IA — Scraper',       fieldType: 'text',      width: 120 },
  { key: 'ai_llm_model',       label: 'IA — Modèle LLM',    fieldType: 'text',      width: 160 },
  { key: 'ai_llm_request',    label: 'IA — Requête LLM',   fieldType: 'text_long', width: 120 },
]

export const buildEnrichmentColumn = (def: EnrichmentColumnDef): ExcelColumn => ({
  key: def.key,
  label: def.label,
  fieldType: def.fieldType,
  detectedType: def.fieldType,
  isPrimary: false,
  width: def.width,
})
const buildColumn = buildEnrichmentColumn

/** Sérialise les différents types d'output en string unique compatible avec les colonnes existantes. */
export function serializeEnriched(
  data: EnrichedProduct,
  llmRequestJson: string | null,
): Record<string, string | null> {
  return {
    ai_description: data.description || null,
    ai_breadcrumb: (data.breadcrumb && data.breadcrumb.length > 0) ? data.breadcrumb.join(' › ') : null,
    ai_advantages: data.advantages.length > 0
      ? data.advantages.map(a => a.group ? `[${a.group}]${a.text}` : a.text).join(' | ')
      : null,
    ai_specifications:
      data.specifications.length > 0
        ? data.specifications.map((s) => s.group ? `[${s.group}]${s.name}: ${s.value}` : `${s.name}: ${s.value}`).join(' | ')
        : null,
    ai_variants: data.variants.length > 0 ? JSON.stringify(data.variants) : null,
    ai_images: data.images.length > 0 ? data.images.join(' | ') : null,
    // documents : JSON-encoded array (mirror du pattern variants) pour préserver
    // le triplet name/url/filename. Désérialisation tolère le legacy ' | '.
    ai_documents: data.documents.length > 0 ? JSON.stringify(data.documents) : null,
    ai_pricing: data.pricing ? JSON.stringify(data.pricing) : null,
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
  const setCurrentDocId = useExcelStore((s) => s.setCurrentDocId)
  const [savedRowIds, setSavedRowIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(
    async (rowId: string, data: EnrichedProduct): Promise<boolean> => {
      // Snapshot frais du store à chaque appel
      const { sheets, activeSheetIndex, currentFileName, currentDocId, currentPath } = useExcelStore.getState()
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

        // 3. Relire le snapshot post-mutations
        const freshState = useExcelStore.getState()
        const freshSheets = freshState.sheets

        const effectiveFileName =
          currentFileName ?? freshSheets[activeSheetIndex]?.name ?? 'data_enrichi'
        if (!currentFileName) {
          setCurrentFileName(effectiveFileName)
        }

        // 4. Écriture Firestore — vise le doc EXISTANT (currentDocId) sinon
        //    crée un nouveau doc avec ID auto-généré et le mémorise dans le store.
        //    ⚠ Sans ça, on créerait un doc parallèle calculé sur le fileName et
        //    la BDD apparaîtrait en doublon dans la sidebar.
        const savedDocId = await writeSheetsToFirestore(
          effectiveFileName,
          freshSheets,
          currentDocId ?? null,
          currentPath ?? [],
        )
        if (savedDocId && savedDocId !== currentDocId) {
          setCurrentDocId(savedDocId)
        }

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
    [addColumn, updateCell, setCurrentFileName, setCurrentDocId],
  )

  const isSaved = useCallback((rowId: string) => savedRowIds.has(rowId), [savedRowIds])

  return { save, isSaved, saving, error }
}
