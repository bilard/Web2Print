/**
 * Adoption d'une valeur FABRICANT dans le MASTER de la source.
 *
 * « La vérité est chez le fabricant » → l'utilisateur promeut une valeur
 * fabricant dans les données du produit. Gère 3 cibles :
 *  - spec technique (« + fabricant » ou « ≠ diffère ») → `ai_specifications`
 *    (append si absente, REMPLACE la valeur source si divergente),
 *  - description → `ai_description`,
 *  - points forts → `ai_advantages`.
 *
 * La provenance + la valeur SOURCE d'origine sont tracées dans `ai_mfr_adopted`
 * (JSON `{ [key]: { label, target, original } }`) → badge permanent + RESET fidèle.
 * Matching des specs par CLÉ CANONIQUE (robuste au nommage réel). Append/retrait
 * par segment, jamais d'écrasement global.
 */

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { auth } from '@/lib/firebase/config'
import { useExcelStore } from '@/stores/excel.store'
import type { ExcelColumn, FieldTypeId } from '@/features/excel/types'
import { writeSheetsToFirestore } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import { deserializeEnrichedFromRow } from '@/features/excel/ai-enrichment/deserializeEnriched'
import { useEnrichmentStore } from '@/features/excel/ai-enrichment/enrichmentStore'
import { canonicalizeSpecName, normalizeSpecLabel } from './specSynonyms'
import { t } from '@/lib/i18n'

const ADOPTED_COL = 'ai_mfr_adopted'

const buildCol = (key: string, label: string, fieldType: FieldTypeId, width: number): ExcelColumn => ({
  key, label, fieldType, detectedType: fieldType, isPrimary: false, width,
})

const splitSegs = (raw: string): string[] => raw.split(' | ').map((s) => s.trim()).filter(Boolean)
/** Nom d'un segment « [groupe]Nom: valeur » (groupe et valeur retirés). */
const segName = (seg: string): string => seg.replace(/^\[[^\]]*\]/, '').split(':')[0].trim()
const segCanon = (seg: string): string => { const n = segName(seg); return canonicalizeSpecName(n) ?? normalizeSpecLabel(n) }
const segValue = (seg: string): string => { const i = seg.indexOf(':'); return i >= 0 ? seg.slice(i + 1).trim() : '' }

interface AdoptRecord { label: string; target: string; original: string | null; originalRich?: string | null }
type AdoptedMap = Record<string, AdoptRecord>

/** Tolère le format JSON (nouveau) ET l'ancien « clé | clé » (rétro-compat). */
function parseAdopted(raw: string): AdoptedMap {
  if (!raw) return {}
  try {
    const j = JSON.parse(raw) as unknown
    if (j && typeof j === 'object' && !Array.isArray(j)) return j as AdoptedMap
  } catch { /* ancien format */ }
  const map: AdoptedMap = {}
  for (const k of splitSegs(raw)) map[k] = { label: '', target: 'ai_specifications', original: null }
  return map
}

/** Item de comparaison à adopter/annuler. */
export interface AdoptItem {
  key: string
  label: string
  group: 'spec' | 'content' | 'identity' | 'price'
  value: string
}

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
    if (!auth.currentUser) { toast.error(t('tst.mv.signInRequired')); return false }

    setBusy(true)
    try {
      const keys = new Set(sheet.columns.map((c) => c.key))
      if (!keys.has(target.col)) addColumn(activeSheetIndex, buildCol(target.col, target.col, 'text_long', 320))
      if (!keys.has(ADOPTED_COL)) addColumn(activeSheetIndex, buildCol(ADOPTED_COL, 'Fabricant · Adoptées', 'text_long', 120))

      const adoptedMap = parseAdopted(typeof row[ADOPTED_COL] === 'string' ? (row[ADOPTED_COL] as string) : '')
      const curCell = typeof row[target.col] === 'string' ? (row[target.col] as string) : ''

      if (target.col === 'ai_specifications') {
        // Matching par clé canonique — robuste au nom réel de la spec source.
        const canon = item.key.replace(/^spec:/, '')
        const segs = splitSegs(curCell)
        const idx = segs.findIndex((s) => segCanon(s) === canon)
        if (adopt) {
          const original = idx >= 0 ? segValue(segs[idx]) : null
          const name = idx >= 0 ? segName(segs[idx]) : item.label
          adoptedMap[item.key] = { label: name, target: target.col, original }
          const newSeg = `${name}: ${target.write}`
          if (idx >= 0) segs[idx] = newSeg
          else segs.push(newSeg)
        } else {
          const rec = adoptedMap[item.key]
          if (idx >= 0) {
            if (rec?.original != null) segs[idx] = `${segName(segs[idx])}: ${rec.original}`
            else segs.splice(idx, 1)
          }
          delete adoptedMap[item.key]
        }
        updateCell(activeSheetIndex, rowId, target.col, segs.length ? segs.join(' | ') : null)
      } else {
        // Description / avantages = cellule entière.
        const isDesc = item.key === 'content:description'
        if (adopt) {
          const originalRich = isDesc && typeof row.ai_description_rich === 'string' ? row.ai_description_rich : null
          adoptedMap[item.key] = { label: item.label, target: target.col, original: curCell || null, originalRich }
          updateCell(activeSheetIndex, rowId, target.col, target.write)
          // La valeur fabricant est du texte brut : neutraliser la version « rich » de
          // la source (sinon la fiche continuerait d'afficher le texte source formaté).
          if (isDesc) updateCell(activeSheetIndex, rowId, 'ai_description_rich', null)
        } else {
          const rec = adoptedMap[item.key]
          updateCell(activeSheetIndex, rowId, target.col, rec?.original ?? null)
          if (isDesc) updateCell(activeSheetIndex, rowId, 'ai_description_rich', rec?.originalRich ?? null)
          delete adoptedMap[item.key]
        }
      }

      updateCell(activeSheetIndex, rowId, ADOPTED_COL, Object.keys(adoptedMap).length ? JSON.stringify(adoptedMap) : null)

      const fresh = useExcelStore.getState()
      // La fiche produit (EnrichmentPanel) est rendue depuis `enrichmentStore`, PAS
      // depuis les colonnes. Re-dérive le produit complet depuis la ligne fraîche
      // (specs/description/avantages adoptés inclus) → mise à jour LIVE de la fiche.
      const freshSheet = fresh.sheets[activeSheetIndex]
      const freshRow = freshSheet?.rows.find((r) => r._id === rowId)
      const restored = freshRow ? deserializeEnrichedFromRow(freshRow) : null
      if (restored && freshSheet) useEnrichmentStore.getState().setData(freshSheet.name, rowId, restored.product)

      const savedDocId = await writeSheetsToFirestore(
        currentFileName ?? sheet.name ?? 'data_enrichi', fresh.sheets, currentDocId ?? null, currentPath ?? [],
      )
      if (savedDocId && savedDocId !== currentDocId) setCurrentDocId(savedDocId)

      toast.success(t(adopt ? 'tst.mv.adopted' : 'tst.mv.adoptCancelled'))
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      console.error('[adopt-mfr-spec] FAILED', e)
      toast.error(t('tst.mv.failure'), { description: msg })
      return false
    } finally {
      setBusy(false)
    }
  }, [addColumn, updateCell, setCurrentDocId])

  return { setAdopted, busy }
}

/** Clés adoptées lues depuis `ai_mfr_adopted` (JSON ou ancien format). */
export function readAdoptedKeys(raw: string | null): Set<string> {
  return new Set(Object.keys(parseAdopted(raw ?? '')))
}
