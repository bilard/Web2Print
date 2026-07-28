// Détourage EN LOT des visuels produits du catalogue : chaque image est passée
// au moteur de détourage (rembg / Remove.bg, cf. features/imaging), le PNG alpha
// est rangé dans Firebase Storage, et l'URL écrite en SURCHARGE de ligne
// (rowOverrides) — la source (Excel/PIM) n'est jamais modifiée, et « Réinitialiser »
// rend les visuels d'origine.
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '@/lib/firebase/config'
import { removeBackground } from '@/features/imaging/removeBackground'
import { useCatalogStore } from '@/stores/catalog.store'
import { resolveCatalogImage } from './useResolvedImage'

/** Détourages simultanés : au-delà, le service de détourage sature et renvoie des erreurs. */
const CONCURRENCY = 3

/** Dossier de rangement des PNG détourés — sert aussi de marqueur « déjà traité ».
 *  Testé SANS séparateur : l'URL Storage encode les `/` en `%2F`. */
const CUTOUT_DIR = 'catalogCutouts'
const CUTOUT_MARK = new RegExp(CUTOUT_DIR, 'i')

/** Ce visuel est-il DÉJÀ un détourage produit par l'app ? */
export function isCutoutUrl(src: string): boolean {
  return CUTOUT_MARK.test(src)
}

export interface CutoutProgress { done: number; total: number; failed: number }

export function useCatalogCutout() {
  const [progress, setProgress] = useState<CutoutProgress | null>(null)
  // Annulation coopérative : le lot peut être long (des dizaines de visuels).
  const abort = useRef(false)

  const cancel = () => { abort.current = true }

  /** Détoure les visuels des produits SÉLECTIONNÉS ; ceux déjà détourés sont ignorés. */
  const cutoutAll = async () => {
    const s = useCatalogStore.getState()
    const uid = auth.currentUser?.uid
    if (!uid) { toast.error('Connexion requise pour détourer les visuels'); return }
    const column = s.fieldMap.image
    if (!column) { toast.error('Aucune colonne « Image » associée — réglez la correspondance à l’étape Source'); return }

    const selected = new Set(s.selectedRowIds)
    const targets = s.rawRows
      .filter((r) => selected.size === 0 || selected.has(r._id))
      .map((r) => ({ id: r._id, src: String(s.rowOverrides[r._id]?.[column] ?? r[column] ?? '').trim() }))
      // Déjà détouré par un passage précédent → on ne repaie pas le traitement.
      // ⚠ Dans une URL Firebase Storage le chemin est ENCODÉ (`users%2F…%2FcatalogCutouts%2F`) :
      // chercher « /catalogCutouts/ » ne matchait jamais et tout était re-détouré.
      .filter((t) => t.src && !isCutoutUrl(t.src))
    if (targets.length === 0) { toast.info('Tous les visuels sont déjà détourés'); return }

    abort.current = false
    setProgress({ done: 0, total: targets.length, failed: 0 })
    let done = 0
    let failed = 0
    const queue = [...targets]

    const worker = async () => {
      for (;;) {
        const item = queue.shift()
        if (!item || abort.current) return
        try {
          // La cellule contient souvent un lien Drive PRIVÉ (401 pour un service
          // externe) : on la résout d'abord en blob/data-URI, exactement comme le
          // rendu des fiches, puis on détoure cette image-là.
          const resolved = await resolveCatalogImage(item.src)
          if (!resolved) throw new Error('visuel introuvable ou non résoluble')
          const { url } = await removeBackground(resolved)
          const png = await (await fetch(url)).blob()
          URL.revokeObjectURL(url)
          const fileRef = storageRef(storage, `users/${uid}/${CUTOUT_DIR}/${item.id}_${Date.now()}.png`)
          await uploadBytes(fileRef, png, { contentType: 'image/png' })
          useCatalogStore.getState().setRowOverride(item.id, { [column]: await getDownloadURL(fileRef) })
        } catch (e) {
          failed++
          console.warn('[catalogue] détourage échoué pour', item.id, e)
        }
        done++
        setProgress({ done, total: targets.length, failed })
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
    setProgress(null)

    const ok = done - failed
    if (abort.current) toast.info(`Détourage interrompu — ${ok} visuel(s) traité(s)`)
    else if (failed === 0) toast.success(`${ok} visuel(s) détouré(s)`)
    else toast.warning(`${ok} visuel(s) détouré(s), ${failed} échec(s)`, { description: 'Les visuels en échec gardent leur image d’origine.' })
  }

  /** Rend les visuels d'ORIGINE (retire la surcharge d'image de chaque produit). */
  const resetAll = () => {
    const s = useCatalogStore.getState()
    const column = s.fieldMap.image
    if (!column) return
    let n = 0
    for (const rowId of Object.keys(s.rowOverrides)) {
      if (s.rowOverrides[rowId]?.[column] == null) continue
      s.setRowOverride(rowId, { [column]: null })
      n++
    }
    toast.success(n > 0 ? `${n} visuel(s) rendus à leur version d’origine` : 'Aucun visuel détouré à restaurer')
  }

  return { progress, cutoutAll, cancel, resetAll }
}
