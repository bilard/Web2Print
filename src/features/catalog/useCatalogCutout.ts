// Détourage EN LOT des visuels produits du catalogue : chaque image est passée
// au moteur de détourage (rembg / Remove.bg, cf. features/imaging), le PNG alpha
// est rangé dans Firebase Storage, et l'URL écrite en SURCHARGE de ligne
// (rowOverrides) — la source (Excel/PIM) n'est jamais modifiée, et « Réinitialiser »
// rend les visuels d'origine.
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, storage } from '@/lib/firebase/config'
import { removeBackground } from '@/features/imaging/removeBackground'
import { useCatalogStore } from '@/stores/catalog.store'
import { saveCatalog } from './catalogsApi'
import { resolveCatalogImage } from './useResolvedImage'

/** Détourages simultanés : au-delà, le service de détourage sature et renvoie des erreurs. */
const CONCURRENCY = 3

/** Sauvegarde du catalogue toutes les N images traitées (le lot survit à un changement de module). */
const SAVE_EVERY = 5

/** Persiste le catalogue immédiatement, sans dépendre de l'autosauvegarde de la page. */
async function persist(): Promise<void> {
  const s = useCatalogStore.getState()
  if (!s.catalogId) return
  try { await saveCatalog(s.toDoc()) }
  catch (e) { console.warn('[catalogue] sauvegarde des détourages différée', e) }
}

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

    // 1) RÉUTILISATION IMMÉDIATE : un visuel déjà détouré (même URL source sur un
    //    autre produit, ou produit ré-ajouté après un changement de sélection) est
    //    repris tel quel — aucun traitement, aucun coût.
    const known = s.cutoutBySource
    const reused = targets.filter((t) => known[t.src])
    for (const t of reused) useCatalogStore.getState().setRowOverride(t.id, { [column]: known[t.src] })
    const todo = targets.filter((t) => !known[t.src])
    if (todo.length === 0) {
      useCatalogStore.getState().rememberCutouts({}, true)
      toast.success(reused.length > 0 ? `${reused.length} visuel(s) repris du détourage déjà fait` : 'Tous les visuels sont déjà détourés')
      return
    }

    abort.current = false
    let sinceSave = 0
    setProgress({ done: 0, total: todo.length, failed: 0 })
    let done = 0
    let failed = 0
    const queue = [...todo]

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
          const cutoutUrl = await getDownloadURL(fileRef)
          useCatalogStore.getState().setRowOverride(item.id, { [column]: cutoutUrl })
          // Mémorisé par URL SOURCE : tout produit qui réapparaît avec ce visuel
          // le récupérera sans repasser par le service de détourage.
          useCatalogStore.getState().rememberCutouts({ [item.src]: cutoutUrl }, true)
          // SAUVEGARDE au fil de l'eau : le lot dure des minutes et l'utilisateur
          // change de module entre-temps. L'autosauvegarde est portée par la page
          // du catalogue — démontée, elle ne sauve plus rien, et les détourages
          // déjà payés seraient perdus. On persiste donc nous-mêmes, périodiquement.
          if (++sinceSave >= SAVE_EVERY) { sinceSave = 0; await persist() }
        } catch (e) {
          failed++
          console.warn('[catalogue] détourage échoué pour', item.id, e)
        }
        done++
        setProgress({ done, total: todo.length, failed })
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
    await persist() // dernier lot + réutilisations : rien ne doit rester non sauvegardé
    setProgress(null)

    const ok = done - failed
    if (abort.current) toast.info(`Détourage interrompu — ${ok} visuel(s) traité(s)`)
    else if (failed === 0) toast.success(`${ok} visuel(s) détouré(s)`)
    else toast.warning(`${ok} visuel(s) détouré(s), ${failed} échec(s)`, { description: 'Les visuels en échec gardent leur image d’origine.' })
  }

  /** Rend les visuels d'ORIGINE et OUBLIE les détourages mémorisés — sans cela,
   *  un nouveau lot se contenterait de reposer les mêmes fichiers (réutilisation
   *  du cache) au lieu de produire un détourage neuf. */
  const resetAll = () => {
    const s = useCatalogStore.getState()
    const column = s.fieldMap.image
    if (!column) return
    s.clearCutouts()
    let n = 0
    for (const rowId of Object.keys(s.rowOverrides)) {
      if (s.rowOverrides[rowId]?.[column] == null) continue
      s.setRowOverride(rowId, { [column]: null })
      n++
    }
    toast.success(n > 0 ? `${n} visuel(s) rendus à leur version d’origine` : 'Aucun visuel détouré à restaurer', { description: 'Un nouveau « Détourer toutes les images » repartira d’un traitement neuf.' })
  }

  return { progress, cutoutAll, cancel, resetAll }
}

/**
 * Applique les détourages DÉJÀ produits aux produits qui viennent d'entrer dans
 * le catalogue (changement de sélection, ajout de lignes). Purement local :
 * aucun appel au service, aucun coût — on ne fait que reposer une URL connue.
 * Le détourage des visuels INCONNUS reste un geste explicite (bouton).
 */
export function useApplyKnownCutouts(): void {
  const rawRows = useCatalogStore((s) => s.rawRows)
  const selectedRowIds = useCatalogStore((s) => s.selectedRowIds)
  const autoCutout = useCatalogStore((s) => s.autoCutout)

  useEffect(() => {
    if (!autoCutout) return
    const s = useCatalogStore.getState()
    const column = s.fieldMap.image
    if (!column) return
    const selected = new Set(selectedRowIds)
    for (const row of rawRows) {
      if (selected.size > 0 && !selected.has(row._id)) continue
      const source = String(row[column] ?? '').trim()
      const override = String(s.rowOverrides[row._id]?.[column] ?? '').trim()
      // Détourage ATTENDU pour la source ACTUELLE de la ligne.
      const expected = source ? s.cutoutBySource[source] : undefined

      // ⚠ DÉTOURAGE PÉRIMÉ : la surcharge masque la source. Si le visuel d'origine
      // a été remplacé (visuel régénéré dans le module Données), l'ancien détourage
      // continuerait d'être affiché indéfiniment. On le retire — remplacé par le
      // détourage de la NOUVELLE source s'il existe déjà, sinon par la source nue.
      if (override && isCutoutUrl(override) && override !== expected) {
        s.setRowOverride(row._id, { [column]: expected ?? null })
        continue
      }
      // Produit qui vient d'entrer : on repose son détourage connu, gratuitement.
      if (!override && expected) s.setRowOverride(row._id, { [column]: expected })
    }
  }, [rawRows, selectedRowIds, autoCutout])
}
