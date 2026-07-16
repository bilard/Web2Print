/**
 * Adoption d'une valeur FABRICANT dans le MASTER de la source.
 *
 * « La vérité est chez le fabricant » → l'utilisateur promeut une valeur
 * fabricant dans les données du produit. Gère 3 cibles :
 *  - spec technique (« + fabricant » ou « ≠ diffère ») → colonne `ai_specifications`
 *    (append si absente, REMPLACE la valeur source si divergente),
 *  - description → `ai_description`,
 *  - points forts → `ai_advantages`.
 *
 * La provenance + la valeur SOURCE d'origine sont tracées dans `ai_mfr_adopted`
 * (JSON `{ [key]: { label, target, original } }`) → badge permanent + RESET fidèle
 * (restaure l'original). Append/retrait par segment, jamais d'écrasement global.
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

const splitSegs = (raw: string): string[] => raw.split(' | ').map((s) => s.trim()).filter(Boolean)

interface AdoptRecord { label: string; target: string; original: string | null }
type AdoptedMap = Record<string, AdoptRecord>

/** Item de comparaison à adopter/annuler. */
export interface AdoptItem {
  key: string
  label: string
  group: 'spec' | 'content' | 'identity' | 'price'
  value: string
}

/** Colonne cible + valeur à écrire selon le type de champ. */
function targetFor(item: AdoptItem): { col: string; write: string } | null {
  if (item.key === 'content:description') return { col: 'ai_description', write: item.value }
  if (item.key === 'content:advantages') return { col: 'ai_advantages', write: item.value.split(' • ').map((s) => s.trim()).filter(Boolean).join(' | ') }
  if (item.group === 'spec') return { col: 'ai_specifications', write: item.value }
  return null
}

export function useAdoptManufacturerSpec() {
  const addColumn = useExcelStore((s) => s.addColumn)
  const updateCell = useExcelStore((s) => s.updateCell)
  const setCurrentDocId = useExcelStore((s) => s.setCurrentDocId)
  const [busy, setBusy] = useState(false)

  const setAdopted = useCallback(async (rowId: string, item: AdoptItem, adopt: boolean): Promise<boolean> => {
    const target = targetFor(item)
    if (!target) return false
    const { sheets, activeSheetIndex, currentFileName, currentDocId, currentPath } = useExcelStore.getState()
    const sheet = sheets[activeSheetIndex]
    const row = sheet?.rows.find((r) => r._id === rowId)
    if (!sheet || !row) { toast.error('Ligne introuvable'); return false }
    if (!auth.currentUser) { toast.error('Vous devez être connecté.'); return false }

    setBusy(true)
    try {
      const keys = new Set(sheet.columns.map((c) => c.key))
      if (!keys.has(target.col)) addColumn(activeSheetIndex, buildCol(target.col, target.col, 'text_long', 320))
      if (!keys.has(ADOPTED_COL)) addColumn(activeSheetIndex, buildCol(ADOPTED_COL, 'Fabricant · Adoptées', 'text_long', 120))

      let adoptedMap: AdoptedMap = {}
      const adoptedRaw = typeof row[ADOPTED_COL] === 'string' ? (row[ADOPTED_COL] as string) : ''
      if (adoptedRaw) { try { adoptedMap = JSON.parse(adoptedRaw) as AdoptedMap } catch { adoptedMap = {} } }

      const curCell = typeof row[target.col] === 'string' ? (row[target.col] as string) : ''

      if (target.col === 'ai_specifications') {
        // Spec = segment « label: valeur » dans la chaîne pipe-séparée.
        const segs = splitSegs(curCell)
        const idx = segs.findIndex((s) => s.toLowerCase().replace(/^\[[^\]]*\]/, '').startsWith(`${item.label.toLowerCase()}:`))
        if (adopt) {
          const original = idx >= 0 ? segs[idx].replace(/^\[[^\]]*\][^:]*:|^[^:]*:/, '').trim() : null
          adoptedMap[item.key] = { label: item.label, target: target.col, original }
          if (idx >= 0) segs[idx] = `${item.label}: ${target.write}`
          else segs.push(`${item.label}: ${target.write}`)
        } else {
          const rec = adoptedMap[item.key]
          if (idx >= 0) {
            if (rec?.original != null) segs[idx] = `${item.label}: ${rec.original}`
            else segs.splice(idx, 1)
          }
          delete adoptedMap[item.key]
        }
        updateCell(activeSheetIndex, rowId, target.col, segs.length ? segs.join(' | ') : null)
      } else {
        // Description / avantages = cellule entière.
        if (adopt) {
          adoptedMap[item.key] = { label: item.label, target: target.col, original: curCell || null }
          updateCell(activeSheetIndex, rowId, target.col, target.write)
        } else {
          const rec = adoptedMap[item.key]
          updateCell(activeSheetIndex, rowId, target.col, rec?.original ?? null)
          delete adoptedMap[item.key]
        }
      }

      updateCell(activeSheetIndex, rowId, ADOPTED_COL, Object.keys(adoptedMap).length ? JSON.stringify(adoptedMap) : null)

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

/** Clés adoptées lues depuis `ai_mfr_adopted` (JSON). */
export function readAdoptedKeys(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try { return new Set(Object.keys(JSON.parse(raw) as AdoptedMap)) } catch { return new Set() }
}
